export function validateResultManifest(manifest = {}, recipe = {}) {
  const checks = [];
  const qa = recipe?.expectedResult?.qa || {};
  const outputs = Array.isArray(manifest.outputs) ? manifest.outputs : [];
  const warnings = new Set([
    ...(Array.isArray(manifest.warnings) ? manifest.warnings : []),
    ...outputs.flatMap((output) => (Array.isArray(output.warnings) ? output.warnings : [])),
  ]);

  addCheck(checks, "status_done", manifest.status === "done", {
    expected: "done",
    actual: manifest.status || "",
    severity: "error",
  });
  addCheck(checks, "source_count_positive", Number(manifest.source?.count || 0) > 0, {
    actual: Number(manifest.source?.count || 0),
    severity: "error",
  });
  addCheck(checks, "outputs_present", outputs.length > 0, {
    actual: outputs.length,
    severity: "error",
  });

  if (qa.expectedMinOutputs) {
    addCheck(checks, "expected_min_outputs", outputs.length >= Number(qa.expectedMinOutputs), {
      expected: `>= ${qa.expectedMinOutputs}`,
      actual: outputs.length,
      severity: "error",
    });
  }

  if (qa.expectedOutputKind) {
    const actualKind = String(manifest.output?.kind || inferKindFromOutputs(outputs)).toLowerCase();
    addCheck(checks, "expected_output_kind", actualKind === String(qa.expectedOutputKind).toLowerCase(), {
      expected: qa.expectedOutputKind,
      actual: actualKind,
      severity: "error",
    });
  }

  if (recipe?.expectedResult?.output === "zip" || qa.expectedArchive === true) {
    addCheck(checks, "zip_entries_manifested", outputs.length >= Math.max(1, Number(manifest.source?.count || 0)), {
      expected: "one or more manifest output entries for the ZIP contents",
      actual: `${outputs.length} output entries for ${Number(manifest.source?.count || 0)} source file(s)`,
      severity: "warning",
    });
    if (outputs.length > 0) {
      addCheck(checks, "zip_entry_names_available", outputs.every((output) => output.outputName || output.name), {
        expected: "every ZIP entry has outputName",
        actual: `${outputs.filter((output) => output.outputName || output.name).length}/${outputs.length}`,
        severity: "warning",
      });
      addCheck(
        checks,
        "zip_entry_sizes_available",
        outputs.every((output) => Number(output.sizeBytes || output.size || 0) > 0),
        {
          expected: "every ZIP entry has byte size metadata",
          actual: `${outputs.filter((output) => Number(output.sizeBytes || output.size || 0) > 0).length}/${outputs.length}`,
          severity: "warning",
        },
      );
      addCheck(
        checks,
        "zip_entry_dimensions_available",
        outputs.every((output) => Number(output.outputWidth || output.width || 0) > 0 && Number(output.outputHeight || output.height || 0) > 0),
        {
          expected: "every image ZIP entry has output dimensions",
          actual: `${outputs.filter((output) => Number(output.outputWidth || output.width || 0) > 0 && Number(output.outputHeight || output.height || 0) > 0).length}/${outputs.length}`,
          severity: "warning",
        },
      );
    }
  }

  const maxFiles = Number(recipe?.requires?.maxFiles || 0);
  if (maxFiles > 0) {
    addCheck(checks, "source_count_within_recipe_limit", Number(manifest.source?.count || 0) <= maxFiles, {
      expected: `<= ${maxFiles}`,
      actual: Number(manifest.source?.count || 0),
      severity: "error",
    });
  }

  if (qa.expectedMinSourceFiles) {
    addCheck(
      checks,
      "source_count_meets_rule_minimum",
      Number(manifest.source?.count || 0) >= Number(qa.expectedMinSourceFiles),
      {
        expected: `>= ${qa.expectedMinSourceFiles}`,
        actual: Number(manifest.source?.count || 0),
        severity: "warning",
      },
    );
  }

  if (qa.recommendedMinSourceFiles) {
    addCheck(
      checks,
      "source_count_meets_rule_recommendation",
      Number(manifest.source?.count || 0) >= Number(qa.recommendedMinSourceFiles),
      {
        expected: `>= ${qa.recommendedMinSourceFiles}`,
        actual: Number(manifest.source?.count || 0),
        severity: "info",
      },
    );
  }

  if (qa.expectedFormat) {
    const formatMatches = outputs.every((output) => {
      const format = String(output.format || "").toLowerCase();
      if (format === qa.expectedFormat) return true;
      return qa.expectedFormat === "zip" && String(manifest.output?.kind || "").toLowerCase() === "zip";
    });
    addCheck(checks, "expected_output_format", formatMatches, {
      expected: qa.expectedFormat,
      actual: outputs.map((output) => output.format || "").join(", ") || manifest.output?.kind || "",
      severity: "error",
    });
  }

  if (Array.isArray(qa.allowedFormats) && qa.allowedFormats.length > 0) {
    const allowed = new Set(qa.allowedFormats.map((format) => String(format).toLowerCase()));
    addCheck(
      checks,
      "allowed_output_formats",
      outputs.every((output) => allowed.has(String(output.format || "").toLowerCase())),
      {
        expected: [...allowed].join(", "),
        actual: outputs.map((output) => output.format || "").join(", "),
        severity: "error",
      },
    );
  }

  if (qa.expectedWidth || qa.expectedHeight || qa.maxWidth || qa.maxHeight) {
    const dimensioned = outputs.filter((output) => output.outputWidth && output.outputHeight);
    addCheck(checks, "dimension_metadata_available", dimensioned.length > 0, {
      actual: `${dimensioned.length}/${outputs.length}`,
      severity: "warning",
    });
    if (dimensioned.length > 0) {
      if (qa.expectedWidth) {
        addCheck(
          checks,
          "expected_output_width",
          dimensioned.every((output) => Number(output.outputWidth) === Number(qa.expectedWidth)),
          {
            expected: qa.expectedWidth,
            actual: dimensioned.map((output) => output.outputWidth).join(", "),
            severity: "error",
          },
        );
      }
      if (qa.expectedHeight) {
        addCheck(
          checks,
          "expected_output_height",
          dimensioned.every((output) => Number(output.outputHeight) === Number(qa.expectedHeight)),
          {
            expected: qa.expectedHeight,
            actual: dimensioned.map((output) => output.outputHeight).join(", "),
            severity: "error",
          },
        );
      }
      if (qa.requireSquare) {
        addCheck(
          checks,
          "square_output",
          dimensioned.every((output) => Number(output.outputWidth) === Number(output.outputHeight)),
          {
            expected: "width equals height",
            actual: dimensioned.map((output) => `${output.outputWidth}x${output.outputHeight}`).join(", "),
            severity: "error",
          },
        );
      }
      if (qa.maxWidth) {
        addCheck(
          checks,
          "max_output_width",
          dimensioned.every((output) => Number(output.outputWidth) <= Number(qa.maxWidth)),
          {
            expected: `<= ${qa.maxWidth}`,
            actual: dimensioned.map((output) => output.outputWidth).join(", "),
            severity: "error",
          },
        );
      }
      if (qa.maxHeight) {
        addCheck(
          checks,
          "max_output_height",
          dimensioned.every((output) => Number(output.outputHeight) <= Number(qa.maxHeight)),
          {
            expected: `<= ${qa.maxHeight}`,
            actual: dimensioned.map((output) => output.outputHeight).join(", "),
            severity: "error",
          },
        );
      }
      if (qa.minWidth) {
        addCheck(
          checks,
          "min_output_width",
          dimensioned.every((output) => Number(output.outputWidth) >= Number(qa.minWidth)),
          {
            expected: `>= ${qa.minWidth}`,
            actual: dimensioned.map((output) => output.outputWidth).join(", "),
            severity: "warning",
          },
        );
      }
      if (qa.minHeight) {
        addCheck(
          checks,
          "min_output_height",
          dimensioned.every((output) => Number(output.outputHeight) >= Number(qa.minHeight)),
          {
            expected: `>= ${qa.minHeight}`,
            actual: dimensioned.map((output) => output.outputHeight).join(", "),
            severity: "warning",
          },
        );
      }
    }
  }

  if (qa.maxOutputKB) {
    const nonArchiveOutputs = outputs.filter((output) => output.format !== "zip" && output.format !== "pdf");
    if (nonArchiveOutputs.length > 0) {
      addCheck(
        checks,
        "max_output_size_kb",
        nonArchiveOutputs.every((output) => Number(output.sizeBytes || 0) <= Number(qa.maxOutputKB) * 1024),
        {
          expected: `<= ${qa.maxOutputKB} KB`,
          actual: nonArchiveOutputs.map((output) => `${Math.round(Number(output.sizeBytes || 0) / 1024)} KB`).join(", "),
          severity: "warning",
        },
      );
    } else if (outputs.length > 0) {
      addCheck(checks, "per_file_size_metadata_available", false, {
        expected: `per-file sizes for <= ${qa.maxOutputKB} KB check`,
        actual: "archive-level output only",
        severity: "warning",
      });
    }
  }

  if (qa.outputNamePrefix) {
    const namedOutputs = outputs.filter((output) => output.outputName && output.format !== "zip");
    if (namedOutputs.length > 0) {
      addCheck(
        checks,
        "output_name_prefix",
        namedOutputs.every((output) => String(output.outputName).startsWith(qa.outputNamePrefix)),
        {
          expected: qa.outputNamePrefix,
          actual: namedOutputs.map((output) => output.outputName).join(", "),
          severity: "warning",
        },
      );
    }
  }

  if (Array.isArray(qa.requiredOutputNameIncludes) && qa.requiredOutputNameIncludes.length > 0) {
    const names = outputs.map((output) => String(output.outputName || output.name || ""));
    for (const requiredPart of qa.requiredOutputNameIncludes) {
      addCheck(checks, `output_name_includes_${sanitizeCheckName(requiredPart)}`, names.some((name) => name.includes(requiredPart)), {
        expected: `one output name contains ${requiredPart}`,
        actual: names.join(", "),
        severity: "warning",
      });
    }
  }

  if (qa.marketplace) {
    addCheck(checks, "marketplace_profile_declared", true, {
      expected: qa.marketplace,
      actual: qa.marketplace,
      severity: "info",
    });
  }

  if (qa.ruleProfileId) {
    addCheck(checks, "sourced_rule_profile_declared", true, {
      expected: qa.ruleProfileId,
      actual: `${qa.platform || qa.marketplace || ""} ${qa.placement || ""}`.trim(),
      severity: "info",
    });
    addCheck(checks, "rule_source_declared", Boolean(qa.sourceUrl), {
      expected: "source URL",
      actual: qa.sourceUrl || "",
      severity: "info",
    });
  }

  if (qa.minDimension) {
    const dimensioned = outputs.filter((output) => output.outputWidth && output.outputHeight);
    if (dimensioned.length > 0) {
      addCheck(
        checks,
        "marketplace_min_dimension",
        dimensioned.every(
          (output) =>
            Math.min(Number(output.outputWidth) || 0, Number(output.outputHeight) || 0) >= Number(qa.minDimension),
        ),
        {
          expected: `short side >= ${qa.minDimension}`,
          actual: dimensioned.map((output) => `${output.outputWidth}x${output.outputHeight}`).join(", "),
          severity: "warning",
        },
      );
    }
  }

  if (qa.minLongestSide || qa.maxLongestSide) {
    const dimensioned = outputs.filter((output) => output.outputWidth && output.outputHeight);
    addCheck(checks, "long_side_dimension_metadata_available", dimensioned.length > 0, {
      actual: `${dimensioned.length}/${outputs.length}`,
      severity: "warning",
    });
    if (dimensioned.length > 0 && qa.minLongestSide) {
      addCheck(
        checks,
        "min_longest_side",
        dimensioned.every(
          (output) =>
            Math.max(Number(output.outputWidth) || 0, Number(output.outputHeight) || 0) >= Number(qa.minLongestSide),
        ),
        {
          expected: `>= ${qa.minLongestSide}`,
          actual: dimensioned.map((output) => `${output.outputWidth}x${output.outputHeight}`).join(", "),
          severity: "warning",
        },
      );
    }
    if (dimensioned.length > 0 && qa.maxLongestSide) {
      addCheck(
        checks,
        "max_longest_side",
        dimensioned.every(
          (output) =>
            Math.max(Number(output.outputWidth) || 0, Number(output.outputHeight) || 0) <= Number(qa.maxLongestSide),
        ),
        {
          expected: `<= ${qa.maxLongestSide}`,
          actual: dimensioned.map((output) => `${output.outputWidth}x${output.outputHeight}`).join(", "),
          severity: "error",
        },
      );
    }
  }

  validatePixelVisualChecks(checks, outputs, qa);

  for (const blockedWarning of qa.requiredWarningsAbsent || []) {
    addCheck(checks, `warning_absent_${blockedWarning}`, !warnings.has(blockedWarning), {
      expected: "absent",
      actual: warnings.has(blockedWarning) ? "present" : "absent",
      severity: "error",
    });
  }

  const failures = checks.filter((check) => !check.ok && check.severity === "error");
  const softWarnings = checks.filter((check) => !check.ok && check.severity !== "error");

  return {
    ok: failures.length === 0,
    profile: qa.profile || recipe?.id || "",
    ruleProfile: qa.ruleProfileId
      ? {
          id: qa.ruleProfileId,
          platform: qa.platform || qa.marketplace || "",
          placement: qa.placement || "",
          sourceName: qa.sourceName || "",
          sourceType: qa.sourceType || "",
          sourceUrl: qa.sourceUrl || "",
          confidence: qa.confidence || "",
        }
      : null,
    checkedAgainst: qa.ruleProfileId
      ? `${qa.platform || qa.marketplace || "Platform"} ${qa.placement || "profile"} (${qa.sourceType || "source"}, ${qa.confidence || "unknown"} confidence)`
      : "",
    summary: {
      checks: checks.length,
      failures: failures.length,
      warnings: softWarnings.length,
      outputs: outputs.length,
    },
    checks,
  };
}

