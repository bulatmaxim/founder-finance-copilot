create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  reporting_month date not null,
  report_type text not null,
  title text,
  status text default 'Draft',
  forecast_version_id uuid references public.forecast_versions(id) on delete set null,
  data_source jsonb,
  commentary jsonb,
  sections jsonb,
  generated_file_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint monthly_reports_status_check check (
    status in ('Draft', 'Ready', 'Exported', 'Archived')
  ),
  constraint monthly_reports_type_check check (
    report_type in (
      'Monthly Performance Review',
      'Board Pack',
      'Forecast Update',
      'Decision Memo'
    )
  )
);

create index if not exists monthly_reports_company_month_idx
  on public.monthly_reports(company_id, reporting_month);

create index if not exists monthly_reports_company_created_idx
  on public.monthly_reports(company_id, created_at desc);

alter table public.monthly_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'monthly_reports'
      and policyname = 'monthly_reports own all'
  ) then
    create policy "monthly_reports own all" on public.monthly_reports
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;
