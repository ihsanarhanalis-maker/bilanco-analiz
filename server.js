/* Bilanço Analiz — yerel köprü sunucusu (anahtarsız SEC EDGAR erişimi)
   Çift tıklamayla Bilanco-Baslat.bat üzerinden çalışır.
   - Uygulamayı http://localhost:8723 adresinde sunar
   - /sec/* isteklerini sunucu tarafından data.sec.gov'a iletir (CORS sorunu olmaz) */
const http  = require('http');
const https = require('https');
const zlib  = require('zlib');
const fs    = require('fs');
const path  = require('path');

const PORT = process.env.PORT || 8723;  // internette sunucu portu atar; yerelde 8723
const ROOT = __dirname;
// SEC, kendini tanıtan bir User-Agent ister:
const UA = 'Bilanco Analiz Araci (kisisel kullanim; contact@example.com)';
const BUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
               '.webmanifest':'application/manifest+json; charset=utf-8',
               '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon',
               '.webp':'image/webp' };

/* Analist hedef fiyatları — Yahoo quoteSummary yerine Finviz'den kazınır.
   Neden: Yahoo'nun crumb doğrulaması bazı bulut sunucu IP'lerinde (Render, AWS vb.)
   sürekli "Invalid Crumb" ile reddediyor (IP itibarına dayalı, koddan düzeltilemez).
   Finviz'in tek şirket sayfası (quote.ashx) anahtarsız, crumb'sız erişilebiliyor ve
   sayfa içine gömülü bir JSON bloğunda ("chartEvent/ratings") banka bazlı not/hedef
   fiyat geçmişini de içeriyor — Yahoo'dan bile daha zengin. */
function extractStat(html, label){
  const idx = html.indexOf('>' + label + '</a>');
  if (idx < 0) return null;
  const slice = html.slice(idx, idx + 400);
  const m = slice.match(/<b>(?:<span[^>]*>)?([^<]+)/);
  return m ? m[1].trim() : null;
}
function extractRatingEvents(html){
  const marker = '"eventType":"chartEvent/ratings"';
  const out = [];
  let from = 0;
  while (true) {
    const mi = html.indexOf(marker, from);
    if (mi < 0) break;
    from = mi + marker.length;
    let start = mi;
    while (start > 0 && html[start] !== '{') start--;
    let depth = 0, end = -1;
    for (let i = start; i < html.length && i < start + 20000; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    try {
      const obj = JSON.parse(html.slice(start, end + 1));
      (obj.ratings || []).forEach(r => out.push({
        date: obj.dateTimestamp,
        firm: (r.analyst || '').replace(/&amp;/g, '&'),
        action: r.action || '',
        rating: (r.rating || '').replace(/&rarr;/g, '→').replace(/&amp;/g, '&'),
        priceChange: (r.targetPrice || '').replace(/&rarr;/g, '→')
      }));
    } catch (e) {}
  }
  out.sort((a, b) => (b.date || 0) - (a.date || 0));
  return out;
}
function httpGetHtmlFollow(url, headers, maxRedirects, cb){
  https.get(url, { headers }, pr => {
    if ((pr.statusCode === 301 || pr.statusCode === 302) && pr.headers.location && maxRedirects > 0) {
      pr.resume();
      const next = new URL(pr.headers.location, url).toString();
      return httpGetHtmlFollow(next, headers, maxRedirects - 1, cb);
    }
    let html = ''; pr.on('data', c => html += c);
    pr.on('end', () => cb(null, pr.statusCode, html));
  }).on('error', e => cb(e));
}
/* Etiketi div/a farketmeksizin bulur (Finviz zaman içinde <a>Label</a> → <div>Label</div> yaptı) */
function extractStat2(html, label){
  const idx = html.indexOf('>' + label + '<');
  if (idx < 0) return null;
  const m = html.slice(idx, idx + 500).match(/<b>(?:<span[^>]*>)?([^<]+)/);
  return m ? m[1].trim() : null;
}
/* "14.78B" / "62.10%" gibi Finviz değerlerini sayıya çevirir */
function finvizNum(s){
  if (!s) return null;
  const m = String(s).match(/-?[\d.]+/);
  if (!m) return null;
  let v = parseFloat(m[0]);
  if (/B/i.test(s)) v *= 1e9; else if (/M/i.test(s)) v *= 1e6; else if (/K/i.test(s)) v *= 1e3;
  return v;
}
function finvizTargets(sym, res){
  const url = 'https://finviz.com/quote.ashx?t=' + encodeURIComponent(sym);
  httpGetHtmlFollow(url, { 'User-Agent': BUA, 'Accept': 'text/html' }, 4, (err, status, html) => {
    if (err || status !== 200 || !html) { res.writeHead(200); res.end(JSON.stringify({ ok: false })); return; }
    const targetPriceRaw = extractStat(html, 'Target Price');
    const recomRaw = extractStat(html, 'Recom');
    const targetPrice = targetPriceRaw ? parseFloat(targetPriceRaw) : null;
    const recom = recomRaw ? parseFloat(recomRaw) : null;
    const ratings = extractRatingEvents(html).slice(0, 30);
    // Ortaklık yapısı: içeriden %, kurumsal %, dolaşımdaki pay / toplam pay
    const own = {
      insider: finvizNum(extractStat2(html, 'Insider Own')),
      inst: finvizNum(extractStat2(html, 'Inst Own')),
      shsOut: finvizNum(extractStat2(html, 'Shs Outstand')),
      shsFloat: finvizNum(extractStat2(html, 'Shs Float'))
    };
    // Kısa pozisyon (ayı bahisleri): dolaşımın %'si + kapatma gün sayısı
    const shortData = {
      floatPct: finvizNum(extractStat2(html, 'Short Float')),
      ratio: finvizNum(extractStat2(html, 'Short Ratio'))
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, targetPrice, recom, ratings, own, shortData }));
  });
}

/* Basit HTTPS GET → { status, body } döndüren küçük yardımcı (Promise). */
function httpsGetText(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: headers || {} }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => resolve({ status: pr.statusCode, body }));
    }).on('error', reject);
  });
}
/* Yahoo crumb + cookie (quoteSummary v10 icin gerekli).
   Akis: fc.yahoo.com -> finance.yahoo.com (cookie) -> getcrumb.
   ~30 dk onbellek; Invalid Crumb gelirse sifirlanir. */
