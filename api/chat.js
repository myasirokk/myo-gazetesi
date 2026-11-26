const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// İstemci tarafı zaman aşımı (28 sn) bu değerden büyük olmalı.
const GEMINI_TIMEOUT_MS = 22000;

const clean = (value, limit = 4000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

// Satır sonlarını koruyan temizleyici (yanıt metni ve belge içeriği için).
const cleanText = (value, limit = 4000) => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, limit);

const isHttpUrl = value => {
  try { return /^https?:$/.test(new URL(String(value || '')).protocol); }
  catch (_) { return false; }
};

function safeList(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function normalizeArticle(item, fallbackSection = 'Kaynak') {
  if (!item || typeof item !== 'object') return null;
  const url = isHttpUrl(item.url || item.link) ? String(item.url || item.link) : '';
  const image = isHttpUrl(item.image || item.imageUrl || item.thumbnail)
    ? String(item.image || item.imageUrl || item.thumbnail) : '';
  const article = {
    section:clean(item.section || item.source || fallbackSection, 80),
    category:clean(item.category || item.publisher || 'Haber', 100),
    title:clean(item.title || item.name, 300),
    desc:clean(item.desc || item.description || item.summary || item.snippet, 1000),
    date:clean(item.publishedAt || item.date, 60),
    url,
    image
  };
  return article.title || article.desc || article.url ? article : null;
}

function normalizeAttachments(value) {
  return safeList(value, 6).map(file => ({
    name:clean(file?.name, 180),
    type:clean(file?.type, 100),
    size:Number.isFinite(Number(file?.size)) ? Number(file.size) : 0,
    text:cleanText(file?.text, 10000),
    note:clean(file?.note, 500)
  }));
}

function normalizeHistory(value, message) {
  const items = safeList(value, 12).map(entry => ({
    role:entry?.role === 'assistant' ? 'assistant' : 'user',
    content:cleanText(entry?.content, 2000)
  })).filter(entry => entry.content);
  // İstemci mevcut soruyu da geçmişe eklemiş olabilir; tekrarı at.
  const last = items[items.length - 1];
  if (last && last.role === 'user' && clean(last.content) === clean(message)) items.pop();
  return items;
}

function collectCards(localArticles, webResults) {
  const items = [
    ...safeList(localArticles, 8).map(item => normalizeArticle(item, 'MYO Gazetesi')),
    ...safeList(webResults, 10).map(item => normalizeArticle(item, 'WEB'))
  ].filter(Boolean);
  const seen = new Set();
  return items.filter(item => {
    const key = (item.url || item.title).toLocaleLowerCase('tr-TR');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

function todayInTurkey() {
  try {
    return new Intl.DateTimeFormat('tr-TR', {dateStyle:'full', timeZone:'Europe/Istanbul'}).format(new Date());
  } catch (_) { return new Date().toISOString().slice(0, 10); }
}

function systemInstruction() {
  return [
    'Sen MYO Gazetesi\'nin Yapay Zekâ Asistanısın. Kullanıcıyla doğal, akıcı ve sıcak ama profesyonel bir Türkçeyle konuşursun.',
    `Bugünün tarihi: ${todayInTurkey()}.`,
    'KURALLAR:',
    '1) Yalnızca sorulan soruya odaklan ve doğrudan cevabı ver. "En ilgili sonuç", "Aşağıdaki kartlara bakabilirsiniz" gibi kalıp cümleler, gereksiz girişler ve tekrarlar yazma.',
    '2) Selamlaşma, hal hatır, teşekkür, "kimsin" gibi gündelik sohbette kısa ve doğal cevap ver; haber veya kaynak getirme.',
    '3) Haber sorularında KAYNAK BAĞLAMI soruyla gerçekten ilgiliyse onu kullan. İlgili değilse yok say ve bağlamdan hiç söz etme. Bağlamda olmayan bir olayı bağlamdaymış gibi sunma.',
    '4) Bağlam yetersizse genel bilginle cevap ver. Tarih, rakam veya isimden emin değilsen bunu açıkça söyle; asla uydurma. Bağlantı, URL veya görsel uydurma.',
    '5) Belge sorularında yalnızca verilen BELGE BAĞLAMI\'na dayan; cevap belgede yoksa bunu açıkça söyle.',
    '6) Kısa ve net yaz (çoğu cevap 2-6 cümle). Markdown, başlık, madde işareti, yıldız veya tablo kullanma; düz metin yaz. Gerekirse kısa paragraflara böl.',
    '7) Yanıtı JSON olarak ver: "answer" alanına kullanıcıya gösterilecek metni, "sources" alanına cevabında gerçekten dayandığın KAYNAK BAĞLAMI numaralarını (en fazla 3) yaz. Hiçbirine dayanmadıysan "sources" boş dizi olsun.'
  ].join('\n');
}

function buildPrompt({message, attachments, cards}) {
  const sources = cards.map((card, index) => ({
    id:index + 1,
    kaynak:card.section,
    kategori:card.category,
    baslik:card.title,
    ozet:card.desc,
    tarih:card.date || undefined
  }));
  return [
    attachments.length ? `BELGE BAĞLAMI:\n${JSON.stringify(attachments)}` : '',
    sources.length ? `KAYNAK BAĞLAMI (soruyla ilgisizse yok say):\n${JSON.stringify(sources)}` : '',
    `KULLANICI SORUSU:\n${message}`
  ].filter(Boolean).join('\n\n');
}

function buildContents(history, prompt) {
  const turns = [];
  for (const entry of history) {
    const role = entry.role === 'assistant' ? 'model' : 'user';
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n${entry.content}`;
    else turns.push({role, parts:[{text:entry.content}]});
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  while (turns.length && turns[turns.length - 1].role === 'user') turns.pop();
  turns.push({role:'user', parts:[{text:prompt}]});
  return turns;
}

function geminiRawText(payload) {
  return (payload?.candidates?.[0]?.content?.parts || [])
    .filter(part => !part?.thought)
    .map(part => part?.text || '').join('\n');
}

function parseModelAnswer(raw, cards) {
  const source = String(raw || '').trim();
  if (!source) return {text:'', cards:[]};
  const stripped = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(stripped);
    const text = cleanText(parsed?.answer ?? parsed?.text, 12000);
    const ids = [...new Set(safeList(parsed?.sources, 6)
      .map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= cards.length))].slice(0, 3);
    if (text) return {text, cards:ids.map(id => cards[id - 1])};
  } catch (_) { /* JSON değilse düz metin olarak kullan */ }
  return {text:cleanText(source, 12000), cards:[]};
}

async function callGemini(apiKey, body, signal) {
  let response, payload;
  for (let attempt = 0; attempt < 2; attempt++) {
    response = await fetch(GEMINI_URL, {
      method:'POST',
      signal,
      headers:{'Content-Type':'application/json', 'x-goog-api-key':apiKey},
      body:JSON.stringify(body)
    });
    payload = await response.json().catch(() => ({}));
    // Model geçici olarak yoğunsa bir kez daha dene.
    if (response.status !== 503 && response.status !== 500) break;
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  return {response, payload};
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error:'Yalnızca POST isteği desteklenir.', fallback:true});
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error:'GEMINI_API_KEY ortam değişkeni tanımlı değil.',
      fallback:true,
      text:'Yapay zekâ servisi yapılandırılmadı; yerel ve web tabanlı yanıt kullanılabilir.'
    });
  }

  let body = req.body && typeof req.body === 'object' ? req.body : {};
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body); }
    catch (_) { return res.status(400).json({error:'Geçersiz JSON gövdesi.', fallback:true}); }
  }
  const message = cleanText(body.message, 4000);
  if (!message) return res.status(400).json({error:'message alanı zorunludur.', fallback:true});

  const history = normalizeHistory(body.history, message);
  const attachments = normalizeAttachments(body.attachments);
  const cards = collectCards(body.localArticles, body.webResults);
  const prompt = buildPrompt({message, attachments, cards});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const {response, payload} = await callGemini(apiKey, {
      systemInstruction:{parts:[{text:systemInstruction()}]},
      contents:buildContents(history, prompt),
      generationConfig:{
        temperature:0.5,
        topP:0.9,
        maxOutputTokens:2048,
        responseMimeType:'application/json',
        responseSchema:{
          type:'OBJECT',
          properties:{
            answer:{type:'STRING'},
            sources:{type:'ARRAY', items:{type:'INTEGER'}}
          },
          required:['answer', 'sources']
        },
        thinkingConfig:{thinkingBudget:0}
      }
    }, controller.signal);

    if (!response.ok) {
      const upstreamMessage = clean(payload?.error?.message, 500);
      const upstreamStatus = Number(payload?.error?.code) || response.status;
      console.error('GEMINI ERROR:', upstreamStatus, upstreamMessage);
      return res.status(response.status === 429 ? 429 : 502).json({
        error: upstreamMessage || 'Gemini API isteği başarısız oldu.',
        geminiStatus: upstreamStatus,
        fallback: true,
        text:'Yapay zekâ servisine şu anda ulaşılamıyor; yerel ve web sonuçları kullanılabilir.'
      });
    }

    const answer = parseModelAnswer(geminiRawText(payload), cards);
    if (!answer.text) return res.status(502).json({
      error:'Gemini boş yanıt döndürdü.',
      fallback:true,
      text:'Model yanıt üretemedi; yerel ve web sonuçları kullanılabilir.'
    });

    return res.status(200).json({text:answer.text, cards:answer.cards, model:GEMINI_MODEL});
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return res.status(502).json({
      error:timedOut ? 'Gemini isteği zaman aşımına uğradı.' : 'Gemini servisine bağlanılamadı.',
      fallback:true,
      text:'Canlı yapay zekâ yanıtı alınamadı; yerel ve web sonuçları kullanılabilir.'
    });
  } finally {
    clearTimeout(timeout);
  }
}
