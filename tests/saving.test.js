// @ts-check
import { describe, expect, it, vi } from "vitest";

/**
 * `saving` builds a `FormData` from the submitted `<form>`, which the real
 * constructor will only do for a real `HTMLFormElement`. Under the node
 * environment there is none, so it is stubbed — the tests here are about
 * when the submit runs and when the form is reset, not about the payload.
 */
/**
 * The submit is asynchronous, and since #8 it has one more await in it —
 * `runAction`, which asks whether the session is still there before it
 * blames anything else. So the transition keeps the promise and the tests
 * wait for it, rather than relying on it landing in one microtask.
 */
const transitions = [];
const flush = () => Promise.all(transitions.splice(0));
vi.mock("react", () => ({
  startTransition: (fn) => {
    transitions.push(fn());
  },
}));
/** Whether /api/auth/session still has a user: see runAction (#8). */
let sessionUser = { name: "Riya" };
vi.stubGlobal("fetch", async () => ({
  ok: true,
  json: async () => (sessionUser ? { user: sessionUser } : {}),
}));
vi.stubGlobal(
  "FormData",
  class {
    constructor(form) {
      this.form = form;
    }
  },
);

const { saving } = await import("@/lib/forms/saving");

/** A submit event over a form that only records that it was reset. */
function submit() {
  const form = { reset: vi.fn() };
  return { form, event: { preventDefault() {}, currentTarget: form } };
}

describe("saving", () => {
  it("runs the submit inside React's transition when given none", async () => {
    transitions.length = 0;
    const run = vi.fn(async () => ({ ok: "Saved" }));
    const { event } = submit();
    saving(run)(event);
    expect(transitions).toHaveLength(1);
    await flush();
    expect(run).toHaveBeenCalledOnce();
  });

  it("uses the caller's transition when it has one", async () => {
    transitions.length = 0;
    const mine = vi.fn((fn) => {
      transitions.push(fn());
    });
    const { event } = submit();
    saving(async () => ({ ok: "Saved" }), undefined, mine)(event);
    expect(mine).toHaveBeenCalledOnce();
    await flush();
  });

  it("clears the form on a save and leaves it alone on a refusal", async () => {
    const saved = submit();
    saving(async () => ({ ok: "Saved" }), vi.fn())(saved.event);
    await flush();
    expect(saved.form.reset).toHaveBeenCalledOnce();

    const refused = submit();
    const report = vi.fn();
    saving(async () => ({ error: "No" }), report)(refused.event);
    await flush();
    expect(refused.form.reset).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith({ error: "No" });
  });

  it("clears the form when the action hands back nothing", async () => {
    // `runAction` passes `undefined` through untouched on purpose: it is
    // what tells "returned nothing" from "was refused" (#8)
    const { form, event } = submit();
    saving(async () => undefined, vi.fn())(event);
    await flush();
    expect(form.reset).toHaveBeenCalledOnce();
  });

  it("reports a thrown action as a refusal and keeps the fields", async () => {
    // the session is alive, so the refusal is reported in its own words
    sessionUser = { name: "Riya" };
    const { form, event } = submit();
    const report = vi.fn();
    saving(async () => {
      throw new Error("Not allowed");
    }, report)(event);
    await flush();
    expect(report).toHaveBeenCalledWith({ error: "Not allowed" });
    expect(form.reset).not.toHaveBeenCalled();
  });

  /** #8: the one refusal nobody could read before. */
  it("says the session has gone when that is why it failed", async () => {
    sessionUser = null;
    const { form, event } = submit();
    const report = vi.fn();
    saving(async () => {
      throw new Error("An unexpected response was received from the server");
    }, report)(event);
    await flush();

    const said = report.mock.calls[0][0];
    expect(said.signedOut).toBe(true);
    expect(said.error).toContain("signed out");
    // and the form keeps everything, which is the whole point
    expect(form.reset).not.toHaveBeenCalled();
  });
});
