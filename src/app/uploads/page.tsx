"use client";

import { useCallback, useMemo, useState } from "react";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import { sampleCompany } from "@/data/sampleCompany";
import {
  bankTransactionsSampleCsv,
  budgetSampleCsv,
  cashBalanceSampleCsv,
  forecastSampleCsv,
  parseBankTransactionsCsv,
  parseBudgetCsv,
  parseCashBalanceCsv,
  parseForecastCsv,
  parsePayrollCsv,
  parsePipelineCsv,
  parsePnlActualsCsv,
  parseRevenueDetailCsv,
  payrollSampleCsv,
  pipelineSampleCsv,
  pnlActualsSampleCsv,
  revenueDetailSampleCsv,
} from "@/lib/csvParser";
import { formatCurrency, formatPercent } from "@/lib/formatting";
import {
  clearUploadedActuals,
  clearUploadedBankTransactions,
  clearUploadedBudget,
  clearUploadedCash,
  clearUploadedForecast,
  clearUploadedPayroll,
  clearUploadedPipeline,
  clearUploadedRevenueDetail,
  getActiveBudgetData,
  getActiveCashData,
  getActiveFinancialData,
  getActiveForecastData,
  getActualsSourceLabel,
  getBudgetSourceLabel,
  getCashSourceLabel,
  getForecastSourceLabel,
  getUploadedActualsPayload,
  getUploadedBankTransactionsPayload,
  getUploadedBudgetPayload,
  getUploadedCashPayload,
  getUploadedForecastPayload,
  getUploadedPayrollPayload,
  getUploadedPipelinePayload,
  getUploadedRevenueDetailPayload,
  saveUploadedActuals,
  saveUploadedBankTransactions,
  saveUploadedBudget,
  saveUploadedCash,
  saveUploadedForecast,
  saveUploadedPayroll,
  saveUploadedPipeline,
  saveUploadedRevenueDetail,
} from "@/lib/localDataStore";
import type {
  ParsedBankTransactionsCsv,
  ParsedCashCsv,
  ParsedFinancialCsv,
  ParsedForecastCsv,
  ParsedPayrollCsv,
  ParsedPipelineCsv,
  ParsedRevenueDetailCsv,
  UploadedBankTransactionRow,
  UploadedCashRow,
  UploadedFinancialRow,
  UploadedForecastRow,
  UploadedPayrollRow,
  UploadedPipelineRow,
  UploadedRevenueDetailRow,
  UploadValidationStatus,
} from "@/types/financial";

type UploadKind =
  | "actuals"
  | "budget"
  | "cash"
  | "payroll"
  | "revenueDetail"
  | "pipeline"
  | "bankTransactions"
  | "forecast";

type AnyUploadRow =
  | UploadedFinancialRow
  | UploadedCashRow
  | UploadedPayrollRow
  | UploadedRevenueDetailRow
  | UploadedPipelineRow
  | UploadedBankTransactionRow
  | UploadedForecastRow;

type ParsedUpload =
  | ParsedFinancialCsv
  | ParsedCashCsv
  | ParsedPayrollCsv
  | ParsedRevenueDetailCsv
  | ParsedPipelineCsv
  | ParsedBankTransactionsCsv
  | ParsedForecastCsv;

type UploadPayload = {
  rows: AnyUploadRow[];
  savedAt: string;
};

type UploadConfig = {
  kind: UploadKind;
  section: "Core Financial Data" | "Operating Data" | "Planning Data";
  title: string;
  description: string;
  requirement: "Required" | "Optional";
  sampleFileName: string;
  sampleCsv: string;
  expectedColumns: string;
  parse: (csvText: string) => ParsedUpload;
  save: (rows: AnyUploadRow[]) => void;
  clear: () => void;
  getPayload: () => UploadPayload | null;
  previewColumns: {
    header: string;
    align?: "right";
    render: (row: AnyUploadRow) => string;
  }[];
  summaryMetrics: (rows: AnyUploadRow[]) => { label: string; value: string | number }[];
};

type ParsedByKind = Partial<Record<UploadKind, ParsedUpload | null>>;
type SelectedFileByKind = Partial<Record<UploadKind, string>>;
type LoadingByKind = Partial<Record<UploadKind, boolean>>;
type LoadedRowsByKind = Partial<Record<UploadKind, AnyUploadRow[]>>;
type LoadedAtByKind = Partial<Record<UploadKind, string>>;

