"use client";

import { useState } from "react";
import { sampleCompany } from "@/data/sampleCompany";
import {
  dataQualityChecks,
  importHistory,
  uploadCards,
  type UploadCard,
  type UploadStatus,
} from "@/data/sampleUploads";
import {
  parsePnlActualsCsv,
  pnlActualsSampleCsv,
} from "@/lib/csvParser";
import { formatCurrency } from "@/lib/formatting";
import type {
  ParsedFinancialCsv,
  UploadedFinancialRow,
  UploadValidationStatus,
} from "@/types/financial";

const reviewStatuses: UploadStatus[] = ["Needs Review", "Needs Mapping", "Failed"];

export default function UploadsPage() {
  const [message, setMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedCsv, setParsedCsv] = useState<ParsedFinancialCsv | null>(null);
  const [sessionRows, setSessionRows] = useState<UploadedFinancialRow[]>([]);
  const [loadedAt, setLoadedAt] = useState("");
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

      {toastMessage ? (
        <div className="rounded-md border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-950 shadow-sm">
          {toastMessage}
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

            {card.dataType === "P&L Actuals" ? (
              <PnlActualsUploadControls
                card={card}
                isParsing={isParsing}
                selectedFileName={selectedFileName}
                parsedCsv={parsedCsv}
                onFileSelected={async (file) => {
                  await handlePnlActualsUpload(file, {
                    setIsParsing,
                    setMessage,
                    setParsedCsv,
                    setSelectedFileName,
                    setSessionRows,
                    setLoadedAt,
                  });
                }}
                onDownloadSample={() => downloadSampleCsv()}
                onUseUploadedData={() =>
                  handleUseUploadedData({
                    parsedCsv,
                    setLoadedAt,
                    setMessage,
                    setSessionRows,
                    setToastMessage,
                  })
                }
              />
            ) : (
              <button
                type="button"
                onClick={() =>
                  setMessage(
                    `${card.dataType} upload remains placeholder functionality for this prototype.`,
                  )
                }
                className="mt-5 h-10 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Upload File
              </button>
            )}
          </article>
        ))}
      </div>

      <SessionDataLoaded rows={sessionRows} loadedAt={loadedAt} />
      <PnlActualsPreview parsedCsv={parsedCsv} sessionRows={sessionRows} />

      <ImportHistoryTable />
      <DataQualityChecklist />
    </section>
  );
}

async function handlePnlActualsUpload(
  file: File,
  setters: {
    setIsParsing: (isParsing: boolean) => void;
    setMessage: (message: string) => void;
    setParsedCsv: (parsedCsv: ParsedFinancialCsv | null) => void;
    setSelectedFileName: (fileName: string) => void;
    setSessionRows: (rows: UploadedFinancialRow[]) => void;
    setLoadedAt: (loadedAt: string) => void;
  },
) {
  setters.setIsParsing(true);
  setters.setSelectedFileName(file.name);
  setters.setParsedCsv(null);
  setters.setSessionRows([]);
  setters.setLoadedAt("");
  setters.setMessage("Parsing local P&L Actuals CSV...");

  try {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      throw new Error("Please upload a .csv file for P&L Actuals.");
    }

    const csvText = await file.text();
    const parsedCsv = parsePnlActualsCsv(csvText);
    const { totalRows, validRows, warningRows, errorRows } = parsedCsv.summary;

    setters.setParsedCsv(parsedCsv);
    setters.setMessage(
      `Parsed ${totalRows} rows: ${validRows} valid, ${warningRows} warnings, ${errorRows} errors.`,
    );
  } catch (error) {
    console.error("P&L Actuals CSV parsing failed", error);
    setters.setParsedCsv(null);
    setters.setMessage(
      error instanceof Error
        ? `CSV parsing failed: ${error.message}`
        : "CSV parsing failed: unknown local parsing error.",
    );
  } finally {
    setters.setIsParsing(false);
  }
}

function handleUseUploadedData({
  parsedCsv,
  setLoadedAt,
  setMessage,
  setSessionRows,
  setToastMessage,
}: {
  parsedCsv: ParsedFinancialCsv | null;
  setLoadedAt: (loadedAt: string) => void;
  setMessage: (message: string) => void;
  setSessionRows: (rows: UploadedFinancialRow[]) => void;
  setToastMessage: (message: string) => void;
}) {
  console.log("Use Uploaded Data clicked");

  if (!parsedCsv) {
    console.log("Parsed rows count: 0");
    console.log("Validation errors count: 0");
    console.log("Data loaded successfully: false");
    setMessage("Please upload a CSV file before using data.");
    return;
  }

  const parsedRowsCount = parsedCsv.rows.length;
  const validationErrorsCount = parsedCsv.summary.errorRows + parsedCsv.errors.length;

  console.log("Parsed rows count:", parsedRowsCount);
  console.log("Validation errors count:", validationErrorsCount);

  if (parsedRowsCount === 0) {
    console.log("Data loaded successfully: false");
    setMessage("Please upload a CSV file before using data.");
    return;
  }

  if (validationErrorsCount > 0) {
    console.log("Data loaded successfully: false");
    setMessage(
      "Uploaded data has validation errors. Please fix them before using this data.",
    );
    return;
  }

  const loadedTimestamp = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  setSessionRows(parsedCsv.rows);
  setLoadedAt(loadedTimestamp);
  setMessage(
    "Uploaded data is loaded for this session only. Database storage will be added later.",
  );
  setToastMessage("Uploaded data loaded for this session.");
  window.setTimeout(() => setToastMessage(""), 4000);
  console.log("Data loaded successfully: true");
}

