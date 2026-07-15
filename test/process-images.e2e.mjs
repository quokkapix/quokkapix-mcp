import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { processImagesWithQuokkaPix } from "../src/quokkapix-browser-runner.mjs";

const appUrl = process.env.QUOKKAPIX_E2E_APP_URL;
const paidTokens = String(process.env.QUOKKAPIX_E2E_UNLOCK_TOKENS || process.env.QUOKKAPIX_E2E_UNLOCK_TOKEN || "")
  .split(",")
  .map((token) => token.trim())
  .filter(Boolean);

test("MCP runner processes one image through QuokkaPix browser workflow", { skip: !appUrl }, async () => {
  const root = path.resolve("..");
  const inputFile = path.join(root, "automation", "fixtures", "photo-landscape.png");
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-mcp-e2e-"));
  const result = await processImagesWithQuokkaPix({
    recipeId: "social_pack_single",
    inputFiles: [inputFile],
    outputDir,
    appUrl,
    timeoutMs: 180000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.recipeId, "social_pack_single");
  assert.equal(result.state.status, "done");
  assert.equal(result.manifest.status, "done");
  assert.equal(result.qa.ok, true);
  assert.ok(result.qa.summary.checks > 0);
  assert.ok(result.manifest.outputs.length >= 1);
  assert.ok((await fs.stat(result.outputPath)).size > 0);
  assert.ok((await fs.stat(result.manifestPath)).size > 0);

  const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
  assert.equal(manifest.status, "done");
  assert.ok(manifest.outputs[0].sizeBytes > 0);
});

test("MCP runner processes direct custom settings through applySettings", { skip: !appUrl }, async () => {
  const root = path.resolve("..");
  const inputFile = path.join(root, "automation", "fixtures", "photo-landscape.png");
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-mcp-settings-e2e-"));
  const result = await processImagesWithQuokkaPix({
    settings: {
      mode: "single",
      tool: "compress",
      settings: {
        compress: {
          format: "webp",
          quality: 0.8,
          targetEnabled: false,
        },
      },
    },
    settingsId: "e2e-custom-webp",
    expectedResultQa: {
      profile: "e2e-custom-webp",
      expectedFormat: "webp",
    },
    inputFiles: [inputFile],
    outputDir,
    appUrl,
    timeoutMs: 180000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.recipeId, "e2e-custom-webp");
  assert.equal(result.state.status, "done");
  assert.equal(result.manifest.status, "done");
  assert.equal(result.qa.ok, true);
  assert.equal(result.manifest.outputs[0].format, "webp");
  assert.ok((await fs.stat(result.outputPath)).size > 0);
});

test("MCP runner processes a logo watermark asset file", { skip: !appUrl }, async () => {
  const root = path.resolve("..");
  const inputFile = path.join(root, "automation", "fixtures", "photo-landscape.png");
  const logoFile = path.join(root, "automation", "fixtures", "vector.svg");
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-mcp-logo-watermark-e2e-"));
  const result = await processImagesWithQuokkaPix({
    settings: {
      mode: "single",
      tool: "watermark",
      settings: {
        watermark: {
          type: "image",
          layout: "single",
          position: "center",
          scalePercent: 20,
          opacity: 0.25,
        },
      },
    },
    settingsId: "e2e-logo-watermark",
    expectedResultQa: {
      profile: "e2e-logo-watermark",
    },
    inputFiles: [inputFile],
    watermarkLogoFile: logoFile,
    outputDir,
    appUrl,
    timeoutMs: 180000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.assets.watermarkLogoFile, true);
  assert.equal(result.state.status, "done");
  assert.equal(result.manifest.status, "done");
  assert.ok((await fs.stat(result.outputPath)).size > 0);
});

test(
  "MCP runner can execute paid background image batch when a real x402 unlock token is provided",
  { skip: !appUrl || !paidTokens[3] },
  async () => {
    const root = path.resolve("..");
    const inputFiles = [
      path.join(root, "automation", "fixtures", "photo-landscape.png"),
      path.join(root, "automation", "fixtures", "photo-portrait.jpg"),
    ];
    const backgroundImageFile = path.join(root, "automation", "fixtures", "photo-square.webp");
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-mcp-background-image-batch-e2e-"));
    const result = await processImagesWithQuokkaPix({
      settings: {
        mode: "batch",
        tool: "constructor",
        steps: [
          {
            tool: "background",
            settings: {
              mode: "replace",
              replaceMode: "chroma",
              fill: "image",
              sourceColor: "#ffffff",
              tolerance: 36,
              exportFormat: "webp",
            },
          },
          {
            tool: "compress",
            settings: {
              format: "webp",
              quality: 0.82,
              targetEnabled: false,
            },
          },
        ],
      },
      settingsId: "e2e-background-image-batch",
      expectedResultQa: {
        profile: "e2e-background-image-batch",
        expectedFormat: "webp",
      },
      maxFiles: 50,
      inputFiles,
      backgroundImageFile,
      outputDir,
      appUrl,
      unlockToken: paidTokens[3],
      timeoutMs: 240000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.assets.backgroundImageFile, true);
    assert.equal(result.manifest.mode, "batch");
    assert.equal(result.manifest.status, "done");
    assert.ok(result.manifest.outputs.length >= 2);
    assert.ok((await fs.stat(result.outputPath)).size > 0);
  },
);

test(
  "MCP runner can execute a paid batch when a real x402 unlock token is provided",
  { skip: !appUrl || !paidTokens[0] },
  async () => {
    const root = path.resolve("..");
    const inputFiles = [
      path.join(root, "automation", "fixtures", "photo-landscape.png"),
      path.join(root, "automation", "fixtures", "photo-portrait.jpg"),
    ];
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-mcp-paid-batch-e2e-"));
    const result = await processImagesWithQuokkaPix({
      recipeId: "website_webp_compress",
      inputFiles,
      outputDir,
      appUrl,
      unlockToken: paidTokens[0],
      timeoutMs: 240000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.manifest.mode, "batch");
    assert.equal(result.manifest.status, "done");
    assert.ok(result.manifest.outputs.length >= 2);
    assert.ok((await fs.stat(result.outputPath)).size > 0);
  },
);

test(
  "MCP runner can execute paid metadata batch when a real x402 unlock token is provided",
  { skip: !appUrl || !paidTokens[1] },
  async () => {
    const root = path.resolve("..");
    const inputFiles = [
      path.join(root, "automation", "fixtures", "photo-with-metadata.jpg"),
      path.join(root, "automation", "fixtures", "photo-portrait.jpg"),
    ];
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-mcp-metadata-batch-e2e-"));
    const result = await processImagesWithQuokkaPix({
      recipeId: "metadata_clean_batch",
      inputFiles,
      outputDir,
      appUrl,
      unlockToken: paidTokens[1],
      timeoutMs: 240000,
    });
    assert.equal(result.ok, true);
    assert.equal(result.manifest.tool, "metadata");
    assert.equal(result.manifest.mode, "batch");
    assert.ok(result.manifest.outputs.length >= 2);
  },
);

test(
  "MCP runner can execute paid watermark scenario batch when a real x402 unlock token is provided",
  { skip: !appUrl || !paidTokens[2] },
  async () => {
    const root = path.resolve("..");
    const inputFiles = [
      path.join(root, "automation", "fixtures", "photo-landscape.png"),
      path.join(root, "automation", "fixtures", "photo-square.webp"),
    ];
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-mcp-watermark-batch-e2e-"));
    const result = await processImagesWithQuokkaPix({
      recipeId: "watermark_product_batch",
      inputFiles,
      outputDir,
      appUrl,
      unlockToken: paidTokens[2],
      timeoutMs: 240000,
    });
    assert.equal(result.ok, true);
    assert.equal(result.manifest.mode, "batch");
    assert.ok(result.manifest.outputs.length >= 2);
  },
);

test(
  "MCP runner rejects a paid batch with an invalid unlock token",
  { skip: !appUrl },
  async () => {
    const root = path.resolve("..");
    const inputFiles = [
      path.join(root, "automation", "fixtures", "photo-landscape.png"),
      path.join(root, "automation", "fixtures", "photo-portrait.jpg"),
    ];
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-mcp-invalid-token-e2e-"));
    await assert.rejects(
      () =>
        processImagesWithQuokkaPix({
          recipeId: "website_webp_compress",
          inputFiles,
          outputDir,
          appUrl,
          unlockToken: "invalid-token",
          timeoutMs: 90000,
        }),
      /unlock|token|payment|required|blocked|error/i,
    );
  },
);
