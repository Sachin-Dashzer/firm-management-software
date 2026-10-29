import { describe, it, expect } from "vitest";
import {
  PARTNER_NAV,
  STAFF_NAV,
  MODULES,
  MODULE_DEFAULTS,
  navFor,
  menuFor,
} from "../lib/nav/tree.js";
import { activeIn } from "../lib/nav/active.js";
import fixture from "./fixtures/nav-v6.2.json" with { type: "json" };

/**
 * The menu (P3-22a).
 *
 * The shape is the owner's brief: ten groups and 58 links for a partner,
 * eight and 24 for staff. What is worth testing is not the list — the
 * fixture holds that — but the three filters, and above all that a group
 * or a section label left with nothing under it **disappears**, because a
 * heading over an empty space is how a menu starts lying about what the
 * person can do.
 */

const actor = (role, over = {}) => ({
  id: "u1",
  role,
  branchIds: ["b1"],
  active: true,
  ...over,
});

const links = (groups) =>
  groups.flatMap((group) =>
    group.items.filter((item) => typeof item !== "string"),
  );

const labels = (groups) =>
  groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) =>
      typeof item === "string" ? `— ${item}` : item.label,
    ),
  }));

describe("the menu is the shape the owner asked for", () => {
  it("has ten groups and 58 links for a partner", () => {
    expect(PARTNER_NAV).toHaveLength(10);
    expect(links(PARTNER_NAV)).toHaveLength(58);
  });

  it("has eight groups and 24 links for staff", () => {
    expect(STAFF_NAV).toHaveLength(8);
    expect(links(STAFF_NAV)).toHaveLength(24);
  });

  /**
   * The fixture is generated from this tree, so it is a drift test and not
   * a check against the prototype: `CA-Firm-OS-v6.2.html` is not in the
   * repository, so nothing here can prove the labels match `NAV13`. The
   * browser test compares the rendered menu against the same fixture, which
   * catches the rail and the tree disagreeing.
   */
  it("matches the fixture the browser test reads", () => {
    expect(labels(PARTNER_NAV)).toEqual(fixture.partner);
    expect(labels(STAFF_NAV)).toEqual(fixture.staff);
  });

  it("gives every link a label, a route and an area decision", () => {
    for (const item of [...links(PARTNER_NAV), ...links(STAFF_NAV)]) {
      expect(item.label, JSON.stringify(item)).toBeTruthy();
      expect(item.href.startsWith("/"), item.label).toBe(true);
      expect("area" in item, item.label).toBe(true);
    }
  });

  it("names only modules that exist", () => {
    for (const group of [...PARTNER_NAV, ...STAFF_NAV]) {
      if (group.module) expect(MODULES).toContain(group.module);
      for (const item of group.items) {
        if (typeof item !== "string" && item.module) {
          expect(MODULES, item.label).toContain(item.module);
        }
      }
    }
  });

  it("sends partners, CAs and the billing desk to the partner menu", () => {
    expect(navFor("partner")).toBe(PARTNER_NAV);
    expect(navFor("ca")).toBe(PARTNER_NAV);
    expect(navFor("accounts")).toBe(PARTNER_NAV);
    expect(navFor("employee")).toBe(STAFF_NAV);
    expect(navFor("intern")).toBe(STAFF_NAV);
  });
});

describe("what each role is actually shown", () => {
  it("shows a partner everything", () => {
    expect(links(menuFor(actor("partner")))).toHaveLength(58);
  });

  /**
   * Accounts gets the partner layout and `can()` takes away what they may
   * not open — which is the whole reason that mapping is safe.
   */
  it("takes the jobs and audit groups off the billing desk", () => {
    const groups = menuFor(actor("accounts")).map((group) => group.label);
    expect(groups).toContain("Billing");
    expect(groups).not.toContain("Jobs");
    expect(groups).not.toContain("Audit and certificates");
  });

  it("leaves an intern their own short menu", () => {
    const menu = menuFor(actor("intern"));
    expect(menu.map((group) => group.label)).not.toContain("Firm");
    // an intern may not enter client data, so that item is not offered
    expect(links(menu).map((item) => item.href)).not.toContain(
      "/clients/round-trip",
    );
  });

  it("offers the bulk sheet to somebody who may enter client data", () => {
    expect(links(menuFor(actor("ca"))).map((item) => item.href)).toContain(
      "/clients/round-trip",
    );
  });
});

describe("a switched-off module disappears, and takes its headings with it", () => {
  const off = (key) => ({ ...MODULE_DEFAULTS, [key]: false });

  it("removes the whole group when its module is off", () => {
    const groups = menuFor(actor("partner"), off("notices")).map(
      (g) => g.label,
    );
    expect(groups).not.toContain("Notices");
    expect(groups).toContain("Clients");
  });

  it("removes one item without touching its neighbours", () => {
    const menu = menuFor(actor("partner"), off("lab"));
    const firm = menu.find((group) => group.label === "Firm");
    expect(
      firm.items.map((i) => (typeof i === "string" ? i : i.label)),
    ).not.toContain("Data lab (Excel to MIS)");
    expect(
      firm.items.some((i) => typeof i !== "string" && i.label === "Templates"),
    ).toBe(true);
  });

  /**
   * The failure this guards against: switching off client experience leaves
   * the words "Client experience" sitting over nothing.
   */
  it("removes a section label with nothing left under it", () => {
    const clients = menuFor(actor("partner"), off("cx")).find(
      (group) => group.label === "Clients",
    );
    expect(clients.items).not.toContain("Client experience");
    expect(clients.items.filter((i) => typeof i === "string")).toEqual([]);
  });

  it("keeps the label while one item under it survives", () => {
    const firm = menuFor(actor("partner"), off("lab")).find(
      (group) => group.label === "Firm",
    );
    expect(firm.items).toContain("Tools");
    expect(firm.items).toContain("Learning");
  });

  it("is all on when nobody has said otherwise", () => {
    expect(links(menuFor(actor("partner"), {}))).toHaveLength(58);
  });
});

describe("which item is the current one", () => {
  const menu = PARTNER_NAV;

  it("lights the exact page", () => {
    expect(activeIn(menu, "/issues")).toEqual({
      group: "today",
      href: "/issues",
    });
  });

  /**
   * Four Jobs links are one page with different filters, so the query has
   * to decide. Getting this wrong lights "All open jobs" while you are
   * looking at the overdue list.
   */
  it("tells the four jobs filters apart by their query", () => {
    expect(activeIn(menu, "/engagements", "?due=overdue").href).toBe(
      "/engagements?due=overdue",
    );
    expect(activeIn(menu, "/engagements", "?status=Under%20review").href).toBe(
      "/engagements?status=Under%20review",
    );
    expect(activeIn(menu, "/engagements").href).toBe("/engagements");
  });

  it("falls back to the unfiltered item on a filter nothing claims", () => {
    expect(activeIn(menu, "/engagements", "?q=sharma").href).toBe(
      "/engagements",
    );
  });

  it("lights the list a detail page belongs to", () => {
    expect(activeIn(menu, "/engagements/6520b1c2d3e4f5061728394a").href).toBe(
      "/engagements",
    );
    expect(activeIn(menu, "/clients/6520b1c2d3e4f5061728394a").href).toBe(
      "/clients",
    );
    expect(activeIn(menu, "/settings/branches").group).toBe("firm");
  });

  it("lights nothing on a page the menu does not have", () => {
    expect(activeIn(menu, "/me")).toEqual({ group: null, href: null });
  });
});
