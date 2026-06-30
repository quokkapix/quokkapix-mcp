# QuokkaPix MCP Runner

[![quokkapix-mcp MCP server](https://glama.ai/mcp/servers/quokkapix/quokkapix-mcp/badges/score.svg)](https://glama.ai/mcp/servers/quokkapix/quokkapix-mcp)

Local MCP adapter for private, browser-based QuokkaPix image workflows.

QuokkaPix MCP Runner lets AI agents process local image files with QuokkaPix by opening the QuokkaPix web app in a local browser, applying an official recipe or direct settings payload, uploading files through the browser file input, downloading the result, and writing a machine-readable `quokkapix-result.json`.

It is designed for MCP-compatible local agents such as Claude Desktop, Cursor, LM Studio/Ollama wrappers, and other desktop or automation clients that can call MCP tools over stdio.

Repository: <https://github.com/quokkapix/quokkapix-mcp>

npm package: <https://www.npmjs.com/package/quokkapix-mcp>

Glama listing: <https://glama.ai/mcp/servers/quokkapix/quokkapix-mcp>

mcpservers.org listing: <https://mcpservers.org/servers/quokkapix/quokkapix-mcp>

Quick start:

```bash
npx quokkapix-mcp
```

## What This Is

This package is a local automation adapter around the browser app at:

```text
https://quokkapix.com/#agent=1
```

The adapter uses Playwright to drive a local Chromium browser. The browser runs the same QuokkaPix editor that humans use, including the in-browser `window.QuokkaPixAgent` API.

Image files are processed in the user's browser runtime. During normal processing, source image bytes are not uploaded to a QuokkaPix image-processing server.

## What This Is Not

This package is not:

- a public server-side image processing API;
- a hosted MCP server endpoint;
- a GPU/CPU image-processing backend run by QuokkaPix;
- a way to pass local file paths to `quokkapix.com` by URL;
- a replacement for browser memory limits.

Local file paths are available only to the local MCP runner on the user's machine. The public QuokkaPix website still receives files only through the browser file input or dropzone.

## Why Use It

Use this adapter when an AI agent needs to run repeatable image workflows like:

- prepare product photos for Shopify, Amazon, or Google Merchant;
- compress images to WebP for a website;
- remove EXIF/GPS metadata;
- generate social media image packs;
- watermark a batch of images;
- generate favicon and app icon packs;
- run custom QuokkaPix settings without manually clicking the UI.

The main value is privacy and low infrastructure cost: the agent gets a practical image workflow tool, while image processing remains local in the user's browser.

## Architecture

```text
AI agent / MCP client
        |
        | stdio MCP
        v
quokkapix-mcp
        |
        | Playwright
        v
local Chromium browser
        |
        | window.QuokkaPixAgent + stable data-agent selectors
        v
https://quokkapix.com/#agent=1
        |
        | local browser processing
        v
downloaded output + quokkapix-result.json
```

The adapter saves:

- the generated image, ZIP, or PDF output;
- `quokkapix-result.json`;
- a `qa` object returned to the agent.

## Requirements

- Node.js `>=20`
- npm
- Playwright Chromium
- internet access for loading QuokkaPix and browser-side dependencies/models when needed
- local file paths that the MCP process can read

Install dependencies:

```bash
npm install
npx playwright install chromium
```

## MCP Tools

### `list_recipes`

Lists official QuokkaPix recipes.

Use first when the agent does not know which workflow to run.

### `get_recipe`

Returns one recipe by id, including:

- `applySettings`;
- file limits;
- expected output;
- QA contract;
- payment requirement.

Input:

```json
{
  "id": "shopify_product_pack"
}
```

### `validate_recipe`

Validates a custom recipe object before processing.

This does not upload files and does not start processing.

### `validate_result_manifest`

Validates an existing `quokkapix-result.json` against a recipe or custom QA contract.

This is useful when an agent wants to inspect a previous run and decide whether the output is acceptable.

### `process_images`

Processes local image files through QuokkaPix using either:

- an official `recipeId`;
- a full custom recipe object.

It opens a browser, applies the recipe, uploads files, starts processing, downloads the output, writes `quokkapix-result.json`, and returns QA results.

Optional local asset files:

- `watermarkLogoFile`: local logo/image file uploaded into QuokkaPix's watermark logo input.
- `backgroundImageFile`: local image file uploaded into QuokkaPix's background replacement image input.

These assets are still uploaded only into the local browser page. They are not passed as URL paths to the public QuokkaPix website.

### `process_with_settings`

Processes local image files using a direct QuokkaPix `applySettings` payload.

Use this when the agent already knows the exact editor settings and does not want to wrap them in a recipe.

This is the broadest tool surface. It can drive the same settings surface as:

```js
window.QuokkaPixAgent.applySettings(payload)
```

Supported editor areas depend on the QuokkaPix browser contract and include:

- resize;
- crop;
- rotate;
- convert;
- compress;
- metadata removal/reporting;
- background removal/replacement settings;
- watermark;
- effects;
- rename;
- constructor/scenario workflows.

For custom scenarios, prefer the explicit structured form:

```json
{
  "mode": "batch",
  "tool": "constructor",
  "steps": [
    {
      "tool": "resize",
      "settings": { "mode": "fit", "width": 1200, "height": 1200 }
    },
    {
      "tool": "watermark",
      "settings": { "type": "text", "text": "Brand", "layout": "tiled", "angle": -20 }
    },
    {
      "tool": "compress",
      "settings": { "format": "webp", "quality": 0.82 }
    }
  ]
}
```

Step `settings` use the same section keys as `window.QuokkaPixAgent.applySettings`.

### `get_payment_options`

Fetches QuokkaPix agent payment policy and x402 endpoints.

This does not perform a payment.

### `explain_payment_flow`

Explains the current x402 payment flow for agents.

Important: this local MCP adapter does not sign x402 payments by itself. An x402-capable client or wallet must call the paid unlock endpoint and return an `unlockToken`.

### `verify_unlock_token`

Verifies a paid agent unlock token before processing.

Use `consume: false` for preflight checks.

Only use `consume: true` if you intentionally want to consume the unlock immediately.

## Official Recipes

The runner loads recipes from the local project if present. If local recipe files are absent, it falls back to:

```text
https://quokkapix.com/agent-recipes/
```

Current official recipes:

| Recipe id | Purpose | Mode | Output |
| --- | --- | --- | --- |
| `shopify_product_pack` | Shopify product photos | batch | ZIP |
| `amazon_white_background_pack` | Amazon-style white background product photos | batch | ZIP |
| `google_merchant_pack` | Google Merchant product images | batch | ZIP |
| `website_webp_compress` | Website image compression to WebP | batch | ZIP |
| `webp_compress_batch` | General WebP batch conversion and compression | batch | ZIP |
| `white_background_shadow_batch` | White background product images with soft shadow | batch | ZIP |
| `metadata_clean_batch` | Remove EXIF/GPS/camera/software metadata | batch | ZIP |
| `single_webp_compress` | Compress one image to WebP | single | image |
| `single_background_remove` | Remove background from one image | single | image |
| `single_white_background` | Create one white-background product image | single | image |
| `single_metadata_clean` | Remove metadata from one image | single | image |
| `single_watermark` | Apply a text watermark to one image | single | image |
| `images_to_pdf_batch` | Merge selected images or scans into one PDF | batch | PDF |
| `social_pack_single` | Social media sizes from one image | single | ZIP |
| `profile_avatar_pack` | Profile avatar sizes from one image | single | ZIP |
| `watermark_product_batch` | Apply watermark to product images | batch | ZIP |
| `favicon_app_icon_pack` | Generate favicon and app icon sizes | single | ZIP |

Agents should usually call `list_recipes`, choose the closest recipe, then call `process_images`.

Use `process_with_settings` when the desired workflow is not covered by a recipe.

## Install From Source

From the `mcp-runner` folder:

```bash
npm install
npx playwright install chromium
npm run check
```

Start the MCP server:

```bash
npx quokkapix-mcp
```

Direct CLI run without an MCP client:

```bash
npx quokkapix-runner --recipe website_webp_compress --input ./photo.jpg --output ./out
```

## MCP Client Configuration

Use absolute paths for `cwd`.

### Claude Desktop

Add this to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "quokkapix": {
      "command": "node",
      "args": ["src/server.mjs"],
      "cwd": "/absolute/path/to/quokkapix-mcp",
      "env": {
        "QUOKKAPIX_APP_URL": "https://quokkapix.com/#agent=1"
      }
    }
  }
}
```

### Cursor

Use the same server definition in Cursor MCP settings:

```json
{
  "mcpServers": {
    "quokkapix": {
      "command": "node",
      "args": ["src/server.mjs"],
      "cwd": "/absolute/path/to/quokkapix-mcp",
      "env": {
        "QUOKKAPIX_APP_URL": "https://quokkapix.com/#agent=1"
      }
    }
  }
}
```

### Local Development

Run QuokkaPix locally and point the runner to it:

```bash
QUOKKAPIX_APP_URL=http://127.0.0.1:4177/#agent=1 npx quokkapix-mcp
```

Override the local site root:

```bash
QUOKKAPIX_SITE_ROOT=/path/to/quokkapix-site npx quokkapix-mcp
```

Override the public recipe source:

```bash
QUOKKAPIX_RECIPE_BASE_URL=https://quokkapix.com/agent-recipes npx quokkapix-mcp
```

Override payment base URL:

```bash
QUOKKAPIX_PAYMENT_BASE_URL=https://quokkapix.com npx quokkapix-mcp
```

`appUrl` is intentionally restricted for local-file safety. By default the runner only opens:

- `https://quokkapix.com/` and `https://www.quokkapix.com/`;
- `http://127.0.0.1`, `http://localhost` and local HTTPS equivalents.

