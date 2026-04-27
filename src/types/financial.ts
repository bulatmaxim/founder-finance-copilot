export type UploadValidationStatus = "Valid" | "Warning" | "Error";

export type UploadedFinancialRow = {
  rowNumber: number;
  month: string;
  account: string;
  category: string;
  amountRaw: string;
  amount: number | null;
  status: UploadValidationStatus;
  messages: string[];
};

export type UploadValidationSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
};

export type ParsedFinancialCsv = {
  rows: UploadedFinancialRow[];
  summary: UploadValidationSummary;
  errors: string[];
};

export type UploadedCashRow = {
  rowNumber: number;
  month: string;
  cashBalanceRaw: string;
  cashBalance: number | null;
  monthlyChange: number | null;
  status: UploadValidationStatus;
  messages: string[];
};

export type ParsedCashCsv = {
  rows: UploadedCashRow[];
  summary: UploadValidationSummary;
  errors: string[];
};

export type UploadedPayrollRow = {
  rowNumber: number;
  month: string;
  employeeName: string;
  department: string;
  role: string;
  salaryRaw: string;
  salary: number | null;
  benefitsRaw: string;
  benefits: number | null;
  payrollTaxRaw: string;
  payrollTax: number | null;
  bonusRaw: string;
  bonus: number | null;
  startDate: string;
  statusText: string;
  totalMonthlyPayrollCost: number | null;
  status: UploadValidationStatus;
  messages: string[];
};

export type UploadedRevenueDetailRow = {
  rowNumber: number;
  month: string;
  customer: string;
  product: string;
  revenueType: string;
  amountRaw: string;
  amount: number | null;
  status: UploadValidationStatus;
  messages: string[];
};

export type UploadedPipelineRow = {
  rowNumber: number;
  dealName: string;
  customer: string;
  stage: string;
  amountRaw: string;
  amount: number | null;
  probabilityRaw: string;
  probability: number | null;
  expectedCloseMonth: string;
  owner: string;
  weightedPipeline: number | null;
  status: UploadValidationStatus;
  messages: string[];
};

export type UploadedBankTransactionRow = {
  rowNumber: number;
  date: string;
  description: string;
  category: string;
  amountRaw: string;
  amount: number | null;
  status: UploadValidationStatus;
  messages: string[];
};

export type UploadedForecastRow = {
  rowNumber: number;
  month: string;
  account: string;
  category: string;
  amountRaw: string;
  amount: number | null;
  forecastVersion: string;
  status: UploadValidationStatus;
  messages: string[];
};

export type ParsedPayrollCsv = {
  rows: UploadedPayrollRow[];
  summary: UploadValidationSummary;
  errors: string[];
};

export type ParsedRevenueDetailCsv = {
  rows: UploadedRevenueDetailRow[];
  summary: UploadValidationSummary;
  errors: string[];
};

export type ParsedPipelineCsv = {
  rows: UploadedPipelineRow[];
  summary: UploadValidationSummary;
  errors: string[];
};

export type ParsedBankTransactionsCsv = {
  rows: UploadedBankTransactionRow[];
  summary: UploadValidationSummary;
  errors: string[];
};

export type ParsedForecastCsv = {
  rows: UploadedForecastRow[];
  summary: UploadValidationSummary;
  errors: string[];
};
