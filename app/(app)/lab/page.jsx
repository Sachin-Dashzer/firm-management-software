import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import DataLab from "./DataLab";

export const metadata = { title: "Data lab · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Any spreadsheet in, a summary and a checklist out (P3-20).
 *
 * The two sentences on the screen are the two decisions: it **profiles
 * rather than interprets**, so a person says which column is which before
 * a single check runs; and **nothing is kept**, so the firm does not grow
 * a second store of its clients' transactions for the sake of a
 * convenience tool.
 */
export default async function LabPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) redirect("/issues");

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Data lab
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          A sales register, a bank statement, a trial balance — anything a
          client has exported. It reads the file, you say which column is which,
          and it lists what is worth looking at. The file itself is{" "}
          <strong>not kept</strong> — what can be saved is the summary, onto the
          job it belongs to.
        </p>
      </div>

      <DataLab />
    </div>
  );
}
