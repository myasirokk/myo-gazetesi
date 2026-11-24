(() => {
'use strict';
const $ = s => document.querySelector(s);
const setText = (selector, value) => {
  const element = $(selector);
  if (element) element.textContent = value ?? '';
};
const validImageUrl = value => {
  try {
    const url = new URL(String(value || ''), window.location.href);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch (_) { return ''; }
};
function createArticleImage(src, className, alt = '') {
  const url = validImageUrl(src);
  if (!url) return null;
  const image = document.createElement('img');
  image.className = className;
  image.src = url;
  image.alt = alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.remove(), {once:true});
  return image;
}
function renderLeadImage(edition) {
  const lead = $('.lead');
  if (!lead) return;
  lead.querySelector('.lead-image')?.remove();
  if (!edition) return;
  const leadTitle = String(edition.lead?.title || '').trim().toLocaleLowerCase('tr-TR');
  const items = Object.values(edition.news || {}).flatMap(group => Array.isArray(group) ? group : []);
  const featured = items.find(item =>
    String(item.title || '').trim().toLocaleLowerCase('tr-TR') === leadTitle
    && validImageUrl(item.image)
  );
  const image = createArticleImage(featured?.image, 'lead-image', featured?.title || edition.lead?.title || '');
  if (image) lead.insertBefore(image, lead.querySelector('#leadTitle'));
}
function setupNavigationFeedback() {
  const prefetched = new Set();
  document.querySelectorAll('.nav-tab[href]').forEach(link => {
    const prefetch = () => {
      const href = link.href;
      if (!href || prefetched.has(href)) return;
      prefetched.add(href);
      const hint = document.createElement('link');
      hint.rel = 'prefetch';
      hint.href = href;
      document.head.appendChild(hint);
    };
    link.addEventListener('mouseenter', prefetch, {once:true, passive:true});
    link.addEventListener('touchstart', prefetch, {once:true, passive:true});
    link.addEventListener('pointerdown', () => link.classList.add('is-navigating'), {passive:true});
  });
  window.addEventListener('pageshow', () => {
    document.querySelectorAll('.nav-tab.is-navigating').forEach(link => link.classList.remove('is-navigating'));
  });
}
setupNavigationFeedback();
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
const ARCHIVE_INDEX = 'data/archive/eksim_index.json';
const EDITION_CACHE_KEY = 'myo:edition:eksim:v1';
const ARCHIVE_CACHE_KEY = 'myo:archive:eksim:v1';
const START_DATE = new Date(2026, 10, 11);
let activeEditionPath = CURRENT_EDITION;
let editionRequestId = 0;
let renderedSignature = '';
let hasRenderedContent = false;
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
    renderLeadImage(liveEdition);
    return;
  }

  const L = LEADS[0], E = EDS[0], F = FACTS[0];
  setText('#issueNo', 'Sayı: ' + Math.max(1, i - dayIndex(START_DATE) + 1));
  setText('#dateLine', dateStr(d));
  setText('#quote', QUOTES[Math.abs(i) % QUOTES.length]);
  setText('#leadTitle', L.h); setText('#leadDeck', L.d); setText('#leadBody', L.b);
  setText('#edTitle', E.t); setText('#edBody', E.b);
  setText('#factTitle', F.t); setText('#factBody', F.b);
  renderLeadImage(null);
}

