import Papa from "papaparse";
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
  UploadedForecastRow,
  UploadedFinancialRow,
  UploadedPayrollRow,
  UploadedPipelineRow,
  UploadedRevenueDetailRow,
  UploadValidationStatus,
} from "@/types/financial";

type RawFinancialCsvRow = {
  month?: string;
  account?: string;
  category?: string;
  amount?: string;
};

type RawCashCsvRow = {
  month?: string;
  cashBalance?: string;
};

type RawPayrollCsvRow = {
  month?: string;
  employeeName?: string;
  department?: string;
  role?: string;
  salary?: string;
  benefits?: string;
  payrollTax?: string;
  bonus?: string;
  startDate?: string;
  status?: string;
};

type RawRevenueDetailCsvRow = {
  month?: string;
  customer?: string;
  product?: string;
  revenueType?: string;
  amount?: string;
};

type RawPipelineCsvRow = {
  dealName?: string;
  customer?: string;
  stage?: string;
  amount?: string;
  probability?: string;
  expectedCloseMonth?: string;
  owner?: string;
};

type RawBankTransactionCsvRow = {
  date?: string;
  description?: string;
  category?: string;
  amount?: string;
};

type RawForecastCsvRow = RawFinancialCsvRow & {
  forecastVersion?: string;
};

const expectedColumns = ["month", "account", "category", "amount"];
const expectedCashColumns = ["month", "cashBalance"];
const expectedPayrollColumns = [
  "month",
  "employeeName",
  "department",
  "role",
  "salary",
  "benefits",
  "payrollTax",
  "bonus",
  "startDate",
  "status",
];
const expectedRevenueDetailColumns = [
  "month",
  "customer",
  "product",
  "revenueType",
  "amount",
];
const expectedPipelineColumns = [
  "dealName",
  "customer",
  "stage",
  "amount",
  "probability",
  "expectedCloseMonth",
  "owner",
];
const expectedBankTransactionColumns = ["date", "description", "category", "amount"];
const expectedForecastColumns = [
  "month",
  "account",
  "category",
  "amount",
  "forecastVersion",
];
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const pnlActualsSampleCsv = [
  "month,account,category,amount",
  "2026-01,Subscription Revenue,Revenue,120000",
  "2026-01,AWS Hosting,Cloud Hosting,-18000",
  "2026-01,Gusto Payroll,Payroll,-85000",
  "2026-02,Subscription Revenue,Revenue,135000",
  "2026-02,AWS Hosting,Cloud Hosting,-19500",
  "2026-02,Gusto Payroll,Payroll,-87000",
].join("\n");

export const budgetSampleCsv = [
  "month,account,category,amount",
  ...Array.from({ length: 12 }, (_, index) => {
    const month = `2026-${String(index + 1).padStart(2, "0")}`;
    const revenue = 125000 + index * 14500;
    const hosting = -(17000 + index * 1200);
    const payroll = -(82000 + index * 3500);
    const software = -(12000 + index * 450);
    const professionalServices = -(9000 + index * 250);
    const salesMarketing = -(36000 + index * 1800);
    const researchDevelopment = -(52000 + index * 2200);
    const generalAdministrative = -(26000 + index * 900);

    return [
      `${month},Subscription Revenue,Revenue,${revenue}`,
      `${month},AWS Hosting,Cloud Hosting,${hosting}`,
      `${month},Gusto Payroll,Payroll,${payroll}`,
      `${month},SaaS Tools,Software,${software}`,
      `${month},Legal and Accounting,Professional Services,${professionalServices}`,
      `${month},Demand Generation,Sales & Marketing,${salesMarketing}`,
      `${month},Engineering Team,Research & Development,${researchDevelopment}`,
      `${month},Operations Team,General & Administrative,${generalAdministrative}`,
    ].join("\n");
  }),
].join("\n");

