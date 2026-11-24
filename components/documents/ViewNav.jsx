import Link from "next/link";
import { Files, FolderOpen, Tray, Trash } from "@phosphor-icons/react/dist/ssr";

/**
 * The four ways into the firm's files, as icons in the top-right of the
 * header band.
 *
 * It was four text buttons under the title, which read like a second
 * navigation and pushed the filters down a row on a laptop. The places are
 * the same; only the label moved into the tooltip.
 *
 * @param {object} props
 * @param {"search"|"folders"|"pending"|"bin"} props.tab the place you are in
 * @param {boolean} [props.mayPurge] whether the recycle bin is this person's
 * @param {string} [props.search] the file search to carry back to the register
 */
export default function ViewNav({ tab, mayPurge = false, search = "" }) {
  const places = [
    [
      "search",
      "All files",
      `/documents${search ? `?q=${encodeURIComponent(search)}` : ""}`,
      Files,
    ],
    ["folders", "Folder structure", "/documents/folders", FolderOpen],
    ["pending", "Awaited from clients", "/documents?tab=pending", Tray],
    ...(mayPurge ? [["bin", "Recycle bin", "/documents/bin", Trash]] : []),
  ];

  return (
    <nav aria-label="Files" className="flex items-center gap-1">
      {places.map(([key, label, href, Icon]) => {
        const here = tab === key;
        return (
          <span key={key} className="group relative">
            <Link
              href={href}
              aria-label={label}
              aria-current={here ? "page" : undefined}
              className={`rounded-control flex h-8 w-8 items-center justify-center border transition-colors duration-150 ease-out ${
                here
                  ? "border-carbon bg-carbon-wash text-carbon"
                  : "border-rule text-ink-muted hover:bg-sunk hover:text-ink"
              }`}
            >
              <Icon size={17} weight={here ? "fill" : "regular"} />
            </Link>
            {/*
              The label, on hover and on keyboard focus. A span rather than a
              popover library: four static words that need no placement
              logic, and this way the header stays a server component.
            */}
            <span
              aria-hidden="true"
              className="rounded-control bg-ink text-paper text-12 pointer-events-none absolute top-full right-0 z-20 mt-1.5 translate-y-0.5 scale-95 px-2 py-1 whitespace-nowrap opacity-0 transition duration-150 ease-out group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0.5 motion-reduce:group-hover:scale-95"
            >
              {label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
