import { NextResponse, type NextRequest } from "next/server";
import { getOpenAIClient, getOpenAIModel } from "@/lib/aiClient";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forecastRecommendationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "executiveSummary",
    "forecastImpact",
    "cashRunwayImpact",
    "confidenceLevel",
    "reasoning",
    "risks",
    "driverChanges",
    "recommendations",
  ],
  properties: {
    executiveSummary: { type: "string" },
    forecastImpact: { type: "string" },
    cashRunwayImpact: { type: "string" },
    confidenceLevel: { type: "string", enum: ["High", "Medium", "Low"] },
    reasoning: { type: "string" },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "detail"],
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["High", "Medium", "Low"] },
          detail: { type: "string" },
        },
      },
    },
    driverChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "driverType",
          "assumptionName",
          "currentValue",
          "suggestedValue",
          "assumptionUnit",
          "reason",
          "confidence",
        ],
        properties: {
          driverType: { type: "string" },
          assumptionName: { type: "string" },
          currentValue: { type: ["number", "null"] },
          suggestedValue: { type: ["number", "null"] },
          assumptionUnit: { type: ["string", "null"] },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["High", "Medium", "Low"] },
        },
      },
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "section",
          "lineItem",
          "month",
          "currentAmount",
          "suggestedAmount",
          "reason",
          "confidence",
        ],
        properties: {
          section: { type: "string" },
          lineItem: { type: "string" },
          month: { type: "string" },
          currentAmount: { type: "number" },
          suggestedAmount: { type: "number" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["High", "Medium", "Low"] },
        },
      },
    },
  },
} as const;

type RequestBody = {
  forecast_version_id?: string;
  include_next_year?: boolean;
  forecast_detail_level?: "Detailed" | "Category";
  allow_unapproved_data?: boolean;
};

type AiRecommendation = {
  executiveSummary: string;
  forecastImpact: string;
  cashRunwayImpact: string;
  confidenceLevel: "High" | "Medium" | "Low";
  reasoning: string;
  risks: { title: string; severity: "High" | "Medium" | "Low"; detail: string }[];
  driverChanges: {
    driverType: string;
    assumptionName: string;
    currentValue: number | null;
    suggestedValue: number | null;
    assumptionUnit: string | null;
    reason: string;
    confidence: "High" | "Medium" | "Low";
  }[];
  recommendations: {
    section: string;
    lineItem: string;
    month: string;
    currentAmount: number;
    suggestedAmount: number;
    reason: string;
    confidence: "High" | "Medium" | "Low";
  }[];
};

