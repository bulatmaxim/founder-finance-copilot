"use client";

import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";

export type DecisionMemoStatus = "Draft" | "Reviewed" | "Approved" | "Archived";

export type DecisionMemoRisk = {
  category: string;
  severity: "Low" | "Medium" | "High";
  description: string;
  mitigation: string;
};

export type DecisionMemoScenario = {
  name: "Base case" | "Conservative case" | "Aggressive case" | string;
  summary: string;
  cashImpact: string;
  runwayImpact: string;
  conditions: string;
};

export type DecisionMemoAnalysis = {
  recommendation: string;
  cfoSummary: string;
  financialImpact: {
    upfrontCost: string;
    monthlyRecurringImpact: string;
    runwayImpact: string;
    cashBalanceImpact: string;
    ebitdaOperatingExpenseImpact: string;
    forecastImpact: string;
    paybackRoi: string;
  };
  keyAssumptions: string[];
  risks: DecisionMemoRisk[];
  unresolvedQuestions: string[];
  recommendedNextSteps: string[];
  scenarios: DecisionMemoScenario[];
  dataWarnings: string[];
};

export type DecisionMemoRecord = {
  id: string;
  user_id: string | null;
  company_id: string;
  title: string | null;
  decision_type: string | null;
  decision_prompt: string | null;
  questions: unknown;
  answers: Record<string, string> | null;
  analysis: DecisionMemoAnalysis | null;
  recommendation: string | null;
  status: DecisionMemoStatus;
  created_at: string | null;
  updated_at: string | null;
};

export async function loadDecisionMemos() {
  if (!hasSupabaseBrowserEnv()) {
    return [];
  }

  const { company } = await getCurrentCompany();

  if (!company) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("decision_memos")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Decision memos could not be loaded: ${error.message}`);
  }

  return (data ?? []) as DecisionMemoRecord[];
}

export async function saveDecisionMemo({
  title,
  decisionType,
  decisionPrompt,
  questions,
  answers,
  analysis,
  recommendation,
}: {
  title: string;
  decisionType: string;
  decisionPrompt: string;
  questions: unknown;
  answers: Record<string, string>;
  analysis: DecisionMemoAnalysis;
  recommendation: string;
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete a company profile before saving a memo.");
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("decision_memos")
    .insert({
      user_id: user.id,
      company_id: company.id,
      title,
      decision_type: decisionType,
      decision_prompt: decisionPrompt,
      questions,
      answers,
      analysis,
      recommendation,
      status: "Draft",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Decision memo could not be saved: ${error.message}`);
  }

  return data as DecisionMemoRecord;
}
