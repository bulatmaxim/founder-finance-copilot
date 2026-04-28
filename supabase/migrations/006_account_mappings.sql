create table if not exists public.account_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  raw_account_name text not null,
  normalized_category text not null,
  department text,
  statement_type text,
  status text not null default 'Mapped',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint account_mappings_status_check check (
    status in ('Unmapped', 'Mapped', 'Needs review')
  ),
  constraint account_mappings_company_raw_account_unique unique (
    company_id,
    raw_account_name
  )
);

create index if not exists account_mappings_company_id_idx
  on public.account_mappings(company_id);

alter table public.account_mappings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'account_mappings'
      and policyname = 'account_mappings own all'
  ) then
    create policy "account_mappings own all" on public.account_mappings
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;
