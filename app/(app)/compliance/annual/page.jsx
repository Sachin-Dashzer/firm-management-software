import ComplianceScreen from "../screen";

export const metadata = { title: "Annual · Compliance · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Every client, every year (P3-34 phase 4 opens the route; phase 6 draws
 * the grid the reference asks for).
 *
 * Today this is the existing status grid with the recurrence fixed, which
 * is a working page rather than a placeholder — the route exists so the
 * rail and the `/calendar` redirect have somewhere real to land.
 */
export default async function AnnualPage({ searchParams }) {
  return (
    <ComplianceScreen
      params={(await searchParams) ?? {}}
      force={{ freq: "annual", view: "grid" }}
    />
  );
}
