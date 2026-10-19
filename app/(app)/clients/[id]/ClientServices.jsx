"use client";

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
}) {
  const [adding, setAdding] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const template = templates.find((t) => t.id === templateId) ?? null;
  const taken = new Set(subscriptions.map((s) => s.serviceTemplateId));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-20">Services this client takes</h2>
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
          action={(formData) =>
            startTransition(async () => {
              const result = await saveClientService(clientId, formData);
              setMessage(result);
              if (result?.ok) {
                setAdding(false);
                setTemplateId("");
              }
            })
          }
          className="rounded-ledger border-rule bg-surface grid gap-3 border p-4 sm:grid-cols-2"
        >
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
              {templates
                .filter((t) => !taken.has(t.id))
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
              className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Usually done by
            </span>
            <select
              name="defaultAssigneeId"
              className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
              className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
              className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
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
