import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { SupabaseDataHydrator } from "@/components/SupabaseDataHydrator";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Founder Finance Copilot",
  description: "Local prototype finance dashboard for founder-led companies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="premium-shell">
          <SupabaseDataHydrator />
          <Sidebar />
          <div className="premium-main min-h-screen lg:pl-72">
            <TopBar />
            <main className="mx-auto max-w-[1680px] px-5 py-7 sm:px-8 lg:px-10 xl:px-12">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
