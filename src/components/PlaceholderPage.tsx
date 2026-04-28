type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <section className="space-y-6">
      <div className="premium-card rounded-3xl p-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200/70">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-50">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          {description}
        </p>
      </div>

      <div className="premium-card rounded-2xl p-6">
        <p className="text-sm font-medium text-slate-100">
          Prototype placeholder
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          This page is intentionally limited to local structure and static sample
          content for the first version.
        </p>
      </div>
    </section>
  );
}
