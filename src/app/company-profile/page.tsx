import { sampleCompany } from "@/data/sampleCompany";

const profileFields = [
  { label: "Company name", value: sampleCompany.name },
  { label: "Industry", value: sampleCompany.industry },
  { label: "Stage", value: sampleCompany.stage },
  { label: "Employees", value: sampleCompany.employees.toString() },
  { label: "Currency", value: sampleCompany.currency },
  { label: "Fiscal year", value: sampleCompany.fiscalYear },
];

export default function CompanyProfilePage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Company Profile
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Acme AI
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          This local prototype is configured for a single subscribed company.
          Financial dashboards, variance reporting, forecasts, decisions, and
          reports all use Acme AI sample data only.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {profileFields.map((field) => (
          <article
            key={field.label}
            className="rounded-md border border-neutral-200 bg-white p-5"
          >
            <p className="text-sm font-medium text-neutral-500">
              {field.label}
            </p>
            <p className="mt-3 text-xl font-semibold tracking-tight">
              {field.value}
            </p>
          </article>
        ))}
      </div>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Product Direction</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-neutral-600">
          A lightweight AI finance analyst for founder-led companies that turns
          accounting, cash, payroll, and revenue data into CFO-style
          recommendations, runway warnings, forecast updates, and investor-ready
          monthly reporting.
        </p>
      </section>
    </section>
  );
}
