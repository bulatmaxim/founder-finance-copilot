"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrencyThousands } from "@/lib/formatting";

type ChartDatum = {
  month: string;
  [key: string]: string | number;
};

type ChartSeries = {
  dataKey: string;
  label: string;
  stroke?: string;
  fill?: string;
};

type DashboardChartProps = {
  title: string;
  description?: string;
  data: ChartDatum[];
  series: ChartSeries[];
  variant?: "line" | "bar";
  valueType?: "currency" | "months";
};

export function DashboardChart({
  title,
  description,
  data,
  series,
  variant = "line",
  valueType = "currency",
}: DashboardChartProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsMounted(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  const formatValue = (value: number) => {
    if (valueType === "months") {
      return `${value.toFixed(1)} mo`;
    }

    return formatCurrencyThousands(value);
  };

  return (
    <section className="premium-card rounded-2xl p-5">
      <div>
        <h2 className="text-base font-semibold text-slate-50">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        ) : null}
      </div>

      <div className="mt-5 h-72">
        {isMounted ? (
          <ResponsiveContainer width="100%" height="100%">
            {variant === "bar" ? (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--line-soft)" vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                tickFormatter={(value) => formatValue(Number(value))}
              />
              <Tooltip
                cursor={{ fill: "rgba(125, 211, 252, 0.08)" }}
                formatter={(value, name) => [
                  formatValue(Number(value)),
                  series.find((item) => item.dataKey === name)?.label ?? name,
                ]}
                labelClassName="font-medium"
                contentStyle={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 14,
                  boxShadow: "0 18px 40px rgba(0, 0, 0, 0.4)",
                  color: "var(--text-strong)",
                }}
              />
              {series.map((item) => (
                <Bar
                  key={item.dataKey}
                  dataKey={item.dataKey}
                  name={item.label}
                  fill={item.fill ?? "#7dd3fc"}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--line-soft)" vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                tickFormatter={(value) => formatValue(Number(value))}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatValue(Number(value)),
                  series.find((item) => item.dataKey === name)?.label ?? name,
                ]}
                labelClassName="font-medium"
                contentStyle={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 14,
                  boxShadow: "0 18px 40px rgba(0, 0, 0, 0.4)",
                  color: "var(--text-strong)",
                }}
              />
              {series.map((item) => (
                <Line
                  key={item.dataKey}
                  type="monotone"
                  dataKey={item.dataKey}
                  name={item.label}
                  stroke={item.stroke ?? "#7dd3fc"}
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{ r: 4, fill: "#e0f2fe", stroke: "#38bdf8" }}
                />
              ))}
            </LineChart>
          )}
          </ResponsiveContainer>
        ) : (
          <div className="premium-skeleton h-full rounded-2xl border border-white/10" />
        )}
      </div>
    </section>
  );
}
