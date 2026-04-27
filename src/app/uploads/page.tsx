"use client";

import { useState } from "react";
import { sampleCompany } from "@/data/sampleCompany";
import {
  dataQualityChecks,
  importHistory,
  uploadCards,
  type UploadStatus,
} from "@/data/sampleUploads";

const reviewStatuses: UploadStatus[] = ["Needs Review", "Needs Mapping", "Failed"];

export default function UploadsPage() {
  const [message, setMessage] = useState("");
  const totalFilesUploaded = importHistory.length;
  const filesApproved = importHistory.filter(
    (row) => row.status === "Approved",
  ).length;
  const filesNeedingReview = importHistory.filter((row) =>
    reviewStatuses.includes(row.status),
  ).length;
  const openDataIssues = importHistory.reduce(
    (total, row) => total + row.issuesFound,
    0,
  );

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Uploads
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Financial Data Intake
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Local prototype for how {sampleCompany.name} will upload accounting,
          cash, payroll, revenue, and pipeline data before it flows into
          dashboards and recommendations.
        </p>
      </div>

      {message ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total files uploaded" value={totalFilesUploaded} />
        <SummaryCard label="Files approved" value={filesApproved} />
        <SummaryCard label="Files needing review" value={filesNeedingReview} />
        <SummaryCard label="Open data issues" value={openDataIssues} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {uploadCards.map((card) => (
          <article
            key={card.dataType}
            className="rounded-md border border-neutral-200 bg-white p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">{card.dataType}</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {card.description}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
                {card.requirement}
              </span>
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500">Last uploaded</span>
                <span className="font-medium text-neutral-950">
                  {card.lastUploadedDate}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500">Status</span>
                <StatusBadge status={card.status} />
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setMessage(
                  "File upload parsing will be added in a future step.",
                )
              }
              className="mt-5 h-10 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Upload File
            </button>
          </article>
        ))}
      </div>

      <ImportHistoryTable />
      <DataQualityChecklist />
    </section>
  );
}

function ImportHistoryTable() {
  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Import History</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Recent local sample files and validation results.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">File Name</th>
              <th className="px-4 py-3 font-medium">Data Type</th>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Uploaded By</th>
              <th className="px-4 py-3 font-medium">Uploaded Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Issues Found</th>
            </tr>
          </thead>
          <tbody>
            {importHistory.map((row) => (
              <tr key={row.fileName} className="border-b border-neutral-100">
                <td className="px-4 py-3 font-medium">{row.fileName}</td>
                <td className="px-4 py-3">{row.dataType}</td>
                <td className="px-4 py-3">{row.period}</td>
                <td className="px-4 py-3">{row.uploadedBy}</td>
                <td className="px-4 py-3">{row.uploadedDate}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3">{row.issuesFound}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DataQualityChecklist() {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <h2 className="text-base font-semibold">Data Quality Checklist</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {dataQualityChecks.map((item) => (
          <article key={item.check} className="rounded-md border border-neutral-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-neutral-950">{item.check}</p>
              <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
                {item.status}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              {item.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
      {status}
    </span>
  );
}
