let selectedPhoto = null;

async function runAnalysis() {
  const inputText = document.getElementById('inputText').value.trim();
  if (!inputText) { alert('Please enter some health information to analyse.'); return; }

  const output = document.getElementById('analysisOutput');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');

  output.textContent = '';
  output.classList.remove('loading');
  btnText.textContent = 'Analysing...';
  btnSpinner.style.display = 'inline-block';

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
        if (data.chunk) output.textContent += data.chunk;
        if (data.done) break;
        if (data.error) { output.textContent += `\n\nError: ${data.error}`; break; }
      }
    }
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  } finally {
    btnText.textContent = 'Analyse with AI';
    btnSpinner.style.display = 'none';
  }
}

async function saveBloodTest() {
  const rawText = document.getElementById('inputText').value.trim();
  const date = document.getElementById('bloodDate').value;
  if (!rawText) { alert('Paste blood test results first.'); return; }

  const btn = document.getElementById('saveBloodBtn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/blood-tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, date }),
    });
    const data = await res.json();

    if (data.markers && data.markers.length > 0) {
      document.getElementById('bloodMarkersCard').style.display = 'block';
      renderMarkers(data.markers);
    }
    btn.textContent = 'Saved!';
  } catch (err) {
    alert('Failed to save blood test: ' + err.message);
    btn.textContent = 'Save Blood Test';
  } finally {
    btn.disabled = false;
  }
}

function renderMarkers(markers) {
  const container = document.getElementById('markersTable');
  container.innerHTML = markers.map(m => `
    <div class="marker-row">
      <span>${m.name}</span>
      <span>${m.value} <span style="color:var(--muted);font-size:0.8rem">${m.unit}</span></span>
    </div>
  `).join('');
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
  output.classList.remove('loading');
  output.textContent = 'Analysing body photo with AI vision model...';

  const formData = new FormData();
  formData.append('photo', selectedPhoto);
  const weight = document.getElementById('photoWeight').value;
  if (weight) formData.append('weight', weight);

  try {
    const res = await fetch('/api/photos', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) { output.textContent = 'Error: ' + data.error; return; }
    output.textContent = data.aiAnalysis;
    if (data.estimatedBodyFat) {
      output.textContent += `\n\nEstimated Body Fat: ~${data.estimatedBodyFat}%`;
    }
  } catch (err) {
    output.textContent = 'Error: ' + err.message;
  } finally {
    btn.textContent = 'Analyse Photo';
    btn.disabled = false;
  }
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
