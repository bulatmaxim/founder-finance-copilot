"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  analyzeSmartUpload,
  categoryTitle,
  confirmSmartUpload,
  missingSmartUploadRequirements,
  smartUploadStandardFields,
  smartUploadSummary,
  updateSmartUploadColumnMapping,
  updateSmartUploadMappingSuggestion,
  type SmartUploadDetectedCategory,
  type SmartUploadStandardField,
  type SmartUploadReview,
} from "@/lib/smartUpload";
import {
  formatReportingMonth,
  monthlyCloseCategories,
} from "@/lib/monthlyClose";

type Props = {
  reportingMonth: string;
  compact?: boolean;
  onComplete?: () => Promise<void> | void;
  onNotify?: (type: "success" | "error" | "info" | "warning", title: string, detail?: string) => void;
};

export function SmartUploadAssistant({
  reportingMonth,
  compact = false,
  onComplete,
  onNotify,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<SmartUploadReview | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);

  async function handleFile(fileToAnalyze: File) {
    setFile(fileToAnalyze);
    setReview(null);
    setIsAnalyzing(true);

    try {
      const nextReview = await analyzeSmartUpload(fileToAnalyze);
      setReview(nextReview);
      setSelectedSuggestionIds([]);
      onNotify?.(
        nextReview.confidence === "High" ? "success" : "warning",
        "Smart Upload analyzed the file.",
        `${categoryTitle(nextReview.detectedCategory)} detected with ${nextReview.confidence.toLowerCase()} confidence.`,
      );
    } catch (error) {
      console.error("Smart Upload analysis failed", error);
      onNotify?.(
        "error",
        "Smart Upload could not analyze the file.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsAnalyzing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleSheetChange(sheetName: string) {
    if (!file) {
      return;
    }

    setIsAnalyzing(true);

    try {
      const nextReview = await analyzeSmartUpload(file, { sheetName });
      setReview(nextReview);
      setSelectedSuggestionIds([]);
      onNotify?.(
        nextReview.confidence === "High" ? "success" : "warning",
        "Smart Upload re-analyzed the selected sheet.",
        `${sheetName}: ${categoryTitle(nextReview.detectedCategory)} detected with ${nextReview.confidence.toLowerCase()} confidence.`,
      );
    } catch (error) {
      console.error("Smart Upload sheet analysis failed", error);
      onNotify?.(
        "error",
        "Smart Upload could not analyze that sheet.",
        error instanceof Error ? error.message : "Try another sheet.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function toggleSuggestionSelection(suggestionId: string, checked: boolean) {
    setSelectedSuggestionIds((current) =>
      checked
        ? [...new Set([...current, suggestionId])]
        : current.filter((id) => id !== suggestionId),
    );
  }

  function confirmSelectedSuggestions() {
    setReview((current) => {
      if (!current) return current;

      return selectedSuggestionIds.reduce(
        (nextReview, suggestionId) =>
          updateSmartUploadMappingSuggestion(nextReview, suggestionId, { action: "Confirm" }),
        current,
      );
    });
    setSelectedSuggestionIds([]);
  }

  async function handleConfirm() {
    if (!file || !review || review.detectedCategory === "unknown") {
      onNotify?.("info", "Choose a file type before staging.");
      return;
    }

    const missing = missingSmartUploadRequirements(review);

    if (missing.length > 0) {
      onNotify?.(
        "warning",
        "Confirm required mappings first.",
        `Missing: ${missing.join(", ")}.`,
      );
      return;
    }

    setIsStaging(true);

    try {
      await confirmSmartUpload({
        file,
        reportingMonth,
        review,
      });
      onNotify?.(
        "success",
        "Smart Upload staged.",
        `${file.name} was staged as ${categoryTitle(review.detectedCategory)} for ${formatReportingMonth(reportingMonth)}.`,
      );
      setFile(null);
      setReview(null);
      await onComplete?.();
    } catch (error) {
      console.error("Smart Upload staging failed", error);
      onNotify?.(
        "error",
        "Smart Upload could not stage the file.",
        error instanceof Error ? error.message : "Check the file and try again.",
      );
    } finally {
      setIsStaging(false);
    }
  }

  return (
    <section className={compact ? "" : "premium-card rounded-2xl p-5"}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) void handleFile(selected);
        }}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[color:var(--text-strong)]">
            Smart Upload
          </p>
          {!compact ? (
            <>
              <p className="mt-1 text-sm leading-6 text-[color:var(--text-muted)]">
                Upload any finance file. The app detects the file type, suggests
                column mapping, and stages rows before reporting uses them.
              </p>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                Supported formats: CSV, XLSX, XLS.
              </p>
            </>
          ) : null}
        </div>
        <button
          type="button"
          disabled={isAnalyzing || isStaging}
          onClick={() => inputRef.current?.click()}
          className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAnalyzing ? "Analyzing..." : "Smart Upload"}
        </button>
      </div>

      {review ? (
        <div className="mt-4 rounded-2xl border border-[color:var(--line-soft)] bg-[color:var(--surface-soft)] p-4">
          {(() => {
            const missing = missingSmartUploadRequirements(review);

            return (
              <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                Confirm Upload Mapping
              </p>
              <h3 className="mt-2 text-lg font-semibold text-[color:var(--text-strong)]">
                {review.fileName}
              </h3>
              <div className="mt-3 grid gap-2 text-sm text-[color:var(--text-soft)]">
                {smartUploadSummary(review, reportingMonth).map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p>{review.aiUsed ? "AI assisted this mapping. Please confirm before staging." : "Rule-based mapping. Please confirm before staging."}</p>
                <p>
                  New codes are not considered mapped until confirmed. This protects reporting,
                  forecasts, and AI analysis from misclassification.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[32rem]">
              {review.sheetNames.length > 1 ? (
                <label className="text-sm font-medium text-[color:var(--text-soft)]">
                  Select Sheet
                  <select
                    value={review.selectedSheetName ?? ""}
                    disabled={isAnalyzing}
                    onChange={(event) => void handleSheetChange(event.target.value)}
                    className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                  >
                    {review.sheetNames.map((sheetName) => (
                      <option key={sheetName} value={sheetName}>
                        {sheetName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="text-sm font-medium text-[color:var(--text-soft)]">
                Change File Type
                <select
                  value={review.detectedCategory}
                  onChange={(event) =>
                    setReview((current) =>
                      current
                        ? {
                            ...current,
                            detectedCategory: event.target.value as SmartUploadDetectedCategory,
                          }
                        : current,
                    )
                  }
                  className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  <option value="unknown">Unknown / Needs Review</option>
                  {monthlyCloseCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {review.selectedSheetName ? (
            <section className="premium-pill mt-4 grid gap-3 rounded-2xl px-4 py-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">Selected sheet</p>
                <p className="mt-1 font-semibold text-[color:var(--text-strong)]">{review.selectedSheetName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">Workbook sheets</p>
                <p className="mt-1 font-semibold text-[color:var(--text-strong)]">{review.sheetCount}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">Rows</p>
                <p className="mt-1 font-semibold text-[color:var(--text-strong)]">{review.sheetRowCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">Columns</p>
                <p className="mt-1 font-semibold text-[color:var(--text-strong)]">{review.sheetColumnCount.toLocaleString()}</p>
              </div>
            </section>
          ) : null}

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <section className="rounded-2xl border border-[color:var(--line-soft)] p-4">
              <p className="text-sm font-semibold text-[color:var(--text-strong)]">Column Mapping</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                Map each source column to the standard field the app should use.
              </p>
              <div className="mt-3 max-h-72 overflow-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Source column</th>
                      <th className="py-2 font-medium">Standard field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.headers.map((header) => (
                      <tr key={header} className="border-t border-[color:var(--line-soft)]">
                        <td className="py-2 pr-3 text-[color:var(--text-soft)]">{header}</td>
                        <td className="py-2">
                          <select
                            value={review.columnMapping[header] ?? "Ignore"}
                            onChange={(event) =>
                              setReview((current) =>
                                current
                                  ? updateSmartUploadColumnMapping(
                                      current,
                                      header,
                                      event.target.value as SmartUploadStandardField,
                                    )
                                  : current,
                              )
                            }
                            className="h-9 w-full rounded-lg border px-2 text-sm"
                          >
                            {smartUploadStandardFields.map((field) => (
                              <option key={field} value={field}>{field}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="rounded-2xl border border-[color:var(--line-soft)] p-4">
              <p className="text-sm font-semibold">Warnings</p>
              {review.warnings.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-[color:var(--text-soft)]">
                  {review.warnings.map((warning) => (
                    <li key={warning} className="ml-4 list-disc">
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                  No major warnings detected.
                </p>
              )}
              {missing.length > 0 ? (
                <div className="premium-warning mt-4 rounded-2xl border px-3 py-2 text-sm">
                  Required before staging: {missing.join(", ")}.
                </div>
              ) : (
                <div className="premium-success mt-4 rounded-2xl border px-3 py-2 text-sm">
                  Required mappings are complete. This will stage data for review, not approval.
                </div>
              )}
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-[color:var(--line-soft)] p-4">
            <p className="text-sm font-semibold text-[color:var(--text-strong)]">
              Suggested Company Mapping
            </p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              AI suggested this mapping based on the uploaded code and description. Confirm before it
              becomes part of Company Mapping. Items marked Leave Unmapped remain staged and visible
              in Unmapped Imports.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={selectedSuggestionIds.length === 0}
                onClick={confirmSelectedSuggestions}
                className="premium-pill h-9 rounded-xl px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm selected mappings
              </button>
              <span className="text-xs text-[color:var(--text-muted)]">
                {selectedSuggestionIds.length} selected
              </span>
            </div>
            <div className="mt-3 max-h-80 overflow-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Select</th>
                    <th className="py-2 pr-3 font-medium">Mapping state</th>
                    <th className="py-2 pr-3 font-medium">Raw value</th>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Department</th>
                    <th className="py-2 pr-3 font-medium">FP&A category</th>
                    <th className="py-2 pr-3 font-medium">Confidence</th>
                    <th className="py-2 pr-3 font-medium">Reason</th>
                    <th className="py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {review.suggestedMappings.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-[color:var(--text-muted)]">
                        No account mappings detected in this file.
                      </td>
                    </tr>
                  ) : (
                    review.suggestedMappings.map((suggestion) => (
                      <tr key={suggestion.id} className="border-t border-[color:var(--line-soft)]">
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            checked={selectedSuggestionIds.includes(suggestion.id)}
                            onChange={(event) => toggleSuggestionSelection(suggestion.id, event.target.checked)}
                            disabled={suggestion.matchedExisting}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <span className="premium-pill rounded-full px-2 py-1 text-xs">
                            {suggestion.mappingState}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-[color:var(--text-soft)]">{suggestion.rawValue}</td>
                        <td className="py-2 pr-3">
                          <input
                            value={suggestion.accountCode}
                            onChange={(event) =>
                              setReview((current) =>
                                current
                                  ? updateSmartUploadMappingSuggestion(current, suggestion.id, { accountCode: event.target.value })
                                  : current,
                              )
                            }
                            className="h-9 w-24 rounded-lg border px-2 text-sm"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={suggestion.accountName}
                            onChange={(event) =>
                              setReview((current) =>
                                current
                                  ? updateSmartUploadMappingSuggestion(current, suggestion.id, { accountName: event.target.value })
                                  : current,
                              )
                            }
                            className="h-9 w-44 rounded-lg border px-2 text-sm"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={suggestion.departmentName}
                            onChange={(event) =>
                              setReview((current) =>
                                current
                                  ? updateSmartUploadMappingSuggestion(current, suggestion.id, { departmentName: event.target.value })
                                  : current,
                              )
                            }
                            className="h-9 w-44 rounded-lg border px-2 text-sm"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={suggestion.normalizedCategory}
                            onChange={(event) =>
                              setReview((current) =>
                                current
                                  ? updateSmartUploadMappingSuggestion(current, suggestion.id, { normalizedCategory: event.target.value })
                                  : current,
                              )
                            }
                            className="h-9 w-52 rounded-lg border px-2 text-sm"
                          />
                        </td>
                        <td className="py-2 pr-3 text-[color:var(--text-soft)]">{suggestion.confidence}</td>
                        <td className="max-w-64 py-2 pr-3 text-xs leading-5 text-[color:var(--text-muted)]">{suggestion.reason}</td>
                        <td className="py-2">
                          <select
                            value={suggestion.action}
                            onChange={(event) =>
                              setReview((current) =>
                                current
                                  ? updateSmartUploadMappingSuggestion(
                                      current,
                                      suggestion.id,
                                      { action: event.target.value as typeof suggestion.action },
                                    )
                                  : current,
                              )
                            }
                            className="h-9 rounded-lg border px-2 text-sm"
                          >
                            <option value="Confirm">Confirm Mapping</option>
                            <option value="Needs Review">Leave Unmapped</option>
                            <option value="Ignore">Ignore</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-[color:var(--line-soft)] p-4">
            <p className="text-sm font-semibold text-[color:var(--text-strong)]">
              Transformed Preview
            </p>
            <div className="mt-3 overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Period</th>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Department</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 font-medium">Mapping</th>
                  </tr>
                </thead>
                <tbody>
                  {review.transformedRows.slice(0, 15).map((row) => (
                    <tr key={`${row.sourceRowNumber}-${row.accountName}-${row.period}`} className="border-t border-[color:var(--line-soft)]">
                      <td className="py-2 pr-3 text-[color:var(--text-soft)]">{row.period || "Missing"}</td>
                      <td className="py-2 pr-3 text-[color:var(--text-soft)]">{row.accountCode || "-"}</td>
                      <td className="py-2 pr-3 text-[color:var(--text-soft)]">{row.accountName || "-"}</td>
                      <td className="py-2 pr-3 text-[color:var(--text-soft)]">{row.department || "-"}</td>
                      <td className="py-2 pr-3 text-[color:var(--text-soft)]">{row.category || "-"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--text-soft)]">{formatAmount(row.amount)}</td>
                      <td className="py-2 text-[color:var(--text-soft)]">{row.mappingStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="mt-4 text-sm leading-6 text-[color:var(--text-muted)]">
            {review.reasoning} This upload will not affect reports until it is
            reviewed and approved in Data Room.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isStaging || missing.length > 0}
              onClick={() => void handleConfirm()}
              className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStaging ? "Staging..." : "Confirm Mapping and Stage"}
            </button>
            <Link
              href={`/data-entry?month=${reportingMonth}&category=${review.detectedCategory === "unknown" ? "actuals" : review.detectedCategory}`}
              className="flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
            >
              Send to Data Entry
            </Link>
            <button
              type="button"
              onClick={() => {
                setReview(null);
                setFile(null);
              }}
              className="h-10 rounded-md border border-neutral-300 px-4 text-sm font-medium"
            >
              Cancel Upload
            </button>
          </div>
              </>
            );
          })()}
        </div>
      ) : null}
    </section>
  );
}

function formatAmount(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
