import { sampleCompany } from "@/data/sampleCompany";

export function TopBar() {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xl font-semibold tracking-tight">
            Founder Finance Copilot
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {sampleCompany.name}
          </p>
        </div>
        <div className="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm">
          <p className="font-medium text-neutral-950">
            Current Reporting Period: Latest Month
          </p>
          <p className="mt-1 text-neutral-500">Single-company workspace</p>
        </div>
      </div>
    </header>
  );
}
