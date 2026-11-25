/**
 * The service catalog as a spreadsheet (owner request, 24-11-2026).
 *
 *   npm run services:export            -> services-YYYY-MM-DD.xlsx here
 *   npm run services:export -- path.xlsx
 *
 * Read-only: nothing is written to the database, so no audit entry.
 */

import { writeFile } from "node:fs/promises";
import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import { buildWorkbook } from "../lib/excel.js";
import { tierLabel, RECURRENCE_LABELS } from "../lib/services/catalog.js";
import { ROLE_LABELS } from "../lib/permissions.js";
import ServiceTemplate from "../models/ServiceTemplate.js";

const out =
  process.argv[2] || `services-${new Date().toISOString().slice(0, 10)}.xlsx`;

const columns = [
  { header: "Code", key: "code" },
  { header: "Service", key: "name", width: 40 },
  { header: "Category", key: "category" },
  { header: "Tier", key: "tier", width: 18 },
  { header: "Recurrence", key: "recurrence" },
  { header: "Executed by", key: "exec" },
  { header: "Reviewed by", key: "review" },
  { header: "Turnaround (days)", key: "turnaroundDays", kind: "int" },
  { header: "Turnaround note", key: "turnaroundNote", width: 30 },
  { header: "Effort (hours)", key: "effortHours", kind: "number" },
  { header: "SAC", key: "sac" },
  { header: "Default fee", key: "defaultFeePaise", kind: "money" },
  { header: "GST %", key: "gstRate", kind: "int" },
  { header: "UDIN", key: "udin" },
  { header: "Client confirms", key: "confirm" },
  { header: "Steps", key: "stepCount", kind: "int" },
  { header: "Checklist items", key: "itemCount", kind: "int" },
  { header: "Version", key: "version", kind: "int" },
  { header: "Status", key: "status" },
];

try {
  await connectDB();

  const services = await ServiceTemplate.find({ deletedAt: null })
    .sort({ category: 1, name: 1 })
    .lean();

  const rows = services.map((s) => ({
    ...s,
    tier: tierLabel(s.level),
    recurrence: RECURRENCE_LABELS[s.recurrence] ?? s.recurrence,
    exec: ROLE_LABELS[s.minExecRole] ?? s.minExecRole,
    review: ROLE_LABELS[s.minReviewRole] ?? s.minReviewRole,
    udin: s.udinRequired ? "Yes" : "No",
    confirm: s.clientConfirmationRequired ? "Yes" : "No",
    stepCount: s.steps?.length ?? 0,
    itemCount: s.checklist?.length ?? 0,
    status: s.active ? "Active" : "Inactive",
  }));

  const buffer = await buildWorkbook([
    { name: "Services", columns, rows, title: `${rows.length} services` },
  ]);
  await writeFile(out, buffer);
  console.log(`${rows.length} services -> ${out}`);
} finally {
  await mongoose.disconnect();
}
