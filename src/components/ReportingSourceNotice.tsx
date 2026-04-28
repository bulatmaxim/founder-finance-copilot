import type React from "react";
import { type DataSourceMode } from "@/lib/localDataStore";

export function ReportingSourceNotice({
  reportingMonth,
  sources,
}: {
  reportingMonth?: string;
  sources: DataSourceMode[];
}) {
  const hasUnapproved = sources.includes("unapproved");
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
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      {children}
    </div>
  );
}
