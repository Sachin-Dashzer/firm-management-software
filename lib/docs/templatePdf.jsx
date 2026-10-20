import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * A document generated from a template, on the firm's letterhead (P2-8b).
 *
 * The same React-PDF route as the invoice and the reports (owner decision
 * D9), so there is one PDF toolchain in the app and a generated letter can
 * be attached to an email the day the mailer is asked to.
 *
 * The body arrives already resolved — this file never reads a client record
 * or fills a placeholder. It lays out text, and nothing it does can change
 * what the letter says.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 60,
    paddingHorizontal: 54,
    fontSize: 10.5,
    lineHeight: 1.5,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#8a6a2f",
    paddingBottom: 10,
    marginBottom: 20,
  },
  firm: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b6b6b", fontSize: 8.5 },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 14,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  paragraph: { marginBottom: 9 },
  draft: {
    position: "absolute",
    top: 320,
    left: 120,
    fontSize: 78,
    color: "#e3dfd6",
    transform: "rotate(-24deg)",
  },
  gapNote: {
    marginTop: 18,
    padding: 8,
    borderWidth: 0.5,
    borderColor: "#b4442f",
    color: "#b4442f",
    fontSize: 8.5,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 54,
    right: 54,
    fontSize: 7,
    color: "#6b6b6b",
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#d8d4cc",
    paddingTop: 6,
  },
});

/**
 * @param {{doc: {title?: string, body: string, state: string, firm?: object,
 *   gaps?: Array<{label: string}>, reference?: string}}} props
 */
export function TemplatePdf({ doc }) {
  const firm = doc.firm ?? {};
  const firmName = firm.name || "PHMG & Associates";
  const draft = doc.state !== "final";

  // the resolved text is a document, not markup: blank lines separate
  // paragraphs and nothing else is interpreted
  const paragraphs = String(doc.body ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <Document title={doc.title || "Document"} author={firmName}>
      <Page size="A4" style={styles.page}>
        {draft && <Text style={styles.draft}>DRAFT</Text>}

        <View style={styles.header}>
          <Text style={styles.firm}>{firmName}</Text>
          {firm.tagline === "" ? null : (
            <Text style={styles.muted}>
              {firm.tagline || "Chartered Accountants"}
            </Text>
          )}
          {firm.headOffice ? (
            <Text style={styles.muted}>{firm.headOffice}</Text>
          ) : null}
          <Text style={styles.muted}>
            {[
              firm.frn ? `FRN ${firm.frn}` : "",
              firm.email || "",
              firm.phone || "",
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
        </View>

        {doc.title ? <Text style={styles.title}>{doc.title}</Text> : null}

        {paragraphs.map((block, index) => (
          <Text key={index} style={styles.paragraph}>
            {block}
          </Text>
        ))}

        {draft && doc.gaps?.length ? (
          <View style={styles.gapNote}>
            <Text>
              This draft has {doc.gaps.length}{" "}
              {doc.gaps.length === 1 ? "blank" : "blanks"}:{" "}
              {doc.gaps.map((gap) => gap.label).join(", ")}. It cannot be
              issued until they are filled in on the record.
            </Text>
          </View>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${draft ? "DRAFT — not issued  ·  " : ""}${
              doc.reference ?? ""
            }  ·  Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
