# Bilanço Analiz

ABD (SEC EDGAR) ve Borsa İstanbul (KAP / İş Yatırım) hisseleri için **anahtarsız** finansal analiz aracı. Hisse kodu yaz, bilançodan haberlere kadar her şey otomatik gelsin.

## Özellikler

- **İki pazar:** ABD (`AAPL`, `NVDA`…) ve BIST (`THYAO`, `ASELS`… veya `SASA.IS`)
- **Finansal tablolar:** Bilanço, gelir tablosu & kârlılık, **nakit akış tablosu + Serbest Nakit Akışı (FCF)**
- **Değerleme:** F/K, PD/DD, piyasa değeri (canlı)
- **Fiyat:** Canlı fiyat + **interaktif fiyat grafiği** (1A/6A/1Y/5Y)
- **Analiz:** Çok yıllı trend, dikey/yatay analiz, otomatik risk yorumları
- **Analist hedefleri:** ABD → Finviz (kurum bazlı), BIST → Fintables/TradingView konsensüs
- **Haberler:** Üst düzey kaynaklar (Bloomberg, CNBC, Reuters…), başlık + özet Türkçe
- **BIST'e özel:** KAP bildirimleri + ekonomik takvim
- **Dışa aktarma:** PDF / Excel (CSV) · koyu tema · mobil uyumlu
- **PWA:** Ana ekrana / masaüstüne yüklenebilir uygulama (ikonla açılır)
- **Astra AI · High:** GPT‑6 Astra ile sürekli `high` akıl yürütme; güncel web araştırması, uygulamanın piyasa/finansal veri araçları, paralel araç çağrıları, Code Interpreter hesaplamaları ve akışlı yanıtlar
- **Astra Finansal Yorum:** Sol kartının altında çalışan ayrı derin analiz; web araştırması ve Code Interpreter denetimini zorunlu çalıştırıp sonuçları kaynaklarıyla sunar

## Kurulum & Çalıştırma

Gereksinim: **Node.js 18+**

```bash
npm start
# veya
node server.js
```

Sonra tarayıcıda: **http://localhost:8723**

Windows'ta çift tıklamayla başlatmak için `Bilanco-Baslat.bat` kullanılabilir.

### Uygulama olarak yükleme (PWA)

1. `npm start` ile sunucuyu açın.
2. Chrome / Edge’de adresi açın → başlıktaki **📲 Yükle** veya tarayıcı menüsünden **Uygulamayı yükle**.
3. Telefonda (aynı Wi‑Fi): bilgisayarın yerel IP’si ile `http://192.168.x.x:8723` açın → **Ana ekrana ekle**.
4. iPhone: **Safari** → Paylaş → **Ana Ekrana Ekle**.

Not: Canlı veri için sunucunun çalışıyor olması gerekir. İnternetten her yerden açmak için aşağıdaki **Render (ücretsiz)** adımlarını izleyin.

### İnternete yayınla (Render Free + PWA)

1. Değişiklikler GitHub’da olsun (`main` dalı).
2. [Render](https://render.com) → ücretsiz hesap (GitHub ile giriş).
3. **New** → **Blueprint** → `ihsanarhanalis-maker/bilanco-analiz` reposunu seç → `render.yaml` ile oluştur.
   - Alternatif: **New** → **Web Service** → aynı repo → **Build Command** boş veya `npm install`, **Start Command** `npm start`, **Instance type** Free.
4. Deploy bitince size bir adres verir: `https://bilanco-analiz-xxxx.onrender.com`
5. Telefonda / bilgisayarda bu HTTPS adresi açın → **📲 Yükle** / **Ana ekrana ekle**.
6. Bundan sonra **ikonuna tıklayınca** uygulama açılır (sunucu Render’da çalışır).

**Ücretsiz katman notu:** Uzun süre kullanılmazsa uyuyabilir; ilk açılış 30–60 sn sürebilir. Bu normaldir.

### İzleme listesi bildirimleri

Uygulama Android, iOS 16.4+ ve masaüstünde Web Push kullanır. İzleme listesindeki BIST ve ABD hisseleri için yeni bilanço, KAP/SEC bildirimi ve analist hedef fiyatı değişiklikleri izlenir.

Üretim ortamında şu değişkenler gereklidir:

- `OPENAI_API_KEY`: Astra AI ve diğer yapay zekâ sunucu çağrıları için OpenAI API anahtarı. Anahtar yalnızca Render ortam değişkeninde tutulur ve tarayıcıya gönderilmez.
- `OPENAI_ASTRA_MODEL`: Astra AI sekmesinin ve Astra Finansal Yorum kartının modeli; varsayılan `gpt-6-astra`.
- `DATABASE_URL`: Kalıcı PostgreSQL bağlantısı. Render'ın geçici dosya sistemi bildirim abonelikleri için kullanılmamalıdır.
- `VAPID_PUBLIC_KEY` ve `VAPID_PRIVATE_KEY`: `npm run generate:vapid` çıktısındaki Web Push anahtarları.
- `VAPID_SUBJECT`: Geçerli bir `mailto:` veya HTTPS iletişim adresi.
- `NOTIFICATION_CRON_SECRET`: `/api/notifications/poll` çağrısını koruyan rastgele sır.
- `NOTIFICATION_POLL_MINUTES`: Sürekli çalışan sunucuda kontrol aralığı; varsayılan 15 dakikadır.

Render servisi uykuya giriyorsa düzenli ve zamanında bildirim için sürekli çalışan bir instance veya `POST /api/notifications/poll` adresini `X-Cron-Secret` başlığıyla çağıran bir zamanlayıcı gerekir. iPhone'da kullanıcı uygulamayı Safari'den **Ana Ekrana Ekle** ile yüklemeli ve bildirim iznini uygulama ikonundan açmalıdır.

## Nasıl çalışır (mimari)

Uygulama tamamen istemci-taraflı bir HTML + küçük bir Node köprü sunucusundan oluşur. **API anahtarı yoktur.** `server.js`, CORS/Origin/crumb kısıtı olan kaynakları sunucu tarafından proxy'ler:

| Rota | Kaynak |
|------|--------|
| `/sec/*` | SEC EDGAR (ABD mali tablo) |
| `/bist` | İş Yatırım / KAP (BIST mali tablo) |
| `/price` | Yahoo Finance (fiyat) |
| `/news` | Bing News |
| `/tr` | Google Translate → MyMemory (çeviri) |
| `/targets` | Finviz (analist hedefleri) |
| `/tvt` | TradingView (BIST hedef yedeği) |
| `/econ`, `/investcal` | TradingView / Investing (ekonomik takvim) |

Bazı çağrılar (Fintables, TradingView scanner, çeviri) IP engellerini aşmak için doğrudan tarayıcıdan yapılır.

## Uyarı

Bu araç yatırım/finansal danışmanlık değildir. Sonuçlar nitelikli bir analist tarafından gözden geçirilmelidir. Veriler üçüncü taraf kaynaklardan gelir ve gecikmeli/hatalı olabilir.
