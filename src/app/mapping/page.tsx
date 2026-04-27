"use client";

import { useMemo, useState } from "react";
import {
  accountMappings,
  standardFpnaCategories,
  type MappingStatus,
} from "@/data/sampleMappings";

type Filter = "All" | "Needs Review" | "Unmapped" | "Approved";

const filters: Filter[] = ["All", "Needs Review", "Unmapped", "Approved"];

export default function MappingPage() {
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [message, setMessage] = useState("");
  const filteredMappings = useMemo(() => {
    if (activeFilter === "All") {
      return accountMappings;
    }

    return accountMappings.filter((mapping) => mapping.status === activeFilter);
  }, [activeFilter]);

  const approved = accountMappings.filter(
    (mapping) => mapping.status === "Approved",
  ).length;
  const needsReview = accountMappings.filter(
    (mapping) => mapping.status === "Needs Review",
  ).length;
  const unmapped = accountMappings.filter(
    (mapping) => mapping.status === "Unmapped",
  ).length;

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Data Mapping
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Account Mapping
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Map messy source account names into clean FP&A categories for Acme AI.
        </p>
      </div>

      {message ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total accounts" value={accountMappings.length} />
        <SummaryCard label="Approved mappings" value={approved} />
        <SummaryCard label="Needs review" value={needsReview} />
        <SummaryCard label="Unmapped accounts" value={unmapped} />
      </div>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Mapping Filters</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className={`rounded-md border px-3 py-2 text-sm font-medium ${
                activeFilter === filter
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      <MappingTable
        mappings={filteredMappings}
        onAction={(status) =>
          setMessage(
            status === "Approved"
              ? "Mapping approval will update local review state in a future step."
              : "Mapping edits and category reassignment will be added in a future step.",
          )
        }
      />

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Standard FP&A Categories</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {standardFpnaCategories.map((category) => (
            <div
              key={category}
              className="rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700"
            >
              {category}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Why Mapping Matters</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-neutral-600">
          Mappings allow the app to turn messy accounting data into clean
          CFO-style dashboards, budget vs actuals, forecasts, and
          recommendations.
        </p>
      </section>
    </section>
  );
}

function MappingTable({
  mappings,
  onAction,
}: {
  mappings: typeof accountMappings;
  onAction: (status: MappingStatus) => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Account Mapping Queue</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Suggested local mappings from raw accounts into standard FP&A
          categories.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">Raw Account Name</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Suggested FP&A Category</th>
              <th className="px-4 py-3 font-medium">Confidence %</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping) => (
              <tr key={mapping.rawAccountName} className="border-b border-neutral-100">
                <td className="px-4 py-3 font-medium">
                  {mapping.rawAccountName}
                </td>
                <td className="px-4 py-3">{mapping.source}</td>
                <td className="px-4 py-3">{mapping.suggestedCategory}</td>
                <td className="px-4 py-3">{mapping.confidence}%</td>
                <td className="px-4 py-3">
                  <StatusBadge status={mapping.status} />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onAction(mapping.status)}
                    className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    {mapping.status === "Approved" ? "View" : "Review"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
      {status}
    </span>
  );
}
