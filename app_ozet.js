(() => {
'use strict';

const $ = selector => document.querySelector(selector);
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
function findFeaturedItem(edition) {
  const leadTitle = String(edition?.lead?.title || '').trim().toLocaleLowerCase('tr-TR');
  const items = Object.values(edition?.news || {}).flatMap(group => Array.isArray(group) ? group : []);
  return items.find(item => String(item.title || '').trim().toLocaleLowerCase('tr-TR') === leadTitle)
    || items.find(item => validImageUrl(item.image));
}
function renderLeadImage(edition) {
  const lead = $('.lead');
  if (!lead) return;
  lead.querySelector('.lead-image')?.remove();
  const item = findFeaturedItem(edition);
  const image = createArticleImage(item?.image, 'lead-image', item?.title || edition?.lead?.title || '');
  if (image) lead.insertBefore(image, lead.querySelector('#leadTitle'));
}

const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const DAYS = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const START_DATE = new Date(2026, 10, 11);
const MAX_ARCHIVE_DAYS = 7;
const pad = value => String(value).padStart(2, '0');

const SOURCES = [
  {
    key: 'eksim',
    label: 'EKSİM',
    current: 'data/edition_eksim.json',
    archive: dateKey => `data/archive/eksim_${dateKey}.json`,
    list: '#summaryEksim'
  },
  {
    key: 'ai',
    label: 'YAPAY ZEKA',
    current: 'data/edition.json',
    archive: dateKey => `data/archive/${dateKey}.json`,
    list: '#summaryAi'
  },
  {
    key: 'energy',
    label: 'ELEKTRİK & ENERJİ',
    current: 'data/edition_enerji.json',
    archive: dateKey => `data/archive/enerji_${dateKey}.json`,
    list: '#summaryEnergy'
  }
];

const FALLBACK = {
  eksim: {
    lead: {
      title: 'EKSİM gündemi',
      deck: 'Kurumsal gelişmeler ve grup şirketlerinden öne çıkan başlıklar.',
      body: 'EKSİM ve grup şirketlerinin güncel gündemi bu bölümde özetlenir.'
    },
    fact: { title: 'Sürdürülebilir Değer', body: 'Ekonomik performansı çevresel ve toplumsal sorumlulukla birlikte geliştirme yaklaşımıdır.' },
    news: {}
  },
  ai: {
    lead: {
      title: 'Yapay Zeka gündemi',
      deck: 'Yapay zeka, açık kaynak, web ve siber güvenlik alanlarından öne çıkanlar.',
      body: 'Yapay zeka ve yazılım dünyasının güncel gelişmeleri bu bölümde özetlenir.'
    },
    fact: { title: 'İnsan Denetimi', body: 'Otomatik sistemlerin sonuçlarını amaç, güvenlik ve kalite açısından doğrulayan kontrol katmanıdır.' },
    news: {}
  },
  energy: {
    lead: {
      title: 'Elektrik & Enerji gündemi',
      deck: 'Şebeke, yenilenebilir enerji, depolama ve piyasa gelişmelerinden öne çıkanlar.',
      body: 'Elektrik ve enerji sektörünün güncel gelişmeleri bu bölümde özetlenir.'
    },
    fact: { title: 'Şebeke Dengesi', body: 'Elektrik üretimi ile tüketimin her an dengede tutulmasıdır.' },
    news: {}
  }
};

let activeEditions = {};
let selectedDateKey = 'current';
let renderedSignature = '';
const SUMMARY_CACHE_KEY = 'myo:edition:summary:v1';

function editionBase(now) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < 7) date.setDate(date.getDate() - 1);
  return date < START_DATE ? new Date(START_DATE) : date;
}

function dayIndex(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateLabel(date, includeDay = true) {
  const value = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return includeDay ? `${value}, ${DAYS[date.getDay()]}` : value;
}

function dateFromKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) return editionBase(new Date());
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function fillArchive() {
  const select = $('#archive');
  if (!select) return;
  select.innerHTML = '';

  const today = document.createElement('option');
  today.value = 'current';
  today.textContent = 'Bugünkü baskı';
  select.appendChild(today);

  const base = editionBase(new Date());
  const availableDays = Math.min(MAX_ARCHIVE_DAYS, Math.max(0, dayIndex(base) - dayIndex(START_DATE)));
  for (let daysAgo = 1; daysAgo <= availableDays; daysAgo++) {
    const date = new Date(base);
    date.setDate(date.getDate() - daysAgo);
    const option = document.createElement('option');
    option.value = isoDate(date);
    option.textContent = `Arşiv: ${dateLabel(date, false)}`;
    select.appendChild(option);
  }
  select.value = 'current';
}

