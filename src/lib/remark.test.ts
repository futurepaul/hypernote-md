import { expect, test, describe } from "bun:test";
import { processMarkdown, renderMarkdownToReact } from "./remark";
import { RelayHandler } from "@/stores/nostrStore";
import { Button } from "@/components/ui/button";
import type { Paragraph } from "mdast";
import { QueryComponent } from "@/components/markdown/QueryComponent";
import { useNostrStore } from "@/stores/nostrStore";

// Mock RelayHandler for testing
const mockRelayHandler = {
  callHypernoteFunction: async (fn: string, args: any) => {
    console.log("Mock called with:", fn, args);
  },
} as unknown as RelayHandler;

describe("remark markdown processor", () => {
  test("processes basic markdown", async () => {
    const input = "# Hello World";
    const result = await processMarkdown(input);
    expect(result).toHaveProperty("type", "root");
    expect(result.children[0]).toHaveProperty("type", "heading");
  });

  test("processes button directive", async () => {
    const input = ':button[Click me]{fn="plusone" args=\'{"a": 42}\'}';
    const result = await processMarkdown(input);
    
    // Button should be inside a paragraph
    const paragraph = result.children[0] as Paragraph;
    expect(paragraph).toHaveProperty("type", "paragraph");
    
    // Find the button node in the paragraph
    const buttonNode = (paragraph.children[0] as any);
    expect(buttonNode).toHaveProperty("type", "textDirective");
    expect(buttonNode).toHaveProperty("name", "button");
    expect(buttonNode.children[0]).toHaveProperty("value", "Click me");
    expect(buttonNode).toHaveProperty("attributes");
    expect(buttonNode.attributes).toHaveProperty("fn", "plusone");
    expect(buttonNode.attributes).toHaveProperty("args", '{"a": 42}');
  });

  test("processes button with variant and size", async () => {
    const input = ':button[Secondary Button]{variant="secondary" size="lg"}';
    const result = await processMarkdown(input);
    
    const paragraph = result.children[0] as Paragraph;
    expect(paragraph).toHaveProperty("type", "paragraph");
    
    const buttonNode = (paragraph.children[0] as any);
    expect(buttonNode).toHaveProperty("type", "textDirective");
    expect(buttonNode).toHaveProperty("name", "button");
    expect(buttonNode).toHaveProperty("attributes");
    expect(buttonNode.attributes).toHaveProperty("variant", "secondary");
    expect(buttonNode.attributes).toHaveProperty("size", "lg");
  });
});

