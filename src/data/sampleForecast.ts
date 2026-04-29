import { sampleFinancials, type ActualFinancialMonth } from "@/data/sampleFinancials";

export type ForecastVersionId =
  | "budget"
  | "2-plus-10"
  | "5-plus-7"
  | "8-plus-4"
  | "10-plus-2"
  | "latest"
  | "downside"
  | "upside";

export type ForecastPeriodType = "Actual" | "Forecast" | "Preliminary" | "Budget";

export type ForecastMonth = ActualFinancialMonth & {
  periodType: ForecastPeriodType;
};

export type ForecastVersion = {
  id: string;
  name: string;
  actualMonths: number;
  description: string;
  months: ForecastMonth[];
};

const fiscalMonths = [
  "Jan 2026",
  "Feb 2026",
  "Mar 2026",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
];

const actualFromFinancials = sampleFinancials.filter((period) =>
  ["Jan 2026", "Feb 2026", "Mar 2026"].includes(period.month),
);

const localActualizedMonths: ActualFinancialMonth[] = [
  createMonth("Apr 2026", 252000, 0.74, 104000, 142000, 82000, 1604000),
  createMonth("May 2026", 268000, 0.75, 107000, 144000, 84000, 1491000),
  createMonth("Jun 2026", 284000, 0.75, 110000, 146000, 85000, 1384000),
  createMonth("Jul 2026", 299000, 0.75, 112000, 148000, 87000, 1281000),
  createMonth("Aug 2026", 315000, 0.76, 115000, 150000, 88000, 1189000),
  createMonth("Sep 2026", 331000, 0.76, 118000, 152000, 90000, 1101000),
  createMonth("Oct 2026", 348000, 0.76, 120000, 154000, 91000, 1019000),
];

const fy2026Actuals = [...actualFromFinancials, ...localActualizedMonths];

const fy2026Budget = [
  createMonth("Jan 2026", 201000, 0.73, 95000, 134000, 78000, 2018000),
  createMonth("Feb 2026", 216000, 0.73, 97000, 136000, 79000, 1899000),
  createMonth("Mar 2026", 230000, 0.73, 99000, 138000, 81000, 1788000),
  createMonth("Apr 2026", 246000, 0.73, 101000, 140000, 82000, 1684000),
  createMonth("May 2026", 262000, 0.74, 103000, 142000, 84000, 1583000),
  createMonth("Jun 2026", 279000, 0.74, 106000, 144000, 85000, 1490000),
  createMonth("Jul 2026", 296000, 0.74, 108000, 146000, 87000, 1401000),
  createMonth("Aug 2026", 314000, 0.75, 111000, 148000, 88000, 1320000),
  createMonth("Sep 2026", 333000, 0.75, 114000, 150000, 90000, 1246000),
  createMonth("Oct 2026", 352000, 0.75, 116000, 152000, 91000, 1179000),
  createMonth("Nov 2026", 372000, 0.76, 119000, 154000, 93000, 1121000),
  createMonth("Dec 2026", 394000, 0.76, 122000, 156000, 94000, 1072000),
];

export const forecastVersions: ForecastVersion[] = [
  buildVersion({
    id: "budget",
    name: "FY2026 Budget",
    actualMonths: 0,
    description: "0 months actuals + 12 months forecast.",
    revenueMultiplier: 1,
    grossMarginDelta: 0,
    opexMultiplier: 1,
    cashAdjustment: 0,
  }),
  buildVersion({
    id: "2-plus-10",
    name: "FY2026 2+10 Forecast",
    actualMonths: 2,
    description: "2 months actuals + 10 months forecast.",
    revenueMultiplier: 1.01,
    grossMarginDelta: 0,
    opexMultiplier: 1.01,
    cashAdjustment: -25000,
  }),
  buildVersion({
    id: "5-plus-7",
    name: "FY2026 5+7 Forecast",
    actualMonths: 5,
    description: "5 months actuals + 7 months forecast.",
    revenueMultiplier: 0.99,
    grossMarginDelta: -0.005,
    opexMultiplier: 1.015,
    cashAdjustment: -65000,
  }),
  buildVersion({
    id: "8-plus-4",
    name: "FY2026 8+4 Forecast",
    actualMonths: 8,
    description: "8 months actuals + 4 months forecast.",
    revenueMultiplier: 0.985,
    grossMarginDelta: -0.006,
    opexMultiplier: 1.02,
    cashAdjustment: -95000,
  }),
  buildVersion({
    id: "10-plus-2",
    name: "FY2026 10+2 Forecast",
    actualMonths: 10,
    description: "10 months actuals + 2 months forecast.",
    revenueMultiplier: 0.98,
    grossMarginDelta: -0.006,
    opexMultiplier: 1.02,
    cashAdjustment: -120000,
  }),
  buildVersion({
    id: "latest",
    name: "Latest Forecast",
    actualMonths: 10,
    description: "Latest management forecast using 10 closed months and 2 future months.",
    revenueMultiplier: 0.975,
    grossMarginDelta: -0.008,
    opexMultiplier: 1.025,
    cashAdjustment: -145000,
  }),
  buildVersion({
    id: "downside",
    name: "Downside Case",
    actualMonths: 10,
    description: "Downside case with slower revenue conversion and higher burn.",
    revenueMultiplier: 0.92,
    grossMarginDelta: -0.015,
    opexMultiplier: 1.045,
    cashAdjustment: -260000,
  }),
  buildVersion({
    id: "upside",
    name: "Upside Case",
    actualMonths: 10,
    description: "Upside case with stronger revenue conversion and controlled expenses.",
    revenueMultiplier: 1.06,
    grossMarginDelta: 0.01,
    opexMultiplier: 0.995,
    cashAdjustment: 85000,
  }),
];