function addCheck(checks, name, ok, detail = {}) {
  checks.push({
    name,
    ok: Boolean(ok),
    severity: detail.severity || "error",
    expected: detail.expected ?? null,
    actual: detail.actual ?? null,
    message: getCheckMessage(name),
    remediation: getCheckRemediation(name),
  });
}

function validatePixelVisualChecks(checks, outputs, qa) {
  if (!Array.isArray(qa.visualChecks) || qa.visualChecks.length === 0) return;
  const requested = qa.visualChecks.map((check) => String(check || "").trim()).filter(Boolean);
  const supported = new Set(SUPPORTED_PIXEL_VISUAL_CHECKS);
  const unsupported = requested.filter((check) => !supported.has(check));
  for (const check of unsupported) {
    addCheck(checks, `visual_check_unsupported_${check}`, false, {
      expected: "supported deterministic pixel check",
      actual: check,
      severity: "warning",
    });
  }
  const evaluated = outputs
    .filter((output) => output.pixelQa)
    .flatMap((output) =>
      evaluatePixelVisualChecks(output.pixelQa, requested).map((check) => ({
        ...check,
        outputName: output.outputName || output.name || "",
      })),
    );
  if (evaluated.length === 0 && outputs.every((output) => !output.pixelQa)) {
    addCheck(checks, "pixel_metrics_available", false, {
      expected: "at least one output with pixelQa",
      actual: "none",
      severity: "warning",
    });
  }
  const grouped = new Map();
  for (const check of evaluated) {
    const group = grouped.get(check.name) || [];
    group.push(check);
    grouped.set(check.name, group);
  }
  for (const [name, group] of grouped) {
    addCheck(checks, name, group.every((check) => check.ok), {
      expected: group[0]?.expected || null,
      actual: group.map((check) =>
        check.outputName ? `${check.outputName}: ${check.actual}` : check.actual,
      ).join("; "),
      severity: group[0]?.severity || "warning",
    });
  }
}

