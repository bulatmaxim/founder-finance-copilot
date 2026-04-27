import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
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
        <div className="min-h-screen bg-white text-neutral-950">
          <Sidebar />
          <div className="min-h-screen lg:pl-72">
            <TopBar />
            <main className="px-5 py-6 sm:px-8 lg:px-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
