import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI environment variable is not set");
}

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Cached across warm serverless invocations (and HMR reloads in dev) so we
// don't open a fresh connection to Atlas on every request.
if (!global._mongoClientPromise) {
  const client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}
const clientPromise = global._mongoClientPromise;

export default clientPromise;

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
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
    db.collection("syncState").createIndex({ key: 1 }, { unique: true }),
  ]);
}
