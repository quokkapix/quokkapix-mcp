import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { resolveRecipe, validateRecipe } from "./recipe-store.mjs";
import { validateResultManifest } from "./qa-validator.mjs";

const DEFAULT_APP_URL = process.env.QUOKKAPIX_APP_URL || "https://quokkapix.com/#agent=1";
const CUSTOM_APP_URL_ALLOWED = process.env.QUOKKAPIX_ALLOW_CUSTOM_APP_URL === "1";

export async function processImagesWithQuokkaPix({
  recipe,
  recipeId,
  settings,
  settingsId,
  expectedResultQa,
  maxFiles: requestedMaxFiles,
  inputFiles,
  watermarkLogoFile,
  backgroundImageFile,
  outputDir,
  appUrl = DEFAULT_APP_URL,
  unlockToken = "",
  headless = true,
  timeoutMs = 180000,
  siteRoot,
} = {}) {
  const files = normalizeFiles(inputFiles);
  const assetFiles = normalizeAssetFiles({ watermarkLogoFile, backgroundImageFile });
  if (files.length === 0) {
    throw new Error("inputFiles must include at least one image path.");
  }
  if (!outputDir || !String(outputDir).trim()) {
    throw new Error("outputDir is required.");
  }
  const resolvedOutputDir = path.resolve(String(outputDir));
  const resolvedAppUrl = assertAllowedAppUrl(appUrl);
  await fs.mkdir(resolvedOutputDir, { recursive: true });

  const directSettingsMode = Boolean(settings);
  const { recipe: workflow, validation } = directSettingsMode
    ? buildWorkflowFromSettings(settings, { settingsId, expectedResultQa, maxFiles: requestedMaxFiles })
    : await resolveRecipe(recipe || recipeId, { siteRoot });
  if (!validation.valid) {
    throw new Error(`Invalid recipe: ${validation.errors.join("; ")}`);
  }
  const maxFiles = Number(workflow.requires?.maxFiles || 1);
  if (files.length > maxFiles) {
    throw new Error(`Recipe ${workflow.id} accepts up to ${maxFiles} files; got ${files.length}.`);
  }

  const browser = await chromium.launch({ headless: Boolean(headless) });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.goto(resolvedAppUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForFunction(() => Boolean(window.QuokkaPixAgent), null, { timeout: timeoutMs });
    if (directSettingsMode) {
      await page.evaluate((payload) => window.QuokkaPixAgent.applySettings(payload), workflow.applySettings);
    } else {
      await page.evaluate((selectedRecipe) => window.QuokkaPixAgent.applyRecipe(selectedRecipe), workflow);
    }

    await uploadOptionalAsset(page, "#watermarkImageInput", assetFiles.watermarkLogoFile, timeoutMs);
    await uploadOptionalAsset(page, "#backgroundImageInput", assetFiles.backgroundImageFile, timeoutMs);

    if (unlockToken) {
      await page.evaluate((token) => window.QuokkaPixAgent.setUnlockToken(token), unlockToken);
    }

    await page.locator('[data-agent="file-picker"]').setInputFiles(files);
    await page.locator('.page-shell[data-agent-status="ready"]').waitFor({ timeout: timeoutMs });

    const downloadPromise = page.waitForEvent("download", { timeout: timeoutMs });
    await page.evaluate(() => window.QuokkaPixAgent.start());
    await page
      .locator(
        '.page-shell[data-agent-status="done"], .page-shell[data-agent-status="error"], .page-shell[data-agent-status="cancelled"]',
      )
      .waitFor({ timeout: timeoutMs });

    const state = await page.evaluate(() => window.QuokkaPixAgent.getState());
    if (state.status !== "done") {
      throw new Error(state.error || state.errorCode || state.status);
    }

    const downloadLink = page
      .locator(
        '[data-agent="download-link"][data-status="ready"], [data-agent="zip-download-link"][data-status="ready"]',
      )
      .first();
    await downloadLink.click();
    const download = await downloadPromise;
    const outputName = sanitizeFileName(download.suggestedFilename() || `${workflow.id || "quokkapix"}-output`);
    const outputPath = path.join(resolvedOutputDir, outputName);
    await download.saveAs(outputPath);

    const manifest = await page.evaluate(() => window.QuokkaPixAgent.getResultManifest());
    const manifestPath = path.join(resolvedOutputDir, "quokkapix-result.json");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const qa = validateResultManifest(manifest, workflow);

    return {
      ok: qa.ok,
      processingOk: true,
      qaOk: qa.ok,
      recipeId: workflow.id,
      outputPath,
      manifestPath,
      state,
      manifest,
      qa,
      assets: {
        watermarkLogoFile: Boolean(assetFiles.watermarkLogoFile),
        backgroundImageFile: Boolean(assetFiles.backgroundImageFile),
      },
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

export function assertAllowedAppUrl(appUrl = DEFAULT_APP_URL) {
  const value = String(appUrl || DEFAULT_APP_URL);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("appUrl must be a valid URL.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const isOfficial = parsed.protocol === "https:" && (hostname === "quokkapix.com" || hostname === "www.quokkapix.com");
  const isLocalhost =
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]");

  if (!CUSTOM_APP_URL_ALLOWED && !isOfficial && !isLocalhost) {
    throw new Error(
      "Custom appUrl is blocked for safety. Use https://quokkapix.com, localhost, 127.0.0.1, or set QUOKKAPIX_ALLOW_CUSTOM_APP_URL=1 for trusted development.",
    );
  }
  return parsed.toString();
}

export function buildWorkflowFromSettings(settings, { settingsId, expectedResultQa, maxFiles } = {}) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("settings must be a QuokkaPix applySettings object.");
  }
  const mode = settings.mode === "batch" ? "batch" : "single";
  const tool = typeof settings.tool === "string" && settings.tool ? settings.tool : "custom";
  const workflow = {
    schemaVersion: "1.1",
    id: sanitizeWorkflowId(settingsId || `custom_${tool}_${mode}`),
    title: "Custom QuokkaPix settings",
    task: "Process images with a direct window.QuokkaPixAgent.applySettings payload.",
    tags: ["custom-settings", tool, mode],
    requires: {
      agentMode: true,
      localBrowserProcessing: true,
      fileUpload: "browser-file-input-or-dropzone",
      payment: mode === "batch" ? "x402 unlock required for agent batch/scenario runs" : "free for single-image agent runs",
      maxFiles: Math.max(1, Number(maxFiles || (mode === "batch" ? 50 : 1)) || 1),
    },
    applySettings: settings,
    expectedResult: {
      output: mode === "batch" ? "zip" : "single",
      manifest: "window.QuokkaPixAgent.getResultManifest()",
      qa: expectedResultQa && typeof expectedResultQa === "object" ? expectedResultQa : { profile: "custom-settings" },
      stableErrorCodes: [
        "unsupported_format",
        "memory_risk_high",
        "background_gif_not_supported",
        "browser_export_unavailable",
        "payment_required",
        "unlock_invalid",
        "processing_cancelled",
        "processing_failed",
      ],
    },
  };
  return {
    recipe: workflow,
    validation: validateRecipe(workflow),
  };
}

function normalizeFiles(inputFiles) {
  const files = Array.isArray(inputFiles) ? inputFiles : [inputFiles].filter(Boolean);
  return files.map((file) => path.resolve(String(file)));
}

function normalizeAssetFiles({ watermarkLogoFile, backgroundImageFile } = {}) {
  return {
    watermarkLogoFile: watermarkLogoFile ? path.resolve(String(watermarkLogoFile)) : "",
    backgroundImageFile: backgroundImageFile ? path.resolve(String(backgroundImageFile)) : "",
  };
}

async function uploadOptionalAsset(page, selector, filePath, timeoutMs) {
  if (!filePath) {
    return;
  }
  const locator = page.locator(selector);
  await locator.waitFor({ state: "attached", timeout: timeoutMs });
  await locator.setInputFiles(filePath);
}

function sanitizeFileName(name) {
  return String(name || "quokkapix-output")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/^\.+$/, "quokkapix-output")
    .slice(0, 180);
}

function sanitizeWorkflowId(value) {
  const id = String(value || "custom_settings")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return id || "custom_settings";
}
