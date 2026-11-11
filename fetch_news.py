#!/usr/bin/env python3
"""MYO Gazetesi günlük çift baskı üretim motoru."""

from __future__ import annotations

import html
import json
import os
import re
import tempfile
from copy import deepcopy
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

START_DATE = date(2026, 11, 11)
TURKEY_TZ = ZoneInfo("Europe/Istanbul")
EDITION_HOUR = 7
ARCHIVE_DAYS = 7
NEWS_PER_CATEGORY = 4
TIMEOUT = 15

MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
ARCHIVE_DIR = DATA_DIR / "archive"

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "MYOGazetesi/1.0 daily-edition-generator",
    "Accept": "application/json, application/rss+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.8",
})

TECH_LABELS = {"ai": "Yapay Zekâ", "oss": "Açık Kaynak", "web": "Web Geliştirme", "sec": "Siber Güvenlik"}
ENERGY_LABELS = {"grid": "Şebeke & Dağıtım", "ren": "Yenilenebilir Enerji", "bat": "Depolama & Batarya", "mkt": "Piyasa & Regülasyon"}


def item(title: str, desc: str, url: str) -> dict[str, str]:
    return {"title": title, "desc": desc, "url": url}


TECH_FALLBACKS = {
    "ai": [
        item("Küçük Dil Modelleri Cihaz Üstünde Yaygınlaşıyor", "Düşük bellek tüketimli modeller kişisel verileri buluta göndermeden yerel donanımda çalışıyor.", "https://huggingface.co/blog"),
        item("Yapay Zekâ Ajanlarında İzin Katmanı Öne Çıkıyor", "Kurumsal ekipler araç kullanan ajanların erişimini görev ve veri düzeyinde sınırlandırıyor.", "https://ai.googleblog.com/"),
        item("Çok Modlu Modeller Belge İşleme Süreçlerini Yeniliyor", "Metin ve görseli birlikte değerlendiren modeller belgelerden yapılandırılmış veri çıkarıyor.", "https://huggingface.co/blog"),
        item("Model Değerlendirmesinde Gerçek Görev Testleri Artıyor", "Kıyaslamalar güvenlik, doğruluk ve araç kullanımı senaryolarına yöneliyor.", "https://news.ycombinator.com/"),
    ],
    "oss": [
        item("Açık Kaynak Projelerde İmzalı Sürüm Zinciri Güçleniyor", "Paket ve derlemelerin kaynağını doğrulayan imza kontrolleri yayın süreçlerine ekleniyor.", "https://github.blog/"),
        item("Linux Sistemlerinde Gözlemlenebilirlik Araçları Sadeleşiyor", "Çekirdek ve uygulama ölçümleri ortak panolarda düşük ek yükle izleniyor.", "https://www.linuxfoundation.org/blog"),
        item("Bağımlılık Güncellemeleri Otomatik Testlerle Birleşiyor", "Paket yükseltmeleri güvenlik taraması ve geriye dönük testlerle doğrulanıyor.", "https://github.blog/"),
        item("Küçük Konteyner İmajları Saldırı Yüzeyini Azaltıyor", "Daha az paket içeren taban imajlar güvenliği ve dağıtım hızını artırıyor.", "https://www.docker.com/blog/"),
    ],
    "web": [
        item("Web Uygulamalarında Etkileşim Gecikmesi Yakından İzleniyor", "Ekipler yükleme hızının yanında kullanıcı etkileşimlerine verilen yanıt süresini de bütçeliyor.", "https://web.dev/blog/"),
        item("Tarayıcıda Yerel Yapay Zekâ Denemeleri Hızlanıyor", "Yeni web arayüzleri küçük modellerin kullanıcı cihazında çalıştırılmasına olanak tanıyor.", "https://developer.chrome.com/blog/"),
        item("Arayüzlerde Erişilebilirlik Testleri Otomatikleşiyor", "Klavye ve ekran okuyucu uyumu sürekli entegrasyon aşamasında denetleniyor.", "https://web.dev/blog/"),
        item("WebAssembly Ortak Çalışma Katmanı Kuruyor", "Taşınabilir çalışma zamanı performans gerektiren web modüllerinde yaygınlaşıyor.", "https://developer.mozilla.org/"),
    ],
    "sec": [
        item("Yazılım Tedarik Zincirinde Kaynak Doğrulaması Artıyor", "Bağımlılıkların, derlemelerin ve paketlerin kökeni kayıt altına alınıyor.", "https://www.cisa.gov/"),
        item("Parolasız Kimlik Doğrulama Kurumsal Uygulamalara Yayılıyor", "Geçiş anahtarları oltalama saldırılarına karşı donanım destekli oturum açma sağlıyor.", "https://www.cisa.gov/"),
        item("API Anahtarlarında Kısa Ömürlü Yetkilendirme Öneriliyor", "Sürekli sırlar yerine görev bazlı ve otomatik yenilenen kimlik bilgileri kullanılıyor.", "https://owasp.org/"),
        item("Varlık Envanteri Kritik Açıklara Müdahaleyi Hızlandırıyor", "Güncel bileşen listeleri etkilenen sistemlerin hızla bulunmasını sağlıyor.", "https://www.cisa.gov/"),
    ],
}

