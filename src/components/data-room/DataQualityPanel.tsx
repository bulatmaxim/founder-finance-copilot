import type { DataQualityIssue } from "@/lib/validations";

export function DataQualityPanel({
  issues,
  isLoading,
}: {
  issues: DataQualityIssue[];
  isLoading: boolean;
}) {
  return (
    <section className="premium-card overflow-hidden rounded-2xl">
      <div className="premium-panel-header px-5 py-4">
        <h2 className="text-base font-semibold text-slate-50">Data Quality Validation</h2>
        <p className="mt-1 text-sm text-slate-400">
          Rule-based checks for missing fields, date issues, duplicates,
          negative revenue, and large month-over-month variance.
        </p>
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="premium-skeleton h-16 rounded-2xl border border-white/10" />
        ) : issues.length === 0 ? (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
            <p className="text-sm font-medium text-emerald-100">
              No major validation issues detected for this reporting month.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                      {issue.categoryLabel}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-100">
                      {issue.message}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Suggested fix: {issue.suggestedFix}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {typeof issue.rowCount === "number" ? (
                      <span className="premium-pill inline-flex h-7 items-center rounded-xl px-2 text-xs font-medium">
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
      ? "premium-danger"
      : severity === "Warning"
        ? "premium-warning"
        : "premium-pill";

  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center rounded-xl border px-2 text-xs font-medium ${className}`}
    >
      {severity}
    </span>
  );
}
