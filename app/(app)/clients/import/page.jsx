import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Branch from "@/models/Branch";
import { ENTITY_TYPES } from "@/lib/validators";
import ImportWizard from "./ImportWizard";

export const metadata = { title: "Import clients · PHMG" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "clients")) redirect("/clients");

  await connectDB();
  const branches = await Branch.find(
    actor.role === "partner" ? {} : { _id: { $in: actor.branchIds } },
  )
    .select("code name")
    .sort({ code: 1 })
    .lean();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-28 font-semibold">Import clients</h1>
        <p className="text-13 text-ink-muted">
          Bring your existing client list in from a spreadsheet. Nothing is
          saved until you have seen what will happen.
        </p>
      </div>

      <section className="rounded-ledger border-rule bg-surface border p-4">
        <h2 className="font-display text-20">How to do it</h2>
        <ol className="text-14 mt-2 flex list-decimal flex-col gap-1 pl-5">
          <li>
            Download the{" "}
            <a
              href="/clients/import/template"
              className="text-carbon hover:underline"
            >
              template file
            </a>{" "}
            — it has the right column headings and one example row.
          </li>
          <li>
            Fill it in, in Excel. Delete the example row. Columns may be in any
            order and you can leave out any column you do not have.
          </li>
          <li>
            Save it as <strong>CSV UTF-8</strong> (File → Save As → “CSV UTF-8
            (Comma delimited)”). This keeps Indian names and the ₹ symbol
            intact.
          </li>
          <li>Upload it below and check the preview before importing.</li>
        </ol>
        <p className="text-13 text-ink-muted mt-3">
          <strong>Branch code</strong> must be one of{" "}
          <span className="font-mono">
            {branches.map((b) => b.code).join(", ") || "—"}
          </span>
          . <strong>Entity type</strong> must be one of{" "}
          {ENTITY_TYPES.join(", ")}.
        </p>
      </section>

      <ImportWizard />
    </div>
  );
}
