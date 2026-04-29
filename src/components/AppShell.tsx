"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { SupabaseDataHydrator } from "@/components/SupabaseDataHydrator";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TopBar } from "@/components/TopBar";

const publicShellRoutes = ["/", "/login", "/signup"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicShellRoute =
    publicShellRoutes.includes(pathname) || pathname.startsWith("/auth/");

  if (isPublicShellRoute) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-950">
        <ThemeProvider />
        {children}
      </div>
    );
  }

  return (
    <div className="premium-shell">
      <ThemeProvider />
      <SupabaseDataHydrator />
      <Sidebar />
      <div className="premium-main min-h-screen lg:pl-[18rem]">
        <TopBar />
        <main className="mx-auto max-w-[1680px] px-5 py-7 sm:px-8 lg:px-10 xl:px-12">
          {children}
        </main>
      </div>
    </div>
  );
}
