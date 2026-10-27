"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewNotify, sendNotify } from "./notify";

/**
 * Notify, as one action (P3-17a).
 *
 * The preview is the point. Before this, telling somebody meant three
 * different buttons that each sent a different template, and the only way
 * to know what a client would read was to send it and look in the message
 * log. Here the exact text of every message is on screen, per recipient,
 * **before** anything is queued — and it is built by the same function
 * that sends, so it cannot drift.
 *
 * A client's message is marked as a client's message in the preview, with
 * the reminder that it leaves the building. That label is the whole reason
 * somebody reads the preview rather than trusting it.
 */
export default function NotifyPanel({ id, job, client, recipients }) {
  const router = useRouter();
  const [picked, setPicked] = useState([]);
  const [messages, setMessages] = useState(null);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const toClient = recipients.filter((person) => person.side === "client");
  const toTeam = recipients.filter((person) => person.side === "team");

  function run(action, formData) {
    startTransition(async () => {
      const result = await action(id, formData);
      if (result?.error) {
        setMessage({ error: result.error });
        setMessages(null);
        return;
      }
      if (result?.messages) {
        setMessages(result.messages);
        setMessage(null);
        return;
      }
      setMessages(null);
      setMessage(result);
      router.refresh();
    });
  }

  if (recipients.length === 0) {
    return (
      <p className="text-13 text-ink-muted">
        Nobody is on this job but you, and {client} has no contact with an email
        address.
      </p>
    );
  }

  return (
    <form
      action={(formData) => run(previewNotify, formData)}
      className="flex flex-col gap-3"
    >
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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-13 font-medium">Who to tell</legend>
        {toTeam.map((person) => (
          <Tick
            key={person.id}
            person={person}
            picked={picked}
            setPicked={setPicked}
            clear={() => setMessages(null)}
          />
        ))}
        {toClient.length > 0 && (
          <>
            <p className="text-12 text-ink-muted mt-1">
              These leave the building, in your name and the firm&rsquo;s:
            </p>
            {toClient.map((person) => (
              <Tick
                key={person.id}
                person={person}
                picked={picked}
                setPicked={setPicked}
                clear={() => setMessages(null)}
              />
            ))}
          </>
        )}
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-13 font-medium">Subject</span>
        <input
          name="subject"
          required
          onChange={() => setMessages(null)}
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-13 font-medium">Message</span>
        <textarea
          name="body"
          rows={4}
          required
          onChange={() => setMessages(null)}
          placeholder={`About ${job}…`}
          className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
        />
        <span className="text-12 text-ink-muted">
          Your own words. Everything sent from here is logged on Settings →
          Messages.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || picked.length === 0}
          className="rounded-control border-rule bg-surface text-14 h-9 border px-3 disabled:opacity-60"
        >
          Show me what they will get
        </button>
        {messages && (
          <button
            type="submit"
            formAction={(formData) => run(sendNotify, formData)}
            disabled={pending}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
          >
            Send {messages.length}{" "}
            {messages.length === 1 ? "message" : "messages"}
          </button>
        )}
      </div>

      {messages && (
        <ul className="flex flex-col gap-2">
          {messages.map((row) => (
            <li
              key={row.id}
              className={`rounded-ledger border px-3 py-2 ${
                row.side === "client"
                  ? "border-waiting bg-waiting-wash"
                  : "border-rule bg-sunk"
              }`}
            >
              <p className="text-13 font-medium">
                {row.name} · {row.email}
                {row.side === "client" && " · leaves the building"}
              </p>
              <p className="text-13 font-medium">{row.subject}</p>
              <p className="text-13 whitespace-pre-line">{row.text}</p>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function Tick({ person, picked, setPicked, clear }) {
  return (
    <label className="text-14 flex items-start gap-2">
      <input
        type="checkbox"
        name="to"
        value={person.id}
        checked={picked.includes(person.id)}
        onChange={(event) => {
          // a preview is only the truth for the list it was built from
          clear();
          setPicked((all) =>
            event.target.checked
              ? [...all, person.id]
              : all.filter((id) => id !== person.id),
          );
        }}
        className="mt-1"
      />
      <span>
        {person.name}
        <span className="text-12 text-ink-muted block">{person.why}</span>
      </span>
    </label>
  );
}
