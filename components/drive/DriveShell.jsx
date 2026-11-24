"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Segmented from "@/components/ui/Segmented";
import {
  moveDocument,
  moveFolder,
} from "@/app/(app)/documents/folders/actions";
import Breadcrumb from "./Breadcrumb";
import FolderGrid from "./FolderGrid";
import FileRows from "./FileRows";
import AddNewTile from "./AddNewTile";
import NewFolderDialog from "./NewFolderDialog";
import MoveDialog from "./MoveDialog";
import UploadQueue from "./UploadQueue";
import TileMenu from "./TileMenu";

/**
 * The work drive, as a person uses it (P3-48d).
 *
 * One client component holds everything that is about *using* the drive
 * rather than drawing it — which tile has the keyboard, tiles or rows, what
 * the arrow keys do, which panel is open, and what is being dragged — so
 * every other piece stays presentational and can be read on its own.
 *
 * **The keyboard moves between real links.** Arrow keys move the browser's
 * own focus from one `<a>` to the next, so Enter, open-in-a-new-tab, the
 * status bar and a screen reader's own navigation all keep working. A drive
 * built from divs with click handlers would have had to reimplement every
 * one of those, worse.
 */
export default function DriveShell({
  node,
  crumbs = [],
  folders = [],
  files = [],
  path = [],
  upHref = "",
  showLocks = false,
  recordsOnly = false,
  writeRules = { folders: false, upload: false, reason: "" },
  limits = { maxBytes: 25 * 1024 * 1024, allowed: [] },
  toolbar = null,
  notice = null,
  waiting = null,
}) {
  const router = useRouter();
  const gridRef = useRef(null);
  const [view, setView] = useState("grid");
  const [selected, setSelected] = useState("");
  /** Which panel is open: "new", "upload", {rename}, {move}. */
  const [panel, setPanel] = useState(null);
  const [dropping, setDropping] = useState("");
  const [message, setMessage] = useState(null);
  const [, startMove] = useTransition();

  // the choice of view is this person's, and it is remembered
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("phmg.drive.view");
      if (saved === "list" || saved === "grid") setView(saved);
    } catch {
      /* a private window: the default view is no worse for being chosen */
    }
  }, []);

  const choose = useCallback((next) => {
    setView(next);
    try {
      window.localStorage.setItem("phmg.drive.view", next);
    } catch {
      /* nothing to remember it with, which changes nothing on this visit */
    }
  }, []);

  /** How many tiles sit on one row, read off the rendered grid. */
  const perRow = useCallback(() => {
    const tiles = gridRef.current?.querySelectorAll("[data-drive-tile]") ?? [];
    if (tiles.length < 2) return 1;
    const top = tiles[0].offsetTop;
    let n = 0;
    for (const tile of tiles) {
      if (tile.offsetTop !== top) break;
      n += 1;
    }
    return Math.max(1, n);
  }, []);

  const customAt = useCallback(
    (segment) => folders.find((f) => f.segment === segment && !f.system),
    [folders],
  );

  /**
   * The shortcuts listen on the document, not on this element.
   *
   * After a navigation the focus sits on `body`, and a keypress there never
   * reaches a handler on a div inside it — events travel up. The browser
   * test caught it: Enter opened a folder and Backspace then did nothing,
   * which is the one key a person leans on in a file browser.
   */
  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [role='dialog'], [contenteditable]",
        )
      ) {
        return;
      }

      const tiles = [
        ...(gridRef.current?.querySelectorAll("[data-drive-tile]") ?? []),
      ];
      const at = tiles.indexOf(document.activeElement);

      const step = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: perRow(),
        ArrowUp: -perRow(),
      }[event.key];

      if (step !== undefined && tiles.length) {
        event.preventDefault();
        const next = tiles[Math.min(Math.max(at + step, 0), tiles.length - 1)];
        (at === -1 ? tiles[0] : next)?.focus();
        return;
      }

      // Backspace goes up a level, as it does in every file browser
      if (event.key === "Backspace" && upHref) {
        event.preventDefault();
        router.push(upHref);
        return;
      }

      if (event.key === "Escape") {
        setPanel(null);
        return;
      }

      if (event.key.toLowerCase() === "n" && writeRules.folders) {
        event.preventDefault();
        setPanel("new");
        return;
      }

      /*
        F2 renames the tile the keyboard is on, and only a folder somebody
        made: the rest are records, and are named by the record.
      */
      if (event.key === "F2" && writeRules.folders) {
        const here = customAt(tiles[at]?.dataset?.driveTile ?? "");
        if (here) {
          event.preventDefault();
          setPanel({ rename: tileSubject(here) });
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [perRow, router, upHref, writeRules.folders, customAt]);

  /**
   * Dropping onto a tile.
   *
   * The browser's own drag events rather than a library (the brief names
   * `@dnd-kit`): a tile is already a link, the uploader in this app has
   * used native drag events since it was built, and files dragged in from
   * the desktop arrive through the same handler — which a drag library
   * cannot do at all. What is dragged inside the drive travels as JSON in
   * the drag payload.
   */
  function onDrop(event, folder) {
    event.preventDefault();
    setDropping("");

    if (event.dataTransfer?.files?.length) {
      setMessage({
        error: "Drop files inside the folder you have open, not onto a tile.",
      });
      return;
    }

    let payload = null;
    try {
      payload = JSON.parse(event.dataTransfer.getData("application/json"));
    } catch {
      return;
    }
    if (!payload?.id) return;

    const target = [...path, folder.segment];
    startMove(async () => {
      const result =
        payload.kind === "folder"
          ? await moveFolder(payload.id, target)
          : await moveDocument(payload.id, target);

      if (result?.confirm) {
        setMessage({
          error: `${result.confirm} Use Move on the row to answer that.`,
        });
        return;
      }
      if (result?.error) {
        setMessage({ error: result.error });
        return;
      }
      setMessage({ ok: result.ok });
      router.refresh();
    });
  }

  const canTake = writeRules.upload || writeRules.folders;

  const withMenus = folders.map((folder) => ({
    ...folder,
    dropping: dropping === folder.segment,
    drag: canTake
      ? {
          onDragOver: (event) => {
            event.preventDefault();
            setDropping(folder.segment);
          },
          onDragLeave: () =>
            setDropping((was) => (was === folder.segment ? "" : was)),
          onDrop: (event) => onDrop(event, folder),
        }
      : null,
    draggable: !folder.system && writeRules.folders,
    menu:
      folder.system || !writeRules.folders ? null : (
        <TileMenu
          folder={tileSubject(folder)}
          onRename={(f) => setPanel({ rename: f })}
          onMove={(f) => setPanel({ move: { ...f, kind: "folder" } })}
        />
      ),
  }));

  const addNew = (
    <AddNewTile
      mayAddFolder={writeRules.folders}
      mayUpload={writeRules.upload}
      onNewFolder={() => setPanel("new")}
      onUpload={() => setPanel("upload")}
    />
  );

  const siblings = folders.filter((f) => !f.system).map((f) => f.label);
  const nothing = folders.length === 0 && files.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Breadcrumb crumbs={crumbs} />

        <div className="flex shrink-0 items-center gap-2">
          {toolbar}
          <Segmented
            label="How to show what is in here"
            value={view}
            onSelect={choose}
            items={[
              { key: "grid", label: "Tiles" },
              { key: "list", label: "List" },
            ]}
          />
        </div>
      </div>

      {notice}
      {waiting}

      {message?.ok && (
        <p role="status" className="text-13 text-filed">
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p role="alert" className="text-13 text-redpen">
          {message.error}
        </p>
      )}

      {panel === "new" && (
        <NewFolderDialog
          parentPath={path}
          parentType={node.type}
          siblings={siblings}
          onClose={() => setPanel(null)}
        />
      )}

      {panel?.rename && (
        <NewFolderDialog
          parentPath={path}
          parentType={node.type}
          siblings={siblings}
          renaming={panel.rename}
          onClose={() => setPanel(null)}
        />
      )}

      {panel?.move && (
        <MoveDialog subject={panel.move} onClose={() => setPanel(null)} />
      )}

      {panel === "upload" && (
        <UploadQueue
          folderPath={path}
          existing={files.map((file) => ({ id: file.id, name: file.name }))}
          maxBytes={limits.maxBytes}
          allowed={limits.allowed}
          onClose={() => setPanel(null)}
        />
      )}

      <div ref={gridRef} className="flex min-h-0 flex-1 flex-col gap-6">
        {nothing ? (
          <div className="rounded-ledger border-rule flex flex-col items-center gap-2 border border-dashed px-6 py-12 text-center">
            <p className="text-14 font-medium">Nothing in {node.label} yet.</p>
            <p className="text-13 text-ink-muted max-w-[52ch]">
              {emptyLine(node)}
            </p>
            {canTake && (
              <div className="mt-2 flex gap-2">
                {writeRules.folders && (
                  <button
                    type="button"
                    onClick={() => setPanel("new")}
                    className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3 transition-colors duration-150 ease-out"
                  >
                    New folder
                  </button>
                )}
                {writeRules.upload && (
                  <button
                    type="button"
                    onClick={() => setPanel("upload")}
                    className="rounded-control bg-carbon text-on-carbon text-13 h-8 px-3 font-medium"
                  >
                    Upload files
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <FolderGrid
              folders={withMenus}
              files={files}
              view={view}
              selected={selected}
              showLocks={showLocks}
              onFocusTile={setSelected}
              addNew={addNew}
            />
            {view === "grid" && (
              <FileRows
                files={files}
                mayMove={writeRules.upload}
                onMove={(file) => setPanel({ move: { ...file, kind: "file" } })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A tile as the dialogs want it: the stored id, and what it is called. */
function tileSubject(folder) {
  return { id: folder.segment.replace(/^f-/, ""), label: folder.label };
}

/** What belongs in this place, said in the words of the place itself. */
function emptyLine(node) {
  switch (node.type) {
    case "clients":
      return "No client is in view. A client's folder appears as soon as the client record exists.";
    case "services":
      return "The service catalog is empty. Services appear here from the catalog.";
    case "svc":
      return "This client has no service with a job or a file yet.";
    case "service":
      return "No financial year for this service yet. Add one to collect papers before the job exists.";
    case "permanent":
      return "The PAN card, the incorporation certificate and the deeds go here — the papers every job refers to.";
    case "engagement":
      return "Nothing has been attached to this job yet. Files put on its checklist steps appear here too.";
    case "my":
      return "Your own working copies, which nobody else can open.";
    case "hq":
      return "The firm's own papers: office policies, ICAI circulars, anything about no client.";
    default:
      return "Files put here are filed under this folder automatically.";
  }
}
