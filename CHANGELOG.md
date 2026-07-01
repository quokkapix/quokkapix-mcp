# Changelog

## 0.3.4

- Added documentation for the expanded marketplace/social recipe set: Allegro, Newegg, Meta Catalog, Flipkart, SHEIN and Snapchat ad workflows.
- Expanded QA reports with `ruleProfile` and `checkedAgainst` fields so agents can see the exact platform profile, source type, source URL and confidence used for validation.
- Kept strict QA source-backed: unsupported platforms remain out of strict checks until a stable public source is available.

## 0.3.3

- Added sourced marketplace and social image rule profile tools: `list_rule_profiles` and `get_rule_profile`.
- Added QA support for validating result manifests against sourced rule profiles.
- Added official recipes for Etsy, eBay, Walmart, TikTok Shop, Temu, Shopee and Mercado Libre accessory workflows.
- Kept source requirements explicit: official and secondary sources are marked in the rule profiles.

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
