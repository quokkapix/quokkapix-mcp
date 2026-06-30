#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { processImagesWithQuokkaPix } from "./quokkapix-browser-runner.mjs";
import { getRecipe, listRecipes, validateRecipe } from "./recipe-store.mjs";
import { validateResultManifest } from "./qa-validator.mjs";
import {
  explainAgentPaymentFlow,
  getAgentPaymentOptions,
  verifyAgentUnlockToken,
} from "./payment-tools.mjs";

const server = new McpServer({
  name: "quokkapix-mcp",
  version: "0.3.2",
});

const localFilePathSchema = z
  .string()
  .min(1)
  .describe("Absolute or client-relative local file path readable by the MCP process. Do not pass remote URLs here.");

const outputDirSchema = z
  .string()
  .min(1)
  .describe("Local directory where the adapter writes the downloaded output and quokkapix-result.json.");

const appUrlSchema = z
  .string()
  .url()
  .optional()
  .describe(
    "Optional QuokkaPix app URL. Defaults to https://quokkapix.com/#agent=1. For safety, only quokkapix.com, localhost and 127.0.0.1 are accepted unless QUOKKAPIX_ALLOW_CUSTOM_APP_URL=1 is set.",
  );

const baseUrlSchema = z
  .string()
  .url()
  .optional()
  .describe("Optional QuokkaPix site base URL. Defaults to https://quokkapix.com.");

const workflowStepSchema = z
  .union([
    z.string().min(1).describe("Simple QuokkaPix tool id step, for example resize, background, compress or watermark."),
    z
      .object({
        tool: z
          .string()
          .min(1)
          .describe("QuokkaPix tool id for this scenario step, for example resize, background, compress or watermark."),
        settings: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Settings for this step using the same keys accepted by window.QuokkaPixAgent.applySettings."),
      })
      .describe("Structured scenario step with a tool id and per-step settings."),
  ])
  .describe("One step in a QuokkaPix scenario workflow.");

const applySettingsSchema = z
  .object({
    mode: z
      .enum(["single", "batch"])
      .optional()
      .describe("Use single for one image or batch for multiple images."),
    tool: z
      .string()
      .min(1)
      .optional()
      .describe(
        "QuokkaPix editor tool id, such as resize, crop, rotate, convert, compress, metadata, background, watermark, effects, rename, pdf, favicon or constructor.",
      ),
    steps: z
      .array(workflowStepSchema)
      .optional()
      .describe("Optional ordered scenario steps. Prefer [{ tool, settings }] for custom multi-step workflows."),
  })
  .catchall(z.unknown())
  .describe("Payload accepted by window.QuokkaPixAgent.applySettings. Extra editor-specific keys are allowed.");

const expectedResultQaSchema = z
  .object({
    expectedOutputKind: z
      .enum(["single", "batch", "zip", "pdf", "metadata-report", "icon-pack"])
      .optional()
      .describe("Expected high-level output kind for QA checks."),
    expectedFormat: z.string().optional().describe("Required output format, for example webp, jpg, png, pdf or zip."),
    allowedFormats: z.array(z.string()).optional().describe("Allowed output formats for every manifest output entry."),
    expectedMinOutputs: z.number().int().min(1).optional().describe("Minimum number of output entries expected."),
    expectedWidth: z.number().int().positive().optional().describe("Exact expected output width in pixels."),
    expectedHeight: z.number().int().positive().optional().describe("Exact expected output height in pixels."),
    maxWidth: z.number().int().positive().optional().describe("Maximum allowed output width in pixels."),
    maxHeight: z.number().int().positive().optional().describe("Maximum allowed output height in pixels."),
    minWidth: z.number().int().positive().optional().describe("Minimum recommended output width in pixels."),
    minHeight: z.number().int().positive().optional().describe("Minimum recommended output height in pixels."),
    requireSquare: z.boolean().optional().describe("Require square output dimensions when true."),
    maxOutputKB: z.number().positive().optional().describe("Recommended maximum output size per non-archive file."),
    marketplace: z
      .enum(["shopify", "amazon", "google-merchant"])
      .optional()
      .describe("Marketplace profile name used for human-readable QA context."),
    visualChecks: z
      .array(z.string())
      .optional()
      .describe("Visual checks requested by a recipe. Current validator reports these as metadata-only limitations."),
  })
  .catchall(z.unknown())
  .describe("Optional QA contract used to validate quokkapix-result.json after processing.");

