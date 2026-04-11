let activeChart = null;
let chartData = [];

async function loadDashboard() {
  const res = await fetch('/api/dashboard');
  const { profile, recentPhotos, recentAnalyses, totalAnalyses } = await res.json();

  if (!profile) {
    document.getElementById('noProfile').style.display = 'block';
    return;
  }

  document.getElementById('dashboardContent').style.display = 'block';
  document.getElementById('welcomeTitle').textContent = `${profile.name}'s Health Dashboard`;

  renderStats(profile, recentPhotos, recentAnalyses, totalAnalyses);
  renderPhotos(recentPhotos);
  await loadAnalysesPage(1);
  await loadInsights();

  if (recentAnalyses.length > 0) {
    document.getElementById('lastUpdated').textContent = new Date(recentAnalyses[0].date).toLocaleDateString();
  }
}

async function loadInsights() {
  try {
    const res = await fetch('/api/insights');
    const data = await res.json();
    if (data.insights) {
      renderInsights(data.insights);
    }
  } catch {}
}

async function refreshInsights() {
  const btn = document.getElementById('refreshInsightsBtn');
  const btnText = document.getElementById('refreshBtnText');
  const spinner = document.getElementById('refreshSpinner');

  btn.disabled = true;
  btnText.textContent = 'Analysing history…';
  spinner.style.display = 'inline-block';
  document.getElementById('noInsightsHint').style.display = 'none';

  try {
    const res = await fetch('/api/insights/refresh', { method: 'POST' });
    const data = await res.json();
    if (data.insights) {
      renderInsights(data.insights);
    }
  } catch {
    alert('Failed to generate insights. Make sure the server is running.');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Refresh Insights';
    spinner.style.display = 'none';
  }
}

function renderInsights(insights) {
  document.getElementById('noInsightsHint').style.display = 'none';
  document.getElementById('insightsSection').style.display = 'block';
  document.getElementById('refreshBtnText').textContent = 'Refresh Insights';

  const levelMap = {
    good: { label: 'Good', bg: '#d4f4e8', color: '#0e9e6e' },
    fair: { label: 'Fair', bg: '#fff3cd', color: '#b08000' },
    attention: { label: 'Needs Attention', bg: '#fde8e8', color: '#c0392b' }
  };
  const lvl = levelMap[insights.conditionLevel] || levelMap.fair;
  const badge = document.getElementById('conditionBadge');
  badge.textContent = lvl.label;
  badge.style.background = lvl.bg;
  badge.style.color = lvl.color;

  document.getElementById('conditionText').textContent = insights.condition;
  if (insights.generatedAt) {
    document.getElementById('insightsDate').textContent = `Generated on ${new Date(insights.generatedAt).toLocaleDateString()}`;
  }

  const imp = document.getElementById('improvingList');
  imp.innerHTML = (insights.improving || []).length
    ? insights.improving.map(t => `<li>${t}</li>`).join('')
    : '<li style="color:var(--muted)">No improving trends detected</li>';

  const dec = document.getElementById('decliningList');
  dec.innerHTML = (insights.declining || []).length
    ? insights.declining.map(t => `<li>${t}</li>`).join('')
    : '<li style="color:var(--muted)">No declining trends detected</li>';

  const foods = document.getElementById('foodsList');
  foods.innerHTML = (insights.foods || []).map(f => `<li>${f}</li>`).join('') || '<li style="color:var(--muted)">No suggestions</li>';

  const lifestyle = document.getElementById('lifestyleList');
  lifestyle.innerHTML = (insights.lifestyle || []).map(l => `<li>${l}</li>`).join('') || '<li style="color:var(--muted)">No suggestions</li>';

  chartData = insights.chartData || [];
  if (chartData.length > 0) {
    buildChartTabs(chartData);
    renderChart(0);
  }
}

function buildChartTabs(data) {
  const container = document.getElementById('chartTabs');
  container.innerHTML = data.map((m, i) => `
    <button class="page-btn" id="tab-${i}" onclick="selectChartTab(${i})" style="font-size:0.8rem">${m.marker}</button>
  `).join('');
}

function selectChartTab(idx) {
  document.querySelectorAll('#chartTabs .page-btn').forEach((b, i) => {
    b.style.background = i === idx ? 'var(--accent)' : '';
    b.style.color = i === idx ? '#fff' : '';
  });
  renderChart(idx);
}

function renderChart(idx) {
  const marker = chartData[idx];
  if (!marker || !marker.points || marker.points.length === 0) return;

  const labels = marker.points.map(p => p.date);
  const values = marker.points.map(p => p.value);

  const ctx = document.getElementById('markerChart').getContext('2d');

  if (activeChart) {
    activeChart.destroy();
    activeChart = null;
  }

  activeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${marker.marker} (${marker.unit || ''})`,
        data: values,
        borderColor: '#0e9e6e',
        backgroundColor: 'rgba(14,158,110,0.08)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: '#0e9e6e',
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 11 } },
          title: { display: !!marker.unit, text: marker.unit, font: { size: 11 }, color: '#666' }
        }
      }
    }
  });

  selectChartTab(idx);
}

function renderStats(profile, photos, analyses, totalAnalyses) {
  const latestPhoto = photos[0];

  const stats = [
    { value: profile.weight ? `${profile.weight} kg` : '—', label: 'Weight' },
    { value: latestPhoto?.estimatedBodyFat ? `~${latestPhoto.estimatedBodyFat}%` : '—', label: 'Body Fat (est.)' },
    { value: totalAnalyses ?? analyses.length, label: 'Analyses' },
  ];

  document.getElementById('statsRow').innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
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

let dashPage = 1;
const DASH_LIMIT = 5;
let dashTotal = 0;
let dashPages = 1;

async function loadAnalysesPage(page = 1) {
  dashPage = page;
  const res = await fetch(`/api/analyses?page=${page}&limit=${DASH_LIMIT}`);
  const data = await res.json();
  dashTotal = data.total;
  dashPages = data.pages;
  renderAnalyses(data.analyses);
}

function renderAnalyses(analyses) {
  const container = document.getElementById('analysisTimeline');
  if (!analyses || analyses.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.9rem">No analyses yet.</p>';
    return;
  }

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

  if (dashPages > 1) {
    container.innerHTML += `
      <div class="pagination" style="margin-top:1rem">
        <button class="page-btn" onclick="loadAnalysesPage(${dashPage - 1})" ${dashPage <= 1 ? 'disabled' : ''}>← Prev</button>
        <span class="page-info">Page ${dashPage} of ${dashPages} <span style="color:var(--muted);font-size:0.8rem">(${dashTotal} total)</span></span>
        <button class="page-btn" onclick="loadAnalysesPage(${dashPage + 1})" ${dashPage >= dashPages ? 'disabled' : ''}>Next →</button>
      </div>`;
  }
}

loadDashboard();
