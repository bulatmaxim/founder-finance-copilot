"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  analyzeSmartUpload,
  categoryTitle,
  confirmSmartUpload,
  smartUploadSummary,
  type SmartUploadDetectedCategory,
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
  const [selectedCategory, setSelectedCategory] =
    useState<SmartUploadDetectedCategory>("unknown");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isStaging, setIsStaging] = useState(false);

  async function handleFile(fileToAnalyze: File) {
    setFile(fileToAnalyze);
    setReview(null);
    setIsAnalyzing(true);

    try {
      const nextReview = await analyzeSmartUpload(fileToAnalyze);
      setReview(nextReview);
      setSelectedCategory(nextReview.detectedCategory);
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

  async function handleConfirm() {
    if (!file || !review || selectedCategory === "unknown") {
      onNotify?.("info", "Choose a file type before staging.");
      return;
    }

    setIsStaging(true);

    try {
      await confirmSmartUpload({
        file,
        reportingMonth,
        category: selectedCategory,
      });
      onNotify?.(
        "success",
        "Smart Upload staged.",
        `${file.name} was staged as ${categoryTitle(selectedCategory)} for ${formatReportingMonth(reportingMonth)}.`,
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
        accept=".csv,text/csv"
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
            <p className="mt-1 text-sm leading-6 text-[color:var(--text-muted)]">
              Upload any finance CSV. The app detects the file type, suggests
              column mapping, and stages rows before reporting uses them.
            </p>
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                Import Assistant Review
              </p>
              <h3 className="mt-2 text-lg font-semibold text-[color:var(--text-strong)]">
                {review.fileName}
              </h3>
              <div className="mt-3 grid gap-2 text-sm text-[color:var(--text-soft)]">
                {smartUploadSummary(review, reportingMonth).map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p>{review.aiUsed ? "AI assisted classification." : "Rule-based classification."}</p>
              </div>
            </div>
            <label className="min-w-64 text-sm font-medium text-[color:var(--text-soft)]">
              Change File Type
              <select
                value={selectedCategory}
                onChange={(event) =>
                  setSelectedCategory(event.target.value as SmartUploadDetectedCategory)
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

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Suggested Mapping</p>
              <div className="mt-2 grid gap-2 text-sm text-[color:var(--text-soft)]">
                {Object.entries(review.suggestedColumnMapping).map(([target, source]) => (
                  <p key={target}>
                    {labelForMappingTarget(target)} {" -> "} {source || "Not detected"}
                  </p>
                ))}
              </div>
            </div>
            <div>
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
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-[color:var(--text-muted)]">
            {review.reasoning}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isStaging || selectedCategory === "unknown"}
              onClick={() => void handleConfirm()}
              className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStaging ? "Staging..." : "Confirm and Stage"}
            </button>
            <Link
              href={`/data-entry?month=${reportingMonth}&category=${selectedCategory === "unknown" ? "actuals" : selectedCategory}`}
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
        </div>
      ) : null}
    </section>
  );
}

function labelForMappingTarget(target: string) {
  const labels: Record<string, string> = {
    period: "Date column",
    account: "Account column",
    amount: "Amount column",
    department: "Department column",
    category: "Category column",
    notes: "Notes column",
  };

  return labels[target] ?? target;
}
