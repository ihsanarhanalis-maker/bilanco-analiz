/* Bilanço Analiz — yerel köprü sunucusu (anahtarsız SEC EDGAR erişimi)
   Çift tıklamayla Bilanco-Baslat.bat üzerinden çalışır.
   - Uygulamayı http://localhost:8723 adresinde sunar
   - /sec/* isteklerini sunucu tarafından data.sec.gov'a iletir (CORS sorunu olmaz) */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT = process.env.PORT || 8723;  // internette sunucu portu atar; yerelde 8723
const ROOT = __dirname;
// SEC, kendini tanıtan bir User-Agent ister:
const UA = 'Bilanco Analiz Araci (kisisel kullanim; contact@example.com)';
const BUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };

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
function finvizTargets(sym, res){
  const url = 'https://finviz.com/quote.ashx?t=' + encodeURIComponent(sym);
  httpGetHtmlFollow(url, { 'User-Agent': BUA, 'Accept': 'text/html' }, 4, (err, status, html) => {
    if (err || status !== 200 || !html) { res.writeHead(200); res.end(JSON.stringify({ ok: false })); return; }
    const targetPriceRaw = extractStat(html, 'Target Price');
    const recomRaw = extractStat(html, 'Recom');
    const targetPrice = targetPriceRaw ? parseFloat(targetPriceRaw) : null;
    const recom = recomRaw ? parseFloat(recomRaw) : null;
    const ratings = extractRatingEvents(html).slice(0, 30);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, targetPrice, recom, ratings }));
  });
}

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // --- Haber köprüsü (Bing News RSS — linkler gerçek yayıncıya gider) ---
  if (urlPath === '/news') {
    const q = (req.url.split('?')[1] || '').replace(/^q=/, '');
    const newsUrl = 'https://www.bing.com/news/search?q=' + q + '&format=rss&setlang=en-US';
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

  // --- Analist hedef fiyatları köprüsü (Finviz, anahtarsız — Yahoo crumb'a bağımlı değil) ---
  if (urlPath === '/targets') {
    const sym = new URLSearchParams(req.url.split('?')[1] || '').get('s') || '';
    finvizTargets(sym, res);
    return;
  }

  // --- Çeviri köprüsü (MyMemory, anahtarsız — translate.googleapis.com'un resmi olmayan
  //     scrape uç noktası Render'ın bulut IP'sinde de engellendiği/oran sınırlandığı için
  //     değiştirildi; MyMemory gerçek bir genel API olduğundan bulut IP'lerini engellemiyor) ---
  if (urlPath === '/tr') {
    const q = (req.url.split('?')[1] || '').replace(/^q=/, '');
    const trUrl = 'https://api.mymemory.translated.net/get?langpair=en|tr&q=' + q;
    https.get(trUrl, { headers: { 'User-Agent': BUA } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end('{}'); });
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
}).listen(PORT, () => {
  console.log('===========================================');
  console.log('  Bilanco Analiz calisiyor (anahtarsiz).');
  console.log('  Adres: http://localhost:' + PORT);
  console.log('  Kapatmak icin bu pencerede Ctrl+C yapin.');
  console.log('===========================================');
});
