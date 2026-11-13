// @ts-check

import { connectDB } from "@/lib/db";
import DocTemplate from "@/models/DocTemplate";

/**
 * The firm's letter templates, for the `doc` rows in the service form.
 *
 * Shared by the new and the edit screen rather than written twice: the two
 * render the same form, and a list that was fetched differently on each
 * would be two places for the same question to get a different answer.
 *
 * Unapproved wording is **offered and marked** rather than hidden. A
 * template whose words nobody has signed off still produces a watermarked
 * draft (`lib/docs/rules.js`), which is exactly what a service being
 * written up this afternoon wants to point at; hiding it would only mean
 * the row could not be set up until somebody with signing authority had
 * read the letter.
 */
export async function letterTemplates() {
  await connectDB();
  const rows = await DocTemplate.find({ active: true })
    .select("name kind verifiedAt")
    .sort({ kind: 1, name: 1 })
    .limit(300)
    .lean();

  /**
   * The kind travels beside the name rather than inside it: the picker
   * groups by it with a native `<optgroup>`, where prefixing every option
   * with "Engagement · " spent the column's whole width on the heading.
   */
  return rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    kind: row.kind || "Other",
    verified: Boolean(row.verifiedAt),
  }));
}
