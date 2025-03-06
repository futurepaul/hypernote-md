import { create } from "zustand";
import {
  finalizeEvent,
  getPublicKey,
} from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { toast } from "sonner";

export type IRelayHandler = {
  callHypernoteFunction: (fn: string, args: any, target?: string) => Promise<void>;
  publish: (kind: number, tags: string[][], content: string) => Promise<void>;
  subscribeToQuery: (id: string, kind: number, d: string, onEvent: (event: any) => void) => any;
  cleanup: () => void;
};

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

  async publishEvent(event: any, target?: string): Promise<void> {
    try {
      const signedEvent = finalizeEvent(event, this.privateKey);
      this.addLog(`Event finalized(kind: ${event.kind}), id: ${signedEvent.id}`);
      
      // Set up subscription BEFORE publishing
      this.addLog(`Setting up subscription for event ID: ${signedEvent.id}`);
      this.subscribeToEvent(signedEvent.id, (event) => {
        try {
          this.addLog(`Event received(kind: ${event.kind}), id: ${event.id}`);
          this.addLog(`Event content: ${event.content}`);
        } catch (e) {
          this.addLog(`Failed to parse event content: ${e}`);
        }
      }, target);

      // Log connection status
      this.relayUrls.forEach(url => {
        const status = this.pool.listConnectionStatus().get(new URL(url).href);
        this.addLog(`Relay ${url} connection status: ${status ? 'connected' : 'disconnected'}`);
      });

      // Now publish the event
      this.addLog(`Attempting to publish event to ${this.relayUrls.length} relays...`);
      await Promise.any(this.pool.publish(this.relayUrls, signedEvent));
      this.addLog(`Event published successfully(kind: ${event.kind}), id: ${signedEvent.id}`);
    } catch (error) {
      this.addLog(`Failed to publish event: ${error}`);
      throw error;
    }
  }

  async callHypernoteFunction(functionName: string, parameters: Record<string, any>, target?: string) {
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

  subscribeToEvent(eventId: string, onEvent: (event: any) => void, target?: string) {
    this.addLog(`Setting up subscription for event ID: ${eventId}`);
    const sub = this.pool.subscribeMany(
      this.relayUrls,
      [
        {
          kinds: [5910, 6910, 7000],
          since: Math.floor(Date.now() / 1000),
          "#e": [eventId]
        },
      ],
      {
        onevent: async (event) => {
          this.addLog(`Event received(kind: ${event.kind}), id: ${event.id}`);
          this.addLog(`Event content: ${event.content}`);
          this.addLog(`Event tags: ${JSON.stringify(event.tags)}`);
          console.log(event);

          // Add toast notifications based on event kind
          switch (event.kind) {
            case 5910:
              console.log('Tool execution event:', event);
              toast.info('Tool execution event received');
              break;
            case 7000:
              console.log('Status event:', event);
              toast.info('Status event received');
              break;
            case 6910:
              console.log('Result event:', event);
              toast.success('Result event received');
              
              // Handle result event
              try {
                this.addLog(`Processing result event: ${event.content}`);
                const content = JSON.parse(event.content);
                if (Array.isArray(content.content) && content.content.length > 0 && content.content[0].text) {
                  const resultValue = content.content[0].text;
                  this.addLog(`Result value: ${resultValue}`);
                  
                  // Look up the query element's d tag using the target
                  console.warn("QUERYING FOR TARGET", target);
                  const queryElement = document.querySelector(`[data-target="${target}"]`);
                  console.log(queryElement);
                  if (queryElement) {
                    const dTag = queryElement.getAttribute('data-d');
                    this.addLog(`D tag: ${dTag}`);
                    if (dTag) {
                      await this.publish(30078, [["d", dTag]], resultValue);
                      this.addLog(`Published result ${resultValue} with d tag "${dTag}"`);
                    } else {
                      this.addLog(`No d tag found for target ${target}`);
                    }
                  } else {
                    this.addLog(`No query element found for target ${target}`);
                  }
                }
              } catch (error) {
                this.addLog(`Error processing result event: ${error}`);
              }
              break;
            default:
              console.log('Unknown event kind:', event);
              toast.info(`Event kind ${event.kind} received`);
          }

          onEvent(event);
        },
        oneose: () => {
          this.addLog("Reached end of stored events");
        },
        onclose: (reason) => {
          this.addLog(`Subscription closed: ${reason}`);
        },
      }
    );
    this.subscriptions.push(sub);
    this.addLog(`Subscription added to pool. Active subscriptions: ${this.subscriptions.length}`);
    return sub;
  }

  subscribeToQuery(id: string, kind: number, d: string, onEvent: (event: any) => void) {
    this.addLog(`Setting up query subscription for ID: ${id}, kind: ${kind}, d: ${d}`);
    
    // Close existing subscription if any
    if (this.querySubscriptions.has(id)) {
      this.querySubscriptions.get(id)?.close();
      this.querySubscriptions.delete(id);
    }

    const sub = this.pool.subscribeMany(
      this.relayUrls,
      [
        {
          kinds: [kind],
          "#d": [d],
        },
      ],
      {
        onevent: (event) => {
          this.addLog(`Query event received(kind: ${event.kind}), id: ${event.id}`);
          this.addLog(`Event content: ${event.content}`);
          onEvent(event);
        },
        oneose: () => {
          this.addLog(`Query subscription ${id} reached end of stored events`);
        },
        onclose: (reason) => {
          this.addLog(`Query subscription ${id} closed: ${reason}`);
        },
      }
    );

    this.querySubscriptions.set(id, sub);
    this.addLog(`Query subscription added. Active query subscriptions: ${this.querySubscriptions.size}`);
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
    return this.pool.listConnectionStatus().get(new URL(url).href) || false;
  }
}

