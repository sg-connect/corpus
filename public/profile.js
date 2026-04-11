let medications = [];
let conditions = [];

function addTag(type) {
  const input = document.getElementById(type === 'med' ? 'medInput' : 'condInput');
  const val = input.value.trim();
  if (!val) return;
  if (type === 'med') { medications.push(val); renderTags('medicationTags', medications, 'med'); }
  else { conditions.push(val); renderTags('conditionTags', conditions, 'cond'); }
  input.value = '';
}

function removeTag(type, index) {
  if (type === 'med') { medications.splice(index, 1); renderTags('medicationTags', medications, 'med'); }
  else { conditions.splice(index, 1); renderTags('conditionTags', conditions, 'cond'); }
}

function renderTags(containerId, items, type) {
  document.getElementById(containerId).innerHTML = items.map((item, i) => `
    <span class="tag">${item}<button onclick="removeTag('${type}', ${i})">×</button></span>
  `).join('');
}

async function loadProfile() {
  const res = await fetch('/api/profile');
  const profile = await res.json();
  if (!profile) return;

  document.getElementById('name').value = profile.name || '';
  document.getElementById('age').value = profile.age || '';
  document.getElementById('height').value = profile.height || '';
  document.getElementById('weight').value = profile.weight || '';
  document.getElementById('gender').value = profile.gender || 'male';
  document.getElementById('bloodType').value = profile.bloodType || '';

  medications = profile.medications || [];
  conditions = profile.conditions || [];
  renderTags('medicationTags', medications, 'med');
  renderTags('conditionTags', conditions, 'cond');
}

async function saveProfile(e) {
  e.preventDefault();
  const btn = document.getElementById('saveBtn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const profile = {
    name: document.getElementById('name').value,
    age: parseInt(document.getElementById('age').value),
    height: parseFloat(document.getElementById('height').value),
    weight: parseFloat(document.getElementById('weight').value),
    gender: document.getElementById('gender').value,
    bloodType: document.getElementById('bloodType').value,
    medications,
    conditions,
  };

  await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });

  btn.textContent = 'Save Profile';
  btn.disabled = false;
  const msg = document.getElementById('saveMsg');
  msg.style.display = 'inline';
  setTimeout(() => msg.style.display = 'none', 2000);
}

loadProfile();
