import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Certificate from "@/models/Certificate";
import Client from "@/models/Client";
import RuleConfirmation from "@/models/RuleConfirmation";
import { formatISTDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import {
  CERTIFICATE_TYPES,
  ASSURANCE_LEVELS,
  ASSURANCE_NOTES,
  CONFIRM_KIND,
  checkCertificate,
  assemble,
} from "@/lib/practice/certificates";
import CertificateDraft from "./CertificateDraft";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  await connectDB();
  const row = await Certificate.findById(id).select("number").lean();
  return { title: `${row?.number ?? "Certificate"} · PHMG` };
}

/**
 * One certificate (P3-15).
 *
 * A draft while it is unsigned and a record once it is signed — the same
 * page, because the thing a reviewer wants to see is what was signed in the
 * place where it was drafted.
 */
export default async function CertificatePage({ params }) {
  const { id } = await params;
  const actor = await requireUser();
  if (!can(actor, "view", "udin")) redirect("/issues");

  await connectDB();
  const certificate = await Certificate.findById(id).lean();
  if (!certificate) notFound();

  if (!can(actor, "view", "udin", { branchId: String(certificate.branchId) })) {
    redirect(`/no-access?client=${certificate.clientId}`);
  }

  const [client, confirmation] = await Promise.all([
    Client.findById(certificate.clientId)
      .select("legalName tradeName code")
      .lean(),
    RuleConfirmation.findOne({
      kind: CONFIRM_KIND,
      key: certificate.type,
      confirmedAt: { $ne: null },
    }).lean(),
  ]);

  const type = CERTIFICATE_TYPES.find((row) => row.key === certificate.type);
  const signed = Boolean(certificate.signedAt);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link
          href="/practice/certificates"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Certificates
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          {certificate.typeName || certificate.type}
        </h1>
        <p className="text-13 text-ink-muted">
          <span className="font-mono">{certificate.number}</span> ·{" "}
          <Link
            href={`/clients/${certificate.clientId}`}
            className="underline underline-offset-4"
          >
            {client?.tradeName || client?.legalName || "Client"}
          </Link>
          {certificate.asOn
            ? ` · as at ${formatISTDate(certificate.asOn)}`
            : ""}
        </p>
      </div>

      <CertificateDraft
        id={String(certificate._id)}
        signed={signed}
        certificate={{
          number: certificate.number,
          typeName: certificate.typeName || certificate.type,
          typeKey: certificate.type,
          use: type?.use ?? "",
          level: certificate.level,
          addressee: certificate.addressee,
          purpose: certificate.purpose,
          takesFigure: Boolean(type?.figure),
          figure: certificate.figurePaise
            ? formatPaise(certificate.figurePaise)
            : "",
          figureRupees:
            certificate.figurePaise != null
              ? String(certificate.figurePaise / 100)
              : "",
          figureBasis: certificate.figureBasis ?? "",
          signedOn: signed ? formatISTDate(certificate.signedAt) : "",
          signer: certificate.signerName ?? "",
          membershipNo: certificate.signerMembershipNo ?? "",
          udin: certificate.udin ?? "",
          paragraphs: (certificate.paragraphs ?? []).map((row) => ({
            id: String(row._id),
            key: row.key,
            title: row.title,
            locked: Boolean(row.locked),
            required: Boolean(row.required),
            text: row.text ?? "",
            help: row.help ?? "",
          })),
          evidence: (certificate.evidence ?? []).map((row) => ({
            id: String(row._id),
            what: row.what,
            held: Boolean(row.held),
            notApplicable: Boolean(row.notApplicable),
            note: row.note ?? "",
          })),
        }}
        levels={ASSURANCE_LEVELS.map((level) => ({
          level,
          note: ASSURANCE_NOTES[level],
        }))}
        problems={signed ? [] : checkCertificate(certificate)}
        document={assemble(certificate)}
        wording={
          confirmation
            ? {
                confirmed: true,
                by: confirmation.confirmedByName,
                on: formatISTDate(confirmation.confirmedAt),
                note: confirmation.note ?? "",
              }
            : { confirmed: false }
        }
        mayEdit={
          can(actor, "edit", "udin", {
            branchId: String(certificate.branchId),
          }) && !signed
        }
        maySign={can(actor, "edit", "udin", {
          branchId: String(certificate.branchId),
        })}
        isPartner={can(actor, "approve", "feeWriteOff")}
      />
    </div>
  );
}
