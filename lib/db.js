// @ts-check

import mongoose from "mongoose";

/**
 * One Mongoose connection per serverless instance. Vercel keeps a warm
 * function alive between requests, so the connection is cached on globalThis;
 * without this every request would open a new pool and exhaust Atlas.
 */

const MONGODB_URI = process.env.MONGODB_URI;

/** @type {{ conn: mongoose.Mongoose | null, promise: Promise<mongoose.Mongoose> | null }} */
const cache = globalThis._phmgMongoose ?? { conn: null, promise: null };
globalThis._phmgMongoose = cache;

/**
 * @returns {Promise<mongoose.Mongoose>}
 */
export async function connectDB() {
  if (cache.conn) return cache.conn;

  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.",
    );
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null; // let the next request retry instead of caching failure
    throw err;
  }
  return cache.conn;
}
