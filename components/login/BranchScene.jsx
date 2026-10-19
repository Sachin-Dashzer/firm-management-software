"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import LedgerMap from "./LedgerMap";
import { canRun3D } from "./capability";

/**
 * The scene panel on the login screen (spec section 15).
 *
 * The flat map renders first, every time. Only once the browser has told
 * us it can take the 3D scene is the heavy bundle even requested, and the
 * map stays underneath it until the scene has drawn a frame — so there is
 * never a blank panel, and a device that loses its WebGL context falls
 * back mid-session rather than going black.
 *
 * None of this can block signing in: the form is a sibling, rendered and
 * focusable before this component decides anything.
 */

const Constellation = dynamic(() => import("./Constellation"), {
  ssr: false,
  loading: () => null,
});

export default function BranchScene() {
  const [state, setState] = useState({ use3D: false, why: "" });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const verdict = canRun3D();
    setState({ use3D: verdict.ok, why: verdict.why });

    const onFail = () => setFailed(true);
    window.addEventListener("phmg:scene-failed", onFail);
    return () => window.removeEventListener("phmg:scene-failed", onFail);
  }, []);

  const show3D = state.use3D && !failed;

  return (
    <div className="relative h-full w-full">
      <LedgerMap
        className={`h-full w-full transition-opacity duration-700 ${
          show3D ? "opacity-0" : "opacity-100"
        }`}
      />

      {show3D && (
        <div className="absolute inset-0">
          <Constellation />
        </div>
      )}
    </div>
  );
}
