import { create } from "zustand";
import {
  finalizeEvent,
  getPublicKey,
} from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";

export class RelayHandler {
  private pool: SimplePool;
  private relayUrls: string[];
  private subscriptions: any[] = [];
  private reconnectInterval?: ReturnType<typeof setTimeout>;
  private backgroundSub?: any;
  public privateKey: Uint8Array;
  private addLog: (message: string) => void;

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

  async publishEvent(event: any): Promise<void> {
    try {
      const signedEvent = finalizeEvent(event, this.privateKey);
      this.addLog(`Event finalized(kind: ${event.kind}), id: ${event.id}`);
      
      // Set up subscription BEFORE publishing
      this.addLog(`Setting up subscription for event ID: ${signedEvent.id}`);
      this.subscribeToEvent(signedEvent.id, (event) => {
        try {
          this.addLog(`Event received(kind: ${event.kind}), id: ${event.id}`);
          this.addLog(`Event content: ${event.content}`);
        } catch (e) {
          this.addLog(`Failed to parse event content: ${e}`);
        }
      });

      // Log connection status
      this.relayUrls.forEach(url => {
        const status = this.pool.listConnectionStatus().get(new URL(url).href);
        this.addLog(`Relay ${url} connection status: ${status ? 'connected' : 'disconnected'}`);
      });

      // Now publish the event
      await Promise.any(this.pool.publish(this.relayUrls, signedEvent));
      this.addLog(`Event published(kind: ${event.kind}), id: ${event.id}`);
    } catch (error) {
      this.addLog(`Failed to publish event: ${error}`);
      throw error;
    }
  }

  async callHypernoteFunction(functionName: string, parameters: Record<string, any>) {
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
    await this.publishEvent(toolRequest);
  }

  async publish(kind: number, tags: string[][], content: string) {
    const event = {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };
    await this.publishEvent(event);
  }

  subscribeToEvent(eventId: string, onEvent: (event: any) => void) {
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
        onevent: (event) => {
          this.addLog(`Event received(kind: ${event.kind}), id: ${event.id}`);
          this.addLog(`Event content: ${event.content}`);
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

  cleanup() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
    if (this.backgroundSub) {
      this.backgroundSub.close();
    }
    this.subscriptions.forEach((sub) => sub.close());
    this.subscriptions = [];
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
}

const RELAY_URLS = [
  'wss://relay.nostr.net',
  // 'wss://relay.damus.io',
  // 'wss://relay.snort.social',
  // 'wss://relay.nostr.band'
]

export const useNostrStore = create<NostrStore>((set) => ({
  relayHandler: null,
  privateKey: null,
  publicKey: null,
  logs: [],
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
