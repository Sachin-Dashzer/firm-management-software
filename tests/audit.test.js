import { describe, expect, it } from "vitest";
import { hashEntry, verifyChain, GENESIS } from "@/lib/audit/hash";
import { buildDiff, diffForCreate } from "@/lib/audit/diff";
import { describeEntry, fieldLabel, valueLabel } from "@/lib/audit/describe";

/** Build a valid chain of n entries, the way recordAudit would. */
function makeChain(count, overrides = []) {
  const entries = [];
  let prevHash = GENESIS;
  for (let i = 1; i <= count; i += 1) {
    const entry = {
      seq: i,
      ts: new Date(Date.UTC(2026, 9, 1, 4, 30) + i * 60_000),
      userId: "u-1",
      userName: "Riya",
      role: "ca",
      branchId: "b-noi",
      action: "update",
      entityType: "Engagement",
      entityId: `e-${i}`,
      clientId: "c-1",
      diff: { status: ["In progress", "Under review"] },
      note: "",
      ip: "203.0.113.5",
      userAgent: "Chrome",
      prevHash,
      ...overrides[i - 1],
    };
    entry.hash = hashEntry(entry);
    prevHash = entry.hash;
    entries.push(entry);
  }
  return entries;
}

describe("the hash chain", () => {
  it("hashes the same entry to the same value every time", () => {
    const [entry] = makeChain(1);
    expect(hashEntry(entry)).toBe(entry.hash);
    expect(hashEntry(entry)).toHaveLength(64);
  });

  it("does not care what order the fields arrive in", () => {
    const [entry] = makeChain(1);
    const shuffled = Object.fromEntries(
      Object.entries(entry)
        .reverse()
        .filter(([k]) => k !== "hash"),
    );
    expect(hashEntry(shuffled)).toBe(entry.hash);
  });

  it("accepts an intact chain", () => {
    const result = verifyChain(makeChain(50));
    expect(result).toMatchObject({ ok: true, checked: 50 });
  });

  it("accepts an empty collection", () => {
    expect(verifyChain([])).toMatchObject({ ok: true, checked: 0 });
  });

  it("catches an entry edited in the database", () => {
    const entries = makeChain(10);
    entries[4].diff = { status: ["In progress", "Completed"] }; // hash untouched

    const result = verifyChain(entries);
    expect(result.ok).toBe(false);
    expect(result.seq).toBe(5);
    expect(result.problem).toMatch(/altered/);
    expect(result.checked).toBe(4); // everything before it is still sound
  });

  it("catches an entry edited together with its own hash", () => {
    const entries = makeChain(10);
    entries[4].userName = "Someone else";
    entries[4].hash = hashEntry(entries[4]); // rehashed to look right

    const result = verifyChain(entries);
    expect(result.ok).toBe(false);
    // its own hash now matches, but entry 6 no longer follows from it
    expect(result.seq).toBe(6);
    expect(result.problem).toMatch(/does not follow/);
  });

  it("catches a deleted entry", () => {
    const entries = makeChain(10);
    entries.splice(4, 1);

    const result = verifyChain(entries);
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/missing entries/);
  });

  it("catches a chain that does not start at the beginning", () => {
    const entries = makeChain(5).slice(1);
    expect(verifyChain(entries).ok).toBe(false);
  });

  it("can verify a slice, given where it should start", () => {
    const all = makeChain(10);
    const slice = all.slice(5);
    const result = verifyChain(slice, {
      expectedFirstSeq: 6,
      expectedPrevHash: all[4].hash,
    });
    expect(result).toMatchObject({ ok: true, checked: 5 });
  });
});

