# Founder Finance Copilot Deployment Checklist

## Vercel Environment Variables

Add these variables in Vercel Project Settings -> Environment Variables for Production, Preview, and Development as needed:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.2
```

Notes:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally public browser variables.
- `OPENAI_API_KEY` must remain server-only. Do not prefix it with `NEXT_PUBLIC_`.
- `OPENAI_MODEL` is server-only and defaults locally to `gpt-5.2` if omitted, but should be set explicitly in production.
- No Supabase service-role key is required for the current MVP.

## Supabase Auth Redirect URLs

In Supabase Dashboard -> Authentication -> URL Configuration, add:

```text
http://localhost:3000/auth/callback
https://your-domain.vercel.app/auth/callback
```

If using a custom production domain, also add:

```text
https://your-custom-domain.com/auth/callback
```

Set the production site URL to your production app URL, for example:

```text
https://your-domain.vercel.app
```

## Supabase SQL Migrations

Run all migration files in order:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_milestone_alignment.sql
supabase/migrations/003_monthly_close_data_room.sql
supabase/migrations/004_monthly_close_hardening.sql
supabase/migrations/005_report_source_metadata.sql
supabase/migrations/006_account_mappings.sql
supabase/migrations/007_forecast_versions.sql
supabase/migrations/008_forecast_driver_assumptions.sql
supabase/migrations/009_monthly_reports.sql
```

## Required Supabase Tables

The deployed database should have RLS enabled and company/user scoped policies for:

```text
profiles
companies
uploaded_files
financial_actuals
budget_rows
cash_rows
payroll_rows
revenue_detail_rows
pipeline_rows
bank_transaction_rows
ai_briefs
generated_reports
monthly_close_items
monthly_close_activity
account_mappings
forecast_versions
forecast_version_rows
forecast_driver_assumptions
monthly_reports
```

RLS audit query:

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'companies',
    'uploaded_files',
    'financial_actuals',
    'budget_rows',
    'cash_rows',
    'payroll_rows',
    'revenue_detail_rows',
    'pipeline_rows',
    'bank_transaction_rows',
    'ai_briefs',
    'generated_reports',
    'monthly_close_items',
    'monthly_close_activity',
    'account_mappings',
    'forecast_versions',
    'forecast_version_rows',
    'forecast_driver_assumptions',
    'monthly_reports'
  )
order by tablename;
```

Policy audit query:

```sql
select
  schemaname,
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'companies',
    'uploaded_files',
    'financial_actuals',
    'budget_rows',
    'cash_rows',
    'payroll_rows',
    'revenue_detail_rows',
    'pipeline_rows',
    'bank_transaction_rows',
    'ai_briefs',
    'generated_reports',
    'monthly_close_items',
    'monthly_close_activity',
    'account_mappings',
    'forecast_versions',
    'forecast_version_rows',
    'forecast_driver_assumptions',
    'monthly_reports'
  )
order by tablename, policyname;
```

## Supabase Storage

The app uses one private bucket:

```text
finance-uploads
```

It stores:
- Monthly close CSV uploads
- Legacy upload CSV files
- Generated PowerPoint reports/decks under each user's folder

Bucket setup and policies are included in `001_initial_schema.sql`. If you need to apply them manually, run:

```sql
insert into storage.buckets (id, name, public)
values ('finance-uploads', 'finance-uploads', false)
on conflict (id) do nothing;

create policy "finance uploads own folder select"
on storage.objects for select
using (
  bucket_id = 'finance-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "finance uploads own folder insert"
on storage.objects for insert
with check (
  bucket_id = 'finance-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "finance uploads own folder update"
on storage.objects for update
using (
  bucket_id = 'finance-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'finance-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "finance uploads own folder delete"
on storage.objects for delete
using (
  bucket_id = 'finance-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

The bucket should remain private. Report downloads use signed URLs.

## Vercel Build Settings

Use the defaults:

```bash
npm install
npm run build
npm run start
```

The app uses Next.js App Router and `src/proxy.ts` for route protection. Vercel supports this through the Next.js deployment adapter.

PowerPoint generation runs in the browser using `pptxgenjs`, then uploads the generated Blob to Supabase Storage when Supabase is configured.

OpenAI CFO Brief generation runs server-side through:

```text
/api/ai/cfo-brief
```

## Production Smoke Test

After deployment:

1. Visit the production URL while logged out.
2. Confirm protected routes redirect to `/login`.
3. Sign up with a new test user.
4. Confirm email callback lands on `/auth/callback` and then `/onboarding` or `/dashboard`.
5. Create a company profile.
6. Go to `/data-room`, upload Actuals, Budget, and Cash CSV files.
7. Approve uploaded monthly close files.
8. Go to `/account-mapping`, apply or save mappings.
9. Confirm `/dashboard` and `/budget-vs-actuals` show source labels.
10. Generate a CFO Brief and confirm OpenAI succeeds without exposing server errors.
11. Create a forecast version and apply forecast drivers.
12. Go to `/reports`, save a draft, export a PowerPoint, and confirm the report appears in history.
13. Confirm report download opens from a signed URL when `generated_file_path` exists.

## Known Limitations

- One account maps to one company. No multi-company advisor portal.
- No billing, QuickBooks, Stripe, Plaid, investor portal, or admin portal.
- Forecast drivers are simple category-level assumptions, not a full spreadsheet model.
- PowerPoint export uses the current CFO deck template even when report section toggles are persisted.
- Supabase Storage files are private and scoped by the user's top-level folder.
