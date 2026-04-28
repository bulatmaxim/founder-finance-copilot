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
                className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <p className="text-sm leading-6 text-neutral-700">{issue.message}</p>
                <SeverityBadge severity={issue.severity} />
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
