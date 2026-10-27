// @ts-check

/**
 * Access and view are two different things (P3-7).
 *
 * **Access** is what you may see: the branches on your account, plus the
 * client grants a CA has given you. It is enforced on the server by
 * `lib/permissions.js` and `lib/access/clientAccess.js`, and nothing here
 * touches it.
 *
 * **View** is what you are looking at *inside* your access — all of it, one
 * branch, or the work you prepare or review wherever the client happens to
 * sit. It is a filter on reading and nothing else.
 *
 * The rule, which is the whole reason this is a separate module:
 *
 * > **Changing the view never changes a record, a GSTIN or an invoice
 * > series, and it never widens access.**
 *
 * So `readView` validates against the account before anything downstream
 * sees it: a branch id typed into the cookie by hand is discarded rather
 * than honoured. The worst a tampered cookie can do is show you less.
 */

/** Everything this person may see. */
export const VIEW_ALL = "all";
/** Their own jobs, wherever the client sits. */
export const VIEW_MINE = "mine";

/** The cookie the top bar writes. Not a session claim: a reading preference. */
export const VIEW_COOKIE = "phmg-view";

/**
 * Turn whatever the cookie says into a view this person is actually allowed.
 *
 * @param {string|undefined|null} raw
 * @param {{role: string, branchIds?: string[]}} actor
 * @returns {string} "all", "mine", or a branch id
 */
export function readView(raw, actor) {
  const value = String(raw ?? "").trim();
  if (!value || value === VIEW_ALL) return VIEW_ALL;
  if (value === VIEW_MINE) return VIEW_MINE;

  // a partner's access is every branch, so any real branch id is theirs to
  // narrow to; everybody else may only narrow to one they are assigned
  if (actor?.role === "partner") {
    return /^[a-f0-9]{24}$/i.test(value) ? value : VIEW_ALL;
  }
  const mine = (actor?.branchIds ?? []).map(String);
  return mine.includes(value) ? value : VIEW_ALL;
}

/** The branch id this view narrows to, or null when it does not narrow by branch. */
export function viewBranch(view) {
  return view && view !== VIEW_ALL && view !== VIEW_MINE ? view : null;
}

/** Is this view "the work I prepare or review"? */
export function viewIsMine(view) {
  return view === VIEW_MINE;
}

/**
 * What to call the current view on screen.
 *
 * @param {string} view
 * @param {{ id: string, name: string }[]} branches
 */
export function viewLabel(view, branches = []) {
  if (view === VIEW_MINE) return "My work across branches";
  const branch = branches.find((b) => String(b.id) === String(view));
  return branch ? branch.name : "All my branches";
}

/**
 * A line for a screen the view does not apply to.
 *
 * Spec §2 scopes clients and work by branch; the service catalog, the firm's
 * settings and the registers are the firm's, not a branch's. Those screens
 * say so rather than appearing filtered, because a reader who thinks a
 * filter is on reads a complete list as a partial one.
 */
export const FIRM_WIDE_NOTE =
  "This is the whole firm's, so the branch view above does not change it.";

/**
 * Why a record is on screen when the current view would have hidden it.
 *
 * Opening a link from an email or a search is not the same as browsing, and
 * silently showing a Ludhiana job while the top bar says Noida is how
 * somebody comes to distrust the selector.
 *
 * @param {string} view
 * @param {string|null|undefined} recordBranchId
 * @param {{ id: string, name: string }[]} branches
 * @returns {string|null}
 */
export function outsideViewNote(view, recordBranchId, branches = []) {
  const narrowed = viewBranch(view);
  if (!narrowed || !recordBranchId) return null;
  if (String(narrowed) === String(recordBranchId)) return null;

  const where = branches.find((b) => String(b.id) === String(recordBranchId));
  return `You are viewing ${viewLabel(view, branches)}. This record belongs to ${
    where ? where.name : "another branch"
  } and is shown because you opened it directly.`;
}
