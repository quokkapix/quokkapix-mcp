# Changelog

## 0.6.0

- Added Video recipe, rule, QA and processing tools to the OAuth-protected remote MCP endpoint.
- Extended the cloud-to-local bridge to execute `process_video` and `process_video_with_settings` while keeping source, music and output bytes on the paired device.
- Added Video capability negotiation so the control plane rejects incompatible older bridge clients with an explicit upgrade response.
- Added a dedicated Video Editor URL override and safe relative-path handling for source video, optional music and output directories.
- Kept `bridge:execute` as the single execution permission and updated its consent language to cover both Image and Video.
- Increased the configurable bridge-job ceiling to one hour for longer local video and transcription work.
- Updated public agent contracts and MCP documentation for one Image + Video remote bridge.

## 0.5.0

- Added local MCP processing for the QuokkaPix Video surface without changing existing Image tools.
- Added Video recipe and sourced-rule discovery, custom Video settings, local result saving and `quokkapix-video-result.json` validation.
- Added support for local music inputs and TXT/SRT/VTT transcript outputs.
- Kept remote MCP and bridge execution Image-only until the separate remote Video phase.
- Repositioned package documentation around one QuokkaPix service with Image and Video browser surfaces.

## 0.4.3

- Updated vulnerable transitive URL, request-parsing and network-address dependencies before npm publication.

## 0.4.2

- Make `verify_unlock_token` preflight-only so an unlock cannot be consumed before browser processing starts.
- Tag browser processing telemetry as local MCP or remote bridge usage.
- Reject already-consumed unlocks during all preflight checks.

## 0.4.1

- Hardened remote bridge job leases, idempotent starts and completion reporting across transient network failures.
- Added bounded MCP sessions, per-device job queues, OAuth registrations, pending devices and refresh grants.
- Added large metadata-result support for 50-file batches without adding an image upload route.
- Reduced control-plane disk writes by keeping bridge heartbeat timestamps in memory.
- Restricted browser pairing links to the configured control-plane origin.
- Expanded security tests for origin checks, one-time pairing, secret persistence, session limits, queue limits and large results.

## 0.4.0

- Added `quokkapix-mcp bridge` as an additive cloud-to-local mode while preserving the existing stdio server.
- Added OAuth/PKCE remote MCP pairing, explicit input/output roots and path traversal protection.
- Added read/execute scope separation, symlink escape checks and remote device revocation through `--reset`.
- Added local bridge execution for the existing recipe, direct-settings, rule and QA tools without relaying image bytes.
- Added remote bridge status and one-time x402 unlock staging; the local browser remains responsible for consumption at processing start.
- Updated the MCP SDK and security-sensitive transitive dependencies.

## 0.3.6

- Report unsupported custom visual QA checks as warnings instead of silently ignoring them.
- Clarified pixel-level QA messages so agents can distinguish recipe composition requirements from background-removal success.
- Kept semantic checks such as watermark/text detection unclaimed unless a measurable signal exists.
- Relaxed recipe-store tests so standalone CI does not fail on unreleased public recipe wording while still enforcing the free small-batch and x402 policy.

## 0.3.5

- Added `message` and `remediation` fields to QA checks so agents can explain what failed and how to fix it.
- Kept the existing QA schema compatible: `qa.ok`, `qa.summary`, `qa.checks[]`, `ruleProfile` and `checkedAgainst` are unchanged.

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
