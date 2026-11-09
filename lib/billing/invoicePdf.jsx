import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

/**
 * The font the figures are set in (QA 09-11-2026, #13).
 *
 * The fourteen fonts a PDF reader is guaranteed to have — Helvetica among
 * them — are Latin-1 only. They have no ₹ (U+20B9), so every amount on
 * every invoice printed as a tick-like glyph where the rupee sign belongs.
 * There is no way round that but to embed a font that has the character.
 *
 * IBM Plex Sans, because it is already the app's own typeface, it is under
 * the SIL Open Font License, and the files are committed rather than
 * fetched: an invoice must print on a machine with no network, and a font
 * downloaded at render time is a tax invoice that depends on a CDN.
 *
 * `outputFileTracingIncludes` in `next.config.mjs` is what puts these files
 * in the deployed bundle. If they are ever missing the document still
 * prints, in Helvetica — an invoice with a wrong-looking rupee sign is bad,
 * an invoice that does not print at all is worse.
 */
const FONT_DIR = join(process.cwd(), "lib", "billing", "fonts");

const FACES = [
  { file: "IBMPlexSans-Regular.ttf", fontWeight: 400 },
  { file: "IBMPlexSans-SemiBold.ttf", fontWeight: 700 },
  // the total in words is set in italics, and react-pdf throws rather than
  // falling back when a style it is asked for is not registered
  { file: "IBMPlexSans-Italic.ttf", fontWeight: 400, fontStyle: "italic" },
];

export const BODY_FONT = registerBodyFont();

function registerBodyFont() {
  try {
    const fonts = FACES.map(({ file, ...face }) => ({
      ...face,
      src: join(FONT_DIR, file),
    }));
    if (!fonts.every((font) => existsSync(font.src))) return "Helvetica";

    Font.register({ family: "Plex Sans", fonts });
    return "Plex Sans";
  } catch {
    return "Helvetica";
  }
}

/** Helvetica has a separate bold face; an embedded family has a weight. */
const BOLD =
  BODY_FONT === "Helvetica"
    ? { fontFamily: "Helvetica-Bold" }
    : { fontFamily: BODY_FONT, fontWeight: 700 };

