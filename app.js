'use strict';
/* Icyongereza: a self-contained daily English course for a Kinyarwanda speaker.
   No server, no accounts. Progress lives in localStorage on the phone. */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'disabled' || k === 'hidden') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const two = (rw, en) => [rw, ' ', h('small', {}, en)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pad = n => String(n).padStart(2, '0');
const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => dstr(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return dstr(d); };
const norm = s => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
const clean = s => s.replace(/\s*\/\s*/g, ', ').replace(/\.\.\./g, ' ');
const isFrame = s => /\.\.\.|\//.test(s);

// ---------- state ----------
const LS = 'icyongereza-v1';
const blank = () => ({ blocks: {}, done: {}, cards: {}, mistakes: {}, tests: {}, minutes: {}, dates: {}, gates: {}, cur: null, settings: { voice: '', rate: 1 } });
let S = blank();
try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(LS)) || {}); } catch (e) {}
const save = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} };

// ---------- course data ----------
const BLOCKS = [
  { k: 'review', rw: 'Gusubiramo', en: 'Review cards', min: 10, ic: '🔁' },
  { k: 'sound', rw: 'Amajwi', en: 'Sound lab', min: 15, ic: '👂' },
  { k: 'lesson', rw: 'Isomo rishya', en: 'New lesson', min: 20, ic: '📖' },
  { k: 'listen', rw: 'Kumva', en: 'Listening', min: 20, ic: '🎧' },
  { k: 'speak', rw: 'Kuvuga', en: 'Speaking', min: 15, ic: '🗣️' },
  { k: 'write', rw: 'Kwandika', en: 'Writing', min: 10, ic: '✍️' }
];
const STEPS = [1, 3, 7, 21]; // spaced review, in days
let WEEKS = [], DAYS = [], SOUNDS = {}, ITEMS = {};

async function loadCourse() {
  const get = u => fetch(u).then(r => r.json());
  const idx = await get('lessons/index.json');
  SOUNDS = await get('lessons/sounds.json');
  WEEKS = await Promise.all(idx.weeks.map(n => get('lessons/week-' + pad(n) + '.json')));
  for (const w of WEEKS) {
    for (const d of w.days) { DAYS.push(d); for (const it of d.items) ITEMS[it.id] = it; }
    DAYS.push({ id: 'w' + pad(w.week) + 'd7', week: w.week, day: 7, test: true, gate: w.gate, title: { en: 'Weekly test', rw: "Ikizamini cy'icyumweru" } });
  }
}
const dayIdx = id => DAYS.findIndex(d => d.id === id);
const unlocked = i => i === 0 || !!S.done[DAYS[i - 1].id];
function curDay() {
  let i = S.cur ? dayIdx(S.cur) : -1;
  if (i < 0 || !unlocked(i)) { i = DAYS.findIndex(d => !S.done[d.id]); if (i < 0) i = DAYS.length - 1; }
  return DAYS[i];
}
const itemsUpTo = day => DAYS.slice(0, dayIdx(day.id) + 1).flatMap(d => d.items || []);
const sentence = it => (it.ex && !isFrame(it.ex.en)) ? it.ex : (!isFrame(it.en) ? { en: it.en, rw: it.rw } : null);

