'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const webPush = require('web-push');
const { Pool } = require('pg');

const PROFILE_RE = /^[A-Za-z0-9_-]{32,96}$/;
const SYMBOL_RE = /^[A-Z0-9.^_-]{1,24}$/;
const BALANCE_FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A', '20-F', '20-F/A', '40-F', '40-F/A']);
const OTHER_SEC_FORMS = new Set(['8-K', '8-K/A', '6-K', '6-K/A', '4', 'SC 13D', 'SC 13D/A', 'SC 13G', 'SC 13G/A', 'DEF 14A']);
const MAX_WATCHLIST = 20;

function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(value));
}

function readJson(req, maxBytes = 96 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (_e) { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function validProfileId(value) {
  const id = String(value || '').trim();
  return PROFILE_RE.test(id) ? id : null;
}

function normalizeWatchlist(input) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(input) ? input : []) {
    const symbol = String(item && (item.sym || item.symbol) || '').trim().toUpperCase();
    const market = String(item && item.market || '').trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol) || !['US', 'BIST'].includes(market)) continue;
    const key = market + ':' + symbol;
    if (seen.has(key)) continue;
    seen.add(key);
    const cikDigits = String(item.cik || '').replace(/\D/g, '').slice(0, 10);
    out.push({
      symbol,
      market,
      yahooSymbol: String(item.ysym || item.yahooSymbol || (market === 'BIST' ? symbol + '.IS' : symbol)).slice(0, 40),
      cik: cikDigits || null,
      country: String(item.country || (market === 'BIST' ? 'TR' : 'US')).slice(0, 32)
    });
    if (out.length >= MAX_WATCHLIST) break;
  }
  return out;
}

function safeUrlFor(item) {
  return '/?notifySymbol=' + encodeURIComponent(item.symbol) + '&notifyMarket=' + encodeURIComponent(item.market);
}

