import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
import Folder from "../../models/Folder.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";

/**
 * The work drive, walked (P3-48d).
 *
 * The unit tests hold the rules; this holds the thing the owner actually
 * asked for — that a person can open Home, find a client, walk down to a
 * job and see its files, by clicking and by keyboard alone.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const DAY = 86_400_000;

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-drive-partner-${tag}@phmgindia.test`,
    code: `PWD-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Drive ${tag} Private Limited`,
    service: `Playwright Drive audit ${tag}`,
  };
}

let ids = {};

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await DocumentModel.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Folder.deleteMany({ clientId: client._id }, { withDeleted: true });
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
      { returnDocument: "after", upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Playwright Drive Partner",
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
          code: `PHMG-NOI-7${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          tradeName: `Playwright Drive ${testInfo.project.name}`,
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
          name: fx.service,
          code: fx.code,
          category: "Audit and Assurance",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "annual",
          checklist: [{ name: "Trial balance", side: "client" }],
          steps: [{ name: "Do the work" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const period = periodFor("annual", new Date(Date.now() - 40 * DAY));
    const fields = buildEngagement({ template: service, client, period });
    const [job] = await Engagement.create(
      [
        {
          ...fields,
          code: `PWD-${service.code}`,
          status: "In progress",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    await DocumentModel.create(
      [
        {
          name: "Trial balance 2026.pdf",
          fileKey: "clients/pwd/1.pdf",
          size: 4096,
          mime: "application/pdf",
          checksum: "x",
          clientId: client._id,
          engagementId: job._id,
          serviceTemplateId: service._id,
          fy: fields.fy ?? "",
          branchId: branch._id,
          uploadedByName: "A colleague",
          createdBy: "test",
          updatedBy: "test",
        },
        {
          name: "PAN card.pdf",
          fileKey: "clients/pwd/permanent/2.pdf",
          size: 1024,
          mime: "application/pdf",
          checksum: "x",
          clientId: client._id,
          isPermanent: true,
          branchId: branch._id,
          uploadedByName: "A colleague",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    ids = {
      client: String(client._id),
      service: String(service._id),
      job: String(job._id),
    };
  });
});

test.afterAll(async ({}, testInfo) => {
  await wipe(names(testInfo.project.name));
});

/**
 * A folder tile, and not the left rail's own "Clients" link — which is what
 * an unscoped locator found the first time this ran, walking the test out of
 * the drive entirely.
 */
const tile = (page, name) =>
  page
    .getByRole("group", { name: "Folders" })
    .getByRole("link", { name: new RegExp(name, "i") })
    .first();

test("Home leads down to a job, and the job shows its files", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/documents/folders");

  // Home: the four drives
  await expect(page.getByRole("heading", { name: "Work drive" })).toBeVisible();
  for (const drive of ["My Docs", "HQ", "Clients", "Services"]) {
    await expect(tile(page, drive)).toBeVisible();
  }
  await page.screenshot({
    path: `test-results/drive-home-${testInfo.project.name}.png`,
    fullPage: true,
  });

  // Clients, which is a level of records and says so once
  await tile(page, "Clients").click();
  await expect(page).toHaveURL(/\/documents\/folders\/clients$/);
  await expect(
    page.getByText(/These folders come from the records/),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/drive-clients-${testInfo.project.name}.png`,
    fullPage: true,
  });

  // the client, with its permanent file and its services
  await tile(page, "Playwright Drive").click();
  await expect(tile(page, "Permanent file")).toBeVisible();
  await expect(tile(page, "Services")).toBeVisible();
  await page.screenshot({
    path: `test-results/drive-client-${testInfo.project.name}.png`,
    fullPage: true,
  });

  // the permanent file holds the PAN card, and nothing of the job's
  await tile(page, "Permanent file").click();
  await expect(page.getByText("PAN card.pdf")).toBeVisible();
  await expect(page.getByText("Trial balance 2026.pdf")).toHaveCount(0);

  // back up, then down through the service and the year to the job
  await page.goBack();
  await tile(page, "Services").click();
  await tile(page, fx.service).click();
  await tile(page, "^FY 20").click();
  await expect(tile(page, fx.service)).toBeVisible();
  await tile(page, fx.service).click();
  await expect(page.getByText("Trial balance 2026.pdf")).toBeVisible();
  await page.screenshot({
    path: `test-results/drive-job-${testInfo.project.name}.png`,
    fullPage: true,
  });

  // the breadcrumb is the way back, and it keeps whose papers these are
  const crumbs = page.getByRole("navigation", { name: "Where you are" });
  await expect(
    crumbs.getByRole("link", {
      name: `Playwright Drive ${testInfo.project.name}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(crumbs.getByRole("link", { name: fx.service })).toBeVisible();
  await crumbs.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/documents\/folders$/);
});

