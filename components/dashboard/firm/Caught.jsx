import Link from "next/link";

/**
 * What the system noticed that nobody asked it to look for (P3-34 phase 3).
 *
 * The one panel on this screen that is tinted rather than white, because it
 * is the one that is not a figure the firm already tracks. Four cards at
 * most, each from a detector that exists, each linking to the rows behind
 * it.
 *
 * **Nothing here is written to fill a space.** The reference shows an
 * MSME-creditor finding; that check only runs inside the trial-balance
 * screen and cannot answer a firm-wide question, so there is no card for
 * it and no sentence invented in its place. A panel of plausible findings
 * would be the only part of this dashboard a partner has no way to check.
 */
export default function Caught({ cards }) {
  if (!cards) return null;

  return (
    <section className="rounded-ledger border-carbon/30 bg-carbon-wash flex flex-col gap-3 border p-4">
      <h2 className="font-display text-15 font-semibold">
        What the system caught this week
      </h2>

      {cards.length === 0 ? (
        <p className="text-13 text-ink-muted">Nothing unusual this week.</p>
      ) : (
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.key}>
              <Link href={card.href} className="group block">
                <span className="text-carbon text-14 block font-semibold group-hover:underline">
                  {card.title}
                </span>
                <span className="text-13 text-ink-muted block">
                  {card.what}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
