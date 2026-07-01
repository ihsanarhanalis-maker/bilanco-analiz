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

/* Yahoo quoteSummary (analist hedefleri) için çerez + crumb gerekir. Önbelleğe alınır.
   Not: fc.yahoo.com küçük/az çerez döner (finance.yahoo.com kök sayfası çok fazla çerez
   dönüp Node'un header limitini aşıyor — "Header overflow" hatası verir, o yüzden KULLANILMAZ).
   Yahoo'nun crumb doğrulaması bazı bulut sunucu IP'lerinde (Render, AWS vb.) ara sıra
   "Invalid Crumb" ile reddedebiliyor — bu Yahoo tarafındaki IP itibarına dayalı bir kısıtlama;
   aşağıdaki fonksiyon başarısız olursa tüm oturumu (çerez+crumb) yeniden kurup 1 kez daha dener. */
let Y_COOKIE = null, Y_CRUMB = null;
function getYahooAuth(cb){
  if (Y_COOKIE && Y_CRUMB) return cb(null);
  https.get('https://fc.yahoo.com/', { headers: { 'User-Agent': BUA } }, r => {
    const sc = r.headers['set-cookie'];
    Y_COOKIE = sc ? sc.map(c => c.split(';')[0]).join('; ') : '';
    r.resume();
    https.get('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': BUA, 'Cookie': Y_COOKIE } }, r2 => {
      let b = ''; r2.on('data', d => b += d); r2.on('end', () => {
        Y_CRUMB = b.trim();
        cb(Y_CRUMB && Y_CRUMB.length < 50 ? null : new Error('crumb alinamadi'));
      });
    }).on('error', e => cb(e));
  }).on('error', e => cb(e));
}
/* quoteSummary çağrısı; 401/geçersiz crumb olursa oturumu sıfırlayıp bir kez yeniden dener. */
function yahooSummary(sym, res, retry){
  getYahooAuth(err => {
    if (err) { res.writeHead(502); res.end('{}'); return; }
    const url = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(sym) +
                '?modules=financialData,recommendationTrend,upgradeDowngradeHistory,price&crumb=' + encodeURIComponent(Y_CRUMB);
    https.get(url, { headers: { 'User-Agent': BUA, 'Cookie': Y_COOKIE } }, pr => {
      let b = ''; pr.on('data', c => b += c); pr.on('end', () => {
        const looksInvalid = pr.statusCode === 401 || /Invalid Crumb/i.test(b);
        if (looksInvalid && !retry) { Y_COOKIE = null; Y_CRUMB = null; return yahooSummary(sym, res, true); }
        res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(b);
      });
    }).on('error', e => { res.writeHead(502); res.end('{}'); });
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

  // --- Analist hedef fiyatları köprüsü (Yahoo quoteSummary, anahtarsız) ---
  if (urlPath === '/targets') {
    const sym = new URLSearchParams(req.url.split('?')[1] || '').get('s') || '';
    yahooSummary(sym, res, false);
    return;
  }

  // --- Çeviri köprüsü (Google Translate, anahtarsız) ---
  if (urlPath === '/tr') {
    const q = (req.url.split('?')[1] || '').replace(/^q=/, '');
    const trUrl = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=' + q;
    https.get(trUrl, { headers: { 'User-Agent': UA } }, pr => {
      let body = '';
      pr.on('data', c => body += c);
      pr.on('end', () => {
        res.writeHead(pr.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', e => { res.writeHead(502); res.end('[]'); });
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