const uploadSections: UploadConfig["section"][] = [
  "Core Financial Data",
  "Operating Data",
  "Planning Data",
];

export default function UploadsPage() {
  const configs = useMemo(() => buildUploadConfigs(), []);
  const [parsedByKind, setParsedByKind] = useState<ParsedByKind>({});
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileByKind>({});
  const [loadingByKind, setLoadingByKind] = useState<LoadingByKind>({});
  const [loadedRows, setLoadedRows] = useState<LoadedRowsByKind>(() =>
    Object.fromEntries(
      configs.map((config) => [config.kind, config.getPayload()?.rows ?? []]),
    ) as LoadedRowsByKind,
  );
  const [loadedAt, setLoadedAt] = useState<LoadedAtByKind>(() =>
    Object.fromEntries(
      configs.map((config) => [
        config.kind,
        formatLoadedAt(config.getPayload()?.savedAt ?? ""),
      ]),
    ) as LoadedAtByKind,
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback(
    (type: ToastType, title: string, detail?: string) => {
      setToast({ id: Date.now(), type, title, detail });
    },
    [],
  );

  const activeData = getActiveFinancialData();
  const activeBudget = getActiveBudgetData();
  const activeCash = getActiveCashData();
  const activeForecast = getActiveForecastData();
  const dataSourceRows = [
    ["Actuals Source", sourceValue(getActualsSourceLabel(activeData.dataSource))],
    ["Budget Source", sourceValue(getBudgetSourceLabel(activeBudget.dataSource))],
    ["Cash Source", sourceValue(getCashSourceLabel(activeCash.dataSource))],
    ["Payroll Source", loadedRows.payroll?.length ? "Uploaded CSV Data" : "Not Uploaded"],
    [
      "Revenue Detail Source",
      loadedRows.revenueDetail?.length ? "Uploaded CSV Data" : "Not Uploaded",
    ],
    ["Pipeline Source", loadedRows.pipeline?.length ? "Uploaded CSV Data" : "Not Uploaded"],
    [
      "Bank Transactions Source",
      loadedRows.bankTransactions?.length ? "Uploaded CSV Data" : "Not Uploaded",
    ],
    [
      "Forecast Source",
      activeForecast.dataSource === "uploaded"
        ? sourceValue(getForecastSourceLabel(activeForecast.dataSource))
        : "Sample Data",
    ],
  ];

  async function handleFileSelected(config: UploadConfig, file: File) {
    setSelectedFiles((current) => ({ ...current, [config.kind]: file.name }));
    setParsedByKind((current) => ({ ...current, [config.kind]: null }));
    setLoadingByKind((current) => ({ ...current, [config.kind]: true }));

    try {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Please upload a .csv file.");
      }

      const parsed = config.parse(await file.text());
      setParsedByKind((current) => ({ ...current, [config.kind]: parsed }));

      if (parsed.errors.length > 0 || parsed.summary.errorRows > 0) {
        notify(
          "error",
          "Uploaded file has validation errors.",
          `${config.title}: ${parsed.summary.errorRows} row(s) with errors.`,
        );
      } else if (parsed.summary.warningRows > 0) {
        notify(
          "warning",
          `${config.title} uploaded with warnings.`,
          `${parsed.summary.warningRows} row(s) need review before production use.`,
        );
      } else {
        notify(
          "success",
          `${config.title} uploaded successfully.`,
          `${parsed.summary.totalRows} row(s) parsed locally.`,
        );
      }
    } catch (error) {
      console.error(`${config.title} parsing failed`, error);
      setParsedByKind((current) => ({ ...current, [config.kind]: null }));
      notify(
        "error",
        `${config.title} upload failed.`,
        error instanceof Error ? error.message : "Unknown local parsing error.",
      );
    } finally {
      setLoadingByKind((current) => ({ ...current, [config.kind]: false }));
    }
  }

  function handleUseUploadedData(config: UploadConfig) {
    const parsed = parsedByKind[config.kind];

    if (!parsed || parsed.summary.totalRows === 0) {
      notify("info", `Upload ${config.title} before using this data.`);
      return;
    }

    if (parsed.summary.errorRows > 0 || parsed.errors.length > 0) {
      notify(
        "error",
        "Uploaded file has validation errors.",
        "Fix critical errors before loading this data for the session.",
      );
      return;
    }

    config.save(parsed.rows);
    const timestamp = new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    setLoadedRows((current) => ({ ...current, [config.kind]: parsed.rows }));
    setLoadedAt((current) => ({ ...current, [config.kind]: timestamp }));
    notify(
      parsed.summary.warningRows > 0 ? "warning" : "success",
      `${config.title} loaded for this session.`,
      "Stored locally in this browser only.",
    );
  }

  function handleClear(config: UploadConfig) {
    config.clear();
    setLoadedRows((current) => ({ ...current, [config.kind]: [] }));
    setLoadedAt((current) => ({ ...current, [config.kind]: "" }));
    setParsedByKind((current) => ({ ...current, [config.kind]: null }));
    setSelectedFiles((current) => ({ ...current, [config.kind]: "" }));
    notify("info", `${config.title} cleared.`, "The app will fall back to sample or unavailable data where needed.");
  }

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />

      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Uploads
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Financial Data Intake
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Local intake center for {sampleCompany.name}. Upload CSVs, validate
          them in the browser, and save them to localStorage for prototype
          analysis.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-500">
          Uploaded actuals, budget, cash, payroll, revenue, pipeline, bank, and
          forecast data are stored locally in your browser for prototype testing
          only. They are not saved to a database yet.
        </p>
      </div>

      <DataSourceSummary rows={dataSourceRows} />

      {uploadSections.map((section) => (
        <section key={section} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{section}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Upload, preview, validate, load, and clear local CSV data.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {configs
              .filter((config) => config.section === section)
              .map((config) => (
                <UploadCard
                  key={config.kind}
                  config={config}
                  parsed={parsedByKind[config.kind] ?? null}
                  selectedFile={selectedFiles[config.kind] ?? ""}
                  isLoading={Boolean(loadingByKind[config.kind])}
                  loadedRows={loadedRows[config.kind] ?? []}
                  loadedAt={loadedAt[config.kind] ?? ""}
                  onFileSelected={(file) => handleFileSelected(config, file)}
                  onDownloadSample={() =>
                    downloadCsv(config.sampleCsv, config.sampleFileName)
                  }
                  onUseUploadedData={() => handleUseUploadedData(config)}
                  onClear={() => handleClear(config)}
                />
              ))}
          </div>
        </section>
      ))}

      <LoadedSummaries
        configs={configs}
        loadedRows={loadedRows}
        loadedAt={loadedAt}
      />

      <PreviewSections
        configs={configs}
        parsedByKind={parsedByKind}
        loadedRows={loadedRows}
      />
    </section>
  );
}

