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
      <span className="premium-pill rounded-xl px-2.5 py-1 text-xs font-medium">
        Forecast: {context.name}
      </span>
    );
  }

  return (
    <div className="premium-notice rounded-2xl px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,0.7)]" />
        <span>
          Forecast context: {context.name} ({context.status}).{actualsText}
        </span>
      </div>
    </div>
  );
}
