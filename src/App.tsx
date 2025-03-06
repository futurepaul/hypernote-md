import "./index.css";
import { Card, CardContent } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { renderMarkdownToReact } from "@/lib/remark";
import { Toaster } from "sonner";
import { useNostrStore } from "./stores/nostrStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TEMPLATES = {
  blank: "",
  counter: `# Hypernote

Hello, nerds.

:::query{#q kind="30078" d="test"}
# {q.content}

:button[+1]{fn="plusone" args='{"a": {q.content}}' target="#q"}

:button[-1]{fn="minusone" args='{"a": {q.content}}' target="#q"}
:::

## NIP-78

:button[Publish 42]{kind="30078" d="test" content="42"}
`,
  prompt: `

  
  `,
  feed: `# Hypernote

:::query{#q kind="3" authors="0d6c8388dcb049b8dd4fc8d3d8c3bb93de3da90ba828e4f09c8ad0f346488a33" limit="10"}

# {q.content}

:::
  `,
} as const;

type TemplateKey = keyof typeof TEMPLATES;

export function App() {
  const [markdown, setMarkdown] = useState<string>(TEMPLATES.blank);
  const [template, setTemplate] = useState<TemplateKey>("blank");
  const [renderedContent, setRenderedContent] = useState<React.ReactNode[]>([]);

  const { relayHandler, initialize, cleanup, logs } = useNostrStore();

  useEffect(() => {
    initialize();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (relayHandler) {
      renderMarkdownToReact(markdown, relayHandler).then(setRenderedContent);
    }
  }, [markdown, relayHandler]);

  return (
    <>
      <div className="p-4 h-screen flex flex-col">
        <div className="mb-4">
          <Select
            value={template}
            onValueChange={(value: TemplateKey) => {
              setTemplate(value);
              setMarkdown(TEMPLATES[value]);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blank">Blank</SelectItem>
              <SelectItem value="counter">Counter</SelectItem>
              <SelectItem value="feed">Feed</SelectItem>
              {/* <SelectItem value="prompt">Prompt</SelectItem> */}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4 flex-1">
          {/* Markdown Input */}
          <Card className="h-full">
            <CardContent className="p-4 h-full">
              <textarea
                className="w-full h-full p-4 resize-none bg-transparent border-none focus:outline-none font-mono"
                placeholder="Enter your markdown here..."
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Markdown Preview */}
          <Card className="h-full">
            <CardContent className="p-4 h-full overflow-auto">
              <div className="prose prose-slate max-w-none dark:prose-invert">
                {renderedContent}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Log Display */}
        <Card className="mt-4 bg-black">
          <CardContent className="p-4">
            <div className="text-white font-mono text-sm overflow-auto min-h-32 max-h-64">
              {logs.map((log, index) => (
                <div key={index} className="py-1">
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </>
  );
}

export default App;
