#!/usr/bin/env python3
"""MYO Gazetesi günlük çoklu baskı üretim motoru."""

from __future__ import annotations

import html
import hashlib
import json
import os
import random
import re
import tempfile
import time as time_module
from copy import deepcopy
from datetime import date, datetime, time, timedelta
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

START_DATE = date(2026, 11, 11)
TURKEY_TZ = ZoneInfo("Europe/Istanbul")
EDITION_HOUR = 7
ARCHIVE_DAYS = 7
NEWS_PER_CATEGORY = 4
TIMEOUT = (4, 12)
TRANSLATION_DELAY = 0.75
TRANSLATION_RETRY_DELAY = 1.5
TRANSLATION_ATTEMPTS = 3
ARTICLE_SIMILARITY_THRESHOLD = 0.78
GOOGLE_TRANSLATE_COOLDOWN_SECONDS = 300
MAX_CANDIDATES_PER_CATEGORY = 60
MAX_IMAGE_PAGE_FETCHES = 30

MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
ARCHIVE_DIR = DATA_DIR / "archive"
TRANSLATION_CACHE_PATH = DATA_DIR / ".translation_cache.json"

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; MYOGazetesi/2.0; +https://github.com/) Python-requests",
    "Accept": "application/json, application/rss+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.7",
})
RETRY = Retry(
    total=3,
    connect=3,
    read=2,
    status=3,
    backoff_factor=0.6,
    # 429 kaynak bazında ele alınır; genel adapter'ın aynı isteği art arda
    # yineleyip hız sınırını ağırlaştırmasına izin verilmez.
    status_forcelist=(408, 425, 500, 502, 503, 504),
    allowed_methods=frozenset({"GET", "HEAD"}),
    respect_retry_after_header=True,
    raise_on_status=False,
)
SESSION.mount("https://", HTTPAdapter(max_retries=RETRY, pool_connections=12, pool_maxsize=12))
SESSION.mount("http://", HTTPAdapter(max_retries=RETRY, pool_connections=12, pool_maxsize=12))

TECH_LABELS = {"ai": "Yapay Zekâ", "oss": "Açık Kaynak", "web": "Web Geliştirme", "sec": "Siber Güvenlik"}
ENERGY_LABELS = {"grid": "Şebeke & Dağıtım", "ren": "Yenilenebilir Enerji", "bat": "Depolama & Batarya", "mkt": "Piyasa & Regülasyon"}
EKSIM_LABELS = {"holding": "Eksim Holding", "dicle": "Dicle Elektrik", "enerji": "Eksim Enerji", "grup": "Grup Şirketleri & Basında"}


def item(
    title: str,
    desc: str,
    url: str,
    published_at: str = "",
    image: str = "",
    source_weight: float = 0.0,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "title": title,
        "desc": desc,
        "url": url,
        "image": image or "",
    }
    if published_at:
        result["published_at"] = published_at
    if source_weight:
        result["_source_weight"] = source_weight
    return result


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