ENERGY_FALLBACKS = {
    "grid": [
        item("Fider Otomasyonu Kesinti Alanını Daraltıyor", "Uzaktan kumandalı ayırıcılar sağlam hat kesimlerinin hızla enerjilendirilmesini sağlıyor.", "https://www.power-grid.com/"),
        item("Dağıtım Trafalarında Çevrim İçi Sıcaklık İzleme Artıyor", "Sargı sıcaklığı ve yük akımı eğilimleri aşırı yük riskini erken gösteriyor.", "https://www.power-eng.com/"),
        item("SCADA Olay Kayıtlarında Zaman Senkronizasyonu Öne Çıkıyor", "Ortak zaman damgası röle ve kesici olaylarının doğru analiz edilmesini kolaylaştırıyor.", "https://www.power-grid.com/"),
        item("Orta Gerilim Şebekelerinde Dijital Koruma Yaygınlaşıyor", "Yeni röleler haberleşme destekli seçicilik ve uzaktan ayar yönetimi sunuyor.", "https://www.power-eng.com/"),
    ],
    "ren": [
        item("Çatı GES Tahminleri Gerilim Yönetimine Bağlanıyor", "Işınım tahmini ve trafo yükü birlikte değerlendirilerek ters güç akışı hesaplanıyor.", "https://www.renewableenergyworld.com/"),
        item("Rüzgâr Santrallerinde Reaktif Güç Desteği Öne Çıkıyor", "Modern konvertörler üretim değişirken bağlantı noktasındaki gerilimi destekliyor.", "https://www.renewableenergyworld.com/"),
        item("Güneş Santrallerinde İnverter Verisi Bakımı Yönlendiriyor", "Dizi akımı ve sıcaklık sapmaları üretim kaybına yol açan arızaları erken gösteriyor.", "https://www.pv-magazine.com/"),
        item("Hibrit Santraller Üretim Profilini Dengeliyor", "Güneş, rüzgâr ve depolamanın ortak kontrolü bağlantı kapasitesini verimli kullanıyor.", "https://www.renewableenergyworld.com/"),
    ],
    "bat": [
        item("Batarya Yönetim Sistemleri Hücre Sapmasını Erken Yakalıyor", "Gerilim, sıcaklık ve iç direnç eğilimleri dengesiz hücreleri belirliyor.", "https://www.energy-storage.news/"),
        item("Şebeke Ölçekli Depolamada Yangın Bölümlendirmesi Kritik", "Gaz algılama, havalandırma ve termal kaçak sınırları birlikte tasarlanıyor.", "https://www.energy-storage.news/"),
        item("Depolama Tesislerinde Çevrim Ömrü Gelir Modelini Etkiliyor", "Şarj derinliği ve sıcaklık yönetimi kullanılabilir kapasiteyi belirliyor.", "https://www.energy-storage.news/"),
        item("İkinci Ömür Bataryalarda Sağlık Ölçümü Standartlaşıyor", "Hücre geçmişi ve kapasite testleri yeni kullanım alanına uygunluğu doğruluyor.", "https://www.energy-storage.news/"),
    ],
    "mkt": [
        item("Esneklik Hizmetleri Dağıtım Seviyesine İniyor", "Dağıtık üretim ve tüketim katılımı yerel şebeke sıkışıklığını azaltıyor.", "https://www.utilitydive.com/"),
        item("Çeyrek Saatlik Ölçüm Verisi Uzlaştırmada Önem Kazanıyor", "Kısa zaman çözünürlüğü üretim ve tüketim sapmalarını hassas yansıtıyor.", "https://www.utilitydive.com/"),
        item("Kapasite Planlamasında Dağıtık Kaynaklar Birlikte Ele Alınıyor", "Elektrikli araç, güneş ve depolama senaryoları şebeke yatırımlarına giriyor.", "https://www.utilitydive.com/"),
        item("Talep Tarafı Katılımında Doğrulama Ölçütleri Netleşiyor", "Referans tüketim ve gerçekleşen azaltım piyasa ödemelerinin temelini oluşturuyor.", "https://www.utilitydive.com/"),
    ],
}

