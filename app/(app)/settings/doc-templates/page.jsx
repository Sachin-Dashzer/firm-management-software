import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import DocTemplate, { DOC_KINDS } from "@/models/DocTemplate";
import { FIELDS, FIELD_KEYS, placeholdersIn } from "@/lib/docs/resolve";
import { formatISTDate } from "@/lib/dates";
import TemplateAdmin from "./TemplateAdmin";

export const metadata = { title: "Document templates · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The firm's letters, and whether anybody has approved them (P2-8b).
 *
 * The screen's one job beyond editing is to make the unapproved ones
 * impossible to miss: a template nobody has read produces watermarked
 * drafts and nothing else, and the eight that ship with the system are all
 * unapproved on purpose.
 */
export default async function DocTemplatesPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "docTemplates")) redirect("/settings");

  await connectDB();
  const templates = await DocTemplate.find({})
    .sort({ kind: 1, name: 1 })
    .lean();

  const rows = templates.map((t) => ({
    id: String(t._id),
    code: t.code,
    name: t.name,
    kind: t.kind,
    description: t.description ?? "",
    title: t.title ?? "",
    body: t.body ?? "",
    version: t.version ?? 1,
    partnerOnly: Boolean(t.partnerOnly),
    udinRequired: Boolean(t.udinRequired),
    active: t.active !== false,
    verified: Boolean(t.verifiedAt),
    verifiedOn: t.verifiedAt ? formatISTDate(t.verifiedAt) : "",
    verifiedByName: t.verifiedByName ?? "",
    sourceNote: t.sourceNote ?? "",
    uses: placeholdersIn(t.body ?? "").known,
  }));

  return (
    <TemplateAdmin
      rows={rows}
      kinds={DOC_KINDS}
      fields={FIELD_KEYS.map((key) => ({ key, label: FIELDS[key].label }))}
      mayEdit={can(actor, "edit", "docTemplates")}
      mayApprove={actor.role === "partner"}
    />
  );
}
