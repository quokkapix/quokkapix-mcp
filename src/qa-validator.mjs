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

  for (const visualCheck of qa.visualChecks || []) {
    addCheck(checks, `visual_check_${visualCheck}`, false, {
      expected: "pixel-level browser visual QA",
      actual:
        "not available from metadata-only manifest; use a future pixel analyzer for white background, subject centering, margins or background-removal quality",
      severity: "info",
    });
  }

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
  });
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
