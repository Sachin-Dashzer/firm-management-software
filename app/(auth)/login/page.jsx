import { Suspense } from "react";
import LoginForm from "./LoginForm";
import BranchScene from "@/components/login/BranchScene";
import { firmProfile } from "@/lib/firm/settings";
import { financialYearLabel, formatISTDate } from "@/lib/dates";

export const metadata = { title: "Sign in · PHMG" };

/**
 * The sign-in screen.
 *
 * It is the one screen in the product that is not worked in, so it is the
 * one screen that gets a display face and a field of colour. Everything
 * behind it is an instrument; this is the nameplate on the door.
 *
 * **The composition** is a plate and a sheet. The left plate is deep ink
 * and carries the firm as a letterhead carries it: its name set in
 * Fraunces, then its particulars as a ledger block in the mono face — the
 * registration number, the constitution, the head office, the financial
 * year that every date in the system is reckoned against. The right half
 * is white, and holds nothing but the form.
 *
 * **Every word on the plate is read from the firm's own record**
 * (`firmProfile()`), never written here. A particular the firm has not
 * entered yet is left out rather than printed as a blank or a dash: a
 * nameplate with a gap in it is worse than a shorter nameplate. The two
 * lines that are always true — the financial year and today's date in IST
 * — are computed, so the plate holds its shape on the day the firm first
 * opens the application with nothing in Settings.
 *
 * **The form is first in the document**, so it is what a keyboard and a
 * screen reader reach first; the plate follows it in source and is placed
 * back on the left with `order`. The firm's name is the page's one `h1`
 * and the form's heading is an `h2` under it, which is the reading order
 * a person sees even though it is not the order they tab through.
 *
 * **The branch constellation of spec §15 stays parked** (D52): it is
 * inside `.moments-only`, so with the flourishes off nothing in it mounts
 * — not the canvas, not the no-WebGL fallback — and the plate's
 * particulars stand in its place. With them on it drops into the plate as
 * a band above the name, which is where it always wanted to be.
 */
export default async function LoginPage() {
  const firm = await firmProfile();
  const now = new Date();

  /* Only what the firm has actually entered. `headOffice` is deliberately
     last: it is the longest line and the least load-bearing. */
  const particulars = [
    firm.frn && ["Firm registration", firm.frn],
    firm.constitution && ["Constitution", firm.constitution],
    firm.pan && ["PAN", firm.pan],
    firm.headOffice && ["Head office", firm.headOffice],
  ].filter(Boolean);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="bg-surface order-1 flex items-center justify-center px-6 py-16 lg:order-2 lg:px-16">
        <div className="w-full max-w-sm">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </section>

      {/* The plate. On a phone it is a band above the form, not half the
          screen: a sign-in on a phone is a form, and the firm's name over
          it is enough of a nameplate. */}
      {/* The plate is one mass, like a letterhead: the name, the trade
          under it, a rule, then the particulars. Nothing is pinned to the
          bottom of it — a plate with its feet at the window's edge and a
          hole in its middle is two blocks, not a nameplate. */}
      <section className="bg-plate text-plate-ink order-2 flex flex-col justify-center px-6 py-12 lg:order-1 lg:px-16 lg:py-14">
        {/* One measure for the whole plate: the name wraps inside it and
            the rule under the particulars ends on the same edge, so the
            block reads as one mass rather than a heading with a wider
            table beneath it. */}
        <div className="w-full max-w-[27rem] lg:mr-12 lg:ml-auto">
          <div className="moments-only mb-12">
            <div className="border-plate-rule relative aspect-[16/7] w-full border">
              <BranchScene />
            </div>
          </div>

          <h1 className="font-serif text-[clamp(2.75rem,5.5vw,4.25rem)] leading-[0.95] font-normal tracking-[-0.025em] text-balance">
            {firm.name}
          </h1>
          {firm.tagline && (
            <p className="text-plate-ink/65 mt-5 text-[1.0625rem]">
              {firm.tagline}
            </p>
          )}

          {/* The ledger block: label left, value right, on one right edge,
              in the face every figure in the product is set in. */}
          <dl className="border-plate-rule mt-10 border-t pt-2 lg:mt-12">
            {particulars.map(([label, value]) => (
              <Particular key={label} label={label} value={value} />
            ))}
            <Particular
              label="Financial year"
              value={financialYearLabel(now)}
            />
            <Particular label="Today" value={formatISTDate(now)} />
          </dl>
        </div>
      </section>
    </main>
  );
}

function Particular({ label, value }) {
  return (
    <div className="border-plate-rule/60 flex items-baseline justify-between gap-6 border-b py-2.5 last:border-b-0">
      <dt className="text-plate-ink/55 text-13">{label}</dt>
      <dd className="num text-13 text-plate-ink/90 text-right">{value}</dd>
    </div>
  );
}