export const cashBalanceSampleCsv = [
  "month,cashBalance",
  "2026-01,1961000",
  "2026-02,1835000",
  "2026-03,1717000",
  "2026-04,1599000",
  "2026-05,1480000",
  "2026-06,1365000",
  "2026-07,1253000",
  "2026-08,1145000",
  "2026-09,1040000",
  "2026-10,935000",
  "2026-11,832000",
  "2026-12,730000",
].join("\n");

export const payrollSampleCsv = [
  "month,employeeName,department,role,salary,benefits,payrollTax,bonus,startDate,status",
  "2026-01,Jane Smith,Engineering,Senior Engineer,150000,2500,1200,0,2025-06-01,Active",
  "2026-01,Mark Lee,Sales,Account Executive,120000,2100,950,1000,2025-09-15,Active",
  "2026-02,Jane Smith,Engineering,Senior Engineer,150000,2500,1200,0,2025-06-01,Active",
  "2026-02,Mark Lee,Sales,Account Executive,120000,2100,950,1000,2025-09-15,Active",
].join("\n");

export const revenueDetailSampleCsv = [
  "month,customer,product,revenueType,amount",
  "2026-01,Customer A,Core Platform,Subscription,45000",
  "2026-01,Customer B,Implementation,Services,18000",
  "2026-02,Customer A,Core Platform,Subscription,47000",
  "2026-02,Customer C,Core Platform,Subscription,38000",
].join("\n");

export const pipelineSampleCsv = [
  "dealName,customer,stage,amount,probability,expectedCloseMonth,owner",
  "Enterprise Expansion A,Customer A,Negotiation,120000,70,2026-06,Alex",
  "New Logo B,Customer B,Proposal,80000,40,2026-07,Sarah",
  "Expansion C,Customer C,Discovery,60000,25,2026-08,Alex",
].join("\n");

export const bankTransactionsSampleCsv = [
  "date,description,category,amount",
  "2026-01-04,Stripe Deposit,Revenue,52000",
  "2026-01-06,AWS,Cloud Hosting,-8500",
  "2026-01-15,Gusto Payroll,Payroll,-42000",
  "2026-01-22,HubSpot,Software,-3200",
].join("\n");

export const forecastSampleCsv = [
  "month,account,category,amount,forecastVersion",
  "2026-06,Subscription Revenue,Revenue,185000,FY2026 5+7 Forecast",
  "2026-06,AWS Hosting,Cloud Hosting,-25000,FY2026 5+7 Forecast",
  "2026-06,Gusto Payroll,Payroll,-105000,FY2026 5+7 Forecast",
  "2026-07,Subscription Revenue,Revenue,205000,FY2026 5+7 Forecast",
  "2026-07,AWS Hosting,Cloud Hosting,-27000,FY2026 5+7 Forecast",
  "2026-07,Gusto Payroll,Payroll,-109000,FY2026 5+7 Forecast",
].join("\n");

export function parsePnlActualsCsv(csvText: string): ParsedFinancialCsv {
  return parseFinancialCsv(csvText);
}

export function parseBudgetCsv(csvText: string): ParsedFinancialCsv {
  return parseFinancialCsv(csvText);
}

export function parseCashBalanceCsv(csvText: string): ParsedCashCsv {
  const parsed = parseCsv<RawCashCsvRow>(csvText);

  const parseErrors = parserErrors(parsed);
  const fields = parsed.meta.fields ?? [];
  const missingColumns = expectedCashColumns.filter(
    (column) => !fields.includes(column),
  );

  if (missingColumns.length > 0) {
    parseErrors.push(
      `Missing required column(s): ${missingColumns
        .join(", ")}.`,
    );
  }

  const duplicateMonths = findDuplicateMonths(parsed.data);
  const baseRows = parsed.data.map((row, index) =>
    validateCashRow(row, index + 2, duplicateMonths),
  );
  const rows = addCashMovementWarnings(baseRows);

  return {
    rows,
    summary: summarizeRows(rows),
    errors: parseErrors,
  };
}

