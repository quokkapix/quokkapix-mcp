# Changelog

## 0.3.2

- Documented the live QuokkaPix agent payment policy: single-image runs, single-image scenarios and small batches up to 5 files are free; larger agent batch/scenario runs use x402 unlock.
- Clarified MCP tool descriptions so agents know when `unlockToken` is needed.
- Updated Claude/Cursor/local MCP setup examples to use the published `npx -y quokkapix-mcp` package.

## 0.3.1

- Improved MCP tool descriptions and parameter schemas for Glama/agent introspection.
- Documented local file, app URL, QA, recipe, payment and scenario parameters directly in the MCP tool schemas.
- Kept tool names and runtime behavior compatible with 0.3.0.

## 0.3.0

- Added more official QuokkaPix recipes for WebP batch compression, white-background product batches, images-to-PDF and avatar packs.
- Strengthened QA validation with output kind, allowed format, minimum dimension and required output-name checks.
- Kept the local runner safety model: source files are uploaded only into an allowlisted QuokkaPix browser page or trusted localhost app URL.
- Included package publication metadata, security notes and CI validation.

## 0.2.1

- Added direct `process_with_settings` support for full `window.QuokkaPixAgent.applySettings` payloads.
- Added optional `watermarkLogoFile` and `backgroundImageFile` asset uploads.
- Added x402 payment helper tools and QA-aware runner result fields.
