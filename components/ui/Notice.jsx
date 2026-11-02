/**
 * The block that tells you something about the screen you are on (D106).
 *
 * There were thirty of these written out by hand in `/settings` alone —
 * "no branch has a GSTIN yet", "four rules have not been confirmed",
 * "clients are not being emailed" — and another sixty across the rest of
 * the application, each with its own padding, its own border token and its
 * own idea of whether the first line is bold. Three of them put the tone
 * colour on the text as well as the border, which is the one thing
 * `tests/contrast.test.js` says not to do: a wash is the accent at 12%
 * over an unknown ground, so the accent *on* it measures under 4.5:1.
 * Here the fill is the wash and the text is `ink`, which reads at 16:1 on
 * either ground.
 *
 * It is not a toast and it does not disappear. A condition that makes the
 * system quietly wrong — an unconfirmed due date, a branch that cannot
 * invoice — belongs on the screen that fixes it, for as long as it is
 * true.
 *
 * @param {object} props
 * @param {"warn"|"bad"|"good"|"info"|"flat"} [props.tone]
 * @param {React.ReactNode} [props.title] the first line, in medium
 * @param {string} [props.role] "status" or "alert" when it is the answer to
 *        something the reader just did
 */

const TONE = {
  warn: "border-waiting bg-waiting-wash",
  bad: "border-redpen bg-redpen-wash",
  good: "border-filed bg-filed-wash",
  info: "border-carbon bg-carbon-wash",
  flat: "border-rule bg-surface",
};

export default function Notice({
  tone = "flat",
  title,
  role,
  className = "",
  children,
}) {
  return (
    <div
      role={role}
      className={`rounded-ledger text-13 flex flex-col gap-1 border px-4 py-3 ${
        TONE[tone] ?? TONE.flat
      } ${className}`}
    >
      {title && <p className="text-14 font-medium">{title}</p>}
      {children}
    </div>
  );
}

/**
 * What came back from a server action, in the one shape every form in this
 * application already returns: `{ok}` or `{error}`.
 *
 * Twelve screens wrote this pair of paragraphs out, and nine of them
 * forgot `role="status"` on one of the two — so a saved change was
 * announced to a screen reader and a refused one was not.
 *
 * @param {{message: {ok?: string, error?: string}|null}} props
 */
export function Result({ message }) {
  if (!message?.ok && !message?.error) return null;
  return (
    <Notice
      role="status"
      tone={message.ok ? "good" : "bad"}
      title={message.ok || message.error}
    />
  );
}