// ---------- audio ----------
const hasTTS = 'speechSynthesis' in window;
let voices = [];
function loadVoices() { if (hasTTS) voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); }
if (hasTTS) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function voice() {
  return voices.find(v => v.name === S.settings.voice) || voices.find(v => /en[-_]US/i.test(v.lang)) || voices[0] || null;
}
let speakTok = 0, lastCancel = 0, curUtt = null;
function stopAudio() { speakTok++; if (hasTTS) { speechSynthesis.cancel(); lastCancel = Date.now(); } }
function speak(text, rate) {
  return new Promise(res => {
    if (!hasTTS) return res();
    const tok = ++speakTok;
    // Chrome drops an utterance that is queued straight after cancel(), so cancel first and start a moment later.
    if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); lastCancel = Date.now(); }
    const wait = Math.max(0, 120 - (Date.now() - lastCancel));
    setTimeout(() => {
      if (tok !== speakTok) return res();
      if (!voices.length) loadVoices();
      const u = curUtt = new SpeechSynthesisUtterance(clean(text)); // keep a reference so it is not garbage-collected mid-speech
      const v = voice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = rate || S.settings.rate || 1;
      let fin = false;
      const end = () => { if (!fin) { fin = true; res(); } };
      u.onend = end;
      u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') ttsProblem(e.error); end(); };
      setTimeout(end, 2000 + text.length * 130 / u.rate);
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    }, wait);
  });
}
let ttsWarned = false;
function ttsProblem(why) {
  if (ttsWarned) return; ttsWarned = true; // once per visit, and it goes away by itself
  setTimeout(() => { const w = $('#ttswarn'); if (w) w.remove(); }, 9000);
  document.body.append(h('div', { id: 'ttswarn', class: 'note', onclick: e => e.currentTarget.remove() },
    'Ijwi ntirikunze kuri iyi telefoni. Reba ko ijwi rya telefoni rifunguye, hanyuma ujye kuri Aho ugeze → Ijwi uhitemo irindi jwi.',
    h('br'), h('small', {}, 'The voice did not play (' + why + '). Check the volume, then pick another voice under Progress → Voice.')));
}
const playBtns = text => h('div', { class: 'row' },
  h('button', { class: 'btn sec', onclick: () => speak(text) }, '🔊 Umva'),
  h('button', { class: 'btn sec', onclick: () => speak(text, 0.6) }, '🐢 Buhoro'));

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen() {
  return new Promise(res => {
    let got = false, r;
    try { r = new SR(); } catch (e) { return res(null); }
    r.lang = 'en-US'; r.maxAlternatives = 3;
    r.onresult = e => { got = true; res(Array.from(e.results[0]).map(a => a.transcript)); };
    r.onerror = () => { if (!got) res(null); };
    r.onend = () => { if (!got) res(null); };
    try { r.start(); } catch (e) { res(null); }
  });
}
function sim(target, said) {
  const t = norm(clean(target)).split(' '), s = norm(said).split(' ');
  return t.filter(w => s.includes(w)).length / t.length;
}
// "Say it" button: checks her speech where the browser supports it.
function sayWidget(target) {
  if (!SR) return null;
  const out = h('div', { class: 'fb' });
  const b = h('button', { class: 'btn mic', onclick: async () => {
    stopAudio(); b.disabled = true; b.textContent = '🎤 Vuga ubu…';
    const alts = await listen();
    b.disabled = false; b.textContent = '🎤 Vuga';
    if (!alts) { out.className = 'fb bad'; out.textContent = 'Sinakumvise. Ongera ugerageze.'; return; }
    const ok = Math.max(...alts.map(a => sim(target, a))) >= 0.6;
    out.className = 'fb ' + (ok ? 'good' : 'bad');
    out.textContent = 'Wavuze: “' + alts[0] + '” ' + (ok ? '✓ Ni byo!' : '— ongera ugerageze');
  } }, '🎤 Vuga');
  return h('div', {}, b, out);
}
// Record and replay her own voice. Nothing leaves the phone.
function recWidget() {
  if (!navigator.mediaDevices || !window.MediaRecorder) return null;
  let mr, chunks, url;
  const play = h('button', { class: 'btn sec', disabled: true, onclick: () => new Audio(url).play() }, '▶ Iyumve');
  const b = h('button', { class: 'btn sec', onclick: async () => {
    if (mr && mr.state === 'recording') { mr.stop(); return; }
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = []; mr = new MediaRecorder(st);
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => {
        st.getTracks().forEach(t => t.stop());
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType }));
        play.disabled = false; b.textContent = '⏺ Ifate amajwi';
      };
      mr.start(); b.textContent = '⏹ Hagarika';
    } catch (e) { b.textContent = '🎤 Ntibikunze'; }
  } }, '⏺ Ifate amajwi');
  return h('div', { class: 'row' }, b, play);
}

// ---------- progress bookkeeping ----------
function addTime(t0) {
  const m = Math.min(30, (Date.now() - t0) / 60000);
  S.minutes[today()] = (S.minutes[today()] || 0) + m; save();
}
function mistake(en, rw) {
  const m = S.mistakes[en] || (S.mistakes[en] = { rw: rw || '', n: 0 });
  m.n++; m.last = today(); save();
}
function streak() {
  let d = today(), n = 0;
  if (!S.dates[d]) d = addDays(d, -1);
  while (S.dates[d]) { n++; d = addDays(d, -1); }
  return n;
}
function blockDone(day, k) {
  (S.blocks[day.id] || (S.blocks[day.id] = {}))[k] = true;
  S.dates[today()] = true;
  if (BLOCKS.every(b => S.blocks[day.id][b.k])) S.done[day.id] = today();
  save();
}

