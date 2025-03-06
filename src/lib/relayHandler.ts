import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { toast } from "sonner";
import type { Filter, Event } from "nostr-tools";

export interface IRelayHandler {
  callHypernoteFunction: (fn: string, args: any, target?: string) => Promise<void>;
  publish: (kind: number, tags: string[][], content: string) => Promise<void>;
  sub: (id: string, filter: Filter, onEvent: (event: Event) => void) => any;
  cleanup: () => void;
  getConnectionStatus: (url: string) => boolean;
}

export class RelayHandler implements IRelayHandler {
  private pool: SimplePool;
  private relayUrls: string[];
  private subscriptions: any[] = [];
  private reconnectInterval?: ReturnType<typeof setTimeout>;
  private backgroundSub?: any;
  public privateKey: Uint8Array;
  private addLog: (message: string) => void;
  private querySubscriptions: Map<string, any> = new Map();

  constructor(
    relayUrls: string[],
    privateKey: Uint8Array,
    addLog: (message: string) => void
  ) {
    this.pool = new SimplePool();
    this.relayUrls = relayUrls;
    this.privateKey = privateKey;
    this.addLog = addLog;
    this.startReconnectLoop();
    this.startBackgroundMonitoring();
  }

  private startReconnectLoop() {
    this.reconnectInterval = setInterval(() => {
      this.relayUrls.forEach((url) => {
        const normalizedUrl = new URL(url).href;
        if (!this.pool.listConnectionStatus().get(normalizedUrl)) {
          this.ensureRelay(url);
        }
      });
    }, 10000);
  }

  private async ensureRelay(url: string) {
    try {
      await this.pool.ensureRelay(url, { connectionTimeout: 5000 });
      this.addLog(`Connected to relay: ${url}`);
    } catch (error) {
      this.addLog(`Failed to connect to relay ${url}: ${error}`);
    }
  }

  private startBackgroundMonitoring() {
    this.addLog("Starting background monitoring for all events");
    this.backgroundSub = this.pool.subscribeMany(
      this.relayUrls,
      [
        {
          kinds: [5910, 6910, 7000],
          since: Math.floor(Date.now() / 1000),
        },
      ],
      {
        onevent: (event) => {
          this.addLog(`Background event received(kind: ${event.kind}), id: ${event.id}`);
          this.addLog(`Event content: ${event.content}`);
        },
        oneose: () => {
          this.addLog("Background subscription reached end of stored events");
        },
        onclose: (reason) => {
          this.addLog(`Background subscription closed: ${reason}`);
        },
      }
    );
  }

  /**
   * Publish an event and set up a subscription for responses
   * @param event The event to publish
   * @param target Optional target for the event result
   */
  async publishEvent(event: any, target?: string): Promise<void> {
    try {
      const eventKind = event.kind || 'unknown';
      const signedEvent = finalizeEvent(event, this.privateKey);
      this.addLog(`Publishing event (kind: ${eventKind})`);
      
      // Set up subscription for results before publishing
      const filter: Filter = {
        kinds: [5910, 6910, 7000],
        since: Math.floor(Date.now() / 1000),
        "#e": [signedEvent.id]
      };
      
      // Subscribe using our sub method
      const eventSubId = `event-${signedEvent.id.substring(0, 8)}`;
      const sub = this.sub(
        eventSubId,
        filter,
        (event: Event) => {
          // Handle different event kinds
          switch (event.kind) {
            case 5910:
              toast.info('Tool execution event received');
              break;
            case 7000:
              toast.info('Status event received');
              break;
            case 6910:
              toast.success('Result event received');
              
              // Handle result event
              try {
                const content = JSON.parse(event.content);
                if (Array.isArray(content.content) && content.content.length > 0 && content.content[0].text) {
                  const resultValue = content.content[0].text;
                  
                  // Look up the query element's d tag using the target
                  if (target) {
                    // The target is a CSS selector (e.g., "#q"), so use it directly
                    const queryElement = document.querySelector(target);
                    
                    if (queryElement) {
                      // Get the data-d attribute which contains the d-tag for publishing
                      const dTag = queryElement.getAttribute('data-d');
                      
                      if (dTag) {
                        // Publish an event with the result using the d-tag
                        this.addLog(`Publishing result with d tag: ${dTag}`);
                        this.publish(30078, [["d", dTag]], resultValue);
                      }
                    }
                  }
                }
              } catch (error) {
                this.addLog(`Error processing result: ${error}`);
              }
              break;
            default:
              toast.info(`Event kind ${event.kind} received`);
          }
        }
      );
      
      this.subscriptions.push(sub);

      // Now publish the event
      await Promise.any(this.pool.publish(this.relayUrls, signedEvent));
      this.addLog(`Event published successfully`);
    } catch (error) {
      this.addLog(`Failed to publish event: ${error}`);
      throw error;
    }
  }

  /**
   * Call a Hypernote function through Nostr
   * @param functionName The name of the function to call
   * @param parameters Parameters for the function
   * @param target Optional target for the function result
   */
  async callHypernoteFunction(functionName: string, parameters: Record<string, any>, target?: string) {
    this.addLog(`Calling function ${functionName}`);

    const toolRequest = {
      kind: 5910,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["c", "execute-tool"],
        ["p", getPublicKey(this.privateKey)]
      ],
      content: JSON.stringify({
        name: functionName,
        parameters,
        timestamp: Date.now() / 1000
      }),
    };

    // Finalize the event to get its ID
    const signedEvent = finalizeEvent(toolRequest, this.privateKey);
    await this.publishEvent(signedEvent, target);
  }

  async publish(kind: number, tags: string[][], content: string) {
    this.addLog(`Publishing event kind ${kind}`);
    this.addLog(`Tags: ${JSON.stringify(tags)}`);
    this.addLog(`Content: ${content}`);
    
    const event = {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };
    await this.publishEvent(event);
  }

  /**
   * Subscribe to events matching a filter
   * @param id Unique identifier for this subscription
   * @param filter Nostr filter object 
   * @param onEvent Callback function for events
   * @returns Subscription object
   */
  sub(id: string, filter: Filter, onEvent: (event: Event) => void) {
    this.addLog(`Setting up subscription ${id}`);
    
    // Close existing subscription if any
    if (this.querySubscriptions.has(id)) {
      this.querySubscriptions.get(id)?.close();
      this.querySubscriptions.delete(id);
    }

    const sub = this.pool.subscribeMany(
      this.relayUrls,
      [filter],
      {
        onevent: (event) => {
          // Only log minimal information about received events
          this.addLog(`Event received for ${id}: ${event.kind}:${event.id.substring(0, 8)}...`);
          onEvent(event);
        },
        oneose: () => {
          this.addLog(`Subscription ${id} reached EOSE`);
        },
        onclose: () => {
          this.addLog(`Subscription ${id} closed`);
        },
      }
    );

    this.querySubscriptions.set(id, sub);
    return sub;
  }

  cleanup() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
    if (this.backgroundSub) {
      this.backgroundSub.close();
    }
    this.subscriptions.forEach((sub) => sub.close());
    this.querySubscriptions.forEach((sub) => sub.close());
    this.subscriptions = [];
    this.querySubscriptions.clear();
    this.pool.close(this.relayUrls);
  }

  getConnectionStatus(url: string): boolean {
    if (!url) return false;
    return this.pool.listConnectionStatus().get(new URL(url).href) || false;
  }
} 