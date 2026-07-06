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

## Kurulum & Çalıştırma

Gereksinim: **Node.js 18+**

```bash
npm start
# veya
node server.js
```

Sonra tarayıcıda: **http://localhost:8723**

Windows'ta çift tıklamayla başlatmak için `Bilanco-Baslat.bat` kullanılabilir.

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
