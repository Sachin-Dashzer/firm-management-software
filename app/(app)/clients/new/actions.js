"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Client from "@/models/Client";
import ClientGroup from "@/models/ClientGroup";
import Potential from "@/models/Potential";
import ClientService from "@/models/ClientService";
import ServiceTemplate from "@/models/ServiceTemplate";
import DocTemplate from "@/models/DocTemplate";
import DocRequest from "@/models/DocRequest";
import { findDuplicates } from "@/lib/clients/duplicates";
import { feeToPaise, quotation } from "@/lib/clients/quotation";
import { quotationToClient } from "@/lib/mailer/events";
import { ENTITY_BY_KEY, entityLabel } from "@/lib/clients/entityTypes";
import { checkPAN, checkGSTIN } from "@/lib/validators";
import { firmProfile } from "@/lib/firm/settings";
import { buildContext, resolveTemplate } from "@/lib/docs/resolve";
import {
  hashRequestToken,
  newRequestToken,
  requestExpiry,
  requestLink,
  REQUEST_DAYS,
} from "@/lib/storage/requests";
import { createClient } from "../actions";

/**
 * The seven-step onboarding wizard's own server side.
 *
 * Creating the client itself is **not** reimplemented here: it goes through
 * `createClient`, the same action the edit form and the Excel import answer
 * to, so the validation, the duplicate block and the audit entry are the
 * ones already in place. This file adds only what onboarding does on top —
 * the live lookups the checks screen needs, the engagement-pack previews,
 * and the two records that follow a new client: its service subscriptions
 * and the one document request that asks for everything still missing.
 */

/**
 * Mark the potential-register row this client came from (04-11-2026).
 *
 * The register hands its four fields to the wizard and the wizard links
 * the two records on the way out, which is what keeps one path into the
 * client list: the conversion is the *client* being created, so there is
 * no window where a row claims a client that does not exist.
 *
 * Everything here is deliberately forgiving. The client has already been
 * created and audited by the time this runs, so a row that has since been
 * removed, or belongs to an office this person cannot read, or was
 * converted by somebody else a minute ago, must not turn a finished
 * onboarding into an error — it leaves the register alone and says so by
 * returning the name, or nothing.
 *
 * @returns {Promise<string>} the name on the row, when one was marked
 */
async function markPotentialConverted(actor, id, clientId) {
  if (!/^[a-f\d]{24}$/i.test(String(id ?? ""))) return "";

  const row = await Potential.findById(String(id));
  if (!row || row.status === "Converted") return "";

  const mayChange = can(actor, "edit", "potentials", {
    branchId: String(row.branchId ?? ""),
    userId: String(row.createdBy ?? ""),
  });
  if (!mayChange) return "";

  await audited(actor, async (session) => {
    row.status = "Converted";
    row.clientId = clientId;
    row.convertedAt = new Date();
    row.updatedBy = actor.id;
    await row.save({ session });
  });

  revalidatePath("/potentials");
  return row.name;
}

/** The three checks that need the database, for steps 2 and 5. */
export async function onboardingLookups(input) {
  const actor = await requireUser();
  assertCan(actor, "edit", "clients");
  await connectDB();

  const pan = checkPAN(input.pan ?? "");
  const gstin = checkGSTIN(input.gstin ?? "");
  const legalName = String(input.legalName ?? "").trim();

  const { blocking, warnings } = await findDuplicates({
    pan: pan.ok ? pan.value : "",
    gstins: gstin.ok ? [{ gstin: gstin.value }] : [],
    contacts: [{ mobile: String(input.mobile ?? "").trim() }],
    legalName,
  });

  const duplicate = blocking.length
    ? { state: "bad", detail: blocking.map((d) => d.message).join(" ") }
    : warnings.length
      ? { state: "warn", detail: warnings.map((d) => d.message).join(" ") }
      : pan.ok || gstin.ok
        ? { state: "ok", detail: "No existing client with this PAN or GSTIN" }
        : { state: "idle", detail: "Runs when the PAN or GSTIN is filled in" };

  return {
    duplicate,
    blocking: blocking.map((d) => d.message),
    group: await suggestGroup(input, legalName),
    independence: independenceNote(input),
  };
}

/**
 * Which family this entity probably belongs to.
 *
 * A heuristic and nothing more: the distinctive words in the legal name and
 * in whoever runs it — the directors, the partners, the Karta — matched
 * against the names of the groups the firm already keeps. "Mehra Agro
 * Exports Pvt Ltd" run by Rajesh Mehra finds the Mehra group. It is offered
 * as a tick, never applied on its own, because a shared surname is not a
 * shared family.
 */
