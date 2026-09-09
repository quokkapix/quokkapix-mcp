export function validateVideoResultManifest(manifest, recipe = null) {
  const checks = Array.isArray(manifest?.qa?.checks) ? [...manifest.qa.checks] : [];
  const add = (id, ok, actual, expected) => checks.push({ id, ok: Boolean(ok), severity: "error", actual, expected });
  add("manifest_surface", manifest?.surface === "video" || Boolean(manifest?.source?.duration), manifest?.surface || "video-inferred", "video");
  add("successful_status", manifest?.status === "done" && manifest?.success === true, { status: manifest?.status, success: manifest?.success }, { status: "done", success: true });
  add("local_only", manifest?.localOnly === true, manifest?.localOnly, true);
  add("output_manifest", Array.isArray(manifest?.outputs) && manifest.outputs.length > 0, manifest?.outputs?.length || 0, ">= 1");
  const expected = recipe?.expectedResult?.qa || {};
  const output = manifest?.outputs?.find((item) => item.videoCodec || (item.width && item.height)) || manifest?.outputs?.[0];
  if (output && expected.width && expected.height) add("expected_resolution", Number(output.width) === expected.width && Number(output.height) === expected.height, { width: output.width, height: output.height }, { width: expected.width, height: expected.height });
  if (output && expected.container) add("expected_container", String(output.format || "").toLowerCase() === expected.container, output.format || null, expected.container);
  if (output && expected.maxDurationSeconds && Number.isFinite(Number(output.duration))) add("maximum_duration", Number(output.duration) <= expected.maxDurationSeconds, Number(output.duration), `<= ${expected.maxDurationSeconds} seconds`);
  const failed = checks.filter((check) => check.ok === false && check.severity !== "warning");
  return { ok: failed.length === 0, summary: failed.length ? `${failed.length} Video QA check(s) failed.` : `${checks.length} Video QA checks passed.`, checks, ruleProfileId: recipe?.expectedResult?.ruleProfile || null };
}
