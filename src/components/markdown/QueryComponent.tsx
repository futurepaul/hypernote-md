import React, { useEffect, useState } from "react";
import type { IRelayHandler } from "@/lib/relayHandler";
import { useNostrStore } from "@/stores/nostrStore";
import type { Event, Filter } from "nostr-tools";

interface QueryComponentProps {
  id: string;
  kind: string;
  d: string;
  authors?: string;
  limit?: string;
  children: React.ReactNode;
  relayHandler: IRelayHandler;
  "data-target"?: string;
  "data-d"?: string;
}

export function QueryComponent({ 
  id, 
  kind, 
  d, 
  authors, 
  limit, 
  children, 
  relayHandler, 
  "data-target": dataTarget, 
  "data-d": dataD 
}: QueryComponentProps) {
  const { setQueryResponse } = useNostrStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = setupQuery();
    return unsubscribe;
  }, [id, kind, d, authors]);

  function setupQuery() {
    try {
      const kindNum = parseInt(kind, 10);
      if (isNaN(kindNum)) {
        console.error(`Invalid kind: ${kind}`);
        return () => {};
      }

      // Create a Filter object for our new sub method
      const filter: Filter = {
        kinds: [kindNum],
      };

      // Add d tag if provided
      if (d) {
        filter["#d"] = [d];
      }

      // Add authors if provided
      if (authors) {
        filter.authors = authors.split(",").map(a => a.trim());
      }

      // Add limit if provided
      if (limit) {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum)) {
          filter.limit = limitNum;
        }
      }

      console.log(`Setting up query ${id} with filter:`, filter);

      // Subscribe to query events using the new sub method
      const subscription = relayHandler.sub(
        id, 
        filter,
        (event: Event) => {
          console.log(`Received event for query ${id}:`, event);
          // Process the event for the query component
          const queryData = {
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at,
            kind: event.kind,
            content: event.content,
            tags: event.tags,
            // Add any other fields needed
          };
          setQueryResponse(id, queryData);
          setLoading(false);
        }
      );

      // Return a cleanup function
      return () => {
        console.log(`Cleaning up query ${id}`);
        subscription?.close?.();
      };

    } catch (err) {
      console.error("Error setting up query:", err);
      return () => {};
    }
  }

  const { queryResponses } = useNostrStore();
  const queryResponse = queryResponses[id];

  // Replace {id.fieldName} with the actual value from the query response
  const replaceQueryContent = (text: string) => {
    console.log(`Replacing content in query ${id}, text: "${text}", has queryResponse:`, !!queryResponse);
    
    if (!queryResponse) return text;
    
    // For debugging, log the queryResponse content
    console.log(`QueryResponse for ${id}:`, queryResponse);
    
    // Replace {id.field} format where id is the actual query component ID
    return text.replace(new RegExp(`\\{${id}\\.([^}]+)\\}`, 'g'), (match, field) => {
      console.log(`Found match "${match}", field: "${field}", value: ${queryResponse[field]}`);
      return queryResponse[field] !== undefined ? String(queryResponse[field]) : match;
    });
  };

  // Process children to replace query placeholders with actual values
  const processedChildren = React.Children.map(children, (child) => {
    if (typeof child === "string") {
      return replaceQueryContent(child);
    }
    
    // If it's a React element, process its children and props
    if (React.isValidElement(child)) {
      const element = child;
      // Use type assertion with unknown as intermediate step to avoid TS errors
      const props = element.props as any;
      const newProps = { ...props };

      // Handle button targets
      if (element.type === 'button' && props.target === `#${id}`) {
        try {
          console.log(`Processing button targeting #${id}`, props);
          const rawArgs = props.args || "{}";
          console.log(`Raw args before replacement:`, rawArgs);
          const processedArgs = replaceQueryContent(rawArgs);
          console.log(`Processed args after replacement:`, processedArgs);
          newProps.args = processedArgs;
        } catch (error) {
          console.error("Error processing button args:", error);
        }
      }

      // Process children recursively
      if (props.children) {
        newProps.children = React.Children.map(props.children, (grandChild: React.ReactNode) => {
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

  return (
    <div 
      id={id} 
      data-target={dataTarget}
      data-d={dataD || d}
      className="prose dark:prose-invert"
    >
      {loading && !queryResponse ? (
        <div>Loading query {id}...</div>
      ) : (
        processedChildren
      )}
    </div>
  );
} 