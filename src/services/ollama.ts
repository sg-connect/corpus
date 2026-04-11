import { UserProfile, BloodTest, AnalysisEntry, InsightsCache } from '../models';

const OLLAMA_BASE = 'http://localhost:11434';
const TEXT_MODEL = 'corpus-ai';
const VISION_MODEL = 'minicpm-v:latest';

export async function analyzeHealth(
  profile: UserProfile,
  inputText: string,
  recentBloodTests: BloodTest[]
): Promise<string> {
  const profileContext = `
Patient Profile:
- Name: ${profile.name}
- Age: ${profile.age} years
- Height: ${profile.height} cm
- Weight: ${profile.weight} kg
- Gender: ${profile.gender}
- Blood Type: ${profile.bloodType || 'Unknown'}
- Medications: ${profile.medications.length > 0 ? profile.medications.join(', ') : 'None'}
- Conditions: ${profile.conditions.length > 0 ? profile.conditions.join(', ') : 'None'}
`.trim();

  const bloodContext = recentBloodTests.length > 0
    ? `\nRecent Blood Tests:\n${recentBloodTests.map(t =>
        `Date: ${t.date.toLocaleDateString()}\n${t.markers.map(m =>
          `  ${m.name}: ${m.value} ${m.unit}${m.referenceMin !== undefined ? ` (ref: ${m.referenceMin}-${m.referenceMax})` : ''}`
        ).join('\n')}`
      ).join('\n\n')}`
    : '';

  const prompt = `${profileContext}${bloodContext}\n\nUser Input:\n${inputText}`;

  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_MODEL,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
  const data = await response.json() as { response: string };
  return data.response;
}

export async function analyzeBodyPhoto(
  imagePath: string,
  profile: UserProfile,
  weight?: number
): Promise<string> {
  const fs = await import('fs');
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const ext = imagePath.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';

  const prompt = `You are analyzing a body photo for health and body composition assessment.

Person details: ${profile.age} years old, ${profile.gender}, height ${profile.height}cm, weight ${weight || profile.weight}kg.

Please analyze this body photo and provide:
1. Estimated body fat percentage (visual estimate)
2. Muscle definition and mass assessment
3. Body type classification (ectomorph/mesomorph/endomorph)
4. Notable observations (posture, symmetry, areas of concern)
5. Recommendations based on what you see

Be professional, clinical, and constructive. Focus on health indicators, not aesthetics.`;

  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL,
      prompt,
      images: [imageData],
      stream: false,
    }),
  });

  if (!response.ok) throw new Error(`Ollama vision error: ${response.statusText}`);
  const data = await response.json() as { response: string };
  return data.response;
}

export async function parseBloodTestText(rawText: string): Promise<Array<{ name: string; value: number; unit: string }>> {
  const prompt = `Extract blood test markers from the following text. Return ONLY a JSON array with objects containing: name, value, unit. No other text.

Text:
${rawText}

Example format:
[{"name":"Glucose","value":95,"unit":"mg/dL"},{"name":"HbA1c","value":5.4,"unit":"%"}]`;

  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_MODEL,
      prompt,
      stream: false,
      format: 'json',
    }),
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
  const data = await response.json() as { response: string };

  try {
    const parsed = JSON.parse(data.response);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.markers && Array.isArray(parsed.markers)) return parsed.markers;
    const firstArray = Object.values(parsed).find(v => Array.isArray(v));
    if (firstArray) return firstArray as Array<{ name: string; value: number; unit: string }>;
    return [];
  } catch {
    return [];
  }
}

export async function streamAnalysis(
  profile: UserProfile,
  inputText: string,
  recentBloodTests: BloodTest[],
  onChunk: (chunk: string) => void
): Promise<void> {
  const profileContext = `
Patient Profile:
- Name: ${profile.name}, Age: ${profile.age}, Height: ${profile.height}cm, Weight: ${profile.weight}kg
- Gender: ${profile.gender}, Blood Type: ${profile.bloodType || 'Unknown'}
- Medications: ${profile.medications.join(', ') || 'None'}
- Conditions: ${profile.conditions.join(', ') || 'None'}
`.trim();

  const bloodContext = recentBloodTests.length > 0
    ? `\nRecent Blood Tests:\n${recentBloodTests.map(t =>
        `${t.date.toLocaleDateString()}: ${t.markers.map(m => `${m.name}=${m.value}${m.unit}`).join(', ')}`
      ).join('\n')}`
    : '';

  const prompt = `${profileContext}${bloodContext}\n\nUser Input:\n${inputText}`;

  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TEXT_MODEL, prompt, stream: true }),
  });

  if (!response.ok || !response.body) throw new Error('Stream failed');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { response: string; done: boolean };
        if (parsed.response) onChunk(parsed.response);
      } catch {}
    }
  }
}

export async function generateInsights(
  profile: UserProfile,
  analyses: AnalysisEntry[]
): Promise<Omit<InsightsCache, '_id' | 'generatedAt'>> {
  const profileCtx = `Patient: ${profile.name}, ${profile.age}yo, ${profile.gender}, ${profile.height}cm, ${profile.weight}kg. Conditions: ${profile.conditions.join(', ') || 'None'}. Medications: ${profile.medications.join(', ') || 'None'}.`;

  const analysesText = analyses
    .filter(a => a.type !== 'photo')
    .slice(0, 40)
    .map(a => `[${new Date(a.date).toISOString().slice(0, 10)}] ${a.inputText || ''}\n${a.aiResponse.slice(0, 400)}`)
    .join('\n\n---\n\n');

  const prompt = `You are a health data analyst. Analyze this patient's full blood test history (2019–2026) and return a structured JSON object.

${profileCtx}

Analysis history (chronological):
${analysesText}

Return ONLY a valid JSON object with this exact structure:
{
  "condition": "One sentence describing current overall health status",
  "conditionLevel": "good" or "fair" or "attention",
  "improving": ["List markers/areas that improved over time with detail"],
  "declining": ["List markers/areas that worsened over time with detail"],
  "stable": ["List markers/areas that stayed stable"],
  "foods": ["Specific food to eat 1", "food 2", "food 3", "food 4", "food 5"],
  "lifestyle": ["Specific lifestyle recommendation 1", "rec 2", "rec 3", "rec 4"],
  "chartData": [
    {
      "marker": "Marker name",
      "unit": "unit",
      "points": [
        {"date": "YYYY-MM-DD", "value": 95}
      ]
    }
  ]
}

Extract chartData for all key blood markers found across the analyses (glucose, cholesterol, HbA1c, triglycerides, etc.) with their values and dates. Return 5-10 markers max.`;

  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TEXT_MODEL, prompt, stream: false, format: 'json' }),
  });

  if (!response.ok) throw new Error(`Ollama insights error: ${response.statusText}`);
  const data = await response.json() as { response: string };

  try {
    const parsed = JSON.parse(data.response);
    return {
      condition: parsed.condition || 'Analysis complete',
      conditionLevel: parsed.conditionLevel || 'fair',
      improving: Array.isArray(parsed.improving) ? parsed.improving : [],
      declining: Array.isArray(parsed.declining) ? parsed.declining : [],
      stable: Array.isArray(parsed.stable) ? parsed.stable : [],
      foods: Array.isArray(parsed.foods) ? parsed.foods : [],
      lifestyle: Array.isArray(parsed.lifestyle) ? parsed.lifestyle : [],
      chartData: Array.isArray(parsed.chartData) ? parsed.chartData : [],
    };
  } catch {
    throw new Error('Failed to parse insights JSON');
  }
}
