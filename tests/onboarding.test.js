import { describe, it, expect } from "vitest";
import {
  ENTITY_CONFIGS,
  ENTITY_BY_KEY,
  panCharLabel,
} from "../lib/clients/entityTypes.js";
import { onboardingChecks, checksPass } from "../lib/clients/checks.js";
import { ENTITY_TYPES, checkGSTIN } from "../lib/validators.js";
import { validateClient } from "../lib/clients/validate.js";
import { STARTER_CATALOG } from "../lib/services/starter.js";

const SERVICE_CODES = STARTER_CATALOG.map((service) => service.code);

/**
 * The onboarding wizard's two pure pieces: the entity table every step reads,
 * and the checks that decide whether a client may be accepted.
 */

describe("the entity table", () => {
  it("covers every entity type the client record allows", () => {
    expect(ENTITY_CONFIGS.map((e) => e.key).sort()).toEqual(
      [...ENTITY_TYPES].sort(),
    );
  });

  it("gives every entity documents, registrations and a pack", () => {
    for (const entity of ENTITY_CONFIGS) {
      expect(entity.documents.length, entity.key).toBeGreaterThan(0);
      expect(entity.registrations.length, entity.key).toBeGreaterThan(0);
      expect(entity.pack.length, entity.key).toBeGreaterThan(0);
      expect(entity.panChar, entity.key).toMatch(/^[A-Z]+$/);
    }
  });

  it("only suggests services the starter catalog actually has", () => {
    for (const entity of ENTITY_CONFIGS) {
      for (const code of entity.services) {
        expect(SERVICE_CODES, `${entity.key} suggests ${code}`).toContain(code);
      }
    }
  });

  it("only asks for master fields the client record can store", () => {
    for (const entity of ENTITY_CONFIGS) {
      for (const field of entity.fields) {
        const storable =
          field.name.startsWith("profile.") ||
          ["cin", "tan", "udyam", "iec", "aadhaar", "establishedOn"].includes(
            field.name,
          ) ||
          field.name === "gstins.0.gstin";
        expect(storable, `${entity.key}.${field.name}`).toBe(true);
      }
    }
  });

  it("reads two acceptable PAN characters aloud", () => {
    expect(panCharLabel("C")).toBe("C");
    expect(panCharLabel("AB")).toBe("A or B");
    expect(ENTITY_BY_KEY.AOP.panChar).toBe("AB");
  });
});

describe("the checks before accepting", () => {
  /** A PAN and a GSTIN that genuinely agree, built so the check digit is real. */
  const PAN = "AAACZ1234C";
  const GSTIN = (() => {
    // 09 + PAN + 1Z + check digit; checkGSTIN verifies the digit, so find it
    for (const digit of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const candidate = `09${PAN}1Z${digit}`;
      if (checkGSTIN(candidate).ok) return candidate;
    }
    throw new Error("no valid check digit — the GSTIN algorithm has changed");
  })();

  const find = (checks, key) => checks.find((check) => check.key === key);

  it("passes a PAN whose 4th character matches the entity", () => {
    const checks = onboardingChecks({
      entityType: "Private Limited",
      pan: PAN,
    });
    expect(find(checks, "pan").state).toBe("ok");
    expect(find(checks, "pan").detail).toContain("Private limited company");
  });

  it("catches the director's PAN pasted onto the company", () => {
    const checks = onboardingChecks({
      entityType: "Private Limited",
      pan: "AAAPZ1234C",
    });
    expect(find(checks, "pan").state).toBe("bad");
    expect(checksPass(checks)).toBe(false);
  });

  it("accepts a society's PAN under either of its two characters", () => {
    for (const pan of ["AAAAZ1234C", "AAATZ1234C"]) {
      expect(
        find(onboardingChecks({ entityType: "Society", pan }), "pan").state,
      ).toBe("ok");
    }
  });

  it("refuses a GSTIN whose PAN is not the client's", () => {
    const checks = onboardingChecks({
      entityType: "Private Limited",
      pan: "AAACZ1234C",
      gstin: GSTIN.replace("AAACZ1234C", "AAACZ9999C"),
    });
    expect(find(checks, "gstin").state).toBe("bad");
  });

  it("passes a GSTIN that carries the client's own PAN", () => {
    const checks = onboardingChecks({
      entityType: "Private Limited",
      pan: PAN,
      gstin: GSTIN,
    });
    expect(find(checks, "gstin").state).toBe("ok");
  });

  it("asks for a CIN only from the entities that have one", () => {
    const company = onboardingChecks({ entityType: "Private Limited" });
    const trust = onboardingChecks({ entityType: "Trust" });
    expect(find(company, "CIN format")).toBeTruthy();
    expect(trust.some((check) => check.label === "CIN format")).toBe(false);
  });

  it("does not block on checks that have not been filled in yet", () => {
    expect(checksPass(onboardingChecks({ entityType: "Trust" }))).toBe(true);
  });
});

describe("the entity-specific master fields", () => {
  it("are stored on the client, trimmed and empties dropped", () => {
    const { errors, value } = validateClient(
      {
        legalName: "Mehra Agro Exports Private Limited",
        entityType: "Private Limited",
        branchId: "000000000000000000000001",
        groupId: "000000000000000000000002",
        contacts: [{ name: "Rajesh Mehra", mobile: "9811120456" }],
        profile: {
          authorisedCapital: "  5000000  ",
          paidUpCapital: "",
          directors: "Rajesh Mehra (DIN 01234567)",
        },
      },
      {},
    );

    expect(errors).toEqual({});
    expect(value.profile).toEqual({
      authorisedCapital: "5000000",
      directors: "Rajesh Mehra (DIN 01234567)",
    });
  });
});