function downloadSampleCsv() {
  const blob = new Blob([pnlActualsSampleCsv], {
    type: "text/csv;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "Acme_AI_PnL_Actuals_Sample.csv";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function PnlActualsUploadControls({
  card,
  isParsing,
  selectedFileName,
  parsedCsv,
  onFileSelected,
  onDownloadSample,
  onUseUploadedData,
}: {
  card: UploadCard;
  isParsing: boolean;
  selectedFileName: string;
  parsedCsv: ParsedFinancialCsv | null;
  onFileSelected: (file: File) => void;
  onDownloadSample: () => void;
  onUseUploadedData: () => void;
}) {
  return (
    <div className="mt-5 space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">
          Select CSV file
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={isParsing}
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onFileSelected(file);
            }

            event.target.value = "";
          }}
          className="mt-2 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 file:mr-3 file:rounded file:border-0 file:bg-neutral-950 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-400"
        />
      </label>

      {selectedFileName ? (
        <p className="text-xs text-neutral-500">Selected: {selectedFileName}</p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onDownloadSample}
          className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50"
        >
          Download Sample CSV
        </button>
        <button
          type="button"
          onClick={onUseUploadedData}
          disabled={isParsing}
          className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Use Uploaded Data
        </button>
      </div>

      {!parsedCsv ? (
        <p className="text-xs leading-5 text-neutral-500">
          Upload a CSV before using data.
        </p>
      ) : parsedCsv.summary.errorRows > 0 || parsedCsv.errors.length > 0 ? (
        <p className="text-xs leading-5 text-neutral-500">
          Resolve validation errors before loading this data into the session.
        </p>
      ) : parsedCsv.summary.totalRows === 0 ? (
        <p className="text-xs leading-5 text-neutral-500">
          No rows were parsed from this CSV.
        </p>
      ) : null}

      <p className="text-xs leading-5 text-neutral-500">
        {card.dataType} expects month, account, category, and amount columns.
      </p>
    </div>
  );
}

function SessionDataLoaded({
  rows,
  loadedAt,
}: {
  rows: UploadedFinancialRow[];
  loadedAt: string;
}) {
  if (rows.length === 0 || !loadedAt) {
    return null;
  }

  const months = [...new Set(rows.map((row) => row.month).filter(Boolean))].sort();
  const revenue = rows.reduce((total, row) => {
    if (row.amount === null || !isRevenueCategory(row.category)) {
      return total;
    }

    return total + row.amount;
  }, 0);
  const expenseNet = rows.reduce((total, row) => {
    if (row.amount === null || isRevenueCategory(row.category)) {
      return total;
    }

    return total + row.amount;
  }, 0);
  const netTotal = rows.reduce(
    (total, row) => total + (row.amount === null ? 0 : row.amount),
    0,
  );

  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold">Session Data Loaded</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Uploaded P&L actuals are available in local React state for this
            browser session.
          </p>
        </div>
        <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
          Loaded {loadedAt}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Loaded rows" value={rows.length} />
        <SummaryCard
          label="Loaded months"
          value={months.length > 0 ? months.join(", ") : "None"}
        />
        <SummaryCard label="Total revenue" value={formatCurrency(revenue)} />
        <SummaryCard
          label="Total expenses"
          value={formatCurrency(Math.abs(expenseNet))}
        />
        <SummaryCard label="Net total" value={formatCurrency(netTotal)} />
        <SummaryCard label="Loaded at" value={loadedAt} />
      </div>
    </section>
  );
}

function PnlActualsPreview({
  parsedCsv,
  sessionRows,
}: {
  parsedCsv: ParsedFinancialCsv | null;
  sessionRows: UploadedFinancialRow[];
}) {
  if (!parsedCsv) {
    return (
      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">P&L Actuals CSV Preview</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Upload a local CSV to preview parsed P&L actuals and validation status.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-neutral-200 bg-white p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold">P&L Actuals CSV Preview</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Local browser parse results for this session.
            </p>
          </div>
          {sessionRows.length > 0 ? (
            <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
              {sessionRows.length} rows loaded in session
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <SummaryCard label="Total rows" value={parsedCsv.summary.totalRows} />
          <SummaryCard label="Valid rows" value={parsedCsv.summary.validRows} />
          <SummaryCard
            label="Rows with warnings"
            value={parsedCsv.summary.warningRows}
          />
          <SummaryCard
            label="Rows with errors"
            value={parsedCsv.summary.errorRows}
          />
        </div>

        {parsedCsv.errors.length > 0 ? (
          <div className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-sm font-medium text-neutral-950">
              Parser messages
            </p>
            <ul className="mt-2 space-y-1 text-sm text-neutral-600">
              {parsedCsv.errors.map((error) => (
                <li key={error} className="ml-4 list-disc">
                  {error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-base font-semibold">Parsed Rows</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Validation is based on required fields, month format, duplicates,
            amount type, and sign conventions.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 font-medium">Month</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Validation Status</th>
                <th className="px-4 py-3 font-medium">Messages</th>
              </tr>
            </thead>
            <tbody>
              {parsedCsv.rows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-neutral-100">
                  <td className="px-4 py-3">{row.month || "Missing"}</td>
                  <td className="px-4 py-3 font-medium">
                    {row.account || "Missing"}
                  </td>
                  <td className="px-4 py-3">{row.category || "Missing"}</td>
                  <td className="px-4 py-3 text-right">
                    {row.amount === null ? row.amountRaw || "Missing" : formatCurrency(row.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <ValidationStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {row.messages.length > 0 ? row.messages.join("; ") : "No issues"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 break-words text-2xl font-semibold tracking-tight">
        {value}
      </p>
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

function isRevenueCategory(category: string) {
  return category.toLowerCase().includes("revenue");
}

function ValidationStatusBadge({
  status,
}: {
  status: UploadValidationStatus;
}) {
  return (
    <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
      {status}
    </span>
  );
}
