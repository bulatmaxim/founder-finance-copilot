alter table if exists public.import_staged_rows
  add column if not exists account_code text,
  add column if not exists department_code text;

create index if not exists import_staged_rows_account_code_idx
  on public.import_staged_rows(company_id, account_code)
  where account_code is not null;

create index if not exists import_staged_rows_department_code_idx
  on public.import_staged_rows(company_id, department_code)
  where department_code is not null;

create unique index if not exists mapping_rules_company_type_value_unique
  on public.mapping_rules(company_id, rule_type, match_value);
