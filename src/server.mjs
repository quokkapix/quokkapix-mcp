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
  version: "0.3.0",
});

server.registerTool(
  "list_recipes",
  {
    title: "List QuokkaPix image recipes",
    description:
      "List official QuokkaPix local/browser image workflow recipes such as Shopify product pack, Amazon white background pack, WebP compression and metadata cleanup.",
    inputSchema: {},
  },
  async () => jsonResult(await listRecipes()),
);

server.registerTool(
  "get_recipe",
  {
    title: "Get QuokkaPix image recipe",
    description:
      "Return one QuokkaPix recipe by id, including applySettings JSON and expected result contract.",
    inputSchema: {
      id: z.string().min(1),
    },
  },
  async ({ id }) => jsonResult(await getRecipe(id)),
);

server.registerTool(
  "validate_recipe",
  {
    title: "Validate QuokkaPix image recipe",
    description:
      "Validate a custom QuokkaPix recipe object before applying it to browser-local image processing.",
    inputSchema: {
      recipe: z.record(z.string(), z.unknown()),
    },
  },
  async ({ recipe }) => jsonResult(validateRecipe(recipe)),
);

server.registerTool(
  "validate_result_manifest",
  {
    title: "Validate QuokkaPix result manifest",
    description:
      "Validate a QuokkaPix result manifest against an official recipe or custom recipe QA contract. Returns machine-readable failures and warnings for agents.",
    inputSchema: {
      recipeId: z.string().min(1).optional(),
      recipe: z.record(z.string(), z.unknown()).optional(),
      manifest: z.record(z.string(), z.unknown()),
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
      "Open QuokkaPix in a local browser, apply an official recipe id or custom recipe JSON, upload local image files through the browser file input, download the result and write quokkapix-result.json. Source images are not uploaded to a QuokkaPix processing server.",
    inputSchema: {
      recipeId: z.string().min(1).optional(),
      recipe: z.record(z.string(), z.unknown()).optional(),
      inputFiles: z.array(z.string().min(1)).min(1),
      watermarkLogoFile: z.string().min(1).optional(),
      backgroundImageFile: z.string().min(1).optional(),
      outputDir: z.string().min(1),
      appUrl: z.string().url().optional(),
      unlockToken: z.string().optional(),
      headless: z.boolean().optional(),
      timeoutMs: z.number().int().min(10000).max(600000).optional(),
    },
  },
  async (input) => jsonResult(await processImagesWithQuokkaPix(input)),
);

server.registerTool(
  "process_with_settings",
  {
    title: "Process local images with direct QuokkaPix settings",
    description:
      "Open QuokkaPix in a local browser, apply the same settings payload accepted by window.QuokkaPixAgent.applySettings, upload local image files, download the result and write quokkapix-result.json. Use this when an agent wants the full editor surface without wrapping settings in an official recipe.",
    inputSchema: {
      settings: z.record(z.string(), z.unknown()),
      settingsId: z.string().min(1).optional(),
      expectedResultQa: z.record(z.string(), z.unknown()).optional(),
      maxFiles: z.number().int().min(1).max(50).optional(),
      inputFiles: z.array(z.string().min(1)).min(1),
      watermarkLogoFile: z.string().min(1).optional(),
      backgroundImageFile: z.string().min(1).optional(),
      outputDir: z.string().min(1),
      appUrl: z.string().url().optional(),
      unlockToken: z.string().optional(),
      headless: z.boolean().optional(),
      timeoutMs: z.number().int().min(10000).max(600000).optional(),
    },
  },
  async (input) => jsonResult(await processImagesWithQuokkaPix(input)),
);

server.registerTool(
  "get_payment_options",
  {
    title: "Get QuokkaPix agent payment options",
    description:
      "Fetch QuokkaPix agent payment options, including price, currency, free single-image rules and x402 unlock endpoints. This does not perform payment.",
    inputSchema: {
      baseUrl: z.string().url().optional(),
    },
  },
  async (input = {}) => jsonResult(await getAgentPaymentOptions(input)),
);

server.registerTool(
  "explain_payment_flow",
  {
    title: "Explain QuokkaPix x402 payment flow",
    description:
      "Return the exact agent payment workflow. The local MCP adapter can use an unlock token but cannot sign x402 payment by itself; an x402-capable client or wallet must obtain the token.",
    inputSchema: {
      baseUrl: z.string().url().optional(),
    },
  },
  async (input = {}) => jsonResult(explainAgentPaymentFlow(input)),
);

server.registerTool(
  "verify_unlock_token",
  {
    title: "Verify QuokkaPix agent unlock token",
    description:
      "Verify a paid QuokkaPix x402 unlock token without processing images. Use consume=false for preflight checks. Only consume=true immediately before a paid batch run if you intentionally want to consume the unlock.",
    inputSchema: {
      token: z.string().min(16),
      baseUrl: z.string().url().optional(),
      scope: z.string().optional(),
      price: z.string().optional(),
      currency: z.string().optional(),
      mode: z.string().optional(),
      files: z.number().int().min(1).max(50).optional(),
      consume: z.boolean().optional(),
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
