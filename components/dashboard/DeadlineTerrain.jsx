"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The deadline terrain (spec section 15, the optional partner view):
 * weeks along one axis, branches along the other, column height is how
 * much is due and colour is how much of it is late. Hover for the counts,
 * click to open that week's list.
 *
 * One `InstancedMesh` draws every column, so a hundred and sixty cells
 * cost one draw call and the view stays at frame rate on a laptop. The
 * same numbers are on the flat grid behind the toggle, which is where a
 * keyboard user reads them — this view is a way of *seeing* the shape of
 * the next two months, not the way to work with it.
 */

const COLUMN = 0.62;
const GAP = 0.22;

/** Ink for calm, red pen for late: the same rule as everywhere else. */
function colourFor(share, theme) {
  const calm = new THREE.Color(theme.carbon);
  const late = new THREE.Color(theme.redpen);
  return calm.lerp(late, Math.min(1, share * 1.15));
}

function Columns({ data, theme, onPick, onHover }) {
  const mesh = useRef(null);

  const cells = useMemo(
    () =>
      data.grid.flatMap((row, rowIndex) =>
        row.cells
          .filter((cell) => cell.due > 0)
          .map((cell) => ({ ...cell, rowIndex, branch: row.name })),
      ),
    [data],
  );

  const width = data.weeks.length * (COLUMN + GAP);
  const depth = data.grid.length * (COLUMN + GAP);

  useMemo(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();

    cells.forEach((cell, index) => {
      // height is how much is due, floored so a single job is still visible
      const height = Math.max(0.12, (cell.due / data.peak) * 2.4);
      const x = cell.week * (COLUMN + GAP) - width / 2 + COLUMN / 2;
      const z = cell.rowIndex * (COLUMN + GAP) - depth / 2 + COLUMN / 2;

      matrix.makeScale(1, height, 1);
      matrix.setPosition(x, height / 2, z);
      mesh.current.setMatrixAt(index, matrix);
      mesh.current.setColorAt(index, colourFor(cell.share, theme));
    });

    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) {
      mesh.current.instanceColor.needsUpdate = true;
    }
  }, [cells, data.peak, theme, width, depth]);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, Math.max(1, cells.length)]}
      onPointerMove={(event) => {
        event.stopPropagation();
        onHover(cells[event.instanceId ?? 0] ?? null);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(event) => {
        event.stopPropagation();
        const cell = cells[event.instanceId ?? 0];
        if (cell) onPick(cell.href);
      }}
    >
      <boxGeometry args={[COLUMN, 1, COLUMN]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

/** The ruled floor the columns stand on, so the grid is still readable. */
function Floor({ data, theme }) {
  const width = data.weeks.length * (COLUMN + GAP);
  const depth = data.grid.length * (COLUMN + GAP);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[width + 0.4, depth + 0.4]} />
        <meshBasicMaterial color={theme.surface} />
      </mesh>
      <gridHelper
        args={[
          Math.max(width, depth) + 0.4,
          Math.max(data.weeks.length, data.grid.length),
          theme.rule,
          theme.rule,
        ]}
      />
    </group>
  );
}

function Turn({ children }) {
  const group = useRef();
  useFrame((state, delta) => {
    if (!group.current) return;
    // a slow turn, leaning a few degrees with the cursor: enough to read
    // the shape from more than one side without anybody chasing it
    group.current.rotation.y += delta * 0.08;
    group.current.rotation.x =
      0.02 + (state.pointer.y * 0.05 - group.current.rotation.x) * 0.06;
  });
  return <group ref={group}>{children}</group>;
}

export default function DeadlineTerrain({ data }) {
  const router = useRouter();
  const [hover, setHover] = useState(null);

  const theme = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name, fallback) =>
      style.getPropertyValue(name).trim() || fallback;
    return {
      carbon: read("--carbon", "#2346A0"),
      redpen: read("--redpen", "#B3362C"),
      surface: read("--surface", "#FFFDF8"),
      rule: read("--rule", "#E3DCCB"),
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 4.2, 6.2], fov: 42 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={({ gl }) => gl.setClearAlpha(0)}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 6, 4]} intensity={1.4} />
        <Turn>
          <Floor data={data} theme={theme} />
          <Columns
            data={data}
            theme={theme}
            onHover={setHover}
            onPick={(href) => router.push(href)}
          />
        </Turn>
      </Canvas>

      {hover && (
        <div
          role="status"
          className="rounded-control border-rule bg-surface text-13 pointer-events-none absolute top-2 left-2 border px-2 py-1"
        >
          <strong>{hover.branch}</strong> · week of {hover.label} ·{" "}
          <span className="num">{hover.due}</span> due
          {hover.overdue > 0 && (
            <span className="text-redpen">
              {" "}
              · <span className="num">{hover.overdue}</span> late
            </span>
          )}
        </div>
      )}
    </div>
  );
}
