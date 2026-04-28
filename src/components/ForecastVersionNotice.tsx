"use client";

import { useEffect, useState } from "react";
import {
  dateToDisplayMonth,
  loadForecastVersionContext,
  type ForecastVersionContext,
} from "@/lib/forecastVersions";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/client";

export function ForecastVersionNotice({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [context, setContext] = useState<ForecastVersionContext | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      async function loadContext() {
        if (!hasSupabaseBrowserEnv()) {
          return;
        }

        try {
          setContext(await loadForecastVersionContext());
        } catch (error) {
          console.error("Forecast version context failed", error);
        }
      }

      void loadContext();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  if (!context) {
    return null;
  }

  const actualsText = context.actualsThroughMonth
    ? ` Actualized through ${dateToDisplayMonth(context.actualsThroughMonth)}.`
    : "";

  if (compact) {
    return (
      <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
        Forecast: {context.name}
      </span>
    );
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      Forecast context: {context.name} ({context.status}).{actualsText}
    </div>
  );
}
