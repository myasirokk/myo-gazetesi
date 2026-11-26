const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION || 'v1beta';

// İstemci zaman aşımının (ör. 40000 ms) altında tutulmalı.
const GEMINI_TIMEOUT_MS = 30000;

const clean = (value, limit = 4000) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

// Satır sonlarını koruyan temizleyici (yanıt metni ve belge içeriği için).
const cleanText = (value, limit = 4000) =>
  String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit);

const isHttpUrl = value => {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
};

function safeList(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('İşlem iptal edildi.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException('İşlem iptal edildi.', 'AbortError'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function normalizeArticle(item, fallbackSection = 'Kaynak') {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const rawUrl = item.url ?? item.link ?? '';
  const rawImage = item.image ?? item.imageUrl ?? item.thumbnail ?? '';
  const url = isHttpUrl(rawUrl) ? String(rawUrl) : '';
  const image = isHttpUrl(rawImage) ? String(rawImage) : '';

  const article = {
    section: clean(item.section || item.source || fallbackSection, 80),
    category: clean(item.category || item.publisher || 'Haber', 100),
    title: clean(item.title || item.name, 300),
    desc: clean(item.desc || item.description || item.summary || item.snippet, 1000),
    date: clean(item.publishedAt || item.date, 60),
    url,
    image
  };

  return article.title || article.desc || article.url ? article : null;
}

function normalizeAttachments(value) {
  return safeList(value, 6)
    .filter(file => file && typeof file === 'object')
    .map(file => ({
      name: clean(file.name, 180),
      type: clean(file.type, 100),
      size: Number.isFinite(Number(file.size)) && Number(file.size) >= 0 ? Number(file.size) : 0,
      text: cleanText(file.text, 10000),
      note: clean(file.note, 500)
    }));
}

function normalizeHistory(value, message) {
  const items = safeList(value, 12)
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(entry.content, 2000)
    }))
    .filter(entry => entry.content);

  // İstemci mevcut kullanıcı mesajını da geçmişe eklediyse sondaki tekrarı kaldır.
  const last = items[items.length - 1];
  if (last && last.role === 'user' && clean(last.content) === clean(message)) {
    items.pop();
  }
  return items;
}

