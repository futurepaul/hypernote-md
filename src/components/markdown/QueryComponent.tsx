import React, { useEffect, useState } from "react";
import type { RelayHandler } from "@/stores/nostrStore";

interface QueryComponentProps {
  fn: string;
  args: string;
  children: React.ReactNode;
  relayHandler: RelayHandler;
}

export function QueryComponent({ fn, args, children, relayHandler }: QueryComponentProps) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // For now, simulate a delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        setData({ content: "Mock content from query" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      }
    }

    fetchData();
  }, [fn, args]);

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!data) {
    return <div>Loading...</div>;
  }

  // Process children, replacing {result.x} with actual values
  const processedChildren = React.Children.map(children, child => {
    console.log("Processing child:", child);
    
    if (typeof child === "string") {
      return child.split(/(\{result\.\w+\})/).map((part, i) => {
        const match = part.match(/\{result\.(\w+)\}/);
        if (match && match[1]) {
          return data[match[1]] || part;
        }
        return part;
      });
    }
    
    // If it's a React element, process its children
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<{ children?: React.ReactNode }>;
      return React.cloneElement(element, {
        children: React.Children.map(element.props.children, grandChild => {
          if (typeof grandChild === "string") {
            return grandChild.split(/(\{result\.\w+\})/).map((part, i) => {
              const match = part.match(/\{result\.(\w+)\}/);
              if (match && match[1]) {
                return data[match[1]] || part;
              }
              return part;
            });
          }
          return grandChild;
        }),
      });
    }
    
    return child;
  });

  return <div className="prose dark:prose-invert">{processedChildren}</div>;
} 