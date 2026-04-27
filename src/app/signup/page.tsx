"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Toast, type ToastMessage } from "@/components/Toast";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasSupabaseBrowserEnv()) {
      setToast({
        id: Date.now(),
        type: "error",
        title: "Supabase is not configured.",
        detail: "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          updated_at: new Date().toISOString(),
        });
      }

      setToast({
        id: Date.now(),
        type: "success",
        title: "Account created.",
        detail: data.session
          ? "Next, create the Acme AI company profile."
          : "Check your email if confirmation is enabled, then log in.",
      });

      router.push(data.session ? "/onboarding" : "/login");
      router.refresh();
    } catch (error) {
      console.error("Signup failed", error);
      setToast({
        id: Date.now(),
        type: "error",
        title: "Signup failed.",
        detail: error instanceof Error ? error.message : "Try again with a valid email and password.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <Toast message={toast} onClose={() => setToast(null)} />
      <div className="w-full rounded-md border border-neutral-200 bg-white p-6">
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Founder Finance Copilot
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign up</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Create a one-company workspace for Acme AI.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-sm text-neutral-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-neutral-950 underline">
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
}
