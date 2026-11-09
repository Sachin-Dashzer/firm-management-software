import { describe, it, expect } from "vitest";
import {
  readClientForm,
  mergeRows,
  clientUpdate,
  ROW_GROUPS,
} from "../lib/clients/form.js";

/**
 * What an edit of a client is allowed to change (QA 09-11-2026, #1).
 *
 * The bug these are here for: the edit screen has no Addresses section, so
 * the form carried no address rows, so reading it produced
 * `addresses: []` and the update wiped the client's registered address.
 * Nothing on screen said so. The same shape of bug threw away a contact's
 * WhatsApp number, because the form asks for four of a contact's fields
 * and replaced the whole row.
 *
 * So the rule, and these tests: a form may only change what it carried.
 */

/** A client as it sits in the database, with the fields the form never shows. */
function storedClient() {
  return {
    legalName: "Aggarwal Traders Private Limited",
    entityType: "Private Limited",
    contacts: [
      {
        _id: "aaaaaaaaaaaaaaaaaaaaaaa1",
        name: "Riya Aggarwal",
        designation: "Director",
        mobile: "9810012345",
        email: "riya@aggarwaltraders.in",
        primary: true,
        // neither of these is on the edit form
        whatsapp: "9810012345",
        whatsappOptOut: true,
      },
    ],
    gstins: [
      {
        _id: "bbbbbbbbbbbbbbbbbbbbbbb1",
        gstin: "09AABCA1234C1ZD",
        state: "Uttar Pradesh",
        stateCode: "09",
        qrmp: false,
        active: true,
      },
    ],
    addresses: [
      {
        _id: "ccccccccccccccccccccccc1",
        kind: "Registered",
        line1: "14 Civil Lines",
        line2: "",
        city: "Kanpur",
        state: "Uttar Pradesh",
        pincode: "208001",
      },
    ],
    profile: { authorisedCapital: "10,00,000" },
  };
}

/** Exactly what the edit screen posts for the client above, unchanged. */
function editFormFor(client, changes = {}) {
  const data = new FormData();
  // the hidden field by which the form declares the sections it has
  data.set("groups", "contacts,gstins");
  data.set("legalName", client.legalName);
  data.set("entityType", client.entityType);

  client.gstins.forEach((row, i) => {
    data.set(`gstins.${i}._id`, row._id);
    data.set(`gstins.${i}.gstin`, row.gstin);
    // the real form pairs each checkbox with a hidden empty value, so the
    // field is submitted whether it is ticked or not
    data.set(`gstins.${i}.qrmp`, row.qrmp ? "on" : "");
  });

  client.contacts.forEach((row, i) => {
    data.set(`contacts.${i}._id`, row._id);
    data.set(`contacts.${i}.name`, row.name);
    data.set(`contacts.${i}.designation`, row.designation);
    data.set(`contacts.${i}.mobile`, row.mobile);
    data.set(`contacts.${i}.email`, row.email);
    data.set(`contacts.${i}.primary`, row.primary ? "on" : "");
  });

  for (const [key, value] of Object.entries(changes)) data.set(key, value);
  return data;
}

describe("reading a client form", () => {
  it("leaves out a repeated section the form does not have", () => {
    const input = readClientForm(editFormFor(storedClient()));

    // the whole of #1 in one line: no key, so nothing to overwrite
    expect("addresses" in input).toBe(false);
    expect("contacts" in input).toBe(true);
    expect("gstins" in input).toBe(true);
  });

  it("clears a section the form has and submitted empty", () => {
    const data = new FormData();
    data.set("groups", "contacts,gstins");
    data.set("legalName", "Aggarwal Traders Private Limited");

    const input = readClientForm(data);
    expect(input.contacts).toEqual([]);
    expect(input.gstins).toEqual([]);
    expect("addresses" in input).toBe(false);
  });

  it("takes a prefixed key as a declaration, for forms built in code", () => {
    // the onboarding wizard and the Excel import build their own FormData
    const data = new FormData();
    data.set("addresses.0.state", "Uttar Pradesh");
    data.set("addresses.0.kind", "Registered");

    const input = readClientForm(data);
    expect(input.addresses).toEqual([
      { state: "Uttar Pradesh", kind: "Registered" },
    ]);
    expect("contacts" in input).toBe(false);
  });

  it("leaves out a plain field the form does not have", () => {
    const input = readClientForm(editFormFor(storedClient()));
    for (const field of ["status", "risk", "creditDays", "groupId"]) {
      expect(field in input, field).toBe(false);
    }
  });
});

describe("merging rows with what is stored", () => {
  it("keeps the fields the form did not ask about", () => {
    const merged = mergeRows(storedClient().contacts, [
      { _id: "aaaaaaaaaaaaaaaaaaaaaaa1", name: "Riya Aggarwal", mobile: "9" },
    ]);

    expect(merged[0].whatsapp).toBe("9810012345");
    expect(merged[0].whatsappOptOut).toBe(true);
    expect(merged[0].mobile).toBe("9");
  });

  it("gives a row with no id nothing it did not come with", () => {
    const merged = mergeRows(storedClient().contacts, [{ name: "New Person" }]);
    expect(merged).toEqual([{ name: "New Person" }]);
  });

  it("does not let a reordered row inherit another row's hidden fields", () => {
    const stored = [
      { _id: "1", name: "A", whatsapp: "111" },
      { _id: "2", name: "B", whatsapp: "222" },
    ];
    const merged = mergeRows(stored, [
      { _id: "2", name: "B" },
      { _id: "1", name: "A" },
    ]);

    expect(merged[0].whatsapp).toBe("222");
    expect(merged[1].whatsapp).toBe("111");
  });
});

describe("an edit that changes nothing", () => {
  const stored = storedClient();
  const { errors, value } = clientUpdate(editFormFor(stored), stored);

  it("is valid", () => {
    expect(errors).toEqual({});
  });

  it("does not touch the addresses", () => {
    expect("addresses" in value).toBe(false);
  });

  it("does not touch the entity profile", () => {
    expect("profile" in value).toBe(false);
  });

  it("writes back the contacts and GSTINs exactly as stored", () => {
    // identical, ids included — so the audit plugin sees no change at all
    // and the activity feed gets no entry (#1, #14)
    for (const name of ["contacts", "gstins"]) {
      expect(value[name], name).toEqual(stored[name]);
    }
  });
});

describe("an edit that changes one thing", () => {
  const stored = storedClient();
  const { value } = clientUpdate(
    editFormFor(stored, { "contacts.0.mobile": "9811199999" }),
    stored,
  );

  it("changes only that one thing", () => {
    expect(value.contacts).toEqual([
      { ...stored.contacts[0], mobile: "9811199999" },
    ]);
    expect(value.gstins).toEqual(stored.gstins);
    expect("addresses" in value).toBe(false);
  });
});

describe("the list of repeated sections", () => {
  it("is the one the client record actually has", () => {
    expect(ROW_GROUPS).toEqual(["contacts", "gstins", "addresses"]);
  });
});
