import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { scopedByClient } from "@/lib/access/clientAccess";
import { connectDB } from "@/lib/db";
import DocumentModel from "@/models/Document";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import ServiceTemplate from "@/models/ServiceTemplate";
import { formatISTDate, daysUntil } from "@/lib/dates";
import { pendingFromClients } from "./requests";
import DocumentSearch from "./DocumentSearch";

export const metadata = { title: "Documents · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Finding a document, and seeing what the firm is still waiting for
 * (spec section 6).
 *
 * ponytail: the search is a case-insensitive regex over the document name
 * plus a lookup of matching clients. Atlas Search (spec section 14) is worth
 * it at a volume the firm does not have yet; this uses the indexes already
 * there and is revisited in Step 10 with the rest of the reporting.
 */
export default async function DocumentsPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "documents")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const tab = params.tab === "pending" ? "pending" : "search";
  const search = String(params.q ?? "").trim();

  await connectDB();
  /**
   * The firm-wide file search was scoped by branch alone, which for an
   * employee or an intern meant every document name in their office — the
   * client list they are not allowed to see, spelled out in file names.
   * Scoped by client now, through the same filter as `/clients`.
   */
  const scope = await scopedByClient(actor, "clientId");

  if (tab === "pending") {
    const rows = await pendingFromClients(actor, scope);
    return (
      <Shell tab={tab} search={search}>
        <p className="text-13 text-ink-muted">
          {rows.length} {rows.length === 1 ? "job is" : "jobs are"} waiting on
          documents from a client.
        </p>
        <div className="rounded-table border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Work</th>
                <th className="px-3 py-2 font-medium">Waiting for</th>
                <th className="px-3 py-2 font-medium">Internal due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-rule border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/engagements/${r.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {r.client}
                    </Link>
                    <br />
                    <span className="text-13 text-ink-muted font-mono">
                      {r.code}
                    </span>
                  </td>
                  <td className="text-13 px-3 py-2">
                    {r.service} · {r.period}
                  </td>
                  <td className="text-13 px-3 py-2">
                    {r.waitingFor.join(", ")}
                  </td>
                  <td className="num text-13 px-3 py-2">
                    {r.internalDue ? (
                      <>
                        {formatISTDate(r.internalDue)}
                        {daysUntil(r.internalDue) < 0 && (
                          <span className="text-redpen"> · overdue</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="text-ink-muted px-3 py-6 text-center"
                  >
                    Nothing is outstanding from any client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Shell>
    );
  }

  /** @type {Record<string, any>} */
  const query = { ...(scope ?? {}) };
  if (params.fy) query.fy = params.fy;
  if (params.service) {
    const forService = await Engagement.find({
      serviceTemplateId: params.service,
    })
      .select("_id")
      .limit(2000)
      .lean();
    query.engagementId = { $in: forService.map((e) => e._id) };
  }
  if (params.permanent) query.isPermanent = true;

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const loose = new RegExp(escaped, "i");
    const clients = await Client.find({
      $or: [{ legalName: loose }, { tradeName: loose }, { code: loose }],
    })
      .select("_id")
      .limit(500)
      .lean();
    query.$or = [
      { name: loose },
      { clientId: { $in: clients.map((c) => c._id) } },
    ];
  }

  const documents = await DocumentModel.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const [clients, engagements, templates, years] = await Promise.all([
    Client.find({ _id: { $in: documents.map((d) => d.clientId) } })
      .select("legalName tradeName")
      .lean(),
    Engagement.find({
      _id: { $in: documents.map((d) => d.engagementId).filter(Boolean) },
    })
      .select("code templateSnapshot periodLabel period")
      .lean(),
    ServiceTemplate.find({}).select("name").sort({ name: 1 }).lean(),
    DocumentModel.distinct("fy", scope ?? {}),
  ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const engagementOf = new Map(engagements.map((e) => [String(e._id), e]));

  return (
    <Shell tab={tab} search={search}>
      <DocumentSearch
        rows={documents.map((d) => {
          const engagement = engagementOf.get(String(d.engagementId));
          return {
            id: String(d._id),
            name: d.name,
            size: d.size,
            mime: d.mime,
            versions: (d.versions ?? []).length,
            uploadedByName: d.uploadedByName,
            client: clientName.get(String(d.clientId)) ?? "Client",
            clientId: String(d.clientId),
            fy: d.fy || "—",
            isPermanent: Boolean(d.isPermanent),
            where: engagement
              ? `${engagement.templateSnapshot?.name ?? ""} · ${engagement.periodLabel || engagement.period}`
              : d.isPermanent
                ? "Permanent file"
                : "—",
            engagementId: engagement ? String(engagement._id) : null,
            added: formatISTDate(d.createdAt),
          };
        })}
        filters={{
          fy: params.fy ?? "",
          service: params.service ?? "",
          permanent: Boolean(params.permanent),
        }}
        years={years.filter(Boolean).sort().reverse()}
        services={templates.map((t) => ({ id: String(t._id), name: t.name }))}
      />
    </Shell>
  );
}

function Shell({ tab, search, children }) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Documents
        </h1>
        <p className="text-13 text-ink-muted">
          Every file the firm holds, and everything still to come in.
        </p>
      </div>

      <div className="flex gap-2">
        {[
          ["search", "Search"],
          ["pending", "Pending from clients"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={
              key === "search"
                ? `/documents${search ? `?q=${encodeURIComponent(search)}` : ""}`
                : "/documents?tab=pending"
            }
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-control text-14 h-9 border px-3 leading-9 ${
              tab === key
                ? "border-carbon bg-carbon-wash text-carbon"
                : "border-rule hover:bg-carbon-wash"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
