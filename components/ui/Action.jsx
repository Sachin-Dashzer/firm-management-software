"use client";

/**
 * An action control that is shown disabled with its reason, rather than
 * hidden (P3-8).
 *
 * The prototype's point: a button you are not allowed to press should say so
 * before you press it. Hiding it leaves somebody unable to tell a rule from
 * a bug, and the commonest thing they do next is ask a colleague to "try it
 * on your login", which is worse than either.
 *
 * The reason is **visible text, not a tooltip**. A disabled button cannot be
 * focused, so a `title` is unreachable by keyboard and invisible on a phone —
 * which is to say unreachable by exactly the people most likely to need it.
 * `aria-describedby` ties the two together for a screen reader.
 *
 * Server-side enforcement is unchanged and is the actual protection. This is
 * manners.
 *
 * @param {object} props
 * @param {string|null} [props.why] the refusal from `whyNot()`; null to allow
 * @param {() => void} [props.onClick]
 * @param {boolean} [props.pending]
 * @param {"primary"|"plain"|"quiet"} [props.tone]
 * @param {string} [props.id] needed only when two controls share a screen
 */
export default function Action({
  why = null,
  onClick,
  pending = false,
  tone = "primary",
  id,
  type = "button",
  children,
  className = "",
}) {
  const reasonId = why ? `${id ?? "action"}-why` : undefined;

  const look =
    tone === "primary"
      ? "rounded-control bg-carbon text-14 h-9 px-3 font-medium text-on-carbon"
      : tone === "plain"
        ? "rounded-control border-rule bg-paper text-14 h-9 border px-3"
        : "text-13 text-ink-muted hover:text-ink underline underline-offset-4";

  return (
    <span className="flex flex-col gap-1">
      <button
        type={type}
        id={id}
        disabled={pending || Boolean(why)}
        aria-describedby={reasonId}
        onClick={why ? undefined : onClick}
        className={`${look} disabled:opacity-60 ${className}`}
      >
        {children}
      </button>
      {why && (
        <span id={reasonId} className="text-12 text-ink-muted max-w-[40ch]">
          {why}
        </span>
      )}
    </span>
  );
}
