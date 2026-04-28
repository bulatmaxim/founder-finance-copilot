"use client";

import { useEffect } from "react";
import {
  applyThemePreference,
  getStoredThemePreference,
  themeChangeEvent,
  themeStorageKey,
} from "@/lib/theme";

export function ThemeProvider() {
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");

    function syncTheme() {
      applyThemePreference(getStoredThemePreference());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === themeStorageKey) {
        syncTheme();
      }
    }

    syncTheme();
    mediaQuery.addEventListener("change", syncTheme);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(themeChangeEvent, syncTheme);

    return () => {
      mediaQuery.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(themeChangeEvent, syncTheme);
    };
  }, []);

  return null;
}
