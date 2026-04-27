export type VarianceStatus = "Favorable" | "Unfavorable" | "Neutral";
export type FavorableDirection = "higher" | "lower";

export type FinancialPeriod = {
  month: string;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  grossMargin: number;
  salesAndMarketing: number;
  researchAndDevelopment: number;
  generalAndAdministrative: number;
  operatingExpenses: number;
  ebitda: number;
  cashBalance: number;
  netBurn: number;
  runwayMonths: number;
};

export type VarianceResult = {
  varianceDollars: number;
  variancePercent: number;
  status: VarianceStatus;
};

export type HireCostInputs = {
  annualSalary: number;
  bonusPercent: number;
  benefitsLoadPercent: number;
  payrollTaxPercent: number;
  oneTimeEquipmentCost: number;
};

export type HireCostImpact = {
  monthlySalaryCost: number;
  monthlyBonusCost: number;
  monthlyBenefitsCost: number;
  monthlyPayrollTaxCost: number;
  totalMonthlyCostImpact: number;
  firstYearCashImpact: number;
};

export type HireScenario = {
  name: string;
  monthlyBurnImpact: number;
  totalBurn: number;
  runwayMonths: number;
  runwayChangeMonths: number;
  recommendationLevel: "Affordable" | "Monitor Closely" | "Runway Pressure";
};

export function calculateGrossProfit(revenue: number, costOfRevenue: number) {
  return revenue - costOfRevenue;
}

export function calculateGrossMargin(revenue: number, grossProfit: number) {
  if (revenue === 0) {
    return 0;
  }

  return grossProfit / revenue;
}

export function calculateOperatingExpenses(
  salesAndMarketing: number,
  researchAndDevelopment: number,
  generalAndAdministrative: number,
) {
  return salesAndMarketing + researchAndDevelopment + generalAndAdministrative;
}

export function calculateEbitda(
  grossProfit: number,
  operatingExpenses: number,
) {
  return grossProfit - operatingExpenses;
}

export function calculateNetBurn(ebitda: number) {
  return Math.max(0, ebitda * -1);
}

export function calculateRunwayMonths(cashBalance: number, netBurn: number) {
  if (netBurn <= 0) {
    return null;
  }

  return cashBalance / netBurn;
}

export function aggregateFinancialPeriods(periods: FinancialPeriod[]) {
  const lastPeriod = periods[periods.length - 1];
  const revenue = sumBy(periods, "revenue");
  const costOfRevenue = sumBy(periods, "costOfRevenue");
  const salesAndMarketing = sumBy(periods, "salesAndMarketing");
  const researchAndDevelopment = sumBy(periods, "researchAndDevelopment");
  const generalAndAdministrative = sumBy(periods, "generalAndAdministrative");
  const grossProfit = calculateGrossProfit(revenue, costOfRevenue);
  const grossMargin = calculateGrossMargin(revenue, grossProfit);
  const operatingExpenses = calculateOperatingExpenses(
    salesAndMarketing,
    researchAndDevelopment,
    generalAndAdministrative,
  );
  const ebitda = calculateEbitda(grossProfit, operatingExpenses);
  const netBurn = sumBy(periods, "netBurn");
  const averageMonthlyBurn = netBurn / periods.length;
  const runwayMonths = calculateRunwayMonths(
    lastPeriod.cashBalance,
    averageMonthlyBurn,
  );

  return {
    month: lastPeriod.month,
    revenue,
    costOfRevenue,
    grossProfit,
    grossMargin,
    salesAndMarketing,
    researchAndDevelopment,
    generalAndAdministrative,
    operatingExpenses,
    ebitda,
    cashBalance: lastPeriod.cashBalance,
    netBurn,
    runwayMonths: runwayMonths ?? 0,
  };
}

export function calculateVarianceDollars(actual: number, budget: number) {
  return actual - budget;
}

export function calculateVariancePercent(actual: number, budget: number) {
  if (budget === 0) {
    return 0;
  }

  return (actual - budget) / Math.abs(budget);
}

