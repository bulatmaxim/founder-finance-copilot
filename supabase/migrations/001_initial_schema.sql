create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  industry text,
  stage text,
  employees integer,
  currency text default 'USD',
  fiscal_year_start_month integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(owner_user_id)
);

create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id),
  data_type text not null,
  file_name text not null,
  storage_path text,
  period_start text,
  period_end text,
  status text,
  row_count integer,
  error_count integer,
  warning_count integer,
  created_at timestamptz default now()
);

create table if not exists public.financial_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  data_type text not null,
  month text not null,
  account text,
  category text,
  amount numeric,
  forecast_version text,
  source text default 'uploaded_csv',
  created_at timestamptz default now()
);

create table if not exists public.cash_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  month text not null,
  cash_balance numeric not null,
  source text default 'uploaded_csv',
  created_at timestamptz default now()
);

create table if not exists public.payroll_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  month text,
  employee_name text,
  department text,
  role text,
  salary numeric,
  benefits numeric,
  payroll_tax numeric,
  bonus numeric,
  start_date text,
  status text,
  created_at timestamptz default now()
);

create table if not exists public.revenue_detail_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  month text,
  customer text,
  product text,
  revenue_type text,
  amount numeric,
  created_at timestamptz default now()
);

create table if not exists public.pipeline_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  deal_name text,
  customer text,
  stage text,
  amount numeric,
  probability numeric,
  expected_close_month text,
  owner text,
  created_at timestamptz default now()
);

create table if not exists public.bank_transaction_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  date text,
  description text,
  category text,
  amount numeric,
  created_at timestamptz default now()
);

create table if not exists public.ai_briefs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id),
  period text,
  source_summary jsonb,
  ai_output jsonb,
  status text default 'generated',
  created_at timestamptz default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id),
  report_type text,
  period text,
  title text,
  storage_path text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.uploaded_files enable row level security;
alter table public.financial_rows enable row level security;
alter table public.cash_balances enable row level security;
alter table public.payroll_rows enable row level security;
alter table public.revenue_detail_rows enable row level security;
alter table public.pipeline_rows enable row level security;
alter table public.bank_transaction_rows enable row level security;
alter table public.ai_briefs enable row level security;
alter table public.reports enable row level security;

create or replace function public.owns_company(company_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.companies
    where id = company_uuid and owner_user_id = auth.uid()
  );
$$;

create policy "profiles own select" on public.profiles for select using (id = auth.uid());
create policy "profiles own insert" on public.profiles for insert with check (id = auth.uid());
create policy "profiles own update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles own delete" on public.profiles for delete using (id = auth.uid());

create policy "companies own select" on public.companies for select using (owner_user_id = auth.uid());
create policy "companies own insert" on public.companies for insert with check (owner_user_id = auth.uid());
create policy "companies own update" on public.companies for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "companies own delete" on public.companies for delete using (owner_user_id = auth.uid());

create policy "uploaded_files own all" on public.uploaded_files for all using (public.owns_company(company_id)) with check (public.owns_company(company_id));
create policy "financial_rows own all" on public.financial_rows for all using (public.owns_company(company_id)) with check (public.owns_company(company_id));
create policy "cash_balances own all" on public.cash_balances for all using (public.owns_company(company_id)) with check (public.owns_company(company_id));
create policy "payroll_rows own all" on public.payroll_rows for all using (public.owns_company(company_id)) with check (public.owns_company(company_id));
create policy "revenue_detail_rows own all" on public.revenue_detail_rows for all using (public.owns_company(company_id)) with check (public.owns_company(company_id));
create policy "pipeline_rows own all" on public.pipeline_rows for all using (public.owns_company(company_id)) with check (public.owns_company(company_id));
create policy "bank_transaction_rows own all" on public.bank_transaction_rows for all using (public.owns_company(company_id)) with check (public.owns_company(company_id));
create policy "ai_briefs own all" on public.ai_briefs for all using (public.owns_company(company_id)) with check (public.owns_company(company_id));
create policy "reports own all" on public.reports for all using (public.owns_company(company_id)) with check (public.owns_company(company_id));

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