/**
 * The invoice as the client receives it (spec section 7).
 *
 * This is a legal document before it is a design: a tax invoice has to
 * carry both GSTINs, the place of supply, the SAC against each line, the
 * tax split out by head, and the total in words. The layout follows the
 * firm's ledger look from spec section 15 — rules rather than boxes, the
 * figures in a monospaced column — but nothing decorative is allowed to
 * push a required field off the page.
 *
 * Built with React-PDF so the same file can be downloaded here and
 * attached to an email by the mailer in Step 9. A browser print would not
 * have served the second use.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 9,
    fontFamily: BODY_FONT,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1.5,
    borderBottomColor: "#8a6a2f",
    paddingBottom: 10,
    marginBottom: 14,
  },
  firm: { fontSize: 15, ...BOLD },
  muted: { color: "#6b6b6b" },
  title: { fontSize: 13, ...BOLD, textAlign: "right" },
  parties: { flexDirection: "row", gap: 24, marginBottom: 14 },
  party: { flex: 1 },
  label: {
    fontSize: 7,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#6b6b6b",
    marginBottom: 2,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    paddingBottom: 4,
    marginTop: 6,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#d8d4cc",
    paddingVertical: 5,
  },
  cDesc: { flex: 5 },
  cSac: { flex: 1.3 },
  cRate: { flex: 1, textAlign: "right" },
  cAmount: { flex: 1.8, textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 240 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    marginTop: 4,
    paddingTop: 4,
    ...BOLD,
    fontSize: 11,
  },
  words: { marginTop: 8, fontSize: 8, fontStyle: "italic" },
  note: {
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#d8d4cc",
    fontSize: 8,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 44,
    right: 44,
    fontSize: 7,
    color: "#6b6b6b",
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#d8d4cc",
    paddingTop: 6,
  },
  draft: {
    position: "absolute",
    top: 300,
    left: 110,
    fontSize: 72,
    color: "#d8d4cc",
    transform: "rotate(-24deg)",
  },
});

/** @param {{invoice: object}} props */
export function InvoicePdf({ invoice }) {
  const isCreditNote = invoice.type === "Credit note";
  /**
   * The firm's own record (P2-6). The fallback is what this file said before
   * there was a settings screen, so an invoice still prints if the firm
   * document is missing: a blank letterhead on a tax invoice is not an
   * option.
   */
  const firm = invoice.firm ?? {};
  const firmName = firm.name || "PHMG & Associates";

  return (
    <Document title={invoice.number ?? "Draft invoice"} author={firmName}>
      <Page size="A4" style={styles.page}>
        {!invoice.number && <Text style={styles.draft}>DRAFT</Text>}

        <View style={styles.header}>
          <View>
            <Text style={styles.firm}>{firmName}</Text>
            {firm.tagline === "" ? null : (
              <Text style={styles.muted}>
                {firm.tagline || "Chartered Accountants"}
              </Text>
            )}
            {invoice.branchAddress ? (
              <Text style={styles.muted}>{invoice.branchAddress}</Text>
            ) : null}
            {/* the label without a number read as a missing field on a legal
                document; a branch with no GSTIN simply has none (#13) */}
            {invoice.supplierGstin ? (
              <Text style={styles.muted}>GSTIN {invoice.supplierGstin}</Text>
            ) : null}
            {/* the FRN belongs on a CA firm's invoice when the firm has one */}
            {firm.frn ? <Text style={styles.muted}>FRN {firm.frn}</Text> : null}
          </View>
          <View>
            <Text style={styles.title}>
              {isCreditNote ? "CREDIT NOTE" : "TAX INVOICE"}
            </Text>
            <Text style={{ textAlign: "right" }}>
              {invoice.number ?? "not yet issued"}
            </Text>
            <Text style={{ textAlign: "right", ...styles.muted }}>
              {invoice.date}
            </Text>
            {invoice.dueDate ? (
              <Text style={{ textAlign: "right", ...styles.muted }}>
                Due {invoice.dueDate}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.label}>Billed to</Text>
            <Text style={BOLD}>{invoice.billingName}</Text>
            {invoice.billingAddress ? (
              <Text>{invoice.billingAddress}</Text>
            ) : null}
            <Text style={styles.muted}>
              GSTIN {invoice.billingGstin || "unregistered"}
            </Text>
          </View>
          <View style={styles.party}>
            <Text style={styles.label}>Place of supply</Text>
            <Text>
              {invoice.placeOfSupply} · {invoice.placeOfSupplyName}
            </Text>
            {/* #3: a draft with no tax on it said "18%" and "CGST and SGST"
                anyway, which reads as an arithmetic mistake. When tax
                cannot apply, the document says so instead. */}
            <Text style={styles.muted}>
              {!invoice.taxable
                ? "Tax not charged"
                : invoice.interState
                  ? "Inter-state supply — IGST"
                  : "Intra-state supply — CGST and SGST"}
            </Text>
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.cDesc, styles.label]}>Description</Text>
          <Text style={[styles.cSac, styles.label]}>SAC</Text>
          <Text style={[styles.cRate, styles.label]}>GST</Text>
          <Text style={[styles.cAmount, styles.label]}>Amount</Text>
        </View>

        {invoice.lines.map((line, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.cDesc}>{line.description}</Text>
            <Text style={styles.cSac}>{line.sac}</Text>
            <Text style={styles.cRate}>
              {invoice.taxable ? `${line.gstRate}%` : "—"}
            </Text>
            <Text style={styles.cAmount}>{line.amount}</Text>
          </View>
        ))}

        {invoice.reimbursements.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 10 }]}>
              Out-of-pocket costs recovered at cost — no GST
            </Text>
            {invoice.reimbursements.map((item, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.cDesc}>{item.description}</Text>
                <Text style={styles.cSac} />
                <Text style={styles.cRate} />
                <Text style={styles.cAmount}>{item.amount}</Text>
              </View>
            ))}
          </>
        )}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Taxable value</Text>
            <Text>{invoice.subtotal}</Text>
          </View>
          {!invoice.taxable ? null : invoice.interState ? (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>IGST</Text>
              <Text>{invoice.igst}</Text>
            </View>
          ) : (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>CGST</Text>
                <Text>{invoice.cgst}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>SGST</Text>
                <Text>{invoice.sgst}</Text>
              </View>
            </>
          )}
          {invoice.reimbursements.length > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Out-of-pocket costs</Text>
              <Text>{invoice.reimbursementTotal}</Text>
            </View>
          )}
          <View style={styles.grand}>
            <Text>Total</Text>
            <Text>{invoice.total}</Text>
          </View>
          {invoice.tdsExpected !== invoice.zero && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>Less TDS u/s 194J, if deducted</Text>
                <Text>{invoice.tdsExpected}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>Payable</Text>
                <Text>{invoice.expectedReceipt}</Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.words}>{invoice.totalInWords}</Text>

        {/* why there is no tax on a document headed TAX INVOICE (#3) */}
        {invoice.taxNotice ? (
          <View style={styles.note}>
            <Text style={styles.label}>Tax</Text>
            <Text>{invoice.taxNotice}</Text>
          </View>
        ) : null}

        {invoice.notes ? (
          <View style={styles.note}>
            <Text style={styles.label}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        {invoice.bankDetails ? (
          <View style={styles.note}>
            <Text style={styles.label}>Payment</Text>
            <Text>{invoice.bankDetails}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          PHMG &amp; Associates · Chartered Accountants ·{" "}
          {invoice.number
            ? `Invoice ${invoice.number}`
            : "Draft — not a valid tax invoice"}{" "}
          · This is a computer-generated document.
        </Text>
      </Page>
    </Document>
  );
}
