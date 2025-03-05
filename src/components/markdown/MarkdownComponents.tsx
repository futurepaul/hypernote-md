import * as React from "react";
import { Button } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

type ButtonVariant = VariantProps<typeof Button>["variant"];
type ButtonSize = VariantProps<typeof Button>["size"];

export const MarkdownComponents = {
  // Inline components
  button: ({ content, attrs }: { content: string; attrs?: Record<string, string> }) => {
    return (
      <Button
        variant={(attrs?.variant as ButtonVariant) || "default"}
        size={(attrs?.size as ButtonSize) || "default"}
        className={attrs?.class}
      >
        {content}
      </Button>
    );
  },

  // Block components
  heading: ({ level, content }: { level: number; content: string }) => {
    const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
    return <Tag className={`text-${7 - level}xl font-bold mt-8 mb-4 tracking-tight`}>{content}</Tag>;
  },

  paragraph: ({ content }: { content: string }) => {
    return <p className="my-4 leading-relaxed">{content}</p>;
  },

  link: ({ href, content }: { href: string; content: string }) => {
    return (
      <a href={href} className="text-blue-600 no-underline hover:underline">
        {content}
      </a>
    );
  },

  code: ({ content, inline }: { content: string; inline?: boolean }) => {
    if (inline) {
      return <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono">{content}</code>;
    }
    return (
      <pre className="bg-slate-100 p-4 rounded-lg my-4 overflow-auto">
        <code className="bg-transparent p-0 text-sm">{content}</code>
      </pre>
    );
  },
}; 