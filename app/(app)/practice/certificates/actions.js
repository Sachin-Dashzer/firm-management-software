"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { toPaise } from "@/lib/money";
import Client from "@/models/Client";
import User from "@/models/User";
import Certificate from "@/models/Certificate";
import RuleConfirmation from "@/models/RuleConfirmation";
import {
  CERTIFICATE_TYPES,
  ASSURANCE_LEVELS,
  CONFIRM_KIND,
  paragraphsFor,
  blockingSign,
} from "@/lib/practice/certificates";
import { checkUdinForMember, linkUdinToCertificate } from "@/lib/practice/udin";
import { nextCertificateNumber } from "@/lib/practice/certificateNumber";

/**
 * Drafting and signing a certificate (P3-15).
 *
 * The two gates are the ones that matter on a document the firm signs: a
 * **locked paragraph is not editable**, and the **UDIN has to belong to the
 * member signing it and to this year**. Both are refused here and not only
 * hidden on the screen.
 */

async function loadForWork(actor, id) {
  await connectDB();
  const certificate = await Certificate.findById(id);
  if (!certificate) {
    const err = new Error("That certificate no longer exists.");
    err.code = "NOT_FOUND";
    throw err;
  }
  assertCan(actor, "edit", "udin", {
    branchId: String(certificate.branchId),
  });
  return certificate;
}

/** Refuse anything that would change a certificate already signed. */
function signedError(certificate) {
  if (!certificate.signedAt) return null;
  return {
    error: `${certificate.number || "This certificate"} is signed. A signed certificate is not edited — issue a fresh one, and say on it that it replaces this.`,
  };
}

