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
    <section className="rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Monthly Close Checklist</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Required finance files for {formatReportingMonth(reportingMonth)}.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="p-5">
          <p className="text-sm text-neutral-500">
            No files have been uploaded for this reporting month yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
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
                  <tr key={category.id} className="border-b border-neutral-100 align-top">
                    <td className="px-4 py-4">
                      <p className="font-medium text-neutral-950">{category.title}</p>
                    </td>
                    <td className="max-w-xs px-4 py-4 text-neutral-600">
                      {category.description}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={item.status} />
                      {item.approved_at ? (
                        <p className="mt-2 text-xs text-neutral-500">
                          Approved {formatDateTime(item.approved_at)}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-w-[220px] px-4 py-4 text-neutral-700">
                      <span className="break-words">
                        {item.file_name || "No file uploaded"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-neutral-600">
                      {formatDateTime(item.uploaded_at)}
                    </td>
                    <td className="px-4 py-4">
                      <ValidationBadge item={item} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-950 hover:bg-neutral-50">
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
                          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-950 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
                        >
                          Needs Review
                        </button>
                        <button
                          type="button"
                          disabled={!canApprove || isSaving}
                          onClick={() => onStatusChange(item, "Approved")}
                          className="h-9 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                        >
                          {isSaving ? "Saving..." : "Approve"}
                        </button>
                        {hasUploadedFile ? (
                          <button
                            type="button"
                            disabled={isSaving || isUploading}
                            onClick={() => onRemove(item)}
                            className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-950 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
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
      ? "border-neutral-950 bg-neutral-950 text-white"
      : status === "Needs review"
        ? "border-neutral-300 bg-neutral-100 text-neutral-950"
        : "border-neutral-200 bg-white text-neutral-700";

  return (
    <span
      className={`inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium ${className}`}
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
    <span className="inline-flex h-7 items-center rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700">
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