AI_PUZZLE = [
    ["PROMPT", 0, 0, "a", "Yapay zekâya verilen komut metni"],
    ["PYTHON", 0, 0, "d", "Yapay zekâ dünyasında yaygın programlama dili"],
    ["TOKEN", 0, 5, "d", "Dil modelinin metni böldüğü en küçük birim"],
    ["OPTION", 4, 0, "a", "Seçenek veya ayar anlamındaki İngilizce sözcük"],
    ["IDE", 4, 3, "d", "Kod geliştirme ortamının kısaltması"],
    ["EPOCH", 6, 3, "a", "Eğitim verisinin bir tam geçişi"],
    ["HASH", 6, 7, "d", "Veriden çıkarılan sabit uzunluklu özet"],
    ["HTTP", 9, 7, "a", "Web iletişiminin temel protokolü"],
]

ENERGY_PUZZLE = [
    ["TRAFO", 0, 0, "a", "Gerilim seviyesini değiştiren elektrik makinesi"],
    ["AKIM", 0, 2, "d", "Elektrik yükünün birim zamandaki akışı"],
    ["VOLTAJ", 2, 4, "a", "İki nokta arasındaki elektriksel potansiyel farkı"],
    ["SCADA", 0, 8, "d", "Şebekenin uzaktan izleme ve kumanda sistemi"],
    ["GÜNEŞ", 4, 0, "a", "Fotovoltaik üretimin birincil kaynağı"],
    ["ENERJİ", 4, 3, "d", "İş yapabilme kapasitesi"],
    ["RÖLE", 7, 3, "a", "Arızayı algılayıp açma komutu veren cihaz"],
    ["BATARYA", 9, 4, "a", "Elektrik enerjisini elektrokimyasal depolayan sistem"],
]

RSS_SOURCES = {
    "tech": ["https://hnrss.org/newest", "https://www.freecodecamp.org/news/rss/"],
    "energy": [
        "https://www.power-eng.com/feed/",
        "https://www.renewableenergyworld.com/feed/",
        "https://www.energy-storage.news/feed/",
        "https://www.utilitydive.com/feeds/news/",
    ],
}


def edition_info(now: datetime | None = None) -> tuple[date, int]:
    current = now.astimezone(TURKEY_TZ) if now else datetime.now(TURKEY_TZ)
    edition_date = current.date() - timedelta(days=1) if current.time() < time(EDITION_HOUR) else current.date()
    if edition_date < START_DATE:
        edition_date = START_DATE
    return edition_date, (edition_date - START_DATE).days + 1


def date_label(value: date) -> str:
    return f"{value.day} {MONTHS[value.month - 1]} {value.year}, {DAYS[value.weekday()]}"


def clean_text(value: str, limit: int = 280) -> str:
    text = BeautifulSoup(html.unescape(value or ""), "html.parser").get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip(" -–—…")
    if len(text) <= limit:
        return text
    return text[: limit + 1].rsplit(" ", 1)[0].rstrip(".,;:") + "."


def looks_english(value: str) -> bool:
    words = set(re.findall(r"[a-z]+", value.lower()))
    return bool(words & {"the", "and", "for", "with", "from", "into", "how", "why", "energy", "power", "security"})


