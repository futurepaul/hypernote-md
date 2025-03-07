import React from "react";
import { useNostrStore } from "@/stores/nostrStore";
import { v4 as uuidv4 } from 'uuid';

interface PreComponentProps {
  children: React.ReactNode;
  queryId?: string;
  field?: string;
}

export function PreComponent({ children, queryId, field }: PreComponentProps) {
  const { registerSlot, getSlotValue, queryResponses } = useNostrStore();
  const [slotId] = React.useState(() => uuidv4());

  React.useEffect(() => {
    if (queryId) {
      registerSlot(slotId, queryId, field || 'full');
    }
  }, [queryId, field, slotId]);

  // Get the event data if we're in a query context
  const eventData = queryId ? queryResponses[queryId] : null;
  
  // If we have event data and a specific field was requested, return just that field
  const content = eventData 
    ? (field ? eventData[field] : eventData) 
    : children;

  // If we were expecting query data but got none, show a helpful message
  if (queryId && !eventData) {
    return (
      <pre className="whitespace-pre-wrap break-all bg-muted p-4 rounded-md overflow-x-auto text-muted-foreground">
        Waiting for data from query '{queryId}'...
        Use :pre[{'{'}q{'}'}] for full event or :pre[{'{'}q.field{'}'}] for specific fields
      </pre>
    );
  }

  return (
    <pre className="whitespace-pre-wrap break-all bg-muted p-4 rounded-md overflow-x-auto">
      {typeof content === 'object' ? JSON.stringify(content, null, 2) : content}
    </pre>
  );
} 