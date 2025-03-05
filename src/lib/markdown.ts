import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import MarkdownItDirective from "markdown-it-directive";
import { createElement, Fragment } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { toast } from "sonner";
import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";

type ButtonVariant = VariantProps<typeof Button>["variant"];
type ButtonSize = VariantProps<typeof Button>["size"];

interface DirectiveToken extends Omit<Token, "attrs"> {
  name: string;
  content: string;
  attrs?: Record<string, string>;
}

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
    const { state, content, attrs } = params;
    const token = state.push("html_inline", "", 0);
    const variant = (attrs?.variant || "default") as ButtonVariant;
    const size = (attrs?.size || "default") as ButtonSize;

    // Store all attributes as a data attribute
    const attrsJson = JSON.stringify(attrs || {});
    token.content = `<button class="button-${variant} button-${size}" data-attrs='${attrsJson}'>${content}</button>`;
  };
});

// Helper function to process inline tokens
const processInlineContent = (token: any, ndk: NDK): ReactNode[] => {
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
      } else if (child.type === "html_inline") {
        // If we have text buffered, add it before the HTML
        if (textBuffer) {
          result.push(textBuffer);
          textBuffer = "";
        }
        // Parse the button HTML and create a React button
        const match = child.content.match(
          /button-(\w+).*button-(\w+)".*data-attrs='(.*?)'>(.*?)<\/button>/
        );
        if (match) {
          const [_, variant, size, attrsJson, content] = match;
          const attrs = JSON.parse(attrsJson);

          // Format the attrs for display
          const formattedAttrs = Object.entries(attrs)
            .map(([key, value]) => `${key}="${value}"`)
            .join(" ");

          result.push(
            createElement(
              Button,
              {
                key: i,
                variant: variant as ButtonVariant,
                size: size as ButtonSize,
                onClick: async () => {
                  toast.success(`Event:\n{${formattedAttrs}}`);

                  try {
                    const ndkEvent = new NDKEvent(ndk);
                    ndkEvent.kind = 30078;
                    ndkEvent.tags = [["d", "HYPERNOTE_TEST"]];
                    ndkEvent.content = `Button clicked with attributes: ${formattedAttrs}`;
                    await ndkEvent.publish();
                    console.log("Signed event:", ndkEvent);
                  } catch (error) {
                    console.error("Error publishing event:", error);
                  }
                },
              },
              content
            )
          );
        }
      }
    }

    // Add any remaining text
    if (textBuffer) {
      result.push(textBuffer);
    }
  }

  return result;
};

export const renderMarkdownToReact = (src: string, ndk: NDK): ReactNode[] => {
  const tokens = md.parse(src, {});
  let result: ReactNode[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case "paragraph_open":
        const inlineToken = tokens[i + 1];
        const paragraphContent = processInlineContent(inlineToken, ndk);
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
