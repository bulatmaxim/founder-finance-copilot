export type MappingStatus = "Suggested" | "Approved" | "Needs Review" | "Unmapped";

export type AccountMapping = {
  rawAccountName: string;
  source: string;
  suggestedCategory: string;
  confidence: number;
  status: MappingStatus;
};

export const accountMappings: AccountMapping[] = [
  {
    rawAccountName: "Stripe Fees",
    source: "P&L Actuals",
    suggestedCategory: "Payment Processing",
    confidence: 96,
    status: "Approved",
  },
  {
    rawAccountName: "AWS Hosting",
    source: "P&L Actuals",
    suggestedCategory: "Cloud Hosting",
    confidence: 94,
    status: "Approved",
  },
  {
    rawAccountName: "Gusto Payroll",
    source: "Payroll / Headcount",
    suggestedCategory: "Payroll",
    confidence: 92,
    status: "Suggested",
  },
  {
    rawAccountName: "HubSpot Subscription",
    source: "P&L Actuals",
    suggestedCategory: "Sales & Marketing Software",
    confidence: 88,
    status: "Needs Review",
  },
  {
    rawAccountName: "Founder Salary",
    source: "Payroll / Headcount",
    suggestedCategory: "G&A Payroll",
    confidence: 86,
    status: "Needs Review",
  },
  {
    rawAccountName: "OpenAI API Usage",
    source: "P&L Actuals",
    suggestedCategory: "Cloud / AI Infrastructure",
    confidence: 82,
    status: "Suggested",
  },
  {
    rawAccountName: "Legal Counsel",
    source: "P&L Actuals",
    suggestedCategory: "Professional Services",
    confidence: 91,
    status: "Approved",
  },
  {
    rawAccountName: "Office Lease",
    source: "P&L Actuals",
    suggestedCategory: "Rent",
    confidence: 93,
    status: "Approved",
  },
  {
    rawAccountName: "Travel - Sales Team",
    source: "P&L Actuals",
    suggestedCategory: "Travel",
    confidence: 89,
    status: "Suggested",
  },
  {
    rawAccountName: "Customer Refunds",
    source: "Revenue Detail",
    suggestedCategory: "Contra Revenue",
    confidence: 78,
    status: "Unmapped",
  },
];

export const standardFpnaCategories = [
  "Revenue",
  "Contra Revenue",
  "Cost of Revenue",
  "Gross Profit",
  "Sales & Marketing",
  "Research & Development",
  "General & Administrative",
  "Payroll",
  "Cloud Hosting",
  "Software",
  "Payment Processing",
  "Professional Services",
  "Rent",
  "Travel",
  "Insurance",
  "Other Expense",
];
