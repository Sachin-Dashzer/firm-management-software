import { describe, expect, it } from "vitest";
import {
  applyWords,
  RENAMEABLE,
  WORD_DEFAULTS,
  WORD_KEYS,
  wordChanges,
} from "../lib/firm/words.js";
import { menuFor } from "../lib/nav/tree.js";

/**
 * The firm's own words (P3-29).
 *
 * The feature is one regex and the regex has exactly two ways to be wrong:
 * it can turn "clients" into "partys", and it can rename something that is
 * not a label. Both are tested here, along with the promise the screen
 * makes — that renaming a word changes no `href` and no `area`.
 */

const partyish = {
  client: "Party",
  clients: "Parties",
  job: "Assignment",
  jobs: "Assignments",
};

const actor = { id: "1", role: "partner", branchIds: [], active: true };

describe("what can be renamed", () => {
  it("offers a singular and a plural for each noun", () => {
    expect(WORD_KEYS).toHaveLength(RENAMEABLE.length * 2);
    for (const row of RENAMEABLE) {
      expect(WORD_DEFAULTS[row.key]).toBe(row.one);
      expect(WORD_DEFAULTS[row.plural]).toBe(row.many);
    }
  });
});

describe("which words actually changed", () => {
  it("ignores blanks and words the same as ours", () => {
    expect(wordChanges({ client: "", clients: "   " })).toEqual({});
    expect(wordChanges({ client: "Client", clients: "clients" })).toEqual({});
  });

  it("maps our word to theirs", () => {
    expect(wordChanges(partyish)).toEqual({
      client: "Party",
      clients: "Parties",
      job: "Assignment",
      jobs: "Assignments",
    });
  });

  it("survives a missing or null vocabulary", () => {
    expect(wordChanges(null)).toEqual({});
    expect(wordChanges(undefined)).toEqual({});
  });
});

describe("putting the words in", () => {
  const changes = wordChanges(partyish);

  it("replaces the plural before the singular", () => {
    /* The one bug this feature is certain to have if the order is left to
       chance: "clients" becoming "partys". */
    expect(applyWords("All clients", changes)).toBe("All parties");
    expect(applyWords("All open jobs", changes)).toBe("All open assignments");
  });

  it("keeps the case that was there, not the case the firm typed", () => {
    expect(applyWords("Clients", changes)).toBe("Parties");
    expect(applyWords("Waiting on client", changes)).toBe("Waiting on party");
    expect(applyWords("CLIENT", changes)).toBe("Party");
  });

  it("renames whole words only", () => {
    expect(applyWords("Clientele", changes)).toBe("Clientele");
    expect(applyWords("jobsheet", changes)).toBe("jobsheet");
    expect(applyWords("/clients/new", changes)).toBe("/parties/new");
  });

  it("leaves a word nobody renamed alone", () => {
    expect(applyWords("Open matters", changes)).toBe("Open matters");
    expect(applyWords("Invoices", changes)).toBe("Invoices");
  });

  it("is the identity when nothing is set", () => {
    expect(applyWords("All clients", {})).toBe("All clients");
  });
});

describe("the menu", () => {
  it("renames labels and nothing else", () => {
    const plain = menuFor(actor);
    const renamed = menuFor(actor, undefined, wordChanges(partyish));

    expect(renamed).toHaveLength(plain.length);

    const hrefs = (menu) =>
      menu.flatMap((group) =>
        group.items
          .filter((item) => typeof item !== "string")
          .map((i) => i.href),
      );
    const areas = (menu) =>
      menu.flatMap((group) =>
        group.items
          .filter((item) => typeof item !== "string")
          .map((i) => i.area),
      );

    /* The promise the screen makes: a renamed word cannot reach the router
       or the permission check. */
    expect(hrefs(renamed)).toEqual(hrefs(plain));
    expect(areas(renamed)).toEqual(areas(plain));
  });

  it("renames group labels and section labels too", () => {
    const renamed = menuFor(actor, undefined, wordChanges(partyish));
    expect(renamed.map((group) => group.label)).toContain("Parties");
    expect(renamed.map((group) => group.label)).toContain("Assignments");
  });

  it("says what it always said when the firm has set nothing", () => {
    expect(menuFor(actor, undefined, {})).toEqual(menuFor(actor));
  });
});