let _yahooCrumb = null, _yahooCookie = '', _yahooCrumbAt = 0;
function mergeSetCookie(existing, setCookie) {
  const map = {};
  String(existing || '').split(';').forEach(p => {
    const t = p.trim(); if (!t) return;
    const i = t.indexOf('='); if (i < 1) return;
    map[t.slice(0, i)] = t.slice(i + 1);
  });
  const list = !setCookie ? [] : (Array.isArray(setCookie) ? setCookie : [setCookie]);
  list.forEach(c => {
    const part = String(c).split(';')[0];
    const i = part.indexOf('=');
    if (i > 0) map[part.slice(0, i)] = part.slice(i + 1);
  });
  return Object.keys(map).map(k => k + '=' + map[k]).join('; ');
}
function httpsGetCookie(url, headers, cookie, redirects) {
  const maxR = redirects == null ? 4 : redirects;
  return new Promise((resolve, reject) => {
    const h = Object.assign({}, headers || {});
    if (cookie) h.Cookie = cookie;
    https.get(url, { headers: h, maxHeaderSize: 262144 }, pr => {
      let jar = mergeSetCookie(cookie || '', pr.headers['set-cookie']);
      if ([301, 302, 303, 307, 308].includes(pr.statusCode) && pr.headers.location && maxR > 0) {
        pr.resume();
        const next = new URL(pr.headers.location, url).toString();
        return httpsGetCookie(next, headers, jar, maxR - 1).then(resolve, reject);
      }
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => resolve({ status: pr.statusCode || 0, body, cookie: jar }));
    }).on('error', reject);
  });
}
async function ensureYahooCrumb(force) {
  const now = Date.now();
  if (!force && _yahooCrumb && _yahooCookie && (now - _yahooCrumbAt) < 30 * 60 * 1000) {
    return { crumb: _yahooCrumb, cookie: _yahooCookie };
  }
  const hdr = { 'User-Agent': BUA, 'Accept': 'text/html,application/json,*/*' };
  let cookie = '';
  try {
    const r0 = await httpsGetCookie('https://fc.yahoo.com', hdr, cookie);
    cookie = r0.cookie || cookie;
  } catch (e) {}
  try {
    const r1 = await httpsGetCookie('https://finance.yahoo.com/', hdr, cookie);
    cookie = r1.cookie || cookie;
  } catch (e) {}
  const r2 = await httpsGetCookie('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    'User-Agent': BUA, 'Accept': 'text/plain,*/*'
  }, cookie);
  cookie = r2.cookie || cookie;
  const crumb = String(r2.body || '').trim();
  if (!crumb || crumb.length > 80 || /[<>\s]/.test(crumb) || /error/i.test(crumb)) {
    throw new Error('crumb_fail');
  }
  _yahooCrumb = crumb;
  _yahooCookie = cookie;
  _yahooCrumbAt = now;
  return { crumb, cookie };
}
function yahooUnwrap(v) {
  if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'raw')) return v.raw;
  return v;
}


/* Metni Türkçe'ye çevir — çoklu YEDEKLİ kaynak zinciri.
   Neden zincir: tek bir çeviri kaynağı Render'ın PAYLAŞILAN bulut IP'sinde ya oran
   sınırına takılıyor (Google gtx, ara sıra 429) ya da günlük ücretsiz kotası başka
   kiracılar yüzünden tükeniyor (MyMemory). İkisini sırayla deneyince biri düşse bile
   diğeri devreye girip haber neredeyse her zaman Türkçe geliyor.
   1) Google gtx (kalite en iyi; "Apple" gibi özel adları doğru bırakır)
   2) MyMemory (yedek; e-posta parametresiyle daha yüksek kota)
   Sonuç tek tip: { text } — istemci hangi kaynağın döndüğünü bilmek zorunda değil. */
async function translateToTR(text) {
  const t = (text || '').trim();
  if (!t) return '';
  // 1) Google gtx
  try {
    const u = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=' + encodeURIComponent(t);
    const r = await httpsGetText(u, { 'User-Agent': BUA });
    if (r.status === 200) {
      const j = JSON.parse(r.body);
      if (Array.isArray(j) && Array.isArray(j[0])) {
        const out = j[0].map(s => (s && s[0]) ? s[0] : '').join('').trim();
        if (out) return out;
      }
    }
  } catch (e) {}
  // 2) MyMemory (yedek)
  try {
    const q = t.length > 480 ? t.slice(0, 480) : t;
    const u = 'https://api.mymemory.translated.net/get?langpair=en|tr&de=bilanco.analiz.app@gmail.com&q=' + encodeURIComponent(q);
    const r = await httpsGetText(u, { 'User-Agent': BUA });
    if (r.status === 200) {
      const j = JSON.parse(r.body);
      const out = j && j.responseData && j.responseData.translatedText;
      if (out && !/MYMEMORY WARNING|QUOTA/i.test(out)) return out.trim();
    }
  } catch (e) {}
  return t; // hiçbiri olmazsa orijinal metin
}

/* Avrupa çok-yıllı gerçek finansal veri — GLEIF (ISIN→LEI) + filings.xbrl.org (LEI→ESEF/IFRS
   XBRL). ABD'deki SEC EDGAR'ın Avrupa karşılığı: 2021'den beri AB/İngiltere'de halka açık
   şirketler yıllık raporlarını IFRS XBRL (ESEF) formatında düzenleyici otoritelere sunmak
   zorunda; filings.xbrl.org bunları toplayan ücretsiz/anahtarsız bir index.
   ÖNEMLİ KISIT: Almanya ve İsviçre bu index'te YOK (0 kayıt, doğrulandı) — o borsalarda
   TradingView'in tek dönemlik özeti tek seçenek olarak kalıyor.
   Şirket eşleme: ISIN BİRİNCİL yol (GLEIF filter[isin] tek/deterministik sonuç verir —
   şirket adına göre arama YAPMAYIZ çünkü test edilen örneklerde (AB Volvo → yanlışlıkla
   "Volvo Cars" bulundu, Orlen → 38 alt-şirket arasından seçim gerekti) ciddi yanlış-eşleşme
   riski çıktı; ISIN benzersiz olduğu için bu risk sıfırlanıyor). Ad araması yalnız ISIN
   sonuç vermezse (örn. Nokia — GLEIF'in ISIN eşleme verisi tam değil) VE tek/net bir sonuç
   varsa (ülke eşleşmesi + ISSUED durum) yedek olarak kullanılır. */
function gleifLookup(path){ return httpsGetText('https://api.gleif.org'+path, { 'User-Agent': BUA, 'Accept': 'application/json' }); }
async function resolveLei(isin, name, country){
  if (isin) {
    try {
      const r = await gleifLookup('/api/v1/lei-records?filter%5Bisin%5D=' + encodeURIComponent(isin));
      if (r.status === 200) {
        const j = JSON.parse(r.body);
        if (j.data && j.data.length === 1) return j.data[0].attributes.lei;
      }
    } catch (e) {}
  }
  if (name) {
    try {
      const r = await gleifLookup('/api/v1/lei-records?filter%5Bentity.legalName%5D=' + encodeURIComponent(name) + '&page%5Bsize%5D=10');
      if (r.status === 200) {
        const j = JSON.parse(r.body);
        const cands = (j.data || []).filter(d => {
          const e = d.attributes.entity;
          return e && e.legalAddress && e.legalAddress.country === country && d.attributes.registration.status === 'ISSUED';
        });
        if (cands.length === 1) return cands[0].attributes.lei;
      }
    } catch (e) {}
  }
  return null;
}
async function fetchFilingsList(lei){
  const r = await httpsGetText('https://filings.xbrl.org/api/entities/' + encodeURIComponent(lei) + '/filings', { 'User-Agent': BUA, 'Accept': 'application/json' });
  if (r.status !== 200) return [];
  const j = JSON.parse(r.body);
  return (j.data || []).map(f => f.attributes).filter(a => a.json_url)
    .sort((a, b) => (b.period_end || '').localeCompare(a.period_end || ''));
}
/* Ham filing JSON'ı MB'lardan KB'lara indirir: yalnız sayısal ifrs-full kavramları,
   segment/bileşen kırılımı (extra boyut) OLMAYANLAR, metin-açıklama etiketleri hariç. */
function reduceIfrsFacts(rawJson){
  const out = [];
  const seen = new Set();
  for (const f of Object.values(rawJson.facts || {})) {
    const dims = f.dimensions || {};
    const c = dims.concept;
    if (!c || !c.startsWith('ifrs-full:')) continue;
    if (/^ifrs-full:(Description|Disclosure|AddressOf|CountryOf|Domicile|NameOf|DateOf|Explanatory)/.test(c)) continue;
    if (Object.keys(dims).length > 4) continue;
    const num = typeof f.value === 'number' ? f.value : parseFloat(f.value);
    if (isNaN(num)) continue;
    const key = c + '|' + dims.period;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([c.slice('ifrs-full:'.length), dims.period, num]);
  }
  return out;
}
async function ifrsHandler(isin, name, country, res){
  const send = obj => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  try {
    const lei = await resolveLei(isin, name, country);
    if (!lei) return send({ ok: false, reason: 'lei_not_found' });
    const filings = await fetchFilingsList(lei);
    if (!filings.length) return send({ ok: false, reason: 'no_filings', lei });
    const best = filings[0];
    const fr = await httpsGetText('https://filings.xbrl.org' + best.json_url, { 'User-Agent': BUA, 'Accept': 'application/json' });
    if (fr.status !== 200) return send({ ok: false, reason: 'facts_fetch_failed', lei });
    const rawJson = JSON.parse(fr.body);
    const facts = reduceIfrsFacts(rawJson);
    send({ ok: true, lei, periodEnd: best.period_end, country: best.country, facts });
  } catch (e) {
    send({ ok: false, reason: 'exception', error: e.message });
  }
}

/* TEFAS (yeni Next.js API) — yatırım fonu büyüklük / dağılım */
const TEFAS_INFO_URL = 'https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir';
const TEFAS_DIST_URL = 'https://www.tefas.gov.tr/api/funds/dagilimSiraliGetirT';
const TEFAS_HDR = {
  'Accept': '*/*',
  'Content-Type': 'application/json',
  'Origin': 'https://www.tefas.gov.tr',
  'Referer': 'https://www.tefas.gov.tr/tr/fon-verileri',
  'User-Agent': BUA
};
let TEFAS_CACHE = { key: '', at: 0, pack: null };
let KAP_HS_CACHE = { at: 0, codes: null };
let FONO_HOLD_CACHE = new Map(); // code -> {at, holdings}
let TEFAS_TOP_HOLD_CACHE = { at: 0, date: '', funds: null, ver: 0 };
const TEFAS_TOP_HOLD_VER = 2; // sektör+varlık zorunlu filtre
/* İş Portföy hisse fonları — çoğu Fonoloji'de varlık listesi yayınlar */
const IS_PORTFOY_HISSE = ['TI2', 'TTE', 'TIE', 'TAU', 'TI3', 'IHK', 'BIO', 'IDH', 'IML', 'KPH', 'IHT', 'TIL', 'NST'];

function tefasYmd(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}
function tefasRecentDates(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(tefasYmd(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}
function tefasBody(kind, ymd, fundCode) {
  return {
    fonTipi: kind,
    fonKodu: fundCode || null,
    aramaMetni: null,
    fonTurKod: null,
    fonGrubu: null,
    sfonTurKod: null,
    fonTurAciklama: null,
    kurucuKod: null,
    basTarih: ymd,
    bitTarih: ymd,
    basSira: 1,
    bitSira: 100000,
    dil: 'TR',
    sFonTurKod: '',
    fonKod: '',
    fonGrup: '',
    fonUnvanTip: ''
  };
}
function httpsPostJson(urlStr, bodyObj, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(bodyObj);
    const preq = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: Object.assign({}, headers, { 'Content-Length': Buffer.byteLength(body) })
    }, pr => {
      let raw = '';
      pr.on('data', c => raw += c);
      pr.on('end', () => {
        try { resolve({ status: pr.statusCode || 0, json: JSON.parse(raw || '{}') }); }
        catch (e) { reject(new Error('tefas_parse')); }
      });
    });
    preq.on('error', reject);
    preq.setTimeout(45000, () => { preq.destroy(new Error('tefas_timeout')); });
    preq.write(body);
    preq.end();
  });
}
function tefasClassify(name, dist) {
  const n = String(name || '').toUpperCase();
  const hs = Number(dist && dist.hs) || 0;
  const km = Number(dist && dist.km) || 0;
  const yhs = Number(dist && dist.yhs) || 0;
  if (/PARA\s*P[İI]YASASI/.test(n)) return 'para_piyasasi';
  if (km >= 30 || (/ALTIN/.test(n) && !/SERBEST/.test(n))) return 'altin';
  if (hs >= 50 || /H[İI]SSE\s*SENED[İI]/.test(n)) return 'hisse';
  if (yhs >= 40 || /YABANCI\s*H[İI]SSE/.test(n)) return 'yabanci_hisse';
  if (/D[ÖO]V[İI]Z|AVRO|USD|EUR/.test(n) && /SERBEST/.test(n)) return 'serbest_doviz';
  if (/SERBEST/.test(n)) return 'serbest';
  if (/BOR[ÇC]LANMA|TAHV[İI]L|K[İI]RA\s*SERT/.test(n)) return 'borclanma';
  if (/DE[ĞG][İI][ŞS]KEN|KARMA|FON\s*SEPET/.test(n)) return 'karma';
  return 'diger';
}
const TEFAS_CAT_TR = {
  para_piyasasi: 'Para piyasası',
  altin: 'Altın',
  hisse: 'Hisse senedi',
  yabanci_hisse: 'Yabancı hisse',
  serbest_doviz: 'Serbest (döviz)',
  serbest: 'Serbest',
  borclanma: 'Borçlanma',
  karma: 'Karma / değişken',
  diger: 'Diğer'
};
function tefasAlloc(dist) {
  if (!dist) return [];
  const map = [
    ['hs', 'Hisse senedi'], ['yhs', 'Yabancı hisse'], ['km', 'Kıymetli maden'],
    ['dt', 'Devlet tahvili'], ['ost', 'Özel sektör tahvil'], ['eut', 'Eurobond'],
    ['r', 'Repo'], ['tr', 'Ters repo'], ['vm', 'Mevduat'], ['tpp', 'Takasbank PP'],
    ['bpp', 'BIST PP'], ['fkb', 'Fon katılma payı'], ['byf', 'BYF'], ['d', 'Diğer']
  ];
  return map.map(([k, label]) => ({ key: k, label, pct: Number(dist[k]) || 0 }))
    .filter(x => x.pct > 0.05)
    .sort((a, b) => b.pct - a.pct);
}
function tefasMapFund(f, dist) {
  const aum = Number(f.portfoyBuyukluk) || 0;
  const inv = Number(f.kisiSayisi) || 0;
  const cat = tefasClassify(f.fonUnvan, dist);
  const quality = aum * Math.log10(inv + 10);
  return {
    code: f.fonKodu,
    name: f.fonUnvan || '',
    price: f.fiyat != null ? Number(f.fiyat) : null,
    aum,
    investors: inv,
    category: cat,
    categoryTr: TEFAS_CAT_TR[cat] || cat,
    quality,
    stockPct: Number(dist && dist.hs) || 0,
    goldPct: Number(dist && dist.km) || 0,
    alloc: tefasAlloc(dist)
  };
}
async function tefasFetchDay(kind, fundCode) {
  const cacheKey = kind + '|' + (fundCode || '*');
  if (!fundCode && TEFAS_CACHE.key === cacheKey && TEFAS_CACHE.pack && (Date.now() - TEFAS_CACHE.at) < 10 * 60 * 1000) {
    return TEFAS_CACHE.pack;
  }
  const dates = tefasRecentDates(12);
  for (const ymd of dates) {
    const body = tefasBody(kind, ymd, fundCode);
    const infoRes = await httpsPostJson(TEFAS_INFO_URL, body, TEFAS_HDR);
    const rows = (infoRes.json && infoRes.json.resultList) || [];
    if (!rows.length) continue;
    let distRows = [];
    try {
      const distRes = await httpsPostJson(TEFAS_DIST_URL, body, TEFAS_HDR);
      distRows = (distRes.json && distRes.json.resultList) || [];
    } catch (e) { distRows = []; }
    const pack = { date: ymd, info: rows, dist: distRows };
    if (!fundCode) {
      TEFAS_CACHE = { key: cacheKey, at: Date.now(), pack };
    }
    return pack;
  }
  return null;
}

