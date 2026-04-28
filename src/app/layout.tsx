import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { SupabaseDataHydrator } from "@/components/SupabaseDataHydrator";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Founder Finance Copilot",
  description: "Local prototype finance dashboard for founder-led companies.",
};

const themeInitScript = `
(() => {
  try {
    const key = "founder-finance-theme";
    const stored = window.localStorage.getItem(key);
    const preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
    const resolved = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : preference;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
  } catch {
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themePreference = "dark";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark"
      data-theme="dark"
      data-theme-preference="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
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
      </body>
    </html>
  );
}