/** Start a draft, with the Guidance Note's paragraphs copied in. */
export async function createCertificate(_prev, formData) {
  const actor = await requireUser();
  await connectDB();

  const clientId = String(formData.get("clientId") ?? "");
  const client = await Client.findById(clientId).select("branchId").lean();
  if (!client) return { error: "Choose a client." };

  assertCan(actor, "edit", "udin", { branchId: String(client.branchId) });

  const typeKey = String(formData.get("type") ?? "");
  const type = CERTIFICATE_TYPES.find((row) => row.key === typeKey);
  if (!type) return { error: "Choose what kind of certificate this is." };

  const level = String(formData.get("level") ?? "Reasonable");
  if (!ASSURANCE_LEVELS.includes(level)) {
    return { error: "Choose the level of assurance." };
  }

  const asOnRaw = String(formData.get("asOn") ?? "").trim();
  const asOn = asOnRaw ? new Date(`${asOnRaw}T00:00:00+05:30`) : null;
  if (asOnRaw && Number.isNaN(asOn?.valueOf())) {
    return { error: "That date is not a date." };
  }

  let created;
  try {
    await audited(actor, async (session) => {
      const number = await nextCertificateNumber(
        String(client.branchId),
        session,
      );

      const [doc] = await Certificate.create(
        [
          {
            number,
            clientId: client._id,
            branchId: client.branchId,
            engagementId: String(formData.get("engagementId") ?? "") || null,
            type: type.key,
            typeName: type.name,
            addressee: String(formData.get("addressee") ?? "").trim(),
            purpose: String(formData.get("purpose") ?? "").trim(),
            level,
            asOn,
            paragraphs: paragraphsFor(type, level),
            evidence: type.evidence.map((what) => ({ what, held: false })),
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
      created = doc;

      await recordAudit(
        {
          action: ACTIONS.create,
          entityType: "Certificate",
          entityId: doc._id,
          clientId: client._id,
          note: `${number} — ${type.name}, ${level.toLowerCase()} assurance`,
        },
        session,
      );
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath("/practice/certificates");
  return { ok: "Draft started.", id: String(created._id) };
}

/**
 * Change the level of assurance after the fact.
 *
 * This rewrites the locked paragraphs, because that is what the level
 * *means* — the conclusion changes form and the procedures become
 * mandatory. What a practitioner has written into the open paragraphs is
 * kept.
 */
export async function setAssuranceLevel(id, level) {
  const actor = await requireUser();
  const certificate = await loadForWork(actor, id);
  const signed = signedError(certificate);
  if (signed) return signed;

  if (!ASSURANCE_LEVELS.includes(level)) return { error: "Unknown level." };
  if (certificate.level === level) return { error: `It is already ${level}.` };

  const type = CERTIFICATE_TYPES.find((row) => row.key === certificate.type);
  if (!type) return { error: "That certificate's type is unknown." };

  const was = certificate.level;
  const written = new Map(
    certificate.paragraphs
      .filter((row) => !row.locked)
      .map((row) => [row.key, row.text]),
  );

  await audited(actor, async (session) => {
    certificate.level = level;
    certificate.paragraphs = paragraphsFor(type, level).map((row) => ({
      ...row,
      text: row.locked ? row.text : (written.get(row.key) ?? row.text),
    }));
    certificate.updatedBy = actor.id;
    await certificate.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Certificate",
        entityId: certificate._id,
        clientId: certificate.clientId,
        diff: { level: [was, level] },
        note: `The conclusion and the responsibilities were rewritten for ${level.toLowerCase()} assurance`,
      },
      session,
    );
  });

  revalidatePath(`/practice/certificates/${id}`);
  return {
    ok:
      level === "Limited"
        ? "Rewritten for limited assurance: the conclusion is in the negative form, and the procedures now have to be described."
        : "Rewritten for reasonable assurance: the conclusion is a positive opinion.",
  };
}

/** Write one of the open paragraphs. */
export async function saveParagraph(id, paragraphId, formData) {
  const actor = await requireUser();
  const certificate = await loadForWork(actor, id);
  const signed = signedError(certificate);
  if (signed) return signed;

  const paragraph = certificate.paragraphs.id(paragraphId);
  if (!paragraph) return { error: "That paragraph is gone." };

  /**
   * The server's own refusal, not the screen's. The Guidance Note's
   * structure is the thing being relied on, so it is protected where the
   * write happens.
   */
  if (paragraph.locked) {
    return {
      error: `"${paragraph.title}" is the Guidance Note's own wording and is not edited. If it is wrong for this engagement, the engagement needs a different kind of report.`,
    };
  }

  await audited(actor, async (session) => {
    paragraph.text = String(formData.get("text") ?? "").trim();
    certificate.updatedBy = actor.id;
    await certificate.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Certificate",
        entityId: certificate._id,
        clientId: certificate.clientId,
        note: `"${paragraph.title}" written`,
      },
      session,
    );
  });

  revalidatePath(`/practice/certificates/${id}`);
  return { ok: `${paragraph.title} saved.` };
}

/** Say whether one piece of evidence is on the file. */
export async function setEvidence(id, evidenceId, formData) {
  const actor = await requireUser();
  const certificate = await loadForWork(actor, id);
  const signed = signedError(certificate);
  if (signed) return signed;

  const row = certificate.evidence.id(evidenceId);
  if (!row) return { error: "That item is gone." };

  const state = String(formData.get("state") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (state === "not-applicable" && note.length < 5) {
    return {
      error:
        "Say why it does not apply. An item waved through with no reason is the one a reviewer asks about.",
    };
  }

  await audited(actor, async (session) => {
    row.held = state === "held";
    row.notApplicable = state === "not-applicable";
    row.note = note;
    certificate.updatedBy = actor.id;
    await certificate.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Certificate",
        entityId: certificate._id,
        clientId: certificate.clientId,
        note: `${row.what}: ${state === "held" ? "on the file" : state === "not-applicable" ? `not applicable — ${note}` : "not held"}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/certificates/${id}`);
  return { ok: "Recorded." };
}

/** The one headline amount, where the type carries one. */
export async function setFigure(id, formData) {
  const actor = await requireUser();
  const certificate = await loadForWork(actor, id);
  const signed = signedError(certificate);
  if (signed) return signed;

  const basis = String(formData.get("basis") ?? "").trim();
  if (basis.length < 10) {
    return {
      error:
        "Say how the figure was arrived at. A figure on a certificate with no basis is the thing that gets questioned.",
    };
  }

  let figurePaise;
  try {
    figurePaise = toPaise(String(formData.get("figure") ?? "0"));
  } catch {
    return { error: "That is not an amount." };
  }

  await audited(actor, async (session) => {
    certificate.figurePaise = figurePaise;
    certificate.figureBasis = basis;
    certificate.updatedBy = actor.id;
    await certificate.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Certificate",
        entityId: certificate._id,
        clientId: certificate.clientId,
        note: `Figure set — ${basis}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/certificates/${id}`);
  return { ok: "Figure and its basis recorded." };
}

/**
 * Sign it.
 *
 * A member signs, with their own membership number, over wording a partner
 * has read, with a UDIN that belongs to them and to this year — all of it
 * checked here, because this is the moment the firm's name goes on
 * something.
 *
 * Who may sign is `edit` on `udin`, already asserted by `loadForWork`:
 * the firm's CAs and partners, which is the same population the register
 * offers as signing members, because a UDIN is generated against a
 * member's own ICAI membership and nobody else has one.
 */
export async function signCertificate(id, formData) {
  const actor = await requireUser();
  const certificate = await loadForWork(actor, id);
  const signed = signedError(certificate);
  if (signed) return signed;

  const blocked = blockingSign(certificate);
  if (blocked.length) return { error: blocked[0] };

  await connectDB();

  /**
   * D48's rule, at the only moment it can bite on a document that is all
   * wording: nothing goes out over paragraphs no partner has read. The
   * strip at the top of the draft is two clicks for a partner.
   */
  const confirmed = await RuleConfirmation.findOne({
    kind: CONFIRM_KIND,
    key: certificate.type,
    confirmedAt: { $ne: null },
  })
    .select("_id")
    .lean();
  if (!confirmed) {
    return {
      error: `No partner has confirmed the Guidance Note wording for a ${certificate.typeName.toLowerCase()}. The wording is a first draft taken from the design prototype and it is the whole of what this document says, so a partner reads it before one goes out.`,
    };
  }

  const signer = await User.findById(actor.id).select("name icai").lean();
  const member = {
    name: signer?.name ?? actor.name,
    membershipNo: signer?.icai?.membershipNo ?? "",
  };
  if (!member.membershipNo) {
    return {
      error:
        "Your ICAI membership number is not recorded, and it is printed under the signature. Add it on your own profile, or ask a partner to, before signing.",
    };
  }

  const udin = String(formData.get("udin") ?? "")
    .trim()
    .toUpperCase();

  const check = checkUdinForMember(udin, member, new Date());
  if (!check.ok) return { error: check.error };

  const clash = await Certificate.findOne({ udin }).select("number").lean();
  if (clash) {
    return {
      error: `That UDIN is already on ${clash.number}. A UDIN identifies one document.`,
    };
  }

  /** Set when the register refuses the number, so the sentence survives the rollback. */
  let registerError = null;

  await audited(actor, async (session) => {
    /**
     * The register is the record and the certificate's field is a copy of
     * it (P2-7's rule), so the row and the signature are one write.
     */
    const linked = await linkUdinToCertificate(
      { udin, certificate, actor, member },
      session,
    );
    if (!linked.ok) {
      registerError = linked.error;
      throw new Error(linked.error);
    }

    certificate.udin = udin;
    certificate.signerId = actor.id;
    certificate.signerName = member.name;
    certificate.signerMembershipNo = member.membershipNo;
    certificate.signedAt = new Date();
    certificate.signedBy = actor.id;
    certificate.signedByName = actor.name;
    certificate.updatedBy = actor.id;
    await certificate.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Certificate",
        entityId: certificate._id,
        clientId: certificate.clientId,
        note: `${certificate.number} signed by ${certificate.signerName}, UDIN ${udin}`,
      },
      session,
    );
  }).catch((err) => {
    if (!registerError) throw err;
  });
  if (registerError) return { error: registerError };

  revalidatePath(`/practice/certificates/${id}`);
  revalidatePath("/practice/certificates");
  revalidatePath("/practice/udin");
  return { ok: `Signed, and in the UDIN register. ${check.note}` };
}

/**
 * A partner has read the Guidance Note wording for one kind of certificate
 * and says it is right (D48's rule, the same `RuleConfirmation` row the
 * notice-law table and the auditing standards use).
 *
 * Per kind rather than per draft: the paragraphs are the same every time,
 * and asking again on each certificate would turn a partner's reading of
 * the Guidance Note into a box somebody ticks.
 */
export async function confirmCertificateWording(typeKey, formData) {
  const actor = await requireUser();
  assertCan(actor, "approve", "feeWriteOff");

  const type = CERTIFICATE_TYPES.find((row) => row.key === typeKey);
  if (!type) return { error: "No such kind of certificate." };

  await connectDB();
  const note = String(formData?.get("note") ?? "").trim();

  await audited(actor, async (session) => {
    const row = await RuleConfirmation.findOneAndUpdate(
      { kind: CONFIRM_KIND, key: type.key },
      {
        $set: {
          text: `${type.name}: the paragraphs follow the Guidance Note on Reports or Certificates for Special Purposes`,
          cite: "ICAI Guidance Note on Reports or Certificates for Special Purposes",
          note,
          confirmedAt: new Date(),
          confirmedBy: actor.id,
          confirmedByName: actor.name,
          updatedBy: actor.id,
        },
        $setOnInsert: {
          kind: CONFIRM_KIND,
          key: type.key,
          createdBy: actor.id,
        },
      },
      { new: true, upsert: true, session },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "RuleConfirmation",
        entityId: row._id,
        note: `Certificate wording confirmed for ${type.name}${note ? ` — ${note}` : ""}`,
      },
      session,
    );
  });

  revalidatePath("/practice/certificates", "layout");
  return {
    ok: `${type.name} wording confirmed. Certificates of this kind can be signed.`,
  };
}
