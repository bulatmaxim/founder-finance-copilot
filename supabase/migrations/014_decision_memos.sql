create table if not exists public.decision_memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text,
  decision_type text,
  decision_prompt text,
  questions jsonb,
  answers jsonb,
  analysis jsonb,
  recommendation text,
  status text default 'Draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint decision_memos_status_check check (
    status in ('Draft', 'Reviewed', 'Approved', 'Archived')
  )
);

create index if not exists decision_memos_company_created_idx
  on public.decision_memos(company_id, created_at desc);

alter table public.decision_memos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'decision_memos'
      and policyname = 'decision_memos own all'
  ) then
    create policy "decision_memos own all" on public.decision_memos
      for all
      using (public.owns_company(company_id))
      with check (public.owns_company(company_id) and user_id = auth.uid());
  end if;
end $$;
