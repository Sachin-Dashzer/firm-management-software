import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { checkEnv } from "../scripts/doctor.js";

const key = () => randomBytes(32).toString("base64");

/** A filled-in environment, the way .env.local looks when it is right. */
function good(overrides = {}) {
  return {
    MONGODB_URI:
      "mongodb+srv://phmg-app:s3cret@phmg-crm.ab12c.mongodb.net/phmg?retryWrites=true&w=majority",
    AUTH_SECRET: key(),
    FIELD_ENCRYPTION_KEY: key(),
    STORAGE_ENCRYPTION_KEY: key(),
    STORAGE_DRIVER: "local",
    EMAIL_TRANSPORT: "log",
    JOBS_SECRET: key(),
    NEXT_PUBLIC_APP_URL: "https://crm.phmgindia.com",
    NEXTAUTH_URL: "https://crm.phmgindia.com",
    ...overrides,
  };
}

/** The same, as it would look on the real deployment. */
function live(overrides = {}) {
  return good({ VERCEL_ENV: "production", ...overrides });
}

describe("the pre-flight environment check", () => {
  it("passes a filled-in environment", () => {
    expect(checkEnv(good())).toEqual({ problems: [], warnings: [] });
  });

  it("refuses to pass go-live while 2FA is switched off", () => {
    const { problems } = checkEnv(good({ AUTH_SKIP_2FA: "true" }));
    expect(problems.join(" ")).toMatch(/AUTH_SKIP_2FA/);
  });

  it("catches the connection string mistakes people actually make", () => {
    const missingDb = good({
      MONGODB_URI: "mongodb+srv://phmg-app:s3cret@phmg-crm.ab12c.mongodb.net",
    });
    expect(checkEnv(missingDb).problems.join(" ")).toMatch(/no database name/);

    const placeholder = good({
      MONGODB_URI:
        "mongodb+srv://phmg-app:<db_password>@phmg-crm.ab12c.mongodb.net/phmg",
    });
    expect(checkEnv(placeholder).problems.join(" ")).toMatch(/placeholder/);
  });

  it("insists the two irreplaceable keys are 32 bytes of base64", () => {
    const short = checkEnv(good({ FIELD_ENCRYPTION_KEY: "tooshort" }));
    expect(short.problems.join(" ")).toMatch(/32 bytes/);

    const notBase64 = checkEnv(good({ STORAGE_ENCRYPTION_KEY: "not a key!!" }));
    expect(notBase64.problems.join(" ")).toMatch(/not base64/);
  });

  it("asks for the gateway's address and secret only when it is in use", () => {
    expect(checkEnv(good({ STORAGE_DRIVER: "bigrock" })).problems).toHaveLength(
      2,
    );
    expect(
      checkEnv(
        good({
          STORAGE_DRIVER: "bigrock",
          STORAGE_GATEWAY_URL: "https://files.phmgindia.com",
          STORAGE_SHARED_SECRET: key(),
        }),
      ).problems,
    ).toEqual([]);
  });

  it("refuses an http gateway", () => {
    const problems = checkEnv(
      good({
        STORAGE_DRIVER: "bigrock",
        STORAGE_GATEWAY_URL: "http://files.phmgindia.com",
        STORAGE_SHARED_SECRET: key(),
      }),
    ).problems;
    expect(problems.join(" ")).toMatch(/must be https/);
  });

  it("warns, rather than fails, when client email is live", () => {
    const { problems, warnings } = checkEnv(
      good({ EMAIL_CLIENTS_ENABLED: "true" }),
    );
    expect(problems).toEqual([]);
    expect(warnings.join(" ")).toMatch(/reach real clients/);
  });

  it("wants the SMTP details once the transport is smtp", () => {
    const problems = checkEnv(good({ EMAIL_TRANSPORT: "smtp" })).problems;
    expect(problems).toHaveLength(4);
    expect(problems.join(" ")).toMatch(/SMTP_PASSWORD/);
  });
});

/**
 * The go-live checks added after the readiness audit. Each one is here
 * because its absence let something real through: a runner nothing could
 * start, a file driver that discards documents, a callback URL pointing at
 * the user's own laptop.
 */
describe("what the go-live audit added", () => {
  it("fails a missing JOBS_SECRET rather than warning about it", () => {
    const { problems } = checkEnv(good({ JOBS_SECRET: undefined }));
    expect(problems.join(" ")).toMatch(/nothing scheduled runs/);
  });

  it("fails a JOBS_SECRET too short to be worth having", () => {
    const { problems } = checkEnv(good({ JOBS_SECRET: "short-one" }));
    expect(problems.join(" ")).toMatch(/at least 32/);
  });

  it("fails the local file driver on the real deployment", () => {
    const { problems } = checkEnv(live({ STORAGE_DRIVER: "local" }));
    expect(problems.join(" ")).toMatch(/discards on every deploy/);
  });

  it("leaves the local file driver alone on a laptop", () => {
    expect(checkEnv(good({ STORAGE_DRIVER: "local" })).problems).toEqual([]);
  });

  it("fails a localhost callback URL in production, warns on a laptop", () => {
    expect(
      checkEnv(live({ NEXTAUTH_URL: "http://localhost:3000" })).problems.join(" "),
    ).toMatch(/redirect to the user's own machine/);

    const laptop = checkEnv(good({ NEXTAUTH_URL: "http://localhost:3000" }));
    expect(laptop.problems).toEqual([]);
  });

  it("insists the callback URL is https in production", () => {
    const { problems } = checkEnv(
      live({ NEXTAUTH_URL: "http://crm.phmgindia.com" }),
    );
    expect(problems.join(" ")).toMatch(/must be https/);
  });

  it("fails a localhost app URL in production, warns on a laptop", () => {
    expect(
      checkEnv(live({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).problems
        .join(" "),
    ).toMatch(/upload links/);
    expect(
      checkEnv(good({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).warnings
        .join(" "),
    ).toMatch(/upload links/);
  });

  it("warns when Sentry has a DSN but no environment to file errors under", () => {
    const { problems, warnings } = checkEnv(good({ SENTRY_DSN: "https://x@y/1" }));
    expect(problems).toEqual([]);
    expect(warnings.join(" ")).toMatch(/same bucket/);
  });

  it("says nothing about Sentry when it is not in use", () => {
    expect(checkEnv(good()).warnings).toEqual([]);
  });

  it("still fails AUTH_SKIP_2FA in production, where it is ignored anyway", () => {
    const { problems } = checkEnv(live({ AUTH_SKIP_2FA: "true" }));
    expect(problems.join(" ")).toMatch(/ignored/);
  });

  it("passes a properly configured production deployment", () => {
    const { problems, warnings } = checkEnv(
      live({
        STORAGE_DRIVER: "bigrock",
        STORAGE_GATEWAY_URL: "https://files.phmgindia.com",
        STORAGE_SHARED_SECRET: key(),
      }),
    );
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe("the test escape hatch cannot hide in production", () => {
  it("fails PHMG_ENV=test on a real Vercel deployment", () => {
    const { problems } = checkEnv(live({ PHMG_ENV: "test" }));
    expect(problems.join(" ")).toMatch(/disables the production guards/);
  });

  it("says nothing about it on a laptop or in CI", () => {
    expect(checkEnv(good({ PHMG_ENV: "test" })).problems).toEqual([]);
  });
});
