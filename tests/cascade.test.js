import { describe, expect, it, vi } from "vitest";
import { cascadeSoftDelete } from "@/lib/cascade";

/** A stand-in collection: it only has to remember what it was asked. */
function fakeModel(rows) {
  const made = rows.map(() => ({ softDelete: vi.fn(async () => {}) }));
  return {
    made,
    find: (filter) => {
      made.filter = filter;
      return { session: async () => made };
    },
    deleteMany: vi.fn(async () => ({ deletedCount: rows.length })),
  };
}

const session = { id: "the audit transaction" };
const byClient = (ids) => ({ clientId: { $in: ids } });

describe("cascading a delete", () => {
  it("soft-deletes every dependant inside the caller's transaction", async () => {
    const jobs = fakeModel([1, 2]);
    const files = fakeModel([1]);

    const went = await cascadeSoftDelete(
      [
        ["job", jobs, byClient],
        ["file", files, byClient],
      ],
      ["c-1"],
      "u-1",
      session,
    );

    expect(went).toEqual(["2 jobs", "1 file"]);
    for (const row of [...jobs.made, ...files.made]) {
      expect(row.softDelete).toHaveBeenCalledWith("u-1", { session });
    }
  });

  it("leaves nothing in the sentence for a collection with no rows", async () => {
    const empty = fakeModel([]);
    expect(
      await cascadeSoftDelete(
        [["job", empty, byClient]],
        ["c-1"],
        "u",
        session,
      ),
    ).toEqual([]);
  });

  // notifications are the one hard delete: a nudge about a deleted job is a
  // dead link, and they carry no deletedAt to set
  it("removes notifications outright", async () => {
    const notifications = fakeModel([1, 2, 3]);

    const went = await cascadeSoftDelete(
      [["notification", notifications, byClient, "hard"]],
      ["c-1"],
      "u-1",
      session,
    );

    expect(went).toEqual(["3 notifications"]);
    expect(notifications.deleteMany).toHaveBeenCalledWith(
      { clientId: { $in: ["c-1"] } },
      { session },
    );
  });
});
