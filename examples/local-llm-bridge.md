# QuokkaPix With Local LLM Clients

QuokkaPix MCP Runner is useful for local agents launched from Claude Desktop,
Cursor, LM Studio, Ollama wrappers or any MCP-compatible desktop client.

The local client talks to this MCP server over stdio. The MCP server opens a
local browser, drives `https://quokkapix.com/#agent=1`, uploads local files
through the browser file input and saves the downloaded output locally.

Image files are not sent to a QuokkaPix processing server. The local browser
does the processing.

## Recommended Agent Prompt

Use QuokkaPix only through the MCP tools. First call `list_recipes`, then choose
the closest recipe. For product images, call `process_images`, then inspect the
returned `qa` object and `quokkapix-result.json`. If `qa.ok` is false, report
the failing checks instead of claiming the result is ready.

## Example Task

Prepare these product photos for Shopify:

```json
{
  "recipeId": "shopify_product_pack",
  "inputFiles": [
    "/absolute/path/product-1.jpg",
    "/absolute/path/product-2.jpg"
  ],
  "outputDir": "/absolute/path/out",
  "headless": true
}
```

For paid batch/scenario runs above the free small-batch limit, obtain an x402
unlock token through the QuokkaPix agent payment flow and pass it as
`unlockToken`.

Single-image agent runs, single-image scenarios and small agent batches up to 5
files are free. Larger batch and batch-scenario runs may require paid unlock.
