import fs from "node:fs/promises";
import path from "node:path";

import { processImagesWithQuokkaPix } from "./quokkapix-browser-runner.mjs";
import { getRecipe, listRecipes, validateRecipe } from "./recipe-store.mjs";
import {
  buildQaFromRuleProfile,
  getRuleProfile,
  listRuleProfiles,
  validateRuleProfile,
} from "./rule-store.mjs";
import { validateResultManifest } from "./qa-validator.mjs";
import { processVideoWithQuokkaPix } from "./quokkapix-video-browser-runner.mjs";
import { validateVideoResultManifest } from "./video-qa-validator.mjs";
import {
  getVideoRecipe,
  getVideoRuleProfile,
  listVideoRecipes,
  listVideoRuleProfiles,
  validateVideoRecipe,
} from "./video-store.mjs";

export function createBridgeExecutor(options = {}) {
  const inputRoot = path.resolve(String(options.inputRoot || ""));
  const outputRoot = path.resolve(String(options.outputRoot || ""));
  if (!options.inputRoot) throw new Error("Bridge inputRoot is required.");
  if (!options.outputRoot) throw new Error("Bridge outputRoot is required.");

  return {
    inputRoot,
    outputRoot,
    execute: (tool, args, execution = {}) =>
      executeBridgeTool(tool, args, {
        ...options,
        inputRoot,
        outputRoot,
        ...execution,
      }),
  };
}

export async function executeBridgeTool(tool, args = {}, options = {}) {
  switch (tool) {
    case "list_recipes":
      return listRecipes();
    case "get_recipe":
      return getRecipe(requireText(args.id, "id"));
    case "validate_recipe":
      return validateRecipe(args.recipe);
    case "list_rule_profiles":
      return listRuleProfiles();
    case "get_rule_profile": {
      const ruleProfile = await getRuleProfile(requireText(args.id, "id"));
      return { ruleProfile, validation: validateRuleProfile(ruleProfile) };
    }
    case "validate_result_manifest":
      return validateBridgeResult(args);
    case "list_video_recipes":
      return listVideoRecipes();
    case "get_video_recipe":
      return getVideoRecipe(requireText(args.id, "id"));
    case "validate_video_recipe":
      return validateVideoRecipe(args.recipe);
    case "list_video_rule_profiles":
      return listVideoRuleProfiles();
    case "get_video_rule_profile":
      return getVideoRuleProfile(requireText(args.id, "id"));
    case "validate_video_result_manifest":
      return validateBridgeVideoResult(args);
    case "process_images":
    case "process_with_settings":
      return processBridgeImages(args, options);
    case "process_video":
    case "process_video_with_settings":
      return processBridgeVideo(args, options);
    default:
      throw bridgeError("unsupported-bridge-tool", `Unsupported bridge tool: ${tool}`);
  }
}

