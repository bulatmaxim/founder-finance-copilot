"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeControls } from "@/components/ThemeControls";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";

export default function SettingsPage() {
  const [email, setEmail] = useState("Development user");

  useEffect(() => {
    async function loadUser() {
      if (!hasSupabaseBrowserEnv()) {
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setEmail(user?.email ?? "Not logged in");
    }

    void loadUser();
  }, []);

  return (
    <section className="space-y-6">
      <div className="premium-card rounded-3xl p-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200/70">
          Settings
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[color:var(--text-strong)]">
          Workspace Settings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          One account maps to one company finance workspace.
        </p>
      </div>

      <section className="premium-card rounded-2xl p-5">
        <h2 className="text-base font-semibold text-[color:var(--text-strong)]">Appearance</h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
          Choose how Founder Finance Copilot looks on this device.
        </p>
        <div className="mt-5">
          <ThemeControls />
        </div>
      </section>

      <section className="premium-card rounded-2xl p-5">
        <h2 className="text-base font-semibold text-[color:var(--text-strong)]">Account</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-[color:var(--text-muted)]">Logged-in user</dt>
            <dd className="mt-2 text-lg font-semibold text-[color:var(--text-strong)]">{email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-[color:var(--text-muted)]">Workspace model</dt>
            <dd className="mt-2 text-lg font-semibold text-[color:var(--text-strong)]">Single company</dd>
          </div>
        </dl>
        <div className="mt-6">
          <Link
            href="/logout"
            className="premium-pill inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium hover:border-sky-300/30 hover:bg-sky-300/10"
          >
            Log out
          </Link>
        </div>
      </section>

      <section className="premium-card rounded-2xl p-5">
        <h2 className="text-base font-semibold text-[color:var(--text-strong)]">Development Note</h2>
        <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
          If Supabase environment variables are missing, the app keeps using
          local prototype data and localStorage fallbacks.
        </p>
      </section>
    </section>
  );
}
