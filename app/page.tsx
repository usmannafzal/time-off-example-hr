import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          ExampleHR · Time Off
        </h1>
        <p className="mt-3 max-w-prose text-slate-600 dark:text-slate-300">
          Leave balances and request lifecycle management. Balances are sourced
          from an external HCM system of record — every value is labelled with
          its freshness, every optimistic update is provisional, and every
          contradiction is recoverable.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <HomeCard
          href="/dashboard"
          title="Employee dashboard"
          description="See balances, submit, edit and cancel time-off requests."
        />
        <HomeCard
          href="/approvals"
          title="Manager approvals"
          description="Review pending requests against a fresh, real-time balance."
        />
      </div>
    </div>
  );
}

function HomeCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {description}
      </p>
    </Link>
  );
}
