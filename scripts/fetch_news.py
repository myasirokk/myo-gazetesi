import json
import urllib.request
import urllib.parse
import datetime
import os
import re

AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
GUNLER = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar']

# Korunacak teknik terimler ve özel yapılar
TECH_TERMS = [
    'Database', 'database', 'Framework', 'framework', 'Backend', 'Frontend',
    'Fullstack', 'Open Source', 'API', 'REST', 'GraphQL', 'Docker', 'Kubernetes',
    'Token', 'token', 'Prompt', 'prompt', 'RAG', 'LLM', 'AI', 'Machine Learning',
    'Deep Learning', 'Pipeline', 'Commit', 'Branch', 'Repository', 'Pull Request',
    'Bug', 'Debug', 'Cache', 'Zero-Shot', 'Few-Shot', 'Embedding', 'Transformer',
    'Fine-Tuning', 'Dataset', 'Benchmark', 'Thread', 'Socket', 'Runtime', 'Compiler'
]

def translate_to_turkish(text):
    """
    Metni Türkçeye çevirir; teknik terimleri ve kod bloklarını korur.
    """
    if not text or not text.strip():
        return text

    # Kod bloklarını, paket isimlerini (snake_case, camelCase) ve teknik terimleri maskele
    placeholders = {}
    
    def replacer(match):
        token = f"__TECH_{len(placeholders)}__"
        placeholders[token] = match.group(0)
        return token

    # snake_case (örn: bloc_signals_genui) veya camelCase terimleri koru
    masked_text = re.sub(r'\b[a-zA-Z0-9]+_[a-zA-Z0-9_]+\b', replacer, text)
    
    # Bilinen teknik terimleri koru
    for term in TECH_TERMS:
        pattern = r'\b' + re.escape(term) + r'\b'
        masked_text = re.sub(pattern, replacer, masked_text, flags=re.IGNORECASE)

    try:
        url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=" + urllib.parse.quote(masked_text)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as response:
            result = json.loads(response.read().decode('utf-8'))
            translated = "".join([segment[0] for segment in result[0] if segment[0]])
            
            # Maskelenen teknik terimleri orijinal haline geri yükle
            for token, original in placeholders.items():
                translated = translated.replace(token, original)
            
            # Özel kurum kuralı düzeltmeleri
            translated = translated.replace("Oxford University", "Oxford Üniversitesi")
            translated = translated.replace("Cambridge University", "Cambridge Üniversitesi")
            return translated
    except Exception as e:
        print(f"Çeviri hatası ({text[:30]}...):", e)
        # Çeviri servisinde aksama olursa orijinal metin döner, sistem çökmez
        return text

