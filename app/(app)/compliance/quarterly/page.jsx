import ComplianceScreen from "../screen";

export const metadata = { title: "Quarterly · Compliance · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Every client, every quarter (P3-34 phase 4 opens the route; phase 5 draws
 * the grid the reference asks for).
 *
 * Today this is the existing status grid with the recurrence fixed, which
 * is a working page rather than a placeholder — the route exists so the
 * rail and the `/calendar` redirect have somewhere real to land.
 */
export default async function QuarterlyPage({ searchParams }) {
  return (
    <ComplianceScreen
      params={(await searchParams) ?? {}}
      force={{ freq: "quarterly", view: "grid" }}
    />
  );
}
