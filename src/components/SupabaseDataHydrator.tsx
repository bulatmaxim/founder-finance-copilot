"use client";

import { useEffect } from "react";
import {
  getBankTransactions,
  getBudgetRows,
  getCashBalances,
  getFinancialRows,
  getForecastRows,
  getLatestAIBrief as getLatestSupabaseAIBrief,
  getPayrollRows,
  getPipelineRows,
  getRevenueDetailRows,
} from "@/lib/supabase/data";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import {
  saveLatestAIBrief,
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
  UploadedBankTransactionRow,
  UploadedCashRow,
  UploadedFinancialRow,
  UploadedForecastRow,
  UploadedPayrollRow,
  UploadedPipelineRow,
  UploadedRevenueDetailRow,
} from "@/types/financial";

export function SupabaseDataHydrator() {
  useEffect(() => {
    async function hydrate() {
      if (!hasSupabaseBrowserEnv()) {
        return;
      }

      try {
        const [
          actuals,
          budget,
          cash,
          payroll,
          revenueDetail,
          pipeline,
          bankTransactions,
          forecast,
          aiBriefRow,
        ] = await Promise.all([
          getFinancialRows(),
          getBudgetRows(),
          getCashBalances(),
          getPayrollRows(),
          getRevenueDetailRows(),
          getPipelineRows(),
          getBankTransactions(),
          getForecastRows(),
          getLatestSupabaseAIBrief(),
        ]);

        if (actuals.length > 0) {
          saveUploadedActuals(actuals.map(mapFinancialRow));
        }

        if (budget.length > 0) {
          saveUploadedBudget(budget.map(mapFinancialRow));
        }

        if (cash.length > 0) {
          saveUploadedCash(cash.map(mapCashRow));
        }

        if (payroll.length > 0) {
          saveUploadedPayroll(payroll.map(mapPayrollRow));
        }

        if (revenueDetail.length > 0) {
          saveUploadedRevenueDetail(revenueDetail.map(mapRevenueDetailRow));
        }

        if (pipeline.length > 0) {
          saveUploadedPipeline(pipeline.map(mapPipelineRow));
        }

        if (bankTransactions.length > 0) {
          saveUploadedBankTransactions(bankTransactions.map(mapBankTransactionRow));
        }

        if (forecast.length > 0) {
          saveUploadedForecast(forecast.map(mapForecastRow));
        }

        if (aiBriefRow?.ai_output) {
          saveLatestAIBrief(aiBriefRow.ai_output);
        }
      } catch (error) {
        console.error("Supabase data hydration failed", error);
      }
    }

    void hydrate();
  }, []);

  return null;
}

function mapFinancialRow(row: Record<string, unknown>, index: number): UploadedFinancialRow {
  const amount = toNumber(row.amount);

  return {
    rowNumber: index + 1,
    month: String(row.month ?? ""),
    account: String(row.account ?? ""),
    category: String(row.category ?? ""),
    amountRaw: amount === null ? "" : String(amount),
    amount,
    status: "Valid",
    messages: [],
  };
}

function mapForecastRow(row: Record<string, unknown>, index: number): UploadedForecastRow {
  const amount = toNumber(row.amount);

  return {
    rowNumber: index + 1,
    month: String(row.month ?? ""),
    account: String(row.account ?? ""),
    category: String(row.category ?? ""),
    amountRaw: amount === null ? "" : String(amount),
    amount,
    forecastVersion: String(row.forecast_version ?? "Uploaded Forecast"),
    status: "Valid",
    messages: [],
  };
}

function mapCashRow(row: Record<string, unknown>, index: number, rows: Record<string, unknown>[]): UploadedCashRow {
  const cashBalance = toNumber(row.cash_balance);
  const priorBalance = index > 0 ? toNumber(rows[index - 1].cash_balance) : null;

  return {
    rowNumber: index + 1,
    month: String(row.month ?? ""),
    cashBalanceRaw: cashBalance === null ? "" : String(cashBalance),
    cashBalance,
    monthlyChange:
      cashBalance !== null && priorBalance !== null ? cashBalance - priorBalance : null,
    status: "Valid",
    messages: [],
  };
}

function mapPayrollRow(row: Record<string, unknown>, index: number): UploadedPayrollRow {
  const salary = toNumber(row.salary);
  const benefits = toNumber(row.benefits);
  const payrollTax = toNumber(row.payroll_tax);
  const bonus = toNumber(row.bonus);

  return {
    rowNumber: index + 1,
    month: String(row.month ?? ""),
    employeeName: String(row.employee_name ?? ""),
    department: String(row.department ?? ""),
    role: String(row.role ?? ""),
    salaryRaw: salary === null ? "" : String(salary),
    salary,
    benefitsRaw: benefits === null ? "" : String(benefits),
    benefits,
    payrollTaxRaw: payrollTax === null ? "" : String(payrollTax),
    payrollTax,
    bonusRaw: bonus === null ? "" : String(bonus),
    bonus,
    startDate: String(row.start_date ?? ""),
    statusText: String(row.status ?? ""),
    totalMonthlyPayrollCost:
      salary !== null || benefits !== null || payrollTax !== null || bonus !== null
        ? (salary ?? 0) / 12 + (benefits ?? 0) + (payrollTax ?? 0) + (bonus ?? 0)
        : null,
    status: "Valid",
    messages: [],
  };
}

function mapRevenueDetailRow(row: Record<string, unknown>, index: number): UploadedRevenueDetailRow {
  const amount = toNumber(row.amount);

  return {
    rowNumber: index + 1,
    month: String(row.month ?? ""),
    customer: String(row.customer ?? ""),
    product: String(row.product ?? ""),
    revenueType: String(row.revenue_type ?? ""),
    amountRaw: amount === null ? "" : String(amount),
    amount,
    status: "Valid",
    messages: [],
  };
}

function mapPipelineRow(row: Record<string, unknown>, index: number): UploadedPipelineRow {
  const amount = toNumber(row.amount);
  const probability = toNumber(row.probability);

  return {
    rowNumber: index + 1,
    dealName: String(row.deal_name ?? ""),
    customer: String(row.customer ?? ""),
    stage: String(row.stage ?? ""),
    amountRaw: amount === null ? "" : String(amount),
    amount,
    probabilityRaw: probability === null ? "" : String(probability),
    probability,
    expectedCloseMonth: String(row.expected_close_month ?? ""),
    owner: String(row.owner ?? ""),
    weightedPipeline:
      amount !== null && probability !== null ? amount * (probability / 100) : null,
    status: "Valid",
    messages: [],
  };
}

function mapBankTransactionRow(row: Record<string, unknown>, index: number): UploadedBankTransactionRow {
  const amount = toNumber(row.amount);

  return {
    rowNumber: index + 1,
    date: String(row.date ?? ""),
    description: String(row.description ?? ""),
    category: String(row.category ?? ""),
    amountRaw: amount === null ? "" : String(amount),
    amount,
    status: "Valid",
    messages: [],
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