PUZZLE_POOLS = [
    [
        ["PROMPT", 0, 0, "a", "Yapay zekaya verilen komut metni"],
        ["PYTHON", 0, 0, "d", "Yapay zeka dünyasının en popüler dili"],
        ["TOKEN", 0, 5, "d", "Dil modelinin metni böldüğü en küçük birim"],
        ["OPTION", 4, 0, "a", "Seçenek, ayar (İngilizce)"],
        ["IDE", 4, 3, "d", "Kod yazma ortamı (kısaltma)"],
        ["EPOCH", 6, 3, "a", "Eğitimde veri setinin bir tam geçişi"],
        ["HASH", 6, 7, "d", "Veriden çıkarılan sabit uzunluklu özet"],
        ["HTTP", 9, 7, "a", "Web'in temel iletişim protokolü"]
    ],
    [
        ["VECTOR", 0, 0, "a", "Gömme (embedding) uzayındaki yönlü sayı dizisi"],
        ["VIRTUAL", 0, 0, "d", "Fiziksel olmayan, sanal ortam"],
        ["ROUTER", 0, 5, "d", "Ağ paketlerini yönlendiren donanım/yazılım"],
        ["REACT", 2, 0, "a", "Popüler bir JavaScript arayüz kütüphanesi"],
        ["ARRAY", 4, 2, "a", "Aynı türden elemanları tutan dizi yapısı"],
        ["KERNEL", 1, 6, "d", "İşletim sisteminin donanımı yöneten çekirdeği"],
        ["LINUX", 6, 2, "a", "Açık kaynaklı işletim sistemi ailesi"]
    ],
    [
        ["TENSOR", 0, 0, "a", "Çok boyutlu veri matrisi"],
        ["THREAD", 0, 0, "d", "İşlemcinin eşzamanlı çalıştırdığı en küçük iş parçacığı"],
        ["SOCKET", 2, 0, "a", "Ağ bağlantı uç noktası"],
        ["REST", 0, 5, "d", "Web servis mimari standardı"],
        ["SCHEMA", 5, 1, "a", "Veritabanı yapı ve kural tanımı"],
        ["CACHE", 4, 4, "d", "Hızlı erişim için kullanılan önbellek"]
    ],
    [
        ["FLASK", 0, 0, "a", "Hafif ve modüler Python web çerçevesi"],
        ["FRAME", 0, 0, "d", "Ağ veya grafik paketindeki tekil çerçeve"],
        ["ASYNC", 2, 0, "a", "Bloklamayan eşzamansız kod yürütme biçimi"],
        ["STACK", 0, 3, "d", "Son giren ilk çıkar (LIFO) veri yapısı"],
        ["QUEUE", 4, 1, "a", "İlk giren ilk çıkar (FIFO) kuyruk yapısı"],
        ["EVENT", 2, 4, "d", "Arayüzde gerçekleşen kullanıcı veya sistem olayı"]
    ],
    [
        ["DOCKER", 0, 0, "a", "Konteynerleştirme teknolojisi"],
        ["DEPLOY", 0, 0, "d", "Uygulamayı sunucuya canlıya alma süreci"],
        ["COMMIT", 2, 0, "a", "Git versiyon kontrolünde anlık kod kaydı"],
        ["BRANCH", 0, 4, "d", "Kod tabanında bağımsız geliştirme dalı"],
        ["CIPHER", 4, 1, "a", "Kriptografik şifreleme algoritması"],
        ["PATCH", 3, 5, "d", "Yazılım hatasını kapatan küçük güncelleme"]
    ],
    [
        ["SERVER", 0, 0, "a", "İstemcilere veri ve hizmet sağlayan sunucu"],
        ["SCRIPT", 0, 0, "d", "Yorumlanan dillerde yazılan betik dosya"],
        ["VERCEL", 2, 0, "a", "Frontend ve sunucusuz dağıtım platformu"],
        ["ROBOTS", 0, 4, "d", "Arama motoru botlarını yönlendiren metin dosyası"],
        ["RECORD", 4, 2, "a", "Veritabanı tablosundaki tekil satır/kayıt"],
        ["INDEX", 1, 5, "d", "Veritabanında sorguları hızlandıran dizin"]
    ],
    [
        ["GITHUB", 0, 0, "a", "Git tabanlı bulut kod deposu platformu"],
        ["GLOBAL", 0, 0, "d", "Tüm program kapsamından erişilebilen değişken"],
        ["IMPORT", 2, 0, "a", "Modül veya kütüphaneyi koda dahil etme ifadesi"],
        ["BUFFER", 0, 4, "d", "Veri akışında geçici depolama belleği"],
        ["UPDATE", 4, 1, "a", "Veritabanında kayıt yenileme SQL komutu"],
        ["STREAM", 2, 5, "d", "Parça parça kesintisiz akan veri iletimi"]
    ]
]

def get_current_issue_no():
    base_date = datetime.date(2026, 10, 21)
    today = datetime.date.today()
    delta = (today - base_date).days
    return max(1, delta + 1)

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Hata ({url}):", e)
        return None

