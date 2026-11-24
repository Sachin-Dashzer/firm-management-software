import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { signIn, PASSWORD } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import DocumentModel from "../../models/Document.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";

/**
 * The Files tab shows everything the job rests on (P3-48b).
 *
 * `tests/documents.forEngagement.test.js` proves the **set** is the same
 * one the job's folder in the work drive will list. This proves the tab
 * actually draws it — including the papers that live in the client's
 * permanent file, which the tab did not show at all before this step, and
 * which must be marked as somebody else's or they get "corrected" from
 * inside one month's return.
 *
 * The files are written straight to the database rather than uploaded: the
 * upload path has its own specs, and what is under test here is the reading.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

// the helper's own default, which is what it signs in with
const DAY = 86_400_000;

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-jf-partner-${tag}@phmgindia.test`,
    code: `PWJF-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Job Files ${tag} Private Limited`,
  };
}

let engagementId = "";

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await DocumentModel.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany({ code: fx.code }, { withDeleted: true });
  await User.deleteMany({ email: fx.partner });
}

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { new: true, upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Playwright Job Files Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    const [client] = await Client.create(
      [
        {
          code: `PHMG-NOI-8${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright GST return ${testInfo.project.name}`,
          code: fx.code,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          checklist: [{ name: "PAN card", side: "client" }],
          steps: [{ name: "Prepare the return" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const period = periodFor("monthly", new Date(Date.now() - 40 * DAY));
    const fields = buildEngagement({ template: service, client, period });
    const [job] = await Engagement.create(
      [
        {
          ...fields,
          code: `PWJF-${service.code}`,
          status: "In progress",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    engagementId = String(job._id);

    const file = (extra) => ({
      size: 2048,
      mime: "application/pdf",
      checksum: "x",
      clientId: client._id,
      branchId: branch._id,
      uploadedByName: "A colleague",
      createdBy: "test",
      updatedBy: "test",
      ...extra,
    });

    const [onJob, pan, other] = await DocumentModel.create(
      [
        file({
          name: "Sales register October.pdf",
          fileKey: "clients/pwjf/1.pdf",
          engagementId: job._id,
        }),
        file({
          name: "PAN card.pdf",
          fileKey: "clients/pwjf/permanent/2.pdf",
          isPermanent: true,
        }),
        file({
          name: "Incorporation certificate.pdf",
          fileKey: "clients/pwjf/permanent/3.pdf",
          isPermanent: true,
        }),
      ],
      { session, ordered: true },
    );
    expect(String(onJob._id)).toBeTruthy();
    expect(String(other._id)).toBeTruthy();

    // the checklist item is answered by the client's permanent PAN card
    const live = await Engagement.findById(job._id).session(session);
    live.checklist[0].documentIds.push(pan._id);
    live.checklist[0].status = "Received";
    live.updatedBy = "test";
    await live.save({ session });
  });
});

test.afterAll(async ({}, testInfo) => {
  await wipe(names(testInfo.project.name));
});

test("the Files tab shows the job's own files and the papers it rests on", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(`/engagements/${engagementId}?tab=files`);

  const files = page.getByRole("heading", { name: "Files" });
  await expect(files).toBeVisible();

  // the job's own paper is the firm's side or the client's; this one is theirs
  await page.getByRole("tab", { name: /By client side/ }).click();
  await expect(page.getByText("Sales register October.pdf")).toBeVisible();

  /**
   * The permanent file the checklist points at, shown and **marked**: it is
   * the client's for ever, not this job's, so it carries the linked chip and
   * says where it is from.
   */
  const pan = page
    .getByRole("listitem")
    .filter({ hasText: "PAN card.pdf" })
    .first();
  await expect(pan).toBeVisible();
  await expect(pan.getByText("linked")).toBeVisible();
  await expect(pan.getByText("From the permanent file")).toBeVisible();
  // a linked paper is not this job's to replace
  await expect(pan.getByRole("button", { name: "Edit" })).toHaveCount(0);

  // a permanent file no step asked for stays out of this job
  await expect(page.getByText("Incorporation certificate.pdf")).toHaveCount(0);

  await page.screenshot({
    path: `test-results/job-files-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

/**
 * The recycle bin's Folders section (P3-48c).
 *
 * The rows are written already deleted, with the stamp the delete action
 * puts on them — the stamping itself is held by
 * `tests/folders.delete-restore.test.js`, against real transactions. What
 * this checks is that a partner opening the bin sees the folder, what was
 * in it, and one button rather than fourteen.
 */
test("a deleted folder shows in the bin with what went down with it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  const client = await Client.findOne({ legalName: fx.clientName });
  const folderId = new mongoose.Types.ObjectId();
  const deletedAt = new Date();

  await mongoose.connection.collection("folders").insertOne({
    _id: folderId,
    name: "Bank statements",
    nameKey: "bank statements",
    kind: "custom",
    zone: "client",
    anchor: `clients/c-${client._id}`,
    parentId: null,
    clientId: client._id,
    branchId: client.branchId,
    ancestors: [],
    depth: 0,
    deletedAt,
    deletedBy: "test",
    deletedWithFolderId: folderId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await DocumentModel.collection.insertMany([
    {
      _id: new mongoose.Types.ObjectId(),
      name: "HDFC April.pdf",
      fileKey: "clients/pwjf/bin-1.pdf",
      size: 2048,
      mime: "application/pdf",
      clientId: client._id,
      zone: "client",
      folderId,
      versions: [],
      deletedAt,
      deletedBy: "test",
      deletedWithFolderId: folderId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: new mongoose.Types.ObjectId(),
      name: "HDFC May.pdf",
      fileKey: "clients/pwjf/bin-2.pdf",
      size: 2048,
      mime: "application/pdf",
      clientId: client._id,
      zone: "client",
      folderId,
      versions: [],
      deletedAt,
      deletedBy: "test",
      deletedWithFolderId: folderId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  await signIn(page, fx.partner);
  await page.goto("/documents/bin");

  const folders = page.getByRole("heading", { name: /^Folders \(/ });
  await expect(folders).toBeVisible();

  const row = page
    .getByRole("row")
    .filter({ hasText: "Bank statements" })
    .first();
  await expect(row).toBeVisible();
  await expect(row.getByText("2 files")).toBeVisible();
  await expect(row.getByRole("button", { name: "Restore" })).toBeVisible();
  await expect(
    page.getByText(/Restoring a folder brings back the files/),
  ).toBeVisible();

  await page.screenshot({
    path: `test-results/bin-folders-${testInfo.project.name}.png`,
    fullPage: true,
  });

  await mongoose.connection.collection("folders").deleteOne({ _id: folderId });
});

/**
 * Erasing a file for good, through the screen the owner used (24-11-2026).
 *
 * The unit tests hold the write; this holds the button, against a server
 * started from scratch — which is the only way to see the schema the app
 * actually runs, because Mongoose compiles a model once and keeps it for
 * the life of the process.
 */
test("a partner erases a binned file for good", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  const broke = [];
  page.on("pageerror", (err) => broke.push(err.message));

  const client = await Client.findOne({ legalName: fx.clientName });
  const doomed = new mongoose.Types.ObjectId();
  await DocumentModel.collection.insertOne({
    _id: doomed,
    name: "A scan nobody needs.pdf",
    fileKey: "clients/pwjf/doomed.pdf",
    size: 1024,
    mime: "application/pdf",
    clientId: client._id,
    zone: "client",
    versions: [],
    deletedAt: new Date(),
    deletedBy: "test",
    purgedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await signIn(page, fx.partner);
  await page.goto("/documents/bin");

  const row = page
    .getByRole("row")
    .filter({ hasText: "A scan nobody needs.pdf" })
    .first();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Erase" }).click();
  await expect(row.getByText("Erase for good?")).toBeVisible();
  await row.getByRole("button", { name: "Yes, erase it" }).click();

  // the record stays and says what happened to it
  await expect(row.getByText("already erased")).toBeVisible();
  await expect(page.getByText(/File erased/)).toBeVisible();

  const after = await DocumentModel.findById(doomed)
    .setOptions({ withDeleted: true })
    .lean();
  expect(after, "the record outlives the bytes").toBeTruthy();
  expect(after.fileKey).toBe("");
  expect(after.purgedAt).toBeTruthy();

  expect(broke, "the page threw while this ran").toEqual([]);

  await DocumentModel.collection.deleteOne({ _id: doomed });
});
