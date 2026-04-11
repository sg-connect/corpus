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
  const profileCtx = `Patient: ${profile.name}, ${profile.age} years old, ${profile.gender}, ${profile.height}cm, ${profile.weight}kg. Conditions: ${profile.conditions.join(', ') || 'None'}. Medications: ${profile.medications.join(', ') || 'None'}.`;

  const textAnalyses = analyses
    .filter(a => a.type !== 'photo')
    .slice(0, 20);

  const analysesText = textAnalyses
    .map(a => `[${new Date(a.date).toISOString().slice(0, 10)}] ${(a.inputText || '').slice(0, 200)}\nAI: ${a.aiResponse.slice(0, 300)}`)
    .join('\n\n---\n\n');

  const prompt = `You are a personal health coach and medical educator. Analyse this patient's health history and return a JSON object that is educational and specific to their actual test results.

${profileCtx}

Health history (oldest to newest):
${analysesText}

Return ONLY valid JSON with this exact structure. Every item must include a specific reason tied to the patient's actual data:

{
  "condition": "One honest sentence about their current overall health based on their tests",
  "conditionLevel": "good",
  "improving": [
    "Marker X improved from Y to Z between 2021 and 2025 — this means ..."
  ],
  "declining": [
    "Marker A has been rising since 2022 — this can lead to ..."
  ],
  "stable": [
    "Marker B has stayed consistently within normal range"
  ],
  "foods": [
    "Oily fish (salmon, sardines) — provides omega-3 fatty acids that reduce inflammation and help lower triglycerides",
    "Leafy greens (spinach, kale) — rich in magnesium and folate which support healthy blood pressure and heart function",
    "Berries (blueberries, strawberries) — antioxidants lower oxidative stress and help regulate blood sugar"
  ],
  "avoid": [
    "White bread and refined pasta — rapidly spike blood glucose and insulin, worsening any glucose intolerance",
    "Butter and full-fat dairy — saturated fat raises LDL cholesterol directly",
    "Sugary drinks and fruit juices — liquid sugar bypasses satiety signals and drives blood sugar spikes",
    "Processed meats (sausages, deli meat) — high in sodium and nitrates, linked to elevated blood pressure and inflammation",
    "Gluten-heavy processed foods — can cause gut inflammation especially if any sensitivity exists"
  ],
  "vitamins": [
    "Vitamin D3 (2000–4000 IU daily) — most people are deficient; essential for immune function, bone health and mood regulation",
    "Magnesium glycinate (300–400mg) — supports over 300 enzyme reactions, improves sleep quality and reduces muscle cramps",
    "Omega-3 fish oil (2–3g EPA+DHA) — reduces inflammation, lowers triglycerides and protects cardiovascular health"
  ],
  "sports": [
    "Brisk walking 30–45 min daily — improves insulin sensitivity, lowers resting heart rate and boosts mood via endorphins",
    "Resistance training 2–3x per week — builds muscle mass which increases metabolic rate and improves glucose uptake",
    "Swimming or cycling — low-impact cardio that strengthens the heart without stressing joints"
  ],
  "lifestyle": [
    "Sleep 7–8 hours consistently — poor sleep raises cortisol which directly elevates blood sugar and promotes fat storage",
    "Manage stress with daily breathing or meditation — chronic stress raises cortisol and inflammatory markers",
    "Drink 2–2.5L of water daily — proper hydration supports kidney function and helps flush excess glucose"
  ]
}

conditionLevel must be exactly one of: "good", "fair", or "attention".
Make every recommendation specific to this patient's actual blood results and history. The patient wants to learn WHY. Be educational and clear.`;

  const attemptCall = async (): Promise<Omit<InsightsCache, '_id' | 'generatedAt'>> => {
    const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TEXT_MODEL, prompt, stream: false, format: 'json' }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json() as { response: string };

    let raw = data.response.trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) raw = raw.slice(jsonStart, jsonEnd + 1);

    const parsed = JSON.parse(raw);
    return {
      condition: parsed.condition || 'Analysis complete',
      conditionLevel: ['good', 'fair', 'attention'].includes(parsed.conditionLevel) ? parsed.conditionLevel : 'fair',
      improving: Array.isArray(parsed.improving) ? parsed.improving : [],
      declining: Array.isArray(parsed.declining) ? parsed.declining : [],
      stable: Array.isArray(parsed.stable) ? parsed.stable : [],
      foods: Array.isArray(parsed.foods) ? parsed.foods : [],
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
      vitamins: Array.isArray(parsed.vitamins) ? parsed.vitamins : [],
      sports: Array.isArray(parsed.sports) ? parsed.sports : [],
      lifestyle: Array.isArray(parsed.lifestyle) ? parsed.lifestyle : [],
    };
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await attemptCall();
    } catch (err) {
      if (attempt === 3) throw new Error(`Failed after 3 attempts: ${err}`);
      console.warn(`Insights attempt ${attempt} failed, retrying…`);
    }
  }
  throw new Error('Unreachable');
}
