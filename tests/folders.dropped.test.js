import { describe, it, expect } from "vitest";
import { chainFor, droppedPaths } from "../lib/folders/dropped.js";

/**
 * Reading a dropped folder back out of `webkitRelativePath` (P3-48d).
 *
 * The bug this covers: every file in a picked folder was sent to the folder
 * being looked at, so "KYC/Aadhaar/noshad.pdf" arrived as a loose
 * "noshad.pdf" and the two folders above it were lost. The paths were being
 * read — they were just never used.
 */

const file = (webkitRelativePath) => ({
  name: webkitRelativePath.split("/").pop(),
  webkitRelativePath,
});

describe("the folders above a dropped file", () => {
  it("keeps the folder that was picked, not just the ones below it", () => {
    expect(chainFor(file("KYC/noshad.pdf"))).toEqual(["KYC"]);
  });

  it("keeps every level, outermost first", () => {
    expect(chainFor(file("KYC/Aadhaar/2025/noshad.pdf"))).toEqual([
      "KYC",
      "Aadhaar",
      "2025",
    ]);
  });

  it("is empty for a file picked on its own", () => {
    expect(chainFor({ name: "PAN.pdf" })).toEqual([]);
    expect(chainFor({ name: "PAN.pdf", webkitRelativePath: "" })).toEqual([]);
  });

  it("drops empty and blank levels rather than making a nameless folder", () => {
    expect(chainFor(file("KYC//  /noshad.pdf"))).toEqual(["KYC"]);
  });
});

describe("a whole folder, file by file", () => {
  const files = [
    file("KYC/noshad.pdf"),
    file("KYC/Aadhaar/imran.png"),
    file("KYC/Aadhaar/amjad.pdf"),
    file("KYC/PAN/imran.png"),
  ];

  it("puts each file under its own folder", () => {
    const paths = droppedPaths(files);
    expect(paths.get(files[0])).toBe("KYC");
    expect(paths.get(files[1])).toBe("KYC/Aadhaar");
    expect(paths.get(files[3])).toBe("KYC/PAN");
  });

  it("gives three folders to make, not one per file", () => {
    expect(new Set(droppedPaths(files).values()).size).toBe(3);
  });

  it("keeps two files of the same name apart, by folder", () => {
    const paths = droppedPaths(files);
    expect(files[1].name).toBe(files[3].name);
    expect(paths.get(files[1])).not.toBe(paths.get(files[3]));
  });
});
