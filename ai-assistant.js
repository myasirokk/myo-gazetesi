(() => {
  'use strict';

  let triggerButton = null;

  const DATASETS = [
    {key:'eksim', label:'EKSİM', path:'data/edition_eksim.json'},
    {key:'ai', label:'YAPAY ZEKA', path:'data/edition.json'},
    {key:'energy', label:'ELEKTRİK & ENERJİ', path:'data/edition_enerji.json'}
  ];
  const TEXT_TYPES = new Set(['text/plain','text/csv','text/markdown','application/json']);
  const TEXT_EXTENSIONS = /\.(?:txt|csv|md|markdown|json)$/i;
  const STOP_WORDS = new Set(['acaba','ama','bir','bu','da','de','daha','en','gibi','hakkında','hangi','için','ile','mi','mı','mu','mü','ne','nedir','olan','olarak','ve','veya']);

  const state = {
    panel:null, editions:[], articles:[], attachments:[], previousFocus:null,
    listening:false, speakResponses:false, recognition:null, loading:null,
    pending:new Map(), requestNo:0, history:[]
  };

  const Providers = {
    registry:new Map(), active:null,
    register(name, provider) {
      if (!name || typeof provider?.ask !== 'function') throw new TypeError('Sağlayıcı ask() metodu sunmalıdır.');
      this.registry.set(name, provider);
      if (!this.active) this.active = name;
    },
    use(name) {
      if (!this.registry.has(name)) throw new Error(`Bilinmeyen sağlayıcı: ${name}`);
      this.active = name;
    },
    async ask(request) {
      const provider = this.registry.get(this.active);
      return provider ? provider.ask(request) : null;
    }
  };

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const safeUrl = value => {
    try {
      const url = new URL(String(value || ''), location.href);
      return /^(?:https?:|blob:)$/.test(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  };
  const tokens = value => clean(value).toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
    .split(/\s+/).filter(word => word.length > 2 && !STOP_WORDS.has(word));

  async function fetchEdition(source) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    try {
      const response = await fetch(`${source.path}?t=${Date.now()}`, {cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error(source.path);
      return {source, edition:await response.json()};
    } finally { clearTimeout(timeout); }
  }

  function indexEditions(records) {
    state.editions = records;
    state.articles = records.flatMap(({source, edition}) => {
      const lead = edition?.lead || {};
      const leadRecord = clean(lead.title) ? [{
        section:source.label, category:'Manşet', title:clean(lead.title),
        desc:clean(lead.deck || lead.body), body:clean(lead.body), url:'', image:''
      }] : [];
      const news = Object.entries(edition?.news || {}).flatMap(([category, items]) =>
        Array.isArray(items) ? items.map(item => ({
          section:source.label, category, title:clean(item.title), desc:clean(item.desc),
          body:'', url:safeUrl(item.url), image:safeUrl(item.image)
        })) : []
      );
      return [...leadRecord, ...news];
    });
  }

  async function ensureLocalData() {
    if (state.articles.length) return;
    if (!state.loading) {
      state.loading = Promise.allSettled(DATASETS.map(fetchEdition)).then(results => {
        const records = results.filter(result => result.status === 'fulfilled').map(result => result.value);
        indexEditions(records);
        return records;
      }).finally(() => { state.loading = null; });
    }
    await state.loading;
  }

  function localSearch(query, limit = 5) {
    const queryTokens = tokens(query);
    if (!queryTokens.length) return [];
    return state.articles.map(article => {
      const title = article.title.toLocaleLowerCase('tr-TR');
      const body = `${article.title} ${article.desc} ${article.body} ${article.section} ${article.category}`.toLocaleLowerCase('tr-TR');
      const score = queryTokens.reduce((total, token) => total + (title.includes(token) ? 5 : 0) + (body.includes(token) ? 2 : 0), 0);
      return {article, score};
    }).filter(result => result.score > 0)
      .sort((a,b) => b.score - a.score || b.article.desc.length - a.article.desc.length)
      .slice(0, limit).map(result => result.article);
  }

  function articleKey(article) {
    return clean(article.url || article.title).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]/gi, '');
  }

  function uniqueArticles(items, limit = 8) {
    const seen = new Set();
    return items.filter(item => {
      const key = articleKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
  }

  function yearRange(query) {
    const match = clean(query).match(/\b(19\d{2}|20\d{2})\b/);
    if (!match) return {};
    return {year:match[1], start:`${match[1]}0101000000`, end:`${match[1]}1231235959`};
  }

  async function googleNewsSearch(query, signal) {
    const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=tr&gl=TR&ceid=TR:tr`;
    const response = await fetch(rss, {signal, headers:{Accept:'application/rss+xml, application/xml, text/xml'}});
    if (!response.ok) return [];
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (xml.querySelector('parsererror')) return [];
    return [...xml.querySelectorAll('item')].slice(0, 8).map(item => ({
      section:'WEB', category:'Google Haberler',
      title:clean(item.querySelector('title')?.textContent).replace(/\s+-\s+[^-]+$/, ''),
      desc:clean(item.querySelector('description')?.textContent),
      url:safeUrl(item.querySelector('link')?.textContent), image:'',
      publishedAt:clean(item.querySelector('pubDate')?.textContent)
    }));
  }

  async function gdeltSearch(query, signal) {
    const range = yearRange(query);
    const params = new URLSearchParams({query, mode:'ArtList', maxrecords:'10', format:'json', sort:range.year ? 'HybridRel' : 'DateDesc'});
    if (range.start) { params.set('startdatetime', range.start); params.set('enddatetime', range.end); }
    const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, {signal});
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.articles || []).map(item => ({
      section:'WEB', category:item.domain || 'GDELT Haber Arşivi',
      title:clean(item.title), desc:clean(item.seendate ? `Yayın tarihi: ${item.seendate}` : ''),
      url:safeUrl(item.url), image:safeUrl(item.socialimage), publishedAt:item.seendate || ''
    }));
  }

  async function wikipediaSearch(query, signal) {
    const params = new URLSearchParams({
      action:'query', generator:'search', gsrsearch:query, gsrlimit:'5',
      prop:'extracts|pageimages|info', exintro:'1', explaintext:'1', exsentences:'2',
      piprop:'thumbnail', pithumbsize:'640', inprop:'url', format:'json', origin:'*'
    });
    const response = await fetch(`https://tr.wikipedia.org/w/api.php?${params}`, {signal});
    if (!response.ok) return [];
    const payload = await response.json();
    return Object.values(payload.query?.pages || {}).map(item => ({
      section:'WEB', category:'Vikipedi', title:clean(item.title), desc:clean(item.extract),
      url:safeUrl(item.fullurl), image:safeUrl(item.thumbnail?.source)
    }));
  }

  async function webSearch(query, signal) {
    const timeoutController = new AbortController();
    const abort = () => timeoutController.abort();
    signal?.addEventListener('abort', abort, {once:true});
    const timeout = setTimeout(abort, 1500);
    try {
      const searches = [
        googleNewsSearch(query, timeoutController.signal),
        gdeltSearch(query, timeoutController.signal),
        wikipediaSearch(query, timeoutController.signal)
      ];
      const results = await Promise.allSettled(searches);
      if (signal?.aborted) throw new DOMException('Arama iptal edildi.', 'AbortError');
      return uniqueArticles(results.flatMap(result => result.status === 'fulfilled' ? result.value : []), 8);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  function createNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function renderCard(card) {
    const article = createNode('article', 'ai-news-card');
    const cardImage = safeUrl(card.image);
    if (cardImage) {
      const image = createNode('img', 'ai-news-image');
      image.src = cardImage;
      image.alt = card.title || '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), {once:true});
      article.appendChild(image);
    }
    article.appendChild(createNode('span', 'ai-news-meta', [card.section, card.category].filter(Boolean).join(' • ')));
    article.appendChild(createNode('h4', '', card.title || 'Haber'));
    if (card.desc) article.appendChild(createNode('p', '', card.desc));
    const cardUrl = safeUrl(card.url);
    if (cardUrl) {
      const link = createNode('a', 'ai-news-link', 'Kaynağı aç ↗');
      link.href = cardUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      article.appendChild(link);
    }
    return article;
  }

  function addMessage(role, payload) {
    const history = state.panel?.querySelector('#aiAssistantHistory');
    if (!history) return;
    const wrapper = createNode('article', `ai-message ai-message-${role}`);
    wrapper.setAttribute('aria-label', role === 'user' ? 'Siz' : 'Yapay Zekâ Asistanı');
    const label = createNode('span', 'ai-message-label', role === 'user' ? 'SİZ' : 'MYO ASİSTAN');
    wrapper.appendChild(label);
    if (typeof payload === 'string') wrapper.appendChild(createNode('p', '', payload));
    else {
      if (payload.text) wrapper.appendChild(createNode('p', '', payload.text));
      const messageImage = safeUrl(payload.image);
      if (messageImage) {
        const image = createNode('img', 'ai-message-image');
        image.src = messageImage;
        image.alt = payload.imageAlt || '';
        image.loading = 'lazy';
        wrapper.appendChild(image);
      }
      const messageUrl = safeUrl(payload.link?.url);
      if (messageUrl) {
        const link = createNode('a', 'ai-message-link', payload.link.label || 'Bağlantıyı aç ↗');
        link.href = messageUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        wrapper.appendChild(link);
      }
      if (Array.isArray(payload.cards) && payload.cards.length) {
        const cards = createNode('div', 'ai-news-cards');
        payload.cards.forEach(card => cards.appendChild(renderCard(card)));
        wrapper.appendChild(cards);
      }
    }
    history.appendChild(wrapper);
    history.scrollTop = history.scrollHeight;
    state.history.push({
      role,
      content:clean(typeof payload === 'string' ? payload : payload?.text),
      sources:Array.isArray(payload?.cards) ? payload.cards.map(card => ({
        title:card.title || '', url:card.url || '', image:card.image || ''
      })) : []
    });
    if (state.history.length > 30) state.history.splice(0, state.history.length - 30);
    if (role === 'assistant' && state.speakResponses) speak(clean(typeof payload === 'string' ? payload : payload.text));
  }

  function setStatus(message, isError = false) {
    const status = state.panel?.querySelector('#aiAssistantStatus');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', isError);
  }

  function attachmentContext() {
    return state.attachments.map(file => ({
      name:file.name, type:file.type, size:file.size, text:file.text || '',
      image:file.image || '', note:file.note || ''
    }));
  }

  function renderAttachments() {
    const list = state.panel?.querySelector('#aiAttachmentList');
    if (!list) return;
    list.replaceChildren();
    state.attachments.forEach((file, index) => {
      const chip = createNode('span', 'ai-attachment-chip');
      chip.appendChild(createNode('span', '', `📎 ${file.name}`));
      const remove = createNode('button', '', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `${file.name} dosyasını kaldır`);
      remove.addEventListener('click', () => {
        const [removed] = state.attachments.splice(index, 1);
        if (removed?.image?.startsWith('blob:')) URL.revokeObjectURL(removed.image);
        renderAttachments();
      });
      chip.appendChild(remove);
      list.appendChild(chip);
    });
  }

  async function handleFiles(fileList) {
    for (const file of [...fileList]) {
      const record = {name:file.name, type:file.type || 'bilinmiyor', size:file.size, text:'', image:'', note:''};
      if (TEXT_TYPES.has(file.type) || TEXT_EXTENSIONS.test(file.name)) {
        try { record.text = (await file.text()).slice(0, 100000); }
        catch (_) { setStatus(`${file.name} okunamadı.`, true); }
      } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        if (window.pdfjsLib?.getDocument) {
          try {
            const pdf = await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
            const pages = [];
            for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 30); pageNo++) {
              const page = await pdf.getPage(pageNo);
              const content = await page.getTextContent();
              pages.push(content.items.map(item => item.str).join(' '));
            }
            record.text = pages.join('\n').slice(0, 100000);
            record.note = `${Math.min(pdf.numPages, 30)} PDF sayfasının metni okundu.`;
          } catch (_) { record.note = 'PDF seçildi; metin katmanı okunamadı.'; }
        } else record.note = 'PDF dosya bağlamına eklendi; PDF.js varsa metni otomatik okunur.';
      } else if (file.type.startsWith('image/')) {
        record.image = URL.createObjectURL(file);
        record.note = 'Görsel dosya bağlamına eklendi.';
      }
      state.attachments.push(record);
    }
    renderAttachments();
    setStatus(`${state.attachments.length} dosya bağlama eklendi.`);
  }

  function casualReply(question) {
    const value = clean(question).toLocaleLowerCase('tr-TR').replace(/[!?.,]/g, '');
    if (/^(merhaba|selam|selamlar|hey|günaydın|iyi akşamlar|iyi geceler)( nasılsın| nasılsınız)?$/.test(value)) {
      return 'Merhaba! Ben MYO Gazetesi Asistanıyım. Güncel veya geçmiş haberleri arayabilir, EKSİM, Yapay Zeka ve enerji baskılarını tarayabilir ya da eklediğiniz belgeler üzerinde çalışabilirim.';
    }
    if (/^(naber|ne haber|nasılsın|nasılsınız)$/.test(value)) {
      return 'İyiyim, teşekkür ederim. Gazete gündemini taramaya hazırım. İsterseniz “en güncel yazılım haberi ne?” gibi bir soru sorabilirsiniz.';
    }
    if (/^(duy|duydun mu|orada mısın|burada mısın)$/.test(value)) {
      return 'Buradayım, sizi duyuyorum. Bir haber başlığı, kurum adı, tarih veya gündelik bir soru yazabilirsiniz.';
    }
    if (/^(teşekkürler|teşekkür ederim|sağ ol|sağol|eyvallah)$/.test(value)) {
      return 'Rica ederim. Başka bir haber, tarih veya belge hakkında da yardımcı olabilirim.';
    }
    if (/^(sen kimsin|kimsin|ne yapabilirsin)$/.test(value)) {
      return 'Ben MYO Gazetesi Asistanıyım. Yerel baskılarda, web haber kaynaklarında ve açık ansiklopedide arama yapar; kaynakları görsel ve bağlantılı kartlarla sunarım.';
    }
    return '';
  }

  function normalizeCards(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => typeof item === 'string' ? {
      section:'WEB', category:'Kaynak', title:'Kaynak bağlantısı', desc:'', url:safeUrl(item), image:''
    } : ({
      section:clean(item.section || item.source || 'WEB'),
      category:clean(item.category || item.publisher || 'Kaynak'),
      title:clean(item.title || item.name),
      desc:clean(item.desc || item.description || item.summary || item.snippet),
      url:safeUrl(item.url || item.link),
      image:safeUrl(item.image || item.imageUrl || item.thumbnail)
    })).filter(item => item.title || item.desc || item.url);
  }

  function normalizeProviderResponse(value, fallbackCards = []) {
    if (!value) return null;
    if (typeof value === 'string') return {text:clean(value), cards:fallbackCards};
    const text = clean(value.text || value.message || value.answer || value.content || value.reply || value.response || value.output);
    const cards = uniqueArticles([
      ...normalizeCards(value.cards),
      ...normalizeCards(value.sources),
      ...normalizeCards(value.results),
      ...fallbackCards
    ], 10);
    const images = Array.isArray(value.images) ? value.images : [];
    const image = safeUrl(value.image || value.imageUrl || images[0]?.url || images[0]);
    const firstSource = Array.isArray(value.sources) ? value.sources.find(source => source?.url || source?.link) : null;
    return {
      text:text || (cards.length ? 'İlgili sonuçları aşağıda bulabilirsiniz.' : ''),
      cards,
      image,
      imageAlt:clean(value.imageAlt || value.title),
      link:firstSource ? {url:safeUrl(firstSource.url || firstSource.link), label:clean(firstSource.label || firstSource.title || 'Kaynağı aç ↗')} : undefined
    };
  }

  async function askRegisteredProvider(request) {
    if (!Providers.active || !Providers.registry.has(Providers.active)) return null;
    try { return normalizeProviderResponse(await Providers.ask(request), request.webResults); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.warn('Kayıtlı asistan sağlayıcısı kullanılamadı; yedek akışa geçiliyor.');
      return null;
    }
  }

  async function settleWithin(promise, milliseconds) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(promise).catch(() => null),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), milliseconds); })
      ]);
    } finally { clearTimeout(timer); }
  }

  async function askApiChat(request, signal) {
    const timeoutController = new AbortController();
    const abort = () => timeoutController.abort();
    signal?.addEventListener('abort', abort, {once:true});
    const timeout = setTimeout(abort, 3000);
    try {
      const response = await fetch('/api/chat', {
        method:'POST', signal:timeoutController.signal,
        headers:{'Content-Type':'application/json', Accept:'application/json'},
        body:JSON.stringify({
          message:request.question,
          history:state.history.slice(-20),
          attachments:request.attachments,
          webResults:request.webResults,
          localArticles:request.localMatches
        })
      });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : {text:await response.text()};
      return normalizeProviderResponse(payload, request.webResults);
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      return null;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  function localFallback(question, localMatches, webMatches) {
    const cards = uniqueArticles([...localMatches, ...webMatches], 10);
    if (cards.length) {
      const first = cards[0];
      const summary = clean(first.desc || first.body);
      return {
        text:`En ilgili sonuç: “${first.title || 'Güncel haber'}”.${summary ? ` ${summary}` : ''} Aşağıdaki kartlardan kaynak bağlantılarına ulaşabilirsiniz.`,
        cards
      };
    }
    const images = state.attachments.filter(file => file.image);
    if (images.length) return {
      text:'Görsel dosyanız bağlama eklendi. Bu soruyla eşleşen yerel veya web haberi bulunamadı; görseli aşağıda görebilirsiniz.',
      image:images[0].image, imageAlt:images[0].name
    };
    return {text:`“${clean(question)}” için şu anda doğrulanabilir bir haber sonucu bulamadım. Farklı bir anahtar kelime, kurum adı veya tarih belirterek tekrar deneyebilirsiniz.`};
  }

  async function answer(question, signal) {
    const greeting = casualReply(question);
    if (greeting) return {text:greeting};
    try { await ensureLocalData(); } catch (_) {}
    const matches = localSearch(question);
    let attachmentExcerpts = [];
    const textAttachments = state.attachments.filter(file => file.text);
    if (textAttachments.length) {
      const terms = tokens(question);
      attachmentExcerpts = textAttachments.map(file => {
        const lines = file.text.split(/\r?\n/).filter(line => terms.some(term => line.toLocaleLowerCase('tr-TR').includes(term)));
        return lines.slice(0, 3).join(' ').slice(0, 700);
      }).filter(Boolean);
    }
    let webMatches = [];
    try { webMatches = await webSearch(question, signal); }
    catch (error) { if (error?.name === 'AbortError') throw error; }

    const request = {
      question, localEditions:state.editions, localArticles:state.articles,
      localMatches:matches, webResults:webMatches, attachments:attachmentContext(),
      attachmentExcerpts, history:state.history.slice(-20),
      searchLocal:localSearch, searchWeb:webSearch, signal
    };
    if (Providers.active && Providers.registry.has(Providers.active)) {
      const providerResponse = await settleWithin(askRegisteredProvider(request), 1000);
      if (providerResponse?.text || providerResponse?.cards?.length) return providerResponse;
    } else {
      const apiResponse = await askApiChat(request, signal);
      if (apiResponse?.text || apiResponse?.cards?.length) return apiResponse;
    }
    if (attachmentExcerpts.length) return {
      text:`Eklediğiniz dosyalarda sorunuzla ilgili şu bölümleri buldum: ${attachmentExcerpts.join(' … ')}`,
      cards:matches
    };
    return localFallback(question, matches, webMatches);
  }

  async function submitQuestion(event) {
    event?.preventDefault();
    const input = state.panel?.querySelector('#aiAssistantInput');
    const question = clean(input?.value);
    if (!question || !input) return;
    input.value = '';
    addMessage('user', question);
    const requestId = ++state.requestNo;
    const controller = new AbortController();
    state.pending.set(requestId, controller);
    setStatus(`${state.pending.size} arama sürüyor… Yerel baskılar ve web kaynakları taranıyor.`);
    try {
      const response = await answer(question, controller.signal);
      if (state.panel && !controller.signal.aborted) addMessage('assistant', response);
    } catch (error) {
      if (error?.name !== 'AbortError' && state.panel) {
        console.error('Asistan yanıt hatası:', error);
        addMessage('assistant', localFallback(question, localSearch(question), []));
      }
    } finally {
      state.pending.delete(requestId);
      if (state.panel) {
        setStatus(state.pending.size ? `${state.pending.size} arama sürüyor…` : 'Hazır.');
        state.panel.querySelector('#aiAssistantInput')?.focus();
      }
    }
  }

  function speak(value) {
    if (!value || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = 'tr-TR';
    speechSynthesis.speak(utterance);
  }

  function setupSpeech(panel) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = panel.querySelector('#aiAssistantMic');
    const voice = panel.querySelector('#aiAssistantVoice');
    if (!SpeechRecognition) {
      mic.disabled = true;
      mic.title = 'Bu tarayıcı sesle soru özelliğini desteklemiyor.';
      setStatus('Sesle soru özelliği bu tarayıcıda desteklenmiyor. Metinle devam edebilirsiniz.');
    } else {
      state.recognition = new SpeechRecognition();
      state.recognition.lang = 'tr-TR';
      state.recognition.interimResults = false;
      state.recognition.maxAlternatives = 1;
      state.recognition.addEventListener('result', event => {
        const input = state.panel?.querySelector('#aiAssistantInput');
        if (input) input.value = event.results[0][0].transcript;
        setStatus('Sesli soru yazıya aktarıldı.');
      });
      state.recognition.addEventListener('end', () => { state.listening = false; mic.classList.remove('is-listening'); mic.textContent = '🎙️ Sesle Sor'; });
      state.recognition.addEventListener('error', () => setStatus('Ses algılanamadı. Mikrofon iznini kontrol edin.', true));
      mic.addEventListener('click', () => {
        if (state.listening) state.recognition.stop();
        else {
          try {
            state.recognition.start();
            state.listening = true;
            mic.classList.add('is-listening');
            mic.textContent = '⏹ Dinlemeyi Durdur';
            setStatus('Dinliyorum…');
          } catch (_) { setStatus('Mikrofon şu anda başlatılamadı. Lütfen tekrar deneyin.', true); }
        }
      });
    }
    if (!('speechSynthesis' in window)) {
      voice.disabled = true;
      voice.title = 'Bu tarayıcı sesli okuma özelliğini desteklemiyor.';
    } else voice.addEventListener('change', () => { state.speakResponses = voice.checked; if (!voice.checked) speechSynthesis.cancel(); });
  }

  function createPanel() {
    const panel = createNode('section', 'ai-assistant is-opening');
    panel.id = 'aiAssistantPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'aiAssistantTitle');
    panel.innerHTML = `
      <header class="ai-assistant-header">
        <div><span class="ai-assistant-mark">🤖</span><div><h2 id="aiAssistantTitle">Yapay Zekâ Asistanı</h2><p>MYO Gazetesi yerel baskı araması</p></div></div>
        <button type="button" id="aiAssistantClose" aria-label="Yapay Zekâ Asistanını kapat">✕</button>
      </header>
      <div class="ai-assistant-history" id="aiAssistantHistory" aria-live="polite"></div>
      <div class="ai-attachment-list" id="aiAttachmentList"></div>
      <p class="ai-assistant-status" id="aiAssistantStatus" role="status"></p>
      <form class="ai-assistant-composer" id="aiAssistantForm">
        <label class="sr" for="aiAssistantInput">Sorunuzu yazın</label>
        <textarea id="aiAssistantInput" rows="2" placeholder="Gazetedeki haberler hakkında sorun…"></textarea>
        <div class="ai-assistant-actions">
          <label class="ai-file-button">📎 Dosya Ekle<input id="aiAssistantFile" type="file" multiple accept=".txt,.json,.csv,.md,.markdown,.pdf,image/*,text/plain,text/csv,text/markdown,application/json,application/pdf"></label>
          <button type="button" id="aiAssistantMic">🎙️ Sesle Sor</button>
          <label class="ai-voice-toggle"><input type="checkbox" id="aiAssistantVoice"> 🔊 Yanıtı Oku</label>
          <button type="submit" id="aiAssistantSend">Gönder ➜</button>
        </div>
      </form>`;
    document.body.appendChild(panel);
    panel.querySelector('#aiAssistantClose').addEventListener('click', closePanel);
    panel.querySelector('#aiAssistantForm').addEventListener('submit', submitQuestion);
    panel.querySelector('#aiAssistantInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) submitQuestion(event);
    });
    panel.querySelector('#aiAssistantFile').addEventListener('change', event => { handleFiles(event.target.files); event.target.value = ''; });
    setupSpeech(panel);
    return panel;
  }

  async function openPanel(event) {
    event?.preventDefault?.();
    if (state.panel) {
      state.panel.classList.remove('is-opening', 'is-closing');
      state.panel.classList.add('is-open');
      state.panel.querySelector('#aiAssistantInput')?.focus();
      return;
    }
    state.previousFocus = document.activeElement;
    state.history = [];
    state.panel = createPanel();
    document.documentElement.classList.add('ai-assistant-open');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      state.panel?.classList.remove('is-opening');
      state.panel?.classList.add('is-open');
    }));
    state.panel.querySelector('#aiAssistantInput').focus();
    setStatus('Güncel baskılar hazırlanıyor…');
    try {
      await ensureLocalData();
      setStatus(state.pending.size ? `${state.pending.size} arama sürüyor…` : `${state.articles.length} yerel haber aramaya hazır.`);
    }
    catch (_) { setStatus('Bazı yerel baskılar yüklenemedi.', true); }
  }

  function closePanel() {
    if (!state.panel) return;
    const closingPanel = state.panel;
    state.panel = null;
    state.pending.forEach(controller => controller.abort());
    state.pending.clear();
    state.recognition?.stop?.();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    state.recognition = null;
    state.listening = false;
    document.documentElement.classList.remove('ai-assistant-open');
    closingPanel.classList.remove('is-open');
    closingPanel.classList.add('is-closing');
    setTimeout(() => closingPanel.remove(), 260);
    state.previousFocus?.focus?.();
  }

  document.addEventListener('keydown', event => {
    if (!state.panel) return;
    if (event.key === 'Escape') { event.preventDefault(); closePanel(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...state.panel.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]')];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  window.MYOAssistant = Object.freeze({
    providers:Providers,
    open:openPanel,
    close:closePanel,
    searchLocal:localSearch,
    getContext:() => ({editions:state.editions, articles:state.articles, attachments:attachmentContext()}),
    searchWeb:webSearch,
    renderMessage:(payload, role='assistant') => addMessage(role, payload)
  });
  function bindAssistantButton() {
    const current = document.querySelector('#aiAssistantBtn');
    if (!current || current.dataset.aiAssistantBound === 'true') return;
    current.dataset.aiAssistantBound = 'true';
    current.addEventListener('click', openPanel);
    triggerButton = current;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAssistantButton, {once:true});
  } else bindAssistantButton();

  document.addEventListener('click', event => {
    const current = event.target.closest?.('#aiAssistantBtn');
    if (!current || current === triggerButton) return;
    triggerButton = current;
    openPanel(event);
  });
})();
