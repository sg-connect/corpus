function setOutputState(state, text) {
  const output = document.getElementById('analysisOutput');
  const status = document.getElementById('analysisStatus');
  output.className = `analysis-output state-${state}`;
  if (text !== undefined) output.textContent = text;
  if (state === 'analysing') {
    status.innerHTML = '<span class="analysis-status-dot dot-analysing"></span>Analysing…';
  } else if (state === 'done') {
    status.innerHTML = '<span class="analysis-status-dot dot-done"></span>Done';
  } else {
    status.innerHTML = '';
  }
}

let selectedPhoto = null;

async function runAnalysis() {
  const inputText = document.getElementById('inputText').value.trim();
  if (!inputText) { alert('Please enter some health information to analyse.'); return; }

  const output = document.getElementById('analysisOutput');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');

  setOutputState('analysing', 'Analysing…');
  btnText.textContent = 'Analysing...';
  btnSpinner.style.display = 'inline-block';

  let firstChunk = true;

  try {
    const res = await fetch('/api/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputText }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = JSON.parse(line.slice(6));
        if (data.chunk) {
          if (firstChunk) {
            output.textContent = '';
            firstChunk = false;
          }
          output.textContent += data.chunk;
          output.scrollTop = output.scrollHeight;
        }
        if (data.done) {
          setOutputState('done');
          document.getElementById('inputText').value = '';
          loadHistory();
          break;
        }
        if (data.error) { setOutputState('idle', `Error: ${data.error}`); break; }
      }
    }
  } catch (err) {
    setOutputState('idle', `Error: ${err.message}`);
  } finally {
    btnText.textContent = 'Analyse & Save';
    btnSpinner.style.display = 'none';
  }
}

function handlePhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  selectedPhoto = file;
  const preview = document.getElementById('photoPreview');
  const prompt = document.getElementById('uploadPrompt');
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  prompt.style.display = 'none';
  document.getElementById('analysePhotoBtn').style.display = 'inline-flex';
}

async function analysePhoto() {
  if (!selectedPhoto) return;

  const btn = document.getElementById('analysePhotoBtn');
  const output = document.getElementById('analysisOutput');
  btn.textContent = 'Analysing photo...';
  btn.disabled = true;

  let elapsed = 0;
  const tick = () => {
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const t = m > 0 ? `${m}m ${s}s` : `${s}s`;
    setOutputState('analysing', `Analysing body photo with AI vision model… (${t})\n\nVision models take 1–3 minutes — still working.`);
    elapsed++;
  };
  tick();
  const timer = setInterval(tick, 1000);

  const formData = new FormData();
  formData.append('photo', selectedPhoto);
  const weight = document.getElementById('photoWeight').value;
  if (weight) formData.append('weight', weight);

  try {
    const res = await fetch('/api/photos', { method: 'POST', body: formData });
    const data = await res.json();
    clearInterval(timer);
    if (data.error) { setOutputState('idle', 'Error: ' + data.error); return; }
    setOutputState('done', data.aiAnalysis);
    if (data.estimatedBodyFat) {
      document.getElementById('analysisOutput').textContent += `\n\nEstimated Body Fat: ~${data.estimatedBodyFat}%`;
    }
    selectedPhoto = null;
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('uploadPrompt').style.display = 'block';
    document.getElementById('photoInput').value = '';
    btn.style.display = 'none';
    loadHistory();
  } catch (err) {
    clearInterval(timer);
    setOutputState('idle', 'Error: ' + err.message);
  } finally {
    btn.textContent = 'Analyse & Save Photo';
    btn.disabled = false;
  }
}

let historyPage = 1;
const HISTORY_LIMIT = 10;

async function loadHistory(page = 1) {
  historyPage = page;
  const res = await fetch(`/api/analyses?page=${page}&limit=${HISTORY_LIMIT}`);
  const { analyses, total, pages } = await res.json();
  const container = document.getElementById('historyTable');

  if (!analyses || analyses.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.9rem">No analyses yet.</p>';
    return;
  }

  container.innerHTML = `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:0.875rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border);text-align:left">
          <th style="padding:0.6rem 0.75rem;color:var(--muted);font-weight:600;white-space:nowrap">Date</th>
          <th style="padding:0.6rem 0.75rem;color:var(--muted);font-weight:600">Type</th>
          <th style="padding:0.6rem 0.75rem;color:var(--muted);font-weight:600">Input</th>
          <th style="padding:0.6rem 0.75rem;color:var(--muted);font-weight:600">Summary</th>
        </tr>
      </thead>
      <tbody>
        ${analyses.map((a, i) => `
          <tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="toggleRow(${i})">
            <td style="padding:0.65rem 0.75rem;white-space:nowrap;color:var(--muted)">${new Date(a.date).toLocaleDateString()}</td>
            <td style="padding:0.65rem 0.75rem">
              <span style="font-size:0.75rem;padding:0.2rem 0.6rem;border-radius:20px;background:${a.type === 'photo' ? '#e8f5f0' : '#e8f0fa'};color:${a.type === 'photo' ? 'var(--accent)' : '#1a7fd4'}">${a.type === 'photo' ? 'Photo' : 'Text'}</span>
            </td>
            <td style="padding:0.65rem 0.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(a.inputText || '').slice(0, 80)}</td>
            <td style="padding:0.65rem 0.75rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(a.summary || a.aiResponse || '').slice(0, 120)}</td>
          </tr>
          <tr id="row-detail-${i}" style="display:none;background:#f7faf9">
            <td colspan="4" style="padding:1rem 0.75rem">
              <pre style="white-space:pre-wrap;font-family:inherit;font-size:0.85rem;line-height:1.6;margin:0">${a.aiResponse || ''}</pre>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
    ${pages > 1 ? `
    <div class="pagination">
      <button class="page-btn" onclick="loadHistory(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
      <span class="page-info">Page ${page} of ${pages} <span style="color:var(--muted);font-size:0.8rem">(${total} total)</span></span>
      <button class="page-btn" onclick="loadHistory(${page + 1})" ${page >= pages ? 'disabled' : ''}>Next →</button>
    </div>` : `<p style="color:var(--muted);font-size:0.8rem;margin-top:0.75rem;text-align:right">${total} record${total !== 1 ? 's' : ''}</p>`}
  `;
}

function toggleRow(i) {
  const el = document.getElementById(`row-detail-${i}`);
  el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}

const uploadZone = document.getElementById('uploadZone');
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) {
    document.getElementById('photoInput').files = e.dataTransfer.files;
    handlePhotoSelect({ target: { files: [file] } });
  }
});

async function loadLifestyle() {
  try {
    const res = await fetch('/api/lifestyle');
    const data = await res.json();
    if (data && data.content) {
      document.getElementById('lifestyleText').value = data.content;
      document.getElementById('lifestyleStatus').textContent = `Last updated ${new Date(data.date).toLocaleDateString()}`;
    }
  } catch {}
}

async function saveLifestyle() {
  const content = document.getElementById('lifestyleText').value.trim();
  if (!content) { alert('Please write something about your lifestyle first.'); return; }

  const btn = document.getElementById('lifestyleBtnText');
  const spinner = document.getElementById('lifestyleSpinner');
  btn.textContent = 'Saving…';
  spinner.style.display = 'inline-block';

  try {
    await fetch('/api/lifestyle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    document.getElementById('lifestyleStatus').textContent = `Saved ${new Date().toLocaleDateString()}`;
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Save Lifestyle'; }, 2000);
  } catch {
    btn.textContent = 'Save failed — try again';
  } finally {
    spinner.style.display = 'none';
  }
}

loadHistory();
loadLifestyle();