const SUPPORTED_PIXEL_VISUAL_CHECKS = Object.freeze([
  "white_background",
  "subject_centered",
  "safe_margins",
  "transparent_background",
]);

function evaluatePixelVisualChecks(pixelQa, visualChecks = []) {
  const requested = new Set(visualChecks.map((check) => String(check || "")));
  const checks = [];
  if (requested.has("white_background")) {
    checks.push({
      name: "visual_check_white_background",
      ok:
        Number(pixelQa.background?.edgeWhiteRatio || 0) >= 0.985 &&
        Number(pixelQa.background?.edgeNonWhiteVisibleRatio || 0) <= 0.015,
      expected: "edgeWhiteRatio >= 0.985 and edgeNonWhiteVisibleRatio <= 0.015",
      actual:
        `edgeWhiteRatio=${formatMetric(pixelQa.background?.edgeWhiteRatio)}, ` +
        `edgeNonWhiteVisibleRatio=${formatMetric(pixelQa.background?.edgeNonWhiteVisibleRatio)}`,
      severity: "warning",
    });
  }
  if (requested.has("subject_centered") && pixelQa.subject) {
    checks.push({
      name: "visual_check_subject_centered",
      ok:
        Math.abs(Number(pixelQa.subject.centerOffsetX || 0)) <= 0.08 &&
        Math.abs(Number(pixelQa.subject.centerOffsetY || 0)) <= 0.08,
      expected: "absolute center offsets <= 0.08 of image size",
      actual:
        `x=${formatMetric(pixelQa.subject.centerOffsetX)}, ` +
        `y=${formatMetric(pixelQa.subject.centerOffsetY)}`,
      severity: "warning",
    });
  }
  if (requested.has("safe_margins") && pixelQa.subject) {
    const margins = pixelQa.subject.margins || {};
    const minMargin = Math.min(
      Number(margins.left || 0),
      Number(margins.right || 0),
      Number(margins.top || 0),
      Number(margins.bottom || 0),
    );
    checks.push({
      name: "visual_check_safe_margins",
      ok: minMargin >= 0.03 && pixelQa.subject.touchesEdge === false,
      expected: "minimum subject margin >= 0.03 and no edge contact",
      actual: `minMargin=${formatMetric(minMargin)}, touchesEdge=${Boolean(pixelQa.subject.touchesEdge)}`,
      severity: "warning",
    });
  }
  if (requested.has("transparent_background")) {
    checks.push({
      name: "visual_check_transparent_background",
      ok: Number(pixelQa.alpha?.transparentPixelRatio || 0) >= 0.02,
      expected: "transparentPixelRatio >= 0.02",
      actual: `transparentPixelRatio=${formatMetric(pixelQa.alpha?.transparentPixelRatio)}`,
      severity: "warning",
    });
  }
  return checks;
}

