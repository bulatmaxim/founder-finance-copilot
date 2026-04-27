export type UploadStatus =
  | "Not Uploaded"
  | "Uploaded"
  | "Needs Mapping"
  | "Needs Review"
  | "Approved"
  | "Failed";

export type UploadCard = {
  dataType: string;
  description: string;
  requirement: "Required" | "Optional";
  lastUploadedDate: string;
  status: UploadStatus;
};

export type ImportHistoryRow = {
  fileName: string;
  dataType: string;
  period: string;
  uploadedBy: string;
  uploadedDate: string;
  status: UploadStatus;
  issuesFound: number;
};

export type DataQualityCheck = {
  check: string;
  status: "Passed" | "Needs Review" | "Open";
  detail: string;
};

export const uploadCards: UploadCard[] = [
  {
    dataType: "P&L Actuals",
    description: "Monthly profit and loss export from accounting.",
    requirement: "Required",
    lastUploadedDate: "Apr 5, 2026",
    status: "Needs Mapping",
  },
  {
    dataType: "Budget",
    description: "Board-approved annual budget by month.",
    requirement: "Required",
    lastUploadedDate: "Mar 28, 2026",
    status: "Approved",
  },
  {
    dataType: "Cash Balance",
    description: "Month-end cash balance by bank account.",
    requirement: "Required",
    lastUploadedDate: "Apr 4, 2026",
    status: "Approved",
  },
  {
    dataType: "Payroll / Headcount",
    description: "Payroll register and department-level headcount file.",
    requirement: "Required",
    lastUploadedDate: "Apr 2, 2026",
    status: "Needs Review",
  },
  {
    dataType: "Revenue Detail",
    description: "Customer, product, ARR, and invoice-level revenue detail.",
    requirement: "Required",
    lastUploadedDate: "Apr 5, 2026",
    status: "Uploaded",
  },
  {
    dataType: "CRM / Pipeline",
    description: "Open pipeline and opportunity stage export.",
    requirement: "Optional",
    lastUploadedDate: "Not uploaded",
    status: "Not Uploaded",
  },
  {
    dataType: "Bank Transactions",
    description: "Bank activity export for cash validation.",
    requirement: "Optional",
    lastUploadedDate: "Apr 1, 2026",
    status: "Failed",
  },
];

export const importHistory: ImportHistoryRow[] = [
  {
    fileName: "acme_ai_pl_actuals_mar_2026.csv",
    dataType: "P&L Actuals",
    period: "Mar 2026",
    uploadedBy: "Founder",
    uploadedDate: "Apr 5, 2026",
    status: "Needs Mapping",
    issuesFound: 8,
  },
  {
    fileName: "fy2026_budget_board_approved.xlsx",
    dataType: "Budget",
    period: "FY2026",
    uploadedBy: "Founder",
    uploadedDate: "Mar 28, 2026",
    status: "Approved",
    issuesFound: 0,
  },
  {
    fileName: "cash_balances_mar_2026.csv",
    dataType: "Cash Balance",
    period: "Mar 2026",
    uploadedBy: "Founder",
    uploadedDate: "Apr 4, 2026",
    status: "Approved",
    issuesFound: 0,
  },
  {
    fileName: "gusto_headcount_mar_2026.csv",
    dataType: "Payroll / Headcount",
    period: "Mar 2026",
    uploadedBy: "Founder",
    uploadedDate: "Apr 2, 2026",
    status: "Needs Review",
    issuesFound: 2,
  },
  {
    fileName: "revenue_detail_mar_2026.csv",
    dataType: "Revenue Detail",
    period: "Mar 2026",
    uploadedBy: "Founder",
    uploadedDate: "Apr 5, 2026",
    status: "Uploaded",
    issuesFound: 1,
  },
  {
    fileName: "bank_transactions_mar_2026.csv",
    dataType: "Bank Transactions",
    period: "Mar 2026",
    uploadedBy: "Founder",
    uploadedDate: "Apr 1, 2026",
    status: "Failed",
    issuesFound: 5,
  },
];

export const dataQualityChecks: DataQualityCheck[] = [
  {
    check: "Missing months",
    status: "Passed",
    detail: "All required actual and budget periods are present.",
  },
  {
    check: "Unmapped accounts",
    status: "Open",
    detail: "Three accounts need FP&A category approval.",
  },
  {
    check: "Duplicate rows",
    status: "Passed",
    detail: "No duplicate transaction rows detected.",
  },
  {
    check: "Non-numeric amounts",
    status: "Passed",
    detail: "All uploaded amount fields parsed as numbers.",
  },
  {
    check: "Large month-over-month changes",
    status: "Needs Review",
    detail: "Cloud hosting and payroll require review.",
  },
  {
    check: "Cash balance missing",
    status: "Passed",
    detail: "Month-end cash balance was provided.",
  },
  {
    check: "Budget file missing categories",
    status: "Needs Review",
    detail: "Budget file is missing two detailed software categories.",
  },
  {
    check: "Payroll period mismatch",
    status: "Needs Review",
    detail: "Payroll export period differs from accounting close date.",
  },
];