function UploadCard({
  config,
  parsed,
  selectedFile,
  isLoading,
  loadedRows,
  loadedAt,
  onFileSelected,
  onDownloadSample,
  onUseUploadedData,
  onClear,
}: {
  config: UploadConfig;
  parsed: ParsedUpload | null;
  selectedFile: string;
  isLoading: boolean;
  loadedRows: AnyUploadRow[];
  loadedAt: string;
  onFileSelected: (file: File) => void;
  onDownloadSample: () => void;
  onUseUploadedData: () => void;
  onClear: () => void;
}) {
  const hasLoadedRows = loadedRows.length > 0;
  const hasErrors = Boolean(
    parsed && (parsed.summary.errorRows > 0 || parsed.errors.length > 0),
  );

  return (
    <article className="rounded-md border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{config.title}</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            {config.description}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
          {config.requirement}
        </span>
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Current source</dt>
          <dd className="font-medium">
            {hasLoadedRows ? "Uploaded CSV Data" : config.kind === "forecast" ? "Sample Data" : "Not Uploaded"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Last loaded</dt>
          <dd className="text-right font-medium">
            {loadedAt || "Not loaded"}
          </dd>
        </div>
      </dl>

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">
            Select CSV file
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={isLoading}
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

        {selectedFile ? (
          <p className="text-xs text-neutral-500">Selected: {selectedFile}</p>
        ) : null}

        <div className="grid gap-2">
          <button
            type="button"
            onClick={onDownloadSample}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50"
          >
            Download Sample {config.title} CSV
          </button>
          <button
            type="button"
            onClick={onUseUploadedData}
            disabled={
              isLoading ||
              !parsed ||
              parsed.summary.totalRows === 0 ||
              hasErrors
            }
            className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {useButtonLabel(config)}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!hasLoadedRows && !parsed}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {clearButtonLabel(config)}
          </button>
        </div>

        <p className="text-xs leading-5 text-neutral-500">
          {config.expectedColumns}
        </p>
      </div>
    </article>
  );
}