interface NostrStore {
  relayHandler: RelayHandler | null;
  privateKey: string | null;
  publicKey: string | null;
  logs: string[];
  addLog: (message: string) => void;
  initialize: () => void;
  cleanup: () => void;
  queryResponses: Record<string, any>;
  setQueryResponse: (id: string, response: any) => void;
  slots: Record<string, { queryId: string; field: string; value: any }>;
  registerSlot: (slotId: string, queryId: string, field: string) => void;
  getSlotValue: (slotId: string) => any;
}

const RELAY_URLS = [
  'wss://relay.nostr.net',
  // 'wss://relay.damus.io',
  // 'wss://relay.snort.social',
  // 'wss://relay.nostr.band'
]

export const useNostrStore = create<NostrStore>((set, get) => ({
  relayHandler: null,
  privateKey: null,
  publicKey: null,
  logs: [],
  queryResponses: {},
  slots: {},
  setQueryResponse: (id: string, response: any) => {
    set((state) => {
      // Update query response
      const newQueryResponses = {
        ...state.queryResponses,
        [id]: response,
      };

      // Update all slots that depend on this query
      const newSlots = { ...state.slots };
      Object.entries(newSlots).forEach(([slotId, slot]) => {
        if (slot.queryId === id) {
          newSlots[slotId] = {
            ...slot,
            value: response[slot.field],
          };
        }
      });

      return {
        queryResponses: newQueryResponses,
        slots: newSlots,
      };
    });
  },
  registerSlot: (slotId: string, queryId: string, field: string) => {
    set((state) => {
      const queryResponse = state.queryResponses[queryId];
      return {
        slots: {
          ...state.slots,
          [slotId]: {
            queryId,
            field,
            value: queryResponse?.[field],
          },
        },
      };
    });
  },
  getSlotValue: (slotId: string) => {
    return get().slots[slotId]?.value;
  },
  addLog: (message: string) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    set((state) => ({
      logs: [...state.logs, `[${timestamp}] ${message}`],
    }));
  },
  initialize: () => {
    const store = useNostrStore.getState();
    store.addLog("Initializing Nostr store...");
    
    let privkey = localStorage.getItem("privkey");

    if (!privkey) {
      const newPrivkey = prompt("Please enter your private key");
      if (newPrivkey) {
        localStorage.setItem("privkey", newPrivkey);
        privkey = newPrivkey;
      }
    }

    if (privkey) {
      const privkeyBytes = new Uint8Array(
        privkey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );
      const pubkey = getPublicKey(privkeyBytes);
      const handler = new RelayHandler(RELAY_URLS, privkeyBytes, store.addLog);
      
      // Log initial connection status
      RELAY_URLS.forEach(url => {
        const status = handler.getConnectionStatus(url);
        store.addLog(`Initial relay ${url} connection status: ${status ? 'connected' : 'disconnected'}`);
      });
      
      set({ relayHandler: handler, privateKey: privkey, publicKey: pubkey });
    }
  },
  cleanup: () => {
    set((state) => {
      state.addLog("Cleaning up Nostr store...");
      state.relayHandler?.cleanup();
      return { relayHandler: null };
    });
  },
}));
