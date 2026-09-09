import fs from "node:fs/promises";
import path from "node:path";

import { getSiteRoot } from "./recipe-store.mjs";

const VIDEO_ORIGIN = "https://video.quokkapix.com";

export async function listVideoRecipes({ siteRoot = getSiteRoot() } = {}) {
  const index = await readJson(path.join(siteRoot, "video", "agent-recipes", "index.json"), `${VIDEO_ORIGIN}/agent-recipes/index.json`);
  return index.recipes || [];
}

export async function getVideoRecipe(id, options = {}) {
  const recipes = await listVideoRecipes(options);
  const recipe = recipes.find((item) => item.id === id);
  if (!recipe) throw new Error(`Unknown QuokkaPix Video recipe: ${id}`);
  return recipe;
}

export function validateVideoRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) return { valid: false, errors: ["Video recipe must be an object."] };
  if (!recipe.id || typeof recipe.id !== "string") errors.push("Video recipe id is required.");
  const settings = recipe.settings || recipe.applySettings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) errors.push("Video recipe settings object is required.");
  if (settings && !["cut", "crop", "convert", "compress", "audio", "transcribe"].includes(settings.tool)) errors.push("Video recipe tool is unsupported.");
  return { valid: errors.length === 0, errors };
}

export async function listVideoRuleProfiles({ siteRoot = getSiteRoot() } = {}) {
  const index = await readJson(path.join(siteRoot, "video", "rules", "index.json"), `${VIDEO_ORIGIN}/rules/index.json`);
  return index.ruleProfiles || [];
}

export async function getVideoRuleProfile(id, options = {}) {
  const profiles = await listVideoRuleProfiles(options);
  const summary = profiles.find((item) => item.id === id);
  if (!summary) throw new Error(`Unknown QuokkaPix Video rule profile: ${id}`);
  return readJson(path.join(options.siteRoot || getSiteRoot(), "video", "rules", `${summary.id}.json`), `${VIDEO_ORIGIN}/rules/${summary.id}.json`);
}

async function readJson(filePath, remoteUrl) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const response = await fetch(remoteUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Failed to fetch ${remoteUrl}: ${response.status} ${response.statusText}`);
    return response.json();
  }
}
