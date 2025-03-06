import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkDirective from "remark-directive";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import { createElement } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { QueryComponent } from "@/components/markdown/QueryComponent";
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

// Custom plugin to handle query directives
function remarkQueries() {
  return (tree: Root) => {
    visit(tree, (node: any) => {
      if (node.type === "containerDirective" && node.name === "query") {
        const data = node.data || (node.data = {});
        data.hName = "div";
        data.hProperties = {
          className: "prose dark:prose-invert",
          "data-fn": node.attributes?.fn || "",
          "data-args": node.attributes?.args || "",
        };
      }
    });
  };
}

function processNode(node: any, relayHandler: RelayHandler, index: number): ReactNode {
  try {
    switch (node.type) {
      case "text":
        return node.value || '';  // Ensure we return empty string if value is undefined

      case "paragraph":
        return createElement(
          "p",
          { key: index },
          (node.children || []).map((child: any, i: number) => processNode(child, relayHandler, i))
        );

      case "heading":
        const depth = Math.min(Math.max(node.depth || 1, 1), 6);  // Ensure valid heading level
        return createElement(
          `h${depth}`,
          { key: index },
          (node.children || []).map((child: any, i: number) => processNode(child, relayHandler, i))
        );

      case "link":
        return createElement(
          "a",
          { key: index, href: node.url || '#' },
          (node.children || []).map((child: any, i: number) => processNode(child, relayHandler, i))
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
            }
          }

          const buttonText = node.children?.[0]?.value || 'Button';

          return createElement(
            Button,
            {
              key: index,
              variant,
              size,
              onClick: async () => {
                if (fn) {
                  try {
                    toast.success(`Calling ${fn} with args: ${JSON.stringify(args)}`);
                    await relayHandler.callHypernoteFunction(fn, args);
                  } catch (error) {
                    console.error("Error publishing event:", error);
                    toast.error(`Error calling ${fn}: ${error}`);
                  }
                } else if (node.attributes?.kind) {
                  try {
                    const kind = parseInt(node.attributes.kind);
                    const tags: string[][] = [];
                    const content = node.attributes.content || '';
                    
                    // Parse tags from attributes that start with 'd'
                    Object.entries(node.attributes).forEach(([key, value]) => {
                      if (key.startsWith('d')) {
                        tags.push([key, String(value)]);
                      }
                    });

                    toast.success(`Publishing event kind ${kind}`);
                    await relayHandler.publish(kind, tags, content);
                  } catch (error) {
                    console.error("Error publishing event:", error);
                    toast.error(`Error publishing event: ${error}`);
                  }
                } else {
                  toast.error("No function or kind provided");
                }
              },
            },
            buttonText
          );
        }
        if (node.name === "query") {
          const fn = node.data?.hProperties?.["data-fn"];
          const args = node.data?.hProperties?.["data-args"];
          
          // Process each child into React elements
          const children = (node.children || []).map((child: any, i: number) => {
            if (child.type === "paragraph") {
              return createElement(
                "p",
                { key: i },
                (child.children || []).map((grandChild: any, j: number) => {
                  if (grandChild.type === "text") {
                    return grandChild.value || '';
                  }
                  return processNode(grandChild, relayHandler, j);
                })
              );
            }
            if (child.type === "text") {
              return child.value || '';
            }
            return processNode(child, relayHandler, i);
          });
          
          return createElement(
            QueryComponent,
            {
              key: index,
              fn,
              args,
              relayHandler,
              children,
            }
          );
        }
        return null;

      default:
        console.warn(`Unhandled node type: ${node.type}`);
        return null;
    }
  } catch (error) {
    console.error("Error processing markdown node:", error, node);
    return null;
  }
}

export async function renderMarkdownToReact(content: string, relayHandler: RelayHandler): Promise<ReactNode[]> {
  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(remarkQueries)
      .use(remarkButtons);

    const tree = await processor.parse(content);
    return ((tree as any).children || []).map((node: any, index: number) => 
      processNode(node, relayHandler, index)
    );
  } catch (error) {
    console.error("Error rendering markdown to React:", error);
    return [];
  }
}

export async function processMarkdown(content: string): Promise<Root> {
  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(remarkQueries)
      .use(remarkButtons);

    const result = await processor.parse(content);
    return result as Root;
  } catch (error) {
    console.error("Error processing markdown:", error);
    return { type: "root", children: [] } as Root;
  }
} 