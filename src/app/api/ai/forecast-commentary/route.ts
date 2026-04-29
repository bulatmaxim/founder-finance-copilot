import { NextResponse, type NextRequest } from "next/server";
import { getOpenAIClient, getOpenAIModel } from "@/lib/aiClient";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forecastCommentarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "executiveSummary",
    "revenueCommentary",
    "grossMarginCommentary",
    "payrollCommentary",
    "operatingExpenseCommentary",
    "cashRunwayCommentary",
    "forecastRisks",
    "managementNotes",
  ],
  properties: {
    executiveSummary: { type: "string" },
    revenueCommentary: { type: "string" },
    grossMarginCommentary: { type: "string" },
    payrollCommentary: { type: "string" },
    operatingExpenseCommentary: { type: "string" },
    cashRunwayCommentary: { type: "string" },
    forecastRisks: { type: "string" },
    managementNotes: { type: "string" },
  },
} as const;

type RequestBody = {
  forecast_version_id?: string;
  allow_unapproved_data?: boolean;
};

export async function POST(request: NextRequest) {
  const routeClient = createRouteClient(request);
  const { supabase } = routeClient;

  try {
    const body = (await request.json()) as RequestBody;
    const forecastVersionId = body.forecast_version_id;
    const allowUnapprovedData = Boolean(body.allow_unapproved_data);

    if (!forecastVersionId) {
      return routeClient.applyCookies(
        NextResponse.json({ error: "Missing forecast_version_id." }, { status: 400 }),
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
          { error: "Complete a company profile before generating forecast commentary." },
          { status: 400 },
        ),
      );
    }

    const [
      versionResult,
      rowsResult,
      assumptionsResult,
      actualsResult,
      budgetResult,
      cashResult,
      closeResult,
    ] = await Promise.all([
      supabase
        .from("forecast_versions")
        .select("*")
        .eq("company_id", company.id)
        .eq("id", forecastVersionId)
        .maybeSingle(),
      supabase
        .from("forecast_version_rows")
        .select("*")
        .eq("company_id", company.id)
        .eq("forecast_version_id", forecastVersionId)
        .order("month", { ascending: true })
        .order("category", { ascending: true }),
      supabase
        .from("forecast_driver_assumptions")
        .select("driver_type, assumption_name, assumption_value, assumption_unit, notes")
        .eq("company_id", company.id)
        .eq("forecast_version_id", forecastVersionId),
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
        .order("reporting_month", { ascending: true }),
    ]);

    if (versionResult.error || !versionResult.data) {
      return routeClient.applyCookies(
        NextResponse.json({ error: "Forecast version could not be loaded." }, { status: 404 }),
      );
    }

    if (rowsResult.error) throw new Error(rowsResult.error.message);
    if (assumptionsResult.error) throw new Error(assumptionsResult.error.message);

    const forecastRows = rowsResult.data ?? [];
    const closeItems = closeResult.data ?? [];
    const includesPreliminaryRows = forecastRows.some(
      (row) => row.row_type === "Preliminary",
    );
    const includesUnapprovedClose = closeItems.some(
      (item) =>
        item.status &&
        item.status !== "Approved" &&
        item.status !== "Not uploaded",
    );

    if ((includesPreliminaryRows || includesUnapprovedClose) && !allowUnapprovedData) {
      return routeClient.applyCookies(
        NextResponse.json(
          {
            error:
              "Some data used for this commentary is not approved. Commentary may be incomplete.",
            requires_confirmation: true,
          },
          { status: 409 },
        ),
      );
    }

    const aiInput = {
      company: {
        name: company.name,
        industry: company.industry,
        stage: company.stage,
        employees: company.employees,
      },
      forecastVersion: versionResult.data,
      forecastRows,
      driverAssumptions: assumptionsResult.data ?? [],
      actualsRows: actualsResult.data ?? [],
      budgetRows: budgetResult.data ?? [],
      cashRows: cashResult.data ?? [],
      monthlyCloseStatus: closeItems,
      sourceContext: {
        includesPreliminaryRows,
        includesUnapprovedClose,
        note:
          "Preliminary forecast rows are placeholders and should be described as such, not as approved actuals.",
      },
    };

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      input: [
        {
          role: "system",
          content: [
            "You are a CFO-quality FP&A narrative writer for a founder-led company.",
            "Use only the JSON data provided by the app. Do not use external research.",
            "Return editable draft commentary, not final approved board language.",
            "If data is preliminary or unapproved, clearly qualify the commentary.",
            "Do not invent metrics. If context is missing, say what needs confirmation.",
            "Keep the tone concise, professional, and report-ready.",
            "Return strict JSON matching the schema.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Draft editable forecast commentary for this context:\n${JSON.stringify(aiInput)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "forecast_commentary",
          strict: true,
          schema: forecastCommentarySchema,
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
        NextResponse.json({ commentary: JSON.parse(response.output_text) }),
      );
    } catch (error) {
      console.error("Invalid AI forecast commentary JSON", error);
      return routeClient.applyCookies(
        NextResponse.json(
          { error: "OpenAI response was not valid forecast commentary JSON." },
          { status: 502 },
        ),
      );
    }
  } catch (error) {
    console.error("AI forecast commentary route failed", error);
    const message = error instanceof Error ? error.message : "Unknown forecast commentary error.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;

    return routeClient.applyCookies(
      NextResponse.json(
        {
          error: message.includes("OPENAI_API_KEY")
            ? "OpenAI API key is not configured on the server."
            : "AI forecast commentary failed. Please review the forecast inputs and try again.",
        },
        { status },
      ),
    );
  }
}
