import assert from "node:assert/strict";
import test from "node:test";

import { getRecipe } from "../src/recipe-store.mjs";
import { validateResultManifest } from "../src/qa-validator.mjs";

test("QA validator accepts a matching Shopify result manifest", async () => {
  const recipe = await getRecipe("shopify_product_pack");
  const report = validateResultManifest(
    {
      status: "done",
      source: { count: 1, totalBytes: 1024 },
      outputs: [
        {
          sourceName: "photo.jpg",
          outputName: "shopify_1.webp",
          outputWidth: 2048,
          outputHeight: 2048,
          format: "webp",
          sizeBytes: 280 * 1024,
          warnings: [],
        },
      ],
      warnings: [],
    },
    recipe,
  );

  assert.equal(report.ok, true);
  assert.equal(report.profile, "shopify-product");
  assert.equal(report.summary.failures, 0);
  assert.ok(report.checks.some((check) => check.name === "marketplace_profile_declared" && check.ok));
  assert.ok(report.checks.some((check) => check.name === "marketplace_min_dimension" && check.ok));
});

test("QA validator reports machine-readable failures and warnings", async () => {
  const recipe = await getRecipe("amazon_white_background_pack");
  const report = validateResultManifest(
    {
      status: "done",
      source: { count: 2, totalBytes: 2048 },
      outputs: [
        {
          outputName: "bad.png",
          outputWidth: 1200,
          outputHeight: 900,
          format: "png",
          sizeBytes: 700 * 1024,
          warnings: ["unsupported_format"],
        },
      ],
      warnings: [],
    },
    recipe,
  );

  assert.equal(report.ok, false);
  assert.ok(report.checks.some((check) => check.name === "expected_output_format" && !check.ok));
  assert.ok(report.checks.some((check) => check.name === "expected_output_width" && !check.ok));
  assert.ok(report.checks.some((check) => check.name === "warning_absent_unsupported_format" && !check.ok));
});

test("QA validator reports archive contents and metadata-only visual checks", async () => {
  const recipe = {
    id: "social_pack_single",
    requires: { maxFiles: 1 },
    expectedResult: {
      output: "zip",
      qa: {
        profile: "social-pack",
        expectedFormat: "zip",
        expectedArchive: true,
        expectedMinOutputs: 4,
      },
    },
  };
  const report = validateResultManifest(
    {
      status: "done",
      source: { count: 1, totalBytes: 2048 },
      output: { kind: "zip", name: "social-pack.zip", type: "application/zip", size: 52000 },
      outputs: [
        { outputName: "instagram-square.webp", outputWidth: 1080, outputHeight: 1080, format: "webp", sizeBytes: 12_000 },
        { outputName: "instagram-story.webp", outputWidth: 1080, outputHeight: 1920, format: "webp", sizeBytes: 14_000 },
        { outputName: "youtube-thumb.webp", outputWidth: 1280, outputHeight: 720, format: "webp", sizeBytes: 16_000 },
        { outputName: "linkedin-post.webp", outputWidth: 1200, outputHeight: 627, format: "webp", sizeBytes: 10_000 },
      ],
      warnings: [],
    },
    recipe,
  );

  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.name === "expected_min_outputs" && check.ok));
  assert.ok(report.checks.some((check) => check.name === "zip_entries_manifested" && check.ok));
  assert.ok(report.checks.some((check) => check.name === "zip_entry_names_available" && check.ok));
  assert.ok(report.checks.some((check) => check.name === "zip_entry_sizes_available" && check.ok));
  assert.ok(report.checks.some((check) => check.name === "zip_entry_dimensions_available" && check.ok));
});

test("QA validator warns when ZIP output details are incomplete", () => {
  const recipe = {
    id: "zip_incomplete",
    requires: { maxFiles: 2 },
    expectedResult: {
      output: "zip",
      qa: {
        profile: "zip-incomplete",
        expectedArchive: true,
      },
    },
  };
  const report = validateResultManifest(
    {
      status: "done",
      source: { count: 2, totalBytes: 2048 },
      outputs: [{ outputName: "one.webp", format: "webp" }],
      warnings: [],
    },
    recipe,
  );

  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.name === "zip_entries_manifested" && !check.ok));
  assert.ok(report.checks.some((check) => check.name === "zip_entry_sizes_available" && !check.ok));
  assert.ok(report.checks.some((check) => check.name === "zip_entry_dimensions_available" && !check.ok));
});
