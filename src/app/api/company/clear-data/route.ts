import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmationPhrase = "CLEAR COMPANY DATA";

const companyScopedTables = [
  "decision_memos",
  "forecast_commentary",
  "monthly_reports",
  "generated_reports",
  "reports",
  "ai_briefs",
  "forecast_recommendation_rows",
  "forecast_recommendations",
  "forecast_notifications",
  "forecast_driver_assumptions",
  "forecast_version_rows",
  "forecast_versions",
  "data_entry_adjustments",
  "import_staged_rows",
  "import_batches",
  "monthly_close_activity",
  "monthly_close_items",
  "account_mappings",
  "mapping_rules",
  "company_accounts",
  "company_departments",
  "financial_actuals",
  "budget_rows",
  "cash_rows",
  "payroll_rows",
  "revenue_detail_rows",
  "pipeline_rows",
  "bank_transaction_rows",
  "financial_rows",
  "cash_balances",
  "uploaded_files",
];

type SupabaseError = {
  code?: string;
  message?: string;
};

export async function POST(request: NextRequest) {
  if (!hasSupabaseServerEnv()) {
    return NextResponse.json(
      { error: "Supabase environment variables are not configured." },
      { status: 500 },
    );
  }

  const routeClient = createRouteClient(request);
  const { supabase } = routeClient;

  try {
    const body = (await request.json()) as {
      confirmation?: string;
      resetCompanyProfile?: boolean;
    };

    if (body.confirmation !== confirmationPhrase) {
      return routeClient.applyCookies(
        NextResponse.json(
          { error: "Confirmation phrase does not match." },
          { status: 400 },
        ),
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
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (companyError) {
      throw new Error(`Company lookup failed: ${companyError.message}`);
    }

    if (!company?.id) {
      return routeClient.applyCookies(
        NextResponse.json({
          ok: true,
          deletedTables: [],
          warnings: ["No company workspace was found for this user."],
        }),
      );
    }

    const warnings: string[] = [];
    const storageResult = await clearCompanyStorage({
      supabase,
      userId: user.id,
      companyId: String(company.id),
    });

    warnings.push(...storageResult.warnings);

    const deletedTables: string[] = [];

    for (const table of companyScopedTables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("company_id", company.id);

      if (error) {
        if (isMissingTableError(error)) {
          warnings.push(`${table} does not exist in this environment; skipped.`);
          continue;
        }

        throw new Error(`${table} cleanup failed: ${error.message}`);
      }

      deletedTables.push(table);
    }

    let companyProfileReset = false;

    if (body.resetCompanyProfile) {
      const { error: resetCompanyError } = await supabase
        .from("companies")
        .update({
          name: "New Company",
          industry: null,
          stage: null,
          employees: null,
          currency: "USD",
          fiscal_year_start_month: 1,
          current_cash_balance: null,
          monthly_burn: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", company.id);

      if (resetCompanyError) {
        throw new Error(`Company profile reset failed: ${resetCompanyError.message}`);
      }

      companyProfileReset = true;
    }

    return routeClient.applyCookies(
      NextResponse.json({
        ok: true,
        deletedTables,
        storageDeletedCount: storageResult.deletedCount,
        companyProfileReset,
        warnings,
      }),
    );
  } catch (error) {
    console.error("Company data reset failed", error);
    const message = error instanceof Error ? error.message : "Unknown reset error.";

    return routeClient.applyCookies(
      NextResponse.json({ error: message }, { status: 500 }),
    );
  }
}

export function GET() {
  return NextResponse.json(
    { error: "Clear company data only supports POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

async function clearCompanyStorage({
  supabase,
  userId,
  companyId,
}: {
  supabase: ReturnType<typeof createRouteClient>["supabase"];
  userId: string;
  companyId: string;
}) {
  const bucket = "finance-uploads";
  const prefix = `${userId}/${companyId}`;

  try {
    const paths = await listStoragePaths({ supabase, bucket, prefix });

    if (paths.length === 0) {
      return { deletedCount: 0, warnings: [] as string[] };
    }

    let deletedCount = 0;
    const warnings: string[] = [];

    for (let index = 0; index < paths.length; index += 100) {
      const chunk = paths.slice(index, index + 100);
      const { error } = await supabase.storage.from(bucket).remove(chunk);

      if (error) {
        warnings.push(`Storage cleanup warning: ${error.message}`);
      } else {
        deletedCount += chunk.length;
      }
    }

    return { deletedCount, warnings };
  } catch (error) {
    return {
      deletedCount: 0,
      warnings: [
        error instanceof Error
          ? `Storage cleanup warning: ${error.message}`
          : "Storage cleanup warning: unknown error.",
      ],
    };
  }
}

async function listStoragePaths({
  supabase,
  bucket,
  prefix,
}: {
  supabase: ReturnType<typeof createRouteClient>["supabase"];
  bucket: string;
  prefix: string;
}) {
  const paths: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit, offset });

    if (error) {
      throw new Error(error.message);
    }

    const items = data ?? [];

    for (const item of items) {
      const fullPath = `${prefix}/${item.name}`;
      const maybeFolder = !item.id && !item.metadata;

      if (maybeFolder) {
        paths.push(...(await listStoragePaths({ supabase, bucket, prefix: fullPath })));
      } else {
        paths.push(fullPath);
      }
    }

    if (items.length < limit) {
      break;
    }

    offset += limit;
  }

  return paths;
}

function isMissingTableError(error: SupabaseError) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.toLowerCase().includes("could not find the table")
  );
}
