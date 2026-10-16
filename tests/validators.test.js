import { describe, expect, it } from "vitest";
import {
  checkPAN,
  checkGSTIN,
  checkTAN,
  checkCIN,
  checkUdyam,
  checkIEC,
  checkAadhaar,
  checkMobile,
  checkIFSC,
  checkEmail,
  optional,
  panMatchesEntityType,
  verhoeffCheckDigit,
  GST_STATES,
} from "@/lib/validators";

/**
 * The identifiers in these tests are correctly formed but fabricated
 * (CLAUDE.md rule 9: no lorem ipsum, and no real client data either).
 */

describe("PAN", () => {
  it("accepts a well-formed PAN and says whose kind it is", () => {
    expect(checkPAN("AABCS1429P")).toMatchObject({
      ok: true,
      value: "AABCS1429P",
      holderType: "Company",
    });
    expect(checkPAN("AAAPZ1234C").holderType).toBe("Individual");
    expect(checkPAN("AAAHZ1234C").holderType).toBe("HUF");
    expect(checkPAN("AAAFZ1234C").holderType).toBe("Firm / LLP");
  });

  it("tidies what somebody typed", () => {
    expect(checkPAN(" aabcs1429p ").value).toBe("AABCS1429P");
    expect(checkPAN("AABCS-1429-P").value).toBe("AABCS1429P");
  });

  it("rejects the wrong length and the wrong shape", () => {
    expect(checkPAN("AABCS1429").ok).toBe(false);
    expect(checkPAN("AABCS1429PQ").ok).toBe(false);
    expect(checkPAN("AABC51429P").ok).toBe(false); // digit among the letters
    expect(checkPAN("AABCS142AP").ok).toBe(false); // letter among the digits
    expect(checkPAN("").ok).toBe(false);
  });

  it("rejects an impossible holder type in the 4th position", () => {
    const result = checkPAN("AABXS1429P");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/4th character/);
  });

  it("notices a PAN that does not match the entity type chosen", () => {
    expect(panMatchesEntityType("AABCS1429P", "Private Limited")).toBe(true);
    expect(panMatchesEntityType("AABCS1429P", "Individual")).toBe(false);
    expect(panMatchesEntityType("AAAPZ1234C", "Individual")).toBe(true);
    expect(panMatchesEntityType("AAAFZ1234C", "LLP")).toBe(true);
  });
});

describe("GSTIN", () => {
  // 09 = Uttar Pradesh, then the PAN, entity number 1, Z, then the check digit
  // (the check digit is computed, not guessed: 27AAPFU0939F1ZV validates too)
  const valid = "09AABCS1429P1ZZ";

  it("accepts a GSTIN whose check digit is right", () => {
    const result = checkGSTIN(valid);
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      stateCode: "09",
      state: "Uttar Pradesh",
      pan: "AABCS1429P",
    });
  });

  it("catches a single mistyped character through the check digit", () => {
    // one digit changed in the PAN part; everything still looks like a GSTIN
    const result = checkGSTIN("09AABCS1439P1ZZ");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/last character does not match/);
  });

  it("rejects a GSTIN with a state code that does not exist", () => {
    const result = checkGSTIN("45AABCS1429P1ZZ");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not a GST state code/);
  });

  it("rejects the wrong length and a missing Z", () => {
    expect(checkGSTIN("09AABCS1429P1Z").ok).toBe(false);
    expect(checkGSTIN("09AABCS1429P1XZ").ok).toBe(false);
  });

  it("reports a bad PAN inside the GSTIN clearly", () => {
    const result = checkGSTIN("09AABXS1429P1ZZ");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/PAN inside the GSTIN/);
  });

  it("knows the states the firm works in", () => {
    expect(GST_STATES["09"]).toBe("Uttar Pradesh");
    expect(GST_STATES["07"]).toBe("Delhi");
    expect(GST_STATES["03"]).toBe("Punjab");
  });
});

