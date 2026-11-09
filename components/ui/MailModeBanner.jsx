/**
 * Whether email is going to real people, said in one line (QA 09-11-2026, #2).
 *
 * A firm testing its own system has to be able to tell at a glance which it
 * is. The QA run found the opposite: the screen described a transport the
 * sender was not using, while a quotation went to a real client's address.
 *
 * Both screens that talk about email show this, from the same values the
 * sender reads, so neither can describe a world the sender does not live in.
 *
 * @param {object} props
 * @param {string} [props.redirectTo] EMAIL_REDIRECT_TO, blank when off
 * @param {string} props.transport    "smtp" or "log", from transportName()
 * @param {boolean} [props.enabled]   EMAIL_ENABLED
 */
export default function MailModeBanner({
  redirectTo = "",
  transport,
  enabled = true,
}) {
  const [tone, line] = !enabled
    ? [
        "bad",
        "Email is switched off for the whole system. Messages are composed and logged, and nothing is posted.",
      ]
    : transport === "log"
      ? [
          "soon",
          "Test mode: nothing is posted at all. Messages are written to the server log, because EMAIL_TRANSPORT is set to log.",
        ]
      : redirectTo
        ? ["soon", `Test mode: all email is going to ${redirectTo}.`]
        : ["live", "Live: email goes to real recipients."];

  const skin =
    tone === "bad"
      ? "border-redpen bg-redpen-wash text-redpen"
      : tone === "soon"
        ? "border-waiting bg-waiting-wash text-waiting"
        : "border-filed bg-filed-wash text-filed";

  return (
    <p
      role="status"
      className={`rounded-ledger text-13 border px-3 py-2 font-medium ${skin}`}
    >
      {line}
    </p>
  );
}
