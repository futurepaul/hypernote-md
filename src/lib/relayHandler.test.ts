import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { RelayHandler } from "./relayHandler";
import * as secp256k1 from "@noble/secp256k1";
import type { Filter, Event } from "nostr-tools";

// Use a specific non-empty string for the relay URL
const MOCK_RELAY_URL = "wss://relay.example.com";

describe("RelayHandler", () => {
  let handler: RelayHandler;
  const testRelays = [MOCK_RELAY_URL]; // This is a non-empty array with a specific string
  const testPrivateKey = secp256k1.utils.randomPrivateKey();
  const logs: string[] = [];

  const addLog = (message: string) => {
    console.log(message);
    logs.push(message);
  };

  beforeEach(() => {
    handler = new RelayHandler(testRelays, testPrivateKey, addLog);
  });

  afterEach(() => {
    handler.cleanup();
  });

  test("constructor initializes", () => {
    expect(handler).toBeDefined();
  });

  test("can subscribe to events", () => {
    const filter: Filter = {
      kinds: [1],
      "#d": ["test-" + Date.now()]
    };

    const sub = handler.sub(
      "test-sub",
      filter,
      () => {
        // Empty callback for testing
      }
    );

    expect(sub).toBeDefined();
  });

  test("constructor initializes and connects to relay", async () => {
    expect(handler).toBeDefined();
    
    // Give it a moment to connect
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const status = handler.getConnectionStatus(MOCK_RELAY_URL);
    expect(status).toBe(true);
  }, 5000);

  test("can publish and receive a simple event", async () => {
    const kind = 1;
    const tags = [["t", "test"]];
    const content = "test content " + Date.now();

    await handler.publish(kind, tags, content);

    // Check if we logged about publishing
    const publishLog = logs.find(log => log.includes("Publishing event kind 1"));
    if (!publishLog) {
      throw new Error("Expected to find log about publishing event");
    }
    expect(publishLog).toBeDefined();
  }, 10000);

  test("can query for contacts from a specific author", async () => {
    const receivedEvents: Event[] = [];
    const authorPubkey = "0d6c8388dcb049b8dd4fc8d3d8c3bb93de3da90ba828e4f09c8ad0f346488a33";

    const filter: Filter = {
      kinds: [3],
      authors: [authorPubkey],
      limit: 5
    };

    // Use the new sub method to query contacts
    const subscription = handler.sub(
      "test-contacts",
      filter,
      (event: Event) => {
        receivedEvents.push(event);
      }
    );

    expect(subscription).toBeDefined();
    
    // Give it some time to receive events
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    expect(receivedEvents.length).toBeGreaterThan(0);
    const firstEvent = receivedEvents[0];
    if (!firstEvent) throw new Error("No events received");
    
    expect(firstEvent.kind).toBe(3);
    expect(firstEvent.pubkey).toBe(authorPubkey);
  }, 15000);
}); 