create table if not exists public.forecast_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  forecast_version_id uuid not null references public.forecast_versions(id) on delete cascade,
  recommendation_type text not null default 'AI Forecast Recommendation',
  status text not null default 'Draft',
  source_data_status text,
  includes_unapproved_data boolean default false,
  include_next_year boolean default false,
  forecast_detail_level text default 'Detailed',
  summary jsonb,
  risks jsonb,
  assumptions jsonb,
  external_benchmark_context jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint forecast_recommendations_status_check check (
    status in ('Draft', 'Partially Accepted', 'Applied', 'Rejected', 'Archived')
  )
);

create table if not exists public.forecast_recommendation_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  forecast_recommendation_id uuid not null references public.forecast_recommendations(id) on delete cascade,
  forecast_version_id uuid not null references public.forecast_versions(id) on delete cascade,
  section text,
  line_item text,
  month date,
  current_amount numeric,
  suggested_amount numeric,
  change_amount numeric,
  change_percent numeric,
  reason text,
  confidence text,
  status text default 'Pending',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint forecast_recommendation_rows_status_check check (
    status in ('Pending', 'Accepted', 'Rejected', 'Edited', 'Applied')
  ),
  constraint forecast_recommendation_rows_confidence_check check (
    confidence is null or confidence in ('High', 'Medium', 'Low')
  )
);

create table if not exists public.forecast_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  forecast_version_id uuid references public.forecast_versions(id) on delete set null,
  notification_type text,
  title text,
  message text,
  status text default 'Open',
  created_at timestamptz default now(),
  dismissed_at timestamptz
);

create index if not exists forecast_recommendations_company_version_idx
  on public.forecast_recommendations(company_id, forecast_version_id, created_at desc);

create index if not exists forecast_recommendation_rows_recommendation_idx
  on public.forecast_recommendation_rows(forecast_recommendation_id, status);

create index if not exists forecast_notifications_company_status_idx
  on public.forecast_notifications(company_id, status, created_at desc);

alter table public.forecast_recommendations enable row level security;
alter table public.forecast_recommendation_rows enable row level security;
alter table public.forecast_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forecast_recommendations'
      and policyname = 'forecast_recommendations own all'
  ) then
    create policy "forecast_recommendations own all" on public.forecast_recommendations
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forecast_recommendation_rows'
      and policyname = 'forecast_recommendation_rows own all'
  ) then
    create policy "forecast_recommendation_rows own all" on public.forecast_recommendation_rows
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forecast_notifications'
      and policyname = 'forecast_notifications own all'
  ) then
    create policy "forecast_notifications own all" on public.forecast_notifications
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;
