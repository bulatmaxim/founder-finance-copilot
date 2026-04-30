import { NextResponse, type NextRequest } from "next/server";
import { getOpenAIClient, getOpenAIModel } from "@/lib/aiClient";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisionAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recommendation",
    "cfoSummary",
    "financialImpact",
    "keyAssumptions",
    "risks",
    "unresolvedQuestions",
    "recommendedNextSteps",
    "scenarios",
    "dataWarnings",
  ],
  properties: {
    recommendation: {
      type: "string",
      enum: [
        "Proceed",
        "Proceed with conditions",
        "Wait",
        "Resize / reduce scope",
        "Finance differently",
        "Not enough information",
      ],
    },
    cfoSummary: { type: "string" },
    financialImpact: {
      type: "object",
      additionalProperties: false,
      required: [
        "upfrontCost",
        "monthlyRecurringImpact",
        "runwayImpact",
        "cashBalanceImpact",
        "ebitdaOperatingExpenseImpact",
        "forecastImpact",
        "paybackRoi",
      ],
      properties: {
        upfrontCost: { type: "string" },
        monthlyRecurringImpact: { type: "string" },
        runwayImpact: { type: "string" },
        cashBalanceImpact: { type: "string" },
        ebitdaOperatingExpenseImpact: { type: "string" },
        forecastImpact: { type: "string" },
        paybackRoi: { type: "string" },
      },
    },
    keyAssumptions: { type: "array", items: { type: "string" } },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "severity", "description", "mitigation"],
        properties: {
          category: { type: "string" },
          severity: { type: "string", enum: ["Low", "Medium", "High"] },
          description: { type: "string" },
          mitigation: { type: "string" },
        },
      },
    },
    unresolvedQuestions: { type: "array", items: { type: "string" } },
    recommendedNextSteps: { type: "array", items: { type: "string" } },
    scenarios: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "summary", "cashImpact", "runwayImpact", "conditions"],
        properties: {
          name: { type: "string", enum: ["Base case", "Conservative case", "Aggressive case"] },
          summary: { type: "string" },
          cashImpact: { type: "string" },
          runwayImpact: { type: "string" },
          conditions: { type: "string" },
        },
      },
    },
    dataWarnings: { type: "array", items: { type: "string" } },
  },
} as const;

type Question = {
  id: string;
  label: string;
  question: string;
};

type RequestBody = {
  decision_prompt?: string;
  decision_type?: string;
  questions?: Question[];
  answers?: Record<string, string>;
  forecast_version_id?: string;
};

