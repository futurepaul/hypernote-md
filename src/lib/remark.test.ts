import { expect, test, describe } from "bun:test";
import { processMarkdown, renderMarkdownToReact } from "./remark";
import { RelayHandler } from "@/stores/nostrStore";
import { Button } from "@/components/ui/button";
import type { Paragraph } from "mdast";
import { QueryComponent } from "@/components/markdown/QueryComponent";

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
    const input = `:::query{fetchsomethingwithnostr(TODO)}
normal text {result.content} normal text
:::`;
    const result = await processMarkdown(input);
    
    const queryNode = result.children[0] as any;
    expect(queryNode).toHaveProperty("type", "containerDirective");
    expect(queryNode).toHaveProperty("name", "query");
    expect(queryNode.attributes).toHaveProperty("fn", "fetchsomethingwithnostr");
    expect(queryNode.attributes).toHaveProperty("args", "TODO");
    
    // Check that the content is preserved
    const paragraph = queryNode.children[0] as any;
    expect(paragraph).toHaveProperty("type", "paragraph");
    expect(paragraph.children[0]).toHaveProperty("value", "normal text ");
    expect(paragraph.children[1]).toHaveProperty("value", "{result.content}");
    expect(paragraph.children[2]).toHaveProperty("value", " normal text");
  });

  test("renders query directive", async () => {
    const input = `:::query{fetchsomethingwithnostr(TODO)}
normal text {result.content} normal text
:::`;
    const result = await renderMarkdownToReact(input, mockRelayHandler);
    
    expect(result).toHaveLength(1); // One QueryComponent
    const queryComponent = result[0] as any;
    expect(queryComponent.type).toBe(QueryComponent);
    expect(queryComponent.props).toHaveProperty("fn", "fetchsomethingwithnostr");
    expect(queryComponent.props).toHaveProperty("args", "TODO");
    expect(queryComponent.props).toHaveProperty("relayHandler", mockRelayHandler);
    expect(queryComponent.props.children).toContain("normal text {result.content} normal text");
  });
}); 