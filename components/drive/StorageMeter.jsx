/**
 * How much of the vault is used (P3-48d, brief §9.4).
 *
 * A server component with no state: it is a fact about the firm, not a
 * control. It renders only when the firm has said how much room it bought
 * (`STORAGE_QUOTA_BYTES`) — a bar with no end is a decoration, and a
 * percentage of an invented total is worse than no percentage.
 *
 * The bar turns at four fifths, which is the point where somebody should be
 * buying space rather than discovering the problem during an upload.
 */
export default function StorageMeter({ used }) {
  if (!used) return null;

  const tight = used.share >= 0.8;

  return (
    <div className="flex min-w-[9rem] flex-col gap-1">
      <p className="num text-12 text-ink-muted text-right">
        {gb(used.bytes)} of {gb(used.quota)} used
      </p>
      <div
        className="bg-sunk h-1.5 w-full overflow-hidden rounded"
        role="img"
        aria-label={`${Math.round(used.share * 100)} per cent of the firm's storage is used`}
      >
        <div
          className={`h-full ${tight ? "bg-waiting" : "bg-carbon"}`}
          style={{ width: `${Math.max(2, Math.round(used.share * 100))}%` }}
        />
      </div>
    </div>
  );
}

/** Gigabytes to one decimal, which is as precise as this is worth. */
function gb(bytes) {
  const value = bytes / 1024 / 1024 / 1024;
  if (value < 0.1) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${value.toFixed(1)} GB`;
}
