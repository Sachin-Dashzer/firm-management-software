"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { toPaise } from "@/lib/money";
import ServiceTemplate from "@/models/ServiceTemplate";
import ClientService from "@/models/ClientService";
import Client from "@/models/Client";
import User from "@/models/User";
import { checkAssignment } from "@/lib/engagements/assign";
import {
  SERVICE_CATEGORIES,
  SERVICE_LEVELS,
  RECURRENCES,
  EXEC_ROLES,
  REVIEW_ROLES,
  bumpsVersion,
} from "@/lib/services/catalog";

/**
 * The service catalog, Partner only to edit (spec section 2: everyone else
 * views it). Every action re-checks the permission, because a server action
 * is reachable over HTTP whether or not a button for it was rendered, and
 * every write goes through `audited()` so the change and its log share one
 * transaction.
 */

const checklistItem = z.object({
  name: z.string().trim().min(1, "A checklist item cannot be blank"),
  side: z.enum(["client", "firm"]),
  mandatory: z.boolean().default(true),
});

const serviceInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Name is too short"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,16}$/, "Code: 2-16 letters, digits or hyphens"),
  category: z.enum(SERVICE_CATEGORIES),
  level: z.enum(SERVICE_LEVELS),
  minExecRole: z.enum(EXEC_ROLES),
  // only a CA or a Partner can sign work off (spec section 5)
  minReviewRole: z.enum(REVIEW_ROLES),
  // blank means "a statutory date or an agreement decides it", not zero days
  turnaroundDays: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(0).max(365).nullable(),
  ),
  turnaroundNote: z.string().trim().max(120).default(""),
  // blank means "nobody has estimated it", which is not the same as zero
  effortHours: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().min(0).max(200).nullable(),
  ),
  recurrence: z.enum(RECURRENCES),
  sac: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "A SAC code is 6 digits")
    .or(z.literal("")),
  defaultFee: z.string().trim().default("0"),
  gstRate: z.coerce.number().min(0).max(28),
  udinRequired: z.boolean().default(false),
  checklist: z.array(checklistItem).default([]),
  steps: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        // blank means the step inherits the service's own `minExecRole`
        minRole: z.enum(["", ...EXEC_ROLES]).default(""),
      }),
    )
    .default([])
    .refine((s) => s.length > 0, "Add at least one step"),
});

/**
 * The checklist and the steps arrive as JSON from the form, which keeps the
 * rows and their order intact — unchecked boxes simply do not post, so
 * parallel `getAll()` arrays would silently fall out of step.
 */
function readForm(formData) {
  const json = (key) => {
    try {
      return JSON.parse(formData.get(key) || "[]");
    } catch {
      return [];
    }
  };
  return {
    id: formData.get("id") || undefined,
    name: formData.get("name") ?? "",
    code: formData.get("code") ?? "",
    category: formData.get("category") ?? "",
    level: formData.get("level") ?? "",
    minExecRole: formData.get("minExecRole") ?? "",
    minReviewRole: formData.get("minReviewRole") ?? "",
    turnaroundDays: formData.get("turnaroundDays") ?? "",
    effortHours: formData.get("effortHours") ?? "",
    turnaroundNote: formData.get("turnaroundNote") ?? "",
    recurrence: formData.get("recurrence") ?? "",
    sac: formData.get("sac") ?? "",
    defaultFee: formData.get("defaultFee") ?? "0",
    gstRate: formData.get("gstRate") ?? 18,
    udinRequired: formData.get("udinRequired") === "on",
    checklist: json("checklist"),
    steps: json("steps"),
  };
}

