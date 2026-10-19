import { describe, expect, it } from "vitest";
import {
  redactText,
  redactDeep,
  scrubEvent,
  scrubBreadcrumb,
} from "@/lib/observability/scrub";

describe("what may leave the building in an error report", () => {
  it("writes over a PAN, an Aadhaar number and a GSTIN", () => {
    expect(redactText("client ABCDE1234F could not be saved")).toBe(
      "client [pan] could not be saved",
    );
    expect(redactText("aadhaar 4521 8890 1234 rejected")).toBe(
      "aadhaar [aadhaar] rejected",
    );
    // the GSTIN rule runs first, so it is not cut in half by the PAN rule
    expect(redactText("GSTIN 09ABCDE1234F1Z5 is invalid")).toBe(
      "GSTIN [gstin] is invalid",
    );
  });

  it("leaves an ordinary message alone", () => {
    const message = "Engagement NOI-GST-2026-07 is already under review";
    expect(redactText(message)).toBe(message);
  });

  it("does not mistake an invoice number or a date for an Aadhaar", () => {
    expect(redactText("invoice NOI/26-27/0087 for 31-07-2026")).toBe(
      "invoice NOI/26-27/0087 for 31-07-2026",
    );
    // eleven digits is not an Aadhaar; twelve starting with 0 or 1 is not one either
    expect(redactText("ref 12345678901")).toBe("ref 12345678901");
    expect(redactText("ref 012345678901")).toBe("ref 012345678901");
  });

  it("redacts a field by its name, whatever is in it", () => {
    const out = redactDeep({
      clientCode: "PHMG-NOI-0007",
      portalPassword: "incometax123",
      totpSecret: "JBSWY3DPEHPK3PXP",
      nested: { apiToken: "abc", note: "fine" },
    });
    expect(out).toEqual({
      clientCode: "PHMG-NOI-0007",
      portalPassword: "[redacted]",
      totpSecret: "[redacted]",
      nested: { apiToken: "[redacted]", note: "fine" },
    });
  });

  it("stops rather than recursing for ever", () => {
    const deep = {
      a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } },
    };
    expect(() => redactDeep(deep)).not.toThrow();
    expect(JSON.stringify(redactDeep(deep))).toContain("too deep");
  });

  it("throws away the request body, cookies and headers", () => {
    const event = scrubEvent({
      request: {
        url: "https://crm.phmgindia.com/clients/abc?pan=ABCDE1234F",
        method: "POST",
        data: { pan: "ABCDE1234F", aadhaar: "452188901234" },
        cookies: { "authjs.session-token": "ey..." },
        headers: { cookie: "ey...", "user-agent": "Chrome" },
        query_string: "pan=ABCDE1234F",
      },
      user: {
        id: "u-1",
        email: "riya@phmgindia.com",
        ip_address: "203.0.113.5",
      },
    });

    expect(event.request).toEqual({
      url: "https://crm.phmgindia.com/clients/abc",
      method: "POST",
    });
    expect(event.user).toEqual({ id: "u-1" });
  });

  it("still redacts inside a stack trace's own text", () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "duplicate PAN ABCDE1234F on client PHMG-NOI-0007",
          },
        ],
      },
    });
    expect(event.exception.values[0].value).toBe(
      "duplicate PAN [pan] on client PHMG-NOI-0007",
    );
  });

  it("survives an event with nothing in it", () => {
    expect(scrubEvent({})).toEqual({});
    expect(scrubEvent(null)).toBe(null);
  });

  it("drops console breadcrumbs and keeps the rest, redacted", () => {
    expect(
      scrubBreadcrumb({ category: "console", message: "PAN ABCDE1234F" }),
    ).toBe(null);
    expect(
      scrubBreadcrumb({ category: "navigation", message: "to ABCDE1234F" }),
    ).toEqual({ category: "navigation", message: "to [pan]" });
  });
});
