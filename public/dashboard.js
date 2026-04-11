async function loadDashboard() {
  const res = await fetch('/api/dashboard');
  const { profile, recentPhotos, recentAnalyses } = await res.json();

  if (!profile) {
    document.getElementById('noProfile').style.display = 'block';
    return;
  }

  document.getElementById('dashboardContent').style.display = 'block';
  document.getElementById('welcomeTitle').textContent = `${profile.name}'s Health Dashboard`;

  renderStats(profile, recentPhotos, recentAnalyses);
  renderSuggestions(recentAnalyses);
  renderPhotos(recentPhotos);
  renderAnalyses(recentAnalyses);

  if (recentAnalyses.length > 0) {
    document.getElementById('lastUpdated').textContent = new Date(recentAnalyses[0].date).toLocaleDateString();
  }
}

function renderStats(profile, photos, analyses) {
  const latestPhoto = photos[0];

  const stats = [
    { value: profile.weight ? `${profile.weight} kg` : '—', label: 'Weight' },
    { value: latestPhoto?.estimatedBodyFat ? `~${latestPhoto.estimatedBodyFat}%` : '—', label: 'Body Fat (est.)' },
    { value: analyses.length || 0, label: 'Analyses' },
  ];

  document.getElementById('statsRow').innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
}

function renderSuggestions(analyses) {
  const container = document.getElementById('suggestionsCard');
  if (!analyses || analyses.length === 0) return;

  const latest = analyses.find(a => a.type !== 'photo') || analyses[0];
  const text = latest.aiResponse || '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const bullets = [];
  let inRecs = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('recommend') || lower.includes('suggest') || lower.includes('action')) {
      inRecs = true;
      continue;
    }
    if (inRecs && /^[-•→*]|\d+\./.test(line)) {
      bullets.push(line.replace(/^[-•→*\d\.\s]+/, '').trim());
      if (bullets.length >= 5) break;
    }
  }

  if (bullets.length === 0) {
    for (const line of lines) {
      if (/^[-•→*]|\d+\./.test(line)) {
        bullets.push(line.replace(/^[-•→*\d\.\s]+/, '').trim());
        if (bullets.length >= 5) break;
      }
    }
  }

  if (bullets.length === 0) {
    container.innerHTML = `<p style="font-size:0.9rem;line-height:1.6">${text.slice(0, 350)}${text.length > 350 ? '...' : ''}</p><p style="color:var(--muted);font-size:0.8rem;margin-top:0.5rem">From ${new Date(latest.date).toLocaleDateString()}</p>`;
    return;
  }

  container.innerHTML = `
    <ul style="margin:0;padding-left:1.2rem;line-height:1.9">
      ${bullets.map(s => `<li style="font-size:0.9rem">${s}</li>`).join('')}
    </ul>
    <p style="color:var(--muted);font-size:0.8rem;margin-top:0.75rem">From analysis on ${new Date(latest.date).toLocaleDateString()} · <a href="/analyse.html" style="color:var(--accent)">View all →</a></p>
  `;
}

function renderPhotos(photos) {
  const container = document.getElementById('photoGrid');
  if (!photos || photos.length === 0) return;

  container.innerHTML = photos.map(p => `
    <div style="text-align:center">
      <img src="/uploads/${p.filename}" style="width:100px;height:120px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:0.75rem;color:var(--muted);margin-top:0.3rem">${new Date(p.date).toLocaleDateString()}</div>
      ${p.estimatedBodyFat ? `<div style="font-size:0.75rem;color:var(--accent)">~${p.estimatedBodyFat}% fat</div>` : ''}
    </div>
  `).join('');
}

function renderAnalyses(analyses) {
  const container = document.getElementById('analysisTimeline');
  if (!analyses || analyses.length === 0) return;

  container.innerHTML = analyses.map(a => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div style="flex:1">
        <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.25rem">
          <div class="timeline-date">${new Date(a.date).toLocaleDateString()}</div>
          <span style="font-size:0.7rem;padding:0.1rem 0.5rem;border-radius:20px;background:${a.type === 'photo' ? '#e8f5f0' : '#e8f0fa'};color:${a.type === 'photo' ? 'var(--accent)' : '#1a7fd4'}">${a.type === 'photo' ? 'Photo' : 'Text'}</span>
        </div>
        <div style="font-size:0.875rem;line-height:1.5;color:var(--text)">${(a.summary || a.aiResponse || '').slice(0, 160)}${(a.summary || a.aiResponse || '').length > 160 ? '...' : ''}</div>
      </div>
    </div>
  `).join('');
}

loadDashboard();