This prevents a malicious prompt or recipe from pointing the browser runner at an unrelated page and uploading local files there. For trusted development only, custom app URLs can be enabled with:

```bash
QUOKKAPIX_ALLOW_CUSTOM_APP_URL=1 npx quokkapix-mcp
```

## Example: Process Product Photos For Shopify

Tool: `process_images`

```json
{
  "recipeId": "shopify_product_pack",
  "inputFiles": [
    "/Users/me/products/photo-1.jpg",
    "/Users/me/products/photo-2.jpg"
  ],
  "outputDir": "/Users/me/products/out",
  "headless": true
}
```

Expected output:

- a ZIP file in `outputDir`;
- `quokkapix-result.json`;
- a returned `qa` report.

The tool result separates processing success from QA success:

- `processingOk: true` means QuokkaPix completed and produced an output file;
- `qaOk: true` means the output passed the recipe QA checks;
- top-level `ok` follows `qaOk`, so agents should not treat a failed QA run as fully successful.

## Example: Direct Custom Settings

Tool: `process_with_settings`

```json
{
  "settings": {
    "mode": "single",
    "tool": "compress",
    "settings": {
      "compress": {
        "format": "webp",
        "quality": 0.82,
        "targetEnabled": false
      }
    }
  },
  "settingsId": "custom-webp-compress",
  "expectedResultQa": {
    "profile": "custom-webp-compress",
    "expectedFormat": "webp"
  },
  "inputFiles": ["/Users/me/images/photo.jpg"],
  "outputDir": "/Users/me/images/out"
}
```