// ---------- step runner ----------
const app = () => $('#app');
function run(steps, onDone) {
  let i = 0; const t0 = Date.now();
  const fill = h('i'), body = h('div');
  $('#nav').hidden = true;
  app().replaceChildren(h('div', { class: 'runtop' },
    h('button', { class: 'x', 'aria-label': 'Funga', onclick: () => { stopAudio(); addTime(t0); go('home'); } }, '✕'),
    h('div', { class: 'bar' }, fill)), body);
  const next = () => {
    stopAudio();
    fill.style.width = (i / steps.length * 100) + '%';
    if (i >= steps.length) { addTime(t0); onDone(); return; }
    body.replaceChildren(); window.scrollTo(0, 0);
    steps[i++](body, next);
  };
  next();
}
const nextBtn = (next, label) => h('button', { class: 'btn next', onclick: next }, label || 'Komeza →');
const Q = (rw, en) => h('p', { class: 'q' }, rw, h('small', {}, en));

// ---------- steps ----------
const stInfo = (...nodes) => (el, next) => el.append(...nodes, nextBtn(next));

const stCard = it => (el, next) => {
  el.append(h('div', { class: 'card' },
    h('div', { class: 'en' }, it.en), h('div', { class: 'say' }, it.say), h('div', { class: 'rw' }, it.rw),
    it.ex && h('div', { class: 'ex' }, h('div', {}, it.ex.en), h('div', { class: 'exrw' }, it.ex.rw),
      h('button', { class: 'btn sec', onclick: () => speak(it.ex.en) }, '🔊 Interuro'))),
    playBtns(it.en), sayWidget(it.en), nextBtn(next));
  speak(it.en);
};

const stRepeat = r => (el, next) => {
  el.append(Q('Umva, hanyuma usubiremo', 'Listen, then repeat'),
    h('div', { class: 'card' }, h('div', { class: 'en' }, r[0]), h('div', { class: 'say' }, r[1]),
      r[2] && h('div', { class: 'wrong' }, r[2])),
    playBtns(r[0]), recWidget(), sayWidget(r[0]), nextBtn(next));
  speak(r[0], 0.8);
};

const stPair = (p, tally) => (el, next) => {
  const ans = Math.random() < 0.5 ? p.a : p.b; let done = false;
  const fb = h('div', { class: 'fb' });
  const mk = w => h('button', { class: 'opt big', 'data-ok': w === ans ? 1 : null, onclick: e => {
    if (done) return; done = true;
    const ok = w === ans; if (tally) { tally.n++; if (ok) tally.ok++; }
    e.currentTarget.classList.add(ok ? 'ok' : 'no');
    fb.className = 'fb ' + (ok ? 'good' : 'bad');
    fb.textContent = ok ? 'Ni byo! ✓' : 'Si byo. Ryari: ' + ans;
    el.append(h('div', { class: 'row' },
      h('button', { class: 'btn sec', onclick: () => speak(p.a, 0.8) }, '🔊 ' + p.a),
      h('button', { class: 'btn sec', onclick: () => speak(p.b, 0.8) }, '🔊 ' + p.b)), nextBtn(next));
  } }, w);
  el.append(Q('Wumvise irihe jambo?', 'Which word did you hear?'),
    h('button', { class: 'btn sec', onclick: () => speak(ans, 0.8) }, '🔊 Ongera wumve'), mk(p.a), mk(p.b), fb);
  speak(ans, 0.8);
};

