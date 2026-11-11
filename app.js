(() => {
'use strict';
const $ = s => document.querySelector(s);
const setText = (selector, value) => {
  const element = $(selector);
  if (element) element.textContent = value ?? '';
};
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

const FALLBACK_NEWS = {
  ai: [
    {title:'Cihaz Üstü Yapay Zeka Yaygınlaşıyor', desc:'Daha küçük ve verimli modeller, kişisel verileri buluta göndermeden yerel donanımda çalışıyor.', url:'#'}
  ],
  oss: [
    {title:'Açık Kaynak Modeller Kurumsal Araçlara Giriyor', desc:'Ekipler, denetlenebilir ve özelleştirilebilir modelleri kendi altyapılarında çalıştırmaya yöneliyor.', url:'#'}
  ],
  web: [
    {title:'Web Uygulamalarında Performans Bütçesi Öne Çıkıyor', desc:'Geliştiriciler yükleme süresi, paket boyutu ve etkileşim gecikmesini birlikte izliyor.', url:'#'}
  ],
  sec: [
    {title:'Yazılım Tedarik Zincirinde İmza Kontrolü Artıyor', desc:'Paket ve derleme çıktılarının kaynağını doğrulayan imzalı yayın süreçleri standartlaşıyor.', url:'#'}
  ]
};

const CAT = {ai:'Yapay Zeka', oss:'Açık Kaynak', web:'Web Geliştirme', sec:'Siber Güvenlik'};
let liveEdition = null;

/* ---------- BASKI / TARİH & HAREKETLİ ARŞİV ---------- */
const CURRENT_EDITION = 'data/edition.json';
const START_DATE = new Date(2026, 10, 11);

function editionBase(n){ const d = new Date(n.getFullYear(), n.getMonth(), n.getDate()); if (n.getHours() < 7) d.setDate(d.getDate() - 1); return d < START_DATE ? new Date(START_DATE) : d; }
function dayIndex(d){ return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
function dateStr(d){ return `${d.getDate()} ${AY[d.getMonth()]} ${d.getFullYear()}, ${GUN[d.getDay()]}`; }
function archiveDateStr(d){ return `${d.getDate()} ${AY[d.getMonth()]} ${d.getFullYear()}`; }
function isoDate(d){ return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function render(){
  const d = editionBase(new Date());
  const i = dayIndex(d);
  const L = LEADS[Math.abs(i) % LEADS.length], E = EDS[0], F = FACTS[0];
  
  if (liveEdition) {
    const lead = liveEdition.lead || {};
    const editorial = liveEdition.editorial || {};
    const fact = liveEdition.fact || {};
    setText('#issueNo', 'Sayı: ' + (liveEdition.issue || 1));
    setText('#dateLine', liveEdition.date || dateStr(d));
    setText('#quote', liveEdition.quote || QUOTES[Math.abs(i) % QUOTES.length]);
    setText('#leadTitle', lead.title || L.h);
    setText('#leadDeck', lead.deck || L.d);
    setText('#leadBody', lead.body || L.b);
    setText('#edTitle', editorial.title || E.t);
    setText('#edBody', editorial.body || E.b);
    setText('#factTitle', fact.title || F.t);
    setText('#factBody', fact.body || F.b);
    return;
  }

  setText('#issueNo', 'Sayı: ' + Math.max(1, i - dayIndex(START_DATE) + 1));
  setText('#dateLine', dateStr(d));
  setText('#quote', QUOTES[Math.abs(i) % QUOTES.length]);
  setText('#leadTitle', L.h);
  setText('#leadDeck', L.d);
  setText('#leadBody', L.b);
  setText('#edTitle', E.t);
  setText('#edBody', E.b);
  setText('#factTitle', F.t);
  setText('#factBody', F.b);
}

function appendArchiveOption(select, value, label){
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function fillArchive(){
  const select = $('#archive');
  if (!select) return;
  select.innerHTML = '';
  appendArchiveOption(select, CURRENT_EDITION, 'Bugünkü baskı');
  const base = editionBase(new Date());
  const availableArchiveDays = Math.min(7, Math.max(0, dayIndex(base) - dayIndex(START_DATE)));
  for (let daysAgo = 1; daysAgo <= availableArchiveDays; daysAgo++) {
    const archiveDate = new Date(base);
    archiveDate.setDate(archiveDate.getDate() - daysAgo);
    appendArchiveOption(select, `data/archive/${isoDate(archiveDate)}.json`, `Arşiv: ${archiveDateStr(archiveDate)}`);
  }
  select.value = CURRENT_EDITION;
}

const archiveSelect = $('#archive');
if (archiveSelect) {
  archiveSelect.addEventListener('change', async event => {
    const requestedFile = event.target.value || CURRENT_EDITION;
    const loaded = await loadEdition(requestedFile);
    if (!loaded && requestedFile !== CURRENT_EDITION) {
      event.target.value = CURRENT_EDITION;
      await loadEdition(CURRENT_EDITION);
    }
  });
}

/* ---------- SAAT ---------- */
function tick(){
  const clock = $('#clock');
  if (!clock) return;
  const n = new Date();
  clock.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
}
setInterval(tick, 1000); tick();

/* ---------- CANLI RADAR VE SON DAKİKA AKIŞI ---------- */
const feed = [];
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

function renderNews(news = FALLBACK_NEWS){
  feed.length = 0;
  NEWS_CATEGORIES.forEach(cat => { newsByCategory[cat] = []; });

  const leadTitle = liveEdition?.lead?.title || LEADS[Math.abs(dayIndex(editionBase(new Date()))) % LEADS.length].h;
  if (leadTitle) feed.push(`Manşet: ${leadTitle}`);

  NEWS_CATEGORIES.forEach(cat => {
    const suppliedItems = news && Array.isArray(news[cat]) ? news[cat] : [];
    const items = suppliedItems.length ? suppliedItems : FALLBACK_NEWS[cat];
    items.forEach(item => {
      newsByCategory[cat].push({...item, live:false, time:'07:00'});
      if (item.title) feed.push(`${CAT[cat]}: ${item.title}`);
    });
  });

  renderNewsGrid();
  buildTicker();
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
  if (!gridEl) return;
  const clueA = $('#clueA');
  const clueD = $('#clueD');
  const answers = $('#answers');
  const score = $('#score');
  gridEl.innerHTML = '';
  if (clueA) clueA.innerHTML = '';
  if (clueD) clueD.innerHTML = '';
  if (answers) answers.innerHTML = '';
  if (score) score.textContent = '';

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
    const clueList = d === 'a' ? clueA : clueD;
    if (clueList) clueList.appendChild(li);
    const row = document.createElement('div'); 
    row.textContent = `${n} ${d === 'a' ? 'Yatay' : 'Aşağı'}: ${w}`;
    if (answers) answers.appendChild(row);
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
  setText('#score', '');
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
  
  setText('#score', ok === total 
    ? `Tebrikler! ${ok}/${total} kutu doğru, bulmaca çözüldü.` 
    : `${ok}/${total} doğru, ${filled - ok} yanlış, ${total - filled} boş.`);
}

const checkButton = $('#checkBtn');
if (checkButton) checkButton.addEventListener('click', checkPuzzle);

const clearButton = $('#clearBtn');
if (clearButton) {
  clearButton.addEventListener('click', () => {
    Object.values(inputs).forEach(i => i.value = '');
    clearMarks();
    selectCell(0, 0);
  });
}

/* ---------- DİNAMİK VERİ YÜKLEME ---------- */
function showStaticFallback(){
  liveEdition = null;
  render();
  initPuzzle(currentPuzzleWords);
  renderNews(FALLBACK_NEWS);
}

async function loadEdition(filePath = CURRENT_EDITION){
  try {
    const res = await fetch(filePath + '?t=' + Date.now());
    if (!res.ok) throw new Error('Veri alinamadi: ' + filePath);
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('Gecersiz baski verisi: ' + filePath);
    liveEdition = data;
    render();
    
    // O güne ait bulmaca
    if (liveEdition.puzzle && Array.isArray(liveEdition.puzzle) && liveEdition.puzzle.length) {
      initPuzzle(liveEdition.puzzle);
    } else {
      initPuzzle(currentPuzzleWords);
    }

    renderNews(liveEdition.news);
    return true;
  } catch (err) {
    console.warn('Veri yüklenemedi, statik içerik gösteriliyor:', err);
    showStaticFallback();
    return false;
  }
}

/* ---------- BAŞLAT ---------- */
showStaticFallback();
fillArchive();
loadEdition(CURRENT_EDITION);
})();