export function parsePayrollCsv(csvText: string): ParsedPayrollCsv {
  const parsed = parseCsv<RawPayrollCsvRow>(csvText);
  const parseErrors = parserErrors(parsed);
  const missingColumns = expectedPayrollColumns.filter(
    (column) => !(parsed.meta.fields ?? []).includes(column),
  );

  if (missingColumns.length > 0) {
    parseErrors.push(`Missing required column(s): ${missingColumns.join(", ")}.`);
  }

  const duplicateKeys = findDuplicateBy(
    parsed.data,
    (row) => `${clean(row.month).toLowerCase()}|${clean(row.employeeName).toLowerCase()}`,
  );
  const rows = parsed.data.map((row, index) =>
    validatePayrollRow(row, index + 2, duplicateKeys),
  );

  return { rows, summary: summarizeRows(rows), errors: parseErrors };
}

export function parseRevenueDetailCsv(csvText: string): ParsedRevenueDetailCsv {
  const parsed = parseCsv<RawRevenueDetailCsvRow>(csvText);
  const parseErrors = parserErrors(parsed);
  const missingColumns = expectedRevenueDetailColumns.filter(
    (column) => !(parsed.meta.fields ?? []).includes(column),
  );

  if (missingColumns.length > 0) {
    parseErrors.push(`Missing required column(s): ${missingColumns.join(", ")}.`);
  }

  const duplicateKeys = findDuplicateBy(
    parsed.data,
    (row) =>
      `${clean(row.month).toLowerCase()}|${clean(row.customer).toLowerCase()}|${clean(row.product).toLowerCase()}|${clean(row.revenueType).toLowerCase()}`,
  );
  const rows = parsed.data.map((row, index) =>
    validateRevenueDetailRow(row, index + 2, duplicateKeys),
  );

  return { rows, summary: summarizeRows(rows), errors: parseErrors };
}

export function parsePipelineCsv(csvText: string): ParsedPipelineCsv {
  const parsed = parseCsv<RawPipelineCsvRow>(csvText);
  const parseErrors = parserErrors(parsed);
  const missingColumns = expectedPipelineColumns.filter(
    (column) => !(parsed.meta.fields ?? []).includes(column),
  );

  if (missingColumns.length > 0) {
    parseErrors.push(`Missing required column(s): ${missingColumns.join(", ")}.`);
  }

  const duplicateKeys = findDuplicateBy(
    parsed.data,
    (row) =>
      `${clean(row.dealName).toLowerCase()}|${clean(row.customer).toLowerCase()}`,
  );
  const rows = parsed.data.map((row, index) =>
    validatePipelineRow(row, index + 2, duplicateKeys),
  );

  return { rows, summary: summarizeRows(rows), errors: parseErrors };
}

export function parseBankTransactionsCsv(
  csvText: string,
): ParsedBankTransactionsCsv {
  const parsed = parseCsv<RawBankTransactionCsvRow>(csvText);
  const parseErrors = parserErrors(parsed);
  const missingColumns = expectedBankTransactionColumns.filter(
    (column) => !(parsed.meta.fields ?? []).includes(column),
  );

  if (missingColumns.length > 0) {
    parseErrors.push(`Missing required column(s): ${missingColumns.join(", ")}.`);
  }

  const duplicateKeys = findDuplicateBy(
    parsed.data,
    (row) =>
      `${clean(row.date).toLowerCase()}|${clean(row.description).toLowerCase()}|${clean(row.amount)}`,
  );
  const rows = parsed.data.map((row, index) =>
    validateBankTransactionRow(row, index + 2, duplicateKeys),
  );

  return { rows, summary: summarizeRows(rows), errors: parseErrors };
}

export function parseForecastCsv(csvText: string): ParsedForecastCsv {
  const parsed = parseCsv<RawForecastCsvRow>(csvText);
  const parseErrors = parserErrors(parsed);
  const missingColumns = expectedForecastColumns.filter(
    (column) => !(parsed.meta.fields ?? []).includes(column),
  );

  if (missingColumns.length > 0) {
    parseErrors.push(`Missing required column(s): ${missingColumns.join(", ")}.`);
  }

  const duplicateKeys = findDuplicateBy(
    parsed.data,
    (row) =>
      `${clean(row.month).toLowerCase()}|${clean(row.account).toLowerCase()}|${clean(row.category).toLowerCase()}|${clean(row.forecastVersion).toLowerCase()}`,
  );
  const rows = parsed.data.map((row, index) =>
    validateForecastRow(row, index + 2, duplicateKeys),
  );

  return { rows, summary: summarizeRows(rows), errors: parseErrors };
}

