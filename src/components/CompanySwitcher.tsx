"use client";

import { sampleCompanies } from "@/data/sampleCompanies";

export function CompanySwitcher() {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:min-w-56">
      Company
      <select className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950">
        {sampleCompanies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
    </label>
  );
}