export const forecastVersionOptions = forecastVersions.map((version) => ({
  id: version.id,
  name: version.name,
}));

export const sampleForecast = forecastVersions;

function buildVersion({
  id,
  name,
  actualMonths,
  description,
  revenueMultiplier,
  grossMarginDelta,
  opexMultiplier,
  cashAdjustment,
}: {
  id: ForecastVersionId;
  name: string;
  actualMonths: number;
  description: string;
  revenueMultiplier: number;
  grossMarginDelta: number;
  opexMultiplier: number;
  cashAdjustment: number;
}): ForecastVersion {
  return {
    id,
    name,
    actualMonths,
    description,
    months: fiscalMonths.map((month, index) => {
      if (index < actualMonths) {
        return {
          ...fy2026Actuals[index],
          periodType: "Actual",
        };
      }

      return {
        ...scaleMonth(
          fy2026Budget[index],
          revenueMultiplier,
          grossMarginDelta,
          opexMultiplier,
          cashAdjustment,
        ),
        periodType: "Forecast",
      };
    }),
  };
}

function scaleMonth(
  month: ActualFinancialMonth,
  revenueMultiplier: number,
  grossMarginDelta: number,
  opexMultiplier: number,
  cashAdjustment: number,
) {
  const revenue = Math.round(month.revenue * revenueMultiplier);
  const grossMargin = Math.min(0.82, Math.max(0.55, month.grossMargin + grossMarginDelta));
  const costOfRevenue = Math.round(revenue * (1 - grossMargin));
  const grossProfit = revenue - costOfRevenue;
  const salesAndMarketing = Math.round(month.salesAndMarketing * opexMultiplier);
  const researchAndDevelopment = Math.round(
    month.researchAndDevelopment * opexMultiplier,
  );
  const generalAndAdministrative = Math.round(
    month.generalAndAdministrative * opexMultiplier,
  );
  const operatingExpenses =
    salesAndMarketing + researchAndDevelopment + generalAndAdministrative;
  const ebitda = grossProfit - operatingExpenses;
  const netBurn = Math.max(0, ebitda * -1);
  const cashBalance = Math.max(0, Math.round(month.cashBalance + cashAdjustment));
  const runwayMonths = netBurn > 0 ? cashBalance / netBurn : 99;

  return {
    month: month.month,
    revenue,
    costOfRevenue,
    grossProfit,
    grossMargin,
    salesAndMarketing,
    researchAndDevelopment,
    generalAndAdministrative,
    operatingExpenses,
    ebitda,
    cashBalance,
    netBurn,
    runwayMonths,
  };
}

function createMonth(
  month: string,
  revenue: number,
  grossMargin: number,
  salesAndMarketing: number,
  researchAndDevelopment: number,
  generalAndAdministrative: number,
  cashBalance: number,
): ActualFinancialMonth {
  const costOfRevenue = Math.round(revenue * (1 - grossMargin));
  const grossProfit = revenue - costOfRevenue;
  const operatingExpenses =
    salesAndMarketing + researchAndDevelopment + generalAndAdministrative;
  const ebitda = grossProfit - operatingExpenses;
  const netBurn = Math.max(0, ebitda * -1);
  const runwayMonths = netBurn > 0 ? cashBalance / netBurn : 99;

  return {
    month,
    revenue,
    costOfRevenue,
    grossProfit,
    grossMargin,
    salesAndMarketing,
    researchAndDevelopment,
    generalAndAdministrative,
    operatingExpenses,
    ebitda,
    cashBalance,
    netBurn,
    runwayMonths,
  };
}
