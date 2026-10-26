import { describe, it, expect } from "vitest";
import {
  recordSubmission,
  accept,
  requestReplacement,
  markNotRequired,
  request,
  clientCannotProvide,
  clientDelegates,
  clientAsks,
  answerClient,
  isSettled,
  isWaitingOnClient,
  needsReview,
  clientLabel,
  outstandingSummary,
  blockingItems,
  ACCEPTED,
  RECEIVED,
  FORMAT_CHECKED,
  REPLACEMENT,
  NOT_REQUIRED,
  REQUESTED,
  LEGACY_VERIFIED,
} from "../lib/engagements/checklist.js";

/**
 * The life of one requested document (P3-2).
 *
 * The edge that matters: a replacement is a new file, and every check
 * performed on the old one has to stop applying to it. If an acceptance
 * survives a re-upload, the system is vouching for a file nobody opened.
 *
 * The second edge: a format check is not an acceptance. The automatic check
 * can say a spreadsheet has the right columns. It cannot say it is the right
 * client's, for the right month, complete and legible.
 */

const ACTOR = { id: "u1", name: "Ritika Chandra" };

const item = (over = {}) => ({
  name: "Purchase register, September",
  side: "client",
  mandatory: true,
  status: REQUESTED,
  submissionCount: 0,
  acceptedSubmission: null,
  acceptedBy: null,
  acceptedByName: "",
  rejectReason: "",
  notRequiredReason: "",
  clientReply: null,
  ...over,
});

describe("a submission arriving", () => {
  it("lands as Received when nothing checked it", () => {
    const i = item();
    const n = recordSubmission(i);
    expect(n).toBe(1);
    expect(i.status).toBe(RECEIVED);
    expect(needsReview(i)).toBe(true);
  });

  it("lands as Format checked when the automatic check passed", () => {
    const i = item();
    recordSubmission(i, { formatOk: true });
    expect(i.status).toBe(FORMAT_CHECKED);
    // passing the format check still leaves it for a person
    expect(isSettled(i)).toBe(false);
    expect(needsReview(i)).toBe(true);
  });

  it("counts up with each one", () => {
    const i = item();
    recordSubmission(i);
    recordSubmission(i);
    expect(recordSubmission(i)).toBe(3);
  });

  it("answers a client who said they could not provide it", () => {
    const i = item();
    clientCannotProvide(i, { note: "bank has not issued it", byName: "Rohit" });
    recordSubmission(i);
    // sending the thing settles the question of not having it
    expect(i.clientReply).toBeNull();
  });
});

describe("a person accepts, not the format check", () => {
  it("accepts a received file and records who did", () => {
    const i = item();
    recordSubmission(i);
    const out = accept(i, ACTOR);
    expect(out.ok).toBe(true);
    expect(i.status).toBe(ACCEPTED);
    expect(i.acceptedSubmission).toBe(1);
    expect(i.acceptedByName).toBe("Ritika Chandra");
    expect(isSettled(i)).toBe(true);
  });

  it("refuses when nothing has arrived", () => {
    const out = accept(item(), ACTOR);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/nothing to accept/i);
  });

  it("refuses to accept twice", () => {
    const i = item();
    recordSubmission(i);
    accept(i, ACTOR);
    expect(accept(i, ACTOR).ok).toBe(false);
  });
});

describe("a replacement clears every earlier check", () => {
  it("drops the acceptance when a new file arrives", () => {
    const i = item();
    recordSubmission(i, { formatOk: true });
    accept(i, ACTOR);
    expect(i.acceptedSubmission).toBe(1);

    recordSubmission(i);

    // the system must not keep vouching for a file nobody looked at
    expect(i.status).toBe(RECEIVED);
    expect(i.acceptedSubmission).toBeNull();
    expect(i.acceptedBy).toBeNull();
    expect(isSettled(i)).toBe(false);
  });

  it("does not carry an old format check onto a new file", () => {
    const i = item();
    recordSubmission(i, { formatOk: true });
    expect(i.status).toBe(FORMAT_CHECKED);

    recordSubmission(i, { formatOk: false });
    expect(i.status).toBe(RECEIVED);
  });

  it("ties acceptance to the submission it was given for", () => {
    const i = item();
    recordSubmission(i);
    recordSubmission(i);
    accept(i, ACTOR);
    expect(i.acceptedSubmission).toBe(2);
  });
});

describe("sending it back", () => {
  it("needs words the client can act on", () => {
    const i = item();
    recordSubmission(i);
    const out = requestReplacement(i, "bad");
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/client can act on/i);
  });

  it("keeps the reason on the record and waits on the client again", () => {
    const i = item();
    recordSubmission(i);
    const out = requestReplacement(
      i,
      "these are August challans; we need September",
    );
    expect(out.ok).toBe(true);
    expect(i.status).toBe(REPLACEMENT);
    expect(i.rejectReason).toMatch(/August/);
    expect(isWaitingOnClient(i)).toBe(true);
    expect(isSettled(i)).toBe(false);
  });

  it("undoes an acceptance that should not have happened", () => {
    const i = item();
    recordSubmission(i);
    accept(i, ACTOR);
    requestReplacement(i, "wrong company's register entirely");
    expect(i.acceptedSubmission).toBeNull();
    expect(isSettled(i)).toBe(false);
  });

  it("refuses when nothing ever arrived", () => {
    expect(requestReplacement(item(), "a good long reason").ok).toBe(false);
  });
});

