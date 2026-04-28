export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const themeStorageKey = "founder-finance-theme";
export const themeChangeEvent = "founder-finance-theme-change";

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "dark";
  }

  const storedPreference = window.localStorage.getItem(themeStorageKey);

  return isThemePreference(storedPreference) ? storedPreference : "dark";
}

export function resolveThemePreference(
  preference: ThemePreference,
): ResolvedTheme {
  if (preference !== "system") {
    return preference;
  }

  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  const resolvedTheme = resolveThemePreference(preference);
  const root = document.documentElement;

  root.classList.remove("dark", "light");
  root.classList.add(resolvedTheme);
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
}

export function saveThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(themeStorageKey, preference);
  applyThemePreference(preference);
  window.dispatchEvent(new CustomEvent(themeChangeEvent, { detail: preference }));
}
