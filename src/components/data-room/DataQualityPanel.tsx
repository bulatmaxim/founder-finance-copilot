import type { DataQualityIssue } from "@/lib/validations";

export function DataQualityPanel({
  issues,
  isLoading,
}: {
  issues: DataQualityIssue[];
  isLoading: boolean;
}) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Data Quality Validation</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Rule-based checks for missing fields, date issues, duplicates,
          negative revenue, and large month-over-month variance.
        </p>
      </div>

      <div className="p-5">
        {isLoading ? (
          <p className="text-sm text-neutral-500">Running validations...</p>
        ) : issues.length === 0 ? (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm font-medium text-neutral-950">
              No major validation issues detected for this reporting month.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="rounded-md border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
                      {issue.categoryLabel}
                    </p>
                    <p className="mt-2 text-sm font-medium text-neutral-950">
                      {issue.message}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      Suggested fix: {issue.suggestedFix}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {typeof issue.rowCount === "number" ? (
                      <span className="inline-flex h-7 items-center rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700">
                        {issue.rowCount} row{issue.rowCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    <SeverityBadge severity={issue.severity} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SeverityBadge({ severity }: { severity: DataQualityIssue["severity"] }) {
  const className =
    severity === "Critical"
      ? "border-neutral-950 bg-neutral-950 text-white"
      : severity === "Warning"
        ? "border-neutral-300 bg-neutral-100 text-neutral-950"
        : "border-neutral-200 bg-white text-neutral-600";

  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center rounded-md border px-2 text-xs font-medium ${className}`}
    >
      {severity}
    </span>
  );
}
