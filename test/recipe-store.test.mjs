import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";

import { getRecipe, listRecipes, resolveRecipe, validateRecipe } from "../src/recipe-store.mjs";
import {
  assertAllowedAppUrl,
  buildWorkflowFromSettings,
  processImagesWithQuokkaPix,
} from "../src/quokkapix-browser-runner.mjs";
import { parseArgs } from "../src/cli.mjs";

test("MCP runner reads official QuokkaPix recipe catalog", async () => {
  const recipes = await listRecipes();
  assert.ok(recipes.length >= 8);
  assert.ok(recipes.some((recipe) => recipe.id === "shopify_product_pack"));
  assert.ok(recipes.some((recipe) => recipe.id === "website_webp_compress"));
});

test("MCP runner loads and validates a recipe by id", async () => {
  const recipe = await getRecipe("shopify_product_pack");
  assert.equal(recipe.id, "shopify_product_pack");
  assert.equal(recipe.applySettings.mode, "batch");
  assert.equal(recipe.applySettings.readyScenario, "shopify-product");
  assert.equal(validateRecipe(recipe).valid, true);

  const resolved = await resolveRecipe("metadata_clean_batch");
  assert.equal(resolved.validation.valid, true);
  assert.equal(resolved.recipe.applySettings.tool, "metadata");
});

test("MCP runner rejects invalid custom recipes", () => {
  const result = validateRecipe({ id: "bad", applySettings: { mode: "bad" } });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("MCP runner builds a valid workflow from direct applySettings payload", () => {
  const { recipe, validation } = buildWorkflowFromSettings(
    {
      mode: "single",
      tool: "compress",
      settings: {
        compress: {
          format: "webp",
          quality: 0.82,
        },
      },
    },
    {
      settingsId: "custom-webp",
      expectedResultQa: {
        profile: "custom-webp",
        expectedFormat: "webp",
      },
    },
  );

  assert.equal(validation.valid, true);
  assert.equal(recipe.id, "custom-webp");
  assert.equal(recipe.applySettings.tool, "compress");
  assert.equal(recipe.expectedResult.qa.expectedFormat, "webp");
});

test("MCP runner blocks unsafe appUrl values unless explicitly allowed by environment", () => {
  assert.equal(assertAllowedAppUrl("https://quokkapix.com/#agent=1"), "https://quokkapix.com/#agent=1");
  assert.equal(assertAllowedAppUrl("http://127.0.0.1:4180/#agent=1"), "http://127.0.0.1:4180/#agent=1");
  assert.equal(assertAllowedAppUrl("http://localhost:4180/#agent=1"), "http://localhost:4180/#agent=1");
  assert.throws(
    () => assertAllowedAppUrl("https://evil.example/#agent=1"),
    /Custom appUrl is blocked/i,
  );
});

test("MCP runner requires outputDir before resolving paths", async () => {
  await assert.rejects(
    () =>
      processImagesWithQuokkaPix({
        settings: { mode: "single", tool: "compress" },
        inputFiles: ["image.png"],
        outputDir: "",
      }),
    /outputDir is required/i,
  );
});

test("MCP runner accepts structured scenario steps with per-tool settings", () => {
  const recipe = {
    id: "structured_scenario",
    requires: { maxFiles: 10 },
    applySettings: {
      mode: "batch",
      tool: "constructor",
      steps: [
        { tool: "resize", settings: { width: 1200, height: 1200, mode: "fit" } },
        { tool: "watermark", settings: { text: "Demo", layout: "tiled", angle: -20 } },
        { tool: "compress", settings: { format: "webp", quality: 0.82 } },
      ],
    },
  };
  const validation = validateRecipe(recipe);
  assert.equal(validation.valid, true);
});

test("MCP runner rejects malformed structured scenario steps", () => {
  const recipe = {
    id: "bad_structured_scenario",
    requires: { maxFiles: 10 },
    applySettings: {
      mode: "batch",
      tool: "constructor",
      steps: [{ settings: { width: 1200 } }, { tool: "resize", settings: [] }],
    },
  };
  const validation = validateRecipe(recipe);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("steps[0].tool")));
  assert.ok(validation.errors.some((error) => error.includes("steps[1].settings")));
});

test("MCP runner falls back to the public recipe catalog when local files are absent", async () => {
  const previousFetch = globalThis.fetch;
  const previousBaseUrl = process.env.QUOKKAPIX_RECIPE_BASE_URL;
  const baseUrl = "https://example.test/agent-recipes";
  process.env.QUOKKAPIX_RECIPE_BASE_URL = baseUrl;
  globalThis.fetch = async (url) => {
    if (url === `${baseUrl}/index.json`) {
      return jsonResponse({
        recipes: [
          {
            id: "remote_recipe",
            url: "/agent-recipes/remote_recipe.json",
          },
        ],
      });
    }
    if (url === `${baseUrl}/remote_recipe.json`) {
      return jsonResponse({
        id: "remote_recipe",
        requires: { maxFiles: 1 },
        applySettings: { mode: "single", tool: "compress" },
      });
    }
    return { ok: false, status: 404, statusText: "Not Found" };
  };

  try {
    const missingSiteRoot = path.join(os.tmpdir(), `missing-quokkapix-${Date.now()}`);
    const recipes = await listRecipes({ siteRoot: missingSiteRoot });
    assert.equal(recipes[0].id, "remote_recipe");
    const recipe = await getRecipe("remote_recipe", { siteRoot: missingSiteRoot });
    assert.equal(recipe.applySettings.tool, "compress");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBaseUrl === undefined) {
      delete process.env.QUOKKAPIX_RECIPE_BASE_URL;
    } else {
      process.env.QUOKKAPIX_RECIPE_BASE_URL = previousBaseUrl;
    }
  }
});

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return body;
    },
  };
}


test("CLI parser maps runner flags to process options", () => {
  const options = parseArgs([
    "--recipe",
    "website_webp_compress",
    "--input",
    "a.png",
    "--input",
    "b.jpg",
    "--output",
    "out",
    "--app-url",
    "http://127.0.0.1:4180/#agent=1",
    "--timeout-ms",
    "120000",
  ]);
  assert.equal(options.recipeId, "website_webp_compress");
  assert.deepEqual(options.inputFiles, ["a.png", "b.jpg"]);
  assert.equal(options.outputDir, "out");
  assert.equal(options.appUrl, "http://127.0.0.1:4180/#agent=1");
  assert.equal(options.timeoutMs, 120000);
  assert.equal(options.headless, true);
});
