import MarkdownIt from "markdown-it";
import MarkdownItDirective from "markdown-it-directive";
import { createElement } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { toast } from "sonner";
import type { RelayHandler } from "@/stores/nostrStore";

type ButtonVariant = VariantProps<typeof Button>["variant"];
type ButtonSize = VariantProps<typeof Button>["size"];

interface DirectiveState {
  state: any;
  content: string;
  attrs?: Record<string, string>;
}

interface MarkdownItWithDirectives extends MarkdownIt {
  inlineDirectives: Record<string, (params: DirectiveState) => void>;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
}) as MarkdownItWithDirectives;

// First apply the directive plugin
md.use(MarkdownItDirective).use((md: any) => {
  md.inlineDirectives["button"] = function (params: any) {
    const { state, content, info } = params;
    console.log("Directive params:", { content, info });

    // Parse the info string which contains our attributes
    const attrs: Record<string, string> = {};
    if (info) {
      // Match either:
      // 1. key="value" or key='value'
      // 2. key={...} for JSON objects
      // 3. key=value for bare values
      const matches = info.matchAll(/(\w+)=(?:["']([^"']+)["']|\{([^}]+)\}|([^\s}]+))/g);
      for (const match of matches) {
        const [_, key, quotedValue, jsonValue, bareValue] = match;
        attrs[key] = quotedValue || jsonValue || bareValue;
      }
    }

    // Create a placeholder token that we'll replace with React later
    const token = state.push("react_button", "", 0);
    token.content = content;
    token.attrs = attrs;
  };
});

// Helper function to process inline tokens
const processInlineContent = (token: any, relayHandler: RelayHandler): ReactNode[] => {
  const result: ReactNode[] = [];

  if (token.children) {
    let textBuffer = "";

    for (let i = 0; i < token.children.length; i++) {
      const child = token.children[i];

      if (child.type === "text") {
        textBuffer += child.content;
      } else if (child.type === "link_open") {
        // If we have text buffered, add it before the link
        if (textBuffer) {
          result.push(textBuffer);
          textBuffer = "";
        }
        const href = child.attrGet("href") || "";
        const content = token.children[i + 1].content;
        result.push(createElement("a", { key: i, href }, content));
        i += 2; // Skip the link content and close tokens
      } else if (child.type === "react_button") {
        // If we have text buffered, add it before the button
        if (textBuffer) {
          result.push(textBuffer);
          textBuffer = "";
        }

        const variant = (child.attrs?.variant || "default") as ButtonVariant;
        const size = (child.attrs?.size || "default") as ButtonSize;
        const fn = child.attrs?.fn;
        const args = child.attrs?.args ? JSON.parse(child.attrs.args) : {};

        result.push(
          createElement(
            Button,
            {
              key: i,
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
            child.content
          )
        );
      }
    }

    // Add any remaining text
    if (textBuffer) {
      result.push(textBuffer);
    }
  }

  return result;
};

export const renderMarkdownToReact = (src: string, relayHandler: RelayHandler): ReactNode[] => {
  const tokens = md.parse(src, {});
  let result: ReactNode[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token?.type) {
      case "paragraph_open":
        const inlineToken = tokens[i + 1];
        const paragraphContent = processInlineContent(inlineToken, relayHandler);
        result.push(createElement("p", { key: i }, paragraphContent));
        i += 2; // Skip content and closing tokens
        break;

      case "heading_open":
        const level = parseInt(token.tag.slice(1));
        const headingContent = tokens[i + 1]?.content || "";
        result.push(createElement(`h${level}`, { key: i }, headingContent));
        i += 2; // Skip content and closing tokens
        break;
    }
  }

  return result;
};

export { md };
