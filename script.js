// ── Supabase 設定 ──────────────────────────────────────
const SUPABASE_URL = 'https://xrtimzcjhyclumukvitc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_atLAC1CS4lakIDJS0rLW6Q_9oHieIzZ';
const HEADERS = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };

async function dbGet(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${id}&select=*`, { headers: HEADERS });
  const data = await res.json();
  return data[0] || null;
}
async function dbList() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/quizzes?select=id,title,created_at,questions&order=created_at.desc`, { headers: HEADERS });
  return await res.json();
}
async function dbSave(quiz) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/quizzes`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: quiz.id, title: quiz.title, description: quiz.description, questions: quiz.questions })
  });
  return res.ok;
}
async function dbDelete(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${id}`, { method: 'DELETE', headers: HEADERS });
}

// ── STATE ──────────────────────────────────────────────
let currentQuiz = null;
let sharedId = null;
let playerAnswers = {};
let playerSubmitted = false;

// ── UTILS ──────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 10); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(ts) { return new Date(ts).toLocaleDateString('ja-JP', { year:'numeric', month:'short', day:'numeric' }); }

function showLoading(msg = '処理中...') {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.className = 'loading-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="spinner"></div>${msg}`;
  el.style.display = 'flex';
}
function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── NAV ────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  const nav = document.getElementById('nav-actions');
  if (name === 'list') {
    nav.innerHTML = '<button class="btn btn-primary btn-sm" onclick="startNew()">＋ 新規作成</button>';
    renderList();
  } else {
    nav.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="showPage(\'list\')">← 一覧へ</button>';
  }
  window.scrollTo(0, 0);
}

