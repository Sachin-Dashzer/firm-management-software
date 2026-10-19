// @ts-check

/**
 * Whether this device should be shown the 3D scene (spec section 15's
 * rules for 3D).
 *
 * The spec names four reasons to show the flat illustration instead, and
 * all four are about the same thing: the person is on a phone on mobile
 * data, or has told their computer they do not want animation, and a
 * login screen is the worst possible place to ignore either. So the test
 * is deliberately strict and the flat map is the default — the scene is
 * what has to earn its way in.
 */

/** @returns {{ ok: boolean, why: string }} */
export function canRun3D() {
  if (typeof window === "undefined") return { ok: false, why: "server" };

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return { ok: false, why: "this device asks for reduced motion" };
  }

  // data saver, where the browser exposes it
  const connection =
    /** @type {any} */ (navigator).connection ??
    /** @type {any} */ (navigator).mozConnection;
  if (connection?.saveData) return { ok: false, why: "data saver is on" };
  if (/(^|-)2g$/.test(connection?.effectiveType ?? "")) {
    return { ok: false, why: "the connection is slow" };
  }

  if ((navigator.hardwareConcurrency ?? 2) <= 4) {
    return { ok: false, why: "this device has few processor cores" };
  }

  // a context that is created and thrown away: asking is the only way to
  // know, and a device that cannot give us one must never see a blank panel
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return { ok: false, why: "this browser has no WebGL2" };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    return { ok: false, why: "this browser has no WebGL2" };
  }

  return { ok: true, why: "" };
}

/** The event the sign-in form fires so the scene can fly in before leaving. */
export const ARRIVE_EVENT = "phmg:arrive";

/** How long the camera takes to glide in. The form waits this long. */
export const ARRIVE_MS = 700;
