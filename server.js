/* Bilanço Analiz — yerel köprü sunucusu (anahtarsız SEC EDGAR erişimi)
   Çift tıklamayla Bilanco-Baslat.bat üzerinden çalışır.
   - Uygulamayı http://localhost:8723 adresinde sunar
   - /sec/* isteklerini sunucu tarafından data.sec.gov'a iletir (CORS sorunu olmaz) */
const http  = require('http');
const https = require('https');
const zlib  = require('zlib');
const fs    = require('fs');
const path  = require('path');
const crypto = require('crypto');

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
const PUBLIC_FILES = new Set([
  'bilanco-analiz.html', 'apple-design.css', 'app.js', 'i18n.js', 'cik-map.js', 'sw.js', 'manifest.webmanifest'
]);
const isPublicStaticFile = rel => PUBLIC_FILES.has(rel) || rel.startsWith('icons/');

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

/* TipRanks özel şirket profilleri Cloudflare nedeniyle sunucudan doğrudan 403 döndürüyor.
   Okunabilir TipRanks sayfa çıktısını Jina Reader üzerinden alıp yalnız gerekli alanları ayıklarız.
   Kullanıcı girdisi URL'ye doğrudan eklenmez; yalnız izin verilen şirket slug'ları kabul edilir. */
const PRIVATE_COMPANY_SLUGS = new Set([
  'openai','waymo','stripe','revolut','xai','anthropic','bytedance','shein','canva','databricks'
]);
const PRIVATE_COMPANY_CACHE = new Map();
function privateReaderGet(url){
  return new Promise((resolve, reject) => {
    const rq=https.get(url, { headers:{
      'User-Agent':'Mozilla/5.0',
      'Accept':'text/plain',
      'Accept-Language':'en-US,en;q=0.9'
    }}, pr => {
      let body='';
      pr.setEncoding('utf8');
      pr.on('data', c => { if(body.length < 900000) body += c; });
      pr.on('end', () => resolve({ status:pr.statusCode||0, body }));
    });
    rq.setTimeout(18000, () => rq.destroy(new Error('timeout')));
    rq.on('error', reject);
  });
}
function privateLineValue(md,label){
  const esc=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=md.match(new RegExp(esc+'\\s*([^\\n]+)','i'));
  return m ? m[1].trim().replace(/^[:\-–—\s]+/,'') : null;
}
function privateSection(md,heading){
  const esc=heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const hit=new RegExp('^##\\s+'+esc+'(?:\\s+[^\\n]*)?\\r?$','im').exec(String(md||''));
  if(!hit) return '';
  const rest=String(md).slice(hit.index+hit[0].length).replace(/^\\r?\\n/,'');
  const next=rest.search(/^##\\s+/m);
  return (next<0?rest:rest.slice(0,next)).trim();
}
function privateTrendValue(block,noun){
  const m=String(block||'').match(/\(([-+]?\d+(?:\.\d+)?%)\)/);
  if(!m) return null;
  let pct=m[1];
  if(!/^[+-]/.test(pct)){
    if(/increased|growing|growth/i.test(block)) pct='+'+pct;
    else if(/decreased|declined|shrinking/i.test(block)) pct='-'+pct;
  }
  return pct+' '+noun;
}
function privateNormalizedTrend(value,block,noun){
  let s=String(value||'').trim();
  if(!s) return privateTrendValue(block,noun);
  if(!/^[+\-−]/.test(s)){
    if(/decreased|declined|shrinking/i.test(block)) s='-'+s;
    else s='+'+s;
  }
  return new RegExp('\\b'+noun+'\\b','i').test(s)?s:s+' '+noun;
}
function privateMetric(value){
  const s=String(value==null?'':value).trim();
  return !s||/^[\-–—―]+$/.test(s)?null:s;
}
function parsePrivateCompanyMarkdown(md,slug){
  const nameMatch=md.match(/^#\s+([^\n]+)$/m);
  const valuationBlock=privateSection(md,'Latest Estimated Valuation')||privateSection(md,'Estimated Valuation');
  const employeeBlock=privateSection(md,'Employee Trend');
  const socialBlock=privateSection(md,'Social Trend');
  const leadership=(md.match(/Key Executives\s*\n([\s\S]*?)\nCurrent Number of Employees/i)||[])[1]||'';
  const executives=leadership.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,8);
  const clientsBlock=privateSection(md,'Main Enterprise Clients');
  const clients=[];
  const clientRe=/\[([^\]]+)\]\(https?:\/\/www\.tipranks\.com\/stocks\//g;
  let cm;
  while((cm=clientRe.exec(clientsBlock)) && clients.length<5){
    const n=cm[1].trim(); if(n && !clients.includes(n)) clients.push(n);
  }
  const published=(md.match(/^Published Time:\s*([^\n]+)$/mi)||[])[1]||null;
  const descriptionBlock=(md.match(/^#\s+[^\n]+[\s\S]*?\n\[([^\]]+)\]\(http:\/\/www\.tipranks\.com\/private-companies\/sector\/[^)]+\)\s*\n\n([^\n]+)/m)||[]);
  const workforceTrend=privateNormalizedTrend(privateLineValue(md,'Workforce Trend'),employeeBlock,'employees');
  const linkedInTrend=privateNormalizedTrend(privateLineValue(md,'LinkedIn Trend'),socialBlock,'followers');
  let momentum=(md.match(/## Company Momentum\s+([^\n]+)/i)||[])[1]||null;
  if(!momentum && (workforceTrend||linkedInTrend)){
    const vals=[workforceTrend,linkedInTrend].filter(Boolean);
    momentum=vals.every(x=>/^\+/.test(x))?'Positive':(vals.every(x=>/^-/.test(x))?'Negative':'Neutral');
  }
  return {
    ok:true,
    slug,
    name:nameMatch?nameMatch[1].trim():slug,
    sector:descriptionBlock[1]||null,
    description:descriptionBlock[2]||null,
    valuation:privateMetric(privateLineValue(valuationBlock,'Estimated Valuation')),
    totalRaised:privateMetric(privateLineValue(valuationBlock,'Total Amount Raised')),
    fundingRounds:privateMetric(privateLineValue(valuationBlock,'Total Funding Rounds')),
    latestFunding:privateMetric(privateLineValue(valuationBlock,'Latest Funding Amount')),
    latestRound:privateMetric(privateLineValue(valuationBlock,'Latest Funding Round')),
    postMoney:privateMetric(privateLineValue(valuationBlock,'Post-Money Valuation')),
    employees:privateLineValue(md,'Current Number of Employees'),
    followers:privateLineValue(md,'Current LinkedIn Followers'),
    momentum,
    linkedInTrend,
    workforceTrend,
    executives,
    clients,
    published,
    source:'TipRanks',
    sourceUrl:'https://www.tipranks.com/private-companies/'+slug
  };
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
/* ABD ETF sektör anahtarları (Yahoo/TV) → Türkçe etiket */
const SECTOR_TR = {
  technology: 'Teknoloji', healthcare: 'Sağlık', financialservices: 'Finansal Hizmetler',
  financial_services: 'Finansal Hizmetler', financials: 'Finans', finance: 'Finans',
  consumercyclical: 'Tüketici (Döngüsel)', consumer_cyclical: 'Tüketici (Döngüsel)',
  consumerdefensive: 'Tüketici (Temel)', consumer_defensive: 'Tüketici (Temel)',
  consumerdiscretionary: 'Tüketici (İhtiyari)', consumerstaples: 'Tüketici (Temel)',
  communication_services: 'İletişim Hizmetleri', communicationservices: 'İletişim Hizmetleri',
  communication: 'İletişim', industrials: 'Sanayi', industrial: 'Sanayi', energy: 'Enerji',
  utilities: 'Kamu Hizmetleri', realestate: 'Gayrimenkul', real_estate: 'Gayrimenkul',
  basicmaterials: 'Temel Malzemeler', basic_materials: 'Temel Malzemeler', materials: 'Malzemeler',
  'electronic technology': 'Elektronik Teknoloji', 'technology services': 'Teknoloji Hizmetleri',
  'health technology': 'Sağlık Teknolojisi', 'health services': 'Sağlık Hizmetleri',
  'consumer services': 'Tüketici Hizmetleri', 'consumer durables': 'Dayanıklı Tüketim',
  'consumer non-durables': 'Dayanıksız Tüketim', 'retail trade': 'Perakende',
  'producer manufacturing': 'Üretici İmalat', 'process industries': 'Süreç Endüstrileri',
  'non-energy minerals': 'Enerji Dışı Mineraller', 'energy minerals': 'Enerji Mineralleri',
  'commercial services': 'Ticari Hizmetler', transportation: 'Ulaştırma',
  'distribution services': 'Dağıtım Hizmetleri', miscellaneous: 'Diğer',
  'health care': 'Sağlık', 'information technology': 'Bilişim', 'real estate': 'Gayrimenkul',
  'basic materials': 'Temel Malzemeler', 'consumer discretionary': 'Tüketici (İhtiyari)',
  'consumer staples': 'Tüketici (Temel)', 'communication services': 'İletişim Hizmetleri',
  telecommunications: 'Telekomünikasyon', other: 'Diğer', cash: 'Nakit'
};
function trSectorLabel(name) {
  if (name == null || name === '') return '—';
  const raw = String(name).trim();
  const lower = raw.toLowerCase();
  const spaced = lower.replace(/[_/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = spaced.replace(/[\s\-]+/g, '');
  return SECTOR_TR[lower] || SECTOR_TR[spaced] || SECTOR_TR[compact] || raw;
}
function localizeSectorWeightings(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => {
    if (!item || typeof item !== 'object') return item;
    if (item.sector != null) {
      return Object.assign({}, item, { sector: trSectorLabel(item.sector) });
    }
    const k = Object.keys(item)[0];
    if (k == null) return item;
    const v = yahooUnwrap(item[k]);
    const o = {};
    o[trSectorLabel(k)] = v;
    return o;
  });
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
let KAP_OID_CACHE = { at: 0, map: null };          // BIST kod → mkkMemberOid
let KAP_FLOAT_CACHE = new Map();                   // HISSE → { at, data }
let FONO_HOLD_CACHE = new Map(); // code -> {at, holdings}
let TEFAS_TOP_HOLD_CACHE = { at: 0, date: '', funds: null, ver: 0 };
const TEFAS_TOP_HOLD_VER = 3; // hızlı liste (Fonoloji tarama yok)
/* İş Portföy hisse fonları — çoğu Fonoloji'de varlık listesi yayınlar */
const IS_PORTFOY_HISSE = ['TI2', 'TTE', 'TIE', 'TAU', 'TI3', 'IHK', 'BIO', 'IDH', 'IML', 'KPH', 'IHT', 'TIL', 'NST'];

function tefasYmd(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}
function tefasRecentDates(n) {
  const out = [];
  const d = new Date();
  let guard = 0;
  while (out.length < n && guard < n + 20) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(tefasYmd(d)); // hafta sonu boş gelir
    d.setDate(d.getDate() - 1);
    guard++;
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
function httpsPostJson(urlStr, bodyObj, headers, timeoutMs) {
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
    preq.setTimeout(timeoutMs || 15000, () => { preq.destroy(new Error('tefas_timeout')); });
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
async function tefasTryDate(kind, ymd, fundCode) {
  const body = tefasBody(kind, ymd, fundCode);
  const [infoRes, distRes] = await Promise.all([
    httpsPostJson(TEFAS_INFO_URL, body, TEFAS_HDR, 12000),
    httpsPostJson(TEFAS_DIST_URL, body, TEFAS_HDR, 12000).catch(() => ({ json: {} }))
  ]);
  const rows = (infoRes.json && infoRes.json.resultList) || [];
  if (!rows.length) return null;
  const distRows = (distRes.json && distRes.json.resultList) || [];
  return { date: ymd, info: rows, dist: distRows };
}
async function tefasFetchDay(kind, fundCode) {
  const cacheKey = kind + '|' + (fundCode || '*');
  if (!fundCode && TEFAS_CACHE.key === cacheKey && TEFAS_CACHE.pack && (Date.now() - TEFAS_CACHE.at) < 10 * 60 * 1000) {
    return TEFAS_CACHE.pack;
  }
  // Tek fon için tüm liste cache'i varsa oradan süz (TEFAS'a tekrar gitme)
  if (fundCode && TEFAS_CACHE.key === kind + '|*' && TEFAS_CACHE.pack && (Date.now() - TEFAS_CACHE.at) < 10 * 60 * 1000) {
    const pack = TEFAS_CACHE.pack;
    const info = (pack.info || []).filter(f => String(f.fonKodu || '').toUpperCase() === fundCode);
    if (info.length) {
      const dist = (pack.dist || []).filter(f => String(f.fonKodu || '').toUpperCase() === fundCode);
      return { date: pack.date, info, dist };
    }
  }
  const dates = tefasRecentDates(8);
  // En yeni 3 iş gününü paralel dene → ilk dolu paketi al
  for (let i = 0; i < dates.length; i += 3) {
    const batch = dates.slice(i, i + 3);
    const results = await Promise.all(batch.map(ymd => tefasTryDate(kind, ymd, fundCode).catch(() => null)));
    for (const pack of results) {
      if (!pack) continue;
      if (!fundCode) TEFAS_CACHE = { key: cacheKey, at: Date.now(), pack };
      return pack;
    }
  }
  return null;
}

/* KAP fiili dolaşım — şirket genel sayfasındaki MKK güncel tutar/oran (formül yok). */
function parseKapTrNum(s) {
  if (s == null || s === '') return null;
  const t = String(s).trim().replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function buildKapOidMap(html) {
  const unesc = String(html || '').replace(/\\"/g, '"');
  const map = Object.create(null);
  const add = (oid, codes) => {
    if (!oid) return;
    String(codes || '').split(/[,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
      .forEach(c => { map[c] = oid; });
  };
  const re = /\{[^{}]*"mkkMemberOid":"([^"]+)"[^{}]*"stockCode":"([^"]+)"[^{}]*\}/g;
  const re2 = /\{[^{}]*"stockCode":"([^"]+)"[^{}]*"mkkMemberOid":"([^"]+)"[^{}]*\}/g;
  let m;
  while ((m = re.exec(unesc))) add(m[1], m[2]);
  while ((m = re2.exec(unesc))) add(m[2], m[1]);
  return map;
}
async function kapBistOidMap() {
  if (KAP_OID_CACHE.map && (Date.now() - KAP_OID_CACHE.at) < 12 * 60 * 60 * 1000) {
    return KAP_OID_CACHE.map;
  }
  const page = await httpsGetText('https://www.kap.org.tr/tr/bist-sirketler', {
    'User-Agent': BUA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9'
  });
  const map = buildKapOidMap(page.body || '');
  if (Object.keys(map).length) KAP_OID_CACHE = { at: Date.now(), map };
  return KAP_OID_CACHE.map || map;
}
function extractKapFloatFromHtml(html, hisse) {
  const code = String(hisse || '').toUpperCase();
  const parseArr = (raw) => {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return null;
    const row = arr.find(x => String(x.isin || '').toUpperCase().split(/[,;]+/)
      .map(s => s.trim()).includes(code)) || arr[0];
    return {
      symbol: code,
      floatShares: parseKapTrNum(row.actualSharesOutstanding),
      floatPct: parseKapTrNum(row.actualOutstandingSharesRatio),
      asOf: row.creationDate || null,
      oid: row.mkkMemberOid || null,
      source: 'kap'
    };
  };
  const esc = html.match(/\\"itemKey\\":\\"kpy41_acc5_fiili_dolasimdaki_pay\\",\\"value\\":(\[[\s\S]*?\])/);
  if (esc) {
    try { return parseArr(esc[1].replace(/\\"/g, '"')); } catch (e) { /* fall through */ }
  }
  const plain = html.match(/"itemKey":"kpy41_acc5_fiili_dolasimdaki_pay","value":(\[[\s\S]*?\])/);
  if (plain) {
    try { return parseArr(plain[1]); } catch (e) { /* fall through */ }
  }
  return null;
}
async function kapFloatShares(hisse) {
  const sym = String(hisse || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!sym) return null;
  const hit = KAP_FLOAT_CACHE.get(sym);
  if (hit && (Date.now() - hit.at) < 60 * 60 * 1000) return hit.data;
  const map = await kapBistOidMap();
  const oid = map && map[sym];
  if (!oid) {
    const miss = { symbol: sym, floatShares: null, floatPct: null, asOf: null, source: 'kap', error: 'oid' };
    KAP_FLOAT_CACHE.set(sym, { at: Date.now(), data: miss });
    return miss;
  }
  const page = await httpsGetText('https://www.kap.org.tr/tr/sirket-bilgileri/genel/' + encodeURIComponent(oid), {
    'User-Agent': BUA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9',
    'Referer': 'https://www.kap.org.tr/tr/bist-sirketler'
  });
  const data = extractKapFloatFromHtml(page.body || '', sym) || {
    symbol: sym, floatShares: null, floatPct: null, asOf: null, oid, source: 'kap', error: 'parse'
  };
  KAP_FLOAT_CACHE.set(sym, { at: Date.now(), data });
  return data;
}

/* ---------- BorsaCaddesi AKD / aracı kurum dağılımı (ücretsiz, güncel) ---------- */
const BC_AKD_CACHE = new Map(); // SYM -> { at, data }
function bcStripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
function bcParseAkdStats(text) {
  const t = String(text || '');
  const num = (s) => {
    if (s == null) return null;
    const n = Number(String(s).replace(/\./g, '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const net = t.match(/Net:\s*([-\d.\s]+)\s*adet/i);
  const total = t.match(/Toplam\s*Adet:\s*([\d.\s]+)/i);
  const top5 = t.match(/Net\s*İlk\s*5:\s*([-\d.\s]+)\s*adet/i);
  const top5Note = t.match(/Net\s*İlk\s*5:\s*[-\d.\s]+\s*adet\s+([^.]{3,80}?)(?:\.\s|Trend|Yasal|$)/i);
  return {
    netLots: net ? num(net[1]) : null,
    totalLots: total ? num(total[1]) : null,
    top5NetLots: top5 ? num(top5[1]) : null,
    top5Note: top5Note ? top5Note[1].replace(/\s+/g, ' ').trim() : null
  };
}

/* AKD tabloları yalnızca PNG olarak yayınlanır → OCR ile Alım/Satım satırları */
const BC_OCR_CACHE = new Map(); // imageUrl -> { at, data }
let _bcTessWorker = null;
let _bcTessLock = Promise.resolve();
function bcPngSize(buf) {
  if (!buf || buf.length < 24 || buf[0] !== 0x89) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function bcParseTrNum(s, asLots) {
  const t = String(s || '').trim().replace(/\s/g, '');
  if (!t || !/^\d/.test(t)) return null;
  // OCR eksik binlik noktası: 1.378629 → 1378629
  if (asLots && /^\d{1,3}\.\d{6,}$/.test(t)) return Number(t.replace(/\./g, ''));
  if (/^\d{1,3}(\.\d{3}){2,}$/.test(t)) return Number(t.replace(/\./g, ''));
  if (/^\d{1,3}\.\d{3}$/.test(t)) {
    if (asLots) return Number(t.replace(/\./g, ''));
    const asDec = Number(t);
    if (asDec >= 40 && asDec <= 50000) return asDec;
    return Number(t.replace(/\./g, ''));
  }
  if (/^\d+[.,]\d{1,4}$/.test(t)) return Number(t.replace(',', '.'));
  if (/^\d+$/.test(t)) return Number(t);
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
/** 29708→297.08, 296461→296.461, 297.078→297.078 */
function bcGuessPrice(raw) {
  const t = String(raw || '').trim().replace(/\s/g, '');
  if (!t) return null;
  if (/^\d+[.,]\d{1,4}$/.test(t)) {
    const p = Number(t.replace(',', '.'));
    return p >= 40 && p <= 20000 ? p : null;
  }
  if (/^\d{1,3}\.\d{3}$/.test(t)) {
    const p = Number(t);
    return p >= 40 && p <= 20000 ? p : null;
  }
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (t.length === 5) {
    const p = n / 100;
    if (p >= 40 && p <= 2000) return Math.round(p * 100) / 100;
  }
  if (t.length === 6) {
    const p = n / 1000;
    if (p >= 40 && p <= 2000) return Math.round(p * 1000) / 1000;
  }
  return null;
}
/** OCR birleşmesi: "14297349" → pct 14 + fiyat 297.349 (yalnızca düz rakam) */
function bcSplitPctPrice(raw) {
  const t = String(raw || '').trim();
  if (!/^\d{7,9}$/.test(t)) return null;
  for (const pctLen of [2, 1]) {
    const pct = Number(t.slice(0, pctLen));
    const rest = t.slice(pctLen);
    if (!(pct >= 1 && pct <= 100)) continue;
    let price = null;
    if (rest.length === 6) price = Number(rest) / 1000;
    else if (rest.length === 5) price = Number(rest) / 100;
    if (price != null && price >= 40 && price <= 5000) {
      return { pct, price: Math.round(price * 1000) / 1000 };
    }
  }
  return null;
}
function bcFixBrokerName(raw) {
  let t = String(raw || '').toUpperCase()
    .replace(/İ/g, 'I').replace(/ı/g, 'I').replace(/Ğ/g, 'G').replace(/Ü/g, 'U')
    .replace(/Ş/g, 'S').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/^(BI|BL|EI|IE|IT|NI|SI|TE|CE|EE|NL|IG|I)\s+/, '');
  t = t.replace(/^\d+\s+/, '');
  if (/^(DIGER|DI GER|IGER|OTHER)\b/.test(t)) return 'DİĞER';
  const map = [
    [/^ONB\b|^QNB\b/, 'QNB YATIRIM'],
    [/^HSBC\b/, 'HSBC YATIRIM'],
    [/^TEB\b/, 'TEB YATIRIM'],
    [/^BANK[\s\-]*OF[\s\-]*AMERICA/, 'BANK OF AMERICA'],
    [/^YAPI[\s\-]*KREDI/, 'YAPI KREDI'],
    [/^LOBAL\b|^GLOBAL\b/, 'GLOBAL MENKUL'],
    [/^ALK\b|^HALK\b/, 'HALK YATIRIM'],
    [/^ARANTI\b|^GARANTI\b/, 'GARANTI BBVA'],
    [/^UVEYT|^KUVEYT/, 'KUVEYT TÜRK'],
    [/^S\s*YATIRIM|^IS\s*YATIRIM|^ISYATIRM/, 'İŞ YATIRIM'],
    [/^YATIRIM[\s\-]*FINANS/, 'YATIRIM FİNANSMAN'],
    [/^YATIRIM$/, 'İŞ YATIRIM'],
    [/^AK[\s\-]*YAT/, 'AK YATIRIM'],
    [/^INFO\b/, 'INFO YATIRIM'],
    [/^MIDAS\b/, 'MIDAS MENKUL'],
    [/^ZIRAAT|^ZRAAT/, 'ZİRAAT YATIRIM'],
    [/^VAKIF/, 'VAKIF YATIRIM'],
    [/^DENIZ|^DENZ/, 'DENİZ YATIRIM'],
    [/^OSMANLI/, 'OSMANLI YATIRIM'],
    [/^TACIRLER|^TACRLER/, 'TACİRLER YATIRIM'],
    [/^COLENDI/, 'COLENDİ MENKUL'],
    [/^OYAK\b/, 'OYAK YATIRIM'],
    [/^TERA\b/, 'TERA YATIRIM']
  ];
  for (const [re, name] of map) {
    if (re.test(t)) return name;
  }
  return t.slice(0, 36) || null;
}
function bcParseBrokerSide(text) {
  const rows = [];
  for (const line0 of String(text || '').split(/\n/)) {
    let line = line0.replace(/[\[\]|{}~]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    line = line.replace(/^(?:[\dIOBEl]{1,3}\s+)+(?=[A-Z])/i, '');
    const matches = [...line.matchAll(/(\d{1,3}\.\d{6,}|\d{1,3}(?:\.\d{3})+|\d+[.,]\d{1,4}|\d{4,}|\b\d{1,3}\b)/g)];
    if (matches.length < 2) continue;
    const first = matches[0];
    let name = bcFixBrokerName(line.slice(0, first.index));
    if (!name || name.length < 2) continue;
    if (/ADET|MALIYET|TOPLAM|KURUM|SATAN|NET\b|TK[S%]|MALET|SELAN/i.test(name)) continue;
    let lots = bcParseTrNum(first[1], true);
    let used = 1;
    if (lots != null && lots < 100000 && matches[1] && /^\d{3}$/.test(matches[1][1])) {
      lots = lots * 1000 + Number(matches[1][1]);
      used = 2;
    }
    if (!(lots > 500) && name !== 'DİĞER') continue;
    if (!(lots > 50) && name === 'DİĞER') continue;
    const toks = matches.slice(used).map(m => m[1]);
    let pct = null;
    let price = null;
    let total = null;
    const priceIdx = new Set();

    for (let i = 0; i < toks.length; i++) {
      const raw = toks[i];
      const split = bcSplitPctPrice(raw);
      if (split && pct == null && price == null) {
        pct = split.pct;
        price = split.price;
        priceIdx.add(i);
        continue;
      }
      const nAny = bcParseTrNum(raw, false);
      if (pct == null && nAny != null && nAny > 0 && nAny <= 100 && /^\d{1,3}$/.test(raw)) {
        pct = nAny;
        continue;
      }
      if (price == null) {
        if (/^\d+[.,]\d{1,2}$/.test(raw) || (/^\d+[.,]\d{3}$/.test(raw) && Number(String(raw).replace(',', '.')) < 800)) {
          const p = bcGuessPrice(raw);
          if (p != null) { price = p; priceIdx.add(i); continue; }
        }
        // 293518 gibi yapışık maliyet: yalnızca sonrasında ayrı bir toplam varsa
        if (/^\d{6}$/.test(raw)) {
          const p = bcGuessPrice(raw);
          if (p != null && p <= 800) {
            const laterTot = toks.slice(i + 1).some(t => {
              if (/^\d{1,3}$/.test(t)) return false;
              const v = bcParseTrNum(t, true);
              return v != null && v >= 1000 && v !== Number(raw);
            });
            if (laterTot) { price = p; priceIdx.add(i); continue; }
          }
        }
      }
    }
    const totCandidates = [];
    for (let i = 0; i < toks.length; i++) {
      if (priceIdx.has(i)) continue;
      const raw = toks[i];
      if (bcSplitPctPrice(raw)) continue;
      if (/^\d{1,3}$/.test(raw)) continue;
      if (/^\d+[.,]\d{1,2}$/.test(raw)) continue;
      if (price != null && /^\d+[.,]\d{3}$/.test(raw) && Math.abs(Number(String(raw).replace(',', '.')) - price) < 0.01) continue;
      if (price != null && /^\d{6}$/.test(raw) && Math.round(price * 1000) === Number(raw)) continue;
      let v = bcParseTrNum(raw, true);
      if (v != null && v < 100000 && /^\d{3}$/.test(raw) && i > 0 && /^\d{1,3}\.\d{3}$/.test(toks[i - 1] || '')) {
        v = bcParseTrNum(toks[i - 1], true) * 1000 + Number(raw);
      }
      if (v != null && v >= 1000) totCandidates.push(v);
    }
    if (totCandidates.length) total = totCandidates[totCandidates.length - 1];
    rows.push({ name, lots, pct, price, total });
  }
  const seen = new Set();
  const out = rows.filter(r => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  }).slice(0, 8);

  // Tek satırda % kaçmışsa: diğerlerinin toplamından tamamla
  const withPct = out.filter(r => r.pct != null && r.name !== 'DİĞER');
  const missingPct = out.filter(r => r.pct == null && r.name !== 'DİĞER');
  const pctSum = withPct.reduce((s, r) => s + r.pct, 0);
  if (missingPct.length === 1 && pctSum > 0 && pctSum < 100) {
    const dig = out.find(r => r.name === 'DİĞER' && r.pct != null);
    const rem = 100 - pctSum - (dig ? dig.pct : 0);
    if (rem >= 1 && rem <= 80) missingPct[0].pct = Math.round(rem);
  }
  // Hâlâ boşsa lot payından kabaca doldur
  const need = out.filter(r => r.pct == null && r.lots > 0);
  if (need.length) {
    const base = out.filter(r => r.lots > 0);
    const sum = base.reduce((s, r) => s + r.lots, 0);
    if (sum > 0) {
      for (const r of need) r.pct = Math.max(1, Math.round((r.lots / sum) * 100));
    }
  }
  return out;
}
async function bcGetTessWorker() {
  if (_bcTessWorker) return _bcTessWorker;
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker('eng');
  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  _bcTessWorker = worker;
  return worker;
}
async function bcOcrAkdTables(imageUrl) {
  const url = String(imageUrl || '').trim();
  if (!/^https:\/\/img\.borsacaddesi\.com\//i.test(url)) {
    return { buyers: [], sellers: [], ok: false, error: 'bad_image_host' };
  }
  const cacheKey = 'v8:' + url;
  const hit = BC_OCR_CACHE.get(cacheKey);
  if (hit && (Date.now() - hit.at) < 6 * 60 * 60 * 1000) return hit.data;

  const run = async () => {
    const img = await httpsGetBuf(url, {
      'User-Agent': BUA,
      Accept: 'image/png,image/*',
      Referer: 'https://borsacaddesi.com/'
    });
    if (!img.buf || img.status >= 400) throw new Error('image_fetch');
    const size = bcPngSize(img.buf);
    if (!size || size.w < 200 || size.h < 200) throw new Error('bad_png');
    const worker = await bcGetTessWorker();
    const left = {
      left: 0,
      top: Math.floor(size.h * 0.24),
      width: Math.floor(size.w * 0.36),
      height: Math.floor(size.h * 0.28)
    };
    const mid = {
      left: Math.floor(size.w * 0.33),
      top: Math.floor(size.h * 0.24),
      width: Math.floor(size.w * 0.35),
      height: Math.floor(size.h * 0.28)
    };
    const [L, M] = await Promise.all([
      worker.recognize(img.buf, { rectangle: left }),
      worker.recognize(img.buf, { rectangle: mid })
    ]);
    let buyers = bcParseBrokerSide(L.data && L.data.text);
    let sellers = bcParseBrokerSide(M.data && M.data.text);
    if (buyers.length < 4 || sellers.length < 3) {
      const wide = {
        left: 0,
        top: Math.floor(size.h * 0.24),
        width: Math.floor(size.w * 0.68),
        height: Math.floor(size.h * 0.28)
      };
      const W = await worker.recognize(img.buf, { rectangle: wide });
      const all = bcParseBrokerSide(W.data && W.data.text);
      // Geniş tarama satırları karışabilir; eksik tarafı tamamla
      if (buyers.length < 4) {
        const extra = all.filter(r => !buyers.some(b => b.name === r.name));
        buyers = buyers.concat(extra).slice(0, 8);
      }
    }
    const data = {
      buyers,
      sellers,
      ok: buyers.length + sellers.length >= 3,
      imageW: size.w,
      imageH: size.h
    };
    BC_OCR_CACHE.set(cacheKey, { at: Date.now(), data });
    return data;
  };

  const p = _bcTessLock.then(run, run);
  _bcTessLock = p.catch(() => {});
  try {
    return await p;
  } catch (e) {
    const fail = { buyers: [], sellers: [], ok: false, error: e.message || 'ocr' };
    BC_OCR_CACHE.set(cacheKey, { at: Date.now(), data: fail });
    return fail;
  }
}
async function bcEnrichAkdItem(item) {
  // Tam tablo görsel olarak gösterilir (/bistakdimg); OCR'a gerek yok
  return item;
}

const BC_IMG_CACHE = new Map(); // key -> { at, buf, ctype }
function bcRgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}
function bcThemeAkdPng(buf) {
  let PNG;
  try { PNG = require('pngjs').PNG; } catch (_e) { return null; }
  let png;
  try { png = PNG.sync.read(buf); } catch (_e) { return null; }
  const data = png.data;

  const BG     = [10, 13, 26];
  const SURF   = [17, 23, 38];
  const SURF2  = [22, 30, 48];
  const SURF3  = [30, 41, 63];
  const INK    = [234, 240, 250];
  const INK2   = [190, 200, 218];
  const MUTED  = [130, 145, 170];
  const LINE   = [35, 46, 72];
  const ACCENT = [79, 156, 249];
  const ACCENT2= [108, 176, 255];
  const GOOD   = [52, 211, 154];
  const GOOD2  = [40, 180, 130];
  const BAD    = [240, 106, 114];
  const BAD2   = [220, 80, 90];
  const WARN   = [243, 180, 78];
  const GOLD   = [214, 173, 69];

  const set = (i, c) => { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; };
  const mix = (a, b, t) => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
  const greyRamp = (l) => {
    if (l >= 0.93) return BG;
    if (l >= 0.82) return SURF;
    if (l >= 0.70) return SURF2;
    if (l >= 0.58) return SURF3;
    if (l >= 0.45) return LINE;
    if (l >= 0.32) return MUTED;
    if (l >= 0.16) return INK2;
    return INK;
  };
  const hueTheme = (h, vivid) => {
    const deg = ((h % 1) + 1) % 1 * 360;
    if (deg < 35 || deg >= 330) return vivid ? BAD : BAD2;
    if (deg < 70) return WARN;
    if (deg < 100) return GOLD;
    if (deg < 165) return vivid ? GOOD : GOOD2;
    if (deg < 200) return mix(GOOD, ACCENT, 0.45);
    if (deg < 255) return vivid ? ACCENT2 : ACCENT;
    if (deg < 295) return mix(ACCENT, BAD, 0.3);
    return BAD;
  };

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const { h, s, l } = bcRgbToHsl(r, g, b);

    // Düz gri → tema yüzey / metin (yüksek kontrast)
    if (s < 0.10) {
      set(i, greyRamp(l));
      continue;
    }

    const vivid = s > 0.35 && l > 0.2 && l < 0.85;
    const theme = hueTheme(h, vivid);

    // Pasta dilimi / doygun renk: temanın canlı hali
    if (s >= 0.28 && l >= 0.25 && l <= 0.78) {
      if (l > 0.62) set(i, mix(SURF3, theme, 0.78));
      else if (l > 0.45) set(i, theme);
      else set(i, mix(theme, BG, 0.12));
      continue;
    }

    // Açık pastel hücre / dilim kenarı
    if (l >= 0.75) {
      set(i, mix(SURF2, theme, 0.38 + Math.min(0.35, s)));
      continue;
    }
    if (l >= 0.55) {
      set(i, mix(SURF3, theme, 0.55 + Math.min(0.3, s)));
      continue;
    }
    if (l >= 0.30) {
      set(i, mix(mix(SURF3, theme, 0.65), theme, 0.4));
      continue;
    }
    set(i, mix(BG, theme, 0.7));
  }
  try { return PNG.sync.write(png); } catch (_e) { return null; }
}
async function bcThemedAkdImage(imageUrl) {
  const url = String(imageUrl || '').trim();
  if (!/^https:\/\/img\.borsacaddesi\.com\//i.test(url)) return null;
  // Orijinal renkler — tema boyaması yok
  const cacheKey = 'orig-v1:' + url;
  const hit = BC_IMG_CACHE.get(cacheKey);
  if (hit && (Date.now() - hit.at) < 6 * 60 * 60 * 1000) return hit;

  const img = await httpsGetBuf(url, {
    'User-Agent': BUA,
    Accept: 'image/png,image/*',
    Referer: 'https://borsacaddesi.com/'
  });
  if (!img.buf || img.status >= 400) return null;
  const out = {
    at: Date.now(),
    buf: img.buf,
    ctype: 'image/png',
    themed: false
  };
  BC_IMG_CACHE.set(cacheKey, out);
  return out;
}
function bcAkdKind(title, slug, tags) {
  const t = ((title || '') + ' ' + (slug || '')).toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
  const tagSlugs = (tags || []).map(x => String((x && (x.slug || x.title)) || '').toLowerCase());
  if (/\btakas\b/.test(t) || tagSlugs.some(s => s.includes('takas'))) return 'takas';
  if (/araci\s*kurum\s*dagilim/.test(t) || /araci-kurum-dagilimi/.test(slug || '')) return 'araci_kurum';
  if (/gun\s*sonu/.test(t) && /\bakd\b|araci/.test(t)) return 'gun_sonu_akd';
  if (/kim\s*aldi\s*kim\s*satti/.test(t)) return 'gun_ici_akd';
  if (/gun\s*ici/.test(t) && /\bakd\b|kurum\s*islem|araci/.test(t)) return 'gun_ici_akd';
  // Düz "Gün Sonu/İçi İşlemleri" (AKD değil) → atla
  if (/gun\s*sonu\s*islem/.test(t) && !/\bakd\b/.test(t)) return 'other';
  if (/gun\s*ici\s*islem/.test(t) && !/\bakd\b|araci/.test(t)) return 'other';
  if (tagSlugs.includes('hisse-akd')) {
    if (/gun\s*sonu/.test(t) && /\bakd\b/.test(t)) return 'gun_sonu_akd';
    if (/gun\s*ici/.test(t) && /\bakd\b|kim\s*aldi|araci/.test(t)) return 'gun_ici_akd';
  }
  return 'other';
}
function bcTimeMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e11 ? v : v * 1000;
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== '' && !/[^\d.]/.test(String(v).trim())) {
    return n > 1e11 ? n : (n > 1e9 ? n * 1000 : 0);
  }
  const p = Date.parse(v);
  return Number.isFinite(p) ? p : 0;
}
function bcPickLatest(list) {
  return (list || []).slice().sort((a, b) => {
    const ta = bcTimeMs(a.publishedAt || a.createdAt);
    const tb = bcTimeMs(b.publishedAt || b.createdAt);
    return tb - ta;
  })[0] || null;
}
function bcMapAkdArticle(a) {
  const title = a.title || '';
  const slug = a.slug || '';
  const tags = a.tags || [];
  const text = bcStripHtml(a.content || '');
  const stats = bcParseAkdStats(text);
  const kind = bcAkdKind(title, slug, tags);
  const summary = text
    .replace(/Trend İndikatörleri[\s\S]*$/i, '')
    .replace(/Yasal Uyarı:[\s\S]*$/i, '')
    .trim()
    .slice(0, 420);
  return {
    kind,
    title,
    slug,
    url: 'https://borsacaddesi.com/' + slug,
    image: a.coverImage || a.featuredImage || null,
    publishedAt: a.publishedAt || a.createdAt || a.updatedAt || null,
    createdAt: a.createdAt || null,
    stats,
    summary,
    tags: tags.map(t => (t && (t.slug || t.title)) || t).filter(Boolean)
  };
}
/** Search API artık boş category {} döndürüyor → makale HTML'den /category/slug çek */
async function bcResolveCategoryFromArts(sym, searchArts) {
  for (const a of searchArts || []) {
    const cat = a && a.category;
    if (cat && cat.slug) return { slug: cat.slug, name: cat.name || cat.title || null };
    const cats = a && a.categories;
    if (Array.isArray(cats) && cats[0] && cats[0].slug) {
      return { slug: cats[0].slug, name: cats[0].title || cats[0].name || null };
    }
  }
  const symL = String(sym || '').toLowerCase();
  const cand = (searchArts || []).find(a => {
    const slug = String((a && a.slug) || '').toLowerCase();
    const title = String((a && a.title) || '').toUpperCase();
    return slug.startsWith(symL + '-') || slug.includes('-' + symL + '-') || title.startsWith(String(sym).toUpperCase());
  }) || (searchArts || [])[0];
  if (!cand || !cand.slug) return null;
  try {
    const page = await httpsGetText('https://borsacaddesi.com/' + String(cand.slug).replace(/^\/+/, ''), {
      'User-Agent': BUA,
      Accept: 'text/html,application/xhtml+xml',
      Referer: 'https://borsacaddesi.com/'
    });
    const html = String((page && page.body) || '');
    const m = html.match(/\/category\/([a-z0-9][a-z0-9\-]{2,120})/i);
    if (m) return { slug: m[1], name: null };
  } catch (_e) { /* ignore */ }
  return null;
}
async function borsaCaddesiAkd(hisse, opts) {
  const sym = String(hisse || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const wantSlug = String((opts && opts.slug) || '').trim().replace(/^\/+/, '');
  const cacheKey = wantSlug ? sym + '::' + wantSlug : sym;
  const hit = BC_AKD_CACHE.get(cacheKey);
  if (hit && (Date.now() - hit.at) < 10 * 60 * 1000) return hit.data;

  const search = await httpsGetText('https://borsacaddesi.com/api/search?q=' + encodeURIComponent(sym), {
    'User-Agent': BUA, 'Accept': 'application/json', 'Referer': 'https://borsacaddesi.com/'
  });
  let searchJson = null;
  try { searchJson = JSON.parse(search.body || '{}'); } catch (_e) { searchJson = {}; }
  const searchArts = Array.isArray(searchJson.articles) ? searchJson.articles : [];
  if (!searchArts.length) {
    const miss = { ok: false, symbol: sym, error: 'not_found', source: 'borsacaddesi' };
    BC_AKD_CACHE.set(cacheKey, { at: Date.now(), data: miss });
    return miss;
  }

  const resolved = await bcResolveCategoryFromArts(sym, searchArts);
  let catSlug = resolved && resolved.slug;
  let catName = resolved && resolved.name;
  let rawArts = [];

  if (catSlug) {
    const cat = await httpsGetText('https://borsacaddesi.com/api/categories/' + encodeURIComponent(catSlug), {
      'User-Agent': BUA, 'Accept': 'application/json', 'Referer': 'https://borsacaddesi.com/category/' + encodeURIComponent(catSlug)
    });
    let catJson = null;
    try { catJson = JSON.parse(cat.body || '{}'); } catch (_e) { catJson = {}; }
    rawArts = (catJson.data && Array.isArray(catJson.data.articles)) ? catJson.data.articles : [];
    if (!catName && rawArts[0]) {
      const c0 = (rawArts[0].categories || [])[0];
      if (c0) catName = c0.title || c0.name || null;
    }
  }

  // Kategori boş / kırık olsa bile arama sonuçlarından devam et
  if (!rawArts.length) rawArts = searchArts;

  const bySlug = new Map();
  for (const a of rawArts) {
    const m = bcMapAkdArticle(a);
    if (m.kind === 'other' || !m.slug) continue;
    const prev = bySlug.get(m.slug);
    if (!prev || ((m.stats && m.stats.netLots != null) && !(prev.stats && prev.stats.netLots != null))) {
      bySlug.set(m.slug, m);
    }
  }
  for (const a of searchArts) {
    const m = bcMapAkdArticle(a);
    if (m.kind === 'other' || !m.slug || bySlug.has(m.slug)) continue;
    bySlug.set(m.slug, m);
  }
  const mapped = [...bySlug.values()];

  // Tek kayıt (Son kayıtlar tıklaması)
  if (wantSlug) {
    let art = mapped.find(a => a.slug === wantSlug);
    if (!art) {
      const fromSearch = searchArts.find(a => a && a.slug === wantSlug);
      if (fromSearch) art = bcMapAkdArticle(fromSearch);
    }
    if (!art || art.kind === 'gun_ici_akd' || art.kind === 'other') {
      const miss = { ok: false, symbol: sym, error: 'not_found', source: 'borsacaddesi' };
      BC_AKD_CACHE.set(cacheKey, { at: Date.now(), data: miss });
      return miss;
    }
    if (art.kind === 'gun_sonu_akd' || art.kind === 'araci_kurum' || art.kind === 'takas') {
      await bcEnrichAkdItem(art);
    }
    const one = {
      ok: true,
      symbol: sym,
      item: art,
      source: 'borsacaddesi'
    };
    BC_AKD_CACHE.set(cacheKey, { at: Date.now(), data: one });
    return one;
  }

  const byKind = {
    gun_sonu_akd: bcPickLatest(mapped.filter(a => a.kind === 'gun_sonu_akd')),
    araci_kurum: bcPickLatest(mapped.filter(a => a.kind === 'araci_kurum')),
    takas: bcPickLatest(mapped.filter(a => a.kind === 'takas'))
  };
  // Gün sonu yoksa aramada bulunan güncel kapak görselli yazıyı yedekle
  if (!byKind.gun_sonu_akd) {
    const fromSearch = searchArts.find(a => /gün\s*sonu.*akd|gun-sonu-akd/i.test((a.title || '') + ' ' + (a.slug || '')));
    if (fromSearch) {
      byKind.gun_sonu_akd = {
        kind: 'gun_sonu_akd',
        title: fromSearch.title,
        slug: fromSearch.slug,
        url: 'https://borsacaddesi.com/' + fromSearch.slug,
        image: fromSearch.featuredImage || null,
        publishedAt: fromSearch.publishedAt || fromSearch.createdAt || null,
        createdAt: fromSearch.createdAt || null,
        stats: { netLots: null, totalLots: null, top5NetLots: null, top5Note: null },
        summary: '',
        tags: []
      };
    }
  }

  // Kapak görseli uygulama temasında /bistakdimg ile gösterilir (OCR yok → hızlı)
  // enrichList kaldırıldı

  const recentKinds = new Set(['gun_sonu_akd', 'araci_kurum', 'takas']);
  const data = {
    ok: true,
    symbol: sym,
    category: { slug: catSlug, name: catName },
    latest: byKind,
    recent: mapped
      .filter(a => recentKinds.has(a.kind))
      .slice()
      .sort((a, b) => bcTimeMs(b.publishedAt || b.createdAt) - bcTimeMs(a.publishedAt || a.createdAt))
      .slice(0, 16)
      .map(a => ({
        kind: a.kind,
        title: a.title,
        slug: a.slug,
        publishedAt: a.publishedAt
      })),
    source: 'borsacaddesi',
    note: 'Tam AKD tablosu uygulama temasında gösterilir. Yatırım tavsiyesi değildir.'
  };
  BC_AKD_CACHE.set(cacheKey, { at: Date.now(), data });
  return data;
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

function httpsGetTextTimeout(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: headers || {} }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => resolve({ status: pr.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 8000, () => {
      req.destroy(new Error('http_timeout'));
    });
  });
}
/* Fonoloji kamu sayfasından hisse ağırlıkları (KAP portföy raporundan) */
async function fonolojiHoldings(code) {
  const c = String(code || '').toUpperCase();
  const hit = FONO_HOLD_CACHE.get(c);
  const ttl = hit && hit.holdings && hit.holdings.length ? 6 * 60 * 60 * 1000 : 10 * 60 * 1000;
  if (hit && (Date.now() - hit.at) < ttl) return hit.holdings;
  let page;
  try {
    page = await httpsGetTextTimeout('https://fonoloji.com/fon/' + encodeURIComponent(c), {
      'User-Agent': BUA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'tr-TR,tr;q=0.9'
    }, 8000);
  } catch (_e) {
    FONO_HOLD_CACHE.set(c, { at: Date.now(), holdings: [] });
    return [];
  }
  if (!page || page.status !== 200 || !page.body) {
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
/** Arka planda sık tıklanan fonların varlık cache'ini ısıt (yanıtı bekletmez) */
function warmTefasHoldings(codes) {
  const list = [...new Set((codes || []).map(c => String(c || '').toUpperCase()).filter(Boolean))].slice(0, 12);
  (async () => {
    for (let i = 0; i < list.length; i += 4) {
      const batch = list.slice(i, i + 4);
      await Promise.all(batch.map(c => fonolojiHoldings(c).catch(() => [])));
    }
  })().catch(() => {});
}

/* KAP hisse senedi fonları — TEFAS büyüklük listesi (Fonoloji taraması YOK → hızlı) */
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
  const prefer = new Set(IS_PORTFOY_HISSE);
  const hsList = [...byCode.values()]
    .filter(f => {
      if (!(f.aum > 0)) return false;
      if (hsCodes.size) return hsCodes.has(f.code) || prefer.has(f.code);
      return prefer.has(f.code) || /H[İI]SSE\s*SENED[İI]/i.test(f.name) || f.stockPct >= 40;
    })
    .sort((a, b) => b.aum - a.aum);

  const funds = hsList.slice(0, limit);
  TEFAS_TOP_HOLD_CACHE = {
    at: Date.now(),
    date: pack.date,
    funds,
    scanned: 0,
    ver: TEFAS_TOP_HOLD_VER
  };
  // Detay tıklamaları için arka planda ısıt
  warmTefasHoldings([
    ...IS_PORTFOY_HISSE,
    ...funds.slice(0, 8).map(f => f.code)
  ]);
  return { date: pack.date, funds, scanned: 0 };
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

/* Investing.com hisse forumu: investpy (ülke+sembol→slug) → API → arama yedeği */
const INV_FORUM_CACHE = Object.create(null);
const INV_EXCH_HINT = {
  DE: /Xetra|Frankfurt|Germany/i, L: /London|UK|United Kingdom/i, PA: /Paris|France/i,
  AS: /Amsterdam|Netherlands/i, BR: /Brussels|Belgium/i, MI: /Milan|Italy/i,
  MC: /Madrid|Spain/i, SW: /Switzerland|SIX/i, ST: /Stockholm|Sweden/i,
  CO: /Copenhagen|Denmark/i, OL: /Oslo|Norway/i, HE: /Helsinki|Finland/i,
  TO: /Toronto|Canada/i, V: /TSX|Canada|Venture/i, TW: /Taiwan/i, T: /Tokyo|Japan/i,
  HK: /Hong Kong/i, AX: /Australia|ASX/i, SI: /Singapore/i, KS: /Korea|KOSPI|Seoul/i,
  KQ: /KOSDAQ|Korea/i, IS: /Istanbul|Turkey/i
};
const INV_COUNTRY = {
  US: 'united states', BIST: 'turkey',
  DE: 'germany', L: 'united kingdom', PA: 'france', AS: 'netherlands', BR: 'belgium',
  MI: 'italy', MC: 'spain', SW: 'switzerland', ST: 'sweden', CO: 'denmark', OL: 'norway',
  HE: 'finland', VI: 'austria', AT: 'austria', LS: 'portugal', IR: 'ireland',
  TO: 'canada', V: 'canada', TW: 'taiwan', T: 'japan', HK: 'hong kong',
  AX: 'australia', SI: 'singapore', KS: 'south korea', KQ: 'south korea', IS: 'turkey'
};
let INV_STOCKS_INDEX = null;
let INV_STOCKS_LOADING = null;
const INV_STOCKS_LOCAL = path.join(ROOT, 'data', 'investing-stocks.csv');

function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function investpyCountryFor(market, exchHint) {
  const m = String(market || '').toUpperCase();
  const x = String(exchHint || '').toUpperCase();
  if (INV_COUNTRY[m]) return INV_COUNTRY[m];
  if (INV_COUNTRY[x]) return INV_COUNTRY[x];
  return null;
}
function indexInvestingTagsCsv(body) {
  const map = Object.create(null);
  const lines = String(body || '').split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const p = parseCsvLine(line);
    if (p.length < 3) continue;
    let country, symbol, tag;
    if (p.length >= 8) {
      // investpy tam format: country,name,full_name,tag,isin,id,currency,symbol
      country = String(p[0] || '').trim().toLowerCase();
      tag = String(p[3] || '').trim();
      symbol = String(p[p.length - 1] || '').trim().toUpperCase();
    } else {
      // yerli kısaltılmış: country,symbol,tag
      country = String(p[0] || '').trim().toLowerCase();
      symbol = String(p[1] || '').trim().toUpperCase();
      tag = String(p[2] || '').trim();
    }
    if (!country || !tag || !symbol) continue;
    const key = country + '|' + symbol;
    const prev = map[key];
    // Birincil kotasyon: ?cid= olmayan tag tercih edilir (ABD AMD vs Almanya AMD)
    if (!prev || (/\?cid=/i.test(prev) && !/\?cid=/i.test(tag))) map[key] = tag;
  }
  return map;
}
async function loadInvestpyStocks() {
  if (INV_STOCKS_INDEX) return INV_STOCKS_INDEX;
  if (INV_STOCKS_LOADING) return INV_STOCKS_LOADING;
  INV_STOCKS_LOADING = (async () => {
    // 1) Yerel eşleme (her hisse için doğrudan …-commentary URL)
    try {
      const local = await fs.promises.readFile(INV_STOCKS_LOCAL, 'utf8');
      const map = indexInvestingTagsCsv(local);
      if (Object.keys(map).length > 1000) {
        INV_STOCKS_INDEX = map;
        return map;
      }
    } catch (e) { /* GitHub yedeği */ }
    // 2) investpy GitHub CSV yedeği
    const url = 'https://raw.githubusercontent.com/alvarobartt/investpy/master/investpy/resources/stocks.csv';
    const r = await httpsGetText(url, { 'User-Agent': BUA, 'Accept': 'text/csv,*/*' });
    if (r.status !== 200 || !r.body) throw new Error('investpy_csv_' + r.status);
    const map = indexInvestingTagsCsv(r.body);
    INV_STOCKS_INDEX = map;
    return map;
  })();
  try { return await INV_STOCKS_LOADING; }
  finally { INV_STOCKS_LOADING = null; }
}
function investingForumPath(path) {
  let raw = String(path || '').trim();
  if (!raw) return '';
  if (raw.charAt(0) !== '/') raw = '/equities/' + raw.replace(/^equities\//i, '');
  const m = raw.match(/^(\/(?:equities|etfs|indices|commodities|currencies)\/[a-z0-9\-]+)(?:\?(.*))?$/i);
  if (!m) return '';
  const base = m[1].replace(/-commentary$/i, '');
  return base + '-commentary' + (m[2] ? '?' + m[2] : '');
}
function investingForumUrl(path) {
  const p = investingForumPath(path);
  return p ? 'https://tr.investing.com' + p : '';
}
function pickInvestingQuote(quotes, sym, market, exchHint) {
  const S = String(sym || '').toUpperCase();
  let pool = quotes.filter(q => String(q.symbol || '').toUpperCase() === S);
  if (!pool.length) pool = quotes.filter(q => /Stock|ETF|Fund|Index/i.test(q.type || ''));
  if (!pool.length) pool = quotes.slice();
  if (!pool.length) return null;
  const hintRe = exchHint && INV_EXCH_HINT[String(exchHint).toUpperCase()];
  const score = (q) => {
    let s = 0;
    const ex = ((q.exchange || '') + ' ' + (q.flag || '') + ' ' + (q.type || ''));
    if (String(q.symbol || '').toUpperCase() === S) s += 10;
    if (market === 'BIST' && /Istanbul|Turkey/i.test(ex)) s += 20;
    if (market === 'US' && /NASDAQ|NYSE|AMEX|USA|United States/i.test(ex)) s += 20;
    if (hintRe && hintRe.test(ex)) s += 25;
    return s;
  };
  pool.sort((a, b) => score(b) - score(a));
  return pool[0];
}
async function resolveInvestingForum(sym, market, exchHint) {
  const key = 'v3|' + (market || '') + '|' + String(sym || '').toUpperCase() + '|' + (exchHint || '');
  const hit = INV_FORUM_CACHE[key];
  if (hit && Date.now() - hit.at < 7 * 864e5) {
    return { path: hit.path, url: 'https://tr.investing.com' + hit.path, source: 'cache' };
  }
  const fallbackPath = '/search/?q=' + encodeURIComponent(sym) + '&tab=quotes';

  // 1) investpy ülke+sembol → doğru slug (ABD AMD vs Almanya AMD ayrımı)
  try {
    const country = investpyCountryFor(market, exchHint);
    if (country) {
      const idx = await loadInvestpyStocks();
      const tag = idx[country + '|' + String(sym).toUpperCase()];
      if (tag) {
        const path = investingForumPath(tag);
        if (path) {
          INV_FORUM_CACHE[key] = { path, at: Date.now() };
          return { path, url: 'https://tr.investing.com' + path, source: 'investpy', country };
        }
      }
    }
  } catch (e) { /* API / arama yedeği */ }

  // 2) Investing arama API (erişilebilirse)
  try {
    const r = await httpsGetText('https://api.investing.com/api/search/v2/search?q=' + encodeURIComponent(sym), {
      'User-Agent': BUA,
      'Accept': 'application/json',
      'Origin': 'https://tr.investing.com',
      'Referer': 'https://tr.investing.com/',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
    });
    if (r.status === 200) {
      const j = JSON.parse(r.body);
      const quotes = Array.isArray(j.quotes) ? j.quotes : [];
      const pick = pickInvestingQuote(quotes, sym, market, exchHint);
      if (pick && pick.url) {
        const path = investingForumPath(pick.url);
        if (path) {
          INV_FORUM_CACHE[key] = { path, at: Date.now() };
          return { path, url: 'https://tr.investing.com' + path, source: 'api', symbol: pick.symbol, exchange: pick.exchange };
        }
      }
    }
  } catch (e) { /* arama yedeği */ }

  return { path: fallbackPath, url: 'https://tr.investing.com' + fallbackPath, source: 'search' };
}

/* TradingView gerçek zamanlı kotasyon (guest WS → lp/chp). Scanner polling'den birebir canlı. */
function tvWsPack(msg) {
  const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
  return '~m~' + s.length + '~m~' + s;
}
function tvWsUnpack(raw) {
  const out = [];
  const str = String(raw);
  let i = 0;
  while (i < str.length) {
    if (str.slice(i, i + 3) !== '~m~') break;
    i += 3;
    const j = str.indexOf('~m~', i);
    if (j < 0) break;
    const n = parseInt(str.slice(i, j), 10);
    if (!isFinite(n) || n < 0) break;
    i = j + 3;
    out.push(str.slice(i, i + n));
    i += n;
  }
  return out;
}
function openTvQuoteSocket(tvSymbol, onQuote, onStatus) {
  if (typeof WebSocket === 'undefined') {
    if (onStatus) onStatus('no_ws');
    return { close: function () {} };
  }
  let closed = false;
  let ws;
  try {
    ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket', {
      headers: {
        Origin: 'https://www.tradingview.com',
        'User-Agent': BUA
      }
    });
  } catch (e) {
    if (onStatus) onStatus('ws_fail');
    return { close: function () {} };
  }
  const qs = 'qs_' + Math.random().toString(36).slice(2, 14);
  const send = (obj) => { try { if (ws.readyState === 1) ws.send(tvWsPack(obj)); } catch (_e) {} };
  ws.addEventListener('open', () => {
    send({ m: 'set_auth_token', p: ['unauthorized_user_token'] });
    send({ m: 'quote_create_session', p: [qs] });
    send({
      m: 'quote_set_fields',
      p: [qs, 'lp', 'chp', 'ch', 'volume', 'short_name', 'pro_name', 'currency_code', 'current_session', 'update_mode']
    });
    send({ m: 'quote_add_symbols', p: [qs, tvSymbol] });
    send({ m: 'quote_fast_symbols', p: [qs, tvSymbol] });
    if (onStatus) onStatus('open');
  });
  ws.addEventListener('message', (ev) => {
    if (closed) return;
    const parts = tvWsUnpack(ev.data);
    for (let k = 0; k < parts.length; k++) {
      const part = parts[k];
      if (part.indexOf('~h~') === 0) { send(part); continue; }
      try {
        const j = JSON.parse(part);
        if (j.m === 'qsd' && j.p && j.p[1] && j.p[1].v) {
          const v = j.p[1].v;
          if (v.lp != null || v.chp != null) {
            onQuote({
              symbol: j.p[1].n || tvSymbol,
              lp: v.lp != null ? +v.lp : null,
              chp: v.chp != null ? +v.chp : null,
              ch: v.ch != null ? +v.ch : null,
              mode: v.update_mode || null
            });
          }
        }
      } catch (_e) {}
    }
  });
  ws.addEventListener('error', () => { if (onStatus) onStatus('error'); });
  ws.addEventListener('close', () => { if (onStatus) onStatus('close'); });
  return {
    close: function () {
      closed = true;
      try { ws.close(); } catch (_e) {}
    }
  };
}

/* Luna finansal yorum servisi. API anahtarı yalnızca sunucudaki OPENAI_API_KEY
   ortam değişkeninden okunur; tarayıcıya hiçbir zaman gönderilmez. */
const LUNA_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const LUNA_CACHE = new Map();
const LUNA_RATE = new Map();
const LUNA_CACHE_MS = 15 * 60 * 1000;
const LUNA_RATE_MS = 60 * 60 * 1000;
const LUNA_RATE_MAX = 20;

function lunaJson(res, status, obj){
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(obj));
}
function readJsonBody(req, maxBytes){
  return new Promise((resolve, reject) => {
    let body='', size=0, done=false;
    req.on('data', chunk => {
      if(done) return;
      size += chunk.length;
      if(size > maxBytes){ done=true; reject(new Error('payload_too_large')); return; }
      body += chunk;
    });
    req.on('end', () => {
      if(done) return;
      try{ resolve(JSON.parse(body || '{}')); }catch(_e){ reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}
function lunaRateAllowed(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  const key=forwarded || req.socket.remoteAddress || 'local';
  const now=Date.now(), item=LUNA_RATE.get(key);
  if(!item || now-item.start >= LUNA_RATE_MS){ LUNA_RATE.set(key,{start:now,count:1}); return true; }
  if(item.count >= LUNA_RATE_MAX) return false;
  item.count++;
  return true;
}
function openAiResponse(payload){
  return new Promise((resolve, reject) => {
    const raw=JSON.stringify(payload);
    const rq=https.request({hostname:'api.openai.com',path:'/v1/responses',method:'POST',headers:{
      'Authorization':'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)
    },timeout:45000}, pr => {
      let body='';
      pr.on('data', c => { if(body.length < 2000000) body += c; });
      pr.on('end', () => {
        let parsed=null; try{ parsed=JSON.parse(body); }catch(_e){}
        if(pr.statusCode<200 || pr.statusCode>=300){ const e=new Error((parsed&&parsed.error&&parsed.error.message)||('openai_'+pr.statusCode)); e.status=pr.statusCode; reject(e); return; }
        resolve(parsed||{});
      });
    });
    rq.on('timeout', () => rq.destroy(new Error('openai_timeout')));
    rq.on('error', reject); rq.end(raw);
  });
}
function responseOutputText(j){
  for(const item of (j.output||[])) for(const part of (item.content||[])) if(part.type==='output_text' && part.text) return part.text;
  return '';
}
async function lunaAnalyzeHandler(req, res){
  if(req.method!=='POST'){ lunaJson(res,405,{ok:false,error:'method_not_allowed'}); return; }
  if(!process.env.OPENAI_API_KEY){ lunaJson(res,503,{ok:false,error:'luna_not_configured'}); return; }
  if(!lunaRateAllowed(req)){ lunaJson(res,429,{ok:false,error:'rate_limit'}); return; }
  try{
    const body=await readJsonBody(req,100*1024), snapshot=body&&body.snapshot;
    const lang=body&&body.lang==='en'?'en':'tr';
    if(!snapshot || !/^[A-Z0-9.\-]{1,24}$/.test(String(snapshot.ticker||''))){ lunaJson(res,400,{ok:false,error:'bad_snapshot'}); return; }
    const input=JSON.stringify(snapshot);
    const cacheKey=crypto.createHash('sha256').update(lang+'\n'+input).digest('hex');
    const cached=LUNA_CACHE.get(cacheKey);
    if(cached && Date.now()-cached.at<LUNA_CACHE_MS){ lunaJson(res,200,{ok:true,cached:true,analysis:cached.analysis}); return; }
    const instructions=lang==='tr'
      ? 'Sen Bilanço Analiz uygulamasındaki Luna adlı finansal analiz asistanısın. Yalnızca verilen finansal tablo verisini kullan. Rakam uydurma. Dönemleri ve para birimini belirt. Güçlü yönleri ve riskleri dengeli, sade Türkçe ile açıkla. Kesin al/sat tavsiyesi, hedef fiyat veya geleceğe dair garanti verme. Eksik veriyi açıkça söyle. Yanıt eğitim amaçlıdır. Her metin alanını en fazla 2 kısa cümle, her liste maddesini tek kısa cümle olarak yaz.'
      : 'You are Luna, the financial analysis assistant inside the Balance Sheet Analysis app. Use only the supplied financial statement data. Never invent figures. State periods and currency. Explain strengths and risks in clear, balanced English. Do not give definitive buy/sell advice, price targets, or guarantees. Call out missing data. The response is educational. Keep every text field to at most 2 short sentences and every list item to one short sentence.';
    const schema={type:'object',additionalProperties:false,properties:{
      summary:{type:'string'},strengths:{type:'array',items:{type:'string'},maxItems:4},risks:{type:'array',items:{type:'string'},maxItems:4},
      profitability:{type:'string'},cashFlow:{type:'string'},watchNext:{type:'array',items:{type:'string'},maxItems:3},disclaimer:{type:'string'}
    },required:['summary','strengths','risks','profitability','cashFlow','watchNext','disclaimer']};
    const out=await openAiResponse({model:LUNA_MODEL,store:false,reasoning:{effort:'none'},max_output_tokens:1800,instructions,
      input:'Aşağıdaki şirket finansal görünümünü analiz et / Analyze this company financial snapshot:\n'+input,
      text:{format:{type:'json_schema',name:'financial_statement_analysis',strict:true,schema}}});
    let analysis=null; try{ analysis=JSON.parse(responseOutputText(out)); }catch(_e){}
    if(!analysis){ lunaJson(res,502,{ok:false,error:'invalid_model_response'}); return; }
    LUNA_CACHE.set(cacheKey,{at:Date.now(),analysis});
    if(LUNA_CACHE.size>200) [...LUNA_CACHE.entries()].sort((a,b)=>a[1].at-b[1].at).slice(0,50).forEach(([k])=>LUNA_CACHE.delete(k));
    lunaJson(res,200,{ok:true,analysis});
  }catch(e){
    const status=e.message==='payload_too_large'?413:(e.message==='bad_json'?400:502);
    console.error('[Luna]', e.message||e);
    lunaJson(res,status,{ok:false,error:status===502?'luna_unavailable':e.message});
  }
}

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/ai/analyze') { lunaAnalyzeHandler(req,res); return; }

  // --- TipRanks özel şirket profili (güncel değerleme, finansman, ekip ve momentum) ---
  if (urlPath === '/private-company') {
    const slug=String(new URLSearchParams(req.url.split('?')[1]||'').get('slug')||'').trim().toLowerCase();
    const send=(obj,status) => {
      res.writeHead(status||200, {
        'Content-Type':'application/json; charset=utf-8',
        'Access-Control-Allow-Origin':'*',
        'Cache-Control':'public, max-age=900'
      });
      res.end(JSON.stringify(obj));
    };
    if(!PRIVATE_COMPANY_SLUGS.has(slug)){ send({ok:false,error:'bad_company'},400); return; }
    const cached=PRIVATE_COMPANY_CACHE.get(slug);
    if(cached && Date.now()-cached.at < 30*60*1000){ send(cached.data); return; }
    (async()=>{
      try{
        const readerUrl='https://r.jina.ai/http://www.tipranks.com/private-companies/'+encodeURIComponent(slug);
        const out=await privateReaderGet(readerUrl);
        if(out.status!==200 || !out.body || !/## (?:Latest )?Estimated Valuation/i.test(out.body)){
          send({ok:false,error:'source_unavailable'},502); return;
        }
        const data=parsePrivateCompanyMarkdown(out.body,slug);
        data.fetchedAt=new Date().toISOString();
        PRIVATE_COMPANY_CACHE.set(slug,{at:Date.now(),data});
        send(data);
      }catch(e){ send({ok:false,error:e.message||'private_company_fail'},502); }
    })();
    return;
  }

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

  // --- StockTwits hisse yorumları (CF bazı Render IP'lerini 403'ler → UA retry + kardeş köprü) ---
  if (urlPath === '/stocktwits') {
    const sym = (new URLSearchParams(req.url.split('?')[1] || '').get('s') || '').trim().toUpperCase();
    const send = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    if (!/^[A-Z0-9.\-]{1,20}$/.test(sym)) { send({ ok: false, symbol: sym, messages: [], error: 'bad_symbol' }); return; }
    const stUrl = 'https://api.stocktwits.com/api/2/streams/symbol/' + encodeURIComponent(sym) + '.json';
    const uaList = [
      BUA,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];
    const mapMsgs = (j) => {
      const msgs = Array.isArray(j.messages) ? j.messages : [];
      const mapped = msgs.slice(0, 40).map(m => {
        const likes = (m.likes && (m.likes.total != null ? m.likes.total : m.likes)) || 0;
        const reshares = (m.reshares && m.reshares.reshared_count) || 0;
        const sent = m.entities && m.entities.sentiment && m.entities.sentiment.basic;
        return {
          id: m.id,
          body: String(m.body || '').replace(/\s+/g, ' ').trim()
            .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(+n); } catch (e) { return ''; } })
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
          user: (m.user && m.user.username) || '?',
          avatar: (m.user && (m.user.avatar_url_ssl || m.user.avatar_url)) || '',
          created: m.created_at || null,
          likes: +likes || 0,
          reshares: +reshares || 0,
          sentiment: sent === 'Bullish' ? 'bull' : (sent === 'Bearish' ? 'bear' : null),
          url: m.id ? ('https://stocktwits.com/' + encodeURIComponent((m.user && m.user.username) || 'user') + '/message/' + m.id) : ('https://stocktwits.com/symbol/' + encodeURIComponent(sym))
        };
      }).filter(m => m.body);
      const popular = mapped.slice().sort((a, b) => (b.likes + b.reshares * 2) - (a.likes + a.reshares * 2) || (Date.parse(b.created || 0) - Date.parse(a.created || 0)));
      return {
        ok: true,
        symbol: (j.symbol && j.symbol.symbol) || sym,
        title: (j.symbol && j.symbol.title) || '',
        messages: mapped,
        popular: popular.slice(0, 20),
        source: 'stocktwits'
      };
    };
    const pullDirect = (uaIdx) => new Promise((resolve) => {
      const headers = {
        'User-Agent': uaList[uaIdx] || BUA,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://stocktwits.com/symbol/' + encodeURIComponent(sym),
        'Origin': 'https://stocktwits.com'
      };
      https.get(stUrl, { headers }, pr => {
        let body = '';
        pr.on('data', c => body += c);
        pr.on('end', () => resolve({ code: pr.statusCode, body }));
      }).on('error', () => resolve({ code: 0, body: '' }));
    });
    // Bazı Render IP'leri CF 403 yer → çalışan kardeş köprü (döngü yok: X-ST-Via)
    const pullFallback = () => new Promise((resolve) => {
      if (req.headers['x-st-via']) { resolve(null); return; }
      const fb = (process.env.ST_FALLBACK || 'https://bilanco-analiz.onrender.com').replace(/\/$/, '');
      const host = (req.headers.host || '').toLowerCase();
      if (!fb || host && fb.includes(host)) { resolve(null); return; }
      https.get(fb + '/stocktwits?s=' + encodeURIComponent(sym), {
        headers: { 'User-Agent': BUA, 'Accept': 'application/json', 'X-ST-Via': '1' }
      }, pr => {
        let body = '';
        pr.on('data', c => body += c);
        pr.on('end', () => {
          if (pr.statusCode !== 200) { resolve(null); return; }
          try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });
    (async () => {
      for (let i = 0; i < uaList.length; i++) {
        const r = await pullDirect(i);
        if (r.code === 200) {
          try { send(mapMsgs(JSON.parse(r.body))); return; }
          catch (e) { /* dene sonraki */ }
        }
        if (r.code === 503 || r.code === 429) {
          await new Promise(res => setTimeout(res, 500));
          const r2 = await pullDirect(i);
          if (r2.code === 200) {
            try { send(mapMsgs(JSON.parse(r2.body))); return; }
            catch (e) { /* */ }
          }
        }
      }
      const fb = await pullFallback();
      if (fb && fb.ok && fb.messages && fb.messages.length) { send(fb); return; }
      send({ ok: false, symbol: sym, messages: [], error: 'http_403' });
    })();
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

  // --- Investing.com hisse forumu URL çözümü (arama API → …-commentary) ---
  if (urlPath === '/invforum') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const sym = (q.get('s') || '').trim().toUpperCase();
    const market = (q.get('m') || '').trim().toUpperCase();
    const exch = (q.get('x') || '').trim().toUpperCase();
    const send = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    if (!/^[A-Z0-9.\-]{1,20}$/.test(sym)) { send({ ok: false, error: 'bad_symbol' }); return; }
    resolveInvestingForum(sym, market, exch)
      .then(r => send({ ok: true, symbol: sym, ...r }))
      .catch(() => send({ ok: true, symbol: sym, url: 'https://tr.investing.com/search/?q=' + encodeURIComponent(sym) + '&tab=quotes', source: 'search' }));
    return;
  }

  // --- TradingView canlı kotasyon akışı (guest WebSocket → SSE; lp/chp birebir) ---
  if (urlPath === '/tvlive') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const tv = (q.get('tv') || '').trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,16}:[A-Z0-9._\-]{1,32}$/.test(tv)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('bad_symbol');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    const writeEvt = (obj) => {
      try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (_e) {}
    };
    writeEvt({ ok: true, tv: tv, status: 'connecting' });
    let lastLp = null, lastChp = null;
    const sock = openTvQuoteSocket(tv, (quote) => {
      if (quote.lp == null && quote.chp == null) return;
      if (quote.lp != null) lastLp = quote.lp;
      if (quote.chp != null) lastChp = quote.chp;
      writeEvt({ ok: true, tv: quote.symbol || tv, lp: lastLp, chp: lastChp, ch: quote.ch, mode: quote.mode || 'streaming' });
    }, (st) => {
      writeEvt({ ok: true, tv: tv, status: st });
    });
    const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch (_e) {} }, 15000);
    const cleanup = () => { clearInterval(hb); sock.close(); };
    req.on('close', cleanup);
    req.on('aborted', cleanup);
    return;
  }

  // --- Investing forum köprüsü (telefonda uygulama Türkçe hesaba zorlarsa tarayıcıda English aç) ---
  if (urlPath === '/invopen') {
    const raw = (new URLSearchParams(req.url.split('?')[1] || '').get('u') || '').trim();
    let target = '';
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' && /(^|\.)investing\.com$/i.test(u.hostname)) target = u.toString();
    } catch (e) { /* bad */ }
    if (!target) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Geçersiz Investing bağlantısı');
      return;
    }
    const esc = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const jsEsc = JSON.stringify(target);
    const html = `<!DOCTYPE html>
<html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Investing Forum → English</title>
<style>
  :root{color-scheme:dark;--bg:#0f1419;--card:#1a2332;--ink:#e8eef7;--muted:#8b9bb4;--line:#2a3548;--accent:#4f9cf9}
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);padding:24px}
  .box{max-width:420px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px 20px}
  h1{margin:0 0 8px;font-size:18px}p{margin:0 0 14px;color:var(--muted);font-size:13.5px;line-height:1.55}
  a.btn,button.btn{display:block;width:100%;text-align:center;text-decoration:none;border:0;cursor:pointer;
    padding:12px 14px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:10px}
  a.primary,button.primary{background:linear-gradient(135deg,#4f9cf9,#2f6fd0);color:#fff}
  a.secondary{background:transparent;color:var(--accent);border:1px solid var(--line)}
  .tip{font-size:12px;color:var(--muted);line-height:1.5;margin-top:6px}
</style></head><body>
<div class="box">
  <h1>English (USA) forum</h1>
  <p>Telefonundaki Investing uygulaması Türkçe hesaba bağlıysa bağlantıyı Türkçe açabilir. English forum için <b>tarayıcıda</b> aç.</p>
  <button class="btn primary" type="button" id="openBrowser">Tarayıcıda aç (English)</button>
  <a class="btn secondary" id="openApp" rel="noopener" href="${esc}">Uygulamada aç</a>
  <p class="tip">Hâlâ Türkçe açılıyorsa: bağlantıya basılı tut → <b>Safari/Chrome’da Aç</b>. Uygulamada kalıcı çözüm: More → bayrak → English (USA).</p>
</div>
<script>
(function(){
  var target=${jsEsc};
  var android=/Android/i.test(navigator.userAgent);
  function openBrowser(){
    if(android){
      var bare=target.replace(/^https?:\\/\\//,'');
      location.href='intent://'+bare+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(target)+';end';
      return;
    }
    // iOS / diğer: Google yönlendirmesi Universal Link’i çoğu zaman kırar
    location.href='https://www.google.com/url?q='+encodeURIComponent(target)+'&sa=D&source=editors&ust='+Date.now();
  }
  document.getElementById('openBrowser').onclick=openBrowser;
  if(android) setTimeout(openBrowser, 250);
})();
</script>
</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
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

  // --- BIST fiili dolaşım köprüsü (KAP şirket genel → MKK güncel pay tutarı/oran; formül yok) ---
  if (urlPath === '/bistfloat') {
    const h = (new URLSearchParams(req.url.split('?')[1] || '').get('hisse') || '').trim().toUpperCase();
    const send = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    if (!/^[A-Z0-9]{1,12}$/.test(h)) { send({ symbol: h, floatShares: null, floatPct: null, source: 'kap', error: 'bad_symbol' }); return; }
    kapFloatShares(h).then(data => send(data || { symbol: h, floatShares: null, floatPct: null, source: 'kap', error: 'empty' }))
      .catch(() => send({ symbol: h, floatShares: null, floatPct: null, source: 'kap', error: 'fetch' }));
    return;
  }

  // --- BIST Takas / Aracı Kurum Dağılımı (BorsaCaddesi — ücretsiz güncel AKD) ---
  if (urlPath === '/bistakd') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const h = (q.get('hisse') || '').trim().toUpperCase();
    const slug = (q.get('slug') || '').trim();
    const send = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    if (!/^[A-Z0-9]{1,12}$/.test(h)) { send({ ok: false, symbol: h, error: 'bad_symbol' }); return; }
    if (slug && !/^[a-z0-9][a-z0-9\-/_]{2,160}$/i.test(slug)) { send({ ok: false, symbol: h, error: 'bad_slug' }); return; }
    borsaCaddesiAkd(h, slug ? { slug } : null).then(send).catch(e => send({ ok: false, symbol: h, error: e.message || 'fetch' }));
    return;
  }

  // --- AKD tablo görseli (tema uyumlu PNG, dış siteye gitmeden) ---
  if (urlPath === '/bistakdimg') {
    const u = (new URLSearchParams(req.url.split('?')[1] || '').get('u') || '').trim();
    if (!/^https:\/\/img\.borsacaddesi\.com\//i.test(u)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('bad_url');
      return;
    }
    bcThemedAkdImage(u).then(img => {
      if (!img || !img.buf) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('fetch_fail');
        return;
      }
      res.writeHead(200, {
        'Content-Type': img.ctype || 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(img.buf);
    }).catch(() => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('error');
    });
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
    const q = new URLSearchParams(req.url.split('?')[1] || '').get('q') || '';
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
        sectorWeightings: localizeSectorWeightings(th.sectorWeightings),
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
          topHoldings: { holdings, sectorWeightings: localizeSectorWeightings(sectors) }
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
                topHoldings: { holdings: parsed.holdings, sectorWeightings: localizeSectorWeightings(sectors) }
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
              topHoldings: { holdings, sectorWeightings: localizeSectorWeightings(sectors) }
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
            if (holdings.length >= 5) {
              sectors = await sectorsFromHoldings(holdings);
            }
          } catch (e) { holdings = []; sectors = []; }
          fund.holdings = holdings.slice(0, 25).map(h => ({
            symbol: h.symbol,
            name: h.name,
            holdingPercent: h.weight
          }));
          fund.sectors = localizeSectorWeightings((sectors || []).slice(0, 15));
          return send({
            ok: true,
            source: 'tefas+kap',
            date: pack.date,
            kind,
            partial: !(fund.holdings.length >= 5),
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
          onlyWithHoldings: false,
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
  let decodedFile = '';
  try {
    decodedFile = decodeURIComponent(file);
  } catch (_e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Gecersiz URL');
    return;
  }
  if (decodedFile.includes('\0')) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Gecersiz URL');
    return;
  }
  const requestRel = decodedFile.replace(/\\/g, '/').replace(/^\/+/, '');
  const fp = path.resolve(ROOT, ...requestRel.split('/'));
  const rel = path.relative(ROOT, fp);
  const relPosix = rel.split(path.sep).join('/');
  if (!rel || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  if (!isPublicStaticFile(relPosix)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bulunamadi: ' + file);
    return;
  }
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
