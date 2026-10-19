import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

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
    fontFamily: "Helvetica",
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
  firm: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b6b6b" },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
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
    fontFamily: "Helvetica-Bold",
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

  return (
    <Document
      title={invoice.number ?? "Draft invoice"}
      author="PHMG & Associates"
    >
      <Page size="A4" style={styles.page}>
        {!invoice.number && <Text style={styles.draft}>DRAFT</Text>}

        <View style={styles.header}>
          <View>
            <Text style={styles.firm}>PHMG &amp; Associates</Text>
            <Text style={styles.muted}>Chartered Accountants</Text>
            {invoice.branchAddress ? (
              <Text style={styles.muted}>{invoice.branchAddress}</Text>
            ) : null}
            <Text style={styles.muted}>GSTIN {invoice.supplierGstin}</Text>
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
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {invoice.billingName}
            </Text>
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
            <Text style={styles.muted}>
              {invoice.interState
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
            <Text style={styles.cRate}>{line.gstRate}%</Text>
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
          {invoice.interState ? (
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
