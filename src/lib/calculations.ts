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

function sumBy(periods: FinancialPeriod[], key: keyof FinancialPeriod) {
  return periods.reduce((total, period) => {
    const value = period[key];

    return typeof value === "number" ? total + value : total;
  }, 0);
}
