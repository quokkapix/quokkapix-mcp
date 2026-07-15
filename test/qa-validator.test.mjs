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
  assert.equal(report.ruleProfile.id, "shopify.product.image");
  assert.equal(report.ruleProfile.platform, "Shopify");
  assert.equal(report.ruleProfile.sourceType, "official");
  assert.equal(report.ruleProfile.confidence, "high");
  assert.match(report.checkedAgainst, /Shopify/);
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
  assert.ok(report.checks.some((check) => check.name === "expected_output_format" && !check.ok && check.remediation));
  assert.ok(report.checks.some((check) => check.name === "expected_output_width" && !check.ok));
  assert.ok(report.checks.some((check) => check.name === "warning_absent_unsupported_format" && !check.ok));
});

test("QA validator uses browser pixel QA metrics when present", async () => {
  const recipe = await getRecipe("amazon_white_background_pack");
  const report = validateResultManifest(
    {
      status: "done",
      source: { count: 1, totalBytes: 2048 },
      output: { kind: "zip" },
      outputs: [
        {
          outputName: "amazon_1.jpg",
          outputWidth: 2000,
          outputHeight: 2000,
          format: "jpg",
          sizeBytes: 300 * 1024,
          pixelQa: {
            background: {
              edgeWhiteRatio: 1,
              edgeNonWhiteVisibleRatio: 0,
            },
            subject: {
              centerOffsetX: 0.01,
              centerOffsetY: -0.01,
              margins: { left: 0.2, right: 0.2, top: 0.18, bottom: 0.18 },
              touchesEdge: false,
            },
          },
          warnings: [],
        },
      ],
      warnings: [],
    },
    recipe,
  );

  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.name === "visual_check_white_background" && check.ok));
  assert.ok(report.checks.some((check) => check.name === "visual_check_subject_centered" && check.ok));
  assert.ok(report.checks.some((check) => check.name === "visual_check_safe_margins" && check.ok));
});

test("QA validator warns about unsupported visual checks instead of ignoring them", () => {
  const report = validateResultManifest(
    {
      status: "done",
      source: { count: 1, totalBytes: 2048 },
      outputs: [
        {
          outputName: "watermarked.webp",
          format: "webp",
          pixelQa: {
            background: { edgeWhiteRatio: 1, edgeNonWhiteVisibleRatio: 0 },
          },
        },
      ],
      warnings: [],
    },
    {
      expectedResult: {
        qa: {
          profile: "custom-watermark",
          visualChecks: ["watermark_presence"],
        },
      },
    },
  );

  assert.equal(report.ok, true);
  assert.ok(
    report.checks.some(
      (check) => check.name === "visual_check_unsupported_watermark_presence" && !check.ok,
    ),
  );
});

test("QA validator reports archive contents and output-pack details", async () => {
  const recipe = {
    id: "social_pack_single",
    requires: { maxFiles: 1 },
    expectedResult: {
      output: "zip",
      qa: {
        profile: "social-pack",
        expectedArchive: true,
        expectedOutputKind: "zip",
        allowedFormats: ["webp"],
        expectedMinOutputs: 3,
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

test("QA validator checks output kind and required output names", () => {
  const recipe = {
    id: "profile_avatar_pack",
    requires: { maxFiles: 1 },
    expectedResult: {
      output: "zip",
      qa: {
        profile: "profile-avatar",
        expectedOutputKind: "zip",
        allowedFormats: ["webp"],
        requiredOutputNameIncludes: ["avatar_512x512", "avatar_256x256", "avatar_128x128"],
      },
    },
  };
  const report = validateResultManifest(
    {
      status: "done",
      source: { count: 1, totalBytes: 2048 },
      output: { kind: "zip", name: "avatars.zip", type: "application/zip", size: 52000 },
      outputs: [
        { outputName: "logo_avatar_512x512.webp", outputWidth: 512, outputHeight: 512, format: "webp", sizeBytes: 12_000 },
        { outputName: "logo_avatar_256x256.webp", outputWidth: 256, outputHeight: 256, format: "webp", sizeBytes: 8_000 },
        { outputName: "logo_avatar_128x128.webp", outputWidth: 128, outputHeight: 128, format: "webp", sizeBytes: 4_000 },
      ],
      warnings: [],
    },
    recipe,
  );

  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.name === "expected_output_kind" && check.ok));
  assert.ok(report.checks.some((check) => check.name === "output_name_includes_avatar_512x512" && check.ok));
});
