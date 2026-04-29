alter table public.forecast_version_rows
  drop constraint if exists forecast_version_rows_type_check;

alter table public.forecast_version_rows
  add constraint forecast_version_rows_type_check check (
    row_type in ('Actual', 'Forecast', 'Budget', 'Preliminary')
  );