def translate(value: str) -> str | None:
    text = clean_text(value, 500)
    if not text or not looks_english(text):
        return text
    try:
        url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=" + quote(text)
        response = SESSION.get(url, timeout=TIMEOUT)
        response.raise_for_status()
        result = response.json()
        return clean_text("".join(part[0] for part in result[0] if part and part[0]), 500) or None
    except Exception as exc:
        print(f"Çeviri kullanılamadı: {exc}")
        return None


def get_json(url: str) -> Any:
    try:
        response = SESSION.get(url, timeout=TIMEOUT)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        print(f"JSON kaynağı kullanılamadı ({url}): {exc}")
        return None


def get_text(url: str) -> str:
    try:
        response = SESSION.get(url, timeout=TIMEOUT)
        response.raise_for_status()
        return response.text
    except Exception as exc:
        print(f"RSS kaynağı kullanılamadı ({url}): {exc}")
        return ""


def parse_rss(xml: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(xml, "xml")
    results = []
    for entry in soup.find_all(["item", "entry"])[:30]:
        title_tag = entry.find("title")
        desc_tag = entry.find("description") or entry.find("summary") or entry.find("content")
        link_tag = entry.find("link")
        link = (link_tag.get("href") or link_tag.get_text(strip=True)) if link_tag else ""
        title = clean_text(title_tag.get_text(" ", strip=True) if title_tag else "", 180)
        desc = clean_text(desc_tag.get_text(" ", strip=True) if desc_tag else "", 280)
        if title and link:
            results.append(item(title, desc, link))
    return results


def classify_tech(title: str, desc: str, tags: list[str] | None = None) -> str | None:
    text = f" {title} {desc} {' '.join(tags or [])} ".lower()
    rules = {
        "sec": ["security", "cyber", "vulnerability", "malware", "phishing", "passkey", "owasp"],
        "ai": [" ai ", "artificial intelligence", "machine learning", "llm", "model", "agent", "prompt"],
        "oss": ["open source", "linux", "github", " git ", "kernel", "docker", "kubernetes"],
        "web": ["web", "javascript", "typescript", "react", "css", "html", "browser", "frontend"],
    }
    return next((key for key, words in rules.items() if any(word in text for word in words)), None)


def classify_energy(title: str, desc: str) -> str:
    text = f"{title} {desc}".lower()
    rules = {
        "bat": ["battery", "storage", "lithium", "bess", "cell", "thermal runaway"],
        "ren": ["solar", "wind", "renewable", "photovoltaic", "geothermal", "hydrogen"],
        "mkt": ["market", "regulation", "policy", "tariff", "price", "auction", "utility"],
        "grid": ["grid", "transformer", "substation", "transmission", "distribution", "scada", "relay", "outage"],
    }
    return next((key for key, words in rules.items() if any(word in text for word in words)), "grid")


def turkish_item(raw: dict[str, str], label: str) -> dict[str, str] | None:
    title = translate(raw.get("title", ""))
    if not title:
        return None
    desc = translate(raw.get("desc", ""))
    if not desc:
        desc = f"{label} alanındaki bu gelişme işletme, güvenlik ve teknik uygulamalar açısından yakından izleniyor."
    return item(clean_text(title, 180), clean_text(desc, 280), raw.get("url") or "#")


def add_unique(bucket: list[dict[str, str]], candidate: dict[str, str] | None) -> None:
    if not candidate or len(bucket) >= NEWS_PER_CATEGORY:
        return
    key = re.sub(r"\W+", "", candidate["title"].casefold())
    if key and all(re.sub(r"\W+", "", old["title"].casefold()) != key for old in bucket):
        bucket.append(candidate)


def complete(news: dict[str, list[dict[str, str]]], fallbacks: dict[str, list[dict[str, str]]]) -> dict[str, list[dict[str, str]]]:
    for category in news:
        for fallback in fallbacks[category]:
            add_unique(news[category], deepcopy(fallback))
        news[category] = news[category][:NEWS_PER_CATEGORY]
    return news


def fetch_tech_news() -> dict[str, list[dict[str, str]]]:
    news = {key: [] for key in TECH_LABELS}
    articles = get_json("https://dev.to/api/articles?per_page=50") or []
    if isinstance(articles, list):
        for article in articles:
            category = classify_tech(article.get("title", ""), article.get("description", ""), article.get("tag_list") or [])
            if category and len(news[category]) < NEWS_PER_CATEGORY:
                raw = item(article.get("title", ""), article.get("description", ""), article.get("url", "#"))
                add_unique(news[category], turkish_item(raw, TECH_LABELS[category]))
    for source in RSS_SOURCES["tech"]:
        for raw in parse_rss(get_text(source)):
            category = classify_tech(raw["title"], raw["desc"])
            if category and len(news[category]) < NEWS_PER_CATEGORY:
                add_unique(news[category], turkish_item(raw, TECH_LABELS[category]))
    return complete(news, TECH_FALLBACKS)


def fetch_energy_news() -> dict[str, list[dict[str, str]]]:
    news = {key: [] for key in ENERGY_LABELS}
    for source in RSS_SOURCES["energy"]:
        for raw in parse_rss(get_text(source)):
            category = classify_energy(raw["title"], raw["desc"])
            if len(news[category]) < NEWS_PER_CATEGORY:
                add_unique(news[category], turkish_item(raw, ENERGY_LABELS[category]))
    return complete(news, ENERGY_FALLBACKS)


def validate_puzzle(words: list[list[Any]], rows: int = 10, cols: int = 11) -> None:
    grid: dict[tuple[int, int], str] = {}
    if not words:
        raise ValueError("Bulmaca boş")
    for word, row, col, direction, clue in words:
        if not word or direction not in {"a", "d"} or not clue:
            raise ValueError("Geçersiz bulmaca kaydı")
        for index, char in enumerate(word):
            r = row + (index if direction == "d" else 0)
            c = col + (index if direction == "a" else 0)
            if not (0 <= r < rows and 0 <= c < cols):
                raise ValueError(f"Bulmaca sınır dışı: {word}")
            if (r, c) in grid and grid[(r, c)] != char:
                raise ValueError(f"Bulmaca kesişimi hatalı: {word}")
            grid[(r, c)] = char


def make_edition(kind: str, edition_date: date, issue: int, news: dict[str, list[dict[str, str]]]) -> dict[str, Any]:
    if kind == "tech":
        puzzle, lead = deepcopy(AI_PUZZLE), news["ai"][0]
        quote_text = "\"Önce çalıştır, sonra doğru yap, sonra hızlı yap.\""
        editorial = item("Ajanlar Çağında Kodu Okumak Yazmaktan Değerli", "Kod üretimi hızlanırken niyeti, güvenlik sınırlarını, testleri ve ortaya çıkan davranışı birlikte değerlendirmek gerekir.", "")
        fact = item("Zero-Shot Inference", "Bir modelin görevi daha önce örnek görmeden yalnızca bağlam ve talimatla tamamlayabilme yeteneğidir.", "")
        body = "Yapay zekâ ve yazılım dünyasında model güvenliği, veri gizliliği, açık kaynak sürdürülebilirliği ve web performansı aynı mühendislik zincirinin parçaları hâline geliyor. Ekipler için temel hedef otomasyonu ölçülebilir kalite kontrolleri ve insan denetimiyle birlikte işletmek.\n\nBu baskı erişilebilen güvenilir kaynakları Türkçe özetler; kaynak kesintisinde ise alanına özel zengin yedek haber havuzunu kullanır."
    else:
        puzzle, lead = deepcopy(ENERGY_PUZZLE), news["grid"][0]
        quote_text = "\"Güvenilir şebeke, ölçülen ve yönetilen şebekedir.\""
        editorial = item("Dağıtım Şebekesinin Dijital İkizi Sahadaki Disiplindir", "SCADA şeması, koruma ayarları ve fiziksel bağlantılar aynı gerçeği göstermediğinde otomasyon güvenilir sonuç üretemez.", "")
        fact = item("Güç Katsayısı (cosφ)", "Aktif gücün görünür güce oranıdır; düşük değer daha yüksek akım, kayıp ve gerilim düşümü oluşturur.", "")
        body = "Elektrik şebekesinin dönüşümü koruma, otomasyon, yenilenebilir üretim, depolama ve piyasa tasarımını aynı işletme disiplini içinde buluşturuyor. Doğru zaman damgalı saha verisi hızlı ve güvenli kararın temelidir.\n\nBu baskı erişilebilen enerji kaynaklarını Türkçe özetler; kaynak kesintisinde ise şebeke, trafo, yenilenebilir enerji, batarya ve piyasa havuzunu kullanır."
    validate_puzzle(puzzle)
    return {
        "issue": issue,
        "date": date_label(edition_date),
        "date_key": edition_date.isoformat(),
        "quote": quote_text,
        "lead": {"title": lead["title"], "deck": lead["desc"], "body": body},
        "editorial": {"title": editorial["title"], "body": editorial["desc"]},
        "fact": {"title": fact["title"], "body": fact["desc"]},
        "news": news,
        "puzzle": puzzle,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, path)


def cleanup_archives(edition_date: date) -> list[str]:
    deleted = []
    pattern = re.compile(r"^(?:enerji_)?(\d{4}-\d{2}-\d{2})\.json$")
    if not ARCHIVE_DIR.exists():
        return deleted
    for path in ARCHIVE_DIR.iterdir():
        match = pattern.fullmatch(path.name) if path.is_file() else None
        if not match:
            continue
        try:
            archive_date = date.fromisoformat(match.group(1))
        except ValueError:
            continue
        if (edition_date - archive_date).days > ARCHIVE_DAYS:
            os.remove(path)
            deleted.append(path.name)
    return deleted


def generate() -> None:
    edition_date, issue = edition_info()
    print(f"Baskı hazırlanıyor: {date_label(edition_date)} — Sayı {issue}")
    try:
        tech_news = fetch_tech_news()
    except Exception as exc:
        print(f"Teknoloji akışı yedek havuza geçti: {exc}")
        tech_news = complete({key: [] for key in TECH_LABELS}, TECH_FALLBACKS)
    try:
        energy_news = fetch_energy_news()
    except Exception as exc:
        print(f"Enerji akışı yedek havuza geçti: {exc}")
        energy_news = complete({key: [] for key in ENERGY_LABELS}, ENERGY_FALLBACKS)

    tech = make_edition("tech", edition_date, issue, tech_news)
    energy = make_edition("energy", edition_date, issue, energy_news)
    key = edition_date.isoformat()
    write_json(DATA_DIR / "edition.json", tech)
    write_json(DATA_DIR / "edition_enerji.json", energy)
    write_json(ARCHIVE_DIR / f"{key}.json", tech)
    write_json(ARCHIVE_DIR / f"enerji_{key}.json", energy)
    deleted = cleanup_archives(edition_date)
    if deleted:
        print("Silinen eski arşivler: " + ", ".join(sorted(deleted)))
    print(f"Tamamlandı: Sayı {issue}; iki güncel baskı ve iki arşiv üretildi.")


def main() -> int:
    try:
        generate()
        return 0
    except Exception as exc:
        print(f"Beklenmeyen üretim hatası: {exc}")
        try:
            edition_date, issue = edition_info()
            tech_news = complete({key: [] for key in TECH_LABELS}, TECH_FALLBACKS)
            energy_news = complete({key: [] for key in ENERGY_LABELS}, ENERGY_FALLBACKS)
            key = edition_date.isoformat()
            tech = make_edition("tech", edition_date, issue, tech_news)
            energy = make_edition("energy", edition_date, issue, energy_news)
            write_json(DATA_DIR / "edition.json", tech)
            write_json(DATA_DIR / "edition_enerji.json", energy)
            write_json(ARCHIVE_DIR / f"{key}.json", tech)
            write_json(ARCHIVE_DIR / f"enerji_{key}.json", energy)
            cleanup_archives(edition_date)
            print("Acil durum yedek havuzuyla geçerli baskılar üretildi.")
            return 0
        except Exception as fallback_exc:
            print(f"Dosya sistemi nedeniyle baskı yazılamadı: {fallback_exc}")
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
