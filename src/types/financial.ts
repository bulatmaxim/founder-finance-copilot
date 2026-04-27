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
