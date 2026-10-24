"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { periodOptions } from "@/lib/engagements/period";
import { addWorkingDays, istInputDate } from "@/lib/dates";
import { canExecute, canReview, tierLabel } from "@/lib/services/catalog";
import { ROLE_LABELS } from "@/lib/permissions";
import { PRIORITIES } from "@/lib/engagements/status";
import { createEngagement, subscriptionDefaults } from "../actions";

/**
 * Create one engagement from a service template.
 *
 * The period list, and who may be assigned, follow from the service chosen,
 * so the form cannot offer a combination the server would refuse. The
 * client's own fee and usual people are filled in from their subscription
 * when there is one.
 */
export default function EngagementForm({
  clients,
  templates,
  team,
  presetClientId,
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(presetClientId || "");
  const [templateId, setTemplateId] = useState("");
  const [period, setPeriod] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [fee, setFee] = useState("");
  const [internalDue, setInternalDue] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const template = templates.find((t) => t.id === templateId) ?? null;

  const periods = useMemo(
    () => (template ? periodOptions(template.recurrence) : []),
    [template],
  );

  // the period list changes with the service, so keep the choice valid
  useEffect(() => {
    if (!template) return;
    setPeriod(periodOptions(template.recurrence)[1].code);
    setFee(template.defaultFee);
    /**
     * Show the date the service's turnaround would give, rather than leaving
     * the box empty and computing it out of sight on the server. A service
     * with no turnaround leaves it blank — which is the case worth noticing,
     * and the note under the box says so.
     */
    setInternalDue(
      typeof template.turnaroundDays === "number"
        ? istInputDate(addWorkingDays(new Date(), template.turnaroundDays))
        : "",
    );
  }, [template]);

  // a client's own fee and usual people win over the catalog defaults
  useEffect(() => {
    if (!clientId || !templateId) return;
    let cancelled = false;
    subscriptionDefaults(clientId, templateId).then((found) => {
      if (cancelled || !found) return;
      setFee(String(found.feePaise / 100));
      if (found.defaultAssigneeId) setAssigneeId(found.defaultAssigneeId);
      if (found.defaultReviewerId) setReviewerId(found.defaultReviewerId);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, templateId]);

  const canDo = template
    ? team.filter((u) => canExecute(u.role, template.minExecRole))
    : team;
  const canCheck = template
    ? team.filter((u) => canReview(u.role, template.minReviewRole))
    : team.filter((u) => u.role === "ca" || u.role === "partner");

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await createEngagement(null, formData);
          setMessage(result);
          if (result?.id) router.push(`/engagements/${result.id}`);
        })
      }
      className="flex flex-col gap-6"
    >
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      <section className="rounded-ledger border-rule bg-surface grid gap-4 border p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Client</span>
          <select
            name="clientId"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— choose —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Service</span>
          <select
            name="serviceTemplateId"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            required
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— choose —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Period</span>
          <select
            name="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={!template}
            required
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          >
            {periods.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
          {template && (
            <span className="text-12 text-ink-muted">
              {template.recurrence === "one-time"
                ? "One-time work is filed under the financial year it starts in."
                : `This service runs ${template.recurrence}.`}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Internal due date
          </span>
          <input
            type="date"
            name="internalDue"
            value={internalDue}
            onChange={(e) => setInternalDue(e.target.value)}
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          />
          <span className="text-12 text-ink-muted">
            {!template
              ? "The firm's own target for finishing this."
              : typeof template.turnaroundDays === "number"
                ? `${template.turnaroundDays} working days, from this service's turnaround. Change it if this one is different.`
                : "This service has no turnaround, so there is no target until you set one here."}
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Priority</span>
          <select
            name="priority"
            defaultValue="Normal"
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Doing the work
          </span>
          <select
            name="assigneeId"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— decide later —</option>
            {canDo.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {template && (
            <span className="text-12 text-ink-muted">
              {tierLabel(template.level)} · needs{" "}
              {ROLE_LABELS[template.minExecRole]} or above
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Reviewing</span>
          <select
            name="reviewerId"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— decide later —</option>
            {canCheck
              .filter((u) => u.id !== assigneeId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
          <span className="text-12 text-ink-muted">
            Must be someone other than the person doing the work.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Fee (rupees)
          </span>
          <input
            name="fee"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            inputMode="decimal"
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          />
        </label>
      </section>

      {template && (
        <section className="rounded-ledger border-rule bg-surface text-13 flex flex-col gap-1 border p-4">
          <p>
            <span className="text-ink-muted">Turnaround: </span>
            {typeof template.turnaroundDays === "number"
              ? `${template.turnaroundDays} working days from today`
              : template.turnaroundNote || "not set"}
          </p>
          <p className="text-ink-muted">
            The statutory due date is filled in from the due-date master, and
            only from a rule the firm has confirmed. Until then the internal
            date above is the only target this work has.
          </p>
          {template.udinRequired && (
            <p className="text-brass-ink">
              This service needs a UDIN before it can be completed.
            </p>
          )}
          <p className="text-ink-muted">
            Checklist and steps are copied from version {template.version} of
            this service; later catalog edits will not change this engagement.
          </p>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-ledger bg-carbon text-14 h-10 px-4 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create engagement"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-14 text-ink-muted underline underline-offset-4"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