def fetch_live_tech_news():
    news_data = {"ai": [], "oss": [], "web": [], "sec": []}
    devto_articles = fetch_json("https://dev.to/api/articles?per_page=35") or []
    
    for art in devto_articles:
        tags = art.get("tag_list", [])
        raw_title = art.get("title", "")
        raw_desc = art.get("description", "") or "Detaylar geliştirici topluluğunda öne çıkıyor."
        
        target_cat = None
        if any(t in ['ai', 'machinelearning', 'python', 'datascience'] for t in tags) and len(news_data["ai"]) < 4:
            target_cat = "ai"
        elif any(t in ['opensource', 'linux', 'git', 'github'] for t in tags) and len(news_data["oss"]) < 4:
            target_cat = "oss"
        elif any(t in ['webdev', 'javascript', 'react', 'css', 'html'] for t in tags) and len(news_data["web"]) < 4:
            target_cat = "web"
        elif any(t in ['security', 'cybersecurity', 'infosec'] for t in tags) and len(news_data["sec"]) < 4:
            target_cat = "sec"

        if target_cat:
            tr_title = translate_to_turkish(raw_title)
            tr_desc = translate_to_turkish(raw_desc[:140]) + '...'
            news_data[target_cat].append({"title": tr_title, "desc": tr_desc})

    fallbacks = {
        "ai": [
            {"title": "Büyük Dil Modellerinde Araç Çağırma Protokolleri Standartlaşıyor", "desc": "Çoklu model ortamlarında arayüz uyumluluğu öne çıkıyor."},
            {"title": "Cihaz Üstü Yapay Zeka Çıkarımında 4-Bit Nicemleme Yaygınlaşıyor", "desc": "Mobil işlemciler yerel modelleri gecikmesiz çalıştırıyor."}
        ],
        "oss": [
            {"title": "Açık Kaynak Kod Tabanlarında CI Bağımlılık Taraması Zorunlu Oluyor", "desc": "Paket yöneticisi seviyesinde imza doğrulama adımları güçlendirildi."},
            {"title": "Linux Çekirdeği Bellek Tahsisatında Yeni Optimizasyon", "desc": "Düşük kaynaklı donanımlarda sayfalama gecikmesi düşürüldü."}
        ],
        "web": [
            {"title": "Modern Tarayıcılarda View Transitions API Standardı Oturuyor", "desc": "Bileşenler arası animasyonlar tek satır CSS ile mümkün kılınıyor."},
            {"title": "WebAssembly ve WebGPU Çekirdek Web Standartlarına Entegre Edildi", "desc": "Tarayıcı içi istemci tarafı grafik ve hesaplama kapasitesi arttı."}
        ],
        "sec": [
            {"title": "Kritik Paket Yöneticilerinde Sahte Paket Engelleme Mekanizması", "desc": "Benzer isimli zararlı paket dağıtımlarına karşı otomatik doğrulama geldi."},
            {"title": "Passkey Desteği Global Web Sitelerinde Yaygınlaşıyor", "desc": "Geleneksel parolaların yerini kriptografik anahtar çiftleri alıyor."}
        ]
    }

    for cat in ["ai", "oss", "web", "sec"]:
        while len(news_data[cat]) < 2:
            news_data[cat].append(fallbacks[cat][len(news_data[cat])])

    return news_data

def main():
    now = datetime.datetime.now()
    tarih_str = f"{now.day} {AYLAR[now.month - 1]} {now.year}, {GUNLER[now.weekday()]}"
    issue_no = get_current_issue_no()
    
    day_of_week = now.weekday()
    puzzle_words = PUZZLE_POOLS[day_of_week % len(PUZZLE_POOLS)]
    
    print(f"Haberler taranıyor ve akıllı Türkçe çeviri yapılıyor... Sayı: {issue_no}")
    live_news = fetch_live_tech_news()

    lead_story = {
        "title": live_news["ai"][0]["title"] if live_news["ai"] else "Yapay Zeka Mimarilerinde Yeni Nesil Ajan Dönemi",
        "deck": live_news["ai"][0]["desc"] if live_news["ai"] else "Model ve geliştirici araçları tek ekosistemde birleşiyor.",
        "body": "Geliştirici dünyasında araç kullanımı hızla otomatikleşirken modellerin çevreleriyle kurduğu etkileşim standart bir çerçeveye kavuşuyor. IDE entegrasyonları, otomatik hata ayıklama ve test çalıştırma süreçleri artık bağımsız döngüler halinde yönetiliyor. Ekipler için kritik eşik, otonom kararlar ile geliştirici denetimi arasındaki dengeyi doğru kurgulamak."
    }

    edition = {
        "issue": issue_no,
        "date": tarih_str,
        "quote": "\"Önce çalıştır, sonra doğru yap, sonra hızlı yap.\"",
        "lead": lead_story,
        "editorial": {
            "title": "Ajanlar Çağında Kodu Okumak Yazmaktan Değerli",
            "body": "Kod üretmek ucuzlarken doğru kodu ayırt etmek pahalılaşıyor. Gelecekte iyi mühendis, en çok satır yazan değil, sistemin tasarım amacını ve güvenlik sınırlarını doğru okuyan kişi olacak."
        },
        "fact": {
            "title": "Zero-Shot Inference",
            "body": "Modelin belirli bir görevi daha önce hiç örnek görmeden sadece bağlam talimatıyla tamamlayabilme yeteneğidir."
        },
        "news": live_news,
        "puzzle": puzzle_words
    }

    target_path = os.path.join(os.path.dirname(__file__), "..", "data", "edition.json")
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(edition, f, ensure_ascii=False, indent=2)

    print("data/edition.json başarıyla güncellendi (Teknik terimler korunarak Türkçe içerikler basıldı).")

if __name__ == "__main__":
    main()