describe("building the diff", () => {
  it("records only what changed", () => {
    const diff = buildDiff(
      { name: "ABC Traders", status: "Lead", creditDays: 30 },
      { name: "ABC Traders", status: "Active", creditDays: 45 },
    );
    expect(diff).toEqual({
      status: ["Lead", "Active"],
      creditDays: [30, 45],
    });
  });

  it("never writes PAN, Aadhaar, passwords or secrets into the log", () => {
    const diff = buildDiff(
      {
        pan: "AAAPZ1234C",
        aadhaar: "123456789012",
        passwordHash: "scrypt$...",
        totpSecret: "JBSWY3DP",
        portalPassword: "Tr@de2026",
        name: "Before",
      },
      {
        pan: "AAAPZ9999C",
        aadhaar: "999999999999",
        passwordHash: "scrypt$new",
        totpSecret: "NEWSECRET",
        portalPassword: "N3w!",
        name: "After",
      },
    );

    const logged = JSON.stringify(diff);
    for (const secret of [
      "AAAPZ1234C",
      "AAAPZ9999C",
      "123456789012",
      "JBSWY3DP",
      "Tr@de2026",
      "scrypt",
    ]) {
      expect(logged).not.toContain(secret);
    }
    // but the fact that each one changed is still recorded
    expect(diff.pan).toEqual(["•••", "•••"]);
    expect(diff.aadhaar).toEqual(["•••", "•••"]);
    expect(diff.name).toEqual(["Before", "After"]);
  });

  it("ignores bookkeeping fields that change on every save", () => {
    const diff = buildDiff(
      { updatedAt: new Date("2026-01-01"), __v: 1, name: "Same" },
      { updatedAt: new Date("2026-10-16"), __v: 2, name: "Same" },
    );
    expect(diff).toEqual({});
  });

  it("treats null, undefined and missing as the same empty value", () => {
    expect(buildDiff({ a: null }, { a: undefined })).toEqual({});
    expect(buildDiff({}, { a: null })).toEqual({});
    expect(buildDiff({ a: "" }, { a: "" })).toEqual({});
  });

  it("compares dates by value, not by object identity", () => {
    const before = { due: new Date("2026-10-20T00:00:00Z") };
    const after = { due: new Date("2026-10-20T00:00:00Z") };
    expect(buildDiff(before, after)).toEqual({});
  });

  it("summarises a value too big to belong in a log line", () => {
    const diff = buildDiff({ notes: "" }, { notes: "x".repeat(900) });
    expect(diff.notes[1]).toHaveLength(501); // 500 characters and an ellipsis
    expect(
      buildDiff({ items: [] }, { items: Array(400).fill({ a: 1 }) }),
    ).toEqual({ items: [[], "[400 items]"] });
  });

  it("records every set field on a create", () => {
    const diff = diffForCreate({ name: "ABC", status: "Lead", _id: "x" });
    expect(diff).toEqual({ name: [null, "ABC"], status: [null, "Lead"] });
  });
});

describe("plain-language descriptions", () => {
  const base = {
    ts: new Date("2026-10-16T09:00:00Z"),
    userName: "Riya",
    entityType: "Engagement",
    entityId: "e-1",
    diff: {},
  };

  it("writes the sentence from spec section 11", () => {
    const { headline } = describeEntry({
      ...base,
      action: "update",
      diff: { status: ["In progress", "Under review"] },
    });
    expect(headline).toBe(
      "Riya changed status from In progress to Under review",
    );
  });

  it("summarises when several fields changed at once", () => {
    const { headline, changes } = describeEntry({
      ...base,
      action: "update",
      diff: { status: ["a", "b"], assigneeId: ["x", "y"] },
    });
    expect(headline).toBe("Riya updated 2 fields on the engagement");
    expect(changes).toHaveLength(2);
    expect(changes[1]).toBe("assignee: x → y");
  });

  it("has a sentence for the actions that are not field edits", () => {
    expect(describeEntry({ ...base, action: "login" }).headline).toBe(
      "Riya signed in",
    );
    expect(
      describeEntry({ ...base, action: "credential_reveal" }).headline,
    ).toBe("Riya revealed a stored portal password");
    expect(
      describeEntry({ ...base, action: "delete", entityType: "Client" })
        .headline,
    ).toBe("Riya deleted the client");
  });

  it("does not list every field of a newly created record", () => {
    const { headline, changes } = describeEntry({
      ...base,
      action: "create",
      entityType: "Client",
      diff: { name: [null, "ABC"], pan: ["•••", "•••"] },
    });
    expect(headline).toBe("Riya created the client");
    expect(changes).toEqual([]);
  });

  it("appends the reason when there is one", () => {
    const { headline } = describeEntry({
      ...base,
      action: "write_off",
      entityType: "Invoice",
      note: "client wound up",
    });
    expect(headline).toBe("Riya wrote off the invoice — client wound up");
  });

  it("says Someone when the actor is a job rather than a person", () => {
    expect(
      describeEntry({ ...base, userName: "", action: "create" }).headline,
    ).toBe("Someone created the engagement");
  });

  it("turns field names and values into words", () => {
    expect(fieldLabel("statutoryDue")).toBe("statutory due date");
    expect(fieldLabel("clientPartnerId")).toBe("client partner");
    expect(fieldLabel("tradeName")).toBe("trade name");
    expect(fieldLabel("someOtherField")).toBe("some other field");

    expect(valueLabel(null)).toBe("nothing");
    expect(valueLabel("")).toBe("nothing");
    expect(valueLabel(true)).toBe("yes");
    expect(valueLabel(["a", "b"])).toBe("a, b");
    expect(valueLabel("2026-10-16T09:00:00.000Z")).toBe("16-10-2026 14:30");
  });
});