// hear English -> choose the Kinyarwanda meaning (or the reverse when rev is set)
const stChoose = (it, pool, tally, rev) => (el, next) => {
  const key = rev ? 'en' : 'rw'; let done = false;
  const others = shuffle(pool.filter(x => x[key] !== it[key])).slice(0, 3);
  const fb = h('div', { class: 'fb' });
  const opts = shuffle([it, ...others]).map(o => h('button', { class: 'opt', 'data-ok': o === it ? 1 : null, onclick: e => {
    if (done) return; done = true;
    const ok = o === it; if (tally) { tally.n++; if (ok) tally.ok++; }
    e.currentTarget.classList.add(ok ? 'ok' : 'no');
    if (!ok) { mistake(it.en, it.rw); opts.find(b => b.dataset.ok).classList.add('ok'); }
    fb.className = 'fb ' + (ok ? 'good' : 'bad');
    fb.textContent = (ok ? 'Ni byo! ✓ ' : 'Si byo. ') + it.en + ' = ' + it.rw;
    if (rev) speak(it.en);
    el.append(nextBtn(next));
  } }, o[key]));
  if (rev) el.append(Q('Hitamo Icyongereza', 'Choose the English'), h('div', { class: 'card' }, h('div', { class: 'rw' }, it.rw)));
  else { el.append(Q('Umva, hanyuma uhitemo igisobanuro', 'Listen and choose the meaning'), playBtns(it.en)); speak(it.en); }
  el.append(...opts, fb);
};

// hear a sentence -> put the word tiles in order
const stBuild = (s, tally) => (el, next) => {
  const words = s.en.split(' '); let done = false;
  window._ans = words;
  const slot = h('div', { class: 'slot' }), bank = h('div', { class: 'tiles' }), fb = h('div', { class: 'fb' });
  const check = h('button', { class: 'btn', onclick: () => {
    if (done) return; done = true;
    const got = Array.from(slot.children).map(b => b.textContent).join(' ');
    const ok = norm(got) === norm(s.en); if (tally) { tally.n++; if (ok) tally.ok++; }
    if (!ok) mistake(s.en, s.rw);
    fb.className = 'fb ' + (ok ? 'good' : 'bad');
    fb.textContent = (ok ? 'Ni byo! ✓ ' : 'Si byo. ') + s.en;
    speak(s.en); check.replaceWith(nextBtn(next));
  } }, 'Reba ✓');
  shuffle(words).forEach(w => {
    const b = h('button', { class: 'tile', onclick: () => { if (!done) (b.parentNode === bank ? slot : bank).append(b); } }, w);
    bank.append(b);
  });
  el.append(Q('Tondeka amagambo wumvise', 'Put the words in order'), playBtns(s.en),
    h('p', { class: 'en2' }, s.rw), slot, bank, fb, check);
  speak(s.en);
};

const stShadow = s => (el, next) => {
  el.append(Q('Umva, hanyuma usubiremo mu ijwi riranguruye', 'Listen, then repeat out loud'),
    h('div', { class: 'card' }, h('div', { class: 'en' }, s.en), h('div', { class: 'rw' }, s.rw)),
    playBtns(s.en), sayWidget(s.en), recWidget(), nextBtn(next));
  speak(s.en);
};

// role-play: the app speaks the other person; she answers as Benia
const stRole = (line, me) => (el, next) => {
  if (!me) {
    el.append(Q(line.who + ' aravuga', line.who + ' is speaking'),
      h('div', { class: 'card' }, h('div', { class: 'en' }, line.en), h('div', { class: 'rw' }, line.rw)),
      playBtns(line.en), nextBtn(next));
    speak(line.en); return;
  }
  const en = h('div', { class: 'en', hidden: true }, line.en);
  el.append(Q('Ni wowe. Bivuge mu Cyongereza:', 'Your turn. Say it in English:'),
    h('div', { class: 'card' }, h('div', { class: 'rw' }, line.rw), en),
    h('button', { class: 'btn sec', onclick: () => { en.hidden = false; speak(line.en); } }, '👁 Erekana'),
    sayWidget(line.en), recWidget(), nextBtn(next));
};

const stType = (it, tally) => (el, next) => {
  let tries = 0; window._ans = it.en;
  const inp = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false' });
  const fb = h('div', { class: 'fb' });
  const check = h('button', { class: 'btn', onclick: () => {
    const ok = norm(inp.value) === norm(it.en); tries++;
    if (tries === 1 && tally) { tally.n++; if (ok) tally.ok++; }
    if (ok) { fb.className = 'fb good'; fb.textContent = 'Ni byo! ✓'; speak(it.en); check.replaceWith(nextBtn(next)); return; }
    if (tries === 1) mistake(it.en, it.rw);
    fb.className = 'fb bad';
    fb.textContent = 'Igisubizo: ' + it.en + (tries < 2 ? ' — Ongera ucyandike neza.' : '');
    if (tries >= 2) check.replaceWith(nextBtn(next)); else { inp.value = ''; inp.focus(); }
  } }, 'Reba ✓');
  el.append(Q('Andika mu Cyongereza', 'Write it in English'),
    h('div', { class: 'card' }, h('div', { class: 'rw' }, it.rw)), h('p', {}), inp, fb, check);
};

