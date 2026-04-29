import type React from "react";
import { isUnapprovedDataSource, type DataSourceMode } from "@/lib/localDataStore";

export function ReportingSourceNotice({
  reportingMonth,
  sources,
}: {
  reportingMonth?: string;
  sources: DataSourceMode[];
}) {
  const hasUnapproved = sources.some(isUnapprovedDataSource);
  const hasCompanyData = sources.some((source) => source !== "sample");
  const hasSample = sources.includes("sample");

  if (hasUnapproved) {
    return (
      <Notice>
        Monthly close is not complete{reportingMonth ? ` for ${reportingMonth}` : ""}.
        Some figures may be incomplete or pending review.
      </Notice>
    );
  }

  if (!hasCompanyData) {
    return (
      <Notice>
        Source: Demo sample data. Connect approved company uploads in the Data
        Room before using this for operating decisions.
      </Notice>
    );
  }

  if (hasSample) {
    return (
      <Notice>
        Some supporting figures are using demo sample data because approved
        company uploads are not available for every required file.
      </Notice>
    );
  }

  return null;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="premium-notice rounded-2xl px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,0.7)]" />
        <span>{children}</span>
      </div>
    </div>
  );
}
