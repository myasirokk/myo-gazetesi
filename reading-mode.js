(() => {
  'use strict';

  const DATASETS = [
    {key:'eksim', label:'EKSİM', path:'data/edition_eksim.json'},
    {key:'ai', label:'YAPAY ZEKA', path:'data/edition.json'},
    {key:'energy', label:'ELEKTRİK & ENERJİ', path:'data/edition_enerji.json'}
  ];
  const button = document.querySelector('#readingModeBtn');
  if (!button) return;

  let overlay = null;
  let pages = [];
  let pageIndex = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let previousFocus = null;
  let turning = false;

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const safeImage = value => {
    try {
      const url = new URL(String(value || ''), location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  };
  const groups = edition => Object.entries(edition?.news || {}).filter(([, items]) => Array.isArray(items));
  const allNews = edition => groups(edition).flatMap(([category, items]) => items.map(item => ({...item, category})));

  async function fetchEdition(source) {
    const response = await fetch(`${source.path}?t=${Date.now()}`, {cache:'no-store'});
    if (!response.ok) throw new Error(source.path);
    return response.json();
  }

  function leadImage(edition) {
    const title = clean(edition?.lead?.title).toLocaleLowerCase('tr-TR');
    const match = allNews(edition).find(item => clean(item.title).toLocaleLowerCase('tr-TR') === title && safeImage(item.image));
    return safeImage(match?.image);
  }

  function buildPages(records) {
    const byKey = Object.fromEntries(records.map(record => [record.source.key, record]));
    const ordered = DATASETS.map(source => byKey[source.key] || {source, edition:null});
    return [
      {type:'overview', section:'ÖZET', records:ordered},
      ...ordered.map(record => ({type:'edition', section:record.source.label, ...record}))
    ];
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function appendImage(parent, src, alt, className = '') {
    const url = safeImage(src);
    if (!url) return;
    const image = element('img', className);
    image.src = url;
    image.alt = alt || '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), {once:true});
    parent.appendChild(image);
  }

  function appendText(parent, value, className = '') {
    clean(value).split(/\n\s*\n/).filter(Boolean).forEach(part => parent.appendChild(element('p', className, part)));
  }

  function appendSource(parent, item) {
    if (!item?.url || item.url === '#') return;
    const link = element('a', 'reading-source', 'Haberi kaynağında aç ↗');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    parent.appendChild(link);
  }

  function createNewsCard(item) {
    const card = element('article', 'reading-news-card');
    appendImage(card, item.image, item.title, 'reading-news-image');
    card.appendChild(element('h4', '', clean(item.title) || 'Güncel haber'));
    appendText(card, item.desc);
    appendSource(card, item);
    return card;
  }

  function createInfoCard(label, data) {
    const card = element('aside', 'reading-info-card');
    card.appendChild(element('span', 'reading-card-label', label));
    card.appendChild(element('h3', '', clean(data?.title) || label));
    appendText(card, data?.body || data?.desc);
    return card;
  }

  function renderEditionContent(sheet, source, edition) {
    if (!edition) {
      sheet.appendChild(element('p', 'reading-empty', `${source.label} baskısı şu anda yüklenemedi.`));
      return;
    }
    const lead = edition.lead || {};
    const hero = element('section', 'reading-hero');
    hero.appendChild(element('p', 'reading-kicker', `${source.label} — ${clean(edition.date) || 'Bugünkü baskı'}`));
    hero.appendChild(element('h2', '', clean(lead.title) || `${source.label} Gündemi`));
    appendImage(hero, leadImage(edition), lead.title, 'reading-hero-image');
    appendText(hero, lead.deck, 'reading-deck');
    appendText(hero, lead.body);
    sheet.appendChild(hero);

    const infoGrid = element('section', 'reading-info-grid');
    if (edition.fact) infoGrid.appendChild(createInfoCard('HAP BİLGİ', edition.fact));
    if (edition.editorial) infoGrid.appendChild(createInfoCard('EDİTÖR NOTU', edition.editorial));
    if (clean(edition.quote)) {
      const quote = element('blockquote', 'reading-quote', clean(edition.quote));
      infoGrid.appendChild(quote);
    }
    if (infoGrid.childElementCount) sheet.appendChild(infoGrid);

    groups(edition).forEach(([category, items]) => {
      const section = element('section', 'reading-category');
      section.appendChild(element('h3', 'reading-category-title', category));
      const grid = element('div', 'reading-news-grid');
      items.forEach(item => grid.appendChild(createNewsCard(item)));
      section.appendChild(grid);
      sheet.appendChild(section);
    });
  }

  function renderOverviewContent(sheet, records) {
    const canonical = records.find(record => record.edition)?.edition || {};
    const hero = element('section', 'reading-hero reading-overview-hero');
    hero.appendChild(element('p', 'reading-kicker', `MYO GAZETESİ — ${clean(canonical.date) || 'Bugünkü baskı'}`));
    hero.appendChild(element('h2', '', 'Günün Özeti'));
    appendText(hero, 'EKSİM, Yapay Zeka ve Elektrik & Enerji gündeminin tamamı dört sayfalık okuma akışında bir araya getirildi.', 'reading-deck');
    sheet.appendChild(hero);

    records.forEach(({source, edition}) => {
      const section = element('section', 'reading-summary-section');
      section.appendChild(element('h3', 'reading-category-title', source.label));
      if (!edition) {
        section.appendChild(element('p', 'reading-empty', 'Bu bölümün baskısı şu anda yüklenemedi.'));
        sheet.appendChild(section);
        return;
      }
      const lead = edition.lead || {};
      const summary = element('article', 'reading-summary-lead');
      appendImage(summary, leadImage(edition), lead.title, 'reading-summary-image');
      const copy = element('div', 'reading-summary-copy');
      copy.appendChild(element('h4', '', clean(lead.title) || `${source.label} Gündemi`));
      appendText(copy, lead.deck || lead.body);
      summary.appendChild(copy);
      section.appendChild(summary);

      if (edition.fact) section.appendChild(createInfoCard('HAP BİLGİ / NOT', edition.fact));
      const grid = element('div', 'reading-news-grid reading-summary-news');
      allNews(edition).slice(0, 4).forEach(item => grid.appendChild(createNewsCard(item)));
      if (grid.childElementCount) section.appendChild(grid);
      sheet.appendChild(section);
    });
  }

  function createSheet(page) {
    const sheet = element('article', 'reading-page');
    sheet.tabIndex = 0;
    sheet.dataset.section = page.section;
    if (page.type === 'overview') renderOverviewContent(sheet, page.records);
    else renderEditionContent(sheet, page.source, page.edition);
    return sheet;
  }

  function createOverlay() {
    const root = element('section', 'reading-mode');
    root.id = 'readingMode';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'MYO Gazetesi Okuma Modu');
    root.innerHTML = `
      <header class="reading-toolbar">
        <strong>MYO GAZETESİ</strong>
        <span id="readingSection">ÖZET</span>
        <span id="readingProgress" aria-live="polite">1 / 4</span>
        <button type="button" id="readingClose" aria-label="Okuma Modundan çık">✕ Çıkış</button>
      </header>
      <div class="reading-stage">
        <button type="button" class="reading-arrow reading-prev" aria-label="Önceki sayfa">‹</button>
        <div class="reading-book" id="readingBook"></div>
        <button type="button" class="reading-arrow reading-next" aria-label="Sonraki sayfa">›</button>
      </div>
      <footer class="reading-footer">Ok tuşlarıyla veya yatay kaydırarak sayfa çevirin; her sayfayı dikey kaydırarak okuyun.</footer>`;
    document.body.appendChild(root);
    root.querySelector('#readingClose').addEventListener('click', closeReader);
    root.querySelector('.reading-prev').addEventListener('click', () => changePage(-1));
    root.querySelector('.reading-next').addEventListener('click', () => changePage(1));
    root.addEventListener('touchstart', event => {
      touchStartX = event.changedTouches[0].clientX;
      touchStartY = event.changedTouches[0].clientY;
    }, {passive:true});
    root.addEventListener('touchend', event => {
      const distanceX = event.changedTouches[0].clientX - touchStartX;
      const distanceY = event.changedTouches[0].clientY - touchStartY;
      if (Math.abs(distanceX) > 60 && Math.abs(distanceX) > Math.abs(distanceY) * 1.35) {
        changePage(distanceX < 0 ? 1 : -1);
      }
    }, {passive:true});
    return root;
  }

  function updateControls() {
    if (!overlay) return;
    overlay.querySelector('#readingSection').textContent = pages[pageIndex].section;
    overlay.querySelector('#readingProgress').textContent = `${pageIndex + 1} / 4`;
    overlay.querySelector('.reading-prev').disabled = pageIndex === 0 || turning;
    overlay.querySelector('.reading-next').disabled = pageIndex === 3 || turning;
  }

  async function changePage(direction) {
    const nextIndex = Math.min(3, Math.max(0, pageIndex + direction));
    if (!overlay || turning || nextIndex === pageIndex) return;
    turning = true;
    updateControls();
    const book = overlay.querySelector('#readingBook');
    const current = book.querySelector('.reading-page');
    const incoming = createSheet(pages[nextIndex]);
    incoming.scrollTop = 0;
    incoming.classList.add('reading-page-incoming', direction > 0 ? 'from-right' : 'from-left');
    book.appendChild(incoming);

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current?.remove();
    } else {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      current?.classList.add('reading-page-turning', direction > 0 ? 'turn-forward' : 'turn-backward');
      incoming.classList.add('is-arriving');
      await new Promise(resolve => setTimeout(resolve, 720));
      current?.remove();
    }
    incoming.className = 'reading-page';
    incoming.scrollTop = 0;
    pageIndex = nextIndex;
    turning = false;
    updateControls();
    incoming.focus({preventScroll:true});
  }

  async function openReader() {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const results = await Promise.allSettled(DATASETS.map(async source => ({source, edition:await fetchEdition(source)})));
      const records = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (!records.length) throw new Error('Baskı verileri yüklenemedi.');
      pages = buildPages(records);
      pageIndex = 0;
      previousFocus = document.activeElement;
      overlay = createOverlay();
      document.documentElement.classList.add('reading-mode-open');
      overlay.querySelector('#readingBook').appendChild(createSheet(pages[0]));
      updateControls();
      overlay.querySelector('#readingClose').focus();
      if (overlay.requestFullscreen) overlay.requestFullscreen().catch(() => {});
    } catch (error) {
      console.error('Okuma Modu açılamadı:', error);
      alert('Okuma Modu şu anda açılamadı. Lütfen baskı verilerini kontrol edin.');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  function closeReader() {
    if (!overlay) return;
    const oldOverlay = overlay;
    overlay = null;
    turning = false;
    document.documentElement.classList.remove('reading-mode-open');
    oldOverlay.remove();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    previousFocus?.focus?.();
  }

  document.addEventListener('keydown', event => {
    if (!overlay) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); changePage(1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); changePage(-1); }
    if (event.key === 'Escape') { event.preventDefault(); closeReader(); }
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (overlay && !document.fullscreenElement) closeReader();
  });
  button.addEventListener('click', openReader);
})();
