async function loadDashboard() {
  const res = await fetch('/api/dashboard');
  const { profile, recentTests, recentPhotos, recentAnalyses } = await res.json();

  if (!profile) {
    document.getElementById('noProfile').style.display = 'block';
    return;
  }

  document.getElementById('dashboardContent').style.display = 'block';
  document.getElementById('welcomeTitle').textContent = `${profile.name}'s Health Dashboard`;

  renderStats(profile, recentTests, recentPhotos);
  renderBloodMarkers(recentTests);
  renderPhotos(recentPhotos);
  renderAnalyses(recentAnalyses);

  if (recentAnalyses.length > 0) {
    document.getElementById('lastUpdated').textContent = new Date(recentAnalyses[0].date).toLocaleDateString();
  }
}

function renderStats(profile, tests, photos) {
  const latestTest = tests[0];
  const latestPhoto = photos[0];

  const stats = [
    { value: `${profile.weight} kg`, label: 'Weight' },
    { value: latestPhoto?.estimatedBodyFat ? `~${latestPhoto.estimatedBodyFat}%` : '—', label: 'Body Fat (est.)' },
    { value: tests.length, label: 'Blood Tests' },
  ];

  document.getElementById('statsRow').innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
}

function renderBloodMarkers(tests) {
  const container = document.getElementById('bloodMarkers');
  if (!tests || tests.length === 0) return;

  const latest = tests[0];
  if (!latest.markers || latest.markers.length === 0) return;

  container.innerHTML = `
    <div style="font-size:0.8rem; color:var(--muted); margin-bottom:0.8rem">${new Date(latest.date).toLocaleDateString()}</div>
    ${latest.markers.slice(0, 12).map(m => {
      let badge = '';
      if (m.referenceMin !== undefined && m.referenceMax !== undefined) {
        const inRange = m.value >= m.referenceMin && m.value <= m.referenceMax;
        badge = inRange
          ? `<span class="badge badge-ok">OK</span>`
          : `<span class="badge badge-warn">Review</span>`;
      }
      return `
        <div class="marker-row">
          <span>${m.name}</span>
          <span>${m.value} <span style="color:var(--muted);font-size:0.8rem">${m.unit}</span> ${badge}</span>
        </div>`;
    }).join('')}
    ${latest.markers.length > 12 ? `<p style="color:var(--muted);font-size:0.8rem;margin-top:0.5rem">+${latest.markers.length - 12} more markers</p>` : ''}
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
        <div class="timeline-date">${new Date(a.date).toLocaleDateString()}</div>
        <div style="font-size:0.9rem;line-height:1.5">${a.summary || a.aiResponse.slice(0, 200)}...</div>
      </div>
    </div>
  `).join('');
}

loadDashboard();
