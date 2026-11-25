"use client";

import { saving } from "@/lib/forms/saving";
import { useState, useTransition } from "react";
import { canExecute, canReview } from "@/lib/services/catalog";
import TierBadge from "@/components/ledger/TierBadge";
import {
  removeClientService,
  saveClientService,
} from "../../engagements/actions";

/**
 * What this client is signed up for (spec section 13 `clientServices`).
 *
 * It does two jobs: it fills in the fee and the usual people when work is
 * created, and from Step 7 it is the list the recurring generator works
 * from.
 */
export default function ClientServices({
  clientId,
  mayEdit,
  subscriptions,
  templates,
  team,
  registrations = [],
}) {
  const [adding, setAdding] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [gstinId, setGstinId] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const template = templates.find((t) => t.id === templateId) ?? null;
  /**
   * Which services are already signed up **for the registration chosen**
   * (owner request, 24-11-2026). Keyed on both, because a client with three
   * GST registrations takes GSTR-1 three times and the old per-service key
   * hid the second and third from the list.
   */
  const taken = new Set(
    subscriptions.map((s) => `${s.serviceTemplateId}:${s.gstinId ?? ""}`),
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-15 font-semibold">
          Services this client takes
        </h2>
        {mayEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="text-13 underline underline-offset-4"
          >
            {adding ? "Cancel" : "Add a service"}
          </button>
        )}
      </div>

      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      {adding && (
        <form
          onSubmit={saving(
            async (formData) => {
              const result = await saveClientService(clientId, formData);
              setMessage(result);
              if (result?.ok) {
                setAdding(false);
                setTemplateId("");
                setGstinId("");
              }
              return result;
            },
            null,
            startTransition,
          )}
          className="rounded-ledger border-rule bg-surface grid gap-3 border p-4 sm:grid-cols-2"
        >
          {registrations.length > 1 && (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-13 text-ink-muted font-medium">
                For which GST registration
              </span>
              <select
                name="gstinId"
                value={gstinId}
                onChange={(e) => setGstinId(e.target.value)}
                className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
              >
                <option value="">The whole client — not one branch</option>
                {registrations.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label} — {g.gstin}
                  </option>
                ))}
              </select>
              <span className="text-12 text-ink-muted">
                Each registration needs its own row for a GST service, and each
                generates its own work every period. An ITR or an audit is
                signed up once for the whole client.
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">Service</span>
            <select
              name="serviceTemplateId"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            >
              <option value="">— choose —</option>
              {templates
                .filter((t) => !taken.has(`${t.id}:${gstinId}`))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Agreed fee (rupees)
            </span>
            <input
              name="fee"
              key={templateId}
              defaultValue={template?.defaultFee ?? "0"}
              inputMode="decimal"
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Usually done by
            </span>
            <select
              name="defaultAssigneeId"
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            >
              <option value="">— decide each time —</option>
              {team
                .filter(
                  (u) => !template || canExecute(u.role, template.minExecRole),
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Usually reviewed by
            </span>
            <select
              name="defaultReviewerId"
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            >
              <option value="">— decide each time —</option>
              {team
                .filter(
                  (u) => !template || canReview(u.role, template.minReviewRole),
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
            >
              Add service
            </button>
          </div>
        </form>
      )}

      <div className="rounded-ledger border-rule bg-surface border">
        <table className="text-14 w-full">
          <tbody>
            {subscriptions.map((s) => (
              <tr key={s.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2">
                  {s.name}
                  {s.gstinLabel && (
                    <span className="text-13 text-ink-muted">
                      {" · "}
                      {s.gstinLabel}
                    </span>
                  )}
                  {s.stale && (
                    <>
                      <br />
                      <span className="text-12 text-waiting">
                        {s.stale} New work will be created unassigned until this
                        is changed.
                      </span>
                    </>
                  )}
                </td>
                <td className="px-3 py-2">
                  <TierBadge level={s.level} />
                </td>
                <td className="num text-13 px-3 py-2">{s.fee}</td>
                {mayEdit && (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () =>
                          setMessage(await removeClientService(clientId, s.id)),
                        )
                      }
                      className="text-13 underline underline-offset-4 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {subscriptions.length === 0 && (
              <tr>
                <td className="text-ink-muted px-3 py-6 text-center">
                  No services signed up yet. Work can still be created one at a
                  time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