test("the tiles can be walked with the keyboard alone", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/documents/folders/clients");

  await tile(page, "Playwright Drive").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/clients/c-${ids.client}$`));

  /**
   * Wait for the client's own tiles before pressing again. A key struck in
   * the moment between a client-side navigation and the next page's
   * listeners is lost — true of any app, and not something a person can hit,
   * but a test that races it fails on a slow morning.
   */
  await expect(tile(page, "Permanent file")).toBeVisible();

  // Backspace goes up a level, as it does in every file browser
  await page.keyboard.press("Backspace");
  await expect(page).toHaveURL(/\/documents\/folders\/clients$/);
});

test("a mixed-up address is a dead end, not somebody else's files", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  const other = new mongoose.Types.ObjectId();
  await page.goto(
    `/documents/folders/clients/c-${other}/svc/s-${ids.service}/fy-2025-26/e-${ids.job}`,
  );

  await expect(page.getByText("There is nothing here.")).toBeVisible();
  await expect(page.getByText("Trial balance 2026.pdf")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Folders" })).toHaveCount(0);
});

test("the drive reads in the dark, and on a phone", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/documents/folders/clients/c-${ids.client}`);
  await expect(tile(page, "Permanent file")).toBeVisible();
  await page.screenshot({
    path: `test-results/drive-dark-${testInfo.project.name}.png`,
    fullPage: true,
  });

  // and on the big monitor the firm actually uses
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/documents/folders/clients");
  await expect(tile(page, "Playwright Drive")).toBeVisible();
  await page.screenshot({
    path: `test-results/drive-wide-${testInfo.project.name}.png`,
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/documents/folders/clients");
  await expect(tile(page, "Playwright Drive")).toBeVisible();
  await page.screenshot({
    path: `test-results/drive-phone-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

/**
 * The writing half of the drive (P3-48d, second pass).
 *
 * Everything here is done the way a person does it — clicking the tile,
 * typing the name — because the server rules already have unit tests and
 * what is untested is the wiring between them and the screen.
 */
test("a folder is made, renamed, searched for and deleted", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/documents/folders/hq");

  // --- made ----------------------------------------------------------------
  await page
    .getByRole("button", { name: /Add new|New folder/ })
    .first()
    .click();

  const box = page.getByRole("textbox", { name: "Folder name" });
  if (!(await box.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "New folder" }).click();
  }
  await expect(box).toBeFocused();
  await box.fill("Office policies");
  await page.getByRole("button", { name: "Make the folder" }).click();

  await expect(tile(page, "Office policies")).toBeVisible();
  await page.screenshot({
    path: `test-results/drive-made-${testInfo.project.name}.png`,
    fullPage: true,
  });

  // a second one of the same name is refused, with the next free name offered
  await page
    .getByRole("button", { name: /Add new|New folder/ })
    .first()
    .click();
  if (!(await box.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "New folder" }).click();
  }
  await box.fill("office policies");
  await expect(page.getByText(/is already here/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Use .office policies \(2\)./ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // --- renamed -------------------------------------------------------------
  const made = page
    .getByRole("group", { name: "Folders" })
    .locator("div")
    .filter({ hasText: "Office policies" })
    .first();
  await made.hover();
  await page
    .getByRole("button", { name: "What to do with Office policies" })
    .click();
  await page.getByRole("button", { name: "Rename" }).click();
  await page
    .getByRole("textbox", { name: "New name" })
    .fill("Office policies 2026");
  await page
    .getByRole("button", { name: "Rename", exact: true })
    .last()
    .click();
  await expect(tile(page, "Office policies 2026")).toBeVisible();

  // --- searched for --------------------------------------------------------
  await page.keyboard.press("/");
  const search = page.getByRole("textbox", { name: "Find in the drive" });
  await expect(search).toBeFocused();
  await search.fill("Office policies");
  const found = page.getByRole("region", { name: "What was found" });
  await expect(
    found.getByRole("heading", { name: "Folders", exact: true }),
  ).toBeVisible();
  await expect(
    found.getByRole("link", { name: "Office policies 2026" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/drive-search-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");

  // --- deleted -------------------------------------------------------------
  await page
    .getByRole("button", { name: "What to do with Office policies 2026" })
    .click();
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText(/It all goes to the recycle bin/)).toBeVisible();
  await page
    .getByRole("button", { name: "Delete", exact: true })
    .last()
    .click();

  await expect(tile(page, "Office policies 2026")).toHaveCount(0);
});

test("a year can be opened before the job that will fill it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(
    `/documents/folders/clients/c-${ids.client}/svc/s-${ids.service}`,
  );

  await page.getByRole("button", { name: "FY Year" }).click();

  /*
    The years arrive from the server after the panel opens, so the list is
    read once it has settled and then clicked **by name**. Clicking the
    first match while React was still filling the list hit a node that no
    longer existed, which is why this passed alone and failed in the suite.
  */
  const choice = page.getByRole("button", { name: /^FY 20/ }).first();
  await expect(choice).toBeVisible();
  const label = (await choice.innerText()).trim();
  await page.getByRole("button", { name: label, exact: true }).click();

  /*
    The panel closes only once the server has answered, so waiting for it
    is waiting for the write. Reloading before that cancelled the request
    in flight — which is why this passed alone, where it was slower, and
    failed in the suite.
  */
  await expect(page.getByRole("button", { name: /^FY 20/ })).toHaveCount(0);

  // then read it back from the server rather than trusting the refresh
  await page.reload();
  await expect(tile(page, label.replace(/\s+/g, "\\s+"))).toBeVisible();
  await page.screenshot({
    path: `test-results/drive-fy-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("a level made only of records offers nothing to add", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/documents/folders/clients");

  await expect(
    page.getByRole("button", { name: /Add new|New folder|Upload/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/These folders come from the records/),
  ).toBeVisible();
});

/**
 * The file register (P3-48e).
 *
 * The flat list over the same records the drive shows as folders: the
 * filters, the drawer, choosing several files, and the export link.
 */
test("the register filters, opens a file and acts on several", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  /**
   * A thrown error in the page fails this test rather than being swallowed.
   *
   * It is here because of what it caught: the preview drawer rendered the
   * audit description **object** where React wanted a string, which only
   * showed up once a file had any history — so the test passed on its own
   * and failed in the suite, with nothing but a timeout to go on.
   */
  const broke = [];
  page.on("pageerror", (err) => broke.push(err.message));

  await signIn(page, fx.partner);
  await page.goto("/documents");

  // the rail carries the same words, so the tabs are read inside the page
  const main = page.locator("#content");
  await expect(main.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Folder structure" }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Export to Excel" }),
  ).toBeVisible();

  // the two fixture files are here, with where they sit
  await expect(
    page.getByRole("button", { name: "PAN card.pdf", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Trial balance 2026.pdf", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/register-${testInfo.project.name}.png`,
    fullPage: true,
  });

  // a filter that is in the URL, so the view is a bookmark
  await page.goto("/documents?where=permanent");
  await expect(
    page.getByRole("button", { name: "PAN card.pdf", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Trial balance 2026.pdf", exact: true }),
  ).toHaveCount(0);

  // the drawer reads one file without leaving the list
  await page.getByRole("button", { name: "PAN card.pdf", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "PAN card.pdf" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Permanent file")).toBeVisible();
  await expect(
    drawer.getByRole("heading", { name: "What has happened to it" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/register-drawer-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  // choosing files brings up what can be done to them
  await page.getByRole("checkbox", { name: "Choose PAN card.pdf" }).check();
  await expect(page.getByText("1 chosen")).toBeVisible();
  await page.getByRole("button", { name: "Share with the client" }).click();
  await expect(page.getByText(/1 shared/)).toBeVisible();
  await page.screenshot({
    path: `test-results/register-bulk-${testInfo.project.name}.png`,
    fullPage: true,
  });

  expect(broke, "the page threw while this ran").toEqual([]);
});

/**
 * The client's own Documents tab, which is the drive rooted at the client
 * (P3-48f, brief §12.2).
 */
test("a client's files are the same folders, on the client's page", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  const broke = [];
  page.on("pageerror", (err) => broke.push(err.message));

  await signIn(page, fx.partner);
  await page.goto(`/clients/${ids.client}?tab=documents`);

  // the strip of facts, then the same tiles the drive shows
  await expect(page.getByText("in the permanent file")).toBeVisible();
  await expect(tile(page, "Permanent file")).toBeVisible();
  await expect(tile(page, "Services")).toBeVisible();
  await page.screenshot({
    path: `test-results/client-documents-${testInfo.project.name}.png`,
    fullPage: true,
  });

  // the address is the folder, and it is a bookmark
  await page.goto(`/clients/${ids.client}?tab=documents&path=permanent`);
  await expect(page.getByText("PAN card.pdf")).toBeVisible();

  // and walking in by clicking keeps the person on the client's page
  await page.goto(`/clients/${ids.client}?tab=documents`);
  await tile(page, "Permanent file").click();
  await expect(page).toHaveURL(/\/clients\/.*tab=documents&path=permanent/);
  await expect(page.getByText("PAN card.pdf")).toBeVisible();

  // and the drive is one click away, at the same place
  await page.goto(`/clients/${ids.client}?tab=documents`);
  await page.getByRole("link", { name: "Open in Work Drive" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/documents/folders/clients/c-${ids.client}$`),
  );

  expect(broke, "the page threw while this ran").toEqual([]);
});

/**
 * A folder dropped on the drive arrives as that folder (P3-48d).
 *
 * The bug: a browser never sends folders — `webkitdirectory` hands over a
 * flat list of files, each carrying its old path in `webkitRelativePath` —
 * and the queue sent every one of them to the folder being looked at. So
 * picking "KYC" put four loose files in HQ and lost all three folders.
 *
 * Written as the owner reported it: pick a folder with folders inside it,
 * and look for the structure afterwards rather than for the files.
 */
test("a picked folder arrives with its own folders, not as loose files", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/documents/folders/hq");

  await page
    .getByRole("button", { name: /Add new|New folder|Upload/ })
    .first()
    .click();
  const upload = page.getByRole("button", { name: /^Upload files$/ });
  if (await upload.isVisible().catch(() => false)) await upload.click();

  /*
   * `setInputFiles` on a `webkitdirectory` input takes the directory
   * itself, and Playwright fills in `webkitRelativePath` exactly as a
   * browser would — which is the whole input this fix reads.
   */
  await page
    .getByLabel("A folder to upload")
    .setInputFiles(kycFolder(testInfo));

  // every file settles before anything is looked at: the queue says so
  await expect(page.getByRole("heading", { name: "3 of 3 done" })).toBeVisible({
    timeout: 60_000,
  });

  // the folder, at the level it was dropped on
  await expect(tile(page, "KYC")).toBeVisible({ timeout: 30_000 });
  // and not its contents, flattened into here
  await expect(page.getByText("noshad.txt", { exact: true })).toHaveCount(0);

  // the folders it had inside it, one level down
  await tile(page, "KYC").click();
  await expect(tile(page, "Aadhaar")).toBeVisible();
  await expect(tile(page, "PAN")).toBeVisible();
  // the file that sat loose in the picked folder stays loose in it
  await expect(page.getByText("cover.txt").first()).toBeVisible();

  // two levels down, the files themselves
  await tile(page, "Aadhaar").click();
  await expect(page.getByText("noshad.txt").first()).toBeVisible();

  await page.screenshot({
    path: `test-results/drive-folder-upload-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

/**
 * The folder the test picks: two folders deep, with a file loose at the top
 * so the "stays where it was" half of the claim has something to check.
 */
function kycFolder(testInfo) {
  const root = testInfo.outputPath("KYC");
  mkdirSync(join(root, "Aadhaar"), { recursive: true });
  mkdirSync(join(root, "PAN"), { recursive: true });
  writeFileSync(join(root, "cover.txt"), "what is in this folder");
  writeFileSync(join(root, "Aadhaar", "noshad.txt"), "noshad aadhaar");
  writeFileSync(join(root, "PAN", "imran.txt"), "imran pan");
  return root;
}
