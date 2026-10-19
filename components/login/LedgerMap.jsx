import { BRANCHES, HUB, toSvg } from "./branches";

/**
 * The flat version of the branch constellation (spec section 15).
 *
 * This is not a loading placeholder — it is the version most devices with
 * data saver on, four cores or a reduced-motion preference will actually
 * see, so it is drawn to be looked at: ink contour lines for the
 * foothills, a ruled plain, the two rivers, and four brass pins joined to
 * the head office by thin arcs.
 *
 * Pure SVG with no animation and no JavaScript, which is also what makes
 * it the honest fallback: nothing here can fail to load.
 */

const BOX = { width: 620, height: 470, pad: 60 };

const pin = (branch) => ({ ...branch, ...toSvg(branch, BOX) });
const PINS = BRANCHES.map(pin);
const hub = pin(HUB);

/** An arc from the head office out to a branch, bowed towards the north. */
function arcTo(target) {
  const midX = (hub.x + target.x) / 2;
  const midY = (hub.y + target.y) / 2;
  const lift = Math.hypot(target.x - hub.x, target.y - hub.y) * 0.28;
  return `M ${hub.x} ${hub.y} Q ${midX} ${midY - lift} ${target.x} ${target.y}`;
}

export default function LedgerMap({ className = "" }) {
  return (
    <svg
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      className={className}
      role="img"
      aria-label="A ledger-style map of North India marking the firm's four offices: Ludhiana, Meerut, Delhi and Noida."
    >
      {/* the ruled sheet it is all drawn on */}
      <g stroke="var(--rule)" strokeWidth="1" opacity="0.75">
        {Array.from({ length: 16 }, (_, index) => (
          <line
            key={index}
            x1="40"
            x2={BOX.width - 40}
            y1={60 + index * 24}
            y2={60 + index * 24}
          />
        ))}
      </g>

      {/* the foothills, as contour lines climbing to the north edge */}
      <g fill="none" stroke="var(--ink-muted)" strokeLinecap="round">
        <path
          d="M52 150 C 150 112, 236 140, 318 118 S 470 96, 568 128"
          strokeWidth="1.5"
          opacity="0.9"
        />
        <path
          d="M52 124 C 146 92, 240 116, 322 94 S 474 72, 568 102"
          strokeWidth="1.2"
          opacity="0.6"
        />
        <path
          d="M52 100 C 150 72, 232 94, 316 70 S 476 50, 568 78"
          strokeWidth="1"
          opacity="0.4"
        />
        <path
          d="M52 176 C 158 146, 244 170, 330 150 S 468 128, 568 156"
          strokeWidth="1.2"
          opacity="0.55"
        />
      </g>

      {/* the two rivers: one from the hills past Delhi, one to the east */}
      <g fill="none" stroke="var(--carbon)" strokeWidth="1.4" opacity="0.35">
        <path d="M296 150 C 326 206, 352 258, 372 330 S 392 404, 404 424" />
        <path d="M430 160 C 462 214, 486 272, 500 340 S 512 398, 520 424" />
      </g>

      {/* the arcs of light, flat and still */}
      <g fill="none" stroke="var(--brass)" strokeWidth="1.4">
        {PINS.filter((branch) => !branch.hub).map((branch) => (
          <path
            key={branch.code}
            d={arcTo(branch)}
            opacity="0.75"
            strokeDasharray="1 5"
            strokeLinecap="round"
          />
        ))}
      </g>

      {/* the pins */}
      {PINS.map((branch) => (
        <g key={branch.code}>
          <circle
            cx={branch.x}
            cy={branch.y}
            r={branch.hub ? 11 : 8}
            fill="none"
            stroke="var(--brass)"
            strokeWidth="1"
            opacity="0.5"
          />
          <circle
            cx={branch.x}
            cy={branch.y}
            r={branch.hub ? 5 : 3.5}
            fill="var(--brass)"
          />
          <text
            x={branch.x + (branch.hub ? 18 : 14)}
            y={branch.y + 4}
            fill="var(--ink)"
            fontSize="13"
            fontFamily="var(--font-sans), sans-serif"
          >
            {branch.name}
          </text>
        </g>
      ))}

      {/* a plate in the corner, the way a drawn map is signed */}
      <g
        fill="var(--ink-muted)"
        fontSize="11"
        fontFamily="var(--font-mono), monospace"
      >
        <text x="40" y={BOX.height - 24} letterSpacing="1.5">
          PHMG &amp; ASSOCIATES · FOUR OFFICES · NORTH INDIA
        </text>
      </g>
      <line
        x1="40"
        x2={BOX.width - 40}
        y1={BOX.height - 38}
        y2={BOX.height - 38}
        stroke="var(--brass)"
        strokeWidth="1"
      />
    </svg>
  );
}