/** Create a template, or save an edit to one. */
export async function saveService(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "serviceCatalog");

  const parsed = serviceInput.safeParse(readForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  let defaultFeePaise;
  try {
    defaultFeePaise = toPaise(data.defaultFee || "0");
  } catch {
    return { error: "Default fee is not an amount." };
  }
  if (defaultFeePaise < 0) return { error: "A fee cannot be negative." };

  await connectDB();
  const clash = await ServiceTemplate.findOne({ code: data.code });
  if (clash && String(clash._id) !== data.id) {
    return { error: `Code ${data.code} is already used by ${clash.name}.` };
  }

  const fields = {
    name: data.name,
    code: data.code,
    category: data.category,
    level: data.level,
    minExecRole: data.minExecRole,
    minReviewRole: data.minReviewRole,
    turnaroundDays: data.turnaroundDays,
    effortHours: data.effortHours,
    turnaroundNote: data.turnaroundNote,
    recurrence: data.recurrence,
    sac: data.sac,
    defaultFeePaise,
    gstRate: data.gstRate,
    udinRequired: data.udinRequired,
    checklist: data.checklist,
    steps: data.steps,
    updatedBy: actor.id,
  };

  try {
    if (!data.id) {
      await audited(actor, async (session) => {
        await ServiceTemplate.create(
          [{ ...fields, version: 1, active: true, createdBy: actor.id }],
          { session },
        );
      });
      revalidatePath("/settings/services");
      return { ok: `${data.name} added to the catalog.` };
    }

    const existing = await ServiceTemplate.findById(data.id);
    if (!existing) return { error: "That service no longer exists." };

    // engagements already created keep their own snapshot of the template
    // (spec section 13), so this only changes work started from now on
    const before = existing.toObject();
    const bumped = bumpsVersion(before, fields);

    // replacing the arrays wholesale would give every row a new id and show
    // up as a change in the audit log even when nothing was touched, so they
    // are only rewritten when their contents actually differ
    const { checklist, steps, ...scalars } = fields;
    await audited(actor, async (session) => {
      existing.set(scalars);
      if (bumpsVersion(before, { checklist })) existing.checklist = checklist;
      if (bumpsVersion(before, { steps })) existing.steps = steps;
      if (bumped) existing.version = (existing.version ?? 1) + 1;
      await existing.save({ session });
    });

    revalidatePath("/settings/services");
    revalidatePath(`/settings/services/${data.id}`);
    revalidatePath("/clients");

    const stale = await staleSubscriptions(existing);
    return {
      ok: bumped
        ? `${data.name} saved as version ${existing.version}. Engagements already created keep the old version.`
        : `${data.name} saved.`,
      warning: stale,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Which clients now name somebody who may no longer do this work.
 *
 * Raising a service to A-tier, or lifting its minimum role, leaves every
 * subscription that named an employee pointing at somebody the rules no
 * longer allow. Engagements already created are untouched — they hold their
 * own snapshot — but the recurring generator will create the next period's
 * work unassigned rather than assign it to somebody who may not do it. So
 * the save says so, with the clients to go and fix, instead of leaving it to
 * be discovered on the 1st of next month.
 *
 * @param {{_id: any, minExecRole: string, minReviewRole: string}} template
 * @returns {Promise<string>} empty when nothing is stale
 */
async function staleSubscriptions(template) {
  const subscriptions = await ClientService.find({
    serviceTemplateId: template._id,
    active: true,
  })
    .select("clientId defaultAssigneeId defaultReviewerId")
    .lean();
  if (subscriptions.length === 0) return "";

  const ids = subscriptions
    .flatMap((s) => [s.defaultAssigneeId, s.defaultReviewerId])
    .filter(Boolean)
    .map(String);
  if (ids.length === 0) return "";

  const people = new Map(
    (
      await User.find({ _id: { $in: ids }, active: true })
        .select("name role")
        .lean()
    ).map((u) => [
      String(u._id),
      { id: String(u._id), name: u.name, role: u.role },
    ]),
  );

  const broken = subscriptions.filter((s) => {
    const named = [s.defaultAssigneeId, s.defaultReviewerId].map((id) =>
      id ? String(id) : "",
    );
    if (named.some((id) => id && !people.has(id))) return true;
    return !checkAssignment(
      template,
      people.get(named[0]) ?? null,
      people.get(named[1]) ?? null,
    ).ok;
  });
  if (broken.length === 0) return "";

  const clients = await Client.find({
    _id: { $in: broken.map((s) => s.clientId) },
  })
    .select("legalName tradeName")
    .limit(10)
    .lean();
  const names = clients.map((c) => c.tradeName || c.legalName);

  return `${broken.length} ${broken.length === 1 ? "client names" : "clients name"} somebody who may no longer do this work (${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""}). Their next period will be created unassigned until the usual people are changed on the client.`;
}

/**
 * Archive a service so it cannot be chosen for new engagements, or bring it
 * back. Nothing is deleted: engagements refer to it for ever.
 */
export async function setServiceActive(id, active) {
  const actor = await requireUser();
  assertCan(actor, "edit", "serviceCatalog");

  await connectDB();
  const service = await ServiceTemplate.findById(id);
  if (!service) return { error: "That service no longer exists." };
  if (service.active === Boolean(active)) return { ok: "No change." };

  await audited(actor, async (session) => {
    service.active = Boolean(active);
    service.updatedBy = actor.id;
    await service.save({ session });
  });

  revalidatePath("/settings/services");
  return {
    ok: active
      ? `${service.name} is available again.`
      : `${service.name} archived. Existing engagements are untouched.`,
  };
}
