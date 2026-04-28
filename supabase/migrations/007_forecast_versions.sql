create table if not exists public.forecast_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  fiscal_year int not null,
  version_type text not null,
  status text not null default 'Draft',
  actuals_through_month date,
  source_version_id uuid references public.forecast_versions(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint forecast_versions_type_check check (
    version_type in (
      'Budget',
      'Rolling Forecast',
      'Scenario',
      'Board Case',
      'Downside Case',
      'Upside Case'
    )
  ),
  constraint forecast_versions_status_check check (
    status in ('Draft', 'Under Review', 'Approved', 'Published', 'Archived')
  )
);

create table if not exists public.forecast_version_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  forecast_version_id uuid not null references public.forecast_versions(id) on delete cascade,
  month date not null,
  category text not null,
  amount numeric not null default 0,
  row_type text not null,
  source text,
  is_locked boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint forecast_version_rows_type_check check (
    row_type in ('Actual', 'Forecast', 'Budget')
  )
);

create index if not exists forecast_versions_company_id_idx
  on public.forecast_versions(company_id);

create index if not exists forecast_versions_company_status_idx
  on public.forecast_versions(company_id, status);

create index if not exists forecast_version_rows_version_month_idx
  on public.forecast_version_rows(forecast_version_id, month);

create index if not exists forecast_version_rows_company_month_idx
  on public.forecast_version_rows(company_id, month);

alter table public.forecast_versions enable row level security;
alter table public.forecast_version_rows enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forecast_versions'
      and policyname = 'forecast_versions own all'
  ) then
    create policy "forecast_versions own all" on public.forecast_versions
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forecast_version_rows'
      and policyname = 'forecast_version_rows own all'
  ) then
    create policy "forecast_version_rows own all" on public.forecast_version_rows
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;