const recipeSchema = z
  .object({
    id: z.string().min(1).describe("Stable recipe id, for example shopify_product_pack."),
    title: z.string().optional().describe("Human-readable recipe title."),
    description: z.string().optional().describe("Short explanation of what the recipe prepares."),
    applySettings: applySettingsSchema.describe("QuokkaPix settings applied before processing starts."),
    requires: z
      .object({
        maxFiles: z.number().int().min(1).max(50).optional().describe("Maximum files allowed by this recipe."),
        payment: z.boolean().optional().describe("Whether the recipe normally needs a paid batch/scenario unlock."),
      })
      .catchall(z.unknown())
      .optional()
      .describe("Recipe requirements such as maxFiles and payment policy."),
    expectedResult: z
      .object({
        output: z.string().optional().describe("Expected output type, for example zip, image, pdf or json."),
        qa: expectedResultQaSchema.optional().describe("Machine-readable QA checks for the result manifest."),
      })
      .catchall(z.unknown())
      .optional()
      .describe("Expected output and QA contract."),
  })
  .catchall(z.unknown())
  .describe("Custom QuokkaPix recipe object. Use validate_recipe before process_images when generating this dynamically.");

const resultOutputSchema = z
  .object({
    sourceName: z.string().optional().describe("Original input file name when available."),
    outputName: z.string().optional().describe("Output file or ZIP entry name."),
    sourceWidth: z.number().optional().describe("Original image width in pixels."),
    sourceHeight: z.number().optional().describe("Original image height in pixels."),
    outputWidth: z.number().optional().describe("Output image width in pixels."),
    outputHeight: z.number().optional().describe("Output image height in pixels."),
    format: z.string().optional().describe("Output format such as webp, jpg, png, pdf or zip."),
    sizeBytes: z.number().optional().describe("Output byte size when available."),
    warnings: z.array(z.string()).optional().describe("Warnings for this output entry."),
  })
  .catchall(z.unknown())
  .describe("One output file or ZIP entry from quokkapix-result.json.");

const resultManifestSchema = z
  .object({
    tool: z.string().optional().describe("QuokkaPix tool/workflow that produced the output."),
    mode: z.enum(["single", "batch"]).optional().describe("Run mode reported by QuokkaPix."),
    status: z.string().optional().describe("Terminal status, expected to be done for a successful run."),
    success: z.boolean().optional().describe("Whether QuokkaPix considered the run successful."),
    source: z
      .object({
        count: z.number().optional().describe("Number of source files."),
        totalBytes: z.number().optional().describe("Total input bytes when available."),
      })
      .catchall(z.unknown())
      .optional()
      .describe("Source file summary."),
    outputs: z.array(resultOutputSchema).optional().describe("Detailed output entries."),
    processingMs: z.number().optional().describe("Processing time in milliseconds when available."),
    warnings: z.array(z.string()).optional().describe("Run-level warnings."),
    errorCode: z.string().nullable().optional().describe("Stable error code when the run failed or was cancelled."),
  })
  .catchall(z.unknown())
  .describe("QuokkaPix result manifest returned by getResultManifest() or saved as quokkapix-result.json.");

server.registerTool(
  "list_recipes",
  {
    title: "List QuokkaPix image recipes",
    description:
      "List official QuokkaPix local/browser image workflow recipes. Use this first when an agent needs a supported workflow for Shopify, Amazon, Google Merchant, WebP compression, metadata cleanup, social packs, watermarking, favicon generation or similar repeatable image tasks. Returns ids that can be passed to get_recipe or process_images.",
    inputSchema: {},
  },
  async () => jsonResult(await listRecipes()),
);

