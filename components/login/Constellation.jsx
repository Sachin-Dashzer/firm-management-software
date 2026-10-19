"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, extend } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { BRANCHES, HUB, toWorld, groundAt } from "./branches";
import { ARRIVE_EVENT, ARRIVE_MS } from "./capability";

/**
 * The branch constellation (spec section 15): a slowly turning relief map
 * of North India, four brass pins joined to the head office by arcs of
 * light, gentle parallax on the cursor, and a glide into the hub when
 * somebody signs in.
 *
 * Three decisions worth knowing:
 *
 *  - **The relief is a formula, not a heightmap.** `groundAt` raises the
 *    Himalayan foothills along the north edge and leaves the plain flat.
 *    That is the only geographic claim the scene makes, and it costs three
 *    lines of arithmetic rather than a texture to download.
 *  - **The arcs are a shader**, so the light travels along them without
 *    any per-frame geometry work: one uniform, and the GPU does the rest.
 *  - **Nothing here is on the critical path.** The form is rendered and
 *    focusable before this file is even requested, and if it throws the
 *    panel falls back to the flat map.
 *
 * Imports are the narrow ones from three rather than drei helpers wherever
 * that keeps the bundle down; the 250 KB budget in spec section 15 is for
 * a screen people look at while waiting to get in.
 */

/** Ink and brass, taken off the stylesheet so both themes are honoured. */
function palette() {
  if (typeof window === "undefined") {
    return { ink: "#5E6577", brass: "#B07A2A", carbon: "#2346A0" };
  }
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    ink: read("--ink-muted", "#5E6577"),
    brass: read("--brass", "#B07A2A"),
    carbon: read("--carbon", "#2346A0"),
  };
}

/** The relief, as a wireframe of contour lines rather than a solid mesh. */
function Relief({ colour }) {
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(8, 8, 56, 56);
    const position = plane.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      // the plane is built in x/y and laid flat, so y is the world's z
      position.setZ(i, groundAt(x, -y));
    }
    plane.computeVertexNormals();
    return plane;
  }, []);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshBasicMaterial color={colour} wireframe transparent opacity={0.28} />
    </mesh>
  );
}

/** A pin: a thin post with a glowing head, standing on the relief. */
function Pin({ branch, colour }) {
  const [x, height, z] = toWorld(branch);
  const top = height + (branch.hub ? 0.62 : 0.44);

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height + (top - height) / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, top - height, 6]} />
        <meshBasicMaterial color={colour} transparent opacity={0.65} />
      </mesh>
      <mesh position={[0, top, 0]}>
        <sphereGeometry args={[branch.hub ? 0.075 : 0.055, 16, 16]} />
        {/* bright enough for the bloom pass to catch it */}
        <meshBasicMaterial color={colour} toneMapped={false} />
      </mesh>
    </group>
  );
}

const ArcMaterial = /** @type {any} */ (
  class extends THREE.ShaderMaterial {
    constructor() {
      super({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uColour: { value: new THREE.Color("#B07A2A") },
          uOffset: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        // a dim line with one pulse of light travelling along it: the arc
        // reads as a connection being used, not as decoration
        fragmentShader: `
          uniform float uTime;
          uniform float uOffset;
          uniform vec3 uColour;
          varying vec2 vUv;
          void main() {
            float travel = fract(uTime * 0.16 + uOffset);
            float pulse = smoothstep(0.16, 0.0, abs(vUv.x - travel));
            // fade both ends so an arc never stops abruptly at a pin
            float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
            float alpha = (0.13 + pulse * 0.85) * ends;
            gl_FragColor = vec4(uColour * (0.5 + pulse), alpha);
          }
        `,
      });
    }
  }
);

extend({ ArcMaterial });

/** One arc from the head office to a branch, bowed up over the plain. */
function Arc({ to, colour, offset }) {
  const material = useRef();

  const geometry = useMemo(() => {
    const from = toWorld(HUB);
    const target = toWorld(to);
    const start = new THREE.Vector3(from[0], from[1] + 0.6, from[2]);
    const end = new THREE.Vector3(target[0], target[1] + 0.42, target[2]);
    const middle = start
      .clone()
      .add(end)
      .multiplyScalar(0.5)
      .setY(Math.max(start.y, end.y) + start.distanceTo(end) * 0.34);

    const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
    return new THREE.TubeGeometry(curve, 48, 0.008, 6, false);
  }, [to]);

  useFrame((state) => {
    if (material.current) {
      material.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh geometry={geometry}>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <arcMaterial
        ref={material}
        key={ArcMaterial.key}
        uniforms-uColour-value={new THREE.Color(colour)}
        uniforms-uOffset-value={offset}
      />
    </mesh>
  );
}

/**
 * The turn, the parallax and the arrival.
 *
 * The rotation is a slow constant; the cursor only leans the scene a few
 * degrees, and it eases rather than tracking, so a moving mouse never
 * makes the login screen feel nervous.
 */
function Rig({ arriving }) {
  const { camera } = useThree();
  const group = useRef();
  const lean = useRef({ x: 0, y: 0 });
  const progress = useRef(0);

  useFrame((state, delta) => {
    const pointer = state.pointer;
    lean.current.x += (pointer.y * 0.06 - lean.current.x) * 0.04;
    lean.current.y += (pointer.x * 0.12 - lean.current.y) * 0.04;

    if (group.current) {
      group.current.rotation.y += delta * 0.045;
      group.current.rotation.x = -0.02 + lean.current.x;
      group.current.position.x = lean.current.y * 0.3;
    }

    // the glide in: the camera drops towards the hub and the scene is then
    // dissolved by the panel's own fade, so the two read as one movement
    if (arriving) {
      progress.current = Math.min(
        1,
        progress.current + delta * (1000 / ARRIVE_MS),
      );
      const ease = 1 - (1 - progress.current) ** 3;
      const [hx, hy, hz] = toWorld(HUB);
      camera.position.lerp(
        new THREE.Vector3(hx + 0.6, hy + 1.1, hz + 2.1),
        ease * 0.12,
      );
      camera.lookAt(hx, hy + 0.4, hz);
    }
  });

  return (
    <group ref={group}>
      <SceneBody />
    </group>
  );
}

function SceneBody() {
  const colours = useMemo(palette, []);

  return (
    <>
      <Relief colour={colours.ink} />
      {BRANCHES.map((branch) => (
        <Pin key={branch.code} branch={branch} colour={colours.brass} />
      ))}
      {BRANCHES.filter((branch) => !branch.hub).map((branch, index) => (
        <Arc
          key={branch.code}
          to={branch}
          colour={colours.brass}
          offset={index * 0.33}
        />
      ))}
    </>
  );
}

export default function Constellation() {
  const [arriving, setArriving] = useState(false);

  return (
    <Canvas
      // the scene is scenery: it must never take the keyboard
      tabIndex={-1}
      aria-hidden="true"
      dpr={[1, 1.6]}
      camera={{ position: [0, 4.6, 6.4], fov: 38 }}
      gl={{ antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.setClearAlpha(0);
        const onArrive = () => setArriving(true);
        window.addEventListener(ARRIVE_EVENT, onArrive);
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          // a lost context must not leave a dead black panel behind
          event.preventDefault();
          window.dispatchEvent(new Event("phmg:scene-failed"));
        });
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <Rig arriving={arriving} />
      <EffectComposer>
        <Bloom
          intensity={0.9}
          luminanceThreshold={0.35}
          luminanceSmoothing={0.3}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
