export type VarianceStatus = "Favorable" | "Unfavorable" | "Neutral";

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
  favorableDirection: "higher" | "lower",
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
