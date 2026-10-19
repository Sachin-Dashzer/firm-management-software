import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { softDeletePlugin } from "@/models/plugins/softDelete";

/** A schema with the plugin on it, never connected to anything. */
function schemaWithPlugin() {
  const schema = new mongoose.Schema({ name: String });
  schema.plugin(softDeletePlugin);
  return schema;
}

/** The smallest stand-in for a document: it only has to remember its save. */
function fakeDoc(schema) {
  const doc = { save: vi.fn(async () => doc) };
  doc.softDelete = schema.methods.softDelete.bind(doc);
  doc.restore = schema.methods.restore.bind(doc);
  return doc;
}

describe("soft delete", () => {
  it("records who deleted it and when", async () => {
    const doc = fakeDoc(schemaWithPlugin());
    await doc.softDelete("u-1");
    expect(doc.deletedBy).toBe("u-1");
    expect(doc.deletedAt).toBeInstanceOf(Date);
  });

  // the whole point: the flag and its audit entry must stand or fall together
  it("saves inside the transaction it is given", async () => {
    const doc = fakeDoc(schemaWithPlugin());
    const session = { id: "the audit transaction" };
    await doc.softDelete("u-1", { session });
    expect(doc.save).toHaveBeenCalledWith({ session });
  });

  it("restores inside the transaction it is given", async () => {
    const doc = fakeDoc(schemaWithPlugin());
    const session = { id: "the audit transaction" };
    doc.deletedAt = new Date();
    doc.deletedBy = "u-1";
    await doc.restore("u-2", { session });
    expect(doc).toMatchObject({
      deletedAt: null,
      deletedBy: null,
      updatedBy: "u-2",
    });
    expect(doc.save).toHaveBeenCalledWith({ session });
  });

  it("hides deleted records from an ordinary find", () => {
    const schema = schemaWithPlugin();
    const Model = mongoose.model(`T${Date.now()}`, schema);
    expect(Model.find({}).getFilter()).toEqual({});
    // the pre-hook runs when the query executes; run it by hand against a query
    const query = Model.find({});
    query._mongooseOptions = {};
    for (const hook of schema.s.hooks._pres.get("find") ?? []) {
      hook.fn.call(query, () => {});
    }
    expect(query.getFilter()).toEqual({ deletedAt: null });
  });
});
