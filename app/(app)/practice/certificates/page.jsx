import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Certificate from "@/models/Certificate";
import Client from "@/models/Client";
import RuleConfirmation from "@/models/RuleConfirmation";
import { formatISTDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import {
  CERTIFICATE_TYPES,
  CONFIRM_KIND,
  checkCertificate,
} from "@/lib/practice/certificates";
import CertificateList from "./CertificateList";

export const metadata = { title: "Certificates · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Every certificate the firm has issued, and every one it is drafting
 * (P3-15).
 *
 * The register and the work are the same screen on purpose. A certificate
 * is a thing the firm signed: somebody will ask about it years later, and
 * the question they ask is "what did we certify for this client" — which is
 * a list, not a document on an engagement.
 */
export default async function CertificatesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "udin")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const show = params.show === "signed" ? "signed" : "drafts";

  await connectDB();
  const scope = branchFilter(actor, "udin") ?? {};

  const [rows, confirmations] = await Promise.all([
    Certificate.find({
      ...scope,
      ...(show === "signed" ? { signedAt: { $ne: null } } : { signedAt: null }),
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    RuleConfirmation.find({ kind: CONFIRM_KIND, confirmedAt: { $ne: null } })
      .select("key")
      .lean(),
  ]);

  const clients = await Client.find({
    _id: { $in: rows.map((row) => row.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((row) => [String(row._id), row.tradeName || row.legalName]),
  );

  const confirmed = new Set(confirmations.map((row) => row.key));

  const view = rows.map((row) => ({
    id: String(row._id),
    number: row.number,
    client: clientName.get(String(row.clientId)) ?? "Client",
    clientId: String(row.clientId),
    typeName: row.typeName || row.type,
    level: row.level,
    addressee: row.addressee,
    asOn: row.asOn ? formatISTDate(row.asOn) : "",
    figure: row.figurePaise ? formatPaise(row.figurePaise) : "",
    signedOn: row.signedAt ? formatISTDate(row.signedAt) : "",
    signer: row.signerName ?? "",
    membershipNo: row.signerMembershipNo ?? "",
    udin: row.udin ?? "",
    /** How much is still unfinished, so a draft says it without being opened. */
    problems: row.signedAt ? 0 : checkCertificate(row).length,
    wordingConfirmed: confirmed.has(row.type),
  }));

  const unconfirmed = CERTIFICATE_TYPES.filter(
    (type) => !confirmed.has(type.key),
  );

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Certificates
          </h1>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Net worth, turnover, drawing power, grant utilisation and capital
            contribution, in the structure the ICAI Guidance Note gives them.
            The level of assurance decides the wording, and a signed one is not
            edited.
          </p>
        </div>
        {can(actor, "edit", "udin") && (
          <Link
            href="/practice/certificates/new"
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 leading-9 font-medium"
          >
            Start a draft
          </Link>
        )}
      </div>

      {unconfirmed.length > 0 && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          <strong>
            {unconfirmed.length} of {CERTIFICATE_TYPES.length}
          </strong>{" "}
          kinds of certificate carry wording no partner has confirmed:{" "}
          {unconfirmed.map((type) => type.name.toLowerCase()).join(", ")}. The
          paragraphs are a first draft taken from the design prototype, and on a
          certificate the wording <em>is</em> the document — so one of these
          cannot be signed until a partner has read it. Open a draft to confirm.
        </p>
      )}

      <CertificateList rows={view} show={show} />
    </div>
  );
}
