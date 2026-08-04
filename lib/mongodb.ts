import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI environment variable is not set");
}

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  const client = new MongoClient(uri!, {
    // Fail in single-digit seconds instead of the driver's much longer
    // defaults (we saw individual attempts hang for 30-270s in production),
    // so a bad connection surfaces as a quick error rather than a request
    // that appears to hang.
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
  });
  const promise = client.connect();
  // A rejected connection promise must not stay cached: every later request
  // on this same warm serverless instance would immediately re-await (and
  // re-fail on) that same rejection, rather than getting a fresh attempt.
  promise.catch(() => {
    if (global._mongoClientPromise === promise) {
      global._mongoClientPromise = undefined;
    }
  });
  return promise;
}

// Cached across warm serverless invocations (and HMR reloads in dev) so we
// don't open a fresh connection to Atlas on every request.
if (!global._mongoClientPromise) {
  global._mongoClientPromise = connect();
}

export default global._mongoClientPromise;

export async function getDb(): Promise<Db> {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = connect();
  }
  const client = await global._mongoClientPromise;
  return client.db("mse");
}

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db
      .collection("securities")
      .createIndex({ companyCode: 1 }, { unique: true }),
    db.collection("securities").createIndex({ symbol: 1 }, { unique: true }),
    db
      .collection("prices")
      .createIndex({ companyCode: 1, date: 1 }, { unique: true }),
    db.collection("prices").createIndex({ companyCode: 1, date: -1 }),
    db
      .collection("financials")
      .createIndex({ companyCode: 1, period: 1 }, { unique: true }),
    db.collection("aiSignals").createIndex({ companyCode: 1, createdAt: -1 }),
    // Both caches are read with findOne({key}) and written with an upsert on
    // the same filter. Without a unique index two concurrent misses can each
    // insert their own document, after which findOne returns an arbitrary one
    // and half the writes are invisible.
    db.collection("marketSnapshots").createIndex({ key: 1 }, { unique: true }),
    db.collection("newsSnapshots").createIndex({ key: 1 }, { unique: true }),
    db.collection("syncState").createIndex({ key: 1 }, { unique: true }),
    db
      .collection("pushSubscriptions")
      .createIndex({ endpoint: 1 }, { unique: true }),
    db
      .collection("signalHistory")
      .createIndex({ companyCode: 1 }, { unique: true }),
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ token: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("portfolios").createIndex({ userId: 1 }, { unique: true }),
    db
      .collection("holdings")
      .createIndex({ userId: 1, companyCode: 1 }, { unique: true }),
    db.collection("transactions").createIndex({ userId: 1, createdAt: -1 }),
    db
      .collection("watchlist")
      .createIndex({ userId: 1, companyCode: 1 }, { unique: true }),
  ]);
}