/* KAP YF listesi — fundClass HS = hisse senedi fonları */
function httpsGetJson(urlStr, headers) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, {
      headers: headers || { 'User-Agent': BUA, 'Accept': 'application/json' }
    }, pr => {
      let raw = '';
      pr.on('data', c => raw += c);
      pr.on('end', () => {
        try { resolve({ status: pr.statusCode || 0, json: JSON.parse(raw || 'null') }); }
        catch (e) { reject(new Error('json_parse')); }
      });
    }).on('error', reject);
  });
}
async function kapHisseFundCodes() {
  if (KAP_HS_CACHE.codes && (Date.now() - KAP_HS_CACHE.at) < 6 * 60 * 60 * 1000) {
    return KAP_HS_CACHE.codes;
  }
  const r = await httpsGetJson('https://www.kap.org.tr/tr/api/fund/criteria/YF/Y', {
    'User-Agent': BUA, 'Accept': 'application/json', 'Referer': 'https://www.kap.org.tr/'
  });
  const arr = Array.isArray(r.json) ? r.json : [];
  const codes = new Set(
    arr.filter(f => f && f.fundClass === 'HS' && String(f.fundCode || '').trim())
      .map(f => String(f.fundCode).trim().toUpperCase())
  );
  KAP_HS_CACHE = { at: Date.now(), codes };
  return codes;
}

/* Fonoloji kamu sayfasından hisse ağırlıkları (KAP portföy raporundan) */
async function fonolojiHoldings(code) {
  const c = String(code || '').toUpperCase();
  const hit = FONO_HOLD_CACHE.get(c);
  const ttl = hit && hit.holdings && hit.holdings.length ? 6 * 60 * 60 * 1000 : 10 * 60 * 1000;
  if (hit && (Date.now() - hit.at) < ttl) return hit.holdings;
  const page = await httpsGetText('https://fonoloji.com/fon/' + encodeURIComponent(c), {
    'User-Agent': BUA,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'tr-TR,tr;q=0.9'
  });
  if (page.status !== 200 || !page.body) {
    FONO_HOLD_CACHE.set(c, { at: Date.now(), holdings: [] });
    return [];
  }
  const holdings = [];
  const seen = new Set();
  const re = /\\"ticker\\":\\"([A-Z0-9\.]+)\\",\\"name\\":\\"([^\\]*)\\",\\"weight\\":([0-9.]+)/g;
  let m;
  while ((m = re.exec(page.body))) {
    const ticker = m[1];
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    holdings.push({ symbol: ticker, name: m[2], weight: Number(m[3]) });
  }
  holdings.sort((a, b) => b.weight - a.weight);
  FONO_HOLD_CACHE.set(c, { at: Date.now(), holdings });
  return holdings;
}

/* Yalnızca hem varlık hem sektör listesi üretilebilen fonlar */
async function tefasTopWithHoldings(limit) {
  if (
    TEFAS_TOP_HOLD_CACHE.funds &&
    TEFAS_TOP_HOLD_CACHE.ver === TEFAS_TOP_HOLD_VER &&
    (Date.now() - TEFAS_TOP_HOLD_CACHE.at) < 30 * 60 * 1000
  ) {
    return {
      date: TEFAS_TOP_HOLD_CACHE.date,
      funds: TEFAS_TOP_HOLD_CACHE.funds.slice(0, limit),
      scanned: TEFAS_TOP_HOLD_CACHE.scanned || 0
    };
  }
  const [pack, hsCodes] = await Promise.all([
    tefasFetchDay('YAT', null),
    kapHisseFundCodes().catch(() => new Set())
  ]);
  if (!pack || !pack.info.length) return { date: '', funds: [], scanned: 0 };
  const distMap = new Map((pack.dist || []).map(x => [x.fonKodu, x]));
  const byCode = new Map(
    pack.info.map(f => [f.fonKodu, tefasMapFund(f, distMap.get(f.fonKodu))])
  );
  const hsList = [...byCode.values()]
    .filter(f => {
      if (!(f.aum > 0)) return false;
      if (hsCodes.size) return hsCodes.has(f.code);
      return /H[İI]SSE\s*SENED[İI]/i.test(f.name);
    })
    .sort((a, b) => b.aum - a.aum);

  // İş Portföy önce (varlık listesi genelde var), sonra diğer HS
  const prefer = new Set(IS_PORTFOY_HISSE);
  const preferred = IS_PORTFOY_HISSE.map(c => byCode.get(c)).filter(Boolean);
  const rest = hsList.filter(f => !prefer.has(f.code)).slice(0, 70);
  const withData = [];
  let scanned = 0;
  const probeBatch = async (list) => {
    for (let i = 0; i < list.length && withData.length < limit; i += 3) {
      const batch = list.slice(i, i + 3);
      scanned += batch.length;
      const rows = await Promise.all(batch.map(async (f) => {
        let holdings = [];
        let sectors = [];
        try {
          holdings = await fonolojiHoldings(f.code);
          if (holdings.length < 5) return null;
          sectors = await sectorsFromHoldings(holdings);
        } catch (e) { return null; }
        if (!sectors.length) return null;
        return { ...f, holdingCount: holdings.length, sectorCount: sectors.length };
      }));
      for (const r of rows) {
        if (r) withData.push(r);
      }
    }
  };
  await probeBatch(preferred);
  if (withData.length < limit) await probeBatch(rest);

  withData.sort((a, b) => b.aum - a.aum);
  TEFAS_TOP_HOLD_CACHE = {
    at: Date.now(),
    date: pack.date,
    funds: withData,
    scanned,
    ver: TEFAS_TOP_HOLD_VER
  };
  return { date: pack.date, funds: withData.slice(0, limit), scanned };
}

