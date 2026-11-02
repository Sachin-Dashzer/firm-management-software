"use client";

import { saving } from "@/lib/forms/saving";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { periodOptions } from "@/lib/engagements/period";
import { addWorkingDays, istInputDate } from "@/lib/dates";
import { canExecute, canReview, tierLabel } from "@/lib/services/catalog";
import { ROLE_LABELS } from "@/lib/permissions";
import { PRIORITIES } from "@/lib/engagements/status";
import Combobox from "@/components/ui/Combobox";
import { createEngagement, subscriptionDefaults } from "../actions";

/**
 * Create one engagement from a service template.
 *
 * The period list, and who may be assigned, follow from the service chosen,
 * so the form cannot offer a combination the server would refuse. The
 * client's own fee and usual people are filled in from their subscription
 * when there is one.
 */
const OTHER = {
  id: "other",
  name: "Other — not in the catalog",
  code: "OTHER",
  category: "Other",
  recurrence: "one-time",
  level: "L2",
  minExecRole: "employee",
  minReviewRole: "ca",
  defaultFee: "0",
  turnaroundDays: null,
  turnaroundNote: "As agreed with the client",
  udinRequired: false,
  version: 1,
};

export default function EngagementForm({
  clients,
  templates,
  team,
  presetClientId,
  mayAddService = false,
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

  const [otherName, setOtherName] = useState("");

  /**
   * The service, including the one that is not a service yet. "Other"
   * behaves like a one-time L2 job in the form, so the period list, the
   * people filters and the due date all work before the catalog row
   * exists; the server makes the row (see adHocService in ../actions).
   *
   * Memoised on the id alone — the effects below key off this object, and
   * one rebuilt on every keystroke would reset the period and the fee
   * while somebody was still typing the name.
   */
  const template = useMemo(
    () =>
      templateId === "other"
        ? OTHER
        : (templates.find((t) => t.id === templateId) ?? null),
    [templateId, templates],
  );

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
      onSubmit={saving(
        async (formData) => {
          const another = formData.get("then") === "another";
          const result = await createEngagement(null, formData);

          /**
           * Twelve GST returns for twelve clients is one sitting (P3-18b).
           * The service, the period and the people stay; **the client is
           * cleared**, because that is the field that changes and leaving
           * it filled is how the same client gets the job twice.
           */
          if (result?.id && another) {
            setMessage({
              ok: "Created. Ready for the next client, same service and period.",
            });
            setClientId("");
            setFee("");
            return;
          }

          setMessage(result);
          if (result?.id) router.push(`/engagements/${result.id}`);
          return result;
        },
        null,
        startTransition,
      )}
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
        <Combobox
          label="Client"
          name="clientId"
          value={clientId}
          onChange={setClientId}
          required
          placeholder="Name or code — type to search"
          options={clients.map((c) => ({
            id: c.id,
            label: c.name,
            hint: c.code,
          }))}
        />

        <Combobox
          label="Service"
          name="serviceTemplateId"
          value={templateId}
          onChange={setTemplateId}
          required
          placeholder="Service name or code — type to search"
          options={[
            ...templates.map((t) => ({
              id: t.id,
              label: t.name,
              hint: t.code,
              group: t.category,
            })),
            /* one-off work, last, where a new thing belongs */
            ...(mayAddService
              ? [
                  {
                    id: "other",
                    label: OTHER.name,
                    group: "Anything the catalog does not have yet",
                  },
                ]
              : []),
          ]}
          footnote={
            mayAddService
              ? undefined
              : "Work that is not on this list has to be added to the catalog by a partner first."
          }
        />

        {templateId === "other" && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-13 text-ink-muted font-medium">
              What is this work? <span className="text-redpen">*</span>
            </span>
            <input
              name="otherName"
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              required
              maxLength={120}
              placeholder="Fire insurance certificate, bank visit, valuation…"
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            />
            <span className="text-12 text-ink-muted">
              This becomes a service in the catalog, as a one-time job needing
              an employee and a CA review, with no checklist and no fee until
              somebody sets them. Use the same words next time and it is the
              same service.
            </span>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Period</span>
          <select
            name="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={!template}
            required
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
          className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create engagement"}
        </button>
        <button
          type="submit"
          name="then"
          value="another"
          disabled={pending}
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-10 border px-4 disabled:opacity-60"
        >
          Create and add another
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
