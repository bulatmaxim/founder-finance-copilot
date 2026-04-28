import Link from "next/link";

const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Uploads", href: "/uploads" },
  { name: "Data Room", href: "/data-room" },
  { name: "Account Mapping", href: "/account-mapping" },
  { name: "Budget vs Actuals", href: "/budget-vs-actuals" },
  { name: "Forecasts", href: "/forecasts" },
  { name: "Decision Center", href: "/decision-center" },
  { name: "Reports", href: "/reports" },
  { name: "Company Profile", href: "/company-profile" },
  { name: "Settings", href: "/settings" },
];

export function Sidebar() {
  return (
    <aside className="border-b border-neutral-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col px-5 py-5">
        <Link href="/dashboard" className="hidden lg:block">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Founder Finance
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight">Copilot</p>
        </Link>

        <nav className="mt-0 flex gap-2 overflow-x-auto lg:mt-10 lg:flex-col lg:overflow-visible">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-md border border-transparent px-3 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-200 hover:bg-neutral-50 hover:text-neutral-950"
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
