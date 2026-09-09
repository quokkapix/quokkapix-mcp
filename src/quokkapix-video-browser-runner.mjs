import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { assertAllowedAppUrl } from "./quokkapix-browser-runner.mjs";
import { getVideoRecipe, validateVideoRecipe } from "./video-store.mjs";
import { validateVideoResultManifest } from "./video-qa-validator.mjs";

const DEFAULT_VIDEO_APP_URL = process.env.QUOKKAPIX_VIDEO_APP_URL || "https://video.quokkapix.com/#agent=1";

export async function processVideoWithQuokkaPix({ recipe, recipeId, settings, settingsId, inputFile, musicFile, outputDir, appUrl = DEFAULT_VIDEO_APP_URL, headless = true, timeoutMs = 600000, siteRoot, onLifecycle } = {}) {
  if (!inputFile) throw new Error("inputFile is required.");
  if (!outputDir || !String(outputDir).trim()) throw new Error("outputDir is required.");
  const sourcePath = path.resolve(String(inputFile));
  const musicPath = musicFile ? path.resolve(String(musicFile)) : "";
  const resolvedOutputDir = path.resolve(String(outputDir));
  await fs.mkdir(resolvedOutputDir, { recursive: true });

  const workflow = settings
    ? { schemaVersion: "1.0", id: sanitizeId(settingsId || `custom_${settings.tool || "video"}`), settings, expectedResult: { status: "done", localOnly: true } }
    : recipe || await getVideoRecipe(recipeId, { siteRoot });
  const validation = validateVideoRecipe(workflow);
  if (!validation.valid) throw new Error(`Invalid Video recipe: ${validation.errors.join("; ")}`);

  const browser = await chromium.launch({ headless: Boolean(headless) });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    await lifecycle(onLifecycle, "browser_opening", { surface: "video", appUrl });
    await page.goto(withAgentClient(assertAllowedAppUrl(appUrl)), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForFunction(() => Boolean(window.QuokkaPixVideoAgent), null, { timeout: timeoutMs });
    await page.evaluate((selected) => window.QuokkaPixVideoAgent.applyRecipe(selected), workflow);
    await page.locator('[data-agent="file-picker"]').setInputFiles(sourcePath);
    await page.locator('.page-shell[data-agent-status="ready"]').waitFor({ timeout: timeoutMs });

    if (musicPath) {
      const musicPicker = page.locator('[data-agent="music-file-picker"]');
      await musicPicker.waitFor({ state: "attached", timeout: timeoutMs });
      await musicPicker.setInputFiles(musicPath);
      await page.waitForFunction(() => window.QuokkaPixVideoAgent.getState().settings?.audio?.musicLoaded === true, null, { timeout: timeoutMs });
    }

    await lifecycle(onLifecycle, "files_ready", { surface: "video", files: 1, musicFile: Boolean(musicPath) });
    await lifecycle(onLifecycle, "processing_started", { surface: "video", tool: workflow.settings?.tool || null });
    await startAndWait(page, timeoutMs);
    let manifest = await page.evaluate(() => window.QuokkaPixVideoAgent.getResultManifest());
    if (workflow.settings?.tool === "transcribe" && workflow.settings?.transcribe?.burn?.enabled && manifest.outputKind === "transcript") {
      await startAndWait(page, timeoutMs);
      manifest = await page.evaluate(() => window.QuokkaPixVideoAgent.getResultManifest());
    }
    if (manifest.status !== "done") throw new Error(manifest.error || manifest.errorCode || manifest.status);

    const outputPath = manifest.outputKind === "transcript"
      ? await saveTranscript(manifest, workflow, resolvedOutputDir)
      : await saveDownload(page, workflow.id, resolvedOutputDir, timeoutMs);
    const manifestPath = path.join(resolvedOutputDir, "quokkapix-video-result.json");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const qa = validateVideoResultManifest(manifest, workflow);
    return { ok: qa.ok, processingOk: true, qaOk: qa.ok, surface: "video", recipeId: workflow.id, outputPath, manifestPath, state: await page.evaluate(() => window.QuokkaPixVideoAgent.getState()), manifest, qa, assets: { musicFile: Boolean(musicPath) } };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function startAndWait(page, timeoutMs) {
  await page.evaluate(() => { void Promise.resolve(window.QuokkaPixVideoAgent.start()).catch(() => {}); });
  await page.waitForFunction(() => window.QuokkaPixVideoAgent.getState().status === "processing", null, { timeout: timeoutMs }).catch(() => {});
  await page.locator('.page-shell[data-agent-status="done"], .page-shell[data-agent-status="error"], .page-shell[data-agent-status="cancelled"]').waitFor({ timeout: timeoutMs });
}

async function saveDownload(page, fallbackId, outputDir, timeoutMs) {
  const link = page.locator('[data-agent="download-link"][data-status="ready"]').first();
  await link.waitFor({ state: "attached", timeout: timeoutMs });
  const href = await link.getAttribute("href");
  const name = sanitizeFileName((await link.getAttribute("download")) || `${fallbackId}-output`);
  const outputPath = path.join(outputDir, name);
  if (href?.startsWith("blob:") || href?.startsWith("data:")) {
    const bytes = await page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), href);
    await fs.writeFile(outputPath, Buffer.from(bytes));
  } else {
    const event = page.waitForEvent("download", { timeout: timeoutMs });
    await link.click();
    await (await event).saveAs(outputPath);
  }
  return outputPath;
}

async function saveTranscript(manifest, workflow, outputDir) {
  const format = workflow.settings?.transcribe?.preferredFormat || "srt";
  const segments = manifest.transcript?.segments || [];
  const content = format === "txt" ? segments.map((item) => item.text).join("\n") : format === "srt" ? segments.map((item, index) => `${index + 1}\n${stamp(item.start, ",")} --> ${stamp(item.end, ",")}\n${item.text}\n`).join("\n") : `WEBVTT\n\n${segments.map((item) => `${stamp(item.start, ".")} --> ${stamp(item.end, ".")}\n${item.text}\n`).join("\n")}`;
  const base = sanitizeFileName(manifest.source?.name?.replace(/\.[^.]+$/, "") || workflow.id);
  const outputPath = path.join(outputDir, `${base}-transcript.${format}`);
  await fs.writeFile(outputPath, content, "utf8");
  return outputPath;
}

function stamp(seconds, separator) {
  const total = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  return `${String(Math.floor(total / 3600000)).padStart(2, "0")}:${String(Math.floor((total % 3600000) / 60000)).padStart(2, "0")}:${String(Math.floor((total % 60000) / 1000)).padStart(2, "0")}${separator}${String(total % 1000).padStart(3, "0")}`;
}

function withAgentClient(value) { const url = new URL(value); const params = new URLSearchParams(url.hash.slice(1)); params.set("agent", "1"); params.set("agent-client", "local-mcp"); url.hash = params.toString(); return url.toString(); }
function sanitizeId(value) { return String(value || "custom_video").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "custom_video"; }
function sanitizeFileName(value) { return String(value || "quokkapix-video-output").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/^\.+$/, "quokkapix-video-output").slice(0, 180); }
async function lifecycle(handler, event, detail) { if (typeof handler !== "function") return; try { await handler(event, detail); } catch { /* Reporting must not interrupt local processing. */ } }
