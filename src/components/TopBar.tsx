import { CompanySwitcher } from "@/components/CompanySwitcher";

export function TopBar() {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xl font-semibold tracking-tight">
            Founder Finance Copilot
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Current reporting period: March 2026
          </p>
        </div>
        <CompanySwitcher />
      </div>
    </header>
  );
}
