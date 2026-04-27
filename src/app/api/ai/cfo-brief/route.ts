import { NextResponse } from "next/server";
import { getOpenAIClient, getOpenAIModel } from "@/lib/aiClient";

const cfoBriefSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "executiveSummary",
    "priorityInsights",
    "runwayWarning",
    "forecastRecommendation",
    "managementQuestions",
    "recommendedActions",
    "investorUpdateBullets",
    "boardSlideSummary",
    "dataQualityNotes",
  ],
  properties: {
    executiveSummary: { type: "string" },
    priorityInsights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "severity",
          "category",
          "summary",
          "whyItMatters",
          "recommendedAction",
          "sourceMetrics",
        ],
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["Low", "Medium", "High"] },
          category: {
            type: "string",
            enum: [
              "Revenue",
              "Expenses",
              "Cash",
              "Runway",
              "Forecast",
              "Payroll",
              "Pipeline",
              "Investor Update",
              "Data Quality",
            ],
          },
          summary: { type: "string" },
          whyItMatters: { type: "string" },
          recommendedAction: { type: "string" },
          sourceMetrics: { type: "array", items: { type: "string" } },
        },
      },
    },
    runwayWarning: { type: "string" },
    forecastRecommendation: { type: "string" },
    managementQuestions: { type: "array", items: { type: "string" } },
    recommendedActions: { type: "array", items: { type: "string" } },
    investorUpdateBullets: { type: "array", items: { type: "string" } },
    boardSlideSummary: { type: "string" },
    dataQualityNotes: { type: "array", items: { type: "string" } },
  },
} as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { financeSummary?: unknown };

    if (!body.financeSummary || typeof body.financeSummary !== "object") {
      return NextResponse.json(
        { error: "Missing finance summary JSON body." },
        { status: 400 },
      );
    }

    const summary = body.financeSummary as {
      company?: { name?: string };
      period?: string;
      metrics?: unknown;
    };

    if (!summary.company?.name || !summary.period || !summary.metrics) {
      return NextResponse.json(
        {
          error:
            "Finance summary must include company.name, period, and metrics.",
        },
        { status: 400 },
      );
    }

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      input: [
        {
          role: "system",
          content: [
            "You are acting as a CFO-style finance analyst for a founder-led B2B SaaS company.",
            "Use only the numbers provided in the finance summary.",
            "Do not invent figures. Do not recalculate metrics from raw rows.",
            "The application has already calculated the financial metrics.",
            "If data is missing, say what is missing.",
            "Do not give tax, legal, accounting, investment, or fundraising advice as certainty.",
            "Keep the tone professional, direct, concise, and founder-ready.",
            "Focus on what changed, why it matters, and what management should do next.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Return strict JSON CFO commentary for this finance summary:\n${JSON.stringify(summary)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "cfo_brief",
          strict: true,
          schema: cfoBriefSchema,
        },
      },
    });

    const outputText = response.output_text;

    if (!outputText) {
      return NextResponse.json(
        { error: "OpenAI returned an empty response." },
        { status: 502 },
      );
    }

    try {
      return NextResponse.json({ brief: JSON.parse(outputText) });
    } catch (error) {
      console.error("Invalid AI CFO Brief JSON", error, outputText);

      return NextResponse.json(
        { error: "OpenAI response was not valid JSON." },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("AI CFO Brief route failed", error);

    const message = error instanceof Error ? error.message : "Unknown AI error.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;

    return NextResponse.json(
      {
        error: message.includes("OPENAI_API_KEY")
          ? "OpenAI API key is not configured on the server."
          : `AI CFO Brief failed: ${message}`,
      },
      { status },
    );
  }
}