const stReview = it => (el, next) => {
  const ans = h('div', { hidden: true }, h('div', { class: 'en' }, it.en), h('div', { class: 'say' }, it.say));
  const grade = ok => () => {
    const c = S.cards[it.id] || (S.cards[it.id] = { s: 0 });
    if (ok) { c.s++; c.due = c.s < STEPS.length ? addDays(today(), STEPS[c.s]) : null; }
    else { c.s = 0; c.due = addDays(today(), 1); mistake(it.en, it.rw); }
    save(); next();
  };
  const btns = h('div', { class: 'row', hidden: true },
    h('button', { class: 'btn warn', onclick: grade(false) }, 'Sinari mbizi ✗'),
    h('button', { class: 'btn', onclick: grade(true) }, 'Nari mbizi ✓'));
  const show = h('button', { class: 'btn sec', onclick: () => { ans.hidden = false; btns.hidden = false; show.hidden = true; speak(it.en); } }, '👁 Erekana');
  el.append(Q('Bivuge mu Cyongereza, hanyuma urebe', 'Say it in English, then check'),
    h('div', { class: 'card' }, h('div', { class: 'rw' }, it.rw), ans), show, btns);
};

// ---------- blocks ----------
function finish(day, k) {
  blockDone(day, k);
  const all = !!S.done[day.id];
  $('#nav').hidden = false;
  app().replaceChildren(h('div', { class: 'bigemoji' }, all ? '🎉' : '✅'),
    h('h1', { class: 'center' }, all ? "Urangije isomo ry'uyu munsi!" : 'Wakoze neza!'),
    h('p', { class: 'center en2' }, all ? 'You finished today\'s lesson!' : 'Well done!'),
    h('button', { class: 'btn', onclick: () => go('home') }, 'Komeza →'));
}
function startBlock(day, k) {
  const done = () => finish(day, k);
  if (k === 'review') {
    const due = shuffle(Object.keys(S.cards).filter(id => ITEMS[id] && S.cards[id].due && S.cards[id].due <= today())).slice(0, 30);
    if (!due.length) return run([stInfo(h('div', { class: 'note' }, 'Nta makarita yo gusubiramo uyu munsi. Amagambo wize azagaruka ejo.',
      h('br'), h('small', {}, 'No review cards today. The words you learn come back tomorrow.')))], done);
    return run(due.map(id => stReview(ITEMS[id])), done);
  }
  if (k === 'sound') {
    const u = SOUNDS[day.sound], tally = { n: 0, ok: 0 };
    const rounds = day.pairs.concat(shuffle(day.pairs));
    return run([
      stInfo(h('h1', {}, u.title.rw), h('p', { class: 'en2' }, u.title.en), h('div', { class: 'box' }, u.explain_rw),
        h('div', { class: 'note' }, '👄 ' + u.mouth_rw)),
      ...u.repeat.map(stRepeat), ...rounds.map(p => stPair(p, tally)),
      stInfo(h('div', { class: 'bigemoji' }, '👂'), h('p', { class: 'center q' }, 'Amanota: ', h('span', { id: 'sc' })))
    ].map((s, i, a) => i < a.length - 1 ? s : (el, next) => { s(el, next); $('#sc', el).textContent = tally.ok + ' / ' + tally.n; }), done);
  }
  if (k === 'lesson') {
    const steps = day.items.map(stCard);
    if (day.grammar_rw) steps.unshift(stInfo(h('h2', {}, ...two('Icyo kumenya', 'Good to know')), h('div', { class: 'note' }, day.grammar_rw)));
    steps.push((el, next) => {
      let playing = false;
      el.append(h('h2', {}, ...two('Ikiganiro', 'Dialogue')),
        h('button', { class: 'btn sec', onclick: async () => { if (playing) return; playing = true; for (const l of day.dialogue) { if (!el.isConnected) break; await speak(l.en); } playing = false; } }, '▶ Umva ikiganiro cyose'),
        ...day.dialogue.map(l => h('button', { class: 'line' + (l.who === 'Benia' ? ' me' : ''), onclick: () => speak(l.en) }, h('b', {}, l.who), l.en, h('span', {}, l.rw))),
        nextBtn(next));
    });
    return run(steps, () => {
      for (const it of day.items) if (!S.cards[it.id]) S.cards[it.id] = { s: 0, due: addDays(today(), STEPS[0]) };
      save(); done();
    });
  }
  const pool = itemsUpTo(day), sents = shuffle(day.items.map(sentence).filter(s => s && s.en.split(' ').length >= 3));
  if (k === 'listen') {
    return run([...shuffle(day.items).slice(0, 8).map(it => stChoose(it, pool)),
      ...sents.slice(0, 5).map(s => stBuild(s)),
      ...shuffle(day.items).slice(0, 4).map(it => stChoose(it, pool, null, true))], done);
  }
  if (k === 'speak') {
    return run([...sents.slice(0, 5).map(stShadow),
      stInfo(h('h2', {}, ...two('Ikiganiro: ni wowe Benia', 'Role-play: you are Benia')),
        h('div', { class: 'note' }, 'Telefoni iravuga amagambo y\'undi muntu. Wowe uvuge aya Benia mu ijwi riranguruye.')),
      ...day.dialogue.map(l => stRole(l, l.who === 'Benia'))], done);
  }
  if (k === 'write') {
    const its = shuffle(day.items.filter(it => !isFrame(it.en))).slice(0, 5);
    return run(its.map(it => stType(it)), done);
  }
}