function tick() {
  const clock = $('#clock');
  if (!clock) return;
  const now = new Date();
  clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function fetchJson(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, {cache:'no-store'});
  if (!response.ok) throw new Error(`Veri alınamadı: ${path}`);
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error(`Geçersiz veri: ${path}`);
  return data;
}

async function loadEditionSet(dateKey = 'current') {
  const results = await Promise.allSettled(
    SOURCES.map(source => fetchJson(dateKey === 'current' ? source.current : source.archive(dateKey)))
  );

  const loaded = {};
  results.forEach((result, index) => {
    const source = SOURCES[index];
    if (result.status === 'fulfilled') {
      loaded[source.key] = result.value;
    } else {
      console.warn(`${source.label} özeti yüklenemedi:`, result.reason);
    }
  });

  if (!Object.keys(loaded).length) return false;
  applyEditionSet(loaded, dateKey, dateKey === 'current');
  return true;
}

function readCachedEditionSet() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(SUMMARY_CACHE_KEY) || 'null');
    if (!cached || typeof cached !== 'object') return null;
    const canonical = cached.ai || cached.eksim || cached.energy;
    return canonical && canonical.date_key === isoDate(editionBase(new Date())) ? cached : null;
  } catch (_) {
    return null;
  }
}

function applyEditionSet(editions, dateKey = 'current', cacheCurrent = false) {
  const signature = JSON.stringify({dateKey, editions});
  if (signature === renderedSignature) return;
  activeEditions = editions;
  selectedDateKey = dateKey;
  render();
  renderedSignature = signature;
  if (cacheCurrent) {
    try { sessionStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(editions)); } catch (_) {}
  }
}

function availableSources() {
  return SOURCES.filter(source => activeEditions[source.key]);
}

function editionFor(source) {
  return activeEditions[source.key] || FALLBACK[source.key];
}

function activeEditionDate() {
  if (selectedDateKey !== 'current') return dateFromKey(selectedDateKey);
  const canonical = activeEditions.ai || activeEditions.eksim || activeEditions.energy || {};
  return canonical.date_key ? dateFromKey(canonical.date_key) : editionBase(new Date());
}

