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
 {h:'Eksim Holding Sürdürülebilir Büyüme Vizyonunu Güçlendiriyor', d:'Grup şirketleri enerji, dağıtım, gıda ve girişimcilik alanlarında ortak değer üretme yaklaşımıyla ilerliyor.', b:'Eksim Holding, farklı sektörlerdeki kurumsal yetkinliklerini güçlü yönetişim, dijital dönüşüm, insan kaynağına yatırım ve toplumsal fayda ekseninde bir araya getiriyor.'}
];
const EDS = [
 {t:'Ortak Vizyon, Sürdürülebilir Değer', b:'Eksim Holding ve grup şirketleri, güvenilir büyümeyi yenilikçilik, çevresel sorumluluk ve toplumsal faydayla birlikte ele alıyor.'}
];
const FACTS = [
 {t:'Sürdürülebilir Değer', b:'Ekonomik performansın çevresel sorumluluk, toplumsal fayda ve güçlü yönetişimle birlikte uzun vadeli olarak geliştirilmesidir.'}
];
const QUOTES = [
 '"İnsana, topluma ve geleceğe değer katan yatırımlar kalıcı iz bırakır."',
 '"Ortak vizyon, farklı yetkinlikleri güçlü bir gelecekte buluşturur."',
 '"Sürdürülebilir büyüme, bugünün başarısını yarının sorumluluğuyla birleştirir."'
];

const FALLBACK_NEWS = {
  holding: [
    {title:'Eksim Holding Kurumsal Dönüşüm Programlarını Yaygınlaştırıyor', desc:'Grup şirketlerinde verimlilik, dijitalleşme ve ortak çalışma kültürünü geliştiren uygulamalar hayata geçiriliyor.', url:'https://eksim.com.tr/'}
  ],
  dicle: [
    {title:'Dicle Elektrik Şebeke Yatırımlarını Sürdürüyor', desc:'Kayıpsız, kesintisiz ve kaliteli enerji arzı hedefiyle dağıtım altyapısı yenileniyor ve güçlendiriliyor.', url:'https://www.dicleelektrik.com.tr/'}
  ],
  enerji: [
    {title:'Eksim Enerji Yenilenebilir Üretim Portföyünü Güçlendiriyor', desc:'Rüzgâr ve hidroelektrik santrallerindeki işletme disipliniyle temiz enerji üretimine katkı sağlanıyor.', url:'https://eksimenerji.com.tr/'}
  ],
  grup: [
    {title:'Grup Şirketlerinde Dijital Dönüşüm Uygulamaları Yaygınlaşıyor', desc:'Veriye dayalı karar alma ve süreç otomasyonu farklı iş kollarında verimliliği ve ortak değer üretimini destekliyor.', url:'https://eksim.com.tr/'}
  ]
};

// Eksim Kolon Haritası
const CAT = {holding:'Eksim Holding', dicle:'Dicle Elektrik', enerji:'Eksim Enerji', grup:'Grup Şirketleri & Basında'};
let liveEdition = null;

/* ---------- BASKI / TARİH & HAREKETLİ ARŞİV ---------- */
const CURRENT_EDITION = 'data/edition_eksim.json';
const START_DATE = new Date(2026, 10, 11);
function editionBase(n){ const d = new Date(n.getFullYear(), n.getMonth(), n.getDate()); if (n.getHours() < 7) d.setDate(d.getDate() - 1); return d < START_DATE ? new Date(START_DATE) : d; }
function dayIndex(d){ return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
function dateStr(d){ return `${d.getDate()} ${AY[d.getMonth()]} ${d.getFullYear()}, ${GUN[d.getDay()]}`; }
function archiveDateStr(d){ return `${d.getDate()} ${AY[d.getMonth()]} ${d.getFullYear()}`; }
function isoDate(d){ return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function render(){
  const d = editionBase(new Date());
  const i = dayIndex(d);
  
  if (liveEdition) {
    const lead = liveEdition.lead || {};
    const editorial = liveEdition.editorial || {};
    const fact = liveEdition.fact || {};
    setText('#issueNo', 'Sayı: ' + (liveEdition.issue || 1));
    setText('#dateLine', liveEdition.date || dateStr(d));
    setText('#quote', liveEdition.quote || QUOTES[Math.abs(i) % QUOTES.length]);
    setText('#leadTitle', lead.title || LEADS[0].h);
    setText('#leadDeck', lead.deck || LEADS[0].d);
    setText('#leadBody', lead.body || LEADS[0].b);
    setText('#edTitle', editorial.title || EDS[0].t);
    setText('#edBody', editorial.body || EDS[0].b);
    setText('#factTitle', fact.title || FACTS[0].t);
    setText('#factBody', fact.body || FACTS[0].b);
    return;
  }

  const L = LEADS[0], E = EDS[0], F = FACTS[0];
  setText('#issueNo', 'Sayı: ' + Math.max(1, i - dayIndex(START_DATE) + 1));
  setText('#dateLine', dateStr(d));
  setText('#quote', QUOTES[Math.abs(i) % QUOTES.length]);
  setText('#leadTitle', L.h); setText('#leadDeck', L.d); setText('#leadBody', L.b);
  setText('#edTitle', E.t); setText('#edBody', E.b);
  setText('#factTitle', F.t); setText('#factBody', F.b);
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
    appendArchiveOption(select, `data/archive/eksim_${isoDate(archiveDate)}.json`, `Arşiv: ${archiveDateStr(archiveDate)}`);
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

  const leadTitle = liveEdition?.lead?.title || LEADS[0].h;
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

/* ---------- ADMİN / EDİTÖR NOTU ---------- */
async function loadAdminNote() {
  const box = $('#adminBox');
  if (!box) return;
  const content = $('#adminContent');
  if (!content) {
    box.hidden = true;
    return;
  }
  try {
    const res = await fetch('data/admin_note.json?t=' + Date.now());
    if (!res.ok) {
      box.hidden = true;
      return;
    }
    const data = await res.json();
    if (data && data.active && data.content) {
      setText('#adminTitle', data.title || 'Editör Masası');
      setText('#adminAuthor', data.author || '');
      content.textContent = data.content;
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  } catch (err) {
    box.hidden = true;
  }
}

/* ---------- DİNAMİK VERİ YÜKLEME ---------- */
function showStaticFallback(){
  liveEdition = null;
  render();
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
    renderNews(liveEdition.news || {});
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
loadAdminNote();
})();