function startTest(day) {
  const w = WEEKS.find(x => x.week === day.week), items = w.days.flatMap(d => d.items), tally = { n: 0, ok: 0 };
  const pick = shuffle(items);
  const sents = shuffle(items.map(sentence).filter(s => s && s.en.split(' ').length >= 3)).slice(0, 5);
  const typed = shuffle(items.filter(it => !isFrame(it.en))).slice(0, 3);
  const steps = shuffle([...pick.slice(0, 7).map(it => stChoose(it, items, tally)),
    ...pick.slice(7, 12).map(it => stChoose(it, items, tally, true)),
    ...sents.map(s => stBuild(s, tally)), ...typed.map(it => stType(it, tally))]);
  run(steps, () => {
    const score = Math.round(tally.ok / tally.n * 100), pass = score >= 80;
    S.tests[day.id] = Math.max(S.tests[day.id] || 0, score); S.dates[today()] = true;
    if (pass && !day.gate) S.done[day.id] = today();
    save(); $('#nav').hidden = false;
    app().replaceChildren(h('div', { class: 'bigemoji' }, pass ? '🏆' : '💪'),
      h('h1', { class: 'center' }, 'Amanota: ' + score + '%'),
      h('p', { class: 'center' }, pass ? 'Watsinze! Wakoze neza cyane.' : 'Ukeneye 80%. Subiramo amasomo y\'iki cyumweru, hanyuma wongere ukore ikizamini.'),
      h('p', { class: 'center en2' }, pass ? 'You passed!' : 'You need 80%. Review this week, then take the test again.'),
      h('button', { class: 'btn', onclick: () => pass && day.gate ? gate(day) : go('home') }, 'Komeza →'));
  });
}
function gate(day) {
  const g = day.gate;
  $('#nav').hidden = false;
  app().replaceChildren(h('h1', {}, '🚪 Irembo'), h('p', { class: 'en2' }, 'Gate: ' + g.en),
    h('div', { class: 'box' }, g.rw), h('div', { class: 'note' }, g.model), playBtns(g.model), recWidget(),
    h('button', { class: 'btn', onclick: () => { S.gates[day.id] = today(); S.done[day.id] = today(); save(); go('home'); } }, 'Narabikoze ✓'),
    h('button', { class: 'btn sec', onclick: () => go('home') }, 'Nzabikora nyuma'));
}

