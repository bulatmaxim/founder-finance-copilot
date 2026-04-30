import { NextResponse } from "next/server";
import { getOpenAIClient, getOpenAIModel } from "@/lib/aiClient";

export const runtime = "nodejs";

const smartUploadMappingSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "detected_category",
    "confidence",
    "period_range",
    "column_mapping",
    "suggested_accounts",
    "warnings",
    "reasoning",
  ],
  properties: {
    detected_category: {
      type: "string",
      enum: [
        "P&L / Actuals",
        "Budget",
        "Cash Report",
        "Revenue Data",
        "Headcount / Payroll",
        "KPI Inputs",
        "Notes / Assumptions",
        "Unknown / Needs Review",
      ],
    },
    confidence: { type: "string", enum: ["High", "Medium", "Low"] },
    period_range: {
      type: "object",
      additionalProperties: false,
      required: ["start", "end"],
      properties: {
        start: { type: ["string", "null"] },
        end: { type: ["string", "null"] },
      },
    },
    column_mapping: {
      type: "object",
      additionalProperties: {
        type: "string",
        enum: [
          "Period",
          "Account Code",
          "Account Name",
          "Raw Category",
          "Department Code",
          "Department",
          "Amount",
          "Notes",
          "Customer / Segment",
          "Revenue Type",
          "Revenue Amount",
          "Employee / Role",
          "Salary",
          "KPI Name",
          "KPI Value",
          "Ignore",
        ],
      },
    },
    suggested_accounts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "raw_value",
          "account_code",
          "account_name",
          "department_code",
          "department_name",
          "normalized_category",
          "statement_type",
          "confidence",
          "reason",
        ],
        properties: {
          raw_value: { type: "string" },
          account_code: { type: "string" },
          account_name: { type: "string" },
          department_code: { type: "string" },
          department_name: { type: "string" },
          normalized_category: { type: "string" },
          statement_type: { type: "string" },
          confidence: { type: "string", enum: ["High", "Medium", "Low"] },
          reason: { type: "string" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
  },
} as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      file_name?: string;
      headers?: string[];
      sample_rows?: Record<string, unknown>[];
      existing_company_departments?: unknown[];
      existing_company_accounts?: unknown[];
      mapping_rules?: unknown[];
      rule_based_result?: unknown;
    };

    if (!Array.isArray(body.headers)) {
      return NextResponse.json({ error: "Missing headers." }, { status: 400 });
    }

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      input: [
        {
          role: "system",
          content: [
            "You map uploaded finance CSV files into an FP&A staging model.",
            "Use only file name, headers, sample rows, company mappings, mapping rules, and the rule-based result.",
            "Suggest mappings, but do not treat them as approved. The user must confirm.",
            "Prefer existing company account codes, uploaded aliases, and department codes when they match.",
            "Return strict JSON only. Use ISO month dates like 2026-04-01 for period ranges when clear.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            fileName: body.file_name,
            headers: body.headers,
            sampleRows: body.sample_rows?.slice(0, 10) ?? [],
            existingCompanyDepartments: body.existing_company_departments ?? [],
            existingCompanyAccounts: body.existing_company_accounts ?? [],
            mappingRules: body.mapping_rules ?? [],
            ruleBasedResult: body.rule_based_result,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "smart_upload_mapping_confirmation",
          strict: true,
          schema: smartUploadMappingSchema,
        },
      },
    });

    if (!response.output_text) {
      return NextResponse.json(
        { error: "OpenAI returned an empty mapping response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ mapping: JSON.parse(response.output_text) });
  } catch (error) {
    console.error("Smart Upload AI mapping failed", error);
    const message = error instanceof Error ? error.message : "Unknown AI error.";

    return NextResponse.json(
      {
        error: message.includes("OPENAI_API_KEY")
          ? "OpenAI API key is not configured."
          : "AI mapping failed. Rule-based mapping is still available.",
      },
      { status: message.includes("OPENAI_API_KEY") ? 500 : 502 },
    );
  }
}
