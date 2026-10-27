import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import {
  CERTIFICATE_TYPES,
  ASSURANCE_LEVELS,
  ASSURANCE_NOTES,
} from "@/lib/practice/certificates";
import NewCertificate from "./NewCertificate";

export const metadata = { title: "Start a certificate · PHMG" };
export const dynamic = "force-dynamic";

export default async function NewCertificatePage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "edit", "udin")) redirect("/practice/certificates");

  const params = (await searchParams) ?? {};

  await connectDB();
  const clients = await Client.find({
    ...(branchFilter(actor, "clients") ?? {}),
    status: { $ne: "Closed" },
  })
    .select("legalName tradeName code")
    .sort({ legalName: 1 })
    .limit(1000)
    .lean();

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link
          href="/practice/certificates"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Certificates
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Start a certificate
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          The kind decides what evidence the file has to hold, and the level of
          assurance decides how the conclusion is worded. Both can be changed
          while it is a draft.
        </p>
      </div>

      <NewCertificate
        clients={clients.map((row) => ({
          id: String(row._id),
          name: `${row.tradeName || row.legalName} · ${row.code}`,
        }))}
        client={typeof params.client === "string" ? params.client : ""}
        types={CERTIFICATE_TYPES.map((type) => ({
          key: type.key,
          name: type.name,
          use: type.use,
          evidence: type.evidence.length,
        }))}
        levels={ASSURANCE_LEVELS.map((level) => ({
          level,
          note: ASSURANCE_NOTES[level],
        }))}
      />
    </div>
  );
}
