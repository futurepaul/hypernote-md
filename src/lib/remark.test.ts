import { expect, test, describe, mock, beforeEach } from "bun:test";
import { processMarkdown, processQueryArgs, processQueryReferences } from "./remark";
import { RelayHandler } from "@/lib/relayHandler";
import type { Paragraph } from "mdast";

// Mock RelayHandler for testing
const mockRelayHandler = {
  publish: mock(() => Promise.resolve()),
  fetchEvents: mock((id: string, kind: number, tags: string[][], limit: number) => {
    return Promise.resolve();
  }),
  callHypernoteFunction: mock(() => Promise.resolve()),
} as unknown as RelayHandler;

// Mock store data with test values
const mockStore = {
  queryResponses: {
    q: {
      id: 'test-id',
      content: '42',
      kind: 30078,
      pubkey: 'test-pubkey',
      tags: [],
      created_at: 123456789,
      sig: 'test-sig'
    }
  },
  registerSlot: mock((...args) => {}),
  getSlotValue: mock((...args) => {})
};

// Mock the store
mock.module("../stores/nostrStore", () => ({
  useNostrStore: {
    getState: () => ({
      ...mockStore,
      relayHandler: mockRelayHandler,
      privateKey: '',
      publicKey: '',
      logs: [],
      pending: {},
      slots: {},
      hyper: {},
      setQueryResponse: () => {},
      addLog: () => {},
      initialize: () => {},
      cleanup: () => {}
    }),
  },
}));

// Core Markdown parser tests
describe("Markdown parser", () => {
  test("processes basic markdown", async () => {
    const input = "# Hello World";
    const result = await processMarkdown(input);
    expect(result).toHaveProperty("type", "root");
    expect(result.children[0]).toHaveProperty("type", "heading");
  });

  test("processes button directive", async () => {
    const input = ':button[Click me]{fn="plusone" args=\'{"a": 42}\'}';
    const result = await processMarkdown(input);
    
    const paragraph = result.children[0] as Paragraph;
    expect(paragraph).toHaveProperty("type", "paragraph");
    
    const buttonNode = (paragraph.children[0] as any);
    expect(buttonNode).toHaveProperty("type", "textDirective");
    expect(buttonNode).toHaveProperty("name", "button");
    expect(buttonNode.children[0]).toHaveProperty("value", "Click me");
    expect(buttonNode.attributes).toHaveProperty("fn", "plusone");
    expect(buttonNode.attributes).toHaveProperty("args", '{"a": 42}');
  });

  test("processes query directive with ID and kind", async () => {
    const input = `:::query{id="q" kind="30078" d="test"}
## {q.content}
:::`;
    const result = await processMarkdown(input);
    
    const queryNode = result.children[0] as any;
    expect(queryNode).toHaveProperty("type", "containerDirective");
    expect(queryNode).toHaveProperty("name", "query");
    expect(queryNode.attributes).toHaveProperty("id", "q");
    expect(queryNode.attributes).toHaveProperty("kind", "30078");
    expect(queryNode.attributes).toHaveProperty("d", "test");
  });

  test("processes multiple query directives with different IDs", async () => {
    const input = `:::query{id="q1" kind="30078" d="test1"}
{q1.content}
:::

:::query{id="q2" kind="30078" d="test2"}
{q2.content}
:::`;

    const result = await processMarkdown(input);
    expect(result.children).toHaveLength(2);
    
    // Safely access attributes by checking the type first
    const node1 = result.children[0] as any;
    const node2 = result.children[1] as any;
    
    expect(node1.attributes).toHaveProperty("id", "q1");
    expect(node2.attributes).toHaveProperty("id", "q2");
  });
});

// Query processing utility tests
describe('Query processing utilities', () => {
  beforeEach(() => {
    // Reset mock store between tests
    mockStore.queryResponses.q.content = '42';
    mockStore.queryResponses.q.kind = 30078;
  });
  
  test('processQueryArgs should handle simple field references', () => {
    // Test basic query replacement
    const result = processQueryArgs('{"a": {q.content}}', 'q');
    
    // Verify the result matches expected output - content is a number
    expect(result).toEqual({ a: 42 });
  });

  test('processQueryArgs should handle nested objects with query refs', () => {
    // Test with a more complex nested structure
    const result = processQueryArgs('{"obj": {"nested": {q.content}, "fixed": 5, "kind": {q.kind}}}', 'q');
    
    // Verify the result matches expected output - numbers remain as numbers
    expect(result).toEqual({ 
      obj: {
        nested: 42,
        fixed: 5,
        kind: 30078
      }
    });
  });
  
  test('processQueryReferences should replace query references in text', () => {
    // Test text with query references
    const result = processQueryReferences('Value: {q.content}, Kind: {q.kind}');
    
    // Verify the result matches expected output
    expect(result).toBe('Value: 42, Kind: 30078');
  });
}); 