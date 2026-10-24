import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Dsc from "@/models/Dsc";
import Client from "@/models/Client";
import { formatISTDate, istInputDate } from "@/lib/dates";
import { dscState, DSC_HOLDER_LABELS } from "@/lib/practice/dsc";
import DscRegister from "./DscRegister";

export const metadata = { title: "DSC register · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Whose digital signature certificate expires when (P2-7).
 *
 * The firm does not hold clients' tokens (owner decision, 19-10-2026), so
 * this is a register of dates: the thing it prevents is a filing stopped on
 * the last day because a director's certificate lapsed and nobody looked.
 *
 * Sorted by what expires first, which is the only order anybody wants.
 */
export default async function DscPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "dsc")) redirect("/today");

  const params = (await searchParams) ?? {};
  const soonOnly = params.soon === "1";
  // one client at a time, which is how the case file links in
  const onlyClient = String(params.client ?? "");
  const mayEdit = can(actor, "edit", "dsc");

  await connectDB();

  const scope = branchFilter(actor, "dsc") ?? {};
  const rows = await Dsc.find({
    ...scope,
    ...(onlyClient ? { clientId: onlyClient } : {}),
  })
    .sort({ validTill: 1 })
    .limit(500)
    .lean();

  const clients = await Client.find({
    _id: { $in: rows.map((row) => row.clientId) },
  })
    .select("legalName tradeName code")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  const now = new Date();
  const all = rows.map((row) => {
    const state = dscState(row.validTill, now);
    return {
      id: String(row._id),
      clientId: String(row.clientId),
      client: clientName.get(String(row.clientId)) ?? "A client",
      holderName: row.holderName,
      holderRole: row.holderRole ?? "",
      certClass: row.certClass ?? "",
      issuer: row.issuer ?? "",
      serial: row.serial ?? "",
      validFrom: row.validFrom ? formatISTDate(row.validFrom) : "",
      validFromInput: toInput(row.validFrom),
      validTill: formatISTDate(row.validTill),
      validTillInput: toInput(row.validTill),
      heldBy: row.heldBy ?? "client",
      heldByLabel: DSC_HOLDER_LABELS[row.heldBy] ?? "",
      note: row.note ?? "",
      state: state.state,
      stateLabel: state.label,
    };
  });

  const shown = soonOnly
    ? all.filter((row) => ["expired", "today", "soon"].includes(row.state))
    : all;

  /** Clients to offer when adding one: the ones this person may reach. */
  const choices = mayEdit
    ? await Client.find({
        ...(branchFilter(actor, "clients") ?? {}),
        status: { $ne: "Closed" },
      })
        .select("legalName tradeName code")
        .sort({ legalName: 1 })
        .limit(1000)
        .lean()
    : [];

  return (
    <DscRegister
      rows={shown}
      total={all.length}
      expiring={
        all.filter((row) => ["today", "soon"].includes(row.state)).length
      }
      expired={all.filter((row) => row.state === "expired").length}
      soonOnly={soonOnly}
      onlyClient={onlyClient}
      mayEdit={mayEdit}
      clients={choices.map((c) => ({
        id: String(c._id),
        name: `${c.tradeName || c.legalName} · ${c.code}`,
      }))}
    />
  );
}

function toInput(date) {
  return istInputDate(date);
}