/* TradingView sektör → ağırlıklı sektör dağılımı */
function tvScanPost(tickers, columns, market) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ symbols: { tickers }, columns });
    const mkt = market || 'turkey';
    const preq = https.request({
      hostname: 'scanner.tradingview.com',
      path: '/' + mkt + '/scan',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': BUA
      }
    }, pr => {
      let raw = '';
      pr.on('data', c => raw += c);
      pr.on('end', () => {
        try { resolve(JSON.parse(raw || '{}')); }
        catch (e) { resolve({}); }
      });
    });
    preq.on('error', reject);
    preq.write(body);
    preq.end();
  });
}
async function sectorsFromHoldings(holdings) {
  const top = (holdings || []).filter(h => h.symbol && h.weight > 0).slice(0, 40);
  if (!top.length) return [];
  const tickers = top.map(h => 'BIST:' + h.symbol);
  let data = [];
  try {
    const j = await tvScanPost(tickers, ['name', 'sector', 'close'], 'turkey');
    data = j.data || [];
  } catch (e) { return []; }
  const secOf = new Map();
  for (const row of data) {
    const sym = String(row.s || '').replace(/^BIST:/, '');
    const sector = (row.d && row.d[1]) || 'Diğer';
    secOf.set(sym, sector);
  }
  const bucket = new Map();
  let covered = 0;
  for (const h of top) {
    const sec = secOf.get(h.symbol) || 'Diğer';
    bucket.set(sec, (bucket.get(sec) || 0) + h.weight);
    covered += h.weight;
  }
  const sectors = [...bucket.entries()]
    .map(([sector, weight]) => ({ sector, weight: covered > 0 ? (weight / covered) * 100 : weight }))
    .sort((a, b) => b.weight - a.weight);
  return sectors;
}
/* ABD ETF holdings'ten TradingView america/scan ile sektör ağırlıkları (Yahoo formatı) */
async function sectorsFromUsHoldings(holdings) {
  const top = (holdings || []).filter(h => h.symbol && h.holdingPercent > 0).slice(0, 25);
  if (!top.length) return [];
  const tickers = [];
  for (const h of top) {
    const s = String(h.symbol || '').toUpperCase();
    if (!s || /[^A-Z0-9.\-]/.test(s)) continue;
    tickers.push('NASDAQ:' + s, 'NYSE:' + s, 'AMEX:' + s);
  }
  let data = [];
  try {
    const j = await tvScanPost(tickers, ['name', 'sector', 'close'], 'america');
    data = j.data || [];
  } catch (e) { return []; }
  const secOf = new Map();
  for (const row of data) {
    const sym = String(row.s || '').replace(/^(NASDAQ|NYSE|AMEX):/, '');
    const sector = (row.d && row.d[1]) || '';
    if (sym && sector && !secOf.has(sym)) secOf.set(sym, sector);
  }
  const bucket = new Map();
  let covered = 0;
  for (const h of top) {
    const sec = secOf.get(String(h.symbol || '').toUpperCase());
    if (!sec) continue;
    const w = h.holdingPercent <= 1 ? h.holdingPercent * 100 : h.holdingPercent;
    bucket.set(sec, (bucket.get(sec) || 0) + w);
    covered += w;
  }
  if (!covered) return [];
  return [...bucket.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, w]) => {
      const o = {};
      o[name] = w / covered;
      return o;
    });
}

