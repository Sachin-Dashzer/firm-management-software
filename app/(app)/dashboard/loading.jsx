/**
 * The dashboard, before it has anything to say (P3-34 phase 3).
 *
 * Shaped like the screen it stands in for, so the page does not jump when
 * the figures land. The shimmer is the one animation loop D103 allows, and
 * it lives exactly as long as the server takes.
 *
 * A spinner would have been less work and would have told the reader
 * nothing except that something is happening — which they know, because
 * they clicked.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
      <span className="sr-only">Loading the firm dashboard…</span>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="skeleton block h-7 w-56" />
          <span className="skeleton block h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <span className="skeleton block h-6 w-40" />
          <span className="skeleton block h-6 w-32" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className="skeleton block h-[104px]" />
        ))}
      </div>

      <span className="skeleton block h-[132px]" />

      <div className="grid gap-4 lg:grid-cols-2">
        <span className="skeleton block h-72" />
        <span className="skeleton block h-72" />
      </div>

      <span className="skeleton block h-64" />

      <div className="grid gap-4 lg:grid-cols-2">
        <span className="skeleton block h-72" />
        <span className="skeleton block h-72" />
      </div>
    </div>
  );
}
