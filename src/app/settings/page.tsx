"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Workspace Settings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          One account maps to one company finance workspace.
        </p>
      </div>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Account</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-neutral-500">Logged-in user</dt>
            <dd className="mt-2 text-lg font-semibold">{email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-neutral-500">Workspace model</dt>
            <dd className="mt-2 text-lg font-semibold">Single company</dd>
          </div>
        </dl>
        <div className="mt-6">
          <Link
            href="/logout"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50"
          >
            Log out
          </Link>
        </div>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Development Note</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          If Supabase environment variables are missing, the app keeps using
          local prototype data and localStorage fallbacks.
        </p>
      </section>
    </section>
  );
}