export async function POST(request: NextRequest) {
  const routeClient = createRouteClient(request);
  const { supabase } = routeClient;

  try {
    const body = (await request.json()) as RequestBody;
    const decisionPrompt = body.decision_prompt?.trim();

    if (!decisionPrompt) {
      return routeClient.applyCookies(
        NextResponse.json({ error: "Describe the decision first." }, { status: 400 }),
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return routeClient.applyCookies(
        NextResponse.json({ error: "You must be logged in." }, { status: 401 }),
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (companyError || !company) {
      return routeClient.applyCookies(
        NextResponse.json(
          { error: "Complete a company profile before analyzing decisions." },
          { status: 400 },
        ),
      );
    }

    const latestForecastQuery = supabase
      .from("forecast_versions")
      .select("*")
      .eq("company_id", company.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const selectedForecastQuery = body.forecast_version_id
      ? supabase
          .from("forecast_versions")
          .select("*")
          .eq("company_id", company.id)
          .eq("id", body.forecast_version_id)
          .maybeSingle()
      : latestForecastQuery;

    const [
      forecastResult,
      actualsResult,
      budgetResult,
      cashResult,
      closeResult,
      mappingsResult,
      briefResult,
      reportResult,
    ] = await Promise.all([
      selectedForecastQuery,
      supabase
        .from("financial_actuals")
        .select("month, account, category, amount")
        .eq("company_id", company.id)
        .order("month", { ascending: true }),
      supabase
        .from("budget_rows")
        .select("month, account, category, amount")
        .eq("company_id", company.id)
        .order("month", { ascending: true }),
      supabase
        .from("cash_rows")
        .select("month, cash_balance, burn, runway_months")
        .eq("company_id", company.id)
        .order("month", { ascending: true }),
      supabase
        .from("monthly_close_items")
        .select("reporting_month, file_category, status, validation_summary")
        .eq("company_id", company.id)
        .order("reporting_month", { ascending: false })
        .limit(20),
      supabase
        .from("account_mappings")
        .select("raw_account_name, normalized_category, department, status")
        .eq("company_id", company.id)
        .limit(200),
      supabase
        .from("ai_briefs")
        .select("reporting_month, brief, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(2),
      supabase
        .from("monthly_reports")
        .select("title, report_type, status, reporting_month, commentary, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(2),
    ]);

    if (forecastResult.error) throw new Error(forecastResult.error.message);

    const forecast = forecastResult.data;
    const forecastRowsResult = forecast
      ? await supabase
          .from("forecast_version_rows")
          .select("*")
          .eq("company_id", company.id)
          .eq("forecast_version_id", forecast.id)
          .order("month", { ascending: true })
      : { data: [], error: null };
    const forecastAssumptionsResult = forecast
      ? await supabase
          .from("forecast_driver_assumptions")
          .select("driver_type, assumption_name, assumption_value, assumption_unit, notes")
          .eq("company_id", company.id)
          .eq("forecast_version_id", forecast.id)
      : { data: [], error: null };

    if (forecastRowsResult.error) throw new Error(forecastRowsResult.error.message);
    if (forecastAssumptionsResult.error) throw new Error(forecastAssumptionsResult.error.message);

    const closeItems = closeResult.data ?? [];
    const forecastRows = forecastRowsResult.data ?? [];
    const hasUnapprovedData = closeItems.some(
      (item) =>
        item.status &&
        item.status !== "Approved" &&
        item.status !== "Not uploaded",
    );
    const hasPreliminaryForecast = forecastRows.some(
      (row) => row.row_type === "Preliminary",
    );
    const cashRows = cashResult.data ?? [];
    const latestCash = cashRows.at(-1) ?? null;
    const aiInput = {
      company: {
        name: company.name,
        industry: company.industry,
        stage: company.stage,
        employees: company.employees,
        current_cash_balance: company.current_cash_balance,
        monthly_burn: company.monthly_burn,
      },
      decision: {
        prompt: decisionPrompt,
        type: body.decision_type ?? "Other",
        questions: body.questions ?? [],
        answers: body.answers ?? {},
      },
      financialContext: {
        latestCash,
        cashRows,
        actualsRows: actualsResult.data ?? [],
        budgetRows: budgetResult.data ?? [],
        monthlyCloseStatus: closeItems,
        accountMappings: mappingsResult.data ?? [],
        recentCfoBriefs: briefResult.data ?? [],
        recentReports: reportResult.data ?? [],
      },
      forecastContext: {
        selectedForecastVersion: forecast,
        forecastRows,
        forecastAssumptions: forecastAssumptionsResult.data ?? [],
      },
      dataQuality: {
        hasUnapprovedData,
        hasPreliminaryForecast,
        note:
          "If data is missing, unapproved, sample-like, or preliminary, qualify the recommendation and state what should be confirmed.",
      },
    };

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      input: [
        {
          role: "system",
          content: [
            "You are a CFO-style business decision advisor for a founder-led company.",
            "Use only the provided app data and user-provided assumptions.",
            "Do not hallucinate financial data. Distinguish known company numbers from assumptions.",
            "Analyze affordability, runway, cash impact, EBITDA/OpEx impact, forecast impact, risk, and execution conditions.",
            "For loans/debt/financing, estimate monthly payment only when amount, term, and rate are provided; otherwise list it as unresolved.",
            "Give a conditional recommendation from the allowed enum. Avoid vague strategy fluff.",
            "Return strict JSON matching the schema.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Analyze this decision context:\n${JSON.stringify(aiInput)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "decision_analysis",
          strict: true,
          schema: decisionAnalysisSchema,
        },
      },
    });

    if (!response.output_text) {
      return routeClient.applyCookies(
        NextResponse.json({ error: "OpenAI returned an empty response." }, { status: 502 }),
      );
    }

    try {
      return routeClient.applyCookies(
        NextResponse.json({
          analysis: JSON.parse(response.output_text),
          context: {
            forecastVersion: forecast
              ? {
                  id: forecast.id,
                  name: forecast.name,
                  status: forecast.status,
                }
              : null,
            hasUnapprovedData,
            hasPreliminaryForecast,
            latestCash,
          },
        }),
      );
    } catch (error) {
      console.error("Invalid decision analysis JSON", error);
      return routeClient.applyCookies(
        NextResponse.json(
          { error: "OpenAI response was not valid decision analysis JSON." },
          { status: 502 },
        ),
      );
    }
  } catch (error) {
    console.error("Decision analysis route failed", error);
    const message = error instanceof Error ? error.message : "Unknown decision analysis error.";

    return routeClient.applyCookies(
      NextResponse.json(
        {
          error: message.includes("OPENAI_API_KEY")
            ? "OpenAI API key is not configured on the server."
            : "Decision analysis failed. Please review the decision inputs and try again.",
        },
        { status: message.includes("OPENAI_API_KEY") ? 500 : 502 },
      ),
    );
  }
}
