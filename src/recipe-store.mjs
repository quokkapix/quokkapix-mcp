import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runnerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSiteRoot = path.resolve(runnerRoot, "..");
const DEFAULT_RECIPE_BASE_URL = "https://quokkapix.com/agent-recipes";

export function getSiteRoot() {
  return path.resolve(process.env.QUOKKAPIX_SITE_ROOT || defaultSiteRoot);
}

export function getRecipeBaseUrl() {
  return String(process.env.QUOKKAPIX_RECIPE_BASE_URL || DEFAULT_RECIPE_BASE_URL).replace(/\/+$/, "");
}

export function getRecipeDir(siteRoot = getSiteRoot()) {
  return path.join(siteRoot, "agent-recipes");
}

export async function listRecipes({ siteRoot = getSiteRoot() } = {}) {
  const indexPath = path.join(getRecipeDir(siteRoot), "index.json");
  const index = await readJsonWithRemoteFallback(indexPath, `${getRecipeBaseUrl()}/index.json`);
  return index.recipes || [];
}

export async function getRecipe(id, { siteRoot = getSiteRoot() } = {}) {
  const recipes = await listRecipes({ siteRoot });
  const summary = recipes.find((recipe) => recipe.id === id || recipe.url?.endsWith(`/${id}`));
  if (!summary) {
    throw new Error(`Unknown QuokkaPix recipe: ${id}`);
  }
  const fileName = path.basename(summary.url);
  const recipePath = path.join(getRecipeDir(siteRoot), fileName);
  return readJsonWithRemoteFallback(recipePath, `${getRecipeBaseUrl()}/${fileName}`);
}

export function validateRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    return { valid: false, errors: ["Recipe must be an object."] };
  }
  if (!recipe.id || typeof recipe.id !== "string") {
    errors.push("Recipe id is required.");
  }
  if (!recipe.applySettings || typeof recipe.applySettings !== "object") {
    errors.push("Recipe applySettings object is required.");
  } else {
    if (!["single", "batch"].includes(recipe.applySettings.mode)) {
      errors.push("applySettings.mode must be single or batch.");
    }
    if (!recipe.applySettings.tool || typeof recipe.applySettings.tool !== "string") {
      errors.push("applySettings.tool is required.");
    }
    if (recipe.applySettings.steps !== undefined) {
      validateApplySettingsSteps(recipe.applySettings.steps, errors);
    }
  }
  const maxFiles = Number(recipe.requires?.maxFiles || 0);
  if (!Number.isFinite(maxFiles) || maxFiles < 1) {
    errors.push("requires.maxFiles must be a positive number.");
  }
  return { valid: errors.length === 0, errors };
}

function validateApplySettingsSteps(steps, errors) {
  if (!Array.isArray(steps)) {
    errors.push("applySettings.steps must be an array when present.");
    return;
  }
  for (const [index, step] of steps.entries()) {
    if (typeof step === "string") {
      if (!step.trim()) {
        errors.push(`applySettings.steps[${index}] must not be empty.`);
      }
      continue;
    }
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      errors.push(`applySettings.steps[${index}] must be a tool string or { tool, settings } object.`);
      continue;
    }
    if (!step.tool || typeof step.tool !== "string") {
      errors.push(`applySettings.steps[${index}].tool is required.`);
    }
    if (
      step.settings !== undefined &&
      (!step.settings || typeof step.settings !== "object" || Array.isArray(step.settings))
    ) {
      errors.push(`applySettings.steps[${index}].settings must be an object when present.`);
    }
  }
}

export async function resolveRecipe(input, options = {}) {
  if (typeof input === "string") {
    const recipe = await getRecipe(input, options);
    return { recipe, validation: validateRecipe(recipe) };
  }
  return { recipe: input, validation: validateRecipe(input) };
}

async function readJsonWithRemoteFallback(filePath, remoteUrl) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    return fetchJson(remoteUrl);
  }
}

async function fetchJson(url) {
  if (typeof fetch !== "function") {
    throw new Error(`Recipe file is missing locally and fetch is unavailable: ${url}`);
  }
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch QuokkaPix recipe ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
