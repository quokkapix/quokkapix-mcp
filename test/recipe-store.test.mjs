import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";

import { getRecipe, listRecipes, resolveRecipe, validateRecipe } from "../src/recipe-store.mjs";
import {
  buildQaFromRuleProfile,
  getRuleProfile,
  listRuleProfiles,
  validateRuleProfile,
} from "../src/rule-store.mjs";
import {
  assertAllowedAppUrl,
  buildWorkflowFromSettings,
  processImagesWithQuokkaPix,
} from "../src/quokkapix-browser-runner.mjs";
import { parseArgs } from "../src/cli.mjs";

test("MCP runner reads official QuokkaPix recipe catalog", async () => {
  const recipes = await listRecipes();
  assert.ok(recipes.length >= 17);
  assert.ok(recipes.some((recipe) => recipe.id === "shopify_product_pack"));
  assert.ok(recipes.some((recipe) => recipe.id === "website_webp_compress"));
  assert.ok(recipes.some((recipe) => recipe.id === "white_background_shadow_batch"));
  assert.ok(recipes.some((recipe) => recipe.id === "images_to_pdf_batch"));
  assert.ok(recipes.some((recipe) => recipe.id === "single_webp_compress"));
  assert.ok(recipes.some((recipe) => recipe.id === "single_background_remove"));
  assert.ok(recipes.some((recipe) => recipe.id === "single_white_background"));
  assert.ok(recipes.some((recipe) => recipe.id === "single_metadata_clean"));
  assert.ok(recipes.some((recipe) => recipe.id === "single_watermark"));
});

test("MCP runner reads sourced platform rule profiles", async () => {
  const profiles = await listRuleProfiles();
  assert.ok(profiles.length >= 20);
  assert.ok(profiles.some((profile) => profile.id === "amazon.product.image"));
  assert.ok(profiles.some((profile) => profile.id === "temu.product.main_image"));

  const amazon = await getRuleProfile("amazon.product.image");
  assert.equal(validateRuleProfile(amazon).valid, true);
  assert.equal(amazon.sourceType, "official");
  assert.ok(amazon.sourceUrl.includes("sellercentral.amazon.com"));

  const qa = buildQaFromRuleProfile(amazon);
  assert.equal(qa.ruleProfileId, "amazon.product.image");
  assert.ok(qa.allowedFormats.includes("jpg"));
  assert.equal(qa.maxLongestSide, 10000);
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

  const avatar = await getRecipe("profile_avatar_pack");
  assert.equal(avatar.applySettings.readyScenario, "avatar-pack");
  assert.equal(validateRecipe(avatar).valid, true);
});

test("MCP runner validates every official recipe and preserves single/batch payment policy", async () => {
  const recipes = await listRecipes();
  const singleRecipeIds = new Set([
    "single_webp_compress",
    "single_background_remove",
    "single_white_background",
    "single_metadata_clean",
    "single_watermark",
    "social_pack_single",
    "profile_avatar_pack",
    "favicon_app_icon_pack",
  ]);

  for (const summary of recipes) {
    const recipe = await getRecipe(summary.id);
    assert.equal(validateRecipe(recipe).valid, true, `${summary.id} should be a valid recipe`);
    assert.equal(summary.mode, recipe.applySettings.mode, `${summary.id} summary mode should match recipe`);
    assert.equal(summary.maxFiles, recipe.requires.maxFiles, `${summary.id} summary maxFiles should match recipe`);
    assert.equal(summary.payment, recipe.requires.payment, `${summary.id} summary payment should match recipe`);
    assert.ok(recipe.expectedResult?.qa, `${summary.id} should expose expectedResult.qa for agents`);

    if (singleRecipeIds.has(summary.id)) {
      assert.equal(recipe.applySettings.mode, "single", `${summary.id} should stay single mode`);
      assert.equal(recipe.requires.maxFiles, 1, `${summary.id} should stay limited to one file`);
      assert.match(recipe.requires.payment, /free/i, `${summary.id} should stay free for single-image runs`);
    } else {
      assert.equal(recipe.applySettings.mode, "batch", `${summary.id} should stay batch mode`);
      assert.ok(recipe.requires.maxFiles <= 50, `${summary.id} should stay within the documented paid batch limit`);
      assert.match(recipe.requires.payment, /free up to 5 files/i, `${summary.id} should document the free small-batch threshold`);
      assert.match(recipe.requires.payment, /x402 unlock/i, `${summary.id} should document paid batch unlocks`);
      if (recipe.requires.maxFiles > 5) {
        assert.match(
          recipe.requires.payment,
          new RegExp(`from 6 to ${recipe.requires.maxFiles} files`, "i"),
          `${summary.id} should document its effective paid batch range`,
        );
      }
    }
  }
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
