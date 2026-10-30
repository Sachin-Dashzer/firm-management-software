import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import StatTile from "../components/ui/StatTile.jsx";
import Panel from "../components/ui/Panel.jsx";
import StackedBar from "../components/ui/StackedBar.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import Chip from "../components/ui/Chip.jsx";
import CountBadge from "../components/ui/CountBadge.jsx";
import Segmented from "../components/ui/Segmented.jsx";
import CellPopover from "../components/ui/CellPopover.jsx";

/**
 * The shared blocks, rendered (P3-34 phase 1).
 *
 * There is no jsdom and no testing-library in this repository, and adding
 * both to prove that eight small components return the markup they say
 * they return would be two dependencies the owner has to approve. These
 * render on the server, which is what six of them do in production
 * anyway, and the two client ones render their **pre-JavaScript** state —
 * which is the state worth a test, because it is the one nobody looks at.
 *
 * What is asserted here is only the behaviour: the rules that would be
 * silently wrong rather than visibly wrong. Colour is `contrast.test.js`
 * and `markup-contrast.test.js`; shape is the Playwright pass in phase 8.
 */

const html = (node) => renderToStaticMarkup(node);

describe("StatTile", () => {
  it("colours a figure that has something in it", () => {
    const out = html(
      <StatTile
        label="Statutory dates missed"
        value={2}
        note="open jobs past a due date"
        href="/engagements?due=overdue"
        tone="late"
      />,
    );
    expect(out).toContain("text-redpen");
    expect(out).toContain("bg-redpen-wash");
    expect(out).toContain("/engagements?due=overdue");
  });

  it("drops a zero to plain, because a red nought is an alarm about nothing", () => {
    const out = html(
      <StatTile
        label="Statutory dates missed"
        value={0}
        href="/engagements?due=overdue"
        tone="late"
      />,
    );
    expect(out).not.toContain("text-redpen");
    expect(out).not.toContain("bg-redpen-wash");
    expect(out).toContain("bg-faint");
  });

  it("announces the tile that is acting as the current filter", () => {
    const one = html(
      <StatTile label="Owing money" value={4} href="/clients?show=owing" />,
    );
    const two = html(
      <StatTile
        label="Owing money"
        value={4}
        href="/clients?show=owing"
        selected
      />,
    );
    expect(one).not.toContain('aria-current="true"');
    expect(two).toContain('aria-current="true"');
    expect(two).toContain("border-carbon");
  });

  it("shows the label in the uppercase the owner asked for (D102)", () => {
    const out = html(<StatTile label="DSCs expiring" value={3} href="/x" />);
    expect(out).toContain("uppercase");
  });
});

describe("Panel", () => {
  it("carries a sub-count, a hint and a way out of itself", () => {
    const out = html(
      <Panel
        title="Work in progress"
        count="41 open jobs"
        hint="Every number opens its list"
        link={{ href: "/engagements?view=board", label: "Open job board" }}
      >
        <p>rows</p>
      </Panel>,
    );
    expect(out).toContain("Work in progress");
    expect(out).toContain("· 41 open jobs");
    expect(out).toContain("Every number opens its list");
    expect(out).toContain("/engagements?view=board");
    expect(out).toContain("rows");
  });

  it("does not print a stray dot when there is no count", () => {
    expect(html(<Panel title="Branches">x</Panel>)).not.toContain("· ");
  });
});

describe("StackedBar", () => {
  const segments = [
    {
      key: "scheduled",
      label: "Not started",
      value: 6,
      href: "/engagements?status=Scheduled",
      className: "bg-rule",
    },
    {
      key: "review",
      label: "Under review",
      value: 0,
      href: "/engagements?status=Under%20review",
      className: "bg-carbon/45",
    },
  ];

  it("hides an empty segment from the bar and keeps it in the legend", () => {
    const out = html(
      <StackedBar segments={segments} label="Work in progress" />,
    );
    // the zero is linked once, from the legend, and is not a block in the
    // bar — where a zero-width segment is a rendering artefact
    expect(out.match(/status=Under%20review/g)?.length).toBe(1);
    expect(out.match(/status=Scheduled/g)?.length).toBe(2);
    expect(out).toContain("Not started");
    expect(out).toContain(">0<");
  });

  it("makes every part of it a link to the list it counted", () => {
    const out = html(
      <StackedBar segments={segments} label="Work in progress" />,
    );
    expect(out.match(/status=Scheduled/g)?.length).toBe(2); // bar and legend
    expect(out).toContain("status=Under%20review");
  });

  it("says the whole thing in words for a screen reader", () => {
    const out = html(
      <StackedBar segments={segments} label="Work in progress" />,
    );
    expect(out).toContain("Work in progress: Not started 6, Under review 0");
  });

  it("draws an empty track when nothing has been counted at all", () => {
    const out = html(
      <StackedBar
        segments={segments.map((s) => ({ ...s, value: 0 }))}
        label="Work in progress"
      />,
    );
    expect(out).toContain("bg-sunk");
  });
});

