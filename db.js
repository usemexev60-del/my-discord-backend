// MongoDB connection module
import { MongoClient } from 'mongodb';

let db = null;

export async function connectDB() {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not configured');

  const client = new MongoClient(uri);
  await client.connect();
  db = client.db('discord_activity');
  console.log('✅ MongoDB connected');
  return db;
}

export function getDB() {
  if (!db) throw new Error('Database not connected');
  return db;
}
