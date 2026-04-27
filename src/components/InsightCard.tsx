import type { FinanceInsight } from "@/lib/financeInsights";

type InsightCardProps = {
  insight: FinanceInsight;
};

export function InsightCard({ insight }: InsightCardProps) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{insight.title}</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-700">
            {insight.summary}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
            {insight.severity}
          </span>
          <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
            {insight.category}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
            Why it matters
          </p>
          <p className="mt-2 text-sm leading-6 text-neutral-700">
            {insight.whyItMatters}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
            Recommended action
          </p>
          <p className="mt-2 text-sm leading-6 text-neutral-700">
            {insight.recommendedAction}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-neutral-100 pt-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
          Source metrics
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {insight.sourceMetrics.map((metric) => (
            <span
              key={metric}
              className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700"
            >
              {metric}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