Use this for custom workflows that are not official recipes.

## Example: Logo Watermark Asset

Tool: `process_with_settings`

```json
{
  "settings": {
    "mode": "single",
    "tool": "watermark",
    "settings": {
      "watermark": {
        "type": "image",
        "layout": "single",
        "position": "center",
        "scalePercent": 20,
        "opacity": 0.25
      }
    }
  },
  "watermarkLogoFile": "/Users/me/brand/logo.svg",
  "inputFiles": ["/Users/me/images/photo.jpg"],
  "outputDir": "/Users/me/images/out"
}
```

## Example: Background Image Asset

Tool: `process_with_settings`

```json
{
  "settings": {
    "mode": "batch",
    "tool": "constructor",
    "steps": [
      {
        "tool": "background",
        "settings": {
          "mode": "replace",
          "replaceMode": "chroma",
          "fill": "image",
          "sourceColor": "#ffffff",
          "tolerance": 36,
          "exportFormat": "webp"
        }
      },
      {
        "tool": "compress",
        "settings": { "format": "webp", "quality": 0.82 }
      }
    ]
  },
  "backgroundImageFile": "/Users/me/backgrounds/studio.webp",
  "inputFiles": ["/Users/me/products/photo-1.jpg", "/Users/me/products/photo-2.jpg"],
  "outputDir": "/Users/me/products/out",
  "unlockToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Example: Metadata Cleanup

Tool: `process_images`

```json
{
  "recipeId": "metadata_clean_batch",
  "inputFiles": [
    "/Users/me/private/photo-1.jpg",
    "/Users/me/private/photo-2.jpg"
  ],
  "outputDir": "/Users/me/private/clean"
}
```

For batch runs, see the payment section below.

## Example: QA-Only Validation

Tool: `validate_result_manifest`

```json
{
  "recipeId": "shopify_product_pack",
  "manifest": {
    "status": "done",
    "source": {
      "count": 1,
      "totalBytes": 1000
    },
    "outputs": [
      {
        "sourceName": "photo.jpg",
        "outputName": "shopify_1.webp",
        "outputWidth": 2048,
        "outputHeight": 2048,
        "format": "webp",
        "sizeBytes": 250000,
        "warnings": []
      }
    ],
    "warnings": []
  }
}
```

The result contains:

```json
{
  "ok": true,
  "profile": "shopify-product",
  "summary": {
    "checks": 8,
    "failures": 0,
    "warnings": 0,
    "outputs": 1
  },
  "checks": []
}
```

## Result Manifest

After processing, the runner writes:

```text
quokkapix-result.json
```

The manifest is returned by:

```js
window.QuokkaPixAgent.getResultManifest()
```

It contains machine-readable local processing facts:

- `schemaVersion`;
- `status`;
- `success`;
- `tool`;
- `mode`;
- `source.count`;
- `source.totalBytes`;
- `outputs[]`;
- source/output dimensions when available;
- output file names;
- formats;
- byte sizes;
- warnings;
- `processingMs`;
- browser capabilities;
- stable `errorCode`.

The manifest does not contain image bytes.

## QA Validation

The runner validates result manifests against recipe QA contracts.

Current QA checks include:

- run status is `done`;
- source count is positive;
- source count is within recipe limit;
- outputs are present;
- expected format;
- expected width/height;
- max width/height;
- square output when required;
- max output size in KB when per-file size is available;
- output name prefix;
- required warning absence;
- ZIP entries are represented in the manifest;
- expected minimum output count for packs.

Some future visual checks are intentionally reported as metadata-only info, not as completed pixel analysis:

- white background actually white;
- product centered;
- safe margins;
- watermark visually present;
- background removal quality.

Those require a future pixel-level analyzer. The runner does not currently pretend to verify them.

## Agent Payments And x402

Human QuokkaPix UI and reward-ad flows are unchanged.

Agent payment rules apply only to agent batch or batch-scenario runs.

Current policy:

- single image agent run: free;
- single image scenario: free;
- agent batch or batch scenario up to 50 files: `0.01 USDC`;
- provider: Coinbase x402;
- payment options endpoint: `/api/agent-payment/options`;
- paid unlock endpoint: `/api/agent-unlock/coinbase-x402`;
- verify endpoint: `/api/agent-unlock/verify`;
- formal API contract: `/x402-api.md`.

The MCP runner can:

- fetch payment options;
- explain the payment flow;
- verify an unlock token;
- pass an unlock token into processing.

The MCP runner does not sign x402 payments itself. An x402-capable client or wallet must obtain the `unlockToken`.

Paid batch workflow:

1. Call `get_payment_options`.
2. Use an x402-capable client to call `/api/agent-unlock/coinbase-x402`.
3. Read `unlockToken` from the paid response.
4. Optional: call `verify_unlock_token` with `consume: false`. The adapter fetches current `/api/agent-payment/options` first and uses the live `scope`, `price` and `currency` unless you explicitly override them.
5. Call `process_images` or `process_with_settings` and pass `unlockToken`.

Example:

```json
{
  "recipeId": "shopify_product_pack",
  "inputFiles": [
    "/Users/me/products/photo-1.jpg",
    "/Users/me/products/photo-2.jpg"
  ],
  "outputDir": "/Users/me/products/out",
  "unlockToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Recommended Agent Prompt

Use this prompt in your local AI client:

```text
Use QuokkaPix only through the MCP tools. First call list_recipes unless I give exact settings. For standard product, web, metadata, social, watermark or favicon workflows, prefer process_images with an official recipe. For custom image settings, use process_with_settings. After processing, inspect qa.ok and quokkapix-result.json. If qa.ok is false, report the failing checks and do not claim the output is ready. Do not say images were uploaded to a QuokkaPix processing server.
```

## CLI

The package also exposes a direct CLI:

```bash
quokkapix-runner --recipe website_webp_compress --input ./photo.jpg --output ./out
```

Options:

```text
--recipe, --recipe-id   Official recipe id.
--input, --file         Input image path. Repeat for multiple files.
--output, --output-dir  Output directory.
--app-url               QuokkaPix URL, default https://quokkapix.com/#agent=1.
--unlock-token          Paid x402 unlock token for agent batch/scenario runs.
--headed                Show browser window.
--timeout-ms            Timeout in milliseconds.
```

The CLI currently runs recipe-based processing. For direct settings, use the MCP tool `process_with_settings`.

## Tests

Fast checks:

```bash
npm run check
```

This checks:

- syntax of MCP server files;
- recipe loading and validation;
- direct settings workflow generation;
- QA validator;
- payment helper tools;
- CLI parser.

GitHub Actions runs the same `npm run check` and `npm pack --dry-run` on pushes and pull requests.

End-to-end browser processing test against an already running QuokkaPix app:

```bash
QUOKKAPIX_E2E_APP_URL=http://127.0.0.1:4180/#agent=1 npm run test:e2e
```

The free e2e tests process one local fixture, direct custom settings and logo-watermark asset upload. Paid batch e2e tests are skipped unless real unlock tokens are supplied.

For paid e2e tests:

```bash
QUOKKAPIX_E2E_APP_URL=http://127.0.0.1:4180/#agent=1 \
QUOKKAPIX_E2E_UNLOCK_TOKENS=token1,token2,token3,token4 \
npm run test:e2e
```

The paid tests use separate tokens because unlocks are one-time consumable.

## Publication Check

Before publishing or tagging a release:

```bash
npm run check
npm pack --dry-run
```

The package whitelist includes only:

- `src/`;
- `examples/`;
- `CHANGELOG.md`;
- `LICENSE`;
- `README.md`;
- `SECURITY.md`;
- `package.json`.

`node_modules`, test artifacts and the full QuokkaPix website are not included in the npm package.

## Security And Privacy Notes

- Source image files are read from local paths by the MCP runner.
- Files are uploaded only into the local browser page through Playwright.
- QuokkaPix browser processing does not upload source images to a QuokkaPix processing server.
- The public website still cannot read arbitrary local paths.
- Payment tokens should be treated as short-lived secrets.
- Do not commit real unlock tokens, private files, or local output folders.

## Limitations

- Browser RAM is the hard limit for large batches.
- Background removal may download browser-side AI model files and depends on browser/device capability.
- WebGPU/WebNN availability depends on the user's browser and hardware.
- HEIC/AVIF/WebP support depends on browser and optional browser-side encoders.
- GIF background removal is not supported.
- Pixel-level QA for product centering, exact white background and background-removal quality is not implemented yet.
- The adapter currently uses Playwright browser automation, not a native image-processing library.

## Troubleshooting

### Playwright browser is missing

Run:

```bash
npx playwright install chromium
```

### The agent cannot find files

Use absolute local file paths. The MCP process must have permission to read them.

### Batch run says payment is required

Single image runs are free. Agent batch and batch-scenario runs may require a valid x402 unlock token.

### Browser runs out of memory

Reduce batch size, resize first, avoid very large images, or use smaller workflows. The runner cannot bypass browser RAM limits.

### QA says visual checks are metadata-only

That is expected. The current QA validator checks machine-readable metadata and declared warnings. Pixel-level visual QA is future work.

## Related QuokkaPix Agent Files

Public discovery and documentation:

- `https://quokkapix.com/agents.md`
- `https://quokkapix.com/agents.html`
- `https://quokkapix.com/llms.txt`
- `https://quokkapix.com/agent-manifest.json`
- `https://quokkapix.com/.well-known/ai-catalog.json`
- `https://quokkapix.com/agent-test.html`
- `https://quokkapix.com/mcp-runner.html`
- `https://quokkapix.com/x402-api.md`

## License

MIT. See `LICENSE`.