async function processBridgeVideo(args, options) {
  const inputRoot = path.resolve(String(options.inputRoot || ""));
  const outputRoot = path.resolve(String(options.outputRoot || ""));
  await fs.mkdir(outputRoot, { recursive: true });
  const inputFile = await resolveRequiredInput(inputRoot, args.inputFile, "inputFile");
  const musicFile = await resolveOptionalInput(inputRoot, args.musicFile, "musicFile");
  const requestedOutput = String(args.outputDir || `job-${sanitizeJobId(options.jobId)}`);
  const outputDir = resolveWithinRoot(outputRoot, requestedOutput, "outputDir");
  await assertOutputPathWithinRoot(outputRoot, outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  await assertExistingPathWithinRoot(outputRoot, outputDir, "outputDir");

  const result = await processVideoWithQuokkaPix({
    recipeId: args.recipeId,
    recipe: args.recipe,
    settings: args.settings,
    settingsId: args.settingsId,
    inputFile,
    musicFile,
    outputDir,
    appUrl: options.videoAppUrl,
    headless: args.headless ?? options.headless ?? true,
    timeoutMs: args.timeoutMs,
    onLifecycle: options.onLifecycle,
  });
  return redactLocalPaths(result, { inputRoot, outputRoot });
}

export function resolveWithinRoot(root, candidate, label = "path") {
  const rootPath = path.resolve(String(root || ""));
  const raw = String(candidate || "").trim();
  if (!rootPath || !raw) throw bridgeError("invalid-local-path", `${label} is required.`);
  const resolved = path.resolve(rootPath, raw);
  const relative = path.relative(rootPath, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw bridgeError("path-outside-allowed-root", `${label} must stay inside the configured bridge root.`);
  }
  return resolved;
}

async function processBridgeImages(args, options) {
  const inputRoot = path.resolve(String(options.inputRoot || ""));
  const outputRoot = path.resolve(String(options.outputRoot || ""));
  await fs.mkdir(outputRoot, { recursive: true });
  const inputFiles = await Promise.all(
    (Array.isArray(args.inputFiles) ? args.inputFiles : []).map(async (file, index) => {
      const resolved = resolveWithinRoot(inputRoot, file, `inputFiles[${index}]`);
      const stat = await fs.stat(resolved).catch(() => null);
      if (!stat?.isFile()) throw bridgeError("local-input-not-found", `Input file is not available: ${file}`);
      await assertExistingPathWithinRoot(inputRoot, resolved, `inputFiles[${index}]`);
      return resolved;
    }),
  );
  if (!inputFiles.length) throw bridgeError("local-input-required", "At least one local input file is required.");

  const watermarkLogoFile = await resolveOptionalInput(inputRoot, args.watermarkLogoFile, "watermarkLogoFile");
  const backgroundImageFile = await resolveOptionalInput(inputRoot, args.backgroundImageFile, "backgroundImageFile");
  const requestedOutput = String(args.outputDir || `job-${sanitizeJobId(options.jobId)}`);
  const outputDir = resolveWithinRoot(outputRoot, requestedOutput, "outputDir");
  await assertOutputPathWithinRoot(outputRoot, outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  await assertExistingPathWithinRoot(outputRoot, outputDir, "outputDir");

  const result = await processImagesWithQuokkaPix({
    recipeId: args.recipeId,
    recipe: args.recipe,
    settings: args.settings,
    settingsId: args.settingsId,
    expectedResultQa: args.expectedResultQa,
    maxFiles: args.maxFiles,
    inputFiles,
    watermarkLogoFile,
    backgroundImageFile,
    outputDir,
    appUrl: options.appUrl,
    unlockToken: args.unlockToken,
    headless: args.headless ?? options.headless ?? true,
    timeoutMs: args.timeoutMs,
    onLifecycle: options.onLifecycle,
    agentClient: "bridge",
  });

  return redactLocalPaths(result, { inputRoot, outputRoot });
}

async function validateBridgeResult(args) {
  const ruleProfile = args.ruleProfileId ? await getRuleProfile(args.ruleProfileId) : null;
  const selectedRecipe = args.recipe || (args.recipeId ? await getRecipe(args.recipeId) : {});
  const qa = {
    ...(selectedRecipe.expectedResult?.qa || {}),
    ...buildQaFromRuleProfile(ruleProfile),
  };
  const mergedRecipe = {
    ...selectedRecipe,
    expectedResult: { ...(selectedRecipe.expectedResult || {}), qa },
  };
  return { ...validateResultManifest(args.manifest, mergedRecipe), ruleProfile };
}

async function validateBridgeVideoResult(args) {
  const selectedRecipe = args.recipe || (args.recipeId ? await getVideoRecipe(args.recipeId) : null);
  return validateVideoResultManifest(args.manifest, selectedRecipe);
}

async function resolveRequiredInput(root, candidate, label) {
  if (!candidate) throw bridgeError("local-input-required", `${label} is required.`);
  return resolveOptionalInput(root, candidate, label);
}

async function resolveOptionalInput(root, candidate, label) {
  if (!candidate) return "";
  const resolved = resolveWithinRoot(root, candidate, label);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isFile()) throw bridgeError("local-input-not-found", `${label} is not available.`);
  await assertExistingPathWithinRoot(root, resolved, label);
  return resolved;
}

async function assertExistingPathWithinRoot(root, candidate, label) {
  const [realRoot, realCandidate] = await Promise.all([fs.realpath(root), fs.realpath(candidate)]);
  if (!isPathWithin(realRoot, realCandidate)) {
    throw bridgeError("path-outside-allowed-root", `${label} resolves outside the configured bridge root.`);
  }
}

async function assertOutputPathWithinRoot(root, candidate) {
  const realRoot = await fs.realpath(root);
  let ancestor = candidate;
  while (ancestor !== path.dirname(ancestor)) {
    const stat = await fs.lstat(ancestor).catch(() => null);
    if (stat) break;
    ancestor = path.dirname(ancestor);
  }
  const realAncestor = await fs.realpath(ancestor);
  if (!isPathWithin(realRoot, realAncestor)) {
    throw bridgeError("path-outside-allowed-root", "outputDir resolves outside the configured bridge root.");
  }
}

function isPathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function redactLocalPaths(value, roots, depth = 0) {
  if (depth > 12) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redactLocalPaths(item, roots, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    return redactPathString(value, roots);
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:unlockToken|token|secret|authorization)$/i.test(key)) continue;
    result[key] = redactLocalPaths(item, roots, depth + 1);
  }
  return result;
}

function redactPathString(value, { inputRoot, outputRoot }) {
  for (const [root, prefix] of [
    [inputRoot, "input://"],
    [outputRoot, "output://"],
  ]) {
    const relative = path.relative(root, value);
    if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      return `${prefix}${relative.split(path.sep).join("/")}`;
    }
    if (!relative && path.resolve(value) === path.resolve(root)) return prefix;
  }
  return value;
}

function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw bridgeError("invalid-bridge-argument", `${label} is required.`);
  return text;
}

function sanitizeJobId(value) {
  return String(value || "output")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 80) || "output";
}

function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
