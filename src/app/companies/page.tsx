import { sampleCompanies } from "@/data/sampleCompanies";

export default function CompaniesPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Companies
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Company Workspace
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {sampleCompanies.map((company) => (
          <article
            key={company.id}
            className="rounded-md border border-neutral-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold">{company.name}</h2>
            <p className="mt-2 text-sm text-neutral-600">{company.industry}</p>
            <p className="mt-4 text-sm text-neutral-500">
              Fiscal year: {company.fiscalYear}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
