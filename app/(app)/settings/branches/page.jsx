import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Branch from "@/models/Branch";
import Counter from "@/models/Counter";
import { stateName } from "@/lib/billing/gst";
import { seriesFor } from "@/lib/billing/number";
import Branches from "./Branches";

export const metadata = { title: "Branches · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The firm's offices and their GST registrations (spec sections 7 and 13).
 *
 * This screen exists because an invoice cannot be issued without the
 * GSTIN of the branch raising it: the first two digits decide whether the
 * invoice carries CGST and SGST or IGST, and nothing can guess that.
 */
export default async function BranchesPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/today");

  await connectDB();
  const branches = await Branch.find({}).sort({ code: 1 }).lean();

  // the current number in each branch's series, so a partner can see the
  // series is running and where it has reached
  const series = await Counter.find({
    _id: { $in: branches.map((b) => seriesFor(b.invoicePrefix || b.code)) },
  }).lean();
  const seqOf = new Map(series.map((s) => [s._id, s.seq]));

  return (
    <Branches
      rows={branches.map((b) => {
        const name = seriesFor(b.invoicePrefix || b.code);
        return {
          id: String(b._id),
          code: b.code,
          name: b.name,
          address: b.address ?? "",
          gstin: b.gstin ?? "",
          stateName: b.gstin ? stateName(String(b.gstin).slice(0, 2)) : "",
          invoicePrefix: b.invoicePrefix,
          series: name,
          issued: seqOf.get(name) ?? 0,
        };
      })}
    />
  );
}
