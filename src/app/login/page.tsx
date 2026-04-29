import Link from "next/link";
import { safeInternalPath } from "@/lib/authRedirects";

type LoginPageProps = {
  searchParams?: Promise<{
    authError?: string;
    next?: string;
    redirectedFrom?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const next = safeInternalPath(params.next ?? params.redirectedFrom ?? null, "/dashboard");

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md items-center px-5">
      <div className="w-full rounded-md border border-neutral-200 bg-white p-6">
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Founder Finance Copilot
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Log in
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Access your finance workspace.
        </p>

        {params.authError ? (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {params.authError}
          </div>
        ) : null}

        <form action="/auth/sign-in" method="post" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Email</span>
            <input
              type="email"
              name="email"
              required
              className="mt-2 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Password</span>
            <input
              type="password"
              name="password"
              required
              className="mt-2 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950"
            />
          </label>
          <button
            type="submit"
            className="h-11 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Log in
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
