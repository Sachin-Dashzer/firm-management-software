import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * The end-to-end suite builds and starts its own server while a `next dev`
   * is usually still running. Sharing `.next` meant `next build` deleting
   * files out from under dev's compiler, which surfaced as ENOENT on
   * `.next/static/development/_buildManifest.js.tmp.*`. The suite sets this
   * so the two never touch the same directory, the same way it already has a
   * port of its own (`playwright.config.mjs`).
   */
  distDir: process.env.PHMG_DIST_DIR ?? ".next",
  /**
   * The invoice PDF embeds IBM Plex Sans, because the fonts a PDF reader is
   * guaranteed to have are Latin-1 and have no ₹ (QA 09-11-2026, #13).
   * React-PDF reads the files at render time, which Next's tracing cannot
   * see, so they are listed here or every invoice on Vercel would silently
   * fall back to Helvetica and print the wrong glyph again.
   */
  outputFileTracingIncludes: {
    /*
     * pdfkit (under React-PDF) loads its built-in fonts through the subpath
     * import `#standard-fonts/Helvetica`, which Next's tracer does not
     * follow either — so on Vercel the first PDF died with "Cannot find
     * module '/var/task/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs'"
     * (client onboarding letters, 14-11-2026). pdfkit sets Helvetica as the
     * document's font before any `Font.register` of ours takes effect, so
     * these ship whether the PDF uses them or not.
     */
    "**/*": [
      "./lib/billing/fonts/*.ttf",
      "./node_modules/pdfkit/js/standard-fonts/*",
      "./node_modules/pdfkit/js/data/*",
    ],
  },
  experimental: {
    /**
     * `import { Bell } from "@phosphor-icons/react"` pulls the whole barrel —
     * 3,000 icon modules — into every file that touches it. Next is told to
     * rewrite those to one deep import each; the list it does this for by
     * default does not include Phosphor.
     */
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

/**
 * Sentry's build plugin exists to upload source maps, so that a stack trace
 * names real lines instead of minified ones. It roughly doubles the build,
 * and it has nothing to do while there is no token to upload with — so it is
 * applied only when there is one. Everything else about error tracking is
 * runtime (`instrumentation.js`) and does not need it.
 */
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      disableLogger: true,
      widenClientFileUpload: false,
      telemetry: false,
    })
  : nextConfig;
