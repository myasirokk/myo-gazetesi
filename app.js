(() => {
'use strict';
const $ = s => document.querySelector(s);
const AY = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const GUN = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const pad = n => String(n).padStart(2, '0');

/* ---------- İÇERİK HAVUZLARI ---------- */
const LEADS = [
 {h:'Çok Modlu Modeller Kod Editörlerini Yeniden Yazıyor', d:'Metin, görsel ve ses tek modelde birleşince IDE deneyimi sohbetten ajanlığa geçiyor.', b:'Geliştirici araçları artık yalnızca kod tamamlamıyor; depoyu okuyor, testi çalıştırıyor, hatayı kendisi düzeltiyor. Bunun arkasında uzun bağlam pencereleri ve araç çağırma yeteneği var. Ekipler için asıl soru, ajanın hangi değişikliği otomatik yapabileceğini sınırlayan izin modelini kurmak. Küçük pull request\'ler, zorunlu test ve insan onayı şimdilik en sağlam üçlü.'},
 {h:'Küçük Dil Modelleri Cihaz Üstüne Taşınıyor', d:'Birkaç milyar parametreli modeller telefonda gecikmesiz çalışıyor.', b:'Nicemleme (quantization) ile modeller 4 bit\'e indiriliyor ve bellek ihtiyacı dörtte bire düşüyor. Çıkarım yerelde yapıldığında gecikme ve gizlilik avantajı doğuyor. Bulut hâlâ ağır akıl yürütme için gerekli; hibrit yönlendirme yaygın bir desen haline geliyor. Geliştiriciler için ders: görevi küçük modele, zor kısmı büyük modele ver.'},
 {h:'RAG Mimarisi Olgunlaşıyor: Arama Kalitesi Belirleyici', d:'Başarıyı model değil, getirilen belge parçalarının isabeti belirliyor.', b:'Gömme (embedding) modeli, parça boyutu ve yeniden sıralama aşaması çıktıyı modelin kendisinden fazla etkiliyor. Hibrit arama, yani anahtar kelime ile vektörü birlikte kullanmak, tek başına vektör aramasını çoğu zaman geçiyor. Değerlendirme seti olmadan yapılan her ayar tahmindir; önce on-yirmi gerçek soruluk bir test kümesi hazırlayın.'},
 {h:'WebAssembly Tarayıcıda Yapay Zeka Çıkarımını Hızlandırıyor', d:'WebGPU ile birlikte istemci tarafı çıkarım gerçek bir seçenek oldu.', b:'Tarayıcıda çalışan modeller sunucu maliyetini sıfırlıyor ve veriyi cihazdan çıkarmıyor. İlk indirme boyutu ve önbellekleme hâlâ en büyük engel. Service Worker ile model dosyasını bir kez indirip saklamak, kullanıcı deneyimini belirleyen küçük ama kritik bir ayrıntı.'},
 {h:'Tedarik Zinciri Saldırıları Paket Yöneticilerini Hedefliyor', d:'Bağımlılık sabitleme ve imza doğrulama artık lüks değil.', b:'Kötü niyetli paketler sürüm numarasındaki küçük benzerliklerle yayılıyor. Kilit dosyası kullanmak, yeni sürümleri bekleme süresiyle almak ve CI\'da bağımlılık taraması yapmak riski belirgin biçimde azaltıyor. Üretime giden her paketin kaynağını bilmek, güvenliğin ilk adımı.'}
];
const EDS = [
 {t:'Ajanlar Çağında Kodu Okumak Yazmaktan Değerli', b:'Kod üretmek ucuzlarken doğru kodu ayırt etmek pahalılaşıyor. Gelecekte iyi geliştirici, en çok satır yazan değil, bir diff\'e bakıp niyetle sonucu karşılaştırabilen kişi olacak. Okuma, test yazma ve sistem düşüncesi bu yüzden öne çıkıyor. Araçlar hızlanırken yargı, ekibin elindeki en nadir kaynak.'},
 {t:'Prompt Mühendisliği Ölmüyor, Dönüşüyor', b:'Sihirli cümle aramak yerine bağlamı tasarlamak, örnekleri seçmek ve çıktıyı doğrulamak asıl iş. Kısa ve net bir görev tanımı, iyi seçilmiş iki örnek ve ölçülebilir bir başarı ölçütü çoğu zaman uzun bir metinden üstün. Bu bir yazı işi değil, arayüz tasarımı.'},
 {t:'Açık Kaynak Sürdürülebilirliği Bir Mühendislik Sorunu', b:'Milyonlarca projenin dayandığı küçük kütüphaneler tek kişinin emeğiyle yürüyor. Şirketler bağımlılıklarını kullanmakla kalmayıp bakımına katkı vermeli. Bir sponsorluk, bir hata raporu ya da bir test bile bu zinciri güçlendirir.'},
 {t:'Gecikme Bir Özelliktir', b:'Kullanıcı yapay zekanın doğruluğunu hızıyla birlikte hisseder. İlk token\'ın gelme süresi, akış (streaming) ve ilerleme göstergesi, modelin kendisi kadar deneyimi belirler. Hızı sonradan değil, mimarinin başında bütçelemek gerekir.'},
 {t:'Güvenlik Sonradan Eklenen Bir Katman Değildir', b:'Girdi doğrulama, en az yetki ve gizli anahtar yönetimi tasarım aşamasında çözülür. Yapay zeka uygulamalarında ek olarak prompt enjeksiyonu ve veri sızıntısı düşünülmeli. Küçük bir tehdit modeli, büyük bir olayı önler.'}
];
const FACTS = [
 {t:'Attention Mechanism', b:'Modelin bir kelimeyi işlerken cümledeki hangi kelimelere ne kadar bakacağını öğrenmesini sağlar. Transformer mimarisinin temelidir.'},
 {t:'Context Window', b:'Modelin tek seferde görebildiği azami token miktarı. Pencere dolunca eski içerik unutulur ya da özetlenmelidir.'},
 {t:'Zero-Shot', b:'Modelin hiç örnek görmeden görevi yapabilmesi. Örnek verirsek buna few-shot denir.'},
 {t:'Temperature', b:'Örnekleme rastgeleliğini ayarlar. Düşük değer tutarlı, yüksek değer çeşitli çıktı üretir.'},
 {t:'Embedding', b:'Metni anlamını koruyan sayı vektörüne çevirir. Benzer anlamlı metinler uzayda birbirine yakın durur.'}
];
const QUOTES = [
 '"Önce çalıştır, sonra doğru yap, sonra hızlı yap."',
 '"Ölçmediğin şeyi iyileştiremezsin."',
 '"Basit olan, bakımı yapılabilir olandır."',
 '"Kod bir kez yazılır, defalarca okunur."',
 '"Erken optimizasyon, tüm kötülüklerin anasıdır."',
 '"Hata mesajı, sistemin sana yazdığı mektuptur."',
 '"İyi isimlendirme, yarım dokümantasyondur."'
];

const NEWS = {
 ai:[
   ['Yeni açık ağırlıklı model kodlama testlerinde ilk sıraya çıktı','Değerlendirme sonuçları, açık modellerin kapalı rakiplerle farkı kapattığını gösteriyor.'],
   ['Ajan çerçevelerinde araç çağırma standardı birleşiyor','Ortak şema, aynı aracı farklı modellerde çalıştırmayı kolaylaştırıyor.'],
   ['Prompt önbellekleme maliyeti yarıya indiriyor','Tekrarlanan sistem istemleri artık yeniden hesaplanmıyor.'],
   ['Küçük model, görsel anlama testinde büyüğünü geçti','Veri kalitesi, parametre sayısından daha belirleyici çıktı.']
 ],
 oss:[
   ['Popüler bir derleyici projesi yeni sürümünde derleme süresini kısalttı','Artımlı derleme ve paralel analiz ana kazanımlar.'],
   ['Bir veritabanı projesi lisansını yeniden açık kaynağa çevirdi','Topluluk kararı memnuniyetle karşıladı.'],
   ['Linux çekirdeği yeni bellek yönetimi iyileştirmesi aldı','Düşük bellekli cihazlarda gecikme azalıyor.'],
   ['Paket yöneticisi bağımlılık çözümlemesini hızlandırdı','Kilit dosyası üretimi belirgin biçimde kısaldı.']
 ],
 web:[
   ['CSS container query kullanımı rekor seviyede','Bileşen tabanlı duyarlı tasarım standart haline geliyor.'],
   ['Tarayıcılar View Transitions API\'sini genişletti','Sayfa geçişleri artık birkaç satır CSS ile yapılabiliyor.'],
   ['Sunucu bileşenleri çerçevelerde varsayılan oluyor','İstemciye giden JavaScript miktarı düşüyor.'],
   ['WebGPU desteği ana tarayıcıların tamamına ulaştı','Tarayıcıda hesaplama yoğun işler mümkün.']
 ],
 sec:[
   ['Kritik bir kütüphanede uzaktan kod çalıştırma açığı bulundu','Yamalı sürüme hemen geçilmesi öneriliyor.'],
   ['Sahte paket kampanyası geliştiricileri hedef aldı','Benzer isimli paketlere dikkat edin, kaynağı doğrulayın.'],
   ['Parola yerine passkey kullanan site sayısı arttı','Oltalama saldırılarına karşı en etkili yöntemlerden biri.'],
   ['Prompt enjeksiyonu için yeni savunma yöntemi yayımlandı','Girdi ve talimat ayrımı güçlendiriliyor.']
 ]
};
const CAT = {ai:'Yapay Zeka', oss:'Açık Kaynak', web:'Web Geliştirme', sec:'Siber Güvenlik'};

/* ---------- BASKI / TARİH ---------- */
let cur = editionBase(new Date());
let offset = 0;
function editionBase(n){ const d = new Date(n.getFullYear(), n.getMonth(), n.getDate()); if (n.getHours() < 7) d.setDate(d.getDate() - 1); return d; }
function dayIndex(d){ return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
function dateStr(d){ return `${d.getDate()} ${AY[d.getMonth()]} ${d.getFullYear()}, ${GUN[d.getDay()]}`; }

function render(){
  const d = new Date(cur); d.setDate(d.getDate() - offset);
  const i = dayIndex(d);
  const L = LEADS[i % LEADS.length], E = EDS[(i + 1) % EDS.length], F = FACTS[(i + 2) % FACTS.length];
  $('#issueNo').textContent = 'Sayı: ' + Math.max(1, i - dayIndex(new Date(2026, 9, 21)) + 1);
  $('#dateLine').textContent = dateStr(d);
  $('#quote').textContent = QUOTES[i % QUOTES.length];
  $('#leadTitle').textContent = L.h; $('#leadDeck').textContent = L.d; $('#leadBody').textContent = L.b;
  $('#edTitle').textContent = E.t; $('#edBody').textContent = E.b;
  $('#factTitle').textContent = F.t; $('#factBody').textContent = F.b;
}

function fillArchive(){
  const sel = $('#archive'); sel.innerHTML = '';
  for (let k = 0; k < 7; k++){
    const d = new Date(cur); d.setDate(d.getDate() - k);
    const o = document.createElement('option'); o.value = k;
    o.textContent = (k ? 'Arşiv: ' : 'Bugünkü baskı: ') + `${d.getDate()} ${AY[d.getMonth()]}`;
    sel.appendChild(o);
  }
}

$('#archive').addEventListener('change', e => { offset = +e.target.value; render(); });
$('#refreshBtn').addEventListener('click', () => {
  cur = editionBase(new Date()); offset = 0; fillArchive(); render();
});

/* ---------- SAAT ---------- */
function tick(){ const n = new Date(); $('#clock').textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`; }
setInterval(tick, 1000); tick();

/* ---------- BİLDİRİM GEÇMİŞİ & SAYAÇ ---------- */
const log = []; 
let unread = 0;

function logNotice(cat, title, desc){
  const n = new Date();
  log.unshift({cat, title, desc, time: `${pad(n.getHours())}:${pad(n.getMinutes())}`});
  if (log.length > 50) log.pop();
  
  const isOpen = !$('#drawer').hidden;
  if (!isOpen){ 
    unread++; 
  }
  renderLog();
}

function renderLog(){
  const ul = $('#drawerList'); ul.innerHTML = '';
  if (!log.length){ 
    const e = document.createElement('li'); 
    e.className = 'empty'; 
    e.textContent = 'Henüz bildirim yok.'; 
    ul.appendChild(e); 
  }
  
  log.forEach(x => {
    const li = document.createElement('li');
    const sm = document.createElement('small'); sm.textContent = `${x.time} · ${x.cat}`;
    const b = document.createElement('b'); b.textContent = x.title;
    const d = document.createElement('span'); d.textContent = x.desc;
    li.append(sm, b, d); 
    ul.appendChild(li);
  });
  
  const bd = $('#badge'); 
  bd.textContent = unread; 
  bd.hidden = unread === 0;
}

function setDrawer(open){
  $('#drawer').hidden = !open; 
  $('#notifBtn').setAttribute('aria-expanded', String(open));
  if (open){ 
    unread = 0; 
    renderLog(); 
  }
}

$('#notifBtn').addEventListener('click', () => setDrawer($('#drawer').hidden));
$('#drawerX').addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });

/* ---------- CANLI HABER ---------- */
const feed = [];
const used = {ai:0, oss:0, web:0, sec:0};

function addNews(cat, live){
  const pool = NEWS[cat]; 
  const item = pool[used[cat] % pool.length]; 
  used[cat]++;
  const n = new Date();
  
  const li = document.createElement('li');
  if (live) li.className = 'fresh';
  const time = document.createElement('time'); time.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  const b = document.createElement('b'); b.textContent = item[0];
  const p = document.createElement('span'); p.textContent = item[1];
  li.append(time, b, p);
  
  const ul = $('#list-' + cat); 
  ul.prepend(li);
  while (ul.children.length > 6) ul.lastChild.remove();
  
  feed.unshift(`${CAT[cat]}: ${item[0]}`);
  if (feed.length > 12) feed.pop();
  buildTicker();
  
  if (live){ 
    logNotice(CAT[cat], item[0], item[1]); 
  }
}

function buildTicker(){
  const t = $('#tickerTrack'); t.innerHTML = '';
  feed.forEach(x => { const s = document.createElement('span'); s.textContent = '\u25CF ' + x; t.appendChild(s); });
}

function scheduleNext(){
  setTimeout(() => {
    const keys = Object.keys(NEWS);
    addNews(keys[Math.floor(Math.random() * keys.length)], true);
    scheduleNext();
  }, 120000 + Math.random() * 60000);
}

Object.keys(NEWS).forEach(k => { addNews(k, false); addNews(k, false); });
scheduleNext();

/* ---------- BULMACA MOTORU ---------- */
const WORDS = [
 ['PROMPT',0,0,'a','Yapay zekaya verilen komut metni'],
 ['PYTHON',0,0,'d','Yapay zeka dünyasının en popüler dili'],
 ['TOKEN',0,5,'d','Dil modelinin metni böldüğü en küçük birim'],
 ['OPTION',4,0,'a','Seçenek, ayar (İngilizce)'],
 ['IDE',4,3,'d','Kod yazma ortamı (kısaltma)'],
 ['EPOCH',6,3,'a','Eğitimde veri setinin bir tam geçişi'],
 ['HASH',6,7,'d','Veriden çıkarılan sabit uzunluklu özet'],
 ['HTTP',9,7,'a','Web\'in temel iletişim protokolü']
];

const ROWS = 10, COLS = 11;
const cells = {}; 
const nums = {};

WORDS.forEach(([w,r,c,d]) => [...w].forEach((ch,i) => {
  const k = (r + (d === 'd' ? i : 0)) + ',' + (c + (d === 'a' ? i : 0)); 
  cells[k] = {ch};
}));

let counter = 0;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (WORDS.some(w => w[1] === r && w[2] === c)) nums[r + ',' + c] = ++counter;
  }
}

const gridEl = $('#grid');
const inputs = {};
let pos = {r:0, c:0}, dir = 'a';

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++){
    const k = r + ',' + c; 
    const div = document.createElement('div');
    if (!cells[k]){ 
      div.className = 'cell block'; 
      gridEl.appendChild(div); 
      continue; 
    }
    
    div.className = 'cell'; 
    div.dataset.k = k;
    if (nums[k]){ 
      const n = document.createElement('span'); 
      n.className = 'n'; 
      n.textContent = nums[k]; 
      div.appendChild(n); 
    }
    
    const inp = document.createElement('input');
    inp.maxLength = 2; 
    inp.autocomplete = 'off'; 
    inp.autocapitalize = 'characters'; 
    inp.spellcheck = false; 
    inp.inputMode = 'text';
    inp.setAttribute('aria-label', `Satır ${r + 1}, sütun ${c + 1}`);
    
    inp.addEventListener('click', () => { 
      if (pos.r === r && pos.c === c) dir = dir === 'a' ? 'd' : 'a'; 
      select(r, c); 
    });
    inp.addEventListener('focus', () => select(r, c, true));
    inp.addEventListener('input', () => {
      const v = inp.value.replace(/[^a-zA-ZığüşöçİĞÜŞÖÇ]/g, '').slice(-1).toLocaleUpperCase('tr-TR');
      inp.value = v; 
      clearMarks();
      if (v) step(r, c, 1);
    });
    inp.addEventListener('keydown', e => onKey(e, r, c, inp));
    
    div.appendChild(inp); 
    gridEl.appendChild(div); 
    inputs[k] = inp;
  }
}

function wordAt(r, c, d){
  return WORDS.find(([w,wr,wc,wd]) => wd === d && (d === 'a' ? (r === wr && c >= wc && c < wc + w.length) : (c === wc && r >= wr && r < wr + w.length)));
}

function select(r, c, keep){
  pos = {r, c};
  if (!wordAt(r, c, dir)) dir = dir === 'a' ? 'd' : 'a';
  document.querySelectorAll('.cell').forEach(x => x.classList.remove('word', 'cur'));
  const w = wordAt(r, c, dir);
  if (w) [...w[0]].forEach((_, i) => {
    const k = (w[1] + (dir === 'd' ? i : 0)) + ',' + (w[2] + (dir === 'a' ? i : 0));
    if (inputs[k]) inputs[k].parentElement.classList.add('word');
  });
  if (inputs[r + ',' + c]) {
    inputs[r + ',' + c].parentElement.classList.add('cur');
    if (!keep) inputs[r + ',' + c].focus();
    if (!keep) inputs[r + ',' + c].select();
  }
}

function step(r, c, s){
  const nr = r + (dir === 'd' ? s : 0), nc = c + (dir === 'a' ? s : 0);
  if (inputs[nr + ',' + nc]) select(nr, nc);
}

function onKey(e, r, c, inp){
  const mv = {ArrowRight:[0,1,'a'], ArrowLeft:[0,-1,'a'], ArrowDown:[1,0,'d'], ArrowUp:[-1,0,'d']}[e.key];
  if (mv){
    e.preventDefault(); 
    dir = mv[2];
    const k = (r + mv[0]) + ',' + (c + mv[1]);
    if (inputs[k]) select(r + mv[0], c + mv[1]); else select(r, c);
  } else if (e.key === 'Backspace'){
    e.preventDefault(); 
    clearMarks();
    if (inp.value){ 
      inp.value = ''; 
    } else { 
      step(r, c, -1); 
      const p = inputs[pos.r + ',' + pos.c]; 
      if (p) p.value = ''; 
    }
  } else if (e.key === 'Enter'){ 
    e.preventDefault(); 
    check(); 
  }
}

function clearMarks(){ 
  document.querySelectorAll('.cell.ok,.cell.bad').forEach(x => x.classList.remove('ok', 'bad')); 
  $('#score').textContent = ''; 
}

function check(){
  let ok = 0, filled = 0; 
  const total = Object.keys(cells).length;
  
  Object.keys(cells).forEach(k => {
    const v = inputs[k].value.toLocaleUpperCase('tr-TR'); 
    const box = inputs[k].parentElement;
    box.classList.remove('ok', 'bad');
    if (!v) return; 
    filled++;
    if (v === cells[k].ch){ 
      ok++; 
      box.classList.add('ok'); 
    } else {
      box.classList.add('bad');
    }
  });
  
  $('#score').textContent = ok === total 
    ? `Tebrikler! ${ok}/${total} kutu doğru, bulmaca çözüldü.` 
    : `${ok}/${total} doğru, ${filled - ok} yanlış, ${total - filled} boş.`;
}

$('#checkBtn').addEventListener('click', check);
$('#clearBtn').addEventListener('click', () => { 
  Object.values(inputs).forEach(i => i.value = ''); 
  clearMarks(); 
  select(0, 0); 
});

const clueA = $('#clueA'), clueD = $('#clueD'), ans = $('#answers');
WORDS.forEach(([w,r,c,d,clue]) => {
  const li = document.createElement('li'); 
  const n = nums[r + ',' + c];
  const b = document.createElement('b'); 
  b.textContent = n + '.';
  li.append(b, ' ' + clue + ` (${w.length})`);
  (d === 'a' ? clueA : clueD).appendChild(li);
  const row = document.createElement('div'); 
  row.textContent = `${n} ${d === 'a' ? 'Yatay' : 'Aşağı'}: ${w}`;
  ans.appendChild(row);
});

/* ---------- BAŞLAT ---------- */
fillArchive(); 
render();
})();