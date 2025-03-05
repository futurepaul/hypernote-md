import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkDirective from "remark-directive";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import { createElement } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { toast } from "sonner";
import type { RelayHandler } from "@/stores/nostrStore";

type ButtonVariant = VariantProps<typeof Button>["variant"];
type ButtonSize = VariantProps<typeof Button>["size"];

interface ButtonDirectiveNode {
  type: "textDirective" | "leafDirective" | "containerDirective";
  name: string;
  attributes: Record<string, string>;
  children: Array<{ value: string }>;
}

// Custom plugin to handle button directives
function remarkButtons() {
  return (tree: Root) => {
    visit(tree, (node: any) => {
      if (
        node.type === "textDirective" ||
        node.type === "leafDirective" ||
        node.type === "containerDirective"
      ) {
        if (node.name !== "button") return;

        const buttonNode = node as ButtonDirectiveNode;
        console.log("Found button node:", buttonNode);

        // The attributes are already parsed by remark-directive
        // We just need to ensure they exist
        if (!buttonNode.attributes) {
          buttonNode.attributes = {};
        }

        console.log("Button attributes:", buttonNode.attributes);
      }
    });
  };
}

function processNode(node: any, relayHandler: RelayHandler, index: number): ReactNode {
  switch (node.type) {
    case "text":
      return node.value;

    case "paragraph":
      return createElement(
        "p",
        { key: index },
        node.children.map((child: any, i: number) => processNode(child, relayHandler, i))
      );

    case "heading":
      return createElement(
        `h${node.depth}`,
        { key: index },
        node.children.map((child: any, i: number) => processNode(child, relayHandler, i))
      );

    case "link":
      return createElement(
        "a",
        { key: index, href: node.url },
        node.children.map((child: any, i: number) => processNode(child, relayHandler, i))
      );

    case "textDirective":
    case "leafDirective":
    case "containerDirective":
      if (node.name === "button") {
        const variant = (node.attributes?.variant || "default") as ButtonVariant;
        const size = (node.attributes?.size || "default") as ButtonSize;
        const fn = node.attributes?.fn;
        let args = {};
        
        if (node.attributes?.args) {
          try {
            args = JSON.parse(node.attributes.args);
          } catch (error) {
            console.error("Failed to parse button args:", error);
            // Return the button with default args rather than failing
          }
        }

        return createElement(
          Button,
          {
            key: index,
            variant,
            size,
            onClick: async () => {
              if (!fn) {
                toast.error("No function provided");
                return;
              }

              try {
                toast.success(`Calling ${fn} with args: ${JSON.stringify(args)}`);
                await relayHandler.callHypernoteFunction(fn, args);
              } catch (error) {
                console.error("Error publishing event:", error);
                toast.error(`Error calling ${fn}: ${error}`);
              }
            },
          },
          node.children[0].value
        );
      }
      return null;

    default:
      console.warn(`Unhandled node type: ${node.type}`);
      return null;
  }
}

export async function renderMarkdownToReact(content: string, relayHandler: RelayHandler): Promise<ReactNode[]> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkButtons);

  const tree = await processor.parse(content);
  return (tree as any).children.map((node: any, index: number) => 
    processNode(node, relayHandler, index)
  );
}

export async function processMarkdown(content: string): Promise<Root> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkButtons);

  const result = await processor.parse(content);
  return result as Root;
} 