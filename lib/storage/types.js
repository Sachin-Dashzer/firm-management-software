// @ts-check

/**
 * What a stored file's bytes are allowed to be, and whether they agree with
 * what the file is called (spec section 6).
 *
 * The gateway reads the bytes with PHP's `finfo` and reports what it found;
 * the app records that answer rather than the type the browser guessed from
 * the extension. Both lists live here, in one file, so the ticket the
 * gateway enforces and the check the app makes afterwards cannot drift
 * apart.
 *
 * `ALLOWED_TYPES` travels in the upload ticket, and `upload.php` compares it
 * with `in_array($detected, $allowed, true)` — exact and case-sensitive. So
 * the spelling below is finfo's own, capital letters and all. Everything on
 * this side compares case-insensitively instead, so a host that answers
 * `application/cdfv2` is read the same way as one that answers
 * `application/CDFV2`.
 */

/**
 * The old binary Office formats. Shared hosting almost never names them:
 * a .xls workbook and a .doc document are both OLE compound files, and what
 * finfo usually reports is one of these three rather than
 * `application/vnd.ms-excel` or `application/msword`.
 *
 * CA clients send old .xls workbooks constantly, so all three are accepted —
 * and tied below to the .xls and .doc extensions only, which is what keeps
 * them from becoming a way to smuggle something in under another name.
 */
export const OLD_OFFICE_TYPES = [
  "application/CDFV2",
  "application/x-ole-storage",
  "application/vnd.ms-office",
];

/** A zip, by either of the two names it is reported under. */
const ZIP_TYPES = ["application/zip", "application/x-zip-compressed"];

/**
 * What the firm actually receives and produces. The gateway checks the
 * bytes, not the extension, so a renamed executable is refused.
 */
export const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "text/plain",
  ...ZIP_TYPES,
  ...OLD_OFFICE_TYPES,
];

/**
 * The types each extension's bytes may really be.
 *
 * An .xlsx and a .docx are zip archives, and many hosts report them as plain
 * zips rather than naming the format, so both answers are accepted. An
 * extension that is not listed here is one this check holds no opinion
 * about: the gateway has already refused anything outside `ALLOWED_TYPES`,
 * and refusing a name we simply do not recognise would turn a safe upload
 * into a support call.
 */
export const TYPES_BY_EXTENSION = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  heic: ["image/heic"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ...ZIP_TYPES,
  ],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ...ZIP_TYPES,
  ],
  xls: ["application/vnd.ms-excel", ...OLD_OFFICE_TYPES],
  doc: ["application/msword", ...OLD_OFFICE_TYPES],
  csv: ["text/csv", "text/plain"],
  txt: ["text/plain", "text/csv"],
  zip: ZIP_TYPES,
};

/** The extension of a filename, lower-cased and without the dot. */
function extensionOf(filename) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(String(filename ?? ""));
  return match ? match[1].toLowerCase() : "";
}

/** @param {string[]} list @param {string} mime */
function holds(list, mime) {
  return list.some((type) => type.toLowerCase() === mime);
}

/**
 * Does the type the gateway read out of the bytes agree with what the file
 * is called? Answers in a sentence the person who chose the file can act on.
 *
 * Called on the server after the bytes are already stored, which is the only
 * moment the real type is known — the browser only ever guesses from the
 * extension, so a text file renamed `bank.pdf` arrives claiming to be a PDF
 * and is caught here.
 *
 * @param {object} input
 * @param {string} [input.filename] what the file is called
 * @param {string} [input.detected] the type the gateway read from the bytes
 * @returns {string|null} why it is refused, or null if it is fine
 */
export function checkDetectedType({ filename, detected } = {}) {
  const mime = String(detected ?? "")
    .trim()
    .toLowerCase();

  if (!mime || !holds(ALLOWED_TYPES, mime)) {
    return `${detected || "That kind of file"} is not accepted.`;
  }

  const extension = extensionOf(filename);
  const expected = TYPES_BY_EXTENSION[extension];
  if (!expected || holds(expected, mime)) return null;

  return `This is not really a .${extension} file — its contents are ${detected}. Please upload the real file.`;
}
