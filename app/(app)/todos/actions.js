"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import Todo from "@/models/Todo";
import User from "@/models/User";
import Client from "@/models/Client";
import { checkTodo } from "@/lib/todos/list";

/**
 * Writing a to-do down, and ticking it off (P3-22c).
 *
 * Every action here is audited like any other change (CLAUDE.md rule 2),
 * which is not ceremony: "who said this was done, and when" is the only
 * question a finished to-do is ever asked.
 */

/**
 * May this person change this row?
 *
 * The person it is for, the person who wrote it, or somebody whose role
 * reaches it — a partner anywhere, a CA for their own and their reports'.
 * The first two are not in the matrix because they are not about a role: a
 * to-do you wrote for a colleague stays yours to correct.
 */
function mayChange(actor, todo, reportingTo = "") {
  if (String(todo.ownerId) === actor.id) return true;
  if (todo.createdBy === actor.id) return true;
  return can(actor, "edit", "todos", {
    branchId: String(todo.branchId ?? ""),
    userId: String(todo.ownerId),
    reportingTo,
  });
}

/**
 * The row, and the one thing about its owner that `mayChange` needs: a CA
 * reaches a to-do belonging to somebody who reports to them.
 *
 * @returns {Promise<{todo: any, reportingTo: string}|null>}
 */
async function load(id) {
  await connectDB();
  const todo = await Todo.findById(id);
  if (!todo) return null;

  const owner = await User.findById(todo.ownerId).select("reportingTo").lean();
  return {
    todo,
    reportingTo: owner?.reportingTo ? String(owner.reportingTo) : "",
  };
}

const GONE = { error: "That to-do no longer exists." };
const NOT_YOURS = {
  error: "That is somebody else's to-do, and not one you wrote.",
};

/** Write one down. */
export async function addTodo(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "todos");

  const read = checkTodo({
    title: String(formData.get("title") ?? ""),
    due: String(formData.get("due") ?? ""),
  });
  if (!read.ok) return { error: read.error };

  const note = String(formData.get("note") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  const askedOwner = String(formData.get("ownerId") ?? "").trim();

  await connectDB();

  /**
   * Giving it to somebody else is allowed, within what this person can
   * already see — and the row keeps both names, so a to-do that turns up on
   * your list says who put it there.
   */
  let owner = { _id: actor.id, branchIds: [] };
  if (askedOwner && askedOwner !== actor.id) {
    const found = await User.findById(askedOwner)
      .select("name active branchIds")
      .lean();
    if (!found || found.active === false) {
      return { error: "That person is not on the team." };
    }
    assertCan(actor, "edit", "todos", {
      branchId: String(found.branchIds?.[0] ?? ""),
      userId: String(found._id),
    });
    owner = found;
  } else {
    const me = await User.findById(actor.id).select("branchIds").lean();
    owner = { _id: actor.id, branchIds: me?.branchIds ?? [] };
  }

  let client = null;
  if (clientId) {
    client = await Client.findById(clientId).select("branchId").lean();
    if (!client) return { error: "That client no longer exists." };
  }

  await audited(actor, async (session) => {
    await Todo.create(
      [
        {
          title: read.title,
          ownerId: owner._id,
          branchId: owner.branchIds?.[0] ?? client?.branchId ?? null,
          dueDate: read.due,
          clientId: clientId || null,
          note,
          createdBy: actor.id,
          createdByName: actor.name ?? "",
          updatedBy: actor.id,
        },
      ],
      { session, ordered: true },
    );
  });

  revalidatePath("/todos");
  revalidatePath("/my-day");
  return { ok: "Written down." };
}

/** Tick it off, or put it back. */
export async function tickTodo(id, done) {
  const actor = await requireUser();
  const found = await load(id);
  if (!found) return GONE;
  const { todo, reportingTo } = found;
  if (!mayChange(actor, todo, reportingTo)) return NOT_YOURS;

  await audited(actor, async (session) => {
    todo.done = Boolean(done);
    todo.doneAt = done ? new Date() : null;
    todo.doneBy = done ? actor.id : null;
    todo.doneByName = done ? (actor.name ?? "") : "";
    todo.updatedBy = actor.id;
    await todo.save({ session });
  });

  revalidatePath("/todos");
  revalidatePath("/my-day");
  return { ok: done ? "Ticked off." : "Back on the list." };
}

/** Move the date, or take it off. */
export async function setTodoDate(id, due) {
  const actor = await requireUser();
  const found = await load(id);
  if (!found) return GONE;
  const { todo, reportingTo } = found;
  if (!mayChange(actor, todo, reportingTo)) return NOT_YOURS;

  const read = checkTodo({ title: todo.title, due: String(due ?? "") });
  if (!read.ok) return { error: read.error };

  await audited(actor, async (session) => {
    todo.dueDate = read.due;
    todo.updatedBy = actor.id;
    await todo.save({ session });
  });

  revalidatePath("/todos");
  revalidatePath("/my-day");
  return { ok: read.due ? "Date changed." : "Date taken off." };
}

/** Hand it to somebody else. */
export async function setTodoOwner(id, userId) {
  const actor = await requireUser();
  const found = await load(id);
  if (!found) return GONE;
  const { todo, reportingTo } = found;
  if (!mayChange(actor, todo, reportingTo)) return NOT_YOURS;

  const person = await User.findById(String(userId ?? ""))
    .select("name active branchIds")
    .lean();
  if (!person || person.active === false) {
    return { error: "That person is not on the team." };
  }

  await audited(actor, async (session) => {
    todo.ownerId = person._id;
    todo.branchId = person.branchIds?.[0] ?? todo.branchId ?? null;
    todo.updatedBy = actor.id;
    await todo.save({ session });
  });

  revalidatePath("/todos");
  revalidatePath("/my-day");
  return { ok: `${person.name} has it now.` };
}

/**
 * Take it off the list for good.
 *
 * Soft delete, like everything else (CLAUDE.md rule 3) — a to-do somebody
 * removed rather than did is exactly the kind of thing that gets asked
 * about later.
 */
export async function removeTodo(id) {
  const actor = await requireUser();
  const found = await load(id);
  if (!found) return GONE;
  const { todo, reportingTo } = found;
  if (!mayChange(actor, todo, reportingTo)) return NOT_YOURS;

  await audited(actor, async (session) => {
    todo.updatedBy = actor.id;
    await todo.softDelete(actor.id, { session });
  });

  revalidatePath("/todos");
  revalidatePath("/my-day");
  return { ok: "Taken off the list." };
}
