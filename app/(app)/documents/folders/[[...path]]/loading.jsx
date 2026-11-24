import Screen from "@/components/ui/Screen";
import PageHead from "@/components/ui/PageHead";

/**
 * The drive, while it is being read (P3-48d).
 *
 * Tiles in the shape of tiles, not a spinner: moving between folders is the
 * main thing a person does here, and a spinner in the middle of the canvas
 * makes every step feel like a page load. The grey blocks sit where the
 * folders will be, so the layout does not jump when they arrive.
 */
export default function Loading() {
  return (
    <Screen>
      <PageHead
        title="Work drive"
        sub="Every folder in the firm: the clients, their services and years, the jobs, and the folders people make."
      />
      <div
        role="status"
        aria-label="Opening the folder"
        className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="rounded-ledger flex flex-col items-center gap-2 px-3 py-4"
          >
            <div className="bg-sunk h-[34px] w-[34px] rounded" />
            <div className="bg-sunk h-3 w-3/4 rounded" />
            <div className="bg-sunk h-2.5 w-1/3 rounded" />
          </div>
        ))}
      </div>
    </Screen>
  );
}
