// @ts-check

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

/**
 * The same document as a Word file (P2-8c).
 *
 * Why Word as well as PDF: a letter is often edited before it is sent — a
 * paragraph added for this client, a figure typed into a certificate's
 * blank. A PDF cannot be, so the firm would retype the whole thing.
 *
 * This renders the **already resolved** text, exactly like `templatePdf.jsx`
 * — it never reads a client record and never fills a placeholder, so the
 * Word file and the PDF cannot say different things.
 *
 * `docx` was approved as a dependency on 20-10-2026 for this one job: the
 * alternative was hand-building the zip, and a file Word refuses to open is
 * not something anybody here can debug.
 */

const INK = "1A1A1A";
const MUTED = "6B6B6B";
const RULE = "8A6A2F";

/**
 * @param {{title?: string, body: string, state: string, firm?: any,
 *   gaps?: Array<{label: string}>, reference?: string}} doc
 * @returns {Promise<Buffer>}
 */
export async function renderDocx(doc) {
  const firm = doc.firm ?? {};
  const firmName = firm.name || "PHMG & Associates";
  const draft = doc.state !== "final";

  const letterhead = [
    new Paragraph({
      children: [
        new TextRun({ text: firmName, bold: true, size: 30, color: INK }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: firm.tagline || "Chartered Accountants",
          size: 17,
          color: MUTED,
        }),
      ],
    }),
  ];

  if (firm.headOffice) {
    letterhead.push(
      new Paragraph({
        children: [
          new TextRun({ text: firm.headOffice, size: 17, color: MUTED }),
        ],
      }),
    );
  }

  const strip = [
    firm.frn ? `FRN ${firm.frn}` : "",
    firm.email || "",
    firm.phone || "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  letterhead.push(
    new Paragraph({
      children: [new TextRun({ text: strip, size: 17, color: MUTED })],
      // the firm's rule under the letterhead, as on the PDF
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: RULE, space: 6 },
      },
      spacing: { after: 360 },
    }),
  );

  /** A draft says so on the page itself, not only in the file name. */
  const watermark = draft
    ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [
            new TextRun({
              text: "DRAFT — NOT ISSUED",
              bold: true,
              size: 28,
              color: MUTED,
            }),
          ],
        }),
      ]
    : [];

  const heading = doc.title
    ? [
        new Paragraph({
          text: doc.title.toUpperCase(),
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 280 },
        }),
      ]
    : [];

  // blank lines separate paragraphs; a single newline is a line break, which
  // is what an address block in a letter is
  const body = String(doc.body ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        new Paragraph({
          spacing: { after: 180, line: 300 },
          children: block.split("\n").flatMap((line, index) => [
            ...(index ? [new TextRun({ break: 1 })] : []),
            new TextRun({ text: line, size: 21, color: INK }),
          ]),
        }),
    );

  const gapNote =
    draft && doc.gaps?.length
      ? [
          new Paragraph({
            spacing: { before: 360 },
            border: {
              top: { style: BorderStyle.SINGLE, size: 6, color: "B4442F", space: 6 },
            },
            children: [
              new TextRun({
                text: `This draft has ${doc.gaps.length} ${
                  doc.gaps.length === 1 ? "blank" : "blanks"
                }: ${doc.gaps.map((gap) => gap.label).join(", ")}. It cannot be issued until they are filled in on the record.`,
                size: 17,
                color: "B4442F",
              }),
            ],
          }),
        ]
      : [];

  const document = new Document({
    title: doc.title || "Document",
    creator: firmName,
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${draft ? "DRAFT — not issued  ·  " : ""}${doc.reference ?? ""}`,
                    size: 14,
                    color: MUTED,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...letterhead,
          ...watermark,
          ...heading,
          ...body,
          ...gapNote,
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}

export const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
