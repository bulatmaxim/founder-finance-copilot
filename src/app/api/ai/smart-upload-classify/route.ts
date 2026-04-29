import { NextResponse } from "next/server";
import { getOpenAIClient, getOpenAIModel } from "@/lib/aiClient";

export const runtime = "nodejs";

const smartUploadSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "detected_category",
    "confidence",
    "detected_period_start",
    "detected_period_end",
    "suggested_column_mapping",
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
    detected_period_start: { type: ["string", "null"] },
    detected_period_end: { type: ["string", "null"] },
    suggested_column_mapping: {
      type: "object",
      additionalProperties: false,
      required: ["period", "account", "amount", "department", "category", "notes"],
      properties: {
        period: { type: ["string", "null"] },
        account: { type: ["string", "null"] },
        amount: { type: ["string", "null"] },
        department: { type: ["string", "null"] },
        category: { type: ["string", "null"] },
        notes: { type: ["string", "null"] },
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
            "Classify uploaded finance CSV files for an FP&A app.",
            "Use only file name, headers, rule result, and a small sample of rows.",
            "Do not infer private facts beyond the provided rows.",
            "Return strict JSON. Use ISO month dates like 2026-04-01 when periods are clear.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            fileName: body.file_name,
            headers: body.headers,
            sampleRows: body.sample_rows?.slice(0, 8) ?? [],
            ruleBasedResult: body.rule_based_result,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "smart_upload_classification",
          strict: true,
          schema: smartUploadSchema,
        },
      },
    });

    if (!response.output_text) {
      return NextResponse.json(
        { error: "OpenAI returned an empty classification." },
        { status: 502 },
      );
    }

    return NextResponse.json({ classification: JSON.parse(response.output_text) });
  } catch (error) {
    console.error("Smart Upload AI classification failed", error);

    const message = error instanceof Error ? error.message : "Unknown AI error.";

    return NextResponse.json(
      {
        error: message.includes("OPENAI_API_KEY")
          ? "OpenAI API key is not configured."
          : "AI classification failed. Rule-based detection is still available.",
      },
      { status: message.includes("OPENAI_API_KEY") ? 500 : 502 },
    );
  }
}