function DataSourceSummary({ rows }: { rows: string[][] }) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <h2 className="text-base font-semibold">Data Source Summary</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {rows.map(([label, value]) => (
          <article key={label} className="rounded-md border border-neutral-200 p-4">
            <p className="text-sm font-medium text-neutral-500">{label}</p>
            <p className="mt-2 text-base font-semibold">{value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LoadedSummaries({
  configs,
  loadedRows,
  loadedAt,
}: {
  configs: UploadConfig[];
  loadedRows: LoadedRowsByKind;
  loadedAt: LoadedAtByKind;
}) {
  const activeConfigs = configs.filter(
    (config) => (loadedRows[config.kind] ?? []).length > 0,
  );

  if (activeConfigs.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Session Data Loaded</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Local data currently active in this browser session.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {activeConfigs.map((config) => (
          <section
            key={config.kind}
            className="rounded-md border border-neutral-200 bg-white p-5"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-semibold">{config.title}</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Loaded locally for prototype analysis.
                </p>
              </div>
              <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
                Loaded {loadedAt[config.kind]}
              </span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {config.summaryMetrics(loadedRows[config.kind] ?? []).map((metric) => (
                <SummaryCard key={metric.label} {...metric} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function PreviewSections({
  configs,
  parsedByKind,
  loadedRows,
}: {
  configs: UploadConfig[];
  parsedByKind: ParsedByKind;
  loadedRows: LoadedRowsByKind;
}) {
  const activeConfigs = configs.filter((config) => parsedByKind[config.kind]);

  if (activeConfigs.length === 0) {
    return null;
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">CSV Previews</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Parsed rows and validation status from the latest selected files.
        </p>
      </div>

      {activeConfigs.map((config) => {
        const parsed = parsedByKind[config.kind];

        if (!parsed) {
          return null;
        }

        return (
          <section key={config.kind} className="space-y-4">
            <div className="rounded-md border border-neutral-200 bg-white p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-base font-semibold">{config.title} Preview</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    Validation summary for the selected file.
                  </p>
                </div>
                {(loadedRows[config.kind] ?? []).length > 0 ? (
                  <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
                    {(loadedRows[config.kind] ?? []).length} rows loaded
                  </span>
                ) : null}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <SummaryCard label="Total rows" value={parsed.summary.totalRows} />
                <SummaryCard label="Valid rows" value={parsed.summary.validRows} />
                <SummaryCard
                  label="Rows with warnings"
                  value={parsed.summary.warningRows}
                />
                <SummaryCard
                  label="Rows with errors"
                  value={parsed.summary.errorRows}
                />
              </div>
              {parsed.errors.length > 0 ? (
                <div className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <p className="text-sm font-medium text-neutral-950">
                    Parser messages
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                    {parsed.errors.map((error) => (
                      <li key={error} className="ml-4 list-disc">
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <PreviewTable config={config} rows={parsed.rows} />
          </section>
        );
      })}
    </section>
  );
}

function PreviewTable({
  config,
  rows,
}: {
  config: UploadConfig;
  rows: AnyUploadRow[];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h3 className="text-base font-semibold">Parsed Rows</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Extra columns are ignored. Column order does not matter.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              {config.previewColumns.map((column) => (
                <th
                  key={column.header}
                  className={`px-4 py-3 font-medium ${
                    column.align === "right" ? "text-right" : ""
                  }`}
                >
                  {column.header}
                </th>
              ))}
              <th className="px-4 py-3 font-medium">Validation Status</th>
              <th className="px-4 py-3 font-medium">Messages</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowNumber} className="border-b border-neutral-100">
                {config.previewColumns.map((column) => (
                  <td
                    key={column.header}
                    className={`px-4 py-3 ${
                      column.align === "right" ? "text-right" : ""
                    }`}
                  >
                    {column.render(row)}
                  </td>
                ))}
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
  );
}

function buildUploadConfigs(): UploadConfig[] {
  return [
    {
      kind: "actuals",
      section: "Core Financial Data",
      title: "P&L Actuals",
      description: "Monthly profit and loss actuals by account and category.",
      requirement: "Required",
      sampleCsv: pnlActualsSampleCsv,
      sampleFileName: "Acme_AI_PnL_Actuals_Sample.csv",
      expectedColumns: "Expected columns: month, account, category, amount.",
      parse: parsePnlActualsCsv as (csvText: string) => ParsedUpload,
      save: (rows) => saveUploadedActuals(rows as UploadedFinancialRow[]),
      clear: clearUploadedActuals,
      getPayload: () => getPayload(getUploadedActualsPayload()),
      previewColumns: financialColumns(),
      summaryMetrics: financialSummary("Total revenue", "Total expenses"),
    },
    {
      kind: "budget",
      section: "Core Financial Data",
      title: "Budget",
      description: "Board-approved monthly budget by account and category.",
      requirement: "Required",
      sampleCsv: budgetSampleCsv,
      sampleFileName: "Acme_AI_Budget_Sample.csv",
      expectedColumns: "Expected columns: month, account, category, amount.",
      parse: parseBudgetCsv as (csvText: string) => ParsedUpload,
      save: (rows) => saveUploadedBudget(rows as UploadedFinancialRow[]),
      clear: clearUploadedBudget,
      getPayload: () => getPayload(getUploadedBudgetPayload()),
      previewColumns: financialColumns(),
      summaryMetrics: financialSummary("Total budget revenue", "Total budget expenses"),
    },
    {
      kind: "cash",
      section: "Core Financial Data",
      title: "Cash Balance",
      description: "Month-end cash balances used for burn and runway.",
      requirement: "Required",
      sampleCsv: cashBalanceSampleCsv,
      sampleFileName: "Acme_AI_Cash_Balance_Sample.csv",
      expectedColumns: "Expected columns: month, cashBalance.",
      parse: parseCashBalanceCsv as (csvText: string) => ParsedUpload,
      save: (rows) => saveUploadedCash(rows as UploadedCashRow[]),
      clear: clearUploadedCash,
      getPayload: () => getPayload(getUploadedCashPayload()),
      previewColumns: [
        { header: "Month", render: (row) => cashRow(row).month || "Missing" },
        {
          header: "Cash Balance",
          align: "right",
          render: (row) => moneyOrRaw(cashRow(row).cashBalance, cashRow(row).cashBalanceRaw),
        },
        {
          header: "Month-over-Month Change",
          align: "right",
          render: (row) =>
            cashRow(row).monthlyChange === null
              ? "N/A"
              : formatCurrency(cashRow(row).monthlyChange ?? 0),
        },
      ],
      summaryMetrics: cashSummary,
    },
    {
      kind: "payroll",
      section: "Operating Data",
      title: "Payroll / Headcount",
      description: "Employee-level payroll and headcount data.",
      requirement: "Required",
      sampleCsv: payrollSampleCsv,
      sampleFileName: "Acme_AI_Payroll_Sample.csv",
      expectedColumns:
        "Expected columns: month, employeeName, department, role, salary, benefits, payrollTax, bonus, startDate, status.",
      parse: parsePayrollCsv as (csvText: string) => ParsedUpload,
      save: (rows) => saveUploadedPayroll(rows as UploadedPayrollRow[]),
      clear: clearUploadedPayroll,
      getPayload: () => getPayload(getUploadedPayrollPayload()),
      previewColumns: [
        { header: "Month", render: (row) => payrollRow(row).month || "Missing" },
        { header: "Employee", render: (row) => payrollRow(row).employeeName || "Missing" },
        { header: "Department", render: (row) => payrollRow(row).department || "Missing" },
        { header: "Role", render: (row) => payrollRow(row).role || "Missing" },
        {
          header: "Salary",
          align: "right",
          render: (row) => moneyOrRaw(payrollRow(row).salary, payrollRow(row).salaryRaw),
        },
        {
          header: "Total Monthly Payroll Cost",
          align: "right",
          render: (row) => formatCurrency(payrollRow(row).totalMonthlyPayrollCost ?? 0),
        },
        { header: "Status", render: (row) => payrollRow(row).statusText || "Missing" },
      ],
      summaryMetrics: payrollSummary,
    },
    {
      kind: "revenueDetail",
      section: "Operating Data",
      title: "Revenue Detail",
      description: "Customer and product-level revenue detail.",
      requirement: "Required",
      sampleCsv: revenueDetailSampleCsv,
      sampleFileName: "Acme_AI_Revenue_Detail_Sample.csv",
      expectedColumns: "Expected columns: month, customer, product, revenueType, amount.",
      parse: parseRevenueDetailCsv as (csvText: string) => ParsedUpload,
      save: (rows) => saveUploadedRevenueDetail(rows as UploadedRevenueDetailRow[]),
      clear: clearUploadedRevenueDetail,
      getPayload: () => getPayload(getUploadedRevenueDetailPayload()),
      previewColumns: [
        { header: "Month", render: (row) => revenueRow(row).month || "Missing" },
        { header: "Customer", render: (row) => revenueRow(row).customer || "Missing" },
        { header: "Product", render: (row) => revenueRow(row).product || "Missing" },
        {
          header: "Revenue Type",
          render: (row) => revenueRow(row).revenueType || "Missing",
        },
        {
          header: "Amount",
          align: "right",
          render: (row) => moneyOrRaw(revenueRow(row).amount, revenueRow(row).amountRaw),
        },
      ],
      summaryMetrics: revenueDetailSummary,
    },
    {
      kind: "pipeline",
      section: "Operating Data",
      title: "CRM / Pipeline",
      description: "Open deal pipeline and expected close timing.",
      requirement: "Optional",
      sampleCsv: pipelineSampleCsv,
      sampleFileName: "Acme_AI_Pipeline_Sample.csv",
      expectedColumns:
        "Expected columns: dealName, customer, stage, amount, probability, expectedCloseMonth, owner.",
      parse: parsePipelineCsv as (csvText: string) => ParsedUpload,
      save: (rows) => saveUploadedPipeline(rows as UploadedPipelineRow[]),
      clear: clearUploadedPipeline,
      getPayload: () => getPayload(getUploadedPipelinePayload()),
      previewColumns: [
        { header: "Deal", render: (row) => pipelineRow(row).dealName || "Missing" },
        { header: "Customer", render: (row) => pipelineRow(row).customer || "Missing" },
        { header: "Stage", render: (row) => pipelineRow(row).stage || "Missing" },
        {
          header: "Amount",
          align: "right",
          render: (row) => moneyOrRaw(pipelineRow(row).amount, pipelineRow(row).amountRaw),
        },
        {
          header: "Probability",
          align: "right",
          render: (row) =>
            pipelineRow(row).probability === null
              ? pipelineRow(row).probabilityRaw || "Missing"
              : formatPercent((pipelineRow(row).probability ?? 0) / 100),
        },
        {
          header: "Expected Close Month",
          render: (row) => pipelineRow(row).expectedCloseMonth || "Missing",
        },
        {
          header: "Weighted Pipeline",
          align: "right",
          render: (row) => formatCurrency(pipelineRow(row).weightedPipeline ?? 0),
        },
      ],
      summaryMetrics: pipelineSummary,
    },
    {
      kind: "bankTransactions",
      section: "Operating Data",
      title: "Bank Transactions",
      description: "Cash activity detail for outflow review.",
      requirement: "Optional",
      sampleCsv: bankTransactionsSampleCsv,
      sampleFileName: "Acme_AI_Bank_Transactions_Sample.csv",
      expectedColumns: "Expected columns: date, description, category, amount.",
      parse: parseBankTransactionsCsv as (csvText: string) => ParsedUpload,
      save: (rows) => saveUploadedBankTransactions(rows as UploadedBankTransactionRow[]),
      clear: clearUploadedBankTransactions,
      getPayload: () => getPayload(getUploadedBankTransactionsPayload()),
      previewColumns: [
        { header: "Date", render: (row) => bankRow(row).date || "Missing" },
        {
          header: "Description",
          render: (row) => bankRow(row).description || "Missing",
        },
        { header: "Category", render: (row) => bankRow(row).category || "Missing" },
        {
          header: "Amount",
          align: "right",
          render: (row) => moneyOrRaw(bankRow(row).amount, bankRow(row).amountRaw),
        },
      ],
      summaryMetrics: bankSummary,
    },
    {
      kind: "forecast",
      section: "Planning Data",
      title: "Forecast",
      description: "Monthly forecast by version, account, and category.",
      requirement: "Required",
      sampleCsv: forecastSampleCsv,
      sampleFileName: "Acme_AI_Forecast_Sample.csv",
      expectedColumns:
        "Expected columns: month, account, category, amount, forecastVersion.",
      parse: parseForecastCsv as (csvText: string) => ParsedUpload,
      save: (rows) => saveUploadedForecast(rows as UploadedForecastRow[]),
      clear: clearUploadedForecast,
      getPayload: () => getPayload(getUploadedForecastPayload()),
      previewColumns: [
        { header: "Month", render: (row) => forecastRow(row).month || "Missing" },
        {
          header: "Forecast Version",
          render: (row) => forecastRow(row).forecastVersion || "Missing",
        },
        { header: "Account", render: (row) => forecastRow(row).account || "Missing" },
        { header: "Category", render: (row) => forecastRow(row).category || "Missing" },
        {
          header: "Amount",
          align: "right",
          render: (row) => moneyOrRaw(forecastRow(row).amount, forecastRow(row).amountRaw),
        },
      ],
      summaryMetrics: financialSummary("Forecast revenue", "Forecast expenses"),
    },
  ];
}

function financialColumns(): UploadConfig["previewColumns"] {
  return [
    { header: "Month", render: (row) => financialRow(row).month || "Missing" },
    { header: "Account", render: (row) => financialRow(row).account || "Missing" },
    { header: "Category", render: (row) => financialRow(row).category || "Missing" },
    {
      header: "Amount",
      align: "right",
      render: (row) => moneyOrRaw(financialRow(row).amount, financialRow(row).amountRaw),
    },
  ];
}

function financialSummary(revenueLabel: string, expenseLabel: string) {
  return (rows: AnyUploadRow[]) => {
    const financialRows = rows.map(financialRow);
    const revenue = financialRows.reduce(
      (total, row) =>
        row.amount !== null && row.category.toLowerCase().includes("revenue")
          ? total + row.amount
          : total,
      0,
    );
    const expenses = financialRows.reduce(
      (total, row) =>
        row.amount !== null && !row.category.toLowerCase().includes("revenue")
          ? total + row.amount
          : total,
      0,
    );

    return [
      { label: "Loaded rows", value: rows.length },
      { label: "Loaded months", value: unique(financialRows.map((row) => row.month)).join(", ") },
      { label: revenueLabel, value: formatCurrency(revenue) },
      { label: expenseLabel, value: formatCurrency(Math.abs(expenses)) },
    ];
  };
}

function cashSummary(rows: AnyUploadRow[]) {
  const cashRows = rows.map(cashRow).filter((row) => row.cashBalance !== null);
  const sorted = [...cashRows].sort((first, second) => first.month.localeCompare(second.month));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];

  return [
    { label: "Months loaded", value: unique(sorted.map((row) => row.month)).join(", ") },
    { label: "Beginning cash", value: formatCurrency(first?.cashBalance ?? 0) },
    { label: "Latest cash", value: formatCurrency(latest?.cashBalance ?? 0) },
    {
      label: "Total cash change",
      value: formatCurrency((latest?.cashBalance ?? 0) - (first?.cashBalance ?? 0)),
    },
  ];
}

function payrollSummary(rows: AnyUploadRow[]) {
  const payrollRows = rows.map(payrollRow);
  const latestMonth = [...unique(payrollRows.map((row) => row.month))].sort().at(-1);
  const latestRows = payrollRows.filter((row) => row.month === latestMonth);
  const payrollCost = latestRows.reduce(
    (total, row) => total + (row.totalMonthlyPayrollCost ?? 0),
    0,
  );

  return [
    { label: "Rows loaded", value: rows.length },
    { label: "Latest month", value: latestMonth ?? "N/A" },
    { label: "Headcount", value: latestRows.length },
    { label: "Monthly payroll cost", value: formatCurrency(payrollCost) },
  ];
}

function revenueDetailSummary(rows: AnyUploadRow[]) {
  const revenueRows = rows.map(revenueRow);
  const revenue = revenueRows.reduce((total, row) => total + (row.amount ?? 0), 0);
  const customers = unique(revenueRows.map((row) => row.customer));

  return [
    { label: "Rows loaded", value: rows.length },
    { label: "Customers", value: customers.length },
    { label: "Total revenue detail", value: formatCurrency(revenue) },
    { label: "Products", value: unique(revenueRows.map((row) => row.product)).length },
  ];
}

function pipelineSummary(rows: AnyUploadRow[]) {
  const pipelineRows = rows.map(pipelineRow);
  const totalPipeline = pipelineRows.reduce((total, row) => total + (row.amount ?? 0), 0);
  const weightedPipeline = pipelineRows.reduce(
    (total, row) => total + (row.weightedPipeline ?? 0),
    0,
  );

  return [
    { label: "Deals loaded", value: rows.length },
    { label: "Total pipeline", value: formatCurrency(totalPipeline) },
    { label: "Weighted pipeline", value: formatCurrency(weightedPipeline) },
    { label: "Owners", value: unique(pipelineRows.map((row) => row.owner)).length },
  ];
}

function bankSummary(rows: AnyUploadRow[]) {
  const bankRows = rows.map(bankRow);
  const inflows = bankRows.reduce(
    (total, row) => total + Math.max(0, row.amount ?? 0),
    0,
  );
  const outflows = bankRows.reduce(
    (total, row) => total + Math.abs(Math.min(0, row.amount ?? 0)),
    0,
  );

  return [
    { label: "Transactions", value: rows.length },
    { label: "Cash inflows", value: formatCurrency(inflows) },
    { label: "Cash outflows", value: formatCurrency(outflows) },
    { label: "Categories", value: unique(bankRows.map((row) => row.category)).length },
  ];
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold tracking-tight">
        {value}
      </p>
    </article>
  );
}

function ValidationStatusBadge({ status }: { status: UploadValidationStatus }) {
  return (
    <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
      {status}
    </span>
  );
}

function downloadCsv(csvText: string, fileName: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function formatLoadedAt(value: string) {
  if (!value) return "";
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function sourceValue(label: string) {
  return label.split(": ")[1] ?? label;
}

function useButtonLabel(config: UploadConfig) {
  const labels: Record<UploadKind, string> = {
    actuals: "Use Uploaded Data",
    budget: "Use Uploaded Budget",
    cash: "Use Uploaded Cash Data",
    payroll: "Use Uploaded Payroll Data",
    revenueDetail: "Use Uploaded Revenue Detail",
    pipeline: "Use Uploaded Pipeline Data",
    bankTransactions: "Use Uploaded Bank Transactions",
    forecast: "Use Uploaded Forecast",
  };

  return labels[config.kind];
}

function clearButtonLabel(config: UploadConfig) {
  const labels: Record<UploadKind, string> = {
    actuals: "Clear Uploaded Data",
    budget: "Clear Uploaded Budget",
    cash: "Clear Uploaded Cash Data",
    payroll: "Clear Uploaded Payroll Data",
    revenueDetail: "Clear Uploaded Revenue Detail",
    pipeline: "Clear Uploaded Pipeline Data",
    bankTransactions: "Clear Uploaded Bank Transactions",
    forecast: "Clear Uploaded Forecast",
  };

  return labels[config.kind];
}

function getPayload<T extends AnyUploadRow>(
  payload: { rows: T[]; savedAt: string } | null,
): UploadPayload | null {
  return payload
    ? { rows: payload.rows as AnyUploadRow[], savedAt: payload.savedAt }
    : null;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function moneyOrRaw(value: number | null, raw: string) {
  return value === null ? raw || "Missing" : formatCurrency(value);
}

function financialRow(row: AnyUploadRow) {
  return row as UploadedFinancialRow;
}

function cashRow(row: AnyUploadRow) {
  return row as UploadedCashRow;
}

function payrollRow(row: AnyUploadRow) {
  return row as UploadedPayrollRow;
}

function revenueRow(row: AnyUploadRow) {
  return row as UploadedRevenueDetailRow;
}

function pipelineRow(row: AnyUploadRow) {
  return row as UploadedPipelineRow;
}

function bankRow(row: AnyUploadRow) {
  return row as UploadedBankTransactionRow;
}

function forecastRow(row: AnyUploadRow) {
  return row as UploadedForecastRow;
}
