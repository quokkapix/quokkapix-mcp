import fs from "node:fs/promises";
import path from "node:path";

import { getSiteRoot } from "./recipe-store.mjs";

const DEFAULT_RULE_BASE_URL = "https://quokkapix.com/rules";

export function getRuleBaseUrl() {
  return String(process.env.QUOKKAPIX_RULE_BASE_URL || DEFAULT_RULE_BASE_URL).replace(/\/+$/, "");
}

export function getRuleDir(siteRoot = getSiteRoot()) {
  return path.join(siteRoot, "rules");
}

export async function listRuleProfiles({ siteRoot = getSiteRoot() } = {}) {
  const indexPath = path.join(getRuleDir(siteRoot), "index.json");
  const index = await readJsonWithRemoteFallback(indexPath, `${getRuleBaseUrl()}/index.json`);
  return index.ruleProfiles || [];
}

export async function getRuleProfile(id, { siteRoot = getSiteRoot() } = {}) {
  const profiles = await listRuleProfiles({ siteRoot });
  const summary = profiles.find((profile) => profile.id === id || profile.url?.endsWith(`/${id}.json`));
  if (!summary) {
    throw new Error(`Unknown QuokkaPix rule profile: ${id}`);
  }
  const fileName = path.basename(summary.url || `${summary.id}.json`);
  const rulePath = path.join(getRuleDir(siteRoot), fileName);
  return readJsonWithRemoteFallback(rulePath, `${getRuleBaseUrl()}/${fileName}`);
}

export function validateRuleProfile(ruleProfile) {
  const errors = [];
  if (!ruleProfile || typeof ruleProfile !== "object" || Array.isArray(ruleProfile)) {
    return { valid: false, errors: ["Rule profile must be an object."] };
  }
  for (const field of ["id", "platform", "type", "placement", "sourceType", "sourceUrl"]) {
    if (!ruleProfile[field]) {
      errors.push(`Rule profile missing ${field}.`);
    }
  }
  if (!ruleProfile.requirements && !ruleProfile.recommendations) {
    errors.push("Rule profile must include requirements or recommendations.");
  }
  return { valid: errors.length === 0, errors };
}

export function buildQaFromRuleProfile(ruleProfile) {
  if (!ruleProfile) return {};
  const requirements = ruleProfile.requirements || {};
  const recommendations = ruleProfile.recommendations || {};
  const qa = {
    ruleProfileId: ruleProfile.id,
    platform: ruleProfile.platform,
    placement: ruleProfile.placement,
    sourceType: ruleProfile.sourceType,
    sourceUrl: ruleProfile.sourceUrl,
  };
  if (Array.isArray(requirements.formats)) {
    qa.allowedFormats = requirements.formats.map((format) => {
      const value = String(format).toLowerCase();
      if (value === "jpeg") return "jpg";
      if (value === "tif") return "tiff";
      return value;
    });
  }
  if (requirements.minWidth) qa.minWidth = requirements.minWidth;
  if (requirements.minHeight) qa.minHeight = requirements.minHeight;
  if (requirements.maxWidth) qa.maxWidth = requirements.maxWidth;
  if (requirements.maxHeight) qa.maxHeight = requirements.maxHeight;
  if (requirements.maxFileBytes) qa.maxOutputKB = Math.floor(requirements.maxFileBytes / 1024);
  if (requirements.minLongestSide) qa.minLongestSide = requirements.minLongestSide;
  if (requirements.maxLongestSide) qa.maxLongestSide = requirements.maxLongestSide;
  if (requirements.minImages) qa.expectedMinSourceFiles = requirements.minImages;
  if (recommendations.minImages && !qa.expectedMinSourceFiles) {
    qa.recommendedMinSourceFiles = recommendations.minImages;
  }
  return qa;
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
    throw new Error(`Rule file is missing locally and fetch is unavailable: ${url}`);
  }
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch QuokkaPix rule profile ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