function parseFinancialCsv(csvText: string): ParsedFinancialCsv {
  const parsed = parseCsv<RawFinancialCsvRow>(csvText);
  const parseErrors = parserErrors(parsed);
  const fields = parsed.meta.fields ?? [];
  const missingColumns = expectedColumns.filter(
    (column) => !fields.includes(column),
  );

  if (missingColumns.length > 0) {
    parseErrors.push(`Missing required column(s): ${missingColumns.join(", ")}.`);
  }

  const duplicateKeys = findDuplicateKeys(parsed.data);
  const rows = parsed.data.map((row, index) =>
    validateFinancialRow(row, index + 2, duplicateKeys),
  );

  return {
    rows,
    summary: summarizeRows(rows),
    errors: parseErrors,
  };
}

function parseCsv<T>(csvText: string) {
  return Papa.parse<T>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });
}

function parserErrors(parsed: Papa.ParseResult<unknown>) {
  return parsed.errors.map((error) => {
    const row = typeof error.row === "number" ? ` on row ${error.row + 2}` : "";

    return `${error.message}${row}`;
  });
}

function validateFinancialRow(
  row: RawFinancialCsvRow,
  rowNumber: number,
  duplicateKeys: Set<string>,
): UploadedFinancialRow {
  const month = clean(row.month);
  const account = clean(row.account);
  const category = clean(row.category);
  const amountRaw = clean(row.amount);
  const amount = parseAmount(amountRaw);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!month) {
    errors.push("Missing month");
  } else if (!monthPattern.test(month)) {
    errors.push("Invalid month format");
  }

  if (!account) {
    errors.push("Missing account");
  }

  if (!category) {
    errors.push("Missing category");
  }

  if (!amountRaw) {
    errors.push("Missing amount");
  } else if (amount === null) {
    errors.push("Non-numeric amount");
  }

  if (duplicateKeys.has(rowKey(month, account, category))) {
    errors.push("Duplicate row");
  }

  if (amount !== null && category) {
    if (isRevenueCategory(category) && amount < 0) {
      warnings.push("Unexpected negative revenue");
    }

    if (!isRevenueCategory(category) && amount > 0) {
      warnings.push("Unexpected positive expense");
    }
  }

  const status: UploadValidationStatus =
    errors.length > 0 ? "Error" : warnings.length > 0 ? "Warning" : "Valid";

  return {
    rowNumber,
    month,
    account,
    category,
    amountRaw,
    amount,
    status,
    messages: [...errors, ...warnings],
  };
}

function validateCashRow(
  row: RawCashCsvRow,
  rowNumber: number,
  duplicateMonths: Set<string>,
): UploadedCashRow {
  const month = clean(row.month);
  const cashBalanceRaw = clean(row.cashBalance);
  const cashBalance = parseAmount(cashBalanceRaw);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!month) {
    errors.push("Missing month");
  } else if (!monthPattern.test(month)) {
    errors.push("Invalid month format");
  }

  if (!cashBalanceRaw) {
    errors.push("Missing cashBalance");
  } else if (cashBalance === null) {
    errors.push("Non-numeric cashBalance");
  }

  if (duplicateMonths.has(month.toLowerCase())) {
    errors.push("Duplicate month");
  }

  if (cashBalance !== null && cashBalance < 0) {
    errors.push("Negative cash balance");
  }

  const status: UploadValidationStatus =
    errors.length > 0 ? "Error" : warnings.length > 0 ? "Warning" : "Valid";

  return {
    rowNumber,
    month,
    cashBalanceRaw,
    cashBalance,
    monthlyChange: null,
    status,
    messages: [...errors, ...warnings],
  };
}

