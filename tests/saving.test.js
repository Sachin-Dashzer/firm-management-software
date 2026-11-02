// @ts-check
import { describe, expect, it, vi } from "vitest";

/**
 * `saving` builds a `FormData` from the submitted `<form>`, which the real
 * constructor will only do for a real `HTMLFormElement`. Under the node
 * environment there is none, so it is stubbed — the tests here are about
 * when the submit runs and when the form is reset, not about the payload.
 */
const transitions = [];
vi.mock("react", () => ({
  startTransition: (fn) => {
    transitions.push(fn);
    fn();
  },
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
    await saving(run)(event);
    expect(transitions).toHaveLength(1);
    expect(run).toHaveBeenCalledOnce();
  });

  it("uses the caller's transition when it has one", async () => {
    transitions.length = 0;
    const mine = vi.fn((fn) => fn());
    const { event } = submit();
    await saving(async () => ({ ok: "Saved" }), undefined, mine)(event);
    expect(mine).toHaveBeenCalledOnce();
    expect(transitions).toHaveLength(0);
  });

  it("clears the form on a save and leaves it alone on a refusal", async () => {
    const saved = submit();
    await saving(async () => ({ ok: "Saved" }), vi.fn())(saved.event);
    expect(saved.form.reset).toHaveBeenCalledOnce();

    const refused = submit();
    const report = vi.fn();
    await saving(async () => ({ error: "No" }), report)(refused.event);
    expect(refused.form.reset).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith({ error: "No" });
  });

  it("reports a thrown action as a refusal and keeps the fields", async () => {
    const { form, event } = submit();
    const report = vi.fn();
    await saving(async () => {
      throw new Error("Not allowed");
    }, report)(event);
    expect(report).toHaveBeenCalledWith({ error: "Not allowed" });
    expect(form.reset).not.toHaveBeenCalled();
  });
});