function firstSentence(value, maxLength = 260) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const match = clean.match(/^.*?[.!?](?:\s|$)/);
  const sentence = match ? match[0].trim() : clean;
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1).trim()}…` : sentence;
}

function sourceSummary(source) {
  const edition = editionFor(source);
  const lead = edition.lead || {};
  return firstSentence(lead.deck || lead.body || lead.title, 230) || FALLBACK[source.key].lead.body;
}

function renderHeader() {
  const sources = availableSources();
  const canonical = activeEditions.ai || activeEditions.eksim || activeEditions.energy || {};
  const issueValues = sources.map(source => Number(editionFor(source).issue)).filter(Number.isFinite);
  const fallbackDate = activeEditionDate();
  const fallbackIssue = Math.max(1, dayIndex(fallbackDate) - dayIndex(START_DATE) + 1);

  setText('#issueNo', `Sayı: ${issueValues.length ? Math.max(...issueValues) : fallbackIssue}`);
  setText('#dateLine', canonical.date || dateLabel(fallbackDate));
  setText('#quote', canonical.quote || '“Üç alan, tek bakışta günün özeti.”');
}

function renderLead() {
  const sources = availableSources();
  const fallbackSources = sources.length ? sources : SOURCES;
  const rotationDate = activeEditionDate();
  const featuredSource = fallbackSources[Math.abs(dayIndex(rotationDate)) % fallbackSources.length];
  const featuredEdition = editionFor(featuredSource);
  const featuredLead = featuredEdition.lead || FALLBACK[featuredSource.key].lead;

  renderLeadImage(featuredEdition);

  setText('#leadTitle', featuredLead.title || 'Günün Öne Çıkanları');
  setText(
    '#leadDeck',
    fallbackSources.map(source => `${source.label}: ${sourceSummary(source)}`).join(' ')
  );
  setText(
    '#leadBody',
    fallbackSources.map(source => {
      const edition = editionFor(source);
      const lead = edition.lead || {};
      return `${source.label} — ${firstSentence(lead.body || lead.deck || lead.title, 320) || FALLBACK[source.key].lead.body}`;
    }).join(' ')
  );

  const factSource = fallbackSources[(Math.abs(dayIndex(rotationDate)) + 1) % fallbackSources.length];
  const fact = editionFor(factSource).fact || FALLBACK[factSource.key].fact;
  setText('#factTitle', fact.title || 'Günün Notu');
  setText('#factBody', `${factSource.label} — ${fact.body || FALLBACK[factSource.key].fact.body}`);

  setText('#focusQuote', fallbackSources.map(source => (editionFor(source).lead || {}).title).filter(Boolean).slice(0, 3).join(' • ') || 'Günün ortak gündemi');
  setText('#focusText', 'EKSİM, Yapay Zeka ve Elektrik & Enerji başlıkları aynı tarihli baskılardan birlikte özetlenir.');
}

function collectNews(edition, limit = 4) {
  const groups = Object.values(edition.news || {}).filter(Array.isArray);
  const items = [];
  for (let row = 0; items.length < limit; row++) {
    let added = false;
    for (const group of groups) {
      if (group[row]) {
        items.push(group[row]);
        added = true;
        if (items.length === limit) break;
      }
    }
    if (!added) break;
  }
  return items;
}

function createSummaryItem(item) {
  const li = document.createElement('li');
  const title = document.createElement(item.url && item.url !== '#' ? 'a' : 'strong');
  title.textContent = item.title || 'Güncel başlık';
  if (title.tagName === 'A') {
    title.href = item.url;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
  }

  const description = document.createElement('p');
  description.textContent = item.desc || '';
  const image = createArticleImage(item.image, 'summary-item-image', item.title || '');
  if (image) li.appendChild(image);
  li.append(title, description);
  return li;
}

function renderColumns() {
  SOURCES.forEach(source => {
    const list = $(source.list);
    if (!list) return;
    list.innerHTML = '';
    const edition = activeEditions[source.key];

    if (!edition) {
      const unavailable = document.createElement('li');
      unavailable.className = 'summary-unavailable';
      unavailable.textContent = 'Bu bölümün seçilen tarihe ait verisi şu anda alınamadı.';
      list.appendChild(unavailable);
      return;
    }

    const items = collectNews(edition);
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'summary-unavailable';
      empty.textContent = 'Bu baskıda özetlenecek haber bulunamadı.';
      list.appendChild(empty);
      return;
    }
    items.forEach(item => list.appendChild(createSummaryItem(item)));
  });
}


function renderTicker() {
  const track = $('#tickerTrack');
  if (!track) return;
  track.innerHTML = '';

  const headlines = [];
  SOURCES.forEach(source => {
    const edition = activeEditions[source.key];
    if (!edition) return;
    collectNews(edition, 2).forEach(item => {
      if (item.title) headlines.push(`${source.label}: ${item.title}`);
    });
  });

  if (!headlines.length) headlines.push('MYO Gazetesi: Günün özeti hazırlanıyor.');
  headlines.forEach(headline => {
    const span = document.createElement('span');
    span.textContent = `● ${headline}`;
    track.appendChild(span);
  });
}

function render() {
  renderHeader();
  renderLead();
  renderColumns();
  renderTicker();
}

const archive = $('#archive');
if (archive) {
  archive.addEventListener('change', async event => {
    const requestedDate = event.target.value || 'current';
    const loaded = await loadEditionSet(requestedDate);
    if (!loaded) {
      console.warn('Seçilen tarihin üç özet kaynağı da yüklenemedi; bugünkü baskıya dönülüyor.');
      event.target.value = 'current';
      await loadEditionSet('current');
    }
  });
}

fillArchive();
tick();
setInterval(tick, 1000);

const cachedEditionSet = readCachedEditionSet();
if (cachedEditionSet) applyEditionSet(cachedEditionSet);

loadEditionSet('current').then(loaded => {
  if (!loaded) {
    if (!renderedSignature) applyEditionSet({}, 'current');
  }
});
})();

