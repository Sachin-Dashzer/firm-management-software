import {
  House,
  Briefcase,
  CalendarCheck,
  Buildings,
  Warning,
  Stamp,
  Receipt,
  FolderOpen,
  UsersThree,
  Gear,
  BookOpen,
} from "@phosphor-icons/react";

/**
 * One icon per menu group (P3-22a).
 *
 * The owner's brief says to copy the prototype's inline SVG paths exactly.
 * **`CA-Firm-OS-v6.2.html` is not in the repository**, so these are the
 * Phosphor icons already in the project, chosen to mean the same thing —
 * and this file is the only place that has to change when the prototype
 * arrives: one map, eleven entries, no other file names an icon.
 */
const ICONS = {
  home: House,
  jobs: Briefcase,
  compliance: CalendarCheck,
  clients: Buildings,
  notices: Warning,
  audit: Stamp,
  billing: Receipt,
  docs: FolderOpen,
  team: UsersThree,
  setup: Gear,
  book: BookOpen,
};

/**
 * @param {{ name: string, size?: number, className?: string }} props
 */
export default function NavIcon({ name, size = 18, className = "" }) {
  const Glyph = ICONS[name] ?? House;
  return <Glyph size={size} aria-hidden className={className} />;
}