function validatePayrollRow(
  row: RawPayrollCsvRow,
  rowNumber: number,
  duplicateKeys: Set<string>,
): UploadedPayrollRow {
  const month = clean(row.month);
  const employeeName = clean(row.employeeName);
  const department = clean(row.department);
  const role = clean(row.role);
  const salaryRaw = clean(row.salary);
  const benefitsRaw = clean(row.benefits);
  const payrollTaxRaw = clean(row.payrollTax);
  const bonusRaw = clean(row.bonus);
  const startDate = clean(row.startDate);
  const statusText = clean(row.status);
  const salary = parseAmount(salaryRaw);
  const benefits = parseAmount(benefitsRaw);
  const payrollTax = parseAmount(payrollTaxRaw);
  const bonus = parseAmount(bonusRaw || "0");
  const errors: string[] = [];

  if (!month) errors.push("Missing month");
  else if (!monthPattern.test(month)) errors.push("Invalid month format");
  if (!employeeName) errors.push("Missing employeeName");
  if (!department) errors.push("Missing department");
  if (!role) errors.push("Missing role");
  if (!salaryRaw || salary === null) errors.push("Non-numeric salary");
  if (!benefitsRaw || benefits === null) errors.push("Non-numeric benefits");
  if (!payrollTaxRaw || payrollTax === null) errors.push("Non-numeric payrollTax");
  if (bonusRaw && bonus === null) errors.push("Non-numeric bonus");
  if (!startDate || !isValidDate(startDate)) errors.push("Invalid startDate");
  if (!statusText) errors.push("Missing status");
  if (duplicateKeys.has(`${month.toLowerCase()}|${employeeName.toLowerCase()}`)) {
    errors.push("Duplicate employeeName + month");
  }

  const totalMonthlyPayrollCost =
    salary === null || benefits === null || payrollTax === null || bonus === null
      ? null
      : salary / 12 + benefits + payrollTax + bonus;

  return {
    rowNumber,
    month,
    employeeName,
    department,
    role,
    salaryRaw,
    salary,
    benefitsRaw,
    benefits,
    payrollTaxRaw,
    payrollTax,
    bonusRaw,
    bonus,
    startDate,
    statusText,
    totalMonthlyPayrollCost,
    status: errors.length > 0 ? "Error" : "Valid",
    messages: errors,
  };
}

function validateRevenueDetailRow(
  row: RawRevenueDetailCsvRow,
  rowNumber: number,
  duplicateKeys: Set<string>,
): UploadedRevenueDetailRow {
  const month = clean(row.month);
  const customer = clean(row.customer);
  const product = clean(row.product);
  const revenueType = clean(row.revenueType);
  const amountRaw = clean(row.amount);
  const amount = parseAmount(amountRaw);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!month) errors.push("Missing month");
  else if (!monthPattern.test(month)) errors.push("Invalid month format");
  if (!customer) errors.push("Missing customer");
  if (!product) errors.push("Missing product");
  if (!revenueType) errors.push("Missing revenueType");
  if (!amountRaw) errors.push("Missing amount");
  else if (amount === null) errors.push("Non-numeric amount");
  if (amount !== null && amount < 0) warnings.push("Negative revenue");
  if (
    duplicateKeys.has(
      `${month.toLowerCase()}|${customer.toLowerCase()}|${product.toLowerCase()}|${revenueType.toLowerCase()}`,
    )
  ) {
    errors.push("Duplicate month + customer + product + revenueType");
  }

  return {
    rowNumber,
    month,
    customer,
    product,
    revenueType,
    amountRaw,
    amount,
    status: errors.length > 0 ? "Error" : warnings.length > 0 ? "Warning" : "Valid",
    messages: [...errors, ...warnings],
  };
}

