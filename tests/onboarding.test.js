import { describe, it, expect } from "vitest";
import {
  ENTITY_CONFIGS,
  ENTITY_BY_KEY,
  panCharLabel,
} from "../lib/clients/entityTypes.js";
import { onboardingChecks, checksPass } from "../lib/clients/checks.js";
import { ENTITY_TYPES, checkGSTIN } from "../lib/validators.js";
import { validateClient } from "../lib/clients/validate.js";
import { readClientForm } from "../lib/clients/form.js";
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

/**
 * The wizard collects a client's GST registrations as flat keys —
 * `gstins.1.gstin`, `gstins.1.label` — and `createFromOnboarding` copies
 * that map straight into the form the server already reads. This is the
 * seam between the two, which is where a branch would quietly go missing
 * (owner request, 25-11-2026).
 */
describe("a wizard payload with several GST registrations", () => {
  /** A GSTIN for this state and PAN whose check digit is right. */
  function gstinFor(stateCode, pan) {
    for (const last of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const candidate = `${stateCode}${pan}1Z${last}`;
      if (checkGSTIN(candidate).ok) return candidate;
    }
    throw new Error("no valid check digit");
  }

  const PAN = "AABCM1429P";
  const BRANCHES = [
    { label: "Delhi", stateCode: "07", state: "Delhi" },
    { label: "Mumbai", stateCode: "27", state: "Maharashtra" },
    { label: "Hyderabad", stateCode: "36", state: "Telangana" },
  ].map((b) => ({ ...b, gstin: gstinFor(b.stateCode, PAN) }));

  /** What createFromOnboarding builds out of the wizard's values map. */
  const formData = new FormData();
  formData.set("entityType", "Private Limited");
  formData.set("legalName", "Ryan Medihub Private Limited");
  formData.set("pan", PAN);
  BRANCHES.forEach((branch, at) => {
    formData.set(`gstins.${at}.gstin`, branch.gstin);
    formData.set(`gstins.${at}.label`, branch.label);
  });

  const { errors, value } = validateClient(readClientForm(formData));

  it("keeps all three registrations, in order, with their names", () => {
    // the branch and the group are the wizard's own later steps; nothing
    // here is a complaint about a registration
    expect(
      Object.keys(errors).filter((key) => key.startsWith("gstins")),
    ).toEqual([]);
    expect(value.gstins).toHaveLength(3);
    expect(value.gstins.map((g) => g.label)).toEqual([
      "Delhi",
      "Mumbai",
      "Hyderabad",
    ]);
    expect(value.gstins.map((g) => g.gstin)).toEqual(
      BRANCHES.map((b) => b.gstin),
    );
  });

  it("derives each one's state from its own number", () => {
    expect(value.gstins.map((g) => g.state)).toEqual([
      "Delhi",
      "Maharashtra",
      "Telangana",
    ]);
  });

  it("refuses a registration belonging to a different PAN", () => {
    const wrong = new FormData();
    wrong.set("entityType", "Private Limited");
    wrong.set("legalName", "Ryan Medihub Private Limited");
    wrong.set("pan", PAN);
    wrong.set("gstins.0.gstin", BRANCHES[0].gstin);
    wrong.set("gstins.1.gstin", gstinFor("27", "AAACZ1234C"));
    const result = validateClient(readClientForm(wrong));
    expect(result.errors["gstins.1"]).toMatch(/different PAN/);
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

/**
 * What the wizard refused to notice (QA 09-11-2026, #17 and #18).
 *
 * `zztest@` and `12345` went through onboarding untouched, and a fee of
 * -500, "abc" or ₹99,99,99,99,999 was accepted with the Checks step saying
 * nothing. The register of potential clients had checked a mobile number
 * all along, with these same two functions; the client form did not.
 */
describe("the contact details and the fees", () => {
  const base = { entityType: "Private Limited", pan: "", gstin: "", cin: "" };

  it("refuses an email that is not one", () => {
    const check = onboardingChecks({ ...base, email: "zztest@" }).find(
      (row) => row.key === "email",
    );
    expect(check.state).toBe("bad");
  });

  it("refuses a mobile number that is not one", () => {
    const check = onboardingChecks({ ...base, mobile: "12345" }).find(
      (row) => row.key === "mobile",
    );
    expect(check.state).toBe("bad");
  });

  it("accepts the real thing", () => {
    const checks = onboardingChecks({
      ...base,
      email: "riya@aggarwaltraders.in",
      mobile: "9810012345",
    });
    for (const key of ["email", "mobile"]) {
      expect(checks.find((row) => row.key === key).state, key).toBe("ok");
    }
  });

  it("says nothing about a contact nobody has filled in yet", () => {
    const checks = onboardingChecks(base);
    expect(checks.some((row) => row.key === "email")).toBe(false);
    expect(checks.some((row) => row.key === "mobile")).toBe(false);
  });

  it("refuses a negative fee, a word, and an absurd one", () => {
    for (const fee of ["-500", "abc", "99999999999"]) {
      const check = onboardingChecks({
        ...base,
        fees: [{ name: "GSTR-3B", fee }],
      }).find((row) => row.key === "fees");
      expect(check.state, fee).toBe("bad");
      expect(check.detail, fee).toContain("GSTR-3B");
    }
  });

  it("allows a fee left to be agreed", () => {
    const check = onboardingChecks({
      ...base,
      fees: [{ name: "GSTR-3B", fee: "" }],
    }).find((row) => row.key === "fees");
    expect(check.state).toBe("ok");
  });

  /** A bad fee has to stop the wizard, not just colour a row. */
  it("stops the wizard going on", () => {
    const checks = onboardingChecks({
      ...base,
      fees: [{ name: "GSTR-3B", fee: "-500" }],
    });
    expect(checksPass(checks)).toBe(false);
  });
});
