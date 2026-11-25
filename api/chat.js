const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const clean = (value, limit = 4000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
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
    text:clean(file?.text, 10000),
    note:clean(file?.note, 500)
  }));
}

function normalizeHistory(value) {
  return safeList(value, 12).map(entry => ({
    role:entry?.role === 'assistant' ? 'assistant' : 'user',
    content:clean(entry?.content, 2000)
  })).filter(entry => entry.content);
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
  }).slice(0, 8);
}

function buildPrompt({message, history, attachments, cards}) {
  return [
    `KULLANICI SORUSU:\n${message}`,
    history.length ? `SOHBET GEÇMİŞİ:\n${JSON.stringify(history)}` : '',
    attachments.length ? `BELGE BAĞLAMI:\n${JSON.stringify(attachments)}` : '',
    cards.length ? `DOĞRULANMIŞ HABER/KAYNAK BAĞLAMI:\n${JSON.stringify(cards)}` : '',
    'Türkçe, doğal ve doğrudan yanıt ver. Haber sorusunda en ilgili sonucu başlık ve kısa özetle açıkla. Yalnızca verilen kaynak bağlamındaki olguları ve bağlantıları kaynak olarak kabul et; bağlantı veya görsel uydurma. Kaynak kartları kullanıcı arayüzünde ayrıca gösterilecektir.'
  ].filter(Boolean).join('\n\n');
}

function geminiText(payload) {
  return clean((payload?.candidates?.[0]?.content?.parts || []).map(part => part?.text || '').join('\n'), 12000);
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
  const message = clean(body.message, 4000);
  if (!message) return res.status(400).json({error:'message alanı zorunludur.', fallback:true});

  const history = normalizeHistory(body.history);
  const attachments = normalizeAttachments(body.attachments);
  const cards = collectCards(body.localArticles, body.webResults);
  const prompt = buildPrompt({message, history, attachments, cards});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(GEMINI_URL, {
      method:'POST',
      signal:controller.signal,
      headers:{
        'Content-Type':'application/json',
        'x-goog-api-key':apiKey
      },
      body:JSON.stringify({
        systemInstruction:{parts:[{text:'Sen MYO Gazetesi Yapay Zekâ Asistanısın. Türkçe, doğru, sade ve kaynaklara bağlı yanıtlar üret.'}]},
        contents:[{role:'user', parts:[{text:prompt}]}],
        generationConfig:{temperature:0.35, topP:0.9, maxOutputTokens:1200}
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const upstreamMessage = clean(payload?.error?.message, 500);
      return res.status(response.status === 429 ? 429 : 502).json({
        error:upstreamMessage || 'Gemini API isteği başarısız oldu.',
        fallback:true,
        text:'Yapay zekâ servisine şu anda ulaşılamıyor; yerel ve web sonuçları kullanılabilir.',
        cards
      });
    }

    const text = geminiText(payload);
    if (!text) return res.status(502).json({
      error:'Gemini boş yanıt döndürdü.', fallback:true,
      text:'Model yanıt üretemedi; yerel ve web sonuçları kullanılabilir.', cards
    });

    return res.status(200).json({text, cards, model:GEMINI_MODEL});
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return res.status(502).json({
      error:timedOut ? 'Gemini isteği zaman aşımına uğradı.' : 'Gemini servisine bağlanılamadı.',
      fallback:true,
      text:'Canlı yapay zekâ yanıtı alınamadı; yerel ve web sonuçları kullanılabilir.',
      cards
    });
  } finally {
    clearTimeout(timeout);
  }
}
