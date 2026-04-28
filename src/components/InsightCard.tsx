import type { FinanceInsight } from "@/lib/financeInsights";

type InsightCardProps = {
  insight: FinanceInsight;
};

export function InsightCard({ insight }: InsightCardProps) {
  return (
    <article className="premium-card premium-card-hover rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-50">{insight.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {insight.summary}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <span className="premium-pill rounded-xl px-2 py-1 text-xs font-medium">
            {insight.severity}
          </span>
          <span className="premium-pill rounded-xl px-2 py-1 text-xs font-medium">
            {insight.category}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            Why it matters
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {insight.whyItMatters}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            Recommended action
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {insight.recommendedAction}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          Source metrics
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {insight.sourceMetrics.map((metric) => (
            <span
              key={metric}
              className="premium-pill rounded-xl px-2 py-1 text-xs"
            >
              {metric}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
