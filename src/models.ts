import { ObjectId } from 'mongodb';

export interface UserProfile {
  _id?: ObjectId;
  name: string;
  age: number;
  height: number;
  weight: number;
  gender: string;
  bloodType?: string;
  medications: string[];
  conditions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BloodMarker {
  name: string;
  value: number;
  unit: string;
  referenceMin?: number;
  referenceMax?: number;
  optimalMin?: number;
  optimalMax?: number;
}

export interface BloodTest {
  _id?: ObjectId;
  date: Date;
  rawText: string;
  markers: BloodMarker[];
  notes?: string;
  createdAt: Date;
}

export interface BodyPhoto {
  _id?: ObjectId;
  date: Date;
  filename: string;
  weight?: number;
  aiAnalysis?: string;
  estimatedBodyFat?: number;
  estimatedMuscleMass?: number;
  createdAt: Date;
}

export interface AnalysisEntry {
  _id?: ObjectId;
  date: Date;
  type: 'blood' | 'photo' | 'text' | 'combined';
  inputText?: string;
  bloodTestId?: ObjectId;
  photoIds?: ObjectId[];
  aiResponse: string;
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  createdAt: Date;
}

export interface FoodLog {
  _id?: ObjectId;
  date: Date;
  description: string;
  aiNotes?: string;
  createdAt: Date;
}
