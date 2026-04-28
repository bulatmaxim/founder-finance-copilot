alter table public.generated_reports
  add column if not exists data_source jsonb;
