alter table public.companies
  add column if not exists current_cash_balance numeric,
  add column if not exists monthly_burn numeric;

create table if not exists public.financial_actuals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  month text not null,
  account text,
  category text,
  amount numeric,
  source text default 'uploaded_csv',
  created_at timestamptz default now()
);

create table if not exists public.budget_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  month text not null,
  account text,
  category text,
  amount numeric,
  source text default 'uploaded_csv',
  created_at timestamptz default now()
);

create table if not exists public.cash_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  month text not null,
  cash_balance numeric not null,
  source text default 'uploaded_csv',
  created_at timestamptz default now()
);

create table if not exists public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id),
  report_type text,
  period text,
  title text,
  file_name text,
  storage_path text,
  created_at timestamptz default now()
);

insert into public.financial_actuals (
  company_id,
  uploaded_file_id,
  month,
  account,
  category,
  amount,
  source,
  created_at
)
select
  company_id,
  uploaded_file_id,
  month,
  account,
  category,
  amount,
  source,
  created_at
from public.financial_rows
where data_type = 'actuals'
  and exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'financial_rows'
  )
on conflict do nothing;

insert into public.budget_rows (
  company_id,
  uploaded_file_id,
  month,
  account,
  category,
  amount,
  source,
  created_at
)
select
  company_id,
  uploaded_file_id,
  month,
  account,
  category,
  amount,
  source,
  created_at
from public.financial_rows
where data_type = 'budget'
  and exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'financial_rows'
  )
on conflict do nothing;

insert into public.cash_rows (
  company_id,
  uploaded_file_id,
  month,
  cash_balance,
  source,
  created_at
)
select
  company_id,
  uploaded_file_id,
  month,
  cash_balance,
  source,
  created_at
from public.cash_balances
where exists (
  select 1
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'cash_balances'
)
on conflict do nothing;

insert into public.generated_reports (
  company_id,
  user_id,
  report_type,
  period,
  title,
  storage_path,
  created_at
)
select
  company_id,
  user_id,
  report_type,
  period,
  title,
  storage_path,
  created_at
from public.reports
where exists (
  select 1
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'reports'
)
on conflict do nothing;

alter table public.financial_actuals enable row level security;
alter table public.budget_rows enable row level security;
alter table public.cash_rows enable row level security;
alter table public.generated_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'financial_actuals'
      and policyname = 'financial_actuals own all'
  ) then
    create policy "financial_actuals own all" on public.financial_actuals
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'budget_rows'
      and policyname = 'budget_rows own all'
  ) then
    create policy "budget_rows own all" on public.budget_rows
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cash_rows'
      and policyname = 'cash_rows own all'
  ) then
    create policy "cash_rows own all" on public.cash_rows
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'generated_reports'
      and policyname = 'generated_reports own all'
  ) then
    create policy "generated_reports own all" on public.generated_reports
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id));
  end if;
end $$;
