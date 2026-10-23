(() => {
'use strict';
const $ = s => document.querySelector(s);
const AY = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const GUN = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const pad = n => String(n).padStart(2, '0');

/* ---------- STATİK YEDEK HAVUZ ---------- */
const LEADS = [
 {h:'Çok Modlu Modeller Kod Editörlerini Yeniden Yazıyor', d:'Metin, görsel ve ses tek modelde birleşince IDE deneyimi sohbetten ajanlığa geçiyor.', b:'Geliştirici araçları artık yalnızca kod tamamlamıyor; depoyu okuyor, testi çalıştırıyor, hatayı kendisi düzeltiyor. Ekipler için asıl soru izin modelini kurmak.'},
 {h:'Küçük Dil Modelleri Cihaz Üstüne Taşınıyor', d:'Birkaç milyar parametreli modeller telefonda gecikmesiz çalışıyor.', b:'Nicemleme (quantization) ile modeller 4 bit\'e indiriliyor ve bellek ihtiyacı dörtte bire düşüyor. Hibrit yönlendirme yaygın bir desen haline geliyor.'}
];
const EDS = [
 {t:'Ajanlar Çağında Kodu Okumak Yazmaktan Değerli', b:'Kod üretmek ucuzlarken doğru kodu ayırt etmek pahalılaşıyor. Gelecekte iyi geliştirici, en çok satır yazan değil, bir diff\'e bakıp niyetle sonucu karşılaştırabilen kişi olacak.'}
];
const FACTS = [
 {t:'Attention Mechanism', b:'Modelin bir kelimeyi işlerken cümledeki hangi kelimelere ne kadar bakacağını öğrenmesini sağlar. Transformer mimarisinin temelidir.'}
];
const QUOTES = [
 '"Önce çalıştır, sonra doğru yap, sonra hızlı yap."',
 '"Ölçmediğin şeyi iyileştiremezsin."',
 '"Basit olan, bakımı yapılabilir olandır."',
 '"Kod bir kez yazılır, defalarca okunur."'
];

const CAT = {ai:'Yapay Zeka', oss:'Açık Kaynak', web:'Web Geliştirme', sec:'Siber Güvenlik'};
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

  const L = LEADS[i % LEADS.length], E = EDS[0], F = FACTS[0];
  // 1. Sayı: 21 Ekim 2026
  $('#issueNo').textContent = 'Sayı: ' + Math.max(1, i - dayIndex(new Date(2026, 9, 21)) + 1);
  $('#dateLine').textContent = dateStr(d);
  $('#quote').textContent = QUOTES[i % QUOTES.length];
  $('#leadTitle').textContent = L.h; $('#leadDeck').textContent = L.d; $('#leadBody').textContent = L.b;
  $('#edTitle').textContent = E.t; $('#edBody').textContent = E.b;
  $('#factTitle').textContent = F.t; $('#factBody').textContent = F.b;
}

// 21 Ekim 2026 öncesini göstermeyen ve gerçek günleri listeleyen arşiv
function fillArchive(){
  const sel = $('#archive'); sel.innerHTML = '';
  const firstIssueDate = new Date(2026, 9, 21); // 21 Ekim 2026
  
  for (let k = 0; k < 7; k++){
    const d = new Date(cur); d.setDate(d.getDate() - k);
    if (d < firstIssueDate) break;
    
    const o = document.createElement('option'); 
    o.value = k;
    o.dataset.dateKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    o.textContent = (k ? 'Arşiv: ' : 'Bugünkü baskı: ') + `${d.getDate()} ${AY[d.getMonth()]}`;
    sel.appendChild(o);
  }
}

$('#archive').addEventListener('change', async e => { 
  offset = +e.target.value;
  const selectedOption = e.target.options[e.target.selectedIndex];
  const dateKey = selectedOption.dataset.dateKey;

  if (offset === 0) {
    await loadEdition('data/edition.json');
  } else {
    await loadEdition(`data/archive/${dateKey}.json`);
  }
});

/* ---------- SAAT ---------- */
function tick(){ const n = new Date(); $('#clock').textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`; }
setInterval(tick, 1000); tick();

/* ---------- BİLDİRİM GEÇMİŞİ & SAYAÇ ---------- */
const log = []; 
let unread = 0;

function logNotice(cat, title, desc){
  const n = new Date();
  log.unshift({cat, title, desc, time: `${pad(n.getHours())}:${pad(n.getMinutes())}`});
  if (log.length > 50) log.pop();
  
  const isOpen = !$('#drawer').hidden;
  if (!isOpen) unread++;
  renderLog();
}

function renderLog(){
  const ul = $('#drawerList'); ul.innerHTML = '';
  if (!log.length){ 
    const e = document.createElement('li'); 
    e.className = 'empty'; 
    e.textContent = 'Henüz bildirim yok.'; 
    ul.appendChild(e); 
  }
  
  log.forEach(x => {
    const li = document.createElement('li');
    const sm = document.createElement('small'); sm.textContent = `${x.time} · ${x.cat}`;
    const b = document.createElement('b'); b.textContent = x.title;
    const d = document.createElement('span'); d.textContent = x.desc;
    li.append(sm, b, d); 
    ul.appendChild(li);
  });
  
  const bd = $('#badge'); 
  bd.textContent = unread; 
  bd.hidden = unread === 0;
}

function setDrawer(open){
  $('#drawer').hidden = !open; 
  $('#notifBtn').setAttribute('aria-expanded', String(open));
  if (open){ unread = 0; renderLog(); }
}

$('#notifBtn').addEventListener('click', () => setDrawer($('#drawer').hidden));
$('#drawerX').addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });

/* ---------- CANLI RADAR VE SON DAKİKA AKIŞI ---------- */
const feed = [];
let realNewsPool = [];

function addNews(cat, live, customItem = null){
  const item = customItem;
  if (!item) return;
  const n = new Date();
  
  const li = document.createElement('li');
  if (live) li.className = 'fresh';
  const time = document.createElement('time'); time.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  const b = document.createElement('b'); b.textContent = item[0];
  const p = document.createElement('span'); p.textContent = item[1];
  li.append(time, b, p);
  
  const ul = $('#list-' + cat); 
  ul.prepend(li);
  while (ul.children.length > 6) ul.lastChild.remove();
  
  feed.unshift(`${CAT[cat]}: ${item[0]}`);
  if (feed.length > 12) feed.pop();
  buildTicker();
  
  if (live){ 
    logNotice(CAT[cat], item[0], item[1]); 
  }
}

function buildTicker(){
  const t = $('#tickerTrack'); t.innerHTML = '';
  feed.forEach(x => { 
    const s = document.createElement('span'); 
    s.textContent = '\u25CF ' + x; 
    t.appendChild(s); 
  });
}

function scheduleNext(){
  setTimeout(() => {
    if (realNewsPool.length > 0) {
      const randomItem = realNewsPool[Math.floor(Math.random() * realNewsPool.length)];
      addNews(randomItem.cat, true, [randomItem.title, randomItem.desc]);
    }
    scheduleNext();
  }, 90000 + Math.random() * 45000);
}

/* ---------- DİNAMİK ZEKA KÖŞESİ (KARE BULMACA) ---------- */
let currentPuzzleWords = [
 ['PROMPT',0,0,'a','Yapay zekaya verilen komut metni'],
 ['PYTHON',0,0,'d','Yapay zeka dünyasının en popüler dili'],
 ['TOKEN',0,5,'d','Dil modelinin metni böldüğü en küçük birim'],
 ['OPTION',4,0,'a','Seçenek, ayar (İngilizce)'],
 ['IDE',4,3,'d','Kod yazma ortamı (kısaltma)'],
 ['EPOCH',6,3,'a','Eğitimde veri setinin bir tam geçişi'],
 ['HASH',6,7,'d','Veriden çıkarılan sabit uzunluklu özet'],
 ['HTTP',9,7,'a','Web\'in temel iletişim protokolü']
];

let inputs = {};
let cells = {};
let nums = {};
let pos = {r:0, c:0}, dir = 'a';
const ROWS = 10, COLS = 11;

function initPuzzle(words) {
  currentPuzzleWords = words;
  cells = {};
  nums = {};
  inputs = {};
  
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
async function loadEdition(filePath = 'data/edition.json'){
  try {
    const res = await fetch(filePath + '?t=' + Date.now());
    if (!res.ok) throw new Error('Veri alinamadi: ' + filePath);
    liveEdition = await res.json();
    render();
    
    // Günlük Bulmacayı Yükle
    if (liveEdition.puzzle && Array.isArray(liveEdition.puzzle)) {
      initPuzzle(liveEdition.puzzle);
    } else {
      initPuzzle(currentPuzzleWords);
    }

    // Gerçek Haber Havuzunu Doldur
    realNewsPool = [];
    ['ai', 'oss', 'web', 'sec'].forEach(cat => {
      $('#list-' + cat).innerHTML = '';
      const items = (liveEdition.news && liveEdition.news[cat]) || [];
      items.forEach(it => {
        addNews(cat, false, [it.title, it.desc]);
        realNewsPool.push({cat, title: it.title, desc: it.desc});
      });
    });
    
  } catch (err) {
    console.warn('Veri yüklenemedi, statik devreye alındı:', err);
    liveEdition = null;
    render();
    initPuzzle(currentPuzzleWords);
  }
}

/* ---------- BAŞLAT ---------- */
fillArchive(); 
loadEdition();
scheduleNext();
})();