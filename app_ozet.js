(() => {
'use strict';

const $ = selector => document.querySelector(selector);
const setText = (selector, value) => {
  const element = $(selector);
  if (element) element.textContent = value ?? '';
};

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


const DEFAULT_PUZZLE = [
  ['PROMPT',0,0,'a','Yapay zekaya verilen komut metni'],
  ['PYTHON',0,0,'d','Yapay zeka dünyasında yaygın programlama dili'],
  ['TOKEN',0,5,'d','Dil modelinin metni böldüğü en küçük birim'],
  ['OPTION',4,0,'a','Seçenek veya ayar anlamındaki İngilizce sözcük'],
  ['IDE',4,3,'d','Kod geliştirme ortamının kısaltması'],
  ['EPOCH',6,3,'a','Eğitim verisinin bir tam geçişi'],
  ['HASH',6,7,'d','Veriden çıkarılan sabit uzunluklu özet'],
  ['HTTP',9,7,'a','Web iletişiminin temel protokolü']
];

let currentPuzzleWords = DEFAULT_PUZZLE;
let puzzleInputs = {};
let puzzleCells = {};
let puzzleNumbers = {};
let puzzlePosition = { r: 0, c: 0 };
let puzzleDirection = 'a';
const PUZZLE_ROWS = 10;
const PUZZLE_COLS = 11;

function initPuzzle(words) {
  currentPuzzleWords = Array.isArray(words) && words.length ? words : DEFAULT_PUZZLE;
  puzzleCells = {};
  puzzleNumbers = {};
  puzzleInputs = {};

  const grid = $('#grid');
  if (!grid) return;
  const acrossClues = $('#clueA');
  const downClues = $('#clueD');
  const answers = $('#answers');
  setText('#score', '');
  grid.innerHTML = '';
  if (acrossClues) acrossClues.innerHTML = '';
  if (downClues) downClues.innerHTML = '';
  if (answers) answers.innerHTML = '';

  currentPuzzleWords.forEach(([word, row, column, direction]) => {
    [...word].forEach((letter, index) => {
      const key = (row + (direction === 'd' ? index : 0)) + ',' + (column + (direction === 'a' ? index : 0));
      puzzleCells[key] = { letter };
    });
  });

  let counter = 0;
  for (let row = 0; row < PUZZLE_ROWS; row++) {
    for (let column = 0; column < PUZZLE_COLS; column++) {
      if (currentPuzzleWords.some(word => word[1] === row && word[2] === column)) {
        puzzleNumbers[row + ',' + column] = ++counter;
      }
    }
  }

  for (let row = 0; row < PUZZLE_ROWS; row++) {
    for (let column = 0; column < PUZZLE_COLS; column++) {
      const key = row + ',' + column;
      const cell = document.createElement('div');
      if (!puzzleCells[key]) {
        cell.className = 'cell block';
        grid.appendChild(cell);
        continue;
      }
      cell.className = 'cell';
      cell.dataset.k = key;
      if (puzzleNumbers[key]) {
        const number = document.createElement('span');
        number.className = 'n';
        number.textContent = puzzleNumbers[key];
        cell.appendChild(number);
      }

      const input = document.createElement('input');
      input.maxLength = 2;
      input.autocomplete = 'off';
      input.autocapitalize = 'characters';
      input.spellcheck = false;
      input.inputMode = 'text';
      input.addEventListener('click', () => {
        if (puzzlePosition.r === row && puzzlePosition.c === column) {
          puzzleDirection = puzzleDirection === 'a' ? 'd' : 'a';
        }
        selectPuzzleCell(row, column);
      });
      input.addEventListener('focus', () => selectPuzzleCell(row, column, true));
      input.addEventListener('input', () => {
        input.value = input.value
          .replace(/[^a-zA-ZığüşöçİĞÜŞÖÇ]/g, '')
          .slice(-1)
          .toLocaleUpperCase('tr-TR');
        clearPuzzleMarks();
        if (input.value) stepPuzzleCell(row, column, 1);
      });
      input.addEventListener('keydown', event => onPuzzleKey(event, row, column, input));
      cell.appendChild(input);
      grid.appendChild(cell);
      puzzleInputs[key] = input;
    }
  }

  currentPuzzleWords.forEach(([word, row, column, direction, clue]) => {
    const number = puzzleNumbers[row + ',' + column];
    const item = document.createElement('li');
    const bold = document.createElement('b');
    bold.textContent = number + '.';
    item.append(bold, ' ' + clue + ` (${word.length})`);
    const clueList = direction === 'a' ? acrossClues : downClues;
    if (clueList) clueList.appendChild(item);
    if (answers) {
      const answer = document.createElement('div');
      answer.textContent = `${number} ${direction === 'a' ? 'Yatay' : 'Aşağı'}: ${word}`;
      answers.appendChild(answer);
    }
  });
}

function wordAtPuzzleCell(row, column, direction) {
  return currentPuzzleWords.find(([word, wordRow, wordColumn, wordDirection]) => (
    wordDirection === direction &&
    (direction === 'a'
      ? row === wordRow && column >= wordColumn && column < wordColumn + word.length
      : column === wordColumn && row >= wordRow && row < wordRow + word.length)
  ));
}

function selectPuzzleCell(row, column, keepFocus = false) {
  puzzlePosition = { r: row, c: column };
  if (!wordAtPuzzleCell(row, column, puzzleDirection)) {
    puzzleDirection = puzzleDirection === 'a' ? 'd' : 'a';
  }
  document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('word', 'cur'));
  const word = wordAtPuzzleCell(row, column, puzzleDirection);
  if (word) {
    [...word[0]].forEach((_, index) => {
      const key = (word[1] + (puzzleDirection === 'd' ? index : 0)) + ',' +
        (word[2] + (puzzleDirection === 'a' ? index : 0));
      if (puzzleInputs[key]) puzzleInputs[key].parentElement.classList.add('word');
    });
  }
  const input = puzzleInputs[row + ',' + column];
  if (input) {
    input.parentElement.classList.add('cur');
    if (!keepFocus) {
      input.focus();
      input.select();
    }
  }
}

function stepPuzzleCell(row, column, step) {
  const nextRow = row + (puzzleDirection === 'd' ? step : 0);
  const nextColumn = column + (puzzleDirection === 'a' ? step : 0);
  if (puzzleInputs[nextRow + ',' + nextColumn]) selectPuzzleCell(nextRow, nextColumn);
}

function onPuzzleKey(event, row, column, input) {
  const movement = {
    ArrowRight: [0, 1, 'a'],
    ArrowLeft: [0, -1, 'a'],
    ArrowDown: [1, 0, 'd'],
    ArrowUp: [-1, 0, 'd']
  }[event.key];

  if (movement) {
    event.preventDefault();
    puzzleDirection = movement[2];
    const nextKey = (row + movement[0]) + ',' + (column + movement[1]);
    if (puzzleInputs[nextKey]) selectPuzzleCell(row + movement[0], column + movement[1]);
    else selectPuzzleCell(row, column);
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    clearPuzzleMarks();
    if (input.value) {
      input.value = '';
    } else {
      stepPuzzleCell(row, column, -1);
      const previous = puzzleInputs[puzzlePosition.r + ',' + puzzlePosition.c];
      if (previous) previous.value = '';
    }
  } else if (event.key === 'Enter') {
    event.preventDefault();
    checkPuzzle();
  }
}

function clearPuzzleMarks() {
  document.querySelectorAll('.cell.ok,.cell.bad').forEach(cell => cell.classList.remove('ok', 'bad'));
  setText('#score', '');
}

function checkPuzzle() {
  let correct = 0;
  let filled = 0;
  const total = Object.keys(puzzleCells).length;
  Object.keys(puzzleCells).forEach(key => {
    const value = puzzleInputs[key].value.toLocaleUpperCase('tr-TR');
    const cell = puzzleInputs[key].parentElement;
    cell.classList.remove('ok', 'bad');
    if (!value) return;
    filled++;
    if (value === puzzleCells[key].letter) {
      correct++;
      cell.classList.add('ok');
    } else {
      cell.classList.add('bad');
    }
  });
  setText(
    '#score',
    correct === total
      ? `Tebrikler! ${correct}/${total} kutu doğru, bulmaca çözüldü.`
      : `${correct}/${total} doğru, ${filled - correct} yanlış, ${total - filled} boş.`
  );
}

function renderPuzzle() {
  const aiPuzzle = activeEditions.ai && activeEditions.ai.puzzle;
  initPuzzle(Array.isArray(aiPuzzle) && aiPuzzle.length ? aiPuzzle : DEFAULT_PUZZLE);
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
  renderPuzzle();
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

const checkButton = $('#checkBtn');
if (checkButton) checkButton.addEventListener('click', checkPuzzle);

const clearButton = $('#clearBtn');
if (clearButton) {
  clearButton.addEventListener('click', () => {
    Object.values(puzzleInputs).forEach(input => { input.value = ''; });
    clearPuzzleMarks();
    selectPuzzleCell(0, 0);
  });
}

const cachedEditionSet = readCachedEditionSet();
if (cachedEditionSet) applyEditionSet(cachedEditionSet);

loadEditionSet('current').then(loaded => {
  if (!loaded) {
    if (!renderedSignature) applyEditionSet({}, 'current');
  }
});
})();

