// @ts-check

import { describe, it, expect } from "vitest";
import { keptFile } from "../lib/forms/keptFile.js";

/**
 * The three two-step uploads — client import, client round-trip, data lab —
 * all read the file twice from the same input, and React 19 empties that
 * input when it resets the form after the preview's action. The screens then
 * said "The file is no longer attached. Choose it again." about a file that
 * was named on the screen in front of the person.
 *
 * The hook holds a file across the reset, and the one property worth a test
 * is that restoring puts back only the file: the round-trip's `apply` list
 * and the lab's column choices travel on the same `FormData` and must be
 * untouched by it.
 */

const sheet = () =>
  new File(["Legal name\nGood Traders LLP\n"], "clients.csv", {
    type: "text/csv",
  });

function withFile(file) {
  const fd = new FormData();
  if (file) fd.set("file", file);
  return fd;
}

describe("useKeptFile", () => {
  it("puts the file back after the form has been reset", () => {
    const kept = keptFile({ current: null });
    const chosen = sheet();

    kept.keep(withFile(chosen));

    // the reset: the input is empty, so the commit's FormData has no file
    const commit = kept.restore(withFile(null));
    expect(commit.get("file")).toBe(chosen);
  });

  it("leaves every other field on the form alone", () => {
    const kept = keptFile({ current: null });
    kept.keep(withFile(sheet()));

    const commit = withFile(null);
    commit.append("apply", "abc:tradeName");
    commit.append("apply", "def:mobile");
    commit.set("from", "B");

    kept.restore(commit);

    expect(commit.getAll("apply")).toEqual(["abc:tradeName", "def:mobile"]);
    expect(commit.get("from")).toBe("B");
  });

  it("does not overwrite a file the person has chosen again", () => {
    const kept = keptFile({ current: null });
    const first = sheet();
    const second = new File(["x"], "second.csv", { type: "text/csv" });

    kept.keep(withFile(first));
    const commit = kept.restore(withFile(second));

    expect(commit.get("file")).toBe(second);
  });

  it("keeps nothing when the input was empty, and restores nothing", () => {
    const kept = keptFile({ current: null });

    kept.keep(withFile(new File([], "empty.csv")));
    const commit = kept.restore(withFile(null));

    expect(commit.get("file")).toBeNull();
  });
});
