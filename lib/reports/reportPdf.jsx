import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * A report as a printable page (spec section 10: every report exports to
 * Excel and PDF).
 *
 * One component for every report, driven by the same columns and rows the
 * screen renders, so a printed report cannot say something different from
 * the screen it was printed from. The only decisions here are typographic:
 * landscape, because these are wide tables; a repeating header row; and
 * who ran it and when in the footer, because a report that gets printed
 * gets passed around and will be read a fortnight later.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 46,
    paddingHorizontal: 32,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1.5,
    borderBottomColor: "#8a6a2f",
    paddingBottom: 8,
    marginBottom: 10,
  },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  firm: { fontSize: 9, textAlign: "right" },
  muted: { color: "#6b6b6b" },
  note: { marginBottom: 8, color: "#6b6b6b" },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    paddingBottom: 3,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#d8d4cc",
    paddingVertical: 3,
  },
  headCell: { fontFamily: "Helvetica-Bold", fontSize: 7, paddingRight: 6 },
  cell: { paddingRight: 6 },
  totals: {
    flexDirection: "row",
    gap: 24,
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#6b6b6b",
  },
});

/** Numbers right-aligned, words left: a column of figures has to line up. */
const alignOf = (kind) =>
  kind === "money" || kind === "int" || kind === "number" ? "right" : "left";

/** Wider for the columns that hold sentences. */
const flexOf = (column) =>
  column.width && column.width > 30
    ? 3.4
    : column.kind === "money"
      ? 1.5
      : column.kind === "date"
        ? 1.1
        : column.kind === "int" || column.kind === "number"
          ? 0.9
          : 1.6;

/**
 * @param {object} props
 * @param {string} props.title
 * @param {Array<{header: string, key: string, kind?: string, width?: number}>} props.columns
 * @param {Array<Record<string, any>>} props.rows   already formatted for display
 * @param {string} [props.note]
 * @param {Array<{label: string, value: string}>} [props.totals]
 * @param {string} props.by      who ran it
 * @param {string} props.at
 */
export function ReportPdf({ title, columns, rows, note, totals, by, at }) {
  return (
    <Document title={`PHMG — ${title}`} author="PHMG & Associates">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.muted}>
              {rows.length} {rows.length === 1 ? "row" : "rows"}
            </Text>
          </View>
          <View>
            <Text style={styles.firm}>PHMG &amp; Associates</Text>
            <Text style={[styles.firm, styles.muted]}>
              Chartered Accountants
            </Text>
          </View>
        </View>

        {note && <Text style={styles.note}>{note}</Text>}

        <View style={styles.tableHead} fixed>
          {columns.map((column) => (
            <Text
              key={column.key}
              style={[
                styles.headCell,
                { flex: flexOf(column), textAlign: alignOf(column.kind) },
              ]}
            >
              {column.header}
            </Text>
          ))}
        </View>

        {rows.map((row, index) => (
          <View key={index} style={styles.row} wrap={false}>
            {columns.map((column) => (
              <Text
                key={column.key}
                style={[
                  styles.cell,
                  { flex: flexOf(column), textAlign: alignOf(column.kind) },
                ]}
              >
                {row[column.key] ?? ""}
              </Text>
            ))}
          </View>
        ))}

        {rows.length === 0 && (
          <Text style={[styles.note, { marginTop: 10 }]}>
            Nothing matched these filters.
          </Text>
        )}

        {totals && totals.length > 0 && (
          <View style={styles.totals}>
            {totals.map((total) => (
              <Text key={total.label}>
                <Text style={styles.muted}>{total.label}: </Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  {total.value}
                </Text>
              </Text>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>
            Run by {by} on {at}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
