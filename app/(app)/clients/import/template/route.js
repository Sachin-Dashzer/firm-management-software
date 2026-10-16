import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { toCSV } from "@/lib/csv";
import { importTemplateRows } from "@/lib/clients/import";

/** The blank import sheet, with one realistic example row to copy. */
export async function GET() {
  const actor = await requireUser();
  if (!can(actor, "edit", "clients")) {
    return new Response("Not allowed", { status: 403 });
  }

  return new Response(toCSV(importTemplateRows()), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="phmg-client-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
