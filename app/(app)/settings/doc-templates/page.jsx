import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import DocTemplate, { DOC_KINDS } from "@/models/DocTemplate";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import { FIELDS, FIELD_KEYS, placeholdersIn } from "@/lib/docs/resolve";
import { buildDocument } from "@/lib/docs/build";
import { clientListFilter } from "@/lib/access/clientAccess";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { formatISTDate } from "@/lib/dates";
import Segmented from "@/components/ui/Segmented";
import SettingsScreen from "../Shell";
import TemplateUse from "./TemplateUse";
import TemplateAdmin from "./TemplateAdmin";

export const metadata = { title: "Templates · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Templates (the owner's screen of 02-11-2026).
 *
 * Two tabs, because the screen is opened for two different reasons and the
 * old one only served the second:
 *
 *  - **Use one.** Pick the letter, pick the client, read the draft filled
 *    from their record with every blank marked, and start it on a job.
 *    This is what somebody wants at four o'clock with a client on the
 *    telephone, and before today it did not exist — the only way to see a
 *    letter filled in was to go to a job and generate one.
 *  - **Wording and approval.** The editor, unchanged. It stays because an
 *    unapproved template produces watermarked drafts and nothing else, so
 *    the firm must be able to read the words and approve them.
 *
 * The draft is built by `buildDocument`, the same function the PDF route
 * and the issue action call, so the letter on this screen and the letter
 * that gets signed cannot differ.
 */
export default async function DocTemplatesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "docTemplates")) redirect("/settings");

  const params = (await searchParams) ?? {};
  const tab = params.tab === "wording" ? "wording" : "use";

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

  if (tab === "wording") {
    return (
      <SettingsScreen
        wide
        title="Templates"
        sub={`${rows.length} letters, certificates and messages. ${
          rows.filter((row) => row.verified).length
        } approved; the rest make watermarked drafts until a partner reads the wording.`}
      >
        <Tabs tab={tab} />
        <TemplateAdmin
          rows={rows}
          kinds={DOC_KINDS}
          fields={FIELD_KEYS.map((key) => ({ key, label: FIELDS[key].label }))}
          mayEdit={can(actor, "edit", "docTemplates")}
          mayApprove={actor.role === "partner"}
        />
      </SettingsScreen>
    );
  }

  const usable = rows.filter((row) => row.active);
  const selected =
    usable.find((row) => row.code === params.code) ?? usable[0] ?? null;

  /** The clients this person may see, for the one dropdown. */
  const clients = await Client.find(await clientListFilter(actor))
    .select("legalName tradeName")
    .sort({ legalName: 1 })
    .limit(2000)
    .lean();

  const clientId = clients.some((row) => String(row._id) === params.client)
    ? params.client
    : "";

  /**
   * A letter is nearly always about a job, and the job is where the
   * service, the period and the fee come from — so the open ones are
   * offered the moment a client is picked.
   */
  const engagements = clientId
    ? await Engagement.find({
        clientId,
        status: { $nin: CLOSED_STATUSES },
      })
        .select("code periodLabel period templateSnapshot.name")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
    : [];

  const engagementId = engagements.some(
    (row) => String(row._id) === params.engagement,
  )
    ? params.engagement
    : "";

  let preview = null;
  if (selected && clientId) {
    const engagement = engagementId
      ? await Engagement.findById(engagementId)
          .select(
            "code clientId branchId assigneeId reviewerId periodLabel period feePaise udin filedOn templateSnapshot",
          )
          .lean()
      : null;
    const built = await buildDocument({
      template: selected,
      engagement: engagement ?? undefined,
      clientId,
      actor,
    });
    preview = {
      title: built.title,
      text: built.text,
      gaps: built.gaps.map((gap) => gap.label),
      unknown: built.unknown,
    };
  }

  return (
    <SettingsScreen
      wide
      title="Templates"
      sub={`${usable.length} drafts across onboarding, audit, notices, ROC, certificates and client messages — filled from the client's own record.`}
    >
      <Tabs tab={tab} />
      <TemplateUse
        templates={usable}
        kinds={DOC_KINDS}
        selected={selected}
        clients={clients.map((row) => ({
          id: String(row._id),
          name: row.tradeName || row.legalName,
        }))}
        clientId={clientId}
        engagements={engagements.map((row) => ({
          id: String(row._id),
          label: `${row.templateSnapshot?.name ?? "Work"} · ${
            row.periodLabel || row.period || ""
          } · ${row.code}`,
        }))}
        engagementId={engagementId}
        preview={preview}
        mayStart={can(actor, "edit", "documents")}
        isPartner={actor.role === "partner"}
      />
    </SettingsScreen>
  );
}

/** The two reasons this screen is opened. */
function Tabs({ tab }) {
  return (
    <Segmented
      label="What to do with the templates"
      variant="underline"
      value={tab}
      items={[
        { key: "use", label: "Use one", href: "/settings/doc-templates" },
        {
          key: "wording",
          label: "Wording and approval",
          href: "/settings/doc-templates?tab=wording",
        },
      ]}
    />
  );
}