describe("ProgressBar", () => {
  it("fills to the proportion", () => {
    expect(html(<ProgressBar value={122} max={126} />)).toContain("width:97%");
  });

  it("survives a maximum of nothing", () => {
    expect(html(<ProgressBar value={0} max={0} />)).toContain("width:0%");
  });

  it("never overflows its track", () => {
    expect(html(<ProgressBar value={15} max={10} />)).toContain("width:100%");
  });

  it("draws the comfort limit where it was asked for, and inside the bar", () => {
    expect(html(<ProgressBar value={12} max={13} marker={77} />)).toContain(
      "left:77%",
    );
    expect(html(<ProgressBar value={1} max={2} marker={140} />)).toContain(
      "left:100%",
    );
  });

  it("leaves the tick out when there is no limit to draw", () => {
    expect(html(<ProgressBar value={1} max={2} />)).not.toContain("left:");
  });
});

describe("Chip", () => {
  it("draws an absence as an outline, not as a filled thing", () => {
    const out = html(<Chip tone="dashed">2</Chip>);
    expect(out).toContain("border-dashed");
    expect(out).toContain("text-redpen");
  });

  it("puts a date on the ledger grid when asked", () => {
    expect(html(<Chip mono>2 Nov · 3d</Chip>)).toContain("num");
  });

  it("falls back to neutral rather than to nothing", () => {
    expect(html(<Chip tone="nonsense">x</Chip>)).toContain("text-ink-muted");
  });
});

describe("CountBadge", () => {
  it("renders nothing at all when there is no count", () => {
    expect(html(<CountBadge value={null} />)).toBe("");
  });

  it("caps a long count", () => {
    expect(html(<CountBadge value={14} cap={9} />)).toContain("9+");
    expect(html(<CountBadge value={9} cap={9} />)).toContain(">9<");
  });

  it("changes its look on a filled tab so it does not vanish into it", () => {
    expect(html(<CountBadge value={5} onAccent />)).toContain(
      "bg-on-carbon text-carbon",
    );
    expect(html(<CountBadge value={5} />)).toContain("bg-sunk");
  });
});

describe("Segmented", () => {
  const views = [
    { key: "heads", label: "By head", href: "/compliance" },
    { key: "grid", label: "Status grid", href: "/compliance/monthly" },
  ];

  it("shows the active choice before any JavaScript has run", () => {
    const out = html(<Segmented items={views} value="heads" label="View" />);
    // the sliding pill cannot exist until something has been measured, so
    // the active item has to carry the fill itself until then
    expect(out).toContain("bg-carbon text-on-carbon");
    expect(out).toContain('aria-current="page"');
  });

  it("marks only one item as active", () => {
    const out = html(<Segmented items={views} value="grid" label="View" />);
    expect(out.match(/data-active="true"/g)?.length).toBe(1);
  });

  it("is a tablist when the items are buttons and a nav when they are links", () => {
    expect(
      html(<Segmented items={views} value="heads" label="View" />),
    ).toContain("<nav");
    const buttons = html(
      <Segmented
        items={[
          { key: "all", label: "All" },
          { key: "soon", label: "Due ≤ 1 day" },
        ]}
        value="all"
        label="Filter"
      />,
    );
    expect(buttons).toContain('role="tablist"');
    expect(buttons).toContain('aria-selected="true"');
  });

  it("carries a badge, and swaps its colours on the active pill", () => {
    const out = html(
      <Segmented
        label="Service"
        value="tds"
        items={[
          {
            key: "tds",
            label: "TDS payment",
            href: "?s=tds",
            badge: { value: 3 },
          },
          { key: "pf", label: "PF / ESI", href: "?s=pf", badge: { value: 2 } },
        ]}
      />,
    );
    expect(out).toContain("bg-on-carbon text-carbon");
    expect(out).toContain("bg-sunk");
  });
});

describe("CellPopover", () => {
  it("is shut, and says so, until somebody opens it", () => {
    const out = html(
      <CellPopover
        title="Mehra Foods, October"
        triggerLabel="Mehra Foods Pvt Ltd, October: filed on time"
        trigger="✓"
      >
        <p>behind the box</p>
      </CellPopover>,
    );
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-haspopup="dialog"');
    expect(out).toContain("Mehra Foods Pvt Ltd, October: filed on time");
    // the panel is not in the document until it is opened
    expect(out).not.toContain("behind the box");
    expect(out).not.toContain('role="dialog"');
  });

  it("lets the grid put its own keyboard handling on the box", () => {
    const out = html(
      <CellPopover
        title="x"
        trigger="○"
        triggerClassName="border-dashed border-redpen"
        triggerProps={{ tabIndex: -1, "data-row": 3, "data-col": 7 }}
      >
        <p>y</p>
      </CellPopover>,
    );
    expect(out).toContain('tabindex="-1"');
    expect(out).toContain('data-row="3"');
    expect(out).toContain("border-dashed");
  });
});
