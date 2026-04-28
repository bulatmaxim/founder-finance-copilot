"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getStoredThemePreference,
  resolveThemePreference,
  saveThemePreference,
  themeChangeEvent,
  themeStorageKey,
  type ThemePreference,
} from "@/lib/theme";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  {
    value: "dark",
    label: "Dark",
    description: "Graphite finance cockpit with cool accent lighting.",
  },
  {
    value: "light",
    label: "Light",
    description: "Pearl workspace with layered cards and graphite text.",
  },
  {
    value: "system",
    label: "System",
    description: "Follow this device's appearance setting.",
  },
];

export function ThemeControls() {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribeToThemePreference,
    getStoredThemePreference,
    getServerThemePreference,
  );
  const resolvedTheme = useMemo(
    () => resolveThemePreference(preference),
    [preference],
  );

  function handleSelect(nextPreference: ThemePreference) {
    saveThemePreference(nextPreference);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {themeOptions.map((option) => {
          const isSelected = preference === option.value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => handleSelect(option.value)}
              className={`rounded-2xl border p-4 text-left ${
                isSelected
                  ? "border-sky-300/40 bg-sky-300/10 shadow-[0_0_30px_rgba(56,189,248,0.12)]"
                  : "border-[color:var(--line-soft)] bg-[color:var(--surface-tint)] hover:border-sky-300/30 hover:bg-sky-300/10"
              }`}
            >
              <span className="block text-sm font-semibold text-[color:var(--text-strong)]">
                {option.label}
              </span>
              <span className="mt-2 block text-sm leading-5 text-[color:var(--text-muted)]">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-[color:var(--text-muted)]">
        Current appearance: {preference === "system" ? "System" : preference}
        {preference === "system" ? ` (${resolvedTheme})` : ""}. This preference is
        saved on this device.
      </p>
    </div>
  );
}

function getServerThemePreference(): ThemePreference {
  return "dark";
}

function subscribeToThemePreference(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === themeStorageKey) {
      onStoreChange();
    }
  }

  window.addEventListener(themeChangeEvent, onStoreChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(themeChangeEvent, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}
