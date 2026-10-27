import { describe, it, expect } from "vitest";
import {
  DRAFT_KINDS,
  NOT_KEPT,
  scrubDraft,
  worthKeeping,
  draftAge,
} from "../lib/forms/draft.js";

/**
 * Unfinished forms, kept for the person filling them in (P3-18b).
 *
 * The test that earns its place is the first block. A half-typed client is
 * the firm's data in a new place, and the two fields the system goes to
 * most trouble over — encrypted on the record, redacted in the audit log —
 * have no business sitting in plain text in a draft nobody remembers.
 */

const typed = {
  legalName: "Nirmal Udyog Private Limited",
  tradeName: "Nirmal Udyog",
  pan: "AABCS1429P",
  aadhaar: "123456789012",
  branchId: "b1",
  tradeNameEmpty: "",
  creditDays: "15",
};

describe("a draft never holds the sensitive fields", () => {
  it("drops the PAN and the Aadhaar", () => {
    const { payload } = scrubDraft(typed);
    expect(payload.pan).toBeUndefined();
    expect(payload.aadhaar).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("AABCS1429P");
    expect(JSON.stringify(payload)).not.toContain("123456789012");
  });

  /**
   * Dropped in silence is worse than not kept: somebody comes back to a
   * form with an empty PAN box and does not notice.
   */
  it("says which ones it left out, in words a banner can use", () => {
    expect(scrubDraft(typed).dropped).toEqual(["PAN", "Aadhaar"]);
    expect(Object.values(NOT_KEPT)).toEqual(["PAN", "Aadhaar"]);
  });

  it("says nothing about one that was never typed", () => {
    expect(scrubDraft({ legalName: "A name", pan: "" }).dropped).toEqual([]);
  });

  it("keeps everything else", () => {
    const { payload } = scrubDraft(typed);
    expect(payload).toEqual({
      legalName: "Nirmal Udyog Private Limited",
      tradeName: "Nirmal Udyog",
      branchId: "b1",
      creditDays: "15",
    });
  });

  it("leaves empty boxes out, so a restored form is not full of blanks", () => {
    expect(
      scrubDraft({ a: "", b: "   ", c: null, d: undefined }).payload,
    ).toEqual({});
  });

  it("knows when there is nothing worth keeping", () => {
    expect(worthKeeping(scrubDraft({ pan: "AABCS1429P" }).payload)).toBe(false);
    expect(worthKeeping(scrubDraft(typed).payload)).toBe(true);
  });

  it("keeps one kind of form for now, and names it", () => {
    expect(DRAFT_KINDS).toEqual(["client"]);
  });
});

describe("how old it is, in words", () => {
  const now = new Date("2026-11-10T10:00:00.000Z");
  const ago = (ms) => draftAge(new Date(now.getTime() - ms), now);

  it("reads as a person would say it", () => {
    expect(ago(10_000)).toBe("just now");
    expect(ago(60_000)).toBe("1 minute ago");
    expect(ago(25 * 60_000)).toBe("25 minutes ago");
    expect(ago(3 * 3_600_000)).toBe("3 hours ago");
    expect(ago(50 * 3_600_000)).toBe("2 days ago");
  });
});
