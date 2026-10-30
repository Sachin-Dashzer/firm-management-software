import StatTile from "@/components/ui/StatTile";

/**
 * The five figures a partner opens the day on (P3-34 phase 3).
 *
 * One row, and the row's length does not change with the data: a tile
 * reading zero is kept, in the plain look, because "nothing is overdue" is
 * a thing worth being told on a Monday and a row that grows and shrinks is
 * a row nobody can read at a glance.
 *
 * The hint on the right is the promise the whole screen makes, written
 * where somebody will read it once and then rely on it.
 */
export default function NeedsAction({ tiles }) {
  if (tiles.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-15 font-semibold">Needs action</h2>
        <p className="text-12 text-ink-muted">Every number opens its list</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map(({ key, ...tile }) => (
          <StatTile key={key} {...tile} />
        ))}
      </div>
    </section>
  );
}