function formatMetric(value) {
  return String(Math.round((Number(value) || 0) * 1_000_000) / 1_000_000);
}

function getCheckMessage(name) {
  const messages = {
    status_done: "Processing must finish successfully.",
    source_count_positive: "At least one source file must be present.",
    outputs_present: "At least one output must be produced.",
    expected_min_outputs: "The recipe expects more output files.",
    expected_output_kind: "Output type must match the selected profile.",
    zip_entries_manifested: "ZIP content should be represented in the result manifest.",
    zip_entry_names_available: "Every ZIP entry should have an output name.",
    zip_entry_sizes_available: "Every ZIP entry should have byte size metadata.",
    zip_entry_dimensions_available: "Every image ZIP entry should have output dimensions.",
    source_count_within_recipe_limit: "File count must stay within the recipe limit.",
    source_count_meets_rule_minimum: "Source file count is below the marketplace minimum.",
    source_count_meets_rule_recommendation: "Source file count is below the marketplace recommendation.",
    expected_output_format: "Output format must match the recipe.",
    allowed_output_formats: "Output format must be allowed by the sourced profile.",
    dimension_metadata_available: "Output dimensions must be available for this check.",
    expected_output_width: "Output width must match the recipe.",
    expected_output_height: "Output height must match the recipe.",
    square_output: "Output must be square.",
    max_output_width: "Output width is above the sourced maximum.",
    max_output_height: "Output height is above the sourced maximum.",
    min_output_width: "Output width is below the sourced minimum.",
    min_output_height: "Output height is below the sourced minimum.",
    max_output_size_kb: "Output file is larger than the target.",
    per_file_size_metadata_available: "Per-file size metadata is needed for archive QA.",
    output_name_prefix: "Output name does not match the recipe naming pattern.",
    marketplace_profile_declared: "The recipe declares its marketplace profile.",
    sourced_rule_profile_declared: "The QA profile has a sourced rule profile.",
    rule_source_declared: "The QA rule includes a source URL.",
    marketplace_min_dimension: "Output is below the marketplace minimum dimension.",
    long_side_dimension_metadata_available: "Long-side check needs output dimensions.",
    min_longest_side: "Longest side is below the sourced minimum.",
    max_longest_side: "Longest side is above the sourced maximum.",
    visual_check_white_background: "The selected recipe expects white background edges.",
    visual_check_subject_centered: "The selected recipe expects the detected subject to be centered.",
    visual_check_safe_margins: "The selected recipe expects the detected subject to keep clear margins.",
    visual_check_transparent_background: "The selected recipe expects transparent background pixels.",
    pixel_metrics_available: "Pixel-level metrics must be present to evaluate requested visual checks.",
  };
  if (name.startsWith("visual_check_unsupported_")) {
    return "Requested visual check is not supported by deterministic pixel QA.";
  }
  if (name.startsWith("visual_check_")) {
    return "Pixel-level visual check did not meet the threshold.";
  }
  if (name.startsWith("warning_absent_")) {
    return "A blocking warning is present in the result.";
  }
  if (name.startsWith("output_name_includes_")) {
    return "Output name is missing a required marker.";
  }
  return messages[name] || name.replace(/_/g, " ");
}