export function getVarianceStatus(
  actual: number,
  budget: number,
  favorableDirection: FavorableDirection,
): VarianceStatus {
  const variance = calculateVarianceDollars(actual, budget);

  if (variance === 0) {
    return "Neutral";
  }

  if (favorableDirection === "higher") {
    return variance > 0 ? "Favorable" : "Unfavorable";
  }

  return variance < 0 ? "Favorable" : "Unfavorable";
}

export function calculateVariance(
  actual: number,
  budget: number,
  favorableDirection: FavorableDirection,
): VarianceResult {
  return {
    varianceDollars: calculateVarianceDollars(actual, budget),
    variancePercent: calculateVariancePercent(actual, budget),
    status: getVarianceStatus(actual, budget, favorableDirection),
  };
}

export function calculateMonthlyVariance(
  actual: number,
  budget: number,
  favorableDirection: FavorableDirection,
) {
  return calculateVariance(actual, budget, favorableDirection);
}

export function calculateQuarterlyVariance(
  actual: number,
  budget: number,
  favorableDirection: FavorableDirection,
) {
  return calculateVariance(actual, budget, favorableDirection);
}

export function calculateYtdVariance(
  actual: number,
  budget: number,
  favorableDirection: FavorableDirection,
) {
  return calculateVariance(actual, budget, favorableDirection);
}

export function getTopUnfavorableVariances<
  T extends { status: VarianceStatus; varianceDollars: number },
>(rows: T[], limit = 5) {
  return rows
    .filter((row) => row.status === "Unfavorable")
    .sort(
      (first, second) =>
        Math.abs(second.varianceDollars) - Math.abs(first.varianceDollars),
    )
    .slice(0, limit);
}

export function calculateHireCostImpact({
  annualSalary,
  bonusPercent,
  benefitsLoadPercent,
  payrollTaxPercent,
  oneTimeEquipmentCost,
}: HireCostInputs): HireCostImpact {
  const monthlySalaryCost = annualSalary / 12;
  const monthlyBonusCost = (annualSalary * (bonusPercent / 100)) / 12;
  const monthlyBenefitsCost = (annualSalary * (benefitsLoadPercent / 100)) / 12;
  const monthlyPayrollTaxCost = (annualSalary * (payrollTaxPercent / 100)) / 12;
  const totalMonthlyCostImpact =
    monthlySalaryCost +
    monthlyBonusCost +
    monthlyBenefitsCost +
    monthlyPayrollTaxCost;

  return {
    monthlySalaryCost,
    monthlyBonusCost,
    monthlyBenefitsCost,
    monthlyPayrollTaxCost,
    totalMonthlyCostImpact,
    firstYearCashImpact: totalMonthlyCostImpact * 12 + oneTimeEquipmentCost,
  };
}

export function calculateHireScenario({
  name,
  currentCashBalance,
  currentNetBurn,
  currentRunwayMonths,
  monthlyBurnImpact,
}: {
  name: string;
  currentCashBalance: number;
  currentNetBurn: number;
  currentRunwayMonths: number;
  monthlyBurnImpact: number;
}): HireScenario {
  const totalBurn = currentNetBurn + monthlyBurnImpact;
  const runwayMonths = calculateRunwayMonths(currentCashBalance, totalBurn) ?? 0;

  return {
    name,
    monthlyBurnImpact,
    totalBurn,
    runwayMonths,
    runwayChangeMonths: runwayMonths - currentRunwayMonths,
    recommendationLevel: getHireRecommendationLevel(runwayMonths),
  };
}

export function getHireRecommendationLevel(runwayMonths: number) {
  if (runwayMonths > 12) {
    return "Affordable";
  }

  if (runwayMonths >= 9) {
    return "Monitor Closely";
  }

  return "Runway Pressure";
}

export function estimateCashOutDate(
  latestMonth: string,
  runwayMonths: number,
) {
  const [monthName, yearText] = latestMonth.split(" ");
  const monthIndex = new Date(`${monthName} 1, ${yearText}`).getMonth();
  const year = Number(yearText);
  const date = new Date(year, monthIndex, 1);

  date.setMonth(date.getMonth() + Math.floor(runwayMonths));

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function sumBy(periods: FinancialPeriod[], key: keyof FinancialPeriod) {
  return periods.reduce((total, period) => {
    const value = period[key];

    return typeof value === "number" ? total + value : total;
  }, 0);
}
