type MetricCardProps = {
  label: string;
  value: string;
  context?: string;
};

export function MetricCard({ label, value, context }: MetricCardProps) {
  return (
    <article className="premium-card premium-card-hover rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <span className="h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_18px_rgba(125,211,252,0.7)]" />
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
        {value}
      </p>
      {context ? (
        <p className="mt-2 text-sm leading-5 text-slate-400">{context}</p>
      ) : null}
    </article>
  );
}