function appendArchiveOption(select, value, label){
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

async function archiveEntries(){
  try {
    const cached = JSON.parse(sessionStorage.getItem(ARCHIVE_CACHE_KEY) || 'null');
    if (cached && cached.date_key === isoDate(editionBase(new Date())) && Array.isArray(cached.editions)) {
      return cached.editions;
    }
  } catch (_) {}

  if (location.protocol === 'file:') return [];

  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`${ARCHIVE_INDEX}?t=${Date.now()}`, {
      cache:'no-store',
      signal:controller.signal
    });
    if (!response.ok) throw new Error('Arşiv listesi alınamadı');
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.editions)) throw new Error('Arşiv listesi geçersiz');
    try {
      sessionStorage.setItem(ARCHIVE_CACHE_KEY, JSON.stringify({
        date_key: isoDate(editionBase(new Date())),
        editions: payload.editions
      }));
    } catch (_) {}
    return payload.editions;
  } catch (error) {
    console.warn('EKSİM arşiv manifesti kullanılamadı:', error);
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fillArchive(){
  const select = $('#archive');
  if (!select) return;
  select.innerHTML = '';
  appendArchiveOption(select, CURRENT_EDITION, 'Bugünkü baskı');
  const currentKey = isoDate(editionBase(new Date()));
  const entries = await archiveEntries();
  entries
    .filter(entry => entry && entry.file && entry.date_key && entry.date_key !== currentKey)
    .sort((a, b) => String(b.date_key).localeCompare(String(a.date_key)))
    .slice(0, 7)
    .forEach(entry => appendArchiveOption(select, entry.file, `Arşiv: ${entry.date || entry.date_key}`));
  select.value = CURRENT_EDITION;
}

const archiveSelect = $('#archive');
if (archiveSelect) {
  archiveSelect.addEventListener('change', async event => {
    const requestedFile = event.target.value || CURRENT_EDITION;
    const previousFile = activeEditionPath;
    event.target.disabled = true;
    event.target.setAttribute('aria-busy', 'true');
    const loaded = await loadEdition(requestedFile, {preserveOnError:true});
    if (!loaded) event.target.value = previousFile;
    event.target.disabled = false;
    event.target.removeAttribute('aria-busy');
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
  time.textContent = item.time || '';
  const title = document.createElement('b');
  title.textContent = item.title;
  const desc = document.createElement('span');
  desc.textContent = item.desc;
  const image = createArticleImage(item.image, 'news-card-image', item.title || '');
  li.append(time);
  if (image) li.appendChild(image);
  li.append(title, desc);

  if (item.url && item.url !== '#') {
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
      const published = /^\d{4}-\d{2}-\d{2}$/.test(item.published_at || '')
        ? item.published_at.split('-').reverse().join('.')
        : '';
      newsByCategory[cat].push({...item, live:false, time:published});
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
  renderedSignature = 'fallback';
  hasRenderedContent = true;
}

function readCachedEdition(){
  try {
    const data = JSON.parse(sessionStorage.getItem(EDITION_CACHE_KEY) || 'null');
    return data && data.date_key === isoDate(editionBase(new Date())) ? data : null;
  } catch (_) {
    return null;
  }
}

function applyEdition(data, filePath = CURRENT_EDITION){
  const signature = JSON.stringify(data);
  if (signature === renderedSignature) {
    activeEditionPath = filePath;
    return;
  }
  document.documentElement.classList.add('edition-updating');
  liveEdition = data;
  activeEditionPath = filePath;
  render();
  renderNews(data.news);
  renderedSignature = signature;
  hasRenderedContent = true;
  requestAnimationFrame(() => document.documentElement.classList.remove('edition-updating'));
  if (filePath === CURRENT_EDITION) {
    try { sessionStorage.setItem(EDITION_CACHE_KEY, signature); } catch (_) {}
  }
}

function validateEdition(data, requestedFile){
  if (!data || typeof data !== 'object') throw new Error('Geçersiz baskı verisi');
  if (!data.lead || !data.fact || !data.news) throw new Error('Eksik baskı alanları');
  NEWS_CATEGORIES.forEach(cat => {
    if (!Array.isArray(data.news[cat])) throw new Error(`Eksik haber kategorisi: ${cat}`);
  });
  const archiveMatch = requestedFile.match(/eksim_(\d{4}-\d{2}-\d{2})\.json(?:\?|$)/);
  if (archiveMatch && data.date_key !== archiveMatch[1]) {
    throw new Error(`Arşiv tarihi uyuşmuyor: ${archiveMatch[1]}`);
  }
}

async function loadEdition(filePath = CURRENT_EDITION, options = {}){
  const requestId = ++editionRequestId;
  try {
    const separator = filePath.includes('?') ? '&' : '?';
    const res = await fetch(`${filePath}${separator}t=${Date.now()}`, {cache:'no-store'});
    if (!res.ok) throw new Error('Veri alınamadı: ' + filePath);
    const data = await res.json();
    validateEdition(data, filePath);
    if (requestId !== editionRequestId) return false;

    applyEdition(data, filePath);
    return true;
  } catch (err) {
    console.warn('EKSİM baskısı yüklenemedi:', err);
    if (!options.preserveOnError && !hasRenderedContent && requestId === editionRequestId) showStaticFallback();
    return false;
  }
}

async function init(){
  const cachedEdition = readCachedEdition();
  if (cachedEdition) applyEdition(cachedEdition);
  else showStaticFallback();

  const editionPromise = loadEdition(CURRENT_EDITION);
  const archivePromise = fillArchive();
  const loaded = await editionPromise;
  if (archiveSelect) archiveSelect.value = loaded ? CURRENT_EDITION : activeEditionPath;
  archivePromise.catch(error => console.warn('Arşiv seçici hazırlanamadı:', error));
  loadAdminNote();
}

init();

})();
