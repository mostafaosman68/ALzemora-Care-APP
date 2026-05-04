const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb+srv://Alzemora:alzemora2026@cluster0.admj5gd.mongodb.net/?appName=Cluster0';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'Alzemora';

let _db = null;

async function connect() {
  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  _db = client.db(MONGODB_DB_NAME);
  console.log(`Connected to MongoDB Atlas — database: ${MONGODB_DB_NAME}`);
  return _db;
}

function getDb() {
  if (!_db) throw new Error('Database not initialized — call connect() first');
  return _db;
}

module.exports = { connect, getDb, ObjectId };