EKSIM_FALLBACKS = {
    "holding": [
        item("Eksim Holding Sürdürülebilir Büyüme Odağını Güçlendiriyor", "Holding, enerji, altyapı ve gıda alanlarındaki yatırımlarını uzun vadeli değer üretme yaklaşımıyla sürdürüyor.", "https://eksim.com.tr/"),
        item("Eksim Holding Kurumsal Dönüşüm Programlarını Yaygınlaştırıyor", "Grup şirketlerinde verimlilik, dijitalleşme ve ortak çalışma kültürünü geliştiren uygulamalar hayata geçiriliyor.", "https://eksim.com.tr/"),
        item("Eksim Holding Toplumsal Fayda Projelerine Destek Veriyor", "Eğitim, çevre ve sosyal dayanışma odaklı çalışmalar paydaşlarla iş birliği içinde yürütülüyor.", "https://eksim.com.tr/"),
        item("Eksim Holding İnsan Kaynağına Yatırımı Önceliklendiriyor", "Çalışan gelişimi, iş sağlığı ve güvenliği ile kapsayıcı kurum kültürü grup genelinde destekleniyor.", "https://eksim.com.tr/"),
    ],
    "dicle": [
        item("Dicle Elektrik Şebeke Yatırımlarını Sürdürüyor", "Kayıpsız, kesintisiz ve kaliteli enerji arzı hedefiyle dağıtım altyapısı yenileniyor ve güçlendiriliyor.", "https://www.dicleelektrik.com.tr/"),
        item("Dicle Elektrik Dijital Şebeke Uygulamalarını Geliştiriyor", "Uzaktan izleme, otomasyon ve veri analitiği çözümleriyle saha operasyonlarının etkinliği artırılıyor.", "https://www.dicleelektrik.com.tr/"),
        item("Dicle Elektrik Enerji Verimliliği Bilincini Destekliyor", "Tüketicilere yönelik bilgilendirme çalışmalarıyla enerjinin verimli ve güvenli kullanımı teşvik ediliyor.", "https://www.dicleelektrik.com.tr/"),
        item("Dicle Elektrik Saha Ekipleri Altyapı Çalışmalarını Hızlandırıyor", "Bakım ve yenileme faaliyetleriyle şebeke dayanıklılığı ve hizmet kalitesi geliştiriliyor.", "https://www.dicleelektrik.com.tr/"),
    ],
    "enerji": [
        item("Eksim Enerji Yenilenebilir Üretim Portföyünü Güçlendiriyor", "Rüzgâr ve hidroelektrik santrallerindeki işletme disipliniyle temiz enerji üretimine katkı sağlanıyor.", "https://eksimenerji.com.tr/"),
        item("Eksim Enerji Santrallerinde Verimlilik Odaklı Çalışmalar Yürütüyor", "Varlık yönetimi ve kestirimci bakım uygulamalarıyla üretim sürekliliği destekleniyor.", "https://eksimenerji.com.tr/"),
        item("Eksim Enerji Karbonsuzlaşma Hedeflerine Katkı Sunuyor", "Yenilenebilir kaynaklara dayalı üretim faaliyetleri sürdürülebilir gelecek vizyonuyla geliştiriliyor.", "https://eksimenerji.com.tr/"),
        item("Eksim Enerji İş Sağlığı ve Güvenliğini Önceliklendiriyor", "Santral operasyonlarında güvenli çalışma kültürünü güçlendiren eğitim ve denetimler sürdürülüyor.", "https://eksimenerji.com.tr/"),
    ],
    "grup": [
        item("Eksim Grup Şirketleri Ortak Değer Üretmeye Odaklanıyor", "Farklı sektörlerde faaliyet gösteren şirketler yenilikçilik, kalite ve sürdürülebilirlik ilkeleriyle çalışmalarını sürdürüyor.", "https://eksim.com.tr/"),
        item("Eksim Ventures Girişimcilik Ekosistemini Destekliyor", "Teknoloji ve yenilik odaklı girişimlerin ölçeklenmesine katkı sunan iş birlikleri geliştiriliyor.", "https://eksim.com.tr/"),
        item("Grup Şirketlerinde Dijital Dönüşüm Uygulamaları Yaygınlaşıyor", "Veriye dayalı karar alma ve süreç otomasyonu farklı iş kollarında verimliliği artırıyor.", "https://eksim.com.tr/"),
        item("Eksim Şirketlerinin Çalışmaları Basında Yer Buluyor", "Grubun yatırım, istihdam ve sürdürülebilirlik faaliyetleri kamuoyu ve sektör yayınları tarafından izleniyor.", "https://eksim.com.tr/"),
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
    "tech": [
        ("https://openai.com/news/rss.xml", 10),
        ("https://blog.google/feed/", 9),
        ("https://github.blog/feed/", 8),
        ("https://www.freecodecamp.org/news/rss/", 7),
        ("https://hnrss.org/newest", 6),
        ("https://www.cisa.gov/cybersecurity-advisories/all.xml", 10),
    ],
    "energy": [
        ("https://www.irena.org/rssfeed/latestnews", 10),
        ("https://energy.ec.europa.eu/node/2/rss_en", 9),
        ("https://www.power-eng.com/feed/", 8),
        ("https://www.renewableenergyworld.com/feed/", 8),
        ("https://www.energy-storage.news/feed/", 8),
        ("https://www.utilitydive.com/feeds/news/", 8),
    ],
}

GOOGLE_NEWS_QUERIES = {
    "tech": {
        "ai": 'yapay zeka OR "artificial intelligence" OR "yeni model"',
        "oss": '"açık kaynak" OR "open source" yazılım',
        "web": 'web geliştirme OR frontend OR tarayıcı teknolojileri',
        "sec": 'siber güvenlik OR "güvenlik açığı" OR CISA',
    },
    "energy": {
        "grid": 'elektrik şebeke OR trafo OR dağıtım OR iletim',
        "ren": 'yenilenebilir enerji OR güneş OR rüzgar OR hidroelektrik',
        "bat": 'enerji depolama OR batarya OR BESS',
        "mkt": 'enerji piyasası OR EPDK OR elektrik ihale OR tarife',
    },
    "eksim": {
        "holding": '"Eksim Holding"',
        "dicle": '"Dicle Elektrik"',
        "enerji": '"Eksim Enerji"',
        "grup": '"Eksim Ventures" OR "Eksun Gıda" OR "Eksim" şirketleri',
    },
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
    """Kısa başlıklarda da çalışan, temkinli İngilizce metin algılayıcısı."""
    words = re.findall(r"[a-z]+(?:'[a-z]+)?", str(value or "").casefold())
    if not words:
        return False
    markers = {
        "the", "and", "for", "with", "from", "into", "how", "why", "what",
        "after", "before", "over", "under", "will", "has", "have", "its",
        "new", "says", "launches", "announces", "energy", "power", "security",
        "model", "software", "open", "source", "grid", "battery", "market",
    }
    marker_count = sum(word in markers for word in words)
    return marker_count >= (1 if len(words) <= 5 else 2)









TURKISH_MONTH_NUMBERS = {
    "ocak": 1, "oca": 1, "şubat": 2, "subat": 2, "şub": 2, "sub": 2,
    "mart": 3, "mar": 3, "nisan": 4, "nis": 4, "mayıs": 5, "mayis": 5,
    "may": 5, "haziran": 6, "haz": 6, "temmuz": 7, "tem": 7,
    "ağustos": 8, "agustos": 8, "ağu": 8, "agu": 8, "eylül": 9,
    "eylul": 9, "eyl": 9, "ekim": 10, "eki": 10, "kasım": 11,
    "kasim": 11, "kas": 11, "aralık": 12, "aralik": 12, "ara": 12,
}


def parse_publication_date(value: str) -> date | None:
    text = clean_text(value, 240)
    if not text:
        return None
    try:
        parsed = parsedate_to_datetime(text)
        if parsed:
            return parsed.date()
    except (TypeError, ValueError, OverflowError):
        pass
    iso_match = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", text)
    if iso_match:
        try:
            return date.fromisoformat(iso_match.group(0))
        except ValueError:
            pass
    tr_match = re.search(
        r"\b(\d{1,2})\s+"
        r"(Ocak|Oca|Şubat|Subat|Şub|Sub|Mart|Mar|Nisan|Nis|Mayıs|Mayis|May|"
        r"Haziran|Haz|Temmuz|Tem|Ağustos|Agustos|Ağu|Agu|Eylül|Eylul|Eyl|"
        r"Ekim|Eki|Kasım|Kasim|Kas|Aralık|Aralik|Ara)"
        r"(?:\s+(20\d{2}))?\b",
        text,
        flags=re.IGNORECASE,
    )
    if tr_match:
        try:
            month = TURKISH_MONTH_NUMBERS[tr_match.group(2).casefold()]
            year = int(tr_match.group(3) or datetime.now(TURKEY_TZ).year)
            return date(year, month, int(tr_match.group(1)))
        except (KeyError, ValueError):
            pass
    return None


def publication_iso(*values: str) -> str:
    for value in values:
        parsed = parse_publication_date(value)
        if parsed:
            return parsed.isoformat()
    return ""








def turkish_item(raw: dict[str, str], label: str) -> dict[str, str] | None:
    title = translate(raw.get("title", ""))
    if not title:
        return None
    desc = translate(raw.get("desc", ""))
    if not desc:
        desc = f"{label} alanındaki bu gelişme işletme, güvenlik ve teknik uygulamalar açısından yakından izleniyor."
    return item(clean_text(title, 180), clean_text(desc, 280), raw.get("url") or "#")


def add_unique(
    bucket: list[dict[str, str]],
    candidate: dict[str, str] | None,
    limit: int = NEWS_PER_CATEGORY,
) -> None:
    if not candidate or len(bucket) >= limit:
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






def classify_eksim(title: str, desc: str, default: str = "holding") -> str:
    text = f"{title} {desc}".casefold()
    if any(word in text for word in ("dicle elektrik", "elektrik dağıtım", "dağıtım şebeke")):
        return "dicle"
    if any(word in text for word in ("eksim enerji", "rüzgâr", "rüzgar", "hidroelektrik", "santral", "yenilenebilir")):
        return "enerji"
    if any(word in text for word in ("eksim ventures", "grup şirket", "basın", "medya", "girişim")):
        return "grup"
    return default



EKSIM_IGNORED_TITLES = {
    "tüm haberleri gör", "tum haberleri gor", "medya merkezi", "haberler",
    "detay", "detaylı bilgi", "devamını oku", "devamini oku", "daha fazla",
}


def is_eksim_navigation_title(value: str) -> bool:
    normalized = re.sub(r"\s+", " ", clean_text(value, 180).casefold()).strip()
    return normalized in EKSIM_IGNORED_TITLES




def eksim_sort_key(article: dict[str, str], edition_date: date) -> tuple[int, int, str]:
    published = parse_publication_date(article.get("published_at", ""))
    if published:
        return (1, published.toordinal(), article.get("title", "").casefold())
    digest = hashlib.sha256(
        f"{edition_date.isoformat()}|{article.get('title', '')}".encode("utf-8")
    ).hexdigest()
    return (0, 0, digest)


def prepare_eksim_news(
    candidates: dict[str, list[dict[str, str]]],
    edition_date: date,
) -> dict[str, list[dict[str, str]]]:
    prepared: dict[str, list[dict[str, str]]] = {key: [] for key in EKSIM_LABELS}
    for category in EKSIM_LABELS:
        eligible = []
        for article in candidates.get(category, []):
            if is_eksim_navigation_title(article.get("title", "")):
                continue
            published = parse_publication_date(article.get("published_at", "")) or parse_publication_date(
                f"{article.get('title', '')} {article.get('desc', '')}"
            )
            if published and published > edition_date:
                continue
            normalized = deepcopy(article)
            if published:
                normalized["published_at"] = published.isoformat()
            eligible.append(normalized)
        eligible.sort(key=lambda article: eksim_sort_key(article, edition_date), reverse=True)

        for article in eligible:
            add_unique(prepared[category], article)
        fallback_offset = (edition_date - START_DATE).days % len(EKSIM_FALLBACKS[category])
        rotated_fallbacks = (
            EKSIM_FALLBACKS[category][fallback_offset:]
            + EKSIM_FALLBACKS[category][:fallback_offset]
        )
        for fallback in rotated_fallbacks:
            add_unique(prepared[category], deepcopy(fallback))
        prepared[category] = prepared[category][:NEWS_PER_CATEGORY]
    return prepared





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




def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, path)


def cleanup_archives(edition_date: date) -> list[str]:
    deleted = []
    pattern = re.compile(r"^(?:enerji_|eksim_)?(\d{4}-\d{2}-\d{2})\.json$")
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



def write_eksim_archive_index() -> None:
    editions = []
    if ARCHIVE_DIR.exists():
        for path in ARCHIVE_DIR.glob("eksim_*.json"):
            match = re.fullmatch(r"eksim_(\d{4}-\d{2}-\d{2})\.json", path.name)
            if not match:
                continue
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                date_key = str(payload.get("date_key") or match.group(1))
                date.fromisoformat(date_key)
            except (OSError, ValueError, json.JSONDecodeError, TypeError):
                continue
            editions.append({
                "date_key": date_key,
                "date": payload.get("date") or date_key,
                "issue": payload.get("issue"),
                "file": f"data/archive/{path.name}",
            })
    editions.sort(key=lambda entry: entry["date_key"], reverse=True)
    write_json(
        ARCHIVE_DIR / "eksim_index.json",
        {
            "updated_at": datetime.now(TURKEY_TZ).isoformat(timespec="seconds"),
            "editions": editions,
        },
    )



# ---------- V2: DAYANIKLI TOPLAMA, ÇEVİRİ, PUANLAMA VE GÖRSEL ----------

IMPACT_KEYWORDS = {
    "forbes": 22, "kapak": 18, "cover": 16, "yatırım": 18, "investment": 18,
    "milyar": 20, "billion": 20, "ihale": 17, "tender": 17, "rekor": 16,
    "record": 16, "açılış": 14, "opening": 14, "lansman": 14, "launch": 14,
    "güvenlik açığı": 22, "vulnerability": 22, "zero-day": 25, "kritik": 14,
    "critical": 14, "yeni model": 18, "new model": 18, "şebeke": 15,
    "grid": 15, "depolama": 15, "storage": 15, "santral": 15, "power plant": 15,
    "trafo": 14, "transformer": 14, "satın alma": 14, "acquisition": 14,
    "ortaklık": 12, "partnership": 12, "ödül": 10, "award": 10,
}
TRANSLATION_CACHE: dict[str, str] = {}
TRANSLATION_CACHE_DIRTY = False
LAST_TRANSLATION_AT = 0.0
GOOGLE_TRANSLATE_COOLDOWN_UNTIL = 0.0
IMAGE_PAGE_FETCH_COUNT = 0
IMAGE_CACHE: dict[str, str] = {}
ARTICLE_URL_CACHE: dict[str, str] = {}

GENERIC_TRANSLATION_MARKERS = (
    "uluslararası kaynakta yeni gelişme",
    "kritik siber güvenlik gelişmesi",
    "yeni yapay zeka gelişmesi",
    "elektrik şebekesi gelişmesi",
    "enerji depolama gelişmesi",
    "yenilenebilir enerji gelişmesi",
    "önemli yatırım gelişmesi",
    "yeni ürün ve lansman gelişmesi",
    "güncellik ve olası etkileri açısından yakından izleniyor",
)


def is_generic_translation(value: str) -> bool:
    lowered = str(value or "").casefold()
    return any(marker in lowered for marker in GENERIC_TRANSLATION_MARKERS)


def load_translation_cache() -> None:
    global TRANSLATION_CACHE
    try:
        payload = json.loads(TRANSLATION_CACHE_PATH.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            TRANSLATION_CACHE = {
                str(key): str(value)
                for key, value in payload.items()
                if value and not is_generic_translation(str(value))
            }
    except (OSError, json.JSONDecodeError, TypeError):
        TRANSLATION_CACHE = {}


def save_translation_cache() -> None:
    global TRANSLATION_CACHE_DIRTY
    if not TRANSLATION_CACHE_DIRTY:
        return
    write_json(TRANSLATION_CACHE_PATH, TRANSLATION_CACHE)
    TRANSLATION_CACHE_DIRTY = False


load_translation_cache()


def request_response(url: str, *, accept_json: bool = False) -> requests.Response | None:
    try:
        headers = {"Accept": "application/json"} if accept_json else None
        response = SESSION.get(url, timeout=TIMEOUT, headers=headers)
        if response.status_code == 429:
            print(f"Hız sınırı nedeniyle kaynak atlandı: {url}")
            return None
        if response.status_code == 403:
            return None
        if response.status_code >= 400:
            print(f"Kaynak HTTP {response.status_code} döndürdü: {url}")
            return None
        return response
    except requests.RequestException as exc:
        print(f"Kaynak kullanılamadı ({url}): {exc}")
        return None


def get_json(url: str) -> Any:
    response = request_response(url, accept_json=True)
    if not response:
        return None
    try:
        return response.json()
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"JSON çözümlenemedi ({url}): {exc}")
        return None


def get_text(url: str) -> str:
    response = request_response(url)
    return response.text if response else ""


def valid_image_url(value: str, *, width: int | None = None, height: int | None = None) -> str:
    url = html.unescape(str(value or "")).strip()
    if not re.match(r"^https?://", url, flags=re.IGNORECASE):
        return ""
    path = unquote(urlparse(url).path).casefold()
    if re.search(r"\.(?:svg|gif)(?:$|[/?#])", path, flags=re.IGNORECASE):
        return ""
    if any(token in path for token in (
        "favicon", "sprite", "avatar", "badge", "emoji", "icon-", "/icons/",
        "/logo/", "site-logo", "brand-logo", "placeholder", "tracking-pixel",
    )):
        return ""
    if width is not None and width > 0 and width < 280:
        return ""
    if height is not None and height > 0 and height < 140:
        return ""
    return url


def positive_int(value: Any) -> int | None:
    match = re.fullmatch(r"\s*(\d+)(?:px)?\s*", str(value or ""), flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def extract_tag_image(tag: Any, base_url: str = "") -> str:
    if not tag:
        return ""
    width = positive_int(tag.get("width"))
    height = positive_int(tag.get("height"))
    for attribute in ("url", "href", "src"):
        candidate = urljoin(base_url, tag.get(attribute, "")) if base_url else tag.get(attribute, "")
        image = valid_image_url(candidate, width=width, height=height)
        if image:
            return image
    return ""


def extract_entry_image(entry: Any, description_html: str = "", base_url: str = "") -> str:
    for name in ("media:content", "media:thumbnail", "thumbnail", "enclosure"):
        for tag in entry.find_all(name):
            medium = str(tag.get("medium", "")).casefold()
            mime = str(tag.get("type", "")).casefold()
            if medium and medium != "image":
                continue
            if mime and not mime.startswith("image/"):
                continue
            image = extract_tag_image(tag, base_url)
            if image:
                return image
    if description_html:
        fragment = BeautifulSoup(description_html, "html.parser")
        image_tag = fragment.find("img")
        if image_tag:
            candidates = [
                image_tag.get("src", ""),
                image_tag.get("data-src", ""),
                image_tag.get("data-original", ""),
            ]
            width = positive_int(image_tag.get("width"))
            height = positive_int(image_tag.get("height"))
            for candidate in candidates:
                candidate = urljoin(base_url, candidate) if base_url else candidate
                image = valid_image_url(candidate, width=width, height=height)
                if image:
                    return image
    return ""


def parse_rss(xml: str, source_weight: float = 0.0) -> list[dict[str, Any]]:
    if not xml:
        return []
    soup = BeautifulSoup(xml, "xml")
    results: list[dict[str, Any]] = []
    for entry in soup.find_all(["item", "entry"])[:60]:
        title_tag = entry.find("title")
        desc_tag = entry.find("description") or entry.find("summary") or entry.find("content")
        date_tag = entry.find("pubDate") or entry.find("published") or entry.find("updated") or entry.find("date")
        link_tag = entry.find("link")
        link = ""
        if link_tag:
            link = link_tag.get("href") or link_tag.get_text(strip=True)
        raw_desc = str(desc_tag) if desc_tag else ""
        title = clean_text(title_tag.get_text(" ", strip=True) if title_tag else "", 220)
        desc = clean_text(desc_tag.get_text(" ", strip=True) if desc_tag else "", 420)
        if title and link:
            results.append(item(
                title,
                desc,
                link,
                publication_iso(date_tag.get_text(" ", strip=True) if date_tag else "", title, desc),
                extract_entry_image(entry, raw_desc, link),
                source_weight,
            ))
    return results


def google_news_url(query: str) -> str:
    return "https://news.google.com/rss/search?q=" + quote(query) + "&hl=tr&gl=TR&ceid=TR:tr"


def looks_turkish(value: str) -> bool:
    lowered = f" {value.casefold()} "
    words = (" ve ", " için ", " ile ", " yeni ", " enerji ", " elektrik ", " güvenlik ", " yapay ")
    return any(char in value for char in "çğıöşüÇĞİÖŞÜ") or any(word in lowered for word in words)


def needs_translation(value: str) -> bool:
    text = clean_text(value, 600)
    if not text or looks_turkish(text):
        return False
    return looks_english(text)


def valid_translation(value: str) -> str | None:
    translated = clean_text(value, 600)
    if not translated or is_generic_translation(translated) or needs_translation(translated):
        return None
    return translated


def google_translate(text: str) -> str | None:
    global GOOGLE_TRANSLATE_COOLDOWN_UNTIL
    if time_module.monotonic() < GOOGLE_TRANSLATE_COOLDOWN_UNTIL:
        return None
    url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=" + quote(text)
    try:
        response = SESSION.get(url, timeout=TIMEOUT, headers={"Accept": "application/json"})
    except requests.RequestException:
        return None
    if response.status_code == 429:
        GOOGLE_TRANSLATE_COOLDOWN_UNTIL = time_module.monotonic() + GOOGLE_TRANSLATE_COOLDOWN_SECONDS
        print("Google çeviri hız sınırına ulaştı; geçici olarak yedek servis kullanılacak.")
        return None
    if response.status_code >= 400:
        return None
    try:
        payload = response.json()
        return valid_translation("".join(part[0] for part in payload[0] if part and part[0]))
    except (ValueError, TypeError, IndexError, KeyError):
        return None


def mymemory_translate(text: str) -> str | None:
    url = "https://api.mymemory.translated.net/get?q=" + quote(text) + "&langpair=en|tr"
    for attempt in range(2):
        try:
            response = SESSION.get(url, timeout=TIMEOUT, headers={"Accept": "application/json"})
            if response.status_code in {403, 429}:
                return None
            response.raise_for_status()
            payload = response.json()
            translated = payload.get("responseData", {}).get("translatedText", "")
            result = valid_translation(html.unescape(str(translated)))
            if result:
                return result
        except (requests.RequestException, ValueError, TypeError, AttributeError):
            pass
        if attempt == 0:
            time_module.sleep(TRANSLATION_RETRY_DELAY)
    return None


def translate(value: str, label: str = "Gündem", *, title: bool = False) -> str | None:
    global LAST_TRANSLATION_AT, TRANSLATION_CACHE_DIRTY
    text = clean_text(value, 600)
    if not text or not needs_translation(text):
        return text
    cache_material = f"{'title' if title else 'desc'}\0{label}\0{text}"
    cache_key = hashlib.sha256(cache_material.encode("utf-8")).hexdigest()
    cached = TRANSLATION_CACHE.get(cache_key)
    if cached and not is_generic_translation(cached) and not needs_translation(cached):
        return cached

    elapsed = time_module.monotonic() - LAST_TRANSLATION_AT
    if elapsed < TRANSLATION_DELAY:
        time_module.sleep(TRANSLATION_DELAY - elapsed + random.uniform(0.02, 0.08))

    translated = google_translate(text)
    LAST_TRANSLATION_AT = time_module.monotonic()
    if not translated:
        translated = mymemory_translate(text)
    if not translated:
        return None

    TRANSLATION_CACHE[cache_key] = translated
    TRANSLATION_CACHE_DIRTY = True
    return translated


def article_date(article: dict[str, Any]) -> date | None:
    return parse_publication_date(str(article.get("published_at", ""))) or parse_publication_date(
        f"{article.get('title', '')} {article.get('desc', '')}"
    )


def normalized_title(value: str) -> str:
    text = clean_text(value, 240).casefold()
    text = re.sub(r"\s+-\s+[^-]+$", "", text)
    return re.sub(r"[^a-z0-9çğıöşü]+", " ", text).strip()


def normalized_article_text(article: dict[str, Any]) -> str:
    combined = f"{article.get('title', '')} {article.get('desc', '')}"
    text = clean_text(combined, 900).casefold()
    text = re.sub(r"\b(?:ve|ile|için|bir|bu|the|and|for|with|from|of|to|in)\b", " ", text)
    return re.sub(r"[^a-z0-9çğıöşü]+", " ", text).strip()


def article_richness(article: dict[str, Any]) -> tuple[int, int, int, float]:
    """Benzer kayıtlarda daha açıklayıcı ve kullanılabilir olanı seçer."""
    desc = clean_text(str(article.get("desc", "")), 900)
    title = clean_text(str(article.get("title", "")), 300)
    return (
        int(bool(desc)),
        len(desc),
        int(bool(article.get("image"))) + int(bool(article.get("published_at"))),
        float(article.get("_source_weight", 0.0) or 0.0) + len(title) / 1000,
    )


def similar_articles(first: dict[str, Any], second: dict[str, Any]) -> bool:
    if similar_titles(str(first.get("title", "")), str(second.get("title", ""))):
        return True
    a, b = normalized_article_text(first), normalized_article_text(second)
    if not a or not b:
        return False
    a_words, b_words = set(a.split()), set(b.split())
    union = a_words | b_words
    jaccard = len(a_words & b_words) / len(union) if union else 0.0
    sequence = SequenceMatcher(None, a, b).ratio()
    return jaccard >= ARTICLE_SIMILARITY_THRESHOLD or sequence >= 0.86


def similar_titles(first: str, second: str) -> bool:
    a, b = normalized_title(first), normalized_title(second)
    if not a or not b:
        return False
    if a == b:
        return True
    a_words, b_words = set(a.split()), set(b.split())
    union = a_words | b_words
    jaccard = len(a_words & b_words) / len(union) if union else 0
    return jaccard >= 0.72 or SequenceMatcher(None, a, b).ratio() >= 0.84


def article_score(article: dict[str, Any], edition_date: date) -> float:
    published = article_date(article)
    if published and published > edition_date:
        return float("-inf")
    if published:
        age = max(0, (edition_date - published).days)
        recency = max(0.0, 48.0 - min(age, 120) * 0.55)
    else:
        recency = 5.0
    text = f"{article.get('title', '')} {article.get('desc', '')}".casefold()
    impact = sum(weight for keyword, weight in IMPACT_KEYWORDS.items() if keyword in text)
    source = float(article.get("_source_weight", 0.0) or 0.0)
    image_bonus = 1.5 if article.get("image") else 0.0
    return recency + impact + source + image_bonus


def add_candidate(bucket: list[dict[str, Any]], candidate: dict[str, Any] | None) -> None:
    if not candidate or not clean_text(str(candidate.get("title", "")), 220):
        return
    for index, old in enumerate(bucket):
        if similar_articles(candidate, old):
            if article_richness(candidate) > article_richness(old):
                bucket[index] = candidate
            return
    if len(bucket) >= MAX_CANDIDATES_PER_CATEGORY:
        return
    bucket.append(candidate)


def is_google_news_url(url: str) -> bool:
    host = (urlparse(str(url or "")).hostname or "").casefold()
    return host == "news.google.com" or host.endswith(".news.google.com")


def resolve_article_url(url: str) -> str:
    """Google Haberler ara bağlantısından mümkünse gerçek yayıncı URL'sini çıkarır."""
    if not is_google_news_url(url):
        return url
    if url in ARTICLE_URL_CACHE:
        return ARTICLE_URL_CACHE[url]
    resolved = ""
    try:
        response = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
        if response.status_code < 400 and not is_google_news_url(response.url):
            resolved = response.url
        elif response.status_code < 400:
            soup = BeautifulSoup(response.text, "html.parser")
            candidates: list[str] = []
            for tag in soup.find_all(["a", "link", "meta"]):
                candidate = tag.get("href") or tag.get("content") or ""
                if candidate.startswith("//"):
                    candidate = "https:" + candidate
                if candidate.startswith("/"):
                    query_url = parse_qs(urlparse(candidate).query).get("url", [""])[0]
                    candidate = query_url or ""
                candidate = unquote(candidate)
                host = (urlparse(candidate).hostname or "").casefold()
                if candidate.startswith("http") and host and not (
                    host.endswith("google.com") or host.endswith("gstatic.com")
                ):
                    candidates.append(candidate)
            resolved = candidates[0] if candidates else ""
    except requests.RequestException as exc:
        print(f"Google Haberler bağlantısı çözümlenemedi: {exc}")
    ARTICLE_URL_CACHE[url] = resolved or url
    return ARTICLE_URL_CACHE[url]


def meta_image_dimensions(soup: Any) -> tuple[int | None, int | None]:
    width = height = None
    for meta in soup.find_all("meta"):
        name = str(meta.get("property") or meta.get("name") or "").casefold()
        if name in {"og:image:width", "twitter:image:width"}:
            width = positive_int(meta.get("content"))
        elif name in {"og:image:height", "twitter:image:height"}:
            height = positive_int(meta.get("content"))
    return width, height


def discover_og_image(url: str) -> str:
    global IMAGE_PAGE_FETCH_COUNT
    if not url:
        return ""
    if url in IMAGE_CACHE:
        return IMAGE_CACHE[url]
    if IMAGE_PAGE_FETCH_COUNT >= MAX_IMAGE_PAGE_FETCHES:
        return ""
    IMAGE_PAGE_FETCH_COUNT += 1
    article_url = resolve_article_url(url)
    if is_google_news_url(article_url):
        IMAGE_CACHE[url] = ""
        return ""
    response = request_response(article_url)
    page = response.text if response else ""
    image = ""
    if page:
        soup = BeautifulSoup(page, "html.parser")
        width, height = meta_image_dimensions(soup)
        for tag in soup.find_all("meta"):
            name = str(tag.get("property") or tag.get("name") or "").casefold()
            if name not in {"og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"}:
                continue
            image = valid_image_url(
                urljoin(article_url, tag.get("content", "")),
                width=width,
                height=height,
            )
            if image:
                break
    IMAGE_CACHE[url] = image
    if article_url != url:
        IMAGE_CACHE[article_url] = image
    return image


def public_article(article: dict[str, Any], label: str) -> dict[str, Any] | None:
    title = translate(str(article.get("title", "")), label, title=True)
    desc = translate(str(article.get("desc", "")), label, title=False)
    if not title or not desc:
        return None
    image = valid_image_url(str(article.get("image", "")))
    if not image:
        image = discover_og_image(str(article.get("url", "")))
    result: dict[str, Any] = {
        "title": clean_text(title, 180),
        "desc": clean_text(desc, 280),
        "url": str(article.get("url") or "#"),
        "image": image or "",
        # JSON'a yazılmadan önce kaldırılan dahili sıralama değeri. Böylece
        # çeviri başlığı değiştirse bile manşet ham haberin gerçek puanıyla seçilir.
        "_score": article.get("_score", 0.0),
    }
    published = article_date(article)
    if published:
        result["published_at"] = published.isoformat()
    return result


def rank_category(
    candidates: list[dict[str, Any]],
    fallbacks: list[dict[str, Any]],
    edition_date: date,
    label: str,
    global_seen: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    pool = [deepcopy(article) for article in candidates]
    for fallback in fallbacks:
        fallback_copy = deepcopy(fallback)
        fallback_copy.setdefault("_source_weight", -2)
        pool.append(fallback_copy)
    eligible = [article for article in pool if article_score(article, edition_date) != float("-inf")]
    eligible.sort(key=lambda article: (
        article_score(article, edition_date),
        article_date(article).toordinal() if article_date(article) else 0,
        normalized_title(str(article.get("title", ""))),
    ), reverse=True)

    selected: list[dict[str, Any]] = []
    public_items: list[dict[str, Any]] = []
    translated_seen: list[dict[str, Any]] = []
    for article in eligible:
        duplicate_index = next((
            index for index, old in enumerate(selected) if similar_articles(article, old)
        ), None)
        if duplicate_index is not None:
            if article_richness(article) > article_richness(selected[duplicate_index]):
                selected[duplicate_index] = article
            continue
        selected.append(article)
        article["_score"] = article_score(article, edition_date)
        public = public_article(article, label)
        if not public:
            continue
        if any(similar_articles(public, old) for old in translated_seen):
            continue
        if global_seen is not None and any(similar_articles(public, old) for old in global_seen):
            continue
        translated_seen.append(public)
        if global_seen is not None:
            global_seen.append(public)
        public_items.append(public)
        if len(public_items) >= NEWS_PER_CATEGORY:
            break
    return public_items


def finalize_news(
    candidates: dict[str, list[dict[str, Any]]],
    fallbacks: dict[str, list[dict[str, Any]]],
    labels: dict[str, str],
    edition_date: date,
) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    global_seen: list[dict[str, Any]] = []
    for category, label in labels.items():
        result[category] = rank_category(
            candidates.get(category, []), fallbacks[category], edition_date, label, global_seen
        )
    return result


def classify_tech(title: str, desc: str, tags: list[str] | None = None) -> str | None:
    text = f" {title} {desc} {' '.join(tags or [])} ".casefold()
    rules = {
        "sec": ["security", "cyber", "vulnerability", "malware", "phishing", "passkey", "owasp", "siber", "güvenlik açığı"],
        "ai": [" ai ", "artificial intelligence", "machine learning", "llm", "model", "agent", "prompt", "yapay zeka", "gemini", "openai"],
        "oss": ["open source", "linux", "github", " git ", "kernel", "docker", "kubernetes", "açık kaynak"],
        "web": ["web", "javascript", "typescript", "react", "css", "html", "browser", "frontend", "tarayıcı"],
    }
    return next((category for category, words in rules.items() if any(word in text for word in words)), None)


def classify_energy(title: str, desc: str) -> str:
    text = f"{title} {desc}".casefold()
    rules = {
        "bat": ["battery", "storage", "lithium", "bess", "cell", "thermal runaway", "batarya", "depolama"],
        "ren": ["solar", "wind", "renewable", "photovoltaic", "geothermal", "hydrogen", "güneş", "rüzgar", "rüzgâr", "yenilenebilir", "hidroelektrik"],
        "mkt": ["market", "regulation", "policy", "tariff", "price", "auction", "utility", "piyasa", "regülasyon", "tarife", "ihale", "epdk"],
        "grid": ["grid", "transformer", "substation", "transmission", "distribution", "scada", "relay", "outage", "şebeke", "trafo", "dağıtım", "iletim"],
    }
    return next((category for category, words in rules.items() if any(word in text for word in words)), "grid")


def fetch_google_category_news(
    queries: dict[str, str],
    buckets: dict[str, list[dict[str, Any]]],
    source_weight: float = 12,
) -> None:
    for category, query in queries.items():
        for article in parse_rss(get_text(google_news_url(query)), source_weight):
            article["title"] = re.sub(r"\s+-\s+[^-]+$", "", str(article.get("title", ""))).strip()
            if looks_turkish(f"{article.get('title', '')} {article.get('desc', '')}"):
                article["_source_weight"] = float(article.get("_source_weight", 0.0) or 0.0) + 5
            add_candidate(buckets[category], article)


def fetch_tech_news(edition_date: date) -> dict[str, list[dict[str, Any]]]:
    news: dict[str, list[dict[str, Any]]] = {key: [] for key in TECH_LABELS}
    articles = get_json("https://dev.to/api/articles?per_page=80") or []
    if isinstance(articles, list):
        for article_data in articles:
            category = classify_tech(
                str(article_data.get("title", "")),
                str(article_data.get("description", "")),
                article_data.get("tag_list") or [],
            )
            if category:
                add_candidate(news[category], item(
                    str(article_data.get("title", "")),
                    str(article_data.get("description", "")),
                    str(article_data.get("url") or "#"),
                    publication_iso(str(article_data.get("published_at", ""))),
                    valid_image_url(str(article_data.get("cover_image") or article_data.get("social_image") or "")),
                    6,
                ))
    for source, weight in RSS_SOURCES["tech"]:
        for article in parse_rss(get_text(source), weight):
            category = classify_tech(str(article.get("title", "")), str(article.get("desc", "")))
            if category:
                add_candidate(news[category], article)
    fetch_google_category_news(GOOGLE_NEWS_QUERIES["tech"], news)
    return finalize_news(news, TECH_FALLBACKS, TECH_LABELS, edition_date)


def fetch_energy_news(edition_date: date) -> dict[str, list[dict[str, Any]]]:
    news: dict[str, list[dict[str, Any]]] = {key: [] for key in ENERGY_LABELS}
    for source, weight in RSS_SOURCES["energy"]:
        for article in parse_rss(get_text(source), weight):
            add_candidate(news[classify_energy(str(article.get("title", "")), str(article.get("desc", "")))], article)
    fetch_google_category_news(GOOGLE_NEWS_QUERIES["energy"], news)
    return finalize_news(news, ENERGY_FALLBACKS, ENERGY_LABELS, edition_date)


def eksim_site_articles() -> list[dict[str, Any]]:
    base_url = "https://eksim.com.tr/"
    queue = [base_url, urljoin(base_url, "medya-merkezi/haberler")]
    seen_pages: set[str] = set()
    articles: list[dict[str, Any]] = []
    section_words = ("haber", "medya", "duyuru", "basin", "basın", "bulten", "bülten")
    while queue and len(seen_pages) < 8:
        page_url = queue.pop(0)
        if page_url in seen_pages:
            continue
        seen_pages.add(page_url)
        page = get_text(page_url)
        if not page:
            continue
        soup = BeautifulSoup(page, "html.parser")
        page_og = soup.find("meta", property="og:image")
        page_image = valid_image_url(urljoin(page_url, page_og.get("content", ""))) if page_og else ""
        for anchor in soup.find_all("a", href=True):
            full_url = urljoin(page_url, anchor.get("href", ""))
            if not full_url.startswith(base_url):
                continue
            path_text = full_url.casefold()
            if any(word in path_text for word in section_words) and full_url not in seen_pages and full_url not in queue:
                queue.append(full_url)
            title = clean_text(anchor.get_text(" ", strip=True), 180)
            if len(title) < 12 or is_eksim_navigation_title(title) or full_url.rstrip("/") == page_url.rstrip("/"):
                continue
            container = anchor.find_parent(["article", "li", "div"])
            summary_tag = container.find("p") if container else None
            time_tag = container.find("time") if container else None
            image_tag = container.find("img") if container else None
            desc = clean_text(summary_tag.get_text(" ", strip=True) if summary_tag else "", 320)
            image = valid_image_url(urljoin(page_url, image_tag.get("src", ""))) if image_tag else page_image
            if any(word in path_text for word in section_words) or (container and container.find(["h1", "h2", "h3", "h4"])):
                articles.append(item(
                    title,
                    desc,
                    full_url,
                    publication_iso(
                        time_tag.get("datetime", "") if time_tag else "",
                        time_tag.get_text(" ", strip=True) if time_tag else "",
                        title,
                    ),
                    image,
                    11,
                ))
    return articles


def fetch_eksim_news(edition_date: date) -> dict[str, list[dict[str, Any]]]:
    news: dict[str, list[dict[str, Any]]] = {key: [] for key in EKSIM_LABELS}
    for article in eksim_site_articles():
        category = classify_eksim(str(article.get("title", "")), str(article.get("desc", "")))
        if not article.get("desc"):
            article["desc"] = f"{EKSIM_LABELS[category]} bünyesindeki bu gelişme kurumsal kanallardan paylaşıldı."
        add_candidate(news[category], article)
    fetch_google_category_news(GOOGLE_NEWS_QUERIES["eksim"], news, source_weight=8)
    return finalize_news(news, EKSIM_FALLBACKS, EKSIM_LABELS, edition_date)


def best_lead(news: dict[str, list[dict[str, Any]]], edition_date: date) -> dict[str, Any]:
    candidates = [article for articles in news.values() for article in articles]
    if not candidates:
        return item("Günün öne çıkan gelişmesi", "Günün haber akışı hazırlanıyor.", "#")
    return max(candidates, key=lambda article: float(article.get("_score", article_score(article, edition_date))))


def strip_internal_fields(news: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    return {
        category: [
            {key: value for key, value in article.items() if not key.startswith("_")}
            for article in articles
        ]
        for category, articles in news.items()
    }


def make_edition(kind: str, edition_date: date, issue: int, news: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    lead = best_lead(news, edition_date)
    public_news = strip_internal_fields(news)
    if kind == "tech":
        puzzle = deepcopy(AI_PUZZLE)
        quote_text = "\"Önce çalıştır, sonra doğru yap, sonra hızlı yap.\""
        editorial = item("Ajanlar Çağında Kodu Okumak Yazmaktan Değerli", "Kod üretimi hızlanırken niyeti, güvenlik sınırlarını, testleri ve ortaya çıkan davranışı birlikte değerlendirmek gerekir.", "")
        fact = item("Zero-Shot Inference", "Bir modelin görevi daha önce örnek görmeden yalnızca bağlam ve talimatla tamamlayabilme yeteneğidir.", "")
        body = "Yapay zekâ ve yazılım dünyasında model güvenliği, veri gizliliği, açık kaynak sürdürülebilirliği ve web performansı aynı mühendislik zincirinin parçaları hâline geliyor. Ekipler için temel hedef otomasyonu ölçülebilir kalite kontrolleri ve insan denetimiyle birlikte işletmek.\n\nBu baskı güvenilir Türkçe ve uluslararası kaynakları önem ve güncellik puanıyla sıralar."
    elif kind == "energy":
        puzzle = deepcopy(ENERGY_PUZZLE)
        quote_text = "\"Güvenilir şebeke, ölçülen ve yönetilen şebekedir.\""
        editorial = item("Dağıtım Şebekesinin Dijital İkizi Sahadaki Disiplindir", "SCADA şeması, koruma ayarları ve fiziksel bağlantılar aynı gerçeği göstermediğinde otomasyon güvenilir sonuç üretemez.", "")
        fact = item("Güç Katsayısı (cosφ)", "Aktif gücün görünür güce oranıdır; düşük değer daha yüksek akım, kayıp ve gerilim düşümü oluşturur.", "")
        body = "Elektrik şebekesinin dönüşümü koruma, otomasyon, yenilenebilir üretim, depolama ve piyasa tasarımını aynı işletme disiplini içinde buluşturuyor. Doğru zaman damgalı saha verisi hızlı ve güvenli kararın temelidir.\n\nBu baskı güvenilir enerji kaynaklarını önem ve güncellik puanıyla sıralar."
    elif kind == "eksim":
        puzzle = []
        quotes = [
            "\"İnsana, topluma ve geleceğe değer katan yatırımlar kalıcı iz bırakır.\"",
            "\"Ortak vizyon, farklı yetkinlikleri güçlü bir gelecekte buluşturur.\"",
            "\"Sürdürülebilir büyüme, bugünün başarısını yarının sorumluluğuyla birleştirir.\"",
            "\"Güçlü kurumlar değişimi veriye, insana ve ortak değere dönüştürür.\"",
        ]
        facts = [
            item("Sürdürülebilir Değer", "Bir kurumun ekonomik performansını çevresel sorumluluk, toplumsal fayda ve güçlü yönetişimle birlikte uzun vadeli olarak geliştirmesidir.", ""),
            item("Dağıtım Şebekesi", "Elektriği iletim sisteminden alıp tüketicilere güvenli, sürekli ve kaliteli biçimde ulaştıran altyapı bütünüdür.", ""),
            item("Yenilenebilir Üretim", "Rüzgâr, güneş ve su gibi doğal olarak yenilenen kaynaklardan düşük karbonlu elektrik üretimidir.", ""),
            item("Kurumsal Yönetişim", "Yetki, sorumluluk, şeffaflık ve hesap verebilirlik ilkeleriyle kurumun karar süreçlerini düzenleyen yapıdır.", ""),
        ]
        quote_text = quotes[(issue - 1) % len(quotes)]
        editorial = item("Ortak Vizyon, Sürdürülebilir Değer", "Eksim Holding ve grup şirketlerinin farklı sektörlerdeki yetkinliği; güven, yenilikçilik ve sorumlu büyüme yaklaşımıyla ortak bir kurumsal vizyonda buluşuyor.", "")
        fact = facts[(issue - 1) % len(facts)]
        body = "Eksim Holding ve grup şirketleri; enerji, elektrik dağıtımı, gıda ve girişimcilik alanlarındaki faaliyetlerini sürdürülebilir büyüme ve toplumsal fayda anlayışıyla yürütüyor.\n\nBu baskı kurumsal kanallar ile güncel Türkçe basın kaynaklarını önem ve güncellik puanıyla sıralar."
    else:
        raise ValueError(f"Bilinmeyen baskı türü: {kind}")
    if kind != "eksim":
        validate_puzzle(puzzle)
    return {
        "issue": issue,
        "date": date_label(edition_date),
        "date_key": edition_date.isoformat(),
        "quote": quote_text,
        "lead": {"title": lead["title"], "deck": lead["desc"], "body": body},
        "editorial": {"title": editorial["title"], "body": editorial["desc"]},
        "fact": {"title": fact["title"], "body": fact["desc"]},
        "news": public_news,
        "puzzle": puzzle,
    }


def generate() -> None:
    run_started_at = datetime.now(TURKEY_TZ)
    edition_date, issue = edition_info(run_started_at)
    print(f"Baskı hazırlanıyor: {date_label(edition_date)} — Sayı {issue}")
    try:
        tech_news = fetch_tech_news(edition_date)
    except Exception as exc:
        print(f"Teknoloji akışı yedek havuza geçti: {exc}")
        tech_news = complete({key: [] for key in TECH_LABELS}, TECH_FALLBACKS)
    try:
        energy_news = fetch_energy_news(edition_date)
    except Exception as exc:
        print(f"Enerji akışı yedek havuza geçti: {exc}")
        energy_news = complete({key: [] for key in ENERGY_LABELS}, ENERGY_FALLBACKS)
    try:
        eksim_news = fetch_eksim_news(edition_date)
    except Exception as exc:
        print(f"Eksim akışı yedek havuza geçti: {exc}")
        eksim_news = prepare_eksim_news({key: [] for key in EKSIM_LABELS}, edition_date)

    tech = make_edition("tech", edition_date, issue, tech_news)
    energy = make_edition("energy", edition_date, issue, energy_news)
    eksim = make_edition("eksim", edition_date, issue, eksim_news)
    key = edition_date.isoformat()
    write_json(DATA_DIR / "edition.json", tech)
    write_json(DATA_DIR / "edition_enerji.json", energy)
    write_json(DATA_DIR / "edition_eksim.json", eksim)
    write_json(ARCHIVE_DIR / f"{key}.json", tech)
    write_json(ARCHIVE_DIR / f"enerji_{key}.json", energy)
    write_json(ARCHIVE_DIR / f"eksim_{key}.json", eksim)
    deleted = cleanup_archives(edition_date)
    write_eksim_archive_index()
    if deleted:
        print("Silinen eski arşivler: " + ", ".join(sorted(deleted)))
    save_translation_cache()
    print(f"Tamamlandı: Sayı {issue}; üç güncel baskı ve üç arşiv üretildi.")


def main() -> int:
    try:
        generate()
        return 0
    except Exception as exc:
        print(f"Beklenmeyen üretim hatası: {exc}")
        try:
            edition_date, issue = edition_info()
            tech_news = finalize_news({key: [] for key in TECH_LABELS}, TECH_FALLBACKS, TECH_LABELS, edition_date)
            energy_news = finalize_news({key: [] for key in ENERGY_LABELS}, ENERGY_FALLBACKS, ENERGY_LABELS, edition_date)
            eksim_news = finalize_news({key: [] for key in EKSIM_LABELS}, EKSIM_FALLBACKS, EKSIM_LABELS, edition_date)
            key = edition_date.isoformat()
            tech = make_edition("tech", edition_date, issue, tech_news)
            energy = make_edition("energy", edition_date, issue, energy_news)
            eksim = make_edition("eksim", edition_date, issue, eksim_news)
            write_json(DATA_DIR / "edition.json", tech)
            write_json(DATA_DIR / "edition_enerji.json", energy)
            write_json(DATA_DIR / "edition_eksim.json", eksim)
            write_json(ARCHIVE_DIR / f"{key}.json", tech)
            write_json(ARCHIVE_DIR / f"enerji_{key}.json", energy)
            write_json(ARCHIVE_DIR / f"eksim_{key}.json", eksim)
            cleanup_archives(edition_date)
            write_eksim_archive_index()
            save_translation_cache()
            print("Acil durum yedek havuzuyla geçerli baskılar üretildi.")
            return 0
        except Exception as fallback_exc:
            print(f"Dosya sistemi nedeniyle baskı yazılamadı: {fallback_exc}")
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