// ── LIST ───────────────────────────────────────────────
async function renderList() {
  const container = document.getElementById('quiz-list-container');
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)"><div class="spinner" style="margin:0 auto 12px"></div>読み込み中...</div>';
  const quizzes = await dbList();
  if (!quizzes || quizzes.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><p>まだクイズがありません。<br>「新規作成」ボタンで作ってみよう！</p></div>`;
    return;
  }
  container.innerHTML = quizzes.map(q => `
    <div class="quiz-item" onclick="playQuiz('${q.id}')">
      <div>
        <div class="quiz-item-title">${esc(q.title || '（タイトルなし）')}</div>
        <div class="quiz-item-meta">${q.questions.length}問 ・ ${fmtDate(q.created_at)}</div>
      </div>
      <div class="quiz-item-actions" onclick="event.stopPropagation()">
        <button class="btn btn-primary btn-sm" onclick="playQuiz('${q.id}')">挑戦する</button>
        <button class="btn btn-ghost btn-sm" onclick="editQuiz('${q.id}')">編集</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDelete('${q.id}')">削除</button>
      </div>
    </div>`).join('');
}

async function confirmDelete(id) {
  if (!confirm('このクイズを削除しますか？')) return;
  showLoading('削除中...');
  await dbDelete(id);
  hideLoading();
  showToast('削除しました');
  renderList();
}

// ── EDITOR ─────────────────────────────────────────────
function startNew() {
  currentQuiz = { id: genId(), title: '', description: '', questions: [makeQuestion()] };
  renderEditor();
  showPage('editor');
}

async function editQuiz(id) {
  showLoading('読み込み中...');
  const quiz = await dbGet(id);
  hideLoading();
  if (!quiz) { showToast('クイズが見つかりません'); return; }
  currentQuiz = { id: quiz.id, title: quiz.title, description: quiz.description || '', questions: quiz.questions };
  renderEditor();
  showPage('editor');
}

function makeQuestion() { return { id: genId(), question: '', choices: [makeChoice(), makeChoice(), makeChoice(), makeChoice()], correctIndex: 0 }; }
function makeChoice() { return { id: genId(), text: '' }; }

function renderEditor() {
  document.getElementById('quiz-title').value = currentQuiz.title;
  document.getElementById('quiz-desc').value = currentQuiz.description;
  renderQuestions();
}

function renderQuestions() {
  document.getElementById('questions-container').innerHTML =
    currentQuiz.questions.map((q, qi) => renderQuestionCard(q, qi)).join('');
}

function renderQuestionCard(q, qi) {
  const choices = q.choices.map((ch, ci) => `
    <div class="choice-row">
      <button class="correct-btn ${q.correctIndex === ci ? 'selected' : ''}" onclick="setCorrect(${qi},${ci})">
        ${q.correctIndex === ci ? '✓' : ''}
      </button>
      <div class="choice-input-wrap">
        <input type="text" value="${esc(ch.text)}" placeholder="選択肢 ${ci+1}" oninput="updateChoice(${qi},${ci},this.value)">
      </div>
      ${q.choices.length > 2 ? `<button class="choice-remove" onclick="removeChoice(${qi},${ci})">✕</button>` : ''}
    </div>`).join('');
  return `
    <div class="card">
      <div class="q-card-header">
        <span class="badge">問題 ${qi+1}</span>
        ${currentQuiz.questions.length > 1 ? `<button class="q-remove" onclick="removeQuestion(${qi})">✕</button>` : ''}
      </div>
      <div class="field">
        <label>問題文</label>
        <textarea rows="3" placeholder="問題文を入力してください" oninput="updateQuestion(${qi},this.value)">${esc(q.question)}</textarea>
      </div>
      <div class="field" style="margin-bottom:0">
        <label>選択肢（✓ で正解を設定）</label>
        <div class="choices-list">${choices}</div>
        ${q.choices.length < 6 ? `<button class="add-choice-btn" onclick="addChoice(${qi})">＋ 選択肢を追加</button>` : ''}
      </div>
    </div>`;
}

function updateQuestion(qi, val) { currentQuiz.questions[qi].question = val; }
function updateChoice(qi, ci, val) { currentQuiz.questions[qi].choices[ci].text = val; }
function setCorrect(qi, ci) { currentQuiz.questions[qi].correctIndex = ci; renderQuestions(); }
function addChoice(qi) { if (currentQuiz.questions[qi].choices.length < 6) { currentQuiz.questions[qi].choices.push(makeChoice()); renderQuestions(); } }
function removeChoice(qi, ci) {
  const q = currentQuiz.questions[qi];
  if (q.choices.length <= 2) return;
  q.choices.splice(ci, 1);
  if (q.correctIndex >= q.choices.length) q.correctIndex = q.choices.length - 1;
  renderQuestions();
}
function addQuestion() {
  currentQuiz.questions.push(makeQuestion());
  renderQuestions();
  setTimeout(() => { const cards = document.querySelectorAll('#questions-container .card'); cards[cards.length-1]?.scrollIntoView({ behavior:'smooth', block:'start' }); }, 50);
}
function removeQuestion(qi) {
  if (currentQuiz.questions.length <= 1) return;
  currentQuiz.questions.splice(qi, 1);
  renderQuestions();
}

async function saveQuiz() {
  currentQuiz.title = document.getElementById('quiz-title').value.trim();
  currentQuiz.description = document.getElementById('quiz-desc').value.trim();
  if (!currentQuiz.title) { alert('クイズタイトルを入力してください'); return; }
  for (let i = 0; i < currentQuiz.questions.length; i++) {
    if (!currentQuiz.questions[i].question.trim()) { alert(`問題 ${i+1} の問題文を入力してください`); return; }
    if (currentQuiz.questions[i].choices.some(c => !c.text.trim())) { alert(`問題 ${i+1} のすべての選択肢を入力してください`); return; }
  }
  showLoading('保存中...');
  const ok = await dbSave(currentQuiz);
  hideLoading();
  if (!ok) { alert('保存に失敗しました。もう一度お試しください。'); return; }
  sharedId = currentQuiz.id;
  document.getElementById('share-id-text').textContent = sharedId;
  showPage('share');
  showToast('保存しました！');
}

// ── PLAYER ─────────────────────────────────────────────
async function playQuiz(id) {
  showLoading('読み込み中...');
  const quiz = await dbGet(id);
  hideLoading();
  if (!quiz) { showToast('クイズが見つかりません'); return; }
  currentQuiz = { id: quiz.id, title: quiz.title, description: quiz.description || '', questions: quiz.questions };
  playerAnswers = {};
  playerSubmitted = false;
  renderPlayer();
  showPage('player');
}

function playCurrentShared() { playQuiz(sharedId); }

function renderPlayer() {
  document.getElementById('player-title').textContent = currentQuiz.title;
  document.getElementById('player-desc').textContent = currentQuiz.description;
  document.getElementById('player-q-count').textContent = currentQuiz.questions.length + '問';
  document.getElementById('score-banner').style.display = 'none';
  document.getElementById('submit-area').style.display = 'block';
  renderPlayerQuestions();
}

function renderPlayerQuestions() {
  const LABELS = ['A','B','C','D','E','F'];
  document.getElementById('player-questions').innerHTML = currentQuiz.questions.map((q, qi) => {
    const choices = q.choices.map((ch, ci) => {
      let cls = 'choice-option';
      if (playerSubmitted) {
        if (ci === q.correctIndex) cls += ' correct';
        else if (playerAnswers[qi] === ci) cls += ' wrong';
      } else if (playerAnswers[qi] === ci) cls += ' selected';
      return `<button class="${cls}" onclick="selectAnswer(${qi},${ci})" ${playerSubmitted?'disabled':''}>
        <span class="choice-label">${LABELS[ci]}.</span>${esc(ch.text)}</button>`;
    }).join('');
    const result = playerSubmitted
      ? (playerAnswers[qi] === q.correctIndex ? '<span class="q-result-ok">✓ 正解</span>' : '<span class="q-result-ng">✗ 不正解</span>')
      : '';
    return `<div class="card">
      <div class="q-block-header"><span class="badge">Q${qi+1}</span>${result}</div>
      <p class="q-text">${esc(q.question)}</p>
      <div>${choices}</div>
    </div>`;
  }).join('');
}

function selectAnswer(qi, ci) {
  if (playerSubmitted) return;
  playerAnswers[qi] = ci;
  renderPlayerQuestions();
}

function submitQuiz() {
  if (Object.keys(playerAnswers).length < currentQuiz.questions.length) { alert('すべての問題に答えてから採点してください'); return; }
  playerSubmitted = true;
  const score = currentQuiz.questions.filter((q, i) => playerAnswers[i] === q.correctIndex).length;
  const total = currentQuiz.questions.length;
  const perfect = score === total;
  const banner = document.getElementById('score-banner');
  banner.className = 'score-banner ' + (perfect ? 'perfect' : 'imperfect');
  banner.style.display = 'block';
  banner.innerHTML = `
    <div class="score-number">${score} / ${total} 正解</div>
    <div class="score-label">${perfect ? '全問正解！素晴らしい 🎉' : 'もう一度チャレンジしてみよう'}</div>
    <div class="score-actions">
      <button class="btn btn-ghost" onclick="retryQuiz()">もう一度</button>
      <button class="btn btn-ghost" onclick="editQuiz('${currentQuiz.id}')">編集する</button>
    </div>`;
  document.getElementById('submit-area').style.display = 'none';
  renderPlayerQuestions();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function retryQuiz() { playerAnswers = {}; playerSubmitted = false; renderPlayer(); }

// ── SHARE ──────────────────────────────────────────────
function copyShareId() {
  navigator.clipboard.writeText(sharedId || '').then(() => showToast('IDをコピーしました！'));
}

// ── LOAD BY ID ─────────────────────────────────────────
async function loadById() {
  const input = document.getElementById('load-id-input');
  const errEl = document.getElementById('load-error');
  const id = input.value.trim();
  if (!id) return;
  errEl.textContent = '';
  showLoading('読み込み中...');
  const quiz = await dbGet(id);
  hideLoading();
  if (quiz) { input.value = ''; playQuiz(id); }
  else { errEl.textContent = 'クイズが見つかりませんでした。IDを確認してください。'; }
}

// ── INIT ───────────────────────────────────────────────
renderList();