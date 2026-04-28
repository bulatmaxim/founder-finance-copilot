alter table public.uploaded_files
  add column if not exists is_active boolean default true;

create index if not exists uploaded_files_active_company_month_category_idx
  on public.uploaded_files(company_id, reporting_month, file_category, is_active);

create table if not exists public.monthly_close_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  reporting_month date not null,
  file_category text not null,
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists monthly_close_activity_company_month_idx
  on public.monthly_close_activity(company_id, reporting_month, created_at desc);

alter table public.monthly_close_activity enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'monthly_close_activity'
      and policyname = 'monthly_close_activity own all'
  ) then
    create policy "monthly_close_activity own all" on public.monthly_close_activity
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;
