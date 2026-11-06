(() => {
'use strict';
const $ = s => document.querySelector(s);
const AY = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const GUN = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const pad = n => String(n).padStart(2, '0');

/* ---------- STATİK YEDEK HAVUZ ---------- */
const LEADS = [
 {h:'Akıllı Şebekede Arıza Yeri Dakikalardan Saniyelere İniyor', d:'SCADA ve hat sensörleri birleşince orta gerilim arızaları hızla izole ediliyor.', b:'Dağıtım şebekelerinde koruma röleleri ve uzaktan kumandalı kesiciler sayesinde enerjisiz kalan kesimler hızla yeniden enerjilendiriliyor.'}
];
const EDS = [
 {t:'Dağıtım Şebekesinin Dijital İkizi Sahadaki Disiplindir', b:'SCADA tek hat şeması ile sahadaki fiziki durum eşleştiğinde otomasyon gerçek verimini sağlar.'}
];
const FACTS = [
 {t:'Güç Katsayısı (cosφ)', b:'Aktif gücün görünür güce oranıdır. Düşük güç katsayısı iletkenlerdeki kayıpları ve gerilim düşümünü artırır.'}
];
const QUOTES = [
 '"Güvenilir şebeke, ölçülen ve yönetilen şebekedir."',
 '"Ölçmediğin şeyi kontrol edemezsin."',
 '"Enerjinin sürekliliği, koruma koordinasyonunun hassasiyetinde gizlidir."'
];

// Elektrik & Enerji Kolon Haritası
const CAT = {grid:'Şebeke & Dağıtım', ren:'Yenilenebilir Enerji', bat:'Depolama & Batarya', mkt:'Piyasa & Regülasyon'};
let liveEdition = null;

/* ---------- BASKI / TARİH & HAREKETLİ ARŞİV ---------- */
let cur = editionBase(new Date());
let offset = 0;
function editionBase(n){ const d = new Date(n.getFullYear(), n.getMonth(), n.getDate()); if (n.getHours() < 7) d.setDate(d.getDate() - 1); return d; }
function dayIndex(d){ return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
function dateStr(d){ return `${d.getDate()} ${AY[d.getMonth()]} ${d.getFullYear()}, ${GUN[d.getDay()]}`; }

function render(){
  const d = new Date(cur); d.setDate(d.getDate() - offset);
  const i = dayIndex(d);
  
  if (liveEdition) {
    $('#issueNo').textContent = 'Sayı: ' + liveEdition.issue;
    $('#dateLine').textContent = liveEdition.date || dateStr(d);
    $('#quote').textContent = liveEdition.quote || QUOTES[i % QUOTES.length];
    $('#leadTitle').textContent = liveEdition.lead.title;
    $('#leadDeck').textContent = liveEdition.lead.deck;
    $('#leadBody').textContent = liveEdition.lead.body;
    $('#edTitle').textContent = liveEdition.editorial.title;
    $('#edBody').textContent = liveEdition.editorial.body;
    $('#factTitle').textContent = liveEdition.fact.title;
    $('#factBody').textContent = liveEdition.fact.body;
    return;
  }

  const L = LEADS[0], E = EDS[0], F = FACTS[0];
  $('#issueNo').textContent = 'Sayı: 1';
  $('#dateLine').textContent = dateStr(d);
  $('#quote').textContent = QUOTES[0];
  $('#leadTitle').textContent = L.h; $('#leadDeck').textContent = L.d; $('#leadBody').textContent = L.b;
  $('#edTitle').textContent = E.t; $('#edBody').textContent = E.b;
  $('#factTitle').textContent = F.t; $('#factBody').textContent = F.b;
}

function fillArchive(){
  const sel = $('#archive'); sel.innerHTML = '';
  const o = document.createElement('option');
  o.value = 0;
  o.textContent = 'Bugünkü baskı';
  sel.appendChild(o);
}

/* ---------- SAAT ---------- */
function tick(){ const n = new Date(); $('#clock').textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`; }
setInterval(tick, 1000); tick();

/* ---------- CANLI RADAR VE SON DAKİKA AKIŞI ---------- */
const feed = [];
let realNewsPool = [];
const NEWS_CATEGORIES = Object.keys(CAT);
const newsByCategory = Object.fromEntries(NEWS_CATEGORIES.map(cat => [cat, []]));

function ensureNewsGrid(){
  const container = $('.news-cols');
  if (!container) return null;
  let list = container.querySelector('.news-grid-list');
  if (list) return list;

  container.innerHTML = '';
  NEWS_CATEGORIES.forEach(cat => {
    const heading = document.createElement('h3');
    heading.className = 'news-grid-heading';
    heading.textContent = CAT[cat];
    container.appendChild(heading);
  });

  list = document.createElement('ul');
  list.className = 'news-grid-list';
  list.setAttribute('aria-label', 'Son dakika haberleri');
  container.appendChild(list);
  return list;
}

function createNewsCard(cat, item){
  const li = document.createElement('li');
  li.dataset.category = CAT[cat];
  if (!item) {
    li.className = 'news-card-empty';
    li.setAttribute('aria-hidden', 'true');
    return li;
  }

  if (item.live) li.classList.add('fresh');
  const time = document.createElement('time');
  time.textContent = item.time;
  const title = document.createElement('b');
  title.textContent = item.title;
  const desc = document.createElement('span');
  desc.textContent = item.desc;
  li.append(time, title, desc);

  if (item.url && item.url !== '#' && item.isTruncated) {
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'news-link';
    link.textContent = 'Haberi Oku →';
    li.appendChild(link);
  }
  return li;
}

function renderNewsGrid(){
  const list = ensureNewsGrid();
  if (!list) return;
  list.innerHTML = '';
  const rowCount = Math.max(0, ...NEWS_CATEGORIES.map(cat => newsByCategory[cat].length));
  for (let row = 0; row < rowCount; row++) {
    NEWS_CATEGORIES.forEach(cat => {
      list.appendChild(createNewsCard(cat, newsByCategory[cat][row] || null));
    });
  }
}

function addNews(cat, live, customItem = null){
  const item = customItem;
  if (!item || !newsByCategory[cat]) return;
  const n = new Date();
  const entry = {...item, live, time:`${pad(n.getHours())}:${pad(n.getMinutes())}`};
  if (live) newsByCategory[cat].unshift(entry);
  else newsByCategory[cat].push(entry);
  if (newsByCategory[cat].length > 6) newsByCategory[cat].length = 6;
  
  feed.unshift(`${CAT[cat]}: ${item.title}`);
  if (feed.length > 12) feed.pop();
  buildTicker();
  renderNewsGrid();
}

function buildTicker(){
  const t = $('#tickerTrack');
  if (!t) return;
  t.innerHTML = '';
  feed.forEach(x => { 
    const s = document.createElement('span'); 
    s.textContent = '\u25CF ' + x; 
    t.appendChild(s); 
  });
}

function renderNews(news){
  realNewsPool = [];
  feed.length = 0;
  NEWS_CATEGORIES.forEach(cat => { newsByCategory[cat] = []; });

  NEWS_CATEGORIES.forEach(cat => {
    const items = news && Array.isArray(news[cat]) ? news[cat] : [];
    items.forEach(item => {
      const n = new Date();
      newsByCategory[cat].push({...item, live:false, time:`${pad(n.getHours())}:${pad(n.getMinutes())}`});
      feed.unshift(`${CAT[cat]}: ${item.title}`);
      realNewsPool.push({cat, title:item.title, desc:item.desc, url:item.url, isTruncated:item.isTruncated});
    });
  });

  if (feed.length > 12) feed.length = 12;
  renderNewsGrid();
  buildTicker();
}

function scheduleNext(){
  setTimeout(() => {
    if (realNewsPool.length > 0) {
      const randomItem = realNewsPool[Math.floor(Math.random() * realNewsPool.length)];
      addNews(randomItem.cat, true, randomItem);
    }
    scheduleNext();
  }, 90000 + Math.random() * 45000);
}

/* ---------- DİNAMİK BULMACA KÖŞESİ ---------- */
let currentPuzzleWords = [];
let inputs = {}, cells = {}, nums = {}, pos = {r:0, c:0}, dir = 'a';
const ROWS = 10, COLS = 11;

function initPuzzle(words) {
  currentPuzzleWords = words;
  cells = {}; nums = {}; inputs = {};
  
  const gridEl = $('#grid');
  gridEl.innerHTML = '';
  $('#clueA').innerHTML = '';
  $('#clueD').innerHTML = '';
  $('#answers').innerHTML = '';
  $('#score').textContent = '';

  currentPuzzleWords.forEach(([w,r,c,d]) => [...w].forEach((ch,i) => {
    const k = (r + (d === 'd' ? i : 0)) + ',' + (c + (d === 'a' ? i : 0)); 
    cells[k] = {ch};
  }));

  let counter = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (currentPuzzleWords.some(w => w[1] === r && w[2] === c)) nums[r + ',' + c] = ++counter;
    }
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++){
      const k = r + ',' + c; 
      const div = document.createElement('div');
      if (!cells[k]){ 
        div.className = 'cell block'; 
        gridEl.appendChild(div); 
        continue; 
      }
      
      div.className = 'cell'; 
      div.dataset.k = k;
      if (nums[k]){ 
        const n = document.createElement('span'); 
        n.className = 'n'; 
        n.textContent = nums[k]; 
        div.appendChild(n); 
      }
      
      const inp = document.createElement('input');
      inp.maxLength = 2; 
      inp.autocomplete = 'off'; 
      inp.autocapitalize = 'characters'; 
      inp.spellcheck = false; 
      inp.inputMode = 'text';
      
      inp.addEventListener('click', () => { 
        if (pos.r === r && pos.c === c) dir = dir === 'a' ? 'd' : 'a'; 
        selectCell(r, c); 
      });
      inp.addEventListener('focus', () => selectCell(r, c, true));
      inp.addEventListener('input', () => {
        const v = inp.value.replace(/[^a-zA-ZığüşöçİĞÜŞÖÇ]/g, '').slice(-1).toLocaleUpperCase('tr-TR');
        inp.value = v; 
        clearMarks();
        if (v) stepCell(r, c, 1);
      });
      inp.addEventListener('keydown', e => onPuzzleKey(e, r, c, inp));
      
      div.appendChild(inp); 
      gridEl.appendChild(div); 
      inputs[k] = inp;
    }
  }

  currentPuzzleWords.forEach(([w,r,c,d,clue]) => {
    const li = document.createElement('li'); 
    const n = nums[r + ',' + c];
    const b = document.createElement('b'); 
    b.textContent = n + '.';
    li.append(b, ' ' + clue + ` (${w.length})`);
    (d === 'a' ? $('#clueA') : $('#clueD')).appendChild(li);
    const row = document.createElement('div'); 
    row.textContent = `${n} ${d === 'a' ? 'Yatay' : 'Aşağı'}: ${w}`;
    $('#answers').appendChild(row);
  });
}

function wordAtCell(r, c, d){
  return currentPuzzleWords.find(([w,wr,wc,wd]) => wd === d && (d === 'a' ? (r === wr && c >= wc && c < wc + w.length) : (c === wc && r >= wr && r < wr + w.length)));
}

function selectCell(r, c, keep){
  pos = {r, c};
  if (!wordAtCell(r, c, dir)) dir = dir === 'a' ? 'd' : 'a';
  document.querySelectorAll('.cell').forEach(x => x.classList.remove('word', 'cur'));
  const w = wordAtCell(r, c, dir);
  if (w) [...w[0]].forEach((_, i) => {
    const k = (w[1] + (dir === 'd' ? i : 0)) + ',' + (w[2] + (dir === 'a' ? i : 0));
    if (inputs[k]) inputs[k].parentElement.classList.add('word');
  });
  if (inputs[r + ',' + c]) {
    inputs[r + ',' + c].parentElement.classList.add('cur');
    if (!keep) inputs[r + ',' + c].focus();
    if (!keep) inputs[r + ',' + c].select();
  }
}

function stepCell(r, c, s){
  const nr = r + (dir === 'd' ? s : 0), nc = c + (dir === 'a' ? s : 0);
  if (inputs[nr + ',' + nc]) selectCell(nr, nc);
}

function onPuzzleKey(e, r, c, inp){
  const mv = {ArrowRight:[0,1,'a'], ArrowLeft:[0,-1,'a'], ArrowDown:[1,0,'d'], ArrowUp:[-1,0,'d']}[e.key];
  if (mv){
    e.preventDefault(); 
    dir = mv[2];
    const k = (r + mv[0]) + ',' + (c + mv[1]);
    if (inputs[k]) selectCell(r + mv[0], c + mv[1]); else selectCell(r, c);
  } else if (e.key === 'Backspace'){
    e.preventDefault(); 
    clearMarks();
    if (inp.value){ 
      inp.value = ''; 
    } else { 
      stepCell(r, c, -1); 
      const p = inputs[pos.r + ',' + pos.c]; 
      if (p) p.value = ''; 
    }
  } else if (e.key === 'Enter'){ 
    e.preventDefault(); 
    checkPuzzle(); 
  }
}

function clearMarks(){ 
  document.querySelectorAll('.cell.ok,.cell.bad').forEach(x => x.classList.remove('ok', 'bad')); 
  $('#score').textContent = ''; 
}

function checkPuzzle(){
  let ok = 0, filled = 0; 
  const total = Object.keys(cells).length;
  
  Object.keys(cells).forEach(k => {
    const v = inputs[k].value.toLocaleUpperCase('tr-TR'); 
    const box = inputs[k].parentElement;
    box.classList.remove('ok', 'bad');
    if (!v) return; 
    filled++;
    if (v === cells[k].ch){ 
      ok++; 
      box.classList.add('ok'); 
    } else {
      box.classList.add('bad');
    }
  });
  
  $('#score').textContent = ok === total 
    ? `Tebrikler! ${ok}/${total} kutu doğru, bulmaca çözüldü.` 
    : `${ok}/${total} doğru, ${filled - ok} yanlış, ${total - filled} boş.`;
}

$('#checkBtn').addEventListener('click', checkPuzzle);
$('#clearBtn').addEventListener('click', () => { 
  Object.values(inputs).forEach(i => i.value = ''); 
  clearMarks(); 
  selectCell(0, 0); 
});

/* ---------- DİNAMİK VERİ YÜKLEME ---------- */
async function loadEdition(filePath = 'data/edition_enerji.json'){
  try {
    const res = await fetch(filePath + '?t=' + Date.now());
    if (!res.ok) throw new Error('Veri alinamadi: ' + filePath);
    liveEdition = await res.json();
    render();
    
    if (liveEdition.puzzle && Array.isArray(liveEdition.puzzle)) {
      initPuzzle(liveEdition.puzzle);
    }

    renderNews(liveEdition.news || {});
    
  } catch (err) {
    console.warn('Enerji verisi yüklenemedi:', err);
  }
}

/* ---------- BAŞLAT ---------- */
fillArchive(); 
loadEdition();
scheduleNext();
})();