async function suggestGroup(input, legalName) {
  if (input.groupId) {
    const chosen = await ClientGroup.findById(input.groupId)
      .select("name")
      .lean();
    return chosen
      ? { state: "ok", detail: `Goes into the ${chosen.name} group` }
      : null;
  }

  const people = [
    legalName,
    input.directors,
    input.partners,
    input.members,
    input.proprietorName,
    input.kartaName,
    input.trustees,
    input.officeBearers,
    input.soleMember,
  ]
    .filter(Boolean)
    .join(" ");

  const words = [
    ...new Set(
      String(people)
        .split(/[^A-Za-z]+/)
        .filter((word) => word.length >= 4)
        .map((word) => word.toLowerCase()),
    ),
  ];
  if (!words.length) return null;

  const groups = await ClientGroup.find({}).select("name").lean();
  const hit = groups.find((group) =>
    words.some((word) => group.name.toLowerCase().includes(word)),
  );

  return hit
    ? {
        state: "warn",
        detail: `${hit.name} already exists — this entity may belong to it`,
        suggestGroupId: String(hit._id),
        suggestGroupName: hit.name,
      }
    : {
        state: "ok",
        detail:
          "No existing group matches this name — a new group will be made",
      };
}

/**
 * The independence line (s.141 / s.144).
 *
 * The system does not decide independence; it says out loud when the
 * question arises, which is whenever the firm is about to both audit and
 * do other work for the same family.
 */
function independenceNote(input) {
  const audits = (input.services ?? []).some((code) =>
    ["STAT-AUD", "TAX-AUD"].includes(code),
  );
  const others = (input.services ?? []).filter(
    (code) => !["STAT-AUD", "TAX-AUD"].includes(code),
  );

  if (!audits) {
    return {
      state: "ok",
      detail: "No audit is being taken on, so s.141 eligibility does not arise",
    };
  }
  return {
    state: "warn",
    detail: others.length
      ? "The firm would audit and also do non-audit work here — check s.144 before accepting"
      : "An audit is being taken on — check s.141 eligibility and the previous auditor's communication",
  };
}

/**
 * A readable draft of one letter in the engagement pack, before the client
 * exists. Filled from what has been typed, through the same closed field
 * list every generated document uses, so a draft can no more reach a PAN
 * than an issued letter can.
 */
export async function previewPackDraft(code, input) {
  const actor = await requireUser();
  assertCan(actor, "edit", "clients");
  await connectDB();

  const template = await DocTemplate.findOne({ code, active: true }).lean();
  if (!template) {
    return {
      error:
        "That letter has no template yet. Add the wording in Settings → Documents, and a partner approves it before it can be issued.",
    };
  }

  const firm = await firmProfile();
  const { text, gaps } = resolveTemplate(
    template.body,
    buildContext({
      firm,
      client: {
        legalName: input.legalName,
        tradeName: input.tradeName,
        entityType: input.entityType,
        gstins: input.gstin ? [{ gstin: input.gstin }] : [],
        contacts: [{ name: input.contactName, primary: true }],
        addresses: [{ kind: "Registered", state: input.state }],
      },
      signatory: { name: actor.name },
    }),
  );

  return {
    title: template.title || template.name,
    text,
    gaps: gaps.map((gap) => gap.label),
    verified: Boolean(template.verifiedAt),
  };
}

/**
 * Create the client and everything the wizard collected around it.
 *
 * Three writes, each audited in its own transaction: the client, its
 * service subscriptions, and one document request for the papers that were
 * not ticked as received. The order matters — nothing is asked for from a
 * client that does not exist, and a failure on the services leaves a
 * created client rather than a half-written one.
 */
