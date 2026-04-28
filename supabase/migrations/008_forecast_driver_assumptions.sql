create table if not exists public.forecast_driver_assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  forecast_version_id uuid not null references public.forecast_versions(id) on delete cascade,
  driver_type text not null,
  assumption_name text not null,
  assumption_value numeric,
  assumption_unit text,
  start_month date,
  end_month date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint forecast_driver_assumptions_unique unique (
    company_id,
    forecast_version_id,
    driver_type,
    assumption_name
  )
);

create index if not exists forecast_driver_assumptions_company_version_idx
  on public.forecast_driver_assumptions(company_id, forecast_version_id);

alter table public.forecast_driver_assumptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forecast_driver_assumptions'
      and policyname = 'forecast_driver_assumptions own all'
  ) then
    create policy "forecast_driver_assumptions own all" on public.forecast_driver_assumptions
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;
