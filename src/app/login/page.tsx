"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Toast, type ToastMessage } from "@/components/Toast";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);

    try {
      const nextPath =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next") ??
            new URLSearchParams(window.location.search).get("redirectedFrom")
          : null;
      const response = await fetch("/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          next: nextPath,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        next?: string;
      } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "Check your email and password.");
      }

      router.replace(result?.next ?? "/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Login failed", error);
      setToast({
        id: Date.now(),
        type: "error",
        title: "Login failed.",
        detail: error instanceof Error ? error.message : "Check your email and password.",
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Access the Acme AI finance workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="mt-5 text-sm text-neutral-600">
          Need an account?{" "}
          <Link href="/signup" className="font-medium text-neutral-950 underline">
            Sign up
          </Link>
        </p>
      </div>
    </section>
  );
}
