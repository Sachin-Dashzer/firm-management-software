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
    ...overrides,
  };
}

describe("the pre-flight environment check", () => {
  it("passes a filled-in environment", () => {
    expect(checkEnv(good())).toEqual({ problems: [], warnings: [] });
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
