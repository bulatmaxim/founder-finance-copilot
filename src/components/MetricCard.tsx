type MetricCardProps = {
  label: string;
  value: string;
  context?: string;
};

export function MetricCard({ label, value, context }: MetricCardProps) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {context ? <p className="mt-2 text-sm text-neutral-600">{context}</p> : null}
    </article>
  );
}