export async function POST(request: NextRequest) {
  const routeClient = createRouteClient(request);
  const { supabase } = routeClient;

  try {
    const body = (await request.json()) as RequestBody;
    const forecastVersionId = body.forecast_version_id;
    const includeNextYear = Boolean(body.include_next_year);
    const forecastDetailLevel = body.forecast_detail_level ?? "Detailed";
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
          { error: "Complete a company profile before generating forecast recommendations." },
          { status: 400 },
        ),
      );
    }

    const [
      versionResult,
      rowsResult,
      versionsResult,
      actualsResult,
      budgetResult,
      cashResult,
      closeResult,
      mappingsResult,
      driversResult,
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
        .order("month", { ascending: true }),
      supabase
        .from("forecast_versions")
        .select("id, name, fiscal_year, version_type, status, actuals_through_month, updated_at")
        .eq("company_id", company.id)
        .order("updated_at", { ascending: false })
        .limit(5),
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
        .select("month, cash_balance")
        .eq("company_id", company.id)
        .order("month", { ascending: true }),
      supabase
        .from("monthly_close_items")
        .select("reporting_month, file_category, status, validation_summary")
        .eq("company_id", company.id)
        .order("reporting_month", { ascending: true }),
      supabase
        .from("account_mappings")
        .select("raw_account_name, normalized_category, department, status")
        .eq("company_id", company.id),
      supabase
        .from("forecast_driver_assumptions")
        .select("driver_type, assumption_name, assumption_value, assumption_unit, notes")
        .eq("company_id", company.id)
        .eq("forecast_version_id", forecastVersionId),
    ]);

    if (versionResult.error || !versionResult.data) {
      return routeClient.applyCookies(
        NextResponse.json({ error: "Forecast version could not be loaded." }, { status: 404 }),
      );
    }

    if (rowsResult.error) {
      throw new Error(rowsResult.error.message);
    }

    const closeItems = closeResult.data ?? [];
    const includesUnapprovedData = closeItems.some(
      (item) =>
        item.status &&
        item.status !== "Approved" &&
        item.status !== "Not uploaded",
    );

    if (includesUnapprovedData && !allowUnapprovedData) {
      return routeClient.applyCookies(
        NextResponse.json(
          {
            error:
              "Some monthly close data is not approved. Forecast recommendations may be incomplete or unreliable.",
            requires_confirmation: true,
          },
          { status: 409 },
        ),
      );
    }

    const sourceDataStatus = includesUnapprovedData
      ? "Includes unapproved monthly close data"
      : closeItems.some((item) => item.status === "Approved")
        ? "Approved monthly close data available"
        : "Saved/sample forecast data only";

    const aiInput = {
      company: {
        name: company.name,
        industry: company.industry,
        stage: company.stage,
        employees: company.employees,
      },
      forecastVersion: versionResult.data,
      forecastRows: rowsResult.data ?? [],
      recentForecastVersions: versionsResult.data ?? [],
      approvedActualsAndSavedRows: actualsResult.data ?? [],
      budgetRows: budgetResult.data ?? [],
      cashRows: cashResult.data ?? [],
      monthlyCloseStatus: closeItems,
      accountMappings: mappingsResult.data ?? [],
      forecastDriverAssumptions: driversResult.data ?? [],
      recommendationOptions: {
        includeNextYear,
        forecastDetailLevel,
        noExternalResearch: true,
      },
    };

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      input: [
        {
          role: "system",
          content: [
            "You are a CFO-quality FP&A forecast reviewer for a founder-led company.",
            "Use only the JSON data provided by the app. Do not use external research.",
            "Create draft forecast recommendations only; never describe them as already applied.",
            "Prefer future unlocked forecast months. Do not recommend changing actualized months unless the reason is a clear forecast-version override.",
            "Use raw line items when data supports it; otherwise use category-level rows.",
            "Keep recommendations practical, concise, and board-ready.",
            "Return strict JSON matching the schema.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Analyze this forecast context and return draft recommendations:\n${JSON.stringify(aiInput)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "forecast_recommendation",
          strict: true,
          schema: forecastRecommendationSchema,
        },
      },
    });

    if (!response.output_text) {
      return routeClient.applyCookies(
        NextResponse.json({ error: "OpenAI returned an empty response." }, { status: 502 }),
      );
    }

    let recommendationOutput: AiRecommendation;

    try {
      recommendationOutput = JSON.parse(response.output_text) as AiRecommendation;
    } catch (error) {
      console.error("Invalid AI forecast recommendation JSON", error);
      return routeClient.applyCookies(
        NextResponse.json(
          { error: "OpenAI response was not valid forecast recommendation JSON." },
          { status: 502 },
        ),
      );
    }

    const { data: recommendation, error: recommendationError } = await supabase
      .from("forecast_recommendations")
      .insert({
        user_id: user.id,
        company_id: company.id,
        forecast_version_id: forecastVersionId,
        recommendation_type: "AI Forecast Recommendation",
        status: "Draft",
        source_data_status: sourceDataStatus,
        includes_unapproved_data: includesUnapprovedData,
        include_next_year: includeNextYear,
        forecast_detail_level: forecastDetailLevel,
        summary: {
          executive_summary: recommendationOutput.executiveSummary,
          forecast_impact: recommendationOutput.forecastImpact,
          cash_runway_impact: recommendationOutput.cashRunwayImpact,
          confidence_level: recommendationOutput.confidenceLevel,
          reasoning: recommendationOutput.reasoning,
        },
        risks: recommendationOutput.risks,
        assumptions: {
          driver_changes: recommendationOutput.driverChanges.map((change) => ({
            driver_type: change.driverType,
            assumption_name: change.assumptionName,
            current_value: change.currentValue,
            suggested_value: change.suggestedValue,
            assumption_unit: change.assumptionUnit,
            reason: change.reason,
            confidence: change.confidence,
            status: "Pending",
          })),
        },
        external_benchmark_context: null,
      })
      .select("*")
      .single();

    if (recommendationError || !recommendation) {
      throw new Error(
        `Forecast recommendation save failed: ${
          recommendationError?.message ?? "No recommendation row returned."
        }`,
      );
    }

    const recommendationRows = recommendationOutput.recommendations.map((row) => {
      const currentAmount = Number(row.currentAmount ?? 0);
      const suggestedAmount = Number(row.suggestedAmount ?? currentAmount);
      const changeAmount = suggestedAmount - currentAmount;

      return {
        user_id: user.id,
        company_id: company.id,
        forecast_recommendation_id: recommendation.id,
        forecast_version_id: forecastVersionId,
        section: row.section,
        line_item: row.lineItem,
        month: normalizeMonth(row.month),
        current_amount: currentAmount,
        suggested_amount: suggestedAmount,
        change_amount: changeAmount,
        change_percent:
          currentAmount === 0 ? null : changeAmount / Math.abs(currentAmount),
        reason: row.reason,
        confidence: row.confidence,
        status: "Pending",
      };
    });

    if (recommendationRows.length > 0) {
      const { error: rowsError } = await supabase
        .from("forecast_recommendation_rows")
        .insert(recommendationRows);

      if (rowsError) {
        throw new Error(`Forecast recommendation rows save failed: ${rowsError.message}`);
      }
    }

    const { data: savedRows, error: savedRowsError } = await supabase
      .from("forecast_recommendation_rows")
      .select("*")
      .eq("forecast_recommendation_id", recommendation.id)
      .order("month", { ascending: true })
      .order("line_item", { ascending: true });

    if (savedRowsError) {
      throw new Error(`Forecast recommendation rows reload failed: ${savedRowsError.message}`);
    }

    const json = NextResponse.json({
      recommendation: {
        ...recommendation,
        rows: savedRows ?? [],
      },
    });

    return routeClient.applyCookies(json);
  } catch (error) {
    console.error("AI forecast recommendation route failed", error);

    const message = error instanceof Error ? error.message : "Unknown forecast AI error.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;

    return routeClient.applyCookies(
      NextResponse.json(
        {
          error: message.includes("OPENAI_API_KEY")
            ? "OpenAI API key is not configured on the server."
            : "AI forecast recommendation failed. Please review the forecast inputs and try again.",
        },
        { status },
      ),
    );
  }
}

function normalizeMonth(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  const parsed = new Date(`${trimmed} 1`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-01`;
}
