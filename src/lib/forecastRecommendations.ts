"use client";

import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";
import type { ForecastRowType } from "@/lib/forecastVersions";

export type ForecastDetailLevel = "Detailed" | "Category";
export type ForecastRecommendationStatus =
  | "Draft"
  | "Partially Accepted"
  | "Applied"
  | "Rejected"
  | "Archived";
export type ForecastRecommendationRowStatus =
  | "Pending"
  | "Accepted"
  | "Rejected"
  | "Edited"
  | "Applied";
export type ForecastRecommendationConfidence = "High" | "Medium" | "Low";

export type ForecastDriverRecommendation = {
  driver_type: string;
  assumption_name: string;
  current_value: number | null;
  suggested_value: number | null;
  assumption_unit: string | null;
  reason: string;
  confidence: ForecastRecommendationConfidence;
  status: "Pending" | "Accepted" | "Rejected" | "Edited";
};

export type ForecastRecommendationSummary = {
  executive_summary?: string;
  forecast_impact?: string;
  cash_runway_impact?: string;
  confidence_level?: ForecastRecommendationConfidence;
  reasoning?: string;
};

export type ForecastRecommendationRecord = {
  id: string;
  user_id: string | null;
  company_id: string;
  forecast_version_id: string;
  recommendation_type: string;
  status: ForecastRecommendationStatus;
  source_data_status: string | null;
  includes_unapproved_data: boolean | null;
  include_next_year: boolean | null;
  forecast_detail_level: ForecastDetailLevel | string | null;
  summary: ForecastRecommendationSummary | null;
  risks: unknown;
  assumptions: { driver_changes?: ForecastDriverRecommendation[] } | null;
  external_benchmark_context: unknown;
  created_at: string | null;
  updated_at: string | null;
};

