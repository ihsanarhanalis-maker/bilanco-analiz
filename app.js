/* ---------- Sayfa sekmeleri (Ana Sayfa · Bilanço Analizi · Ekonomik Takvim) ---------- */
function switchPage(p){
  ['home','stock','takas','econ','top100','scan','sect','etf','private','wnews','st','graphai','ai'].forEach(x=>{
    document.getElementById('page-'+x)?.classList.toggle('active', x===p);
    document.getElementById('tabbtn-'+x)?.classList.toggle('active', x===p);
  });
  document.body.classList.toggle('page-stock', p==='stock');
  /* Logo / Ana Sayfa: önceki hissenin canlı fiyatı ve yerel saati üstte kalmasın */
  document.getElementById('hdrStockMeta')?.classList.toggle('hidden', p!=='stock');
  document.getElementById('marketTape')?.classList.toggle('hidden', p!=='home');
  if(p==='econ') initEconPage();       // ülke kutuları ilk girişte kurulur (tembel)
  if(p==='top100') initTop100Page();
  if(p==='scan') initScanPage();
  if(p==='sect') initSectPage();
  if(p==='econ'||p==='top100'||p==='scan'||p==='sect'){
    try{ paintCountryBoxLabels(); }catch(_e){}
  }
  if(p==='etf'){
    const etfWas=ETF_PAGE_INIT;
    initEtfPage();
    try{
      if(etfWas && ETF_LAST_CODE){
        if(ETF_MKT==='TR') loadTefasFund(ETF_LAST_CODE);
        else loadEtf(ETF_LAST_CODE);
      }
    }catch(_e){}
  }
  if(p==='wnews') initWnewsPage();
  if(p==='private') initPrivateCompaniesPage();
  if(p==='takas') initTakasPage();
  if(p==='st') initStPage();
  if(p==='graphai') initGraphAiPage();
  if(p==='home'){
    if(DISC_REVEALED) loadDiscovery();
    if(EQCAL_REVEALED) loadEqCalendar();
  }
  /* Sesli kart kaydırması varsa tepeye scroll kartı bozar */
  if(!_voicePendingCard) window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- Hisse logoları ----------
   BIST: Foreks/ForInvest CDN (fws.forinvestcdn.com — sitedeki güncel logolar) → MarketIcons → KAP PNG.
   ABD: TradingView → FMP → CompaniesMarketCap.
   Diğer borsalar: FMP → CompaniesMarketCap → TradingView.
   onerror ile sıradaki kaynağa düşer; hiçbiri yoksa harf rozeti. */
const LOGO_CACHE={};   // "MARKET|SYM" → logoid | ''
const LOGO_YAHOO_CC={
  TR:'.IS', US:'', GB:'.L', DE:'.DE', FR:'.PA', NL:'.AS', BE:'.BR', PT:'.LS',
  IT:'.MI', ES:'.MC', CH:'.SW', SE:'.ST', DK:'.CO', NO:'.OL', FI:'.HE',
  AT:'.VI', PL:'.WA', KR:'.KS', JP:'.T', CN:'.SS', HK:'.HK', TW:'.TW',
  CA:'.TO', AU:'.AX', SG:'.SI'
};
function logoCacheKey(sym, market){ return String(market||'')+'|'+String(sym||'').toUpperCase(); }
function logoUrl(logoid){
  if(!logoid) return '';
  return 'https://s3-symbol-logo.tradingview.com/'+encodeURIComponent(logoid)+'.svg';
}
function logoInitials(label){
  const s=String(label||'').replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/g,'');
  return (s.slice(0,2).toUpperCase()||'?');
}
function logoBaseSym(sym){
  return String(sym||'').toUpperCase().replace(/_/g,'-').replace(/\.[A-Z]{1,3}$/,'').trim();
}
function logoYahooSym(sym, opts){
  opts=opts||{};
  let s=String(opts.ysym||sym||'').toUpperCase().replace(/_/g,'-');
  if(/\.[A-Z]{1,3}$/.test(s)){
    if(s.endsWith('.US')) return s.slice(0,-3);
    return s;
  }
  s=logoBaseSym(s);
  if(opts.euInfo && opts.euInfo.ysym) return String(opts.euInfo.ysym).toUpperCase();
  const m=opts.market, cc=opts.cc;
  if(m==='BIST' || cc==='TR') return s+'.IS';
  if(m==='US' || cc==='US') return s;
  const suf=LOGO_YAHOO_CC[cc||''];
  if(suf!=null) return s+suf;
  return s;
}
function logoCandidates(sym, logoid, opts){
  opts=opts||{};
  const base=logoBaseSym(sym||opts.sym||'');
  const ysym=logoYahooSym(base, opts);
  const urls=[];
  const isBist=opts.market==='BIST' || opts.cc==='TR';
  // BIST: Foreks/ForInvest (aynı CDN — güncel kare logolar), sonra yerel paketler
  if(isBist && base){
    urls.push('https://fws.forinvestcdn.com/cdn/symbol-logos/'+encodeURIComponent(base)+'.png');
    urls.push('https://cdn.jsdelivr.net/npm/@marketicons/bist@1.0.1/svg/'+encodeURIComponent(base)+'.svg');
    urls.push('https://cdn.jsdelivr.net/gh/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos@HEAD/logos/'+encodeURIComponent(base)+'.png');
  }
  const isUs=opts.market==='US' || opts.cc==='US';
  // ABD: TradingView logoid önce; diğer borsalar (ve BIST yedek): FMP → CMC → TV
  if(isUs && logoid) urls.push(logoUrl(logoid));
  if(ysym) urls.push('https://images.financialmodelingprep.com/symbol/'+encodeURIComponent(ysym)+'.png');
  if(isUs && ysym!==base)
    urls.push('https://images.financialmodelingprep.com/symbol/'+encodeURIComponent(base)+'.png');
  if(ysym) urls.push('https://companiesmarketcap.com/img/company-logos/64/'+encodeURIComponent(ysym)+'.webp');
  if(!isUs && logoid) urls.push(logoUrl(logoid));
  return [...new Set(urls.filter(Boolean))];
}
window.__logoNext=function(img){
  try{
    const urls=(img.getAttribute('data-urls')||'').split('|').filter(Boolean);
    let i=(+img.getAttribute('data-i')||0)+1;
    img.setAttribute('data-i', String(i));
    if(i<urls.length){ img.src=urls[i]; return; }
    img.parentNode && img.parentNode.classList.add('fb');
  }catch(_e){
    img.parentNode && img.parentNode.classList.add('fb');
  }
};
function logoHtml(logoid, label, size, opts){
  opts=opts||{};
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const s=size||22;
  const sym=opts.sym||label;
  const urls=logoCandidates(sym, logoid||opts.logoid, opts);
  const fb=logoInitials(label||sym);
  const fbCls=urls.length?'':' fb';
  const dataUrls=esc(urls.join('|'));
  return `<span class="sym-logo-wrap${fbCls}" style="width:${s}px;height:${s}px" title="${esc(label||sym)}">`+
    (urls.length
      ?`<img class="sym-logo" src="${esc(urls[0])}" data-urls="${dataUrls}" data-i="0" alt="" width="${s}" height="${s}" loading="lazy" decoding="async" onerror="window.__logoNext(this)">`
      :'')+
    `<span class="sym-logo-fb" style="font-size:${Math.max(9,Math.round(s*0.38))}px">${esc(fb)}</span></span>`;
}
function rememberLogoid(sym, market, logoid){
  if(!sym || !logoid) return;
  LOGO_CACHE[logoCacheKey(sym, market)]=logoid;
}
async function resolveLogoid(sym, market, euInfo){
  const key=logoCacheKey(sym, market);
  if(key in LOGO_CACHE) return LOGO_CACHE[key];
  try{
    let scan='america', tickers=['NASDAQ:'+sym,'NYSE:'+sym,'AMEX:'+sym];
    if(market==='BIST'){ scan='turkey'; tickers=['BIST:'+sym]; }
    else if(market==='EU' && euInfo){
      scan=euInfo.scan||'germany';
      tickers=[euInfo.tv+':'+euTvBase(euInfo)];
    }
    const r=await fetch('https://scanner.tradingview.com/'+scan+'/scan',{
      method:'POST', body:JSON.stringify({symbols:{tickers},columns:['logoid']})
    });
    const j=r.ok?await r.json():null;
    const id=((j&&j.data)||[]).map(x=>x.d&&x.d[0]).find(Boolean)||'';
    LOGO_CACHE[key]=id;
    return id;
  }catch(_e){
    LOGO_CACHE[key]='';
    return '';
  }
}
/* TradingView scanner — canlı fiyat + günlük % değişim (header #livePrice). */
async function fetchTvLiveQuote(sym, market, euInfo){
  try{
    let scan='america', tickers=['NASDAQ:'+sym,'NYSE:'+sym,'AMEX:'+sym];
    if(market==='BIST'){ scan='turkey'; tickers=['BIST:'+sym]; }
    else if(market==='EU' && euInfo){
      scan=euInfo.scan||'germany';
      tickers=[euInfo.tv+':'+euTvBase(euInfo)];
    }
    const r=await fetch('https://scanner.tradingview.com/'+scan+'/scan',{
      method:'POST',
      body:JSON.stringify({symbols:{tickers},columns:['close','change','logoid']})
    });
    if(!r.ok) return null;
    const j=await r.json();
    const row=((j&&j.data)||[]).find(x=>x.d&&x.d[0]!=null);
    if(!row) return null;
    if(row.d[2]) rememberLogoid(sym, market, row.d[2]);
    return { price:+row.d[0], changePct:row.d[1]!=null?+row.d[1]:null, logoid:row.d[2]||'', tv:row.s };
  }catch(_e){ return null; }
}
/* Canlı fiyat: TradingView WebSocket akışı (SSE /tvlive) — scanner yedek. */
let LIVE_PRICE_TIMER=null, LIVE_PRICE_ES=null, LIVE_PRICE_STATE=null, LIVE_PRICE_BUSY=false;
function stopLivePrice(){
  if(LIVE_PRICE_TIMER){ clearInterval(LIVE_PRICE_TIMER); LIVE_PRICE_TIMER=null; }
  if(LIVE_PRICE_ES){ try{ LIVE_PRICE_ES.close(); }catch(_e){} LIVE_PRICE_ES=null; }
  LIVE_PRICE_STATE=null;
  LIVE_PRICE_BUSY=false;
}
function paintLivePrice(sym, live, ch){
  const lp=document.getElementById('livePrice');
  if(!lp || live==null) return;
  /* Başka hisseye geçildiyse eski fiyat/logo yazılmasın */
  if(FIN && sym && String(FIN.ticker).toUpperCase()!==String(sym).toUpperCase()) return;
  if(LIVE_PRICE_STATE && LIVE_PRICE_STATE.sym && String(LIVE_PRICE_STATE.sym).toUpperCase()!==String(sym).toUpperCase()) return;
  const cls=ch==null?'neutral':(Math.abs(ch)<0.005?'neutral':(ch>0?'up':'down'));
  const ar=ch==null?'':(ch>0?'▲':ch<0?'▼':'→');
  const valEl=lp.querySelector('.lp-val');
  const chgEl=lp.querySelector('.lp-chg');
  const liveEl=lp.querySelector('.lp-live');
  if(valEl){
    const prev=LIVE_PRICE_STATE&&LIVE_PRICE_STATE.lastPrice;
    valEl.textContent=fmtUSD(live);
    if(prev!=null && Number(prev)!==Number(live)){
      valEl.classList.remove('lp-flash-up','lp-flash-down');
      void valEl.offsetWidth;
      valEl.classList.add(live>prev?'lp-flash-up':'lp-flash-down');
    }
    if(chgEl){
      chgEl.className='lp-chg '+cls;
      chgEl.textContent=ch==null?'':(ar+' '+pct(ch));
    }else if(ch!=null){
      valEl.insertAdjacentHTML('afterend', `<span class="lp-chg ${cls}">${ar} ${pct(ch)}</span>`);
    }
    if(liveEl) liveEl.classList.add('on');
    const symEl=lp.querySelector('.lp-sym');
    if(symEl) symEl.textContent=sym;
  }else{
    lp.innerHTML=logoHtml(FIN&&FIN.logoid, sym, 26, logoOptsFromFin())+
      `<span class="lp-sym">${sym}</span><span class="lp-val">${fmtUSD(live)}</span>`+
      (ch!=null?`<span class="lp-chg ${cls}">${ar} ${pct(ch)}</span>`:'')+
      `<span class="lp-live on">${t('live_dot')}</span>`;
  }
  lp.classList.remove('hidden');
  if(LIVE_PRICE_STATE) LIVE_PRICE_STATE.lastPrice=live;
  if(LIVE_PRICE_STATE&&LIVE_PRICE_STATE.shares!=null&&FIN&&FIN.market==='BIST'){
    const badge=document.getElementById('hdBadge');
    if(badge){
      const mcap=live*LIVE_PRICE_STATE.shares;
      badge.className='hd-badge mcap';
      badge.innerHTML=`<span class="mc-lbl">${t('mcap_lbl')}</span><span class="mc-eq">=</span><span class="mc-val">${fmtMcap(mcap)}</span>`;
      badge.classList.remove('hidden');
    }
  }
}
async function tickLivePrice(){
  const st=LIVE_PRICE_STATE;
  if(!st || LIVE_PRICE_BUSY || LIVE_PRICE_ES) return;
  if(st.myGen!==REQ_GEN || !FIN || String(FIN.ticker).toUpperCase()!==String(st.sym).toUpperCase()){ stopLivePrice(); return; }
  if(document.hidden) return;
  LIVE_PRICE_BUSY=true;
  try{
    const q=await fetchTvLiveQuote(st.sym, st.market, st.euInfo);
    if(st.myGen!==REQ_GEN || !FIN || String(FIN.ticker).toUpperCase()!==String(st.sym).toUpperCase()) return;
    if(q&&q.price!=null){
      if(q.logoid) FIN.logoid=q.logoid;
      if(q.tv && !st.tv){ st.tv=q.tv; startLivePriceStream(st); return; }
      paintLivePrice(st.sym, q.price, q.changePct);
    }
  }finally{ LIVE_PRICE_BUSY=false; }
}
function startLivePricePoll(){
  if(LIVE_PRICE_TIMER) return;
  LIVE_PRICE_TIMER=setInterval(tickLivePrice, 1000);
}
function startLivePriceStream(st){
  if(!st || !st.tv || typeof EventSource==='undefined'){ startLivePricePoll(); return; }
  if(LIVE_PRICE_ES){ try{ LIVE_PRICE_ES.close(); }catch(_e){} LIVE_PRICE_ES=null; }
  if(LIVE_PRICE_TIMER){ clearInterval(LIVE_PRICE_TIMER); LIVE_PRICE_TIMER=null; }
  const es=new EventSource('/tvlive?tv='+encodeURIComponent(st.tv));
  LIVE_PRICE_ES=es;
  let gotTick=false;
  es.onmessage=function(ev){
    if(!LIVE_PRICE_STATE || LIVE_PRICE_STATE!==st) return;
    if(st.myGen!==REQ_GEN || !FIN || String(FIN.ticker).toUpperCase()!==String(st.sym).toUpperCase()){ stopLivePrice(); return; }
    if(document.hidden) return;
    try{
      const j=JSON.parse(ev.data);
      if(j&&j.lp!=null){
        gotTick=true;
        paintLivePrice(st.sym, j.lp, j.chp!=null?j.chp:null);
      }
    }catch(_e){}
  };
  es.onerror=function(){
    if(LIVE_PRICE_ES!==es) return;
    try{ es.close(); }catch(_e){}
    LIVE_PRICE_ES=null;
    // Akış koparsa scanner polling yedeği
    startLivePricePoll();
  };
  // 4 sn içinde tick gelmezse yedek poll
  setTimeout(function(){
    if(LIVE_PRICE_ES===es && !gotTick){ try{ es.close(); }catch(_e){} LIVE_PRICE_ES=null; startLivePricePoll(); }
  }, 4000);
}
function startLivePrice(sym, market, euInfo, myGen, shares, tvSymbol){
  stopLivePrice();
  const st={ sym, market, euInfo:euInfo||null, myGen, shares:shares!=null?shares:null, lastPrice:null, tv:tvSymbol||null };
  LIVE_PRICE_STATE=st;
  if(!window._livePriceVisBound){
    document.addEventListener('visibilitychange', onLivePriceVisibility);
    window._livePriceVisBound=true;
  }
  if(st.tv) startLivePriceStream(st);
  else startLivePricePoll();
}
function onLivePriceVisibility(){
  if(document.hidden || !LIVE_PRICE_STATE) return;
  if(LIVE_PRICE_ES) return; // akış zaten açık
  tickLivePrice();
}
function logoOptsFromFin(){
  if(!FIN) return {};
  return { sym:FIN.ticker, market:FIN.market, euInfo:FIN.euInfo,
    ysym: FIN.market==='BIST'?FIN.ticker+'.IS':(FIN.market==='EU'&&FIN.euInfo?(FIN.euInfo.ysym||null):FIN.ticker) };
}
async function applyStockLogo(myGen, expectSym){
  if(!FIN) return;
  const expect=String(expectSym||FIN.ticker||'').toUpperCase();
  if(!expect) return;
  const market=FIN.market, euInfo=FIN.euInfo;
  const id=await resolveLogoid(expect, market, euInfo);
  if(myGen!=null && myGen!==REQ_GEN) return;
  /* Beklerken başka hisseye geçildiyse AAPL logosu AMD başlığına (veya tersi) yazılmasın */
  if(!FIN || String(FIN.ticker).toUpperCase()!==expect) return;
  FIN.logoid=id;
  const o={...logoOptsFromFin(), logoid:id};
  const rt=document.getElementById('reportTitle');
  if(rt){
    const txt=rt.getAttribute('data-title')||rt.textContent||'';
    rt.setAttribute('data-title', txt);
    rt.innerHTML=logoHtml(id, FIN.ticker, 28, o)+`<span>${safeHTML(txt)}</span>`;
  }
  const lp=document.getElementById('livePrice');
  if(lp && !lp.classList.contains('hidden')){
    const wrap=lp.querySelector('.sym-logo-wrap');
    const html=logoHtml(id, FIN.ticker, 26, o);
    if(wrap) wrap.outerHTML=html; else lp.insertAdjacentHTML('afterbegin', html);
  }
}

/* Kod eki / aday → TOP100 ülke kodu (TR, US, DE…) */
const DISC_SUFFIX_CC={
  US:'US', IS:'TR',
  L:'GB', DE:'DE', PA:'FR', AS:'NL', BR:'BE', LS:'PT', MI:'IT', MC:'ES',
  SW:'CH', ST:'SE', CO:'DK', OL:'NO', HE:'FI', VI:'AT', WA:'PL',
  KS:'KR', KQ:'KR', T:'JP', SS:'CN', SZ:'CN', HK:'HK', TW:'TW', TWO:'TW',
  TO:'CA', V:'CA', AX:'AU', SI:'SG'
};
function discCcFromCode(code){
  const eu=parseEUSymbol(String(code||'').toUpperCase());
  if(eu && DISC_SUFFIX_CC[eu.suffix]) return DISC_SUFFIX_CC[eu.suffix];
  if(/\.US$/i.test(code)) return 'US';
  if(/\.IS$/i.test(code)) return 'TR';
  return null;
}
function discCcFromPick(pick){
  if(!pick) return null;
  if(pick.market==='US') return 'US';
  if(pick.market==='BIST') return 'TR';
  return discCcFromCode(pick.code);
}

/* ---------- Ana sayfa sesli komut (bileşik: ülke+sekme+filtre/hisse; bas-konuş) ---------- */
const VOICE_FILLER=/^(aç|ac|getir|ara|hisse|bak|göster|goster|lütfen|lutfen|bir|tane|kodu|hissesini|hissesi|analiz|et|yap|için|icin|sekme|sekmesi|git|gidelim|göre|gore|olan|daki|deki)$/i;
/* TR + EN şirket adları → ticker (uzun anahtar önce eşlensin) */
const VOICE_ALIASES={
  apple:'AAPL', aapl:'AAPL',
  nvidia:'NVDA', nvda:'NVDA',
  amd:'AMD',
  microsoft:'MSFT', msft:'MSFT',
  tesla:'TSLA', tsla:'TSLA',
  google:'GOOGL', googl:'GOOGL', alphabet:'GOOGL',
  amazon:'AMZN', amzn:'AMZN',
  meta:'META', facebook:'META',
  intel:'INTC', intc:'INTC',
  netflix:'NFLX', nflx:'NFLX',
  disney:'DIS',
  boeing:'BA',
  coke:'KO', coca:'KO', cocacola:'KO', 'coca cola':'KO',
  pepsi:'PEP',
  visa:'V', mastercard:'MA',
  paypal:'PYPL',
  uber:'UBER',
  airbnb:'ABNB',
  costco:'COST',
  walmart:'WMT',
  /* SpaceX — tarayıcı sıkça Virgin Galactic (SPCE) yazar; istenen SPCX */
  spacex:'SPCX', 'space x':'SPCX', spcx:'SPCX',
  'speys eks':'SPCX', 'spey seks':'SPCX', 'space eks':'SPCX', 'speys x':'SPCX',
  'virgin galactic':'SPCE', 'virgin':'SPCE',
  thy:'THYAO', thyao:'THYAO', turkishairlines:'THYAO', 'turkish airlines':'THYAO',
  garanti:'GARAN', garan:'GARAN',
  aselsan:'ASELS', asels:'ASELS',
  bip:'BIMAS', bimas:'BIMAS',
  eregli:'EREGL', eregl:'EREGL',
  ford:'FROTO', froto:'FROTO',
  koc:'KCHOL', kchol:'KCHOL',
  samsung:'005930'
};
/* Duyulan ticker, metinde şirket adı varsa düzelt (SPCE←SpaceX vb.) */
const VOICE_MISHEAR={
  SPCE:['spacex','space x','spcx','speys','spey seks','space eks','spaceeks']
};
const VOICE_PAGES=[
  { page:'home', label:'Ana Sayfa', keys:['ana sayfa','anasayfa','home','giriş','giris','başlangıç','baslangic'] },
  { page:'stock', label:'Bilanço Analizi', keys:['bilanço analizi','bilanco analizi','bilanço','bilanco','mali tablo'] },
  { page:'private', label:'Özel Şirketler', keys:['özel şirketler','ozel sirketler','halka açılmamış şirketler','halka acilmamis sirketler','private companies'] },
  { page:'econ', label:'Ekonomik Takvim', keys:['ekonomik takvim','ekonomi takvimi','ekonomi takvim','takvim'] },
  { page:'top100', label:'İlk 100 Şirket', keys:['ilk 100 şirket','ilk yüz şirket','ilk 100','ilk yüz','top 100','top100'] },
  { page:'scan', label:'Hisse Tarayıcı', keys:['hisse tarayıcı','hisse tarayici','tarayıcı','tarayici','scanner','scan'] },
  { page:'sect', label:'Sektör Devleri', keys:['sektör devleri','sektor devleri','sektörler','sektorler'] },
  { page:'takas', label:'Aracı Kurum Dağılımı', keys:['aracı kurum dağılımı','araci kurum dagilimi','aracı kurum','araci kurum','takas'] },
  { page:'etf', label:'ETF', keys:['etf','e t f'] },
  { page:'wnews', label:'Dünya Haberleri', keys:['dünya haberleri','dunya haberleri','world news'] },
  { page:'st', label:'hisseX', keys:['hissex','hisse x','hisse iks','stocktwits','stock twits'] }
];
/* Bilanço Analizi kartları — "AMD kazançlar", "AMD özet" → hisse + karta kaydır */
const VOICE_STOCK_CARDS=[
  { id:'inputDataCard', label:'Bilanço Verisi', keys:['bilanço verisi','bilanco verisi'] },
  { id:'summaryCard', label:'Özet', keys:['özet','ozet'] },
  { id:'valCard', label:'Değerleme Oranları', keys:['değerleme oranları','degerleme oranlari','değerleme','degerleme'] },
  { id:'ydfCard', label:'Yedekler & YDF', keys:['yedekler ve ydf','yedekler ydf','yedekler','ydf'] },
  { id:'chartCard', label:'Fiyat Grafiği', keys:['fiyat grafiği','fiyat grafigi','fiyat grafik','grafik'] },
  { id:'earnCard', label:'Kazançlar', keys:['kazançlar','kazanclar','kazanç','kazanc'] },
  { id:'ownerCard', label:'Ortaklık Yapısı', keys:['ortaklık yapısı','ortaklik yapisi','ortaklık','ortaklik'] },
  { id:'techCard', label:'Teknik Görünüm', keys:['teknik görünüm','teknik gorunum','teknik analiz','teknik'] },
  { id:'incomeCard', label:'Gelir Tablosu', keys:['gelir tablosu','gelir'] },
  { id:'cashCard', label:'Nakit Akışı', keys:['nakit akışı','nakit akisi','nakit'] },
  { id:'trendCard', label:'Çok Yıllı Trend', keys:['çok yıllı trend','cok yilli trend','çok yılı trend','cok yili trend','çok yıllı','cok yilli','çok yılı','cok yili','yıllı trend','yilli trend'] },
  { id:'newsCard', label:'Güncel Haberler', keys:['güncel haberler','guncel haberler','haberler'] },
  { id:'kapCard', label:'KAP Bildirimleri', keys:['kap bildirimleri','kap'] },
  { id:'targetCard', label:'Analist Hedef Fiyatları', keys:['analist hedef fiyatları','analist hedef fiyatlari','analist hedefleri','hedef fiyatları','hedef fiyatlari','analist'] },
  { id:'sectorCard', label:'Sektör Karşılaştırması', keys:['sektör karşılaştırması','sektor karsilastirmasi','sektör karşılaştırma','sektor karsilastirma'] },
  { id:'insiderCard', label:'İçeriden Alım-Satım', keys:['içeriden alım satım','iceriden alim satim','içeriden alım-satım','iceriden alim-satim','içeriden','iceriden'] },
  { id:'ratiosCard', label:'Finansal Oranlar', keys:['finansal oranlar','oranlar'] },
  { id:'healthCard', label:'Sağlık Karnesi', keys:['sağlık karnesi','saglik karnesi'] },
  { id:'varianceCard', label:'Önemli Değişimler', keys:['önemli değişimler','onemli degisimler'] },
  { id:'verticalCard', label:'Dikey Analiz', keys:['dikey analiz'] },
  { id:'flagsCard', label:'Otomatik Yorum', keys:['otomatik yorum','risk işaretleri','risk isaretleri'] }
];
let _voicePendingCard=null;
function voiceOnStockPage(){
  return !!document.getElementById('page-stock')?.classList.contains('active');
}
function matchVoiceStockCard(s){
  let best=null, bestLen=0, bestKey='';
  for(const card of VOICE_STOCK_CARDS){
    for(const k of card.keys){
      if(k.length>bestLen && (s===k || voiceWordHas(s,k))){
        best=card; bestLen=k.length; bestKey=k;
      }
    }
  }
  return best?{ id:best.id, label:best.label, key:bestKey }:null;
}
function scrollVoiceStockCard(card){
  const wasStock=voiceOnStockPage();
  if(!wasStock) switchPage('stock');
  const el=document.getElementById(card.id);
  if(!el) return 'Kart bulunamadı';
  const go=()=>{
    el.scrollIntoView({ behavior:'smooth', block:'start' });
    el.classList.add('voice-card-flash');
    setTimeout(()=>el.classList.remove('voice-card-flash'), 1800);
  };
  /* switchPage tepeye kaydırır — kart scroll'unu sonra yap */
  setTimeout(go, wasStock ? 40 : 320);
  const hidden=el.classList.contains('hidden');
  return 'Kart: <b>'+safeHTML(card.label)+'</b>'+(hidden?' <span style="opacity:.75">(analiz yüklenince görünür)</span>':'');
}
function flushVoicePendingCard(sym){
  const p=_voicePendingCard;
  if(!p) return;
  if(p.sym && sym && String(sym).toUpperCase()!==String(p.sym).toUpperCase()){
    _voicePendingCard=null; /* eski bekleyen kart yanlış hisseye kaymasın */
    return;
  }
  _voicePendingCard=null;
  setTimeout(()=>{
    scrollVoiceStockCard(p);
    const st=voiceStatusEl();
    if(st) st.innerHTML='🎙️ <b>'+safeHTML(p.sym||'')+'</b> · Kart: <b>'+safeHTML(p.label)+'</b>';
  }, 220);
}
const VOICE_CC_EXTRA={
  abd:'US', amerika:'US', 'amerika birleşik devletleri':'US', 'amerika birlesik devletleri':'US', usa:'US', us:'US',
  ingiltere:'GB', uk:'GB', britain:'GB', 'birleşik krallık':'GB', 'birlesik krallik':'GB',
  almanya:'DE', germany:'DE',
  turkiye:'TR', türkiye:'TR', turkey:'TR', tr:'TR',
  fransa:'FR', france:'FR', italya:'IT', italy:'IT', ispanya:'ES', spain:'ES',
  hollanda:'NL', belcika:'BE', belçika:'BE', portekiz:'PT', isvicre:'CH', isviçre:'CH',
  isvec:'SE', isveç:'SE', danimarka:'DK', norvec:'NO', norveç:'NO', finlandiya:'FI',
  avusturya:'AT', polonya:'PL', 'guney kore':'KR', 'güney kore':'KR', kore:'KR',
  japonya:'JP', japan:'JP', cin:'CN', çin:'CN', 'hong kong':'HK', tayvan:'TW',
  kanada:'CA', canada:'CA', avustralya:'AU', singapur:'SG',
  'butun dunya':'GLOBAL', 'bütün dünya':'GLOBAL', dunya:'GLOBAL', dünya:'GLOBAL', global:'GLOBAL'
};
const VOICE_SECTOR_EXTRA={
  teknoloji:'teknoloji', technology:'teknoloji', tech:'teknoloji',
  yazilim:'yazilim', yazılım:'yazilim', software:'yazilim',
  banka:'banka', bankalar:'banka', banks:'banka',
  otomobil:'oto', oto:'oto', 'otomobil ureticileri':'oto',
  ilac:'ilac', ilaç:'ilac', pharma:'ilac',
  eticaret:'eticaret', 'e ticaret':'eticaret',
  saglik:'saglik', sağlık:'saglik',
  medya:'medya', sigorta:'sigorta',
  yemek:'yemek', icecek:'yemek', içecek:'yemek',
  yariiletken:'yariiletken', 'yari iletken':'yariiletken', 'yarı iletken':'yariiletken', semiconductor:'yariiletken',
  finans:'finans', petrol:'petrol', yatirim:'yatirim', yatırım:'yatirim',
  telekom:'telekom', perakende:'perakende', internet:'internet',
  oyun:'oyun', 'video oyunu':'oyun', gaming:'oyun',
  ai:'ai', 'yapay zeka':'ai', 'yapay zekâ':'ai'
};
/* Hisse Tarayıcı #scanSort — tüm seçenekler (uzun anahtar önce) */
const VOICE_SCAN_SORT={
  'piyasa degeri artan':'mcap-asc', 'piyasa değeri artan':'mcap-asc',
  'piyasa degeri azalan':'mcap-desc', 'piyasa değeri azalan':'mcap-desc',
  'piyasa degeri yukselen':'mcap-asc', 'piyasa değeri yükselen':'mcap-asc',
  'piyasa degeri dusen':'mcap-desc', 'piyasa değeri düşen':'mcap-desc',
  'piyasa degeri':'mcap-desc', 'piyasa değeri':'mcap-desc', 'market cap':'mcap-desc',
  'gunluk degisim':'chg-desc', 'günlük değişim':'chg-desc', 'gunluk degisiklik':'chg-desc',
  'degisim':'chg-desc', 'değişim':'chg-desc', 'yuzde degisim':'chg-desc', 'yüzde değişim':'chg-desc',
  'kod a z':'name-asc', 'kod az':'name-asc', 'isme gore':'name-asc', 'isme göre':'name-asc',
  'alfabetik':'name-asc', 'a dan z':'name-asc', 'a z':'name-asc',
  'f k artan':'pe-asc', 'fk artan':'pe-asc', 'f/k':'pe-asc', 'fk':'pe-asc', 'fiyat kazanc':'pe-asc', 'fiyat kazanç':'pe-asc',
  'roe':'roe-desc', 'ozkaynak karliligi':'roe-desc', 'özkaynak karlılığı':'roe-desc',
  'temettu':'div-desc', 'temettü':'div-desc', 'dividend':'div-desc',
  'rsi artan':'rsi-asc', 'rsi yukselen':'rsi-asc', 'rsi yükselen':'rsi-asc',
  'rsi azalan':'rsi-desc', 'rsi dusen':'rsi-desc', 'rsi düşen':'rsi-desc', 'rsi':'rsi-desc',
  'quant skor':'quant-desc', 'quant':'quant-desc', 'kuant':'quant-desc',
  '3a getiri':'perf3m-desc', '3 ay getiri':'perf3m-desc', 'uc ay getiri':'perf3m-desc', 'üç ay getiri':'perf3m-desc',
  'getiri':'perf3m-desc', 'performans':'perf3m-desc',
  'volatilite':'vol-asc', 'oynaklik':'vol-asc', 'oynaklık':'vol-asc',
  'beta':'beta-asc',
  'ydf':'ydf-desc', 'yabanci':'ydf-desc', 'yabancı':'ydf-desc',
  'yaklasan kazanc':'earn-asc', 'yaklaşan kazanç':'earn-asc', 'kazanc tarihi':'earn-asc', 'kazanç tarihi':'earn-asc',
  'bilanco tarihi':'earn-asc', 'bilanço tarihi':'earn-asc', 'earnings':'earn-asc'
};
const VOICE_SCAN_SORT_LABEL={
  'mcap-desc':'Piyasa değeri ↓', 'mcap-asc':'Piyasa değeri ↑',
  'chg-desc':'Günlük değişim ↓', 'name-asc':'Kod A→Z',
  'pe-asc':'F/K ↑', 'roe-desc':'ROE ↓', 'div-desc':'Temettü ↓',
  'rsi-desc':'RSI ↓', 'rsi-asc':'RSI ↑', 'quant-desc':'Quant skor ↓',
  'perf3m-desc':'3A getiri ↓', 'vol-asc':'Volatilite ↑', 'beta-asc':'Beta ↑',
  'ydf-desc':'YDF ↓', 'earn-asc':'Yaklaşan kazanç tarihi'
};
/* Hisse Tarayıcı piyasa değeri dilimleri (Mega/Large/Mid/Small/Micro/Tümü) */
const VOICE_SCAN_CAP={
  'mega cap':'mega', mega:'mega',
  'large cap':'large', large:'large', buyuk:'large', büyük:'large',
  'mid cap':'mid', mid:'mid', middle:'mid', orta:'mid',
  'small cap':'small', small:'small', kucuk:'small', küçük:'small',
  'micro cap':'micro', micro:'micro', mikro:'micro',
  tumu:'all', tümü:'all', hepsi:'all', all:'all'
};
const VOICE_SCAN_CAP_LABEL={ all:'Tümü', mega:'Mega', large:'Large', mid:'Mid', small:'Small', micro:'Micro' };
/* Trend (SMA) + Quant filtre chip'leri */
const VOICE_SCAN_MA={
  'fiyat sma 50':'sma50', 'fiyat sma50':'sma50', 'sma 50':'sma50', sma50:'sma50',
  '50 gunluk':'sma50', '50 günlük':'sma50', 'elli gunluk':'sma50',
  'fiyat sma 200':'sma200', 'fiyat sma200':'sma200', 'sma 200':'sma200', sma200:'sma200',
  '200 gunluk':'sma200', '200 günlük':'sma200'
};
const VOICE_SCAN_MA_LABEL={ sma50:'Fiyat > SMA50', sma200:'Fiyat > SMA200' };
const VOICE_SCAN_QF={
  'rsi 30':'rsi_os', 'rsi ≤ 30':'rsi_os', 'rsi <= 30':'rsi_os', 'rsi dusuk':'rsi_os', 'rsi düşük':'rsi_os',
  'asiri satim':'rsi_os', 'aşırı satım':'rsi_os', oversold:'rsi_os',
  'rsi 70':'rsi_ob', 'rsi ≥ 70':'rsi_ob', 'rsi >= 70':'rsi_ob', 'rsi yuksek':'rsi_ob', 'rsi yüksek':'rsi_ob',
  'asiri alim':'rsi_ob', 'aşırı alım':'rsi_ob', overbought:'rsi_ob',
  'momentum plus':'mom', 'momentum+':'mom', momentum:'mom',
  value:'value', deger:'value', değer:'value',
  quality:'quality', kalite:'quality',
  'hacim artan':'relvol', 'yuksek hacim':'relvol', 'yüksek hacim':'relvol', hacim:'relvol', relvol:'relvol'
};
const VOICE_SCAN_QF_LABEL={
  rsi_os:'RSI ≤ 30', rsi_ob:'RSI ≥ 70', mom:'Momentum+',
  value:'Value', quality:'Quality', relvol:'Hacim ↑'
};
const VOICE_LISTEN_MS=20000; /* konuşulmazsa en fazla 20 sn dinle */
let _homeVoiceRec=null, _homeVoiceOn=false, _homeVoiceEpoch=0;
let _homeVoiceTimer=null, _homeVoiceDeadline=0, _homeVoiceGotResult=false;
let _homeVoiceRestartT=null;
let _voiceCcMap=null, _voiceSectMap=null;

function getSpeechRecognition(){
  return window.SpeechRecognition||window.webkitSpeechRecognition||null;
}
function normalizeVoiceText(raw){
  return String(raw||'').toLowerCase()
    .replace(/[^\p{L}\p{N}.\s-]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function voiceWordHas(s, phrase){
  if(!phrase) return false;
  const esc=phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(^|\\s)'+esc+'(\\s|$)').test(s);
}
function voiceCcMap(){
  if(_voiceCcMap) return _voiceCcMap;
  const m=Object.assign({}, VOICE_CC_EXTRA);
  if(typeof ECON_COUNTRIES!=='undefined'){
    ECON_COUNTRIES.forEach(([cc,name])=>{ m[normalizeVoiceText(name)]=cc; });
  }
  _voiceCcMap=m;
  return m;
}
function voiceSectMap(){
  if(_voiceSectMap) return _voiceSectMap;
  const m=Object.assign({}, VOICE_SECTOR_EXTRA);
  if(typeof SECT_SECTORS!=='undefined'){
    SECT_SECTORS.forEach(([id,,name])=>{
      m[normalizeVoiceText(name)]=id;
      m[normalizeVoiceText(id)]=id;
    });
  }
  _voiceSectMap=m;
  return m;
}
function voiceLongestMatch(s, map){
  let best=null, bestLen=0, bestKey='';
  for(const [k,v] of Object.entries(map)){
    if(k.length>bestLen && voiceWordHas(s,k)){ best=v; bestLen=k.length; bestKey=k; }
  }
  return best?{ value:best, key:bestKey, len:bestLen }:null;
}
/* Birden fazla filtre (SMA50 + RSI30 + Momentum…) */
function voiceAllMatches(s, map){
  const hits=[];
  const keys=Object.keys(map).sort((a,b)=>b.length-a.length);
  let left=(' '+s+' ');
  for(const k of keys){
    const esc=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp('(^|\\s)'+esc+'(\\s|$)');
    if(re.test(left)){
      const v=map[k];
      if(!hits.some(h=>h.value===v)) hits.push({ value:v, key:k });
      left=left.replace(re,' ');
    }
  }
  return hits;
}
function extractVoiceTicker(s){
  if(!s) return '';
  const joined=s.replace(/[\s.-]+/g,'');
  if(VOICE_ALIASES[joined]) return correctVoiceMishear(s, VOICE_ALIASES[joined]);
  if(VOICE_ALIASES[s]) return correctVoiceMishear(s, VOICE_ALIASES[s]);
  /* Uzun şirket adları (space x, coca cola…) */
  const aliasKeys=Object.keys(VOICE_ALIASES).sort((a,b)=>b.length-a.length);
  for(const k of aliasKeys){
    if(k.includes(' ') && (s===k || voiceWordHas(s,k))) return correctVoiceMishear(s, VOICE_ALIASES[k]);
  }
  const parts=s.split(' ').filter(w=>w && !VOICE_FILLER.test(w));
  for(const w of parts){
    const key=w.replace(/[.-]/g,'');
    if(VOICE_ALIASES[key]||VOICE_ALIASES[w]) return correctVoiceMishear(s, VOICE_ALIASES[key]||VOICE_ALIASES[w]);
  }
  for(const w of parts){
    const tok=w.toUpperCase().replace(/[^A-Z0-9.]/g,'');
    if(tok && /^[A-Z0-9]{1,6}(\.[A-Z]{1,3})?$/.test(tok)) return correctVoiceMishear(s, tok);
  }
  if(parts.length>=2 && parts.length<=6 && parts.every(p=>/^[\p{L}]$/u.test(p))){
    const spelled=parts.map(p=>p.toLocaleUpperCase('en-US')).join('').replace(/[^A-Z0-9]/g,'');
    if(spelled.length>=1 && spelled.length<=6) return correctVoiceMishear(s, spelled);
  }
  return '';
}
function correctVoiceMishear(raw, sym){
  const s=normalizeVoiceText(raw);
  const u=String(sym||'').toUpperCase();
  const hints=VOICE_MISHEAR[u];
  if(hints){
    for(const h of hints){
      if(s===h || voiceWordHas(s,h) || s.includes(h)){
        /* SpaceX / SPCX denmiş → SPCE'yi SPCX yap */
        if(u==='SPCE') return 'SPCX';
      }
    }
  }
  /* Alternatifler birleşik metinde spacex geçiyorsa SPCE→SPCX */
  if(u==='SPCE' && /space\s*x|spacex|spcx|speys/.test(s)) return 'SPCX';
  return u;
}
/* Birden fazla hisse kodu (karşılaştırma) */
function extractVoiceTickersAll(s){
  if(!s) return [];
  const out=[], seen=new Set();
  const add=t=>{
    const u=correctVoiceMishear(s, String(t||'').toUpperCase());
    if(!u||seen.has(u)) return;
    seen.add(u); out.push(u);
  };
  const parts=String(s).split(/[\s,;]+/).filter(w=>w && !VOICE_FILLER.test(w));
  /* Önce çok kelimeli alias (space x…) */
  const aliasKeys=Object.keys(VOICE_ALIASES).sort((a,b)=>b.length-a.length);
  let left=' '+normalizeVoiceText(s)+' ';
  for(const k of aliasKeys){
    if(!k.includes(' ')) continue;
    const esc=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp('(^|\\s)'+esc+'(\\s|$)');
    if(re.test(left)){
      add(VOICE_ALIASES[k]);
      left=left.replace(re,' ');
    }
  }
  for(const w of left.split(/[\s,;]+/).filter(Boolean)){
    if(VOICE_FILLER.test(w)) continue;
    const key=w.replace(/[.-]/g,'');
    if(VOICE_ALIASES[key]||VOICE_ALIASES[w]){ add(VOICE_ALIASES[key]||VOICE_ALIASES[w]); continue; }
    const tok=w.toUpperCase().replace(/[^A-Z0-9.]/g,'');
    if(tok && /^[A-Z0-9]{1,6}(\.[A-Z]{1,3})?$/.test(tok)) add(tok);
  }
  return out;
}
/* "AMD NVDA çeyreklik karşılaştır" / "AMD NVDA AMZN yıllık karşılaştır" */
function parseVoiceCompare(s){
  if(!/\b(kar[sş][ıi]la[sş]t[ıi]r(?:ma)?|compare|k[ıi]yasla)\b/.test(s)) return null;
  /* "sektör karşılaştırması" kartı — fiil değil, dokunma */
  if(/\bsekt[oö]r\b/.test(s) && !/\b(kar[sş][ıi]la[sş]t[ıi]r|compare|k[ıi]yasla)\b/.test(s)) return null;
  let mode=null;
  if(/\b(y[ıi]ll[ıi]k|annual)\b/.test(s)) mode='annual';
  else if(/\b([cç]eyreklik|quarter(?:ly)?)\b/.test(s)) mode='quarter';
  const rest=s
    .replace(/\b(kar[sş][ıi]la[sş]t[ıi]r(?:ma)?|compare|k[ıi]yasla)\b/g,' ')
    .replace(/\b(y[ıi]ll[ıi]k|annual|[cç]eyreklik|quarter(?:ly)?)\b/g,' ')
    .replace(/\b([sş]irket)\b/g,' ')
    .replace(/\s+/g,' ').trim();
  const syms=extractVoiceTickersAll(rest).slice(0,4);
  if(syms.length<2) return null;
  return { type:'compare', syms, mode: mode||'quarter' };
}
function runVoiceCompare(intent){
  switchPage('stock');
  const inp=document.getElementById('cmpTickers');
  const per=document.getElementById('cmpPeriod');
  if(inp) inp.value=intent.syms.join(', ');
  if(per) per.value=intent.mode==='quarter'?'quarter':'annual';
  scrollVoiceStockCard({ id:'cmpCard', label:'Şirket Karşılaştırma' });
  compareTickers();
  const modeLbl=intent.mode==='quarter'?t('period_quarter'):t('period_annual');
  return 'Karşılaştır: <b>'+safeHTML(intent.syms.join(', '))+'</b> · '+modeLbl;
}
/* Varsayılan çeyreklik; "AMD yıllık" → yıllık */
function parseVoicePeriod(s){
  if(/\b(y[ıi]ll[ıi]k|annual)\b/.test(s)) return 'annual';
  if(/\b([cç]eyreklik|quarter(?:ly)?)\b/.test(s)) return 'quarter';
  return null;
}
function stripVoicePeriod(s){
  return String(s||'')
    .replace(/\b(y[ıi]ll[ıi]k|annual|[cç]eyreklik|quarter(?:ly)?)\b/g,' ')
    .replace(/\s+/g,' ').trim();
}
function applyVoicePeriod(mode){
  const m=mode==='annual'?'annual':'quarter';
  const hp=document.getElementById('homePeriod');
  const pt=document.getElementById('periodType');
  if(hp) hp.value=m;
  if(pt) pt.value=m;
  return m;
}
function voicePeriodLabel(mode){
  return mode==='annual'?t('period_annual'):t('period_quarter');
}
function parseVoiceIntent(raw){
  let s=normalizeVoiceText(raw);
  if(!s) return null;
  s=s.replace(/\b(aç|ac|getir|git|gidelim|göster|goster|sekmesi|sekme|lütfen|lutfen|kart|karta)\b/g,' ')
    .replace(/\s+/g,' ').trim();
  if(!s) return null;

  /* "AMD NVDA çeyreklik karşılaştır" — kart/sekmeden önce */
  const cmpIntent=parseVoiceCompare(s);
  if(cmpIntent) return cmpIntent;

  const period=parseVoicePeriod(s)||'quarter';
  const sNP=stripVoicePeriod(s);

  /* "AMD kazançlar" / "AMD yıllık özet" — hisse + kart (sekme/ülke eşlemesinden önce) */
  const cardHit=matchVoiceStockCard(sNP);
  if(cardHit){
    const rest=sNP.split(cardHit.key).join(' ').replace(/\s+/g,' ').trim();
    const cardSym=extractVoiceTicker(rest);
    if(cardSym) return { type:'card', id:cardHit.id, label:cardHit.label, sym:cardSym, mode:period };
    if(voiceOnStockPage()) return { type:'card', id:cardHit.id, label:cardHit.label };
  }

  let page=null, pageLabel='', pageKey='', pageLen=0;
  for(const row of VOICE_PAGES){
    for(const k of row.keys){
      if(k.length>pageLen && (s===k || s.includes(k))){
        page=row.page; pageLabel=row.label; pageKey=k; pageLen=k.length;
      }
    }
  }
  /* "sektör" tek başına da Sektör Devleri */
  if(!page && (voiceWordHas(s,'sektör') || voiceWordHas(s,'sektor'))){
    page='sect'; pageLabel='Sektör Devleri'; pageKey='sektör'; pageLen=6;
  }

  const ccHit=voiceLongestMatch(s, voiceCcMap());
  const secHit=voiceLongestMatch(s, voiceSectMap());
  const capHit=voiceLongestMatch(s, VOICE_SCAN_CAP);
  const maHits=voiceAllMatches(s, VOICE_SCAN_MA);
  const qfHits=voiceAllMatches(s, VOICE_SCAN_QF);
  /* Filtre anahtarlarını çıkarıp sırala eşle — "rsi 30" sıralama RSI olmasın */
  let sForSort=s;
  for(const h of [...maHits, ...qfHits]) sForSort=sForSort.split(h.key).join(' ');
  sForSort=sForSort.replace(/\s+/g,' ').trim();
  const sortHit=voiceLongestMatch(sForSort, VOICE_SCAN_SORT);
  const cc=ccHit?ccHit.value:null;
  const sector=secHit?secHit.value:null;
  const saidSirala=/\bs[ıi]rala\b/.test(s) || /\bs[ıi]ralama\b/.test(s);
  const wantSort=!!sortHit || saidSirala;
  const wantScan=wantSort || !!capHit || maHits.length>0 || qfHits.length>0;

  let rest=sNP;
  if(pageKey) rest=rest.split(pageKey).join(' ');
  if(ccHit) rest=rest.split(ccHit.key).join(' ');
  if(secHit) rest=rest.split(secHit.key).join(' ');
  if(sortHit) rest=rest.split(sortHit.key).join(' ');
  if(capHit) rest=rest.split(capHit.key).join(' ');
  for(const h of [...maHits, ...qfHits]) rest=rest.split(h.key).join(' ');
  rest=rest.replace(/\bs[ıi]rala(ma)?\b/g,' ').replace(/\s+/g,' ').trim();
  /* Yalnız kalan metinden hisse çıkar — tam cümleden çekmek "ABD"yi hisse sanır */
  const sym=extractVoiceTicker(rest);

  if(!page){
    if(sector){ page='sect'; pageLabel='Sektör Devleri'; }
    else if(wantScan || (cc && saidSirala)){ page='scan'; pageLabel='Hisse Tarayıcı'; }
    else if(cc && /\btakvim\b/.test(s)){ page='econ'; pageLabel='Ekonomik Takvim'; }
    else if(cc && /\bilk\s*(100|y[uü]z)\b/.test(s)){ page='top100'; pageLabel='İlk 100 Şirket'; }
    else if(sym && /\b(arac[iı]\s*kurum|takas)\b/.test(s)){ page='takas'; pageLabel='Aracı Kurum Dağılımı'; }
    else if(sym && /\b(hissex|hisse\s*x|stock\s*twits|stocktwits)\b/.test(s)){ page='st'; pageLabel='hisseX'; }
    else if(sym) return { type:'search', sym, label:sym, mode:period };
    else return null;
  }

  /* "AMD bilanço" / "NVDA bilanço analizi" → sekme değil, hisse ara */
  if(page==='stock' && sym){
    return { type:'search', sym, label:sym, mode:period };
  }

  let sort=null, cap=null, ma=[], qf=[];
  if(page==='scan'){
    sort=sortHit ? sortHit.value : (wantSort || cc || capHit || maHits.length || qfHits.length ? 'mcap-desc' : null);
    cap=capHit ? capHit.value : 'all';
    ma=maHits.map(h=>h.value);
    qf=qfHits.map(h=>h.value);
  }

  return {
    type:'page', page, pageLabel,
    cc: (cc==='GLOBAL' && page!=='sect') ? null : cc,
    sector: page==='sect' ? sector : null,
    sym: (page==='takas'||page==='st') ? sym : null,
    sort, cap, ma, qf
  };
}
function runVoiceIntent(intent){
  if(!intent) return '';
  if(intent.type==='compare'){
    return runVoiceCompare(intent);
  }
  if(intent.type==='card'){
    if(intent.sym){
      const want=String(intent.sym).toUpperCase();
      const mode=applyVoicePeriod(intent.mode||'quarter');
      const results=document.getElementById('results');
      const same=FIN && String(FIN.ticker).toUpperCase()===want
        && FIN.mode===mode
        && results && !results.classList.contains('hidden');
      if(same){
        return '<b>'+safeHTML(want)+'</b> · '+voicePeriodLabel(mode)+' · '+scrollVoiceStockCard(intent);
      }
      _voicePendingCard={ id:intent.id, label:intent.label, sym:want };
      const inp=document.getElementById('homeTicker');
      if(inp) inp.value=want;
      homeSearch(want);
      return 'Duyulan: <b>'+safeHTML(want)+'</b> · '+voicePeriodLabel(mode)+' · <b>'+safeHTML(intent.label)+'</b>';
    }
    return scrollVoiceStockCard(intent);
  }
  if(intent.type==='search'){
    const mode=applyVoicePeriod(intent.mode||'quarter');
    const inp=document.getElementById('homeTicker');
    if(inp) inp.value=intent.sym;
    homeSearch(intent.sym);
    return 'Duyulan: <b>'+safeHTML(intent.sym)+'</b> · '+voicePeriodLabel(mode);
  }
  const bits=[intent.pageLabel||intent.page];
  switch(intent.page){
    case 'econ':{
      switchPage('econ');
      if(intent.cc){
        if(!ECON_PANELS[intent.cc]) toggleEconCountry(intent.cc);
        const nm=(ECON_COUNTRIES.find(x=>x[0]===intent.cc)||[])[1]||intent.cc;
        bits.unshift(nm);
      }
      break;
    }
    case 'top100':{
      switchPage('top100');
      if(intent.cc){
        if(TOP100_OPEN!==intent.cc) toggleTopCountry(intent.cc);
        const nm=(ECON_COUNTRIES.find(x=>x[0]===intent.cc)||[])[1]||intent.cc;
        bits.unshift(nm);
      }
      break;
    }
    case 'sect':{
      switchPage('sect');
      const cc=intent.cc||'GLOBAL';
      selectSectCountry(cc);
      if(intent.sector){
        if(SECT_OPEN!==intent.sector) toggleSectSector(intent.sector);
        else loadSectPanel();
        const sn=t('sect_'+intent.sector)||intent.sector;
        bits.push(sn);
      }
      const nm=ccName(cc);
      bits.unshift(nm);
      break;
    }
    case 'takas':{
      switchPage('takas');
      if(intent.sym){
        const inp=document.getElementById('takasTicker');
        if(inp) inp.value=intent.sym;
        loadTakasAkd();
        bits.unshift(intent.sym);
      }
      break;
    }
    case 'st':{
      switchPage('st');
      if(intent.sym){
        const inp=document.getElementById('stTicker');
        if(inp) inp.value=intent.sym;
        loadStockTwits();
        bits.unshift(intent.sym);
      }
      break;
    }
    case 'scan':{
      switchPage('scan');
      const sortEl=document.getElementById('scanSort');
      const sortVal=intent.sort||'mcap-desc';
      const capVal=intent.cap||'all';
      const maList=Array.isArray(intent.ma)?intent.ma:[];
      const qfList=Array.isArray(intent.qf)?intent.qf:[];
      if(sortEl) sortEl.value=sortVal;
      setScanCapsVoice(capVal);
      setScanMaVoice(maList);
      setScanQfVoice(qfList);
      const cc=intent.cc||'TR';
      selectScanCountry(cc);
      /* YDF sırası TR dışı ülkede gizlenebilir — selectScanCountry sonrası tekrar yaz */
      if(sortEl && sortVal==='ydf-desc' && sortEl.querySelector('option[value="ydf-desc"]')){
        sortEl.value='ydf-desc';
        onScanSortChange();
      }
      const nm=(ECON_COUNTRIES.find(x=>x[0]===cc)||[])[1]||cc;
      bits.unshift(nm);
      if(capVal && capVal!=='all') bits.push(VOICE_SCAN_CAP_LABEL[capVal]||capVal);
      maList.forEach(id=> bits.push(VOICE_SCAN_MA_LABEL[id]||id));
      qfList.forEach(id=> bits.push(VOICE_SCAN_QF_LABEL[id]||id));
      bits.push(VOICE_SCAN_SORT_LABEL[sortVal]||sortVal);
      break;
    }
    default:
      switchPage(intent.page);
  }
  return 'Açıldı: <b>'+safeHTML(bits.filter(Boolean).join(' · '))+'</b>';
}
function voiceTranscriptsFromEvent(ev){
  const out=[];
  try{
    const ri=(typeof ev.resultIndex==='number')?ev.resultIndex:0;
    for(let r=ri;r<ev.results.length;r++){
      const res=ev.results[r];
      if(!res||res.isFinal===false) continue;
      for(let i=0;i<res.length;i++){
        const t=(res[i]&&res[i].transcript)||'';
        if(t && !out.includes(t)) out.push(t);
      }
    }
  }catch(_e){}
  return out;
}
/* Tüm alternatifleri puanla — TR/EN şirket adı, CIK, yanlış duyum düzeltmesi */
function scoreVoiceCandidate(transcript, altIndex){
  const raw=String(transcript||'');
  const s=normalizeVoiceText(raw);
  let score=0;
  const aliasKeys=Object.keys(VOICE_ALIASES).sort((a,b)=>b.length-a.length);
  for(const k of aliasKeys){
    if(s===k || voiceWordHas(s,k) || (k.length>=4 && s.includes(k))){
      score+=120+k.length*2;
      break;
    }
  }
  /* SpaceX / SPCX ipucu — SPCE alternatifinden daha yüksek tut */
  if(/spacex|space\s*x|spcx|speys/.test(s)) score+=80;
  const intent=parseVoiceIntent(raw);
  if(!intent) return { transcript:raw, intent:null, score:-1000+altIndex };
  score+=50;
  if(intent.type==='compare') score+=40;
  if(intent.type==='card') score+=35;
  if(intent.type==='page') score+=25;
  if(intent.type==='search'||intent.type==='card'){
    const sym=intent.sym;
    if(sym){
      if((window.CIK_MAP||{})[sym]) score+=45;
      if(Object.values(VOICE_ALIASES).includes(sym)) score+=35;
      if(sym==='SPCX' && /spacex|space|spcx|speys/.test(s)) score+=60;
      if(sym==='SPCE' && !/virgin/.test(s)) score-=25; /* SpaceX sanılıp SPCE yazılmış olabilir */
    }
  }
  score+=Math.min(s.length, 18);
  score-=altIndex*2; /* aynı puanda ilk alternatif */
  return { transcript:raw, intent, score };
}
function handleHomeVoiceCommand(transcripts, st){
  /* Tüm alternatifleri birleştir — "SPCE" + "space x" birlikte gelsin diye */
  const bag=transcripts.slice();
  const joined=normalizeVoiceText(transcripts.join(' '));
  if(joined && !bag.some(t=>normalizeVoiceText(t)===joined)) bag.push(transcripts.join(' '));

  const ranked=bag.map((t,i)=>scoreVoiceCandidate(t,i))
    .filter(r=>r.intent)
    .sort((a,b)=>b.score-a.score);
  if(!ranked.length) return false;
  const best=ranked[0];
  /* Ortak çanta: spacex geçiyorsa search/card SPCE → SPCX */
  if(best.intent && best.intent.sym==='SPCE' && /spacex|space\s*x|spcx|speys/.test(joined)){
    best.intent=Object.assign({}, best.intent, { sym:'SPCX', label: best.intent.label==='SPCE'?'SPCX':best.intent.label });
  }
  if(best.intent && Array.isArray(best.intent.syms)){
    best.intent=Object.assign({}, best.intent, {
      syms:best.intent.syms.map(sy=> (sy==='SPCE' && /spacex|space\s*x|spcx|speys/.test(joined)) ? 'SPCX' : sy)
    });
  }
  const msg=runVoiceIntent(best.intent);
  if(st){ st.style.color=''; st.innerHTML='🎙️ '+msg; }
  return true;
}
function voiceStatusEl(){
  if(voiceOnStockPage()){
    return document.getElementById('fetchStatus')||document.getElementById('homeSearchStatus');
  }
  return document.getElementById('homeSearchStatus')||document.getElementById('fetchStatus');
}
function setHomeVoiceUi(on){
  _homeVoiceOn=!!on;
  document.querySelectorAll('.voice-mic').forEach(btn=>{
    btn.classList.toggle('listening', _homeVoiceOn);
    const stock=btn.id==='stockVoiceBtn';
    btn.title=_homeVoiceOn?'Dinleniyor… durdur'
      :(stock?'Sesli komut — örn. AMD kazançlar':'Sesli komut (hisse, kart veya sekme)');
    btn.setAttribute('aria-pressed', _homeVoiceOn?'true':'false');
  });
}
function clearHomeVoiceTimer(){
  if(_homeVoiceTimer){ clearTimeout(_homeVoiceTimer); _homeVoiceTimer=null; }
}
function clearHomeVoiceRestart(){
  if(_homeVoiceRestartT){ clearTimeout(_homeVoiceRestartT); _homeVoiceRestartT=null; }
}
function stopHomeVoice(){
  clearHomeVoiceTimer();
  clearHomeVoiceRestart();
  _homeVoiceGotResult=true; /* yeniden başlatmayı engelle */
  _homeVoiceEpoch++; /* gecikmiş onresult bu oturuma ait sayılmasın */
  try{ _homeVoiceRec&&_homeVoiceRec.abort(); }catch(_e){
    try{ _homeVoiceRec&&_homeVoiceRec.stop(); }catch(_e2){}
  }
  _homeVoiceRec=null;
  setHomeVoiceUi(false);
}
function toggleHomeVoice(){
  const SR=getSpeechRecognition();
  const st=voiceStatusEl();
  if(!SR){
    if(st) st.textContent=t('voice_unsupported');
    return;
  }
  if(_homeVoiceOn){ stopHomeVoice(); return; }

  /* REQ_GEN artırma — yalnız yeni hisse aramasında (mic kart kaydırınca canlı fiyatı kesmesin) */
  const epoch=++_homeVoiceEpoch;
  const onStock=voiceOnStockPage();
  _homeVoiceGotResult=false;
  _homeVoiceDeadline=Date.now()+VOICE_LISTEN_MS;
  clearHomeVoiceTimer();
  clearHomeVoiceRestart();
  _homeVoiceTimer=setTimeout(()=>{
    if(epoch!==_homeVoiceEpoch || _homeVoiceGotResult) return;
    _homeVoiceGotResult=true;
    clearHomeVoiceRestart();
    try{ _homeVoiceRec&&_homeVoiceRec.abort(); }catch(_e){}
    _homeVoiceRec=null;
    setHomeVoiceUi(false);
    if(st) st.textContent=t('voice_no_speech');
  }, VOICE_LISTEN_MS);

  const listenHint=onStock?t('voice_listening_hint_stock'):t('voice_listening_hint_home');

  try{ _homeVoiceRec&&_homeVoiceRec.abort(); }catch(_e){}
  _homeVoiceRec=null;

  function scheduleArmRec(ms){
    clearHomeVoiceRestart();
    _homeVoiceRestartT=setTimeout(()=>{
      _homeVoiceRestartT=null;
      armRec();
    }, ms);
  }

  function armRec(){
    if(epoch!==_homeVoiceEpoch || _homeVoiceGotResult) return;
    if(Date.now()>=_homeVoiceDeadline){
      setHomeVoiceUi(false);
      if(st) st.textContent=t('voice_no_speech');
      return;
    }
    const rec=new SR();
    _homeVoiceRec=rec;
    rec.lang=(typeof voiceSpeechLang==='function'?voiceSpeechLang():'tr-TR');
    rec.interimResults=false;
    rec.maxAlternatives=10;
    rec.continuous=false;
    rec.onstart=()=>{
      if(epoch!==_homeVoiceEpoch || _homeVoiceRec!==rec) return;
      setHomeVoiceUi(true);
      if(st){ st.style.color=''; st.textContent=listenHint; }
    };
    /* Tarayıcı ~5–8 sn no-speech ile kapanır — 20 sn dolana kadar yeniden aç */
    rec.onend=()=>{
      if(epoch!==_homeVoiceEpoch || _homeVoiceGotResult || _homeVoiceRec!==rec) return;
      if(Date.now()<_homeVoiceDeadline) scheduleArmRec(100);
      else{
        setHomeVoiceUi(false);
        if(st) st.textContent=t('voice_no_speech');
      }
    };
    rec.onerror=e=>{
      if(epoch!==_homeVoiceEpoch || _homeVoiceRec!==rec) return;
      const err=e&&e.error;
      /* no-speech / aborted → onend yeniden başlatır (süre bitene kadar) */
      if(err==='no-speech'||err==='aborted') return;
      clearHomeVoiceTimer();
      clearHomeVoiceRestart();
      _homeVoiceGotResult=true;
      setHomeVoiceUi(false);
      if(!st) return;
      if(err==='not-allowed'||err==='service-not-allowed')
        st.textContent=t('voice_mic_denied');
      else
        st.textContent=t('voice_err');
    };
    rec.onresult=ev=>{
      if(epoch!==_homeVoiceEpoch || _homeVoiceRec!==rec) return;
      _homeVoiceGotResult=true;
      clearHomeVoiceTimer();
      clearHomeVoiceRestart();
      const transcripts=voiceTranscriptsFromEvent(ev);
      setHomeVoiceUi(false);
      try{ rec.stop(); }catch(_e){}
      if(epoch!==_homeVoiceEpoch) return;
      if(!handleHomeVoiceCommand(transcripts, st)){
        if(st) st.textContent=onStock?t('voice_not_understood_stock'):t('voice_not_understood_home');
      }
    };
    try{ rec.start(); }
    catch(_e){
      if(Date.now()<_homeVoiceDeadline) scheduleArmRec(200);
      else{
        clearHomeVoiceTimer();
        clearHomeVoiceRestart();
        if(st) st.textContent=t('voice_start_fail');
        setHomeVoiceUi(false);
      }
    }
  }
  armRec();
}
function initHomeVoice(){
  const ok=!!getSpeechRecognition();
  document.querySelectorAll('.voice-mic').forEach(btn=>{
    if(!ok){
      btn.hidden=true;
      btn.title=t('voice_unsupported');
    }
  });
}
window.toggleHomeVoice=toggleHomeVoice;

/* Ana sayfa: kod ara → ülkeyi bul → o borsanın Bugünün Fırsatları’nı göster (önceden gizli)
   forcedSym: sesli aramada duyulan kod (input’taki eski değere güvenilmez) */
async function homeSearch(forcedSym){
  const v=(forcedSym!=null&&forcedSym!==''
    ? String(forcedSym)
    : (document.getElementById('homeTicker').value||'')).trim();
  const st=document.getElementById('homeSearchStatus');
  if(!v){ if(st) st.textContent=t('status_enter_code'); return; }
  document.getElementById('periodType').value=document.getElementById('homePeriod').value;
  const sym=v.toUpperCase().trim();
  const inp=document.getElementById('homeTicker');
  if(inp) inp.value=sym;
  /* Her aramada nesil artır — önceki detect/fetch sonucu yeni kodu ezmesin */
  const myGen=++REQ_GEN;
  if(st){ st.style.color=''; st.innerHTML='⏳ <b>'+safeHTML(sym)+'</b> '+t('status_searching_sym'); }

  let pickCode=null, cc=null;
  const cikMap=window.CIK_MAP||{};

  if(/\.[A-Z]{1,3}$/.test(sym)){
    pickCode=sym;
    cc=discCcFromCode(sym);
  }else if(cikMap[sym]){
    /* ABD listesinde bilinen kod → TradingView borsa taramasını atla (AMD, AAPL…) */
    pickCode=sym+'.US';
    cc='US';
  }else{
    const { cands }=await detectBareMarkets(sym);
    if(myGen!==REQ_GEN) return;
    if(!cands.length){
      _voicePendingCard=null;
      if(st) st.innerHTML='✕ <b>'+safeHTML(sym)+'</b> '+t('home_not_found');
      return;
    }
    const pick=cands.find(c=>c.market==='US')||cands.find(c=>c.market==='BIST')||cands[0];
    pickCode=pick.code;
    cc=discCcFromPick(pick);
  }

  if(myGen!==REQ_GEN) return;
  if(!cc || !TOP100_MARKETS[cc]){
    _voicePendingCard=null;
    if(st) st.innerHTML='✕ '+t('home_no_country');
    return;
  }

  const cName=ccName(cc);
  if(st) st.innerHTML='✓ <b>'+safeHTML(pickCode)+'</b> → <b>'+safeHTML(cName)+'</b> · '+t('home_ready_disc_cal');

  document.getElementById('ticker').value=pickCode;
  /* Önce bilançoyu çekmeye başla — keşif/takvim UI işi ağı bloklamasın */
  fetchTicker(pickCode);
  revealDiscoveryForCountry(cc, pickCode);
  revealEqCalendarForCountry(cc);
  switchPage('stock');
}

/* ---------- Kalem kategorileri ---------- */
function getCats(){
  return {
    asset_current:  t('cat_asset_current'),
    asset_noncur:   t('cat_asset_noncur'),
    liab_current:   t('cat_liab_current'),
    liab_noncur:    t('cat_liab_noncur'),
    equity:         t('cat_equity')
  };
}
const CATS = new Proxy({}, { get(_t, k){ return getCats()[k]; } });
const CAT_GROUP = { // hangi büyük gruba ait
  asset_current:'asset', asset_noncur:'asset',
  liab_current:'liab', liab_noncur:'liab', equity:'equity'
};
function statusPill(status){
  if(status==='good') return t('st_good');
  if(status==='warn') return t('st_warn');
  return t('st_bad');
}
function tf(key, vars){
  let s=t(key);
  if(vars) Object.keys(vars).forEach(k=>{ s=s.split('{'+k+'}').join(String(vars[k])); });
  return s;
}
function localeTag(){ return getLang()==='en'?'en-US':'tr-TR'; }
function euCountry(info){
  if(!info) return '';
  if(info.iso) return ccName(info.iso);
  return info.country||'';
}
function ccName(cc){
  if(!cc) return '';
  if(cc==='WORLD'||cc==='GLOBAL') return t('cc_GLOBAL');
  /* EN ülke kutularında kısa etiket — taşmayı önler */
  if(getLang()==='en'){
    if(cc==='US') return 'US';
    if(cc==='GB') return 'UK';
  }
  const k='cc_'+cc;
  const v=t(k);
  return v===k?cc:v;
}
/* Ülke kutusu etiketlerini güncelle (id: cbox-US / tbox-GB / scanbox-DE / sbox-GLOBAL) */
function paintCountryBoxLabels(){
  [['econCountries','cbox-'],['topCountries','tbox-'],['scanCountries','scanbox-'],['sectCountries','sbox-']].forEach(([rootId,pfx])=>{
    const root=document.getElementById(rootId);
    if(!root) return;
    root.querySelectorAll('button.cbox').forEach(btn=>{
      const id=btn.id||'';
      if(id.indexOf(pfx)!==0) return;
      const cc=id.slice(pfx.length);
      const nameSpan=[...btn.querySelectorAll('span')].filter(s=>!s.classList.contains('cfl')).pop();
      if(nameSpan) nameSpan.textContent=ccName(cc);
    });
  });
}
/* Bilinen kalem adları (TR/EN + eski örnek metinler) → i18n anahtarı */
const LN_KEYS=['ln_cash','ln_st_inv','ln_recv','ln_inv','ln_other_ca','ln_ppe','ln_gw','ln_intang','ln_lt_inv','ln_other_nca','ln_ap','ln_st_debt','ln_def_rev','ln_other_cl','ln_lt_debt','ln_other_ncl','ln_common','ln_retained','ln_other_eq','ln_def_tax','ln_period_ni','ln_bank_cash','ln_bank_banks','ln_bank_loans','ln_bank_other_a','ln_bank_dep','ln_bank_other_l','ln_bank_ret'];
const LN_ALIAS={
  'banka kredileri (kısa v.)':'ln_st_debt',
  'banka kredileri (uzun v.)':'ln_lt_debt',
  'finansal yatırımlar (uzun v.)':'ln_lt_inv',
  'geçmiş yıl kârları':'ln_retained',
  'gecmis yil karlari':'ln_retained',
  'ertelenmiş vergi yük.':'ln_def_tax',
  'ertelenmis vergi yuk.':'ln_def_tax',
  'dönem net kârı':'ln_period_ni',
  'donem net kari':'ln_period_ni'
};
function resolveLineKey(name){
  if(!name) return null;
  const raw=String(name).trim();
  if(LN_KEYS.indexOf(raw)>=0) return raw;
  const low=raw.toLowerCase();
  if(LN_ALIAS[low]) return LN_ALIAS[low];
  for(const lang of ['tr','en']){
    const pack=(typeof I18N!=='undefined' && I18N[lang])||{};
    for(const k of LN_KEYS){ if(pack[k] && String(pack[k]).toLowerCase()===low) return k; }
  }
  return null;
}
function localizeLineName(name){
  const k=resolveLineKey(name);
  return k?t(k):(name||'');
}
function isInvName(n){ return /stok|inventor/i.test(n||''); }
function isCashName(n){ return /(nakit|kasa|cash(\s|&|and)*\s*equiv)/i.test(n||'') && !/kredi|debt|loan/i.test(n||''); }
let LAST_MCAP=null, LAST_CMP_LIST=null;

/* Örnek bilanço — satır adları i18n anahtarı (loadSample → t()) */
const SAMPLE = [
  ["ln_cash","asset_current",450000,620000],
  ["ln_recv","asset_current",1850000,1200000],
  ["ln_inv","asset_current",2100000,1450000],
  ["ln_other_ca","asset_current",320000,280000],
  ["ln_ppe","asset_noncur",3400000,3550000],
  ["ln_intang","asset_noncur",480000,520000],
  ["ln_lt_inv","asset_noncur",600000,600000],
  ["ln_st_debt","liab_current",1900000,900000],
  ["ln_ap","liab_current",1350000,1100000],
  ["ln_other_cl","liab_current",420000,390000],
  ["ln_lt_debt","liab_noncur",1800000,2050000],
  ["ln_def_tax","liab_noncur",230000,210000],
  ["ln_common","equity",2000000,2000000],
  ["ln_retained","equity",900000,700000],
  ["ln_period_ni","equity",600000,870000]
];
/* Denge kontrolü (cari): Aktif 9.200.000 = KV 3.670.000 + UV 2.030.000 + Özkaynak 3.500.000
   Denge kontrolü (önceki): Aktif 8.220.000 = KV 2.390.000 + UV 2.260.000 + Özkaynak 3.570.000 */

let CUR = 'TL';     // şirketin raporlama para birimi
let CURSYM = '$';   // fiyat/değer gösterimlerinde kullanılan sembol (ABD: $, BIST: ₺)
let FIN = null;  // son çekilen şirketin çok yıllı verisi (bilanço + gelir tablosu)
/* İstek nesli sayacı: hızlı ardışık aramalarda eski (yavaş biten) isteklerin sonucu
   ekrana geç gelip yanlış şirketin verisini göstermesini engeller. */
let REQ_GEN = 0;
const fmt = n => (n===0?'0':Math.round(n).toLocaleString('tr-TR',{maximumFractionDigits:0}));
const pct = n => (n>=0?'+':'')+n.toFixed(1)+'%';
/* Okunaklı kısaltma: milyar -> B, milyon -> M, küçükler binlik ayraçla */
function fmtAbbr(n){
  if(!n) return '0';
  const sign=n<0?'-':'', a=Math.abs(n);
  const two=x=>x.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(a>=1e9) return sign+two(a/1e9)+' B';
  if(a>=1e6) return sign+two(a/1e6)+' M';
  return sign+Math.round(a).toLocaleString('tr-TR');
}
/* Her türlü tarihi → GG/AA/YYYY (bilanço usulü) */
function fmtDate(raw){
  if(raw==null||raw==='') return '';
  const s=String(raw).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return m[3]+'/'+m[2]+'/'+m[1];
  m=s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(m) return m[3]+'/'+m[2]+'/'+m[1];
  m=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if(m){
    let a=+m[1], b=+m[2]; const y=m[3];
    const pad=n=>String(n).padStart(2,'0');
    // 7/16/2026 → ABD A/G; 16.07.2026 / 16/07/2026 → TR G/A
    if(b>12 && a<=12) return pad(b)+'/'+pad(a)+'/'+y;      // M/D/Y
    if(a>12 && b<=12) return pad(a)+'/'+pad(b)+'/'+y;      // D/M/Y
    if(s.includes('.')) return pad(a)+'/'+pad(b)+'/'+y;    // TR nokta
    return pad(b)+'/'+pad(a)+'/'+y;                         // Nasdaq slash → M/D/Y
  }
  const d=new Date(s);
  if(!isNaN(d.getTime())){
    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  }
  return s;
}
/* Sayı çöz: "206,80 B" / "5,72 M" / "206.803.000.000" hepsini anlar */
function num(s){
  if(typeof s==='number') return s;
  let str=String(s).trim().toUpperCase();
  let mult=1;
  if(/\bB\b|MR|MILYAR|MİLYAR/.test(str)) mult=1e9;
  else if(/\bM\b|MN|MILYON|MİLYON/.test(str)) mult=1e6;
  str=str.replace(/[^0-9.,\-]/g,'').replace(/\./g,'').replace(/,/g,'.');
  const v=parseFloat(str);
  return isNaN(v)?0:v*mult;
}

/* ---------- Şirket verisi çekme (SEC EDGAR — anahtarsız) ---------- */
/* Açılan hissenin ülkesi / borsası — bayrak seçmeden net metin */
function setMarketOrigin(info){
  const box=document.getElementById('marketOrigin');
  const txt=document.getElementById('marketOriginText');
  if(!box||!txt) return;
  if(!info){
    box.classList.add('hidden');
    box.style.display='none';
    txt.textContent='';
    return;
  }
  const parts=[
    info.country ? (t('mkt_country_prefix')+info.country) : null,
    info.exchange || null,
    info.ccy || null,
    info.code || null
  ].filter(Boolean);
  txt.textContent=parts.join(' · ');
  box.classList.remove('hidden');
  box.style.display='flex';
}
function setStatus(msg,kind){
  const el=document.getElementById('fetchStatus');
  el.textContent=msg;
  el.style.color = kind==='bad'?'var(--bad)':kind==='good'?'var(--good)':'var(--muted)';
}

/* ---- Paylaşılan us-gaap kavram tanımları (tekli analiz + karşılaştırma) ---- */
const CONCEPTS_BALANCE = {
  assets:        ['Assets'],
  assetsCur:     ['AssetsCurrent'],
  cash:          ['CashAndCashEquivalentsAtCarryingValue','CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  stInv:         ['ShortTermInvestments','MarketableSecuritiesCurrent','AvailableForSaleSecuritiesCurrent'],
  recv:          ['AccountsReceivableNetCurrent','ReceivablesNetCurrent'],
  inv:           ['InventoryNet'],
  ppe:           ['PropertyPlantAndEquipmentNet'],
  goodwill:      ['Goodwill'],
  intang:        ['IntangibleAssetsNetExcludingGoodwill','FiniteLivedIntangibleAssetsNet'],
  ltInv:         ['LongTermInvestments','MarketableSecuritiesNoncurrent'],
  liab:          ['Liabilities'],
  liabCur:       ['LiabilitiesCurrent'],
  liabNoncur:    ['LiabilitiesNoncurrent'],
  liabEquity:    ['LiabilitiesAndStockholdersEquity'],
  ap:            ['AccountsPayableCurrent','AccountsPayableAndAccruedLiabilitiesCurrent'],
  stDebt:        ['LongTermDebtCurrent','DebtCurrent','ShortTermBorrowings','CommercialPaper'],
  defRev:        ['ContractWithCustomerLiabilityCurrent','DeferredRevenueCurrent'],
  ltDebt:        ['LongTermDebtNoncurrent','LongTermDebt'],
  equity:        ['StockholdersEquity'],
  equityIncl:    ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  minority:      ['MinorityInterest'],
  common:        ['CommonStockValue','CommonStocksIncludingAdditionalPaidInCapital'],
  retained:      ['RetainedEarningsAccumulatedDeficit'],
};
const CONCEPTS_INCOME = {
  revenue:    ['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','RevenueFromContractWithCustomerIncludingAssessedTax','SalesRevenueNet'],
  costRev:    ['CostOfRevenue','CostOfGoodsAndServicesSold','CostOfGoodsSold'],
  grossProfit:['GrossProfit'],
  opIncome:   ['OperatingIncomeLoss'],
  netIncome:  ['NetIncomeLoss','ProfitLoss'],
  rnd:        ['ResearchAndDevelopmentExpense'],
  interest:   ['InterestExpense','InterestExpenseDebt','InterestExpenseNonoperating'],
};
/* Nakit akış kavramları — ABD'de HER ZAMAN yıllık (10-K) çekilir: 10-Q'daki nakit akışları
   yılbaşından-bugüne kümülatif olduğundan çeyrek süzgeci onları kaçırır. */
const CONCEPTS_CASH = {
  opCF:  ['NetCashProvidedByUsedInOperatingActivities','NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  invCF: ['NetCashProvidedByUsedInInvestingActivities','NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'],
  finCF: ['NetCashProvidedByUsedInFinancingActivities','NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment','PaymentsToAcquireProductiveAssets'],
};

/* Bir us-gaap (veya taxonomy verilirse ifrs-full — Almanya/İsviçre'de SEC'e 20-F ile kayıtlı
   birkaç çok-uluslu şirket için, bkz. DE_CH_SEC_XREF) kavramının ham kayıtlarını çeker.
   Sonuç: doğru formdaki ham kayıt dizisi [{start?,end,val,filed,form}, …]. */
let _secSlots=0;
const SEC_MAX=8; /* paralel concept tavanı — 429 riskini sınırla */
function secSleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function withSecSlot(fn){
  while(_secSlots>=SEC_MAX) await secSleep(35);
  _secSlots++;
  try{ return await fn(); }
  finally{ _secSlots--; }
}
async function fetchConceptRaw(cik, tags, formPrefix, taxonomy){
  for(const tag of tags){
    let j=null;
    for(let attempt=0; attempt<3; attempt++){
      try{
        const r=await withSecSlot(()=>
          fetch(`/sec/api/xbrl/companyconcept/CIK${cik}/${taxonomy||'us-gaap'}/${tag}.json`));
        if(r.status===429){ await secSleep(280*(attempt+1)); continue; }
        if(!r.ok) break;
        j=await r.json();
        break;
      }catch(e){
        if(attempt<2){ await secSleep(120*(attempt+1)); continue; }
        break;
      }
    }
    if(!j) continue;
    // ABD (us-gaap) yolunda davranış AYNEN korunur (yalnız USD). ifrs-full yolunda şirket birden
    // fazla para biriminde raporlamış olabilir (ör. UBS eski yıllarda CHF, günümüzde yalnız USD
    // tag'liyor) — İLK bulunan birimi değil, formPrefix'e uyan kayıtları olan VE en güncel tarihe
    // sahip birimi seçmek gerekir (aksi halde sessizce yıllar önce terk edilmiş bir seriye düşülür).
    let arr;
    if(taxonomy==='ifrs-full'){
      if(!j.units){ continue; }
      let bestArr=null, bestMaxDate='';
      for(const u in j.units){
        const filtered=j.units[u].filter(e=> e.form && e.form.indexOf(formPrefix)===0);
        if(!filtered.length) continue;
        const maxDate=filtered.reduce((m,e)=> e.end>m?e.end:m, '');
        if(maxDate>bestMaxDate){ bestMaxDate=maxDate; bestArr=filtered; }
      }
      arr=bestArr||[];
    }else{
      const usd=j.units && j.units.USD;
      arr = usd ? usd.filter(e=> e.form && e.form.indexOf(formPrefix)===0) : [];
    }
    if(arr.length) return arr;
  }
  return [];
}
/* Anlık (stok) kavram: dönem sonuna göre en güncel dosyalamayı al → { 'YYYY-MM-DD': değer } */
function pickInstant(arr){
  const map={}, filed={};
  arr.forEach(e=>{
    const d=e.end;
    if(!(d in map) || e.filed>filed[d]){ map[d]=Number(e.val); filed[d]=e.filed; }
  });
  return map;
}
/* Süre (akış) kavram: dönem uzunluğu moda uyanları al (yıllık ~1 yıl / çeyrek ~3 ay) */
function pickDuration(arr, mode){
  const map={}, filed={};
  arr.forEach(e=>{
    if(!e.start) return;
    const days=(new Date(e.end)-new Date(e.start))/86400000;
    const ok = mode==='annual' ? (days>=300 && days<=400) : (days>=60 && days<=100);
    if(!ok) return;
    const d=e.end;
    if(!(d in map) || e.filed>filed[d]){ map[d]=Number(e.val); filed[d]=e.filed; }
  });
  return map;
}
/* Geriye dönük uyumluluk: anlık kavram için { tarih: değer } döndürür */
async function fetchConcept(cik, tags, formPrefix){
  return pickInstant(await fetchConceptRaw(cik, tags, formPrefix));
}

/* Bir şirketin tüm bilanço (anlık) + gelir (süre) serilerini çeker.
   SEC saniye limitini aşmamak için 5'erli gruplar halinde. → { D, I }
   opts: {taxonomy, balanceDefs, incomeDefs, cashDefs, cashForm} — hepsi opsiyonel, verilmezse
   ABD (us-gaap) varsayılanları AYNEN kullanılır (bkz. DE_CH_SEC_XREF — Almanya/İsviçre'de SEC'e
   20-F ile kayıtlı birkaç şirket için ifrs-full + '20-F' geçilir). */
async function fetchSeries(cik, mode, formPrefix, opts){
  opts=opts||{};
  const tax=opts.taxonomy;
  const CHUNK=5; /* SEC concept isteklerini paralel grupla (slot tavanıyla) */
  const grab = async (defs, fp)=>{
    const keys=Object.keys(defs), raw={};
    for(let i=0;i<keys.length;i+=CHUNK){
      const chunk=keys.slice(i,i+CHUNK);
      const r=await Promise.all(chunk.map(k=>fetchConceptRaw(cik,defs[k],fp||formPrefix,tax)));
      chunk.forEach((k,j)=>raw[k]=r[j]);
    }
    return {keys,raw};
  };
  /* Bilanço ∥ gelir ∥ nakit — birbirinden bağımsız, sırayla beklemeyi kaldır */
  const [b,ic,cf]=await Promise.all([
    grab(opts.balanceDefs||CONCEPTS_BALANCE),
    grab(opts.incomeDefs||CONCEPTS_INCOME),
    grab(opts.cashDefs||CONCEPTS_CASH, opts.cashForm||'10-K'),
  ]);
  const D={}; b.keys.forEach(k=>D[k]=pickInstant(b.raw[k]));
  const I={}; ic.keys.forEach(k=>I[k]=pickDuration(ic.raw[k],mode));
  const CF={}; cf.keys.forEach(k=>CF[k]=pickDuration(cf.raw[k],'annual'));
  // FCF = Faaliyet Nakiti − Capex (her ikisi de olan tarihlerde)
  CF.fcf={}; Object.keys(CF.opCF).forEach(d=>{ if(d in CF.capex) CF.fcf[d]=CF.opCF[d]-CF.capex[d]; });
  I._cash=CF;
  // Brüt kâr yoksa gelir − satış maliyetinden türet
  if(!Object.keys(I.grossProfit).length && Object.keys(I.revenue).length && Object.keys(I.costRev).length){
    const g={}; Object.keys(I.revenue).forEach(d=>{ if(d in I.costRev) g[d]=I.revenue[d]-I.costRev[d]; }); I.grossProfit=g;
  }
  // Toplam aktifin dönem sonuna göre İLK (orijinal) SEC bildirim tarihi — o dönem ilk
  // açıklandığında. (En güncel 10-K karşılaştırmalı yılları da içerir; en erkeni alırız.)
  const filed={};
  (b.raw.assets||[]).forEach(e=>{ if(!(e.end in filed)||e.filed<filed[e.end]) filed[e.end]=e.filed; });
  return { D, I, filed };
}

/* Tek bir hissenin karşılaştırma metriklerini hesaplar (DOM'a dokunmaz).
   ABD listesinde yoksa BIST'ten dener → ABD ve BIST hisseleri yan yana karşılaştırılabilir
   (mutlak tutarlar USD/TL karışık olur; oranlar birimden bağımsızdır). */
async function fetchMetrics(sym, mode){
  const map=window.CIK_MAP||{};
  const forceBist=/\.IS$/.test(sym);
  const bSym=forceBist?sym.replace(/\.IS$/,''):sym;
  let D,I;
  const euInfoM=parseEUSymbol(sym);
  if(euInfoM){
    // Avrupa/Asya: Yahoo çok-yıllı seri → yoksa TV tek-dönem özeti (tekli analizle aynı zincirin kısası)
    let s=null;
    try{
      const ysym=await resolveYahooForEu({...euInfoM});
      s=await fetchYahooFundSeries(ysym, mode);
    }catch(e){}
    if(!s){
      try{
        const tvTicker=euInfoM.tv+':'+euTvBase(euInfoM);
        const r=await fetch('https://scanner.tradingview.com/'+euInfoM.scan+'/scan',
          {method:'POST',body:JSON.stringify({symbols:{tickers:[tvTicker]},columns:EU_COLS})});
        const j=r.ok?await r.json():null;
        const row=j&&j.data&&j.data.find(x=>x.d&&x.d[4]!=null);
        if(!row) return { sym, ok:false, err:'bulunamadı' };
        const R=euReshape(row.d);
        s={ D:R.D, I:R.I };
      }catch(e){ return { sym, ok:false, err:'bağlantı' }; }
    }
    ({D,I}=s);
  }else if(!forceBist && map[sym]){
    const cik=String(map[sym]).padStart(10,'0');
    const formPrefix = mode==='annual' ? '10-K' : '10-Q';
    try{ ({D,I}=await fetchSeries(cik,mode,formPrefix)); }
    catch(e){ return { sym, ok:false, err:'bağlantı' }; }
  }else{
    try{
      const s=await fetchBistSeries(bSym,mode);
      if(!s) return { sym, ok:false, err:'bulunamadı' };
      ({D,I}=s);
    }catch(e){ return { sym, ok:false, err:'bağlantı' }; }
  }
  if(!Object.keys(D.assets).length) return { sym, ok:false, err:'veri yok' };
  const bd=Object.keys(D.assets).sort().reverse()[0];
  const rd=Object.keys(I.revenue||{}).sort().reverse()[0]||bd;
  const v=(m,d)=> (d&&m&&(d in m))?m[d]:null;
  const assets=v(D.assets,bd), assetsCur=v(D.assetsCur,bd),
        liabCur=v(D.liabCur,bd), inv=v(D.inv,bd)||0;
  // Sağlam toplam yükümlülük + özkaynak (tekli analizle tutarlı; NCI/mezzanine dahil)
  const liab=liabTotal(D,bd);
  const equity=(assets!=null)? assets-liab : equityAllIn(D,bd);
  const rev=v(I.revenue,rd), ni=v(I.netIncome,rd), gp=v(I.grossProfit,rd), op=v(I.opIncome,rd);
  const sd=(a,b)=> (a==null||b==null||b===0)?null:a/b;
  return {
    sym, ok:true, asOf:bd,
    revenue:rev, netIncome:ni,
    netMargin: sd(ni,rev), grossMargin: sd(gp,rev), opMargin: sd(op,rev),
    roe: sd(ni,equity), roa: sd(ni,assets),
    current: sd(assetsCur,liabCur),
    quick: (assetsCur!=null&&liabCur)?(assetsCur-inv)/liabCur:null,
    debtEq: sd(liab,equity),
    equityRatio: sd(equity,assets),
    assets, equity,
  };
}

/* ---------- Şirket karşılaştırma ---------- */
let CMP_GEN=0;
async function compareTickers(){
  const st=document.getElementById('cmpStatus');
  if(location.protocol==='file:'){ st.textContent='⚠ '+t('status_file_protocol'); st.style.color='var(--bad)'; return; }
  const raw=(document.getElementById('cmpTickers').value||'').toUpperCase();
  const syms=[...new Set(raw.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean))].slice(0,4);
  const mode=document.getElementById('cmpPeriod').value;
  if(syms.length<2){ st.textContent=t('cmp_need_two'); st.style.color='var(--bad)'; return; }
  const myCmp=++CMP_GEN;
  st.textContent='⏳ '+syms.join(', ')+' '+t('cmp_loading'); st.style.color='var(--muted)';
  const data=[];
  for(const s of syms){
    if(myCmp!==CMP_GEN) return;
    data.push(await fetchMetrics(s,mode));
  }
  if(myCmp!==CMP_GEN) return;
  const okData=data.filter(d=>d.ok), bad=data.filter(d=>!d.ok);
  if(!okData.length){ st.textContent='✕ '+t('cmp_none'); st.style.color='var(--bad)'; document.getElementById('cmpResult').innerHTML=''; return; }
  st.textContent='✓ '+okData.map(d=>d.sym).join(', ')+(bad.length?'  ·  '+t('cmp_none')+': '+bad.map(d=>d.sym+' ('+d.err+')').join(', '):'');
  st.style.color = bad.length?'var(--warn)':'var(--good)';
  renderComparison(okData);
}
function renderComparison(list){
  LAST_CMP_LIST=list;
  const pp=v=>v==null?'—':(v*100).toFixed(1)+'%';
  const xx=v=>v==null?'—':v.toFixed(2)+'x';
  const ab=v=>v==null?'—':fmtAbbr(v);
  // [etiket, anahtar, biçim, yön(+1 yüksek iyi / −1 düşük iyi)]
  const rows=[
    [t('inc_rev'),'revenue',ab,1],
    [t('inc_ni'),'netIncome',ab,1],
    [t('inc_gm'),'grossMargin',pp,1],
    [t('inc_om'),'opMargin',pp,1],
    [t('inc_nm'),'netMargin',pp,1],
    [t('inc_roe'),'roe',pp,1],
    [t('inc_roa'),'roa',pp,1],
    [t('ratio_current'),'current',xx,1],
    [t('cmp_quick'),'quick',xx,1],
    [t('ratio_de'),'debtEq',xx,-1],
    [t('ratio_eq'),'equityRatio',pp,1],
  ];
  const head='<tr><th>'+t('cmp_th')+'</th>'+list.map(d=>`<th>${d.sym}<br><span class="thd">${d.asOf?fmtDate(d.asOf):''}</span></th>`).join('')+'</tr>';
  const body=rows.map(([lbl,key,fmt,dir])=>{
    const present=list.map(d=>d[key]).filter(v=>v!=null);
    const best  = present.length>1 ? (dir>0?Math.max(...present):Math.min(...present)) : null;
    const worst = present.length>1 ? (dir>0?Math.min(...present):Math.max(...present)) : null;
    const cells=list.map(d=>{
      const v=d[key]; let cls='';
      if(v!=null && best!=null && best!==worst){           // en az iki farklı değer varsa renklendir
        if(v===best) cls='up'; else if(v===worst) cls='down';
      }
      return `<td class="${cls}" style="${cls?'font-weight:700':''}">${fmt(v)}</td>`;
    }).join('');
    return `<tr><td>${lbl}</td>${cells}</tr>`;
  }).join('');
  document.getElementById('cmpResult').innerHTML =
    `<table style="margin-top:14px;min-width:480px"><thead>${head}</thead><tbody>${body}</tbody></table>
     <div class="hint" style="margin-top:8px">${t('cmp_hint')}</div>`;
}

/* ================== BIST (Borsa İstanbul) veri katmanı ================== */
/* Kaynak: İş Yatırım'ın halka açık KAP mali tablo servisi (sunucudaki /bist köprüsü).
   Sanayi/holding şirketleri XI_29 şemasını, bankalar UFRS şemasını kullanır.
   itemCode'lar sabittir (ör. 1BL = TOPLAM VARLIKLAR, 1Z = banka AKTİF TOPLAMI); değerler TL. */
const BIST_PERIOD_END = {3:'-03-31', 6:'-06-30', 9:'-09-30', 12:'-12-31'};
async function bistCall(sym, group, pairs){
  let qs='companyCode='+encodeURIComponent(sym)+'&financialGroup='+encodeURIComponent(group);
  pairs.forEach((p,i)=>{ qs+='&year'+(i+1)+'='+p[0]+'&period'+(i+1)+'='+p[1]; });
  const r=await fetch('/bist?'+qs);
  if(!r.ok) return null;
  const j=await r.json();
  return (j&&j.value&&j.value.length)?{pairs,items:j.value}:null;
}
/* Bir çağrının sonuçlarını byCode haritasına işler: itemCode -> { 'YYYY-AA-GG': değer } */
function bistMerge(byCode, call){
  if(!call) return;
  call.items.forEach(it=>{
    const code=it.itemCode;
    if(!byCode[code]) byCode[code]={};
    call.pairs.forEach((p,i)=>{
      const v=it['value'+(i+1)];
      if(v==null||v==='') return;
      const num=Number(v);
      if(!isNaN(num)) byCode[code][p[0]+BIST_PERIOD_END[p[1]]]=num;
    });
  });
}
const bc=(byCode,code)=> byCode[code]||{};
function bcAdd(a,b,sign){ const out={...(a||{})}; Object.keys(b||{}).forEach(d=>{ out[d]=(out[d]||0)+(sign||1)*b[d]; }); return out; }
function bcAbs(a){ const out={}; Object.keys(a||{}).forEach(d=>out[d]=Math.abs(a[d])); return out; }
/* Çeyreklik gelir kalemleri KAP'ta KÜMÜLATİFTİR (3/6/9/12 ay) — ABD verisiyle aynı
   davranış için ayrık çeyreğe çevrilir: q(p) = küm(p) − küm(p−3); Q1 olduğu gibi. */
function bistDiscreteQuarters(cum){
  const out={};
  Object.keys(cum||{}).forEach(d=>{
    const y=d.slice(0,4), mm=d.slice(5,7);
    const prevKey={ '06':y+'-03-31', '09':y+'-06-30', '12':y+'-09-30' }[mm];
    if(!prevKey){ out[d]=cum[d]; return; }
    if(prevKey in cum) out[d]=cum[d]-cum[prevKey];
  });
  return out;
}
/* BIST şirketinin serilerini ABD fetchSeries ile AYNI ŞEKİLDE ({D,I}) döndürür →
   analiz/trend/oran/karşılaştırma kodu hiçbir değişiklik istemeden çalışır. */
async function fetchBistSeries(sym, mode){
  const thisY=new Date().getFullYear();
  let calls;
  if(mode==='annual'){
    calls=[ [[thisY,12],[thisY-1,12],[thisY-2,12],[thisY-3,12]],
            [[thisY-4,12],[thisY-5,12],[thisY-6,12],[thisY-7,12]] ];
  }else{
    calls=[ [[thisY,3],[thisY,6],[thisY,9],[thisY,12]],
            [[thisY-1,3],[thisY-1,6],[thisY-1,9],[thisY-1,12]],
            [[thisY-2,3],[thisY-2,6],[thisY-2,9],[thisY-2,12]] ];
  }
  // Şema tespiti: önce sanayi/holding (XI_29), veri boşsa banka (UFRS)
  const hasData=c=> c && c.items.some(it=> [1,2,3,4].some(i=> it['value'+i]!=null && it['value'+i]!==''));
  let group='XI_29';
  let first=await bistCall(sym, group, calls[0]);
  if(!hasData(first)){ group='UFRS'; first=await bistCall(sym, group, calls[0]); }
  if(!hasData(first)) return null;
  const byCode={};
  bistMerge(byCode, first);
  /* Şema belli olduktan sonra kalan dönem paketlerini paralel çek */
  if(calls.length>1){
    const rest=await Promise.all(calls.slice(1).map(c=>bistCall(sym, group, c)));
    rest.forEach(pack=>bistMerge(byCode, pack));
  }
  // Kod → Türkçe açıklama haritası (banka/sigorta satır etiketleri ve açıklamaya-göre-arama için)
  const descOf={};
  first.items.forEach(it=>{ descOf[it.itemCode]=(it.itemDescTr||'').trim(); });
  const findByDesc=rx=>{ const c=Object.keys(descOf).find(k=> rx.test(descOf[k]) && Object.keys(bc(byCode,k)).length); return c?bc(byCode,c):{}; };

  const D={}, I={};
  if(group==='XI_29'){
    D.assets=bc(byCode,'1BL'); D.assetsCur=bc(byCode,'1A');
    D.cash=bc(byCode,'1AA'); D.stInv=bc(byCode,'1AB'); D.recv=bc(byCode,'1AC'); D.inv=bc(byCode,'1AF');
    D.ppe=bc(byCode,'1BG'); D.goodwill=bc(byCode,'1BGA'); D.intang=bc(byCode,'1BH'); D.ltInv=bc(byCode,'1BC');
    D.liabCur=bc(byCode,'2A'); D.liabNoncur=bc(byCode,'2B');
    D.liab=bcAdd(bc(byCode,'2A'), bc(byCode,'2B'));
    D.liabEquity=bc(byCode,'2ODB');
    D.ap=bc(byCode,'2AAGAA'); D.stDebt=bc(byCode,'2AA'); D.defRev=bc(byCode,'2AAGCA'); D.ltDebt=bc(byCode,'2BA');
    D.equity=bc(byCode,'2O'); D.equityIncl=bc(byCode,'2N'); D.minority=bc(byCode,'2ODA');
    D.common=bc(byCode,'2OA'); D.retained=bc(byCode,'2OCE');
    I.revenue=bc(byCode,'3C'); I.costRev=bcAbs(bc(byCode,'3CA'));
    I.grossProfit=bc(byCode,'3D'); I.opIncome=bc(byCode,'3DF');
    I.netIncome=Object.keys(bc(byCode,'3Z')).length?bc(byCode,'3Z'):bc(byCode,'3L');
    I.rnd=bcAbs(bc(byCode,'3DC')); I.interest=bcAbs(bc(byCode,'3HC'));
    // Nakit akışı (KAP şemasında hazır): 4C faaliyet, 4CAK yatırım, 4CBE finansman,
    // 4CAI sabit sermaye yatırımları (capex), 4CB serbest nakit akım
    I._cash={ opCF:bc(byCode,'4C'), invCF:bc(byCode,'4CAK'), finCF:bc(byCode,'4CBE'),
              capex:bcAbs(bc(byCode,'4CAI')), fcf:bc(byCode,'4CB') };
  }else{
    // Banka (UFRS): dönen/duran ayrımı yoktur; ana toplamlar + banka kalemleri
    D.assets=bc(byCode,'1Z'); D.assetsCur={};
    D.cash=bc(byCode,'1A'); D.stInv={}; D.recv={}; D.inv={};
    D.ppe={}; D.goodwill={}; D.intang={}; D.ltInv={};
    D.liabCur={}; D.liabNoncur={};
    D.equity=bc(byCode,'2O'); D.equityIncl=bc(byCode,'2O'); D.minority={};
    D.liab=bcAdd(bc(byCode,'2Z'), bc(byCode,'2O'), -1);   // Pasif Toplamı − Özkaynak
    D.liabEquity=bc(byCode,'2Z');
    D.ap={}; D.stDebt={}; D.defRev={}; D.ltDebt={};
    D.common=bc(byCode,'2OA'); D.retained=bc(byCode,'2OU');
    // Sigorta şirketlerinde ödenmiş sermaye 2OA'da olmayabilir → açıklamadan bul
    if(!Object.keys(D.common).length) D.common=findByDesc(/Ödenmiş Sermaye/i);
    if(!Object.keys(D.retained).length) D.retained=findByDesc(/Geçmiş Y[ıi]llar Kar/i);
    D.bankKrediler=bc(byCode,'1AF'); D.bankMevduat=bc(byCode,'2A'); D.bankBankalar=bc(byCode,'1AC');
    // Satır etiketleri gerçek şemadan (banka: "MEVDUAT", sigorta: "Finansal Borçlar" vb.)
    const clean=s=>(s||'').replace(/^[IVXLC0-9]+[\.\)]\s*/i,'').replace(/^[A-ZÇĞİÖŞÜ0-9]{1,2}-\s*/,'').trim();
    D.bankLabels={
      nakit:  clean(descOf['1A'])  || 'Nakit Değerler ve Merkez Bankası',
      bankalar:clean(descOf['1AC'])|| 'Bankalar',
      krediler:clean(descOf['1AF'])|| 'Krediler',
      mevduat: clean(descOf['2A']) || 'Mevduat'
    };
    I.revenue=bc(byCode,'3A'); I.costRev=bcAbs(bc(byCode,'3B'));
    I.grossProfit=bc(byCode,'3C'); I.opIncome=bc(byCode,'3CH');
    I.netIncome=Object.keys(bc(byCode,'3ZA')).length?bc(byCode,'3ZA'):bc(byCode,'3Z');
    I.rnd={}; I.interest={};
    I._cash={ opCF:{}, invCF:{}, finCF:{}, capex:{}, fcf:{} };   // banka nakit akış şeması farklı
  }
  if(mode==='quarter'){
    Object.keys(I).forEach(k=>{
      if(k==='_cash'){ Object.keys(I._cash).forEach(c=> I._cash[c]=bistDiscreteQuarters(I._cash[c])); }
      else I[k]=bistDiscreteQuarters(I[k]);
    });
  }
  return { D, I, group };
}
/* Banka bilançosu satırları (dönen/duran şeması bankaya uymaz → özel kurulum).
   "Diğer" satırları fark (plug) olduğundan bilanço her zaman dengelenir. */
function buildRowsBank(D,D0,D1){
  const v=(m,d)=> (d&&m&&(d in m))?m[d]:0;
  const L=D.bankLabels||{};
  const rows=[];
  const push=(lbl,cat,c,p)=>{ if(c!==0||p!==0) rows.push([lbl,cat,c,p]); };
  push(L.nakit||t('ln_bank_cash'),'asset_current', v(D.cash,D0), v(D.cash,D1));
  push(L.bankalar||t('ln_bank_banks'),'asset_current', v(D.bankBankalar,D0), v(D.bankBankalar,D1));
  push(L.krediler||t('ln_bank_loans'),'asset_noncur', v(D.bankKrediler,D0), v(D.bankKrediler,D1));
  push(t('ln_bank_other_a'),'asset_noncur',
    v(D.assets,D0)-v(D.cash,D0)-v(D.bankBankalar,D0)-v(D.bankKrediler,D0),
    v(D.assets,D1)-v(D.cash,D1)-v(D.bankBankalar,D1)-v(D.bankKrediler,D1));
  push(L.mevduat||t('ln_bank_dep'),'liab_current', v(D.bankMevduat,D0), v(D.bankMevduat,D1));
  push(t('ln_bank_other_l'),'liab_noncur',
    v(D.liabEquity,D0)-v(D.equity,D0)-v(D.bankMevduat,D0),
    v(D.liabEquity,D1)-v(D.equity,D1)-v(D.bankMevduat,D1));
  push(t('ln_common'),'equity', v(D.common,D0), v(D.common,D1));
  push(t('ln_bank_ret'),'equity', v(D.retained,D0), v(D.retained,D1));
  push(t('ln_other_eq'),'equity',
    v(D.equity,D0)-v(D.common,D0)-v(D.retained,D0),
    v(D.equity,D1)-v(D.common,D1)-v(D.retained,D1));
  return rows;
}
/* BIST hissesi için ana arama akışı (ABD fetchTicker ile aynı adımlar). */
async function fetchTickerBIST(sym, mode, myGen){
  try{
    const s=await fetchBistSeries(sym, mode);
    if(myGen!==REQ_GEN) return;
    if(!s || !Object.keys(s.D.assets).length){
      setStatus(tf('status_not_found_us_bist',{s:sym}),'bad'); return;
    }
    const {D,I,group}=s;
    if(myGen!==REQ_GEN) return;
    const dates=Object.keys(D.assets).sort().reverse();
    const D0=dates[0], D1=dates[1]||null;
    const shares=(D.common&&D.common[D0])||null;   // Ödenmiş sermaye (nominal 1 TL) ≈ pay adedi
    CUR='TL'; CURSYM='₺';
    FIN={ ticker:sym, mode, cur:'TRY', market:'BIST', bankGroup:group, D0, D1, balance:D, income:I,
          filedD0:null, filedD1:null, sharesBist:shares };
    const rows = group==='UFRS' ? buildRowsBank(D,D0,D1) : buildRowsFromSEC(D,D0,D1);
    const b=document.getElementById('inputBody'); b.innerHTML='';
    rows.forEach(r=>b.insertAdjacentHTML('beforeend', rowHTML(r[0],r[1],r[2],r[3])));
    document.getElementById('curNote').textContent=t('cur_tl');
    setFinancialPeriodHeaders();
    setMarketOrigin({ country:ccName('TR'), exchange:t('exch_bist'), ccy:'TRY', code:sym+'.IS' });
    setStatus(tf('status_ok_bist',{s:sym, bank:group==='UFRS'?t('status_bank'):'', mode:mode==='annual'?t('data_annual'):t('quarterly'), d:fmtDate(D0)+(D1?'  ↔  '+fmtDate(D1):'')}),'good');
    analyze(myGen);
    fetchNews(sym, myGen);
    fetchPrice(sym, null, myGen, { ysym: sym+'.IS', shares });
    fetchTargetsBIST(sym, myGen);   // kurum bazlı hedef fiyatlar (Fintables; yedek TV konsensüsü)
    fetchKapFeed(sym, myGen);       // KAP bildirimleri (kısa özet + resmi KAP linki)
    fetchNextEarnings(sym, 'BIST', myGen);
    fetchPriceChart(sym, sym+'.IS', myGen);
    fetchSectorComparison(sym, 'BIST', myGen);
    fetchOwnershipBIST(sym, myGen);   // ortaklık yapısı pastası (KAP verisi)
    TECH_SHORT=null;                  // kısa pozisyon verisi yalnız ABD'de var
    fetchTechPanel(sym, 'BIST', myGen);
    ['insiderCard'].forEach(id=>{ const c=document.getElementById(id); if(c) c.classList.add('hidden'); });
    updateWatchStar();
    startBistClock();               // İstanbul saati + seans içi/dışı
  }catch(e){
    if(myGen===REQ_GEN) setStatus(tf('status_net_err',{e:e.message}),'bad');
  }
}

/* ================== Avrupa borsaları ================== */
/* Kaynak: TradingView scanner (fiyat: Yahoo, aynı /price köprüsü). Ticker EKİ Yahoo Finance'in
   kendi kısaltmalarıyla BİREBİR aynı (VOD.L, SIE.DE gibi) — hem kullanıcıya tanıdık hem de
   ysym'i doğrudan verir (ekstra çözümleme gerekmez). Her borsa doğrulandı (curl testi):
   is_primary=true + exchange filtresiyle YALNIZCA o ülkenin birincil kotasyonlu şirketleri
   döner (çapraz kotasyonlu yabancı devler karışmaz). */
/* city/tz/open/close: borsanın bulunduğu şehrin canlı saati + seans durumu için (bkz. startExchangeClock).
   open/close = yerel saatte seans başlangıcı/bitişi, gün içi dakika cinsinden (09:00=540). Resmi tatiller
   hesaba katılmaz (ABD saati ile aynı kısıt) — o yüzden "borsa açık" değil "seans içi" denir. */
/* iso: GLEIF'in legalAddress.country alanıyla eşleşen ISO-3166 kodu (borsa eki ile HER ZAMAN
   aynı değil — İngiltere borsa eki "L" ama ülke kodu "GB"; fetchIfrsSeries'te ad-araması
   yedeğinde ülke doğrulaması için kullanılır). */
const EU_EXCHANGES={
  L:  {tv:'LSE',      scan:'uk',          country:'İngiltere',  ccy:'GBP', sym:'£',    city:'Londra',    tz:'Europe/London',     open:480, close:990,  flag:'🇬🇧', iso:'GB'},
  DE: {tv:'XETR',     scan:'germany',     country:'Almanya',    ccy:'EUR', sym:'€',    city:'Frankfurt', tz:'Europe/Berlin',     open:540, close:1050, flag:'🇩🇪', iso:'DE'},
  PA: {tv:'EURONEXT', scan:'france',      country:'Fransa',     ccy:'EUR', sym:'€',    city:'Paris',     tz:'Europe/Paris',      open:540, close:1050, flag:'🇫🇷', iso:'FR'},
  AS: {tv:'EURONEXT', scan:'netherlands', country:'Hollanda',   ccy:'EUR', sym:'€',    city:'Amsterdam', tz:'Europe/Amsterdam',  open:540, close:1050, flag:'🇳🇱', iso:'NL'},
  BR: {tv:'EURONEXT', scan:'belgium',     country:'Belçika',    ccy:'EUR', sym:'€',    city:'Brüksel',   tz:'Europe/Brussels',   open:540, close:1050, flag:'🇧🇪', iso:'BE'},
  LS: {tv:'EURONEXT', scan:'portugal',    country:'Portekiz',   ccy:'EUR', sym:'€',    city:'Lizbon',    tz:'Europe/Lisbon',     open:540, close:1050, flag:'🇵🇹', iso:'PT'},
  MI: {tv:'MIL',      scan:'italy',       country:'İtalya',     ccy:'EUR', sym:'€',    city:'Milano',    tz:'Europe/Rome',       open:540, close:1050, flag:'🇮🇹', iso:'IT'},
  MC: {tv:'BME',      scan:'spain',       country:'İspanya',    ccy:'EUR', sym:'€',    city:'Madrid',    tz:'Europe/Madrid',     open:540, close:1050, flag:'🇪🇸', iso:'ES'},
  SW: {tv:'SIX',      scan:'switzerland', country:'İsviçre',    ccy:'CHF', sym:'CHF ', city:'Zürih',     tz:'Europe/Zurich',     open:540, close:1050, flag:'🇨🇭', iso:'CH'},
  ST: {tv:'OMXSTO',   scan:'sweden',      country:'İsveç',      ccy:'SEK', sym:'kr ',  city:'Stockholm', tz:'Europe/Stockholm',  open:540, close:1050, flag:'🇸🇪', iso:'SE'},
  CO: {tv:'OMXCOP',   scan:'denmark',     country:'Danimarka',  ccy:'DKK', sym:'kr ',  city:'Kopenhag',  tz:'Europe/Copenhagen', open:540, close:1020, flag:'🇩🇰', iso:'DK'},
  OL: {tv:'OSL',      scan:'norway',      country:'Norveç',     ccy:'NOK', sym:'kr ',  city:'Oslo',      tz:'Europe/Oslo',       open:540, close:990,  flag:'🇳🇴', iso:'NO'},
  HE: {tv:'OMXHEX',   scan:'finland',     country:'Finlandiya', ccy:'EUR', sym:'€',    city:'Helsinki',  tz:'Europe/Helsinki',   open:600, close:1110, flag:'🇫🇮', iso:'FI'},
  VI: {tv:'VIE',      scan:'austria',     country:'Avusturya',  ccy:'EUR', sym:'€',    city:'Viyana',    tz:'Europe/Vienna',     open:540, close:1055, flag:'🇦🇹', iso:'AT'},
  WA: {tv:'GPW',      scan:'poland',      country:'Polonya',    ccy:'PLN', sym:'zł ',  city:'Varşova',   tz:'Europe/Warsaw',     open:540, close:1020, flag:'🇵🇱', iso:'PL'},
  // Avrupa değil ama aynı "tek harf/rakam eki → yabancı borsa" mekanizmasını paylaşıyor —
  // TradingView'in "KRX" öneki hem KOSPI hem KOSDAQ'ı kapsar; asıl Yahoo eki (.KS/.KQ)
  // fetchTickerEU içinde /yfsearch ile ayrıca çözümlenir (bkz. o fonksiyondaki not).
  KS: {tv:'KRX',      scan:'korea',       country:'Güney Kore', ccy:'KRW', sym:'₩',    city:'Seul',      tz:'Asia/Seoul',        open:540, close:930,  flag:'🇰🇷', iso:'KR'},
  KQ: {tv:'KRX',      scan:'korea',       country:'Güney Kore', ccy:'KRW', sym:'₩',    city:'Seul',      tz:'Asia/Seoul',        open:540, close:930,  flag:'🇰🇷', iso:'KR'},   // KOSDAQ — .KS ile aynı, kullanıcı isterse açıkça yazabilir
  // Tokyo Borsası (Prime/Standard/Growth) — Yahoo eki .T, TradingView öneki TSE.
  // Çok yıllı veri: IFRS/ESEF Japonya'yı kapsamaz → Yahoo fundamentals (KR ile aynı yedek zinciri).
  T:  {tv:'TSE',      scan:'japan',       country:'Japonya',    ccy:'JPY', sym:'¥',    city:'Tokyo',     tz:'Asia/Tokyo',        open:540, close:900,  flag:'🇯🇵', iso:'JP'},
  // Çin: anakara A-hisseleri (SSE/SZSE) + Hong Kong (HKEX). IFRS yok → Yahoo yedek.
  // Yahoo HK kodları sıfır dolgulu (0700.HK); TV ise 700 — resolveCnYahooSymbol / tvBaseCn.
  SS: {tv:'SSE',      scan:'china',       country:'Çin (Şanghay)', ccy:'CNY', sym:'¥', city:'Şanghay',   tz:'Asia/Shanghai',     open:570, close:900,  flag:'🇨🇳', iso:'CN'},
  SZ: {tv:'SZSE',     scan:'china',       country:'Çin (Şenzhen)', ccy:'CNY', sym:'¥', city:'Şenzhen',   tz:'Asia/Shanghai',     open:570, close:900,  flag:'🇨🇳', iso:'CN'},
  HK: {tv:'HKEX',     scan:'hongkong',    country:'Hong Kong',  ccy:'HKD', sym:'HK$',  city:'Hong Kong', tz:'Asia/Hong_Kong',    open:570, close:960,  flag:'🇭🇰', iso:'HK'},
  // Tayvan: TWSE (Yahoo .TW) + TPEx (Yahoo .TWO). Seans 09:00–13:30 Taipei.
  TW: {tv:'TWSE',     scan:'taiwan',      country:'Tayvan',     ccy:'TWD', sym:'NT$',  city:'Taipei',    tz:'Asia/Taipei',      open:540, close:810,  flag:'🇹🇼', iso:'TW'},
  TWO:{tv:'TPEX',     scan:'taiwan',      country:'Tayvan (TPEx)', ccy:'TWD', sym:'NT$', city:'Taipei',  tz:'Asia/Taipei',      open:540, close:810,  flag:'🇹🇼', iso:'TW'},
  // Kanada: TSX (.TO) + TSXV (.V). Avustralya: ASX (.AX). Singapur: SGX (.SI).
  TO: {tv:'TSX',      scan:'canada',      country:'Kanada',     ccy:'CAD', sym:'C$',   city:'Toronto',  tz:'America/Toronto',  open:570, close:960,  flag:'🇨🇦', iso:'CA'},
  V:  {tv:'TSXV',     scan:'canada',      country:'Kanada (TSXV)', ccy:'CAD', sym:'C$', city:'Toronto', tz:'America/Toronto',  open:570, close:960,  flag:'🇨🇦', iso:'CA'},
  AX: {tv:'ASX',      scan:'australia',   country:'Avustralya', ccy:'AUD', sym:'A$',   city:'Sidney',   tz:'Australia/Sydney', open:600, close:960,  flag:'🇦🇺', iso:'AU'},
  SI: {tv:'SGX',      scan:'singapore',   country:'Singapur',   ccy:'SGD', sym:'S$',   city:'Singapur', tz:'Asia/Singapore',   open:540, close:1020, flag:'🇸🇬', iso:'SG'},
};
/* "SIE.DE" → {base:'SIE', suffix:'DE', ...}; "6488.TWO" → TPEx. Eşleşmezse null.
   Suffix 1–3 harf: Avrupa/Asya iki harfli ekler + Tayvan TPEx (.TWO). */
function parseEUSymbol(sym){
  const m=/^([A-Z0-9]+(?:[.\-][A-Z0-9]+)?)\.([A-Z]{1,3})$/.exec(sym);
  if(!m) return null;
  const info=EU_EXCHANGES[m[2]];
  return info ? { base:m[1], suffix:m[2], ...info } : null;
}
/* TV bilanço/gelir/nakit-akış alanları → fetchSeries ile AYNI {D,I} şekli. Tek dönemlik anlık
   veridir (TV scanner geçmiş dönem serisi vermez) → D1 hep null; buildRowsFromSEC ve genel
   render işlevleri (Değerleme/Nakit Akışı/Sağlık Karnesi) bu şekli zaten tek-dönemli olarak
   nazikçe çözer (bkz. kpi() ve Piotroski'nin eksik kritere '—' vermesi). */
function euReshape(d){
  const [desc,sector,industry,ccy,close,mcap,shares,per,pbr,roe,roa,divY,eps,isin,
    revenue,netIncome,grossProfit,opIncome,assets,curAssets,cash,goodwill,
    ltDebt,stDebt,liab,curLiab,equity,opCF,invCF,finCF,capexRaw,rnd,floatShares,floatPct]=d;
  const K='snap';   // tek dönemlik anahtar (gerçek takvim tarihi TV'de yok)
  const one=v=> v==null?{}:{[K]:v};
  const D={ assets:one(assets), assetsCur:one(curAssets), cash:one(cash),
    stInv:{}, recv:{}, inv:{}, ppe:{}, goodwill:one(goodwill), intang:{}, ltInv:{},
    liab:one(liab), liabCur:one(curLiab), liabNoncur:{}, liabEquity:{},
    ap:{}, stDebt:one(stDebt), defRev:{}, ltDebt:one(ltDebt),
    equity:one(equity), equityIncl:{}, minority:{}, common:{}, retained:{} };
  const capex=capexRaw==null?null:Math.abs(capexRaw);
  const fcf=(opCF!=null&&capex!=null)?opCF-capex:null;
  const I={ revenue:one(revenue), costRev:one((revenue!=null&&grossProfit!=null)?revenue-grossProfit:null),
    grossProfit:one(grossProfit), opIncome:one(opIncome), netIncome:one(netIncome),
    rnd:one(rnd==null?null:Math.abs(rnd)), interest:{},
    _cash:{ opCF:one(opCF), invCF:one(invCF), finCF:one(finCF), capex:one(capex), fcf:one(fcf) } };
  return { D, I, D0:K, desc, sector, industry, ccy, close, mcap, shares, per, pbr, roe, roa, divY, eps, isin, floatShares, floatPct };
}
const EU_COLS=['description','sector','industry','fundamental_currency_code','close','market_cap_basic',
  'total_shares_outstanding_fundamental','price_earnings_ttm','price_book_fq','return_on_equity','return_on_assets',
  'dividend_yield_recent','earnings_per_share_basic_ttm','isin',
  'total_revenue_fy','net_income_fy','gross_profit_fy','oper_income_fy','total_assets_fq','total_current_assets_fq',
  'cash_n_equivalents_fq','goodwill_fq','long_term_debt_fq','short_term_debt_fq','total_liabilities_fq',
  'total_current_liabilities_fq','total_equity_fq',
  'cash_f_operating_activities_ttm','cash_f_investing_activities_ttm','cash_f_financing_activities_ttm',
  'capital_expenditures_ttm','research_and_dev_fq',
  'float_shares_outstanding','float_shares_percent_current'];

/* ================== Avrupa ÇOK YILLIK gerçek finansal veri (IFRS/ESEF) ==================
   ABD'de SEC EDGAR'ın yaptığının aynısı: GLEIF (ISIN→LEI) + filings.xbrl.org (LEI→IFRS XBRL,
   server.js /ifrs köprüsü). TV'nin tek-dönemlik özetinden farklı olarak GERÇEK çok-yıllı
   karşılaştırmalı veri verir (bkz. bilanco-analiz-app.md hafıza notu — Almanya/İsviçre'de
   kapsam yok, o borsalarda yukarıdaki TV özeti tek kaynak olarak kalır). */
const IFRS_BAL={
  assets:['Assets'],
  assetsCur:['CurrentAssets','CurrentAssetsOtherThanAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners'],
  cash:['CashAndCashEquivalents'], stInv:['CurrentInvestments'],
  recv:['TradeAndOtherCurrentReceivables','CurrentTradeReceivables'], inv:['Inventories'],
  ppe:['PropertyPlantAndEquipment'], goodwill:['Goodwill'], intang:['IntangibleAssetsOtherThanGoodwill'],
  ltInv:['NoncurrentInvestments'],
  liab:['Liabilities'],
  liabCur:['CurrentLiabilities','CurrentLiabilitiesOtherThanLiabilitiesIncludedInDisposalGroupsClassifiedAsHeldForSale'],
  liabNoncur:['NoncurrentLiabilities'], liabEquity:['EquityAndLiabilities'],
  ap:['TradeAndOtherCurrentPayables'],
  stDebt:['CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings','CurrentBorrowings'],
  defRev:['CurrentDeferredIncome'],
  ltDebt:['NoncurrentBorrowings','LongtermBorrowings'],
  equity:['EquityAttributableToOwnersOfParent','Equity'], minority:['NoncontrollingInterests'],
};
const IFRS_INC={
  revenue:['Revenue','RevenueFromContractsWithCustomers','RevenueFromSaleOfGoods'], costRev:['CostOfSales'], grossProfit:['GrossProfit'],
  opIncome:['ProfitLossFromOperatingActivities'], netIncome:['ProfitLoss'],
  rnd:['ResearchAndDevelopmentExpense'], interest:['FinanceCosts'],
};
const IFRS_CF={
  opCF:['CashFlowsFromUsedInOperatingActivities'], invCF:['CashFlowsFromUsedInInvestingActivities'],
  finCF:['CashFlowsFromUsedInFinancingActivities'], capex:['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'],
};
function ifrsDateKey(period){ return (period.includes('/')?period.split('/')[1]:period).slice(0,10); }
function ifrsPick(bucket, candidates){ for(const c of candidates){ if(bucket[c]!=null) return bucket[c]; } return null; }
/* server'dan gelen [kavram, dönem, değer] üçlülerini D0'dan geriye sıralı çok-dönemli {D,I}'ye çevirir. */
function ifrsBuildSeries(facts){
  const buckets={};
  for(const [c,p,v] of facts){ const k=ifrsDateKey(p); (buckets[k]=buckets[k]||{})[c]=v; }
  const dates=Object.keys(buckets).filter(k=> buckets[k].Assets!=null || buckets[k].Revenue!=null).sort().reverse();
  if(!dates.length) return null;
  const D={assets:{},assetsCur:{},cash:{},stInv:{},recv:{},inv:{},ppe:{},goodwill:{},intang:{},ltInv:{},
    liab:{},liabCur:{},liabNoncur:{},liabEquity:{},ap:{},stDebt:{},defRev:{},ltDebt:{},
    equity:{},equityIncl:{},minority:{},common:{},retained:{}};
  const I={revenue:{},costRev:{},grossProfit:{},opIncome:{},netIncome:{},rnd:{},interest:{},
    _cash:{opCF:{},invCF:{},finCF:{},capex:{},fcf:{}}};
  const put=(obj,k,v)=>{ if(v!=null) obj[k]=v; };
  for(const k of dates){
    const b=buckets[k];
    for(const f in IFRS_BAL) put(D[f],k,ifrsPick(b,IFRS_BAL[f]));
    for(const f in IFRS_INC) put(I[f],k,ifrsPick(b,IFRS_INC[f]));
    const opCF=ifrsPick(b,IFRS_CF.opCF), invCF=ifrsPick(b,IFRS_CF.invCF),
          finCF=ifrsPick(b,IFRS_CF.finCF), capexRaw=ifrsPick(b,IFRS_CF.capex);
    const capex=capexRaw==null?null:Math.abs(capexRaw);
    put(I._cash.opCF,k,opCF); put(I._cash.invCF,k,invCF); put(I._cash.finCF,k,finCF); put(I._cash.capex,k,capex);
    put(I._cash.fcf,k,(opCF!=null&&capex!=null)?opCF-capex:null);
    if(I.costRev[k]==null && I.revenue[k]!=null && I.grossProfit[k]!=null) I.costRev[k]=I.revenue[k]-I.grossProfit[k];
  }
  return { D, I, dates };
}
/* server.js /ifrs: ISIN→GLEIF LEI (deterministik, birincil) → ad araması (yedek, yalnız tek/net
   eşleşmede) → filings.xbrl.org en güncel filing → indirgenmiş IFRS facts. Başarısızsa null
   döner (çağıran taraf TV'nin tek-dönemlik özetinde kalır — sessiz, güvenli düşüş). */
async function fetchIfrsSeries(isin, companyName, iso){
  try{
    const q=new URLSearchParams({ isin: isin||'', name: companyName||'', country: iso||'' });
    const r=await fetch('/ifrs?'+q.toString());
    if(!r.ok) return null;
    const j=await r.json();
    if(!j.ok || !j.facts || !j.facts.length) return null;
    const built=ifrsBuildSeries(j.facts);
    if(!built) return null;
    return { ...built, lei:j.lei };
  }catch(e){ return null; }
}
/* Almanya (Xetra) ve İsviçre (SIX) filings.xbrl.org'da YOK (0 kayıt, doğrulandı) — ama birkaç
   büyük çok-uluslu şirket ADR/çift-kotasyon nedeniyle SEC'e DOĞRUDAN 20-F ile kayıtlı ve
   ifrs-full XBRL sunuyor (aynı SEC altyapısını ABD'de kullandığımız gibi — yalnız taxonomy
   'ifrs-full', tag'ler IFRS_BAL/IFRS_INC/IFRS_CF). Elle doğrulanmış, KÜÇÜK bir liste — tahmin
   YOK, her satır data.sec.gov'da 2026 tarihli aktif 20-F ile teyit edildi. Genişletilebilir. */
const DE_CH_SEC_XREF={
  'DE:SAP':{cik:'0001000184', name:'SAP SE'},
  'DE:DBK':{cik:'0001159508', name:'Deutsche Bank AG'},
  'DE:FME':{cik:'0001333141', name:'Fresenius Medical Care AG'},
  'SW:UBSG':{cik:'0001610520', name:'UBS Group AG'},
  'SW:NOVN':{cik:'0001114448', name:'Novartis AG'},
};
async function fetchSecIfrsSeries(cik){
  try{
    const {D,I}=await fetchSeries(cik,'annual','20-F',{ taxonomy:'ifrs-full', balanceDefs:IFRS_BAL, incomeDefs:IFRS_INC, cashDefs:IFRS_CF, cashForm:'20-F' });
    const dates=Object.keys(D.assets||{}).sort().reverse();
    if(!dates.length) return null;
    return { D, I, dates };
  }catch(e){ return null; }
}
/* GENEL çok-yıllı yedek: Yahoo fundamentals-timeseries (server.js /yfin köprüsü, anahtarsız).
   filings.xbrl.org VE SEC 20-F yolları boş kalırsa (özellikle Almanya/İsviçre'nin xref dışı
   ~620 şirketi) son 4 yıla kadar yıllık bilanço/gelir/nakit-akış verir. Alan adları Yahoo'nun
   kendi şeması; borçta şirkete göre iki varyanttan biri dolu olur (yedek zinciri). */
const YF_BAL={
  assets:['TotalAssets'], assetsCur:['CurrentAssets'], cash:['CashAndCashEquivalents'],
  recv:['AccountsReceivable'], inv:['Inventory'], ppe:['NetPPE'],
  goodwill:['Goodwill'], intang:['OtherIntangibleAssets'],
  liab:['TotalLiabilitiesNetMinorityInterest'], liabCur:['CurrentLiabilities'],
  ap:['AccountsPayable'],
  stDebt:['CurrentDebt','CurrentDebtAndCapitalLeaseObligation'],
  ltDebt:['LongTermDebt','LongTermDebtAndCapitalLeaseObligation'],
  equity:['StockholdersEquity'], minority:['MinorityInterest'],
};
const YF_INC={
  revenue:['TotalRevenue'], costRev:['CostOfRevenue'], grossProfit:['GrossProfit'],
  opIncome:['OperatingIncome'], netIncome:['NetIncome'], rnd:['ResearchAndDevelopment'],
};
const YF_CF={
  opCF:['OperatingCashFlow'], invCF:['InvestingCashFlow'],
  finCF:['FinancingCashFlow'], capex:['CapitalExpenditure'],
};
async function fetchYahooFundSeries(ysym, mode){
  try{
    const pfx = mode==='quarter' ? 'quarterly' : 'annual';
    const r=await fetch('/yfin?s='+encodeURIComponent(ysym)+(mode==='quarter'?'&p=q':''));
    if(!r.ok) return null;
    const j=await r.json();
    const results=j&&j.timeseries&&j.timeseries.result;
    if(!results||!results.length) return null;
    // tip → { 'YYYY-MM-DD': değer } haritaları
    const byType={};
    results.forEach(res=>{
      const t=res.meta&&res.meta.type&&res.meta.type[0];
      if(!t||!res[t]) return;
      const m={};
      res[t].forEach(e=>{ if(e&&e.asOfDate&&e.reportedValue&&e.reportedValue.raw!=null) m[e.asOfDate]=e.reportedValue.raw; });
      if(Object.keys(m).length) byType[t]=m;
    });
    const pick=(cands)=>{ for(const c of cands){ if(byType[pfx+c]) return byType[pfx+c]; } return {}; };
    const D={assets:{},assetsCur:{},cash:{},stInv:{},recv:{},inv:{},ppe:{},goodwill:{},intang:{},ltInv:{},
      liab:{},liabCur:{},liabNoncur:{},liabEquity:{},ap:{},stDebt:{},defRev:{},ltDebt:{},
      equity:{},equityIncl:{},minority:{},common:{},retained:{}};
    for(const f in YF_BAL) D[f]=Object.assign({},pick(YF_BAL[f]));
    const I={revenue:{},costRev:{},grossProfit:{},opIncome:{},netIncome:{},rnd:{},interest:{},
      _cash:{opCF:{},invCF:{},finCF:{},capex:{},fcf:{}}};
    for(const f in YF_INC) I[f]=Object.assign({},pick(YF_INC[f]));
    I._cash.opCF=Object.assign({},pick(YF_CF.opCF));
    I._cash.invCF=Object.assign({},pick(YF_CF.invCF));
    I._cash.finCF=Object.assign({},pick(YF_CF.finCF));
    const capexRaw=pick(YF_CF.capex);
    for(const d in capexRaw) I._cash.capex[d]=Math.abs(capexRaw[d]);
    for(const d in I._cash.opCF){ if(d in I._cash.capex) I._cash.fcf[d]=I._cash.opCF[d]-I._cash.capex[d]; }
    const dates=Object.keys(D.assets).sort().reverse();
    if(!dates.length) return null;
    return { D, I, dates };
  }catch(e){ return null; }
}
/* Güney Kore: kullanıcı her zaman ".KS" ile arar (diğer ülkeler gibi tek sabit ek), ama
   Yahoo'da fiyat/finansal veri için gerçek borsa ekinin (.KS=KOSPI / .KQ=KOSDAQ) BİREBİR
   doğru olması şart — yanlış ekte Yahoo veriyi "MUTUALFUND" gibi bambaşka bir enstrümana
   bağlıyor (curl ile doğrulandı). Yahoo'nun kendi arama uç noktası (server.js /yfsearch)
   ilk EQUITY sonucunda doğru eki doğrudan verir; başarısız olursa varsayılan .KS'de kalınır. */
async function resolveKrYahooSymbol(code){
  try{
    const r=await fetch('/yfsearch?q='+encodeURIComponent(code));
    if(!r.ok) return null;
    const j=await r.json();
    const hit=(j.quotes||[]).find(q=>q.quoteType==='EQUITY' && /\.(KS|KQ)$/.test(q.symbol||''));
    return hit?hit.symbol:null;
  }catch(e){ return null; }
}
/* Çin / Hong Kong Yahoo eki: .SS (Şanghay) · .SZ (Şenzhen) · .HK (Hong Kong).
   HK'de TV "700", Yahoo "0700.HK" — sıfır dolgusu şart (curl: 700.HK → 404). */
async function resolveCnYahooSymbol(code, suffix){
  try{
    const r=await fetch('/yfsearch?q='+encodeURIComponent(code));
    if(r.ok){
      const j=await r.json();
      const re = suffix==='HK' ? /\.HK$/ : (suffix==='SS' ? /\.SS$/ : /\.SZ$/);
      const hit=(j.quotes||[]).find(q=>q.quoteType==='EQUITY' && re.test(q.symbol||''));
      if(hit) return hit.symbol;
      // Yanlış ek verilmiş olabilir (600519.SZ) → herhangi bir CN/HK equity kabul et
      const any=(j.quotes||[]).find(q=>q.quoteType==='EQUITY' && /\.(SS|SZ|HK)$/.test(q.symbol||''));
      if(any) return any.symbol;
    }
  }catch(e){}
  if(suffix==='HK'){
    const digits=String(code).replace(/\D/g,'');
    if(digits) return digits.padStart(4,'0')+'.HK';
  }
  return code+'.'+suffix;
}
/* Tayvan: kullanıcı .TW yazar; TPEx hisselerinde gerçek Yahoo eki .TWO olabilir (KR KS/KQ gibi). */
async function resolveTwYahooSymbol(code){
  try{
    const r=await fetch('/yfsearch?q='+encodeURIComponent(code));
    if(!r.ok) return null;
    const j=await r.json();
    const hit=(j.quotes||[]).find(q=>q.quoteType==='EQUITY' && /\.(TW|TWO)$/.test(q.symbol||''));
    return hit?hit.symbol:null;
  }catch(e){ return null; }
}
/* Kanada: TSX=.TO · TSXV=.V — yanlış ekte Yahoo boş dönebilir. */
async function resolveCaYahooSymbol(code){
  try{
    const r=await fetch('/yfsearch?q='+encodeURIComponent(code));
    if(!r.ok) return null;
    const j=await r.json();
    const hit=(j.quotes||[]).find(q=>q.quoteType==='EQUITY' && /\.(TO|V)$/.test(q.symbol||'') && (q.exchDisp||'').match(/Toronto|TSX|Venture/i));
    if(hit) return hit.symbol;
    const any=(j.quotes||[]).find(q=>q.quoteType==='EQUITY' && /\.(TO|V)$/.test(q.symbol||''));
    return any?any.symbol:null;
  }catch(e){ return null; }
}
/* TradingView HKEX kodları öndeki sıfırları taşımaz (HKEX:700); Yahoo ise 0700.HK ister. */
function euTvBase(euInfo){
  let b=String(euInfo.base).replace(/-/g,'_');
  if(euInfo.suffix==='HK') b=b.replace(/^0+/,'')||'0';
  return b;
}
async function resolveYahooForEu(euInfo){
  let ysym=euInfo.base+'.'+euInfo.suffix;
  const applySuffix=resolved=>{
    if(!resolved) return;
    ysym=resolved;
    const newSfx=resolved.slice(resolved.lastIndexOf('.')+1);
    euInfo.suffix=newSfx;
    const ex=EU_EXCHANGES[newSfx];
    if(ex){
      euInfo.tv=ex.tv; euInfo.scan=ex.scan; euInfo.country=ex.country;
      euInfo.ccy=ex.ccy; euInfo.sym=ex.sym; euInfo.flag=ex.flag;
      if(ex.iso) euInfo.iso=ex.iso;
    }
  };
  if(euInfo.suffix==='KS'||euInfo.suffix==='KQ'){
    applySuffix(await resolveKrYahooSymbol(euInfo.base));
  }else if(euInfo.suffix==='HK'||euInfo.suffix==='SS'||euInfo.suffix==='SZ'){
    applySuffix(await resolveCnYahooSymbol(euInfo.base, euInfo.suffix));
  }else if(euInfo.suffix==='TW'||euInfo.suffix==='TWO'){
    applySuffix(await resolveTwYahooSymbol(euInfo.base));
  }else if(euInfo.suffix==='TO'||euInfo.suffix==='V'){
    applySuffix(await resolveCaYahooSymbol(euInfo.base));
  }
  return ysym;
}
async function fetchTickerEU(euInfo, mode, myGen){
  const tvTicker=euInfo.tv+':'+euTvBase(euInfo);
  /* Yahoo çözümü ∥ TradingView tarama — bağımsız, sırayla beklemeyi kaldır */
  const ysymP=resolveYahooForEu(euInfo);
  const scanP=fetch('https://scanner.tradingview.com/'+euInfo.scan+'/scan',
    {method:'POST',body:JSON.stringify({symbols:{tickers:[tvTicker]},columns:EU_COLS})})
    .then(async r=> r.ok ? r.json() : null)
    .catch(()=>null);
  let ysym=await ysymP;
  if(myGen!==REQ_GEN) return;
  const sym=euInfo.base;
  try{
    const j=await scanP;
    if(myGen!==REQ_GEN) return;
    const row=j&&j.data&&j.data.find(x=>x.d&&x.d[4]!=null);   // close (index 4) doluysa hisse gerçek
    if(!row){ setStatus(tf('status_ex_not_found',{s:sym+'.'+euInfo.suffix, c:euCountry(euInfo)}),'bad'); return; }
    const R=euReshape(row.d);
    if(!Object.keys(R.D.assets).length && !Object.keys(R.I.revenue).length){
      setStatus(tf('status_no_fin',{s:sym}),'bad'); return;
    }
    CUR=R.ccy||euInfo.ccy; CURSYM=euInfo.sym;
    // TV'nin tek-dönemlik özeti varsayılan; IFRS/ESEF çok-yıllı veri bulunursa onunla DEĞİŞTİRİLİR
    // (ISIN→LEI deterministik eşleşirse VE filings.xbrl.org'da o şirket varsa — bkz. fetchIfrsSeries).
    let D=R.D, I=R.I, D0=R.D0, D1=null, filedD0=null, filedD1=null, srcNote='TradingView (tek dönem özeti)';
    let ifrs=null;
    if(mode==='quarter'){
      // Çeyreklik: ESEF ve SEC 20-F YALNIZ yıllık verir → doğrudan Yahoo çeyreklik serisi.
      // Not: yarıyıllık raporlayan şirketlerde (Nestle, LVMH…) Yahoo 6 aylık dönemler döndürür —
      // şirketin gerçekte yayınladığı en sık dönem budur, daha sığı kamuya açık değil.
      ifrs=await fetchYahooFundSeries(ysym,'quarter');
      if(myGen!==REQ_GEN) return;
      if(ifrs) ifrs.viaYahoo=true;
    }else{
      ifrs=await fetchIfrsSeries(R.isin, R.desc, euInfo.iso);
      if(myGen!==REQ_GEN) return;
      // Almanya/İsviçre'de filings.xbrl.org kapsamı yok — elle doğrulanmış SEC 20-F eşlemesi varsa dene.
      if(!ifrs){
        const xref=DE_CH_SEC_XREF[euInfo.suffix+':'+sym];
        if(xref){
          ifrs=await fetchSecIfrsSeries(xref.cik);
          if(myGen!==REQ_GEN) return;
          if(ifrs) ifrs.viaSec=true;
        }
      }
      // Son basamak: Yahoo fundamentals-timeseries (genel yedek — özellikle DE/CH xref-dışı şirketler).
      if(!ifrs){
        ifrs=await fetchYahooFundSeries(ysym);
        if(myGen!==REQ_GEN) return;
        if(ifrs) ifrs.viaYahoo=true;
      }
    }
    if(ifrs){
      D=ifrs.D; I=ifrs.I; D0=ifrs.dates[0]; D1=ifrs.dates[1]||null; filedD0=D0; filedD1=D1;
      srcNote=ifrs.viaSec ? 'IFRS çok yıllı (SEC EDGAR 20-F)'
             : ifrs.viaYahoo ? (mode==='quarter'?'çeyreklik (Yahoo Finance)':'çok yıllı (Yahoo Finance)')
             : 'IFRS/ESEF çok yıllı (filings.xbrl.org)';
    }
    if(myGen!==REQ_GEN) return;
    FIN={ ticker:sym, mode, cur:CUR, market:'EU', euInfo, D0, D1, balance:D, income:I,
          filedD0, filedD1, companyName:R.desc||sym, sector:R.sector, industry:R.industry,
          sharesEU:R.shares, ifrsSource:!!ifrs };
    const rows=buildRowsFromSEC(D, D0, D1);
    const b=document.getElementById('inputBody'); b.innerHTML='';
    rows.forEach(rr=>b.insertAdjacentHTML('beforeend', rowHTML(rr[0],rr[1],rr[2],rr[3])));
    document.getElementById('curNote').textContent=CUR+' '+t('cur_in');
    if(D1) setPeriodHeaders(fmtDate(D0), fmtDate(D1)); else setPeriodHeaders(ifrs?fmtDate(D0):t('th_cur'), null);
    setMarketOrigin({
      country: euCountry(euInfo),
      exchange: euInfo.tv || euInfo.city || ('ek .'+euInfo.suffix),
      ccy: CUR || euInfo.ccy,
      code: sym+'.'+euInfo.suffix
    });
    setStatus(`✓ ${sym}.${euInfo.suffix} — ${euCountry(euInfo)} — ${D1?(mode==='quarter'?t('quarterly'):t('data_annual')):t('status_latest_period')} — ${CUR} — ${srcNote}`,'good');
    analyze(myGen);
    fetchNews(sym, myGen);
    fetchPrice(sym, null, myGen, { ysym, shares:R.shares });
    fetchTargetsEU(sym, euInfo, myGen);
    fetchNextEarnings(sym, 'EU', myGen, { tv:tvTicker, scan:euInfo.scan, ysym });
    fetchPriceChart(sym, ysym, myGen);
    fetchSectorComparison(sym, 'EU', myGen, { tv:tvTicker, scan:euInfo.scan, sector:R.sector });
    TECH_SHORT=null;   // kısa pozisyon verisi (Finviz) yalnızca ABD'de var
    fetchTechPanel(sym, 'EU', myGen, { tv:tvTicker, scan:euInfo.scan, ysym });
    updateWatchStar();
    startEuExchangeClock(euInfo);   // sağ üstte borsanın bulunduğu şehrin canlı saati + seans durumu
    renderOwnershipEU(R.floatPct, R.floatShares, R.shares);   // halka açıklık pastası (TV free float)
    // KAP/İçeriden işlem: Avrupa'da anahtarsız kaynak yok (KAP=TR, Form 4=ABD) — kart gizlenir
    ['kapCard','insiderCard'].forEach(id=>{ const c=document.getElementById(id); if(c) c.classList.add('hidden'); });
  }catch(e){
    if(myGen===REQ_GEN) setStatus(tf('status_net_err',{e:e.message}),'bad');
  }
}

/* ---------- Bare kod → borsa tespiti ----------
   Kullanıcı ülke eki YAZMADAN arayabilsin diye: kod eksiz girildiğinde hangi borsalarda
   birincil kotasyonu olduğu tek bir TradingView global scan çağrısıyla bulunur
   (BIST + Avrupa/Kore/Japonya borsa önekleri tek istekte; EURONEXT 4 ülkeyi kapsadığından
   ülke sütunuyla ayrıştırılır). ABD tespiti yerel CIK haritasından (istek gerekmez).
   Tek borsada bulunduysa otomatik oraya yönlenir; birden fazlaysa tıklanabilir
   seçenekler gösterilir (ya da kullanıcı eki elle yazar: .US / .IS / .T / .HK / .TW / .TO / .AX / .SI …). */
const EURONEXT_COUNTRY_SUFFIX={ 'France':'PA', 'Netherlands':'AS', 'Belgium':'BR', 'Portugal':'LS' };
const DETECT_CACHE={}; /* sym → { at, data } — tekrar aramalarda TV taramasını atla */
const DETECT_TTL=10*60*1000;
async function detectBareMarkets(sym){
  const key=String(sym||'').toUpperCase();
  const hit=DETECT_CACHE[key];
  if(hit && (Date.now()-hit.at)<DETECT_TTL) return hit.data;
  const map=window.CIK_MAP||{};
  const cands=[];
  let scanOk=false;
  if(map[key]) cands.push({ market:'US', code:key+'.US', label:'🇺🇸 ABD', desc:'' });
  try{
    const tvSym=key.replace(/-/g,'_');
    const prefixes=[...new Set(Object.values(EU_EXCHANGES).map(e=>e.tv))];
    const tickers=['BIST:'+tvSym, ...prefixes.map(p=>p+':'+tvSym)];
    const r=await fetch('https://scanner.tradingview.com/global/scan',
      {method:'POST',body:JSON.stringify({symbols:{tickers},columns:['name','is_primary','close','country','description']})});
    if(r.ok){
      const j=await r.json();
      scanOk=true;
      const rows=(j.data||[]).filter(x=>x.d && x.d[2]!=null);   // close dolu = gerçek kotasyon
      const bistRow=rows.find(x=>x.s.indexOf('BIST:')===0);
      if(bistRow) cands.push({ market:'BIST', code:key+'.IS', label:'🇹🇷 '+t('exch_bist'), desc:bistRow.d[4]||'' });
      let euRows=rows.filter(x=>x.s.indexOf('BIST:')!==0);
      const prim=euRows.filter(x=>x.d[1]===true);
      // Birincil kotasyon varsa çapraz kotasyonları ele; hiç birincil yoksa ve başka aday da
      // yoksa (VOLV-B gibi is_primary=false görünen yerel seriler için) hepsini kabul et.
      euRows = prim.length ? prim : (cands.length ? [] : euRows);
      euRows.forEach(x=>{
        const pfx=x.s.split(':')[0];
        let sfx=null;
        if(pfx==='EURONEXT') sfx=EURONEXT_COUNTRY_SUFFIX[x.d[3]]||null;
        else{ const ent=Object.entries(EU_EXCHANGES).find(([s,e])=>e.tv===pfx); sfx=ent?ent[0]:null; }
        if(sfx && !cands.some(c=>c.code===key+'.'+sfx))
          cands.push({ market:'EU', code:key+'.'+sfx, label:EU_EXCHANGES[sfx].flag+' '+euCountry(EU_EXCHANGES[sfx]), desc:x.d[4]||'' });
      });
    }
  }catch(e){}
  const data={ cands, scanOk };
  /* Başarısız / boş taramayı cache'leme — geçici TV hatası 10 dk kilitlenmesin */
  if(scanOk) DETECT_CACHE[key]={ at:Date.now(), data };
  return data;
}
/* Birden fazla borsada bulunan kod için seçenek düğmeleri (tıkla → o borsada ara) */
function renderMarketChoices(sym,cands){
  const el=document.getElementById('fetchStatus');
  el.style.color='var(--warn)';
  el.innerHTML='⚠ <b>'+safeHTML(sym)+'</b> '+t('mkt_multi_prompt')+'<br>'+
    cands.map(c=>`<button type="button" style="margin:4px 4px 0 0;padding:5px 11px;font-size:12px" onclick="searchExact('${c.code}')">${c.label}${c.desc?' · '+safeHTML(c.desc).slice(0,30):''}</button>`).join('')+
    '<br><span class="hint">'+t('mkt_multi_hint')+' '+cands.map(c=>'<b>'+c.code+'</b>').join(' · ')+'</span>';
}
function searchExact(code){
  document.getElementById('ticker').value=code;
  switchPage('stock');   // İlk 100 gibi başka sekmelerden gelen tıklamalarda analiz sekmesine geç
  fetchTicker();
}
async function fetchTicker(forcedSym){
  if(location.protocol==='file:'){
    setStatus('⚠ '+t('status_file_protocol'),'bad');
    return;
  }
  let sym=(forcedSym!=null&&forcedSym!==''
    ? String(forcedSym)
    : (document.getElementById('ticker').value||'')).trim().toUpperCase();
  if(!sym){ setStatus(t('status_enter_ticker'),'bad'); return; }
  const tickInp=document.getElementById('ticker');
  if(tickInp) tickInp.value=sym;
  stopLivePrice();
  setMarketOrigin(null);
  const mode=document.getElementById('periodType').value;        // 'annual' | 'quarter'
  const map=window.CIK_MAP||{};
  // Elle yazılmış ekler her zaman doğrudan yönlendirir: Avrupa (SAP.DE…), BIST (.IS), ABD (.US)
  const euInfo=parseEUSymbol(sym);
  if(euInfo && euInfo.suffix!=='US' && euInfo.suffix!=='IS'){
    setStatus(tf('status_fetch_ex',{s:euInfo.base+'.'+euInfo.suffix, c:euCountry(euInfo)}),'muted');
    const myGen=++REQ_GEN;
    fetchTickerEU(euInfo, mode, myGen);
    return;
  }
  if(/\.IS$/.test(sym)){
    sym=sym.replace(/\.IS$/,'');
    setStatus(tf('status_fetch_kap',{s:sym}),'muted');
    const myGen=++REQ_GEN;
    fetchTickerBIST(sym, mode, myGen);
    return;
  }
  if(/\.US$/.test(sym)){
    sym=sym.replace(/\.US$/,'');
    if(!map[sym]){ setStatus(tf('status_us_list_miss',{s:sym}),'bad'); return; }
    const myGen=++REQ_GEN;
    fetchTickerUS(sym, mode, myGen);
    return;
  }
  /* ABD listesinde bilinen kod → ikinci detectBareMarkets beklemeden çek (AAPL→AMD yarışını kısaltır) */
  if(map[sym]){
    const myGen=++REQ_GEN;
    setStatus(tf('status_fetch_sec',{s:sym}),'muted');
    fetchTickerUS(sym, mode, myGen);
    return;
  }
  // Eksiz kod → borsayı otomatik bul
  const myGen=++REQ_GEN;
  setStatus(tf('status_searching_mkts',{s:sym}),'muted');
  const { cands, scanOk }=await detectBareMarkets(sym);
  if(myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
  if(!cands.length){
    if(!scanOk){
      // Tespit servisi erişilemedi → eski davranış: ABD listesinde varsa ABD, yoksa BIST dene
      if(map[sym]) fetchTickerUS(sym, mode, myGen);
      else fetchTickerBIST(sym, mode, myGen);
      return;
    }
    setStatus(tf('status_not_found_all',{s:sym}),'bad');
    return;
  }
  // Birden fazla borsa → bayrak/seçim yok; ABD > BIST > diğer önceliğiyle otomatik aç
  const c = cands.find(x=>x.market==='US') || cands.find(x=>x.market==='BIST') || cands[0];
  if(c.market==='US') fetchTickerUS(sym, mode, myGen);
  else if(c.market==='BIST'){
    setStatus(tf('status_fetch_kap',{s:sym}),'muted');
    fetchTickerBIST(sym, mode, myGen);
  }else{
    const eu=parseEUSymbol(c.code);
    setStatus(tf('status_fetch_ex',{s:eu.base+'.'+eu.suffix, c:euCountry(eu)}),'muted');
    fetchTickerEU(eu, mode, myGen);
  }
}
async function fetchTickerUS(sym, mode, myGen){
  const map=window.CIK_MAP||{};
  const formPrefix = mode==='annual' ? '10-K' : '10-Q';
  const cik=String(map[sym]).padStart(10,'0');
  setStatus(tf('status_fetch_sec',{s:sym}),'muted');

  try{
    let { D, I, filed } = await fetchSeries(cik, mode, formPrefix);
    if(myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış

    // Bazı ABD listesindeki ADR'ler (SAP, gelecekte eklenebilecek benzerleri) SEC'e us-gaap/10-K
    // yerine ifrs-full/20-F ile kayıtlıdır (yabancı özel ihraççı) → boşsa bu yolu dene.
    let isIfrs20F=false;
    if(!Object.keys(D.assets).length){
      const ifrs=await fetchSecIfrsSeries(cik);
      if(myGen!==REQ_GEN) return;
      if(ifrs && Object.keys(ifrs.D.assets).length){ D=ifrs.D; I=ifrs.I; filed=null; isIfrs20F=true; }
    }

    if(!Object.keys(D.assets).length){ setStatus(tf('status_no_bs',{s:sym, f:formPrefix}),'bad'); return; }
    if(myGen!==REQ_GEN) return;
    // Referans dönem tarihleri: toplam aktiften en güncel iki dönem sonu
    const dates=Object.keys(D.assets).sort().reverse();
    const D0=dates[0], D1=dates[1]||null;
    if(!D1){ setStatus(tf('status_one_period',{s:sym}),'muted'); }
    if(myGen!==REQ_GEN) return;

    CUR='USD'; CURSYM='$';
    // Çok yıllı analiz/grafik/karşılaştırma için sakla
    FIN = { ticker:sym, mode, cur:'USD', market:'US', D0, D1, balance:D, income:I,
            filedD0:(filed&&filed[D0])||null,
            // Not: mali yıl sonu çeyreği (Q4) ayrı bir 10-Q'da raporlanmaz, sadece 10-K'da yer alır.
            // Bu durumda "ilk açıklanma" araması cari dönemin dosyalama tarihini bulur (filedD1===filedD0) —
            // bu yanlış/yanıltıcı olur (aynı fiyat iki kez gösterilir). Böyle durumlarda bilinmiyor sayılır.
            filedD1:(filed&&D1&&filed[D1]&&filed[D1]!==filed[D0])?filed[D1]:null };

    const rows=buildRowsFromSEC(D,D0,D1);
    const b=document.getElementById('inputBody'); b.innerHTML='';
    rows.forEach(r=>b.insertAdjacentHTML('beforeend', rowHTML(r[0],r[1],r[2],r[3])));
    document.getElementById('curNote').textContent=t('cur_usd');
    setFinancialPeriodHeaders();
    const periodLbl = isIfrs20F ? (getLang()==='en'?'annual (20-F)':'yıllık (20-F)') : (mode==='annual'?t('data_annual'):t('quarterly'));
    setMarketOrigin({ country:getLang()==='en'?'United States':t('mkt_us'), exchange:getLang()==='en'?'US (SEC EDGAR)':'ABD (SEC EDGAR)', ccy:'USD', code:sym+'.US' });
    setStatus(tf('status_ok_us',{s:sym, mode:periodLbl, d:fmtDate(financialDisplayDate(0))+(financialDisplayDate(1)?'  ↔  '+fmtDate(financialDisplayDate(1)):'')}),'good');
    analyze(myGen);
    fetchNews(sym, myGen);
    fetchPrice(sym, cik, myGen);
    fetchTargets(sym, myGen);
    fetchNextEarnings(sym, 'US', myGen);
    startNyClock();   // sağ üstte saniyelik canlı New York saati
    fetchPriceChart(sym, sym, myGen);
    fetchSectorComparison(sym, 'US', myGen);
    fetchInsiders(cik, myGen);   // Form 4 içeriden işlemler (yalnızca ABD)
    TECH_SHORT=null;             // önceki hissenin kısa pozisyonu görünmesin
    fetchTechPanel(sym, 'US', myGen);
    updateWatchStar();
    const kc=document.getElementById('kapCard'); if(kc) kc.classList.add('hidden');  // KAP yalnızca BIST
  }catch(e){
    if(myGen===REQ_GEN) setStatus(tf('status_net_err',{e:e.message}),'bad');
  }
}

/* ---------- Analist hedef fiyatları (Finviz — anahtarsız köprü; Yahoo Render'da IP engeli yediği için değiştirildi) ---------- */
function gradeClass(g){
  const s=(g||'').toLowerCase();
  if(/buy|outperform|overweight|positive|accumulate|add|strong/.test(s)) return 'g-buy';
  if(/sell|underperform|underweight|reduce|negative/.test(s)) return 'g-sell';
  return 'g-hold';
}
/* Yalnızca en büyük ABD/global banka & aracı kurumlar (Finviz firma adında geçen parça, küçük harf) */
const BIG_FIRMS = [
  'jp morgan','jpmorgan','j.p. morgan','morgan stanley','goldman','bank of america','b of a','bofa','merrill',
  'citigroup','citi','wells fargo','barclays','ubs','deutsche bank','rbc','bmo','jefferies','evercore',
  'cowen','stifel','wedbush','piper sandler','raymond james','truist','mizuho','oppenheimer','needham',
  'keybanc','key banc','baird','cantor','bernstein','guggenheim','wolfe','hsbc','bnp paribas','scotiabank',
  'scotia','susquehanna','nomura','macquarie','loop capital','william blair','canaccord','citizens'
];
function actionLbl(act){
  return ({ Upgrade:t('act_up'), Downgrade:t('act_down'), Reiterated:t('act_reit'), Initiated:t('act_init') })[act]||act||'—';
}
/* Finviz "Recom" skoru 1 (Güçlü Al) — 5 (Güçlü Sat) arası ortalama analist puanı */
function recomLabel(v){
  if(v==null || isNaN(v)) return null;
  if(v<=1.5) return [t('recom_sb'),'g-buy'];
  if(v<=2.5) return [t('recom_b'),'g-buy'];
  if(v<=3.5) return [t('recom_h'),'g-hold'];
  if(v<=4.5) return [t('recom_s'),'g-sell'];
  return [t('recom_ss'),'g-sell'];
}
async function fetchTargets(sym, myGen){
  const card=document.getElementById('targetCard'), box=document.getElementById('targetBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">'+t('tgt_loading')+'</div>';
  try{
    const [tR, pR] = await Promise.all([
      fetch('/targets?s='+encodeURIComponent(sym)).then(x=>x.json()).catch(()=>null),
      fetch('/price?s='+encodeURIComponent(sym)+'&range=1d').then(x=>x.json()).catch(()=>null)
    ]);
    if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
    if(!tR || !tR.ok){ box.innerHTML='<div class="hint">'+t('tgt_none')+'</div>'; return; }
    renderOwnershipUS(tR.own, sym);   // pasta + Yahoo 13F kurumsal liste
    if(tR.shortData){ TECH_SHORT=tR.shortData; renderTechShort(); }   // teknik panele kısa pozisyon satırı
    const meta = pR && pR.chart && pR.chart.result && pR.chart.result[0] && pR.chart.result[0].meta;
    const cur = meta ? meta.regularMarketPrice : null;
    const mean = tR.targetPrice;
    const ratings = tR.ratings || [];

    let html='';
    // 1) Konsensüs + tavsiye kartları
    if(mean!=null || tR.recom!=null){
      const up = (cur && mean) ? (mean-cur)/cur*100 : null;
      const upCls = up==null?'neutral':(up>0?'up':'down');
      const rl = recomLabel(tR.recom);
      html+=`<div class="tgt-grid">
        <div class="tgt-box"><div class="lbl">${t('tgt_mean')}</div>
          <div class="big">${fmtUSD(mean)}</div>
          ${up!=null?`<div class="sm ${upCls}">${up>0?'▲':'▼'} ${pct(up)} <span class="neutral">${t('tgt_pot')}</span></div>`:''}
          ${cur!=null?`<div class="sm neutral">${t('tgt_cur')} ${fmtUSD(cur)}</div>`:''}</div>
        <div class="tgt-box"><div class="lbl">${t('tgt_rec')}</div>
          <div class="big">${rl?`<span class="grade ${rl[1]}">${rl[0]}</span>`:'—'}</div>
          <div class="sm neutral">${tR.recom!=null?t('tgt_score')+' '+tR.recom.toFixed(2)+' '+t('tgt_score_h'):''}</div></div>
        <div class="tgt-box"><div class="lbl">${t('tgt_cnt')}</div>
          <div class="big">${ratings.length||'—'}</div>
          <div class="sm neutral">${t('tgt_cnt_sub')}</div></div>
      </div>`;
    }
    // 2) Firma bazlı son notlar — yalnızca büyük ABD bankaları & aracı kurumlar
    const hist=ratings.filter(x=> BIG_FIRMS.some(f=> (x.firm||'').toLowerCase().includes(f)));
    if(hist.length){
      const loc=getLang()==='en'?'en-US':'tr-TR';
      const rows=hist.slice(0,12).map(x=>{
        const d=new Date((x.date||0)*1000);
        const ds=isNaN(d)?'':d.toLocaleDateString(loc,{day:'2-digit',month:'short',year:'numeric'});
        const act=actionLbl(x.action);
        const actCls=x.action==='Upgrade'?'up':x.action==='Downgrade'?'down':'neutral';
        return `<tr><td>${safeHTML(x.firm||'')}</td>
          <td><span class="grade ${gradeClass(x.rating)}">${safeHTML(x.rating||'—')}</span></td>
          <td class="${actCls}">${act}</td>
          <td>${safeHTML(x.priceChange||'—')}</td>
          <td>${ds}</td></tr>`;
      }).join('');
      html+=`<div style="margin-top:18px;font-weight:700;color:var(--ink)">${t('tgt_hist')}</div>
        <table style="margin-top:8px"><thead><tr><th>${t('tgt_th_firm')}</th><th>${t('tgt_th_rate')}</th><th>${t('tgt_th_act')}</th><th>${t('tgt_th_tp')}</th><th>${t('tgt_th_date')}</th></tr></thead><tbody>${rows}</tbody></table>`;
    }else if(ratings.length){
      html+=`<div class="hint" style="margin-top:14px">${t('tgt_no_big')}</div>`;
    }
    box.innerHTML = html || '<div class="hint">'+t('tgt_none')+'</div>';
  }catch(e){ box.innerHTML='<div class="hint">'+t('tgt_none')+': '+e.message+'</div>'; }
}

/* ---------- Borsa şehri canlı saati (TR: İstanbul; ABD: NY; Avrupa: ilgili şehir) ----------
   Saniyede bir güncellenir; cfg.open–cfg.close (dakika) hafta içi = seans saatleri (resmi tatiller
   hesaba katılmaz, o yüzden "borsa açık" değil "seans içi" denir). */
let EXCH_TIMER=null;
function startExchangeClock(cfg){
  const el=document.getElementById('nyClock');
  if(!el) return;
  const loc=localeTag();
  const fTime=new Intl.DateTimeFormat(loc,{timeZone:cfg.tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  const fDay =new Intl.DateTimeFormat(loc,{timeZone:cfg.tz,weekday:'long'});
  const fNum =new Intl.DateTimeFormat('en-US',{timeZone:cfg.tz,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  const tick=()=>{
    const now=new Date();
    const p=fNum.formatToParts(now), g=k=>p.find(x=>x.type===k)?.value||'';
    const wd=g('weekday'), mins=parseInt(g('hour'),10)*60+parseInt(g('minute'),10);
    const inSession=!['Sat','Sun'].includes(wd) && mins>=cfg.open && mins<cfg.close;
    const city=typeof cfg.city==='function'?cfg.city():cfg.city;
    el.innerHTML=cfg.flag+' '+city+': <span style="color:#fff">'+fTime.format(now)+'</span> · '+fDay.format(now)+
      (inSession?' · <span style="color:var(--good)">'+t('sess_in')+'</span>'
                :' · <span style="color:var(--muted)">'+t('sess_out')+'</span>');
  };
  tick();
  if(EXCH_TIMER) clearInterval(EXCH_TIMER);
  EXCH_TIMER=setInterval(tick,1000);
  el.classList.remove('hidden');
  window._exchClockCfg=cfg;
}
function stopNyClock(){
  const el=document.getElementById('nyClock');
  if(EXCH_TIMER){ clearInterval(EXCH_TIMER); EXCH_TIMER=null; }
  if(el){ el.classList.add('hidden'); el.innerHTML=''; }
  window._exchClockCfg=null;
}
function startNyClock(){
  startExchangeClock({flag:'🗽',city:'New York',tz:'America/New_York',open:570,close:960});   // 09:30–16:00
}
function startBistClock(){
  // BIST pay piyasası: 10:00–18:00 (Europe/Istanbul), hafta içi
  startExchangeClock({flag:'🇹🇷',city:()=>t('city_istanbul'),tz:'Europe/Istanbul',open:600,close:1080});
}
function startEuExchangeClock(euInfo){
  startExchangeClock({flag:euInfo.flag,city:euInfo.city,tz:euInfo.tz,open:euInfo.open,close:euInfo.close});
}

/* ---------- Kazançlar paneli (TradingView EPS gerçekleşen/tahmin) ----------
   Scanner: dilüe HBK geçmişi (fq_h/fy_h), mali dönem sonları, sonraki HBK/gelir tahmini. */
let EARN_CACHE=null, EARN_MODE='quarter';
function setEarnMode(mode){
  EARN_MODE=mode==='annual'?'annual':'quarter';
  document.getElementById('earnTabFY')?.classList.toggle('active', EARN_MODE==='annual');
  document.getElementById('earnTabQ')?.classList.toggle('active', EARN_MODE==='quarter');
  if(EARN_CACHE) renderEarnPanel(EARN_CACHE);
}
function fmtEarnCcy(v, ccy){
  if(v==null||!isFinite(v)) return '—';
  const a=Math.abs(v), c=ccy||'USD';
  if(a>=1e12) return (v/1e12).toLocaleString('tr-TR',{maximumFractionDigits:2})+' T '+c;
  if(a>=1e9) return (v/1e9).toLocaleString('tr-TR',{maximumFractionDigits:2})+' B '+c;
  if(a>=1e6) return (v/1e6).toLocaleString('tr-TR',{maximumFractionDigits:2})+' M '+c;
  return v.toLocaleString('tr-TR',{maximumFractionDigits:2})+' '+c;
}
function fmtEarnEps(v, ccy){
  if(v==null||!isFinite(v)) return '—';
  return Number(v).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(ccy||'USD');
}
function earnQLabel(s){
  if(s==null||s==='') return '';
  const str=String(s);
  let m=str.match(/^(20\d{2})-Q([1-4])$/i);
  if(m) return 'Q'+m[2]+" '"+m[1].slice(2);
  m=str.match(/^(\d)Q(20\d{2})$/i);
  if(m) return 'Q'+m[1]+" '"+m[2].slice(2);
  m=str.match(/^Q(\d)\s*'?(20)?(\d{2})$/i);
  if(m) return 'Q'+m[1]+" '"+m[3];
  m=str.match(/^(20\d{2})$/);
  if(m) return m[1];
  return str;
}
/* TradingView tarzı: "Q4, 2026" */
function fmtEarnPeriod(q, y){
  if(!q||!y) return '';
  return 'Q'+q+', '+y;
}
function chartQLabel(q, y){
  return 'Q'+q+" '"+String(y).slice(2);
}
function parseFiscalQY(s){
  if(s==null||s==='') return null;
  const str=String(s);
  let m=str.match(/^(20\d{2})-Q([1-4])$/i);
  if(m) return { q:+m[2], y:+m[1] };
  m=str.match(/^(\d)Q(20\d{2})$/i);
  if(m) return { q:+m[1], y:+m[2] };
  m=str.match(/^Q(\d)[^\d]*(20\d{2}|\d{2})$/i);
  if(m) return { q:+m[1], y:m[2].length===2?2000+(+m[2]):+m[2] };
  return null;
}
/* TV scanner: en yeni önce dilüe HBK dizisi + mali yıl/çeyrek sonu → etiketler */
function buildTvQuarterPoints(epsH, lastFQ, nextEps, lastEst, lastActual){
  if(!Array.isArray(epsH)||!epsH.length||!lastFQ) return [];
  const n=Math.min(4, epsH.length);
  const pts=[];
  for(let i=n-1;i>=0;i--){
    const pq=addFiscalQ(lastFQ.q, lastFQ.y, -i);
    const actual=(i===0&&lastActual!=null&&isFinite(lastActual))?+lastActual:+epsH[i];
    pts.push({
      label:chartQLabel(pq.q, pq.y),
      actual:isFinite(actual)?actual:null,
      estimate:(i===0 && lastEst!=null && isFinite(lastEst))?+lastEst:null
    });
  }
  if(nextEps!=null&&isFinite(nextEps)){
    const nq=addFiscalQ(lastFQ.q, lastFQ.y, 1);
    pts.push({ label:chartQLabel(nq.q, nq.y), actual:null, estimate:+nextEps });
  }
  return pts;
}
function addFiscalQ(q, y, n){
  let qq=q+n, yy=y;
  while(qq>4){ qq-=4; yy++; }
  while(qq<1){ qq+=4; yy--; }
  return { q:qq, y:yy };
}
/* Çeyrek sonu tarihi + mali yıl bitiş ayı → mali çeyrek (TV ile uyumlu) */
function fiscalFromPeriodEnd(endDateStr, fyeMonth){
  if(!endDateStr||!fyeMonth) return null;
  const d=new Date(String(endDateStr).slice(0,10)+'T12:00:00Z');
  if(!isFinite(d.getTime())) return null;
  const m=d.getUTCMonth()+1, y=d.getUTCFullYear();
  const fy=m<=fyeMonth?y:y+1;
  const monthsIntoFy=(m-fyeMonth-1+12)%12;
  const q=Math.floor(monthsIntoFy/3)+1;
  return { q, y:fy };
}
function inferFyeMonth(fiscalQ, endMonth){
  if(!fiscalQ||!endMonth) return null;
  let m=endMonth+3*(4-fiscalQ);
  while(m>12) m-=12;
  while(m<1) m+=12;
  return m;
}
function unwrapY(v){
  if(v==null) return null;
  if(typeof v==='number') return isFinite(v)?v:null;
  if(typeof v==='object' && v.raw!=null){ const n=+v.raw; return isFinite(n)?n:null; }
  const n=+v; return isFinite(n)?n:null;
}
function drawEarnChart(points){
  const box=document.getElementById('earnChart');
  if(!box) return;
  if(!points||!points.length){ box.innerHTML='<div class="hint">Bu dönem için grafik serisi yok.</div>'; return; }
  const mobile=(typeof window!=='undefined' && window.innerWidth<=560);
  /* Telefonda yüksek/dolgun grafik; sağ-sol pad Q4'26 gibi etiketlerin kesilmesini önler */
  const boxW=Math.max(300, Math.round(box.clientWidth|| (window.innerWidth-28)));
  const W=mobile?boxW:720;
  const H=mobile?Math.round(Math.max(300, W*0.88)):340;
  const padL=mobile?42:52, padR=mobile?30:28, padT=mobile?34:28, padB=mobile?48:48;
  const fsY=mobile?13:13, fsX=mobile?13:14, fsV=mobile?13:12;
  const rEst=mobile?12:11, rAct=mobile?10:9.5, swEst=mobile?3:2.8;
  const vals=points.flatMap(p=>[p.actual,p.estimate].filter(v=>v!=null&&isFinite(v)));
  if(!vals.length){ box.innerHTML='<div class="hint">Grafik verisi yok.</div>'; return; }
  let yMin=Math.min(0, ...vals), yMax=Math.max(...vals);
  if(yMax===yMin) yMax=yMin+1;
  const yPad=(yMax-yMin)*(mobile?0.2:0.14); yMin-=yPad; yMax+=yPad;
  const n=points.length;
  const X=i=> padL+((n===1?0.5:i/(n-1))*(W-padL-padR));
  const Y=v=> padT+(yMax-v)/((yMax-yMin)||1)*(H-padT-padB);
  let grid='', ylbl='';
  for(let g=0;g<=4;g++){
    const v=yMin+(yMax-yMin)*g/4, yy=Y(v).toFixed(1);
    grid+=`<line x1="${padL}" x2="${W-padR}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="${mobile?1.5:1.2}"/>`;
    ylbl+=`<text x="${padL-8}" y="${(+yy+4).toFixed(1)}" font-size="${fsY}" font-weight="700" fill="var(--muted)" text-anchor="end">${v.toFixed(2)}</text>`;
  }
  let dots='', xl='', valsLbl='';
  points.forEach((p,i)=>{
    const x=X(i);
    const lab=mobile?String(p.label||'').replace(/\s+'/,"'"):p.label;
    /* İlk/son etiket kenarda kesilmesin: anchor kaydır */
    let anchor='middle', tx=x;
    if(mobile && n>1){
      if(i===0){ anchor='start'; tx=Math.max(2, x-2); }
      else if(i===n-1){ anchor='end'; tx=Math.min(W-2, x+2); }
    }
    xl+=`<text x="${tx.toFixed(1)}" y="${H-14}" font-size="${fsX}" font-weight="800" fill="var(--ink-2)" text-anchor="${anchor}">${safeHTML(lab)}</text>`;
    if(p.estimate!=null&&isFinite(p.estimate)){
      const ey=Y(p.estimate);
      dots+=`<circle cx="${x.toFixed(1)}" cy="${ey.toFixed(1)}" r="${rEst}" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="${swEst}"><title>Tahmin: ${p.estimate}</title></circle>`;
    }
    if(p.actual!=null&&isFinite(p.actual)){
      const ay=Y(p.actual);
      dots+=`<circle cx="${x.toFixed(1)}" cy="${ay.toFixed(1)}" r="${rAct}" fill="#26a69a" stroke="#1e8e82" stroke-width="1.6"><title>Güncel: ${p.actual}</title></circle>`;
      valsLbl+=`<text x="${x.toFixed(1)}" y="${(ay-16).toFixed(1)}" font-size="${fsV}" font-weight="800" fill="#26a69a" text-anchor="middle">${Number(p.actual).toFixed(2)}</text>`;
    }else if(p.estimate!=null&&isFinite(p.estimate)){
      const ey=Y(p.estimate);
      valsLbl+=`<text x="${x.toFixed(1)}" y="${(ey-16).toFixed(1)}" font-size="${fsV}" font-weight="800" fill="var(--muted)" text-anchor="middle">${Number(p.estimate).toFixed(2)}</text>`;
    }
  });
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;aspect-ratio:${W} / ${H}">${grid}${ylbl}${dots}${valsLbl}${xl}</svg>`;
}
let _earnResizeT=null;
if(typeof window!=='undefined' && !window._earnResizeBound){
  window._earnResizeBound=true;
  window.addEventListener('resize',()=>{
    if(!EARN_CACHE) return;
    clearTimeout(_earnResizeT);
    _earnResizeT=setTimeout(()=>renderEarnPanel(EARN_CACHE),140);
  });
}
function renderEarnPanel(data){
  const card=document.getElementById('earnCard'), meta=document.getElementById('earnMeta');
  if(!card||!meta||!data) return;
  card.classList.remove('hidden');
  document.getElementById('earnTabFY')?.classList.toggle('active', EARN_MODE==='annual');
  document.getElementById('earnTabQ')?.classList.toggle('active', EARN_MODE==='quarter');
  const ccy=data.ccy||'USD';
  drawEarnChart(EARN_MODE==='annual' ? (data.annual||[]) : (data.quarterly||[]));
  const rows=[];
  if(data.nextDate){
    const d=new Date(data.nextDate*1000);
    rows.push([t('earn_next'), d.toLocaleDateString(localeTag(),{day:'numeric',month:'short',year:'numeric'})]);
  }
  if(data.nextPeriod) rows.push([t('earn_period'), data.nextPeriod]);
  if(data.nextEps!=null) rows.push([t('earn_eps_est'), fmtEarnEps(data.nextEps, ccy)]);
  if(data.nextRev!=null) rows.push([t('earn_rev_est'), fmtEarnCcy(data.nextRev, ccy)]);
  if(data.lastEps!=null && data.lastEpsEst!=null)
    rows.push([t('earn_last_eps'), fmtEarnEps(data.lastEps, ccy)+' / '+fmtEarnEps(data.lastEpsEst, ccy)]);
  meta.innerHTML=rows.length
    ? `<div class="earn-meta">${rows.map(([k,v])=>`<div class="earn-tile"><div class="k">${safeHTML(k)}</div><div class="v">${safeHTML(v)}</div></div>`).join('')}</div>`
    : '<div class="hint">'+t('earn_no_sum')+'</div>';
}
async function fetchNextEarnings(sym, market, myGen, euOpt){
  const el=document.getElementById('earnNote');
  const card=document.getElementById('earnCard');
  if(el){ el.classList.add('hidden'); el.innerHTML=''; }
  if(card) card.classList.add('hidden');
  EARN_CACHE=null; EARN_MODE='quarter';
  try{
    const scan = euOpt ? euOpt.scan : (market==='BIST' ? 'turkey' : 'america');
    const tickers = euOpt ? [euOpt.tv] : (market==='BIST' ? ['BIST:'+sym] : ['NASDAQ:'+sym,'NYSE:'+sym,'AMEX:'+sym]);
    /* Tüm grafik + özet: TradingView scanner (Yahoo mali etiketleri TV ile kayıyor) */
    const cols=[
      'earnings_release_next_date',
      'fiscal_period_end_fq','fiscal_period_end_fy',
      'earnings_per_share_fq','earnings_per_share_forecast_fq','earnings_per_share_forecast_next_fq',
      'earnings_per_share_diluted_fq_h','earnings_per_share_diluted_fy_h','fiscal_period_fy_h',
      'earnings_per_share_forecast_next_fy','revenue_forecast_next_fq','currency'
    ];
    const tvj=await fetch('https://scanner.tradingview.com/'+scan+'/scan',
      {method:'POST',body:JSON.stringify({symbols:{tickers},columns:cols})}).then(r=>r.json()).catch(()=>null);
    if(myGen!=null && myGen!==REQ_GEN) return;

    const row=(tvj&&tvj.data||[]).find(x=>x.d&&x.d.some(v=>v!=null));
    const d=row&&row.d||[];
    const tv={
      nextDate:d[0],
      periodEndFq:d[1], periodEndFy:d[2],
      epsFq:d[3], epsEstFq:d[4], epsEstNext:d[5],
      epsFqH:d[6], epsFyH:d[7], periodFyH:d[8],
      epsEstNextFy:d[9], revEstNext:d[10], ccy:d[11]||'USD'
    };

    const fyeMonth=tv.periodEndFy
      ? (new Date(tv.periodEndFy*1000).getUTCMonth()+1)
      : null;
    const activePeriodEnd=(FIN&&FIN.ticker===sym&&FIN.D0)
      ? String(FIN.D0).slice(0,10)
      :(tv.periodEndFq?new Date(tv.periodEndFq*1000).toISOString().slice(0,10):null);
    const fiscalQ=activePeriodEnd&&fyeMonth?fiscalFromPeriodEnd(activePeriodEnd,fyeMonth):null;
    /* Kullanıcıya mali yılın ileri numarası yerine rapor döneminin takvim yılı gösterilir.
       Örn. NVIDIA FY2027 Q2, 2026'da sona erdiği için ekranda Q2 '26 görünür. */
    const lastFQ=fiscalQ?{q:fiscalQ.q,y:new Date(activePeriodEnd+'T12:00:00Z').getUTCFullYear()}:null;

    let quarterly=buildTvQuarterPoints(tv.epsFqH, lastFQ, tv.epsEstNext, tv.epsEstFq, tv.epsFq);
    /* Dilüe dizi yoksa skaler son HBK + sonraki tahmin */
    if(!quarterly.length && lastFQ && (tv.epsFq!=null||tv.epsEstNext!=null)){
      if(tv.epsFq!=null){
        quarterly.push({ label:chartQLabel(lastFQ.q, lastFQ.y), actual:+tv.epsFq, estimate:tv.epsEstFq!=null?+tv.epsEstFq:null });
      }
      if(tv.epsEstNext!=null){
        const nq=addFiscalQ(lastFQ.q, lastFQ.y, 1);
        quarterly.push({ label:chartQLabel(nq.q, nq.y), actual:null, estimate:+tv.epsEstNext });
      }
    }

    const nextFQ=lastFQ?addFiscalQ(lastFQ.q, lastFQ.y, 1):null;
    const nextPeriod=nextFQ?fmtEarnPeriod(nextFQ.q, nextFQ.y):'';
    const nextDate=tv.nextDate||null;
    const nextEps=tv.epsEstNext!=null?tv.epsEstNext:null;
    const nextRev=tv.revEstNext!=null?tv.revEstNext:null;

    const annual=[];
    const fyH=Array.isArray(tv.epsFyH)?tv.epsFyH:[];
    const fyP=Array.isArray(tv.periodFyH)?tv.periodFyH:[];
    const nFy=Math.min(4, fyH.length);
    for(let i=nFy-1;i>=0;i--){
      const ylbl=fyP[i]!=null?String(fyP[i]):'';
      const a=+fyH[i];
      annual.push({ label:ylbl, actual:isFinite(a)?a:null, estimate:null });
    }
    if(tv.epsEstNextFy!=null){
      const nextY=fyP[0]!=null?(+fyP[0]+1):null;
      annual.push({ label:nextY?String(nextY):'Sonraki FY', actual:null, estimate:+tv.epsEstNextFy });
    }

    const lastDone=quarterly.filter(p=>p.actual!=null).slice(-1)[0];
    const lastEps=tv.epsFq!=null?tv.epsFq:(lastDone&&lastDone.actual);
    const lastEpsEst=tv.epsEstFq!=null?tv.epsEstFq:(lastDone&&lastDone.estimate);

    const payload={ ccy:tv.ccy||'USD', nextDate, nextPeriod, nextEps, nextRev, lastEps, lastEpsEst, quarterly, annual };
    if(!quarterly.length && !annual.length && nextDate==null && nextEps==null) return;
    EARN_CACHE=payload;
    renderEarnPanel(payload);

    if(el && nextDate){
      const dt=new Date(nextDate*1000);
      const days=Math.round((dt-Date.now())/86400000);
      const ds=dt.toLocaleDateString('tr-TR',{day:'2-digit',month:'long',year:'numeric'});
      el.innerHTML=`<div style="background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:9px;padding:7px 11px;font-size:12px;display:inline-block">
        <span style="color:var(--muted)">📅 Sonraki kazanç:</span>
        <b style="color:var(--ink);margin-left:5px">${ds}</b>
        ${days>=0?`<span style="color:var(--muted);margin-left:5px">· ${days===0?'bugün':days+' gün sonra'}</span>`:''}
        ${nextEps!=null?`<span style="color:var(--muted);margin-left:8px">HBK tah. <b style="color:var(--ink)">${fmtEarnEps(nextEps, payload.ccy)}</b></span>`:''}</div>`;
      el.classList.remove('hidden');
    }
  }catch(e){}
}
window.setEarnMode=setEarnMode;

/* ---------- Fiyat Grafiği (Yahoo kapanışları, SVG çizgi; 1 Ay/6 Ay/1 Yıl/5 Yıl) ---------- */
let CHART_SYM='', CHART_YSYM='', CHART_RANGE='1y';
const CHART_CACHE={};
function setChartRange(r){ CHART_RANGE=r; drawPriceChart(REQ_GEN); }
function fetchPriceChart(sym, ysym, myGen){
  CHART_SYM=sym; CHART_YSYM=ysym;
  const card=document.getElementById('chartCard');
  if(!card) return;
  card.classList.remove('hidden');
  drawPriceChart(myGen);
}
async function drawPriceChart(myGen){
  const body=document.getElementById('chartBody'), info=document.getElementById('chartInfo');
  if(!body) return;
  document.querySelectorAll('#chartBtns button').forEach(b=>b.classList.toggle('primary', b.dataset.r===CHART_RANGE));
  const key=CHART_YSYM+':'+CHART_RANGE;
  let d=CHART_CACHE[key];
  if(!d || Date.now()-d.ts>10*60000){
    body.innerHTML='<div class="hint">'+t('chart_loading')+'</div>';
    try{
      const j=await fetch('/price?s='+encodeURIComponent(CHART_YSYM)+'&range='+CHART_RANGE).then(r=>r.json());
      if(myGen!=null && myGen!==REQ_GEN) return;
      const res=j&&j.chart&&j.chart.result&&j.chart.result[0];
      const ts=(res&&res.timestamp)||[], cl=(res&&res.indicators&&res.indicators.quote&&res.indicators.quote[0].close)||[];
      const pts=[]; ts.forEach((t,i)=>{ if(cl[i]!=null) pts.push([t*1000, cl[i]]); });
      d={pts, ts:Date.now()}; CHART_CACHE[key]=d;
    }catch(e){ body.innerHTML='<div class="hint">Grafik alınamadı.</div>'; return; }
  }
  const pts=d.pts;
  if(!pts || pts.length<2){ body.innerHTML='<div class="hint">Bu aralık için fiyat verisi yok.</div>'; return; }
  const W=720,H=260,padL=8,padR=64,padT=14,padB=26;
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const x0=xs[0], x1=xs[xs.length-1], yMin=Math.min(...ys), yMax=Math.max(...ys);
  const X=t=> padL+(t-x0)/((x1-x0)||1)*(W-padL-padR);
  const Y=v=> padT+(yMax-v)/((yMax-yMin)||1)*(H-padT-padB);
  const path=pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join('');
  const first=ys[0], last=ys[ys.length-1], chg=(last-first)/first*100;
  const col= chg>=0?'var(--good)':'var(--bad)';
  const area=path+`L${X(x1).toFixed(1)} ${H-padB} L${X(x0).toFixed(1)} ${H-padB} Z`;
  const fD=new Intl.DateTimeFormat('tr-TR', CHART_RANGE==='5y'?{month:'short',year:'numeric'}:{day:'2-digit',month:'short'});
  let xt='';
  for(let i=0;i<4;i++){ const t=x0+(x1-x0)*i/3;
    xt+=`<text x="${X(t).toFixed(1)}" y="${H-8}" font-size="10" fill="var(--muted)" text-anchor="${i===0?'start':i===3?'end':'middle'}">${fD.format(new Date(t))}</text>`; }
  // Bilanço açıklanma günleri (SEC filed tarihleri — BIST'te yok) altın kesikli çizgiyle
  let marks='';
  [FIN&&FIN.filedD0, FIN&&FIN.filedD1].forEach(fd=>{
    if(!fd) return;
    const t=new Date(fd).getTime();
    if(t>=x0 && t<=x1) marks+=`<line x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${padT}" y2="${H-padB}" stroke="var(--gold)" stroke-dasharray="3 3" opacity=".7"><title>Bilanço açıklanma: ${fmtDate(fd)}</title></line>`;
  });
  const lbl=(v,y,c,w)=>`<text x="${W-padR+6}" y="${y.toFixed(1)}" font-size="10.5" fill="${c||'var(--muted)'}" font-weight="${w||400}">${fmtUSD(v)}</text>`;
  info.innerHTML=`<b style="color:${col}">${chg>=0?'▲':'▼'} ${pct(chg)}</b> <span class="neutral">${t('chart_range')}</span> · ${t('chart_low')} ${fmtUSD(yMin)} · ${t('chart_high')} ${fmtUSD(yMax)}${marks?' · <span style="color:var(--gold)">'+t('chart_filing_mark')+'</span>':''}`;
  body.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
    <defs><linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${col}" stop-opacity=".22"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#pcg)"/>
    ${marks}
    <path d="${path}" fill="none" stroke="${col}" stroke-width="2"/>
    ${lbl(yMax, Y(yMax)+4)}${lbl(yMin, Y(yMin)+4)}${lbl(last, Y(last)+4, col, 700)}
    ${xt}</svg>`;
}

/* ---------- Sektör Karşılaştırması (TradingView scanner: aynı sektörün devleri + medyan) ---------- */
async function fetchSectorPeers(sym, market, myGen){
  const card=document.getElementById('sectorCard'), box=document.getElementById('sectorBody'), sub=document.getElementById('sectorSub');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">'+t('sector_loading')+'</div>';
  try{
    const scan= market==='BIST'?'turkey':'america';
    const tickers= market==='BIST'?['BIST:'+sym]:['NASDAQ:'+sym,'NYSE:'+sym,'AMEX:'+sym];
    const COLS=['name','description','sector','close','market_cap_basic','price_earnings_ttm','price_book_fq','return_on_equity','net_margin'];
    const me=await fetch('https://scanner.tradingview.com/'+scan+'/scan',
      {method:'POST',body:JSON.stringify({symbols:{tickers},columns:COLS})}).then(r=>r.json());
    if(myGen!=null && myGen!==REQ_GEN) return;
    const meRow=(me.data||[]).find(x=>x.d && x.d[0]);
    if(!meRow || !meRow.d[2]){ box.innerHTML='<div class="hint">Bu hisse için sektör bilgisi bulunamadı.</div>'; return; }
    const sector=meRow.d[2];
    const peers=await fetch('https://scanner.tradingview.com/'+scan+'/scan',
      {method:'POST',body:JSON.stringify({filter:[{left:'sector',operation:'equal',right:sector}],columns:COLS,
        sort:{sortBy:'market_cap_basic',sortOrder:'desc'},range:[0,30]})}).then(r=>r.json());
    if(myGen!=null && myGen!==REQ_GEN) return;
    const idx={mc:4,pe:5,pb:6,roe:7,nm:8};
    const rows=(peers.data||[]).map(x=>({t:x.s.split(':')[1], d:x.d})).filter(x=>x.d && x.d[idx.mc]!=null);
    const med=a=>{ const v=a.filter(x=>x!=null&&isFinite(x)).sort((p,q)=>p-q); if(!v.length) return null; const m=Math.floor(v.length/2); return v.length%2?v[m]:(v[m-1]+v[m])/2; };
    const medians={ pe:med(rows.map(r=>r.d[idx.pe])), pb:med(rows.map(r=>r.d[idx.pb])), roe:med(rows.map(r=>r.d[idx.roe])), nm:med(rows.map(r=>r.d[idx.nm])) };
    const fmtN=(v,suf,dec)=> (v==null||!isFinite(v))?'—':v.toFixed(dec==null?1:dec)+(suf||'');
    const top=rows.slice(0,6);
    const meT=(meRow.s||'').split(':')[1]||sym;
    if(!top.some(r=>r.t===meT)) top.unshift({t:meT, d:meRow.d, me:true});
    else top.forEach(r=>{ if(r.t===meT) r.me=true; });
    const rowHtml=r=>`<tr${r.me?' style="background:var(--surface-3)"':''}>
      <td><b>${safeHTML(r.t)}</b>${r.me?' <span class="thd">'+t('peer_this')+'</span>':''}</td>
      <td>${fmtMcap(r.d[idx.mc])}</td>
      <td>${fmtN(r.d[idx.pe],'x')}</td><td>${fmtN(r.d[idx.pb],'x',2)}</td>
      <td>${fmtN(r.d[idx.roe],'%')}</td><td>${fmtN(r.d[idx.nm],'%')}</td></tr>`;
    const myPe=meRow.d[idx.pe];
    let prim='';
    if(myPe!=null && isFinite(myPe) && medians.pe){
      const df=(myPe-medians.pe)/medians.pe*100;
      prim=' · '+tf('peer_vs_med',{pct:Math.abs(df).toFixed(0), dir:df>0?t('peer_prem'):t('peer_disc'), cls:df>0?'down':'up'});
    }
    sub.innerHTML=tf('peer_sub',{sector:safeHTML(sector), n:rows.length})+prim;
    box.innerHTML=`<table><thead><tr><th>${t('th_co')}</th><th>${t('th_mcap')}</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>${t('peer_nm')}</th></tr></thead><tbody>
      ${top.map(rowHtml).join('')}
      <tr class="total"><td>${t('peer_median')}</td><td>—</td><td>${fmtN(medians.pe,'x')}</td><td>${fmtN(medians.pb,'x',2)}</td><td>${fmtN(medians.roe,'%')}</td><td>${fmtN(medians.nm,'%')}</td></tr>
    </tbody></table>`;
  }catch(e){ box.innerHTML='<div class="hint">'+t('sector_fail')+' '+e.message+'</div>'; }
}

/* ---------- İzleme Listesi (localStorage; canlı fiyatlar TV scanner'dan toplu) ---------- */
function getWatch(){ try{ return JSON.parse(localStorage.getItem('bilanco_watchlist')||'[]'); }catch(e){ return []; } }
function setWatch(w){ try{ localStorage.setItem('bilanco_watchlist', JSON.stringify(w)); }catch(e){} }
function updateWatchStar(){
  const b=document.getElementById('watchStar');
  const fw=document.getElementById('forumWrap');
  if(!b) return;
  if(!FIN || !FIN.ticker){ b.classList.add('hidden'); if(fw) fw.classList.add('hidden'); closeForumMenu(); return; }
  const inList=getWatch().some(x=>x.sym===FIN.ticker && x.market===FIN.market);
  b.textContent= inList?t('watch_remove'):t('watch_add');
  b.classList.remove('hidden');
  if(fw) fw.classList.remove('hidden');
}
function toggleWatch(){
  if(!FIN || !FIN.ticker) return;
  const w=getWatch();
  const i=w.findIndex(x=>x.sym===FIN.ticker && x.market===FIN.market);
  if(i>=0) w.splice(i,1); else w.push({sym:FIN.ticker, market:FIN.market});
  setWatch(w); updateWatchStar(); renderWatchlist();
}
function removeWatch(sym,market){
  setWatch(getWatch().filter(x=>!(x.sym===sym && x.market===market)));
  updateWatchStar(); renderWatchlist();
}
function openWatch(sym){
  document.getElementById('ticker').value=sym;
  window.scrollTo({top:0,behavior:'smooth'});
  fetchTicker();
}
async function renderWatchlist(){
  const card=document.getElementById('watchCard'), box=document.getElementById('watchBody');
  if(!card) return;
  const w=getWatch();
  if(!w.length){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">'+t('loading')+'</div>';
  try{
    const q={};
    for(const scanMk of ['turkey','america']){
      const items=w.filter(x=> (scanMk==='turkey')===(x.market==='BIST'));
      if(!items.length) continue;
      const tickers=[];
      items.forEach(x=>{ if(scanMk==='turkey') tickers.push('BIST:'+x.sym);
                         else ['NASDAQ','NYSE','AMEX'].forEach(ex=>tickers.push(ex+':'+x.sym)); });
      const j=await fetch('https://scanner.tradingview.com/'+scanMk+'/scan',
        {method:'POST',body:JSON.stringify({symbols:{tickers},columns:['name','close','change','price_earnings_ttm','logoid']})})
        .then(r=>r.json()).catch(()=>null);
      ((j&&j.data)||[]).forEach(row=>{
        const t=row.s.split(':')[1];
        if(row.d && row.d[1]!=null && !q[t]) q[t]={close:row.d[1], chg:row.d[2], pe:row.d[3], logo:row.d[4], bist:scanMk==='turkey'};
      });
    }
    const rows=w.map(x=>{
      const d=q[x.sym]||{};
      const cls=d.chg==null?'neutral':(d.chg>0?'up':d.chg<0?'down':'neutral');
      const cur= x.market==='BIST'?'₺':'$';
      if(d.logo) rememberLogoid(x.sym, x.market, d.logo);
      return `<tr style="cursor:pointer" onclick="openWatch('${x.sym}')" title="Analizi aç">
        <td><span class="sym-cell">${logoHtml(d.logo, x.sym, 22, {sym:x.sym, market:x.market, cc:x.market==='BIST'?'TR':'US'})}<b>${safeHTML(x.sym)}</b> <span class="thd">${x.market==='BIST'?'BIST':t('mkt_us')}</span></span></td>
        <td>${d.close!=null? cur+Number(d.close).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
        <td class="${cls}">${d.chg!=null? (d.chg>0?'▲ ':d.chg<0?'▼ ':'')+pct(d.chg) : '—'}</td>
        <td>${(d.pe!=null && isFinite(d.pe))? d.pe.toFixed(1)+'x' : '—'}</td>
        <td class="row-actions"><button class="delrow" onclick="event.stopPropagation();removeWatch('${x.sym}','${x.market}')" title="Listeden çıkar">✕</button></td>
      </tr>`;
    }).join('');
    box.innerHTML=`<table><thead><tr><th>${t('th_code')}</th><th>${t('th_px')}</th><th>${t('th_day')}</th><th>F/K</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }catch(e){ box.innerHTML='<div class="hint">'+t('list_fail')+'</div>'; }
}

/* ---------- Ekonomik Takvim (BIST → Türkiye, ABD → ABD) ----------
   BİRİNCİL KAYNAK: Investing.com tam takvimi (sunucu /investcal köprüsü) — Investing'in KENDİ
   Türkçe isimleri + KENDİ önem yıldızları (bull1/2/3) + KENDİ olumlu/olumsuz renkleri. Yani
   "gerçek ve doğru": isim/önem/renk kaynaktan gelir, uygulama tahmini YOK. Dönem butonları
   Investing sekmelerine (yesterday/today/tomorrow/thisWeek/nextWeek) 1:1 karşılık gelir.
   YEDEK: Investing (CF engeli vb) veri vermezse TradingView /econ + küratörlü ECON_MAP devreye
   girer (isim/önem tahminle; kart boş kalmasın diye). Renderda hangi kaynak kullanıldığı yazar. */
/* Ekonomik Takvim sekmesi: her ülke bağımsız bir panel — ECON_PANELS[cc]={time,imp,gen}.
   Ülke kutusuna tıklayınca panel açılır/kapanır; birden çok ülke aynı anda açık kalabilir. */
/* Bayrak emojisi (🇹🇷 vb.) Windows Chrome'da renkli glif olarak gösterilmiyor — bölge
   göstergesi harf çifti düz metin gibi ("TR","US") kalıyor. Çözüm: her ülke için küçük,
   self-contained SVG bayrak (harici kaynak/CDN yok). viewBox 0 0 30 20 (3:2), sade/şematik
   ama tanınabilir (İngiltere Union Jack, Türkiye ay-yıldız, Güney Kore taegeuk sadeleştirildi). */
const FLAG_SVG={
  TR:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#E30A17"/><circle cx="12" cy="10" r="5" fill="#fff"/><circle cx="13.3" cy="10" r="4" fill="#E30A17"/><path fill="#fff" d="M17.5 10l4.8-1.55-3 4.06.02-5.02-3 4.06 1.18-4.77z"/>`,
  US:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/>${Array.from({length:7}).map((_,i)=>`<rect y="${i*20/13*2}" width="30" height="${20/13}" fill="#B22234"/>`).join('')}<rect width="14" height="10.8" fill="#3C3B6E"/>`,
  GB:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#00247D"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#CF142B" stroke-width="1.6"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6.6"/><path d="M15 0V20M0 10H30" stroke="#CF142B" stroke-width="4"/>`,
  DE:`<svg viewBox="0 0 30 20"><rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#DD0000"/><rect y="13.33" width="30" height="6.67" fill="#FFCE00"/>`,
  FR:`<svg viewBox="0 0 30 20"><rect width="10" height="20" fill="#0055A4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#EF4135"/>`,
  IT:`<svg viewBox="0 0 30 20"><rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#CE2B37"/>`,
  ES:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>`,
  NL:`<svg viewBox="0 0 30 20"><rect width="30" height="6.67" fill="#AE1C28"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#21468B"/>`,
  BE:`<svg viewBox="0 0 30 20"><rect width="10" height="20" fill="#000"/><rect x="10" width="10" height="20" fill="#FAE042"/><rect x="20" width="10" height="20" fill="#ED2939"/>`,
  PT:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#FF0000"/><rect width="12" height="20" fill="#046A38"/><circle cx="12" cy="10" r="3.2" fill="#FFCC00" stroke="#fff" stroke-width=".4"/>`,
  CH:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#FF0000"/><rect x="12.5" y="5" width="5" height="10" fill="#fff"/><rect x="9.5" y="8" width="11" height="4" fill="#fff"/>`,
  SE:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#005293"/><rect x="10" width="4" height="20" fill="#FECC00"/><rect y="8" width="30" height="4" fill="#FECC00"/>`,
  DK:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#C60C30"/><rect x="10" width="4" height="20" fill="#fff"/><rect y="8" width="30" height="4" fill="#fff"/>`,
  NO:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#EF2B2D"/><rect x="9" width="6" height="20" fill="#fff"/><rect y="7" width="30" height="6" fill="#fff"/><rect x="10.5" width="3" height="20" fill="#002868"/><rect y="8.5" width="30" height="3" fill="#002868"/>`,
  FI:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><rect x="9" width="4" height="20" fill="#002F6C"/><rect y="8" width="30" height="4" fill="#002F6C"/>`,
  AT:`<svg viewBox="0 0 30 20"><rect width="30" height="6.67" fill="#ED2939"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#ED2939"/>`,
  PL:`<svg viewBox="0 0 30 20"><rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#DC143C"/>`,
  KR:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="4.5" fill="#CD2E3A"/><path d="M15 5.5a4.5 4.5 0 000 9 2.25 2.25 0 010-4.5 2.25 2.25 0 000-4.5z" fill="#0047A0"/>`,
  JP:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5.5" fill="#BC002D"/>`,
  CN:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#DE2910"/><polygon points="5,3 6.5,7.5 2.5,4.5 7.5,4.5 3.5,7.5" fill="#FFDE00"/><circle cx="10.5" cy="2.8" r="0.7" fill="#FFDE00"/><circle cx="12.2" cy="4.2" r="0.7" fill="#FFDE00"/><circle cx="12.2" cy="6.2" r="0.7" fill="#FFDE00"/><circle cx="10.5" cy="7.6" r="0.7" fill="#FFDE00"/>`,
  HK:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#DE2910"/><g fill="#fff" transform="translate(15,10)"><path d="M0,-4.2 C1.2,-1.5 1.2,1.5 0,4.2 C-1.2,1.5 -1.2,-1.5 0,-4.2Z"/><path d="M0,-4.2 C1.2,-1.5 1.2,1.5 0,4.2 C-1.2,1.5 -1.2,-1.5 0,-4.2Z" transform="rotate(72)"/><path d="M0,-4.2 C1.2,-1.5 1.2,1.5 0,4.2 C-1.2,1.5 -1.2,-1.5 0,-4.2Z" transform="rotate(144)"/><path d="M0,-4.2 C1.2,-1.5 1.2,1.5 0,4.2 C-1.2,1.5 -1.2,-1.5 0,-4.2Z" transform="rotate(216)"/><path d="M0,-4.2 C1.2,-1.5 1.2,1.5 0,4.2 C-1.2,1.5 -1.2,-1.5 0,-4.2Z" transform="rotate(288)"/><circle r="1.1"/></g>`,
  TW:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#FE0000"/><rect width="15" height="10" fill="#000095"/><circle cx="7.5" cy="5" r="2.8" fill="#fff"/><circle cx="7.5" cy="5" r="1.7" fill="#000095"/><g fill="#fff" transform="translate(7.5,5)">${[0,30,60,90,120,150,180,210,240,270,300,330].map(a=>`<path d="M0,-3.6 L0.45,-1.8 -0.45,-1.8Z" transform="rotate(${a})"/>`).join('')}</g>`,
  CA:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><rect width="7" height="20" fill="#FF0000"/><rect x="23" width="7" height="20" fill="#FF0000"/><path fill="#FF0000" d="M15 3.5l1.1 3.2 3.4-.2-2.6 2.2 1 3.2L15 10.2l-2.9 1.7 1-3.2-2.6-2.2 3.4.2z"/>`,
  AU:`<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#00008B"/><path d="M0 0L12 8M12 0L0 8" stroke="#fff" stroke-width="1.6"/><path d="M0 0L12 8M12 0L0 8" stroke="#FF0000" stroke-width=".7"/><path d="M6 0V8M0 4H12" stroke="#fff" stroke-width="2.4"/><path d="M6 0V8M0 4H12" stroke="#FF0000" stroke-width="1.2"/><g fill="#fff"><path d="M22 4.5l.5 1.4 1.5.1-1.1.9.4 1.4-1.3-.8-1.3.8.4-1.4-1.1-.9 1.5-.1z"/><path d="M25 9l.35 1 1 .05-.75.65.25 1-.9-.55-.9.55.25-1-.75-.65 1-.05z"/><path d="M20 11l.35 1 1 .05-.75.65.25 1-.9-.55-.9.55.25-1-.75-.65 1-.05z"/><path d="M23.5 14l.4 1.15 1.2.05-.9.75.3 1.15-1-.65-1 .65.3-1.15-.9-.75 1.2-.05z"/><path d="M18 7.5l.25.7.7.05-.55.45.2.7-.6-.4-.6.4.2-.7-.55-.45.7-.05z"/></g>`,
  SG:`<svg viewBox="0 0 30 20"><rect width="30" height="10" fill="#ED2939"/><rect y="10" width="30" height="10" fill="#fff"/><circle cx="7" cy="5" r="3.2" fill="#fff"/><circle cx="8.2" cy="5" r="2.6" fill="#ED2939"/><g fill="#fff"><circle cx="12.2" cy="3.2" r=".55"/><circle cx="13.5" cy="4.5" r=".55"/><circle cx="13.5" cy="6.2" r=".55"/><circle cx="12.2" cy="7.5" r=".55"/><circle cx="10.9" cy="5.35" r=".55"/></g>`,
};
function flagSpan(cc){ return `<span class="cfl" aria-hidden="true">${(FLAG_SVG[cc]||'')+'</svg>'}</span>`; }
const ECON_COUNTRIES=[
  ['TR','Türkiye'],   ['US','ABD'],       ['GB','İngiltere'],
  ['DE','Almanya'],   ['FR','Fransa'],    ['IT','İtalya'],
  ['ES','İspanya'],   ['NL','Hollanda'],  ['BE','Belçika'],
  ['PT','Portekiz'],  ['CH','İsviçre'],   ['SE','İsveç'],
  ['DK','Danimarka'], ['NO','Norveç'],    ['FI','Finlandiya'],
  ['AT','Avusturya'], ['PL','Polonya'],   ['KR','Güney Kore'],
  ['JP','Japonya'],   ['CN','Çin'],       ['HK','Hong Kong'],
  ['TW','Tayvan'],    ['CA','Kanada'],    ['AU','Avustralya'],
  ['SG','Singapur'],
];
const ECON_PANELS={};
let ECON_PAGE_INIT=false;
/* Investing.com'dan takvimi çekilebilen pazarlar —
   ISO→Investing ülke ID eşlemesi server.js /investcal rotasında */
const INVESTING_MARKETS=['US','TR','GB','DE','FR','NL','BE','PT','IT','ES','CH','SE','DK','NO','FI','AT','PL','KR','JP','CN','HK','TW','CA','AU','SG'];
const ECON_CACHE={};   // "US:thisWeek" → { rows, src, ts }
const ECON_TAB={ dun:'yesterday', bugun:'today', yarin:'tomorrow', buhafta:'thisWeek', gelecekhafta:'nextWeek' };
const TR_AY=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const TR_GUN=['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
const TR_OFF=3*3600000;
const trDayIdx=ms=> Math.floor((ms+TR_OFF)/86400000);
const trMonday=idx=> idx-((idx+3)%7);
function econInTime(e, t){
  const ei=trDayIdx(e.d.getTime()), ti=trDayIdx(Date.now());
  if(t==='dun') return ei===ti-1;
  if(t==='bugun') return ei===ti;
  if(t==='yarin') return ei===ti+1;
  if(t==='buhafta') return trMonday(ei)===trMonday(ti);
  if(t==='gelecekhafta') return trMonday(ei)===trMonday(ti)+7;
  return true;
}
const MON_TR={Jan:'Oca',Feb:'Şub',Mar:'Mar',Apr:'Nis',May:'May',Jun:'Haz',Jul:'Tem',Aug:'Ağu',Sep:'Eyl',Oct:'Eki',Nov:'Kas',Dec:'Ara'};
/* Dönem etiketini Türkçeye çevir: "Jun" → "Haz", "Q1" → "1Ç", "Jun/26" → "Haz/26" */
function econPeriodTR(p){
  if(!p) return '';
  let s=p.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, m=>MON_TR[m]);
  s=s.replace(/\bQ([1-4])\b/g, '$1Ç');
  return s;
}
/* Küratörlü isim + önem haritası: [İngilizce başlık regex'i, Türkçe ad, önem(1/0/-1)].
   İLK eşleşen kazanır → spesifik kalıplar önce. Hem TR hem ABD göstergelerini kapsar.
   Önem: 1=★★★ piyasa hareket ettiren, 0=★★ orta, -1=★ düşük. */
const ECON_MAP=[
  // --- Petrol/enerji stokları (10 ayrı EIA/API serisi — hepsi farklı, spesifik önce) ---
  [/api crude/i, 'API Ham Petrol Stokları', -1],
  [/eia crude oil imports/i, 'EIA Ham Petrol İthalatı', -1],
  [/eia crude oil stocks|eia crude oil stock/i, 'EIA Ham Petrol Stokları', -1],
  [/eia cushing/i, 'EIA Cushing Ham Petrol Stokları', -1],
  [/eia gasoline production/i, 'EIA Benzin Üretimi', -1],
  [/eia gasoline stocks/i, 'EIA Benzin Stokları', -1],
  [/eia distillate.*production/i, 'EIA Damıtık Yakıt Üretimi', -1],
  [/eia distillate stocks/i, 'EIA Damıtık Yakıt Stokları', -1],
  [/eia heating oil/i, 'EIA Kalorifer Yakıtı Stokları', -1],
  [/eia natural gas/i, 'EIA Doğal Gaz Stokları', -1],
  [/eia refinery/i, 'EIA Rafineri İşlem Değişimi', -1],
  [/crude oil|\beia\b/i, 'Enerji Stokları', -1],
  // ★★★ — enflasyon / faiz / istihdam / büyüme (temel ad; sıklık/çekirdek EKİ ayrı eklenir)
  [/core (cpi|inflation)/i, 'Çekirdek Enflasyon', 1],
  [/core pce/i, 'Çekirdek PCE Fiyat Endeksi', 1],
  [/\bpce price/i, 'PCE Fiyat Endeksi', 1],
  [/inflation rate|consumer price|^cpi\b|\bcpi\b/i, 'Enflasyon Oranı', 1],
  [/fomc minutes|meeting minutes|fed minutes/i, 'FOMC Toplantı Tutanakları', 1],
  [/beige book/i, 'Fed Bej Kitap', -1],
  [/fed balance sheet/i, 'Fed Bilançosu', -1],
  [/interest rate decision|fed interest rate|federal funds (rate|target)|fomc statement|fomc.*projections|policy rate|one.?week repo rate/i, 'Faiz Kararı', 1],
  [/non.?farm payrolls private|private non.?farm/i, 'Özel Tarım Dışı İstihdam', 0],
  [/(government|manufacturing) payrolls/i, 'Kamu/İmalat İstihdamı', -1],
  [/non.?farm payroll/i, 'Tarım Dışı İstihdam', 1],
  [/adp.*(employment|payroll)/i, 'ADP Tarım Dışı İstihdam', 0],
  [/u.?6 unemployment/i, 'U-6 İşsizlik Oranı', 0],
  [/unemployment rate/i, 'İşsizlik Oranı', 1],
  [/gdp growth|gross domestic|\bgdp\b/i, 'GSYİH Büyüme', 1],
  [/retail sales/i, 'Perakende Satışlar', 1],
  // ISM alt endeksleri (spesifik önce, PMI en sonra)
  [/ism manufacturing new orders/i, 'ISM İmalat Yeni Siparişler', 0],
  [/ism manufacturing prices/i, 'ISM İmalat Fiyatlar', 0],
  [/ism manufacturing employment/i, 'ISM İmalat İstihdam', 0],
  [/ism manufacturing/i, 'ISM İmalat PMI', 1],
  [/ism (services|non.?manufacturing) new orders/i, 'ISM Hizmet Yeni Siparişler', 0],
  [/ism (services|non.?manufacturing) business activity/i, 'ISM Hizmet İş Faaliyeti', 0],
  [/ism (services|non.?manufacturing) employment/i, 'ISM Hizmet İstihdam', 0],
  [/ism (services|non.?manufacturing) prices/i, 'ISM Hizmet Fiyatlar', 0],
  [/ism (services|non.?manufacturing)/i, 'ISM Hizmet PMI', 1],
  // ★★ — üfe / dış ticaret / güven / sanayi / konut / başvurular
  [/core ppi/i, 'Çekirdek ÜFE', 0],
  [/ppi|producer price/i, 'ÜFE', 0],
  [/balance of trade|trade balance|foreign trade/i, 'Dış Ticaret Dengesi', 0],
  [/current account/i, 'Cari İşlemler Dengesi', 0],
  [/industrial production/i, 'Sanayi Üretimi', 0],
  [/capacity utilization/i, 'Kapasite Kullanımı', 0],
  [/initial jobless claims/i, 'İşsizlik Başvuruları (Haftalık)', 0],
  [/(continuing|jobless).*(claims|4.week)/i, 'Devam Eden İşsizlik Başvuruları', -1],
  [/durable goods/i, 'Dayanıklı Mal Siparişleri', 0],
  [/average hourly earnings/i, 'Ortalama Saatlik Kazanç', 0],
  [/s&p global manufacturing|markit manufacturing/i, 'S&P Global İmalat PMI', 0],
  [/s&p global services|markit services/i, 'S&P Global Hizmet PMI', 0],
  [/composite pmi/i, 'Bileşik PMI', 0],
  [/manufacturing pmi/i, 'İmalat PMI', 0],
  [/services pmi/i, 'Hizmet PMI', 0],
  [/consumer confidence|consumer sentiment/i, 'Tüketici Güveni', 0],
  [/business confidence/i, 'İş Güveni', 0],
  [/economic confidence/i, 'Ekonomik Güven Endeksi', 0],
  [/building permits/i, 'İnşaat İzinleri', 0],
  [/housing starts/i, 'Konut Başlangıçları', 0],
  [/existing home sales/i, 'İkinci El Konut Satışları', 0],
  [/new home sales/i, 'Yeni Konut Satışları', 0],
  [/pending home sales/i, 'Bekleyen Konut Satışları', 0],
  [/factory orders/i, 'Fabrika Siparişleri', 0],
  [/exports/i, 'İhracat', 0],
  [/imports/i, 'İthalat', 0],
  // ★ — düşük etkili
  [/foreign exchange reserves|fx reserves/i, 'Döviz Rezervleri', -1],
  [/tourism revenues|tourist arrivals/i, 'Turizm', -1],
  [/car (registrations|sales)|auto sales|auto production/i, 'Otomotiv Satışları', -1],
  [/budget balance|government budget/i, 'Bütçe Dengesi', -1],
  [/government debt|central government debt/i, 'Kamu Borcu', -1],
  [/participation rate/i, 'İşgücüne Katılım Oranı', -1],
  [/redbook/i, 'Redbook Perakende', -1],
  [/holiday|day of|memorial|independence/i, 'Resmi Tatil', -1],
];
/* Nitelik ekleri — aynı temel ada düşen alt-serileri AYIRT EDER (Çekirdek, Aylık/Yıllık,
   Oto Hariç, Öncü/Nihai vb). İngilizce başlıktan okunur; temel ad zaten içeriyorsa eklenmez. */
function econQualifiers(title, base){
  const t=(title||'').toLowerCase(), b=(base||'').toLowerCase(), q=[];
  if(/\bcore\b/.test(t) && !/çekirdek/.test(b)) q.push('Çekirdek');
  if(/ex[ -]?gas.*auto|ex.*gas.*auto/.test(t)) q.push('Benzin/Oto Hariç');
  else if(/ex[ -]?autos?/.test(t)) q.push('Oto Hariç');
  else if(/ex food.*energy.*trade/.test(t)) q.push('Gıda/Enerji/Ticaret Hariç');
  else if(/ex food.*energy|ex food and energy/.test(t)) q.push('Gıda/Enerji Hariç');
  if(/control group/.test(t)) q.push('Kontrol Grubu');
  if(/\bmom\b/.test(t) && !/aylık/.test(b)) q.push('Aylık');
  else if(/\byoy\b/.test(t) && !/yıllık/.test(b)) q.push('Yıllık');
  if(/\bprel(iminary)?\b/.test(t)) q.push('Öncü');
  else if(/\bfinal\b/.test(t) && !/nihai/.test(b)) q.push('Nihai');
  if(/\bs\.a\.|seasonally adjusted/.test(t)) q.push('Mevs. Arınd.');
  return q;
}
function econDir(title){
  const t=(title||'').toLowerCase();
  if(/rate decision|interest rate|fed funds|federal funds|fomc/.test(t)) return 0;
  if(/inflation|cpi|pce|ppi|producer price|unemploy|jobless|deficit|debt|import/.test(t)) return -1;
  return 1;
}
function econClassify(title){
  let base=null, imp=null, mapped=false;
  if(getLang()==='en'){
    /* keep English event titles */
  } else {
    for(const [rx,tr,mi] of ECON_MAP){ if(rx.test(title)){ base=tr; imp=mi; mapped=true; break; } }
  }
  if(!mapped){
    const t=(title||'').toLowerCase(); imp=-1;
    if(/inflation|cpi|pce|interest rate|rate decision|non.?farm|unemployment rate|gdp|retail sales|ism/.test(t)) imp=1;
    else if(/ppi|producer|trade|current account|industrial|confidence|durable|jobless|pmi|housing|permits|payroll/.test(t)) imp=0;
  }
  // İkincil dışlama varyantları (Oto Hariç / Kontrol Grubu) ★★★ ise ★★'ye indir (çekirdek hariç)
  if(imp===1 && /\bex[ -]|control group/i.test(title) && !/\bcore\b/i.test(title)) imp=0;
  return { tr:base, imp, mapped };
}
function econVal(v,e){
  if(v==null) return '—';
  if(e.unit==='%') return v+'%';
  if(e.unit==='$') return '$'+v+(e.scale||'');
  return v+(e.scale||'')+(e.unit||'');
}
/* Investing "data" HTML'ini tek tip satırlara çözer (isim/önem/renk KAYNAKTAN). */
function parseInvestingCal(htmlData){
  // gövdesiz <tr>'ler için <table> ile sarmala (yoksa DOMParser atar)
  const doc=new DOMParser().parseFromString('<table><tbody>'+(htmlData||'')+'</tbody></table>','text/html');
  return [...doc.querySelectorAll('tr[id^="eventRowId_"]')].map(tr=>{
    const a=tr.querySelector('td.event a'), evc=tr.querySelector('td.event');
    const name=((a?a.textContent:evc?evc.textContent:'')||'').replace(/\s+/g,' ').trim();
    if(!name) return null;
    const sk=tr.querySelector('td.sentiment')?.getAttribute('data-img_key')||'';
    const imp = sk==='bull3'?1 : sk==='bull2'?0 : -1;         // Investing yıldızı → ★★★/★★/★
    const ac=tr.querySelector('td[id^="eventActual_"]');
    const aStr=ac?ac.textContent.trim():'';
    const aClr = ac && /greenFont/.test(ac.className)?'up' : (ac && /redFont/.test(ac.className)?'down':'');  // Investing rengi
    const fStr=(tr.querySelector('td[id^="eventForecast_"]')?.textContent||'').trim();
    const pStr=(tr.querySelector('td[id^="eventPrevious_"]')?.textContent||'').trim();
    const dt=tr.getAttribute('data-event-datetime')||'';
    let dateLbl='', timeLbl=(tr.querySelector('td.time,td.first')?.textContent||'').trim();
    const m=dt.match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/);
    if(m){ const g=new Date(+m[1],+m[2]-1,+m[3]); dateLbl=m[3]+' '+TR_AY[+m[2]-1]+' '+TR_GUN[g.getDay()]; if(!timeLbl||/gün/i.test(timeLbl)) timeLbl=m[4]+':'+m[5]; }
    return { name, imp, aStr, aClr, fStr:fStr||'—', pStr:pStr||'—', dateLbl, timeLbl };
  }).filter(Boolean);
}
/* YEDEK: TradingView /econ → seçili ülke+dönemin satırları (isim/önem küratörlü haritadan). */
async function tvRowsForTab(cc, time){
  const from=new Date(Date.now()-3*86400000).toISOString();
  const to=new Date(Date.now()+16*86400000).toISOString();
  const j=await fetch('/econ?countries='+cc+'&from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)).then(r=>r.ok?r.json():null).catch(()=>null);
  let evs=((j&&j.result)||[]).map(e=>{
    const cls=econClassify(e.title||'');
    return { title:e.title||'', imp:cls.imp, mappedTr:cls.tr, period:econPeriodTR(e.period||''),
      d:new Date(e.date), aRaw:e.actualRaw, fRaw:e.forecastRaw, pRaw:e.previousRaw,
      aStr:econVal(e.actual,e), fStr:econVal(e.forecast,e), pStr:econVal(e.previous,e), dir:econDir(e.title) };
  }).filter(e=>!isNaN(e.d) && econInTime(e,time)).sort((a,b)=>a.d-b.d);   // sadece bu döneme ait
  if(getLang()!=='en'){
    const need=[...new Set(evs.filter(e=>!e.mappedTr).map(e=>e.title))];
    if(need.length){
      const tr=await translateTR(need);
      const tmap={}; need.forEach((tt,i)=>tmap[tt]=tr[i]||tt);
      evs.forEach(e=>{ if(!e.mappedTr) e.trName=tmap[e.title]; });
    }
  }
  const loc=localeTag();
  const fD=new Intl.DateTimeFormat(loc,{timeZone:'Europe/Istanbul',day:'2-digit',month:'short',weekday:'short'});
  const fT=new Intl.DateTimeFormat(loc,{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'});
  return evs.map(e=>{
    const base=e.mappedTr||e.trName||e.title;
    const quals=e.mappedTr?econQualifiers(e.title, base):[];
    const name=base+(quals.length?' ('+quals.join(', ')+')':'')+(e.period?' ('+e.period+')':'');
    let aClr=''; const ref=(e.fRaw!=null)?e.fRaw:e.pRaw;
    if(e.aRaw!=null && ref!=null && e.dir!==0 && e.aRaw!==ref){ const beat=e.aRaw>ref; aClr=(e.dir>0?beat:!beat)?'up':'down'; }
    return { name, imp:e.imp, aStr:e.aStr, aClr, fStr:e.fStr, pStr:e.pStr, dateLbl:fD.format(e.d), timeLbl:fT.format(e.d) };
  });
}
/* Ekonomik Takvim sayfası: sol ülke kutuları ilk girişte kurulur; Türkiye açık başlar. */
function initEconPage(){
  if(ECON_PAGE_INIT) return;
  ECON_PAGE_INIT=true;
  document.getElementById('econCountries').innerHTML=ECON_COUNTRIES.map(([cc])=>
    `<button class="cbox" id="cbox-${cc}" onclick="toggleEconCountry('${cc}')">${flagSpan(cc)}<span>${ccName(cc)}</span></button>`).join('');
  toggleEconCountry('TR');
}
function toggleEconCountry(cc){
  const box=document.getElementById('cbox-'+cc);
  if(ECON_PANELS[cc]){
    // Açık → kapat: paneli kaldır, kutunun işaretini sil
    delete ECON_PANELS[cc];
    document.getElementById('epanel-'+cc)?.remove();
    box?.classList.remove('active');
  }else{
    // Kapalı → aç: panel oluştur (tıklama sırasına göre en alta eklenir), veriyi yükle
    ECON_PANELS[cc]={ time:'buhafta', imp:1, gen:0 };
    box?.classList.add('active');
    const el=document.createElement('div');
    el.className='card'; el.id='epanel-'+cc;
    el.innerHTML=`<h2 style="display:flex;align-items:center;gap:9px">${flagSpan(cc)}${tf('econ_panel_title',{c:ccName(cc)})}</h2>
      <div class="toolbar" id="econTime-${cc}" style="margin:10px 0 6px">
        ${[['dun','econ_yesterday'],['bugun','econ_today'],['yarin','econ_tomorrow'],['buhafta','econ_this_week'],['gelecekhafta','econ_next_week']]
          .map(([tk,lk])=>`<button data-t="${tk}" onclick="setEconTime('${cc}','${tk}')">${t(lk)}</button>`).join('')}
      </div>
      <div class="toolbar" id="econImp-${cc}">
        ${[[-1,'econ_imp_lo'],[0,'econ_imp_mid'],[1,'econ_imp_hi']]
          .map(([i,lk])=>`<button data-imp="${i}" onclick="setEconImp('${cc}',${i})">${t(lk)}</button>`).join('')}
      </div>
      <div id="econBody-${cc}"><div class="hint">${t('econ_loading')}</div></div>`;
    document.getElementById('econPanels').appendChild(el);
    syncEconBtns(cc);
    loadEconPanel(cc);
  }
  const hint=document.getElementById('econEmptyHint');
  if(hint) hint.style.display=Object.keys(ECON_PANELS).length?'none':'';
}
function setEconTime(cc,t){ const st=ECON_PANELS[cc]; if(!st) return; st.time=t; syncEconBtns(cc); loadEconPanel(cc); }
function setEconImp(cc,i){ const st=ECON_PANELS[cc]; if(!st) return; st.imp=i; renderEconPanel(cc); }
function econTimeLabel(time){
  return {dun:t('econ_yesterday'),bugun:t('econ_today'),yarin:t('econ_tomorrow'),buhafta:t('econ_this_week'),gelecekhafta:t('econ_next_week')}[time]||'';
}

/* ---------- Grafik AI: TradingView gelişmiş grafik + Luna teknik yorum ---------- */
let GRAPH_AI_INIT=false;
let GRAPH_AI_STATE={tvSymbol:'NASDAQ:NVDA',yahooSymbol:'NVDA',originalName:'',synced:false,blockedOriginal:''};
let GRAPH_AI_PENDING_ANALYSIS=false;
let GRAPH_AI_PENDING_MODEL='luna';
const GRAPH_AI_TV_SUFFIX={L:'LSE',DE:'XETR',PA:'EURONEXT',AS:'EURONEXT',BR:'EURONEXT',LS:'EURONEXT',MI:'MIL',MC:'BME',SW:'SIX',ST:'OMXSTO',CO:'OMXCOP',OL:'OSL',HE:'OMXHEX',VI:'VIE',WA:'GPW',T:'TSE',HK:'HKEX',TW:'TWSE',TWO:'TPEX',TO:'TSX',V:'TSXV',AX:'ASX',SI:'SGX'};
function graphAiYahooSymbol(tvSymbol){
  const raw=String(tvSymbol||'').trim().toUpperCase();
  if(!raw.includes(':')) return raw;
  const parts=raw.split(':'), ex=(parts.shift()||'').toUpperCase(), code=parts.join(':');
  if(ex==='BIST') return code+'.IS';
  const suffix=Object.entries(GRAPH_AI_TV_SUFFIX).find(([,value])=>value===ex)?.[0];
  return suffix ? code+'.'+suffix : code;
}
function graphAiQuoteSymbol(data){
  const original=String(data&&data.original_name||'').trim().toUpperCase();
  const shortName=String(data&&data.short_name||'').trim().toUpperCase();
  if(!/^[A-Z0-9._:\/\-^=!]{1,80}$/.test(original)||!/^[A-Z0-9._\-^=]{1,40}$/.test(shortName)) return null;
  const prefix=original.split(':')[0];
  const tvSymbol=['BATS','BATS_DLY'].includes(prefix)?shortName:original;
  return {original,tvSymbol,yahooSymbol:graphAiYahooSymbol(tvSymbol)};
}
function syncGraphAiSymbolFromWidget(event){
  if(event.origin!=='https://www.tradingview-widget.com') return;
  const frame=document.querySelector('#graphAiWidget iframe');
  if(!frame||event.source!==frame.contentWindow) return;
  let message=event.data;
  if(typeof message==='string'){ try{ message=JSON.parse(message); }catch(_e){ return; } }
  if(!message||typeof message!=='object') return;
  if(message.name==='tv-widget-no-data'){
    GRAPH_AI_STATE.synced=false;
    GRAPH_AI_STATE.blockedOriginal=GRAPH_AI_STATE.originalName;
    GRAPH_AI_PENDING_ANALYSIS=false;
    setGraphAiButtonsDisabled(false);
    const status=document.getElementById('graphAiStatus');
    if(status){ status.textContent=t('graph_ai_symbol_unavailable'); status.className='hint down'; }
    return;
  }
  if(message.name!=='quoteUpdate'||message.provider!=='TradingView') return;
  const next=graphAiQuoteSymbol(message.data); if(!next) return;
  if(GRAPH_AI_STATE.blockedOriginal&&next.original===GRAPH_AI_STATE.blockedOriginal) return;
  /* TradingView aynı hisseyi BATS_DLY:NVDA ve NASDAQ:NVDA gibi farklı
     sağlayıcı adlarıyla sırayla gönderebilir; gerçek kod değişmedikçe sonucu silme. */
  const changed=next.yahooSymbol!==GRAPH_AI_STATE.yahooSymbol;
  const runPending=GRAPH_AI_PENDING_ANALYSIS, pendingModel=GRAPH_AI_PENDING_MODEL;
  GRAPH_AI_STATE={...GRAPH_AI_STATE,...next,synced:true,blockedOriginal:''};
  const label=document.getElementById('graphAiSymbolLabel'); if(label) label.textContent=next.tvSymbol;
  const status=document.getElementById('graphAiStatus');
  if(status&&changed&&!status.classList.contains('graph-ai-busy')){ status.textContent=''; status.className='hint'; }
  if(changed&&!runPending){
    const card=document.getElementById('graphAiLunaCard'), body=document.getElementById('graphAiLunaBody');
    if(card) card.classList.add('hidden'); if(body) body.innerHTML='';
  }
  if(runPending){ GRAPH_AI_PENDING_ANALYSIS=false; setTimeout(()=>analyzeGraphAi(pendingModel),0); }
}
window.addEventListener('message',syncGraphAiSymbolFromWidget);
async function toggleGraphAiFullscreen(){
  const chart=document.querySelector('.graph-ai-chart-card'); if(!chart) return;
  try{
    if(document.fullscreenElement) await document.exitFullscreen();
    else if(chart.requestFullscreen) await chart.requestFullscreen();
  }catch(_e){}
}
function renderGraphAiWidget(){
  const host=document.getElementById('graphAiWidget'); if(!host) return;
  const state=GRAPH_AI_STATE, locale=getLang()==='en'?'en':'tr';
  const label=document.getElementById('graphAiSymbolLabel'); if(label) label.textContent=state.tvSymbol;
  host.innerHTML='<div class="tradingview-widget-container"><div class="tradingview-widget-container__widget" style="height:calc(100% - 28px);width:100%"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">TradingView</span></a></div></div>';
  const container=host.firstElementChild, script=document.createElement('script');
  script.type='text/javascript'; script.async=true; script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.text=JSON.stringify({autosize:true,symbol:state.tvSymbol,interval:'D',timezone:'exchange',theme:'dark',backgroundColor:'#07101f',gridColor:'rgba(132,154,190,0.10)',style:'1',locale,withdateranges:true,hide_side_toolbar:false,hide_top_toolbar:false,hide_legend:false,hide_volume:false,allow_symbol_change:true,save_image:true,calendar:true,details:true,hotlist:true,show_popup_button:true,popup_width:'1600',popup_height:'950',studies:['RSI@tv-basicstudies','MACD@tv-basicstudies','MASimple@tv-basicstudies'],support_host:'https://www.tradingview.com'});
  container.appendChild(script);
}
function initGraphAiPage(){
  if(!GRAPH_AI_INIT){ GRAPH_AI_INIT=true; renderGraphAiWidget(); }
}
function setGraphAiButtonsDisabled(disabled){
  ['graphAiLunaBtn','graphAiSolBtn'].forEach(id=>{ const button=document.getElementById(id); if(button) button.disabled=disabled; });
}
async function analyzeGraphAi(requestedModel='luna'){
  const model=requestedModel==='sol'?'sol':'luna', status=document.getElementById('graphAiStatus');
  const card=document.getElementById('graphAiLunaCard'), body=document.getElementById('graphAiLunaBody');
  const title=document.getElementById('graphAiAnalysisTitle');
  if(!status||!card||!body) return;
  if(!GRAPH_AI_STATE.synced){
    GRAPH_AI_PENDING_ANALYSIS=true; GRAPH_AI_PENDING_MODEL=model; setGraphAiButtonsDisabled(true);
    status.textContent=t('graph_ai_wait_symbol'); status.className='hint graph-ai-busy';
    setTimeout(()=>{
      if(!GRAPH_AI_PENDING_ANALYSIS) return;
      GRAPH_AI_PENDING_ANALYSIS=false; setGraphAiButtonsDisabled(false);
      status.textContent=t('graph_ai_wait_symbol'); status.className='hint down';
    },12000);
    return;
  }
  setGraphAiButtonsDisabled(true); card.classList.remove('hidden'); body.innerHTML='';
  if(title){ const key=model==='sol'?'graph_ai_sol_title':'graph_ai_luna_title'; title.dataset.i18n=key; title.textContent=t(key); }
  status.className='hint graph-ai-busy'; status.textContent=t(model==='sol'?'graph_ai_loading_sol':'graph_ai_loading');
  try{
    const r=await fetch('/ai/chart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:getLang(),symbol:GRAPH_AI_STATE.yahooSymbol,tvSymbol:GRAPH_AI_STATE.tvSymbol,model})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok){ if(j.error==='rate_limit') throw new Error('rate_limit'); throw new Error('unavailable'); }
    const a=j.analysis||{}, m=j.market||{};
    card.classList.remove('hidden');
    body.innerHTML=`<div class="graph-ai-market-line"><b>${safeHTML(m.symbol||GRAPH_AI_STATE.yahooSymbol)}</b><span>${safeHTML(m.price==null?'—':String(m.price))} ${safeHTML(m.currency||'')}</span><span>RSI ${safeHTML(m.technical&&m.technical.rsi14!=null?String(m.technical.rsi14):'—')}</span></div><div class="luna-result">
      <section class="luna-section wide"><h3>${safeHTML(t('graph_ai_summary'))}</h3><p>${safeHTML(a.summary||'—')}</p></section>
      <section class="luna-section"><h3>${safeHTML(t('graph_ai_trend'))}</h3><p>${safeHTML(a.trend||'—')}</p></section>
      <section class="luna-section"><h3>${safeHTML(t('graph_ai_momentum'))}</h3><p>${safeHTML(a.momentum||'—')}</p></section>
      ${lunaList(t('graph_ai_levels'),a.levels)}
      ${lunaList(t('graph_ai_scenarios'),a.scenarios)}
      ${lunaList(t('luna_risks'),a.risks,true)}
    </div><div class="luna-note">${safeHTML(a.disclaimer||t('luna_note'))}</div>`;
    status.textContent=''; status.className='hint';
  }catch(e){ status.textContent=e.message==='rate_limit'?t('luna_rate'):t('graph_ai_error'); status.className='hint down'; }
  finally{ setGraphAiButtonsDisabled(false); }
}
function econImportanceLabel(importance){
  return {'-1':t('econ_imp_lo'),'0':t('econ_imp_mid'),'1':t('econ_imp_hi')}[String(importance)]||'';
}
function syncEconBtns(cc){
  const st=ECON_PANELS[cc]; if(!st) return;
  document.querySelectorAll('#econTime-'+cc+' button').forEach(b=>b.classList.toggle('primary', b.dataset.t===st.time));
  document.querySelectorAll('#econImp-'+cc+' button').forEach(b=>b.classList.toggle('primary', Number(b.dataset.imp)===st.imp));
}
async function loadEconPanel(cc){
  const st=ECON_PANELS[cc]; if(!st) return;
  const tab=ECON_TAB[st.time]||'thisWeek';
  const key=cc+':'+tab;
  const c=ECON_CACHE[key];
  if(c && (Date.now()-c.ts)<30*60000){ renderEconPanel(cc); return; }
  const box=document.getElementById('econBody-'+cc);
  if(box) box.innerHTML='<div class="hint">'+t('econ_loading')+'</div>';
  const myGen=++st.gen;   // panel kapatılıp açılırsa / dönem değişirse eski yanıt çöpe gider
  let rows=[], src='', investingOk=false;
  // 1) BİRİNCİL: Investing (kaynağın kendi isim/önem/renkleri) — 25 ülkenin tamamı
  //    (ISO→Investing ülke ID haritası server.js /investcal içinde).
  //    Geçerli JSON (data alanı string) → Investing ÇALIŞTI say (0 satır = o gün veri yok, normal).
  //    Yalnızca istek GERÇEKTEN başarısızsa (403/502/JSON değil) yedeğe düş.
  try{
    const r=await fetch('/investcal?c='+cc+'&tab='+tab);
    if(!ECON_PANELS[cc] || myGen!==ECON_PANELS[cc].gen) return;
    if(r.ok){ const j=await r.json(); if(j && typeof j.data==='string'){ investingOk=true; rows=parseInvestingCal(j.data); src='Investing.com'; } }
  }catch(e){}
  // 2) YEDEK: Investing gerçekten erişilemediyse TradingView
  if(!investingOk){
    try{
      const tv=await tvRowsForTab(cc, st.time);
      if(!ECON_PANELS[cc] || myGen!==ECON_PANELS[cc].gen) return;
      if(tv){ rows=tv; src='TradingView'; }
    }catch(e){}
  }
  ECON_CACHE[key]={ rows, src, ts:Date.now() };
  renderEconPanel(cc);
}
function renderEconPanel(cc){
  const st=ECON_PANELS[cc];
  const box=document.getElementById('econBody-'+cc);
  if(!st || !box) return;
  syncEconBtns(cc);
  const c=ECON_CACHE[cc+':'+(ECON_TAB[st.time]||'thisWeek')];
  if(!c){ box.innerHTML='<div class="hint">—</div>'; return; }
  const list=c.rows.filter(e=>e.imp===st.imp);
  if(!list.length){
    const timeAd=econTimeLabel(st.time);
    const impAd=econImportanceLabel(st.imp);
    box.innerHTML='<div class="hint">'+tf('econ_no_rows',{time:timeAd,imp:impAd})+'</div>';
    return;
  }
  const rows=list.map(e=>`<tr>
    <td style="white-space:nowrap">${safeHTML(e.dateLbl)} <span class="thd">${safeHTML(e.timeLbl)}</span></td>
    <td style="white-space:normal">${safeHTML(e.name||'')}</td>
    <td${e.aClr?` class="${e.aClr}"`:''}><b>${safeHTML(e.aStr||'—')}</b></td>
    <td>${safeHTML(e.fStr)}</td>
    <td>${safeHTML(e.pStr)}</td>
  </tr>`).join('');
  const kaynak = c.src==='Investing.com' ? t('econ_src_inv') : t('econ_src_tv');
  box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr><th>${t('econ_th_date')}</th><th>${t('econ_th_data')}</th><th>${t('econ_th_act')}</th><th>${t('econ_th_exp')}</th><th>${t('econ_th_prev')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="hint" style="margin-top:8px">${t('econ_foot')} ${kaynak}</div>
    <div class="econ-luna-actions no-print">
      <button type="button" class="primary luna-button" id="econLunaBtn-${cc}" onclick="analyzeEconWithLuna('${cc}')">${safeHTML(t('econ_luna_btn'))}</button>
      <span class="hint" id="econLunaStatus-${cc}"></span>
    </div>
    <div class="econ-luna-card hidden" id="econLunaCard-${cc}">
      <h3>${safeHTML(t('econ_luna_title'))}</h3>
      <div id="econLunaBody-${cc}"></div>
    </div>`;
}
async function analyzeEconWithLuna(cc){
  const st=ECON_PANELS[cc], c=st&&ECON_CACHE[cc+':'+(ECON_TAB[st.time]||'thisWeek')];
  const btn=document.getElementById('econLunaBtn-'+cc), status=document.getElementById('econLunaStatus-'+cc);
  const card=document.getElementById('econLunaCard-'+cc), body=document.getElementById('econLunaBody-'+cc);
  if(!st||!c||!btn||!status||!card||!body) return;
  const list=c.rows.filter(e=>e.imp===st.imp);
  if(!list.length) return;
  const snapshot={
    countryCode:cc,countryName:ccName(cc),timeFilter:st.time,timeLabel:econTimeLabel(st.time),
    importance:st.imp,importanceLabel:econImportanceLabel(st.imp),source:c.src,
    fetchedAt:new Date(c.ts).toISOString(),timezone:'Europe/Istanbul',
    rows:list.slice(0,60).map(e=>({date:e.dateLbl,time:e.timeLbl,event:e.name,actual:e.aStr||'',forecast:e.fStr||'',previous:e.pStr||''}))
  };
  btn.disabled=true; card.classList.remove('hidden'); body.innerHTML=''; status.textContent=t('econ_luna_loading');
  try{
    const r=await fetch('/ai/economic-calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:getLang(),snapshot})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok){
      if(j.error==='luna_not_configured') throw new Error('not_configured');
      if(j.error==='rate_limit') throw new Error('rate_limit');
      throw new Error('unavailable');
    }
    const a=j.analysis||{};
    body.innerHTML=`<div class="luna-result">
      <section class="luna-section wide"><h3>${safeHTML(t('econ_luna_summary'))}</h3><p>${safeHTML(a.summary||'—')}</p></section>
      ${lunaList(t('econ_luna_key_events'),a.keyEvents)}
      ${lunaList(t('econ_luna_surprises'),a.realizedSurprises)}
      <section class="luna-section wide"><h3>${safeHTML(t('econ_luna_transmission'))}</h3><p>${safeHTML(a.marketTransmission||'—')}</p></section>
      ${lunaList(t('econ_luna_scenarios'),a.riskScenarios)}
      ${lunaList(t('luna_watch'),a.watchNext)}
      <section class="luna-section wide"><h3>${safeHTML(t('luna_data_quality'))}</h3><p>${safeHTML(a.dataQuality||'—')}</p></section>
    </div><div class="luna-note">${safeHTML(a.disclaimer||t('luna_note'))}</div>`;
    if(Array.isArray(j.sources)&&j.sources.length){
      const sources=document.createElement('div'); sources.className='ai-sources econ-luna-sources';
      const label=document.createElement('strong'); label.textContent=t('ai_sources'); sources.appendChild(label);
      j.sources.forEach(s=>{ if(!s||!/^https:\/\//i.test(String(s.url||''))) return; const a=document.createElement('a'); a.href=s.url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=s.title||s.url; sources.appendChild(a); });
      body.appendChild(sources);
    }
    status.textContent='';
  }catch(e){
    status.textContent=e.message==='not_configured'?t('sol_not_configured'):(e.message==='rate_limit'?t('sol_rate'):t('econ_luna_error'));
    status.className='hint down';
  }finally{ btn.disabled=false; }
}

/* ---------- İlk 100 Şirket sayfası (companiesmarketcap.com karşılığı) ----------
   Ekonomik takvimle aynı ülke-kutusu düzeni ama TEK panel: bir ülkeye tıklayınca ilk 100
   listesi açılır, başka ülkeye tıklayınca öncekinin yerini alır, aynı ülkeye tekrar
   tıklayınca kapanır. Veri: TradingView scanner — Borsanın Devleri (top10) ile AYNI sorgu,
   yalnızca range 100'e çıkarılmış; is_primary=true çapraz kotasyonları eler. */
const TOP100_MARKETS={
  TR:{scan:'turkey',                     sym:'₺',    click:c=>c+'.IS'},
  US:{scan:'america',                    sym:'$',    click:c=>c+'.US'},
  KR:{scan:'korea',                      sym:'₩',    click:c=>c},        // sayısal kodlar tekil — otomatik borsa tespiti .KS/.KQ'yu doğru çözer
  JP:{scan:'japan',       ex:'TSE',      sym:'¥',    click:c=>c+'.T'},
  CN:{scan:'china',                      sym:'¥',    click:c=>c},        // SSE/SZSE — otomatik borsa tespiti .SS/.SZ çözer
  HK:{scan:'hongkong',    ex:'HKEX',     sym:'HK$',  click:c=>c+'.HK'},
  TW:{scan:'taiwan',                     sym:'NT$',  click:c=>c},        // TWSE/TPEx — otomatik .TW/.TWO
  CA:{scan:'canada',                     sym:'C$',   click:c=>c},        // TSX/TSXV — otomatik .TO/.V
  AU:{scan:'australia',   ex:'ASX',      sym:'A$',   click:c=>c+'.AX'},
  SG:{scan:'singapore',   ex:'SGX',      sym:'S$',   click:c=>c+'.SI'},
  GB:{scan:'uk',          ex:'LSE',      sym:'£',    click:c=>c+'.L'},
  DE:{scan:'germany',     ex:'XETR',     sym:'€',    click:c=>c+'.DE'},
  FR:{scan:'france',      ex:'EURONEXT', sym:'€',    click:c=>c+'.PA'},
  IT:{scan:'italy',       ex:'MIL',      sym:'€',    click:c=>c+'.MI'},
  ES:{scan:'spain',       ex:'BME',      sym:'€',    click:c=>c+'.MC'},
  NL:{scan:'netherlands', ex:'EURONEXT', sym:'€',    click:c=>c+'.AS'},
  BE:{scan:'belgium',     ex:'EURONEXT', sym:'€',    click:c=>c+'.BR'},
  PT:{scan:'portugal',    ex:'EURONEXT', sym:'€',    click:c=>c+'.LS'},
  CH:{scan:'switzerland', ex:'SIX',      sym:'CHF ', click:c=>c+'.SW'},
  SE:{scan:'sweden',      ex:'OMXSTO',   sym:'kr ',  click:c=>c+'.ST'},
  DK:{scan:'denmark',     ex:'OMXCOP',   sym:'kr ',  click:c=>c+'.CO'},
  NO:{scan:'norway',      ex:'OSL',      sym:'kr ',  click:c=>c+'.OL'},
  FI:{scan:'finland',     ex:'OMXHEX',   sym:'€',    click:c=>c+'.HE'},
  AT:{scan:'austria',     ex:'VIE',      sym:'€',    click:c=>c+'.VI'},
  PL:{scan:'poland',      ex:'GPW',      sym:'zł ',  click:c=>c+'.WA'},
};
let TOP100_OPEN=null, TOP100_GEN=0, TOP100_PAGE_INIT=false;
const TOP100_CACHE={};   // cc → { rows, ts } (10 dk)
function fmtMcapSym(n, sym){
  if(n==null) return '—';
  const two=x=>x.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(n>=1e12) return sym+two(n/1e12)+' T';
  if(n>=1e9)  return sym+two(n/1e9)+' B';
  if(n>=1e6)  return sym+two(n/1e6)+' M';
  return sym+Math.round(n).toLocaleString('tr-TR');
}
function initTop100Page(){
  if(TOP100_PAGE_INIT) return;
  TOP100_PAGE_INIT=true;
  document.getElementById('topCountries').innerHTML=ECON_COUNTRIES.map(([cc])=>
    `<button class="cbox" id="tbox-${cc}" onclick="toggleTopCountry('${cc}')">${flagSpan(cc)}<span>${ccName(cc)}</span></button>`).join('');
  toggleTopCountry('TR');
}
function toggleTopCountry(cc){
  const prev=TOP100_OPEN;
  // Açık olan her ne varsa kapat (aynı ülkeyse iş biter, farklıysa yenisi açılır)
  if(prev){
    TOP100_OPEN=null; TOP100_GEN++;
    document.getElementById('tpanel-'+prev)?.remove();
    document.getElementById('tbox-'+prev)?.classList.remove('active');
  }
  if(prev!==cc){
    TOP100_OPEN=cc;
    document.getElementById('tbox-'+cc)?.classList.add('active');
    const el=document.createElement('div');
    el.className='card'; el.id='tpanel-'+cc;
    el.innerHTML=`<h2 style="display:flex;align-items:center;gap:9px">${flagSpan(cc)}${ccName(cc)} ${t('top100_panel_title')}</h2>
      <div class="sub">${t('top100_sub')}</div>
      <div id="topBody-${cc}"><div class="hint">${t('loading')}</div></div>`;
    document.getElementById('topPanels').appendChild(el);
    loadTop100Panel(cc);
  }
  const hint=document.getElementById('topEmptyHint');
  if(hint) hint.style.display=TOP100_OPEN?'none':'';
}
async function loadTop100Panel(cc){
  const m=TOP100_MARKETS[cc];
  const box=document.getElementById('topBody-'+cc);
  if(!m || !box) return;
  const cached=TOP100_CACHE[cc];
  if(cached && (Date.now()-cached.ts)<10*60000){ renderTop100Panel(cc, cached.rows); return; }
  const myGen=++TOP100_GEN;
  try{
    const filter=[{left:'is_primary',operation:'equal',right:true}];
    if(m.ex) filter.push({left:'exchange',operation:'equal',right:m.ex});
    const r=await fetch('https://scanner.tradingview.com/'+m.scan+'/scan',{method:'POST',body:JSON.stringify({
      columns:['name','description','market_cap_basic','close','change',
        'price_earnings_ttm','price_book_fq','return_on_equity','net_margin','number_of_employees','logoid'],
      filter, sort:{sortBy:'market_cap_basic',sortOrder:'desc'}, range:[0,100]
    })});
    const j=r.ok?await r.json():null;
    if(myGen!==TOP100_GEN || TOP100_OPEN!==cc) return;   // bu arada kapatıldı/değişti
    const rows=(j&&j.data||[]).map(x=>x.d).filter(d=>d&&d[0]);
    if(!rows.length){ box.innerHTML='<div class="hint">'+t('list_fail')+'</div>'; return; }
    TOP100_CACHE[cc]={ rows, ts:Date.now() };
    renderTop100Panel(cc, rows);
  }catch(e){
    if(TOP100_OPEN===cc) box.innerHTML='<div class="hint">'+t('list_fail')+'  '+e.message+'</div>';
  }
}
function renderTop100Panel(cc, rows){
  const m=TOP100_MARKETS[cc];
  const box=document.getElementById('topBody-'+cc);
  if(!m || !box) return;
  const pp=v=>v==null?'—':v.toFixed(1)+'%';
  const xx=v=>v==null?'—':v.toFixed(1)+'x';
  const trRows=rows.map((d,i)=>{
    const code=m.click(d[0].replace(/_/g,'-'));
    const sym=String(d[0]).replace(/_/g,'-');
    rememberLogoid(sym, cc==='TR'?'BIST':(cc==='US'?'US':''), d[10]);
    return `<tr style="cursor:pointer" onclick="searchExact('${code}')" title="${safeHTML(d[1]||d[0])} analizini aç">
      <td style="color:var(--muted)">${i+1}</td>
      <td><span class="sym-cell">${logoHtml(d[10], sym, 22, {sym, cc, market:cc==='TR'?'BIST':(cc==='US'?'US':''), ysym:m.click(sym)})}<b>${safeHTML(sym)}</b> <span class="ratio-formula">${safeHTML(d[1]||'')}</span></span></td>
      <td><b>${fmtMcapSym(d[2], m.sym)}</b></td>
      <td>${d[3]==null?'—':m.sym+d[3].toLocaleString('tr-TR',{maximumFractionDigits:2})}</td>
      <td>${xx(d[5])}</td>
      <td>${xx(d[6])}</td>
      <td>${pp(d[7])}</td>
      <td>${pp(d[8])}</td>
      <td>${fmtEmployees(d[9])}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr><th>#</th><th>${t('th_co')}</th><th>${t('th_mcap')}</th><th>${t('th_px')}</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>${t('peer_nm')}</th><th>${t('th_emp')}</th></tr></thead>
    <tbody>${trRows}</tbody></table></div>`;
}

/* ---------- Hisse Tarayıcı (TradingView tarzı · 25 ülke · TÜM birincil hisseler) ----------
   Ülke seçilince TradingView scanner sayfalanarak (range) tüm type=stock + is_primary listesi
   çekilir; cap/oran/arama istemcide uygulanır. Sayfalama UI: 100 satır/sayfa. */
const SCAN_CAP_BANDS={
  US:{mega:[200e9,null], large:[10e9,200e9], mid:[2e9,10e9], small:[300e6,2e9], micro:[0,300e6]},
  TR:{mega:[500e9,null], large:[50e9,500e9], mid:[10e9,50e9], small:[2e9,10e9], micro:[0,2e9]},
  KR:{mega:[100e12,null], large:[10e12,100e12], mid:[1e12,10e12], small:[100e9,1e12], micro:[0,100e9]},
  JP:{mega:[50e12,null], large:[5e12,50e12], mid:[500e9,5e12], small:[50e9,500e9], micro:[0,50e9]},
  CN:{mega:[1e12,null], large:[100e9,1e12], mid:[20e9,100e9], small:[2e9,20e9], micro:[0,2e9]},
  HK:{mega:[1e12,null], large:[100e9,1e12], mid:[20e9,100e9], small:[2e9,20e9], micro:[0,2e9]},
  TW:{mega:[5e12,null], large:[500e9,5e12], mid:[50e9,500e9], small:[5e9,50e9], micro:[0,5e9]},
  CA:{mega:[100e9,null], large:[10e9,100e9], mid:[2e9,10e9], small:[300e6,2e9], micro:[0,300e6]},
  AU:{mega:[100e9,null], large:[10e9,100e9], mid:[2e9,10e9], small:[300e6,2e9], micro:[0,300e6]},
  SG:{mega:[50e9,null], large:[5e9,50e9], mid:[1e9,5e9], small:[200e6,1e9], micro:[0,200e6]},
  GB:{mega:[100e9,null], large:[10e9,100e9], mid:[2e9,10e9], small:[300e6,2e9], micro:[0,300e6]},
  CH:{mega:[100e9,null], large:[10e9,100e9], mid:[2e9,10e9], small:[300e6,2e9], micro:[0,300e6]},
  NORDIC:{mega:[500e9,null], large:[50e9,500e9], mid:[10e9,50e9], small:[2e9,10e9], micro:[0,2e9]},
  PL:{mega:[100e9,null], large:[10e9,100e9], mid:[2e9,10e9], small:[300e6,2e9], micro:[0,300e6]},
  EU:{mega:[100e9,null], large:[10e9,100e9], mid:[2e9,10e9], small:[300e6,2e9], micro:[0,300e6]},
};
const SCAN_PAGE_SIZE=100;
const SCAN_FETCH_SIZE=200;   // TV sayfa boyutu
/* Kolon indeksleri: 0 name … 17 beta, 18 logoid; earn modunda +19 tarih */
const SCAN_COLS=['name','description','market_cap_basic','close','change',
  'price_earnings_ttm','price_book_fq','return_on_equity','net_margin','dividend_yield_recent','sector',
  'SMA50','SMA200','RSI','Perf.3M','Volatility.M','relative_volume_10d_calc','beta_1_year','logoid'];
const SCAN_COLS_EARN=SCAN_COLS.concat(['earnings_release_next_date']);
const SCAN_I={name:0,desc:1,mcap:2,close:3,chg:4,pe:5,pb:6,roe:7,nm:8,div:9,sector:10,
  sma50:11,sma200:12,rsi:13,perf3m:14,vol:15,relvol:16,beta:17,logo:18,earn:19};
const SCAN_TV_SORT={
  'mcap-desc':{sortBy:'market_cap_basic',sortOrder:'desc'},
  'mcap-asc':{sortBy:'market_cap_basic',sortOrder:'asc'},
  'chg-desc':{sortBy:'change',sortOrder:'desc'},
  'name-asc':{sortBy:'name',sortOrder:'asc'},
  'pe-asc':{sortBy:'price_earnings_ttm',sortOrder:'asc'},
  'roe-desc':{sortBy:'return_on_equity',sortOrder:'desc'},
  'div-desc':{sortBy:'dividend_yield_recent',sortOrder:'desc'},
  'rsi-desc':{sortBy:'RSI',sortOrder:'desc'},
  'rsi-asc':{sortBy:'RSI',sortOrder:'asc'},
  'perf3m-desc':{sortBy:'Perf.3M',sortOrder:'desc'},
  'vol-asc':{sortBy:'Volatility.M',sortOrder:'asc'},
  'beta-asc':{sortBy:'beta_1_year',sortOrder:'asc'},
  'earn-asc':{sortBy:'earnings_release_next_date',sortOrder:'asc'},
  'quant-desc':{sortBy:'market_cap_basic',sortOrder:'desc'}, // istemci sıralar
};
function scanCapTable(cc){
  if(cc==='US') return SCAN_CAP_BANDS.US;
  if(cc==='TR') return SCAN_CAP_BANDS.TR;
  if(cc==='KR') return SCAN_CAP_BANDS.KR;
  if(cc==='JP') return SCAN_CAP_BANDS.JP;
  if(cc==='CN') return SCAN_CAP_BANDS.CN;
  if(cc==='HK') return SCAN_CAP_BANDS.HK;
  if(cc==='TW') return SCAN_CAP_BANDS.TW;
  if(cc==='CA') return SCAN_CAP_BANDS.CA;
  if(cc==='AU') return SCAN_CAP_BANDS.AU;
  if(cc==='SG') return SCAN_CAP_BANDS.SG;
  if(cc==='GB') return SCAN_CAP_BANDS.GB;
  if(cc==='CH') return SCAN_CAP_BANDS.CH;
  if(cc==='PL') return SCAN_CAP_BANDS.PL;
  if(['SE','DK','NO'].includes(cc)) return SCAN_CAP_BANDS.NORDIC;
  return SCAN_CAP_BANDS.EU;
}
let SCAN_CC='TR', SCAN_CAPS=new Set(['all']), SCAN_MA=new Set(), SCAN_QF=new Set(), SCAN_GEN=0, SCAN_PAGE_INIT=false;
let SCAN_RAW=[], SCAN_VIEW=[], SCAN_PAGE=0;
let SCAN_MODE='mcap';   // 'mcap' | 'earn' — TV’den hangi sıralamayla çekildiği
const SCAN_CACHE={};   // cc|mode → { rows, ts, total }
/* Value + Momentum + Quality → 0–100 quant skor (Alpha Search tarzı basit kompozit) */
function scanQuantScore(d){
  if(!d) return null;
  let value=50, mom=50, qual=50, n=0;
  const pe=d[SCAN_I.pe], pb=d[SCAN_I.pb], roe=d[SCAN_I.roe], nm=d[SCAN_I.nm];
  const perf=d[SCAN_I.perf3m], rsi=d[SCAN_I.rsi], vol=d[SCAN_I.vol];
  if(pe!=null && pe>0){ value=Math.max(0, Math.min(100, 100 - Math.min(pe,40)/40*100)); n++; }
  else if(pb!=null && pb>0){ value=Math.max(0, Math.min(100, 100 - Math.min(pb,8)/8*100)); n++; }
  if(perf!=null){ mom=Math.max(0, Math.min(100, 50 + perf)); n++; }
  if(rsi!=null){
    // 40–60 ideal; aşırı alım/satım cezası
    const rsiAdj=rsi>=40&&rsi<=60?15:(rsi<=30||rsi>=70?-10:0);
    mom=Math.max(0, Math.min(100, (mom||50)+rsiAdj));
  }
  if(roe!=null){ qual=Math.max(0, Math.min(100, 40 + roe*1.2)); n++; }
  if(nm!=null){ qual=Math.max(0, Math.min(100, (qual+Math.max(0,Math.min(100,40+nm*2)))/2)); }
  if(vol!=null && vol>25) mom=Math.max(0, mom-8); // aşırı oynaklık cezası
  if(!n) return null;
  return Math.round((value+mom+qual)/3);
}
/* BIST YDF önbelleği: sym → { ydf, reserves, paidIn, r2p, ts }. KAP /bist ile doldurulur. */
const SCAN_YDF_CACHE={};
let SCAN_YDF_GEN=0;
function initScanPage(){
  if(SCAN_PAGE_INIT) return;
  SCAN_PAGE_INIT=true;
  document.getElementById('scanCountries').innerHTML=ECON_COUNTRIES.map(([cc])=>
    `<button class="cbox" id="scanbox-${cc}" onclick="selectScanCountry('${cc}')">${flagSpan(cc)}<span>${ccName(cc)}</span></button>`).join('');
  updateScanYdfUi();
  selectScanCountry('TR');
}
function selectScanCountry(cc){
  document.getElementById('scanbox-'+SCAN_CC)?.classList.remove('active');
  SCAN_CC=cc;
  document.getElementById('scanbox-'+cc)?.classList.add('active');
  updateScanYdfUi();
  loadScanMarket(cc);
}
function updateScanYdfUi(){
  const ok=scanYdfMarket();
  const filt=document.getElementById('scanYdfFilter');
  const opt=document.getElementById('scanSortYdf');
  const hint=document.getElementById('scanYdfHint');
  if(filt) filt.style.display=ok?'inline-flex':'none';
  if(opt) opt.style.display=ok?'':'none';
  if(hint) hint.textContent=t('scan_ydf_hint');
  if(!ok){
    SCAN_YDF_GEN++;
    const sortEl=document.getElementById('scanSort');
    if(sortEl && sortEl.value==='ydf-desc') sortEl.value='mcap-desc';
    const ydfMin=document.getElementById('scanYdfMin');
    if(ydfMin) ydfMin.value='';
  }
}
function scanYdfMarket(){ return SCAN_CC==='TR' || SCAN_CC==='US'; }
function setScanCapsVoice(cap){
  const c=['mega','large','mid','small','micro','all'].includes(cap)?cap:'all';
  SCAN_CAPS=new Set([c]);
  document.querySelectorAll('#page-scan .scan-chip[data-cap]').forEach(b=>{
    b.classList.toggle('active', b.dataset.cap===c);
  });
}
function setScanMaVoice(ids){
  const ok=new Set(['sma50','sma200']);
  SCAN_MA=new Set((ids||[]).filter(x=>ok.has(x)));
  document.querySelectorAll('#page-scan .scan-chip[data-ma]').forEach(b=>{
    b.classList.toggle('active', SCAN_MA.has(b.dataset.ma));
  });
}
function setScanQfVoice(ids){
  const ok=new Set(['rsi_os','rsi_ob','mom','value','quality','relvol']);
  SCAN_QF=new Set((ids||[]).filter(x=>ok.has(x)));
  document.querySelectorAll('#page-scan .scan-chip[data-qf]').forEach(b=>{
    b.classList.toggle('active', SCAN_QF.has(b.dataset.qf));
  });
}
function toggleScanCap(btn){
  const cap=btn.dataset.cap;
  if(cap==='all'){
    SCAN_CAPS=new Set(['all']);
    document.querySelectorAll('#page-scan .scan-chip[data-cap]').forEach(b=>b.classList.toggle('active', b.dataset.cap==='all'));
  }else{
    SCAN_CAPS.delete('all');
    document.querySelector('#page-scan .scan-chip[data-cap="all"]')?.classList.remove('active');
    if(SCAN_CAPS.has(cap)){ SCAN_CAPS.delete(cap); btn.classList.remove('active'); }
    else { SCAN_CAPS.add(cap); btn.classList.add('active'); }
    if(!SCAN_CAPS.size){
      SCAN_CAPS.add('all');
      document.querySelector('#page-scan .scan-chip[data-cap="all"]')?.classList.add('active');
    }
  }
  applyScanFilters();
}
function toggleScanMa(btn){
  const ma=btn.dataset.ma;
  if(!ma) return;
  if(SCAN_MA.has(ma)){ SCAN_MA.delete(ma); btn.classList.remove('active'); }
  else { SCAN_MA.add(ma); btn.classList.add('active'); }
  applyScanFilters();
}
function toggleScanQ(btn){
  const q=btn.dataset.qf;
  if(!q) return;
  if(SCAN_QF.has(q)){ SCAN_QF.delete(q); btn.classList.remove('active'); }
  else { SCAN_QF.add(q); btn.classList.add('active'); }
  applyScanFilters();
}
function scanNum(id){
  const el=document.getElementById(id);
  if(!el || el.value==='' || el.value==null) return null;
  const n=Number(el.value);
  return Number.isFinite(n)?n:null;
}
function scanMcapInBands(mcap, cc){
  if(SCAN_CAPS.has('all') || !SCAN_CAPS.size) return true;
  if(mcap==null) return false;
  const bands=scanCapTable(cc);
  for(const k of SCAN_CAPS){
    const b=bands[k]; if(!b) continue;
    const a=b[0]==null?0:b[0], z=b[1]==null?Number.POSITIVE_INFINITY:b[1];
    if(mcap>=a && (z===Number.POSITIVE_INFINITY ? true : mcap<z)) return true;
  }
  return false;
}
async function loadScanMarket(cc){
  const m=TOP100_MARKETS[cc];
  const box=document.getElementById('scanBody');
  const title=document.getElementById('scanTitle');
  const sub=document.getElementById('scanSub');
  if(!m || !box) return;
  const cName=ccName(cc);
  if(title) title.innerHTML=`${flagSpan(cc)}${tf('scan_title_cc',{c:cName})}`;
  const sortVal=(document.getElementById('scanSort')||{}).value||'mcap-desc';
  const mode=sortVal==='earn-asc'?'earn':'mcap';
  SCAN_MODE=mode;
  const cacheKey=cc+'|'+mode;
  const cols=mode==='earn'?SCAN_COLS_EARN:SCAN_COLS;
  const tvSort=SCAN_TV_SORT[sortVal]||SCAN_TV_SORT['mcap-desc'];
  const needLen=cols.length;
  const cached=SCAN_CACHE[cacheKey];
  // RSI dâhil güncel kolonlar yoksa eski önbelleği kullanma
  if(cached && (Date.now()-cached.ts)<10*60000 && cached.rows && cached.rows[0] && cached.rows[0].length>=needLen){
    SCAN_RAW=cached.rows;
    applyScanFilters();
    if(scanYdfMarket()) enrichScanYdf();
    return;
  }
  const myGen=++SCAN_GEN;
  SCAN_RAW=[]; SCAN_VIEW=[]; SCAN_PAGE=0;
  box.innerHTML='<div class="hint">'+t('loading')+'</div>';
  if(sub) sub.textContent=t('loading');
  document.getElementById('scanPager').style.display='none';
  try{
    const filter=[
      {left:'type',operation:'equal',right:'stock'},
      {left:'is_primary',operation:'equal',right:true},
    ];
    if(m.ex) filter.push({left:'exchange',operation:'equal',right:m.ex});
    const all=[];
    let start=0, total=null;
    while(true){
      if(myGen!==SCAN_GEN) return;
      const end=start+SCAN_FETCH_SIZE;
      const r=await fetch('https://scanner.tradingview.com/'+m.scan+'/scan',{method:'POST',body:JSON.stringify({
        columns:cols, filter,
        sort:tvSort,
        range:[start, end]
      })});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json();
      if(myGen!==SCAN_GEN) return;
      if(total==null) total=j.totalCount||0;
      const chunk=(j.data||[]).map(x=>x.d).filter(d=>d&&d[0]);
      all.push(...chunk);
      if(sub) sub.textContent=tf('scan_loading_n',{n:all.length,m:total||'?'});
      box.innerHTML='<div class="hint">'+tf('scan_loading_n',{n:all.length,m:total||'?'})+'</div>';
      if(!chunk.length || all.length>=total || chunk.length<SCAN_FETCH_SIZE) break;
      start=end;
      // güvenlik: aşırı büyük pazarlarda (ABD) yine de tamamını çek — üst sınır yok, TV totalCount kadar
      if(start>20000) break;
    }
    if(myGen!==SCAN_GEN) return;
    SCAN_CACHE[cacheKey]={ rows:all, ts:Date.now(), total:total||all.length };
    SCAN_RAW=all;
    applyScanFilters();
    if(scanYdfMarket()) enrichScanYdf();
  }catch(e){
    if(myGen===SCAN_GEN){
      box.innerHTML='<div class="hint">'+t('list_fail')+'  '+safeHTML(e.message)+'</div>';
      if(sub) sub.textContent='Hata';
    }
  }
}
function onScanSortChange(){
  const sortVal=(document.getElementById('scanSort')||{}).value||'mcap-desc';
  const nextMode=sortVal==='earn-asc'?'earn':'mcap';
  // Kazanç ↔ diğer: TradingView’den yeniden sıralı çek (istemci sıralaması değil)
  if(nextMode!==SCAN_MODE || nextMode==='earn'){
    loadScanMarket(SCAN_CC);
    return;
  }
  renderScanPage();
}
function applyScanFilters(){
  const ydfMin=scanYdfMarket() ? scanNum('scanYdfMin') : null;
  SCAN_VIEW=SCAN_RAW.filter(d=>{
    if(!scanMcapInBands(d[SCAN_I.mcap], SCAN_CC)) return false;
    const close=d[SCAN_I.close], sma50=d[SCAN_I.sma50], sma200=d[SCAN_I.sma200];
    if(SCAN_MA.has('sma50') && (close==null || sma50==null || close<=sma50)) return false;
    if(SCAN_MA.has('sma200') && (close==null || sma200==null || close<=sma200)) return false;
    const rsi=d[SCAN_I.rsi], perf=d[SCAN_I.perf3m], pe=d[SCAN_I.pe], pb=d[SCAN_I.pb];
    const roe=d[SCAN_I.roe], nm=d[SCAN_I.nm], rel=d[SCAN_I.relvol], vol=d[SCAN_I.vol];
    if(SCAN_QF.has('rsi_os') && (rsi==null || rsi>30)) return false;
    if(SCAN_QF.has('rsi_ob') && (rsi==null || rsi<70)) return false;
    if(SCAN_QF.has('mom') && (perf==null || perf<=0)) return false;
    if(SCAN_QF.has('value') && !((pe!=null&&pe>0&&pe<15) || (pb!=null&&pb>0&&pb<1.5))) return false;
    if(SCAN_QF.has('quality') && !((roe!=null&&roe>=15) || (nm!=null&&nm>=10))) return false;
    if(SCAN_QF.has('relvol') && (rel==null || rel<1.5)) return false;
    if(ydfMin!=null){
      const sym=String(d[0]).replace(/_/g,'-');
      const c=SCAN_YDF_CACHE[sym];
      if(!c || c.ydf==null || c.ydf<ydfMin) return false;
    }
    return true;
  });
  SCAN_PAGE=0;
  renderScanPage();
}
function scanYdfOf(d){
  const sym=String(d[0]||'').replace(/_/g,'-');
  const c=SCAN_YDF_CACHE[sym];
  return c && c.ydf!=null ? c.ydf : null;
}
/* KAP’tan son yıllık özkaynak + ödenmiş sermaye (YDF için hafif çağrı). */
async function fetchBistYdfBasics(sym){
  const thisY=new Date().getFullYear();
  const pairs=[[thisY,12],[thisY-1,12],[thisY-2,12],[thisY-3,12]];
  const has=c=>c && c.items.some(it=>[1,2,3,4].some(i=>it['value'+i]!=null && it['value'+i]!==''));
  let group='XI_29';
  let call=await bistCall(sym, group, pairs);
  if(!has(call)){ group='UFRS'; call=await bistCall(sym, group, pairs); }
  if(!has(call)) return null;
  const byCode={};
  bistMerge(byCode, call);
  const equity=bc(byCode,'2O');
  const common=bc(byCode,'2OA');
  const dates=Object.keys(equity||{}).sort().reverse();
  if(!dates.length) return null;
  const d0=dates[0];
  const eq=equity[d0], paid=common[d0];
  if(eq==null || paid==null) return null;
  return { equity:eq, paidIn:paid, reserves:eq-paid, date:d0 };
}
/* SEC’ten son 10-K (yedek: 10-Q) özkaynak + common stock (YDF). */
async function fetchUsYdfBasics(sym){
  const map=window.CIK_MAP||{};
  const raw=map[String(sym).toUpperCase()];
  if(raw==null) return null;
  const cik=String(raw).padStart(10,'0');
  async function load(form){
    const eq=pickInstant(await fetchConceptRaw(cik, CONCEPTS_BALANCE.equity, form));
    let cm=pickInstant(await fetchConceptRaw(cik, CONCEPTS_BALANCE.common, form));
    if(!Object.keys(cm).length)
      cm=pickInstant(await fetchConceptRaw(cik, ['AdditionalPaidInCapital'], form));
    return {eq, cm};
  }
  let {eq, cm}=await load('10-K');
  if(!Object.keys(eq).length) ({eq, cm}=await load('10-Q'));
  const dates=Object.keys(eq).sort().reverse();
  if(!dates.length) return null;
  const d0=dates[0];
  let paid=cm[d0];
  if(paid==null){
    const cds=Object.keys(cm).sort().reverse();
    if(cds.length) paid=cm[cds[0]];
  }
  const equity=eq[d0];
  if(equity==null || paid==null) return null;
  return { equity, paidIn:paid, reserves:equity-paid, date:d0 };
}
async function enrichScanYdf(){
  if(!scanYdfMarket()) return;
  const myGen=++SCAN_YDF_GEN;
  const cc=SCAN_CC;
  const ttl=24*3600000;
  const need=SCAN_RAW.filter(d=>{
    const sym=String(d[0]).replace(/_/g,'-');
    const c=SCAN_YDF_CACHE[sym];
    return !c || (Date.now()-c.ts)>ttl;
  });
  if(!need.length){ renderScanPage(); return; }
  const sub=document.getElementById('scanSub');
  const srcLbl=cc==='TR'?'KAP':'SEC';
  let done=0;
  const conc=cc==='US'?3:5;
  let i=0;
  async function worker(){
    while(i<need.length){
      if(myGen!==SCAN_YDF_GEN || SCAN_CC!==cc) return;
      const d=need[i++];
      const sym=String(d[0]).replace(/_/g,'-');
      try{
        const snap=cc==='TR' ? await fetchBistYdfBasics(sym) : await fetchUsYdfBasics(sym);
        const mcap=d[SCAN_I.mcap];
        if(snap && mcap!=null && mcap>0){
          SCAN_YDF_CACHE[sym]={
            ydf:snap.reserves/mcap,
            reserves:snap.reserves,
            paidIn:snap.paidIn,
            r2p:snap.paidIn>0 ? snap.reserves/snap.paidIn : null,
            ts:Date.now()
          };
        }else{
          SCAN_YDF_CACHE[sym]={ ydf:null, ts:Date.now() };
        }
      }catch(_e){
        SCAN_YDF_CACHE[sym]={ ydf:null, ts:Date.now() };
      }
      done++;
      if(done%15===0 || done===need.length){
        if(sub) sub.innerHTML=`YDF (${srcLbl}) yükleniyor… <b>${done}</b> / ${need.length}` +
          (scanNum('scanYdfMin')!=null?' · filtre aktif':'');
        if(scanNum('scanYdfMin')!=null || (document.getElementById('scanSort')||{}).value==='ydf-desc')
          applyScanFilters();
        else renderScanPage();
      }
    }
  }
  await Promise.all(Array.from({length:conc}, ()=>worker()));
  if(myGen===SCAN_YDF_GEN && SCAN_CC===cc) applyScanFilters();
}
function scanSortedView(){
  const q=((document.getElementById('scanSearch')||{}).value||'').trim().toLowerCase();
  let rows=SCAN_VIEW;
  if(q) rows=rows.filter(d=>
    String(d[SCAN_I.name]||'').toLowerCase().includes(q) ||
    String(d[SCAN_I.desc]||'').toLowerCase().includes(q) ||
    String(d[SCAN_I.sector]||'').toLowerCase().includes(q));
  // Yaklaşan kazanç: sıra TradingView’den geldi — istemcide yeniden sıralama
  if(SCAN_MODE==='earn') return rows.slice();
  const sort=(document.getElementById('scanSort')||{}).value||'mcap-desc';
  const [key,dir]=sort.split('-');
  const mul=dir==='asc'?1:-1;
  if(key==='quant'){
    return rows.slice().sort((a,b)=>{
      const va=scanQuantScore(a), vb=scanQuantScore(b);
      if(va==null && vb==null) return 0;
      if(va==null) return 1;
      if(vb==null) return -1;
      return mul*(va-vb);
    });
  }
  if(key==='ydf'){
    return rows.slice().sort((a,b)=>{
      const va=scanYdfOf(a), vb=scanYdfOf(b);
      if(va==null && vb==null) return 0;
      if(va==null) return 1;
      if(vb==null) return -1;
      return mul*(va-vb);
    });
  }
  const idx={mcap:SCAN_I.mcap,chg:SCAN_I.chg,name:SCAN_I.name,pe:SCAN_I.pe,roe:SCAN_I.roe,
    div:SCAN_I.div,rsi:SCAN_I.rsi,perf3m:SCAN_I.perf3m,vol:SCAN_I.vol,beta:SCAN_I.beta}[key]??SCAN_I.mcap;
  return rows.slice().sort((a,b)=>{
    let va=a[idx], vb=b[idx];
    if(key==='name'){
      va=String(va||''); vb=String(vb||'');
      return mul*va.localeCompare(vb,'tr');
    }
    if(va==null && vb==null) return 0;
    if(va==null) return 1;
    if(vb==null) return -1;
    return mul*(va-vb);
  });
}
function scanChangePage(delta){
  const sorted=scanSortedView();
  const pages=Math.max(1, Math.ceil(sorted.length/SCAN_PAGE_SIZE));
  SCAN_PAGE=Math.max(0, Math.min(pages-1, SCAN_PAGE+delta));
  renderScanPage();
}
function renderScanPage(){
  const cc=SCAN_CC;
  const m=TOP100_MARKETS[cc];
  const box=document.getElementById('scanBody');
  const sub=document.getElementById('scanSub');
  const pager=document.getElementById('scanPager');
  if(!m || !box) return;
  const sorted=scanSortedView();
  const pages=Math.max(1, Math.ceil(sorted.length/SCAN_PAGE_SIZE)||1);
  if(SCAN_PAGE>=pages) SCAN_PAGE=pages-1;
  const slice=sorted.slice(SCAN_PAGE*SCAN_PAGE_SIZE, (SCAN_PAGE+1)*SCAN_PAGE_SIZE);
  if(sub){
    const capNote=SCAN_CAPS.has('all')?t('scan_caps_all'):[...SCAN_CAPS].join('+');
    const maNote=SCAN_MA.size?[...SCAN_MA].map(x=>x==='sma50'?'>SMA50':'>SMA200').join(' · '):t('scan_trend_none');
    const qNote=SCAN_QF.size?[...SCAN_QF].join('+'):t('scan_quant_none');
    const ydfMin=scanYdfMarket()?scanNum('scanYdfMin'):null;
    const ydfNote=scanYdfMarket()
      ? (ydfMin!=null?` · YDF ≥ ${ydfMin}`:' · YDF')
      : '';
    sub.innerHTML=tf('scan_sub_fmt',{n:sorted.length+' / '+SCAN_RAW.length, p:(SCAN_PAGE+1)+'/'+pages})+' · '+capNote+' · '+maNote+' · '+qNote+ydfNote;
  }
  if(!sorted.length){
    box.innerHTML='<div class="hint">'+t('scan_no_match')+'</div>';
    if(pager) pager.style.display='none';
    return;
  }
  // TV: ROE/net_margin yüzde puan; dividend_yield_recent kesir; change yüzde puan
  const pp=v=>v==null?'—':v.toFixed(1)+'%';
  const dy=v=>v==null?'—':(v*100).toFixed(1)+'%';
  const xx=v=>v==null?'—':v.toFixed(1)+'x';
  const ydfFmt=v=>{
    if(v==null) return '—';
    const cls=v>=0.8?'up':(v>=0.4?'neutral':'down');
    return `<span class="${cls}">${v.toFixed(2)}</span>`;
  };
  const chg=v=>{
    if(v==null) return '—';
    const cls=v>0?'up':(v<0?'down':'neutral');
    return `<span class="${cls}">${(v>0?'+':'')+v.toFixed(2)}%</span>`;
  };
  const rsi=v=>{
    if(v==null) return '—';
    const cls=v>=70?'down':(v<=30?'up':'neutral');
    return `<span class="${cls}">${Number(v).toFixed(1)}</span>`;
  };
  const qCell=v=>{
    if(v==null) return '—';
    const cls=v>=70?'up':v>=50?'neutral':'down';
    return `<span class="${cls}"><b>${v}</b></span>`;
  };
  const showEarn=SCAN_MODE==='earn';
  const showYdf=scanYdfMarket();
  const earnCell=ts=>{
    if(ts==null || !Number.isFinite(ts)) return '—';
    return new Date(ts*1000).toLocaleDateString(localeTag(),{day:'2-digit',month:'short',year:'numeric'});
  };
  const trRows=slice.map((d,i)=>{
    const code=m.click(String(d[0]).replace(/_/g,'-'));
    const n=SCAN_PAGE*SCAN_PAGE_SIZE+i+1;
    const qs=scanQuantScore(d);
    const sym=String(d[0]).replace(/_/g,'-');
    rememberLogoid(sym, SCAN_CC==='TR'?'BIST':(SCAN_CC==='US'?'US':''), d[SCAN_I.logo]);
    return `<tr style="cursor:pointer" onclick="searchExact('${code}')" title="${safeHTML(d[1]||d[0])} — ${t('open_analysis')}">
      <td style="color:var(--muted)">${n}</td>
      <td><span class="sym-cell">${logoHtml(d[SCAN_I.logo], sym, 22, {sym, cc:SCAN_CC, market:SCAN_CC==='TR'?'BIST':(SCAN_CC==='US'?'US':''), ysym:m.click(sym)})}<b>${safeHTML(sym)}</b></span></td>
      <td><span class="ratio-formula">${safeHTML(d[1]||'')}</span></td>
      <td><b>${fmtMcapSym(d[SCAN_I.mcap], m.sym)}</b></td>
      <td>${d[SCAN_I.close]==null?'—':m.sym+Number(d[SCAN_I.close]).toLocaleString(localeTag(),{maximumFractionDigits:2})}</td>
      <td>${chg(d[SCAN_I.chg])}</td>
      ${showEarn?`<td style="white-space:nowrap">${earnCell(d[SCAN_I.earn])}</td>`:''}
      ${showYdf?`<td>${ydfFmt(scanYdfOf(d))}</td>`:''}
      <td>${qCell(qs)}</td>
      <td>${rsi(d[SCAN_I.rsi])}</td>
      <td>${chg(d[SCAN_I.perf3m])}</td>
      <td>${d[SCAN_I.vol]==null?'—':Number(d[SCAN_I.vol]).toFixed(1)+'%'}</td>
      <td>${xx(d[SCAN_I.pe])}</td>
      <td>${xx(d[SCAN_I.pb])}</td>
      <td>${pp(d[SCAN_I.roe])}</td>
      <td>${dy(d[SCAN_I.div])}</td>
      <td style="color:var(--muted);font-size:12px">${safeHTML(d[SCAN_I.sector]||'—')}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr>
    <th>#</th><th>${t('th_code')}</th><th>${t('th_co')}</th><th>${t('th_mcap')}</th><th>${t('th_px')}</th><th>${t('th_day')}</th>
    ${showEarn?'<th>'+t('th_earn_date')+'</th>':''}
    ${showYdf?'<th>YDF</th>':''}
    <th>Q</th><th>RSI</th><th>3A</th><th>Vol</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>${t('th_div')}</th><th>${t('th_sector')}</th>
  </tr></thead><tbody>${trRows}</tbody></table></div>`;
  if(pager){
    pager.style.display='flex';
    document.getElementById('scanPageInfo').textContent=tf('scan_page_info',{p:SCAN_PAGE+1, pages, n:slice.length});
    document.getElementById('scanPrev').disabled=SCAN_PAGE<=0;
    document.getElementById('scanNext').disabled=SCAN_PAGE>=pages-1;
  }
}

/* ---------- Sektör Devleri sayfası (companiesmarketcap.com kategori sıralaması karşılığı) ----------
   Üstte ülke seçici (🌍 dünya + 25 ülke, radyo mantığı), solda 20 sektör kutusu (aç/kapa).
   Veri: TradingView scanner — ülke seçiliyse o ülkenin scan bölgesi (İlk 100 ile aynı harita),
   🌍'de 'global' scan (piyasa değerleri TV tarafından USD'ye normalize edilir, sıralama doğru —
   curl ile doğrulandı: Toyota/Tencent/Nintendo USD değerle döner). Sektörler TV'nin FactSet
   endüstri adlarıyla eşlenir (in_range filtresi); Video Oyunu ve Yapay Zeka TV'de ayrı endüstri
   OLMADIĞINDAN (oyun şirketleri "Packaged Software" içinde) companiesmarketcap'in yaptığı gibi
   KÜRATÖRLÜ ticker listesiyle gelir (canlı değerler yine TV'den, istemcide sıralanır). */
const SECT_SECTORS=[
  ['oto',        '🚗','Otomobil Üreticileri', {ind:['Motor Vehicles']}],
  ['havayolu',   '✈️','Hava Yolları',         {ind:['Airlines']}],
  ['banka',      '🏦','Bankalar',             {ind:['Major Banks','Regional Banks','Savings Banks']}],
  ['ilac',       '💊','İlaçlar',              {ind:['Pharmaceuticals: Major','Pharmaceuticals: Other','Pharmaceuticals: Generic']}],
  ['eticaret',   '🛒','E-Ticaret',            {ind:['Internet Retail']}],
  ['saglik',     '🏥','Sağlık Hizmetleri',    {ind:['Managed Health Care','Hospital/Nursing Management','Medical/Nursing Services','Services to the Health Industry','Medical Distributors']}],
  ['medya',      '📰','Medya & Basın',        {ind:['Media Conglomerates','Broadcasting','Cable/Satellite TV','Movies/Entertainment','Publishing: Newspapers','Publishing: Books/Magazines']}],
  ['sigorta',    '🛡️','Sigorta',              {ind:['Multi-Line Insurance','Property/Casualty Insurance','Life/Health Insurance','Insurance Brokers/Services','Specialty Insurance']}],
  ['yazilim',    '💻','Yazılım',              {ind:['Packaged Software','Internet Software/Services','Information Technology Services']}],
  ['yemek',      '🍔','Yemek & İçecek',       {ind:['Food: Major Diversified','Food: Specialty/Candy','Food: Meat/Fish/Dairy','Restaurants','Beverages: Non-Alcoholic','Beverages: Alcoholic','Food Retail','Agricultural Commodities/Milling']}],
  ['yariiletken','🔌','Yarı İletkenler',      {ind:['Semiconductors','Electronic Production Equipment']}],
  ['finans',     '💳','Finansal Hizmetler',   {ind:['Financial Conglomerates','Finance/Rental/Leasing','Investment Banks/Brokers']}],
  ['petrol',     '🛢️','Petrol & Doğalgaz',    {ind:['Integrated Oil','Oil & Gas Production','Oil Refining/Marketing','Oilfield Services/Equipment','Oil & Gas Pipelines','Contract Drilling']}],
  ['yatirim',    '📈','Yatırım',              {ind:['Investment Managers','Investment Trusts/Mutual Funds','Investment Banks/Brokers']}],
  ['telekom',    '📡','Telekomünikasyon',     {ind:['Major Telecommunications','Specialty Telecommunications','Wireless Telecommunications']}],
  ['perakende',  '🏬','Perakende',            {ind:['Specialty Stores','Department Stores','Discount Stores','Apparel/Footwear Retail','Electronics/Appliance Stores','Home Improvement Chains','Food Retail','Drugstore Chains','Catalog/Specialty Distribution','Internet Retail']}],
  ['internet',   '🌐','İnternet',             {ind:['Internet Software/Services','Internet Retail']}],
  ['oyun',       '🎮','Video Oyunu',          {curated:'GAMES'}],
  ['teknoloji',  '🖥️','Teknoloji',            {sec:['Technology Services','Electronic Technology']}],
  ['ai',         '🤖','Yapay Zeka',           {curated:'AI'}],
];
/* Küratörlü listeler: [TV kodu, ülke]. Ülkesi 25'lik listede olmayanlar
   yalnız 🌍 görünümünde çıkar. Değerler canlı çekilir, piyasa değerine göre istemcide sıralanır. */
const SECT_CURATED={
  GAMES:[
    ['HKEX:700','CN'],['TSE:7974','JP'],['NYSE:SE','SG'],['NASDAQ:EA','US'],['NASDAQ:TTWO','US'],
    ['NYSE:RBLX','US'],['HKEX:9999','CN'],['TSE:7832','JP'],['TSE:9684','JP'],['TSE:9697','JP'],
    ['TSE:9766','JP'],['TSE:3659','JP'],['TSE:6460','JP'],['KRX:259960','KR'],['KRX:036570','KR'],
    ['KRX:251270','KR'],['EURONEXT:UBI','FR'],['GPW:CDR','PL'],['OMXSTO:EMBRAC_B','SE'],
    ['NASDAQ:PLTK','US'],['NYSE:U','US'],['LSE:TM17','GB'],['LSE:FDEV','GB'],['NYSE:GRVY','KR'],
  ],
  AI:[
    ['NASDAQ:NVDA','US'],['NASDAQ:MSFT','US'],['NASDAQ:GOOG','US'],['NASDAQ:META','US'],
    ['TWSE:2330','TW'],['NASDAQ:AVGO','US'],['KRX:005930','KR'],['NYSE:ORCL','US'],
    ['NASDAQ:AMD','US'],['NASDAQ:PLTR','US'],['NYSE:CRM','US'],['NYSE:IBM','US'],
    ['XETR:SAP','DE'],['NASDAQ:MU','US'],['KRX:000660','KR'],['NASDAQ:ARM','US'],
    ['NASDAQ:SMCI','US'],['NYSE:SNOW','US'],['NYSE:PATH','US'],['NYSE:AI','US'],
    ['NASDAQ:SOUN','US'],['NASDAQ:TEM','US'],['NASDAQ:BBAI','US'],['NASDAQ:RXRX','US'],
  ],
};
/* TV borsa öneki → uygulamanın arama eki (satır tıklaması için). Haritada olmayan borsalar
   uygulamada analiz desteklenmediğinden tıklanamaz bırakılır.
   EURONEXT önekinden ülke eki türetilemez (FR/NL/BE/PT ortak) → yalın kod gönderilir,
   mevcut otomatik borsa tespiti doğru eki kendisi çözer. */
const TV_EX2CODE={
  NASDAQ:c=>c+'.US', NYSE:c=>c+'.US', AMEX:c=>c+'.US', BIST:c=>c+'.IS', KRX:c=>c,
  TSE:c=>c+'.T', HKEX:c=>c+'.HK', SSE:c=>c+'.SS', SZSE:c=>c+'.SZ',
  TWSE:c=>c+'.TW', TPEX:c=>c+'.TWO', TSX:c=>c+'.TO', TSXV:c=>c+'.V', ASX:c=>c+'.AX',
  SGX:c=>c+'.SI',
  LSE:c=>c+'.L', XETR:c=>c+'.DE', MIL:c=>c+'.MI', BME:c=>c+'.MC', SIX:c=>c+'.SW',
  OMXSTO:c=>c+'.ST', OMXCOP:c=>c+'.CO', OSL:c=>c+'.OL', OMXHEX:c=>c+'.HE',
  VIE:c=>c+'.VI', GPW:c=>c+'.WA', EURONEXT:c=>c,
};
let SECT_CC='GLOBAL', SECT_OPEN=null, SECT_GEN=0, SECT_PAGE_INIT=false;
const SECT_CACHE={};   // "sektör:cc" → { rows, ts } (10 dk)
function initSectPage(){
  if(SECT_PAGE_INIT) return;
  SECT_PAGE_INIT=true;
  document.getElementById('sectCountries').innerHTML=
    `<button class="cbox" id="sbox-GLOBAL" onclick="selectSectCountry('GLOBAL')"><span class="cfl" style="font-size:17px;line-height:1">🌍</span><span>${t('cc_GLOBAL')}</span></button>`+
    ECON_COUNTRIES.map(([cc])=>
      `<button class="cbox" id="sbox-${cc}" onclick="selectSectCountry('${cc}')">${flagSpan(cc)}<span>${ccName(cc)}</span></button>`).join('');
  document.getElementById('sectSectors').innerHTML=SECT_SECTORS.map(([id,ic])=>
    `<button class="cbox" id="secbox-${id}" onclick="toggleSectSector('${id}')"><span class="cfl" style="font-size:16px;line-height:1">${ic}</span><span>${t('sect_'+id)}</span></button>`).join('');
  document.getElementById('sbox-GLOBAL')?.classList.add('active');
  toggleSectSector('yazilim');   // ilk açılış örneği: dünya yazılım devleri
}
function selectSectCountry(cc){
  if(SECT_CC===cc) return;
  document.getElementById('sbox-'+SECT_CC)?.classList.remove('active');
  SECT_CC=cc;
  document.getElementById('sbox-'+cc)?.classList.add('active');
  if(SECT_OPEN) loadSectPanel();   // açık sektör varsa yeni ülkeyle yeniden yükle
}
function toggleSectSector(id){
  const prev=SECT_OPEN;
  if(prev){
    SECT_OPEN=null; SECT_GEN++;
    document.getElementById('spanel')?.remove();
    document.getElementById('secbox-'+prev)?.classList.remove('active');
  }
  if(prev!==id){
    SECT_OPEN=id;
    document.getElementById('secbox-'+id)?.classList.add('active');
    loadSectPanel();
  }
  const hint=document.getElementById('sectEmptyHint');
  if(hint) hint.style.display=SECT_OPEN?'none':'';
}
async function loadSectPanel(){
  const id=SECT_OPEN;
  const def=SECT_SECTORS.find(s=>s[0]===id);
  if(!def) return;
  const cc=SECT_CC;
  // Paneli (yeniden) kur
  document.getElementById('spanel')?.remove();
  const cName = ccName(cc==='GLOBAL'?'GLOBAL':cc);
  const cIcon = cc==='GLOBAL' ? '<span class="cfl" style="font-size:17px;line-height:1">🌍</span>' : flagSpan(cc);
  const el=document.createElement('div');
  el.className='card'; el.id='spanel';
  el.innerHTML=`<h2 style="display:flex;align-items:center;gap:9px">${cIcon}${cName} — ${def[1]} ${t('sect_'+id)}${t('sect_panel_suffix')}</h2>
    <div class="sub">${t('sect_panel_sub')}${cc==='GLOBAL'?', USD':''}. <b>${t('sect_click')}</b>${def[3].curated?' '+t('sect_curated'):''}</div>
    <div id="sectBody"><div class="hint">${t('loading')}</div></div>`;
  document.getElementById('sectPanel').appendChild(el);
  const key=id+':'+cc;
  const cached=SECT_CACHE[key];
  if(cached && (Date.now()-cached.ts)<10*60000){ renderSectPanel(def, cc, cached.rows); return; }
  const myGen=++SECT_GEN;
  try{
    const cols=['name','description','market_cap_basic','close','currency',
      'price_earnings_ttm','price_book_fq','return_on_equity','net_margin','number_of_employees','logoid'];
    let rows;
    if(def[3].curated){
      let list=SECT_CURATED[def[3].curated];
      if(cc!=='GLOBAL') list=list.filter(([,c])=>c===cc);
      if(!list.length){ if(SECT_OPEN===id) document.getElementById('sectBody').innerHTML='<div class="hint">'+t('sect_empty_cc')+'</div>'; return; }
      const r=await fetch('https://scanner.tradingview.com/global/scan',{method:'POST',body:JSON.stringify({
        symbols:{tickers:list.map(([t])=>t)}, columns:cols })});
      const j=r.ok?await r.json():null;
      if(myGen!==SECT_GEN || SECT_OPEN!==id) return;
      rows=(j&&j.data||[]).filter(x=>x.d&&x.d[2]!=null).sort((a,b)=>b.d[2]-a.d[2]);
    }else{
      const scan = cc==='GLOBAL' ? 'global' : TOP100_MARKETS[cc].scan;
      const filter=[{left:'is_primary',operation:'equal',right:true}];
      if(cc!=='GLOBAL' && TOP100_MARKETS[cc].ex) filter.push({left:'exchange',operation:'equal',right:TOP100_MARKETS[cc].ex});
      filter.push(def[3].sec
        ? {left:'sector',  operation:'in_range', right:def[3].sec}
        : {left:'industry',operation:'in_range', right:def[3].ind});
      const r=await fetch('https://scanner.tradingview.com/'+scan+'/scan',{method:'POST',body:JSON.stringify({
        columns:cols, filter, sort:{sortBy:'market_cap_basic',sortOrder:'desc'}, range:[0,50] })});
      const j=r.ok?await r.json():null;
      if(myGen!==SECT_GEN || SECT_OPEN!==id) return;
      rows=(j&&j.data||[]);
      // Küresel listede aynı şirketin çift hisse sınıfı (GOOG/GOOGL) art arda çıkar — ada göre teke indir
      const seen=new Set();
      rows=rows.filter(x=>{ const dsc=x.d&&x.d[1]&&x.d[1].replace(/ Class [A-C].*$/,''); if(!dsc||seen.has(dsc)) return false; seen.add(dsc); return true; });
    }
    if(!rows.length){ document.getElementById('sectBody').innerHTML='<div class="hint">'+t('sect_empty_cc')+'</div>'; return; }
    SECT_CACHE[key]={ rows, ts:Date.now() };
    renderSectPanel(def, cc, rows);
  }catch(e){
    if(SECT_OPEN===id) document.getElementById('sectBody').innerHTML='<div class="hint">'+t('list_fail')+'  '+e.message+'</div>';
  }
}
function renderSectPanel(def, cc, rows){
  const box=document.getElementById('sectBody');
  if(!box) return;
  const mSym = cc==='GLOBAL' ? '$' : TOP100_MARKETS[cc].sym;
  const pp=v=>v==null?'—':v.toFixed(1)+'%';
  const xx=v=>v==null?'—':v.toFixed(1)+'x';
  const trRows=rows.slice(0,50).map((x,i)=>{
    const d=x.d;
    const [ex,rawCode]=x.s.split(':');
    const base=(rawCode||d[0]).replace(/_/g,'-');
    const codeFn=TV_EX2CODE[ex];
    const ysymLogo=codeFn?codeFn(base):base;
    const click=codeFn?` style="cursor:pointer" onclick="searchExact('${codeFn(base)}')" title="${safeHTML(d[1]||d[0])} analizini aç"`:' title="Bu borsa uygulamada analiz için desteklenmiyor"';
    const price=d[3]==null?'—':(cc==='GLOBAL'
      ? d[3].toLocaleString('tr-TR',{maximumFractionDigits:2})+' '+safeHTML(d[4]||'')
      : mSym+d[3].toLocaleString('tr-TR',{maximumFractionDigits:2}));
    return `<tr${click}>
      <td style="color:var(--muted)">${i+1}</td>
      <td><span class="sym-cell">${logoHtml(d[10], base, 22, {sym:base, cc:cc==='GLOBAL'?null:cc, market:cc==='TR'?'BIST':(cc==='US'?'US':''), ysym:ysymLogo})}<b>${safeHTML(base)}</b> <span class="ratio-formula">${safeHTML(d[1]||'')}</span></span></td>
      <td><b>${fmtMcapSym(d[2], cc==='GLOBAL'?'$':mSym)}</b></td>
      <td>${price}</td>
      <td>${xx(d[5])}</td>
      <td>${xx(d[6])}</td>
      <td>${pp(d[7])}</td>
      <td>${pp(d[8])}</td>
      <td>${fmtEmployees(d[9])}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr><th>#</th><th>${t('th_co')}</th><th>${t('th_mcap')}</th><th>${t('th_px')}</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>${t('peer_nm')}</th><th>${t('th_emp')}</th></tr></thead>
    <tbody>${trRows}</tbody></table></div>
    ${cc==='GLOBAL'?'<div class="hint" style="margin-top:8px">Dünya görünümünde piyasa değerleri USD\'ye çevrilmiştir; fiyatlar şirketin kendi para birimindedir.</div>':''}`;
}

/* ---------- KAP Bildirimleri (yalnızca BIST) ----------
   Kaynak: Fintables topic-feed API'si (CORS *, tarayıcıdan çağrılır — CF gerçek tarayıcıyı
   geçirir). Akıştaki type==='news' öğeleri KAP bildirimleridir; kap_id ile resmi KAP
   bildirim sayfasına (kap.org.tr/tr/Bildirim/{id}) link kurulur. KAP'ın kendi API'si
   bot korumalı olduğundan doğrudan kullanılamıyor. */
async function fetchKapFeed(sym, myGen){
  const card=document.getElementById('kapCard'), box=document.getElementById('kapBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">KAP bildirimleri yükleniyor…</div>';
  try{
    let url='https://api.fintables.com/topic-feed/?symbols='+encodeURIComponent(sym)+'&for_everyone=1&only_pro=0';
    const news=[];
    for(let p=0; p<3 && url && news.length<10; p++){   // akışta bültenler de var → yeterli
      const r=await fetch(url);                         // bildirim toplanana dek en çok 3 sayfa
      if(!r.ok) break;
      const j=await r.json();
      (j.results||[]).forEach(it=>{ if(it.type==='news' && it.news) news.push(it.news); });
      url=j.next||null;
    }
    if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
    if(!news.length){ box.innerHTML='<div class="hint">Bu şirket için yakın tarihli KAP bildirimi bulunamadı.</div>'; return; }
    box.innerHTML=news.slice(0,10).map(n=>{
      const d=n.published_at?new Date(n.published_at):null;
      const meta=[n.subject||'', (d&&!isNaN(d))?relTime(d):''].filter(Boolean).join(' · ');
      const kapLink=n.kap_id?('https://www.kap.org.tr/tr/Bildirim/'+n.kap_id):(n.embed_url||'#');
      const detay=[n.title, n.note_title, n.note].filter(Boolean).map(safeHTML).join('<br>');
      return `<div class="news" onclick="toggleNews(this)">
        <div class="news-t"><span class="chev">▶</span><span>${safeHTML(n.summary||n.subject||'KAP bildirimi')}</span></div>
        <div class="news-m">${safeHTML(meta)}</div>
        <div class="news-sum">${detay||safeHTML(n.subject||'')}<br>
          <a href="${kapLink}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${t('kap_read')}</a></div>
      </div>`;
    }).join('');
  }catch(e){ box.innerHTML='<div class="hint">'+t('kap_none')+': '+e.message+'</div>'; }
}

/* ---------- BIST analist hedef fiyatları ----------
   BİRİNCİL: Fintables analyst-ratings API'si (kurum bazlı: Şeker/İş/Garanti/Ziraat Yatırım…
   hedef + tavsiye + tarih). CORS açık (*); Cloudflare GERÇEK tarayıcı isteklerini geçirir,
   sunucu/veri merkezi isteklerini engeller → çağrı bilerek İSTEMCİDE yapılır.
   YEDEK: TradingView scanner konsensüsü (Content-Type başlıksız POST = preflight'sız;
   o da olmazsa sunucudaki /tvt köprüsü). */
const TVT_COLS=['price_target_average','price_target_high','price_target_low','recommendation_total',
  'recommendation_buy','recommendation_over','recommendation_hold','recommendation_under','recommendation_sell',
  'recommendation_mark','close'];
/* TradingView analist skoru: 1=Al … 3=Sat (Finviz'in 1-5 skalasından farklı) */
function tvMarkLabel(m){
  if(m==null || isNaN(m)) return null;
  if(m<=1.3) return [t('tgt_strong_buy'),'g-buy'];
  if(m<=1.7) return [t('tgt_buy'),'g-buy'];
  if(m<=2.3) return [t('tgt_hold'),'g-hold'];
  if(m<=2.7) return [t('tgt_sell'),'g-sell'];
  return [t('tgt_strong_sell'),'g-sell'];
}
/* Fintables tavsiye tipi → rozet (skor: 1=olumlu, 2=nötr, 3=olumsuz — konsensüs için) */
function ftType(k){
  const map={ al:['tgt_buy','g-buy',1], endeks_ustu:['tgt_over','g-buy',1], guclu_al:['tgt_strong_buy','g-buy',1],
    tut:['tgt_hold','g-hold',2], endekse_paralel:['tgt_market','g-hold',2], notr:['tgt_neutral','g-hold',2],
    sat:['tgt_sell','g-sell',3], endeks_alti:['tgt_under','g-sell',3] };
  const m=map[k]; return m?[t(m[0]),m[1],m[2]]:null;
}
async function fetchTargetsBIST(sym, myGen){
  const card=document.getElementById('targetCard'), box=document.getElementById('targetBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">'+t('tgt_loading')+'</div>';
  try{
    // 1) BİRİNCİL KAYNAK: Fintables (kurum bazlı!) — tarayıcıdan doğrudan (CORS: *).
    //    Gerçek tarayıcı istekleri Cloudflare'dan geçiyor; sunucu/veri merkezi istekleri geçmez,
    //    o yüzden bu çağrı bilerek İSTEMCİDE yapılır. Cari fiyat paralel alınır.
    let ratings=null, cur=null;
    const [ftR, pR]=await Promise.all([
      fetch('https://api.fintables.com/analyst-ratings/?code='+encodeURIComponent(sym))
        .then(r=>r.ok?r.json():null).catch(()=>null),
      fetch('/price?s='+encodeURIComponent(sym+'.IS')+'&range=1d').then(r=>r.json()).catch(()=>null)
    ]);
    if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
    const meta=pR&&pR.chart&&pR.chart.result&&pR.chart.result[0]&&pR.chart.result[0].meta;
    cur=meta?meta.regularMarketPrice:null;
    if(ftR && Array.isArray(ftR.results)) ratings=ftR.results;

    let html='';
    if(ratings && ratings.length){
      // Son 12 ayın notları; kurum başına en güncel kayıt (liste zaten kurum başına tekil geliyor)
      const cutoff=Date.now()-365*86400000;
      const rows=ratings
        .map(r=>({ firm:(r.brokerage&&(r.brokerage.title||r.brokerage.short_title))||'—',
                   tgt:(typeof r.price_target==='number')?r.price_target:null,
                   type:r.type||null, d:new Date(r.published_at) }))
        .filter(r=> !isNaN(r.d) && r.d.getTime()>=cutoff)
        .sort((a,b)=>b.d-a.d);
      // Konsensüs bu listeden hesaplanır (en güncel kurum hedeflerinin ort/en yüksek/en düşük)
      const tgts=rows.map(r=>r.tgt).filter(v=>v!=null);
      const mean=tgts.length?tgts.reduce((a,b)=>a+b,0)/tgts.length:null;
      const hi=tgts.length?Math.max(...tgts):null, lo=tgts.length?Math.min(...tgts):null;
      const scores=rows.map(r=>ftType(r.type)&&ftType(r.type)[2]).filter(Boolean);
      const rl=scores.length?tvMarkLabel(scores.reduce((a,b)=>a+b,0)/scores.length):null;
      const up=(cur&&mean)?(mean-cur)/cur*100:null;
      const upCls=up==null?'neutral':(up>0?'up':'down');
      html+=`<div class="tgt-grid">
        <div class="tgt-box"><div class="lbl">${t('tgt_mean')}</div>
          <div class="big">${fmtUSD(mean)}</div>
          ${up!=null?`<div class="sm ${upCls}">${up>0?'▲':'▼'} ${pct(up)} <span class="neutral">${t('tgt_pot')}</span></div>`:''}
          ${cur!=null?`<div class="sm neutral">${t('cur_price')}: ${fmtUSD(cur)}</div>`:''}</div>
        <div class="tgt-box"><div class="lbl">${t('tgt_hi_lo')}</div>
          <div class="big" style="font-size:19px">${fmtUSD(hi)} <span class="neutral" style="font-size:14px">/ ${fmtUSD(lo)}</span></div>
          <div class="sm neutral">${t('tgt_range')}</div></div>
        <div class="tgt-box"><div class="lbl">${t('tgt_consensus')}</div>
          <div class="big">${rl?`<span class="grade ${rl[1]}">${rl[0]}</span>`:'—'}</div>
          <div class="sm neutral">${tf('tgt_firms_n',{n:rows.length})}</div></div>
      </div>`;
      // Kurum bazlı tablo — ABD tarafındaki tabloyla aynı düzen
      const trRows=rows.slice(0,20).map(r=>{
        const badge=ftType(r.type)||['—','g-hold'];
        const ds=r.d.toLocaleDateString(localeTag(),{day:'2-digit',month:'short',year:'numeric'});
        return `<tr><td>${safeHTML(r.firm)}</td>
          <td><span class="grade ${badge[1]}">${badge[0]}</span></td>
          <td>${r.tgt!=null?fmtUSD(r.tgt):'—'}</td>
          <td>${ds}</td></tr>`;
      }).join('');
      html+=`<div style="margin-top:18px;font-weight:700;color:var(--ink)">${t('tgt_by_firm')}</div>
        <table style="margin-top:8px"><thead><tr><th>${t('tgt_broker')}</th><th>${t('tgt_rec')}</th><th>${t('tgt_price')}</th><th>${t('th_date')}</th></tr></thead><tbody>${trRows}</tbody></table>
        <div class="hint" style="margin-top:10px">${t('tgt_src_ft')}</div>`;
      box.innerHTML=html;
      return;
    }

    // 2) YEDEK: Fintables boş/erişilemezse TradingView/Refinitiv konsensüsü (kurum adları olmadan)
    let d=null;
    try{
      const r=await fetch('https://scanner.tradingview.com/turkey/scan',
        {method:'POST',body:JSON.stringify({symbols:{tickers:['BIST:'+sym]},columns:TVT_COLS})});
      if(r.ok){ const j=await r.json(); d=j&&j.data&&j.data[0]&&j.data[0].d; }
    }catch(e){}
    if(!d){
      try{ const r=await fetch('/tvt?s='+encodeURIComponent(sym)); const j=await r.json(); d=j&&j.data&&j.data[0]&&j.data[0].d; }catch(e){}
    }
    if(myGen!=null && myGen!==REQ_GEN) return;
    if(!d || d[0]==null){
      box.innerHTML='<div class="hint">'+t('tgt_none')+'</div>';
      return;
    }
    const [mean,hi,lo,tot]=d, mark=d[9], close=d[10];
    const cur2=cur!=null?cur:close;
    const up=(cur2&&mean)?(mean-cur2)/cur2*100:null;
    const upCls=up==null?'neutral':(up>0?'up':'down');
    const rl=tvMarkLabel(mark);
    box.innerHTML=`<div class="tgt-grid">
      <div class="tgt-box"><div class="lbl">${t('tgt_mean')}</div>
        <div class="big">${fmtUSD(mean)}</div>
        ${up!=null?`<div class="sm ${upCls}">${up>0?'▲':'▼'} ${pct(up)} <span class="neutral">${t('tgt_pot')}</span></div>`:''}
        ${cur2!=null?`<div class="sm neutral">${t('cur_price')}: ${fmtUSD(cur2)}</div>`:''}</div>
      <div class="tgt-box"><div class="lbl">${t('tgt_hi_lo')}</div>
        <div class="big" style="font-size:19px">${fmtUSD(hi)} <span class="neutral" style="font-size:14px">/ ${fmtUSD(lo)}</span></div>
        <div class="sm neutral">${t('tgt_range')}</div></div>
      <div class="tgt-box"><div class="lbl">${t('tgt_rec')}</div>
        <div class="big">${rl?`<span class="grade ${rl[1]}">${rl[0]}</span>`:'—'}</div>
        <div class="sm neutral">${tot!=null?tf('tgt_analysts_n',{n:tot}):''}</div></div>
    </div>
    <div class="hint" style="margin-top:10px">${t('tgt_fallback_tv')}</div>`;
  }catch(e){ box.innerHTML='<div class="hint">'+t('tgt_none')+': '+e.message+'</div>'; }
}

/* Avrupa analist hedefleri — Fintables/Finviz Avrupa'yı kapsamıyor; doğrudan TradingView/Refinitiv
   konsensüsü (kurum bazlı liste yok, BIST'in yedek yolu ile aynı mantık). */
async function fetchTargetsEU(sym, euInfo, myGen){
  const card=document.getElementById('targetCard'), box=document.getElementById('targetBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">'+t('tgt_loading')+'</div>';
  try{
    const tvTicker=euInfo.tv+':'+euInfo.base.replace(/-/g,'_');
    const r=await fetch('https://scanner.tradingview.com/'+euInfo.scan+'/scan',
      {method:'POST',body:JSON.stringify({symbols:{tickers:[tvTicker]},columns:TVT_COLS})});
    const j=r.ok?await r.json():null;
    if(myGen!=null && myGen!==REQ_GEN) return;
    const d=j&&j.data&&j.data[0]&&j.data[0].d;
    if(!d || d[0]==null){
      box.innerHTML='<div class="hint">'+t('tgt_none')+'</div>';
      return;
    }
    const [mean,hi,lo,tot]=d, mark=d[9], close=d[10];
    const up=(close&&mean)?(mean-close)/close*100:null;
    const upCls=up==null?'neutral':(up>0?'up':'down');
    const rl=tvMarkLabel(mark);
    box.innerHTML=`<div class="tgt-grid">
      <div class="tgt-box"><div class="lbl">${t('tgt_mean')}</div>
        <div class="big">${fmtUSD(mean)}</div>
        ${up!=null?`<div class="sm ${upCls}">${up>0?'▲':'▼'} ${pct(up)} <span class="neutral">${t('tgt_pot')}</span></div>`:''}
        ${close!=null?`<div class="sm neutral">${t('cur_price')}: ${fmtUSD(close)}</div>`:''}</div>
      <div class="tgt-box"><div class="lbl">${t('tgt_hi_lo')}</div>
        <div class="big" style="font-size:19px">${fmtUSD(hi)} <span class="neutral" style="font-size:14px">/ ${fmtUSD(lo)}</span></div>
        <div class="sm neutral">${t('tgt_range')}</div></div>
      <div class="tgt-box"><div class="lbl">${t('tgt_rec')}</div>
        <div class="big">${rl?`<span class="grade ${rl[1]}">${rl[0]}</span>`:'—'}</div>
        <div class="sm neutral">${tot!=null?tf('tgt_analysts_n',{n:tot}):''}</div></div>
    </div>
    <div class="hint" style="margin-top:10px">${t('tgt_fallback_eu')}</div>`;
  }catch(e){ box.innerHTML='<div class="hint">'+t('tgt_none')+': '+e.message+'</div>'; }
}

/* ---------- Canlı + dönemsel hisse fiyatı (Yahoo Finance — anahtarsız köprü) ---------- */
/* Not: adı fmtUSD kalsa da aktif para sembolünü (CURSYM: $ veya ₺) kullanır. */
function fmtUSD(n){ return (n==null)?'—':CURSYM+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
/* Piyasa değeri biçimi: $4,17 T / ₺281,50 B / $950,00 M */
function fmtMcap(n){
  if(n==null) return '—';
  const two=x=>x.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(n>=1e12) return CURSYM+two(n/1e12)+' T';
  if(n>=1e9)  return CURSYM+two(n/1e9)+' B';
  if(n>=1e6)  return CURSYM+two(n/1e6)+' M';
  return CURSYM+Math.round(n).toLocaleString('tr-TR');
}
/* Çalışan sayısı — binlik ayraçla; veri yoksa "—" (TradingView number_of_employees) */
function fmtEmployees(n){ return (n==null)?'—':Math.round(n).toLocaleString('tr-TR'); }
/* Dolaşımdaki en güncel pay sayısı (SEC dei kapak sayfası; yedek: us-gaap) */
async function fetchShares(cik){
  const pick=u=>{ const m={},f={}; u.forEach(e=>{ if(!(e.end in m)||e.filed>f[e.end]){m[e.end]=Number(e.val);f[e.end]=e.filed;} });
    const d=Object.keys(m).sort().reverse()[0]; return d?m[d]:null; };
  const tries=[
    `/sec/api/xbrl/companyconcept/CIK${cik}/dei/EntityCommonStockSharesOutstanding.json`,
    `/sec/api/xbrl/companyconcept/CIK${cik}/us-gaap/CommonStockSharesOutstanding.json`,
  ];
  for(const url of tries){
    try{ const r=await fetch(url); if(!r.ok) continue; const j=await r.json();
      const u=j.units&&j.units.shares; if(u){ const v=pick(u); if(v) return v; } }catch(e){}
  }
  return null;
}
/* opts: { ysym: Yahoo sembolü (BIST için "THYAO.IS"), shares: hazır pay adedi (BIST: ödenmiş sermaye) }
   Canlı fiyat: TradingView scanner (close/change). Geçmiş kapanışlar: Yahoo chart (dönem fiyatları). */
async function fetchPrice(sym, cik, myGen, opts){
  const lp=document.getElementById('livePrice'), pn=document.getElementById('priceNote');
  const want=String(sym||'').toUpperCase();
  const fd0=FIN&&FIN.filedD0, fd1=FIN&&FIN.filedD1;
  const ysym=(opts&&opts.ysym)||sym;   // Yahoo'ya giden sembol; ekranda sym gösterilir
  const mktAtStart=FIN&&FIN.market, euAtStart=FIN&&FIN.euInfo;
  try{
    const now=Math.floor(Date.now()/1000)+86400;
    const earliest = fd1||fd0||'2015-01-01';
    const p1=Math.floor(new Date(earliest).getTime()/1000) - 10*86400;
    const [tvLive, liveR, histR, shares]=await Promise.all([
      fetchTvLiveQuote(sym, mktAtStart, euAtStart),
      fetch(`/price?s=${encodeURIComponent(ysym)}&range=1d`).then(x=>x.json()).catch(()=>null),
      fetch(`/price?s=${encodeURIComponent(ysym)}&p1=${p1}&p2=${now}`).then(x=>x.json()).catch(()=>null),
      (opts&&opts.shares!=null)? Promise.resolve(opts.shares) : (cik? fetchShares(cik) : Promise.resolve(null))
    ]);
    if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
    if(!FIN || String(FIN.ticker).toUpperCase()!==want) return; /* AAPL fiyatı AMD oturumuna yazılmasın */
    const res = histR&&histR.chart&&histR.chart.result&&histR.chart.result[0];
    const liveRes = liveR&&liveR.chart&&liveR.chart.result&&liveR.chart.result[0];
    if(!tvLive && !res && !liveRes){ lp.classList.add('hidden'); return; }
    const m=(liveRes&&liveRes.meta) || (res&&res.meta) || {};
    const ts=(res&&res.timestamp)||[];
    let closes=(res&&res.indicators&&res.indicators.quote&&res.indicators.quote[0].close)||[];
    // Londra borsası (LSE) Yahoo fiyatları peni (GBp) — geçmiş seri için poundlaştır.
    if(m.currency==='GBp'){
      if(m.regularMarketPrice!=null) m.regularMarketPrice/=100;
      if(m.chartPreviousClose!=null) m.chartPreviousClose/=100;
      closes=closes.map(c=>c==null?c:c/100);
    }
    const closeOn=iso=>{
      if(!iso) return null;
      const tgt=new Date(iso).getTime()/1000 + 86400;
      let best=null;
      for(let i=0;i<ts.length;i++){ if(ts[i]<=tgt){ if(closes[i]!=null) best=closes[i]; } else break; }
      return best;
    };
    // Canlı fiyat (sağ üst) — birincil: TradingView; yedek: Yahoo
    let live=tvLive&&tvLive.price!=null ? tvLive.price : null;
    let ch=tvLive&&tvLive.changePct!=null ? tvLive.changePct : null;
    if(live==null && m.regularMarketPrice!=null){
      live=m.regularMarketPrice;
      const prevC=m.chartPreviousClose;
      ch=prevC ? (live-prevC)/prevC*100 : null;
    }
    if(tvLive&&tvLive.logoid&&FIN && String(FIN.ticker).toUpperCase()===want) FIN.logoid=tvLive.logoid;
    if(live!=null){
      startLivePrice(sym, FIN&&FIN.market, FIN&&FIN.euInfo, myGen!=null?myGen:REQ_GEN, shares, tvLive&&tvLive.tv);
      paintLivePrice(sym, live, ch);
      if(FIN && String(FIN.ticker).toUpperCase()===want) applyStockLogo(myGen!=null?myGen:REQ_GEN, want);
    }else{
      stopLivePrice();
      lp.classList.add('hidden');
    }
    const mcap = (live!=null && shares) ? live*shares : null;
    const isBist = (FIN&&FIN.market==='BIST') || /\.IS$/i.test(ysym);
    const badge=document.getElementById('hdBadge');
    if(badge){
      if(isBist && mcap!=null){
        badge.className='hd-badge mcap';
        badge.innerHTML=`<span class="mc-lbl">Piyasa Değeri</span><span class="mc-eq">=</span><span class="mc-val">${fmtMcap(mcap)}</span>`;
        badge.classList.remove('hidden');
      }else{
        badge.className='hd-badge hidden';
        badge.textContent='';
      }
    }
    renderValuation(mcap);
    renderYdf(mcap);
    const pCur=closeOn(fd0), pPrev=closeOn(fd1);
    const chip=(lbl,date,price,color)=> price==null?'' :
      `<div style="background:var(--surface-2);border:1px solid var(--line);border-left:3px solid ${color};border-radius:9px;padding:7px 11px;font-size:12px">
        <span style="color:var(--muted)">${lbl}${date?' · '+t('price_filed')+' '+fmtDate(date):''}:</span>
        <b style="color:var(--ink);margin-left:5px;font-variant-numeric:tabular-nums">${fmtUSD(price)}</b></div>`;
    pn.innerHTML = chip(t('price_cur'), fd0, pCur, 'var(--accent)') + chip(t('price_prev'), fd1, pPrev, 'var(--muted)');
    pn.classList.toggle('hidden', !pn.innerHTML.trim());
  }catch(e){ stopLivePrice(); lp.classList.add('hidden'); }
}

/* Değerleme oranları (canlı): F/K = Piyasa Değeri / Net Kâr, PD/DD = Piyasa Değeri / Özkaynak.
   "En güncel": Piyasa Değeri anlık fiyattan; Net Kâr yıllık modda son tam yıl, çeyreklik modda
   son 4 çeyreğin toplamı (TTM); Defter Değeri (özkaynak) en güncel bilançodan. */
function renderValuation(mcap){
  const card=document.getElementById('valCard'), box=document.getElementById('valBody');
  if(!card||!box) return;
  if(!FIN || mcap==null){ card.classList.add('hidden'); return; }
  LAST_MCAP=mcap;
  const D=FIN.balance, D0=FIN.D0;
  const vv=(m,d)=> (d && m && (d in m)) ? m[d] : 0;
  // Defter Değeri (özkaynak) — uygulamanın her yerinde kullanılan sağlam türetme
  const bookValue = vv(D.assets,D0) - liabTotal(D,D0);
  // Net Kâr (F/K için): yıllık = son tam yıl; çeyreklik = son 4 çeyrek toplamı (TTM)
  const niSeries=FIN.income&&FIN.income.netIncome||{};
  const niDates=Object.keys(niSeries).sort().reverse();
  let netIncome=null, niLabel='';
  if(FIN.mode==='quarter'){
    if(niDates.length>=4){ netIncome=niDates.slice(0,4).reduce((a,d)=>a+niSeries[d],0); niLabel=t('val_ttm'); }
  }else if(niDates.length){ netIncome=niSeries[niDates[0]]; niLabel=t('val_yr')+' ('+String(niDates[0]).slice(0,4)+')'; }

  const fk = (netIncome && netIncome>0) ? mcap/netIncome : null;
  const pddd = (bookValue && bookValue>0) ? mcap/bookValue : null;
  const x2=v=> v==null?'—':v.toFixed(2)+'x';
  // F/K eşik: 0-15 ucuz(iyi), 15-30 orta, >30 pahalı; negatif kâr → hesaplanamaz
  const fkCls = fk==null?'neutral':(fk<=15?'up':fk<=30?'neutral':'down');
  const pdCls = pddd==null?'neutral':(pddd<=1.5?'up':pddd<=4?'neutral':'down');
  const cell=(lbl,val,sub,cls)=>`<div class="kpi"><div class="lbl">${lbl}</div>
    <div class="val ${cls||''}" ${cls&&cls!=='neutral'?`style="color:var(--${cls==='up'?'good':'bad'})"`:''}>${val}</div>
    <div class="delta neutral">${sub}</div></div>`;
  box.innerHTML =
    cell(t('val_mcap'), fmtMcap(mcap), t('val_mcap_sub')) +
    cell(t('val_pe'), x2(fk), netIncome==null?t('val_pe_no_ni'):(netIncome<0?t('val_pe_loss'):t('val_pe_ni')+' '+fmtMcap(netIncome)+' · '+niLabel), fkCls) +
    cell(t('val_pb'), x2(pddd), bookValue>0?t('val_book_sub')+' '+fmtMcap(bookValue):t('val_pb_neg'), pdCls) +
    cell(t('val_book'), fmtMcap(bookValue), t('val_book_eq'));
  card.classList.remove('hidden');
}

/* YDF kartı: Toplam yedekler = Özkaynaklar − Ödenmiş sermaye; YDF = yedekler / PD.
   BIST (KAP) ve ABD (SEC); ≥0,80 yeşil (ucuz/güçlü yedek). */
function renderYdf(mcap){
  const card=document.getElementById('ydfCard'), box=document.getElementById('ydfBody');
  if(!card||!box) return;
  if(!FIN || (FIN.market!=='BIST' && FIN.market!=='US') || mcap==null){ card.classList.add('hidden'); return; }
  const D=FIN.balance, D0=FIN.D0;
  const vv=(m,d)=> (d && m && (d in m)) ? m[d] : null;
  let equity=vv(D.equity,D0);
  if(equity==null){
    const a=vv(D.assets,D0);
    if(a!=null) equity=a-liabTotal(D,D0);
  }
  let paidIn=vv(D.common,D0);
  if(paidIn==null && FIN.market==='BIST' && FIN.sharesBist!=null) paidIn=FIN.sharesBist;
  if(equity==null || paidIn==null){ card.classList.add('hidden'); return; }
  const reserves=equity-paidIn;
  const ydf=mcap>0 ? reserves/mcap : null;
  const r2p=paidIn>0 ? reserves/paidIn : null;
  const ydfCls=ydf==null?'neutral':(ydf>=0.8?'up':ydf>=0.4?'neutral':'down');
  const r2pCls=r2p==null?'neutral':(r2p>=1?'up':'neutral');
  const cell=(lbl,val,sub,cls)=>`<div class="kpi"><div class="lbl">${lbl}</div>
    <div class="val ${cls||''}" ${cls&&cls!=='neutral'?`style="color:var(--${cls==='up'?'good':'bad'})"`:''}>${val}</div>
    <div class="delta neutral">${sub}</div></div>`;
  const x2=v=>v==null?'—':v.toFixed(2);
  const paidSrc=FIN.market==='BIST'?'KAP 2OA':'SEC Common Stock';
  LAST_MCAP=mcap;
  box.innerHTML =
    cell(t('ydf_res'), fmtMcap(reserves), t('ydf_res_sub')) +
    cell(t('ydf_ratio'), x2(ydf), t('ydf_ratio_sub'), ydfCls) +
    cell(t('ydf_paid'), fmtMcap(paidIn), paidSrc+' '+t('ydf_paid_pref')) +
    cell(t('ydf_r2p'), x2(r2p), t('ydf_r2p_sub'), r2pCls);
  card.classList.remove('hidden');
}

/* Güncel haberler — Google News (en güncel) + Türkçe çeviri (anahtarsız köprü) */
const safeHTML = s => String(s==null?'':s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function safeExternalURL(raw){
  try{
    const u=new URL(String(raw||''), location.href);
    return (u.protocol==='https:'||u.protocol==='http:') ? u.href : '';
  }catch(_e){ return ''; }
}
function relTime(d){
  const diff=(Date.now()-d.getTime())/1000;
  if(diff<3600) return Math.max(1,Math.round(diff/60))+' '+t('rel_min');
  if(diff<86400) return Math.round(diff/3600)+' '+t('rel_hour');
  if(diff<604800) return Math.round(diff/86400)+' '+t('rel_day');
  return d.toLocaleDateString(getLang()==='en'?'en-US':'tr-TR',{day:'2-digit',month:'short',year:'numeric'});
}
/* --- Çeviri DOĞRUDAN TARAYICIDAN yapılır (sunucu köprüsü DEĞİL). ---
   Neden: Render'ın veri merkezi IP'si Google Translate & MyMemory tarafından engelleniyor →
   sunucu tarafı çeviri canlıda hep İngilizce'ye düşüyordu ve her metin için 2 boş denemeyle
   çok yavaşlıyordu. Her iki servis de "Access-Control-Allow-Origin: *" döndürdüğü için tarayıcı
   onları doğrudan çağırabilir; tarayıcı KULLANICININ ev IP'sini kullandığından engel yok, hızlı
   ve canlıda da Türkçe geliyor. */
async function gTranslate(t){   // Google gtx (kalite en iyi)
  const u='https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q='+encodeURIComponent(t);
  const r=await fetch(u); if(!r.ok) throw new Error('g '+r.status);
  const j=await r.json();
  if(Array.isArray(j) && Array.isArray(j[0])){ const out=j[0].map(s=>(s&&s[0])?s[0]:'').join('').trim(); if(out) return out; }
  throw new Error('g bos');
}
async function mmTranslate(t){  // MyMemory (yedek)
  const q=t.length>480?t.slice(0,480):t;
  const u='https://api.mymemory.translated.net/get?langpair=en|tr&de=bilanco.analiz.app@gmail.com&q='+encodeURIComponent(q);
  const r=await fetch(u); if(!r.ok) throw new Error('mm '+r.status);
  const j=await r.json();
  const out=j&&j.responseData&&j.responseData.translatedText;
  if(out && !/MYMEMORY WARNING|QUOTA/i.test(out)) return out.trim();
  throw new Error('mm bos');
}
/* Tek bir metni Türkçe'ye çevir: Google → MyMemory → (son çare sunucu /tr) → orijinal.
   Zincir bir kez düşerse kısa beklemeyle 2 kez yeniden dener. */
async function translateOne(text, tries){
  const t=(text||'').trim();
  if(!t || t==='—') return text;
  try{
    try{ return await gTranslate(t); }
    catch(e1){
      try{ return await mmTranslate(t); }
      catch(e2){
        const r=await fetch('/tr?q='+encodeURIComponent(t)); const j=await r.json();
        const out=j&&typeof j.text==='string'?j.text.trim():'';
        if(out) return out;
        throw new Error('hepsi bos');
      }
    }
  }catch(e){
    if((tries||0) < 2){ await new Promise(res=>setTimeout(res, 350*((tries||0)+1))); return translateOne(text,(tries||0)+1); }
    return text;
  }
}
/* Diziyi çevir — eşzamanlılığı 6'yla sınırla. Çeviri artık doğrudan tarayıcıdan (kullanıcı IP'si)
   yapıldığı için sunucu turu yok; 6 paralel istek Google'ı zorlamadan tümünü hızlıca çevirir. */
async function translateTR(arr){
  const out=new Array(arr.length); let idx=0;
  const worker=async()=>{ while(idx<arr.length){ const k=idx++; out[k]=await translateOne(arr[k]); } };
  await Promise.all(Array.from({length:6}, worker));
  return out;
}
/* Üst düzey kaynaklar (sıralamada öne alınır; "msn" elenir). Yahoo Finance öne alındı. */
const TOP_SOURCES = ['yahoo finance','bloomberg','reuters','cnbc','marketwatch',
  'wall street journal','wsj','financial times','ft.com',
  'forbes','fortune','economist','business insider','businessinsider',
  'investor\'s business','investors.com','morningstar','investing.com',
  'benzinga','motley fool','fool.com','thestreet','axios','the information'];
const PREMIUM_SITES = '(site:finance.yahoo.com OR site:bloomberg.com OR site:reuters.com OR site:cnbc.com OR '+
  'site:wsj.com OR site:ft.com OR site:marketwatch.com OR site:forbes.com OR site:fortune.com OR '+
  'site:investors.com OR site:businessinsider.com OR site:economist.com OR site:morningstar.com)';
/* Sorun çıkaran/engellenen kaynaklar listede hiç gösterilmez */
const BLOCK_HOST = /(^|\.)(msn\.com|barrons\.com|seekingalpha\.com)$/i;
const BLOCK_SRC  = /\bon msn\b|^\s*msn\s*$|barron|seeking ?alpha/i;
/* BIST: düşük öncelikli kaynaklar — yalnızca başka kaynak yoksa listeye girer (en sona atılır) */
const TR_LOW_SOURCES=/mynet|haberler\.com|sondakika|ensonhaber|internethaber|takvim|aksam|star\.com/i;
function parseNewsXML(xml){
  const doc=new DOMParser().parseFromString(xml||'','application/xml');
  return [...doc.querySelectorAll('item')].map(it=>{
    const get=t=>{ const el=it.getElementsByTagName(t)[0]; return el?el.textContent:''; };
    const title=get('title');
    let link=get('link'); const m=link.match(/[?&]url=([^&]+)/); if(m){ try{ link=decodeURIComponent(m[1]); }catch(e){} }
    const pub=get('pubDate');
    let desc=get('description').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    let src=get('News:Source')||get('Source');
    let host=''; try{ host=new URL(link).hostname.replace(/^www\./,''); }catch(e){}
    if(!src) src=host;
    const d=pub?new Date(pub):null;
    return {title,link,src,host,desc,d:(d&&!isNaN(d))?d:null};
  });
}
async function fetchNews(sym, myGen){
  const box=document.getElementById('newsList');
  if(!box) return;
  box.innerHTML='<div class="hint">'+t('news_loading')+'</div>';
  const isBist = FIN && FIN.market==='BIST';
  const langEn = getLang()==='en';
  try{
    let items;
    if(isBist){
      // BIST: en zengin haber havuzu ŞİRKET ADIYLA çıkıyor (test: "Garanti BBVA" 12 haber,
      // "GARAN hisse" 4) → şirket adını TradingView'den al (tek hafif çağrı), kod + adla ara.
      let coName='';
      try{
        const r=await fetch('https://scanner.tradingview.com/turkey/scan',
          {method:'POST',body:JSON.stringify({symbols:{tickers:['BIST:'+sym]},columns:['description']})});
        if(r.ok){ const j=await r.json(); coName=(j.data&&j.data[0]&&j.data[0].d&&j.data[0].d[0])||''; }
      }catch(e){}
      coName=coName.replace(/\b(A\.?[SŞ]\.?|AO|T\.?A\.?[SŞ]\.?|TURKIYE|TÜRKİYE)\b\.?/gi,' ')
                   .replace(/\s+/g,' ').trim().split(' ').slice(0,3).join(' ');
      const queries=[sym+' hisse', sym, coName].filter(Boolean);
      const xmls=await Promise.all(queries.map(q=>
        fetch('/news?q='+encodeURIComponent(q)+'&m=tr').then(r=>r.text()).catch(()=>'')));
      if(myGen!=null && myGen!==REQ_GEN) return;
      // Yalın kod sorgusu alakasız sonuç sızdırabilir (örn. "GARAN" bir soyadı da olabilir) →
      // kod sorgusundan gelenlerde hem kod hem finans/borsa bağlam kelimesi aranır;
      // "SYM hisse" ve şirket adı sorguları zaten bağlamlı olduğundan olduğu gibi alınır.
      const finRx=/hisse|borsa|bist|hedef|bilanç|temettü|kâr|kar[ıi]|yatır[ıi]m|halka arz|piyasa|analiz|teknik|fiyat|endeks|finans|sermaye|şirket/i;
      const fromCode=parseNewsXML(xmls[1]||'').filter(it=>{
        const txt=((it.title||'')+' '+(it.desc||''));
        return new RegExp('\\b'+sym+'\\b','i').test(txt) && finRx.test(txt);
      });
      items=[...parseNewsXML(xmls[0]||''), ...parseNewsXML(xmls[2]||''), ...fromCode];
      // Güncellik: 90 günden eski haberler KOŞULSUZ elenir (tarihsizler de elenir)
      const cutoff=Date.now()-90*86400000;
      items=items.filter(it=> it.d && it.d.getTime()>=cutoff);
    }else{
      // ABD/EU: önce Yahoo ticker news (OpenBB news.company karşılığı), sonra Bing yedek
      const isEU = FIN && FIN.market==='EU';
      let q=sym;
      if(isEU && FIN.companyName){
        q=FIN.companyName.replace(/\b(AG|SE|PLC|NV|N\.V\.|SA|S\.A\.|S\.p\.A\.|AB|A\/S|ASA|Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|Co\.?|Group|Aktiengesellschaft|Public Limited Company|Holding|Kabushiki Kaisha|\bKK\b|Company Limited|Holdings)\b\.?/gi,' ')
          .replace(/\s+/g,' ').trim().split(' ').slice(0,3).join(' ') || sym;
      }
      const ysym=(FIN&&FIN.ysym)||sym;
      let yItems=[];
      try{
        const yj=await fetch('/ynews?s='+encodeURIComponent(ysym)+'&count=16').then(r=>r.ok?r.json():null);
        yItems=((yj&&yj.items)||[]).map(it=>({
          title:it.title||'', link:it.link||'', src:it.src||'Yahoo', host:'', desc:it.desc||'',
          d:it.d?new Date(it.d):null
        })).filter(it=>it.title&&it.link);
      }catch(e){}
      const [xPrem, xGen]=await Promise.all([
        fetch('/news?q='+encodeURIComponent(q+' stock '+PREMIUM_SITES)).then(r=>r.text()).catch(()=>''),
        fetch('/news?q='+encodeURIComponent(q+' stock')).then(r=>r.text()).catch(()=>'')
      ]);
      if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
      items=[...yItems, ...parseNewsXML(xPrem), ...parseNewsXML(xGen)];
    }

    // Sorunlu kaynakları ele (MSN, Barron's, Seeking Alpha — çeviri/erişim sorunu çıkarıyor)
    items=items.filter(it=> !BLOCK_HOST.test(it.host||'') && !BLOCK_SRC.test(it.src||''));

    // Tekrarları temizle (host+yol ya da başlık)
    const seen=new Set();
    items=items.filter(it=>{
      let key=(it.title||'').slice(0,60).toLowerCase();
      try{ const u=new URL(it.link); key=u.hostname.replace(/^www\./,'')+u.pathname; }catch(e){}
      if(seen.has(key)) return false; seen.add(key); return true;
    });

    // Sıralama — BIST: EN GÜNCEL en üstte; yalnızca düşük kaliteli kaynaklar (Mynet,
    // haberler.com vb.) en sona atılır — onlar ancak başka kaynak yoksa görünür.
    // ABD: üst düzey kaynak önce, sonra en güncel.
    if(isBist){
      const trTier=it=> TR_LOW_SOURCES.test(((it.src||'')+' '+(it.host||'')).toLowerCase()) ? 1 : 0;
      items.sort((a,b)=>{ const t=trTier(a)-trTier(b); if(t) return t; return (b.d?b.d.getTime():0)-(a.d?a.d.getTime():0); });
    }else{
      const tier=it=>{ const s=((it.src||'')+' '+(it.host||'')).toLowerCase(); const i=TOP_SOURCES.findIndex(t=>s.includes(t)); return i<0?999:i; };
      items.sort((a,b)=>{ const t=tier(a)-tier(b); if(t) return t; return (b.d?b.d.getTime():0)-(a.d?a.d.getTime():0); });
    }

    // Çeşitlilik: önce aynı kaynaktan en fazla 3 haber alınır (tek kaynak listeye hakim olmasın).
    // Bu sınırla en az 12'ye ulaşılamazsa (kaynak çeşitliliği azsa), aynı sıralamayı koruyarak
    // eksik kalan yerleri sınırı esnetip aynı kaynaklardan tamamlar → her zaman en az 12 haber.
    const MIN_ITEMS=12, MAX_ITEMS=16, CAP=3;
    const included=new Array(items.length).fill(false);
    const srcCount={};
    let n=0;
    items.forEach((it,i)=>{
      if(n>=MAX_ITEMS) return;
      const key=(it.src||it.host||'').toLowerCase();
      const c=srcCount[key]||0;
      if(c>=CAP) return;
      srcCount[key]=c+1; included[i]=true; n++;
    });
    if(n<MIN_ITEMS){
      items.forEach((it,i)=>{
        if(n>=MIN_ITEMS || included[i]) return;
        included[i]=true; n++;
      });
    }
    items=items.filter((it,i)=>included[i]);
    if(!items.length){ box.innerHTML='<div class="hint">'+t('news_none')+'</div>'; return; }

    // Başlık + özetler: EN modda kaynak dil; TR modda BIST olduğu gibi, ABD→Türkçe çeviri
    const allTexts=[...items.map(i=>i.title), ...items.map(i=>i.desc||'—')];
    const tr = (langEn || isBist) ? allTexts : await translateTR(allTexts);
    if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
    const trTitles=tr.slice(0,items.length), trDescs=tr.slice(items.length);
    box.innerHTML=items.map((it,idx)=>{
      const meta=[it.src, it.d?relTime(it.d):''].filter(Boolean).join(' · ');
      const sum=safeHTML(trDescs[idx]||it.desc||t('news_no_sum'));
      const href=safeExternalURL(it.link);
      const links = href
        ? `<a href="${safeHTML(href)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${isBist?t('news_go'):t('news_go_orig')}</a>`
        : '';
      return `<div class="news" onclick="toggleNews(this)">
        <div class="news-t"><span class="chev">▶</span><span>${safeHTML(trTitles[idx]||it.title)}</span></div>
        <div class="news-m">${safeHTML(meta)}</div>
        <div class="news-sum">${sum}<br>${links}</div>
      </div>`;
    }).join('');
  }catch(e){ box.innerHTML='<div class="hint">'+t('news_none')+': '+e.message+'</div>'; }
}
/* Haber başlığına tıklayınca özeti aç/kapat */
function toggleNews(el){ el.classList.toggle('open'); }

/* ---------- StockTwits sekmesi (güncel + popüler X tarzı yorumlar) ---------- */
let ST_CACHE=null, ST_MODE='recent', ST_GEN=0;
function initStPage(){
  const inp=document.getElementById('stTicker');
  if(inp && !inp.value) setTimeout(()=>inp.focus(), 50);
}
function stRelTime(iso){
  if(!iso) return '';
  const t=Date.parse(iso); if(!isFinite(t)) return '';
  const sec=Math.max(0, Math.floor((Date.now()-t)/1000));
  if(sec<60) return sec+' sn';
  if(sec<3600) return Math.floor(sec/60)+' dk';
  if(sec<86400) return Math.floor(sec/3600)+' sa';
  return Math.floor(sec/86400)+' gün';
}
function renderStockTwits(mode){
  const box=document.getElementById('stBody');
  if(!box||!ST_CACHE) return;
  ST_MODE=mode||ST_MODE||'recent';
  document.getElementById('stTabRecent')?.classList.toggle('active', ST_MODE==='recent');
  document.getElementById('stTabPopular')?.classList.toggle('active', ST_MODE==='popular');
  const list=ST_MODE==='popular' ? (ST_CACHE.popular||[]) : (ST_CACHE.messages||[]);
  if(!list.length){ box.innerHTML='<div class="hint">Bu hisse için StockTwits yorumu bulunamadı.</div>'; return; }
  box.innerHTML=list.slice(0,30).map(m=>{
    const sent=m.sentiment==='bull'?'<span class="st-sent bull">Bullish</span>':(m.sentiment==='bear'?'<span class="st-sent bear">Bearish</span>':'');
    const stats=[];
    if(m.likes) stats.push('♥ '+m.likes);
    if(m.reshares) stats.push('↻ '+m.reshares);
    return `<div class="st-item">
      <div class="st-meta"><span class="st-user">@${safeHTML(m.user)}</span>${sent}<span>${safeHTML(stRelTime(m.created))}</span></div>
      <div class="st-body">${safeHTML(m.body)}</div>
      <div class="st-tr hidden"></div>
      <div class="st-stats">
        <span>${stats.join(' · ')}</span>
        <button type="button" class="st-tr-btn" onclick="translateStItem(this)">Çevir</button>
        ${m.url?`<a href="${safeHTML(m.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Twit →</a>`:''}
      </div>
    </div>`;
  }).join('');
}
async function translateStItem(btn){
  if(!btn) return;
  const item=btn.closest('.st-item');
  if(!item) return;
  const body=item.querySelector('.st-body');
  const trBox=item.querySelector('.st-tr');
  if(!body||!trBox) return;
  if(trBox.dataset.tr && !trBox.classList.contains('hidden')){
    trBox.classList.add('hidden');
    btn.textContent='Çevir';
    return;
  }
  if(trBox.dataset.tr){
    trBox.classList.remove('hidden');
    btn.textContent='Gizle';
    return;
  }
  const orig=(body.textContent||'').trim();
  if(!orig) return;
  btn.disabled=true;
  btn.textContent='…';
  try{
    const tr=await translateOne(orig);
    trBox.textContent=tr||orig;
    trBox.dataset.tr='1';
    trBox.classList.remove('hidden');
    btn.textContent='Gizle';
  }catch(e){
    btn.textContent='Çevir';
  }finally{
    btn.disabled=false;
  }
}
async function loadStockTwits(){
  const inp=document.getElementById('stTicker');
  const box=document.getElementById('stBody');
  const status=document.getElementById('stStatus');
  const link=document.getElementById('stOpenLink');
  if(!inp||!box) return;
  const sym=String(inp.value||'').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'');
  inp.value=sym;
  if(!sym){
    if(status) status.textContent='Hisse kodu yaz.';
    box.innerHTML='<div class="hint">Hisse kodu yazıp Ara’ya bas — güncel ve popüler yorumlar burada listelenir.</div>';
    return;
  }
  const myGen=++ST_GEN;
  ST_CACHE=null; ST_MODE='recent';
  if(status) status.textContent='Yükleniyor…';
  box.innerHTML='<div class="hint">Yorumlar yükleniyor…</div>';
  if(link) link.href='https://stocktwits.com/symbol/'+encodeURIComponent(sym);
  document.getElementById('stTabRecent')?.classList.add('active');
  document.getElementById('stTabPopular')?.classList.remove('active');
  try{
    /* Bazı Render IP'leri StockTwits CF 403 yer — önce kendi köprü, olmazsa yedek köprü */
    const stFetch=async(url)=>{
      const r=await fetch(url, { cache:'no-store' });
      const j=await r.json().catch(()=>null);
      return { r, j };
    };
    let { r, j }=await stFetch('/stocktwits?s='+encodeURIComponent(sym)+'&_='+Date.now());
    if((!j||!j.ok||!(j.messages&&j.messages.length)) && /403|503|429|fetch/i.test(String((j&&j.error)||r.status))){
      try{
        const fb=await stFetch('https://bilanco-analiz.onrender.com/stocktwits?s='+encodeURIComponent(sym)+'&_='+Date.now());
        if(fb.j&&fb.j.ok&&fb.j.messages&&fb.j.messages.length){ j=fb.j; r=fb.r; }
      }catch(e0){ /* yedek köprü yoksa orijinal hata kalır */ }
    }
    if(myGen!==ST_GEN) return;
    if(!j||!j.ok||!(j.messages&&j.messages.length)){
      const err=j&&j.error?String(j.error):('http_'+r.status);
      const is404=/404/.test(err);
      if(status) status.textContent=sym+(is404?' — StockTwits’te yok':' — yorum yok');
      box.innerHTML=is404
        ? '<div class="hint"><b>'+safeHTML(sym)+'</b> StockTwits’te yok. ABD kodu dene: <b>AAPL</b>, <b>NVDA</b>, <b>TSLA</b>, <b>AMD</b>.</div>'
        : '<div class="hint">Yorum alınamadı ('+safeHTML(err)+'). Hard refresh (Ctrl+F5) yapıp ABD ticker dene: AAPL, NVDA, TSLA.</div>';
      return;
    }
    ST_CACHE=j;
    const title=j.title ? (j.symbol+' — '+j.title) : (j.symbol||sym);
    if(status) status.textContent=title+' · '+(j.messages.length)+' yorum';
    if(link && j.symbol) link.href='https://stocktwits.com/symbol/'+encodeURIComponent(j.symbol);
    renderStockTwits('recent');
    box.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }catch(e){
    if(myGen!==ST_GEN) return;
    if(status) status.textContent='Hata';
    box.innerHTML='<div class="hint">Bağlantı hatası: '+safeHTML(e.message||'ağ')+'. Sayfayı yenileyip ABD kodu dene (AAPL).</div>';
  }
}
window.loadStockTwits=loadStockTwits;
window.renderStockTwits=renderStockTwits;
window.translateStItem=translateStItem;

/* ---------- Halka açılmamış özel şirketler ---------- */
const PRIVATE_COMPANIES=[
  {name:'OpenAI',mark:'OAI',logo:'OPAIQ',country:'US',countryTr:'ABD',countryEn:'United States',sector:'ai',color:'#10a37f',slug:'openai',
    ipoTr:'2027 (bildirilen hedef)',ipoEn:'2027 (reported window)',
    tr:'Üretken yapay zekâ modelleri ve ürünleri geliştiren araştırma ve teknoloji şirketi.',
    en:'Research and technology company developing generative AI models and products.'},
  {name:'Waymo',mark:'W',logo:'WAYMO',country:'US',countryTr:'ABD',countryEn:'United States',sector:'mobility',color:'#4285f4',slug:'waymo',
    ipoTr:'Resmî tarih açıklanmadı',ipoEn:'No official date announced',
    tr:'Sürücüsüz ulaşım ve otonom araç teknolojileri geliştiren mobilite şirketi.',
    en:'Mobility company developing autonomous driving and driverless transportation technology.'},
  {name:'Stripe',mark:'S',logo:'STRPQ',country:'US',countryTr:'ABD',countryEn:'United States',sector:'fintech',color:'#635bff',slug:'stripe',
    ipoTr:'Belirsiz / planlar askıda',ipoEn:'Undetermined / plans on hold',
    tr:'İnternet işletmeleri için ödeme, faturalama ve finansal altyapı sunan fintek şirketi.',
    en:'Fintech company providing payments, billing, and financial infrastructure for internet businesses.'},
  {name:'Revolut',mark:'R',logo:'RVOLU',country:'GB',countryTr:'Birleşik Krallık',countryEn:'United Kingdom',sector:'fintech',color:'#161b22',slug:'revolut',
    ipoTr:'2028 veya sonrası',ipoEn:'2028 or later',
    tr:'Dijital bankacılık, ödeme, döviz ve yatırım hizmetlerini tek uygulamada sunan finans platformu.',
    en:'Financial platform combining digital banking, payments, foreign exchange, and investing.'},
  {name:'xAI',mark:'xAI',logo:'XAIIQ',country:'US',countryTr:'ABD',countryEn:'United States',sector:'ai',color:'#111827',slug:'xai',
    ipoTr:'Ayrı halka arz tarihi yok',ipoEn:'No separate IPO date',
    tr:'Büyük dil modelleri ve tüketiciye yönelik yapay zekâ ürünleri geliştiren teknoloji şirketi.',
    en:'Technology company developing large language models and consumer AI products.'},
  {name:'Anthropic',mark:'A',logo:'ANTPQ',country:'US',countryTr:'ABD',countryEn:'United States',sector:'ai',color:'#d97757',slug:'anthropic',
    ipoTr:'2026 sonbaharı (tahmini)',ipoEn:'Autumn 2026 (estimated)',
    tr:'Güvenilir, yönlendirilebilir ve kurumsal kullanıma uygun yapay zekâ sistemleri geliştiren şirket.',
    en:'AI company building reliable, steerable systems for consumer and enterprise use.'},
  {name:'ByteDance',mark:'BD',logo:'BYTDC',country:'CN',countryTr:'Çin',countryEn:'China',sector:'consumer',color:'#18a7b5',slug:'bytedance',
    ipoTr:'Resmî tarih açıklanmadı',ipoEn:'No official date announced',
    tr:'İçerik platformları ve öneri teknolojileri geliştiren küresel tüketici teknolojisi şirketi.',
    en:'Global consumer technology company building content platforms and recommendation systems.'},
  {name:'SHEIN',mark:'SH',logo:'SHNQX',country:'SG',countryTr:'Singapur',countryEn:'Singapore',sector:'ecommerce',color:'#111827',slug:'shein',
    ipoTr:'2026 · Hong Kong (planlanan)',ipoEn:'2026 · Hong Kong (planned)',
    tr:'Dünya çapında faaliyet gösteren moda ve yaşam tarzı odaklı e-ticaret platformu.',
    en:'Global e-commerce platform focused on fashion and lifestyle products.'},
  {name:'Canva',mark:'C',logo:'CNVAX',country:'AU',countryTr:'Avustralya',countryEn:'Australia',sector:'software',color:'#7b2ff7',slug:'canva',
    ipoTr:'2027 veya sonrası (tahmini)',ipoEn:'2027 or later (estimated)',
    tr:'Bireyler ve ekipler için ortak çalışmaya uygun çevrimiçi görsel tasarım platformu.',
    en:'Collaborative online visual design platform for individuals and teams.'},
  {name:'Databricks',mark:'DB',logo:'DTBRK',country:'US',countryTr:'ABD',countryEn:'United States',sector:'data',color:'#ff5f46',slug:'databricks',
    ipoTr:'2027 veya sonrası (tahmini)',ipoEn:'2027 or later (estimated)',
    tr:'Veri mühendisliği, analitik ve yapay zekâyı birleştiren kurumsal veri platformu.',
    en:'Enterprise data platform combining data engineering, analytics, and artificial intelligence.'}
];
const PRIVATE_SECTORS=['all','ai','fintech','mobility','consumer','ecommerce','software','data'];
let PRIVATE_PAGE_INIT=false, PRIVATE_FILTER='all', PRIVATE_OPEN_SLUG=null;

function privateSectorLabel(id){ return id==='all'?t('private_all'):t('private_sector_'+id); }
function privateSearchText(v){
  return String(v||'').toLocaleLowerCase(getLang()==='en'?'en':'tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function initPrivateCompaniesPage(){
  if(!PRIVATE_PAGE_INIT){
    PRIVATE_PAGE_INIT=true;
    const countries=new Set(PRIVATE_COMPANIES.map(c=>c.country));
    const cc=document.getElementById('privateCountryCount'); if(cc) cc.textContent=String(countries.size);
    const co=document.getElementById('privateCompanyCount'); if(co) co.textContent=String(PRIVATE_COMPANIES.length);
  }
  const filters=document.getElementById('privateFilters');
  if(filters) filters.innerHTML=PRIVATE_SECTORS.map(id=>
    `<button type="button" class="scan-chip ${id===PRIVATE_FILTER?'active':''}" onclick="setPrivateFilter('${id}')">${safeHTML(privateSectorLabel(id))}</button>`
  ).join('');
  renderPrivateCompanies();
}
function setPrivateFilter(id){
  PRIVATE_FILTER=PRIVATE_SECTORS.includes(id)?id:'all';
  initPrivateCompaniesPage();
}
function renderPrivateCompanies(){
  const grid=document.getElementById('privateGrid'); if(!grid) return;
  const q=privateSearchText(document.getElementById('privateSearch')?.value||'');
  const en=getLang()==='en';
  const list=PRIVATE_COMPANIES.filter(c=>{
    if(PRIVATE_FILTER!=='all' && c.sector!==PRIVATE_FILTER) return false;
    const hay=privateSearchText([c.name,c.countryTr,c.countryEn,privateSectorLabel(c.sector),c.tr,c.en,c.ipoTr,c.ipoEn].join(' '));
    return !q || hay.includes(q);
  });
  if(!list.length){ grid.innerHTML=`<div class="private-empty">${safeHTML(t('private_empty'))}</div>`; return; }
  grid.innerHTML=list.map(c=>{
    const logo='https://tr-cdn.tipranks.com/static/v2/static/logos/PC%3A'+encodeURIComponent(c.logo)+'.svg';
    return `<article class="private-company">
      <div class="private-company-head">
        <span class="private-mark" style="--private-color:${c.color}">
          <img src="${logo}" alt="${safeHTML(c.name)} logo" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('fb')">
          <span class="private-mark-fb">${safeHTML(c.mark)}</span>
        </span>
        <div><h3>${safeHTML(c.name)}</h3><div class="private-meta">${safeHTML(en?c.countryEn:c.countryTr)}</div></div>
      </div>
      <p class="private-desc">${safeHTML(en?c.en:c.tr)}</p>
      <div class="private-ipo"><span>${safeHTML(t('private_ipo_label'))}</span><b>${safeHTML(en?c.ipoEn:c.ipoTr)}</b></div>
      <div class="private-company-foot">
        <span class="private-sector">${safeHTML(privateSectorLabel(c.sector))}</span>
        <button type="button" class="private-link" onclick="openPrivateProfile('${c.slug}')">${safeHTML(t('private_open'))}</button>
      </div>
    </article>`;
  }).join('');
}
function privateFocusItems(sector,en){
  const tr={
    ai:['Yeni model ve ürün duyuruları','Kurumsal müşteri ve ortaklık gelişmeleri','Çalışan büyümesi ve finansman turları'],
    fintech:['Kullanıcı ve işlem hacmi büyümesi','Yeni ülke, lisans ve ürün açılımları','Finansman ve olası halka arz gelişmeleri'],
    mobility:['Otonom sürüş testleri ve güvenlik verileri','Yeni şehir ve filo genişlemeleri','Üretici ve teknoloji ortaklıkları'],
    consumer:['Kullanıcı büyümesi ve platform etkileşimi','Ürün ve yapay zekâ yatırımları','Düzenleyici gelişmeler'],
    ecommerce:['Sipariş ve pazar genişlemesi','Tedarik zinciri ve lojistik yatırımları','Düzenleyici ve halka arz gelişmeleri'],
    software:['Aktif kullanıcı ve ekip büyümesi','Yeni ürün ve yapay zekâ özellikleri','Kurumsal müşteri kazanımları'],
    data:['Kurumsal müşteri ve bulut ortaklıkları','Yapay zekâ ve veri platformu yenilikleri','Gelir büyümesi ve halka arz hazırlıkları']
  };
  const enMap={
    ai:['New model and product launches','Enterprise customers and partnerships','Workforce growth and funding rounds'],
    fintech:['User and transaction volume growth','New markets, licenses, and products','Funding and potential IPO developments'],
    mobility:['Autonomous driving tests and safety data','New cities and fleet expansion','Automaker and technology partnerships'],
    consumer:['User growth and platform engagement','Product and AI investments','Regulatory developments'],
    ecommerce:['Order growth and market expansion','Supply-chain and logistics investment','Regulatory and IPO developments'],
    software:['Active user and team growth','New products and AI features','Enterprise customer wins'],
    data:['Enterprise customers and cloud partnerships','AI and data-platform innovation','Revenue growth and IPO preparation']
  };
  return (en?enMap:tr)[sector]||(en?enMap.consumer:tr.consumer);
}
function privateTranslateLive(value,en){
  let s=String(value==null?'':value);
  if(en||!s) return s;
  const pairs=[
    ['President, Chairman, & Co-Founder','Başkan, Yönetim Kurulu Başkanı ve Kurucu Ortak'],
    ['CEO & Co-Founder','CEO ve Kurucu Ortak'],['Co-Founder & CEO','Kurucu Ortak ve CEO'],
    ['Founder & CEO','Kurucu ve CEO'],['Chief Executive Officer','CEO'],
    ['Chief Operating Officer','Operasyon Direktörü'],['Chief Financial Officer','Finans Direktörü'],
    ['Chief Product Officer','Ürün Direktörü'],['Chief Technology Officer','Teknoloji Direktörü'],
    ['Chief Legal Officer','Hukuk Direktörü'],['Chief People Officer','İnsan ve Kültür Direktörü'],
    ['Co-founder','Kurucu Ortak'],['Co-Founder','Kurucu Ortak'],
    ['CPO','Ürün Direktörü (CPO)'],['CSO','Strateji Direktörü (CSO)'],
    [' followers',' takipçi'],[' employees',' çalışan']
  ];
  pairs.forEach(([a,b])=>{ s=s.replace(a,b); });
  return s;
}
async function fetchPrivateCompanyData(slug){
  const qs='/private-company?slug='+encodeURIComponent(slug);
  let r=await fetch(qs);
  if(r.ok) return r.json();
  const local=/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  if(local && location.port!=='8725'){
    r=await fetch('http://'+location.hostname+':8725'+qs);
    if(r.ok) return r.json();
  }
  return null;
}
async function openPrivateProfile(slug){
  const c=PRIVATE_COMPANIES.find(x=>x.slug===slug); if(!c) return;
  PRIVATE_OPEN_SLUG=slug;
  const hero=document.getElementById('privateHeroCard');
  const directory=document.getElementById('privateDirectoryCard');
  const view=document.getElementById('privateDetailView');
  if(!hero||!directory||!view) return;
  const en=getLang()==='en';
  const logo='https://tr-cdn.tipranks.com/static/v2/static/logos/PC%3A'+encodeURIComponent(c.logo)+'.svg';
  const source='https://www.tipranks.com/private-companies/'+encodeURIComponent(c.slug);
  const focus=privateFocusItems(c.sector,en).map(x=>`<div class="private-focus-item">${safeHTML(x)}</div>`).join('');
  view.innerHTML=`
    <button type="button" style="margin-bottom:12px" onclick="closePrivateProfile()">${safeHTML(t('private_back'))}</button>
    <div class="card private-detail-hero">
      <div class="private-detail-head">
        <span class="private-mark" style="--private-color:${c.color}"><img src="${logo}" alt="${safeHTML(c.name)} logo" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('fb')"><span class="private-mark-fb">${safeHTML(c.mark)}</span></span>
        <div><h2>${safeHTML(c.name)}</h2><div class="private-meta">${safeHTML(en?c.countryEn:c.countryTr)} · ${safeHTML(privateSectorLabel(c.sector))}</div></div>
        <span class="private-detail-tag" style="margin-left:auto">${safeHTML(t('private_ipo_label'))}: ${safeHTML(en?c.ipoEn:c.ipoTr)}</span>
      </div>
    </div>
    <div class="private-detail-grid">
      <div class="card"><h2>${safeHTML(t('private_profile_about'))}</h2><p class="private-detail-copy">${safeHTML(en?c.en:c.tr)}</p></div>
      <div class="card"><h2>${safeHTML(t('private_profile_focus'))}</h2><div class="private-focus-list">${focus}</div></div>
    </div>
    <div class="card" id="privateLiveData"><h2>${safeHTML(t('private_live_h2'))}</h2><div class="hint">${safeHTML(t('private_live_loading'))}</div></div>
    <div class="card"><h2>${safeHTML(t('private_profile_source'))}</h2><div class="sub">${safeHTML(t('private_profile_source_sub'))}</div><a href="${source}" target="_blank" rel="noopener" class="private-link">${safeHTML(t('private_profile_source_btn'))}</a></div>`;
  hero.classList.add('hidden'); directory.classList.add('hidden'); view.classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
  try{
    const d=await fetchPrivateCompanyData(slug);
    if(PRIVATE_OPEN_SLUG!==slug) return;
    const live=document.getElementById('privateLiveData'); if(!live) return;
    if(!d||!d.ok){ live.innerHTML=`<h2>${safeHTML(t('private_live_h2'))}</h2><div class="hint">${safeHTML(t('private_live_error'))}</div>`; return; }
    const val=(x)=>x==null||x===''?t('private_not_published'):String(x);
    const momentum=d.momentum==null?null:(en?String(d.momentum):({Positive:'Pozitif',Negative:'Negatif',Neutral:'Nötr'}[d.momentum]||String(d.momentum)));
    const round=d.latestRound==null?null:(en?String(d.latestRound):({Investment:'Yatırım',Seed:'Tohum',Grant:'Hibe'}[d.latestRound]||String(d.latestRound)));
    const cards=[
      [t('private_val'),d.valuation],[t('private_raised'),d.totalRaised],[t('private_rounds'),d.fundingRounds],
      [t('private_latest_funding'),d.latestFunding],[t('private_latest_round'),round],[t('private_post_money'),d.postMoney],
      [t('private_employees'),d.employees],[t('private_followers'),d.followers]
    ].map(x=>{const missing=x[1]==null||x[1]==='';return `<div class="kpi"><div class="lbl">${safeHTML(x[0])}</div><div class="val${missing?' private-missing':''}">${safeHTML(val(x[1]))}</div></div>`;}).join('');
    const trends=[
      [t('private_momentum'),momentum],[t('private_linkedin_trend'),d.linkedInTrend],[t('private_workforce_trend'),d.workforceTrend]
    ].map(x=>`<div class="private-data-row"><span>${safeHTML(x[0])}</span><b>${safeHTML(privateTranslateLive(val(x[1]),en))}</b></div>`).join('');
    const leaders=(d.executives||[]).length
      ? d.executives.map(x=>`<div class="private-focus-item">${safeHTML(privateTranslateLive(x,en))}</div>`).join('')
      : `<div class="hint">${safeHTML(t('private_no_data'))}</div>`;
    const clients=(d.clients||[]).length
      ? d.clients.map(x=>`<div class="private-focus-item">${safeHTML(x)}</div>`).join('')
      : `<div class="hint">${safeHTML(t('private_no_data'))}</div>`;
    live.innerHTML=`<h2>${safeHTML(t('private_live_h2'))}</h2>
      <div class="private-live-grid">${cards}</div>
      <div class="private-data-cols">
        <div><h2>${safeHTML(t('private_leadership'))}</h2><div class="private-focus-list">${leaders}</div></div>
        <div><h2>${safeHTML(t('private_trends'))}</h2>${trends}<h2 style="margin-top:18px">${safeHTML(t('private_clients'))}</h2><div class="private-focus-list">${clients}</div></div>
      </div>
      <div class="hint" style="margin-top:14px">${safeHTML(t('private_updated'))}</div>`;
  }catch(_e){
    const live=document.getElementById('privateLiveData');
    if(live&&PRIVATE_OPEN_SLUG===slug) live.innerHTML=`<h2>${safeHTML(t('private_live_h2'))}</h2><div class="hint">${safeHTML(t('private_live_error'))}</div>`;
  }
}
function closePrivateProfile(){
  PRIVATE_OPEN_SLUG=null;
  document.getElementById('privateHeroCard')?.classList.remove('hidden');
  document.getElementById('privateDirectoryCard')?.classList.remove('hidden');
  document.getElementById('privateDetailView')?.classList.add('hidden');
}

/* ---------- Dünya Haberleri sekmesi ----------
   Şirket haberleri kartıyla AYNI makine (Bing News RSS köprüsü + parseNewsXML + istemci
   tarafı Türkçe çeviri + .news kart işaretlemesi) — yalnızca sorgular şirket değil KONU
   bazlı ve kaynak listesi dünya gündemi için genişletilmiş (BBC/AP/Guardian/NYT eklenir).
   Sıralama güncellik öncelikli (dünya haberinde tazelik kaynak sırasından önemli),
   kaynak-başına 3 sınırıyla çeşitlilik korunur. Konu başına 10 dk önbellek. */
const WNEWS_SITES='(site:bloomberg.com OR site:reuters.com OR site:cnbc.com OR site:wsj.com OR '+
  'site:ft.com OR site:economist.com OR site:bbc.com OR site:apnews.com OR '+
  'site:theguardian.com OR site:nytimes.com OR site:cnn.com OR site:finance.yahoo.com)';
/* Her konu için İKİ ayrı premium-filtreli sorgu (farklı ifadeler → daha geniş havuz;
   filtresiz "genel" sorgu KULLANILMAZ çünkü Bing'de kalitesiz/MSN kaynak sızdırıyor).
   Sorgular tek tek test edildi — her biri ~12 ham haber döndürüyor. */
const WNEWS_TOPICS=[
  ['dunya',      'wnews_t_world',    'world news',                     'international breaking news'],
  ['piyasa',     'wnews_t_markets',  'stock market',                   'global markets'],
  ['ekonomi',    'wnews_t_econ',     'economy inflation',              'global economy'],
  ['merkez',     'wnews_t_cb',       'federal reserve interest rates', 'central bank policy'],
  ['teknoloji',  'wnews_t_tech',     'technology',                     'artificial intelligence'],
  ['enerji',     'wnews_t_energy',   'oil prices',                     'gold commodities'],
  ['jeopolitik', 'wnews_t_geo',      'geopolitics',                    'diplomacy sanctions'],
];
let WNEWS_TOPIC='dunya', WNEWS_GEN=0, WNEWS_PAGE_INIT=false;
const WNEWS_CACHE={};   // konu → { html, ts } (10 dk — çeviri maliyetli, hazır HTML saklanır)
function paintWnewsTopics(){
  const box=document.getElementById('wnewsTopics');
  if(!box) return;
  box.innerHTML=WNEWS_TOPICS.map(([id,lk])=>
    `<button data-t="${id}" onclick="setWnewsTopic('${id}')">${t(lk)}</button>`).join('');
  box.querySelectorAll('button').forEach(b=>b.classList.toggle('primary', b.dataset.t===WNEWS_TOPIC));
}
function initWnewsPage(){
  if(WNEWS_PAGE_INIT){ paintWnewsTopics(); return; }
  WNEWS_PAGE_INIT=true;
  paintWnewsTopics();
  setWnewsTopic('dunya');
}
function setWnewsTopic(id){
  WNEWS_TOPIC=id;
  document.querySelectorAll('#wnewsTopics button').forEach(b=>b.classList.toggle('primary', b.dataset.t===id));
  loadWnews();
}
async function loadWnews(){
  const box=document.getElementById('wnewsList');
  const topic=WNEWS_TOPICS.find(t=>t[0]===WNEWS_TOPIC);
  if(!box||!topic) return;
  const cacheKey=topic[0]+'|'+getLang();
  const cached=WNEWS_CACHE[cacheKey];
  if(cached && (Date.now()-cached.ts)<10*60000){ box.innerHTML=cached.html; return; }
  const langEn=getLang()==='en';
  box.innerHTML='<div class="hint">'+(langEn?t('wnews_loading'):t('wnews_loading_tr'))+'</div>';
  const myGen=++WNEWS_GEN;
  try{
    const [x1, x2]=await Promise.all([
      fetch('/news?q='+encodeURIComponent(topic[2]+' '+WNEWS_SITES)).then(r=>r.text()).catch(()=>''),
      fetch('/news?q='+encodeURIComponent(topic[3]+' '+WNEWS_SITES)).then(r=>r.text()).catch(()=>'')
    ]);
    if(myGen!==WNEWS_GEN || WNEWS_TOPIC!==topic[0]) return;
    let items=[...parseNewsXML(x1), ...parseNewsXML(x2)];
    items=items.filter(it=> !BLOCK_HOST.test(it.host||'') && !BLOCK_SRC.test(it.src||''));
    // Güncellik: önce son 3 gün; yeterli haber yoksa 7 güne esnet (tarihsizler her durumda elenir)
    const day=86400000;
    let fresh=items.filter(it=> it.d && (Date.now()-it.d.getTime())<=3*day);
    if(fresh.length<10) fresh=items.filter(it=> it.d && (Date.now()-it.d.getTime())<=7*day);
    items=fresh;
    // Tekrarları temizle (host+yol ya da başlık)
    const seen=new Set();
    items=items.filter(it=>{
      let key=(it.title||'').slice(0,60).toLowerCase();
      try{ const u=new URL(it.link); key=u.hostname.replace(/^www\./,'')+u.pathname; }catch(e){}
      if(seen.has(key)) return false; seen.add(key); return true;
    });
    // En güncel üstte
    items.sort((a,b)=>(b.d?b.d.getTime():0)-(a.d?a.d.getTime():0));
    // Çeşitlilik: aynı kaynaktan en fazla 3 haber; en az 12'ye ulaşmak için gerekirse esnet
    const MIN_ITEMS=12, MAX_ITEMS=18, CAP=3;
    const included=new Array(items.length).fill(false);
    const srcCount={};
    let n=0;
    items.forEach((it,i)=>{
      if(n>=MAX_ITEMS) return;
      const key=(it.src||it.host||'').toLowerCase();
      const c=srcCount[key]||0;
      if(c>=CAP) return;
      srcCount[key]=c+1; included[i]=true; n++;
    });
    if(n<MIN_ITEMS){
      items.forEach((it,i)=>{ if(n>=MIN_ITEMS || included[i]) return; included[i]=true; n++; });
    }
    items=items.filter((it,i)=>included[i]).slice(0,MAX_ITEMS);
    if(!items.length){ box.innerHTML='<div class="hint">'+t('news_none')+'</div>'; return; }
    // EN: kaynak dil; TR: Türkçe'ye çevir
    const allTexts=[...items.map(i=>i.title), ...items.map(i=>i.desc||'—')];
    const tr=langEn?allTexts:await translateTR(allTexts);
    if(myGen!==WNEWS_GEN || WNEWS_TOPIC!==topic[0]) return;
    const trTitles=tr.slice(0,items.length), trDescs=tr.slice(items.length);
    const html=items.map((it,idx)=>{
      const meta=[it.src, it.d?relTime(it.d):''].filter(Boolean).join(' · ');
      const sum=safeHTML(trDescs[idx]||it.desc||t('news_no_sum'));
      const href=safeExternalURL(it.link);
      const link=href?`<a href="${safeHTML(href)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${t('news_orig')}</a>`:'';
      return `<div class="news" onclick="toggleNews(this)">
        <div class="news-t"><span class="chev">▶</span><span>${safeHTML(trTitles[idx]||it.title)}</span></div>
        <div class="news-m">${safeHTML(meta)}</div>
        <div class="news-sum">${sum}<br>${link}</div>
      </div>`;
    }).join('');
    WNEWS_CACHE[cacheKey]={ html, ts:Date.now() };
    box.innerHTML=html;
  }catch(e){ box.innerHTML='<div class="hint">'+t('news_none')+': '+e.message+'</div>'; }
}

/* ---- Sağlam yükümlülük/özkaynak toplamları (eksik SEC etiketlerini telafi eder) ---- */
const bsVal=(m,d)=> (d && m && (d in m)) ? m[d] : 0;
/* Özkaynak (azınlık payı dahil): önce IncludingNCI; yoksa ana ortaklık + azınlık payı */
function equityAllIn(D,d){
  const incl=bsVal(D.equityIncl,d);
  if(incl) return incl;
  return bsVal(D.equity,d)+bsVal(D.minority,d);
}
/* Toplam yükümlülük: raporlanmışsa Liabilities; yoksa (Pasif Toplamı − Özkaynak);
   o da yoksa KV + UV yükümlülük. */
function liabTotal(D,d){
  if(D.liab && (d in D.liab)) return D.liab[d];
  const base=bsVal(D.liabEquity,d)||bsVal(D.assets,d);
  const eq=equityAllIn(D,d);
  if(base && eq) return base-eq;
  return bsVal(D.liabCur,d)+bsVal(D.liabNoncur,d);
}

/* SEC kavram haritalarını uygulamanın satır yapısına çevirir.
   Bölüm toplamına göre bir "denge" satırı eklenir → Aktif = Pasif korunur. */
function buildRowsFromSEC(D,D0,D1){
  const out=[];
  const v=(m,d)=> (d && m && (d in m)) ? m[d] : 0;
  const section=(cat,items,totMap,plugLabel,derive)=>{
    let cs=0,ps=0;
    items.forEach(([lbl,m])=>{
      const cv=v(m,D0), pv=v(m,D1);
      cs+=cv; ps+=pv;
      if(cv!==0||pv!==0) out.push([lbl,cat,cv,pv]);
    });
    const ct = derive? derive(D0): v(totMap,D0);
    const pt = derive? derive(D1): v(totMap,D1);
    const plugC=ct-cs, plugP=pt-ps;
    const thr=Math.max(Math.abs(ct),1)*0.001;
    if(Math.abs(plugC)>thr||Math.abs(plugP)>thr) out.push([plugLabel,cat,plugC,plugP]);
  };

  section('asset_current',[
    [t('ln_cash'),D.cash],
    [t('ln_st_inv'),D.stInv],
    [t('ln_recv'),D.recv],
    [t('ln_inv'),D.inv],
  ],D.assetsCur,t('ln_other_ca'));

  section('asset_noncur',[
    [t('ln_ppe'),D.ppe],
    [t('ln_gw'),D.goodwill],
    [t('ln_intang'),D.intang],
    [t('ln_lt_inv'),D.ltInv],
  ],null,t('ln_other_nca'), d=> (v(D.assets,d)-v(D.assetsCur,d)) );

  section('liab_current',[
    [t('ln_ap'),D.ap],
    [t('ln_st_debt'),D.stDebt],
    [t('ln_def_rev'),D.defRev],
  ],D.liabCur,t('ln_other_cl'));

  section('liab_noncur',[
    [t('ln_lt_debt'),D.ltDebt],
  ],null,t('ln_other_ncl'), d=> (liabTotal(D,d)-v(D.liabCur,d)) );

  // Özkaynak toplamı = Aktif − (sağlam) Toplam Yükümlülük → bilanço HER ZAMAN dengelenir.
  // Azınlık payları (NCI) ve mezzanine gibi StockholdersEquity'ye dahil OLMAYAN
  // kalemler "Diğer Özkaynak" satırında toplanır.
  section('equity',[
    [t('ln_common'),D.common],
    [t('ln_retained'),D.retained],
  ],null,t('ln_other_eq'), d=> (v(D.assets,d)-liabTotal(D,d)) );

  return out;
}

/* ---------- Tablo satır ekleme ---------- */
function rowHTML(name='', cat='asset_current', cur='', prev='', lnKey=''){
  const key=lnKey||resolveLineKey(name)||'';
  const label=key?t(key):(name||'');
  const opts = Object.keys(getCats()).map(k=>`<option value="${k}" ${k===cat?'selected':''}>${getCats()[k]}</option>`).join('');
  const cell = v => (v===''||v===null||v===undefined) ? '' : fmtAbbr(Number(v));
  return `<tr>
    <td><input class="name" ${key?`data-ln="${key}"`:''} value="${String(label).replace(/"/g,'&quot;')}" placeholder="${t('ph_item')}"></td>
    <td><select class="cell catsel">${opts}</select></td>
    <td><input class="cell cur" value="${cell(cur)}" inputmode="text"></td>
    <td><input class="cell prev" value="${cell(prev)}" inputmode="text"></td>
    <td class="row-actions"><button class="delrow" onclick="this.closest('tr').remove()" title="${t('btn_del')}">✕</button></td>
  </tr>`;
}
function addRow(group){
  const cat = group==='asset'?'asset_current':group==='liab'?'liab_current':'equity';
  document.getElementById('inputBody').insertAdjacentHTML('beforeend', rowHTML('',cat));
}
function setPeriodHeaders(curDate, prevDate){
  const th1=document.getElementById('thCur'), th2=document.getElementById('thPrev');
  if(th1) th1.innerHTML = t('th_cur') + (curDate?`<br><span class="thd">${curDate}</span>`:'');
  if(th2) th2.innerHTML = t('th_prev') + (prevDate?`<br><span class="thd">${prevDate}</span>`:'');
}
function financialDisplayDate(index){
  if(!FIN) return null;
  return index===0?(FIN.filedD0||FIN.D0||null):(FIN.filedD1||FIN.D1||null);
}
function setFinancialPeriodHeaders(){
  setPeriodHeaders(financialDisplayDate(0)?fmtDate(financialDisplayDate(0)):null,financialDisplayDate(1)?fmtDate(financialDisplayDate(1)):null);
}
function hidePriceUI(){
  stopLivePrice();
  const lp=document.getElementById('livePrice'), pn=document.getElementById('priceNote'), bd=document.getElementById('hdBadge');
  const tc=document.getElementById('targetCard'), vc=document.getElementById('valCard'), kc=document.getElementById('kapCard');
  const yc=document.getElementById('ydfCard');
  const en=document.getElementById('earnNote');
  const ec=document.getElementById('earnCard');
  if(lp) lp.classList.add('hidden');
  if(pn){ pn.classList.add('hidden'); pn.innerHTML=''; }
  if(bd){ bd.className='hd-badge hidden'; bd.textContent=''; }
  if(tc) tc.classList.add('hidden');
  if(vc) vc.classList.add('hidden');
  if(yc) yc.classList.add('hidden');
  if(kc) kc.classList.add('hidden');
  if(en){ en.classList.add('hidden'); en.innerHTML=''; }
  if(ec){ ec.classList.add('hidden'); const echart=document.getElementById('earnChart'), em=document.getElementById('earnMeta'); if(echart) echart.innerHTML=''; if(em) em.innerHTML=''; EARN_CACHE=null; }
  ['chartCard','sectorCard','insiderCard','ownerCard','techCard'].forEach(id=>{ const c=document.getElementById(id); if(c) c.classList.add('hidden'); });
  TECH_SHORT=null;
  const tss=document.getElementById('techShortSrc'); if(tss) tss.textContent='';
  const ws=document.getElementById('watchStar'); if(ws) ws.classList.add('hidden');
  const fw=document.getElementById('forumWrap'); if(fw) fw.classList.add('hidden');
  closeForumMenu();
  stopNyClock();
}
function loadSample(){
  REQ_GEN++; FIN=null; hidePriceUI();
  const b=document.getElementById('inputBody'); b.innerHTML='';
  SAMPLE.forEach(r=>b.insertAdjacentHTML('beforeend', rowHTML(t(r[0]),r[1],r[2],r[3],r[0])));
  setPeriodHeaders(null,null);
  analyze();
}
function clearAll(){ REQ_GEN++; FIN=null; hidePriceUI(); document.getElementById('inputBody').innerHTML=''; setPeriodHeaders(null,null); document.getElementById('results').classList.add('hidden'); }

/* ---------- Verileri oku ---------- */
function readData(){
  const rows=[...document.querySelectorAll('#inputBody tr')];
  return rows.map(tr=>{
    const inp=tr.querySelector('.name');
    const key=(inp && inp.dataset && inp.dataset.ln)||resolveLineKey(inp?inp.value:'');
    const raw=(inp && inp.value || '').trim();
    return {
      name: key?t(key):(raw||t('unnamed')),
      lnKey: key||'',
      cat:  tr.querySelector('.catsel').value,
      cur:  num(tr.querySelector('.cur').value),
      prev: num(tr.querySelector('.prev').value)
    };
  }).filter(r=>r.cur!==0||r.prev!==0);
}
const sum=(rows,f,key)=>rows.filter(f).reduce((a,r)=>a+r[key],0);

/* Cari değeri önceki döneme göre renklendir: iyi=yeşil, kötü=kırmızı.
   Yön: varlık & özkaynak artışı iyi; yükümlülük artışı kötü. */
function colorInputRows(){
  document.querySelectorAll('#inputBody tr').forEach(tr=>{
    const curEl=tr.querySelector('.cur'), prevEl=tr.querySelector('.prev'), catEl=tr.querySelector('.catsel');
    if(!curEl||!prevEl||!catEl) return;
    curEl.classList.remove('cell-good','cell-bad');
    const cur=num(curEl.value), prev=num(prevEl.value);
    if(!prev) return;                                  // karşılaştırılacak önceki dönem yok
    const dv=cur-prev;
    if(Math.abs(dv) < Math.abs(prev)*0.0005) return;   // anlamlı değişim yok → nötr
    const favorable = (CAT_GROUP[catEl.value]==='liab') ? dv<0 : dv>0;
    curEl.classList.add(favorable?'cell-good':'cell-bad');
  });
}

/* ---------- Ana analiz ---------- */
function marketLabelKey(prefix){
  if(FIN&&FIN.market==='BIST') return prefix+'_bist';
  if(FIN&&FIN.market==='EU') return prefix+'_eu';
  return prefix+'_us';
}
function updateMarketSpecificLabels(){
  const incomeSub=document.getElementById('incomeSub');
  if(incomeSub) incomeSub.textContent=t(marketLabelKey('card_income_sub'));
  const absHead=document.getElementById('varAbsHead');
  if(absHead) absHead.textContent=tf('th_chg_abs_cur',{c:CURSYM||CUR||t('amount')});
  const chartHint=document.querySelector('#chartBody .chart-source-hint');
  if(chartHint) chartHint.textContent=t(marketLabelKey('chart_marker'));
}

/* ---------- Luna AI serbest sohbet ---------- */
const LUNA_CHAT_MESSAGES=[];
let LUNA_CHAT_BUSY=false;
let LUNA_CHAT_STREAMING=false;
let LUNA_CHAT_DEEP=true;
function renderLunaChat(){
  const box=document.getElementById('aiChatMessages'); if(!box) return;
  const empty=document.getElementById('aiChatEmpty');
  box.querySelectorAll('.ai-message').forEach(x=>x.remove());
  if(empty) empty.classList.toggle('hidden',LUNA_CHAT_MESSAGES.length>0);
  LUNA_CHAT_MESSAGES.forEach(m=>{
    const row=document.createElement('div'); row.className='ai-message '+m.role;
    const bubble=document.createElement('div'); bubble.className='ai-bubble';
    bubble.textContent=m.content;
    if(Array.isArray(m.sources)&&m.sources.length){
      const sources=document.createElement('div'); sources.className='ai-sources';
      const label=document.createElement('strong'); label.textContent=t('ai_sources'); sources.appendChild(label);
      m.sources.forEach(s=>{ const a=document.createElement('a'); a.href=s.url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=s.title||s.url; sources.appendChild(a); });
      bubble.appendChild(sources);
    }
    row.appendChild(bubble); box.appendChild(row);
  });
  if(LUNA_CHAT_BUSY&&!LUNA_CHAT_STREAMING){
    const row=document.createElement('div'); row.className='ai-message assistant ai-thinking';
    const bubble=document.createElement('div'); bubble.className='ai-bubble'; bubble.textContent=t(LUNA_CHAT_DEEP?'ai_thinking_deep':'ai_thinking');
    row.appendChild(bubble); box.appendChild(row);
  }
  box.scrollTop=box.scrollHeight;
}
function clearLunaChat(){
  if(LUNA_CHAT_BUSY) return;
  LUNA_CHAT_MESSAGES.length=0; renderLunaChat();
  const input=document.getElementById('aiChatInput'); if(input){ input.value=''; input.focus(); }
}
function toggleLunaDeepMode(){
  const btn=document.getElementById('aiDeepMode');
  if(btn){ btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
  const input=document.getElementById('aiChatInput'); if(input) input.focus();
}
function lunaChatKeydown(e){
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendLunaChat(e); }
}
async function sendLunaChat(e){
  if(e&&e.preventDefault) e.preventDefault();
  const input=document.getElementById('aiChatInput'), btn=document.getElementById('aiChatSend'), modeBtn=document.getElementById('aiDeepMode');
  const question=String(input&&input.value||'').trim();
  if(!question || LUNA_CHAT_BUSY) return;
  LUNA_CHAT_MESSAGES.push({role:'user',content:question});
  const deepMode=true;
  if(input) input.value=''; LUNA_CHAT_BUSY=true; if(btn) btn.disabled=true; if(modeBtn) modeBtn.disabled=true; renderLunaChat();
  try{
    const history=LUNA_CHAT_MESSAGES.slice(-12);
    const context=FIN?{
      activeTicker:String(FIN.ticker||'').toUpperCase(),market:FIN.market||'',currency:FIN.cur||CUR||'',
      periodType:FIN.mode||'',balanceDates:[FIN.D0||null,FIN.D1||null],filedDates:[FIN.filedD0||null,FIN.filedD1||null],
      entityType:FIN.bankGroup==='UFRS'?'financial_institution':'corporate',lastBrokerSymbol:TAKAS_LUNA_SYMBOL||null
    }:{lastBrokerSymbol:TAKAS_LUNA_SYMBOL||null};
    const r=await fetch('/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:getLang(),messages:history,context,stream:true,deep:deepMode})});
    const contentType=String(r.headers.get('content-type')||'');
    if(!contentType.includes('text/event-stream')){
      const j=await r.json().catch(()=>({}));
      if(j.error==='luna_not_configured') throw new Error('not_configured');
      if(j.error==='rate_limit') throw new Error('rate_limit');
      throw new Error('unavailable');
    }
    if(!r.ok||!r.body) throw new Error('unavailable');
    const reader=r.body.getReader(), decoder=new TextDecoder();
    let buffer='', assistant=null, streamError='';
    const consume=()=>{
      buffer=buffer.replace(/\r\n/g,'\n');
      let boundary;
      while((boundary=buffer.indexOf('\n\n'))!==-1){
        const block=buffer.slice(0,boundary); buffer=buffer.slice(boundary+2);
        let event='message', dataText='';
        block.split('\n').forEach(line=>{
          if(line.startsWith('event:')) event=line.slice(6).trim();
          else if(line.startsWith('data:')) dataText+=(dataText?'\n':'')+line.slice(5).trim();
        });
        if(!dataText) continue;
        let data={}; try{ data=JSON.parse(dataText); }catch(_e){ continue; }
        if(event==='delta'&&data.delta){
          if(!assistant){
            assistant={role:'assistant',content:'',sources:[]};
            LUNA_CHAT_MESSAGES.push(assistant); LUNA_CHAT_STREAMING=true;
          }
          assistant.content+=String(data.delta); renderLunaChat();
        }else if(event==='done'){
          if(!assistant){ assistant={role:'assistant',content:'',sources:[]}; LUNA_CHAT_MESSAGES.push(assistant); }
          assistant.content=String(data.answer||assistant.content||t('ai_error'));
          assistant.sources=Array.isArray(data.sources)?data.sources:[];
          renderLunaChat();
        }else if(event==='error') streamError=String(data.error||'unavailable');
      }
    };
    while(true){
      const part=await reader.read();
      if(part.value){ buffer+=decoder.decode(part.value,{stream:!part.done}); consume(); }
      if(part.done) break;
    }
    if(streamError) throw new Error(streamError==='rate_limit'?'rate_limit':'unavailable');
    if(!assistant) throw new Error('unavailable');
  }catch(err){
    const key=err.message==='not_configured'?'luna_not_configured':(err.message==='rate_limit'?'luna_rate':'ai_error');
    LUNA_CHAT_MESSAGES.push({role:'assistant',content:t(key)});
  }finally{
    LUNA_CHAT_BUSY=false; LUNA_CHAT_STREAMING=false; if(btn) btn.disabled=false; if(modeBtn) modeBtn.disabled=false; renderLunaChat(); if(input) input.focus();
  }
}

/* ---------- Luna: açık finansal tabloları sunucu üzerinden yorumla ---------- */
function lunaPair(series){
  if(!series || typeof series!=='object') return {current:null,previous:null,dates:[]};
  const dates=Object.keys(series).sort().reverse().slice(0,2);
  const num=v=>v==null?null:(Number.isFinite(Number(v))?Number(v):null);
  return {current:dates[0]?num(series[dates[0]]):null,previous:dates[1]?num(series[dates[1]]):null,dates};
}
function buildLunaSnapshot(){
  if(!FIN) return null;
  const rows=readData().map(r=>({name:r.name,category:r.cat,current:Number.isFinite(r.cur)?r.cur:null,previous:Number.isFinite(r.prev)?r.prev:null}));
  const categoryTotal=(period,category)=>rows.filter(r=>r.category===category).reduce((s,r)=>s+(Number(r[period])||0),0);
  const namedTotal=(period,category,rx)=>rows.filter(r=>r.category===category&&rx.test(String(r.name||''))).reduce((s,r)=>s+(Number(r[period])||0),0);
  const inc=FIN.income||{}, cash=inc._cash||{};
  const income={};
  ['revenue','costRev','grossProfit','opIncome','rnd','netIncome'].forEach(k=>income[k]=lunaPair(inc[k]));
  const cashFlow={};
  ['opCF','invCF','finCF','capex','fcf'].forEach(k=>cashFlow[k]=lunaPair(cash[k]));
  const ratio=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?a/b:null;
  const change=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a/b)-1:null;
  const balanceFor=period=>{
    const currentAssets=categoryTotal(period,'asset_current');
    const nonCurrentAssets=categoryTotal(period,'asset_noncur');
    const currentLiabilities=categoryTotal(period,'liab_current');
    const nonCurrentLiabilities=categoryTotal(period,'liab_noncur');
    const equity=categoryTotal(period,'equity');
    const assets=currentAssets+nonCurrentAssets, liabilities=currentLiabilities+nonCurrentLiabilities;
    const inventory=namedTotal(period,'asset_current',/stok|inventory/i);
    const cash=namedTotal(period,'asset_current',/nakit|cash|cash equivalent/i);
    return {assets,currentAssets,nonCurrentAssets,liabilities,currentLiabilities,nonCurrentLiabilities,equity,
      workingCapital:currentAssets-currentLiabilities,inventory,cash,
      currentRatio:ratio(currentAssets,currentLiabilities),quickRatio:ratio(currentAssets-inventory,currentLiabilities),
      cashRatio:ratio(cash,currentLiabilities),liabilitiesToEquity:ratio(liabilities,equity),equityToAssets:ratio(equity,assets)};
  };
  const cashComparable=!(FIN.market==='US'&&FIN.mode==='quarter')&&FIN.market!=='EU';
  const performanceFor=period=>{
    const revenue=income.revenue[period], grossProfit=income.grossProfit[period], operatingIncome=income.opIncome[period], netIncome=income.netIncome[period];
    const operatingCashFlow=cashFlow.opCF[period], freeCashFlow=cashFlow.fcf[period];
    return {revenue,grossProfit,operatingIncome,netIncome,operatingCashFlow,freeCashFlow,
      grossMargin:ratio(grossProfit,revenue),operatingMargin:ratio(operatingIncome,revenue),netMargin:ratio(netIncome,revenue),
      freeCashFlowMargin:cashComparable?ratio(freeCashFlow,revenue):null,cashConversion:cashComparable?ratio(operatingCashFlow,netIncome):null};
  };
  const currentBalance=balanceFor('current'), previousBalance=balanceFor('previous');
  const currentPerformance=performanceFor('current'), previousPerformance=performanceFor('previous');
  const balanceChange={}, performanceChange={};
  ['assets','currentAssets','liabilities','currentLiabilities','equity','workingCapital','cash'].forEach(k=>balanceChange[k]=change(currentBalance[k],previousBalance[k]));
  ['revenue','grossProfit','operatingIncome','netIncome','operatingCashFlow','freeCashFlow'].forEach(k=>performanceChange[k]=change(currentPerformance[k],previousPerformance[k]));
  return {
    ticker:String(FIN.ticker||'').toUpperCase(),market:FIN.market||'',currency:FIN.cur||CUR||'',periodType:FIN.mode||'',
    balanceDates:[FIN.D0||null,FIN.D1||null],filedDates:[FIN.filedD0||null,FIN.filedD1||null],
    dataBasis:{source:FIN.market==='US'?'SEC EDGAR':(FIN.market==='BIST'?'İş Yatırım / KAP':'TradingView / IFRS kaynakları'),
      entityType:FIN.bankGroup==='UFRS'?'financial_institution':'corporate',
      balancePeriodType:FIN.market==='EU'?'latest_reported_quarter':(FIN.mode||'unknown'),
      incomePeriodType:FIN.market==='EU'?'fiscal_year':(FIN.mode||'unknown'),
      cashFlowPeriodType:FIN.market==='US'?'annual':(FIN.market==='EU'?'trailing_twelve_months':(FIN.mode||'unknown')),
      comparabilityWarning:FIN.market==='US'&&FIN.mode==='quarter'
        ? 'Income statement is quarterly while cash-flow series is annual; do not calculate quarterly cash conversion.'
        :(FIN.market==='EU'?'Balance sheet is latest-quarter, income statement is fiscal-year and cash flow is trailing-twelve-months; compare only compatible fields.':null)},
    balanceRows:rows,income,cashFlow,marketCap:Number.isFinite(LAST_MCAP)?LAST_MCAP:null,
    derived:{balance:{current:currentBalance,previous:previousBalance,changePct:balanceChange},
      performance:{current:currentPerformance,previous:previousPerformance,changePct:performanceChange}}
  };
}
function lunaList(title,items,wide){
  const list=(Array.isArray(items)?items:[]).map(x=>'<li>'+safeHTML(x)+'</li>').join('');
  return `<section class="luna-section${wide?' wide':''}"><h3>${safeHTML(title)}</h3><ul>${list||'<li>—</li>'}</ul></section>`;
}
function renderLunaAnalysis(a){
  const body=document.getElementById('lunaBody'); if(!body) return;
  body.classList.remove('hidden');
  body.innerHTML=`<div class="luna-result">
    <section class="luna-section wide"><h3>${safeHTML(t('luna_summary'))}</h3><p>${safeHTML(a.summary||'—')}</p></section>
    ${lunaList(t('luna_strengths'),a.strengths)}${lunaList(t('luna_risks'),a.risks)}
    <section class="luna-section"><h3>${safeHTML(t('luna_profit'))}</h3><p>${safeHTML(a.profitability||'—')}</p></section>
    <section class="luna-section"><h3>${safeHTML(t('luna_position'))}</h3><p>${safeHTML(a.financialPosition||'—')}</p></section>
    <section class="luna-section"><h3>${safeHTML(t('luna_cash'))}</h3><p>${safeHTML(a.cashFlow||'—')}</p></section>
    <section class="luna-section"><h3>${safeHTML(t('luna_earnings_quality'))}</h3><p>${safeHTML(a.earningsQuality||'—')}</p></section>
    ${lunaList(t('luna_watch'),a.watchNext,true)}
    <section class="luna-section wide"><h3>${safeHTML(t('luna_data_quality'))}</h3><p>${safeHTML(a.dataQuality||'—')}</p></section>
  </div>`;
}
function renderAstraAnalysis(a,sources){
  const body=document.getElementById('astraBody'); if(!body) return;
  body.classList.remove('hidden');
  body.innerHTML=`<div class="luna-result">
    <section class="luna-section wide"><h3>${safeHTML(t('luna_summary'))}</h3><p>${safeHTML(a.summary||'—')}</p></section>
    ${lunaList(t('luna_strengths'),a.strengths)}${lunaList(t('luna_risks'),a.risks)}
    <section class="luna-section"><h3>${safeHTML(t('luna_profit'))}</h3><p>${safeHTML(a.profitability||'—')}</p></section>
    <section class="luna-section"><h3>${safeHTML(t('luna_position'))}</h3><p>${safeHTML(a.financialPosition||'—')}</p></section>
    <section class="luna-section"><h3>${safeHTML(t('luna_cash'))}</h3><p>${safeHTML(a.cashFlow||'—')}</p></section>
    <section class="luna-section"><h3>${safeHTML(t('luna_earnings_quality'))}</h3><p>${safeHTML(a.earningsQuality||'—')}</p></section>
    <section class="luna-section wide"><h3>${safeHTML(t('astra_market_context'))}</h3><p>${safeHTML(a.marketContext||'—')}</p></section>
    <section class="luna-section wide"><h3>${safeHTML(t('astra_valuation'))}</h3><p>${safeHTML(a.valuationContext||'—')}</p></section>
    ${lunaList(t('astra_catalysts'),a.catalysts)}
    <section class="luna-section"><h3>${safeHTML(t('astra_counter_view'))}</h3><p>${safeHTML(a.counterView||'—')}</p></section>
    ${lunaList(t('astra_risk_triggers'),a.riskTriggers)}${lunaList(t('luna_watch'),a.watchNext)}
    <section class="luna-section"><h3>${safeHTML(t('astra_confidence'))}</h3><p>${safeHTML(a.confidence||'—')}</p></section>
    <section class="luna-section"><h3>${safeHTML(t('luna_data_quality'))}</h3><p>${safeHTML(a.dataQuality||'—')}</p></section>
  </div>`;
  if(Array.isArray(sources)&&sources.length){
    const sourceBox=document.createElement('div'); sourceBox.className='ai-sources econ-luna-sources';
    const label=document.createElement('strong'); label.textContent=t('ai_sources'); sourceBox.appendChild(label);
    sources.forEach(s=>{
      if(!s||!/^https:\/\//i.test(String(s.url||''))) return;
      const link=document.createElement('a'); link.href=s.url; link.target='_blank'; link.rel='noopener noreferrer';
      link.textContent=s.title||s.url; sourceBox.appendChild(link);
    });
    body.appendChild(sourceBox);
  }
}
async function analyzeWithLuna(){
  const btn=document.getElementById('lunaAnalyzeBtn'), status=document.getElementById('lunaStatus');
  const snapshot=buildLunaSnapshot();
  if(!snapshot || !btn || !status) return;
  btn.disabled=true; status.textContent=t('luna_loading'); status.className='hint luna-status';
  try{
    const r=await fetch('/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:getLang(),snapshot})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok || !j.ok){
      if(j.error==='luna_not_configured') throw new Error('not_configured');
      if(j.error==='rate_limit') throw new Error('rate_limit');
      throw new Error('unavailable');
    }
    renderLunaAnalysis(j.analysis||{});
    status.textContent='';
  }catch(e){
    status.textContent=e.message==='not_configured'?t('sol_not_configured'):(e.message==='rate_limit'?t('sol_rate'):t('sol_error'));
    status.className='hint luna-status down';
  }finally{ btn.disabled=false; }
}
async function analyzeWithAstra(){
  const btn=document.getElementById('astraAnalyzeBtn'), status=document.getElementById('astraStatus');
  const snapshot=buildLunaSnapshot();
  if(!snapshot || !btn || !status) return;
  btn.disabled=true; status.textContent=t('astra_finance_loading'); status.className='hint luna-status';
  try{
    const r=await fetch('/ai/astra-analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:getLang(),snapshot})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok || !j.ok){
      if(j.error==='astra_not_configured') throw new Error('not_configured');
      if(j.error==='rate_limit') throw new Error('rate_limit');
      throw new Error('unavailable');
    }
    renderAstraAnalysis(j.analysis||{},j.sources||[]);
    status.textContent='';
  }catch(e){
    status.textContent=e.message==='not_configured'?t('astra_not_configured'):(e.message==='rate_limit'?t('astra_rate'):t('astra_error'));
    status.className='hint luna-status down';
  }finally{ btn.disabled=false; }
}
function prepareLunaCard(){
  const card=document.getElementById('lunaCard'), body=document.getElementById('lunaBody'), status=document.getElementById('lunaStatus');
  if(!card) return;
  if(!FIN){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const key=[FIN.ticker,FIN.mode,FIN.D0,FIN.D1,FIN.filedD0,FIN.filedD1,getLang()].join('|');
  if(card.dataset.snapshotKey!==key){
    card.dataset.snapshotKey=key;
    if(body){ body.classList.add('hidden'); body.innerHTML=''; }
    if(status){ status.textContent=t('luna_ready'); status.className='hint luna-status'; }
  }
}
window.addEventListener('bilanco-lang', prepareLunaCard);
function prepareAstraCard(){
  const card=document.getElementById('astraCard'), body=document.getElementById('astraBody'), status=document.getElementById('astraStatus');
  if(!card) return;
  if(!FIN){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const key=[FIN.ticker,FIN.mode,FIN.D0,FIN.D1,FIN.filedD0,FIN.filedD1,getLang()].join('|');
  if(card.dataset.snapshotKey!==key){
    card.dataset.snapshotKey=key;
    if(body){ body.classList.add('hidden'); body.innerHTML=''; }
    if(status){ status.textContent=t('astra_finance_ready'); status.className='hint luna-status'; }
  }
}
window.addEventListener('bilanco-lang', prepareAstraCard);
function analyze(myGen){
  if(myGen!=null && myGen!==REQ_GEN) return;
  const d=readData();
  colorInputRows();
  if(d.length===0){ alert(t('alert_need_rows')); return; }
  document.getElementById('results').classList.remove('hidden');

  const isA=r=>CAT_GROUP[r.cat]==='asset', isL=r=>CAT_GROUP[r.cat]==='liab', isE=r=>CAT_GROUP[r.cat]==='equity';
  const period=['cur','prev'];
  const T={}; // toplamlar
  period.forEach(p=>{
    T[p]={
      donenV:   sum(d,r=>r.cat==='asset_current',p),
      duranV:   sum(d,r=>r.cat==='asset_noncur',p),
      kvYuk:    sum(d,r=>r.cat==='liab_current',p),
      uvYuk:    sum(d,r=>r.cat==='liab_noncur',p),
      ozkaynak: sum(d,isE,p),
      stok:     sum(d,r=>r.cat==='asset_current'&&(r.lnKey==='ln_inv'||isInvName(r.name)),p),
      nakit:    sum(d,r=>r.cat==='asset_current'&&(r.lnKey==='ln_cash'||isCashName(r.name)),p),
    };
    T[p].toplamV = T[p].donenV+T[p].duranV;
    T[p].toplamYuk = T[p].kvYuk+T[p].uvYuk;
    T[p].pasifTop = T[p].toplamYuk+T[p].ozkaynak;
    T[p].netSermaye = T[p].donenV-T[p].kvYuk;
  });

  renderBalCheck(T);
  renderKPIs(T);
  renderRatios(T);
  renderVariance(d);
  updateMarketSpecificLabels();
  renderVertical(d,T);
  renderFlags(d,T);

  // Gelir tablosu / kârlılık / trend / nakit akışı / sağlık karnesi yalnızca çekilmiş veri varsa
  const incCard=document.getElementById('incomeCard'), trCard=document.getElementById('trendCard');
  if(FIN){
    renderIncome(T); renderTrends();
    renderCashFlow(); renderHealth(T);
    incCard.classList.remove('hidden'); trCard.classList.remove('hidden');
  }else{
    incCard.classList.add('hidden'); trCard.classList.add('hidden');
    ['cashCard','healthCard'].forEach(id=>{ const c=document.getElementById(id); if(c) c.classList.add('hidden'); });
  }
  prepareLunaCard();
  prepareAstraCard();

  // Rapor başlığı (dışa aktarmada da kullanılır)
  const rt=document.getElementById('reportTitle');
  if(rt){
    if(!FIN){ rt.removeAttribute('data-title'); rt.textContent=t('report_manual'); }
    else{
      const mkt = FIN.market==='BIST' ? 'BIST'
                : FIN.market==='EU' && FIN.euInfo ? FIN.euInfo.country
                : t('mkt_us');
      const curLbl = FIN.market==='BIST' ? 'TL' : (FIN.cur || (FIN.market==='EU'?'—':'USD'));
      const shownD0=financialDisplayDate(0), shownD1=financialDisplayDate(1);
      const titleTxt = `${FIN.ticker} · ${mkt} · ${FIN.mode==='annual'?t('period_annual_cap'):t('period_quarter_cap')} · ${fmtDate(shownD0)}${shownD1?'  ↔  '+fmtDate(shownD1):''} · ${curLbl}`;
      rt.setAttribute('data-title', titleTxt);
      const cached=LOGO_CACHE[logoCacheKey(FIN.ticker, FIN.market)]||FIN.logoid||'';
      rt.innerHTML=logoHtml(cached, FIN.ticker, 28, {...logoOptsFromFin(), logoid:cached})+`<span>${safeHTML(titleTxt)}</span>`;
      applyStockLogo(myGen!=null?myGen:REQ_GEN, FIN.ticker);
    }
  }
  // Dönem notu: bildirilme tarihi + yıllık veride gecikme açıklaması
  const pn=document.getElementById('periodNote');
  if(pn){
    if(FIN && FIN.market==='BIST'){
      const bankTxt = FIN.bankGroup==='UFRS' ? t('pn_bank') : '';
      pn.innerHTML = (FIN.mode==='annual' ? t('pn_bist_a') : t('pn_bist_q')) + bankTxt;
    }else if(FIN && FIN.market==='EU'){
      const via = FIN.ifrsSource
        ? (FIN.mode==='quarter' ? t('pn_eu_q') : t('pn_eu_a'))
        : t('pn_eu_tv');
      pn.innerHTML = `📅 ${FIN.euInfo?FIN.euInfo.country+' '+t('pn_eu_ex'):''}${via}${FIN.mode==='annual'?t('pn_eu_fresh'):''}`;
    }else if(FIN){
      const filedTxt = FIN.filedD0 ? tf('pn_sec_filed',{d:fmtDate(FIN.filedD0)}) : '';
      const lagTxt = FIN.mode==='annual' ? t('pn_sec_a') : t('pn_sec_q');
      pn.innerHTML = (filedTxt + lagTxt).trim();
    }else{
      pn.textContent='';
    }
  }
  flushVoicePendingCard(FIN && FIN.ticker);
}

/* ---------- Dışa aktarma: PDF (yazdır) & Excel (CSV) ---------- */
function exportPDF(){ window.print(); }

function csvCell(s){ s=String(s==null?'':s).replace(/ /g,' ').replace(/\s*\n\s*/g,' ').trim(); return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function domTableRows(bodySel){
  const tb=document.querySelector(bodySel); if(!tb) return [];
  return [...tb.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')]
    .filter(c=>!c.classList.contains('row-actions'))
    .map(c=>c.innerText.replace(/\s*\n\s*/g,' ').trim()));
}
function exportCSV(){
  const d=readData();
  if(!d.length){ alert('Önce veri girip "Analiz Et"e basın.'); return; }
  const sep=';', L=[];
  const push=(...c)=>L.push(c.map(csvCell).join(sep));
  const section=(title,headers,bodySel)=>{ push(title); push(...headers); domTableRows(bodySel).forEach(r=>push(...r)); push(''); };

  push('Bilanço Analiz Raporu');
  push('Şirket', FIN?FIN.ticker:'Elle girilen veri');
  push('Dönem', FIN?(FIN.mode==='annual'?'Yıllık':'Çeyreklik'):'—');
  if(FIN) push('Tarih', fmtDate(FIN.D0)+(FIN.D1?' / '+fmtDate(FIN.D1):''));
  push('Para birimi', CUR);
  push('Oluşturma', new Date().toLocaleString('tr-TR'));
  push('');

  // Bilanço (ham sayılarla)
  push('BİLANÇO'); push('Kalem','Kategori','Cari','Önceki');
  d.forEach(r=> push(r.name, CATS[r.cat], Math.round(r.cur), Math.round(r.prev)));
  push('');

  section('FİNANSAL ORANLAR', ['Oran','Cari','Önceki','Değişim','Durum'], '#ratioBody');
  if(FIN){
    section('GELİR TABLOSU', ['Kalem','Cari','Önceki','Değişim'], '#incomeBody');
    section('KÂRLILIK ORANLARI', ['Oran','Cari','Önceki','Değişim','Durum'], '#profBody');
  }
  section('ÖNEMLİ DEĞİŞİMLER', ['Kalem','Cari','Önceki',`Değişim (${CURSYM||CUR})`,'Değişim (%)','Yön'], '#varBody');

  const csv='﻿'+L.join('\r\n');   // UTF-8 BOM → Excel Türkçe karakterleri doğru okur
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  const name=(FIN?FIN.ticker:'bilanco')+'-analiz-'+new Date().toISOString().slice(0,10)+'.csv';
  a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---- Gelir tablosu & kârlılık ---- */
function renderIncome(T){
  const I=FIN.income, D0=FIN.D0, D1=FIN.D1;
  const iv=(k,d)=> (d && I[k] && (d in I[k])) ? I[k][d] : null;
  // Gelir/Net kâr için tarih, bilanço D0 ile birebir olmayabilir → gelir serisinin en güncel 2 tarihi
  const revDates=Object.keys(I.revenue||{}).sort().reverse();
  const R0=revDates[0]||D0, R1=revDates[1]||D1;

  // KPI kartları: Gelir, Net Kâr, Net Marj, ROE
  const rev0=iv('revenue',R0), rev1=iv('revenue',R1);
  const ni0=iv('netIncome',R0), ni1=iv('netIncome',R1);
  const nm0=(rev0&&ni0!=null)?ni0/rev0:null, nm1=(rev1&&ni1!=null)?ni1/rev1:null;
  const roe0=T.cur.ozkaynak?(ni0!=null?ni0/T.cur.ozkaynak:null):null;
  const roe1=T.prev.ozkaynak?(ni1!=null?ni1/T.prev.ozkaynak:null):null;
  const kpi=(lbl,c,p,fmtFn,inv)=>{
    if(c==null){ return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">—</div></div>`; }
    let delta='';
    if(p!=null && p!==0){ const ch=(c-p)/Math.abs(p)*100; const good=inv?ch<0:ch>0;
      const cls=Math.abs(ch)<0.05?'neutral':(good?'up':'down'); const ar=Math.abs(ch)<0.05?'→':(ch>0?'▲':'▼');
      delta=`<div class="delta ${cls}">${ar} ${pct(ch)} <span class="neutral">(${t('kpi_prev')} ${fmtFn(p)})</span></div>`; }
    return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">${fmtFn(c)}</div>${delta}</div>`;
  };
  const pp=v=>(v==null?'—':(v*100).toFixed(1)+'%');
  document.getElementById('profKpis').innerHTML=[
    kpi(t('inc_rev'), rev0, rev1, fmtAbbr),
    kpi(t('inc_ni'), ni0, ni1, fmtAbbr),
    kpi(t('inc_nm'), nm0, nm1, pp),
    kpi(t('inc_roe'), roe0, roe1, pp),
  ].join('');

  // Gelir tablosu satırları
  const lines=[
    [t('inc_rev'),'revenue',false],
    [t('inc_cogs'),'costRev',true],
    [t('inc_gp'),'grossProfit',false],
    [t('inc_op'),'opIncome',false],
    [t('inc_rnd'),'rnd',true],
    [t('inc_ni'),'netIncome',false],
  ];
  document.getElementById('incomeBody').innerHTML=lines.map(([lbl,k,inv])=>{
    const c=iv(k,R0), p=iv(k,R1);
    if(c==null&&p==null) return '';
    let ch='—';
    if(c!=null&&p!=null&&p!==0){ const d=(c-p)/Math.abs(p)*100; const good=inv?d<0:d>0;
      const cls=Math.abs(d)<0.05?'neutral':(good?'up':'down'); ch=`<span class="${cls}">${pct(d)}</span>`; }
    return `<tr><td>${lbl}</td><td><b>${c==null?'—':fmtAbbr(c)}</b></td><td>${p==null?'—':fmtAbbr(p)}</td><td>${ch}</td></tr>`;
  }).filter(Boolean).join('');

  // Kârlılık oranları tablosu
  const gp0=iv('grossProfit',R0), gp1=iv('grossProfit',R1);
  const op0=iv('opIncome',R0), op1=iv('opIncome',R1);
  const roa0=T.cur.toplamV?(ni0!=null?ni0/T.cur.toplamV:null):null;
  const roa1=T.prev.toplamV?(ni1!=null?ni1/T.prev.toplamV:null):null;
  const defs=[
    [t('inc_gm'),t('inc_gm_f'), rev0?(gp0!=null?gp0/rev0:null):null, rev1?(gp1!=null?gp1/rev1:null):null, v=>v>=0.4?'good':v>=0.2?'warn':'bad'],
    [t('inc_om'),t('inc_om_f'), rev0?(op0!=null?op0/rev0:null):null, rev1?(op1!=null?op1/rev1:null):null, v=>v>=0.15?'good':v>=0.05?'warn':'bad'],
    [t('inc_nm'),t('inc_nm_f'), nm0, nm1, v=>v>=0.1?'good':v>=0.03?'warn':'bad'],
    [t('inc_roe'),t('inc_roe_f'), roe0, roe1, v=>v>=0.15?'good':v>=0.08?'warn':'bad'],
    [t('inc_roa'),t('inc_roa_f'), roa0, roa1, v=>v>=0.07?'good':v>=0.03?'warn':'bad'],
  ];
  document.getElementById('profBody').innerHTML=defs.map(([nm,fo,c,p,st])=>{
    const status=c==null?'warn':st(c);
    const lbl=c==null?'—':statusPill(status);
    let ch='—';
    if(c!=null&&p!=null){ const d=(c-p)*100; ch=(d>=0?'▲ +':'▼ ')+d.toFixed(1)+'p'; }
    return `<tr>
      <td><span class="ratio-name">${nm}</span><br><span class="ratio-formula">${fo}</span></td>
      <td><b>${pp(c)}</b></td><td>${pp(p)}</td><td>${ch}</td>
      <td><span class="pill ${status}">${lbl}</span></td></tr>`;
  }).join('');
}


/* ---- Teknik Görünüm & Risk (her iki pazar — TradingView; ABD'ye Finviz kısa pozisyonu eklenir) ---- */
let TECH_SHORT=null;   // ABD: fetchTargets doldurur {floatPct, ratio}
const TECH_COLS=['RSI','SMA50','SMA200','price_52_week_high','price_52_week_low',
  'Perf.W','Perf.1M','Perf.3M','Perf.YTD','Perf.Y','beta_1_year','Volatility.M','close'];
/* Ehlers Fisher Transform (periyot 21) — TV scanner'da yok, günlük kapanışlardan hesaplanır */
function fisherTransform(closes, period){
  const n=period==null?21:period;
  if(!closes || closes.length<n+2) return null;
  let valuePrev=0, fishPrev=0, fisher=null, trigger=null;
  for(let i=n-1;i<closes.length;i++){
    let hi=-Infinity, lo=Infinity;
    for(let j=i-n+1;j<=i;j++){
      const p=closes[j];
      if(p>hi) hi=p;
      if(p<lo) lo=p;
    }
    let val=hi!==lo ? 0.33*2*((closes[i]-lo)/(hi-lo)-0.5)+0.67*valuePrev : 0.67*valuePrev;
    if(val>0.999) val=0.999;
    if(val<-0.999) val=-0.999;
    const fish=0.5*Math.log((1+val)/(1-val))+0.5*fishPrev;
    trigger=fishPrev;
    fisher=fish;
    valuePrev=val;
    fishPrev=fish;
  }
  return { fisher, trigger };
}
async function fetchTechPanel(sym, market, myGen, euOpt){
  const card=document.getElementById('techCard'), box=document.getElementById('techBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">'+t('tech_loading')+'</div>';
  try{
    const scan = euOpt ? euOpt.scan : (market==='BIST'?'turkey':'america');
    const tickers = euOpt ? [euOpt.tv] : (market==='BIST'?['BIST:'+sym]:['NASDAQ:'+sym,'NYSE:'+sym,'AMEX:'+sym]);
    const ysym = market==='BIST' ? (sym+'.IS') : (euOpt && euOpt.ysym ? euOpt.ysym : sym);
    const [r, priceJ]=await Promise.all([
      fetch('https://scanner.tradingview.com/'+scan+'/scan',
        {method:'POST',body:JSON.stringify({symbols:{tickers},columns:TECH_COLS})}),
      fetch('/price?s='+encodeURIComponent(ysym)+'&range=6mo').then(x=>x.ok?x.json():null).catch(()=>null)
    ]);
    const j=r.ok?await r.json():null;
    if(myGen!=null && myGen!==REQ_GEN) return;
    const row=(j&&j.data||[]).find(x=>x.d && x.d[0]!=null);
    if(!row){ box.innerHTML='<div class="hint">'+t('tech_none')+'</div>'; return; }
    const [rsi,sma50,sma200,hi52,lo52,pW,p1M,p3M,pYTD,pY,beta,volM,close]=row.d;
    const closes=((((((priceJ||{}).chart||{}).result||[])[0]||{}).indicators||{}).quote||[])[0];
    const closeArr=((closes&&closes.close)||[]).filter(x=>x!=null&&Number.isFinite(x));
    const fish=fisherTransform(closeArr, 21);
    const num=(v,d)=> v==null?'—':Number(v).toFixed(d==null?2:d);
    const clsOf=v=> v==null?'neutral':(v>0?'up':v<0?'down':'neutral');
    const sgn=v=> v==null?'—':(v>0?'+':'')+v.toFixed(1)+'%';
    // RSI bölgesi
    const rsiZone= rsi==null?['—','neutral'] : rsi>=70?[t('tech_ob'),'down'] : rsi<=30?[t('tech_os'),'up'] : [t('tech_neutral'),'neutral'];
    let fishZone=['—','neutral'], fishSub='';
    if(fish && fish.fisher!=null){
      const f=fish.fisher, trig=fish.trigger;
      const cross=trig==null?'':(f>trig?t('tech_fish_gt'):f<trig?t('tech_fish_lt'):t('tech_neutral'));
      if(f>=2) fishZone=[t('tech_fish_ob'),'down'];
      else if(f<=-2) fishZone=[t('tech_fish_os'),'up'];
      else if(f>trig) fishZone=[t('tech_mom_up'),'up'];
      else if(f<trig) fishZone=[t('tech_mom_dn'),'down'];
      else fishZone=[t('tech_neutral'),'neutral'];
      fishSub=(cross?(cross+' · '):'')+t('tech_trig')+' '+num(trig,2);
    }
    // Ortalamalara mesafe
    const d50=(close&&sma50)?(close/sma50-1)*100:null;
    const d200=(close&&sma200)?(close/sma200-1)*100:null;
    // 52 hafta konumu
    const pos=(close!=null&&hi52!=null&&lo52!=null&&hi52>lo52)?(close-lo52)/(hi52-lo52)*100:null;
    const kpi=(lbl,val,sub,cls)=>`<div class="kpi"><div class="lbl">${lbl}</div>
      <div class="val" ${cls&&cls!=='neutral'?`style="color:var(--${cls==='up'?'good':'bad'})"`:''}>${val}</div>
      ${sub?`<div class="delta neutral">${sub}</div>`:''}</div>`;
    let html='<div class="grid" style="margin-bottom:16px">';
    html+=kpi('RSI (14)', num(rsi,1), rsiZone[0], rsiZone[1]);
    html+=kpi(t('tech_fish'), fish&&fish.fisher!=null?num(fish.fisher,2):'—', fishSub||fishZone[0], fishZone[1]);
    html+=kpi(t('tech_d50'), sgn(d50), 'SMA50: '+num(sma50), clsOf(d50));
    html+=kpi(t('tech_d200'), sgn(d200), 'SMA200: '+num(sma200), clsOf(d200));
    html+=kpi(t('tech_beta'), num(beta), beta==null?'':(beta>1.2?t('tech_beta_hot'):beta<0.8?t('tech_beta_calm'):t('tech_beta_ok')));
    html+=kpi(t('tech_vol'), num(volM,1)+'%', t('tech_vol_sub'));
    html+='</div>';
    // 52 hafta konum çubuğu
    if(pos!=null){
      html+=`<div style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">${t('tech_52')} —
          <b style="color:var(--ink)">%${pos.toFixed(0)}</b>
          <span class="neutral">(${t('tech_lo')} ${fmtUSD(lo52)} · ${t('tech_hi')} ${fmtUSD(hi52)})</span></div>
        <div style="position:relative;height:10px;border-radius:6px;background:linear-gradient(90deg,var(--bad),var(--warn),var(--good))">
          <div style="position:absolute;left:${Math.min(99,Math.max(1,pos)).toFixed(1)}%;top:-4px;width:4px;height:18px;background:#fff;border-radius:2px;box-shadow:0 0 0 2px rgba(255,255,255,.25)"></div>
        </div></div>`;
    }
    // Dönemsel getiriler
    const perf=[[t('tech_1w'),pW],[t('tech_1m'),p1M],[t('tech_3m'),p3M],[t('tech_ytd'),pYTD],[t('tech_1y'),pY]];
    html+=`<table><thead><tr>${perf.map(p=>`<th>${p[0]}</th>`).join('')}</tr></thead>
      <tbody><tr>${perf.map(p=>`<td class="${clsOf(p[1])}"><b>${sgn(p[1])}</b></td>`).join('')}</tr></tbody></table>`;
    // ABD kısa pozisyonu (Finviz — fetchTargets doldurur; hazırsa bas, değilse sonra güncellenir)
    html+='<div id="techShortRow"></div>';
    box.innerHTML=html;
    renderTechShort();
  }catch(e){ box.innerHTML='<div class="hint">'+t('tech_none')+': '+e.message+'</div>'; }
}
function renderTechShort(){
  const el=document.getElementById('techShortRow');
  if(!el || !TECH_SHORT || TECH_SHORT.floatPct==null) return;
  const s=TECH_SHORT;
  const cls=s.floatPct>=10?'down':s.floatPct>=5?'warn':'up';
  const sold=t('tech_short_sold');
  el.innerHTML=`<div style="margin-top:14px;padding:11px 14px;border:1px solid var(--line);border-left:4px solid var(--${cls==='down'?'bad':cls==='warn'?'warn':'good'});border-radius:11px;background:var(--surface-2);font-size:12.5px">
    <b style="color:var(--ink)">${t('tech_short')}</b>
    ${t('tech_short_body')} <b class="${cls==='warn'?'neutral':cls}">%${s.floatPct.toFixed(2)}</b>${sold}${s.ratio!=null?` · ${t('tech_short_days')} <b>${s.ratio.toFixed(1)} ${t('tech_short_days_u')}</b>`:''}.
    <span class="neutral">${t('tech_short_note')}</span></div>`;
  const src=document.getElementById('techShortSrc'); if(src) src.textContent=t('tech_short_src');
}

/* ---- Ortaklık Yapısı (pasta grafik) ----
   BIST: İş Yatırım OrtaklikYapisi (/bistown) — ortak adı + %oran ("Diğer" = halka açık kısım).
   ABD: Finviz sahiplik alanları (/targets yanıtındaki own) — kurumsal %, içeriden %, kalan
   halka açık/diğer. SVG donut: stroke-dasharray dilimleri + renkli lejant. */
const PIE_COLORS=['#4f9cf9','#34d39a','#f3b44e','#f06a72','#a78bfa','#38bdf8','#fb923c','#7585a0'];
function pieSVG(slices, centerTop, centerBottom){
  const R=52, C=2*Math.PI*R;
  let off=0;
  const segs=slices.map(s=>{
    const len=Math.max(0,s.pct)/100*C;
    const el=`<circle r="${R}" cx="75" cy="75" fill="none" stroke="${s.color}" stroke-width="26"
      stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
      transform="rotate(-90 75 75)"><title>${s.label}: %${s.pct.toFixed(2)}</title></circle>`;
    off+=len; return el;
  }).join('');
  return `<svg viewBox="0 0 150 150" width="185" height="185" style="flex:0 0 auto">${segs}
    <text x="75" y="70" text-anchor="middle" font-size="16" font-weight="800" fill="var(--ink)">${centerTop||''}</text>
    <text x="75" y="88" text-anchor="middle" font-size="9.5" fill="var(--muted)">${centerBottom||''}</text></svg>`;
}
function renderOwnerPie(slices, note){
  const card=document.getElementById('ownerCard'), box=document.getElementById('ownerBody');
  if(!card||!box) return;
  slices=slices.filter(s=>s.pct>0.01);
  if(!slices.length){ card.classList.add('hidden'); hideOwnerFloat(); return; }
  slices.forEach((s,i)=>s.color=PIE_COLORS[i%PIE_COLORS.length]);
  // Merkezde halka açıklık oranı (varsa)
  const halka=slices.find(s=>/halka|diğer/i.test(s.label));
  const legend=slices.map(s=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px">
    <span style="width:11px;height:11px;border-radius:3px;background:${s.color};flex:0 0 auto"></span>
    <span style="color:var(--ink);flex:1">${safeHTML(s.label)}</span>
    <b style="color:var(--ink);font-variant-numeric:tabular-nums">%${s.pct.toFixed(2)}</b></div>`).join('');
  box.innerHTML=`<div style="display:flex;gap:26px;align-items:center;flex-wrap:wrap">
    ${pieSVG(slices, halka?('%'+halka.pct.toFixed(1)):'', halka?t('owner_float'):'')}
    <div style="flex:1;min-width:230px">${legend}
      ${note?`<div class="hint" style="margin-top:8px">${note}</div>`:''}</div></div>`;
  card.classList.remove('hidden');
}
/* Fiili dolaşımdaki senet:
   BIST → KAP / MKK güncel `actualSharesOutstanding` (doğrudan; formül yok).
   ABD → Finviz Shs Float (doğrudan). Yalnız BIST / ABD. */
function hideOwnerFloat(){
  const el=document.getElementById('ownerFloatBody');
  if(el){ el.classList.add('hidden'); el.innerHTML=''; }
}
function fmtKapAsOf(ymd){
  const s=String(ymd||'');
  if(/^\d{8}$/.test(s)) return s.slice(6,8)+'.'+s.slice(4,6)+'.'+s.slice(0,4);
  return s||null;
}
function renderOwnerFloatKpis({ floatPct, floatShares, floatLabel, note }){
  const el=document.getElementById('ownerFloatBody');
  if(!el) return;
  if(floatShares==null && floatPct==null){ hideOwnerFloat(); return; }
  const cell=(lbl,val,sub)=>`<div class="kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub?`<div class="hint">${sub}</div>`:''}</div>`;
  el.innerHTML=`<div class="grid" style="margin:0">
    ${cell(t('owner_float_kpi'), floatPct!=null?('%'+Number(floatPct).toFixed(2)):'—', t('owner_float_sub'))}
    ${cell(t('owner_float_shares'), floatShares!=null?fmtShort(floatShares):'—', floatLabel||t('owner_float_src'))}
  </div>
  ${note?`<div class="hint" style="margin-top:8px">${note}</div>`:''}`;
  el.classList.remove('hidden');
}
async function fetchOwnershipBIST(sym, myGen){
  try{
    const [j, fl]=await Promise.all([
      fetch('/bistown?hisse='+encodeURIComponent(sym)).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch('/bistfloat?hisse='+encodeURIComponent(sym)).then(r=>r.ok?r.json():null).catch(()=>null)
    ]);
    if(myGen!=null && myGen!==REQ_GEN) return;
    let rows=((j&&j.value)||[]).map(v=>({
      label:(v.FO_ORTAK||'').trim(), pct:parseFloat(String(v.FO_ORTAK_ORANI||'').replace(',','.'))||0
    })).filter(r=>r.label && r.pct>0);
    if(!rows.length){ document.getElementById('ownerCard')?.classList.add('hidden'); hideOwnerFloat(); return; }
    rows.forEach(r=>{ if(/^diğer$/i.test(r.label)) r.label='Halka Açık / Diğer'; });
    rows.sort((a,b)=>b.pct-a.pct);
    const inst=document.getElementById('ownerInstBody');
    if(inst){ inst.classList.add('hidden'); inst.innerHTML=''; }
    renderOwnerPie(rows, 'Kaynak: KAP ortaklık yapısı (İş Yatırım aracılığıyla). "Halka Açık / Diğer" borsada işlem gören kısımdır.');
    const halka=rows.find(s=>/halka|diğer/i.test(s.label));
    const floatShares=(fl && fl.floatShares!=null && Number.isFinite(fl.floatShares)) ? fl.floatShares : null;
    const floatPct=(fl && fl.floatPct!=null && Number.isFinite(fl.floatPct)) ? fl.floatPct
      : (halka ? halka.pct : null);
    const asOf=fmtKapAsOf(fl && fl.asOf);
    if(floatShares!=null || floatPct!=null){
      renderOwnerFloatKpis({
        floatPct,
        floatShares,
        note: floatShares!=null
          ? (`Kaynak: KAP — MKK güncel fiili dolaşım`+(asOf?` (${asOf})`:'')+`.`)
          : 'KAP fiili dolaşım verisi alınamadı; oran ortaklık yapısından.'
      });
    }else hideOwnerFloat();
  }catch(e){ document.getElementById('ownerCard')?.classList.add('hidden'); hideOwnerFloat(); }
}
/* Avrupa: isim-isim ortak listesi için ücretsiz kaynak yok (KAP/Finviz karşılığı yok) —
   TradingView'in fiili dolaşım (free float) verisiyle 2 dilimli pasta: halka açık vs büyük ortaklar. */
function renderOwnershipEU(floatPct, floatShares, totalShares){
  const inst=document.getElementById('ownerInstBody');
  if(inst){ inst.classList.add('hidden'); inst.innerHTML=''; }
  hideOwnerFloat();   // fiili dolaşım KPI yalnız BIST / ABD
  if(floatPct==null || floatPct<=0 || floatPct>100){ document.getElementById('ownerCard')?.classList.add('hidden'); return; }
  const slices=[
    { label:'Halka Açık Dolaşım (free float)', pct:floatPct },
    { label:'Büyük Ortaklar / Stratejik Paylar', pct:Math.max(0,100-floatPct) }
  ];
  let note='Kaynak: TradingView fiili dolaşım verisi. Bu borsada pay sahipleri isim isim tek merkezden açıklanmaz; dağılım halka açık / büyük ortak olarak raporlanır.';
  if(floatShares && totalShares) note+=` Fiili dolaşım: ${fmtShort(floatShares)} / ${fmtShort(totalShares)} pay.`;
  renderOwnerPie(slices, note);
}
function renderOwnershipUS(own, ysym){
  if(!own || own.inst==null){ document.getElementById('ownerCard')?.classList.add('hidden'); hideOwnerFloat(); return; }
  const inst=own.inst||0, ins=own.insider||0;
  const other=Math.max(0, 100-inst-ins);
  const slices=[
    { label:'Kurumsal Yatırımcılar (fonlar)', pct:inst },
    { label:'Şirket İçi (yönetici/kurucu)', pct:ins },
    { label:'Halka Açık / Bireysel Diğer', pct:other }
  ];
  let note='Kaynak: Finviz. ABD\'de pay sahipleri isim isim açıklanmaz; dağılım kurumsal/içeriden/diğer olarak raporlanır.';
  if(own.shsFloat && own.shsOut) note+=` Fiili dolaşım: ${fmtShort(own.shsFloat)} / ${fmtShort(own.shsOut)} pay (%${(own.shsFloat/own.shsOut*100).toFixed(1)}).`;
  renderOwnerPie(slices, note);
  const floatPct=own.shsOut && own.shsFloat ? (own.shsFloat/own.shsOut*100) : null;
  if(own.shsFloat!=null || floatPct!=null){
    renderOwnerFloatKpis({
      floatPct,
      floatShares:own.shsFloat!=null ? own.shsFloat : null,
      floatLabel:'Finviz Shs Float',
      note:'Kaynak: Finviz — Shs Float (fiili dolaşımdaki senet, doğrudan).'
    });
  }else hideOwnerFloat();
  if(ysym) fetchInstitutionalHolders(ysym);
}
async function fetchInstitutionalHolders(ysym){
  const box=document.getElementById('ownerInstBody');
  if(!box) return;
  box.classList.remove('hidden');
  box.innerHTML='<div class="hint">Kurumsal sahipler (13F) yükleniyor…</div>';
  try{
    const j=await fetch('/yqs?s='+encodeURIComponent(ysym)+'&m=institutionOwnership,majorHoldersBreakdown').then(r=>r.ok?r.json():null);
    const holders=((j&&j.institutionOwnership&&j.institutionOwnership.ownershipList)||[]).slice(0,12);
    if(!holders.length){ box.innerHTML='<div class="hint">Kurumsal sahip listesi bulunamadı.</div>'; return; }
    const rows=holders.map(h=>{
      const pct=h.pctHeld!=null?(h.pctHeld*100):null;
      const sh=h.position!=null?h.position:null;
      const dt=h.reportDate==null?'—':(Number(h.reportDate)>1e12
        ? new Date(Number(h.reportDate)).toLocaleDateString('tr-TR')
        : new Date(Number(h.reportDate)*1000).toLocaleDateString('tr-TR'));
      return `<tr>
        <td><b>${safeHTML(h.organization||'—')}</b></td>
        <td>${pct==null?'—':'%'+pct.toFixed(2)}</td>
        <td>${sh==null?'—':Number(sh).toLocaleString('tr-TR')}</td>
        <td style="color:var(--muted);font-size:12px">${dt}</td>
      </tr>`;
    }).join('');
    box.innerHTML=`<div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--ink)">En büyük kurumsal sahipler (13F)</div>
      <div style="overflow-x:auto"><table><thead><tr><th>Kurum</th><th>Pay %</th><th>Adet</th><th>Rapor</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="hint" style="margin-top:8px">Kaynak: Yahoo institutionOwnership — OpenBB equity.ownership karşılığı.</div>`;
  }catch(e){ box.innerHTML='<div class="hint">Kurumsal sahipler alınamadı.</div>'; }
}

/* ---- İçeriden Alım-Satım — SEC Form 4 (yalnızca ABD) ----
   submissions JSON'dan son Form 4'ler → her birinin ham form4.xml'i /secw köprüsünden
   (xsl klasör öneki atılır) → isim, ünvan, işlem kodu, adet, fiyat DOMParser ile çözülür. */
function form4Code(code){
  const map={ P:['insider_buy','up'], S:['insider_sell','down'], M:['insider_opt','neutral'],
    A:['insider_award','neutral'], F:['insider_tax','neutral'], G:['insider_gift','neutral'],
    D:['insider_dispose','down'], C:['insider_conv','neutral'], X:['insider_opt','neutral'] };
  const m=map[code]; return m?[t(m[0]),m[1]]:[code||'—','neutral'];
}
async function fetchInsiders(cik, myGen){
  const card=document.getElementById('insiderCard'), box=document.getElementById('insiderBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">'+t('insider_loading')+'</div>';
  try{
    const sub=await fetch('/sec/submissions/CIK'+cik+'.json').then(r=>r.ok?r.json():null);
    if(myGen!=null && myGen!==REQ_GEN) return;
    const rec=sub&&sub.filings&&sub.filings.recent;
    if(!rec){ box.innerHTML='<div class="hint">Bildirim verisi alınamadı.</div>'; return; }
    const picks=[];
    for(let i=0;i<rec.form.length && picks.length<10;i++){
      if(rec.form[i]==='4') picks.push({ acc:rec.accessionNumber[i], date:rec.filingDate[i], doc:rec.primaryDocument[i] });
    }
    if(!picks.length){ box.innerHTML='<div class="hint">Yakın tarihli Form 4 bildirimi yok.</div>'; return; }
    const cikNum=parseInt(cik,10);
    const results=await Promise.all(picks.map(async p=>{
      try{
        const folder=p.acc.replace(/-/g,'');
        const raw=(p.doc||'').replace(/^.*\//,'');          // "xslF345X06/form4.xml" → "form4.xml"
        const url='/secw/Archives/edgar/data/'+cikNum+'/'+folder+'/'+raw;
        const xml=await fetch(url).then(r=>r.ok?r.text():'');
        if(!xml) return null;
        const doc=new DOMParser().parseFromString(xml,'text/xml');
        const gv=(el,tag)=>{ const n=el.querySelector(tag); if(!n) return ''; const v=n.querySelector('value'); return (v?v.textContent:n.textContent).trim(); };
        const name=gv(doc,'rptOwnerName');
        const title=gv(doc,'officerTitle') || (gv(doc,'isDirector')==='1'?'Yönetim Kurulu Üyesi':'') || (gv(doc,'isTenPercentOwner')==='1'?'%10+ Ortak':'');
        const tx=doc.querySelector('nonDerivativeTransaction');
        let code='', shares=null, price=null, tdate=p.date;
        if(tx){
          code=gv(tx,'transactionCode');
          shares=parseFloat(gv(tx,'transactionShares'))||null;
          price=parseFloat(gv(tx,'transactionPricePerShare'))||null;
          tdate=gv(tx,'transactionDate')||p.date;
        }
        const view='https://www.sec.gov/Archives/edgar/data/'+cikNum+'/'+folder+'/'+p.doc;
        return { name, title, code, shares, price, tdate, view };
      }catch(e){ return null; }
    }));
    if(myGen!=null && myGen!==REQ_GEN) return;
    const rows=results.filter(Boolean);
    if(!rows.length){ box.innerHTML='<div class="hint">Form 4 belgeleri okunamadı.</div>'; return; }
    box.innerHTML=`<table><thead><tr><th>${t('th_date')}</th><th>${t('insider_who')}</th><th>${t('insider_tx')}</th><th>${t('insider_shares')}</th><th>${t('th_px')}</th><th></th></tr></thead><tbody>
      ${rows.map(r=>{
        const [ad,cls]=form4Code(r.code);
        return `<tr>
          <td style="white-space:nowrap">${fmtDate(r.tdate)}</td>
          <td style="white-space:normal">${safeHTML(r.name)}${r.title?`<br><span class="ratio-formula">${safeHTML(r.title)}</span>`:''}</td>
          <td class="${cls}">${ad}</td>
          <td>${r.shares!=null?Math.round(r.shares).toLocaleString(localeTag()):'—'}</td>
          <td>${r.price!=null?'$'+r.price.toFixed(2):'—'}</td>
          <td><a href="${r.view}" target="_blank" rel="noopener">${t('insider_see_sec')}</a></td>
        </tr>`;
      }).join('')}
    </tbody></table>
    <div class="hint" style="margin-top:8px">${t('insider_note')}</div>`;
  }catch(e){ box.innerHTML='<div class="hint">Form 4 alınamadı: '+e.message+'</div>'; }
}

/* ---- Quant risk/getiri (1Y günlük fiyat serisi) ---- */
/* ---- Fiyat Grafiği (etkileşimli SVG, bağımsız) ---- */
let CHART_STATE={ sym:null, ysym:null, range:'1y', filedD0:null, filedD1:null };
const CHART_RANGE_MAP={'1mo':{yrange:'1mo'},'3mo':{yrange:'3mo'},'6mo':{yrange:'6mo'},'1y':{yrange:'1y'},'5y':{yrange:'5y'}};
async function fetchPriceChart(sym, ysym, myGen){
  const card=document.getElementById('chartCard');
  if(!card) return;
  CHART_STATE.sym=sym; CHART_STATE.ysym=ysym||sym;
  CHART_STATE.filedD0=FIN&&FIN.filedD0; CHART_STATE.filedD1=FIN&&FIN.filedD1;
  card.classList.remove('hidden');
  document.querySelectorAll('#chartBtns button').forEach(b=>b.classList.toggle('primary', b.dataset.r===CHART_STATE.range));
  loadChartRange(myGen);
}
function setChartRange(r){ CHART_STATE.range=r; document.querySelectorAll('#chartBtns button').forEach(b=>b.classList.toggle('primary', b.dataset.r===r)); loadChartRange(REQ_GEN); }
async function loadChartRange(myGen){
  const box=document.getElementById('chartBody'), info=document.getElementById('chartInfo');
  box.innerHTML='<div class="hint">'+t('chart_loading')+'</div>';
  try{
    const yr=CHART_RANGE_MAP[CHART_STATE.range].yrange;
    const r=await fetch(`/price?s=${encodeURIComponent(CHART_STATE.ysym)}&range=${yr}`).then(x=>x.json());
    if(myGen!=null && myGen!==REQ_GEN) return;
    const res=r&&r.chart&&r.chart.result&&r.chart.result[0];
    const ts=(res&&res.timestamp)||[];
    let closes=(res&&res.indicators&&res.indicators.quote&&res.indicators.quote[0].close)||[];
    if(res&&res.meta&&res.meta.currency==='GBp') closes=closes.map(c=>c==null?c:c/100);   // peni → pound
    const pts=ts.map((t,i)=>[t*1000,closes[i]]).filter(p=>p[1]!=null);
    if(pts.length<2){ box.innerHTML='<div class="hint">Bu dönem için grafik verisi bulunamadı.</div>'; return; }
    drawPriceChart(box, pts);
    const first=pts[0][1], last=pts[pts.length-1][1];
    const ch=(last-first)/first*100;
    info.innerHTML=`Dönem değişimi: <span class="${ch>=0?'up':'down'}">${ch>=0?'▲':'▼'} ${pct(ch)}</span>`;
  }catch(e){ box.innerHTML='<div class="hint">Grafik alınamadı: '+e.message+'</div>'; }
}
function drawPriceChart(box, pts){
  const W=680, H=220, padL=52, padR=14, padT=14, padB=26;
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const spanY=(maxY-minY)||Math.abs(maxY)||1;
  const X=t=> padL + (maxX>minX ? (t-minX)/(maxX-minX) : 0)*(W-padL-padR);
  const Y=v=> padT + (1-(v-minY)/spanY)*(H-padT-padB);
  let path='M'+pts.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join(' L');
  const areaPath=path+` L${X(xs[xs.length-1]).toFixed(1)},${(H-padB).toFixed(1)} L${X(xs[0]).toFixed(1)},${(H-padB).toFixed(1)} Z`;
  const up = pts[pts.length-1][1]>=pts[0][1];
  const col = up?'var(--good)':'var(--bad)';
  // Bilanço açıklanma günleri işaretle (varsa, grafik aralığındaysa)
  const markers=[CHART_STATE.filedD0, CHART_STATE.filedD1].filter(Boolean).map(d=>{
    const t=new Date(d).getTime();
    if(t<minX||t>maxX) return '';
    const x=X(t);
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${padT}" y2="${H-padB}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="3,3"/>
      <circle cx="${x.toFixed(1)}" cy="${padT}" r="3" fill="var(--gold)"><title>Bilanço açıklanma: ${fmtDate(d)}</title></circle>`;
  }).join('');
  // Y ekseni 4 çizgi + etiket
  let grid='';
  for(let i=0;i<=3;i++){ const v=minY+spanY*i/3; const y=Y(v); grid+=`<line x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/><text x="4" y="${(y+4).toFixed(1)}" font-size="10" fill="var(--muted)">${fmtUSD(v)}</text>`; }
  const fXAxis=new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short'});
  const xLabels=[0,Math.floor(pts.length/2),pts.length-1].map(i=>{
    const p=pts[i]; return `<text x="${X(p[0]).toFixed(1)}" y="${H-8}" font-size="10" fill="var(--muted)" text-anchor="middle">${fXAxis.format(new Date(p[0]))}</text>`;
  }).join('');
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;background:var(--surface-2);border-radius:12px;border:1px solid var(--line)">
    ${grid}
    <path d="${areaPath}" fill="${col}" opacity="0.10"/>
    <path d="${path}" fill="none" stroke="${col}" stroke-width="2"/>
    ${markers}
    ${xLabels}
  </svg>
  <div class="hint chart-source-hint" style="margin-top:6px">${safeHTML(t(marketLabelKey('chart_marker')))}</div>`;
}

/* ---- Sektör Karşılaştırması (TradingView tarayıcı API'si) ---- */
async function fetchSectorComparison(sym, market, myGen, euOpt){
  const card=document.getElementById('sectorCard'), box=document.getElementById('sectorBody'), sub=document.getElementById('sectorSub');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">'+t('sector_loading')+'</div>';
  try{
    const scan = euOpt ? euOpt.scan : (market==='BIST' ? 'turkey' : 'america');
    const cols=['name','description','sector','close','market_cap_basic','price_earnings_ttm','price_book_fq','return_on_equity','net_margin','number_of_employees'];
    // 1) Hissenin sektörünü öğren (ABD'de birden çok borsa öneki denenir; Avrupa'da borsa kesin bilindiğinden tek deneme)
    const tickers = euOpt ? [euOpt.tv] : (market==='BIST' ? ['BIST:'+sym] : ['NASDAQ:'+sym,'NYSE:'+sym,'AMEX:'+sym]);
    const r1=await fetch('https://scanner.tradingview.com/'+scan+'/scan',{method:'POST',body:JSON.stringify({symbols:{tickers},columns:cols})});
    const j1=r1.ok?await r1.json():null;
    if(myGen!=null && myGen!==REQ_GEN) return;
    const me=j1&&j1.data&&j1.data.find(x=>x.d&&x.d[0]!=null);
    if(!me || !me.d[2]){ box.innerHTML='<div class="hint">Bu hisse için sektör verisi bulunamadı.</div>'; return; }
    const sector=me.d[2];
    sub.innerHTML=`<b>${safeHTML(sector)}</b> sektöründeki en büyük şirketlerle karşılaştırma (piyasa değerine göre). Kaynak: TradingView.`;
    // 2) Aynı sektördeki en büyük 8 şirket
    const r2=await fetch('https://scanner.tradingview.com/'+scan+'/scan',{method:'POST',body:JSON.stringify({
      filter:[{left:'sector',operation:'equal',right:sector}], columns:cols,
      sort:{sortBy:'market_cap_basic',sortOrder:'desc'}, range:[0,8]
    })});
    const j2=r2.ok?await r2.json():null;
    if(myGen!=null && myGen!==REQ_GEN) return;
    let rows=(j2&&j2.data||[]).map(x=>x.d).filter(d=>d&&d[0]);
    if(!rows.some(d=>d[0]===sym)) rows.unshift(me.d);   // hisse listede yoksa başa ekle
    const shown=rows.slice(0,8);
    const med=arr=>{ const v=arr.filter(x=>x!=null).sort((a,b)=>a-b); if(!v.length) return null; const m=Math.floor(v.length/2); return v.length%2?v[m]:(v[m-1]+v[m])/2; };
    const medFK=med(rows.map(d=>d[5])), medPD=med(rows.map(d=>d[6])), medROE=med(rows.map(d=>d[7]));
    // TradingView return_on_equity/net_margin zaten yüzde olarak döner (114.3 = %114.3) → tekrar ×100 yapma
    const pp=v=>v==null?'—':v.toFixed(1)+'%';
    const xx=v=>v==null?'—':v.toFixed(1)+'x';
    // En iyi değeri yeşille vurgula (tabloda gösterilen satırlar arasında). dir=-1 düşük iyi
    // (F/K, PD/DD — ucuzluk), dir=1 yüksek iyi (ROE, Net Marj — kârlılık). Negatif F/K (zarar
    // eden şirket) "en ucuz" sayılmasın diye F/K'de yalnız pozitif değerler karşılaştırılır.
    // Tüm değerler eşitse (veya karşılaştıracak yeterli veri yoksa) hiçbir hücre vurgulanmaz.
    const bestOf=(arr,dir)=>{
      const v=arr.filter(x=>x!=null && (dir>0 || x>0));
      if(v.length<2) return null;
      const best=dir>0?Math.max(...v):Math.min(...v);
      const worst=dir>0?Math.min(...v):Math.max(...v);
      return best!==worst?best:null;
    };
    const bestFK=bestOf(shown.map(d=>d[5]),-1), bestPD=bestOf(shown.map(d=>d[6]),-1);
    const bestROE=bestOf(shown.map(d=>d[7]),1), bestNM=bestOf(shown.map(d=>d[8]),1);
    const cellCls=(v,best)=> (v!=null && best!=null && v===best) ? ' class="up"' : '';
    const trRows=shown.map(d=>{
      const isMe=d[0]===sym;
      return `<tr${isMe?' style="background:var(--surface-3)"':''}>
        <td>${isMe?'<b>':''}${safeHTML(d[0])}${isMe?' ★</b>':''}</td>
        <td>${fmtMcap(d[4])}</td>
        <td${cellCls(d[5],bestFK)}>${xx(d[5])}</td>
        <td${cellCls(d[6],bestPD)}>${xx(d[6])}</td>
        <td${cellCls(d[7],bestROE)}>${pp(d[7])}</td>
        <td${cellCls(d[8],bestNM)}>${pp(d[8])}</td>
        <td>${fmtEmployees(d[9])}</td>
      </tr>`;
    }).join('');
    box.innerHTML=`<table><thead><tr><th>${t('th_code')}</th><th>${t('th_mcap')}</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>${t('peer_nm')}</th><th>${t('th_emp')}</th></tr></thead>
      <tbody>${trRows}
        <tr class="total"><td>${t('peer_median')}</td><td>—</td><td>${xx(medFK)}</td><td>${xx(medPD)}</td><td>${pp(medROE)}</td><td>—</td><td>—</td></tr>
      </tbody></table>
      <div class="hint" style="margin-top:8px">${t('peer_best_hint')}</div>`;
  }catch(e){ box.innerHTML='<div class="hint">'+t('sector_fail')+' '+e.message+'</div>'; }
}

/* ---- İzleme Listesi (localStorage) ---- */
const WATCH_KEY='bilanco_watchlist';
function getWatchlist(){ try{ return JSON.parse(localStorage.getItem(WATCH_KEY)||'[]'); }catch(e){ return []; } }
function saveWatchlist(list){ try{ localStorage.setItem(WATCH_KEY, JSON.stringify(list)); }catch(e){} }
function isWatched(sym, market){ return getWatchlist().some(w=>w.sym===sym && w.market===market); }
/* Avrupa'da tek başına ticker kodu borsalar arası çakışabilir (ör. "MC") → izleme listesi
   anahtarı olarak kod+eki birlikte kullanılır ("SIE.DE"); diğer pazarlarda salt kod yeterli. */
function watchSymFor(){ return FIN.market==='EU' ? FIN.ticker+'.'+FIN.euInfo.suffix : FIN.ticker; }
function updateWatchStar(){
  const btn=document.getElementById('watchStar');
  const forum=document.getElementById('forumWrap');
  if(!btn || !FIN) return;
  btn.classList.remove('hidden');
  if(forum) forum.classList.remove('hidden');
  const on=isWatched(watchSymFor(), FIN.market);
  btn.innerHTML = on ? t('watch_in_list') : t('watch_add');
  btn.classList.toggle('primary', on);
}
function closeForumMenu(){
  const menu=document.getElementById('forumMenu');
  if(menu) menu.classList.add('hidden');
}
function toggleForumMenu(ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  if(!FIN || !FIN.ticker) return;
  const menu=document.getElementById('forumMenu');
  if(!menu) return;
  const willOpen=menu.classList.contains('hidden');
  closeForumMenu();
  if(willOpen) menu.classList.remove('hidden');
}
async function openInvestingForumLocale(locale){
  closeForumMenu();
  if(!FIN || !FIN.ticker) return;
  const sym=FIN.ticker;
  const market=FIN.market||'';
  const exch=FIN.market==='EU'&&FIN.euInfo&&FIN.euInfo.suffix ? FIN.euInfo.suffix
    : (FIN.market==='BIST' ? 'IS' : (FIN.market==='US' ? 'US' : ''));
  const host=locale==='us' ? 'https://www.investing.com' : 'https://tr.investing.com';
  const fallback=host+'/search/?q='+encodeURIComponent(sym)+'&tab=quotes';
  let target=fallback;
  try{
    const r=await fetch('/invforum?s='+encodeURIComponent(sym)
      +'&m='+encodeURIComponent(market)
      +(exch?'&x='+encodeURIComponent(exch):''));
    const j=await r.json();
    const path=(j&&j.path) || (j&&j.url ? (()=>{ try{ const u=new URL(j.url); return u.pathname+u.search; }catch(e){ return ''; } })() : '');
    if(path) target=host+path;
  }catch(e){ /* fallback */ }
  // Telefonda Investing uygulaması Türkçe hesaba bağlıysa www linkini de TR açar.
  // English için önce bizim köprü sayfası / Chrome Intent ile tarayıcıya zorla.
  const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'');
  if(locale==='us' && mobile){
    window.open('/invopen?u='+encodeURIComponent(target), '_blank', 'noopener');
    return;
  }
  window.open(target, '_blank', 'noopener');
}
function openInvestingForum(){ toggleForumMenu(); }
document.addEventListener('click', function(){ closeForumMenu(); });
function toggleWatch(){
  if(!FIN) return;
  let list=getWatchlist();
  const mySym=watchSymFor();
  const key=w=>w.sym===mySym && w.market===FIN.market;
  if(list.some(key)) list=list.filter(w=>!key(w));
  else list.unshift({ sym:mySym, market:FIN.market,
    ysym: FIN.market==='BIST'?FIN.ticker+'.IS':(FIN.market==='EU'?mySym:FIN.ticker),
    ccySym: FIN.market==='EU'?CURSYM:undefined,
    country: FIN.market==='EU'&&FIN.euInfo?FIN.euInfo.country:undefined });
  saveWatchlist(list.slice(0,20));
  updateWatchStar();
  renderWatchlist();
}
async function renderWatchlist(){
  const card=document.getElementById('watchCard'), box=document.getElementById('watchBody');
  if(!card) return;
  const list=getWatchlist();
  if(!list.length){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">'+t('watch_loading')+'</div>';
  const rows=await Promise.all(list.map(async w=>{
    try{
      const r=await fetch(`/price?s=${encodeURIComponent(w.ysym)}&range=1d`).then(x=>x.json());
      const meta=r&&r.chart&&r.chart.result&&r.chart.result[0]&&r.chart.result[0].meta;
      const live=meta&&meta.regularMarketPrice, prevC=meta&&meta.chartPreviousClose;
      const ch=(live!=null&&prevC)?(live-prevC)/prevC*100:null;
      return { ...w, live, ch };
    }catch(e){ return { ...w, live:null, ch:null }; }
  }));
  const ccy=w=> w.ccySym!=null ? w.ccySym : (w.market==='BIST'?'₺':'$');
  const marketLbl={BIST:'BIST', US:t('mkt_us'), EU:t('mkt_eu')};
  const mkt=w=> w.country||marketLbl[w.market]||w.market;
  box.innerHTML=`<table><thead><tr><th>${t('watch_th_sym')}</th><th>${t('watch_th_mkt')}</th><th>${t('watch_th_px')}</th><th>${t('watch_th_chg')}</th><th></th></tr></thead><tbody>
    ${rows.map(w=>`<tr>
      <td style="cursor:pointer" onclick="watchGo('${w.sym}','${w.market}')"><b>${safeHTML(w.sym)}</b></td>
      <td class="ratio-formula">${safeHTML(mkt(w))}</td>
      <td>${w.live!=null?ccy(w)+w.live.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}</td>
      <td class="${w.ch==null?'neutral':w.ch>0?'up':'down'}">${w.ch==null?'—':(w.ch>0?'▲ ':'▼ ')+pct(w.ch)}</td>
      <td class="row-actions"><button class="delrow" onclick="event.stopPropagation();removeWatch('${w.sym}','${w.market}')" title="${t('watch_rm')}">✕</button></td>
    </tr>`).join('')}
  </tbody></table>`;
}
function watchGo(sym, market){
  // Ek her zaman açıkça verilir (BIST → .IS, ABD → .US, EU kaydı eki zaten taşır) —
  // böylece izleme listesinden açarken borsa tespiti/çakışma sorusu atlanır.
  document.getElementById('ticker').value = market==='BIST' ? sym+'.IS' : (market==='US' ? sym+'.US' : sym);
  switchPage('stock');   // izleme listesi Ana Sayfa'da — analiz Bilanço sekmesinde açılır
  fetchTicker();
  window.scrollTo({top:0,behavior:'smooth'});
}
function removeWatch(sym, market){
  saveWatchlist(getWatchlist().filter(w=>!(w.sym===sym && w.market===market)));
  updateWatchStar();
  renderWatchlist();
}

/* ---- Nakit Akışı & FCF ---- */
function renderCashFlow(){
  const card=document.getElementById('cashCard'), grid=document.getElementById('cashKpis'), note=document.getElementById('cashNote');
  const CF=FIN && FIN.income && FIN.income._cash;
  if(!CF || !Object.keys(CF.opCF||{}).length){ if(card) card.classList.add('hidden'); return; }
  const dates=Object.keys(CF.opCF).sort().reverse();
  const C0=dates[0], C1=dates[1]||null;
  const v=(m,d)=> (d && m && (d in m)) ? m[d] : null;
  // kpi: mode 'good' = artış yeşil; 'plain' = renk yok (yatırım/finansman NA'da negatif normaldir)
  const kpi=(lbl,c,p,mode,fmtFn)=>{
    fmtFn=fmtFn||fmtAbbr;
    if(c==null) return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">—</div></div>`;
    let delta='';
    if(p!=null && p!==0){
      const ch=(c-p)/Math.abs(p)*100;
      const cls=mode==='plain'?'neutral':(Math.abs(ch)<0.05?'neutral':(ch>0?'up':'down'));
      const ar=Math.abs(ch)<0.05?'→':(ch>0?'▲':'▼');
      delta=`<div class="delta ${cls}">${ar} ${pct(ch)} <span class="neutral">(${t('kpi_prev')} ${fmtFn(p)})</span></div>`;
    }
    return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">${fmtFn(c)}</div>${delta}</div>`;
  };
  const cells=[
    kpi(t('cash_op'), v(CF.opCF,C0), v(CF.opCF,C1), 'good'),
    kpi(t('cash_inv'), v(CF.invCF,C0), v(CF.invCF,C1), 'plain'),
    kpi(t('cash_fin'), v(CF.finCF,C0), v(CF.finCF,C1), 'plain'),
    kpi(t('cash_fcf'), v(CF.fcf,C0), v(CF.fcf,C1), 'good'),
  ];
  // FCF Marjı: aynı tarihte gelir varsa (ABD yıllık↔yıllık; BIST her modda hizalı)
  const rev0=v(FIN.income.revenue,C0), rev1=v(FIN.income.revenue,C1);
  const fm0=(rev0&&v(CF.fcf,C0)!=null)?v(CF.fcf,C0)/rev0:null;
  const fm1=(rev1&&v(CF.fcf,C1)!=null)?v(CF.fcf,C1)/rev1:null;
  if(fm0!=null) cells.push(kpi(t('cash_fcf_m'), fm0, fm1, 'good', x=>(x*100).toFixed(1)+'%'));
  grid.innerHTML=cells.join('');
  const isQ = FIN.market==='BIST' && FIN.mode==='quarter' && /03-31|06-30|09-30/.test(C0);
  note.textContent=t('cash_period')+' '+fmtDate(C0)+(C1?' ↔ '+fmtDate(C1):'')+(FIN.market!=='BIST'?t('cash_us_note'):(isQ?t('cash_q_note'):''));
  card.classList.remove('hidden');
}

/* ---- Sağlık Karnesi: DuPont · Piotroski F-Score ---- */
function renderHealth(T){
  const card=document.getElementById('healthCard'), box=document.getElementById('healthBody');
  if(!card||!box||!FIN) return;
  const D=FIN.balance, I=FIN.income, CF=I._cash||{};
  const bd=Object.keys(D.assets||{}).sort().reverse();
  const rd=Object.keys(I.revenue||{}).sort().reverse();
  const B0=bd[0], B1=bd[1], R0=rd[0], R1=rd[1];
  if(!B0||!R0){ card.classList.add('hidden'); return; }
  const g=(m,d)=> (d && m && (d in m)) ? m[d] : null;
  const isBank = FIN.bankGroup==='UFRS';
  // Çeyreklik modda akış kalemleri yıllıklandırılır (×4) — DuPont devir hızı için
  const ann = FIN.mode==='quarter' ? 4 : 1;

  const eq=(d)=>{ const a=g(D.assets,d); return a!=null? a-liabTotal(D,d) : null; };
  const sd=(a,b)=> (a==null||b==null||b===0)?null:a/b;

  /* --- DuPont: ROE = Net Marj × Varlık Devir Hızı × Kaldıraç Çarpanı --- */
  const dupont=(bDate,rDate)=>{
    const ni=g(I.netIncome,rDate), rev=g(I.revenue,rDate), as=g(D.assets,bDate), e=eq(bDate);
    return { nm:sd(ni,rev), at:sd(rev!=null?rev*ann:null,as), em:sd(as,e),
             roe:sd(ni!=null?ni*ann:null,e) };
  };
  const d0=dupont(B0,R0), d1=(B1&&R1)?dupont(B1,R1):null;
  const pp=x=> x==null?'—':(x*100).toFixed(1)+'%';
  const xx=x=> x==null?'—':x.toFixed(2)+'x';
  // dir: 1 = artış olumlu (yeşil), -1 = artış olumsuz (kaldıraçta risk artışı → kırmızı)
  const dpRow=(lbl,c,p,fmt,dir)=>{
    let cls='';
    if(c!=null && p!=null){
      const diff=c-p, thr=Math.abs(p)*0.0005||1e-9;
      if(Math.abs(diff)>thr) cls = ((dir||1)>0 ? diff>0 : diff<0) ? 'up' : 'down';
    }
    return `<tr><td>${lbl}</td><td class="${cls}"><b>${fmt(c)}</b></td><td>${p!=null?fmt(p):'—'}</td></tr>`;
  };
  let html=`<div style="font-weight:700;color:var(--ink);margin-bottom:6px">${t('health_dupont')}</div>
  <table><thead><tr><th>${t('health_comp')}</th><th>${t('th_cur')}</th><th>${t('th_prev')}</th></tr></thead><tbody>
    ${dpRow(t('health_nm'), d0.nm, d1&&d1.nm, pp, 1)}
    ${dpRow(t('health_at'), d0.at, d1&&d1.at, xx, 1)}
    ${dpRow(t('health_em'), d0.em, d1&&d1.em, xx, -1)}
    ${dpRow(t('health_roe'), d0.roe, d1&&d1.roe, pp, 1)}
  </tbody></table>
  ${FIN.mode==='quarter'?'<div class="hint" style="margin-top:4px">'+t('health_q_note')+'</div>':''}`;

  /* --- Piotroski F-Score (9 kriter; hesaplanamayan kriter kapsam dışı kalır) --- */
  const cfDates=Object.keys(CF.opCF||{}).sort().reverse();
  const CF0=cfDates[0];
  const niAtCF=g(I.netIncome,CF0);   // ABD çeyreklik modda nakit yıllık → NI hizasızsa kriter düşer
  const checks=[
    [t('piot_1'), (()=>{ const r=sd(g(I.netIncome,R0),g(D.assets,B0)); return r==null?null:r>0; })()],
    [t('piot_2'), CF0?(g(CF.opCF,CF0)>0):null],
    [t('piot_3'), (()=>{ if(!B1||!R1) return null; const a=sd(g(I.netIncome,R0),g(D.assets,B0)), b=sd(g(I.netIncome,R1),g(D.assets,B1)); return (a==null||b==null)?null:a>b; })()],
    [t('piot_4'), (CF0&&niAtCF!=null)?(g(CF.opCF,CF0)>niAtCF):null],
    [t('piot_5'), (()=>{ if(!B1) return null; const l0=sd(liabTotal(D,B0),g(D.assets,B0)), l1=sd(liabTotal(D,B1),g(D.assets,B1)); return (l0==null||l1==null)?null:l0<l1; })()],
    [t('piot_6'), (()=>{ if(!B1||isBank) return null; const c0=sd(g(D.assetsCur,B0),g(D.liabCur,B0)), c1=sd(g(D.assetsCur,B1),g(D.liabCur,B1)); return (c0==null||c1==null)?null:c0>c1; })()],
    [t('piot_7'), (()=>{ if(!B1) return null; const s0=g(D.common,B0), s1=g(D.common,B1); return (s0==null||s1==null)?null:s0<=s1; })()],
    [t('piot_8'), (()=>{ if(!R1) return null; const m0=sd(g(I.grossProfit,R0),g(I.revenue,R0)), m1=sd(g(I.grossProfit,R1),g(I.revenue,R1)); return (m0==null||m1==null)?null:m0>m1; })()],
    [t('piot_9'), (()=>{ if(!B1||!R1) return null; const a=sd(g(I.revenue,R0),g(D.assets,B0)), b=sd(g(I.revenue,R1),g(D.assets,B1)); return (a==null||b==null)?null:a>b; })()],
  ];
  const evaluable=checks.filter(c=>c[1]!==null);
  const score=evaluable.filter(c=>c[1]===true).length;
  const denom=evaluable.length;
  const sCls= score>=7?'good': score>=4?'warn':'bad';
  html+=`<div style="font-weight:700;color:var(--ink);margin:18px 0 6px">${t('health_piot')}
    <span class="pill ${sCls}" style="margin-left:8px;font-size:14px">${score} / ${denom}</span>
    ${denom<9?`<span class="hint" style="font-weight:400"> · ${9-denom} ${t('health_skip')}</span>`:''}</div>`;
  html+=checks.map(([lbl,ok])=>`<div style="padding:3px 0;font-size:12.5px;color:var(--ink-2)">
    ${ok===null?'<span class="neutral">—</span>':ok?'<span class="up">✓</span>':'<span class="down">✗</span>'} ${lbl}</div>`).join('');

  box.innerHTML=html;
  card.classList.remove('hidden');
}

/* ---- Çok yıllı trend grafikleri (bağımsız SVG) ---- */
function fmtShort(n){
  const s=n<0?'-':'', a=Math.abs(n);
  if(a>=1e12) return s+(a/1e12).toFixed(1)+'T';
  if(a>=1e9)  return s+(a/1e9).toFixed(0)+'B';
  if(a>=1e6)  return s+(a/1e6).toFixed(0)+'M';
  if(a>=1e3)  return s+(a/1e3).toFixed(0)+'K';
  return s+Math.round(a);
}
function miniBarChart(title, series){
  const entries=Object.keys(series||{}).map(d=>[d,series[d]]).filter(e=>typeof e[1]==='number');
  entries.sort((a,b)=> a[0]<b[0]?-1:1);
  const data=entries.slice(-6);                 // son 6 dönem
  if(data.length<2) return '';
  const W=330,H=170, padT=22, padB=28;
  const vals=data.map(d=>d[1]);
  let max=Math.max(...vals,0), min=Math.min(...vals,0);
  const span=(max-min)||Math.abs(max)||1;
  const plotH=H-padT-padB;
  const n=data.length, gap=8, plotW=W-12, bw=(plotW-gap*(n-1))/n;
  const yOf=v=> padT + ((max-v)/span)*plotH;
  const y0=yOf(0);
  let bars='';
  data.forEach((d,i)=>{
    const x=6+i*(bw+gap), v=d[1], yv=yOf(v);
    const top=Math.min(yv,y0), hgt=Math.max(1,Math.abs(yv-y0));
    const col=v<0?'var(--bad)':'var(--accent)';
    const ly=v>=0? top-5 : top+hgt+11;
    bars+=`<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${hgt.toFixed(1)}" rx="3" fill="${col}"><title>${fmtDate(d[0])}: ${fmtAbbr(v)}</title></rect>
      <text x="${(x+bw/2).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="9.5" fill="var(--ink-2)">${fmtShort(v)}</text>
      <text x="${(x+bw/2).toFixed(1)}" y="${(H-10).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--muted)">${String(d[0]).slice(0,4)}</text>`;
  });
  const baseline = min<0 ? `<line x1="6" x2="${W-6}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="var(--line-2)"/>` : '';
  return `<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:13px;padding:12px 14px">
    <div style="font-size:12.5px;font-weight:700;color:var(--ink-2);margin-bottom:2px">${title}</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${baseline}${bars}</svg></div>`;
}
function renderTrends(){
  const charts=[
    [t('trend_rev'), FIN.income.revenue],
    [t('trend_ni'), FIN.income.netIncome],
    [t('trend_fcf'), FIN.income._cash && FIN.income._cash.fcf],
    [t('trend_assets'), FIN.balance.assets],
    [t('trend_equity'), FIN.balance.equity],
    [t('trend_liab'), FIN.balance.liab],
  ];
  const html=charts.map(([title,s])=>miniBarChart(title,s)).filter(Boolean).join('');
  document.getElementById('trendCharts').innerHTML = html || '<div class="hint">'+t('trend_empty')+'</div>';
}

/* ---- Bilanço dengesi ---- */
function renderBalCheck(T){
  const diff=T.cur.toplamV-T.cur.pasifTop;
  const ok=Math.abs(diff)<Math.max(1,T.cur.toplamV*0.005);
  const el=document.getElementById('balcheck');
  el.className='balcheck '+(ok?'ok':'no');
  el.innerHTML = ok
    ? tf('bal_ok',{a:fmtAbbr(T.cur.toplamV), p:fmtAbbr(T.cur.pasifTop)})
    : tf('bal_bad',{a:fmtAbbr(T.cur.toplamV), p:fmtAbbr(T.cur.pasifTop), d:fmtAbbr(diff)});
}

/* ---- KPI kartları ---- */
function renderKPIs(T){
  const cards=[
    [t('kpi_total_assets'), T.cur.toplamV, T.prev.toplamV, false],
    [t('kpi_total_liab'), T.cur.toplamYuk, T.prev.toplamYuk, true],
    [t('kpi_equity'), T.cur.ozkaynak, T.prev.ozkaynak, false],
    [t('kpi_nwc'), T.cur.netSermaye, T.prev.netSermaye, false],
    [t('kpi_ca'), T.cur.donenV, T.prev.donenV, false],
    [t('kpi_cl'), T.cur.kvYuk, T.prev.kvYuk, true],
  ];
  document.getElementById('kpis').innerHTML = cards.map(([lbl,cur,prev,inv])=>{
    const ch = prev!==0 ? (cur-prev)/Math.abs(prev)*100 : (cur!==0?100:0);
    const goodDir = inv ? ch<0 : ch>0; // borç için azalış iyi
    const cls = Math.abs(ch)<0.05?'neutral':(goodDir?'up':'down');
    const arrow = Math.abs(ch)<0.05?'→':(ch>0?'▲':'▼');
    return `<div class="kpi"><div class="lbl">${lbl}</div>
      <div class="val">${fmtAbbr(cur)}</div>
      <div class="delta ${cls}">${arrow} ${pct(ch)} <span class="neutral">(${t('kpi_prev')} ${fmtAbbr(prev)})</span></div></div>`;
  }).join('');
}

/* ---- Oranlar ---- */
function renderRatios(T){
  const safe=(a,b)=> b===0?null:a/b;
  function build(p){
    const t=T[p];
    return {
      cari: safe(t.donenV,t.kvYuk),
      asit: safe(t.donenV-t.stok,t.kvYuk),
      nakit: safe(t.nakit,t.kvYuk),
      borcOz: safe(t.toplamYuk,t.ozkaynak),
      kaldiraci: safe(t.toplamYuk,t.toplamV),
      ozkOran: safe(t.ozkaynak,t.toplamV),
      duranOzk: safe(t.duranV,t.ozkaynak),
    };
  }
  const c=build('cur'), pr=build('prev');
  // [ad, formül, curVal, prevVal, biçim, eşik fonksiyonu(durum)]
  const defs=[
    [t('ratio_current'),t('ratio_current_f'), c.cari, pr.cari, 'x', v=> v>=1.5?'good':v>=1?'warn':'bad'],
    [t('ratio_quick'),t('ratio_quick_f'), c.asit, pr.asit, 'x', v=> v>=1?'good':v>=0.7?'warn':'bad'],
    [t('ratio_cash'),t('ratio_cash_f'), c.nakit, pr.nakit, 'x', v=> v>=0.2?'good':v>=0.1?'warn':'bad'],
    [t('ratio_de'),t('ratio_de_f'), c.borcOz, pr.borcOz, 'x', v=> v<=1?'good':v<=2?'warn':'bad'],
    [t('ratio_lev'),t('ratio_lev_f'), c.kaldiraci, pr.kaldiraci, '%', v=> v<=0.5?'good':v<=0.7?'warn':'bad'],
    [t('ratio_eq'),t('ratio_eq_f'), c.ozkOran, pr.ozkOran, '%', v=> v>=0.4?'good':v>=0.25?'warn':'bad'],
    [t('ratio_fa'),t('ratio_fa_f'), c.duranOzk, pr.duranOzk, 'x', v=> v<=1?'good':v<=1.5?'warn':'bad'],
  ];
  const showV=(v,f)=> v===null?'—':(f==='%'?(v*100).toFixed(1)+'%':v.toFixed(2)+'x');
  document.getElementById('ratioBody').innerHTML = defs.map(([nm,fo,cv,pv,f,st])=>{
    const status = cv===null?'warn':st(cv);
    const lbl = statusPill(status);
    let ch='—';
    if(cv!==null&&pv!==null){ const dv=cv-pv; ch=(dv>=0?'▲ ':'▼ ')+(f==='%'?(dv*100).toFixed(1)+'p':dv.toFixed(2)); }
    return `<tr>
      <td><span class="ratio-name">${nm}</span><br><span class="ratio-formula">${fo}</span></td>
      <td><b>${showV(cv,f)}</b></td>
      <td>${showV(pv,f)}</td>
      <td>${ch}</td>
      <td><span class="pill ${status}">${lbl}</span></td>
    </tr>`;
  }).join('');
}

/* ---- Yatay analiz / önemli değişimler ---- */
function renderVariance(d){
  const rows=d.map(r=>{
    const dv=r.cur-r.prev;
    const dp=r.prev!==0? dv/Math.abs(r.prev)*100 : (r.cur!==0?100:0);
    return {...r,dv,dp};
  }).filter(r=>r.dv!==0);
  rows.sort((a,b)=>Math.abs(b.dv)-Math.abs(a.dv));
  const top=rows.slice(0,8);
  document.getElementById('varBody').innerHTML = top.map(r=>{
    const inv = CAT_GROUP[r.cat]!=='asset'; // yükümlülük/özkaynak artışı yorumu farklı
    const fav = inv ? r.dv<0 : r.dv>0;
    const dir = Math.abs(r.dp)<0.05?'neutral':(fav?'up':'down');
    const tag = r.dv>0?t('dir_up'):t('dir_down');
    return `<tr>
      <td>${r.name} <span class="ratio-formula">(${CATS[r.cat]})</span></td>
      <td>${fmtAbbr(r.cur)}</td><td>${fmtAbbr(r.prev)}</td>
      <td class="${dir}">${r.dv>0?'+':''}${fmtAbbr(r.dv)}</td>
      <td class="${dir}">${pct(r.dp)}</td>
      <td><span class="${dir}">${tag}</span></td>
    </tr>`;
  }).join('');
}

/* ---- Dikey analiz ---- */
function renderVertical(d,T){
  const rows=d.map(r=>{
    const cp = T.cur.toplamV? r.cur/T.cur.toplamV*100:0;
    const pp = T.prev.toplamV? r.prev/T.prev.toplamV*100:0;
    return {...r,cp,pp,shift:cp-pp};
  }).sort((a,b)=>b.cp-a.cp);
  document.getElementById('vertBody').innerHTML = rows.map(r=>{
    const w=Math.min(100,Math.abs(r.cp));
    const col = CAT_GROUP[r.cat]==='asset'?'#1763b8':CAT_GROUP[r.cat]==='liab'?'#c0392b':'#157a4d';
    const sc=Math.abs(r.shift)<0.05?'neutral':(r.shift>0?'up':'down');
    return `<tr>
      <td>${r.name} <span class="ratio-formula">(${CATS[r.cat]})</span></td>
      <td>${r.cp.toFixed(1)}%</td>
      <td>${r.pp.toFixed(1)}%</td>
      <td class="${sc}">${r.shift>=0?'+':''}${r.shift.toFixed(1)}p</td>
      <td style="width:160px"><div class="bar"><i style="width:${w}%;background:${col}"></i></div></td>
    </tr>`;
  }).join('');
}

/* ---- Otomatik yorum & risk işaretleri ---- */
function renderFlags(d,T){
  const F=[];
  const add=(lvl,ttl,body)=>F.push({lvl,ttl,body});
  const c=T.cur, p=T.prev;
  const cari=c.kvYuk?c.donenV/c.kvYuk:null;
  const asit=c.kvYuk?(c.donenV-c.stok)/c.kvYuk:null;
  const borcOz=c.ozkaynak?c.toplamYuk/c.ozkaynak:null;
  const ozkOran=c.toplamV?c.ozkaynak/c.toplamV:null;

  // Likidite
  if(cari!==null){
    if(cari<1) add('bad',t('flag_liq_bad_t'),tf('flag_liq_bad_b',{v:cari.toFixed(2)}));
    else if(cari<1.5) add('warn',t('flag_liq_warn_t'),tf('flag_liq_warn_b',{v:cari.toFixed(2)}));
    else add('good',t('flag_liq_ok_t'),tf('flag_liq_ok_b',{v:cari.toFixed(2)}));
  }
  if(asit!==null && asit<0.7) add('warn',t('flag_acid_t'),tf('flag_acid_b',{v:asit.toFixed(2)}));

  // Kaldıraç
  if(borcOz!==null){
    if(borcOz>2) add('bad',t('flag_debt_bad_t'),tf('flag_debt_bad_b',{v:borcOz.toFixed(2)}));
    else if(borcOz>1) add('warn',t('flag_debt_warn_t'),tf('flag_debt_warn_b',{v:borcOz.toFixed(2)}));
    else add('good',t('flag_debt_ok_t'),tf('flag_debt_ok_b',{v:borcOz.toFixed(2)}));
  }
  if(ozkOran!==null && ozkOran<0.25) add('bad',t('flag_thin_t'),tf('flag_thin_b',{v:(ozkOran*100).toFixed(0)}));

  // Net işletme sermayesi
  if(c.netSermaye<0) add('bad',t('flag_nwc_bad_t'),tf('flag_nwc_bad_b',{v:fmtAbbr(c.netSermaye), c:CUR}));
  else if(p.netSermaye!==0 && c.netSermaye<p.netSermaye*0.7) add('warn',t('flag_nwc_warn_t'),tf('flag_nwc_warn_b',{a:fmtAbbr(p.netSermaye), b:fmtAbbr(c.netSermaye), c:CUR}));

  // KV kredi artışı
  const kvKredi=d.filter(r=>/banka kred|kredi|short.?term|loan|debt/i.test(r.name)&&r.cat==='liab_current');
  const kvK=kvKredi.reduce((a,r)=>a+r.cur,0), kvKp=kvKredi.reduce((a,r)=>a+r.prev,0);
  if(kvKp>0 && kvK>kvKp*1.5) add('warn',t('flag_st_debt_t'),tf('flag_st_debt_b',{a:fmtAbbr(kvKp), b:fmtAbbr(kvK), c:CUR, p:((kvK/kvKp-1)*100).toFixed(0)}));

  // Alacak / stok şişmesi
  const checkBloat=(rx,label)=>{
    const it=d.filter(r=>rx.test(r.name)&&CAT_GROUP[r.cat]==='asset');
    const cv=it.reduce((a,r)=>a+r.cur,0), pv=it.reduce((a,r)=>a+r.prev,0);
    const varG=(c.toplamV-p.toplamV);
    if(pv>0 && cv>pv*1.3 && (cv-pv) > Math.abs(varG)*0.3)
      add('warn',tf('flag_bloat_t',{l:label}),tf('flag_bloat_b',{l:label, a:fmtAbbr(pv), b:fmtAbbr(cv), c:CUR, p:((cv/pv-1)*100).toFixed(0)}));
  };
  checkBloat(/alacak|receivable/i,t('flag_recv'));
  checkBloat(/stok|inventory/i,t('flag_inv'));

  // Nakit erimesi
  if(p.nakit>0 && c.nakit<p.nakit*0.6) add('warn',t('flag_cash_t'),tf('flag_cash_b',{a:fmtAbbr(p.nakit), b:fmtAbbr(c.nakit), c:CUR, p:((1-c.nakit/p.nakit)*100).toFixed(0)}));

  // Özkaynak büyümesi (olumlu)
  if(p.ozkaynak>0 && c.ozkaynak>p.ozkaynak*1.05) add('good',t('flag_eq_t'),tf('flag_eq_b',{a:fmtAbbr(p.ozkaynak), b:fmtAbbr(c.ozkaynak), c:CUR}));

  if(F.length===0) add('good',t('flag_none_t'),t('flag_none_b'));

  const ic={bad:'⛔',warn:'⚠️',good:'✅'};
  // önce kötüler
  F.sort((a,b)=>({bad:0,warn:1,good:2}[a.lvl]-{bad:0,warn:1,good:2}[b.lvl]));
  document.getElementById('flags').innerHTML = F.map(f=>
    `<div class="flag ${f.lvl}"><div class="ic">${ic[f.lvl]}</div>
     <div><div class="ttl">${f.ttl}</div><div class="body">${f.body}</div></div></div>`).join('');
}

/* ---------- PWA: service worker + Ana ekrana / uygulamaya yükle ---------- */
let PWA_DEFERRED=null;
function isIosDevice(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}
function isSafariBrowser(){
  const ua=navigator.userAgent;
  // iOS Chrome/Firefox/Edge = CriOS/FxiOS/EdgiOS; gerçek Safari'de Version/ + Safari var, CriOS yok
  return /safari/i.test(ua) && !/crios|fxios|edgios|opr\//i.test(ua);
}
function closePwaSheet(){
  const el=document.getElementById('pwaSheet');
  if(el) el.classList.remove('show');
}
function openPwaSheet(title, desc, steps){
  const sheet=document.getElementById('pwaSheet');
  const t=document.getElementById('pwaSheetTitle');
  const d=document.getElementById('pwaSheetDesc');
  const ol=document.getElementById('pwaSheetSteps');
  if(!sheet||!ol){ alert(desc+'\n\n'+steps.map((s,i)=>(i+1)+') '+s).join('\n')); return; }
  if(t) t.textContent=title;
  if(d) d.textContent=desc;
  ol.innerHTML=steps.map((s,i)=>`<li><b>${i+1}</b><span>${s}</span></li>`).join('');
  sheet.classList.add('show');
}
function refreshPwaInstallBtn(){
  const btn=document.getElementById('pwaInstall');
  if(!btn) return;
  const standalone=window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone===true;
  if(standalone){ btn.classList.remove('show'); return; }
  // Chromium: beforeinstallprompt. iOS: her zaman göster (manuel ekleme).
  const ios=isIosDevice();
  if(PWA_DEFERRED || ios) btn.classList.add('show');
  else btn.classList.remove('show');
  if(ios && !PWA_DEFERRED) btn.title='Safari → Paylaş → Ana Ekrana Ekle';
}
async function installPwa(){
  if(PWA_DEFERRED){
    PWA_DEFERRED.prompt();
    try{ await PWA_DEFERRED.userChoice; }catch(e){}
    PWA_DEFERRED=null;
    refreshPwaInstallBtn();
    return;
  }
  if(isIosDevice()){
    if(!isSafariBrowser()){
      openPwaSheet(
        'Safari ile aç',
        'iPhone’da uygulama yalnızca Safari’den ana ekrana eklenir. Chrome / Instagram / WhatsApp içi tarayıcıda “Yükle” çalışmaz.',
        [
          'Bu linki kopyala: bilanco-analiz-4sjg.onrender.com',
          'Safari uygulamasını aç',
          'Adres çubuğuna yapıştırıp siteyi aç',
          'Alttaki Paylaş (□↑) → <b>Ana Ekrana Ekle</b> → Ekle'
        ]
      );
      return;
    }
    openPwaSheet(
      'iPhone’a yükle',
      'App Store yok — siteyi ana ekrana ekleyince uygulama gibi açılır.',
      [
        'Alttaki <b>Paylaş</b> düğmesine dokun (□↑)',
        'Listeden <b>Ana Ekrana Ekle</b> seç',
        '<b>Ekle</b>’ye bas — ikon ana ekranda çıkar'
      ]
    );
    return;
  }
  openPwaSheet(
    'Uygulamayı yükle',
    'Tarayıcı menüsünden ana ekrana / uygulamaya ekleyebilirsin.',
    [
      'Menüyü aç (⋮ veya ⋯)',
      '<b>Uygulamayı yükle</b> veya <b>Ana ekrana ekle</b> seç',
      'Onayla — ikon telefonunda belirir'
    ]
  );
}
function registerPwa(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('beforeinstallprompt', e=>{
    e.preventDefault();
    PWA_DEFERRED=e;
    refreshPwaInstallBtn();
  });
  window.addEventListener('appinstalled', ()=>{
    PWA_DEFERRED=null;
    refreshPwaInstallBtn();
  });
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
  refreshPwaInstallBtn();
}

/* ---------- Canlı piyasa şeridi (25 ülke ana endeksi + altın/Brent/USDTRY/EURTRY) ---------- */
const MARKET_TAPE=[
  {s:'XU100.IS',  name:'BIST 100',  cc:'TR', dig:2},
  {s:'^GSPC',     name:'S&P 500',   cc:'US', dig:2},
  {s:'^IXIC',     name:'Nasdaq',    cc:'US', dig:2},
  {s:'^FTSE',     name:'FTSE 100',  cc:'GB', dig:2},
  {s:'^GDAXI',    name:'DAX',       cc:'DE', dig:2},
  {s:'^FCHI',     name:'CAC 40',    cc:'FR', dig:2},
  {s:'FTSEMIB.MI',name:'FTSE MIB',  cc:'IT', dig:2},
  {s:'^IBEX',     name:'IBEX 35',   cc:'ES', dig:2},
  {s:'^AEX',      name:'AEX',       cc:'NL', dig:2},
  {s:'^BFX',      name:'BEL 20',    cc:'BE', dig:2},
  {s:'PSI20.LS',  name:'PSI 20',    cc:'PT', dig:2},
  {s:'^SSMI',     name:'SMI',       cc:'CH', dig:2},
  {s:'^OMX',      name:'OMX 30',    cc:'SE', dig:2},
  {s:'^OMXC25',   name:'OMXC 25',   cc:'DK', dig:2},
  {s:'OBX.OL',    name:'OBX',       cc:'NO', dig:2},
  {s:'^OMXH25',   name:'OMXH 25',   cc:'FI', dig:2},
  {s:'^ATX',      name:'ATX',       cc:'AT', dig:2},
  {s:'WIG20.WA',  name:'WIG20',     cc:'PL', dig:2},
  {s:'^KS11',     name:'KOSPI',     cc:'KR', dig:2},
  {s:'^N225',     name:'Nikkei 225',cc:'JP', dig:2},
  {s:'000001.SS', name:'Şanghay',   cc:'CN', dig:2},
  {s:'^HSI',      name:'Hang Seng', cc:'HK', dig:2},
  {s:'^TWII',     name:'TAIEX',     cc:'TW', dig:2},
  {s:'^GSPTSE',   name:'TSX',       cc:'CA', dig:2},
  {s:'^AXJO',     name:'ASX 200',   cc:'AU', dig:2},
  {s:'^STI',      name:'STI',       cc:'SG', dig:2},
  {s:'GC=F',      name:'Ons Altın', cc:null, dig:2},
  {s:'BZ=F',      name:'Brent',     cc:null, dig:2},
  {s:'TRY=X',     name:'USD/TRY',   cc:null, dig:4},
  {s:'EURTRY=X',  name:'EUR/TRY',   cc:null, dig:4},
];
let MARKET_TAPE_TIMER=null;
function fmtTapePrice(n, dig){
  if(n==null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('tr-TR',{minimumFractionDigits:dig,maximumFractionDigits:dig});
}
function tapeItemHTML(def, q){
  const price=q&&q.price!=null?q.price:null;
  const chg=q&&q.changePct!=null?q.changePct:null;
  const cls=chg==null?'flat':(chg>0.005?'up':(chg<-0.005?'down':'flat'));
  const chgTxt=chg==null?'—':((chg>0?'+':'')+chg.toFixed(2)+'%');
  const icon=def.cc?flagSpan(def.cc):`<span class="tape-dot ${def.s==='GC=F'?'gold':(def.s==='BZ=F'?'oil':'fx')}" aria-hidden="true"></span>`;
  return `<span class="tape-item">${icon}<span class="t-name">${safeHTML(def.name)}</span>`+
    `<span class="t-price">${fmtTapePrice(price, def.dig)}</span>`+
    `<span class="t-chg ${cls}">${chgTxt}</span></span>`;
}
function renderMarketTape(map){
  const track=document.getElementById('marketTapeTrack');
  if(!track) return;
  const html=MARKET_TAPE.map(d=>tapeItemHTML(d, map[d.s])).join('');
  // Sonsuz kaydırma için içeriği iki kez yaz (animasyon -50%)
  track.innerHTML=html+html;
  const n=MARKET_TAPE.length;
  track.style.animationDuration=Math.max(60, n*3.2)+'s';
}
async function loadMarketTape(){
  const track=document.getElementById('marketTapeTrack');
  if(!track || location.protocol==='file:') return;
  try{
    const syms=MARKET_TAPE.map(d=>d.s).join(',');
    const r=await fetch('/quotes?s='+encodeURIComponent(syms));
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    const map={};
    (j.quotes||[]).forEach(q=>{ if(q&&q.symbol) map[q.symbol]=q; });
    renderMarketTape(map);
  }catch(e){
    if(!track.dataset.ready) track.innerHTML='<span class="tape-item"><span class="t-name">Piyasa verisi alınamadı</span></span>';
  }
  track.dataset.ready='1';
}
function initMarketTape(){
  loadMarketTape();
  if(MARKET_TAPE_TIMER) clearInterval(MARKET_TAPE_TIMER);
  MARKET_TAPE_TIMER=setInterval(loadMarketTape, 60000);
}

/* ---------- Discovery: arama sonrası ilgili ülkenin TV listesi (başta gizli) ---------- */
let DISC_SCR='gainers', DISC_CC=null, DISC_GEN=0, DISC_REVEALED=false, DISC_FOCUS_CODE=null;
function revealDiscoveryForCountry(cc, focusCode){
  DISC_CC=cc;
  DISC_REVEALED=true;
  DISC_FOCUS_CODE=focusCode||null;
  const card=document.getElementById('discCard');
  if(card) card.classList.remove('hidden');
  const cName=ccName(cc);
  const title=document.getElementById('discTitle');
  const sub=document.getElementById('discSub');
  if(title) title.textContent=tf('disc_title_cc',{c:cName});
  if(sub) sub.textContent=tf('disc_sub_cc',{c:cName});
  const bar=document.getElementById('discOpenBar');
  if(bar && focusCode){
    bar.style.display='flex';
    bar.innerHTML=`<button type="button" class="primary" onclick="searchExact('${safeHTML(focusCode)}')">📈 ${tf('disc_open_bs',{code:safeHTML(focusCode)})}</button>
      <span class="hint">${t('disc_country')} <b>${safeHTML(cName)}</b></span>`;
  }else if(bar){ bar.style.display='none'; bar.innerHTML=''; }
  // Sekmeleri sıfırla: yükselenler aktif
  DISC_SCR='gainers';
  document.querySelectorAll('#discCard .scan-chip[data-disc]').forEach(b=>b.classList.toggle('active', b.dataset.disc==='gainers'));
  loadDiscovery();
}
function selectDiscTab(btn){
  const scr=btn.dataset.disc;
  if(!scr || !DISC_REVEALED) return;
  DISC_SCR=scr;
  document.querySelectorAll('#discCard .scan-chip[data-disc]').forEach(b=>b.classList.toggle('active', b===btn));
  loadDiscovery();
}
async function loadDiscovery(){
  const box=document.getElementById('discBody');
  const card=document.getElementById('discCard');
  if(!box || !DISC_REVEALED || !DISC_CC) return;
  if(card) card.classList.remove('hidden');
  if(location.protocol==='file:'){ box.innerHTML='<div class="hint">'+t('need_bridge')+'</div>'; return; }
  const m=TOP100_MARKETS[DISC_CC];
  if(!m){ box.innerHTML='<div class="hint">'+t('disc_no_cc')+'</div>'; return; }
  const myGen=++DISC_GEN;
  box.innerHTML='<div class="hint">'+t('loading')+'</div>';
  try{
    const sortBy=DISC_SCR==='actives'?'volume':'change';
    const sortOrder=DISC_SCR==='losers'?'asc':'desc';
    // Penny/OTC ele: min fiyat + min piyasa değeri; ABD'de yalnız ana borsalar
    const filter=[
      {left:'type',operation:'equal',right:'stock'},
      {left:'is_primary',operation:'equal',right:true},
      {left:'close',operation:'egreater',right:1},
      {left:'market_cap_basic',operation:'egreater',right:500e6},
    ];
    if(DISC_CC==='US'){
      filter.push({left:'exchange',operation:'in_range',right:['NASDAQ','NYSE','AMEX','NYSE ARCA']});
    }else if(m.ex){
      filter.push({left:'exchange',operation:'equal',right:m.ex});
    }
    const r=await fetch('https://scanner.tradingview.com/'+m.scan+'/scan',{method:'POST',body:JSON.stringify({
      columns:['name','description','close','change','volume','market_cap_basic','exchange','logoid'],
      filter,
      sort:{sortBy,sortOrder},
      range:[0,40]
    })});
    if(myGen!==DISC_GEN) return;
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    // Aşırı % değişim / sıfır fiyat / OTC artıklarını istemcide de ele
    const data=(j.data||[]).map(x=>x.d).filter(d=>{
      if(!d||!d[0]) return false;
      const close=d[2], chg=d[3], mcap=d[5], ex=String(d[6]||'');
      if(close==null || close<1) return false;
      if(mcap!=null && mcap<500e6) return false;
      if(chg!=null && Math.abs(chg)>80) return false; // anormal günlük sıçrama
      if(DISC_CC==='US' && /OTC/i.test(ex)) return false;
      return true;
    }).slice(0,20);
    if(!data.length){ box.innerHTML='<div class="hint">'+t('disc_empty')+'</div>'; return; }
    const loc=localeTag();
    const chg=v=>{
      if(v==null) return '—';
      const cls=v>0?'up':(v<0?'down':'neutral');
      return `<span class="${cls}"><b>${(v>0?'+':'')+Number(v).toFixed(2)}%</b></span>`;
    };
    const px=v=>{
      if(v==null) return '—';
      const dig=v<10?2:(v<100?2:2);
      return m.sym+Number(v).toLocaleString(loc,{minimumFractionDigits:dig,maximumFractionDigits:dig});
    };
    const rows=data.map((d,i)=>{
      const code=m.click(String(d[0]).replace(/_/g,'-'));
      const sym=String(d[0]).replace(/_/g,'-');
      rememberLogoid(sym, DISC_CC==='TR'?'BIST':(DISC_CC==='US'?'US':''), d[7]);
      return `<tr style="cursor:pointer" onclick="searchExact('${code}')" title="${t('open_analysis')}">
        <td style="color:var(--muted)">${i+1}</td>
        <td><span class="sym-cell">${logoHtml(d[7], sym, 22, {sym, cc:DISC_CC, market:DISC_CC==='TR'?'BIST':(DISC_CC==='US'?'US':''), ysym:m.click(sym)})}<b>${safeHTML(sym)}</b></span></td>
        <td><span class="ratio-formula">${safeHTML(d[1]||'')}</span></td>
        <td>${px(d[2])}</td>
        <td>${chg(d[3])}</td>
        <td style="color:var(--muted);font-size:12px">${d[4]==null?'—':Number(d[4]).toLocaleString(loc)}</td>
      </tr>`;
    }).join('');
    box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr>
      <th>#</th><th>${t('th_code')}</th><th>${t('th_co')}</th><th>${t('th_px')}</th><th>${t('th_chg')}</th><th>${t('th_vol')}</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }catch(e){
    if(myGen===DISC_GEN) box.innerHTML='<div class="hint">'+t('list_fail')+'  '+safeHTML(e.message)+'</div>';
  }
}

/* ---------- Hisse Takvimi: arama sonrası ilgili ülke (Bugünün Fırsatları ile aynı kural) ---------- */
let EQCAL_TYPE='earnings', EQCAL_CC=null, EQCAL_REVEALED=false, EQCAL_GEN=0;
const fmtCalDay=raw=>fmtDate(raw);
function revealEqCalendarForCountry(cc){
  EQCAL_CC=cc;
  EQCAL_REVEALED=true;
  const card=document.getElementById('eqCalCard');
  if(card) card.classList.remove('hidden');
  const cName=ccName(cc);
  const title=document.getElementById('eqCalTitle');
  const sub=document.getElementById('eqCalSub');
  if(title) title.textContent=tf('eqcal_title_cc',{c:cName});
  if(sub) sub.textContent=tf('eqcal_sub_cc',{c:cName});
  // ABD dışı: gün seçici yalnızca Nasdaq gün-bazlı; TV yaklaşan kazançlar için gizle
  const dayWrap=document.getElementById('eqCalDayWrap');
  if(dayWrap) dayWrap.style.display = (cc==='US') ? 'flex' : 'none';
  EQCAL_TYPE='earnings';
  document.querySelectorAll('#eqCalCard .scan-chip[data-eqcal]').forEach(b=>b.classList.toggle('active', b.dataset.eqcal==='earnings'));
  loadEqCalendar();
}
function selectEqCalTab(btn){
  const t=btn.dataset.eqcal;
  if(!t || !EQCAL_REVEALED) return;
  EQCAL_TYPE=t;
  document.querySelectorAll('#eqCalCard .scan-chip[data-eqcal]').forEach(b=>b.classList.toggle('active', b===btn));
  loadEqCalendar();
}
async function loadEqCalendar(){
  const box=document.getElementById('eqCalBody');
  const card=document.getElementById('eqCalCard');
  if(!box || !EQCAL_REVEALED || !EQCAL_CC) return;
  if(card) card.classList.remove('hidden');
  if(location.protocol==='file:'){ box.innerHTML='<div class="hint">'+t('need_bridge')+'</div>'; return; }
  const myGen=++EQCAL_GEN;
  box.innerHTML='<div class="hint">'+t('eqcal_loading')+'</div>';

  // ABD: Nasdaq gün bazlı (bilanço/temettü/IPO/bölünme)
  if(EQCAL_CC==='US'){
    const dayEl=document.getElementById('eqCalDay');
    if(dayEl && !dayEl.value){
      const d=new Date();
      dayEl.value=d.toISOString().slice(0,10);
    }
    const day=dayEl?dayEl.value:(new Date().toISOString().slice(0,10));
    try{
      const j=await fetch('/ycal?type='+encodeURIComponent(EQCAL_TYPE)+'&day='+encodeURIComponent(day)).then(r=>r.json());
      if(myGen!==EQCAL_GEN) return;
      const rows=j.rows||[];
      if(!rows.length){ box.innerHTML='<div class="hint">'+t('eqcal_empty_day')+'</div>'; return; }
      const extra=EQCAL_TYPE==='earnings'?'<th>'+t('th_eps_est')+'</th><th>'+t('th_eps_act')+'</th>':(EQCAL_TYPE==='dividends'?'<th>'+t('th_amount')+'</th>':'');
      const tr=rows.map((r,i)=>{
        const code=String(r.symbol||'').replace(/^\^/,'').trim();
        const openCode=code && !/\./.test(code) ? code+'.US' : code;
        const click=openCode?`style="cursor:pointer" onclick="searchExact('${safeHTML(openCode)}')"`:'';
        let mid='';
        if(EQCAL_TYPE==='earnings'){
          mid=`<td>${r.epsEst==null?'—':Number(r.epsEst).toFixed(2)}</td><td>${r.epsAct==null?'—':Number(r.epsAct).toFixed(2)}</td>`;
        }else if(EQCAL_TYPE==='dividends'){
          mid=`<td>${r.amount==null?'—':Number(r.amount).toFixed(4)}</td>`;
        }
        return `<tr ${click}>
          <td style="color:var(--muted)">${i+1}</td>
          <td><b>${safeHTML(code||'—')}</b></td>
          <td><span class="ratio-formula">${safeHTML(r.name||'')}</span></td>
          <td style="white-space:nowrap;font-size:12px">${fmtCalDay(r.date||day)}</td>
          ${mid}
        </tr>`;
      }).join('');
      box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr>
        <th>#</th><th>${t('th_code')}</th><th>${t('th_co')}</th><th>${t('th_date')}</th>${extra}
      </tr></thead><tbody>${tr}</tbody></table></div>
      <div class="hint" style="margin-top:8px">ABD · Nasdaq Calendar · ${fmtCalDay(day)}</div>`;
    }catch(e){
      if(myGen===EQCAL_GEN) box.innerHTML='<div class="hint">'+t('eqcal_fail')+' '+safeHTML(e.message)+'</div>';
    }
    return;
  }

  // Türkiye: IPO + bedelsiz/bölünme → KAP bildirimleri
  if(EQCAL_CC==='TR' && (EQCAL_TYPE==='ipo' || EQCAL_TYPE==='splits')){
    try{
      const j=await fetch('/trcal?type='+encodeURIComponent(EQCAL_TYPE)).then(r=>r.json());
      if(myGen!==EQCAL_GEN) return;
      const rows=j.rows||[];
      if(!rows.length){
        box.innerHTML='<div class="hint">Son dönemde KAP’ta '+(EQCAL_TYPE==='ipo'?'halka arz':'bedelsiz / bölünme')+' bildirimi bulunamadı.</div>';
        return;
      }
      const tr=rows.map((r,i)=>{
        const code=r.symbol? (String(r.symbol).toUpperCase()+'.IS') : '';
        const click=code?`style="cursor:pointer" onclick="searchExact('${safeHTML(code)}')"`:(r.kapUrl?`style="cursor:pointer" onclick="window.open('${safeHTML(r.kapUrl)}','_blank')"`:'');
        return `<tr ${click}>
          <td style="color:var(--muted)">${i+1}</td>
          <td><b>${safeHTML(r.symbol||'—')}</b></td>
          <td><span class="ratio-formula">${safeHTML(r.name||'')}</span>${r.summary?`<br><span class="hint">${safeHTML(r.summary)}</span>`:''}</td>
          <td style="white-space:nowrap;font-size:12px">${fmtDate(r.date||'')||'—'}</td>
          <td style="font-size:12px;color:var(--muted)">${safeHTML(r.time||'—')}</td>
          <td>${r.kapUrl?`<a href="${safeHTML(r.kapUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">KAP →</a>`:'—'}</td>
        </tr>`;
      }).join('');
      box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr>
        <th>#</th><th>${t('th_code')}</th><th>${t('th_co')}</th><th>${t('th_date')}</th><th>${t('eqcal_topic')}</th><th></th>
      </tr></thead><tbody>${tr}</tbody></table></div>
      <div class="hint" style="margin-top:8px">Türkiye · KAP · ${EQCAL_TYPE==='ipo'?'halka arz bildirimleri':'bedelsiz sermaye artırımı / bölünme'}</div>`;
    }catch(e){
      if(myGen===EQCAL_GEN) box.innerHTML='<div class="hint">KAP takvimi alınamadı: '+safeHTML(e.message)+'</div>';
    }
    return;
  }

  // Diğer ülkeler: IPO/splits yalnızca ABD (+ TR yukarıda); TV kazanç/temettü
  if(EQCAL_TYPE==='ipo' || EQCAL_TYPE==='splits'){
    box.innerHTML='<div class="hint">'+t('eqcal_ipo_hint')+'</div>';
    return;
  }
  const m=TOP100_MARKETS[EQCAL_CC];
  if(!m){ box.innerHTML='<div class="hint">'+t('disc_no_cc')+'</div>'; return; }
  try{
    const dateCol=EQCAL_TYPE==='dividends'?'ex_dividend_date_upcoming':'earnings_release_next_date';
    const filter=[
      {left:'type',operation:'equal',right:'stock'},
      {left:'is_primary',operation:'equal',right:true},
      {left:dateCol,operation:'nequal',right:0},
      {left:'market_cap_basic',operation:'egreater',right:200e6},
    ];
    if(m.ex) filter.push({left:'exchange',operation:'equal',right:m.ex});
    const r=await fetch('https://scanner.tradingview.com/'+m.scan+'/scan',{method:'POST',body:JSON.stringify({
      columns:['name','description',dateCol,'market_cap_basic','close'],
      filter,
      sort:{sortBy:dateCol,sortOrder:'asc'},
      range:[0,40]
    })});
    if(myGen!==EQCAL_GEN) return;
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    const now=Math.floor(Date.now()/1000)-86400; // dünden itibaren
    const data=(j.data||[]).map(x=>x.d).filter(d=>{
      if(!d||!d[0]||d[2]==null) return false;
      const ts=Number(d[2]);
      return Number.isFinite(ts) && ts>=now;
    }).slice(0,25);
    if(!data.length){
      box.innerHTML='<div class="hint">Yaklaşan '+(EQCAL_TYPE==='dividends'?'temettü':'bilanço')+' kaydı bulunamadı.</div>';
      return;
    }
    const cName=(ECON_COUNTRIES.find(x=>x[0]===EQCAL_CC)||[EQCAL_CC,EQCAL_CC])[1];
    const tr=data.map((d,i)=>{
      const code=m.click(String(d[0]).replace(/_/g,'-'));
      const ts=Number(d[2]);
      const ds=fmtDate(new Date(ts*1000).toISOString().slice(0,10));
      return `<tr style="cursor:pointer" onclick="searchExact('${code}')">
        <td style="color:var(--muted)">${i+1}</td>
        <td><b>${safeHTML(String(d[0]).replace(/_/g,'-'))}</b></td>
        <td><span class="ratio-formula">${safeHTML(d[1]||'')}</span></td>
        <td style="white-space:nowrap;font-size:12px">${ds}</td>
        <td>${d[4]==null?'—':m.sym+Number(d[4]).toLocaleString('tr-TR',{maximumFractionDigits:2})}</td>
      </tr>`;
    }).join('');
    box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr>
      <th>#</th><th>Kod</th><th>Şirket</th><th>Tarih</th><th>Fiyat</th>
    </tr></thead><tbody>${tr}</tbody></table></div>
    <div class="hint" style="margin-top:8px">${safeHTML(cName)} · TradingView · yaklaşan ${EQCAL_TYPE==='dividends'?'temettü (ex-date)':'bilanço'}</div>`;
  }catch(e){
    if(myGen===EQCAL_GEN) box.innerHTML='<div class="hint">'+t('eqcal_fail')+' '+safeHTML(e.message)+'</div>';
  }
}

/* ---------- ETF (ABD Yahoo) · TR hisse fonları (TEFAS/KAP + holdings) ---------- */
const ETF_PRESETS_US=['SPY','QQQ','IWM','DIA','EEM','VEA','VWO','GLD','TLT','XLK','XLF','XLE','VNQ','ARKK','SMH'];
let ETF_MKT='US', ETF_PAGE_INIT=false, TEFAS_TOP=[], ETF_LAST_CODE='SPY';
/* Yahoo / TradingView / ETFDB sektör adları → TR / EN etiket */
const ETF_SECTOR_TR={
  technology:'Teknoloji', healthcare:'Sağlık', financialservices:'Finansal Hizmetler',
  financial_services:'Finansal Hizmetler', financials:'Finans', finance:'Finans',
  consumercyclical:'Tüketici (Döngüsel)', consumer_cyclical:'Tüketici (Döngüsel)',
  consumerdefensive:'Tüketici (Temel)', consumer_defensive:'Tüketici (Temel)',
  consumerdiscretionary:'Tüketici (İhtiyari)', consumerstaples:'Tüketici (Temel)',
  communication_services:'İletişim Hizmetleri', communicationservices:'İletişim Hizmetleri',
  communication:'İletişim',
  industrials:'Sanayi', industrial:'Sanayi', energy:'Enerji', utilities:'Kamu Hizmetleri',
  realestate:'Gayrimenkul', real_estate:'Gayrimenkul', basicmaterials:'Temel Malzemeler',
  basic_materials:'Temel Malzemeler', materials:'Malzemeler',
  'electronic technology':'Elektronik Teknoloji', 'technology services':'Teknoloji Hizmetleri',
  'health technology':'Sağlık Teknolojisi', 'health services':'Sağlık Hizmetleri',
  'consumer services':'Tüketici Hizmetleri', 'consumer durables':'Dayanıklı Tüketim',
  'consumer non-durables':'Dayanıksız Tüketim', 'retail trade':'Perakende',
  'producer manufacturing':'Üretici İmalat', 'process industries':'Süreç Endüstrileri',
  'non-energy minerals':'Enerji Dışı Mineraller', 'energy minerals':'Enerji Mineralleri',
  'commercial services':'Ticari Hizmetler', transportation:'Ulaştırma',
  'distribution services':'Dağıtım Hizmetleri', 'miscellaneous':'Diğer',
  'health care':'Sağlık', healthcare_sector:'Sağlık', 'information technology':'Bilişim',
  'real estate':'Gayrimenkul', 'basic materials':'Temel Malzemeler',
  'consumer discretionary':'Tüketici (İhtiyari)', 'consumer staples':'Tüketici (Temel)',
  'communication services':'İletişim Hizmetleri', telecommunications:'Telekomünikasyon',
  other:'Diğer', cash:'Nakit', 'n/a':'Diğer'
};
const ETF_SECTOR_EN={
  technology:'Technology', healthcare:'Healthcare', financialservices:'Financial Services',
  financial_services:'Financial Services', financials:'Financials', finance:'Finance',
  consumercyclical:'Consumer Cyclical', consumer_cyclical:'Consumer Cyclical',
  consumerdefensive:'Consumer Defensive', consumer_defensive:'Consumer Defensive',
  consumerdiscretionary:'Consumer Discretionary', consumerstaples:'Consumer Staples',
  communication_services:'Communication Services', communicationservices:'Communication Services',
  communication:'Communication',
  industrials:'Industrials', industrial:'Industrials', energy:'Energy', utilities:'Utilities',
  realestate:'Real Estate', real_estate:'Real Estate', basicmaterials:'Basic Materials',
  basic_materials:'Basic Materials', materials:'Materials',
  'electronic technology':'Electronic Technology', 'technology services':'Technology Services',
  'health technology':'Health Technology', 'health services':'Health Services',
  'consumer services':'Consumer Services', 'consumer durables':'Consumer Durables',
  'consumer non-durables':'Consumer Non-Durables', 'retail trade':'Retail Trade',
  'producer manufacturing':'Producer Manufacturing', 'process industries':'Process Industries',
  'non-energy minerals':'Non-Energy Minerals', 'energy minerals':'Energy Minerals',
  'commercial services':'Commercial Services', transportation:'Transportation',
  'distribution services':'Distribution Services', 'miscellaneous':'Other',
  'health care':'Healthcare', healthcare_sector:'Healthcare', 'information technology':'Information Technology',
  'real estate':'Real Estate', 'basic materials':'Basic Materials',
  'consumer discretionary':'Consumer Discretionary', 'consumer staples':'Consumer Staples',
  'communication services':'Communication Services', telecommunications:'Telecommunications',
  other:'Other', cash:'Cash', 'n/a':'Other'
};
const ETF_TR_TO_EN=(()=>{
  const out={};
  for(const [k,tr] of Object.entries(ETF_SECTOR_TR)){
    const en=ETF_SECTOR_EN[k];
    if(!en||!tr) continue;
    out[String(tr).toLowerCase()]=en;
  }
  // Common API / display variants already in Turkish
  Object.assign(out,{
    'teknoloji':'Technology','sağlık':'Healthcare','saglik':'Healthcare',
    'finansal hizmetler':'Financial Services','finans':'Financials',
    'tüketici (döngüsel)':'Consumer Cyclical','tuketici (dongusel)':'Consumer Cyclical',
    'tüketici (temel)':'Consumer Staples','tuketici (temel)':'Consumer Staples',
    'tüketici (ihtiyari)':'Consumer Discretionary',
    'iletişim hizmetleri':'Communication Services','iletisim hizmetleri':'Communication Services',
    'sanayi':'Industrials','enerji':'Energy','kamu hizmetleri':'Utilities',
    'gayrimenkul':'Real Estate','temel malzemeler':'Basic Materials','malzemeler':'Materials',
    'diğer':'Other','diger':'Other','nakit':'Cash'
  });
  return out;
})();
function sectorLabel(name){
  if(name==null||name==='') return '—';
  const raw=String(name).trim();
  const lower=raw.toLowerCase('tr-TR');
  const spaced=lower.replace(/[_/]+/g,' ').replace(/\s+/g,' ').trim();
  const compact=spaced.replace(/[\s\-]+/g,'');
  const map=getLang()==='en'?ETF_SECTOR_EN:ETF_SECTOR_TR;
  if(map[lower]||map[spaced]||map[compact]) return map[lower]||map[spaced]||map[compact];
  if(getLang()==='en'){
    if(ETF_TR_TO_EN[lower]||ETF_TR_TO_EN[spaced]) return ETF_TR_TO_EN[lower]||ETF_TR_TO_EN[spaced];
    // ASCII-safe title case (avoid breaking Turkish letters with /\b\w/)
    return spaced.replace(/(^|[\s\-/])([a-z])/g,(_,p,c)=>p+c.toUpperCase())||raw;
  }
  return raw;
}
function trSectorLabel(name){ return sectorLabel(name); }
function fmtAumTr(n){
  if(n==null||!isFinite(n)) return '—';
  if(n>=1e12) return (n/1e12).toLocaleString('tr-TR',{maximumFractionDigits:2})+' Tr ₺';
  if(n>=1e9) return (n/1e9).toLocaleString('tr-TR',{maximumFractionDigits:1})+' Mr ₺';
  if(n>=1e6) return (n/1e6).toLocaleString('tr-TR',{maximumFractionDigits:0})+' Mn ₺';
  return n.toLocaleString('tr-TR');
}
function setEtfMarket(m){
  ETF_MKT=(m==='TR')?'TR':'US';
  document.getElementById('etfMktUS')?.classList.toggle('active', ETF_MKT==='US');
  document.getElementById('etfMktTR')?.classList.toggle('active', ETF_MKT==='TR');
  const filters=document.getElementById('etfTefasFilters');
  if(filters) filters.style.display='none';
  if(ETF_MKT==='TR') loadTefasTop();
  else{ renderEtfChips(); loadEtf('SPY'); }
}
function renderEtfChips(){
  const chips=document.getElementById('etfChips');
  if(!chips) return;
  const inp=document.getElementById('etfTicker');
  if(ETF_MKT==='TR'){
    const list=TEFAS_TOP.slice(0,16).map(f=>f.code);
    chips.innerHTML=list.map(s=>
      `<button type="button" class="scan-chip" data-etf="${s}" onclick="loadTefasFund('${s}')">${s}</button>`).join('');
    if(inp) inp.placeholder=t('etf_ph_tr');
  }else{
    chips.innerHTML=ETF_PRESETS_US.map(s=>
      `<button type="button" class="scan-chip" data-etf="${s}" onclick="loadEtf('${s}')">${s}</button>`).join('');
    if(inp) inp.placeholder=t('etf_ph_us');
  }
}
function initEtfPage(){
  if(ETF_PAGE_INIT) return;
  ETF_PAGE_INIT=true;
  renderEtfChips();
  loadEtf('SPY');
}
function normalizeEtfSymbol(code){
  let sym=String(code||'').trim().toUpperCase().replace(/\.F$/,'');
  if(!sym) return '';
  if(/\.IS$/.test(sym)) return sym;
  return sym.replace(/\.US$/,'');
}
function renderTefasTable(highlight){
  const box=document.getElementById('etfBody');
  if(!box||ETF_MKT!=='TR') return;
  if(!TEFAS_TOP.length){
    box.innerHTML='<div class="hint">'+t('etf_list_empty')+'</div>';
    return;
  }
  const loc=localeTag();
  const rows=TEFAS_TOP.map((f,i)=>{
    const act=highlight&&highlight===f.code?'background:rgba(79,156,249,.08)':'';
    return `<tr style="cursor:pointer;${act}" onclick="loadTefasFund('${safeHTML(f.code)}')">
      <td style="color:var(--muted)">${i+1}</td>
      <td><b>${safeHTML(f.code)}</b></td>
      <td style="text-align:left">${safeHTML(f.name)}</td>
      <td><b>${fmtAumTr(f.aum)}</b></td>
      <td>${(f.investors||0).toLocaleString(loc)}</td>
      <td>${f.price==null?'—':Number(f.price).toLocaleString(loc,{maximumFractionDigits:6})}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div style="font-weight:700;margin-bottom:8px">${t('etf_tr_list_title')}</div>
    <div class="hint" style="margin-bottom:10px">${t('etf_tr_list_sub')}</div>
    <div style="overflow-x:auto"><table><thead><tr>
      <th>#</th><th>${t('th_code')}</th><th style="text-align:left">${t('etf_th_fund')}</th><th>${t('etf_th_aum')}</th><th>${t('etf_th_inv')}</th><th>${t('th_px')}</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}
async function loadTefasTop(){
  const box=document.getElementById('etfBody');
  const meta=document.getElementById('etfMeta');
  const filters=document.getElementById('etfTefasFilters');
  if(filters) filters.style.display='none';
  if(box) box.innerHTML='<div class="hint">'+t('etf_tr_loading')+'</div>';
  if(meta) meta.textContent='';
  try{
    const j=await fetch('/tefas?view=top&limit=40').then(r=>r.ok?r.json():null);
    if(!j||!j.ok||!(j.funds||[]).length){
      if(box) box.innerHTML='<div class="hint">'+t('etf_tr_fail')+(j&&j.error?(': '+safeHTML(j.error)):'')+'.</div>';
      return;
    }
    TEFAS_TOP=j.funds;
    renderEtfChips();
    if(meta){
      const d=j.date||'';
      const dd=d.length===8?(d.slice(6,8)+'.'+d.slice(4,6)+'.'+d.slice(0,4)):d;
      meta.innerHTML=`<b>${t('etf_tr_funds')}</b> · ${tf('etf_tr_meta',{n:TEFAS_TOP.length})} · ${safeHTML(dd)}`;
    }
    renderTefasTable();
  }catch(e){
    if(box) box.innerHTML='<div class="hint">'+t('etf_tr_fail')+': '+safeHTML(e.message)+'</div>';
  }
}
async function loadTefasFund(code){
  const box=document.getElementById('etfBody');
  const meta=document.getElementById('etfMeta');
  const input=document.getElementById('etfTicker');
  const c=String(code||'').trim().toUpperCase();
  if(!c||!box) return;
  if(input) input.value=c;
  document.querySelectorAll('#etfChips .scan-chip').forEach(b=>b.classList.toggle('active', b.dataset.etf===c));
  ETF_LAST_CODE=c;
  box.innerHTML='<div class="hint">'+t('etf_fund_loading')+'</div>';
  try{
    const j=await fetch('/tefas?view=fund&code='+encodeURIComponent(c)).then(r=>r.ok?r.json():null);
    if(!j||!j.ok||!j.fund){
      // Verisi olmayan fonları listeden sessizce çıkar
      TEFAS_TOP=TEFAS_TOP.filter(f=>f.code!==c);
      renderEtfChips();
      if(TEFAS_TOP.length){
        renderTefasTable();
        if(meta) meta.innerHTML=`<b>${t('etf_tr_funds')}</b> · ${tf('etf_tr_meta',{n:TEFAS_TOP.length})}`;
      }else{
        box.innerHTML='<div class="hint">'+t('etf_list_empty')+'</div>';
      }
      return;
    }
    const f=j.fund;
    const d=j.date||'';
    const dd=d.length===8?(d.slice(6,8)+'.'+d.slice(4,6)+'.'+d.slice(0,4)):d;
    if(meta){
      meta.innerHTML=`<b>${safeHTML(f.name)}</b> · <b>${safeHTML(f.code)}</b> · ${fmtAumTr(f.aum)} · ${(f.investors||0).toLocaleString(localeTag())} ${t('etf_investors')} · ${safeHTML(dd)}
        · <a href="https://www.tefas.gov.tr/tr/fon-karsilastirma?fon=${encodeURIComponent(f.code)}" target="_blank" rel="noopener">TEFAS</a>`;
    }
    let html=`<div style="margin-bottom:12px"><button type="button" class="scan-chip" onclick="renderTefasTable('${safeHTML(f.code)}')">← ${t('etf_back_list')}</button></div>`;
    const sectors=f.sectors||[];
    const holdings=f.holdings||[];
    if(sectors.length){
      const srows=sectors.map(s=>`<tr><td style="text-align:left">${safeHTML(sectorLabel(s.sector))}</td><td><b>%${Number(s.weight).toFixed(1)}</b></td></tr>`).join('');
      html+=`<div style="margin-bottom:16px"><div style="font-weight:700;margin-bottom:8px">${t('etf_sector_w')}</div>
        <div class="hint" style="margin-bottom:8px">${t('etf_sector_sub')}</div>
        <div style="overflow-x:auto"><table><thead><tr><th style="text-align:left">${t('etf_th_sector')}</th><th>${t('etf_th_weight')}</th></tr></thead><tbody>${srows}</tbody></table></div></div>`;
    }
    if(holdings.length){
      const hrows=holdings.map((h,i)=>{
        const pct=h.holdingPercent!=null?Number(h.holdingPercent):null;
        const hcode=h.symbol? (String(h.symbol)+'.IS') : '';
        const click=hcode?`style="cursor:pointer" onclick="searchExact('${safeHTML(hcode)}')"`:'';
        return `<tr ${click}><td style="color:var(--muted)">${i+1}</td>
          <td><b>${safeHTML(h.symbol||'—')}</b></td>
          <td style="text-align:left">${safeHTML(h.name||'')}</td>
          <td>${pct==null?'—':'%'+pct.toFixed(2)}</td></tr>`;
      }).join('');
      html+=`<div style="font-weight:700;margin-bottom:8px">${t('etf_top_hold')}</div>
        <div class="hint" style="margin-bottom:8px">${t('etf_hold_sub')}</div>
        <div style="overflow-x:auto"><table><thead><tr><th>#</th><th>${t('th_code')}</th><th style="text-align:left">${t('etf_th_asset')}</th><th>${t('etf_th_weight')}</th></tr></thead><tbody>${hrows}</tbody></table></div>`;
    }
    const alloc=(f.alloc||[]).filter(a=>a&&a.pct>0);
    if(!sectors.length && !holdings.length && alloc.length){
      const arows=alloc.map(a=>`<tr><td style="text-align:left">${safeHTML(a.label||a.key||'')}</td><td><b>%${Number(a.pct).toFixed(1)}</b></td></tr>`).join('');
      html+=`<div style="font-weight:700;margin-bottom:8px">${t('etf_sector_w')}</div>
        <div class="hint" style="margin-bottom:8px">${t('etf_alloc_sub')}</div>
        <div style="overflow-x:auto"><table><thead><tr><th style="text-align:left">${t('etf_th_sector')}</th><th>${t('etf_th_weight')}</th></tr></thead><tbody>${arows}</tbody></table></div>`;
    }else if(!sectors.length && !holdings.length){
      html+='<div class="hint">'+t('etf_no_hold')+'</div>';
    }
    box.innerHTML=html;
  }catch(e){ box.innerHTML='<div class="hint">'+t('etf_fund_fail')+': '+safeHTML(e.message)+'</div>'; }
}
async function loadEtf(code){
  if(ETF_MKT==='TR'){
    const c=String(code||'').trim().toUpperCase();
    if(!c) return loadTefasTop();
    return loadTefasFund(c);
  }
  const box=document.getElementById('etfBody');
  const meta=document.getElementById('etfMeta');
  const input=document.getElementById('etfTicker');
  const filters=document.getElementById('etfTefasFilters');
  if(filters) filters.style.display='none';
  if(!box) return;
  const ysym=normalizeEtfSymbol(code);
  if(!ysym) return;
  if(input) input.value=ysym;
  document.querySelectorAll('#etfChips .scan-chip').forEach(b=>b.classList.toggle('active', b.dataset.etf===ysym));
  ETF_LAST_CODE=ysym;
  box.innerHTML='<div class="hint">'+t('etf_loading')+'</div>';
  if(meta) meta.textContent='';
  try{
    const j=await fetch('/yqs?s='+encodeURIComponent(ysym)+'&m=topHoldings,fundProfile,summaryDetail,quoteType,price').then(r=>r.ok?r.json():null);
    const hasHold=j&&j.topHoldings&&((j.topHoldings.holdings||[]).length||(j.topHoldings.sectorWeightings||[]).length);
    if(!j || (!hasHold && j.error && !j.quoteType && !j.summaryDetail && !j.price)){
      box.innerHTML='<div class="hint">'+t('etf_not_found')+'</div>';
      return;
    }
    const th=j.topHoldings||{};
    const holdings=(th.holdings||[]).slice(0,20);
    const sectors=th.sectorWeightings||[];
    const fp=j.fundProfile||{};
    const name=(j.quoteType&&(j.quoteType.longName||j.quoteType.shortName))||ysym;
    const px=(j.price&&j.price.regularMarketPrice!=null)?j.price.regularMarketPrice
      :(j.summaryDetail&&j.summaryDetail.regularMarketPreviousClose!=null)?j.summaryDetail.regularMarketPreviousClose:null;
    const chg=j.price&&j.price.regularMarketChangePercent!=null?j.price.regularMarketChangePercent*100:null;
    if(meta){
      const cat=(fp.categoryName||fp.category||'');
      const fam=(fp.family||'');
      const chgTxt=chg==null?'':(` · <span class="${chg>0?'up':chg<0?'down':'neutral'}">${(chg>0?'+':'')+chg.toFixed(2)}%</span>`);
      const pxTxt=px==null?'':('$'+Number(px).toLocaleString('en-US',{maximumFractionDigits:2}));
      meta.innerHTML=`<b>${safeHTML(name)}</b> · <b>${safeHTML(ysym)}</b>${pxTxt?' · '+pxTxt:''}${chgTxt} · ${t('etf_us')}${fam?' · '+safeHTML(fam):''}${cat?' · '+safeHTML(cat):''}`;
    }
    let html='';
    if(sectors.length){
      const srows=sectors.map(s=>{
        const k=Object.keys(s||{})[0];
        const v=k!=null?s[k]:null;
        const pct=v==null?null:(v<=1?v*100:v);
        return `<tr><td>${safeHTML(sectorLabel(k))}</td><td><b>${pct==null?'—':'%'+Number(pct).toFixed(1)}</b></td></tr>`;
      }).join('');
      html+=`<div style="margin-bottom:16px"><div style="font-weight:700;margin-bottom:8px">${t('etf_sector_w')}</div>
        <div style="overflow-x:auto"><table><thead><tr><th>${t('etf_th_sector')}</th><th>${t('etf_th_weight')}</th></tr></thead><tbody>${srows}</tbody></table></div></div>`;
    }
    if(holdings.length){
      const hrows=holdings.map((h,i)=>{
        const pct=h.holdingPercent!=null?(h.holdingPercent<=1?h.holdingPercent*100:h.holdingPercent):null;
        const hcode=h.symbol||'';
        const click=hcode?`style="cursor:pointer" onclick="searchExact('${safeHTML(hcode)}')"`:'';
        return `<tr ${click}><td style="color:var(--muted)">${i+1}</td>
          <td><b>${safeHTML(h.symbol||'—')}</b></td>
          <td>${safeHTML(h.holdingName||'')}</td>
          <td>${pct==null?'—':'%'+Number(pct).toFixed(2)}</td></tr>`;
      }).join('');
      html+=`<div style="font-weight:700;margin-bottom:8px">${t('etf_top_hold')}</div>
        <div style="overflow-x:auto"><table><thead><tr><th>#</th><th>${t('th_code')}</th><th>${t('etf_th_asset')}</th><th>${t('etf_th_weight')}</th></tr></thead><tbody>${hrows}</tbody></table></div>`;
    }
    if(!html) html='<div class="hint">'+t('etf_no_hold')+'</div>';
    box.innerHTML=html;
  }catch(e){ box.innerHTML='<div class="hint">'+t('etf_fail')+': '+safeHTML(e.message)+'</div>'; }
}

/* ---------- Takas & AKD (BIST · BorsaCaddesi) ---------- */
let TAKAS_INIT=false;
let TAKAS_LIST=null; // son liste (latest + recent)
let TAKAS_OVERRIDE={}; // kind -> item (geçmiş gün seçimi)
let TAKAS_ACTIVE_SLUG=null;
let TAKAS_LUNA_SNAPSHOT=null;
let TAKAS_LUNA_SYMBOL='';
let TAKAS_LUNA_PROMISE=null;
function prefetchTakasLuna(sym){
  const symbol=String(sym||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!symbol) return Promise.resolve(null);
  if(TAKAS_LUNA_SNAPSHOT&&TAKAS_LUNA_SYMBOL===symbol) return Promise.resolve(TAKAS_LUNA_SNAPSHOT);
  if(TAKAS_LUNA_PROMISE&&TAKAS_LUNA_SYMBOL===symbol) return TAKAS_LUNA_PROMISE;
  TAKAS_LUNA_SYMBOL=symbol;
  const request=fetch('/bistakdocr?hisse='+encodeURIComponent(symbol))
    .then(r=>r.json()).then(j=>{
      if(j&&j.ok&&TAKAS_LUNA_SYMBOL===symbol) TAKAS_LUNA_SNAPSHOT=j;
      return j&&j.ok?j:null;
    }).catch(()=>null).finally(()=>{ if(TAKAS_LUNA_PROMISE===request) TAKAS_LUNA_PROMISE=null; });
  TAKAS_LUNA_PROMISE=request;
  return TAKAS_LUNA_PROMISE;
}
function initTakasPage(){
  if(TAKAS_INIT) return;
  TAKAS_INIT=true;
  const inp=document.getElementById('takasTicker');
  if(inp && !inp.value){
    const t=(document.getElementById('ticker')?.value||document.getElementById('homeTicker')?.value||'').trim().toUpperCase();
    if(t && !/[.\s]/.test(t) && t.length<=8) inp.value=t;
  }
  const box=document.getElementById('takasBody');
  if(box && !box._takasClick){
    box._takasClick=true;
    box.addEventListener('click', e=>{
      const shot=e.target.closest('img.akd-shot');
      if(shot && shot.src){
        e.preventDefault();
        openAkdFullscreen(shot.src, shot.alt||'');
        return;
      }
      const btn=e.target.closest('[data-takas-slug]');
      if(!btn) return;
      e.preventDefault();
      loadTakasAkdItem(btn.getAttribute('data-takas-slug'));
    });
  }
}
function openAkdFullscreen(src, alt){
  let overlay=document.getElementById('akdFsOverlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='akdFsOverlay';
    overlay.className='akd-fs-overlay';
    overlay.innerHTML=`<button type="button" class="akd-fs-close" aria-label="Kapat">×</button><img class="akd-fs-img" alt="">`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e=>{
      if(e.target===overlay || e.target.classList.contains('akd-fs-close')) closeAkdFullscreen();
    });
    document.addEventListener('keydown', e=>{
      if(e.key==='Escape') closeAkdFullscreen();
    });
  }
  const img=overlay.querySelector('.akd-fs-img');
  img.src=src;
  img.alt=alt||'';
  overlay.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeAkdFullscreen(){
  const overlay=document.getElementById('akdFsOverlay');
  if(!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow='';
}
function takasFmtLot(n){
  if(n==null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('tr-TR');
}
function takasKindLabel(kind){
  if(kind==='gun_sonu_akd') return 'Gün sonu AKD';
  if(kind==='araci_kurum') return 'Gün içi aracı kurum dağılımı';
  if(kind==='takas') return 'Aracı kurum dağılımı';
  return kind||'';
}
function takasThemedImgSrc(imageUrl){
  if(!imageUrl) return '';
  return '/bistakdimg?v=orig1&u='+encodeURIComponent(imageUrl);
}
function takasCard(item, label){
  if(!item) return '';
  const st=item.stats||{};
  const when=item.publishedAt?new Date(item.publishedAt).toLocaleString('tr-TR'):'';
  const netTone=(st.netLots!=null && st.netLots<0)?'color:var(--bad)':(st.netLots>0?'color:var(--good)':'');
  const top5Tone=(st.top5NetLots!=null && st.top5NetLots<0)?'color:var(--bad)':(st.top5NetLots>0?'color:var(--good)':'');
  const img=item.image
    ? `<div class="akd-shot-wrap"><img class="akd-shot" src="${safeHTML(takasThemedImgSrc(item.image))}" alt="${safeHTML(item.title||label)}" loading="lazy" title="Tam ekran için tıkla"></div>`
    : '<div class="hint">Tablo görseli yok.</div>';
  return `<div class="akd-panel">
    <div class="akd-panel-hd">
      <h3>${safeHTML(label)}</h3>
      <div class="akd-date">${safeHTML(item.title||'')}${when?' · '+safeHTML(when):''}</div>
    </div>
    <div class="akd-kpis">
      <div class="akd-kpi"><div class="lbl">Net lot</div><div class="val" style="${netTone}">${takasFmtLot(st.netLots)}</div></div>
      <div class="akd-kpi"><div class="lbl">Toplam adet</div><div class="val">${takasFmtLot(st.totalLots)}</div></div>
      <div class="akd-kpi"><div class="lbl">Net ilk 5</div><div class="val" style="${top5Tone}">${takasFmtLot(st.top5NetLots)}</div></div>
    </div>
    ${img}
  </div>`;
}
function takasShownItem(kind){
  if(TAKAS_OVERRIDE[kind]) return TAKAS_OVERRIDE[kind];
  return (TAKAS_LIST && TAKAS_LIST.latest && TAKAS_LIST.latest[kind]) || null;
}
function takasRecentHtml(j){
  const list=(j.recent||[]).filter(a=>a && a.slug && a.kind!=='gun_ici_akd');
  if(!list.length){
    return j.note?`<div class="hint" style="margin-top:8px">${safeHTML(j.note)}</div>`:'';
  }
  const rows=list.map(a=>{
    const active=TAKAS_ACTIVE_SLUG && TAKAS_ACTIVE_SLUG===a.slug;
    const style=active
      ? 'background:none;border:none;padding:0;color:var(--ink);font-weight:800;text-align:left;cursor:pointer;text-decoration:underline'
      : 'background:none;border:none;padding:0;color:var(--accent-2);font-weight:600;text-align:left;cursor:pointer';
    return `<tr${active?' style="background:rgba(79,156,249,.08)"':''}>
      <td style="text-align:left"><button type="button" data-takas-slug="${safeHTML(a.slug)}" style="${style}">${safeHTML(a.title)}</button></td>
      <td>${a.publishedAt?safeHTML(new Date(a.publishedAt).toLocaleDateString('tr-TR')):'—'}</td>
      <td style="text-align:left;color:var(--muted);font-size:12px">${safeHTML(takasKindLabel(a.kind))}</td></tr>`;
  }).join('');
  return `<div class="card"><h3 style="margin-top:0">Son kayıtlar</h3>
    <div class="hint" style="margin:-4px 0 10px">Başlığa tıklayınca üstteki ilgili panel o günün tam tablosuna geçer.</div>
    <div style="overflow-x:auto"><table><thead><tr><th style="text-align:left">Başlık</th><th>Tarih</th><th style="text-align:left">Tür</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="hint" style="margin-top:8px">${safeHTML(j.note||'')}</div></div>`;
}
function renderTakasView(){
  const box=document.getElementById('takasBody');
  if(!box || !TAKAS_LIST) return;
  const j=TAKAS_LIST;
  const sym=j.symbol||'';
  let html='';
  if(j.category){
    html+=`<div class="hint" style="margin-bottom:12px">${logoHtml(null, sym, 22, {sym, market:'BIST', cc:'TR'})} <b>${safeHTML(sym)}</b> · ${safeHTML(j.category.name||'')}</div>`;
  }
  const gun=takasShownItem('gun_sonu_akd');
  const araci=takasShownItem('araci_kurum');
  const takas=takasShownItem('takas');
  html+=takasCard(gun, 'Gün sonu AKD');
  html+=takasCard(araci, 'Gün içi aracı kurum dağılımı');
  html+=takasCard(takas, 'Aracı kurum dağılımı');
  if(!gun && !araci && !takas){
    html+='<div class="hint">Bu hisse için henüz AKD özeti yok.</div>';
  }
  html+=takasRecentHtml(j);
  box.innerHTML=html;
}
async function loadTakasAkd(){
  const inp=document.getElementById('takasTicker');
  const st=document.getElementById('takasStatus');
  const box=document.getElementById('takasBody');
  const sym=String(inp?.value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!sym){ if(st) st.textContent='Hisse kodu gir.'; return; }
  if(inp) inp.value=sym;
  initTakasPage();
  TAKAS_OVERRIDE={};
  TAKAS_ACTIVE_SLUG=null;
  TAKAS_LUNA_SNAPSHOT=null;
  TAKAS_LUNA_SYMBOL=sym;
  TAKAS_LUNA_PROMISE=null;
  const lunaBtn=document.getElementById('takasLunaBtn');
  const lunaCard=document.getElementById('takasLunaCard');
  if(lunaBtn) lunaBtn.disabled=true;
  if(lunaCard) lunaCard.classList.add('hidden');
  if(st) st.textContent='Yükleniyor…';
  box.innerHTML='<div class="hint">AKD tabloları çekiliyor…</div>';
  try{
    const r=await fetch('/bistakd?hisse='+encodeURIComponent(sym));
    const j=await r.json();
    if(!j || !j.ok){
      TAKAS_LIST=null;
      const why=j&&j.error?` (${j.error})`:'';
      box.innerHTML=`<div class="hint">${safeHTML(sym)} için AKD kaydı bulunamadı${safeHTML(why)}.</div>`;
      if(st) st.textContent='Bulunamadı';
      return;
    }
    TAKAS_LIST=j;
    const latest=j.latest||{};
    TAKAS_ACTIVE_SLUG=(latest.gun_sonu_akd && latest.gun_sonu_akd.slug) || null;
    renderTakasView();
    prefetchTakasLuna(sym);
    if(lunaBtn) lunaBtn.disabled=false;
    if(st) st.textContent='Güncel';
  }catch(e){
    box.innerHTML='<div class="hint">Alınamadı: '+safeHTML(e.message)+'</div>';
    if(st) st.textContent='Hata';
  }
}
async function analyzeTakasWithLuna(){
  const inp=document.getElementById('takasTicker');
  const btn=document.getElementById('takasLunaBtn');
  const card=document.getElementById('takasLunaCard');
  const status=document.getElementById('takasLunaStatus');
  const body=document.getElementById('takasLunaBody');
  const sym=String(inp&&inp.value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!sym||!TAKAS_LIST||!btn||!card||!status||!body) return;
  btn.disabled=true; card.classList.remove('hidden'); body.textContent=''; status.textContent=t('takas_luna_loading');
  try{
    const snapshot=TAKAS_LUNA_SNAPSHOT||await prefetchTakasLuna(sym);
    if(!snapshot) throw new Error('unavailable');
    const r=await fetch('/ai/broker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:getLang(),snapshot})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok) throw new Error(j.error||'unavailable');
    status.textContent='';
    const text=document.createElement('p'); text.textContent=String(j.answer||''); body.appendChild(text);
    if(Array.isArray(j.sources)&&j.sources.length){
      const sources=document.createElement('div'); sources.className='ai-sources';
      const label=document.createElement('strong'); label.textContent=t('ai_sources'); sources.appendChild(label);
      j.sources.forEach(s=>{ const a=document.createElement('a'); a.href=s.url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=s.title||s.url; sources.appendChild(a); });
      body.appendChild(sources);
    }
  }catch(e){
    status.textContent=e.message==='luna_not_configured'?t('luna_not_configured'):(e.message==='rate_limit'?t('luna_rate'):t('luna_error'));
  }finally{ btn.disabled=false; }
}
async function loadTakasAkdItem(slug){
  const inp=document.getElementById('takasTicker');
  const st=document.getElementById('takasStatus');
  const sym=String(inp?.value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  const s=String(slug||'').trim();
  if(!sym || !s || !TAKAS_LIST) return;
  const meta=(TAKAS_LIST.recent||[]).find(a=>a.slug===s);
  const kind=meta && meta.kind;
  if(!kind || kind==='gun_ici_akd') return;

  // Aynı günün güncel kaydıysa override kaldır → bugüne dön
  const base=TAKAS_LIST.latest && TAKAS_LIST.latest[kind];
  if(base && base.slug===s){
    delete TAKAS_OVERRIDE[kind];
    TAKAS_ACTIVE_SLUG=s;
    renderTakasView();
    if(st) st.textContent='Güncel';
    return;
  }

  if(st) st.textContent='Kayıt açılıyor…';
  try{
    const r=await fetch('/bistakd?hisse='+encodeURIComponent(sym)+'&slug='+encodeURIComponent(s));
    const j=await r.json();
    if(!j || !j.ok || !j.item){
      if(st) st.textContent='Kayıt bulunamadı';
      return;
    }
    TAKAS_OVERRIDE[kind]=j.item;
    TAKAS_ACTIVE_SLUG=s;
    renderTakasView();
    if(st) st.textContent=takasKindLabel(kind)+' · seçildi';
  }catch(_e){
    if(st) st.textContent='Hata';
  }
}
window.loadTakasAkd=loadTakasAkd;
window.loadTakasAkdItem=loadTakasAkdItem;

/* başlangıç */
window.addEventListener('DOMContentLoaded',()=>{
  /* Dil dinleyicisi initLang'den ÖNCE — yoksa ilk bilanco-lang kaçırılır */
  window.addEventListener('bilanco-lang',()=>{ refreshI18nPanels(); });
  if(typeof initLang==='function') initLang();
  loadSample();
  renderWatchlist();   // önceki oturumdan kalan izleme listesi (localStorage)
  // Bilanço Verisi'nde değer/kategori değişince cari hücreleri anında yeniden renklendir
  const body=document.getElementById('inputBody');
  body.addEventListener('input', colorInputRows);
  body.addEventListener('change', colorInputRows);
  registerPwa();
  initMarketTape();
  initHomeVoice();
  // Bugünün Fırsatları + Hisse Takvimi: arama yapılana kadar gizli
});

/* Dil değişince kart içlerini yeniden çiz (statik data-i18n yetmez) */
function refillInputFromFin(){
  if(!FIN || !FIN.balance || !FIN.D0) return false;
  const D=FIN.balance, D0=FIN.D0, D1=FIN.D1||null;
  const rows=(FIN.market==='BIST' && FIN.bankGroup==='UFRS')
    ? buildRowsBank(D,D0,D1)
    : buildRowsFromSEC(D,D0,D1);
  const b=document.getElementById('inputBody');
  if(!b) return false;
  b.innerHTML='';
  rows.forEach(r=>b.insertAdjacentHTML('beforeend', rowHTML(r[0],r[1],r[2],r[3])));
  const cur=document.getElementById('curNote');
  if(cur){
    if(FIN.market==='BIST') cur.textContent=t('cur_tl');
    else if(FIN.market==='US') cur.textContent=t('cur_usd');
    else cur.textContent=(FIN.cur||'')+' · '+t('cur_in');
  }
  setFinancialPeriodHeaders();
  return true;
}
function refreshI18nPanels(){
  try{ paintCountryBoxLabels(); }catch(_e){}
  try{
    if(typeof ETF_PAGE_INIT!=='undefined' && ETF_PAGE_INIT){
      renderEtfChips();
      if(ETF_MKT==='TR'){
        if(ETF_LAST_CODE && TEFAS_TOP.some(f=>f.code===ETF_LAST_CODE)) loadTefasFund(ETF_LAST_CODE);
        else if(TEFAS_TOP.length) renderTefasTable();
        else loadTefasTop();
      }else if(ETF_LAST_CODE) loadEtf(ETF_LAST_CODE);
    }
  }catch(_e){}
  try{ updateWatchStar(); }catch(_e){}
  try{
    const body2=document.getElementById('inputBody');
    if(body2){
      body2.querySelectorAll('select').forEach(sel=>{
        const v=sel.value;
        const cats=getCats();
        sel.innerHTML=Object.keys(cats).map(k=>`<option value="${k}" ${k===v?'selected':''}>${cats[k]}</option>`).join('');
      });
    }
  }catch(_e){}
  try{
    const results=document.getElementById('results');
    const open=results && !results.classList.contains('hidden');
    if(FIN && FIN.balance && FIN.D0){
      refillInputFromFin();
      analyze();
      const mcap=(LIVE_PRICE_STATE&&LIVE_PRICE_STATE.lastPrice!=null&&LIVE_PRICE_STATE.shares!=null)
        ? LIVE_PRICE_STATE.lastPrice*LIVE_PRICE_STATE.shares
        : LAST_MCAP;
      if(mcap!=null){ renderValuation(mcap); renderYdf(mcap); }
      if(EARN_CACHE) try{ renderEarnPanel(EARN_CACHE); }catch(_e){}
      if(LAST_CMP_LIST) try{ renderComparison(LAST_CMP_LIST); }catch(_e){}
      try{ renderTechShort(); }catch(_e){}
      const g=REQ_GEN;
      let eu=null;
      if(FIN.market==='EU'&&FIN.euInfo){
        const base=(FIN.euInfo.base||FIN.ticker||'').replace(/-/g,'_');
        eu={ scan:FIN.euInfo.scan, tv:FIN.euInfo.tv+':'+base, ysym:FIN.ysym||(FIN.ticker+'.'+FIN.euInfo.suffix) };
      }
      try{ fetchTechPanel(FIN.ticker, FIN.market==='EU'?'EU':FIN.market, g, eu); }catch(_e){}
      try{ fetchNews(FIN.ticker, g); }catch(_e){}
      if(FIN.market==='US') try{ fetchTargets(FIN.ticker, g); }catch(_e){}
      try{
        if(LIVE_PRICE_STATE&&LIVE_PRICE_STATE.lastPrice!=null)
          paintLivePrice(FIN.ticker, LIVE_PRICE_STATE.lastPrice, null);
      }catch(_e){}
    }else{
      /* Hisse yokken örnek satırlar da dile göre yenilensin */
      loadSample();
    }
  }catch(_e){}
  try{ renderWatchlist(); }catch(_e){}
  try{
    if(typeof PRIVATE_PAGE_INIT!=='undefined' && PRIVATE_PAGE_INIT){
      initPrivateCompaniesPage();
      if(PRIVATE_OPEN_SLUG) openPrivateProfile(PRIVATE_OPEN_SLUG);
    }
  }catch(_e){}
  try{
    Object.keys(WNEWS_CACHE||{}).forEach(k=>{ try{ delete WNEWS_CACHE[k]; }catch(_e){} });
    paintWnewsTopics();
    const wEl=document.getElementById('wnewsList');
    if(wEl) loadWnews();
  }catch(_e){}
  try{
    if(typeof ECON_PAGE_INIT!=='undefined' && ECON_PAGE_INIT){
      const ec=document.getElementById('econCountries');
      if(ec){
        ec.innerHTML=ECON_COUNTRIES.map(([cc])=>
          `<button class="cbox" id="cbox-${cc}" onclick="toggleEconCountry('${cc}')">${flagSpan(cc)}<span>${ccName(cc)}</span></button>`).join('');
        Object.keys(ECON_PANELS||{}).forEach(cc=>{
          document.getElementById('cbox-'+cc)?.classList.add('active');
          const h=document.querySelector('#epanel-'+cc+' h2');
          if(h) h.innerHTML=`${flagSpan(cc)}${tf('econ_panel_title',{c:ccName(cc)})}`;
          // re-paint time/imp chip labels via applyI18n already; refresh table body
          try{ renderEconPanel(cc); }catch(_e){}
        });
      }
    }
  }catch(_e){}
  try{
    if(typeof SCAN_PAGE_INIT!=='undefined' && SCAN_PAGE_INIT){
      const sc=document.getElementById('scanCountries');
      if(sc){
        sc.innerHTML=ECON_COUNTRIES.map(([cc])=>
          `<button class="cbox" id="scanbox-${cc}" onclick="selectScanCountry('${cc}')">${flagSpan(cc)}<span>${ccName(cc)}</span></button>`).join('');
        document.getElementById('scanbox-'+SCAN_CC)?.classList.add('active');
      }
      const st=document.getElementById('scanTitle');
      if(st && SCAN_CC) st.innerHTML=`${flagSpan(SCAN_CC)}${tf('scan_title_cc',{c:ccName(SCAN_CC)})}`;
      if(SCAN_RAW && SCAN_RAW.length) renderScanPage();
      updateScanYdfUi();
    }
  }catch(_e){}
  try{
    if(typeof SECT_PAGE_INIT!=='undefined' && SECT_PAGE_INIT){
      const sc=document.getElementById('sectCountries');
      if(sc){
        sc.innerHTML=
          `<button class="cbox" id="sbox-GLOBAL" onclick="selectSectCountry('GLOBAL')"><span class="cfl" style="font-size:17px;line-height:1">🌍</span><span>${t('cc_GLOBAL')}</span></button>`+
          ECON_COUNTRIES.map(([cc])=>
            `<button class="cbox" id="sbox-${cc}" onclick="selectSectCountry('${cc}')">${flagSpan(cc)}<span>${ccName(cc)}</span></button>`).join('');
        document.getElementById('sbox-'+SECT_CC)?.classList.add('active');
      }
      const ss=document.getElementById('sectSectors');
      if(ss){
        ss.innerHTML=SECT_SECTORS.map(([id,ic])=>
          `<button class="cbox" id="secbox-${id}" onclick="toggleSectSector('${id}')"><span class="cfl" style="font-size:16px;line-height:1">${ic}</span><span>${t('sect_'+id)}</span></button>`).join('');
        if(SECT_OPEN) document.getElementById('secbox-'+SECT_OPEN)?.classList.add('active');
      }
      if(SECT_OPEN) loadSectPanel();
    }
  }catch(_e){}
  try{
    if(typeof TOP100_PAGE_INIT!=='undefined' && TOP100_PAGE_INIT){
      const tc=document.getElementById('topCountries');
      if(tc){
        tc.innerHTML=ECON_COUNTRIES.map(([cc])=>
          `<button class="cbox" id="tbox-${cc}" onclick="toggleTopCountry('${cc}')">${flagSpan(cc)}<span>${ccName(cc)}</span></button>`).join('');
        if(TOP100_OPEN){
          document.getElementById('tbox-'+TOP100_OPEN)?.classList.add('active');
          const h=document.querySelector('#tpanel-'+TOP100_OPEN+' h2');
          if(h) h.innerHTML=`${flagSpan(TOP100_OPEN)}${ccName(TOP100_OPEN)} ${t('top100_panel_title')}`;
        }
      }
    }
  }catch(_e){}
  try{
    if(typeof DISC_REVEALED!=='undefined' && DISC_REVEALED && DISC_CC){
      const dt=document.getElementById('discTitle');
      if(dt) dt.innerHTML=`${flagSpan(DISC_CC)}${tf('disc_title_cc',{c:ccName(DISC_CC)})}`;
      loadDiscovery();
    }
  }catch(_e){}
  try{
    if(typeof EQCAL_REVEALED!=='undefined' && EQCAL_REVEALED && EQCAL_CC){
      const et=document.getElementById('eqCalTitle');
      if(et) et.innerHTML=`${flagSpan(EQCAL_CC)}${tf('eqcal_title_cc',{c:ccName(EQCAL_CC)})}`;
      loadEqCalendar();
    }
  }catch(_e){}
  try{
    if(FIN && FIN.euInfo) startEuExchangeClock(FIN.euInfo);
    else if(FIN && FIN.market==='BIST') startBistClock();
    else if(FIN && FIN.market==='US') startNyClock();
  }catch(_e){}
}
