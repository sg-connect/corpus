# Corpus

**Your personal health intelligence system.**

Corpus lets you drop in blood test results, body photos, and health notes — and uses local AI to analyse your data, track trends over time, and give you personalised recommendations. No daily logging, no subscriptions, fully local.

---

## Features

- **Blood Test Parsing** — Paste raw lab results and AI automatically extracts every marker (glucose, HbA1c, cholesterol, ferritin, vitamin D, and more)
- **Body Photo Analysis** — Upload photos and get AI estimates of body fat percentage and muscle mass using a local vision model
- **AI Health Analysis** — Context-aware analysis that cross-references your profile, medications, conditions, and blood history
- **Health Dashboard** — Track markers over time, view body composition trends, and see recent AI insights
- **Profile-aware** — Corpus knows your age, height, weight, medications, and conditions so every analysis is personalised
- **Fully local** — All data stays on your machine. Uses Ollama + MongoDB, no cloud required

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + TypeScript + Express |
| Database | MongoDB (local) |
| AI (text) | Ollama — `qwen2.5:7b` (custom `corpus-ai` model) |
| AI (vision) | Ollama — `minicpm-v` for body photo analysis |
| File uploads | Multer |
| Frontend | Vanilla HTML/CSS/JS |

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org) v18+
- [MongoDB](https://www.mongodb.com/try/download/community) running locally on port 27017
- [Ollama](https://ollama.com) installed and running

### Install

```bash
npm install
```

### Create the AI model

```bash
ollama create corpus-ai -f Modelfile
```

> This creates a custom health-tuned model based on `qwen2.5:7b`. You need `qwen2.5:7b` and `minicpm-v` pulled locally.

```bash
ollama pull qwen2.5:7b
ollama pull minicpm-v
```

### Build and run

```bash
npm run dev
```

Server starts at **http://localhost:3300**

---

## Pages

| Page | URL | Purpose |
|---|---|---|
| Home | `/` | Landing page |
| Profile | `/profile.html` | Set up your health profile (required first) |
| Analyse | `/analyse.html` | Paste blood tests, upload photos, run AI analysis |
| Dashboard | `/dashboard.html` | Health overview, markers, trends, recent analyses |

---

## Usage

1. **Set up your profile** — Go to `/profile.html` and fill in your age, height, weight, medications, and conditions
2. **Add blood tests** — Go to `/analyse.html`, paste your lab results in the text area, and click "Save Blood Test". The AI will extract all markers automatically
3. **Run an analysis** — Type anything health-related in the text area and click "Analyse with AI". It will cross-reference your profile and blood history
4. **Upload a body photo** — Use the upload zone on the Analyse page to get AI body composition estimates
5. **View your dashboard** — Track everything over time at `/dashboard.html`

---

## Data Storage

All data is stored locally in MongoDB under the `corpus` database:

| Collection | Contents |
|---|---|
| `profile` | Your health profile (one document) |
| `blood_tests` | Blood test results with extracted markers |
| `body_photos` | Uploaded photos with AI analysis |
| `analyses` | Full AI analysis history |
| `food_logs` | Optional food/nutrition notes |

---

## Part of the Neura Suite

Corpus is part of a personal productivity suite:

- [NeuraFocus](https://github.com/sg-connect/neura-focus) — Focus & productivity tracker
- **Corpus** — Health intelligence system
- [Prospero](https://github.com/sg-connect/prospero) — Finance & investment tracker
- [Triply](https://github.com/sg-connect/triply) — AI travel planner