function validatePipelineRow(
  row: RawPipelineCsvRow,
  rowNumber: number,
  duplicateKeys: Set<string>,
): UploadedPipelineRow {
  const dealName = clean(row.dealName);
  const customer = clean(row.customer);
  const stage = clean(row.stage);
  const amountRaw = clean(row.amount);
  const probabilityRaw = clean(row.probability);
  const expectedCloseMonth = clean(row.expectedCloseMonth);
  const owner = clean(row.owner);
  const amount = parseAmount(amountRaw);
  const probability = parseAmount(probabilityRaw);
  const errors: string[] = [];

  if (!dealName) errors.push("Missing dealName");
  if (!customer) errors.push("Missing customer");
  if (!stage) errors.push("Missing stage");
  if (!amountRaw || amount === null) errors.push("Non-numeric amount");
  if (probability === null || probability < 0 || probability > 100) {
    errors.push("Probability not between 0 and 100");
  }
  if (!expectedCloseMonth || !monthPattern.test(expectedCloseMonth)) {
    errors.push("Invalid expectedCloseMonth");
  }
  if (duplicateKeys.has(`${dealName.toLowerCase()}|${customer.toLowerCase()}`)) {
    errors.push("Duplicate dealName + customer");
  }

  return {
    rowNumber,
    dealName,
    customer,
    stage,
    amountRaw,
    amount,
    probabilityRaw,
    probability,
    expectedCloseMonth,
    owner,
    weightedPipeline:
      amount === null || probability === null ? null : amount * (probability / 100),
    status: errors.length > 0 ? "Error" : "Valid",
    messages: errors,
  };
}

function validateBankTransactionRow(
  row: RawBankTransactionCsvRow,
  rowNumber: number,
  duplicateKeys: Set<string>,
): UploadedBankTransactionRow {
  const date = clean(row.date);
  const description = clean(row.description);
  const category = clean(row.category);
  const amountRaw = clean(row.amount);
  const amount = parseAmount(amountRaw);
  const errors: string[] = [];

  if (!date) errors.push("Missing date");
  else if (!isValidDate(date)) errors.push("Invalid date");
  if (!description) errors.push("Missing description");
  if (!category) errors.push("Missing category");
  if (!amountRaw) errors.push("Missing amount");
  else if (amount === null) errors.push("Non-numeric amount");
  if (
    duplicateKeys.has(
      `${date.toLowerCase()}|${description.toLowerCase()}|${amountRaw}`,
    )
  ) {
    errors.push("Duplicate date + description + amount");
  }

  return {
    rowNumber,
    date,
    description,
    category,
    amountRaw,
    amount,
    status: errors.length > 0 ? "Error" : "Valid",
    messages: errors,
  };
}

function validateForecastRow(
  row: RawForecastCsvRow,
  rowNumber: number,
  duplicateKeys: Set<string>,
): UploadedForecastRow {
  const month = clean(row.month);
  const account = clean(row.account);
  const category = clean(row.category);
  const amountRaw = clean(row.amount);
  const forecastVersion = clean(row.forecastVersion);
  const amount = parseAmount(amountRaw);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!month) errors.push("Missing month");
  else if (!monthPattern.test(month)) errors.push("Invalid month format");
  if (!account) errors.push("Missing account");
  if (!category) errors.push("Missing category");
  if (!amountRaw) errors.push("Missing amount");
  else if (amount === null) errors.push("Non-numeric amount");
  if (!forecastVersion) errors.push("Missing forecastVersion");
  if (
    duplicateKeys.has(
      `${month.toLowerCase()}|${account.toLowerCase()}|${category.toLowerCase()}|${forecastVersion.toLowerCase()}`,
    )
  ) {
    errors.push("Duplicate month + account + category + forecastVersion");
  }
  if (amount !== null && category) {
    if (isRevenueCategory(category) && amount < 0) warnings.push("Unexpected negative revenue");
    if (!isRevenueCategory(category) && amount > 0) warnings.push("Unexpected positive expense");
  }

  return {
    rowNumber,
    month,
    account,
    category,
    amountRaw,
    amount,
    forecastVersion,
    status: errors.length > 0 ? "Error" : warnings.length > 0 ? "Warning" : "Valid",
    messages: [...errors, ...warnings],
  };
}

