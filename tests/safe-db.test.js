import { describe, it, expect, afterEach } from "vitest";
import {
  assertSafeDb,
  describeDbSafety,
  hostsOf,
  REMOTE_ESCAPE_HATCH,
} from "../tests/e2e/assert-safe-db.mjs";

/**
 * The guard that keeps the browser suite off the firm's cluster
 * (`tests/e2e/assert-safe-db.mjs`).
 *
 * Worth testing properly rather than trusting by eye: it is the only thing
 * standing between `npm run test:e2e` and a `Client.deleteMany` against
 * Atlas, and the failure mode is silent until the data is gone.
 */

const ATLAS = "mongodb+srv://user:pw@phmg.di9jx0s.mongodb.net/phmg?retryWrites=true";
const MEMORY = "mongodb://127.0.0.1:41923/phmg?directConnection=true";
const LOCALHOST = "mongodb://localhost:27017/phmg";

describe("hostsOf", () => {
  it("reads a plain host", () => {
    expect(hostsOf(LOCALHOST)).toEqual(["localhost"]);
  });

  it("drops the port", () => {
    expect(hostsOf(MEMORY)).toEqual(["127.0.0.1"]);
  });

  it("ignores credentials that contain an @", () => {
    expect(hostsOf("mongodb://user:p@ss@127.0.0.1:27017/phmg")).toEqual([
      "127.0.0.1",
    ]);
  });

  it("reads every host of a replica-set URI", () => {
    expect(hostsOf("mongodb://a.example.com:27017,b.example.com:27018/phmg")).toEqual(
      ["a.example.com", "b.example.com"],
    );
  });

  it("unwraps a bracketed IPv6 host", () => {
    expect(hostsOf("mongodb://[::1]:27017/phmg")).toEqual(["::1"]);
  });
});

describe("describeDbSafety", () => {
  it("refuses an Atlas SRV URI", () => {
    const verdict = describeDbSafety(ATLAS);
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/srv/i);
  });

  it("refuses a remote host even without srv", () => {
    const verdict = describeDbSafety("mongodb://phmg.di9jx0s.mongodb.net:27017/phmg");
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/not a local database/);
  });

  it("refuses a replica-set URI where only one member is local", () => {
    const verdict = describeDbSafety("mongodb://127.0.0.1:27017,remote.example.com:27017/phmg");
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/remote\.example\.com/);
  });

  it("passes the memory server", () => {
    expect(describeDbSafety(MEMORY)).toMatchObject({ safe: true });
  });

  it("passes localhost", () => {
    expect(describeDbSafety(LOCALHOST)).toMatchObject({ safe: true });
  });

  it("passes a hand-run local replica set", () => {
    expect(
      describeDbSafety("mongodb://127.0.0.1:27017,127.0.0.1:27018/phmg?replicaSet=rs0"),
    ).toMatchObject({ safe: true });
  });

  // fails closed: "I cannot tell" is not "it is safe"
  it("refuses an empty or missing URI", () => {
    expect(describeDbSafety("").safe).toBe(false);
    expect(describeDbSafety(undefined).safe).toBe(false);
    expect(describeDbSafety(null).safe).toBe(false);
  });

  it("refuses something that is not a connection string", () => {
    expect(describeDbSafety("phmg.di9jx0s.mongodb.net").safe).toBe(false);
  });
});

describe("assertSafeDb", () => {
  const original = {
    uri: process.env.MONGODB_URI,
    hatch: process.env.E2E_ALLOW_REMOTE_DB,
  };

  afterEach(() => {
    process.env.MONGODB_URI = original.uri;
    if (original.hatch === undefined) delete process.env.E2E_ALLOW_REMOTE_DB;
    else process.env.E2E_ALLOW_REMOTE_DB = original.hatch;
  });

  it("throws on Atlas, naming the safe way to run", () => {
    process.env.MONGODB_URI = ATLAS;
    delete process.env.E2E_ALLOW_REMOTE_DB;
    expect(() => assertSafeDb()).toThrow(/npm run test:e2e/);
  });

  it("returns the URI for a local database", () => {
    process.env.MONGODB_URI = MEMORY;
    delete process.env.E2E_ALLOW_REMOTE_DB;
    expect(assertSafeDb()).toBe(MEMORY);
  });

  it("lets the spelled-out escape hatch through", () => {
    process.env.MONGODB_URI = ATLAS;
    process.env.E2E_ALLOW_REMOTE_DB = REMOTE_ESCAPE_HATCH;
    expect(assertSafeDb()).toBe(ATLAS);
  });

  it("is not fooled by a near-miss escape hatch", () => {
    process.env.MONGODB_URI = ATLAS;
    process.env.E2E_ALLOW_REMOTE_DB = "true";
    expect(() => assertSafeDb()).toThrow();
  });
});
