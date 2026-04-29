create table if not exists public.company_departments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text,
  function text,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint company_departments_company_name_unique unique (company_id, name)
);

create table if not exists public.company_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  account_name text not null,
  account_code text,
  uploaded_alias text,
  department_id uuid references public.company_departments(id) on delete set null,
  normalized_category text,
  statement_type text,
  is_active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint company_accounts_company_name_unique unique (company_id, account_name)
);

create table if not exists public.mapping_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_type text not null,
  match_value text not null,
  mapped_account_id uuid references public.company_accounts(id) on delete set null,
  mapped_department_id uuid references public.company_departments(id) on delete set null,
  normalized_category text,
  priority int default 100,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists company_departments_company_idx
  on public.company_departments(company_id, is_active);

create index if not exists company_accounts_company_idx
  on public.company_accounts(company_id, is_active);

create index if not exists mapping_rules_company_idx
  on public.mapping_rules(company_id, is_active, priority);

alter table public.company_departments enable row level security;
alter table public.company_accounts enable row level security;
alter table public.mapping_rules enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'company_departments'
      and policyname = 'company_departments own all'
  ) then
    create policy "company_departments own all" on public.company_departments
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'company_accounts'
      and policyname = 'company_accounts own all'
  ) then
    create policy "company_accounts own all" on public.company_accounts
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mapping_rules'
      and policyname = 'mapping_rules own all'
  ) then
    create policy "mapping_rules own all" on public.mapping_rules
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;