describe("deciding it is not needed", () => {
  it("needs a reason, because a waived mandatory document is asked about", () => {
    const out = markNotRequired(item(), "no", ACTOR);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/why/i);
  });

  it("settles the item with the reason recorded", () => {
    const i = item();
    const out = markNotRequired(
      i,
      "client has no vehicle, so no logbook exists",
      ACTOR,
    );
    expect(out.ok).toBe(true);
    expect(i.status).toBe(NOT_REQUIRED);
    expect(i.notRequiredReason).toMatch(/logbook/);
    expect(isSettled(i)).toBe(true);
  });
});

describe("what the client says back", () => {
  it("records that they cannot produce it", () => {
    const i = item();
    const out = clientCannotProvide(i, {
      note: "the bank has not issued September yet",
      byName: "Rohit Jaiswal",
    });
    expect(out.ok).toBe(true);
    expect(i.clientReply.kind).toBe("cannot");
    // still outstanding: the firm has to decide what to do about it
    expect(isWaitingOnClient(i)).toBe(true);
    expect(isSettled(i)).toBe(false);
  });

  it("takes a delegate with a way to reach them", () => {
    const i = item();
    const out = clientDelegates(i, {
      name: "Meena Gupta",
      contact: "99990 71263",
      byName: "Rohit Jaiswal",
    });
    expect(out.ok).toBe(true);
    expect(out.delegate.name).toBe("Meena Gupta");
    expect(i.clientReply.kind).toBe("delegated");
  });

  it("refuses a delegate nobody can reach", () => {
    expect(
      clientDelegates(item(), {
        name: "Meena Gupta",
        contact: "",
        byName: "Rohit",
      }).ok,
    ).toBe(false);
  });

  it("records a question and treats it as outstanding until answered", () => {
    const i = item();
    clientAsks(i, {
      question: "Do you need the current account or all of them?",
      byName: "Rohit Jaiswal",
    });
    expect(isWaitingOnClient(i)).toBe(true);

    const out = answerClient(i, "All accounts, please.", ACTOR);
    expect(out.ok).toBe(true);
    expect(i.clientReply.answer).toMatch(/All accounts/);
    // answered, but they still have not sent the register
    expect(isSettled(i)).toBe(false);
  });

  it("will not answer a question that was never asked", () => {
    expect(answerClient(item(), "Sure.", ACTOR).ok).toBe(false);
  });
});

describe("what the client is shown", () => {
  it("does not expose the format check, which is the firm's business", () => {
    const i = item();
    recordSubmission(i, { formatOk: true });
    expect(clientLabel(i)).toBe("With us for checking");
  });

  it("asks plainly for a replacement", () => {
    const i = item();
    recordSubmission(i);
    requestReplacement(i, "these are August challans, we need September");
    expect(clientLabel(i)).toBe("Please send a replacement");
  });

  it("thanks them once it is accepted", () => {
    const i = item();
    recordSubmission(i);
    accept(i, ACTOR);
    expect(clientLabel(i)).toBe("Received, thank you");
  });

  it("reads a pre-P3-2 Verified row as accepted", () => {
    const i = item({ status: LEGACY_VERIFIED });
    expect(isSettled(i)).toBe(true);
    expect(clientLabel(i)).toBe("Received, thank you");
  });
});

describe("the completion gate", () => {
  it("counts a waived item as settled, so it cannot block for ever", () => {
    const waived = item();
    markNotRequired(waived, "no vehicle, so no logbook exists", ACTOR);
    const engagement = { checklist: [waived] };
    // the old gate demanded Verified and nothing else
    expect(blockingItems(engagement)).toHaveLength(0);
  });

  it("still blocks on a mandatory item nobody has settled", () => {
    const engagement = { checklist: [item(), item()] };
    expect(blockingItems(engagement)).toHaveLength(2);
  });

  it("ignores optional items", () => {
    const engagement = { checklist: [item({ mandatory: false })] };
    expect(blockingItems(engagement)).toHaveLength(0);
  });

  it("accepts a pre-P3-2 Verified row", () => {
    const engagement = { checklist: [item({ status: LEGACY_VERIFIED })] };
    expect(blockingItems(engagement)).toHaveLength(0);
  });
});

describe("the one-line summary", () => {
  it("separates waiting from needing a look from stuck", () => {
    const waiting = item({ name: "Bank statement" });
    request(waiting);

    const arrived = item({ name: "Sales register" });
    recordSubmission(arrived, { formatOk: true });

    const done = item({ name: "Purchase register" });
    recordSubmission(done);
    accept(done, ACTOR);

    const stuck = item({ name: "Stock statement" });
    clientCannotProvide(stuck, { note: "not counted yet", byName: "Rohit" });

    const asked = item({ name: "Form 16A" });
    clientAsks(asked, { question: "Which quarter?", byName: "Rohit" });

    const summary = outstandingSummary({
      checklist: [waiting, arrived, done, stuck, asked, item({ side: "firm" })],
    });

    expect(summary.total).toBe(5);
    expect(summary.settled).toBe(1);
    expect(summary.toCheck).toBe(1);
    expect(summary.stuck).toBe(1);
    expect(summary.asked).toBe(1);
    expect(summary.names.toCheck).toEqual(["Sales register"]);
  });
});
