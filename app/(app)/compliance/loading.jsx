/** Compliance, before the year has been counted (P3-34 phase 4). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6" aria-busy="true">
      <span className="sr-only">Working out where the firm stands…</span>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="skeleton block h-7 w-44" />
          <span className="skeleton block h-4 w-[32rem] max-w-full" />
        </div>
        <span className="skeleton block h-9 w-64" />
      </div>

      <span className="skeleton block h-[86px]" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="skeleton block h-[150px]" />
        ))}
      </div>

      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <span className="skeleton block h-5 w-32" />
          <span className="skeleton block h-28" />
        </div>
      ))}
    </div>
  );
}
