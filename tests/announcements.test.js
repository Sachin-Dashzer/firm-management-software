import { describe, it, expect } from "vitest";
import {
  AUDIENCES,
  AUDIENCE_LABELS,
  isLive,
  reaches,
  ackedBy,
  pending,
  checkAnnouncement,
} from "../lib/firm/announcements.js";
import { threadScope } from "../lib/access/clientScope.js";
import { TEMPLATES } from "../lib/mailer/templates.js";
import { istDate } from "../lib/dates.js";

/**
 * Announcements and the two threads (P3-17b).
 *
 * The test that matters most is the last block: the portal's own query
 * asks for `internal: false`, so the firm's half of a conversation is
 * never read rather than filtered out afterwards. A comment claiming it is
 * internal is what this had before, and it was not true.
 */

const notice = (over = {}) => ({
  title: "Office closed on Friday",
  body: "The Noida office is closed on Friday for the festival.",
  audience: "everyone",
  from: istDate(2026, 11, 10),
  until: istDate(2026, 11, 14),
  needsAck: false,
  acknowledgements: [],
  ...over,
});

describe("an announcement is up between its dates, in IST", () => {
  it("is up on the first and the last day", () => {
    expect(isLive(notice(), istDate(2026, 11, 10))).toBe(true);
    expect(isLive(notice(), istDate(2026, 11, 14))).toBe(true);
  });

  it("is not up before or after", () => {
    expect(isLive(notice(), istDate(2026, 11, 9))).toBe(false);
    expect(isLive(notice(), istDate(2026, 11, 15))).toBe(false);
  });

  /** No end date means until somebody takes it down. */
  it("stays up with no end date", () => {
    expect(isLive(notice({ until: null }), istDate(2027, 4, 1))).toBe(true);
  });

  it("is not up once it has been taken down", () => {
    expect(
      isLive(notice({ deletedAt: new Date() }), istDate(2026, 11, 11)),
    ).toBe(false);
  });

  it("reads the Indian day rather than the UTC one", () => {
    // 22:00 IST on the last day is still the last day
    const late = new Date(istDate(2026, 11, 14).getTime() + 22 * 3_600_000);
    expect(isLive(notice(), late)).toBe(true);
  });
});

describe("the audience is a rule, not a list of names", () => {
  const anil = { id: "1", role: "employee", branchIds: ["noi"] };
  const priya = { id: "2", role: "ca", branchIds: ["ldh"] };

  it("offers three audiences, each with words for the screen", () => {
    expect(AUDIENCES).toEqual(["everyone", "branch", "role"]);
    for (const key of AUDIENCES) {
      expect(AUDIENCE_LABELS[key], key).toBeTruthy();
    }
  });

  it("reaches everybody when it says everybody", () => {
    expect(reaches(notice(), anil)).toBe(true);
    expect(reaches(notice(), priya)).toBe(true);
  });

  it("reaches one office", () => {
    const row = notice({ audience: "branch", branchId: "noi" });
    expect(reaches(row, anil)).toBe(true);
    expect(reaches(row, priya)).toBe(false);
  });

  it("reaches one role", () => {
    const row = notice({ audience: "role", role: "ca" });
    expect(reaches(row, priya)).toBe(true);
    expect(reaches(row, anil)).toBe(false);
  });

  /**
   * An audience nobody recognises reaches nobody. The other way round — a
   * typo quietly addressing the whole firm — is how something meant for
   * two people goes to forty.
   */
  it("reaches nobody when the audience is not one it knows", () => {
    expect(reaches(notice({ audience: "partners-only" }), priya)).toBe(false);
    expect(reaches(null, priya)).toBe(false);
  });
});

describe("acknowledgement records who has read it, and never blocks", () => {
  const people = [
    { _id: "1", name: "Anil Mehra", role: "employee", branchIds: ["noi"] },
    { _id: "2", name: "Priya Nair", role: "ca", branchIds: ["ldh"] },
    { _id: "3", name: "Ravi Kumar", role: "ca", branchIds: ["noi"] },
  ];

  it("asks nobody when it was not asked for", () => {
    expect(pending(notice(), people)).toEqual([]);
  });

  it("names everybody it reaches who has not read it", () => {
    const row = notice({ needsAck: true });
    expect(pending(row, people).map((person) => person.name)).toEqual([
      "Anil Mehra",
      "Priya Nair",
      "Ravi Kumar",
    ]);
  });

  it("drops the ones who have", () => {
    const row = notice({
      needsAck: true,
      acknowledgements: [{ userId: "2", name: "Priya Nair", at: new Date() }],
    });
    expect(ackedBy(row, "2")).toBe(true);
    expect(ackedBy(row, "1")).toBe(false);
    expect(pending(row, people).map((person) => person.name)).toEqual([
      "Anil Mehra",
      "Ravi Kumar",
    ]);
  });

  it("asks only the audience, not the firm", () => {
    const row = notice({ needsAck: true, audience: "role", role: "ca" });
    expect(pending(row, people).map((person) => person.name)).toEqual([
      "Priya Nair",
      "Ravi Kumar",
    ]);
  });
});

describe("a draft announcement is checked before it goes up", () => {
  it("takes a good one", () => {
    expect(checkAnnouncement(notice())).toBe(null);
  });

  it("refuses an empty title or body", () => {
    expect(checkAnnouncement(notice({ title: "Hi" }))).toMatch(
      /Give it a title/,
    );
    expect(checkAnnouncement(notice({ body: "soon" }))).toMatch(
      /Write the announcement/,
    );
  });

  it("refuses an audience with nothing chosen behind it", () => {
    expect(checkAnnouncement(notice({ audience: "branch" }))).toMatch(
      /which office/,
    );
    expect(checkAnnouncement(notice({ audience: "role" }))).toMatch(
      /which role/,
    );
  });

  it("refuses one that would come down before it goes up", () => {
    expect(
      checkAnnouncement(
        notice({ from: istDate(2026, 11, 14), until: istDate(2026, 11, 10) }),
      ),
    ).toMatch(/come down before it goes up/);
  });

  it("has a template behind it so the words can be changed in settings", () => {
    expect(TEMPLATES.announcement.audience).toBe("team");
  });
});

describe("the two threads are two queries, not two filters", () => {
  const person = { kind: "client", clientId: "c1", name: "Suresh" };

  /**
   * The flag has been on every comment since Step 5 and until P3-17b
   * **nothing read it**: the box said "Internal only" and clearing it
   * changed a boolean no query filtered on. This is the query that makes
   * the tick mean something.
   */
  it("asks the database for the client's half only", () => {
    const scope = threadScope(person, ["e1", "e2"]);
    expect(scope.internal).toBe(false);
    expect(scope.clientId).toBe("c1");
    expect(scope.entityType).toBe("Engagement");
    expect(scope.entityId).toEqual({ $in: ["e1", "e2"] });
  });

  it("reads the firm's notes and the client's own messages, and nothing else", () => {
    expect(threadScope(person, []).kind).toEqual({
      $in: ["Note", "Client message"],
    });
  });

  it("refuses to build a scope for anything but a client session", () => {
    expect(() => threadScope({ kind: "staff", id: "u1" }, [])).toThrow(
      /client portal session/,
    );
  });

  it("sends the client's half as a client-facing message", () => {
    expect(TEMPLATES.clientThreadMessage.audience).toBe("client");
    expect(TEMPLATES.clientReplied.audience).toBe("team");
  });
});