server.registerTool(
  "get_recipe",
  {
    title: "Get QuokkaPix image recipe",
    description:
      "Return one official QuokkaPix recipe by id. Use this before process_images when the agent needs exact applySettings, max file limits, payment expectations and expected result QA checks. This tool does not process images.",
    inputSchema: {
      id: z
        .string()
        .min(1)
        .describe("Recipe id from list_recipes, for example shopify_product_pack, amazon_product_batch or metadata_clean_batch."),
    },
  },
  async ({ id }) => jsonResult(await getRecipe(id)),
);

server.registerTool(
  "validate_recipe",
  {
    title: "Validate QuokkaPix image recipe",
    description:
      "Validate a custom QuokkaPix recipe before using process_images. Use this when an agent generated its own recipe JSON and needs to confirm that id, applySettings.mode, applySettings.tool, optional structured steps and requires.maxFiles are valid. This is a preflight check only and does not open a browser or process files.",
    inputSchema: {
      recipe: recipeSchema,
    },
  },
  async ({ recipe }) => jsonResult(validateRecipe(recipe)),
);

server.registerTool(
  "validate_result_manifest",
  {
    title: "Validate QuokkaPix result manifest",
    description:
      "Validate an existing quokkapix-result.json manifest against an official recipe or custom QA contract. Use this after process_images/process_with_settings or when inspecting a previous run. It checks status, file counts, formats, dimensions, size limits, ZIP entry metadata and marketplace QA metadata; it does not read image pixels or upload files.",
    inputSchema: {
      recipeId: z
        .string()
        .min(1)
        .optional()
        .describe("Optional official recipe id whose expectedResult.qa contract should be used."),
      recipe: recipeSchema.optional().describe("Optional custom recipe with expectedResult.qa. Used instead of recipeId when provided."),
      manifest: resultManifestSchema,
    },
  },
  async ({ recipeId, recipe, manifest }) => {
    const selectedRecipe = recipe || (recipeId ? await getRecipe(recipeId) : {});
    return jsonResult(validateResultManifest(manifest, selectedRecipe));
  },
);

server.registerTool(
  "process_images",
  {
    title: "Process local images with QuokkaPix",
    description:
      "Process local image files through the QuokkaPix browser app using an official recipeId or a full custom recipe. The adapter opens local Chromium, applies settings, uploads files through the browser file input, starts processing, downloads the output and writes quokkapix-result.json. Source images stay in the local browser workflow and are not sent to a QuokkaPix processing API. Single-image runs and small batches up to 5 files are free; use unlockToken for larger paid batch/scenario runs.",
    inputSchema: {
      recipeId: z
        .string()
        .min(1)
        .optional()
        .describe("Official recipe id from list_recipes. Provide either recipeId or recipe."),
      recipe: recipeSchema.optional().describe("Custom recipe object. Provide either recipeId or recipe."),
      inputFiles: z
        .array(localFilePathSchema)
        .min(1)
        .describe("Local source image files to upload through the browser file input. Agent batches up to 5 files are free; the paid batch limit is 50."),
      watermarkLogoFile: localFilePathSchema
        .optional()
        .describe("Optional local logo/image file for QuokkaPix logo watermark workflows."),
      backgroundImageFile: localFilePathSchema
        .optional()
        .describe("Optional local image file for QuokkaPix background replacement workflows."),
      outputDir: outputDirSchema,
      appUrl: appUrlSchema,
      unlockToken: z
        .string()
        .optional()
        .describe("Optional x402 unlock token for paid agent batch/scenario runs above 5 files. Obtain it outside this adapter."),
      headless: z.boolean().optional().describe("Run Chromium headless. Defaults to true unless debugging."),
      timeoutMs: z
        .number()
        .int()
        .min(10000)
        .max(600000)
        .optional()
        .describe("Maximum processing timeout in milliseconds. Use a larger value for background AI or large batches."),
    },
  },
  async (input) => jsonResult(await processImagesWithQuokkaPix(input)),
);

