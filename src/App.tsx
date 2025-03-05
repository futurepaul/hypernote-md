import "./index.css";
import { Card, CardContent } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { renderMarkdownToReact } from "@/lib/markdown";
import { Toaster } from "sonner";
import { useNdk } from "./contexts/NdkContext";

const initialMarkdown = `# Hello World

This is a paragraph with a [link](https://example.com).

:button[Click me]{test="test" bar="baz"}

## Second heading

Here's another button: :button[Secondary Button]{variant="secondary" size="lg"}`;

export function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [renderedContent, setRenderedContent] = useState<React.ReactNode[]>([]);

  const ndk = useNdk();

  useEffect(() => {
    setRenderedContent(renderMarkdownToReact(markdown, ndk));
  }, [markdown, ndk]);

  return (
    <>
      <div className="p-4 h-screen">
        <div className="grid grid-cols-2 gap-4 h-full">
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
      </div>
      <Toaster />
    </>
  );
}

export default App;
