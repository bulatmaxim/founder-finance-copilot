import { NextResponse, type NextRequest } from "next/server";
import { getOpenAIClient, getOpenAIModel } from "@/lib/aiClient";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisionQuestionsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decisionType", "confidence", "summary", "questions"],
  properties: {
    decisionType: {
      type: "string",
      enum: [
        "Hiring",
        "Capital purchase",
        "Loan / financing",
        "Acquisition",
        "Marketing spend",
        "Office / lease",
        "Pricing change",
        "Cost reduction",
        "Product launch",
        "Market expansion",
        "Other",
      ],
    },
    confidence: { type: "string", enum: ["High", "Medium", "Low"] },
    summary: { type: "string" },
    questions: {
      type: "array",
      minItems: 4,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "question", "fieldType", "required", "placeholder", "whyItMatters"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          question: { type: "string" },
          fieldType: { type: "string", enum: ["text", "currency", "percent", "number", "date"] },
          required: { type: "boolean" },
          placeholder: { type: "string" },
          whyItMatters: { type: "string" },
        },
      },
    },
  },
} as const;

type RequestBody = {
  decision_prompt?: string;
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

    const { data: company } = await supabase
      .from("companies")
      .select("name, industry, stage, employees")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      input: [
        {
          role: "system",
          content: [
            "You are an FP&A decision intake assistant.",
            "Classify the business decision and ask only the missing follow-up questions needed for a CFO-style affordability, risk, and impact analysis.",
            "Do not ask generic dashboard questions. Make every question directly relevant to the decision.",
            "If the decision includes debt, financing, loan, lease, or vendor financing, ask about amount, term, interest rate, monthly payment, repayment start, covenants/collateral, and use of proceeds.",
            "Return strict JSON matching the schema.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Company context: ${JSON.stringify(company ?? {})}\nDecision: ${decisionPrompt}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "decision_questions",
          strict: true,
          schema: decisionQuestionsSchema,
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
        NextResponse.json({ questions: JSON.parse(response.output_text) }),
      );
    } catch (error) {
      console.error("Invalid decision questions JSON", error);
      return routeClient.applyCookies(
        NextResponse.json(
          { error: "OpenAI response was not valid decision question JSON." },
          { status: 502 },
        ),
      );
    }
  } catch (error) {
    console.error("Decision questions route failed", error);
    const message = error instanceof Error ? error.message : "Unknown decision questions error.";

    return routeClient.applyCookies(
      NextResponse.json(
        {
          error: message.includes("OPENAI_API_KEY")
            ? "OpenAI API key is not configured on the server."
            : "Decision questions could not be generated. Please try again.",
        },
        { status: message.includes("OPENAI_API_KEY") ? 500 : 502 },
      ),
    );
  }
}
