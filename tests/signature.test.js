import { describe, it, expect, afterEach, vi } from "vitest";
import {
  BRANCHES,
  BOUNDS,
  HUB,
  toSvg,
  toWorld,
  groundAt,
} from "../components/login/branches.js";
import { canRun3D } from "../components/login/capability.js";
import { transitionsFrom, NEEDS_REASON } from "../lib/engagements/status.js";

/**
 * The parts of the signature moments that are arithmetic or a rule, rather
 * than a picture: where the branch pins land, when the 3D scene is allowed
 * to run at all, and which columns a card may be dragged into.
 *
 * What a tick looks like is not testable and does not need to be. What is
 * worth a test is that the scene refuses to run on a device the spec says
 * it must not, because that rule is the whole reason the flat map exists.
 */

describe("where the branches are", () => {
  it("has the firm's four offices, with Noida as the hub", () => {
    expect(BRANCHES.map((b) => b.code).sort()).toEqual([
      "DEL",
      "LDH",
      "MRT",
      "NOI",
    ]);
    expect(HUB.code).toBe("NOI");
  });

  it("puts every office inside the window the scene shows", () => {
    for (const branch of BRANCHES) {
      expect(branch.lon, branch.code).toBeGreaterThan(BOUNDS.west);
      expect(branch.lon, branch.code).toBeLessThan(BOUNDS.east);
      expect(branch.lat, branch.code).toBeGreaterThan(BOUNDS.south);
      expect(branch.lat, branch.code).toBeLessThan(BOUNDS.north);
    }
  });

  it("places Ludhiana north-west of Delhi, as it is on the ground", () => {
    const box = { width: 620, height: 470, pad: 60 };
    const ludhiana = toSvg(
      BRANCHES.find((b) => b.code === "LDH"),
      box,
    );
    const delhi = toSvg(
      BRANCHES.find((b) => b.code === "DEL"),
      box,
    );

    expect(ludhiana.x).toBeLessThan(delhi.x); // west is left
    expect(ludhiana.y).toBeLessThan(delhi.y); // north is up
  });

  it("agrees with itself between the flat map and the 3D scene", () => {
    const box = { width: 620, height: 470, pad: 60 };
    const flat = BRANCHES.map((b) => toSvg(b, box));
    const solid = BRANCHES.map((b) => toWorld(b));

    // whatever is further west on the map is further west in the scene
    for (let i = 0; i < BRANCHES.length; i += 1) {
      for (let j = 0; j < BRANCHES.length; j += 1) {
        expect(flat[i].x < flat[j].x).toBe(solid[i][0] < solid[j][0]);
        // and further north on the map is further north in the scene
        expect(flat[i].y < flat[j].y).toBe(solid[i][2] < solid[j][2]);
      }
    }
  });

  it("stands every pin on the ground, not through it or above it", () => {
    for (const branch of BRANCHES) {
      const [x, y, z] = toWorld(branch);
      expect(y).toBeCloseTo(groundAt(x, z), 6);
    }
  });
});

describe("the relief", () => {
  it("rises towards the north and leaves the plain flat", () => {
    const north = groundAt(0, -3.6);
    const middle = groundAt(0, 0);
    const south = groundAt(0, 3.6);

    expect(north).toBeGreaterThan(0.3);
    expect(Math.abs(middle)).toBeLessThan(0.1);
    expect(Math.abs(south)).toBeLessThan(0.1);
  });

  it("never dips below the plain, so no pin floats over a hole", () => {
    for (let x = -4; x <= 4; x += 0.25) {
      for (let z = -4; z <= 4; z += 0.25) {
        expect(groundAt(x, z), `${x},${z}`).toBeGreaterThan(-0.05);
      }
    }
  });
});

describe("when the 3D scene is allowed to run", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * A browser that says yes to everything, which each test then spoils one
   * way. `navigator` is a getter in Node, so it is stubbed rather than
   * assigned.
   */
  function browser(overrides = {}) {
    const matches = overrides.reducedMotion ?? false;
    vi.stubGlobal("window", { matchMedia: () => ({ matches }) });
    vi.stubGlobal("navigator", {
      hardwareConcurrency: overrides.cores ?? 8,
      connection: overrides.connection,
    });
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () =>
          overrides.webgl === false
            ? null
            : { getExtension: () => ({ loseContext() {} }) },
      }),
    });
  }

  it("runs on a capable laptop that has not asked for less motion", () => {
    browser();
    expect(canRun3D().ok).toBe(true);
  });

  it("refuses when the device asks for reduced motion", () => {
    browser({ reducedMotion: true });
    const verdict = canRun3D();
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toMatch(/reduced motion/);
  });

  it("refuses on four cores or fewer", () => {
    browser({ cores: 4 });
    expect(canRun3D().ok).toBe(false);
    browser({ cores: 2 });
    expect(canRun3D().ok).toBe(false);
  });

  it("refuses when data saver is on", () => {
    browser({ connection: { saveData: true } });
    expect(canRun3D().why).toMatch(/data saver/);
  });

  it("refuses on a 2G connection", () => {
    browser({ connection: { effectiveType: "2g" } });
    expect(canRun3D().why).toMatch(/connection is slow/);
  });

  it("refuses without WebGL2", () => {
    browser({ webgl: false });
    expect(canRun3D().why).toMatch(/WebGL2/);
  });

  it("refuses on the server, where there is no device to ask", () => {
    vi.stubGlobal("window", undefined);
    expect(canRun3D()).toEqual({ ok: false, why: "server" });
  });
});

describe("where a card can be dragged on the board", () => {
  it("offers only the moves the pipeline allows", () => {
    expect(transitionsFrom("Scheduled")).toContain("In progress");
    expect(transitionsFrom("Scheduled")).not.toContain("Completed");
    expect(transitionsFrom("Under review")).toContain("Filed / delivered");
  });

  it("is empty for finished work: nothing reopens an engagement", () => {
    expect(transitionsFrom("Completed")).toEqual([]);
    expect(transitionsFrom("Cancelled")).toEqual([]);
  });

  it("never offers a status that needs a reason, since a drag has none", () => {
    // this is the rule the board relies on: On hold and Cancelled stay on
    // the explicit control, where the reason can be typed and audited
    for (const status of ["Scheduled", "In progress", "Under review"]) {
      const draggable = transitionsFrom(status).filter(
        (to) => !NEEDS_REASON.includes(to),
      );
      for (const to of draggable) {
        expect(NEEDS_REASON, `${status} → ${to}`).not.toContain(to);
      }
    }
  });

  it("leaves a real move available on every live status, or dragging is pointless", () => {
    for (const status of [
      "Scheduled",
      "Awaiting documents",
      "In progress",
      "Under review",
      "Filed / delivered",
    ]) {
      const draggable = transitionsFrom(status).filter(
        (to) => !NEEDS_REASON.includes(to),
      );
      expect(draggable.length, status).toBeGreaterThan(0);
    }
  });
});
