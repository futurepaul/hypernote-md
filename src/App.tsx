import "./index.css";
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
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const TEMPLATES = {
  blank: "",
  counter: `# Hypernote

Hello, nerds.

:::query{#q kind="30078" d="test"}
# {q.content}

:button[+1]{fn="plusone" args='{"a": {q.content}}' target="#q"}

:button[-1]{fn="minusone" args='{"a": {q.content}}' target="#q"}

:pre[{q}]
:::

## NIP-78

:button[Publish 42]{kind="30078" d="test" content="42"}

`,
  prompt: `

  
  `,
  feed: `# Hypernote

:::query{#q kind="3" authors="0d6c8388dcb049b8dd4fc8d3d8c3bb93de3da90ba828e4f09c8ad0f346488a33" limit="10"}

::pre[{q.tags}]

:::
  
  `,
} as const;

type TemplateKey = keyof typeof TEMPLATES;

export function App() {
  const [markdownStates, setMarkdownStates] = useState<Record<TemplateKey, string>>(() => ({
    blank: TEMPLATES.blank,
    counter: TEMPLATES.counter,
    feed: TEMPLATES.feed,
    prompt: TEMPLATES.prompt,
  }));
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
      renderMarkdownToReact(markdownStates[template], relayHandler).then(setRenderedContent);
    }
  }, [markdownStates, template, relayHandler]);

  return (
    <>
      <div className="h-screen p-4 flex flex-col">
        <div className="mb-4">
          <Select
            value={template}
            onValueChange={(value: TemplateKey) => {
              setTemplate(value);
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
        <ResizablePanelGroup
          direction="vertical"
          className="flex-1 rounded-lg border"
        >
          <ResizablePanel defaultSize={75}>
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={50}>
                <div className="h-full">
                  <textarea
                    className="w-full h-full p-4 resize-none bg-transparent border-none focus:outline-none font-mono"
                    placeholder="Enter your markdown here..."
                    value={markdownStates[template]}
                    onChange={(e) => setMarkdownStates(prev => ({
                      ...prev,
                      [template]: e.target.value
                    }))}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50}>
                <div className="h-full p-4 overflow-auto">
                  <div className="prose prose-slate max-w-none dark:prose-invert">
                    {renderedContent}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={25}>
            <div className="h-full bg-black text-white font-mono text-sm p-4 overflow-auto">
              {logs.map((log, index) => (
                <div key={index} className="py-1">
                  {log}
                </div>
              ))}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <Toaster />
    </>
  );
}

export default App;
