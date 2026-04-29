create table if not exists public.forecast_commentary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  forecast_version_id uuid not null references public.forecast_versions(id) on delete cascade,
  commentary jsonb,
  source text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint forecast_commentary_unique unique (company_id, forecast_version_id),
  constraint forecast_commentary_source_check check (
    source in ('manual', 'ai_draft', 'ai_edited')
  )
);

create index if not exists forecast_commentary_company_version_idx
  on public.forecast_commentary(company_id, forecast_version_id);

alter table public.forecast_commentary enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forecast_commentary'
      and policyname = 'forecast_commentary own all'
  ) then
    create policy "forecast_commentary own all" on public.forecast_commentary
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;

-- Future extension: comparison commentary can use the same editable AI-draft pattern.
