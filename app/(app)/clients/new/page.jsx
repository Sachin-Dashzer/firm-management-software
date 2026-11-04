import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Branch from "@/models/Branch";
import User from "@/models/User";
import ClientGroup from "@/models/ClientGroup";
import ServiceTemplate from "@/models/ServiceTemplate";
import DocTemplate from "@/models/DocTemplate";
import FormDraft from "@/models/FormDraft";
import Initiative from "@/models/Initiative";
import { draftAge } from "@/lib/forms/draft";
import Onboarding from "./Onboarding";

export const metadata = { title: "New client · PHMG" };
export const dynamic = "force-dynamic";

/**
 * `?from=<id>` is somebody pressing Convert on the initiative register
 * (04-11-2026). The four fields a conversation has are carried in; the
 * wizard asks for everything else exactly as it always did, and marks the
 * register row converted on its way out.
 */
export default async function NewClientPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "edit", "clients")) redirect("/clients");

  const params = (await searchParams) ?? {};
  /* a 24-character hex id, or nothing: an id from a URL goes nowhere near
     findById without this, where a bad one is a CastError and a 500 */
  const from = /^[a-f\d]{24}$/i.test(String(params.from ?? ""))
    ? String(params.from)
    : "";

  await connectDB();
  const [branches, partners, groups, services, packTemplates, draft] =
    await Promise.all([
      Branch.find(
        actor.role === "partner" ? {} : { _id: { $in: actor.branchIds } },
      )
        .select("code name")
        .sort({ code: 1 })
        .lean(),
      User.find({ role: { $in: ["partner", "ca"] }, active: true })
        .select("name")
        .sort({ name: 1 })
        .lean(),
      ClientGroup.find({}).select("name").sort({ name: 1 }).lean(),
      /** The firm's own catalog, in the order the services screen shows it. */
      ServiceTemplate.find({ active: true })
        .select("code name recurrence defaultFeePaise category")
        .sort({ category: 1, name: 1 })
        .lean(),
      /**
       * Only the letters that actually have wording behind them — with
       * their names, because step 6 now lets somebody add one to a
       * client's pack and a code is not something to choose from a list.
       */
      DocTemplate.find({ active: true })
        .select("code name kind")
        .sort({ kind: 1, name: 1 })
        .lean(),
      /** Their own unfinished one, if the phone rang last time (P3-18b). */
      FormDraft.findOne({ userId: actor.id, kind: "client" }).lean(),
    ]);

  /**
   * The register row, if this is a conversion and this person may read it.
   * Anything else — a stale link, somebody else's branch, a row already
   * onboarded — is simply not carried over: the wizard still works, and
   * nothing about a lead is worth a refused page.
   */
  let lead = null;
  if (from) {
    const row = await Initiative.findById(from)
      .select("name mobile email remarks status branchId createdBy")
      .lean();
    const mayRead =
      row &&
      row.status !== "Converted" &&
      can(actor, "view", "initiatives", {
        branchId: String(row.branchId ?? ""),
        userId: String(row.createdBy ?? ""),
      });

    if (mayRead) {
      lead = {
        id: String(row._id),
        name: row.name,
        remarks: row.remarks ?? "",
        values: {
          /* the register keeps one name; which of the two it belongs in is
             the first thing the person onboarding will fix, and the banner
             above the form says so */
          legalName: row.name,
          "contacts.0.name": row.name,
          ...(row.email ? { "contacts.0.email": row.email } : {}),
          ...(row.mobile ? { "contacts.0.mobile": row.mobile } : {}),
        },
      };
    }
  }

  return (
    <Onboarding
      lead={lead}
      branches={branches.map((b) => ({
        id: String(b._id),
        code: b.code,
        name: b.name,
      }))}
      partners={partners.map((p) => ({ id: String(p._id), name: p.name }))}
      groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
      services={services.map((s) => ({
        code: s.code,
        name: s.name,
        recurrence: s.recurrence,
        defaultFeePaise: s.defaultFeePaise ?? 0,
        category: s.category ?? "",
      }))}
      packTemplates={packTemplates.map((t) => ({
        code: t.code,
        label: t.name,
        kind: t.kind,
      }))}
      draft={
        /* a conversion fills the form in already, so an unfinished client
           from last week must not offer to overwrite it */
        draft && !lead
          ? {
              payload: draft.payload ?? {},
              dropped: draft.dropped ?? [],
              age: draftAge(draft.updatedAt),
            }
          : null
      }
    />
  );
}