/* Minimal XLSX (ZIP) okuyucu — SSGA günlük holdings dosyası için */
function zipReadEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no_eocd');
  const cdOff = buf.readUInt32LE(eocd + 16);
  const files = {};
  let p = cdOff;
  while (p + 46 < buf.length && buf.readUInt32LE(p) === 0x02014b50) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString();
    const localNameLen = buf.readUInt16LE(localOff + 26);
    const localExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    const comp = buf.slice(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = comp;
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else { p += 46 + nameLen + extraLen + commentLen; continue; }
    files[name] = data;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
function xlsxSharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    out.push([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(x => x[1]).join(''));
  }
  return out;
}
function xlsxColIdx(col) {
  let n = 0;
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
  return n - 1;
}
function xlsxSheetRows(xml, sst) {
  const rows = {};
  const re = /<c r="([A-Z]+)(\d+)"([^>]*)(?:\/>|>(?:<v>([^<]*)<\/v>)?<\/c>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const col = m[1], row = +m[2], attrs = m[3] || '';
    let val = m[4];
    if (val == null) continue;
    if (attrs.includes('t="s"')) val = sst[+val];
    if (!rows[row]) rows[row] = [];
    rows[row][xlsxColIdx(col)] = val;
  }
  return Object.keys(rows).map(Number).sort((a, b) => a - b).map(r => rows[r]);
}
function parseSsgaHoldingsXlsx(buf) {
  const files = zipReadEntries(buf);
  const sstXml = files['xl/sharedStrings.xml'];
  const sst = sstXml ? xlsxSharedStrings(sstXml.toString()) : [];
  const sheetKey = Object.keys(files).find(k => /worksheets\/sheet1\.xml$/i.test(k)) ||
    Object.keys(files).find(k => /worksheets\/sheet/i.test(k));
  if (!sheetKey) return { fundName: '', holdings: [] };
  const rows = xlsxSheetRows(files[sheetKey].toString(), sst);
  let fundName = '';
  for (const r of rows.slice(0, 8)) {
    if (String(r && r[0] || '').toLowerCase().includes('fund name')) {
      fundName = String(r[1] || '').replace(/&amp;/g, '&').trim();
      break;
    }
  }
  const hi = rows.findIndex(r => (r || []).some(c => /^Ticker$/i.test(String(c || '').trim())));
  if (hi < 0) return { fundName, holdings: [] };
  const header = rows[hi].map(c => String(c || '').trim().toLowerCase());
  const iName = header.findIndex(h => h === 'name');
  const iTicker = header.findIndex(h => h === 'ticker');
  const iWeight = header.findIndex(h => h === 'weight');
  const holdings = [];
  for (let i = hi + 1; i < rows.length && holdings.length < 25; i++) {
    const r = rows[i] || [];
    const symbol = String(r[iTicker] || '').trim().toUpperCase();
    const weight = parseFloat(r[iWeight]);
    if (!symbol || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol) || !(weight > 0)) continue;
    if (/^(CASH|USD|-\s*$)/i.test(symbol)) continue;
    holdings.push({
      symbol,
      holdingName: String(r[iName] || symbol).replace(/&amp;/g, '&').trim(),
      holdingPercent: weight / 100
    });
  }
  return { fundName, holdings };
}
const SSGA_HOLDINGS_CODES = new Set([
  'spy', 'dia', 'xlk', 'xlf', 'xle', 'xli', 'xly', 'xlp', 'xlv', 'xlb', 'xlre', 'xlu'
]);
function httpsGetBuf(url, headers, redirects) {
  const maxR = redirects == null ? 4 : redirects;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: headers || {}, timeout: 25000 }, pr => {
      if ([301, 302, 303, 307, 308].includes(pr.statusCode) && pr.headers.location && maxR > 0) {
        pr.resume();
        return httpsGetBuf(new URL(pr.headers.location, url).toString(), headers, maxR - 1).then(resolve, reject);
      }
      const chunks = [];
      pr.on('data', c => chunks.push(c));
      pr.on('end', () => resolve({ status: pr.statusCode || 0, buf: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
function parseEtfdbHoldings(html) {
  const holdings = [];
  const re = /data-th="Symbol"><a href="\/stock\/([^"/]+)\/">([^<]+)<\/a><\/td>\s*<td[^>]*data-th="Holding">([^<]*)<\/td>\s*<td[^>]*data-th="% Assets">([\d.]+)%/gi;
  let m;
  while ((m = re.exec(html)) && holdings.length < 20) {
    const symbol = String(m[2] || '').trim().toUpperCase();
    const pct = parseFloat(m[4]);
    if (!symbol || !(pct > 0)) continue;
    holdings.push({
      symbol,
      holdingName: String(m[3] || '').replace(/&amp;/g, '&').trim(),
      holdingPercent: pct / 100
    });
  }
  return holdings;
}
function parseEtfdbMeta(html, fallback) {
  let longName = fallback;
  const og = html.match(/property=['"]og:title['"]\s+content=['"]([^'"]+)/i) ||
    html.match(/content=['"]([^'"]+)['"]\s+property=['"]og:title['"]/i);
  if (og) longName = og[1].replace(/\s*[-|].*$/, '').trim() || fallback;
  else {
    const tm = html.match(/<title>([^|<]+)/i);
    if (tm) longName = tm[1].replace(/\s*[-|].*$/, '').trim() || fallback;
  }
  return { longName };
}

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // --- Avrupa çok-yıllı IFRS/ESEF köprüsü (GLEIF + filings.xbrl.org, anahtarsız) ---
  if (urlPath === '/ifrs') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    ifrsHandler(q.get('isin') || '', q.get('name') || '', (q.get('country') || '').toUpperCase(), res);
    return;
  }

  // --- Haber köprüsü (Bing News RSS — linkler gerçek yayıncıya gider) ---
  //     m=tr parametresi BIST hisseleri için Türkçe haber pazarını seçer.
  if (urlPath === '/news') {
    const nq = new URLSearchParams(req.url.split('?')[1] || '');
    const q = encodeURIComponent(nq.get('q') || '');
    const mkt = nq.get('m') === 'tr' ? '&setlang=tr-TR&cc=TR&mkt=tr-TR' : '&setlang=en-US';
    const newsUrl = 'https://www.bing.com/news/search?q=' + q + '&format=rss' + mkt;
    https.get(newsUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end(''); });
    return;
  }

  // --- Fiyat köprüsü (Yahoo Finance, anahtarsız) ---
  if (urlPath === '/price') {
    const qs  = new URLSearchParams(req.url.split('?')[1] || '');
    const sym = encodeURIComponent(qs.get('s') || '');
    // range verilirse onu kullan (canlı/günlük), yoksa period1/period2 (geçmiş)
    let range = '';
    if (qs.get('range')) {
      range = 'range=' + encodeURIComponent(qs.get('range'));
    } else {
      const p1 = qs.get('p1') || '0';
      const p2 = qs.get('p2') || String(Math.floor(Date.now() / 1000));
      range = 'period1=' + p1 + '&period2=' + p2;
    }
    const yurl = 'https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?' + range + '&interval=1d';
    https.get(yurl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
    return;
  }

  // --- Toplu canlı kotasyon (Yahoo spark, anahtarsız) — piyasa şeridi için ---
  //     ?s=SYM1,SYM2,... (en fazla 40). Yanıt: { quotes:[{symbol,price,prev,changePct}] }
  if (urlPath === '/quotes') {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const raw = (qs.get('s') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 40);
    if (!raw.length) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ quotes: [] }));
      return;
    }
    const YUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const chunkSize = 10;
    const chunks = [];
    for (let i = 0; i < raw.length; i += chunkSize) chunks.push(raw.slice(i, i + chunkSize));
    const fetchChunk = (syms) => new Promise((resolve) => {
      const enc = syms.map(s => encodeURIComponent(s)).join(',');
      const yurl = 'https://query1.finance.yahoo.com/v7/finance/spark?symbols=' + enc + '&range=1d&interval=1d';
      https.get(yurl, { headers: { 'User-Agent': YUA } }, pr => {
        let body = '';
        pr.on('data', c => body += c);
        pr.on('end', () => {
          try {
            const j = JSON.parse(body);
            const rows = (j.spark && j.spark.result) || [];
            resolve(rows.map(item => {
              const meta = item.response && item.response[0] && item.response[0].meta;
              const price = meta && meta.regularMarketPrice != null ? meta.regularMarketPrice : null;
              const prev = meta && meta.chartPreviousClose != null ? meta.chartPreviousClose : null;
              const changePct = (price != null && prev) ? (price - prev) / prev * 100 : null;
              return { symbol: item.symbol, price, prev, changePct };
            }));
          } catch (e) { resolve([]); }
        });
      }).on('error', () => resolve([]));
    });
    Promise.all(chunks.map(fetchChunk)).then(parts => {
      const quotes = [].concat(...parts);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ quotes }));
    });
    return;
  }

  // --- Yahoo yıllık finansallar köprüsü (fundamentals-timeseries, anahtarsız/crumb'sız) ---
  //     Almanya/İsviçre gibi filings.xbrl.org kapsamı olmayan Avrupa borsaları için çok-yıllı
  //     bilanço/gelir/nakit-akış yedeği. Yahoo CORS göndermez → proxy şart (aynı /price gibi).
  if (urlPath === '/yfin') {
    const yq = new URLSearchParams(req.url.split('?')[1] || '');
    const sym = encodeURIComponent(yq.get('s') || '');
    // p=q → çeyreklik seri (quarterly*); varsayılan yıllık (annual*). Not: yarıyıllık raporlayan
    // Avrupa şirketlerinde (Nestle, LVMH…) "quarterly" 6 aylık dönemler döndürür — Yahoo şirketin
    // gerçekte yayınladığı en sık dönemi verir.
    const pfx = yq.get('p') === 'q' ? 'quarterly' : 'annual';
    const types = ['TotalRevenue','CostOfRevenue','GrossProfit','OperatingIncome','NetIncome',
      'TotalAssets','CurrentAssets','CashAndCashEquivalents','Inventory','AccountsReceivable',
      'NetPPE','Goodwill','OtherIntangibleAssets','TotalLiabilitiesNetMinorityInterest',
      'CurrentLiabilities','AccountsPayable','CurrentDebt','CurrentDebtAndCapitalLeaseObligation',
      'LongTermDebt','LongTermDebtAndCapitalLeaseObligation','StockholdersEquity','MinorityInterest',
      'OperatingCashFlow','InvestingCashFlow','FinancingCashFlow','CapitalExpenditure',
      'ResearchAndDevelopment'].map(t => pfx + t).join(',');
    // yıllıkta ~6 yıl (Yahoo en çok 4 döndürüyor); çeyreklikte ~3 yıl yeter
    const p1 = Math.floor(Date.now() / 1000) - (pfx === 'quarterly' ? 3 : 6) * 365 * 86400;
    const p2 = Math.floor(Date.now() / 1000) + 86400;
    const yUrl = 'https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/' + sym +
      '?symbol=' + sym + '&type=' + types + '&period1=' + p1 + '&period2=' + p2;
    https.get(yUrl, { headers: { 'User-Agent': BUA } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end('{"timeseries":{"result":[]}}'); });
    return;
  }

  // --- Yahoo hisse arama köprüsü (Güney Kore için doğru KS/KQ eki çözümlemesi) ---
  //     Kore'de aynı 6 haneli kod hem KOSPI (.KS) hem KOSDAQ (.KQ) borsasında olabilir;
  //     TradingView'in "KRX" öneki ikisini de tek isimde topladığından hangisi olduğunu
  //     ayırt etmez. Yahoo'nun kendi arama uç noktası doğru eki (symbol alanında) doğrudan
  //     verir — CORS göndermediği için anahtarsız proxy şart (aynı /price gibi).
  if (urlPath === '/yfsearch') {
    const q = encodeURIComponent(new URLSearchParams(req.url.split('?')[1] || '').get('q') || '');
    const yUrl = 'https://query1.finance.yahoo.com/v1/finance/search?q=' + q;
    https.get(yUrl, { headers: { 'User-Agent': BUA } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end('{"quotes":[]}'); });
    return;
  }

  // --- BIST mali tablo köprüsü (İş Yatırım'ın halka açık KAP verisi, anahtarsız) ---
  //     İstemci year1/period1..year4/period4 + companyCode + financialGroup gönderir;
  //     parametreler olduğu gibi İş Yatırım'a iletilir. CORS göndermediği için proxy şart.
  if (urlPath === '/bist') {
    const qs = req.url.split('?')[1] || '';
    const bUrl = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?exchange=TRY&' + qs;
    https.get(bUrl, { headers: { 'User-Agent': BUA, 'Accept': 'application/json' } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end('{"value":[]}'); });
    return;
  }

  // --- BIST analist hedef fiyatları YEDEK köprüsü (TradingView tarayıcı API'si) ---
  //     Birincil yol tarayıcıdan doğrudandır (TV CORS'u origin yansıtır); bu rota yalnızca
  //     tarayıcı çağrısı başarısız olursa kullanılır.
  if (urlPath === '/tvt') {
    const sym = new URLSearchParams(req.url.split('?')[1] || '').get('s') || '';
    const payload = JSON.stringify({ symbols: { tickers: ['BIST:' + sym] },
      columns: ['price_target_average','price_target_high','price_target_low','recommendation_total','recommendation_buy','recommendation_over','recommendation_hold','recommendation_under','recommendation_sell','recommendation_mark','close'] });
    const preq = https.request('https://scanner.tradingview.com/turkey/scan',
      { method: 'POST', headers: { 'User-Agent': BUA, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, pr => {
        let body = '';
        pr.on('data', c => body += c);
        pr.on('end', () => {
          res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
          res.end(body);
        });
      });
    preq.on('error', e => { res.writeHead(502); res.end('{"data":[]}'); });
    preq.write(payload); preq.end();
    return;
  }

  // --- Ekonomik takvim köprüsü (TradingView economic-calendar; countries=TR veya US) ---
  //     Uç nokta yalnızca tradingview.com Origin'i ile yanıt verir (aksi 403); tarayıcı
  //     Origin başlığını değiştiremediği için bu istek SUNUCUDAN yapılmak zorunda.
  if (urlPath === '/econ') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const from = encodeURIComponent(q.get('from') || new Date(Date.now() - 86400000).toISOString());
    const to = encodeURIComponent(q.get('to') || new Date(Date.now() + 30 * 86400000).toISOString());
    // ABD/TR + Avrupa + Asya (beyaz liste — keyfi girdi upstream'e geçmesin)
    const OKC = ['US','TR','GB','DE','FR','NL','BE','PT','IT','ES','CH','SE','DK','NO','FI','AT','PL','KR','JP','CN','HK','TW','CA','AU','SG'];
    const country = OKC.includes(q.get('countries')) ? q.get('countries') : 'TR';
    const eUrl = 'https://economic-calendar.tradingview.com/events?from=' + from + '&to=' + to + '&countries=' + country;
    https.get(eUrl, { headers: { 'User-Agent': BUA, 'Origin': 'https://tr.tradingview.com', 'Accept': 'application/json' } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end('{"result":[]}'); });
    return;
  }

  // --- Investing.com TAM ekonomik takvim köprüsü (Türkçe isim + Investing'in kendi önem
  //     yıldızları + kendi olumlu/olumsuz renk sınıfları). Investing'in sayfa AJAX ucu;
  //     X-Requested-With + Referer başlıkları ŞART, tarayıcıdan CORS ile çağrılamaz →
  //     sunucu köprüsü. c=ISO ülke kodu; tab=today/tomorrow/yesterday/thisWeek/nextWeek.
  //     timeZone=63 (İstanbul) → saatler ve tarihler doğrudan TSİ. ---
  if (urlPath === '/investcal') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    // ISO → Investing.com ülke ID'si (investpy; SG=36)
    const INVESTING_COUNTRY = { US:'5', TR:'63', GB:'4', DE:'17', FR:'22', NL:'21', BE:'34', PT:'38',
      IT:'10', ES:'26', CH:'12', SE:'9', DK:'24', NO:'60', FI:'71', AT:'54', PL:'53', KR:'11', JP:'35',
      CN:'37', HK:'39', TW:'46', CA:'6', AU:'25', SG:'36' };
    const country = INVESTING_COUNTRY[q.get('c')] || '63';
    const tabs = { yesterday:'yesterday', today:'today', tomorrow:'tomorrow', thisWeek:'thisWeek', nextWeek:'nextWeek' };
    const tab = tabs[q.get('tab')] || 'thisWeek';
    const post = 'country%5B%5D=' + country + '&timeZone=63&currentTab=' + tab + '&limit_from=0';
    const options = { method:'POST', headers: {
      'User-Agent': BUA, 'X-Requested-With':'XMLHttpRequest',
      'Referer':'https://tr.investing.com/economic-calendar/',
      'Content-Type':'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(post), 'Accept':'*/*' } };
    const preq = https.request('https://tr.investing.com/economic-calendar/Service/getCalendarFilteredData', options, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' });
        res.end(body);
      });
    });
    preq.on('error', e => { res.writeHead(502); res.end('{"data":""}'); });
    preq.write(post); preq.end();
    return;
  }

  // --- BIST ortaklık yapısı köprüsü (İş Yatırım OrtaklikYapisi — ortak adı + %oran) ---
  if (urlPath === '/bistown') {
    const h = new URLSearchParams(req.url.split('?')[1] || '').get('hisse') || '';
    const oUrl = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/OrtaklikYapisi?hisse=' + encodeURIComponent(h);
    https.get(oUrl, { headers: { 'User-Agent': BUA, 'Accept': 'application/json' } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end('{"value":[]}'); });
    return;
  }

  // --- Analist hedef fiyatları köprüsü (Finviz, anahtarsız — Yahoo crumb'a bağımlı değil) ---
  if (urlPath === '/targets') {
    const sym = new URLSearchParams(req.url.split('?')[1] || '').get('s') || '';
    finvizTargets(sym, res);
    return;
  }

  // --- Çeviri köprüsü (çoklu yedekli: Google gtx → MyMemory) ---
  //     Yanıt tek tip: { text: "<türkçe>" } (translateToTR yukarıda açıklandı).
  if (urlPath === '/tr') {
    const q = decodeURIComponent((req.url.split('?')[1] || '').replace(/^q=/, ''));
    translateToTR(q).then(text => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ text }));
    }).catch(() => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ text: q }));
    });
    return;
  }

  // --- SEC Arşiv köprüsü (www.sec.gov/Archives — Form 4 içeriden işlem bildirimleri) ---
  //     data.sec.gov JSON API'leri sunar; belge arşivi (form4.xml vb.) www.sec.gov'dadır.
  if (urlPath.startsWith('/secw/')) {
    const wUrl = 'https://www.sec.gov' + req.url.slice(5); // '/secw' -> ''
    https.get(wUrl, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity' } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, {
          'Content-Type': pr.headers['content-type'] || 'application/xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end(''); });
    return;
  }

  // --- OpenBB tarzı Yahoo köprüleri (anahtarsız; ODP'nin yfinance sağlayıcısıyla aynı kaynak) ---
  //     /yscr  discovery (yedek): day_gainers | day_losers | most_actives
  //     /yqs   quoteSummary modülleri: calendarEvents, institutionOwnership, topHoldings…
  //     /ycal  piyasa takvimi: earnings | dividends | ipo | splits
  //     /ynews şirket haberleri (Yahoo ticker news)
  const YFIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const yfinGet = (yurl, cb) => {
    https.get(yurl, { headers: { 'User-Agent': YFIN_UA, 'Accept': 'application/json' } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => cb(null, pr.statusCode || 502, body));
    }).on('error', e => cb(e));
  };
  const yfinJson = (res, status, body, transform) => {
    try {
      const j = JSON.parse(body || '{}');
      const out = transform ? transform(j) : j;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(status >= 400 ? status : 502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'parse', rawStatus: status }));
    }
  };

  if (urlPath === '/yscr') {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const allowed = new Set(['day_gainers', 'day_losers', 'most_actives', 'growth_technology_stocks', 'small_cap_gainers']);
    const scr = allowed.has(qs.get('scr') || '') ? qs.get('scr') : 'day_gainers';
    const count = Math.min(40, Math.max(5, parseInt(qs.get('count') || '15', 10) || 15));
    const yurl = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds=' +
      encodeURIComponent(scr) + '&count=' + count;
    yfinGet(yurl, (err, status, body) => {
      if (err) { res.writeHead(502); res.end(JSON.stringify({ quotes: [], error: err.message })); return; }
      yfinJson(res, status, body, j => {
        const block = (j.finance && j.finance.result && j.finance.result[0]) || {};
        const quotes = (block.quotes || []).map(q => ({
          symbol: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: q.regularMarketPrice != null ? q.regularMarketPrice : null,
          changePct: q.regularMarketChangePercent != null ? q.regularMarketChangePercent : null,
          volume: q.regularMarketVolume != null ? q.regularMarketVolume : null,
          mcap: q.marketCap != null ? q.marketCap : null
        }));
        return { scr, quotes, source: 'yahoo' };
      });
    });
    return;
  }

  if (urlPath === '/yqs') {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const rawSym = (qs.get('s') || '').trim().toUpperCase();
    const sym = encodeURIComponent(rawSym);
    const mods = (qs.get('m') || 'calendarEvents,institutionOwnership,majorHoldersBreakdown,topHoldings,assetProfile')
      .split(',').map(x => x.trim()).filter(Boolean).slice(0, 12).join(',');
    if (!rawSym) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end('{}'); return; }
    const sendJson = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    const normalizeQs = (r) => {
      if (!r || typeof r !== 'object') return r;
      const out = Object.assign({}, r);
      if (out.institutionOwnership && Array.isArray(out.institutionOwnership.ownershipList)) {
        out.institutionOwnership = Object.assign({}, out.institutionOwnership, {
          ownershipList: out.institutionOwnership.ownershipList.map(h => ({
            organization: h.organization,
            pctHeld: yahooUnwrap(h.pctHeld),
            position: yahooUnwrap(h.position),
            value: yahooUnwrap(h.value),
            pctChange: yahooUnwrap(h.pctChange),
            reportDate: yahooUnwrap(h.reportDate)
          }))
        });
      }
    if (out.topHoldings) {
      const th = out.topHoldings;
      out.topHoldings = Object.assign({}, th, {
        holdings: Array.isArray(th.holdings) ? th.holdings.map(h => ({
          symbol: h.symbol,
          holdingName: h.holdingName || h.holdingNameLong || h.symbol,
          holdingPercent: yahooUnwrap(h.holdingPercent)
        })) : [],
        sectorWeightings: Array.isArray(th.sectorWeightings) ? th.sectorWeightings : [],
        cashPosition: yahooUnwrap(th.cashPosition),
        stockPosition: yahooUnwrap(th.stockPosition),
        bondPosition: yahooUnwrap(th.bondPosition)
      });
    }
      return out;
    };
    const fetchQs = async (forceCrumb) => {
      const { crumb, cookie } = await ensureYahooCrumb(forceCrumb);
      const yurl = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/' + sym +
        '?modules=' + encodeURIComponent(mods) + '&formatted=false&lang=en-US&region=US&crumb=' + encodeURIComponent(crumb);
      const r = await httpsGetCookie(yurl, {
        'User-Agent': YFIN_UA, 'Accept': 'application/json', 'Cookie': cookie
      }, cookie);
      let j = {};
      try { j = JSON.parse(r.body || '{}'); } catch (e) { throw new Error('parse'); }
      const errDesc = j.quoteSummary && j.quoteSummary.error && j.quoteSummary.error.description;
      if (r.status === 401 || /crumb/i.test(String(errDesc || ''))) {
        _yahooCrumb = null; _yahooCrumbAt = 0;
        if (!forceCrumb) return fetchQs(true);
        throw new Error('unauthorized');
      }
      const result = j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
      if (!result) throw new Error((j.quoteSummary && j.quoteSummary.error && (j.quoteSummary.error.description || j.quoteSummary.error.code)) || 'empty');
      return normalizeQs(result);
    };
    const finvizHoldersFallback = () => {
      const url = 'https://finviz.com/quote.ashx?t=' + encodeURIComponent(rawSym);
      httpGetHtmlFollow(url, { 'User-Agent': BUA, 'Accept': 'text/html' }, 4, (err, status, html) => {
        if (err || status !== 200 || !html) { sendJson({ error: 'empty', source: 'finviz' }); return; }
        const inst = finvizNum(extractStat2(html, 'Inst Own'));
        const insider = finvizNum(extractStat2(html, 'Insider Own'));
        sendJson({
          source: 'finviz',
          majorHoldersBreakdown: {
            institutionsPercentHeld: inst != null ? inst / 100 : null,
            insidersPercentHeld: insider != null ? insider / 100 : null
          },
          institutionOwnership: { ownershipList: [] },
          error: mods.includes('topHoldings') ? 'topHoldings_unavailable' : undefined
        });
      });
    };
    /* Yahoo crumb bulutta kırılınca: SSGA XLSX → ETFDB → StockAnalysis → Finviz */
    const stockAnalysisEtfFallback = () => new Promise((resolve) => {
      const code = rawSym.replace(/\.US$/i, '').toLowerCase();
      const url = 'https://stockanalysis.com/etf/' + encodeURIComponent(code) + '/holdings/';
      httpGetHtmlFollow(url, { 'User-Agent': BUA, 'Accept': 'text/html' }, 4, (err, status, html) => {
        if (err || status !== 200 || !html) { resolve(null); return; }
        const holdings = [];
        const hre = /href="\/stocks\/([a-z0-9.\-]+)\/"\s*>([A-Z0-9.\-]+)<\/a>[\s\S]{0,500}?<td class="shr[^"]*">([^<]*)<\/td>[\s\S]{0,300}?>([0-9.]+)%<\/td>/gi;
        let hm;
        while ((hm = hre.exec(html)) && holdings.length < 25) {
          holdings.push({
            symbol: hm[2],
            holdingName: String(hm[3] || '').replace(/&amp;/g, '&').trim(),
            holdingPercent: parseFloat(hm[4]) / 100
          });
        }
        const sectors = [];
        const sre = /\{n:"([^"]+)",w:([0-9.]+)\}/g;
        let sm;
        while ((sm = sre.exec(html)) && sectors.length < 20) {
          const name = sm[1];
          if (/United States|Switzerland|China|Netherlands|Ireland|United Kingdom|Canada|Brazil|country/i.test(name)) continue;
          const obj = {};
          obj[name] = parseFloat(sm[2]) / 100;
          sectors.push(obj);
        }
        if (!holdings.length && !sectors.length) { resolve(null); return; }
        let longName = rawSym;
        const tm = html.match(/<title>([^|<]+)/i);
        if (tm) longName = tm[1].replace(/\s*Holdings.*$/i, '').trim() || rawSym;
        const pxm = html.match(/\$([0-9]+(?:\.[0-9]+)?)/);
        const px = pxm ? parseFloat(pxm[1]) : null;
        resolve({
          source: 'stockanalysis',
          quoteType: { longName: longName, shortName: rawSym, quoteType: 'ETF' },
          price: px != null ? { regularMarketPrice: px } : undefined,
          fundProfile: { categoryName: 'ETF', family: 'StockAnalysis' },
          topHoldings: { holdings, sectorWeightings: sectors }
        });
      });
    });
    const issuerEtfFallback = async () => {
      const code = rawSym.replace(/\.US$/i, '').toUpperCase();
      const codeLc = code.toLowerCase();
      /* 1) State Street günlük XLSX (SPY, DIA, sektör SPDR) — Render IP'de genelde açık */
      if (SSGA_HOLDINGS_CODES.has(codeLc)) {
        try {
          const url = 'https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-' + codeLc + '.xlsx';
          const r = await httpsGetBuf(url, { 'User-Agent': BUA, Accept: '*/*' });
          if (r.status === 200 && r.buf && r.buf.length > 1000 && r.buf[0] === 0x50 && r.buf[1] === 0x4b) {
            const parsed = parseSsgaHoldingsXlsx(r.buf);
            if (parsed.holdings.length) {
              let sectors = [];
              try { sectors = await sectorsFromUsHoldings(parsed.holdings); } catch (e) {}
              return {
                source: 'ssga',
                quoteType: { longName: parsed.fundName || code, shortName: code, quoteType: 'ETF' },
                fundProfile: { categoryName: 'ETF', family: 'State Street' },
                topHoldings: { holdings: parsed.holdings, sectorWeightings: sectors }
              };
            }
          }
        } catch (e) {}
      }
      /* 2) ETF Database sayfa scrape — QQQ/IWM/ARKK/SMH vb. için geniş kapsama */
      try {
        const url = 'https://etfdb.com/etf/' + encodeURIComponent(code) + '/';
        const r = await httpsGetText(url, { 'User-Agent': BUA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' });
        if (r.status === 200 && r.body) {
          const holdings = parseEtfdbHoldings(r.body);
          if (holdings.length) {
            const meta = parseEtfdbMeta(r.body, code);
            let sectors = [];
            try { sectors = await sectorsFromUsHoldings(holdings); } catch (e) {}
            return {
              source: 'etfdb',
              quoteType: { longName: meta.longName, shortName: code, quoteType: 'ETF' },
              fundProfile: { categoryName: 'ETF', family: 'ETF Database' },
              topHoldings: { holdings, sectorWeightings: sectors }
            };
          }
        }
      } catch (e) {}
      /* 3) StockAnalysis */
      const sa = await stockAnalysisEtfFallback();
      if (sa) return sa;
      return null;
    };
    const forceIssuer = qs.get('fb') === '1';
    const afterYahooFail = () => {
      if (!mods.includes('topHoldings')) { finvizHoldersFallback(); return; }
      issuerEtfFallback().then(obj => {
        if (obj) sendJson(obj);
        else finvizHoldersFallback();
      }).catch(() => finvizHoldersFallback());
    };
    if (forceIssuer) afterYahooFail();
    else fetchQs(false).then(sendJson).catch(afterYahooFail);
    return;
  }

  // --- Türkiye Hisse Takvimi: KAP bildirimlerinden IPO / bedelsiz (bölünme) ---
  //     ?type=ipo|splits  →  { rows:[{symbol,name,date,amount,time,kapUrl}], source:'kap' }
  if (urlPath === '/trcal') {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const type = qs.get('type') === 'splits' ? 'splits' : 'ipo';
    const send = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const from = new Date(now.getTime() - 45 * 86400000);
    const to = new Date(now.getTime() + 5 * 86400000);
    const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const body = JSON.stringify({
      fromDate: ymd(from),
      toDate: ymd(to),
      mkkMemberOidList: [],
      subjectList: []
    });
    const preq = https.request({
      hostname: 'www.kap.org.tr',
      path: '/tr/api/disclosure/members/byCriteria',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': BUA,
        'Accept': 'application/json',
        'Referer': 'https://www.kap.org.tr/'
      }
    }, pr => {
      let raw = '';
      pr.on('data', c => raw += c);
      pr.on('end', () => {
        try {
          const arr = JSON.parse(raw || '[]');
          if (!Array.isArray(arr)) { send({ type, rows: [], source: 'kap', error: 'shape' }); return; }
          const isIpo = (x) => {
            const sub = String(x.subject || '');
            const sum = String(x.summary || '');
            return /halka\s*arz/i.test(sub) || (/halka\s*arz/i.test(sum) && (x.relatedStocks || x.stockCodes));
          };
          const isSplit = (x) => {
            const sub = String(x.subject || '');
            const sum = String(x.summary || '');
            // Türkiye'de fiili bölünme çoğunlukla bedelsiz sermaye artırımı
            if (/sermaye\s*artır/i.test(sub) && /bedelsiz/i.test(sum)) return true;
            if (/bedelsiz/i.test(sub)) return true;
            if (/pay\s*bölün|bölünme|stock\s*split/i.test(sub + ' ' + sum)) return true;
            return false;
          };
          const pick = type === 'ipo' ? isIpo : isSplit;
          const seen = new Set();
          const rows = [];
          for (const x of arr) {
            if (!pick(x)) continue;
            const sym = String(x.relatedStocks || x.stockCodes || '')
              .split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)[0] || null;
            const pub = String(x.publishDate || '').trim();
            const datePart = pub.slice(0, 10); // DD.MM.YYYY
            const key = (sym || x.kapTitle || '') + '|' + datePart + '|' + (x.subject || '');
            if (seen.has(key)) continue;
            seen.add(key);
            const idx = x.disclosureIndex;
            rows.push({
              symbol: sym,
              name: x.kapTitle || '',
              date: datePart,
              amount: null,
              time: (x.subject || '').slice(0, 80),
              summary: (x.summary || '').slice(0, 160),
              kapUrl: idx ? ('https://www.kap.org.tr/tr/Bildirim/' + idx) : null
            });
            if (rows.length >= 40) break;
          }
          send({ type, rows, source: 'kap', market: 'TR' });
        } catch (e) {
          send({ type, rows: [], source: 'kap', error: 'parse', rawStatus: pr.statusCode || 502 });
        }
      });
    });
    preq.on('error', e => send({ type, rows: [], error: e.message }));
    preq.write(body);
    preq.end();
    return;
  }

  if (urlPath === '/ycal') {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const type = ['earnings', 'dividends', 'ipo', 'splits'].includes(qs.get('type') || '') ? qs.get('type') : 'earnings';
    const day = qs.get('day') || new Date().toISOString().slice(0, 10);
    const sendCal = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    const parseEps = (v) => {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return v;
      const m = String(v).replace(/[$,]/g, '').match(/-?[\d.]+/);
      return m ? parseFloat(m[0]) : null;
    };
    // Yahoo calendar-service su an 500; Nasdaq public API anahtarsiz calisiyor.
    const nasdaqPath = type === 'earnings' ? 'earnings'
      : type === 'dividends' ? 'dividends'
      : type === 'splits' ? 'splits'
      : type === 'ipo' ? 'ipos' : null;
    if (!nasdaqPath) {
      sendCal({ type, day, rows: [], source: 'nasdaq', error: 'unsupported' });
      return;
    }
    const nurl = 'https://api.nasdaq.com/api/calendar/' + nasdaqPath + '?date=' + encodeURIComponent(day);
    https.get(nurl, {
      headers: {
        'User-Agent': YFIN_UA,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.nasdaq.com',
        'Referer': 'https://www.nasdaq.com/'
      }
    }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        try {
          const j = JSON.parse(body || '{}');
          const data = j.data || {};
          let rows = [];
          if (type === 'earnings') rows = data.rows || [];
          else if (type === 'dividends') rows = (data.calendar && data.calendar.rows) || data.rows || [];
          else if (type === 'splits') rows = data.rows || [];
          else if (type === 'ipo') {
            // Nasdaq IPO: upcoming/priced/filed grupları
            const upcoming = (data.upcoming && data.upcoming.rows) || data.upcoming || [];
            const priced = (data.priced && data.priced.rows) || data.priced || [];
            rows = [].concat(Array.isArray(upcoming) ? upcoming : [], Array.isArray(priced) ? priced : []);
            if (!rows.length && Array.isArray(data.rows)) rows = data.rows;
          }
          if (!Array.isArray(rows)) rows = [];
          const norm = rows.slice(0, 80).map(r => {
            if (type === 'earnings') {
              return {
                symbol: r.symbol || null,
                name: r.name || '',
                date: day,
                epsEst: parseEps(r.epsForecast),
                epsAct: parseEps(r.lastYearEPS),
                amount: null,
                time: r.time || null
              };
            }
            if (type === 'dividends') {
              return {
                symbol: r.symbol || null,
                name: r.companyName || r.name || '',
                date: r.dividend_Ex_Date || day,
                epsEst: null,
                epsAct: null,
                amount: r.dividend_Rate != null ? r.dividend_Rate : null,
                time: null
              };
            }
            if (type === 'ipo') {
              return {
                symbol: r.proposedTickerSymbol || r.symbol || null,
                name: r.companyName || r.name || '',
                date: r.expectedPriceDate || r.pricedDate || day,
                epsEst: null,
                epsAct: null,
                amount: r.dollarValueOfSharesOffered || r.priceRange || null,
                time: r.exchange || null
              };
            }
            return {
              symbol: r.symbol || null,
              name: r.name || r.companyName || '',
              date: r.executionDate || day,
              epsEst: null,
              epsAct: null,
              amount: null,
              time: r.ratio || null
            };
          }).filter(x => x.symbol || x.name);
          sendCal({ type, day, rows: norm, source: 'nasdaq' });
        } catch (e) {
          sendCal({ type, day, rows: [], source: 'nasdaq', error: 'parse', rawStatus: pr.statusCode || 502 });
        }
      });
    }).on('error', e => sendCal({ type, day, rows: [], error: e.message }));
    return;
  }

  if (urlPath === '/ynews') {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const sym = encodeURIComponent(qs.get('s') || '');
    const count = Math.min(30, Math.max(5, parseInt(qs.get('count') || '12', 10) || 12));
    if (!sym) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ items: [] })); return; }
    const yurl = 'https://query1.finance.yahoo.com/v1/finance/search?q=' + sym +
      '&quotesCount=0&newsCount=' + count + '&listsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query';
    yfinGet(yurl, (err, status, body) => {
      if (err) { res.writeHead(502); res.end(JSON.stringify({ items: [], error: err.message })); return; }
      yfinJson(res, status, body, j => {
        const items = (j.news || []).map(n => ({
          title: n.title || '',
          link: n.link || n.url || '',
          src: (n.publisher || n.provider || 'Yahoo'),
          desc: n.summary || '',
          d: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null
        })).filter(x => x.title && x.link);
        return { items, source: 'yahoo' };
      });
    });
    return;
  }

  // --- SEC köprüsü ---
  if (urlPath.startsWith('/sec/')) {
    const secUrl = 'https://data.sec.gov' + req.url.slice(4); // '/sec' -> ''
    https.get(secUrl, { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Encoding': 'identity' } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
    return;
  }

  // --- SEC filings özeti (EdgarTools tarzı — submissions'dan 10-K/10-Q/8-K/4) ---
  //     ?cik=0000320193  →  { filings:[{form,date,acc,doc,url}], name }
  if (urlPath === '/secfilings') {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const cikRaw = (qs.get('cik') || '').replace(/\D/g, '');
    const cik = cikRaw.padStart(10, '0');
    const send = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    if (!cikRaw) { send({ filings: [], error: 'cik' }); return; }
    const secUrl = 'https://data.sec.gov/submissions/CIK' + cik + '.json';
    https.get(secUrl, { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Encoding': 'identity' } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        try {
          const j = JSON.parse(body || '{}');
          const rec = j.filings && j.filings.recent;
          if (!rec || !Array.isArray(rec.form)) { send({ filings: [], name: j.name || '', error: 'empty' }); return; }
          const want = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A', '8-K', '8-K/A', '20-F', '6-K', '4', '13F-HR']);
          const filings = [];
          const cikNum = parseInt(cik, 10);
          for (let i = 0; i < rec.form.length && filings.length < 40; i++) {
            const form = rec.form[i];
            if (!want.has(form)) continue;
            const acc = rec.accessionNumber[i];
            const folder = String(acc || '').replace(/-/g, '');
            const doc = rec.primaryDocument[i] || '';
            filings.push({
              form,
              date: rec.filingDate[i],
              acc,
              doc,
              desc: (rec.primaryDocDescription && rec.primaryDocDescription[i]) || '',
              url: 'https://www.sec.gov/Archives/edgar/data/' + cikNum + '/' + folder + '/' + doc
            });
          }
          send({
            name: j.name || '',
            tickers: j.tickers || [],
            exchanges: j.exchanges || [],
            sic: j.sic || null,
            sicDescription: j.sicDescription || '',
            filings,
            source: 'sec-edgar'
          });
        } catch (e) { send({ filings: [], error: 'parse' }); }
      });
    }).on('error', e => send({ filings: [], error: e.message }));
    return;
  }

  // --- TEFAS: Türkiye hisse fonları — yalnızca sektör+varlık verisi olanlar ---
  //     ?view=top&limit=30
  //     ?view=fund&code=TI2
  if (urlPath === '/tefas') {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const view = qs.get('view') === 'fund' ? 'fund' : 'top';
    const kind = 'YAT';
    const limit = Math.min(60, Math.max(5, parseInt(qs.get('limit') || '30', 10) || 30));
    const code = String(qs.get('code') || '').trim().toUpperCase();
    const send = (obj) => {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      });
      res.end(JSON.stringify(obj));
    };
    (async () => {
      try {
        if (view === 'fund') {
          if (!code) return send({ ok: false, error: 'code_required' });
          const pack = await tefasFetchDay(kind, code);
          if (!pack || !pack.info.length) return send({ ok: false, error: 'not_found', code });
          const f = pack.info[0];
          const d = pack.dist[0] || null;
          const fund = tefasMapFund(f, d);
          let holdings = [];
          let sectors = [];
          try {
            holdings = await fonolojiHoldings(code);
            sectors = await sectorsFromHoldings(holdings);
          } catch (e) { holdings = []; sectors = []; }
          if (holdings.length < 5 || !sectors.length) {
            // Önbellekteki listeden de düş (bir daha görünmesin)
            if (TEFAS_TOP_HOLD_CACHE.funds) {
              TEFAS_TOP_HOLD_CACHE.funds = TEFAS_TOP_HOLD_CACHE.funds.filter(x => x.code !== code);
            }
            return send({ ok: false, error: 'no_holdings', code });
          }
          fund.holdings = holdings.slice(0, 25).map(h => ({
            symbol: h.symbol,
            name: h.name,
            holdingPercent: h.weight
          }));
          fund.sectors = sectors.slice(0, 15);
          return send({
            ok: true,
            source: 'tefas+kap',
            date: pack.date,
            kind,
            fund
          });
        }
        const top = await tefasTopWithHoldings(limit);
        if (!top.funds.length) return send({ ok: false, error: 'empty', kind });
        send({
          ok: true,
          source: 'tefas+kap',
          date: top.date,
          kind,
          category: 'hisse',
          onlyWithHoldings: true,
          scanned: top.scanned,
          total: top.funds.length,
          funds: top.funds
        });
      } catch (e) {
        send({ ok: false, error: e.message || 'tefas_fail' });
      }
    })();
    return;
  }

  // --- statik dosyalar ---
  let file = urlPath === '/' ? '/bilanco-analiz.html' : urlPath;
  const fp = path.join(ROOT, decodeURIComponent(file));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(fp, (e, data) => {
    if (e) { res.writeHead(404); res.end('Bulunamadi: ' + file); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('===========================================');
  console.log('  Bilanco Analiz calisiyor (anahtarsiz).');
  console.log('  Adres: http://localhost:' + PORT);
  console.log('  Kapatmak icin bu pencerede Ctrl+C yapin.');
  console.log('===========================================');
});
