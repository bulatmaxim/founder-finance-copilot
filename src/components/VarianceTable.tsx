import type { VarianceStatus } from "@/lib/calculations";
import {
  formatCurrency,
  formatPercentVarianceLabel,
  formatVarianceLabel,
} from "@/lib/formatting";

export type VarianceRow = {
  metric: string;
  actual: number;
  budget: number;
  varianceDollars: number;
  variancePercent: number;
  status: VarianceStatus;
};

type VarianceTableProps = {
  rows: VarianceRow[];
};

export function VarianceTable({ rows }: VarianceTableProps) {
  return (
    <section className="premium-card overflow-hidden rounded-2xl">
      <div className="premium-panel-header px-5 py-4">
        <h2 className="text-base font-semibold text-slate-50">Top Variances</h2>
        <p className="mt-1 text-sm text-slate-400">
          Latest month actuals compared with budget.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-white/10 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Metric/category</th>
              <th className="px-4 py-3 font-medium">Actual</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">Variance $</th>
              <th className="px-4 py-3 font-medium">Variance %</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.metric} className="border-b border-white/10">
                <td className="px-4 py-3 font-medium text-slate-100">{row.metric}</td>
                <td className="px-4 py-3 text-slate-300">{formatCurrency(row.actual)}</td>
                <td className="px-4 py-3 text-slate-300">{formatCurrency(row.budget)}</td>
                <td className="px-4 py-3">
                  {formatVarianceLabel(row.varianceDollars)}
                </td>
                <td className="px-4 py-3">
                  {formatPercentVarianceLabel(row.variancePercent)}
                </td>
                <td className="px-4 py-3">
                  <span className="premium-pill rounded-xl px-2 py-1 text-xs font-medium">
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