function getCheckRemediation(name) {
  if (name.includes("format")) return "Choose the matching Convert/Compress output format.";
  if (
    name.includes("width") ||
    name.includes("height") ||
    name.includes("dimension") ||
    name.includes("side") ||
    name === "square_output"
  ) {
    return "Use the matching Resize/Crop/platform preset and run again.";
  }
  if (name.includes("size_kb")) return "Lower quality, enable target KB, or use WebP/AVIF when allowed.";
  if (name.includes("source_count")) return "Adjust the batch size or add the required number of source files.";
  if (name.includes("output_name")) return "Use the recipe naming preset or batch rename pattern.";
  if (name === "visual_check_white_background") return "Use a white background preset when this recipe requires a white canvas.";
  if (name === "visual_check_subject_centered") return "Use Crop/Resize fit presets only when this recipe requires centered composition.";
  if (name === "visual_check_safe_margins") return "Increase padding or use Fit only when this recipe requires clear margins.";
  if (name === "visual_check_transparent_background") return "Export as PNG/WebP with transparent background enabled.";
  if (name === "pixel_metrics_available") return "Use a current browser result manifest with outputs[].pixelQa for visual checks.";
  if (name.startsWith("visual_check_unsupported_")) return "Remove this visual check or implement a measurable detector before relying on it.";
  if (name.startsWith("warning_absent_")) return "Change settings to remove the reported warning before delivery.";
  if (name.startsWith("zip_entry_") || name === "zip_entries_manifested") {
    return "Use current QuokkaPix batch output so each ZIP entry is recorded.";
  }
  return "Review the selected profile and rerun with corrected settings.";
}

function inferKindFromOutputs(outputs) {
  if (outputs.some((output) => String(output.format || "").toLowerCase() === "zip")) return "zip";
  if (outputs.some((output) => String(output.format || "").toLowerCase() === "pdf")) return "pdf";
  return outputs.length > 1 ? "batch" : "single";
}

function sanitizeCheckName(value) {
  return String(value || "value")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}