// ---------- views ----------
let VIEW = 'home';
function go(v) {
  VIEW = v; stopAudio(); $('#nav').hidden = false;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  ({ home, days, progress, check })[v](); window.scrollTo(0, 0);
}
function home() {
  const day = curDay(), i = dayIdx(day.id), bl = S.blocks[day.id] || {}, nxt = DAYS[i + 1];
  const kids = [h('div', { class: 'head' }, h('h1', {}, 'Icyongereza'), h('div', { class: 'streak' }, '🔥 ' + streak())),
    !hasTTS && h('div', { class: 'note' }, 'Iyi telefoni ntishobora gusoma amajwi. Koresha Chrome.'),
    h('div', { class: 'box' }, h('small', {}, 'Icyumweru ' + day.week + ' · Umunsi ' + day.day + '  (Week ' + day.week + ', Day ' + day.day + ')'),
      h('div', { class: 'daytitle' }, day.title.rw), h('div', { class: 'en2' }, day.title.en))];
  if (day.test) {
    const sc = S.tests[day.id];
    kids.push(sc != null && h('div', { class: 'box center' }, 'Amanota yawe: ', h('b', {}, sc + '%')),
      h('button', { class: 'btn', onclick: () => startTest(day) }, sc == null ? '▶ Tangira ikizamini' : '↻ Ongera ukore ikizamini'),
      day.gate && sc >= 80 && !S.done[day.id] && h('button', { class: 'btn sec', onclick: () => gate(day) }, '🚪 Irembo'));
  } else {
    for (const b of BLOCKS) kids.push(h('button', { class: 'blk' + (bl[b.k] ? ' done' : ''), 'data-k': b.k, onclick: () => startBlock(day, b.k) },
      h('span', { class: 'ic' }, b.ic), h('span', { class: 't' }, b.rw, h('small', {}, b.en)),
      h('span', { class: 'm' }, bl[b.k] ? '✓' : b.min + ' min')));
  }
  if (S.done[day.id]) kids.push(nxt
    ? h('button', { class: 'btn', id: 'nextday', onclick: () => { S.cur = nxt.id; save(); go('home'); } }, 'Umunsi ukurikira →')
    : h('div', { class: 'note center' }, '🎓 Urangije ukwezi kwa mbere! Amasomo akurikira araza vuba.', h('br'), h('small', {}, 'You finished month one! More lessons are coming.')));
  app().replaceChildren(...kids.filter(Boolean));
}
function days() {
  const cur = curDay().id;
  app().replaceChildren(h('h1', {}, ...two('Amasomo', 'Lessons')), ...WEEKS.flatMap(w => [
    h('h2', {}, 'Icyumweru ' + w.week + ': ' + w.title.rw, h('br'), h('small', {}, w.title.en)),
    h('div', { class: 'week' }, DAYS.filter(d => d.week === w.week).map(d => {
      const open = unlocked(dayIdx(d.id));
      return h('button', { class: 'd' + (S.done[d.id] ? ' done' : '') + (d.id === cur ? ' cur' : '') + (open ? '' : ' lock'), title: d.title.en,
        onclick: () => { if (!open) return alert('Banza urangize umunsi ubanza.'); S.cur = d.id; save(); go('home'); } }, d.test ? '★' : d.day);
    }))]));
}
function progress() {
  const mins = Object.values(S.minutes).reduce((a, b) => a + b, 0), cards = Object.values(S.cards);
  const lessons = DAYS.filter(d => !d.test), mis = Object.entries(S.mistakes).sort((a, b) => b[1].n - a[1].n).slice(0, 15);
  const stat = (v, rw, en) => h('div', { class: 'stat' }, h('b', {}, v), rw, h('br'), h('small', {}, en));
  const vsel = h('select', { onchange: e => { S.settings.voice = e.target.value; save(); speak('Hello, how are you?'); } },
    voices.length ? voices.map(v => h('option', { value: v.name, selected: voice() === v ? '' : null }, v.name + ' (' + v.lang + ')')) : h('option', {}, '—'));
  const rsel = h('select', { onchange: e => { S.settings.rate = +e.target.value; save(); speak('Hello, how are you?'); } },
    [[1, 'Bisanzwe / Normal (1x)'], [0.85, 'Buhoro gato (0.85x)'], [0.7, 'Buhoro / Slow (0.7x)']].map(([v, l]) => h('option', { value: v, selected: S.settings.rate === v ? '' : null }, l)));
  const mi = h('input', { type: 'text', placeholder: 'Ikosa rishya / New mistake' });
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { S = Object.assign(blank(), JSON.parse(t)); save(); go('progress'); }).catch(() => alert('Iyi dosiye ntikunze.'));
  } });
  app().replaceChildren(h('h1', {}, ...two('Aho ugeze', 'Progress')),
    h('div', { class: 'stats' },
      stat('🔥 ' + streak(), 'Iminsi ikurikiranye', 'Day streak'),
      stat(lessons.filter(d => S.done[d.id]).length + ' / ' + lessons.length, 'Amasomo', 'Lessons done'),
      stat(cards.length, 'Amagambo wize', 'Phrases learned'),
      stat(cards.filter(c => c.s >= STEPS.length).length, 'Ayo wafashe neza', 'Mastered'),
      stat(Math.round(mins), 'Iminota yose', 'Minutes total'),
      stat(Math.round(S.minutes[today()] || 0), 'Iminota y\'uyu munsi', 'Minutes today')),
    h('h2', {}, ...two('Ibizamini', 'Weekly tests')),
    h('div', { class: 'box' }, WEEKS.map(w => { const id = 'w' + pad(w.week) + 'd7'; return h('div', {}, 'Icyumweru ' + w.week + ': ', h('b', {}, S.tests[id] != null ? S.tests[id] + '%' : '—')); })),
    h('h2', {}, ...two('Amakosa akunze kugaruka', 'Most repeated mistakes')),
    h('div', { class: 'box' }, mis.length ? h('table', {}, mis.map(([en, m]) => h('tr', {}, h('td', {}, en, h('br'), h('small', {}, m.rw)), h('td', {}, '×' + m.n),
      h('td', {}, h('button', { class: 'x', onclick: () => { delete S.mistakes[en]; save(); go('progress'); } }, '🗑'))))) : 'Nta makosa arandikwa.',
      h('p', {}), mi, h('button', { class: 'btn sec', onclick: () => { if (mi.value.trim()) { mistake(mi.value.trim(), ''); go('progress'); } } }, '+ Ongeraho')),
    h('h2', {}, ...two('Ijwi', 'Voice')), h('div', { class: 'box' }, vsel, h('p', {}), rsel,
      h('button', { class: 'btn sec', onclick: () => speak('Hello, how are you?') }, '🔊 Gerageza ijwi (Test)'),
      !voices.length && h('div', { class: 'note' }, 'Nta jwi ry\'Icyongereza riri kuri iyi telefoni.', h('br'), h('small', {}, 'This device reports no English voice. On Android: Settings → Accessibility → Text-to-speech, install "Speech Services by Google" and English voice data. On a computer, use Chrome or Edge.'))),
    h('h2', {}, ...two('Kubika', 'Backup')),
    h('button', { class: 'btn sec', onclick: () => {
      const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })), download: 'icyongereza-' + today() + '.json' });
      document.body.append(a); a.click(); a.remove();
    } }, '⬇ Bika kopi (Export)'),
    h('button', { class: 'btn sec', onclick: () => file.click() }, '⬆ Garura kopi (Import)'), file,
    h('button', { class: 'btn sec', onclick: () => go('check') }, 'Kugenzura Ikinyarwanda (Chris)'),
    h('button', { class: 'btn warn', onclick: () => { if (confirm('Gusiba byose? / Delete all progress?')) { S = blank(); save(); go('home'); } } }, 'Siba byose (Reset)'));
}
// For Chris: every Kinyarwanda line flagged as uncertain, in one place.
function check() {
  const rows = [];
  for (const d of DAYS) {
    for (const it of d.items || []) if (it.check) rows.push([it.id, it.en + (it.ex ? ' — ' + it.ex.en : ''), it.rw + (it.ex ? ' — ' + it.ex.rw : '')]);
    for (const l of d.dialogue || []) if (l.check) rows.push([l.id, l.en, l.rw]);
    if (d.gate) rows.push([d.id + '-gate', d.gate.en, d.gate.rw]);
  }
  app().replaceChildren(h('h1', {}, 'Kinyarwanda to check'),
    h('p', { class: 'en2' }, rows.length + ' lines are flagged as uncertain. Fix them in lessons/week-NN.json and remove "check": true. Sound explanations live in lessons/sounds.json and grammar notes in grammar_rw; please read those too.'),
    h('table', {}, rows.map(r => h('tr', {}, h('td', {}, h('small', {}, r[0]), h('br'), r[1], h('br'), h('b', {}, r[2]))))));
}

// ---------- start ----------
document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.v)));
loadCourse().then(() => go('home')).catch(() => {
  app().replaceChildren(h('div', { class: 'note' }, 'Amasomo ntiyabonetse. Reba interineti, hanyuma wongere ufungure.', h('br'), h('small', {}, 'Could not load the lessons. Check the connection and reload.')));
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