function addCashMovementWarnings(rows: UploadedCashRow[]) {
  const rowsByMonth = [...rows].sort(
    (first, second) => cashMonthSortValue(first.month) - cashMonthSortValue(second.month),
  );
  const monthlyChangeByRowNumber = new Map<number, number | null>();
  const movementWarningRows = new Set<number>();

  rowsByMonth.forEach((row, index) => {
    const priorRow = rowsByMonth[index - 1];

    if (
      !priorRow ||
      row.cashBalance === null ||
      priorRow.cashBalance === null ||
      priorRow.cashBalance === 0 ||
      row.status === "Error" ||
      priorRow.status === "Error"
    ) {
      monthlyChangeByRowNumber.set(row.rowNumber, null);
      return;
    }

    const monthlyChange = row.cashBalance - priorRow.cashBalance;
    monthlyChangeByRowNumber.set(row.rowNumber, monthlyChange);

    if (Math.abs(monthlyChange) / Math.abs(priorRow.cashBalance) > 0.25) {
      movementWarningRows.add(row.rowNumber);
    }
  });

  return rows.map((row) => {
    const messages = [...row.messages];
    let status = row.status;

    if (movementWarningRows.has(row.rowNumber) && status !== "Error") {
      messages.push("Large month-over-month cash movement");
      status = "Warning";
    }

    return {
      ...row,
      monthlyChange: monthlyChangeByRowNumber.get(row.rowNumber) ?? null,
      status,
      messages,
    };
  });
}

function findDuplicateKeys(rows: RawFinancialCsvRow[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  rows.forEach((row) => {
    const key = rowKey(clean(row.month), clean(row.account), clean(row.category));

    if (!key) {
      return;
    }

    if (seen.has(key)) {
      duplicates.add(key);
    } else {
      seen.add(key);
    }
  });

  return duplicates;
}

function findDuplicateMonths(rows: RawCashCsvRow[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  rows.forEach((row) => {
    const month = clean(row.month).toLowerCase();

    if (!month) {
      return;
    }

    if (seen.has(month)) {
      duplicates.add(month);
    } else {
      seen.add(month);
    }
  });

  return duplicates;
}

function findDuplicateBy<T>(rows: T[], keyForRow: (row: T) => string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  rows.forEach((row) => {
    const key = keyForRow(row);

    if (!key.replace(/\|/g, "")) {
      return;
    }

    if (seen.has(key)) {
      duplicates.add(key);
    } else {
      seen.add(key);
    }
  });

  return duplicates;
}

function summarizeRows(rows: { status: UploadValidationStatus }[]) {
  return rows.reduce(
    (summary, row) => {
      summary.totalRows += 1;

      if (row.status === "Valid") {
        summary.validRows += 1;
      } else if (row.status === "Warning") {
        summary.warningRows += 1;
      } else {
        summary.errorRows += 1;
      }

      return summary;
    },
    {
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0,
    },
  );
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAmount(value: string) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .trim();
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function rowKey(month: string, account: string, category: string) {
  if (!month || !account || !category) {
    return "";
  }

  return `${month.toLowerCase()}|${account.toLowerCase()}|${category.toLowerCase()}`;
}

function isRevenueCategory(category: string) {
  return category.toLowerCase().includes("revenue");
}

function isValidDate(value: string) {
  if (!datePattern.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);

  return !Number.isNaN(date.getTime());
}

function normalizeHeader(header: string) {
  const normalized = header.trim().toLowerCase();
  const headerMap: Record<string, string> = {
    cashbalance: "cashBalance",
    employeename: "employeeName",
    payrolltax: "payrollTax",
    startdate: "startDate",
    revenuetype: "revenueType",
    dealname: "dealName",
    expectedclosemonth: "expectedCloseMonth",
    forecastversion: "forecastVersion",
  };

  return headerMap[normalized] ?? normalized;
}

function cashMonthSortValue(month: string) {
  if (!monthPattern.test(month)) {
    return Number.POSITIVE_INFINITY;
  }

  return new Date(`${month}-01T00:00:00`).getTime();
}
