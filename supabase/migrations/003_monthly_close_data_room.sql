alter table public.uploaded_files
  add column if not exists reporting_month date,
  add column if not exists file_category text,
  add column if not exists uploaded_at timestamptz default now();

create table if not exists public.monthly_close_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  reporting_month date not null,
  file_category text not null,
  status text not null default 'Not uploaded',
  file_name text,
  storage_path text,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  uploaded_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  validation_summary jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint monthly_close_items_status_check check (
    status in ('Not uploaded', 'Uploaded', 'Needs review', 'Approved')
  ),
  constraint monthly_close_items_unique unique (
    company_id,
    reporting_month,
    file_category
  )
);

create index if not exists uploaded_files_company_month_category_idx
  on public.uploaded_files(company_id, reporting_month, file_category);

create index if not exists monthly_close_items_company_month_idx
  on public.monthly_close_items(company_id, reporting_month);

alter table public.monthly_close_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'monthly_close_items'
      and policyname = 'monthly_close_items own all'
  ) then
    create policy "monthly_close_items own all" on public.monthly_close_items
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;
