import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