describe("Aadhaar", () => {
  /** Build a valid 12-digit number by computing its own check digit. */
  function validAadhaar(first11) {
    return first11 + verhoeffCheckDigit(first11);
  }

  it("accepts a number whose check digit is right", () => {
    const number = validAadhaar("23456789012");
    expect(checkAadhaar(number)).toMatchObject({ ok: true, value: number });
  });

  it("accepts the spaced form people write", () => {
    const number = validAadhaar("23456789012");
    const spaced = `${number.slice(0, 4)} ${number.slice(4, 8)} ${number.slice(8)}`;
    expect(checkAadhaar(spaced).ok).toBe(true);
  });

  it("catches a transposed pair of digits", () => {
    const number = validAadhaar("23456789012");
    const swapped =
      number.slice(0, 3) + number[4] + number[3] + number.slice(5);
    expect(checkAadhaar(swapped).ok).toBe(false);
  });

  it("rejects the wrong length and a leading 0 or 1", () => {
    expect(checkAadhaar("12345").ok).toBe(false);
    expect(checkAadhaar(validAadhaar("03456789012")).reason).toMatch(
      /never starts/,
    );
    expect(checkAadhaar(validAadhaar("13456789012")).reason).toMatch(
      /never starts/,
    );
  });
});

describe("TAN, CIN, Udyam and IEC", () => {
  it("checks a TAN", () => {
    expect(checkTAN("DELS12345B").ok).toBe(true);
    expect(checkTAN("DEL12345B").ok).toBe(false);
  });

  it("checks a CIN and recognises an LLPIN", () => {
    expect(checkCIN("U17111UP2015PTC071234")).toMatchObject({
      ok: true,
      kind: "CIN",
    });
    expect(checkCIN("AAB-1234")).toMatchObject({ ok: true, kind: "LLPIN" });
    expect(checkCIN("X17111UP2015PTC071234").ok).toBe(false);
  });

  it("formats a Udyam number back the way it is written", () => {
    expect(checkUdyam("UDYAMUP091234567").value).toBe("UDYAM-UP-09-1234567");
    expect(checkUdyam("UDYAM-UP-09-1234567").ok).toBe(true);
    expect(checkUdyam("UDYAM-UP-09-123").ok).toBe(false);
  });

  it("checks an IEC", () => {
    expect(checkIEC("AABCS1429P").ok).toBe(true);
    expect(checkIEC("AABCS").ok).toBe(false);
  });
});

describe("contact details", () => {
  it("accepts Indian mobile numbers and strips the country code", () => {
    expect(checkMobile("9811034567").value).toBe("9811034567");
    expect(checkMobile("+91 98110 34567").value).toBe("9811034567");
    expect(checkMobile("98110-34567").value).toBe("9811034567");
  });

  it("rejects numbers that cannot be Indian mobiles", () => {
    expect(checkMobile("5811034567").ok).toBe(false); // starts with 5
    expect(checkMobile("981103456").ok).toBe(false); // 9 digits
    expect(checkMobile("1204567890").ok).toBe(false); // landline
  });

  it("checks emails and IFSC codes", () => {
    expect(checkEmail(" Rakesh@Example.IN ").value).toBe("rakesh@example.in");
    expect(checkEmail("rakesh@example").ok).toBe(false);
    expect(checkIFSC("hdfc0001234").value).toBe("HDFC0001234");
    expect(checkIFSC("HDFC1001234").ok).toBe(false); // 5th must be 0
  });
});

describe("optional fields", () => {
  it("lets an empty value through but still checks a filled one", () => {
    expect(optional(checkPAN, "")).toEqual({ ok: true, value: "" });
    expect(optional(checkPAN, null)).toEqual({ ok: true, value: "" });
    expect(optional(checkPAN, "   ")).toEqual({ ok: true, value: "" });
    expect(optional(checkPAN, "AABCS1429P").ok).toBe(true);
    expect(optional(checkPAN, "rubbish").ok).toBe(false);
  });
});
