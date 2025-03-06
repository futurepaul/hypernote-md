# bun-react-tailwind-shadcn-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

This project was created using `bun init` in bun v1.2.5. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

# Query Content Hydration with Slots

> ⚠️ **WARNING**: The current implementation is fragile and has several limitations:
> - Only supports the `content` field from queries
> - Basic type handling (only converts to numbers if they look like numbers)
> - No validation of query responses or slot values
> - No proper error handling for missing or invalid values
> - No schema validation
> 
> Future improvements should include:
> - Proper type checking and validation
> - Support for more field types
> - Better error handling
> - Schema validation
> - Documentation of supported field types and formats

The project uses a slots-based system to handle dynamic content from queries. This allows components to reactively update when query data changes.

## How it Works

1. When processing markdown with a button that references query content:
   ```markdown
   :::query{#q kind="30078" d="test"}
   {q.content}

   :button[Click me]{fn="plusone" args='{"a": {q.content}}' target="#q"}
   :::
   ```

2. The system:
   - Generates a unique slot ID for the button
   - Registers the slot with the query ID and field it depends on
   - Passes the slot ID to the button component

3. When query data arrives:
   - The nostrStore updates the query response
   - It automatically updates all slots that depend on that query
   - The slots get the new values from the query response

4. When the button is clicked:
   - It gets the current slot value from the store
   - Replaces the query content reference in the args with the actual value
   - Parses the args and calls the function

## Benefits

- Clear separation between data dependencies and UI
- Automatic updates when query data changes
- No need to traverse the React tree
- Slots can be used anywhere, not just in buttons
- The hydration process is explicit and easier to debug

# nak
```
nak req -k 30078 -t d=test -l 1 relay.nostr.net
```

```
nak req -k 5910 -t d=test -l 1 relay.nostr.net
```
