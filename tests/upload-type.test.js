import { describe, it, expect } from "vitest";
import {
  ALLOWED_TYPES,
  TYPES_BY_EXTENSION,
  OLD_OFFICE_TYPES,
  checkDetectedType,
} from "../lib/storage/types.js";

/**
 * The type a file really is (spec section 6).
 *
 * The gateway reads the bytes with PHP's `finfo` and reports what it found.
 * These tests pin the two halves of what the app does with that answer:
 * refuse anything the firm does not accept, and refuse a file whose contents
 * disagree with the name it was given. The PHP side cannot run here, so the
 * answers finfo actually gives on BigRock's shared hosting are written in as
 * fixtures.
 */

const PDF = "application/pdf";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("a file that is what it says it is", () => {
  it.each([
    ["statement.pdf", PDF],
    ["scan.PDF", PDF],
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["seal.png", "image/png"],
    ["books.xlsx", XLSX],
    ["letter.docx", DOCX],
    ["ledger.csv", "text/csv"],
    ["notes.txt", "text/plain"],
    ["papers.zip", "application/zip"],
  ])("accepts %s read as %s", (filename, detected) => {
    expect(checkDetectedType({ filename, detected })).toBeNull();
  });

  it("accepts an .xlsx or .docx a host reports only as a zip", () => {
    // an OOXML file is a zip, and plenty of shared hosts say no more than that
    expect(
      checkDetectedType({
        filename: "books.xlsx",
        detected: "application/zip",
      }),
    ).toBeNull();
    expect(
      checkDetectedType({
        filename: "letter.docx",
        detected: "application/x-zip-compressed",
      }),
    ).toBeNull();
  });
});

describe("the old binary Office formats, as shared hosting reports them", () => {
  it("accepts a .xls read as application/CDFV2", () => {
    expect(
      checkDetectedType({
        filename: "trial-balance.xls",
        detected: "application/CDFV2",
      }),
    ).toBeNull();
  });

  it("accepts a .doc read as application/x-ole-storage", () => {
    expect(
      checkDetectedType({
        filename: "engagement-letter.doc",
        detected: "application/x-ole-storage",
      }),
    ).toBeNull();
  });

  it.each(OLD_OFFICE_TYPES)("accepts a .xls and a .doc read as %s", (mime) => {
    expect(checkDetectedType({ filename: "a.xls", detected: mime })).toBeNull();
    expect(checkDetectedType({ filename: "a.doc", detected: mime })).toBeNull();
  });

  it("reads the type whatever case the host answers in", () => {
    // the ticket carries finfo's own spelling, which upload.php compares
    // exactly; this side must not care about the capitals
    expect(ALLOWED_TYPES).toContain("application/CDFV2");
    expect(
      checkDetectedType({ filename: "a.xls", detected: "application/cdfv2" }),
    ).toBeNull();
    expect(
      checkDetectedType({ filename: "a.xls", detected: "APPLICATION/CDFV2" }),
    ).toBeNull();
  });

  it("does not let an OLE file in under some other name", () => {
    expect(
      checkDetectedType({
        filename: "notice.pdf",
        detected: "application/CDFV2",
      }),
    ).toMatch(/not really a \.pdf file/);
  });
});

describe("a file renamed to look like something else", () => {
  it("refuses a text file called .pdf, and says so in plain words", () => {
    const refusal = checkDetectedType({
      filename: "bank-statement.pdf",
      detected: "text/plain",
    });
    expect(refusal).toBe(
      "This is not really a .pdf file — its contents are text/plain. Please upload the real file.",
    );
  });

  it("refuses a .jpg that is really a PDF, and a .xlsx that is really a PDF", () => {
    expect(checkDetectedType({ filename: "photo.jpg", detected: PDF })).toMatch(
      /not really a \.jpg file/,
    );
    expect(
      checkDetectedType({ filename: "books.xlsx", detected: PDF }),
    ).toMatch(/not really a \.xlsx file/);
  });

  it("names the extension the person used, not the one we expected", () => {
    expect(
      checkDetectedType({ filename: "SCAN.PNG", detected: "image/jpeg" }),
    ).toMatch(/not really a \.png file/);
  });
});

describe("what the firm will not take at all", () => {
  it.each([
    ["invoice.pdf", "application/x-dosexec"],
    ["macro.xls", "application/x-msdownload"],
    ["page.pdf", "text/html"],
  ])("refuses %s read as %s", (filename, detected) => {
    expect(checkDetectedType({ filename, detected })).toBe(
      `${detected} is not accepted.`,
    );
  });

  it("refuses a type the gateway could not work out", () => {
    expect(checkDetectedType({ filename: "a.pdf", detected: "" })).toBe(
      "That kind of file is not accepted.",
    );
    expect(checkDetectedType({ filename: "a.pdf" })).toBe(
      "That kind of file is not accepted.",
    );
  });
});

describe("an extension the check holds no opinion about", () => {
  it("accepts it as long as the firm takes that type", () => {
    // the gateway has already refused anything outside ALLOWED_TYPES, so
    // refusing a name we simply do not recognise would only cost a phone call
    expect(
      checkDetectedType({ filename: "deed.odt", detected: PDF }),
    ).toBeNull();
    expect(
      checkDetectedType({ filename: "noextension", detected: PDF }),
    ).toBeNull();
  });

  it("still refuses a type the firm does not take", () => {
    expect(
      checkDetectedType({
        filename: "deed.odt",
        detected: "application/x-dosexec",
      }),
    ).toBe("application/x-dosexec is not accepted.");
  });
});

describe("the two lists stay in step", () => {
  it("expects nothing of an extension that the firm would refuse anyway", () => {
    const allowed = ALLOWED_TYPES.map((t) => t.toLowerCase());
    for (const [extension, types] of Object.entries(TYPES_BY_EXTENSION)) {
      for (const type of types) {
        expect(
          allowed,
          `${extension} expects ${type}, which ALLOWED_TYPES does not carry`,
        ).toContain(type.toLowerCase());
      }
    }
  });

  it("carries the three old Office types the gateway will report", () => {
    for (const type of OLD_OFFICE_TYPES) expect(ALLOWED_TYPES).toContain(type);
  });
});
