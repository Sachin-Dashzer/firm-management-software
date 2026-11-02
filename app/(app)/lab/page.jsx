import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { SAMPLES } from "@/lib/datalab/samples";
import PageHead from "@/components/ui/PageHead";
import DataLab from "./DataLab";

export const metadata = { title: "Data lab · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Any spreadsheet in, the figures and a checklist out (P3-20).
 *
 * Two decisions the screen states in its own second line: it **recognises
 * but does not decide**, so a person confirms which column is which before
 * a single check runs; and **nothing is kept**, so the firm does not grow
 * a second store of its clients' transactions for the sake of a
 * convenience tool.
 */
export default async function LabPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) redirect("/issues");

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 p-4 md:p-6">
      <PageHead
        title="Data lab"
        sub="Drop in any sheet a client has exported. It recognises what it is, adds it up, suggests the analysis to do and runs the part it can. The file itself is not kept — what can be saved is the summary, onto the job it belongs to."
      />

      <DataLab
        samples={SAMPLES.map(({ key, label, what }) => ({ key, label, what }))}
      />
    </div>
  );
}
