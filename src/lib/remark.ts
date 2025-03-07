import { createElement } from "react";
import type { ReactNode } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkDirective from "remark-directive";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import { Button } from "@/components/ui/button";
import { QueryComponent } from "@/components/markdown/QueryComponent";
import { PreComponent } from "@/components/markdown/PreComponent";
import type { VariantProps } from "class-variance-authority";
import { toast } from "sonner";
import type { RelayHandler } from "@/lib/relayHandler";
import { useNostrStore } from "@/stores/nostrStore";
import React from "react";

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
        // Extract ID from the directive label (e.g., #q from :::query{#q})
        const id = node.attributes?.id || "";
        
        // Store the ID in the attributes for consistency
        if (!node.attributes) {
          node.attributes = {};
        }
        node.attributes.id = id;
        
        // Add debug logging
        console.log("Query directive found:", { id, attributes: node.attributes });
        
        // Set up the node for React rendering
        const data = node.data || (node.data = {});
        data.hName = "div";
        data.hProperties = {
          className: "prose dark:prose-invert",
          id,
          "data-target": id || undefined,
          kind: node.attributes?.kind || "",
          d: node.attributes?.d || "",
        };
        
        // Ensure the node is treated as a container directive with children
        node.type = "containerDirective";
        if (!node.children) {
          node.children = [];
        }
      }
    });
  };
}

// Utility function to process query references in text
export function processQueryReferences(text: string): string {
  const queryRegex = /\{([^.]+)\.([^}]+)\}/g;
  let processedText = text;
  let match;
  
  // Process all query references in the text
  while ((match = queryRegex.exec(text)) !== null) {
    if (match.length >= 3) {
      const [fullMatch, queryId, field] = match;
      
      if (queryId && field) {
        const event = useNostrStore.getState().queryResponses[queryId];
        
        if (event && field in event) {
          // Replace with the actual value
          const value = String(event[field as keyof typeof event]);
          processedText = processedText.replace(fullMatch, value);
        }
      }
    }
  }
  
  return processedText;
}

// Higher-order component to create reactive elements that update with query data
export function createReactiveElement(
  renderFn: () => ReactNode
): ReactNode {
  return createElement(
    ({ children }: { children: ReactNode }) => {
      // Re-render when queryResponses change
      useNostrStore(state => Object.keys(state.queryResponses).length);
      return renderFn();
    },
    { children: null}
  );
}

// Process args object with query references
export function processQueryArgs(rawArgs: string, targetId: string): any {
  if (!targetId) return JSON.parse(rawArgs);
  
  const queryId = targetId.replace("#", "");
  const event = useNostrStore.getState().queryResponses[queryId];
  
  if (!event) return JSON.parse(rawArgs);
  
  // Process the args by finding all query patterns and replacing them
  const regex = new RegExp(`\\{${queryId}\\.([^}]+)\\}`, 'g');
  let processedArgs = rawArgs;
  
  processedArgs = processedArgs.replace(regex, (match: string, field: string) => {
    if (field && field in event) {
      const value = event[field as keyof typeof event];
      return typeof value === 'number' ? 
        String(value) : 
        JSON.stringify(value).replace(/^"|"$/g, '');
    }
    return match;
  });
  
  return JSON.parse(processedArgs);
}

function processNode(node: any, relayHandler: RelayHandler, index: number): ReactNode {
  try {
    switch (node.type) {
      case "text":
        return node.value || '';

      case "paragraph":
        return createElement(
          "p",
          { key: index },
          (node.children || []).map((child: any, i: number) => processNode(child, relayHandler, i))
        );

      case "heading":
        const depth = Math.min(Math.max(node.depth || 1, 1), 6);
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
          const rawArgs = node.attributes?.args || "{}";
          const target = node.attributes?.target;

          // Get the original button text from children
          const buttonTextNode = node.children?.[0]; 
          const buttonText = buttonTextNode?.value || "Button";
          
          // Create a function to render the button with query data
          const renderButton = () => {
            // Process query references in the button text
            const processedText = processQueryReferences(buttonText);
            
            return React.createElement(
              Button,
              {
                key: index,
                variant: variant,
                size: size,
                onClick: async () => {
                  if (fn) {
                    try {
                      let args;
                      
                      try {
                        args = processQueryArgs(rawArgs, target || "");
                      } catch (error) {
                        console.error("Failed to parse button args:", error);
                        toast.error("Failed to parse button arguments");
                        return;
                      }

                      toast.success(`Calling ${fn} with args: ${JSON.stringify(args)}`);
                      await relayHandler.callHypernoteFunction(fn, args, target);
                    } catch (error) {
                      console.error("Error calling function:", error);
                      toast.error(`Error calling ${fn}: ${error}`);
                    }
                  } else if (node.attributes?.kind) {
                    try {
                      const kind = parseInt(node.attributes.kind);
                      const tags: string[][] = [];
                      const content = node.attributes.content || '';
                      
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
                }
              },
              processedText
            );
          };

          // Create a component that will re-render when store changes
          return createReactiveElement(renderButton);
        }
        if (node.name === "pre") {
          const children = (node.children || []).map((child: any, i: number) => {
            if (child.type === "text") {
              return child.value || '';
            }
            return processNode(child, relayHandler, i);
          });

          // Check if we're inside a query and the content matches either {queryId} or {queryId.field} format
          const content = children.join('');
          const fullQueryMatch = content.match(/\{([^}]+)\}/);
          
          if (fullQueryMatch) {
            const [_, queryPart] = fullQueryMatch;
            const fieldMatch = queryPart.match(/([^.]+)\.(.+)/);
            
            // Create a rendering function that will be called when the component renders
            const renderPre = () => {
              if (fieldMatch) {
                // We have a field access like {q.content}
                const [_, queryId, field] = fieldMatch;
                
                return createElement(
                  PreComponent,
                  { 
                    key: index,
                    children: content,
                    queryId: queryId,
                    field: field
                  },
                  null
                );
              } else {
                // We have a full event access like {q}
                const queryId = queryPart;
                
                return createElement(
                  PreComponent,
                  { 
                    key: index,
                    children: content,
                    queryId: queryId
                  },
                  null
                );
              }
            };
            
            // Create a component that will re-render when store changes
            return createReactiveElement(renderPre);
          }
          
          // No query reference, just render the content
          return createElement(
            PreComponent,
            { 
              key: index,
              children: content
            },
            null
          );
        }
        if (node.name === "query") {
          const id = node.attributes?.id;
          const kind = node.attributes?.kind;
          const d = node.attributes?.d;
          
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
              id,
              kind,
              d,
              authors: node.attributes?.authors,
              limit: node.attributes?.limit,
              relayHandler,
              children,
              "data-target": id ? `#${id}` : "",
              "data-d": d || "",
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
    const tree = await processMarkdown(content);
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
    console.log("Parsed result:", result);
    return result as Root;
  } catch (error) {
    console.error("Error processing markdown:", error);
    return { type: "root", children: [] } as Root;
  }
} 