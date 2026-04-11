import { MongoClient, Db, Collection } from 'mongodb';
import { UserProfile, BloodTest, BodyPhoto, AnalysisEntry, FoodLog, InsightsCache, LifestyleEntry } from '../models';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'corpus';

let db: Db;

export async function connectDB(): Promise<void> {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('MongoDB connected: corpus');
}

export function getProfile(): Collection<UserProfile> {
  return db.collection<UserProfile>('profile');
}

export function getBloodTests(): Collection<BloodTest> {
  return db.collection<BloodTest>('blood_tests');
}

export function getBodyPhotos(): Collection<BodyPhoto> {
  return db.collection<BodyPhoto>('body_photos');
}

export function getAnalyses(): Collection<AnalysisEntry> {
  return db.collection<AnalysisEntry>('analyses');
}

export function getFoodLogs(): Collection<FoodLog> {
  return db.collection<FoodLog>('food_logs');
}

export function getInsightsCache(): Collection<InsightsCache> {
  return db.collection<InsightsCache>('insights_cache');
}

export function getLifestyleLogs(): Collection<LifestyleEntry> {
  return db.collection<LifestyleEntry>('lifestyle_logs');
}
