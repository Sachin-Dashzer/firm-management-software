/** A grid of eight hundred boxes takes a moment to count. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
      <span className="sr-only">Building the grid…</span>
      <span className="skeleton block h-4 w-40" />
      <span className="skeleton block h-7 w-48" />
      <span className="skeleton block h-9 w-80 max-w-full" />
      <span className="skeleton block h-[26rem]" />
    </div>
  );
}
