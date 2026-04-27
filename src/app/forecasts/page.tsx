import { sampleForecast } from "@/data/sampleForecast";
import { formatCurrency } from "@/lib/formatting";

export default function ForecastsPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Forecasts
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Cash Forecast
        </h1>
      </div>

      <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">Month</th>
              <th className="px-4 py-3 font-medium">Revenue</th>
              <th className="px-4 py-3 font-medium">Burn</th>
              <th className="px-4 py-3 font-medium">Ending Cash</th>
            </tr>
          </thead>
          <tbody>
            {sampleForecast.map((month) => (
              <tr key={month.month} className="border-b border-neutral-100">
                <td className="px-4 py-3 font-medium">{month.month}</td>
                <td className="px-4 py-3">{formatCurrency(month.revenue)}</td>
                <td className="px-4 py-3">{formatCurrency(month.burn)}</td>
                <td className="px-4 py-3">
                  {formatCurrency(month.endingCash)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