describe("remark React renderer", () => {
  test("renders basic markdown elements", async () => {
    const input = `# Heading
    
This is a paragraph with a [link](https://example.com).`;
    
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    expect(result).toHaveLength(2); // Heading and paragraph
    expect(result[0]).toHaveProperty("type", "h1");
    expect(result[1]).toHaveProperty("type", "p");
  });

  test("renders button directive", async () => {
    const input = ':button[Click me]{fn="plusone" args=\'{"a": 42}\'}';
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    expect(result).toHaveLength(1); // One paragraph
    const paragraph = result[0] as any;
    expect(paragraph).toHaveProperty("type", "p");
    
    const button = paragraph.props.children[0];
    expect(button.type).toBe(Button);
    expect(button.props).toHaveProperty("variant", "default");
    expect(button.props).toHaveProperty("onClick");
  });

  test("renders button with custom variant and size", async () => {
    const input = ':button[Secondary Button]{variant="secondary" size="lg"}';
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    const paragraph = result[0] as any;
    const button = paragraph.props.children[0];
    expect(button.props).toHaveProperty("variant", "secondary");
    expect(button.props).toHaveProperty("size", "lg");
  });

  test("renders mixed content", async () => {
    const input = `# Hello World

This is a paragraph with a :button[Click me]{fn="test"} in it.

Another paragraph with a [link](https://example.com).`;
    
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    expect(result).toHaveLength(3); // Heading and two paragraphs
    expect(result[0]).toHaveProperty("type", "h1");
    expect(result[1]).toHaveProperty("type", "p");
    expect(result[2]).toHaveProperty("type", "p");
  });

  test("handles invalid JSON in button args", async () => {
    const input = ':button[Click me]{fn="plusone" args={"a": 42}'; // Missing closing brace
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    expect(result).toHaveLength(1); // Should still render the paragraph
    const paragraph = result[0] as any;
    const button = paragraph.props.children[0];
    expect(button.type).toBe(Button);
    expect(button.props).toHaveProperty("variant", "default");
    expect(button.props).toHaveProperty("onClick");
  });

  test("processes query directive", async () => {
    const input = `:::query{#q kind="30078" d="test"}
{q.content}
:::`;
    const result = await processMarkdown(input);
    
    const queryNode = result.children[0] as any;
    expect(queryNode).toHaveProperty("type", "containerDirective");
    expect(queryNode).toHaveProperty("name", "query");
    expect(queryNode.attributes).toHaveProperty("id", "q");
    expect(queryNode.attributes).toHaveProperty("kind", "30078");
    expect(queryNode.attributes).toHaveProperty("d", "test");
    
    // Check that the content is preserved
    const paragraph = queryNode.children[0] as any;
    expect(paragraph).toHaveProperty("type", "paragraph");
    expect(paragraph.children[0]).toHaveProperty("value", "{q.content}");
  });

  test("renders query directive", async () => {
    const input = `:::query{#q kind="30078" d="test"}
{q.content}
:::`;
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    expect(result).toHaveLength(1); // One QueryComponent
    const queryComponent = result[0] as any;
    expect(queryComponent.type).toBe(QueryComponent);
    expect(queryComponent.props).toHaveProperty("id", "q");
    expect(queryComponent.props).toHaveProperty("kind", "30078");
    expect(queryComponent.props).toHaveProperty("d", "test");
    expect(queryComponent.props).toHaveProperty("relayHandler", mockRelayHandler);
    
    // Check that the children contain the correct structure
    const children = queryComponent.props.children;
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe("p");
    expect(children[0].props.children).toEqual(["{q.content}"]);
  });

  test("processes query directive with ID and kind", async () => {
    const input = `:::query{#q kind="30078" d="test"}
## {q.content}
:::`;
    const result = await processMarkdown(input);
    
    const queryNode = result.children[0] as any;
    expect(queryNode).toHaveProperty("type", "containerDirective");
    expect(queryNode).toHaveProperty("name", "query");
    expect(queryNode.attributes).toHaveProperty("id", "q");
    expect(queryNode.attributes).toHaveProperty("kind", "30078");
    expect(queryNode.attributes).toHaveProperty("d", "test");
    
    // Check that the content is preserved
    const heading = queryNode.children[0] as any;
    expect(heading).toHaveProperty("type", "heading");
    expect(heading.children[0]).toHaveProperty("value", "{q.content}");
  });

  test("renders query directive with ID and kind", async () => {
    const input = `:::query{#q kind="30078" d="test"}
## {q.content}
:::`;
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    expect(result).toHaveLength(1); // One QueryComponent
    const queryComponent = result[0] as any;
    expect(queryComponent.type).toBe(QueryComponent);
    expect(queryComponent.props).toHaveProperty("id", "q");
    expect(queryComponent.props).toHaveProperty("kind", "30078");
    expect(queryComponent.props).toHaveProperty("d", "test");
    expect(queryComponent.props).toHaveProperty("relayHandler", mockRelayHandler);
    
    // Check that the children contain the correct structure
    const children = queryComponent.props.children;
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe("h2");
    expect(children[0].props.children).toEqual(["{q.content}"]);
  });

  test("processes query directive without ID", async () => {
    const input = `:::query{kind="30078" d="test"}
{q.content}
:::`;
    const result = await processMarkdown(input);
    
    const queryNode = result.children[0] as any;
    expect(queryNode).toHaveProperty("type", "containerDirective");
    expect(queryNode).toHaveProperty("name", "query");
    expect(queryNode.attributes).toHaveProperty("id", ""); // Should have empty string as ID
    expect(queryNode.attributes).toHaveProperty("kind", "30078");
    expect(queryNode.attributes).toHaveProperty("d", "test");
    
    // Check that the content is preserved
    const paragraph = queryNode.children[0] as any;
    expect(paragraph).toHaveProperty("type", "paragraph");
    expect(paragraph.children[0]).toHaveProperty("value", "{q.content}");
  });

  test("processes multiple query directives with different IDs", async () => {
    // Test that multiple query directives are processed correctly as siblings
    // Each directive should have its own ID and content
    const input = `:::query{#q1 kind="30078" d="test1"}
{q1.content}
:::

:::query{#q2 kind="30078" d="test2"}
{q2.content}
:::`;
    const result = await processMarkdown(input);
    
    // Both directives should be siblings at the root level
    expect(result.children).toHaveLength(2);
    
    // Verify first query directive
    const query1 = result.children[0] as any;
    expect(query1.type).toBe("containerDirective");
    expect(query1.name).toBe("query");
    expect(query1.attributes).toHaveProperty("id", "q1");
    expect(query1.attributes).toHaveProperty("d", "test1");
    
    // Verify second query directive
    const query2 = result.children[1] as any;
    expect(query2.type).toBe("containerDirective");
    expect(query2.name).toBe("query");
    expect(query2.attributes).toHaveProperty("id", "q2");
    expect(query2.attributes).toHaveProperty("d", "test2");
  });

  test("processes query directive with button using query content", async () => {
    const input = `:::query{#q kind="30078" d="test"}
{q.content}

:button[Click me]{fn="plusone" args='{"a": {q.content}}' target="#q"}
:::`;
    const result = await processMarkdown(input);
    
    const queryNode = result.children[0] as any;
    expect(queryNode).toHaveProperty("type", "containerDirective");
    expect(queryNode).toHaveProperty("name", "query");
    expect(queryNode.attributes).toHaveProperty("id", "q");
    
    // Find the button node in the query's children
    const buttonNode = queryNode.children[1] as any;
    expect(buttonNode).toHaveProperty("type", "textDirective");
    expect(buttonNode).toHaveProperty("name", "button");
    expect(buttonNode.attributes).toHaveProperty("fn", "plusone");
    expect(buttonNode.attributes).toHaveProperty("args", '{"a": {q.content}}');
    expect(buttonNode.attributes).toHaveProperty("target", "#q");
  });

  test("renders query directive with button using query content", async () => {
    const input = `:::query{#q kind="30078" d="test"}
{q.content}

:button[Click me]{fn="plusone" args='{"a": {q.content}}' target="#q"}
:::`;
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    expect(result).toHaveLength(1); // One QueryComponent
    const queryComponent = result[0] as any;
    expect(queryComponent.type).toBe(QueryComponent);
    expect(queryComponent.props).toHaveProperty("id", "q");
    
    // Check that the button is rendered with the correct props
    const children = queryComponent.props.children;
    expect(children).toHaveLength(2); // Paragraph with content and button
    const button = children[1].props.children[0];
    expect(button.type).toBe(Button);
    expect(button.props).toHaveProperty("slotId"); // Button should have a slot ID
    expect(button.props).toHaveProperty("args", '{"a": {q.content}}');
    expect(button.props).toHaveProperty("target", "#q");
  });

  test("hydrates button args with query content", async () => {
    const { setQueryResponse, registerSlot, getSlotValue } = useNostrStore.getState();
    
    // Set up a query response
    setQueryResponse("q", { content: "42" });
    
    // Register a slot for the button
    const slotId = "button-1";
    registerSlot(slotId, "q", "content");
    
    // Verify the slot value
    expect(getSlotValue(slotId)).toBe("42");
  });

  test("renders query directive with data attributes", async () => {
    const input = `:::query{#q kind="30078" d="test"}
{q.content}
:::`;
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    expect(result).toHaveLength(1); // One QueryComponent
    const queryComponent = result[0] as any;
    expect(queryComponent.type).toBe(QueryComponent);
    expect(queryComponent.props).toHaveProperty("id", "q");
    expect(queryComponent.props).toHaveProperty("data-target", "#q");
    expect(queryComponent.props).toHaveProperty("data-d", "test");
    
    // Check that the children contain the correct structure
    const children = queryComponent.props.children;
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe("p");
    expect(children[0].props.children).toEqual(["{q.content}"]);
  });
}); 