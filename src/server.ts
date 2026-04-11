import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { connectDB, getProfile, getBloodTests, getBodyPhotos, getAnalyses, getFoodLogs } from './services/db';
import { analyzeHealth, analyzeBodyPhoto, parseBloodTestText, streamAnalysis } from './services/ollama';
import { AnalysisEntry, BloodTest, BodyPhoto } from './models';

const app = express();
const PORT = 3300;

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadsDir));

app.get('/api/profile', async (_: Request, res: Response) => {
  const profile = await getProfile().findOne({});
  res.json(profile || null);
});

app.post('/api/profile', async (req: Request, res: Response) => {
  const col = getProfile();
  const existing = await col.findOne({});
  const now = new Date();
  if (existing) {
    await col.updateOne({}, { $set: { ...req.body, updatedAt: now } });
  } else {
    await col.insertOne({ ...req.body, createdAt: now, updatedAt: now });
  }
  res.json({ ok: true });
});

app.get('/api/blood-tests', async (_: Request, res: Response) => {
  const tests = await getBloodTests().find({}).sort({ date: -1 }).limit(10).toArray();
  res.json(tests);
});

app.post('/api/blood-tests', async (req: Request, res: Response) => {
  const { rawText, date, notes } = req.body;
  const markers = await parseBloodTestText(rawText);
  const test: Omit<BloodTest, '_id'> = {
    date: new Date(date || Date.now()),
    rawText,
    markers,
    notes,
    createdAt: new Date(),
  };
  const result = await getBloodTests().insertOne(test as BloodTest);
  res.json({ id: result.insertedId, markers });
});

app.get('/api/photos', async (_: Request, res: Response) => {
  const photos = await getBodyPhotos().find({}).sort({ date: -1 }).toArray();
  res.json(photos);
});

app.post('/api/photos', upload.single('photo'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const profile = await getProfile().findOne({});
  if (!profile) { res.status(400).json({ error: 'Set up your profile first' }); return; }

  const weight = req.body.weight ? parseFloat(req.body.weight) : undefined;
  const aiAnalysis = await analyzeBodyPhoto(req.file.path, profile, weight);

  const fatMatch = aiAnalysis.match(/(\d+(?:\.\d+)?)\s*%/);
  const estimatedBodyFat = fatMatch ? parseFloat(fatMatch[1]) : undefined;

  const photo: Omit<BodyPhoto, '_id'> = {
    date: new Date(),
    filename: req.file.filename,
    weight,
    aiAnalysis,
    estimatedBodyFat,
    createdAt: new Date(),
  };
  const result = await getBodyPhotos().insertOne(photo as BodyPhoto);
  res.json({ id: result.insertedId, aiAnalysis, estimatedBodyFat });
});

app.post('/api/analyse', async (req: Request, res: Response) => {
  const { inputText } = req.body;
  const profile = await getProfile().findOne({});
  if (!profile) { res.status(400).json({ error: 'Set up your profile first' }); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const recentTests = await getBloodTests().find({}).sort({ date: -1 }).limit(3).toArray();
  let fullResponse = '';

  try {
    await streamAnalysis(profile, inputText, recentTests, (chunk) => {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });

    const entry: Omit<AnalysisEntry, '_id'> = {
      date: new Date(),
      type: 'text',
      inputText,
      aiResponse: fullResponse,
      summary: fullResponse.slice(0, 200),
      keyFindings: [],
      recommendations: [],
      createdAt: new Date(),
    };
    await getAnalyses().insertOne(entry as AnalysisEntry);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
  }
  res.end();
});

app.get('/api/analyses', async (_: Request, res: Response) => {
  const analyses = await getAnalyses().find({}).sort({ date: -1 }).limit(20).toArray();
  res.json(analyses);
});

app.post('/api/food', async (req: Request, res: Response) => {
  const { description } = req.body;
  await getFoodLogs().insertOne({ description, date: new Date(), createdAt: new Date() });
  res.json({ ok: true });
});

app.get('/api/food', async (_: Request, res: Response) => {
  const logs = await getFoodLogs().find({}).sort({ date: -1 }).limit(30).toArray();
  res.json(logs);
});

app.get('/api/dashboard', async (_: Request, res: Response) => {
  const [profile, recentTests, recentPhotos, recentAnalyses] = await Promise.all([
    getProfile().findOne({}),
    getBloodTests().find({}).sort({ date: -1 }).limit(5).toArray(),
    getBodyPhotos().find({}).sort({ date: -1 }).limit(3).toArray(),
    getAnalyses().find({}).sort({ date: -1 }).limit(5).toArray(),
  ]);
  res.json({ profile, recentTests, recentPhotos, recentAnalyses });
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Corpus is running at http://localhost:${PORT}`);
  });
}).catch(console.error);
