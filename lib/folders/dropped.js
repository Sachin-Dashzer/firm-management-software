// @ts-check

/**
 * Reading the shape of a folder a person dropped on the drive (P3-48d).
 *
 * A browser never sends the folders. `webkitdirectory` hands over a flat
 * list of files, each carrying the path it had on the computer in
 * `webkitRelativePath` — "KYC/Aadhaar/noshad.pdf". The tree has to be read
 * back out of those strings before anything can be rebuilt from it.
 *
 * It lives here, away from the picker, because it is the part that is
 * worth being sure about: one wrong `slice` and every file lands in one
 * heap, which is exactly what this fixed.
 */

/**
 * The folders above a dropped file, outermost first.
 *
 * Empty for a file picked on its own, and empty for the files sitting
 * directly in the folder that was chosen — those belong in the folder
 * itself, not under a level of nothing.
 *
 * @param {{ webkitRelativePath?: string, name?: string }} file
 * @returns {string[]}
 */
export function chainFor(file) {
  return String(file?.webkitRelativePath ?? "")
    .split("/")
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Each dropped file against the folder it belongs in, as one "a/b" key.
 *
 * A Map keyed by the `File` itself rather than by name: two files called
 * `PAN.pdf` in two different folders are two different files, and keying
 * by name would put the second one wherever the first one went.
 *
 * @param {ArrayLike<any>} files
 * @returns {Map<any, string>}
 */
export function droppedPaths(files) {
  return new Map([...files].map((file) => [file, chainFor(file).join("/")]));
}