export type ForecastRecommendationRowRecord = {
  id: string;
  user_id: string | null;
  company_id: string;
  forecast_recommendation_id: string;
  forecast_version_id: string;
  section: string | null;
  line_item: string | null;
  month: string | null;
  current_amount: number | null;
  suggested_amount: number | null;
  change_amount: number | null;
  change_percent: number | null;
  reason: string | null;
  confidence: ForecastRecommendationConfidence | null;
  status: ForecastRecommendationRowStatus;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ForecastRecommendationWithRows = ForecastRecommendationRecord & {
  rows: ForecastRecommendationRowRecord[];
};

export type ForecastNotificationRecord = {
  id: string;
  user_id: string | null;
  company_id: string;
  forecast_version_id: string | null;
  notification_type: string | null;
  title: string | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
  dismissed_at: string | null;
};

export async function loadLatestForecastRecommendation(
  forecastVersionId: string,
): Promise<ForecastRecommendationWithRows | null> {
  if (!forecastVersionId || !hasSupabaseBrowserEnv()) {
    return null;
  }

  const supabase = createClient();
  const { company } = await getCurrentCompany();

  if (!company) {
    return null;
  }

  const { data: recommendation, error } = await supabase
    .from("forecast_recommendations")
    .select("*")
    .eq("company_id", company.id)
    .eq("forecast_version_id", forecastVersionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Forecast recommendation load failed: ${error.message}`);
  }

  if (!recommendation) {
    return null;
  }

  const { data: rows, error: rowsError } = await supabase
    .from("forecast_recommendation_rows")
    .select("*")
    .eq("company_id", company.id)
    .eq("forecast_recommendation_id", recommendation.id)
    .order("month", { ascending: true })
    .order("line_item", { ascending: true });

  if (rowsError) {
    throw new Error(`Forecast recommendation rows load failed: ${rowsError.message}`);
  }

  return {
    ...(recommendation as ForecastRecommendationRecord),
    rows: (rows ?? []) as ForecastRecommendationRowRecord[],
  };
}

export async function generateForecastRecommendationDraft({
  forecastVersionId,
  includeNextYear,
  forecastDetailLevel,
  allowUnapprovedData,
}: {
  forecastVersionId: string;
  includeNextYear: boolean;
  forecastDetailLevel: ForecastDetailLevel;
  allowUnapprovedData: boolean;
}) {
  const response = await fetch("/api/ai/forecast-recommendation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      forecast_version_id: forecastVersionId,
      include_next_year: includeNextYear,
      forecast_detail_level: forecastDetailLevel,
      allow_unapproved_data: allowUnapprovedData,
    }),
  });
  const body = (await response.json()) as {
    error?: string;
    recommendation?: ForecastRecommendationWithRows;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "AI forecast recommendation failed.");
  }

  if (!body.recommendation) {
    throw new Error("AI forecast recommendation did not return a draft.");
  }

  return body.recommendation;
}

export async function updateForecastRecommendationRow({
  row,
  status,
  suggestedAmount,
  note,
}: {
  row: ForecastRecommendationRowRecord;
  status?: ForecastRecommendationRowStatus;
  suggestedAmount?: number;
  note?: string;
}) {
  const supabase = createClient();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (status) patch.status = status;
  if (typeof suggestedAmount === "number") {
    patch.suggested_amount = suggestedAmount;
    patch.change_amount = suggestedAmount - Number(row.current_amount ?? 0);
    patch.change_percent =
      Number(row.current_amount ?? 0) === 0
        ? null
        : (suggestedAmount - Number(row.current_amount ?? 0)) /
          Math.abs(Number(row.current_amount ?? 1));
    patch.status = status ?? "Edited";
  }
  if (note !== undefined) patch.note = note || null;

  const { error } = await supabase
    .from("forecast_recommendation_rows")
    .update(patch)
    .eq("id", row.id);

  if (error) {
    throw new Error(`Recommendation row update failed: ${error.message}`);
  }
}

export async function updateForecastVersionCell({
  forecastVersionId,
  month,
  lineItem,
  amount,
  allowActualOverride = false,
}: {
  forecastVersionId: string;
  month: string;
  lineItem: string;
  amount: number;
  allowActualOverride?: boolean;
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete a company profile before updating the forecast.");
  }

  const supabase = createClient();
  const { data: existing, error: existingError } = await supabase
    .from("forecast_version_rows")
    .select("id, row_type, is_locked")
    .eq("company_id", company.id)
    .eq("forecast_version_id", forecastVersionId)
    .eq("month", month)
    .eq("category", lineItem)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Forecast row lookup failed: ${existingError.message}`);
  }

  const isActual = existing?.row_type === "Actual" || existing?.is_locked;

  if (isActual && !allowActualOverride) {
    throw new Error("Actual months require confirmation before editing.");
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("forecast_version_rows")
      .update({
        amount,
        source: isActual ? "Forecast Override to Actual" : "Manual Override",
        is_locked: isActual ? false : existing.is_locked,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Forecast row update failed: ${error.message}`);
    }
  } else {
    const rowType: ForecastRowType = "Forecast";
    const { error } = await supabase.from("forecast_version_rows").insert({
      user_id: user.id,
      company_id: company.id,
      forecast_version_id: forecastVersionId,
      month,
      category: lineItem,
      amount,
      row_type: rowType,
      source: "Manual Override",
      is_locked: false,
    });

    if (error) {
      throw new Error(`Forecast row insert failed: ${error.message}`);
    }
  }

  const { error: versionError } = await supabase
    .from("forecast_versions")
    .update({ updated_at: new Date().toISOString() })
    .eq("company_id", company.id)
    .eq("id", forecastVersionId);

  if (versionError) {
    throw new Error(`Forecast version timestamp update failed: ${versionError.message}`);
  }
}

export async function markForecastRecommendationStatus({
  recommendationId,
  status,
}: {
  recommendationId: string;
  status: ForecastRecommendationStatus;
}) {
  const supabase = createClient();
  const { error } = await supabase
    .from("forecast_recommendations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", recommendationId);

  if (error) {
    throw new Error(`Recommendation status update failed: ${error.message}`);
  }
}

export async function updateForecastRecommendationAssumptions({
  recommendation,
  driverChanges,
}: {
  recommendation: ForecastRecommendationRecord;
  driverChanges: ForecastDriverRecommendation[];
}) {
  const supabase = createClient();
  const { error } = await supabase
    .from("forecast_recommendations")
    .update({
      assumptions: { ...(recommendation.assumptions ?? {}), driver_changes: driverChanges },
      updated_at: new Date().toISOString(),
    })
    .eq("id", recommendation.id);

  if (error) {
    throw new Error(`Driver recommendation update failed: ${error.message}`);
  }
}

export async function bulkUpdateRecommendationRows({
  recommendation,
  status,
  confidence,
}: {
  recommendation: ForecastRecommendationWithRows;
  status: ForecastRecommendationRowStatus;
  confidence?: ForecastRecommendationConfidence;
}) {
  const supabase = createClient();
  let query = supabase
    .from("forecast_recommendation_rows")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("forecast_recommendation_id", recommendation.id);

  if (confidence) {
    query = query.eq("confidence", confidence);
  }

  const { error } = await query;

  if (error) {
    throw new Error(`Bulk recommendation update failed: ${error.message}`);
  }
}

export async function applyAcceptedForecastRecommendations(
  recommendation: ForecastRecommendationWithRows,
) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete a company profile before applying recommendations.");
  }

  const supabase = createClient();
  const acceptedRows = recommendation.rows.filter(
    (row) => row.status === "Accepted" || row.status === "Edited",
  );

  for (const row of acceptedRows) {
    const month = row.month;
    const category = row.line_item || row.section || "Forecast";
    const amount = Number(row.suggested_amount ?? row.current_amount ?? 0);

    if (!month) {
      continue;
    }

    const { data: existing, error: existingError } = await supabase
      .from("forecast_version_rows")
      .select("id, row_type, is_locked")
      .eq("company_id", company.id)
      .eq("forecast_version_id", recommendation.forecast_version_id)
      .eq("month", month)
      .eq("category", category)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Forecast row lookup failed: ${existingError.message}`);
    }

    if (existing?.row_type === "Actual" && existing.is_locked) {
      continue;
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("forecast_version_rows")
        .update({
          amount,
          source: "AI Forecast Recommendation",
          row_type: existing.row_type === "Actual" ? "Actual" : "Forecast",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        throw new Error(`Forecast row update failed: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from("forecast_version_rows").insert({
        user_id: user.id,
        company_id: company.id,
        forecast_version_id: recommendation.forecast_version_id,
        month,
        category,
        amount,
        row_type: "Forecast",
        source: "AI Forecast Recommendation",
        is_locked: false,
      });

      if (error) {
        throw new Error(`Forecast row insert failed: ${error.message}`);
      }
    }
  }

  const acceptedDriverChanges =
    recommendation.assumptions?.driver_changes?.filter(
      (change) => change.status === "Accepted" || change.status === "Edited",
    ) ?? [];

  if (acceptedDriverChanges.length > 0) {
    const rows = acceptedDriverChanges.map((change) => ({
      user_id: user.id,
      company_id: company.id,
      forecast_version_id: recommendation.forecast_version_id,
      driver_type: change.driver_type,
      assumption_name: change.assumption_name,
      assumption_value: change.suggested_value,
      assumption_unit: change.assumption_unit,
      notes: `AI recommendation applied: ${change.reason}`,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("forecast_driver_assumptions")
      .upsert(rows, {
        onConflict: "company_id,forecast_version_id,driver_type,assumption_name",
      });

    if (error) {
      throw new Error(`Driver assumption update failed: ${error.message}`);
    }
  }

  const { error: rowStatusError } = await supabase
    .from("forecast_recommendation_rows")
    .update({ status: "Applied", updated_at: new Date().toISOString() })
    .eq("forecast_recommendation_id", recommendation.id)
    .in("status", ["Accepted", "Edited"]);

  if (rowStatusError) {
    throw new Error(`Recommendation row status update failed: ${rowStatusError.message}`);
  }

  const { error: recommendationError } = await supabase
    .from("forecast_recommendations")
    .update({ status: "Applied", updated_at: new Date().toISOString() })
    .eq("id", recommendation.id);

  if (recommendationError) {
    throw new Error(`Recommendation status update failed: ${recommendationError.message}`);
  }

  const { error: versionError } = await supabase
    .from("forecast_versions")
    .update({ updated_at: new Date().toISOString() })
    .eq("company_id", company.id)
    .eq("id", recommendation.forecast_version_id);

  if (versionError) {
    throw new Error(`Forecast version timestamp update failed: ${versionError.message}`);
  }

  await supabase.from("forecast_notifications").insert({
    user_id: user.id,
    company_id: company.id,
    forecast_version_id: recommendation.forecast_version_id,
    notification_type: "recommendation_applied",
    title: "AI forecast recommendations applied",
    message: `${acceptedRows.length} recommendation${acceptedRows.length === 1 ? "" : "s"} were applied to the forecast version.`,
    status: "Open",
  });
}

export async function loadForecastNotifications(forecastVersionId?: string) {
  const { company } = await getCurrentCompany();

  if (!company || !hasSupabaseBrowserEnv()) {
    return [];
  }

  const supabase = createClient();
  let query = supabase
    .from("forecast_notifications")
    .select("*")
    .eq("company_id", company.id)
    .eq("status", "Open")
    .order("created_at", { ascending: false })
    .limit(6);

  if (forecastVersionId) {
    query = query.or(`forecast_version_id.eq.${forecastVersionId},forecast_version_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Forecast notifications load failed", error);
    return [];
  }

  return (data ?? []) as ForecastNotificationRecord[];
}

export async function dismissForecastNotification(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("forecast_notifications")
    .update({
      status: "Dismissed",
      dismissed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Forecast notification dismiss failed: ${error.message}`);
  }
}
