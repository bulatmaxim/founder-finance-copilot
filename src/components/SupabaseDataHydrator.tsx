"use client";

import { useEffect } from "react";
import { hydrateLocalDataFromSupabase } from "@/lib/supabase/hydrateLocalData";

export function SupabaseDataHydrator() {
  useEffect(() => {
    async function hydrate() {
      try {
        await hydrateLocalDataFromSupabase();
      } catch (error) {
        console.error("Supabase data hydration failed", error);
      }
    }

    void hydrate();
  }, []);

  return null;
}