function httpsRequest(url, options = {}, body = null, maxBytes = 2 * 1024 * 1024, redirects = 4) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        if (raw.length <= maxBytes) raw += chunk;
      });
      res.on('end', () => {
        const status = res.statusCode || 0;
        const method = String(options.method || 'GET').toUpperCase();
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirects > 0 && method === 'GET') {
          const next = new URL(res.headers.location, url).toString();
          httpsRequest(next, options, null, maxBytes, redirects - 1).then(resolve, reject);
          return;
        }
        resolve({ status, body: raw, headers: res.headers });
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseKapDate(value) {
  const text = String(value || '').trim();
  const m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return text;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}+03:00`;
}

function kapSymbols(item) {
  const values = [];
  const walk = value => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    else if (value != null) values.push(String(value));
  };
  walk(item && item.relatedStocks);
  walk(item && item.stockCodes);
  return [...new Set(values.join(' ').toUpperCase().match(/[A-Z0-9]{3,12}/g) || [])];
}

class NotificationStore {
  constructor(root, logger) {
    this.logger = logger;
    this.pool = null;
    this.file = path.join(root, '.notification-store.json');
    this.data = { profiles: {}, subscriptions: {}, states: {} };
    this.ready = this.init();
  }

  async init() {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
        max: 4
      });
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS notification_profiles (
          id TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS notification_watchlist (
          profile_id TEXT NOT NULL REFERENCES notification_profiles(id) ON DELETE CASCADE,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL,
          yahoo_symbol TEXT,
          cik TEXT,
          country TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY(profile_id, symbol, market)
        );
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          endpoint TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES notification_profiles(id) ON DELETE CASCADE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          locale TEXT NOT NULL DEFAULT 'tr',
          user_agent TEXT,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS notification_state (
          symbol TEXT NOT NULL,
          market TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_key TEXT NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY(symbol, market, event_type)
        );
        CREATE INDEX IF NOT EXISTS notification_watch_symbol_idx
          ON notification_watchlist(symbol, market);
        CREATE INDEX IF NOT EXISTS push_profile_idx
          ON push_subscriptions(profile_id) WHERE enabled = TRUE;
      `);
      this.logger('[Notifications] PostgreSQL store ready');
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (parsed && parsed.profiles && parsed.subscriptions && parsed.states) this.data = parsed;
    } catch (_e) {}
    this.logger('[Notifications] local JSON store ready (production requires DATABASE_URL)');
  }

  persist() {
    fs.writeFileSync(this.file, JSON.stringify(this.data), 'utf8');
  }

  async syncProfile(profileId, watchlist) {
    await this.ready;
    const list = normalizeWatchlist(watchlist);
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO notification_profiles(id) VALUES($1)
          ON CONFLICT(id) DO UPDATE SET updated_at=NOW()`, [profileId]);
        await client.query('DELETE FROM notification_watchlist WHERE profile_id=$1', [profileId]);
        for (const item of list) {
          await client.query(`INSERT INTO notification_watchlist
            (profile_id,symbol,market,yahoo_symbol,cik,country) VALUES($1,$2,$3,$4,$5,$6)`,
            [profileId, item.symbol, item.market, item.yahooSymbol, item.cik, item.country]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally { client.release(); }
      return list;
    }
    this.data.profiles[profileId] = { watchlist: list, updatedAt: new Date().toISOString() };
    this.persist();
    return list;
  }

  async getProfile(profileId) {
    await this.ready;
    if (this.pool) {
      const { rows } = await this.pool.query(`SELECT symbol,market,yahoo_symbol,cik,country
        FROM notification_watchlist WHERE profile_id=$1 ORDER BY created_at`, [profileId]);
      return rows.map(r => ({ symbol: r.symbol, sym: r.symbol, market: r.market, ysym: r.yahoo_symbol, cik: r.cik, country: r.country }));
    }
    return (this.data.profiles[profileId] && this.data.profiles[profileId].watchlist) || [];
  }

  async saveSubscription(profileId, subscription, locale, userAgent) {
    await this.ready;
    const endpoint = String(subscription && subscription.endpoint || '').trim();
    const keys = subscription && subscription.keys || {};
    if (!/^https:\/\//i.test(endpoint) || !keys.p256dh || !keys.auth) throw new Error('bad_subscription');
    if (this.pool) {
      await this.pool.query(`INSERT INTO notification_profiles(id) VALUES($1)
        ON CONFLICT(id) DO UPDATE SET updated_at=NOW()`, [profileId]);
      await this.pool.query(`INSERT INTO push_subscriptions(endpoint,profile_id,p256dh,auth,locale,user_agent,enabled)
        VALUES($1,$2,$3,$4,$5,$6,TRUE)
        ON CONFLICT(endpoint) DO UPDATE SET profile_id=EXCLUDED.profile_id,p256dh=EXCLUDED.p256dh,
          auth=EXCLUDED.auth,locale=EXCLUDED.locale,user_agent=EXCLUDED.user_agent,enabled=TRUE,updated_at=NOW()`,
        [endpoint, profileId, String(keys.p256dh), String(keys.auth), locale === 'en' ? 'en' : 'tr', String(userAgent || '').slice(0, 500)]);
      return;
    }
    this.data.subscriptions[endpoint] = {
      endpoint, profileId, keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
      locale: locale === 'en' ? 'en' : 'tr', userAgent: String(userAgent || '').slice(0, 500), enabled: true
    };
    this.persist();
  }

  async deleteSubscription(endpoint) {
    await this.ready;
    if (this.pool) await this.pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [endpoint]);
    else { delete this.data.subscriptions[endpoint]; this.persist(); }
  }

  async watchedSymbols() {
    await this.ready;
    if (this.pool) {
      const { rows } = await this.pool.query(`SELECT symbol,market,MAX(yahoo_symbol) yahoo_symbol,MAX(cik) cik,MAX(country) country
        FROM notification_watchlist GROUP BY symbol,market ORDER BY market,symbol`);
      return rows.map(r => ({ symbol: r.symbol, market: r.market, yahooSymbol: r.yahoo_symbol, cik: r.cik, country: r.country }));
    }
    const map = new Map();
    Object.values(this.data.profiles).forEach(p => (p.watchlist || []).forEach(item => {
      map.set(item.market + ':' + item.symbol, item);
    }));
    return [...map.values()];
  }

  async subscriptionsFor(symbol, market) {
    await this.ready;
    if (this.pool) {
      const { rows } = await this.pool.query(`SELECT DISTINCT s.endpoint,s.p256dh,s.auth,s.locale
        FROM push_subscriptions s JOIN notification_watchlist w ON w.profile_id=s.profile_id
        WHERE s.enabled=TRUE AND w.symbol=$1 AND w.market=$2`, [symbol, market]);
      return rows.map(r => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth }, locale: r.locale }));
    }
    const profileIds = new Set(Object.entries(this.data.profiles)
      .filter(([, p]) => (p.watchlist || []).some(w => w.symbol === symbol && w.market === market))
      .map(([id]) => id));
    return Object.values(this.data.subscriptions).filter(s => s.enabled && profileIds.has(s.profileId));
  }

  async subscriptionsForProfile(profileId) {
    await this.ready;
    if (this.pool) {
      const { rows } = await this.pool.query(`SELECT endpoint,p256dh,auth,locale FROM push_subscriptions
        WHERE profile_id=$1 AND enabled=TRUE`, [profileId]);
      return rows.map(r => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth }, locale: r.locale }));
    }
    return Object.values(this.data.subscriptions).filter(s => s.enabled && s.profileId === profileId);
  }

  async state(symbol, market, eventType) {
    await this.ready;
    const id = market + ':' + symbol + ':' + eventType;
    if (this.pool) {
      const { rows } = await this.pool.query(`SELECT event_key,payload,observed_at FROM notification_state
        WHERE symbol=$1 AND market=$2 AND event_type=$3`, [symbol, market, eventType]);
      return rows[0] ? { eventKey: rows[0].event_key, payload: rows[0].payload, observedAt: rows[0].observed_at } : null;
    }
    return this.data.states[id] || null;
  }

  async setState(symbol, market, eventType, eventKey, payload) {
    await this.ready;
    const id = market + ':' + symbol + ':' + eventType;
    if (this.pool) {
      await this.pool.query(`INSERT INTO notification_state(symbol,market,event_type,event_key,payload)
        VALUES($1,$2,$3,$4,$5::jsonb)
        ON CONFLICT(symbol,market,event_type) DO UPDATE SET event_key=EXCLUDED.event_key,
          payload=EXCLUDED.payload,observed_at=NOW()`, [symbol, market, eventType, eventKey, JSON.stringify(payload || {})]);
      return;
    }
    this.data.states[id] = { eventKey, payload: payload || {}, observedAt: new Date().toISOString() };
    this.persist();
  }
}

async function fetchSecSnapshot(item, userAgent) {
  if (!item.cik) return null;
  const cik = String(item.cik).replace(/\D/g, '').padStart(10, '0');
  const response = await httpsRequest('https://data.sec.gov/submissions/CIK' + cik + '.json', {
    headers: { 'User-Agent': userAgent, Accept: 'application/json', 'Accept-Encoding': 'identity' }
  });
  if (response.status !== 200) throw new Error('sec_' + response.status);
  const data = JSON.parse(response.body || '{}');
  const rec = data.filings && data.filings.recent;
  if (!rec || !Array.isArray(rec.form)) return null;
  const makeEvent = i => {
    const accession = rec.accessionNumber[i] || '';
    const document = rec.primaryDocument[i] || '';
    const cikNum = parseInt(cik, 10);
    return {
      key: accession || hash([rec.form[i], rec.filingDate[i], document].join('|')),
      form: rec.form[i],
      date: rec.filingDate[i] || '',
      description: (rec.primaryDocDescription && rec.primaryDocDescription[i]) || '',
      url: accession && document ? 'https://www.sec.gov/Archives/edgar/data/' + cikNum + '/' + accession.replace(/-/g, '') + '/' + document : null
    };
  };
  let balance = null, filing = null;
  for (let i = 0; i < rec.form.length; i++) {
    const form = rec.form[i];
    if (!balance && BALANCE_FORMS.has(form)) balance = makeEvent(i);
    else if (!filing && OTHER_SEC_FORMS.has(form)) filing = makeEvent(i);
    if (balance && filing) break;
  }
  return { balance, filing };
}

async function fetchKapOids(items, userAgent) {
  try {
    const response = await httpsRequest('https://www.kap.org.tr/tr/bist-sirketler', {
      headers: { 'User-Agent': userAgent, Accept: 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9' }
    }, null, 5 * 1024 * 1024);
    if (response.status !== 200) return [];
    const html = String(response.body || '').replace(/\\"/g, '"');
    const wanted = new Set(items.map(item => item.symbol));
    const found = new Set();
    const add = (oid, codes) => {
      if (!oid) return;
      String(codes || '').split(/[,;]+/).map(value => value.trim().toUpperCase()).forEach(symbol => {
        if (wanted.has(symbol)) found.add(String(oid));
      });
    };
    const first = /\{[^{}]*"mkkMemberOid":"([^"]+)"[^{}]*"stockCode":"([^"]+)"[^{}]*\}/g;
    const second = /\{[^{}]*"stockCode":"([^"]+)"[^{}]*"mkkMemberOid":"([^"]+)"[^{}]*\}/g;
    let match;
    while ((match = first.exec(html))) add(match[1], match[2]);
    while ((match = second.exec(html))) add(match[2], match[1]);
    return [...found];
  } catch (_e) { return []; }
}

async function fetchKapSnapshots(items, userAgent) {
  const memberOids = await fetchKapOids(items, userAgent);
  const now = new Date();
  const from = new Date(now.getTime() - (memberOids.length ? 45 : 7) * 86400000);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const body = JSON.stringify({ fromDate: ymd(from), toDate: ymd(now), mkkMemberOidList: memberOids, subjectList: [] });
  const response = await httpsRequest('https://www.kap.org.tr/tr/api/disclosure/members/byCriteria', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': userAgent,
      Accept: 'application/json',
      Referer: 'https://www.kap.org.tr/'
    }
  }, body, 6 * 1024 * 1024);
  if (response.status !== 200) throw new Error('kap_' + response.status);
  const rows = JSON.parse(response.body || '[]');
  if (!Array.isArray(rows)) return new Map();
  const map = new Map();
  rows.forEach(row => {
    const event = {
      key: String(row.disclosureIndex || hash([row.publishDate, row.subject, row.summary].join('|'))),
      date: parseKapDate(row.publishDate),
      subject: String(row.subject || '').trim(),
      summary: String(row.summary || '').trim(),
      url: row.disclosureIndex ? 'https://www.kap.org.tr/tr/Bildirim/' + row.disclosureIndex : null
    };
    kapSymbols(row).forEach(symbol => {
      if (!map.has(symbol)) map.set(symbol, []);
      map.get(symbol).push(event);
    });
  });
  map.forEach(events => events.sort((a, b) => String(b.date).localeCompare(String(a.date))));
  return map;
}

async function fetchTargetSnapshots(items, market, userAgent) {
  const map = new Map();
  if (!items.length) return map;
  const isBist = market === 'BIST';
  const scan = isBist ? 'turkey' : 'america';
  const tickers = isBist
    ? items.map(item => 'BIST:' + item.symbol)
    : items.flatMap(item => ['NASDAQ:', 'NYSE:', 'AMEX:'].map(prefix => prefix + item.symbol));
  const columns = ['price_target_average', 'price_target_high', 'price_target_low', 'recommendation_total',
    'recommendation_buy', 'recommendation_over', 'recommendation_hold', 'recommendation_under',
    'recommendation_sell', 'recommendation_mark', 'close'];
  const body = JSON.stringify({ symbols: { tickers }, columns });
  const response = await httpsRequest('https://scanner.tradingview.com/' + scan + '/scan', {
    method: 'POST',
    headers: { 'User-Agent': userAgent, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Origin: 'https://www.tradingview.com' }
  }, body);
  if (response.status !== 200) throw new Error(market.toLowerCase() + '_target_' + response.status);
  const data = JSON.parse(response.body || '{}');
  (data.data || []).forEach(row => {
    if (!row || !row.s || !Array.isArray(row.d)) return;
    const symbol = String(row.s).split(':').pop().toUpperCase();
    const d = row.d;
    const stable = d.slice(0, 10).map(value => value == null ? null : Number(Number(value).toFixed(4)));
    if (stable[0] == null && stable[3] == null) return;
    if (!map.has(symbol)) map.set(symbol, { key: hash(JSON.stringify(stable)), target: stable[0], high: stable[1], low: stable[2], recommendation: stable[9], close: d[10] });
  });
  return map;
}

function isNewerEvent(next, previous) {
  if (!previous || !previous.payload) return true;
  const nextTime = Date.parse(next.date || '');
  const previousTime = Date.parse(previous.payload.date || '');
  if (Number.isFinite(nextTime) && Number.isFinite(previousTime)) return nextTime > previousTime;
  return true;
}

function createNotificationService(options = {}) {
  const root = options.root || __dirname;
  const logger = options.logger || console.log;
  const store = new NotificationStore(root, logger);
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const vapidSubject = String(process.env.VAPID_SUBJECT || 'https://bilanco-analiz-4sjg.onrender.com/').trim();
  const pushEnabled = Boolean(publicKey && privateKey);
  const serviceEnabled = pushEnabled && (Boolean(process.env.DATABASE_URL) || process.env.NOTIFICATION_ALLOW_FILE_STORE === '1');
  const pollMinutes = Math.max(5, Math.min(180, Number(process.env.NOTIFICATION_POLL_MINUTES || 15) || 15));
  const userAgent = String(process.env.NOTIFICATION_USER_AGENT || 'Bilanco Analiz notification monitor contact@example.com');
  let pollRunning = null;
  const rate = new Map();

  if (pushEnabled) webPush.setVapidDetails(vapidSubject, publicKey, privateKey);

  function rateAllowed(req) {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    const hit = rate.get(ip) || { at: now, count: 0 };
    if (now - hit.at > 3600000) { hit.at = now; hit.count = 0; }
    hit.count++;
    rate.set(ip, hit);
    return hit.count <= 80;
  }

  async function sendSubscriptions(subscriptions, payload) {
    if (!pushEnabled) return { sent: 0, failed: 0 };
    let sent = 0, failed = 0;
    for (const subscription of subscriptions) {
      try {
        await webPush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify(payload), { TTL: 86400, urgency: 'high' });
        sent++;
      } catch (e) {
        failed++;
        if (e && (e.statusCode === 404 || e.statusCode === 410)) await store.deleteSubscription(subscription.endpoint);
        else logger('[Notifications] push failed', e && (e.statusCode || e.message) || e);
      }
    }
    return { sent, failed };
  }

  async function emit(item, type, snapshot, title, body) {
    if (!snapshot || !snapshot.key) return false;
    const previous = await store.state(item.symbol, item.market, type);
    if (previous && previous.eventKey === snapshot.key) return false;
    await store.setState(item.symbol, item.market, type, snapshot.key, snapshot);
    if (!previous || !isNewerEvent(snapshot, previous)) return false;
    const subscriptions = await store.subscriptionsFor(item.symbol, item.market);
    if (!subscriptions.length) return false;
    await sendSubscriptions(subscriptions, {
      title,
      body,
      tag: 'bilanco-' + type + '-' + item.market + '-' + item.symbol,
      url: snapshot.url || safeUrlFor(item),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      symbol: item.symbol,
      market: item.market,
      eventType: type
    });
    return true;
  }

  async function processItem(item, kapMap, targetMaps) {
    let emitted = 0;
    if (item.market === 'US' && item.cik) {
      const sec = await fetchSecSnapshot(item, userAgent);
      if (sec && sec.balance) emitted += await emit(item, 'balance', sec.balance,
        item.symbol + ' yeni bilançosunu yayımladı', sec.balance.form + ' · ' + sec.balance.date) ? 1 : 0;
      if (sec && sec.filing) emitted += await emit(item, 'filing', sec.filing,
        item.symbol + ' yeni SEC bildirimi', [sec.filing.form, sec.filing.description, sec.filing.date].filter(Boolean).join(' · ')) ? 1 : 0;
    }
    if (item.market === 'BIST') {
      const events = (kapMap && kapMap.get(item.symbol)) || [];
      const balance = events.find(event => /finansal\s+(rapor|tablo)|financial\s+(report|statement)/i.test(event.subject + ' ' + event.summary));
      const filing = events.find(event => !balance || event.key !== balance.key);
      if (balance) emitted += await emit(item, 'balance', balance,
        item.symbol + ' yeni bilançosunu yayımladı', [balance.subject, balance.date && balance.date.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ')) ? 1 : 0;
      if (filing) emitted += await emit(item, 'filing', filing,
        item.symbol + ' yeni KAP bildirimi', [filing.subject || filing.summary, filing.date && filing.date.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ')) ? 1 : 0;
    }
    const target = targetMaps.get(item.market) && targetMaps.get(item.market).get(item.symbol);
    if (target) {
      const currency = item.market === 'BIST' ? ' TL' : ' USD';
      const body = target.target != null
        ? 'Yeni hedef fiyat konsensüsü: ' + Number(target.target).toFixed(2) + currency
        : 'Analist konsensüsü güncellendi';
      emitted += await emit(item, 'target', target, item.symbol + ' analist hedef fiyatı güncellendi', body) ? 1 : 0;
    }
    return emitted;
  }

  async function runPoll() {
    if (pollRunning) return pollRunning;
    pollRunning = (async () => {
      await store.ready;
      const watched = await store.watchedSymbols();
      if (!watched.length) return { ok: true, watched: 0, notifications: 0 };
      const bistItems = watched.filter(item => item.market === 'BIST');
      const usItems = watched.filter(item => item.market === 'US');
      let kapMap = new Map();
      const targetMaps = new Map([['BIST', new Map()], ['US', new Map()]]);
      const results = await Promise.allSettled([
        bistItems.length ? fetchKapSnapshots(bistItems, userAgent) : Promise.resolve(new Map()),
        fetchTargetSnapshots(bistItems, 'BIST', userAgent),
        fetchTargetSnapshots(usItems, 'US', userAgent)
      ]);
      if (results[0].status === 'fulfilled') kapMap = results[0].value;
      else logger('[Notifications] KAP poll failed', results[0].reason && results[0].reason.message);
      if (results[1].status === 'fulfilled') targetMaps.set('BIST', results[1].value);
      else logger('[Notifications] BIST target poll failed', results[1].reason && results[1].reason.message);
      if (results[2].status === 'fulfilled') targetMaps.set('US', results[2].value);
      else logger('[Notifications] US target poll failed', results[2].reason && results[2].reason.message);
      let notifications = 0, failures = 0;
      for (let i = 0; i < watched.length; i += 4) {
        const chunk = watched.slice(i, i + 4);
        const results = await Promise.allSettled(chunk.map(item => processItem(item, kapMap, targetMaps)));
        results.forEach(result => {
          if (result.status === 'fulfilled') notifications += result.value || 0;
          else { failures++; logger('[Notifications] item poll failed', result.reason && result.reason.message); }
        });
      }
      return { ok: true, watched: watched.length, notifications, failures, checkedAt: new Date().toISOString() };
    })().finally(() => { pollRunning = null; });
    return pollRunning;
  }

  async function handle(req, res, urlPath) {
    if (!urlPath.startsWith('/api/notifications/')) return false;
    if (!rateAllowed(req)) { json(res, 429, { ok: false, error: 'rate_limit' }); return true; }
    try {
      if (req.method === 'GET' && urlPath === '/api/notifications/config') {
        json(res, 200, {
          ok: true, enabled: serviceEnabled, publicKey: serviceEnabled ? publicKey : null,
          persistent: Boolean(process.env.DATABASE_URL), pollMinutes,
          supportedMarkets: ['BIST', 'US'], maxWatchlist: MAX_WATCHLIST
        });
        return true;
      }
      if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method' }); return true; }
      const body = await readJson(req);
      const profileId = validProfileId(body.profileId);
      if (!profileId && !['/api/notifications/unsubscribe', '/api/notifications/poll'].includes(urlPath)) {
        json(res, 400, { ok: false, error: 'profile_id' }); return true;
      }

      if (urlPath === '/api/notifications/profile') {
        json(res, 200, { ok: true, watchlist: await store.getProfile(profileId) });
        return true;
      }
      if (urlPath === '/api/notifications/sync') {
        json(res, 200, { ok: true, watchlist: await store.syncProfile(profileId, body.watchlist) });
        return true;
      }
      if (urlPath === '/api/notifications/subscribe') {
        if (!serviceEnabled) { json(res, 503, { ok: false, error: 'push_not_configured' }); return true; }
        const watchlist = await store.syncProfile(profileId, body.watchlist);
        await store.saveSubscription(profileId, body.subscription, body.locale, req.headers['user-agent']);
        json(res, 200, { ok: true, watchlist });
        setTimeout(() => runPoll().catch(e => logger('[Notifications] baseline poll failed', e.message)), 50);
        return true;
      }
      if (urlPath === '/api/notifications/unsubscribe') {
        const endpoint = String(body.endpoint || '').trim();
        if (endpoint) await store.deleteSubscription(endpoint);
        json(res, 200, { ok: true });
        return true;
      }
      if (urlPath === '/api/notifications/poll') {
        const secret = String(process.env.NOTIFICATION_CRON_SECRET || '');
        const supplied = String(req.headers['x-cron-secret'] || body.secret || '');
        if (!secret || supplied !== secret) { json(res, 403, { ok: false, error: 'forbidden' }); return true; }
        json(res, 200, await runPoll());
        return true;
      }
      json(res, 404, { ok: false, error: 'not_found' });
      return true;
    } catch (e) {
      logger('[Notifications] API error', e && e.message || e);
      json(res, e.message === 'payload_too_large' ? 413 : 400, { ok: false, error: e.message || 'request_failed' });
      return true;
    }
  }

  store.ready.then(() => {
    if (!serviceEnabled) logger('[Notifications] VAPID keys or persistent DATABASE_URL missing; subscription UI will stay disabled');
    if (pushEnabled && process.env.DATABASE_URL) {
      setTimeout(() => runPoll().catch(e => logger('[Notifications] initial poll failed', e.message)), 15000);
      setInterval(() => runPoll().catch(e => logger('[Notifications] scheduled poll failed', e.message)), pollMinutes * 60000).unref();
    }
  }).catch(e => logger('[Notifications] store init failed', e.message));

  return { handle, runPoll, ready: store.ready, enabled: serviceEnabled };
}

module.exports = { createNotificationService, normalizeWatchlist };
