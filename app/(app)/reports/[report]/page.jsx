import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Branch from "@/models/Branch";
import ServiceTemplate from "@/models/ServiceTemplate";
import User from "@/models/User";
import { REPORTS, runReport, describeFilters } from "@/lib/reports/standard";
import { displayRows, displayTotals } from "@/lib/reports/format";
import { STATUSES } from "@/lib/engagements/status";
import SavedViews from "@/components/reports/SavedViews";
import { listViews } from "../views";

export const dynamic = "force-dynamic";

/**
 * One report (spec section 10).
 *
 * The same filters on every report, because a partner should not have to
 * learn a new filter bar per screen, and a plain GET form rather than a
 * client component: the filters are then in the URL, which means they can
 * be bookmarked, shared, saved as a view and handed to the download
 * buttons without a line of JavaScript.
 */
export async function generateMetadata({ params }) {
  const { report } = await params;
  return { title: `${REPORTS[report] ? report : "Report"} · PHMG` };
}

export default async function ReportPage({ params, searchParams }) {
  const { report: key } = await params;
  const definition = REPORTS[key];
  if (!definition) notFound();

  const actor = await requireUser();
  if (!can(actor, "view", definition.area)) redirect("/issues");

  const params_ = (await searchParams) ?? {};

  await connectDB();
  const [report, branches, services, people, views] = await Promise.all([
    runReport(key, actor, params_),
    Branch.find({}).select("code name").sort({ code: 1 }).lean(),
    ServiceTemplate.find({ active: true })
      .select("name")
      .sort({ name: 1 })
      .lean(),
    User.find({ active: true }).select("name").sort({ name: 1 }).lean(),
    listViews(actor, key),
  ]);

  const rows = displayRows(report);
  const totals = displayTotals(report.totals);
  const search = new URLSearchParams(
    Object.entries(params_).filter(([, value]) => value),
  ).toString();

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-13 text-ink-muted">
            <Link href="/reports" className="underline underline-offset-4">
              Reports
            </Link>
          </p>
          <h1 className="font-display text-24 font-bold tracking-tight">
            {report.title}
          </h1>
          <p className="text-13 text-ink-muted">{report.what}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/reports/${key}/export${search ? `?${search}` : ""}`}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 leading-9 font-medium"
          >
            Excel
          </a>
          {definition.pdf && (
            <a
              href={`/reports/${key}/pdf${search ? `?${search}` : ""}`}
              className="rounded-control border-rule text-14 h-9 border px-3 leading-9 font-medium"
            >
              PDF
            </a>
          )}
        </div>
      </div>

      <form
        method="GET"
        className="rounded-ledger border-rule bg-surface flex flex-wrap items-end gap-3 border p-3"
      >
        <Field label="From">
          <input
            type="date"
            name="from"
            defaultValue={params_.from ?? ""}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            name="to"
            defaultValue={params_.to ?? ""}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </Field>

        <Field label="Branch">
          <Select name="branch" value={params_.branch} any="Every branch">
            {branches.map((branch) => (
              <option key={String(branch._id)} value={String(branch._id)}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>

        {key === "revenue" ? (
          <Field label="Grouped by">
            <Select name="by" value={params_.by} any={null}>
              {["client", "service", "branch", "month"].map((option) => (
                <option key={option} value={option}>
                  {option[0].toUpperCase() + option.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Service">
              <Select
                name="service"
                value={params_.service}
                any="Every service"
              >
                {services.map((service) => (
                  <option key={String(service._id)} value={String(service._id)}>
                    {service.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned to">
              <Select name="assignee" value={params_.assignee} any="Anyone">
                {people.map((person) => (
                  <option key={String(person._id)} value={String(person._id)}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        {key === "status" && (
          <Field label="Status">
            <Select name="status" value={params_.status} any="Any status">
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <button
          type="submit"
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium"
        >
          Apply
        </button>
        {search && (
          <Link
            href={`/reports/${key}`}
            className="text-13 underline underline-offset-4"
          >
            Clear
          </Link>
        )}
      </form>

      <SavedViews
        reportKey={key}
        views={views}
        search={search}
        canShare={actor.role === "partner"}
      />

      <p className="text-12 text-ink-muted">{describeFilters(params_)}</p>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule bg-sunk text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              {report.columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-3 py-2 font-medium ${numeric(column) ? "text-right" : ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-rule border-b last:border-0">
                {report.columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-2 ${numeric(column) ? "num text-right" : ""}`}
                  >
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={report.columns.length}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  Nothing matched these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totals.length > 0 && (
        <div className="flex flex-wrap gap-6">
          {totals.map((total) => (
            <p key={total.label} className="text-14">
              <span className="text-ink-muted">{total.label}: </span>
              <strong className="num">{total.value}</strong>
            </p>
          ))}
        </div>
      )}

      <p className="text-12 text-ink-muted">
        {rows.length === 5000
          ? "Showing the first 5,000 rows — narrow the filters to see the rest."
          : `${rows.length} ${rows.length === 1 ? "row" : "rows"}.`}
      </p>
    </div>
  );
}

const numeric = (column) =>
  ["money", "int", "number"].includes(column.kind ?? "");

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-12 text-ink-muted font-medium">{label}</span>
      {children}
    </label>
  );
}

function Select({ name, value, any, children }) {
  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      className="rounded-control border-rule bg-paper text-14 h-9 max-w-52 border px-2"
    >
      {any !== null && <option value="">{any}</option>}
      {children}
    </select>
  );
}
