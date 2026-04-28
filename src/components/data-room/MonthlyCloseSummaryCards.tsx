import type { MonthlyCloseItem } from "@/lib/monthlyClose";

export function MonthlyCloseSummaryCards({ items }: { items: MonthlyCloseItem[] }) {
  const totalFiles = items.length;
  const uploadedFiles = items.filter((item) => item.status !== "Not uploaded").length;
  const approvedFiles = items.filter((item) => item.status === "Approved").length;
  const needsReview = items.filter((item) => item.status === "Needs review").length;
  const lastUpload = items
    .map((item) => item.uploaded_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Files Uploaded" value={`${uploadedFiles} / ${totalFiles}`} />
      <SummaryCard label="Files Approved" value={`${approvedFiles} / ${totalFiles}`} />
      <SummaryCard label="Needs Review" value={needsReview.toString()} />
      <SummaryCard label="Last Upload" value={formatDate(lastUpload)} />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="premium-card premium-card-hover rounded-2xl p-5">
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
        {value}
      </p>
    </article>
  );
}

function formatDate(value: string | undefined) {
  if (!value) {
    return "No uploads";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