function collectCards(localArticles, webResults) {
  const items = [
    ...safeList(localArticles, 8).map(item => normalizeArticle(item, 'MYO Gazetesi')),
    ...safeList(webResults, 10).map(item => normalizeArticle(item, 'WEB'))
  ].filter(Boolean);

  const seen = new Set();
  return items
    .filter(item => {
      const key = (item.url || item.title).toLocaleLowerCase('tr-TR');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function todayInTurkey() {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'full',
      timeZone: 'Europe/Istanbul'
    }).format(new Date());
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function systemInstruction() {
  return [
    'Sen MYO Gazetesi\'nin Yapay Zekâ Asistanısın. Kullanıcıyla doğal, akıcı, sıcak ve net bir Türkçeyle konuşursun.',
    `Bugünün tarihi: ${todayInTurkey()}.`,
    'KURALLAR:',
    '1) Yalnızca sorulan soruya odaklan ve doğrudan cevabı ver. "En ilgili sonuç", "Aşağıdaki kartlara bakabilirsiniz" gibi kalıp ifadeler veya gereksiz girişler kullanma.',
    '2) Selamlaşma, hal hatır, teşekkür, "kimsin" gibi gündelik sohbette kısa ve doğal cevap ver; haber veya kaynak ekleme.',
    '3) Haber sorularında KAYNAK BAĞLAMI soruyla gerçekten ilgiliyse kullan; ilgili değilse yok say ve bağlamdan hiç söz etme. Bağlamda olmayan bilgiyi bağlamdaymış gibi sunma.',
    '4) Bağlam yetersizse genel bilginle cevap ver. Tarih, rakam veya isimden emin değilsen bunu açıkça belirt; bilgi, bağlantı veya görsel uydurma.',
    '5) Belge sorularında yalnızca verilen BELGE BAĞLAMI\'na dayan; yanıt belgede yoksa bunu açıkça söyle.',
    '6) Kısa ve anlaşılır yaz (çoğu cevap 2-6 cümle). Markdown başlık, madde işareti, yıldız veya tablo kullanma; düz metin yaz.',
    '7) Yanıtı JSON olarak ver: "answer" alanına kullanıcıya gösterilecek metni, "sources" alanına cevabında gerçekten dayandığın KAYNAK BAĞLAMI numaralarını (en fazla 3) yaz. Hiçbirine dayanmadıysan "sources" boş dizi olsun.'
  ].join('\n');
}

function buildPrompt({ message, attachments, cards }) {
  const sources = cards.map((card, index) => ({
    id: index + 1,
    kaynak: card.section,
    kategori: card.category,
    baslik: card.title,
    ozet: card.desc,
    tarih: card.date || undefined
  }));

  return [
    attachments.length ? `BELGE BAĞLAMI:\n${JSON.stringify(attachments)}` : '',
    sources.length ? `KAYNAK BAĞLAMI (soruyla ilgisizse yok say):\n${JSON.stringify(sources)}` : '',
    `KULLANICI SORUSU:\n${message}`
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildContents(history, prompt) {
  const turns = [];
  for (const entry of history) {
    const role = entry.role === 'assistant' ? 'model' : 'user';
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n${entry.content}`;
    } else {
      turns.push({ role, parts: [{ text: entry.content }] });
    }
  }

  // Gemini sohbet geçmişi 'user' ile başlamalı ve son tur kullanıcı prompt'u olmalı.
  while (turns.length && turns[0].role !== 'user') {
    turns.shift();
  }
  while (turns.length && turns[turns.length - 1].role === 'user') {
    turns.pop();
  }

  turns.push({ role: 'user', parts: [{ text: prompt }] });
  return turns;
}

function geminiRawText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter(part => part && typeof part === 'object' && !part.thought)
    .map(part => (typeof part.text === 'string' ? part.text : ''))
    .join('\n');
}

function parseModelAnswer(raw, cards) {
  const source = String(raw || '').trim();
  if (!source) return { text: '', cards: [] };

  const stripped = source
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const text = cleanText(parsed.answer ?? parsed.text ?? '', 12000);
      const ids = [
        ...new Set(
          safeList(parsed.sources, 6)
            .map(Number)
            .filter(n => Number.isInteger(n) && n >= 1 && n <= cards.length)
        )
      ].slice(0, 3);

      if (text) {
        return {
          text,
          cards: ids.map(id => cards[id - 1]).filter(Boolean)
        };
      }
    }
  } catch (_) {
    // Model JSON dışı düz metin döndürdüyse doğrudan metin olarak işle.
  }

  return { text: cleanText(source, 12000), cards: [] };
}

function buildEndpointUrl() {
  const encodedModel = encodeURIComponent(GEMINI_MODEL);
  const encodedVersion = encodeURIComponent(GEMINI_API_VERSION);
  return `https://generativelanguage.googleapis.com/${encodedVersion}/models/${encodedModel}:generateContent`;
}

async function callGemini(apiKey, body, signal) {
  const endpoint = buildEndpointUrl();
  let response = null;
  let payload = {};

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Gemini isteği zaman aşımına uğradı.', 'AbortError');
    }

    response = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    const rawBody = await response.text().catch(() => '');
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (_) {
        payload = { error: { message: clean(rawBody, 500) } };
      }
    } else {
      payload = {};
    }

    if (response.status !== 503 && response.status !== 500) {
      break;
    }

    if (attempt === 0) {
      await sleep(700, signal);
    }
  }

  return { response, payload };
}

function parseRequestBody(req) {
  if (!req || req.body === undefined || req.body === null) {
    return { ok: true, data: {} };
  }
  if (typeof req.body === 'object' && !Array.isArray(req.body)) {
    return { ok: true, data: req.body };
  }
  if (typeof req.body === 'string') {
    if (!req.body.trim()) return { ok: true, data: {} };
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ok: true, data: parsed };
      }
      return { ok: false, error: 'JSON gövdesi bir nesne olmalıdır.' };
    } catch (_) {
      return { ok: false, error: 'Geçersiz JSON gövdesi.' };
    }
  }
  return { ok: false, error: 'Desteklenmeyen istek gövdesi.' };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'Yalnızca POST isteği desteklenir.',
      fallback: true
    });
  }

  const apiKey = clean(process.env.GEMINI_API_KEY, 500);
  if (!apiKey) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY ortam değişkeni tanımlı değil.',
      fallback: true,
      text: 'Yapay zekâ servisi yapılandırılmadı; yerel ve web tabanlı yanıt kullanılabilir.'
    });
  }

  const parsedBody = parseRequestBody(req);
  if (!parsedBody.ok) {
    return res.status(400).json({
      error: parsedBody.error,
      fallback: true
    });
  }

  const message = cleanText(parsedBody.data.message, 4000);
  if (!message) {
    return res.status(400).json({
      error: 'message alanı zorunludur.',
      fallback: true
    });
  }

  const history = normalizeHistory(parsedBody.data.history, message);
  const attachments = normalizeAttachments(parsedBody.data.attachments);
  const cards = collectCards(parsedBody.data.localArticles, parsedBody.data.webResults);
  const prompt = buildPrompt({ message, attachments, cards });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const { response, payload } = await callGemini(
      apiKey,
      {
        systemInstruction: { parts: [{ text: systemInstruction() }] },
        contents: buildContents(history, prompt),
        generationConfig: {
          temperature: 0.5,
          topP: 0.9,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              answer: { type: 'STRING' },
              sources: { type: 'ARRAY', items: { type: 'INTEGER' } }
            },
            required: ['answer', 'sources']
          }
        }
      },
      controller.signal
    );

    if (!response || !response.ok) {
      const upstreamMessage = clean(payload?.error?.message, 500);
      const upstreamStatus = Number(payload?.error?.code) || response?.status || 502;
      console.error('GEMINI ERROR:', upstreamStatus, upstreamMessage);
      return res.status(response?.status === 429 ? 429 : 502).json({
        error: upstreamMessage || 'Gemini API isteği başarısız oldu.',
        geminiStatus: upstreamStatus,
        fallback: true,
        text: 'Yapay zekâ servisine şu anda ulaşılamıyor; yerel ve web sonuçları kullanılabilir.'
      });
    }

    const parsedAnswer = parseModelAnswer(geminiRawText(payload), cards);
    if (!parsedAnswer.text) {
      return res.status(502).json({
        error: 'Gemini boş yanıt döndürdü.',
        fallback: true,
        text: 'Model yanıt üretemedi; yerel ve web sonuçları kullanılabilir.'
      });
    }

    return res.status(200).json({
      text: parsedAnswer.text,
      cards: parsedAnswer.cards,
      model: GEMINI_MODEL
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    console.error('GEMINI REQUEST FAILED:', timedOut ? 'TIMEOUT' : error?.message || error);
    return res.status(502).json({
      error: timedOut ? 'Gemini isteği zaman aşımına uğradı.' : 'Gemini servisine bağlanılamadı.',
      fallback: true,
      text: 'Canlı yapay zekâ yanıtı alınamadı; yerel ve web sonuçları kullanılabilir.'
    });
  } finally {
    clearTimeout(timeout);
  }
}