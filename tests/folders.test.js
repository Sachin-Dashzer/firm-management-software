import { describe, it, expect } from "vitest";
import { folderNames, groupByFolder } from "../lib/documents/folders.js";

/**
 * Folders on a client's files (owner, 23-11-2026).
 *
 * The thing that must hold: nothing is ever dropped. A folder is a label,
 * so every file shows up exactly once whether it is filed or not — a file
 * that vanished from the list because its folder was blank, or a stray
 * space, would look deleted to the person looking for it.
 */

const files = [
  { id: "1", name: "HDFC April.pdf", kind: "Bank statements" },
  { id: "2", name: "Scan_0012.pdf", kind: "" },
  { id: "3", name: "GSTR-3B Mar.pdf", kind: "GST returns" },
  { id: "4", name: "HDFC May.pdf", kind: " Bank statements " },
  { id: "5", name: "WhatsApp Image.jpg" },
];

describe("grouping files by folder", () => {
  it("keeps every file, once", () => {
    const groups = groupByFolder(files);
    const ids = groups.flatMap((group) => group.docs.map((d) => d.id)).sort();
    expect(ids).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("puts the folders in order and the unfiled pile last", () => {
    expect(groupByFolder(files).map((group) => group.folder)).toEqual([
      "Bank statements",
      "GST returns",
      "",
    ]);
  });

  it("reads a padded folder name as the same folder", () => {
    const [bank] = groupByFolder(files);
    expect(bank.docs.map((d) => d.id)).toEqual(["1", "4"]);
  });

  it("lists the folders in use and nothing else", () => {
    expect(folderNames(files)).toEqual(["Bank statements", "GST returns"]);
  });

  it("has no folders, and no empty heading, before anything is filed", () => {
    const loose = [{ id: "a", name: "a.pdf" }];
    expect(folderNames(loose)).toEqual([]);
    expect(groupByFolder(loose)).toEqual([{ folder: "", docs: loose }]);
  });
});
