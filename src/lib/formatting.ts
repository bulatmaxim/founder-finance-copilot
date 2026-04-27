export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCurrencyThousands(value: number) {
  const rounded = Math.round(value / 1000);

  return `$${rounded.toLocaleString("en-US")}k`;
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatRunwayMonths(value: number | null) {
  if (value === null) {
    return "No burn";
  }

  return `${value.toFixed(1)} months`;
}

export function formatVarianceLabel(value: number) {
  if (value === 0) {
    return "$0";
  }

  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatCurrency(Math.abs(value))}`;
}

export function formatPercentVarianceLabel(value: number) {
  if (value === 0) {
    return "0.0%";
  }

  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatPercent(Math.abs(value))}`;
}
