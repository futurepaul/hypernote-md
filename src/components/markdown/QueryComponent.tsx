import React, { useEffect, useState } from "react";
import type { IRelayHandler } from "@/stores/nostrStore";
import { useNostrStore } from "@/stores/nostrStore";

interface QueryComponentProps {
  id: string;
  kind: string;
  d: string;
  children: React.ReactNode;
  relayHandler: IRelayHandler;
  "data-target"?: string;
  "data-d"?: string;
}

export function QueryComponent({ id, kind, d, children, relayHandler, "data-target": dataTarget, "data-d": dataD }: QueryComponentProps) {
  const [error, setError] = useState<string | null>(null);
  const { queryResponses, setQueryResponse } = useNostrStore();

  useEffect(() => {
    async function setupQuery() {
      try {
        const kindNum = parseInt(kind);
        if (isNaN(kindNum)) {
          throw new Error(`Invalid kind: ${kind}`);
        }

        // Subscribe to query events
        relayHandler.subscribeToQuery(id, kindNum, d, (event) => {
          setQueryResponse(id, event);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to setup query");
      }
    }

    setupQuery();

    // Cleanup function
    return () => {
      // The cleanup is handled by the RelayHandler when we call subscribeToQuery
      // with the same ID, which will close the old subscription
    };
  }, [id, kind, d, relayHandler, setQueryResponse]);

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  const data = queryResponses[id];
  if (!data) {
    return <div>Loading...</div>;
  }

  // Helper function to replace query content in a string
  const replaceQueryContent = (text: string) => {
    return text.replace(new RegExp(`\\{${id}\\.(\\w+)\\}`, 'g'), (_, field) => {
      return data[field] || `{${id}.${field}}`;
    });
  };

  // Process children, replacing {id.x} with actual values
  const processedChildren = React.Children.map(children, child => {
    if (typeof child === "string") {
      return replaceQueryContent(child);
    }
    
    // If it's a React element, process its children and props
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<any>;
      const newProps = { ...element.props };

      // Handle button targets
      if (element.type === 'button' && element.props.target === `#${id}`) {
        try {
          const rawArgs = element.props.args || "{}";
          const processedArgs = replaceQueryContent(rawArgs);
          newProps.args = processedArgs;
        } catch (error) {
          console.error("Error processing button args:", error);
        }
      }

      // Process children
      if (element.props.children) {
        newProps.children = React.Children.map(element.props.children, grandChild => {
          if (typeof grandChild === "string") {
            return replaceQueryContent(grandChild);
          }
          return grandChild;
        });
      }

      return React.cloneElement(element, newProps);
    }
    
    return child;
  });

  return <div className="prose dark:prose-invert" data-target={dataTarget} data-d={dataD}>{processedChildren}</div>;
} 