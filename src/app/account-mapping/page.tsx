"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import {
  applySuggestedAccountMappings,
  departments,
  loadAccountMappingRows,
  saveAccountMapping,
  standardFpnaCategories,
  summarizeAccountMappings,
  type AccountMappingRow,
  type AccountMappingStatus,
} from "@/lib/accountMapping";
import { hydrateLocalDataFromSupabase } from "@/lib/supabase/hydrateLocalData";

type Filter = "All" | "Unmapped" | "Mapped" | "Needs Review";

const filters: Filter[] = ["All", "Unmapped", "Mapped", "Needs Review"];

export default function AccountMappingPage() {
  const [rows, setRows] = useState<AccountMappingRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<Filter>("Unmapped");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback((type: ToastType, title: string, detail?: string) => {
    setToast({ id: Date.now(), type, title, detail });
  }, []);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    try {
      setRows(await loadAccountMappingRows());
    } catch (error) {
      console.error("Account mappings load failed", error);
      notify(
        "error",
        "Account mappings could not be loaded.",
        error instanceof Error ? error.message : "Check Supabase setup.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRows();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadRows]);

  const summary = useMemo(() => summarizeAccountMappings(rows), [rows]);
  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesFilter =
        activeFilter === "All" ||
        row.status === (activeFilter === "Needs Review" ? "Needs review" : activeFilter);
      const matchesSearch =
        !normalizedSearch ||
        row.rawAccountName.toLowerCase().includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, rows, search]);

  function updateRow(rawAccountName: string, patch: Partial<AccountMappingRow>) {
    setRows((current) =>
      current.map((row) =>
        row.rawAccountName === rawAccountName ? { ...row, ...patch } : row,
      ),
    );
  }

  async function handleSave(row: AccountMappingRow) {
    setSavingKey(row.rawAccountName);

    try {
      await saveAccountMapping({
        rawAccountName: row.rawAccountName,
        normalizedCategory: row.selectedCategory || row.suggestedCategory,
        department: row.department,
        statementType: row.sourceType,
        status: row.selectedCategory || row.suggestedCategory ? row.status === "Needs review" ? "Needs review" : "Mapped" : "Unmapped",
      });
      await hydrateLocalDataFromSupabase();
      await loadRows();
      notify("success", "Mapping saved.");
    } catch (error) {
      console.error("Account mapping save failed", error);
      notify(
        "error",
        "Mapping could not be saved.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSavingKey("");
    }
  }

  async function handleApplySuggested() {
    const savedMappingsToOverwrite = rows.filter(
      (row) => row.id && row.status !== "Unmapped",
    );

    if (savedMappingsToOverwrite.length > 0) {
      const confirmed = window.confirm(
        `Apply suggested mappings to ${savedMappingsToOverwrite.length} saved mapping${savedMappingsToOverwrite.length === 1 ? "" : "s"} that are not currently unmapped? Existing selected categories may be overwritten.`,
      );

      if (!confirmed) {
        return;
      }
    }

    setIsSavingAll(true);

    try {
      await applySuggestedAccountMappings(rows);
      await hydrateLocalDataFromSupabase();
      await loadRows();
      notify("success", "Suggested mappings applied.");
    } catch (error) {
      console.error("Suggested mappings failed", error);
      notify(
        "error",
        "Suggested mappings could not be applied.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsSavingAll(false);
    }
  }

  async function handleSaveAll() {
    setIsSavingAll(true);

    try {
      for (const row of rows.filter((item) => item.selectedCategory)) {
        await saveAccountMapping({
          rawAccountName: row.rawAccountName,
          normalizedCategory: row.selectedCategory,
          department: row.department,
          statementType: row.sourceType,
          status: row.status === "Needs review" ? "Needs review" : "Mapped",
        });
      }

      await hydrateLocalDataFromSupabase();
      await loadRows();
      notify("success", "All edited mappings saved.");
    } catch (error) {
      console.error("Save all mappings failed", error);
      notify(
        "error",
        "Mappings could not be saved.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsSavingAll(false);
    }
  }

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
            Account Mapping
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Account Mapping
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
            Map uploaded accounting lines into clean FP&A categories for
            reporting, variance analysis, and CFO insights.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSavingAll || rows.length === 0}
            onClick={() => void handleApplySuggested()}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            Apply suggested mappings
          </button>
          <button
            type="button"
            disabled={isSavingAll || rows.length === 0}
            onClick={() => void handleSaveAll()}
            className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isSavingAll ? "Saving..." : "Save all"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total accounts" value={summary.totalAccounts} />
        <SummaryCard label="Mapped accounts" value={summary.mappedAccounts} />
        <SummaryCard label="Unmapped accounts" value={summary.unmappedAccounts} />
        <SummaryCard label="Needs review" value={summary.needsReview} />
      </div>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`h-9 rounded-md border px-3 text-sm font-medium ${
                  activeFilter === filter
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
          <label className="block xl:w-80">
            <span className="sr-only">Search raw account name</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search raw account name"
              className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
            />
          </label>
        </div>
      </section>

      {isLoading ? (
        <section className="rounded-md border border-neutral-200 bg-white p-6">
          <p className="text-sm text-neutral-500">Loading account mappings...</p>
        </section>
      ) : (
        <MappingTable
          rows={filteredRows}
          savingKey={savingKey}
          onUpdate={updateRow}
          onSave={(row) => void handleSave(row)}
        />
      )}

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
    </section>
  );
}

function MappingTable({
  rows,
  savingKey,
  onUpdate,
  onSave,
}: {
  rows: AccountMappingRow[];
  savingKey: string;
  onUpdate: (rawAccountName: string, patch: Partial<AccountMappingRow>) => void;
  onSave: (row: AccountMappingRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-md border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-500">
          No accounts match this filter. Approved Data Room uploads will surface
          new raw accounts here automatically.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Account Mapping Queue</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Preserve raw account names while applying normalized FP&A categories
          to reporting rollups.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">Raw account name</th>
              <th className="px-4 py-3 font-medium">Source type</th>
              <th className="px-4 py-3 font-medium">Suggested FP&A category</th>
              <th className="px-4 py-3 font-medium">Selected FP&A category</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last updated</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rawAccountName} className="border-b border-neutral-100 align-top">
                <td className="px-4 py-4 font-medium text-neutral-950">
                  {row.rawAccountName}
                </td>
                <td className="px-4 py-4 text-neutral-700">{row.sourceType}</td>
                <td className="px-4 py-4 text-neutral-700">
                  {row.suggestedCategory}
                </td>
                <td className="px-4 py-4">
                  <select
                    value={row.selectedCategory || row.suggestedCategory}
                    onChange={(event) =>
                      onUpdate(row.rawAccountName, {
                        selectedCategory: event.target.value,
                        status:
                          event.target.value === "Uncategorized"
                            ? "Needs review"
                            : "Mapped",
                      })
                    }
                    className="h-10 w-64 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
                  >
                    {standardFpnaCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-4">
                  <select
                    value={row.department}
                    onChange={(event) =>
                      onUpdate(row.rawAccountName, {
                        department: event.target.value,
                      })
                    }
                    className="h-10 w-52 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
                  >
                    {departments.map((department) => (
                      <option key={department || "none"} value={department}>
                        {department || "None"}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-4">
                  <select
                    value={row.status}
                    onChange={(event) =>
                      onUpdate(row.rawAccountName, {
                        status: event.target.value as AccountMappingStatus,
                      })
                    }
                    className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
                  >
                    <option value="Unmapped">Unmapped</option>
                    <option value="Mapped">Mapped</option>
                    <option value="Needs review">Needs review</option>
                  </select>
                </td>
                <td className="px-4 py-4 text-neutral-600">
                  {formatDate(row.lastUpdated)}
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    disabled={savingKey === row.rawAccountName}
                    onClick={() => onSave(row)}
                    className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                  >
                    {savingKey === row.rawAccountName ? "Saving..." : "Save"}
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

function formatDate(value: string | null) {
  if (!value) {
    return "Not saved";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