server.registerTool(
  "process_with_settings",
  {
    title: "Process local images with direct QuokkaPix settings",
    description:
      "Process local image files with a direct window.QuokkaPixAgent.applySettings payload instead of an official recipe. Use this for custom resize/crop/convert/compress/background/watermark/effects/rename/PDF/favicon/scenario workflows. For multi-step scenarios, prefer settings.steps as [{ tool, settings }]. The adapter downloads the output, writes quokkapix-result.json and returns QA results.",
    inputSchema: {
      settings: applySettingsSchema,
      settingsId: z
        .string()
        .min(1)
        .optional()
        .describe("Optional id/name for this generated settings workflow, used in returned metadata and QA profile."),
      expectedResultQa: expectedResultQaSchema.optional(),
      maxFiles: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum allowed input files for this direct settings run. Defaults to the selected files count."),
      inputFiles: z
        .array(localFilePathSchema)
        .min(1)
        .describe("Local source image files to upload through the browser file input."),
      watermarkLogoFile: localFilePathSchema
        .optional()
        .describe("Optional local logo/image file for logo watermark settings."),
      backgroundImageFile: localFilePathSchema
        .optional()
        .describe("Optional local image file for background replacement settings."),
      outputDir: outputDirSchema,
      appUrl: appUrlSchema,
      unlockToken: z
        .string()
        .optional()
        .describe("Optional x402 unlock token for paid agent batch/scenario runs above 5 files."),
      headless: z.boolean().optional().describe("Run Chromium headless. Defaults to true unless debugging."),
      timeoutMs: z
        .number()
        .int()
        .min(10000)
        .max(600000)
        .optional()
        .describe("Maximum processing timeout in milliseconds."),
    },
  },
  async (input) => jsonResult(await processImagesWithQuokkaPix(input)),
);

server.registerTool(
  "get_payment_options",
  {
    title: "Get QuokkaPix agent payment options",
    description:
      "Fetch live QuokkaPix agent payment options. Use this before any paid batch/scenario run to discover current price, currency, free single-image and small-batch rules, x402 endpoint URLs, verify endpoint and refund notes. This tool does not sign, submit or consume a payment.",
    inputSchema: {
      baseUrl: baseUrlSchema,
    },
  },
  async (input = {}) => jsonResult(await getAgentPaymentOptions(input)),
);

server.registerTool(
  "explain_payment_flow",
  {
    title: "Explain QuokkaPix x402 payment flow",
    description:
      "Explain the current QuokkaPix x402 workflow for agents. Use this when a client needs step-by-step guidance for paid batches above the free limit: get payment options, have an x402-capable wallet/client call the paid unlock endpoint, pass unlockToken to process_images/process_with_settings, optionally verify the token, then process. This adapter can use a token but cannot sign x402 payments itself.",
    inputSchema: {
      baseUrl: baseUrlSchema,
    },
  },
  async (input = {}) => jsonResult(explainAgentPaymentFlow(input)),
);

server.registerTool(
  "verify_unlock_token",
  {
    title: "Verify QuokkaPix agent unlock token",
    description:
      "Verify a QuokkaPix paid agent unlock token before processing. Use consume=false for safe preflight checks. Use consume=true only immediately before a paid batch/scenario run above the free limit when you intentionally want to consume the unlock. If scope, price or currency are omitted, the tool reads live payment options first.",
    inputSchema: {
      token: z.string().min(16).describe("Unlock token returned by the paid x402 unlock endpoint."),
      baseUrl: baseUrlSchema,
      scope: z.string().optional().describe("Expected QuokkaPix scope. Defaults to live payment options."),
      price: z.string().optional().describe("Expected price string. Defaults to live payment options."),
      currency: z.string().optional().describe("Expected currency. Defaults to live payment options."),
      mode: z
        .enum(["single", "batch", "scenario"])
        .optional()
        .describe("Run mode to verify against the unlock token."),
      files: z.number().int().min(1).max(50).optional().describe("Number of files intended for the paid run."),
      consume: z
        .boolean()
        .optional()
        .describe("False for preflight verification. True consumes the unlock and should be used only at run start."),
    },
  },
  async (input) => jsonResult(await verifyAgentUnlockToken(input)),
);

const transport = new StdioServerTransport();
await server.connect(transport);

function jsonResult(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
