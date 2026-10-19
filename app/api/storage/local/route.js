import { createHash } from "node:crypto";
import { verifyTicket } from "@/lib/storage/tickets";
import { driverName, PREVIEWABLE } from "@/lib/storage";
import {
  existsLocal,
  getLocal,
  putLocal,
  removeLocal,
} from "@/lib/storage/local";

/**
 * The local storage driver's endpoint: the PHP gateway's three scripts, in
 * one route, for development and the tests.
 *
 * It checks the same signed tickets the gateway checks, so nothing here is
 * reachable without one — but it still refuses to run at all when the app is
 * configured to use the real gateway, so it can never become a second way in
 * on the live site.
 */

export const dynamic = "force-dynamic";

function guard() {
  if (driverName() !== "local") {
    return new Response("Not found", { status: 404 });
  }
  return null;
}

function ticketFrom(request, operation) {
  const url = new URL(request.url);
  return verifyTicket(
    url.searchParams.get("t") ?? "",
    url.searchParams.get("s") ?? "",
    operation,
  );
}

/** Upload, matching upload.php. */
export async function POST(request) {
  const closed = guard();
  if (closed) return closed;

  // one route stands in for three scripts, so the ticket says which
  let checked = ticketFrom(request, "put");
  if (!checked.ok && checked.status === 403) {
    checked = ticketFrom(request, "del");
  }
  if (!checked.ok) {
    return Response.json({ error: checked.error }, { status: checked.status });
  }
  const ticket = checked.ticket;

  if (ticket.op === "del") {
    const result = await removeLocal(ticket.k, {
      restore: ticket.restore,
      purge: ticket.purge,
    });
    return Response.json(result);
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No file" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return Response.json({ error: "Empty file" }, { status: 400 });
  }
  if (ticket.max && bytes.length > ticket.max) {
    return Response.json(
      { error: "File is larger than the ticket allows" },
      { status: 413 },
    );
  }
  if (
    Array.isArray(ticket.types) &&
    ticket.types.length > 0 &&
    !ticket.types.includes(file.type)
  ) {
    return Response.json(
      { error: `That kind of file is not allowed: ${file.type}` },
      { status: 415 },
    );
  }

  await putLocal(ticket.k, bytes);

  return Response.json({
    ok: true,
    key: ticket.k,
    size: bytes.length,
    mime: file.type,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  });
}

/** Download, matching download.php. */
export async function GET(request) {
  const closed = guard();
  if (closed) return closed;

  const checked = ticketFrom(request, "get");
  if (!checked.ok) {
    return new Response(checked.error, { status: checked.status });
  }
  const ticket = checked.ticket;

  let bytes;
  try {
    bytes = await getLocal(ticket.k);
  } catch {
    return new Response("No such file", { status: 404 });
  }

  const name = String(ticket.name ?? ticket.k.split("/").pop()).replace(
    /[^A-Za-z0-9 ._()-]/g,
    "_",
  );
  const inline = Boolean(ticket.inline) && PREVIEWABLE.includes(ticket.mime);

  return new Response(bytes, {
    headers: {
      "Content-Type": inline ? ticket.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; object-src 'none'; sandbox",
    },
  });
}

/** Used by `exists()`. */
export async function HEAD(request) {
  const closed = guard();
  if (closed) return closed;

  const checked = ticketFrom(request, "get");
  if (!checked.ok) return new Response(null, { status: checked.status });

  return new Response(null, {
    status: (await existsLocal(checked.ticket.k)) ? 200 : 404,
  });
}
