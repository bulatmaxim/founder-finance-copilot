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
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
          {description}
        </p>
      </div>

      <div className="rounded-md border border-neutral-200 bg-white p-6">
        <p className="text-sm font-medium text-neutral-900">
          Prototype placeholder
        </p>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          This page is intentionally limited to local structure and static sample
          content for the first version.
        </p>
      </div>
    </section>
  );
}