export async function createFromOnboarding(payload) {
  const actor = await requireUser();
  assertCan(actor, "edit", "clients");

  const entity = ENTITY_BY_KEY[payload.entityType];
  if (!entity) return { error: "Choose an entity type first." };

  const formData = new FormData();
  const put = (key, value) => {
    const text = String(value ?? "").trim();
    if (text) formData.set(key, text);
  };

  put("entityType", payload.entityType);
  put("status", "Lead");
  for (const [field, value] of Object.entries(payload.values ?? {})) {
    put(field, value);
  }
  // a single address row carries the state the master form asks for
  if (formData.get("addresses.0.state")) put("addresses.0.kind", "Registered");
  if (formData.get("contacts.0.name")) put("contacts.0.primary", "on");
  if (payload.groupId) put("groupId", payload.groupId);
  if (payload.confirmDuplicates) put("confirmDuplicates", "yes");

  // what was agreed, in the client's own words, for whoever reads the lead
  const ticked = payload.services ?? [];
  await connectDB();
  const templates = ticked.length
    ? await ServiceTemplate.find({
        code: { $in: ticked.map((row) => row.code) },
      })
        .select("code name defaultFeePaise")
        .lean()
    : [];
  put("proposedServices", templates.map((t) => t.name).join(", "));

  const created = await createClient(null, formData);
  if (!created?.ok) return created;

  const clientId = created.id;
  const byCode = new Map(templates.map((t) => [t.code, t]));

  // --- the service subscriptions, which become this client's defaults ---
  let services = 0;
  /** The same rows, in the words the client is quoted them in. */
  const quoteRows = [];
  if (ticked.length) {
    try {
      await audited(actor, async (session) => {
        for (const row of ticked) {
          const template = byCode.get(row.code);
          if (!template) continue;
          const feePaise = feeToPaise(row.fee, template.defaultFeePaise ?? 0);
          const billingBasis = row.billingBasis || "per engagement";
          const gstTreatment = row.gstTreatment || "plus GST";
          await ClientService.create(
            [
              {
                clientId,
                serviceTemplateId: template._id,
                feePaise,
                billingBasis,
                gstTreatment,
                createdBy: actor.id,
                updatedBy: actor.id,
              },
            ],
            { session },
          );
          quoteRows.push({
            name: template.name,
            feePaise,
            billingBasis,
            gstTreatment,
          });
          services += 1;
        }
      });
    } catch (err) {
      return {
        ok: created.ok,
        id: clientId,
        error: `The client was created, but its services were not: ${err.message}`,
      };
    }
  }

  /* read once, for the quotation and for the document request below */
  const client = await Client.findById(clientId)
    .select("branchId legalName tradeName contacts")
    .lean();

  /*
   * --- the quotation (06-11-2026) ---
   *
   * The fees that were just written to `clientServices`, sent to the
   * client in the same words the firm recorded them in. It goes out here
   * rather than being left for somebody to remember, because the day a
   * client is taken on is the day a wrong fee costs nothing to correct.
   *
   * It is the last thing that can go wrong and the least important: a
   * client whose quotation was held by the guard, or who has no email
   * address yet, is still a created client with its services on record.
   * So every failure here comes back as a sentence on the Done screen and
   * nothing more.
   */
  const quote = quotation(quoteRows);
  /** @type {string[]} */
  let quotedTo = [];
  let quoteError = "";
  if (quote.lines.length && payload.emailQuotation !== false) {
    try {
      await audited(actor, async (session) => {
        const outcome = await quotationToClient(client, quote, actor, session);
        quotedTo = outcome.sent;
        quoteError = outcome.error ?? "";
        if (!outcome.sent.length) return;

        await recordAudit(
          {
            action: ACTIONS.update,
            entityType: "Client",
            entityId: clientId,
            clientId,
            note: `Quotation for ${quote.lines.length} ${
              quote.lines.length === 1 ? "service" : "services"
            } emailed to ${outcome.sent.join(", ")}`,
          },
          session,
        );
      });
    } catch (err) {
      quoteError = `The quotation could not be sent: ${err.message}`;
    }
  }

  // --- one request for everything not already in hand ---
  /*
   * The list the person edited on step 3, not the entity's standard one
   * (04-11-2026). These names are read by the client on the upload page, so
   * they are cleaned here and not merely on the way in: trimmed, collapsed,
   * de-duplicated case-insensitively, each capped at the length the
   * DocRequest item allows, and the whole list capped — a request with two
   * hundred rows is a mistake, not an instruction.
   *
   * An empty list is honoured as an empty list. Somebody who takes every row
   * off has said "ask this client for nothing", and falling back to the
   * standard list there would be the system overruling them quietly.
   */
  const asked = Array.isArray(payload.documents)
    ? payload.documents
    : (entity.documents ?? []);

  const seen = new Set();
  const wanted = [];
  for (const row of asked) {
    const name = String(row ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    wanted.push(name);
    if (wanted.length === 60) break;
  }

  // matched on the same normal form, or "PAN  card" ticked as received
  // would come back as a row the client is asked for again
  const received = new Set(
    (payload.received ?? []).map((name) =>
      String(name ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    ),
  );
  const outstanding = wanted.filter(
    (name) => !received.has(name.toLowerCase()),
  );
  let link = null;
  if (outstanding.length && payload.requestDocuments !== false) {
    const token = newRequestToken();
    await audited(actor, async (session) => {
      await DocRequest.create(
        [
          {
            // only the hash is kept; the link itself is shown once, below
            tokenHash: hashRequestToken(token),
            tokenHint: token.slice(0, 6),
            clientId,
            branchId: client?.branchId ?? null,
            items: outstanding.map((name) => ({ name, mandatory: true })),
            expiresAt: requestExpiry(),
            message: `Onboarding ${payload.values?.legalName ?? ""}`.trim(),
            sentVia: "link",
            createdBy: actor.id,
            createdByName: actor.name,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
    });
    link = requestLink(token);
  }

  const fromRegister = await markPotentialConverted(
    actor,
    payload.potentialId,
    clientId,
  );

  revalidatePath("/clients");
  return {
    ok: created.ok,
    id: clientId,
    fromRegister,
    services,
    quotedTo,
    quoteError,
    quoteLines: quote.lines.length,
    outstanding: outstanding.length,
    requestDays: REQUEST_DAYS,
    link,
    entity: entityLabel(payload.entityType),
    warnings: created.warnings,
  };
}
