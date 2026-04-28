import {
  formatReportingMonth,
  monthlyCloseCategories,
  type MonthlyCloseCategory,
  type MonthlyCloseItem,
  type MonthlyCloseStatus,
} from "@/lib/monthlyClose";

type MonthlyCloseChecklistProps = {
  items: MonthlyCloseItem[];
  reportingMonth: string;
  uploadingCategory: MonthlyCloseCategory | null;
  savingItemId: string | null;
  onUpload: (category: MonthlyCloseCategory, file: File) => void;
  onStatusChange: (
    item: MonthlyCloseItem,
    status: Exclude<MonthlyCloseStatus, "Not uploaded">,
  ) => void;
  onRemove: (item: MonthlyCloseItem) => void;
};

export function MonthlyCloseChecklist({
  items,
  reportingMonth,
  uploadingCategory,
  savingItemId,
  onUpload,
  onStatusChange,
  onRemove,
}: MonthlyCloseChecklistProps) {
  const itemByCategory = new Map(
    items.map((item) => [item.file_category, item]),
  );

  return (
    <section className="premium-card overflow-hidden rounded-2xl">
      <div className="premium-panel-header px-5 py-4">
        <h2 className="text-base font-semibold text-slate-50">Monthly Close Checklist</h2>
        <p className="mt-1 text-sm text-slate-400">
          Required finance files for {formatReportingMonth(reportingMonth)}.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="p-5">
          <p className="text-sm text-slate-400">
            No files have been uploaded for this reporting month yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-white/10 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">File category</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">File name</th>
                <th className="px-4 py-3 font-medium">Last uploaded</th>
                <th className="px-4 py-3 font-medium">Validation</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {monthlyCloseCategories.map((category) => {
                const item = itemByCategory.get(category.id);

                if (!item) {
                  return null;
                }

                const isUploading = uploadingCategory === category.id;
                const isSaving = savingItemId === item.id;
                const canReview = item.status !== "Not uploaded";
                const canApprove = item.status !== "Not uploaded";
                const hasUploadedFile = Boolean(item.uploaded_file_id);

                return (
                  <tr key={category.id} className="border-b border-white/10 align-top">
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-100">{category.title}</p>
                    </td>
                    <td className="max-w-xs px-4 py-4 text-slate-400">
                      {category.description}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={item.status} />
                      {item.approved_at ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Approved {formatDateTime(item.approved_at)}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-w-[220px] px-4 py-4 text-slate-300">
                      <span className="break-words">
                        {item.file_name || "No file uploaded"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-400">
                      {formatDateTime(item.uploaded_at)}
                    </td>
                    <td className="px-4 py-4">
                      <ValidationBadge item={item} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-medium text-slate-100 hover:border-sky-300/30 hover:bg-sky-300/10">
                          {isUploading
                            ? "Uploading..."
                            : hasUploadedFile
                              ? "Replace file"
                              : "Upload"}
                          <input
                            type="file"
                            accept=".csv,text/csv"
                            disabled={isUploading || isSaving}
                            onChange={(event) => {
                              const file = event.target.files?.[0];

                              if (file) {
                                onUpload(category.id, file);
                              }

                              event.target.value = "";
                            }}
                            className="sr-only"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={!canReview || isSaving}
                          onClick={() => onStatusChange(item, "Needs review")}
                          className="h-9 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-medium text-slate-100 hover:border-sky-300/30 hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:text-slate-600"
                        >
                          Needs Review
                        </button>
                        <button
                          type="button"
                          disabled={!canApprove || isSaving}
                          onClick={() => onStatusChange(item, "Approved")}
                          className="h-9 rounded-xl bg-neutral-950 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                          {isSaving ? "Saving..." : "Approve"}
                        </button>
                        {hasUploadedFile ? (
                          <button
                            type="button"
                            disabled={isSaving || isUploading}
                            onClick={() => onRemove(item)}
                            className="h-9 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-medium text-slate-100 hover:border-sky-300/30 hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:text-slate-600"
                          >
                            Remove file
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: MonthlyCloseStatus }) {
  const className =
    status === "Approved"
      ? "premium-success"
      : status === "Needs review"
        ? "premium-warning"
        : "premium-pill";

  return (
    <span
      className={`inline-flex h-7 items-center rounded-xl border px-2 text-xs font-medium ${className}`}
    >
      {status}
    </span>
  );
}

function ValidationBadge({ item }: { item: MonthlyCloseItem }) {
  const issues = item.validation_summary?.issues ?? [];
  const criticalCount = issues.filter((issue) => issue.severity === "Critical").length;
  const warningCount = issues.filter((issue) => issue.severity === "Warning").length;
  const infoCount = issues.filter((issue) => issue.severity === "Info").length;

  const label = criticalCount > 0
    ? `${criticalCount} critical issue${criticalCount === 1 ? "" : "s"}`
    : warningCount > 0
      ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
      : infoCount > 0
        ? "Info"
        : item.status === "Not uploaded"
          ? "Not checked"
          : "No issues";

  return (
    <span className="premium-pill inline-flex h-7 items-center rounded-xl px-2 text-xs font-medium">
      {label}
    </span>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not uploaded";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
