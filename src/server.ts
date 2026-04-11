import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { connectDB, getProfile, getBloodTests, getAnalyses, getFoodLogs, getInsightsCache, getLifestyleLogs } from './services/db';
import { analyzeHealth, analyzeBodyPhoto, streamAnalysis, generateInsights } from './services/ollama';
import { AnalysisEntry, BloodTest, InsightsCache, LifestyleEntry } from './models';

const app = express();
const PORT = 3300;

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

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
  const test: Omit<BloodTest, '_id'> = {
    date: new Date(date || Date.now()),
    rawText,
    markers: [],
    notes,
    createdAt: new Date(),
  };
  const result = await getBloodTests().insertOne(test as BloodTest);
  res.json({ id: result.insertedId, markers: [] });
});

app.post('/api/photos', upload.single('photo'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const profile = await getProfile().findOne({});
  if (!profile) { res.status(400).json({ error: 'Set up your profile first' }); return; }

  try {
    const weight = req.body.weight ? parseFloat(req.body.weight) : undefined;
    const aiAnalysis = await analyzeBodyPhoto(req.file.path, profile, weight);

    fs.unlink(req.file.path, () => {});

    const fatMatch = aiAnalysis.match(/(\d+(?:\.\d+)?)\s*%/);
    const estimatedBodyFat = fatMatch ? parseFloat(fatMatch[1]) : undefined;

    const now = new Date();
    const entry: Omit<AnalysisEntry, '_id'> = {
      date: now,
      type: 'photo',
      inputText: `Body photo${weight ? ` (${weight} kg)` : ''}`,
      aiResponse: aiAnalysis,
      summary: aiAnalysis.slice(0, 200),
      keyFindings: [],
      recommendations: [],
      createdAt: now,
    };
    await getAnalyses().insertOne(entry as AnalysisEntry);

    res.json({ aiAnalysis, estimatedBodyFat });
  } catch (err) {
    console.error('Photo analysis error:', err);
    fs.unlink(req.file!.path, () => {});
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/analyse', async (req: Request, res: Response) => {
  const { inputText } = req.body;
  const profile = await getProfile().findOne({});
  if (!profile) { res.status(400).json({ error: 'Set up your profile first' }); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const [recentTests, latestLifestyle] = await Promise.all([
    getBloodTests().find({}).sort({ date: -1 }).limit(3).toArray(),
    getLifestyleLogs().findOne({}, { sort: { date: -1 } }),
  ]);
  let fullResponse = '';

  try {
    await streamAnalysis(profile, inputText, recentTests, (chunk) => {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }, latestLifestyle?.content);

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

app.get('/api/analyses', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
  const skip = (page - 1) * limit;
  const [analyses, total] = await Promise.all([
    getAnalyses().find({}).sort({ date: -1 }).skip(skip).limit(limit).toArray(),
    getAnalyses().countDocuments(),
  ]);
  res.json({ analyses, total, page, pages: Math.ceil(total / limit) });
});

app.delete('/api/reset', async (_: Request, res: Response) => {
  await Promise.all([
    getBloodTests().deleteMany({}),
    getAnalyses().deleteMany({}),
    getFoodLogs().deleteMany({}),
    getInsightsCache().deleteMany({}),
  ]);
  res.json({ ok: true });
});

app.get('/api/lifestyle', async (_: Request, res: Response) => {
  const entry = await getLifestyleLogs().findOne({}, { sort: { date: -1 } });
  res.json(entry || null);
});

app.post('/api/lifestyle', async (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content || !content.trim()) { res.status(400).json({ error: 'Content required' }); return; }
  const now = new Date();
  const entry: Omit<LifestyleEntry, '_id'> = { date: now, content: content.trim(), createdAt: now };
  await getLifestyleLogs().insertOne(entry as LifestyleEntry);
  res.json({ ok: true });
});

app.get('/api/insights', async (_: Request, res: Response) => {
  const cached = await getInsightsCache().findOne({}, { sort: { generatedAt: -1 } });
  if (cached) { res.json({ insights: cached, cached: true }); return; }
  res.json({ insights: null, cached: false });
});

app.post('/api/insights/refresh', async (_: Request, res: Response) => {
  const [profile, analyses, latestLifestyle] = await Promise.all([
    getProfile().findOne({}),
    getAnalyses().find({}).sort({ date: 1 }).limit(60).toArray(),
    getLifestyleLogs().findOne({}, { sort: { date: -1 } }),
  ]);
  if (!profile) { res.status(400).json({ error: 'Set up your profile first' }); return; }
  if (analyses.length === 0) { res.status(400).json({ error: 'No analyses found' }); return; }

  try {
    const raw = await generateInsights(profile, analyses, latestLifestyle?.content);
    const doc: Omit<InsightsCache, '_id'> = { ...raw, generatedAt: new Date() };
    await getInsightsCache().deleteMany({});
    await getInsightsCache().insertOne(doc as InsightsCache);
    res.json({ insights: doc });
  } catch (err) {
    console.error('Insights error:', err);
    res.status(500).json({ error: String(err) });
  }
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
  const [profile, recentAnalyses, totalAnalyses] = await Promise.all([
    getProfile().findOne({}),
    getAnalyses().find({}).sort({ date: -1 }).limit(10).toArray(),
    getAnalyses().countDocuments(),
  ]);
  res.json({ profile, recentAnalyses, totalAnalyses });
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Corpus is running at http://localhost:${PORT}`);
  });
}).catch(console.error);
