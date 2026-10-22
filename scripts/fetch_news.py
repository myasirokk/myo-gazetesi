import json
import urllib.request
import datetime
import os

# Türkçe Gün ve Ay Dizileri
AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
GUNLER = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar']

def get_current_issue_no():
    # 21 Ekim 2026 başlangıç kabulüyle gün farkı hesabı
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
    news_data = {
        "ai": [],
        "oss": [],
        "web": [],
        "sec": []
    }
    
    # Dev.to API üzerinden güncel teknoloji ve yapay zeka makaleleri
    devto_articles = fetch_json("https://dev.to/api/articles?per_page=30") or []
    
    for art in devto_articles:
        tags = art.get("tag_list", [])
        title = art.get("title", "")
        desc = art.get("description", "") or "Detaylar geliştirici topluluğunda öne çıkıyor."
        
        if any(t in ['ai', 'machinelearning', 'python', 'datascience'] for t in tags) and len(news_data["ai"]) < 4:
            news_data["ai"].append({"title": title, "desc": desc[:140] + '...'})
        elif any(t in ['opensource', 'linux', 'git', 'github'] for t in tags) and len(news_data["oss"]) < 4:
            news_data["oss"].append({"title": title, "desc": desc[:140] + '...'})
        elif any(t in ['webdev', 'javascript', 'react', 'css', 'html'] for t in tags) and len(news_data["web"]) < 4:
            news_data["web"].append({"title": title, "desc": desc[:140] + '...'})
        elif any(t in ['security', 'cybersecurity', 'infosec'] for t in tags) and len(news_data["sec"]) < 4:
            news_data["sec"].append({"title": title, "desc": desc[:140] + '...'})

    # Eksik kategori kalırsa yedek havuzla tamamla
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
    
    print(f"Haberler taranıyor... Sayı: {issue_no}")
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
        "news": live_news
    }

    target_path = os.path.join(os.path.dirname(__file__), "..", "data", "edition.json")
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(edition, f, ensure_ascii=False, indent=2)

    print("data/edition.json başarıyla güncellendi.")

if __name__ == "__main__":
    main()