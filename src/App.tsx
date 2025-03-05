import "./index.css";
import { Card, CardContent } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { renderMarkdownToReact } from "@/lib/markdown";
import { Toaster } from "sonner";
import { useNostrStore } from "./stores/nostrStore";

const initialMarkdown = `# Hello World

This is a paragraph with a [link](https://example.com).

:button[Click me]{fn="plusone" args="baz"}

## Second heading

Here's another button: :button[Secondary Button]{variant="secondary" size="lg"}`;

export function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
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
      setRenderedContent(renderMarkdownToReact(markdown, relayHandler));
    }
  }, [markdown, relayHandler]);

  return (
    <>
      <div className="p-4 h-screen flex flex-col">
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
