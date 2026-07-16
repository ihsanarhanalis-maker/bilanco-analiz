/* ---------- Sayfa sekmeleri (Ana Sayfa · Bilanço Analizi · Ekonomik Takvim) ---------- */
function switchPage(p){
  ['home','stock','econ','top100','scan','sect','etf','wnews'].forEach(x=>{
    document.getElementById('page-'+x)?.classList.toggle('active', x===p);
    document.getElementById('tabbtn-'+x)?.classList.toggle('active', x===p);
  });
  document.getElementById('marketTape')?.classList.toggle('hidden', p!=='home');
  if(p==='econ') initEconPage();       // ülke kutuları ilk girişte kurulur (tembel)
  if(p==='top100') initTop100Page();
  if(p==='scan') initScanPage();
  if(p==='sect') initSectPage();
  if(p==='etf') initEtfPage();
  if(p==='wnews') initWnewsPage();
  if(p==='home'){
    if(DISC_REVEALED) loadDiscovery();
    if(EQCAL_REVEALED) loadEqCalendar();
  }
  window.scrollTo({top:0,behavior:'smooth'});
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

/* Ana sayfa: kod ara → ülkeyi bul → o borsanın Bugünün Fırsatları’nı göster (önceden gizli) */
async function homeSearch(){
  const v=(document.getElementById('homeTicker').value||'').trim();
  const st=document.getElementById('homeSearchStatus');
  if(!v){ if(st) st.textContent='Bir hisse kodu yaz.'; return; }
  document.getElementById('periodType').value=document.getElementById('homePeriod').value;
  const sym=v.toUpperCase().trim();
  if(st){ st.style.color=''; st.innerHTML='⏳ <b>'+safeHTML(sym)+'</b> aranıyor…'; }

  let pickCode=null, cc=null;

  if(/\.[A-Z]{1,3}$/.test(sym)){
    pickCode=sym;
    cc=discCcFromCode(sym);
  }else{
    const myGen=++REQ_GEN;
    const { cands }=await detectBareMarkets(sym);
    if(myGen!==REQ_GEN) return;
    if(!cands.length){
      if(st) st.innerHTML='✕ <b>'+safeHTML(sym)+'</b> hiçbir borsada bulunamadı.';
      return;
    }
    const pick=cands.find(c=>c.market==='US')||cands.find(c=>c.market==='BIST')||cands[0];
    pickCode=pick.code;
    cc=discCcFromPick(pick);
  }

  if(!cc || !TOP100_MARKETS[cc]){
    if(st) st.innerHTML='✕ Bu kod için ülke eşlemesi yapılamadı.';
    return;
  }

  const cName=(ECON_COUNTRIES.find(x=>x[0]===cc)||[cc,cc])[1];
  if(st) st.innerHTML='✓ <b>'+safeHTML(pickCode)+'</b> → <b>'+safeHTML(cName)+'</b> · ana sayfada Fırsatlar + Takvim hazır';

  document.getElementById('ticker').value=pickCode;
  // Fırsatlar + Takvim o ülke için hazırlanır (logo → ana sayfa); analiz sekmesine gidilir
  revealDiscoveryForCountry(cc, pickCode);
  revealEqCalendarForCountry(cc);
  switchPage('stock');
  fetchTicker();
}

/* ---------- Kalem kategorileri ---------- */
const CATS = {
  asset_current:  "Dönen Varlık",
  asset_noncur:   "Duran Varlık",
  liab_current:   "Kısa Vade Yük.",
  liab_noncur:    "Uzun Vade Yük.",
  equity:         "Özkaynak"
};
const CAT_GROUP = { // hangi büyük gruba ait
  asset_current:'asset', asset_noncur:'asset',
  liab_current:'liab', liab_noncur:'liab', equity:'equity'
};

/* Örnek bilanço (Türk tipi) */
const SAMPLE = [
  ["Nakit ve Nakit Benzerleri","asset_current",450000,620000],
  ["Ticari Alacaklar","asset_current",1850000,1200000],
  ["Stoklar","asset_current",2100000,1450000],
  ["Diğer Dönen Varlıklar","asset_current",320000,280000],
  ["Maddi Duran Varlıklar","asset_noncur",3400000,3550000],
  ["Maddi Olmayan Duran Varlıklar","asset_noncur",480000,520000],
  ["Finansal Yatırımlar (Uzun V.)","asset_noncur",600000,600000],
  ["Banka Kredileri (Kısa V.)","liab_current",1900000,900000],
  ["Ticari Borçlar","liab_current",1350000,1100000],
  ["Diğer Kısa Vadeli Yük.","liab_current",420000,390000],
  ["Banka Kredileri (Uzun V.)","liab_noncur",1800000,2050000],
  ["Ertelenmiş Vergi Yük.","liab_noncur",230000,210000],
  ["Ödenmiş Sermaye","equity",2000000,2000000],
  ["Geçmiş Yıl Kârları","equity",900000,700000],
  ["Dönem Net Kârı","equity",600000,870000]
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
    info.country ? ('Ülke: '+info.country) : null,
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
async function fetchConceptRaw(cik, tags, formPrefix, taxonomy){
  for(const tag of tags){
    let j;
    try{
      const r=await fetch(`/sec/api/xbrl/companyconcept/CIK${cik}/${taxonomy||'us-gaap'}/${tag}.json`);
      if(!r.ok) continue;
      j=await r.json();
    }catch(e){ continue; }
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
  const grab = async (defs, fp)=>{
    const keys=Object.keys(defs), raw={};
    for(let i=0;i<keys.length;i+=5){
      const chunk=keys.slice(i,i+5);
      const r=await Promise.all(chunk.map(k=>fetchConceptRaw(cik,defs[k],fp||formPrefix,tax)));
      chunk.forEach((k,j)=>raw[k]=r[j]);
    }
    return {keys,raw};
  };
  const b=await grab(opts.balanceDefs||CONCEPTS_BALANCE);
  const ic=await grab(opts.incomeDefs||CONCEPTS_INCOME);
  const cf=await grab(opts.cashDefs||CONCEPTS_CASH, opts.cashForm||'10-K');   // nakit akışı her zaman yıllık (bkz. CONCEPTS_CASH notu)
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
async function compareTickers(){
  const st=document.getElementById('cmpStatus');
  if(location.protocol==='file:'){ st.textContent='⚠ Bu dosyayı "Bilanco-Baslat.bat" ile açın.'; st.style.color='var(--bad)'; return; }
  const raw=(document.getElementById('cmpTickers').value||'').toUpperCase();
  const syms=[...new Set(raw.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean))].slice(0,4);
  const mode=document.getElementById('cmpPeriod').value;
  if(syms.length<2){ st.textContent='En az 2 hisse kodu girin (virgülle ayırın).'; st.style.color='var(--bad)'; return; }
  st.textContent='⏳ '+syms.join(', ')+' çekiliyor…'; st.style.color='var(--muted)';
  const data=[];
  for(const s of syms){ data.push(await fetchMetrics(s,mode)); }   // sıralı: SEC saniye limiti
  const okData=data.filter(d=>d.ok), bad=data.filter(d=>!d.ok);
  if(!okData.length){ st.textContent='✕ Hiçbiri için veri alınamadı.'; st.style.color='var(--bad)'; document.getElementById('cmpResult').innerHTML=''; return; }
  st.textContent='✓ '+okData.map(d=>d.sym).join(', ')+(bad.length?'  ·  alınamadı: '+bad.map(d=>d.sym+' ('+d.err+')').join(', '):'');
  st.style.color = bad.length?'var(--warn)':'var(--good)';
  renderComparison(okData);
}
function renderComparison(list){
  const pp=v=>v==null?'—':(v*100).toFixed(1)+'%';
  const xx=v=>v==null?'—':v.toFixed(2)+'x';
  const ab=v=>v==null?'—':fmtAbbr(v);
  // [etiket, anahtar, biçim, yön(+1 yüksek iyi / −1 düşük iyi)]
  const rows=[
    ['Gelir (Hasılat)','revenue',ab,1],
    ['Net Kâr','netIncome',ab,1],
    ['Brüt Marj','grossMargin',pp,1],
    ['Faaliyet Marjı','opMargin',pp,1],
    ['Net Kâr Marjı','netMargin',pp,1],
    ['Özkaynak Kârlılığı (ROE)','roe',pp,1],
    ['Aktif Kârlılığı (ROA)','roa',pp,1],
    ['Cari Oran','current',xx,1],
    ['Asit-Test','quick',xx,1],
    ['Borç / Özkaynak','debtEq',xx,-1],
    ['Özkaynak Oranı','equityRatio',pp,1],
  ];
  const head='<tr><th>Metrik</th>'+list.map(d=>`<th>${d.sym}<br><span class="thd">${d.asOf?fmtDate(d.asOf):''}</span></th>`).join('')+'</tr>';
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
     <div class="hint" style="margin-top:8px">Yeşil = o metrikte en iyi, kırmızı = en kötü değer. Borç/Özkaynak'ta düşük olan iyidir.</div>`;
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
  for(let i=1;i<calls.length;i++) bistMerge(byCode, await bistCall(sym, group, calls[i]));
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
  push(L.nakit||'Nakit Değerler ve Merkez Bankası','asset_current', v(D.cash,D0), v(D.cash,D1));
  push(L.bankalar||'Bankalar','asset_current', v(D.bankBankalar,D0), v(D.bankBankalar,D1));
  push(L.krediler||'Krediler','asset_noncur', v(D.bankKrediler,D0), v(D.bankKrediler,D1));
  push('Diğer Varlıklar (Menkul Değerler vb.)','asset_noncur',
    v(D.assets,D0)-v(D.cash,D0)-v(D.bankBankalar,D0)-v(D.bankKrediler,D0),
    v(D.assets,D1)-v(D.cash,D1)-v(D.bankBankalar,D1)-v(D.bankKrediler,D1));
  push(L.mevduat||'Mevduat','liab_current', v(D.bankMevduat,D0), v(D.bankMevduat,D1));
  push('Diğer Yükümlülükler','liab_noncur',
    v(D.liabEquity,D0)-v(D.equity,D0)-v(D.bankMevduat,D0),
    v(D.liabEquity,D1)-v(D.equity,D1)-v(D.bankMevduat,D1));
  push('Ödenmiş Sermaye','equity', v(D.common,D0), v(D.common,D1));
  push('Geçmiş Yıllar Kar/Zararı','equity', v(D.retained,D0), v(D.retained,D1));
  push('Diğer Özkaynak Kalemleri','equity',
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
      setStatus('✕ "'+sym+'" ne ABD listesinde ne BIST\'te bulunamadı (ya da mali tablo verisi yok).','bad'); return;
    }
    const {D,I,group}=s;
    const dates=Object.keys(D.assets).sort().reverse();
    const D0=dates[0], D1=dates[1]||null;
    CUR='TL'; CURSYM='₺';
    const shares=(D.common&&D.common[D0])||null;   // Ödenmiş sermaye (nominal 1 TL) ≈ pay adedi
    FIN={ ticker:sym, mode, cur:'TRY', market:'BIST', bankGroup:group, D0, D1, balance:D, income:I,
          filedD0:null, filedD1:null, sharesBist:shares };
    const rows = group==='UFRS' ? buildRowsBank(D,D0,D1) : buildRowsFromSEC(D,D0,D1);
    const b=document.getElementById('inputBody'); b.innerHTML='';
    rows.forEach(r=>b.insertAdjacentHTML('beforeend', rowHTML(r[0],r[1],r[2],r[3])));
    document.getElementById('curNote').textContent='TL cinsinden';
    setPeriodHeaders(fmtDate(D0), D1?fmtDate(D1):null);
    setMarketOrigin({ country:'Türkiye', exchange:'Borsa İstanbul', ccy:'TRY', code:sym+'.IS' });
    setStatus(`✓ ${sym} — Türkiye (BIST)${group==='UFRS'?' · banka/sigorta':''} — ${mode==='annual'?'yıllık':'çeyreklik'} — ${fmtDate(D0)}${D1?'  ↔  '+fmtDate(D1):''} — TL`,'good');
    analyze();
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
    stopNyClock();                  // NY saati yalnızca ABD hisselerinde
  }catch(e){
    setStatus('✕ Bağlantı hatası: '+e.message+' (internet erişimi gerekir).','bad');
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
  if(euInfo.suffix==='KS'||euInfo.suffix==='KQ'){
    const resolved=await resolveKrYahooSymbol(euInfo.base);
    if(resolved){
      ysym=resolved;
      euInfo.suffix=resolved.slice(resolved.lastIndexOf('.')+1);
    }
  }else if(euInfo.suffix==='HK'||euInfo.suffix==='SS'||euInfo.suffix==='SZ'){
    const resolved=await resolveCnYahooSymbol(euInfo.base, euInfo.suffix);
    if(resolved){
      ysym=resolved;
      euInfo.suffix=resolved.slice(resolved.lastIndexOf('.')+1);
    }
  }else if(euInfo.suffix==='TW'||euInfo.suffix==='TWO'){
    const resolved=await resolveTwYahooSymbol(euInfo.base);
    if(resolved){
      ysym=resolved;
      euInfo.suffix=resolved.slice(resolved.lastIndexOf('.')+1);
    }
  }else if(euInfo.suffix==='TO'||euInfo.suffix==='V'){
    const resolved=await resolveCaYahooSymbol(euInfo.base);
    if(resolved){
      ysym=resolved;
      euInfo.suffix=resolved.slice(resolved.lastIndexOf('.')+1);
    }
  }
  return ysym;
}
async function fetchTickerEU(euInfo, mode, myGen){
  const tvTicker=euInfo.tv+':'+euTvBase(euInfo);
  let ysym=await resolveYahooForEu(euInfo);
  if(myGen!==REQ_GEN) return;
  const sym=euInfo.base;
  try{
    const r=await fetch('https://scanner.tradingview.com/'+euInfo.scan+'/scan',
      {method:'POST',body:JSON.stringify({symbols:{tickers:[tvTicker]},columns:EU_COLS})});
    const j=r.ok?await r.json():null;
    if(myGen!==REQ_GEN) return;
    const row=j&&j.data&&j.data.find(x=>x.d&&x.d[4]!=null);   // close (index 4) doluysa hisse gerçek
    if(!row){ setStatus('✕ "'+sym+'.'+euInfo.suffix+'" '+euInfo.country+' borsasında bulunamadı.','bad'); return; }
    const R=euReshape(row.d);
    if(!Object.keys(R.D.assets).length && !Object.keys(R.I.revenue).length){
      setStatus('✕ '+sym+' için finansal veri bulunamadı.','bad'); return;
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
    FIN={ ticker:sym, mode, cur:CUR, market:'EU', euInfo, D0, D1, balance:D, income:I,
          filedD0, filedD1, companyName:R.desc||sym, sector:R.sector, industry:R.industry,
          sharesEU:R.shares, ifrsSource:!!ifrs };
    const rows=buildRowsFromSEC(D, D0, D1);
    const b=document.getElementById('inputBody'); b.innerHTML='';
    rows.forEach(rr=>b.insertAdjacentHTML('beforeend', rowHTML(rr[0],rr[1],rr[2],rr[3])));
    document.getElementById('curNote').textContent=CUR+' cinsinden';
    if(D1) setPeriodHeaders(fmtDate(D0), fmtDate(D1)); else setPeriodHeaders(ifrs?fmtDate(D0):'Güncel Dönem', null);
    setMarketOrigin({
      country: euInfo.country,
      exchange: euInfo.tv || euInfo.city || ('ek .'+euInfo.suffix),
      ccy: CUR || euInfo.ccy,
      code: sym+'.'+euInfo.suffix
    });
    setStatus(`✓ ${sym}.${euInfo.suffix} — ${euInfo.country} — ${D1?(mode==='quarter'?'çeyreklik':'yıllık'):'en güncel dönem'} — ${CUR} — ${srcNote}`,'good');
    analyze();
    fetchNews(sym, myGen);
    fetchPrice(sym, null, myGen, { ysym, shares:R.shares });
    fetchTargetsEU(sym, euInfo, myGen);
    fetchNextEarnings(sym, 'EU', myGen, { tv:tvTicker, scan:euInfo.scan });
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
    setStatus('✕ Bağlantı hatası: '+e.message+' (internet erişimi gerekir).','bad');
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
async function detectBareMarkets(sym){
  const map=window.CIK_MAP||{};
  const cands=[];
  let scanOk=false;
  if(map[sym]) cands.push({ market:'US', code:sym+'.US', label:'🇺🇸 ABD', desc:'' });
  try{
    const tvSym=sym.replace(/-/g,'_');
    const prefixes=[...new Set(Object.values(EU_EXCHANGES).map(e=>e.tv))];
    const tickers=['BIST:'+tvSym, ...prefixes.map(p=>p+':'+tvSym)];
    const r=await fetch('https://scanner.tradingview.com/global/scan',
      {method:'POST',body:JSON.stringify({symbols:{tickers},columns:['name','is_primary','close','country','description']})});
    if(r.ok){
      const j=await r.json();
      scanOk=true;
      const rows=(j.data||[]).filter(x=>x.d && x.d[2]!=null);   // close dolu = gerçek kotasyon
      const bistRow=rows.find(x=>x.s.indexOf('BIST:')===0);
      if(bistRow) cands.push({ market:'BIST', code:sym+'.IS', label:'🇹🇷 Borsa İstanbul', desc:bistRow.d[4]||'' });
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
        if(sfx && !cands.some(c=>c.code===sym+'.'+sfx))
          cands.push({ market:'EU', code:sym+'.'+sfx, label:EU_EXCHANGES[sfx].flag+' '+EU_EXCHANGES[sfx].country, desc:x.d[4]||'' });
      });
    }
  }catch(e){}
  return { cands, scanOk };
}
/* Birden fazla borsada bulunan kod için seçenek düğmeleri (tıkla → o borsada ara) */
function renderMarketChoices(sym,cands){
  const el=document.getElementById('fetchStatus');
  el.style.color='var(--warn)';
  el.innerHTML='⚠ <b>'+safeHTML(sym)+'</b> birden fazla borsada bulundu — hangisini istiyorsun?<br>'+
    cands.map(c=>`<button type="button" style="margin:4px 4px 0 0;padding:5px 11px;font-size:12px" onclick="searchExact('${c.code}')">${c.label}${c.desc?' · '+safeHTML(c.desc).slice(0,30):''}</button>`).join('')+
    '<br><span class="hint">İstersen eki elle de yazabilirsin: '+cands.map(c=>'<b>'+c.code+'</b>').join(' · ')+'</span>';
}
function searchExact(code){
  document.getElementById('ticker').value=code;
  switchPage('stock');   // İlk 100 gibi başka sekmelerden gelen tıklamalarda analiz sekmesine geç
  fetchTicker();
}
async function fetchTicker(){
  if(location.protocol==='file:'){
    setStatus('⚠ Bu dosyayı çift tıklamak yerine "Bilanco-Baslat.bat" ile açın (anahtarsız veri için yerel köprü gerekir).','bad');
    return;
  }
  let sym=(document.getElementById('ticker').value||'').trim().toUpperCase();
  if(!sym){ setStatus('Lütfen bir hisse kodu yazın.','bad'); return; }
  setMarketOrigin(null);
  const mode=document.getElementById('periodType').value;        // 'annual' | 'quarter'
  const map=window.CIK_MAP||{};
  // Elle yazılmış ekler her zaman doğrudan yönlendirir: Avrupa (SAP.DE…), BIST (.IS), ABD (.US)
  const euInfo=parseEUSymbol(sym);
  if(euInfo && euInfo.suffix!=='US' && euInfo.suffix!=='IS'){
    setStatus('⏳ '+euInfo.base+'.'+euInfo.suffix+' '+euInfo.country+' borsasından çekiliyor…','muted');
    const myGen=++REQ_GEN;
    fetchTickerEU(euInfo, mode, myGen);
    return;
  }
  if(/\.IS$/.test(sym)){
    sym=sym.replace(/\.IS$/,'');
    setStatus('⏳ '+sym+' mali tabloları KAP/İş Yatırım\'dan çekiliyor…','muted');
    const myGen=++REQ_GEN;
    fetchTickerBIST(sym, mode, myGen);
    return;
  }
  if(/\.US$/.test(sym)){
    sym=sym.replace(/\.US$/,'');
    if(!map[sym]){ setStatus('✕ "'+sym+'" ABD listesinde bulunamadı.','bad'); return; }
    const myGen=++REQ_GEN;
    fetchTickerUS(sym, mode, myGen);
    return;
  }
  // Eksiz kod → borsayı otomatik bul
  const myGen=++REQ_GEN;
  setStatus('⏳ '+sym+' borsalarda aranıyor…','muted');
  const { cands, scanOk }=await detectBareMarkets(sym);
  if(myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
  if(!cands.length){
    if(!scanOk){
      // Tespit servisi erişilemedi → eski davranış: ABD listesinde varsa ABD, yoksa BIST dene
      if(map[sym]) fetchTickerUS(sym, mode, myGen);
      else fetchTickerBIST(sym, mode, myGen);
      return;
    }
    setStatus('✕ "'+sym+'" hiçbir borsada bulunamadı (ABD · BIST · Avrupa · Asya-Pasifik · Kanada tarandı).','bad');
    return;
  }
  // Birden fazla borsa → bayrak/seçim yok; ABD > BIST > diğer önceliğiyle otomatik aç
  const c = cands.find(x=>x.market==='US') || cands.find(x=>x.market==='BIST') || cands[0];
  if(c.market==='US') fetchTickerUS(sym, mode, myGen);
  else if(c.market==='BIST'){
    setStatus('⏳ '+sym+' mali tabloları KAP/İş Yatırım\'dan çekiliyor…','muted');
    fetchTickerBIST(sym, mode, myGen);
  }else{
    const eu=parseEUSymbol(c.code);
    setStatus('⏳ '+eu.base+'.'+eu.suffix+' '+eu.country+' borsasından çekiliyor…','muted');
    fetchTickerEU(eu, mode, myGen);
  }
}
async function fetchTickerUS(sym, mode, myGen){
  const map=window.CIK_MAP||{};
  const formPrefix = mode==='annual' ? '10-K' : '10-Q';
  const cik=String(map[sym]).padStart(10,'0');
  setStatus('⏳ '+sym+' bilançosu SEC EDGAR\'dan çekiliyor…','muted');

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

    if(!Object.keys(D.assets).length){ setStatus('✕ '+sym+' için bilanço verisi bulunamadı (form: '+formPrefix+').','bad'); return; }
    // Referans dönem tarihleri: toplam aktiften en güncel iki dönem sonu
    const dates=Object.keys(D.assets).sort().reverse();
    const D0=dates[0], D1=dates[1]||null;
    if(!D1){ setStatus('⚠ '+sym+' için yalnızca tek dönem bulundu; değişim analizi sınırlı olacak.','muted'); }

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
    document.getElementById('curNote').textContent='USD cinsinden';
    setPeriodHeaders(fmtDate(D0), D1?fmtDate(D1):null);
    const periodLbl = isIfrs20F ? 'yıllık (20-F)' : (mode==='annual'?'yıllık':'çeyreklik');
    setMarketOrigin({ country:'Amerika Birleşik Devletleri', exchange:'ABD (SEC EDGAR)', ccy:'USD', code:sym+'.US' });
    setStatus(`✓ ${sym} — ABD — ${periodLbl} — ${fmtDate(D0)}${D1?'  ↔  '+fmtDate(D1):''} — USD`,'good');
    analyze();
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
    setStatus('✕ Bağlantı hatası: '+e.message+' (internet erişimi gerekir).','bad');
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
const actionTR = { Upgrade:'Yükseltti ▲', Downgrade:'Düşürdü ▼', Reiterated:'Yineledi', Initiated:'Başlattı' };
/* Finviz "Recom" skoru 1 (Güçlü Al) — 5 (Güçlü Sat) arası ortalama analist puanı */
function recomLabel(v){
  if(v==null || isNaN(v)) return null;
  if(v<=1.5) return ['Güçlü Al','g-buy'];
  if(v<=2.5) return ['Al','g-buy'];
  if(v<=3.5) return ['Tut','g-hold'];
  if(v<=4.5) return ['Sat','g-sell'];
  return ['Güçlü Sat','g-sell'];
}
async function fetchTargets(sym, myGen){
  const card=document.getElementById('targetCard'), box=document.getElementById('targetBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">Analist verisi yükleniyor…</div>';
  try{
    const [tR, pR] = await Promise.all([
      fetch('/targets?s='+encodeURIComponent(sym)).then(x=>x.json()).catch(()=>null),
      fetch('/price?s='+encodeURIComponent(sym)+'&range=1d').then(x=>x.json()).catch(()=>null)
    ]);
    if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
    if(!tR || !tR.ok){ box.innerHTML='<div class="hint">Bu hisse için analist verisi bulunamadı.</div>'; return; }
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
        <div class="tgt-box"><div class="lbl">Konsensüs Hedef (Ort.)</div>
          <div class="big">${fmtUSD(mean)}</div>
          ${up!=null?`<div class="sm ${upCls}">${up>0?'▲':'▼'} ${pct(up)} <span class="neutral">cari fiyata göre potansiyel</span></div>`:''}
          ${cur!=null?`<div class="sm neutral">Cari fiyat: ${fmtUSD(cur)}</div>`:''}</div>
        <div class="tgt-box"><div class="lbl">Genel Tavsiye</div>
          <div class="big">${rl?`<span class="grade ${rl[1]}">${rl[0]}</span>`:'—'}</div>
          <div class="sm neutral">${tR.recom!=null?'Finviz skoru: '+tR.recom.toFixed(2)+' (1=Güçlü Al, 5=Güçlü Sat)':''}</div></div>
        <div class="tgt-box"><div class="lbl">Son Not Sayısı</div>
          <div class="big">${ratings.length||'—'}</div>
          <div class="sm neutral">yakın zamandaki değişiklik</div></div>
      </div>`;
    }
    // 2) Firma bazlı son notlar — yalnızca büyük ABD bankaları & aracı kurumlar
    const hist=ratings.filter(x=> BIG_FIRMS.some(f=> (x.firm||'').toLowerCase().includes(f)));
    if(hist.length){
      const rows=hist.slice(0,12).map(x=>{
        const d=new Date((x.date||0)*1000);
        const ds=isNaN(d)?'':d.toLocaleDateString('tr-TR',{day:'2-digit',month:'short',year:'numeric'});
        const act=actionTR[x.action]||x.action||'—';
        const actCls=x.action==='Upgrade'?'up':x.action==='Downgrade'?'down':'neutral';
        return `<tr><td>${safeHTML(x.firm||'')}</td>
          <td><span class="grade ${gradeClass(x.rating)}">${safeHTML(x.rating||'—')}</span></td>
          <td class="${actCls}">${act}</td>
          <td>${safeHTML(x.priceChange||'—')}</td>
          <td>${ds}</td></tr>`;
      }).join('');
      html+=`<div style="margin-top:18px;font-weight:700;color:var(--ink)">Son Analist Notları — Büyük Banka & Aracı Kurumlar</div>
        <table style="margin-top:8px"><thead><tr><th>Banka / Aracı Kurum</th><th>Not</th><th>İşlem</th><th>Hedef Fiyat</th><th>Tarih</th></tr></thead><tbody>${rows}</tbody></table>`;
    }else if(ratings.length){
      html+=`<div class="hint" style="margin-top:14px">Bu hisse için büyük banka/aracı kurumlardan güncel not bulunamadı.</div>`;
    }
    box.innerHTML = html || '<div class="hint">Bu hisse için analist verisi bulunamadı.</div>';
  }catch(e){ box.innerHTML='<div class="hint">Analist verisi alınamadı: '+e.message+'</div>'; }
}

/* ---------- Borsa şehri canlı saati (ABD: New York; Avrupa: ilgili 15 şehirden biri) ----------
   Saniyede bir güncellenir; cfg.open–cfg.close (dakika) hafta içi = seans saatleri (resmi tatiller
   hesaba katılmaz, o yüzden "borsa açık" değil "seans içi" denir). */
let EXCH_TIMER=null;
function startExchangeClock(cfg){
  const el=document.getElementById('nyClock');
  if(!el) return;
  const fTime=new Intl.DateTimeFormat('tr-TR',{timeZone:cfg.tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  const fDay =new Intl.DateTimeFormat('tr-TR',{timeZone:cfg.tz,weekday:'long'});
  const fNum =new Intl.DateTimeFormat('en-US',{timeZone:cfg.tz,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  const tick=()=>{
    const now=new Date();
    const p=fNum.formatToParts(now), g=t=>p.find(x=>x.type===t)?.value||'';
    const wd=g('weekday'), mins=parseInt(g('hour'),10)*60+parseInt(g('minute'),10);
    const inSession=!['Sat','Sun'].includes(wd) && mins>=cfg.open && mins<cfg.close;
    el.innerHTML=cfg.flag+' '+cfg.city+': <span style="color:#fff">'+fTime.format(now)+'</span> · '+fDay.format(now)+
      (inSession?' · <span style="color:var(--good)">● seans içi</span>'
                :' · <span style="color:var(--muted)">○ seans dışı</span>');
  };
  tick();
  if(EXCH_TIMER) clearInterval(EXCH_TIMER);
  EXCH_TIMER=setInterval(tick,1000);
  el.classList.remove('hidden');
}
function stopNyClock(){
  const el=document.getElementById('nyClock');
  if(EXCH_TIMER){ clearInterval(EXCH_TIMER); EXCH_TIMER=null; }
  if(el){ el.classList.add('hidden'); el.innerHTML=''; }
}
function startNyClock(){
  startExchangeClock({flag:'🗽',city:'New York',tz:'America/New_York',open:570,close:960});   // 09:30–16:00
}
function startEuExchangeClock(euInfo){
  startExchangeClock({flag:euInfo.flag,city:euInfo.city,tz:euInfo.tz,open:euInfo.open,close:euInfo.close});
}

/* ---------- Sonraki bilanço tarihi (üç pazar) ----------
   Kaynak: TradingView scanner `earnings_release_next_date` (beklenen açıklanma tarihi,
   Unix saniye). BIST için turkey/scan + BIST:SYM; ABD için america/scan — borsa öneki
   bilinmediğinden NASDAQ/NYSE/AMEX üçü birden sorulur; Avrupa'da borsa zaten kesin bilindiği
   için euOpt={tv,scan} doğrudan kullanılır. Tarayıcıdan çağrılır (Content-Type başlıksız
   POST = preflight'sız; TV Origin yansıtır). */
async function fetchNextEarnings(sym, market, myGen, euOpt){
  const el=document.getElementById('earnNote');
  if(!el) return;
  el.classList.add('hidden'); el.innerHTML='';
  try{
    const scan = euOpt ? euOpt.scan : (market==='BIST' ? 'turkey' : 'america');
    const tickers = euOpt ? [euOpt.tv] : (market==='BIST' ? ['BIST:'+sym] : ['NASDAQ:'+sym,'NYSE:'+sym,'AMEX:'+sym]);
    const r=await fetch('https://scanner.tradingview.com/'+scan+'/scan',
      {method:'POST',body:JSON.stringify({symbols:{tickers},columns:['earnings_release_next_date']})});
    if(!r.ok) return;
    const j=await r.json();
    if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
    const row=(j.data||[]).find(x=>x.d && x.d[0]!=null);
    const ts=row && row.d[0];
    if(!ts) return;
    const d=new Date(ts*1000);
    const days=Math.round((d-Date.now())/86400000);
    const ds=d.toLocaleDateString('tr-TR',{day:'2-digit',month:'long',year:'numeric'});
    el.innerHTML=`<div style="background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:9px;padding:7px 11px;font-size:12px;display:inline-block">
      <span style="color:var(--muted)">📅 Sonraki bilanço (beklenen):</span>
      <b style="color:var(--ink);margin-left:5px">${ds}</b>
      ${days>=0?`<span style="color:var(--muted);margin-left:5px">· ${days===0?'bugün':days+' gün sonra'}</span>`:''}</div>`;
    el.classList.remove('hidden');
  }catch(e){}
}

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
    body.innerHTML='<div class="hint">Grafik yükleniyor…</div>';
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
  info.innerHTML=`<b style="color:${col}">${chg>=0?'▲':'▼'} ${pct(chg)}</b> <span class="neutral">seçili aralıkta</span> · En düşük ${fmtUSD(yMin)} · en yüksek ${fmtUSD(yMax)}${marks?' · <span style="color:var(--gold)">┆ bilanço açıklanma günü</span>':''}`;
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
  box.innerHTML='<div class="hint">Sektör verisi yükleniyor…</div>';
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
      <td><b>${safeHTML(r.t)}</b>${r.me?' <span class="thd">bu hisse</span>':''}</td>
      <td>${fmtMcap(r.d[idx.mc])}</td>
      <td>${fmtN(r.d[idx.pe],'x')}</td><td>${fmtN(r.d[idx.pb],'x',2)}</td>
      <td>${fmtN(r.d[idx.roe],'%')}</td><td>${fmtN(r.d[idx.nm],'%')}</td></tr>`;
    const myPe=meRow.d[idx.pe];
    let prim='';
    if(myPe!=null && isFinite(myPe) && medians.pe){
      const df=(myPe-medians.pe)/medians.pe*100;
      prim=` · F/K sektör medyanına göre <b class="${df>0?'down':'up'}">%${Math.abs(df).toFixed(0)} ${df>0?'primli':'iskontolu'}</b>`;
    }
    sub.innerHTML=`Sektör: <b>${safeHTML(sector)}</b> · ${rows.length} şirket${prim}. Kaynak: TradingView.`;
    box.innerHTML=`<table><thead><tr><th>Şirket</th><th>Piyasa Değ.</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>Net Marj</th></tr></thead><tbody>
      ${top.map(rowHtml).join('')}
      <tr class="total"><td>Sektör Medyanı</td><td>—</td><td>${fmtN(medians.pe,'x')}</td><td>${fmtN(medians.pb,'x',2)}</td><td>${fmtN(medians.roe,'%')}</td><td>${fmtN(medians.nm,'%')}</td></tr>
    </tbody></table>`;
  }catch(e){ box.innerHTML='<div class="hint">Sektör verisi alınamadı: '+e.message+'</div>'; }
}

/* ---------- İzleme Listesi (localStorage; canlı fiyatlar TV scanner'dan toplu) ---------- */
function getWatch(){ try{ return JSON.parse(localStorage.getItem('bilanco_watchlist')||'[]'); }catch(e){ return []; } }
function setWatch(w){ try{ localStorage.setItem('bilanco_watchlist', JSON.stringify(w)); }catch(e){} }
function updateWatchStar(){
  const b=document.getElementById('watchStar');
  if(!b) return;
  if(!FIN || !FIN.ticker){ b.classList.add('hidden'); return; }
  const inList=getWatch().some(x=>x.sym===FIN.ticker && x.market===FIN.market);
  b.textContent= inList?'★ Listemden Çıkar':'☆ Listeme Ekle';
  b.classList.remove('hidden');
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
  box.innerHTML='<div class="hint">Fiyatlar yükleniyor…</div>';
  try{
    const q={};
    for(const scanMk of ['turkey','america']){
      const items=w.filter(x=> (scanMk==='turkey')===(x.market==='BIST'));
      if(!items.length) continue;
      const tickers=[];
      items.forEach(x=>{ if(scanMk==='turkey') tickers.push('BIST:'+x.sym);
                         else ['NASDAQ','NYSE','AMEX'].forEach(ex=>tickers.push(ex+':'+x.sym)); });
      const j=await fetch('https://scanner.tradingview.com/'+scanMk+'/scan',
        {method:'POST',body:JSON.stringify({symbols:{tickers},columns:['name','close','change','price_earnings_ttm']})})
        .then(r=>r.json()).catch(()=>null);
      ((j&&j.data)||[]).forEach(row=>{
        const t=row.s.split(':')[1];
        if(row.d && row.d[1]!=null && !q[t]) q[t]={close:row.d[1], chg:row.d[2], pe:row.d[3], bist:scanMk==='turkey'};
      });
    }
    const rows=w.map(x=>{
      const d=q[x.sym]||{};
      const cls=d.chg==null?'neutral':(d.chg>0?'up':d.chg<0?'down':'neutral');
      const cur= x.market==='BIST'?'₺':'$';
      return `<tr style="cursor:pointer" onclick="openWatch('${x.sym}')" title="Analizi aç">
        <td><b>${safeHTML(x.sym)}</b> <span class="thd">${x.market==='BIST'?'BIST':'ABD'}</span></td>
        <td>${d.close!=null? cur+Number(d.close).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
        <td class="${cls}">${d.chg!=null? (d.chg>0?'▲ ':d.chg<0?'▼ ':'')+pct(d.chg) : '—'}</td>
        <td>${(d.pe!=null && isFinite(d.pe))? d.pe.toFixed(1)+'x' : '—'}</td>
        <td class="row-actions"><button class="delrow" onclick="event.stopPropagation();removeWatch('${x.sym}','${x.market}')" title="Listeden çıkar">✕</button></td>
      </tr>`;
    }).join('');
    box.innerHTML=`<table><thead><tr><th>Hisse</th><th>Fiyat</th><th>Günlük</th><th>F/K</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }catch(e){ box.innerHTML='<div class="hint">İzleme listesi fiyatları alınamadı.</div>'; }
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
  for(const [rx,tr,mi] of ECON_MAP){ if(rx.test(title)){ base=tr; imp=mi; mapped=true; break; } }
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
  const need=[...new Set(evs.filter(e=>!e.mappedTr).map(e=>e.title))];
  if(need.length){
    const tr=await translateTR(need);
    const tmap={}; need.forEach((t,i)=>tmap[t]=tr[i]||t);
    evs.forEach(e=>{ if(!e.mappedTr) e.trName=tmap[e.title]; });
  }
  const fD=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'short',weekday:'short'});
  const fT=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'});
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
  document.getElementById('econCountries').innerHTML=ECON_COUNTRIES.map(([cc,name])=>
    `<button class="cbox" id="cbox-${cc}" onclick="toggleEconCountry('${cc}')">${flagSpan(cc)}<span>${name}</span></button>`).join('');
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
    const c=ECON_COUNTRIES.find(x=>x[0]===cc)||[cc,cc];
    const el=document.createElement('div');
    el.className='card'; el.id='epanel-'+cc;
    el.innerHTML=`<h2 style="display:flex;align-items:center;gap:9px">${flagSpan(cc)}${c[1]} Ekonomik Takvimi</h2>
      <div class="toolbar" id="econTime-${cc}" style="margin:10px 0 6px">
        ${[['dun','Dün'],['bugun','Bugün'],['yarin','Yarın'],['buhafta','Bu Hafta'],['gelecekhafta','Gelecek Hafta']]
          .map(([t,l])=>`<button data-t="${t}" onclick="setEconTime('${cc}','${t}')">${l}</button>`).join('')}
      </div>
      <div class="toolbar" id="econImp-${cc}">
        ${[[-1,'★ Düşük'],[0,'★★ Orta'],[1,'★★★ Yüksek']]
          .map(([i,l])=>`<button data-imp="${i}" onclick="setEconImp('${cc}',${i})">${l}</button>`).join('')}
      </div>
      <div id="econBody-${cc}"><div class="hint">Ekonomik takvim yükleniyor…</div></div>`;
    document.getElementById('econPanels').appendChild(el);
    syncEconBtns(cc);
    loadEconPanel(cc);
  }
  const hint=document.getElementById('econEmptyHint');
  if(hint) hint.style.display=Object.keys(ECON_PANELS).length?'none':'';
}
function setEconTime(cc,t){ const st=ECON_PANELS[cc]; if(!st) return; st.time=t; syncEconBtns(cc); loadEconPanel(cc); }
function setEconImp(cc,i){ const st=ECON_PANELS[cc]; if(!st) return; st.imp=i; renderEconPanel(cc); }
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
  if(box) box.innerHTML='<div class="hint">Ekonomik takvim yükleniyor…</div>';
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
    const timeAd={dun:'dün',bugun:'bugün',yarin:'yarın',buhafta:'bu hafta',gelecekhafta:'gelecek hafta'}[st.time]||'';
    const impAd={'-1':'düşük (★)','0':'orta (★★)','1':'yüksek (★★★)'}[String(st.imp)];
    box.innerHTML='<div class="hint">'+timeAd.charAt(0).toUpperCase()+timeAd.slice(1)+' için '+impAd+' önem düzeyinde veri yok. Farklı bir dönem veya önem düzeyi seçebilirsin.</div>';
    return;
  }
  const rows=list.map(e=>`<tr>
    <td style="white-space:nowrap">${safeHTML(e.dateLbl)} <span class="thd">${safeHTML(e.timeLbl)}</span></td>
    <td style="white-space:normal">${safeHTML(e.name||'')}</td>
    <td${e.aClr?` class="${e.aClr}"`:''}><b>${safeHTML(e.aStr||'—')}</b></td>
    <td>${safeHTML(e.fStr)}</td>
    <td>${safeHTML(e.pStr)}</td>
  </tr>`).join('');
  const kaynak = c.src==='Investing.com'
    ? 'İsim, önem yıldızı ve renkler doğrudan <b>Investing.com</b> ekonomik takviminden alınır.'
    : 'Investing.com şu an alınamadı → yedek kaynak <b>TradingView</b> (isim/önem yaklaşık).';
  box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr><th>Tarih (TSİ)</th><th>Veri</th><th>Açıklanan</th><th>Beklenti</th><th>Önceki</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="hint" style="margin-top:8px"><span class="up">Yeşil</span>/<span class="down">kırmızı</span> açıklanan değer, beklentiye göre olumlu/olumsuz demektir. "—" henüz açıklanmadı. ${kaynak}</div>`;
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
  document.getElementById('topCountries').innerHTML=ECON_COUNTRIES.map(([cc,name])=>
    `<button class="cbox" id="tbox-${cc}" onclick="toggleTopCountry('${cc}')">${flagSpan(cc)}<span>${name}</span></button>`).join('');
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
    const c=ECON_COUNTRIES.find(x=>x[0]===cc)||[cc,cc];
    const el=document.createElement('div');
    el.className='card'; el.id='tpanel-'+cc;
    el.innerHTML=`<h2 style="display:flex;align-items:center;gap:9px">${flagSpan(cc)}${c[1]} — Piyasa Değerine Göre İlk 100</h2>
      <div class="sub">Canlı sıralama (TradingView) — yalnızca bu borsada birincil kote şirketler. <b>Satıra tıklayınca analiz açılır.</b></div>
      <div id="topBody-${cc}"><div class="hint">İlk 100 listesi yükleniyor…</div></div>`;
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
        'price_earnings_ttm','price_book_fq','return_on_equity','net_margin','number_of_employees'],
      filter, sort:{sortBy:'market_cap_basic',sortOrder:'desc'}, range:[0,100]
    })});
    const j=r.ok?await r.json():null;
    if(myGen!==TOP100_GEN || TOP100_OPEN!==cc) return;   // bu arada kapatıldı/değişti
    const rows=(j&&j.data||[]).map(x=>x.d).filter(d=>d&&d[0]);
    if(!rows.length){ box.innerHTML='<div class="hint">Liste alınamadı.</div>'; return; }
    TOP100_CACHE[cc]={ rows, ts:Date.now() };
    renderTop100Panel(cc, rows);
  }catch(e){
    if(TOP100_OPEN===cc) box.innerHTML='<div class="hint">Liste alınamadı: '+e.message+'</div>';
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
    return `<tr style="cursor:pointer" onclick="searchExact('${code}')" title="${safeHTML(d[1]||d[0])} analizini aç">
      <td style="color:var(--muted)">${i+1}</td>
      <td><b>${safeHTML(d[0].replace(/_/g,'-'))}</b> <span class="ratio-formula">${safeHTML(d[1]||'')}</span></td>
      <td><b>${fmtMcapSym(d[2], m.sym)}</b></td>
      <td>${d[3]==null?'—':m.sym+d[3].toLocaleString('tr-TR',{maximumFractionDigits:2})}</td>
      <td>${xx(d[5])}</td>
      <td>${xx(d[6])}</td>
      <td>${pp(d[7])}</td>
      <td>${pp(d[8])}</td>
      <td>${fmtEmployees(d[9])}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Şirket</th><th>Piyasa Değeri</th><th>Fiyat</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>Net Marj</th><th>Çalışan</th></tr></thead>
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
/* Kolon indeksleri: 0 name … 13 RSI, 14 Perf.3M, 15 Vol.M, 16 relVol, 17 beta; earn modunda +18 tarih */
const SCAN_COLS=['name','description','market_cap_basic','close','change',
  'price_earnings_ttm','price_book_fq','return_on_equity','net_margin','dividend_yield_recent','sector',
  'SMA50','SMA200','RSI','Perf.3M','Volatility.M','relative_volume_10d_calc','beta_1_year'];
const SCAN_COLS_EARN=SCAN_COLS.concat(['earnings_release_next_date']);
const SCAN_I={name:0,desc:1,mcap:2,close:3,chg:4,pe:5,pb:6,roe:7,nm:8,div:9,sector:10,
  sma50:11,sma200:12,rsi:13,perf3m:14,vol:15,relvol:16,beta:17,earn:18};
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
function initScanPage(){
  if(SCAN_PAGE_INIT) return;
  SCAN_PAGE_INIT=true;
  document.getElementById('scanCountries').innerHTML=ECON_COUNTRIES.map(([cc,name])=>
    `<button class="cbox" id="scanbox-${cc}" onclick="selectScanCountry('${cc}')">${flagSpan(cc)}<span>${name}</span></button>`).join('');
  selectScanCountry('TR');
}
function selectScanCountry(cc){
  document.getElementById('scanbox-'+SCAN_CC)?.classList.remove('active');
  SCAN_CC=cc;
  document.getElementById('scanbox-'+cc)?.classList.add('active');
  loadScanMarket(cc);
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
  const cName=(ECON_COUNTRIES.find(x=>x[0]===cc)||[cc,cc])[1];
  if(title) title.innerHTML=`${flagSpan(cc)}${cName} — Hisse Tarayıcı`;
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
    return;
  }
  const myGen=++SCAN_GEN;
  SCAN_RAW=[]; SCAN_VIEW=[]; SCAN_PAGE=0;
  box.innerHTML=mode==='earn'
    ? '<div class="hint">TradingView — yaklaşan kazanç tarihine göre sıralanıyor…</div>'
    : '<div class="hint">TradingView’den tüm hisseler yükleniyor…</div>';
  if(sub) sub.textContent=mode==='earn'
    ? 'sortBy=earnings_release_next_date (TradingView)'
    : 'Sayfalar halinde çekiliyor (type=stock · birincil kotasyon)';
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
      if(sub) sub.textContent=`Yükleniyor… ${all.length}${total?(' / '+total):''} hisse`;
      box.innerHTML=`<div class="hint">Yükleniyor… <b>${all.length}</b>${total?(' / <b>'+total+'</b>'):''} hisse</div>`;
      if(!chunk.length || all.length>=total || chunk.length<SCAN_FETCH_SIZE) break;
      start=end;
      // güvenlik: aşırı büyük pazarlarda (ABD) yine de tamamını çek — üst sınır yok, TV totalCount kadar
      if(start>20000) break;
    }
    if(myGen!==SCAN_GEN) return;
    SCAN_CACHE[cacheKey]={ rows:all, ts:Date.now(), total:total||all.length };
    SCAN_RAW=all;
    applyScanFilters();
  }catch(e){
    if(myGen===SCAN_GEN){
      box.innerHTML='<div class="hint">Liste alınamadı: '+safeHTML(e.message)+'</div>';
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
    return true;
  });
  SCAN_PAGE=0;
  renderScanPage();
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
    const capNote=SCAN_CAPS.has('all')?'tüm dilimler':[...SCAN_CAPS].join('+');
    const maNote=SCAN_MA.size?[...SCAN_MA].map(x=>x==='sma50'?'>SMA50':'>SMA200').join(' · '):'trend yok';
    const qNote=SCAN_QF.size?[...SCAN_QF].join('+'):'quant filtresi yok';
    sub.innerHTML=`<b>${sorted.length}</b> / ${SCAN_RAW.length} hisse · ${capNote} · ${maNote} · ${qNote} · sayfa ${SCAN_PAGE+1}/${pages} · TradingView · <b>satıra tıkla → analiz</b>`;
  }
  if(!sorted.length){
    box.innerHTML='<div class="hint">Filtreye uyan hisse yok. Dilimleri gevşetin veya aramayı temizleyin.</div>';
    if(pager) pager.style.display='none';
    return;
  }
  // TV: ROE/net_margin yüzde puan; dividend_yield_recent kesir; change yüzde puan
  const pp=v=>v==null?'—':v.toFixed(1)+'%';
  const dy=v=>v==null?'—':(v*100).toFixed(1)+'%';
  const xx=v=>v==null?'—':v.toFixed(1)+'x';
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
  const earnCell=ts=>{
    if(ts==null || !Number.isFinite(ts)) return '—';
    return new Date(ts*1000).toLocaleDateString('tr-TR',{day:'2-digit',month:'short',year:'numeric'});
  };
  const trRows=slice.map((d,i)=>{
    const code=m.click(String(d[0]).replace(/_/g,'-'));
    const n=SCAN_PAGE*SCAN_PAGE_SIZE+i+1;
    const qs=scanQuantScore(d);
    return `<tr style="cursor:pointer" onclick="searchExact('${code}')" title="${safeHTML(d[1]||d[0])} analizini aç">
      <td style="color:var(--muted)">${n}</td>
      <td><b>${safeHTML(String(d[0]).replace(/_/g,'-'))}</b></td>
      <td><span class="ratio-formula">${safeHTML(d[1]||'')}</span></td>
      <td><b>${fmtMcapSym(d[SCAN_I.mcap], m.sym)}</b></td>
      <td>${d[SCAN_I.close]==null?'—':m.sym+Number(d[SCAN_I.close]).toLocaleString('tr-TR',{maximumFractionDigits:2})}</td>
      <td>${chg(d[SCAN_I.chg])}</td>
      ${showEarn?`<td style="white-space:nowrap">${earnCell(d[SCAN_I.earn])}</td>`:''}
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
    <th>#</th><th>Kod</th><th>Şirket</th><th>Piyasa Değeri</th><th>Fiyat</th><th>Günlük</th>
    ${showEarn?'<th>Yaklaşan kazanç tarihi</th>':''}
    <th>Q</th><th>RSI</th><th>3A</th><th>Vol</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>Temettü</th><th>Sektör</th>
  </tr></thead><tbody>${trRows}</tbody></table></div>`;
  if(pager){
    pager.style.display='flex';
    document.getElementById('scanPageInfo').textContent=`Sayfa ${SCAN_PAGE+1} / ${pages} · ${slice.length} satır`;
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
    `<button class="cbox" id="sbox-GLOBAL" onclick="selectSectCountry('GLOBAL')"><span class="cfl" style="font-size:17px;line-height:1">🌍</span><span>Bütün Dünya</span></button>`+
    ECON_COUNTRIES.map(([cc,name])=>
      `<button class="cbox" id="sbox-${cc}" onclick="selectSectCountry('${cc}')">${flagSpan(cc)}<span>${name}</span></button>`).join('');
  document.getElementById('sectSectors').innerHTML=SECT_SECTORS.map(([id,ic,name])=>
    `<button class="cbox" id="secbox-${id}" onclick="toggleSectSector('${id}')"><span class="cfl" style="font-size:16px;line-height:1">${ic}</span><span>${name}</span></button>`).join('');
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
  const cName = cc==='GLOBAL' ? 'Bütün Dünya' : (ECON_COUNTRIES.find(x=>x[0]===cc)||[cc,cc])[1];
  const cIcon = cc==='GLOBAL' ? '<span class="cfl" style="font-size:17px;line-height:1">🌍</span>' : flagSpan(cc);
  const el=document.createElement('div');
  el.className='card'; el.id='spanel';
  el.innerHTML=`<h2 style="display:flex;align-items:center;gap:9px">${cIcon}${cName} — ${def[1]} ${def[2]} Devleri</h2>
    <div class="sub">Piyasa değerine göre canlı sıralama (TradingView${cc==='GLOBAL'?', USD':''}). <b>Satıra tıklayınca analiz açılır.</b>${def[3].curated?' Liste küratörlüdür (TV\'de bu kategori ayrı sektör olarak sınıflandırılmaz).':''}</div>
    <div id="sectBody"><div class="hint">Yükleniyor…</div></div>`;
  document.getElementById('sectPanel').appendChild(el);
  const key=id+':'+cc;
  const cached=SECT_CACHE[key];
  if(cached && (Date.now()-cached.ts)<10*60000){ renderSectPanel(def, cc, cached.rows); return; }
  const myGen=++SECT_GEN;
  try{
    const cols=['name','description','market_cap_basic','close','currency',
      'price_earnings_ttm','price_book_fq','return_on_equity','net_margin','number_of_employees'];
    let rows;
    if(def[3].curated){
      let list=SECT_CURATED[def[3].curated];
      if(cc!=='GLOBAL') list=list.filter(([,c])=>c===cc);
      if(!list.length){ if(SECT_OPEN===id) document.getElementById('sectBody').innerHTML='<div class="hint">Bu ülkede bu kategoriden izlenen şirket yok. 🌍 Bütün Dünya görünümünü dene.</div>'; return; }
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
    if(!rows.length){ document.getElementById('sectBody').innerHTML='<div class="hint">Bu ülke/sektör kombinasyonunda şirket bulunamadı. 🌍 Bütün Dünya görünümünü dene.</div>'; return; }
    SECT_CACHE[key]={ rows, ts:Date.now() };
    renderSectPanel(def, cc, rows);
  }catch(e){
    if(SECT_OPEN===id) document.getElementById('sectBody').innerHTML='<div class="hint">Liste alınamadı: '+e.message+'</div>';
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
    const click=codeFn?` style="cursor:pointer" onclick="searchExact('${codeFn(base)}')" title="${safeHTML(d[1]||d[0])} analizini aç"`:' title="Bu borsa uygulamada analiz için desteklenmiyor"';
    const price=d[3]==null?'—':(cc==='GLOBAL'
      ? d[3].toLocaleString('tr-TR',{maximumFractionDigits:2})+' '+safeHTML(d[4]||'')
      : mSym+d[3].toLocaleString('tr-TR',{maximumFractionDigits:2}));
    return `<tr${click}>
      <td style="color:var(--muted)">${i+1}</td>
      <td><b>${safeHTML(base)}</b> <span class="ratio-formula">${safeHTML(d[1]||'')}</span></td>
      <td><b>${fmtMcapSym(d[2], cc==='GLOBAL'?'$':mSym)}</b></td>
      <td>${price}</td>
      <td>${xx(d[5])}</td>
      <td>${xx(d[6])}</td>
      <td>${pp(d[7])}</td>
      <td>${pp(d[8])}</td>
      <td>${fmtEmployees(d[9])}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Şirket</th><th>Piyasa Değeri</th><th>Fiyat</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>Net Marj</th><th>Çalışan</th></tr></thead>
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
          <a href="${kapLink}" target="_blank" rel="noopener" onclick="event.stopPropagation()">KAP'ta tam bildirimi oku →</a></div>
      </div>`;
    }).join('');
  }catch(e){ box.innerHTML='<div class="hint">KAP bildirimleri alınamadı: '+e.message+'</div>'; }
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
  if(m<=1.3) return ['Güçlü Al','g-buy'];
  if(m<=1.7) return ['Al','g-buy'];
  if(m<=2.3) return ['Tut','g-hold'];
  if(m<=2.7) return ['Sat','g-sell'];
  return ['Güçlü Sat','g-sell'];
}
/* Fintables tavsiye tipi → Türkçe rozet (skor: 1=olumlu, 2=nötr, 3=olumsuz — konsensüs için) */
const FT_TYPE={
  al:['Al','g-buy',1], endeks_ustu:['Endeks Üstü','g-buy',1], guclu_al:['Güçlü Al','g-buy',1],
  tut:['Tut','g-hold',2], endekse_paralel:['Endekse Paralel','g-hold',2], notr:['Nötr','g-hold',2],
  sat:['Sat','g-sell',3], endeks_alti:['Endeks Altı','g-sell',3]
};
async function fetchTargetsBIST(sym, myGen){
  const card=document.getElementById('targetCard'), box=document.getElementById('targetBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">Analist verisi yükleniyor…</div>';
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
      const scores=rows.map(r=>FT_TYPE[r.type]&&FT_TYPE[r.type][2]).filter(Boolean);
      const rl=scores.length?tvMarkLabel(scores.reduce((a,b)=>a+b,0)/scores.length):null;
      const up=(cur&&mean)?(mean-cur)/cur*100:null;
      const upCls=up==null?'neutral':(up>0?'up':'down');
      html+=`<div class="tgt-grid">
        <div class="tgt-box"><div class="lbl">Konsensüs Hedef (Ort.)</div>
          <div class="big">${fmtUSD(mean)}</div>
          ${up!=null?`<div class="sm ${upCls}">${up>0?'▲':'▼'} ${pct(up)} <span class="neutral">cari fiyata göre potansiyel</span></div>`:''}
          ${cur!=null?`<div class="sm neutral">Cari fiyat: ${fmtUSD(cur)}</div>`:''}</div>
        <div class="tgt-box"><div class="lbl">En Yüksek / En Düşük</div>
          <div class="big" style="font-size:19px">${fmtUSD(hi)} <span class="neutral" style="font-size:14px">/ ${fmtUSD(lo)}</span></div>
          <div class="sm neutral">kurum hedef aralığı</div></div>
        <div class="tgt-box"><div class="lbl">Genel Tavsiye</div>
          <div class="big">${rl?`<span class="grade ${rl[1]}">${rl[0]}</span>`:'—'}</div>
          <div class="sm neutral">${rows.length} aracı kurum · son 12 ay</div></div>
      </div>`;
      // Kurum bazlı tablo — ABD tarafındaki tabloyla aynı düzen
      const trRows=rows.slice(0,20).map(r=>{
        const t=FT_TYPE[r.type]||['—','g-hold'];
        const ds=r.d.toLocaleDateString('tr-TR',{day:'2-digit',month:'short',year:'numeric'});
        return `<tr><td>${safeHTML(r.firm)}</td>
          <td><span class="grade ${t[1]}">${t[0]}</span></td>
          <td>${r.tgt!=null?fmtUSD(r.tgt):'—'}</td>
          <td>${ds}</td></tr>`;
      }).join('');
      html+=`<div style="margin-top:18px;font-weight:700;color:var(--ink)">Aracı Kurum Hedef Fiyatları — Kurum Bazında</div>
        <table style="margin-top:8px"><thead><tr><th>Aracı Kurum</th><th>Tavsiye</th><th>Hedef Fiyat</th><th>Tarih</th></tr></thead><tbody>${trRows}</tbody></table>
        <div class="hint" style="margin-top:10px">Kaynak: Fintables (aracı kurum araştırma raporları) · her kurumun en güncel hedefi.</div>`;
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
      box.innerHTML='<div class="hint">Bu hisse için analist verisi bulunamadı. (Küçük/az izlenen şirketlerde aracı kurum kapsaması olmayabilir.)</div>';
      return;
    }
    const [mean,hi,lo,tot]=d, mark=d[9], close=d[10];
    const cur2=cur!=null?cur:close;
    const up=(cur2&&mean)?(mean-cur2)/cur2*100:null;
    const upCls=up==null?'neutral':(up>0?'up':'down');
    const rl=tvMarkLabel(mark);
    box.innerHTML=`<div class="tgt-grid">
      <div class="tgt-box"><div class="lbl">Konsensüs Hedef (Ort.)</div>
        <div class="big">${fmtUSD(mean)}</div>
        ${up!=null?`<div class="sm ${upCls}">${up>0?'▲':'▼'} ${pct(up)} <span class="neutral">cari fiyata göre potansiyel</span></div>`:''}
        ${cur2!=null?`<div class="sm neutral">Cari fiyat: ${fmtUSD(cur2)}</div>`:''}</div>
      <div class="tgt-box"><div class="lbl">En Yüksek / En Düşük</div>
        <div class="big" style="font-size:19px">${fmtUSD(hi)} <span class="neutral" style="font-size:14px">/ ${fmtUSD(lo)}</span></div>
        <div class="sm neutral">aracı kurum hedef aralığı</div></div>
      <div class="tgt-box"><div class="lbl">Genel Tavsiye</div>
        <div class="big">${rl?`<span class="grade ${rl[1]}">${rl[0]}</span>`:'—'}</div>
        <div class="sm neutral">${tot!=null?tot+' aracı kurum analisti':''}</div></div>
    </div>
    <div class="hint" style="margin-top:10px">Kurum bazlı liste şu an alınamadı; TradingView/Refinitiv konsensüsü gösteriliyor.</div>`;
  }catch(e){ box.innerHTML='<div class="hint">Analist verisi alınamadı: '+e.message+'</div>'; }
}

/* Avrupa analist hedefleri — Fintables/Finviz Avrupa'yı kapsamıyor; doğrudan TradingView/Refinitiv
   konsensüsü (kurum bazlı liste yok, BIST'in yedek yolu ile aynı mantık). */
async function fetchTargetsEU(sym, euInfo, myGen){
  const card=document.getElementById('targetCard'), box=document.getElementById('targetBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">Analist verisi yükleniyor…</div>';
  try{
    const tvTicker=euInfo.tv+':'+euInfo.base.replace(/-/g,'_');
    const r=await fetch('https://scanner.tradingview.com/'+euInfo.scan+'/scan',
      {method:'POST',body:JSON.stringify({symbols:{tickers:[tvTicker]},columns:TVT_COLS})});
    const j=r.ok?await r.json():null;
    if(myGen!=null && myGen!==REQ_GEN) return;
    const d=j&&j.data&&j.data[0]&&j.data[0].d;
    if(!d || d[0]==null){
      box.innerHTML='<div class="hint">Bu hisse için analist hedef fiyatı bulunamadı. (Küçük/az izlenen şirketlerde aracı kurum kapsaması olmayabilir.)</div>';
      return;
    }
    const [mean,hi,lo,tot]=d, mark=d[9], close=d[10];
    const up=(close&&mean)?(mean-close)/close*100:null;
    const upCls=up==null?'neutral':(up>0?'up':'down');
    const rl=tvMarkLabel(mark);
    box.innerHTML=`<div class="tgt-grid">
      <div class="tgt-box"><div class="lbl">Konsensüs Hedef (Ort.)</div>
        <div class="big">${fmtUSD(mean)}</div>
        ${up!=null?`<div class="sm ${upCls}">${up>0?'▲':'▼'} ${pct(up)} <span class="neutral">cari fiyata göre potansiyel</span></div>`:''}
        ${close!=null?`<div class="sm neutral">Cari fiyat: ${fmtUSD(close)}</div>`:''}</div>
      <div class="tgt-box"><div class="lbl">En Yüksek / En Düşük</div>
        <div class="big" style="font-size:19px">${fmtUSD(hi)} <span class="neutral" style="font-size:14px">/ ${fmtUSD(lo)}</span></div>
        <div class="sm neutral">aracı kurum hedef aralığı</div></div>
      <div class="tgt-box"><div class="lbl">Genel Tavsiye</div>
        <div class="big">${rl?`<span class="grade ${rl[1]}">${rl[0]}</span>`:'—'}</div>
        <div class="sm neutral">${tot!=null?tot+' aracı kurum analisti':''}</div></div>
    </div>
    <div class="hint" style="margin-top:10px">Kurum bazlı liste Avrupa'da mevcut değil (Fintables/Finviz bu bölgeyi kapsamıyor) — TradingView/Refinitiv konsensüsü gösteriliyor. Kaynak: TradingView.</div>`;
  }catch(e){ box.innerHTML='<div class="hint">Analist verisi alınamadı: '+e.message+'</div>'; }
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
/* opts: { ysym: Yahoo sembolü (BIST için "THYAO.IS"), shares: hazır pay adedi (BIST: ödenmiş sermaye) } */
async function fetchPrice(sym, cik, myGen, opts){
  const lp=document.getElementById('livePrice'), pn=document.getElementById('priceNote');
  const fd0=FIN&&FIN.filedD0, fd1=FIN&&FIN.filedD1;
  const ysym=(opts&&opts.ysym)||sym;   // Yahoo'ya giden sembol; ekranda sym gösterilir
  try{
    const now=Math.floor(Date.now()/1000)+86400;
    const earliest = fd1||fd0||'2015-01-01';
    const p1=Math.floor(new Date(earliest).getTime()/1000) - 10*86400;
    // Canlı (range=1d) + geçmiş (tarih aralığı) + dolaşımdaki pay sayısı paralel
    const [liveR, histR, shares]=await Promise.all([
      fetch(`/price?s=${encodeURIComponent(ysym)}&range=1d`).then(x=>x.json()).catch(()=>null),
      fetch(`/price?s=${encodeURIComponent(ysym)}&p1=${p1}&p2=${now}`).then(x=>x.json()).catch(()=>null),
      (opts&&opts.shares!=null)? Promise.resolve(opts.shares) : (cik? fetchShares(cik) : Promise.resolve(null))
    ]);
    if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
    const res = histR&&histR.chart&&histR.chart.result&&histR.chart.result[0];
    const liveRes = liveR&&liveR.chart&&liveR.chart.result&&liveR.chart.result[0];
    if(!res && !liveRes){ lp.classList.add('hidden'); return; }
    const m=(liveRes&&liveRes.meta) || (res&&res.meta) || {};
    const ts=(res&&res.timestamp)||[];
    let closes=(res&&res.indicators&&res.indicators.quote&&res.indicators.quote[0].close)||[];
    // Londra borsası (LSE) fiyatları peni (GBp) cinsinden gelir, pound değil — 100'e bölünmezse
    // piyasa değeri 100 kat şişer. m.currency==='GBp' olduğunda tüm fiyatları poundlaştır.
    if(m.currency==='GBp'){
      if(m.regularMarketPrice!=null) m.regularMarketPrice/=100;
      if(m.chartPreviousClose!=null) m.chartPreviousClose/=100;
      closes=closes.map(c=>c==null?c:c/100);
    }
    // Belirli tarihteki (veya bir önceki işlem günündeki) kapanış
    const closeOn=iso=>{
      if(!iso) return null;
      const tgt=new Date(iso).getTime()/1000 + 86400;   // gün sonu
      let best=null;
      for(let i=0;i<ts.length;i++){ if(ts[i]<=tgt){ if(closes[i]!=null) best=closes[i]; } else break; }
      return best;
    };
    // Canlı fiyat (sağ üst)
    const live=m.regularMarketPrice, prevC=m.chartPreviousClose;
    if(live!=null){
      const ch = (prevC? (live-prevC)/prevC*100 : null);
      const cls = ch==null?'neutral':(Math.abs(ch)<0.005?'neutral':(ch>0?'up':'down'));
      const ar  = ch==null?'':(ch>0?'▲':ch<0?'▼':'→');
      lp.innerHTML=`<span class="lp-sym">${sym}</span><span class="lp-val">${fmtUSD(live)}</span>`+
        (ch!=null?`<span class="lp-chg ${cls}">${ar} ${pct(ch)}</span>`:'')+
        `<span class="lp-live">● canlı</span>`;
      lp.classList.remove('hidden');
    }else lp.classList.add('hidden');
    // Piyasa değeri (≈ canlı fiyat × dolaşımdaki pay) → sağ üstteki rozet
    const mcap = (live!=null && shares) ? live*shares : null;
    const badge=document.getElementById('hdBadge');
    if(badge){
      if(mcap!=null){
        badge.className='hd-badge mcap';
        badge.innerHTML=`<span class="mc-lbl">Piyasa Değeri</span><span class="mc-eq">=</span><span class="mc-val">${fmtMcap(mcap)}</span>`;
      }else{
        badge.className='hd-badge'; badge.textContent='SEC EDGAR + Bing News';
      }
    }
    // Değerleme oranları (canlı): F/K, PD/DD — en güncel piyasa değeri + SEC verisiyle
    renderValuation(mcap);
    // Dönemsel fiyatlar (açıklandığı gün) — Bilanço Verisi
    const pCur=closeOn(fd0), pPrev=closeOn(fd1);
    const chip=(lbl,date,price,color)=> price==null?'' :
      `<div style="background:var(--surface-2);border:1px solid var(--line);border-left:3px solid ${color};border-radius:9px;padding:7px 11px;font-size:12px">
        <span style="color:var(--muted)">${lbl}${date?' · açıklanma '+fmtDate(date):''}:</span>
        <b style="color:var(--ink);margin-left:5px;font-variant-numeric:tabular-nums">${fmtUSD(price)}</b></div>`;
    pn.innerHTML = chip('Cari dönem fiyatı', fd0, pCur, 'var(--accent)') + chip('Önceki dönem fiyatı', fd1, pPrev, 'var(--muted)');
    pn.classList.toggle('hidden', !pn.innerHTML.trim());
  }catch(e){ lp.classList.add('hidden'); }
}

/* Değerleme oranları (canlı): F/K = Piyasa Değeri / Net Kâr, PD/DD = Piyasa Değeri / Özkaynak.
   "En güncel": Piyasa Değeri anlık fiyattan; Net Kâr yıllık modda son tam yıl, çeyreklik modda
   son 4 çeyreğin toplamı (TTM); Defter Değeri (özkaynak) en güncel bilançodan. */
function renderValuation(mcap){
  const card=document.getElementById('valCard'), box=document.getElementById('valBody');
  if(!card||!box) return;
  if(!FIN || mcap==null){ card.classList.add('hidden'); return; }
  const D=FIN.balance, D0=FIN.D0;
  const vv=(m,d)=> (d && m && (d in m)) ? m[d] : 0;
  // Defter Değeri (özkaynak) — uygulamanın her yerinde kullanılan sağlam türetme
  const bookValue = vv(D.assets,D0) - liabTotal(D,D0);
  // Net Kâr (F/K için): yıllık = son tam yıl; çeyreklik = son 4 çeyrek toplamı (TTM)
  const niSeries=FIN.income&&FIN.income.netIncome||{};
  const niDates=Object.keys(niSeries).sort().reverse();
  let netIncome=null, niLabel='';
  if(FIN.mode==='quarter'){
    if(niDates.length>=4){ netIncome=niDates.slice(0,4).reduce((a,d)=>a+niSeries[d],0); niLabel='son 4 çeyrek (TTM)'; }
  }else if(niDates.length){ netIncome=niSeries[niDates[0]]; niLabel='son yıl ('+String(niDates[0]).slice(0,4)+')'; }

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
    cell('Piyasa Değeri (PD)', fmtMcap(mcap), 'anlık fiyat × dolaşımdaki pay') +
    cell('F/K (Fiyat / Kazanç)', x2(fk), netIncome==null?'net kâr verisi yetersiz':(netIncome<0?'şirket zararda — hesaplanamaz':'Net Kâr: '+fmtMcap(netIncome)+' · '+niLabel), fkCls) +
    cell('PD/DD (Piyasa Değ. / Defter Değ.)', x2(pddd), bookValue>0?'Defter Değeri: '+fmtMcap(bookValue):'özkaynak negatif — hesaplanamaz', pdCls) +
    cell('Defter Değeri (DD)', fmtMcap(bookValue), 'özkaynak (en güncel bilanço)');
  card.classList.remove('hidden');
}

/* Güncel haberler — Google News (en güncel) + Türkçe çeviri (anahtarsız köprü) */
const safeHTML = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function relTime(d){
  const diff=(Date.now()-d.getTime())/1000;
  if(diff<3600) return Math.max(1,Math.round(diff/60))+' dk önce';
  if(diff<86400) return Math.round(diff/3600)+' saat önce';
  if(diff<604800) return Math.round(diff/86400)+' gün önce';
  return d.toLocaleDateString('tr-TR',{day:'2-digit',month:'short',year:'numeric'});
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
  box.innerHTML='<div class="hint">Haberler yükleniyor…</div>';
  const isBist = FIN && FIN.market==='BIST';
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
    if(!items.length){ box.innerHTML='<div class="hint">Bu hisse için güncel haber bulunamadı.</div>'; return; }

    // Başlık + özetler: BIST haberleri zaten Türkçe → çeviri atlanır (hız + doğruluk);
    // ABD haberleri tek havuzda Türkçe'ye çevrilir (eşzamanlılık sınırlı)
    const allTexts=[...items.map(i=>i.title), ...items.map(i=>i.desc||'—')];
    const tr = isBist ? allTexts : await translateTR(allTexts);
    if(myGen!=null && myGen!==REQ_GEN) return;   // beklerken daha yeni bir arama başlamış
    const trTitles=tr.slice(0,items.length), trDescs=tr.slice(items.length);
    box.innerHTML=items.map((it,idx)=>{
      const meta=[it.src, it.d?relTime(it.d):''].filter(Boolean).join(' · ');
      const sum=safeHTML(trDescs[idx]||it.desc||'Bu haber için özet bulunamadı.');
      const links = `<a href="${it.link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${isBist?'Habere git →':'Orijinal habere git (İng.) →'}</a>`;
      return `<div class="news" onclick="toggleNews(this)">
        <div class="news-t"><span class="chev">▶</span><span>${safeHTML(trTitles[idx]||it.title)}</span></div>
        <div class="news-m">${safeHTML(meta)}</div>
        <div class="news-sum">${sum}<br>${links}</div>
      </div>`;
    }).join('');
  }catch(e){ box.innerHTML='<div class="hint">Haberler alınamadı: '+e.message+'</div>'; }
}
/* Haber başlığına tıklayınca özeti aç/kapat */
function toggleNews(el){ el.classList.toggle('open'); }

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
  ['dunya',      '🌍 Dünya Gündemi',      'world news',                     'international breaking news'],
  ['piyasa',     '💹 Piyasalar',          'stock market',                   'global markets'],
  ['ekonomi',    '💼 Ekonomi',            'economy inflation',              'global economy'],
  ['merkez',     '🏦 Merkez Bankaları',   'federal reserve interest rates', 'central bank policy'],
  ['teknoloji',  '⚡ Teknoloji',          'technology',                     'artificial intelligence'],
  ['enerji',     '🛢️ Enerji & Emtia',     'oil prices',                     'gold commodities'],
  ['jeopolitik', '🌐 Jeopolitik',         'geopolitics',                    'diplomacy sanctions'],
];
let WNEWS_TOPIC='dunya', WNEWS_GEN=0, WNEWS_PAGE_INIT=false;
const WNEWS_CACHE={};   // konu → { html, ts } (10 dk — çeviri maliyetli, hazır HTML saklanır)
function initWnewsPage(){
  if(WNEWS_PAGE_INIT){ return; }
  WNEWS_PAGE_INIT=true;
  document.getElementById('wnewsTopics').innerHTML=WNEWS_TOPICS.map(([id,label])=>
    `<button data-t="${id}" onclick="setWnewsTopic('${id}')">${label}</button>`).join('');
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
  const cached=WNEWS_CACHE[topic[0]];
  if(cached && (Date.now()-cached.ts)<10*60000){ box.innerHTML=cached.html; return; }
  box.innerHTML='<div class="hint">Haberler yükleniyor ve Türkçe\'ye çevriliyor…</div>';
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
    if(!items.length){ box.innerHTML='<div class="hint">Bu konuda güncel haber bulunamadı — başka bir konu dene.</div>'; return; }
    // Başlık + özetleri Türkçe'ye çevir (şirket haberleriyle aynı zincir: Google gtx → MyMemory)
    const allTexts=[...items.map(i=>i.title), ...items.map(i=>i.desc||'—')];
    const tr=await translateTR(allTexts);
    if(myGen!==WNEWS_GEN || WNEWS_TOPIC!==topic[0]) return;
    const trTitles=tr.slice(0,items.length), trDescs=tr.slice(items.length);
    const html=items.map((it,idx)=>{
      const meta=[it.src, it.d?relTime(it.d):''].filter(Boolean).join(' · ');
      const sum=safeHTML(trDescs[idx]||it.desc||'Bu haber için özet bulunamadı.');
      return `<div class="news" onclick="toggleNews(this)">
        <div class="news-t"><span class="chev">▶</span><span>${safeHTML(trTitles[idx]||it.title)}</span></div>
        <div class="news-m">${safeHTML(meta)}</div>
        <div class="news-sum">${sum}<br><a href="${it.link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Orijinal habere git (İng.) →</a></div>
      </div>`;
    }).join('');
    WNEWS_CACHE[topic[0]]={ html, ts:Date.now() };
    box.innerHTML=html;
  }catch(e){ box.innerHTML='<div class="hint">Haberler alınamadı: '+e.message+'</div>'; }
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
    ['Nakit ve Nakit Benzerleri',D.cash],
    ['Kısa Vadeli Yatırımlar',D.stInv],
    ['Ticari Alacaklar',D.recv],
    ['Stoklar',D.inv],
  ],D.assetsCur,'Diğer Dönen Varlıklar');

  section('asset_noncur',[
    ['Maddi Duran Varlıklar',D.ppe],
    ['Şerefiye (Goodwill)',D.goodwill],
    ['Maddi Olmayan Duran Varlıklar',D.intang],
    ['Uzun Vadeli Yatırımlar',D.ltInv],
  ],null,'Diğer Duran Varlıklar', d=> (v(D.assets,d)-v(D.assetsCur,d)) );

  section('liab_current',[
    ['Ticari Borçlar',D.ap],
    ['Kısa Vadeli Finansal Borçlar',D.stDebt],
    ['Ertelenmiş Gelirler',D.defRev],
  ],D.liabCur,'Diğer Kısa Vadeli Yük.');

  section('liab_noncur',[
    ['Uzun Vadeli Finansal Borçlar',D.ltDebt],
  ],null,'Diğer Uzun Vadeli Yük.', d=> (liabTotal(D,d)-v(D.liabCur,d)) );

  // Özkaynak toplamı = Aktif − (sağlam) Toplam Yükümlülük → bilanço HER ZAMAN dengelenir.
  // Azınlık payları (NCI) ve mezzanine gibi StockholdersEquity'ye dahil OLMAYAN
  // kalemler "Diğer Özkaynak" satırında toplanır.
  section('equity',[
    ['Ödenmiş Sermaye',D.common],
    ['Dağıtılmamış Kârlar',D.retained],
  ],null,'Diğer Özkaynak Kalemleri', d=> (v(D.assets,d)-liabTotal(D,d)) );

  return out;
}

/* ---------- Tablo satır ekleme ---------- */
function rowHTML(name='', cat='asset_current', cur='', prev=''){
  const opts = Object.keys(CATS).map(k=>`<option value="${k}" ${k===cat?'selected':''}>${CATS[k]}</option>`).join('');
  const cell = v => (v===''||v===null||v===undefined) ? '' : fmtAbbr(Number(v));
  return `<tr>
    <td><input class="name" value="${name.replace(/"/g,'&quot;')}" placeholder="Kalem adı"></td>
    <td><select class="cell catsel">${opts}</select></td>
    <td><input class="cell cur" value="${cell(cur)}" inputmode="text"></td>
    <td><input class="cell prev" value="${cell(prev)}" inputmode="text"></td>
    <td class="row-actions"><button class="delrow" onclick="this.closest('tr').remove()" title="Sil">✕</button></td>
  </tr>`;
}
function addRow(group){
  const cat = group==='asset'?'asset_current':group==='liab'?'liab_current':'equity';
  document.getElementById('inputBody').insertAdjacentHTML('beforeend', rowHTML('',cat));
}
function setPeriodHeaders(curDate, prevDate){
  const th1=document.getElementById('thCur'), th2=document.getElementById('thPrev');
  if(th1) th1.innerHTML = 'Cari Dönem' + (curDate?`<br><span class="thd">${curDate}</span>`:'');
  if(th2) th2.innerHTML = 'Önceki Dönem' + (prevDate?`<br><span class="thd">${prevDate}</span>`:'');
}
function hidePriceUI(){
  const lp=document.getElementById('livePrice'), pn=document.getElementById('priceNote'), bd=document.getElementById('hdBadge');
  const tc=document.getElementById('targetCard'), vc=document.getElementById('valCard'), kc=document.getElementById('kapCard');
  const en=document.getElementById('earnNote');
  if(lp) lp.classList.add('hidden');
  if(pn){ pn.classList.add('hidden'); pn.innerHTML=''; }
  if(bd){ bd.className='hd-badge'; bd.textContent='SEC EDGAR + Bing News'; }
  if(tc) tc.classList.add('hidden');
  if(vc) vc.classList.add('hidden');
  if(kc) kc.classList.add('hidden');
  if(en){ en.classList.add('hidden'); en.innerHTML=''; }
  ['chartCard','sectorCard','insiderCard','ownerCard','techCard'].forEach(id=>{ const c=document.getElementById(id); if(c) c.classList.add('hidden'); });
  TECH_SHORT=null;
  const tss=document.getElementById('techShortSrc'); if(tss) tss.textContent='';
  const ws=document.getElementById('watchStar'); if(ws) ws.classList.add('hidden');
  stopNyClock();
}
function loadSample(){
  REQ_GEN++; FIN=null; hidePriceUI();
  const b=document.getElementById('inputBody'); b.innerHTML='';
  SAMPLE.forEach(r=>b.insertAdjacentHTML('beforeend', rowHTML(r[0],r[1],r[2],r[3])));
  setPeriodHeaders(null,null);
  analyze();
}
function clearAll(){ REQ_GEN++; FIN=null; hidePriceUI(); document.getElementById('inputBody').innerHTML=''; setPeriodHeaders(null,null); document.getElementById('results').classList.add('hidden'); }

/* ---------- Verileri oku ---------- */
function readData(){
  const rows=[...document.querySelectorAll('#inputBody tr')];
  return rows.map(tr=>({
    name: tr.querySelector('.name').value.trim()||'(adsız)',
    cat:  tr.querySelector('.catsel').value,
    cur:  num(tr.querySelector('.cur').value),
    prev: num(tr.querySelector('.prev').value)
  })).filter(r=>r.cur!==0||r.prev!==0);
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
function analyze(){
  const d=readData();
  colorInputRows();
  if(d.length===0){ alert('Lütfen en az bir kalem girin veya "Örnek Veri Yükle"ye basın.'); return; }
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
      stok:     sum(d,r=>/stok/i.test(r.name)&&r.cat==='asset_current',p),
      nakit:    sum(d,r=>/(nakit|kasa|banka(?!\s*kred))/i.test(r.name)&&r.cat==='asset_current',p),
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

  // Rapor başlığı (dışa aktarmada da kullanılır)
  const rt=document.getElementById('reportTitle');
  if(rt){
    if(!FIN) rt.textContent='Elle girilen veri';
    else{
      const mkt = FIN.market==='BIST' ? 'BIST'
                : FIN.market==='EU' && FIN.euInfo ? FIN.euInfo.country
                : 'ABD';
      const curLbl = FIN.market==='BIST' ? 'TL' : (FIN.cur || (FIN.market==='EU'?'—':'USD'));
      rt.textContent = `${FIN.ticker} · ${mkt} · ${FIN.mode==='annual'?'Yıllık':'Çeyreklik'} · ${fmtDate(FIN.D0)}${FIN.D1?'  ↔  '+fmtDate(FIN.D1):''} · ${curLbl}`;
    }
  }
  // Dönem notu: bildirilme tarihi + yıllık veride gecikme açıklaması
  const pn=document.getElementById('periodNote');
  if(pn){
    if(FIN && FIN.market==='BIST'){
      const bankTxt = FIN.bankGroup==='UFRS' ? ' <b>Banka/sigorta bilançosu:</b> dönen/duran ayrımı olmadığı için likidite oranları (cari oran vb.) bu şirketlerde sınırlı anlam taşır.' : '';
      pn.innerHTML = (FIN.mode==='annual'
        ? `📅 KAP verisi (İş Yatırım aracılığıyla) — en güncel tamamlanmış mali yıl. Daha taze veri için yukarıdan <b>Çeyreklik</b> seçin.`
        : `📅 KAP verisi (İş Yatırım aracılığıyla) — en güncel açıklanan çeyrek.`) + bankTxt;
    }else if(FIN && FIN.market==='EU'){
      const via = FIN.ifrsSource
        ? (FIN.mode==='quarter'
            ? 'Çeyreklik veri Yahoo Finance üzerinden.'
            : 'Çok yıllı veri Yahoo Finance / IFRS kaynaklarından.')
        : 'TradingView tek dönem özeti (çok yıllı veri bu şirket için bulunamadı).';
      pn.innerHTML = `📅 ${FIN.euInfo?FIN.euInfo.country+' borsası — ':''}${via}${FIN.mode==='annual'?' Daha taze veri için yukarıdan <b>Çeyreklik</b> seçin.':''}`;
    }else if(FIN){
      const filedTxt = FIN.filedD0 ? `📅 SEC'e bildirilme: ${fmtDate(FIN.filedD0)}.` : '';
      const lagTxt = FIN.mode==='annual'
        ? ` Yıllık rapor (10-K) yılda bir, tamamlanmış mali yıl için yayımlanır — bu en güncel tamamlanmış mali yıldır. Daha taze veri için yukarıdan <b>Çeyreklik</b> seçin.`
        : ` Çeyreklik rapor (10-Q) — en güncel ara dönem.`;
      pn.innerHTML = (filedTxt + lagTxt).trim();
    }else{
      pn.textContent='';
    }
  }
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
  section('ÖNEMLİ DEĞİŞİMLER', ['Kalem','Cari','Önceki','Değişim ($)','Değişim (%)','Yön'], '#varBody');

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
      delta=`<div class="delta ${cls}">${ar} ${pct(ch)} <span class="neutral">(önceki ${fmtFn(p)})</span></div>`; }
    return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">${fmtFn(c)}</div>${delta}</div>`;
  };
  const pp=v=>(v==null?'—':(v*100).toFixed(1)+'%');
  document.getElementById('profKpis').innerHTML=[
    kpi('Gelir (Hasılat)', rev0, rev1, fmtAbbr),
    kpi('Net Kâr', ni0, ni1, fmtAbbr),
    kpi('Net Kâr Marjı', nm0, nm1, pp),
    kpi('Özkaynak Kârlılığı (ROE)', roe0, roe1, pp),
  ].join('');

  // Gelir tablosu satırları
  const lines=[
    ['Gelir (Hasılat)','revenue',false],
    ['Satış Maliyeti','costRev',true],
    ['Brüt Kâr','grossProfit',false],
    ['Faaliyet Kârı','opIncome',false],
    ['Ar-Ge Gideri','rnd',true],
    ['Net Kâr','netIncome',false],
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
    ['Brüt Marj','Brüt Kâr / Gelir', rev0?(gp0!=null?gp0/rev0:null):null, rev1?(gp1!=null?gp1/rev1:null):null, v=>v>=0.4?'good':v>=0.2?'warn':'bad'],
    ['Faaliyet Marjı','Faaliyet Kârı / Gelir', rev0?(op0!=null?op0/rev0:null):null, rev1?(op1!=null?op1/rev1:null):null, v=>v>=0.15?'good':v>=0.05?'warn':'bad'],
    ['Net Kâr Marjı','Net Kâr / Gelir', nm0, nm1, v=>v>=0.1?'good':v>=0.03?'warn':'bad'],
    ['Özkaynak Kârlılığı (ROE)','Net Kâr / Özkaynak', roe0, roe1, v=>v>=0.15?'good':v>=0.08?'warn':'bad'],
    ['Aktif Kârlılığı (ROA)','Net Kâr / Toplam Varlık', roa0, roa1, v=>v>=0.07?'good':v>=0.03?'warn':'bad'],
  ];
  document.getElementById('profBody').innerHTML=defs.map(([nm,fo,c,p,st])=>{
    const status=c==null?'warn':st(c);
    const lbl=c==null?'—':(status==='good'?'İyi':status==='warn'?'Orta':'Zayıf');
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
  box.innerHTML='<div class="hint">Teknik veriler yükleniyor…</div>';
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
    if(!row){ box.innerHTML='<div class="hint">Teknik veri bulunamadı.</div>'; return; }
    const [rsi,sma50,sma200,hi52,lo52,pW,p1M,p3M,pYTD,pY,beta,volM,close]=row.d;
    const closes=((((((priceJ||{}).chart||{}).result||[])[0]||{}).indicators||{}).quote||[])[0];
    const closeArr=((closes&&closes.close)||[]).filter(x=>x!=null&&Number.isFinite(x));
    const fish=fisherTransform(closeArr, 21);
    const num=(v,d)=> v==null?'—':Number(v).toFixed(d==null?2:d);
    const clsOf=v=> v==null?'neutral':(v>0?'up':v<0?'down':'neutral');
    const sgn=v=> v==null?'—':(v>0?'+':'')+v.toFixed(1)+'%';
    // RSI bölgesi
    const rsiZone= rsi==null?['—','neutral'] : rsi>=70?['Aşırı Alım','down'] : rsi<=30?['Aşırı Satım','up'] : ['Nötr','neutral'];
    let fishZone=['—','neutral'], fishSub='';
    if(fish && fish.fisher!=null){
      const f=fish.fisher, t=fish.trigger;
      const cross=t==null?'':(f>t?'Fisher > tetik (yükseliş)':f<t?'Fisher < tetik (düşüş)':'nötr');
      if(f>=2) fishZone=['Aşırı alım bölgesi','down'];
      else if(f<=-2) fishZone=['Aşırı satım bölgesi','up'];
      else if(f>t) fishZone=['Momentum ↑','up'];
      else if(f<t) fishZone=['Momentum ↓','down'];
      else fishZone=['Nötr','neutral'];
      fishSub=(cross?(cross+' · '):'')+'tetik '+num(t,2);
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
    html+=kpi('Fisher Dönüşümü (21)', fish&&fish.fisher!=null?num(fish.fisher,2):'—', fishSub||fishZone[0], fishZone[1]);
    html+=kpi('50 Günlük Ort. Mesafe', sgn(d50), 'SMA50: '+num(sma50), clsOf(d50));
    html+=kpi('200 Günlük Ort. Mesafe', sgn(d200), 'SMA200: '+num(sma200), clsOf(d200));
    html+=kpi('Beta (1 Yıl)', num(beta), beta==null?'':(beta>1.2?'piyasadan oynak':beta<0.8?'piyasadan sakin':'piyasayla uyumlu'));
    html+=kpi('Aylık Volatilite', num(volM,1)+'%', 'günlük ort. dalgalanma');
    html+='</div>';
    // 52 hafta konum çubuğu
    if(pos!=null){
      html+=`<div style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">52 Hafta Aralığındaki Konum —
          <b style="color:var(--ink)">%${pos.toFixed(0)}</b>
          <span class="neutral">(düşük ${fmtUSD(lo52)} · yüksek ${fmtUSD(hi52)})</span></div>
        <div style="position:relative;height:10px;border-radius:6px;background:linear-gradient(90deg,var(--bad),var(--warn),var(--good))">
          <div style="position:absolute;left:${Math.min(99,Math.max(1,pos)).toFixed(1)}%;top:-4px;width:4px;height:18px;background:#fff;border-radius:2px;box-shadow:0 0 0 2px rgba(255,255,255,.25)"></div>
        </div></div>`;
    }
    // Dönemsel getiriler
    const perf=[['1 Hafta',pW],['1 Ay',p1M],['3 Ay',p3M],['Yıl Başından',pYTD],['1 Yıl',pY]];
    html+=`<table><thead><tr>${perf.map(p=>`<th>${p[0]}</th>`).join('')}</tr></thead>
      <tbody><tr>${perf.map(p=>`<td class="${clsOf(p[1])}"><b>${sgn(p[1])}</b></td>`).join('')}</tr></tbody></table>`;
    // ABD kısa pozisyonu (Finviz — fetchTargets doldurur; hazırsa bas, değilse sonra güncellenir)
    html+='<div id="techShortRow"></div>';
    box.innerHTML=html;
    renderTechShort();
  }catch(e){ box.innerHTML='<div class="hint">Teknik veri alınamadı: '+e.message+'</div>'; }
}
function renderTechShort(){
  const el=document.getElementById('techShortRow');
  if(!el || !TECH_SHORT || TECH_SHORT.floatPct==null) return;
  const s=TECH_SHORT;
  const cls=s.floatPct>=10?'down':s.floatPct>=5?'warn':'up';
  el.innerHTML=`<div style="margin-top:14px;padding:11px 14px;border:1px solid var(--line);border-left:4px solid var(--${cls==='down'?'bad':cls==='warn'?'warn':'good'});border-radius:11px;background:var(--surface-2);font-size:12.5px">
    <b style="color:var(--ink)">Kısa Pozisyon (ayı bahisleri):</b>
    dolaşımdaki payların <b class="${cls==='warn'?'neutral':cls}">%${s.floatPct.toFixed(2)}</b>'i açığa satılmış${s.ratio!=null?` · kapatma süresi ≈ <b>${s.ratio.toFixed(1)} gün</b>`:''}.
    <span class="neutral">%10+ yüksek ayı baskısı / short-squeeze potansiyeli demektir. Kaynak: Finviz.</span></div>`;
  document.getElementById('techShortSrc').textContent=' + Finviz (kısa pozisyon)';
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
  if(!slices.length){ card.classList.add('hidden'); return; }
  slices.forEach((s,i)=>s.color=PIE_COLORS[i%PIE_COLORS.length]);
  // Merkezde halka açıklık oranı (varsa)
  const halka=slices.find(s=>/halka|diğer/i.test(s.label));
  const legend=slices.map(s=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px">
    <span style="width:11px;height:11px;border-radius:3px;background:${s.color};flex:0 0 auto"></span>
    <span style="color:var(--ink);flex:1">${safeHTML(s.label)}</span>
    <b style="color:var(--ink);font-variant-numeric:tabular-nums">%${s.pct.toFixed(2)}</b></div>`).join('');
  box.innerHTML=`<div style="display:flex;gap:26px;align-items:center;flex-wrap:wrap">
    ${pieSVG(slices, halka?('%'+halka.pct.toFixed(1)):'', halka?'halka açık':'')}
    <div style="flex:1;min-width:230px">${legend}
      ${note?`<div class="hint" style="margin-top:8px">${note}</div>`:''}</div></div>`;
  card.classList.remove('hidden');
}
async function fetchOwnershipBIST(sym, myGen){
  try{
    const j=await fetch('/bistown?hisse='+encodeURIComponent(sym)).then(r=>r.ok?r.json():null);
    if(myGen!=null && myGen!==REQ_GEN) return;
    let rows=((j&&j.value)||[]).map(v=>({
      label:(v.FO_ORTAK||'').trim(), pct:parseFloat(String(v.FO_ORTAK_ORANI||'').replace(',','.'))||0
    })).filter(r=>r.label && r.pct>0);
    if(!rows.length){ document.getElementById('ownerCard')?.classList.add('hidden'); return; }
    rows.forEach(r=>{ if(/^diğer$/i.test(r.label)) r.label='Halka Açık / Diğer'; });
    rows.sort((a,b)=>b.pct-a.pct);
    const inst=document.getElementById('ownerInstBody');
    if(inst){ inst.classList.add('hidden'); inst.innerHTML=''; }
    renderOwnerPie(rows, 'Kaynak: KAP ortaklık yapısı (İş Yatırım aracılığıyla). "Halka Açık / Diğer" borsada işlem gören kısımdır.');
  }catch(e){ document.getElementById('ownerCard')?.classList.add('hidden'); }
}
/* Avrupa: isim-isim ortak listesi için ücretsiz kaynak yok (KAP/Finviz karşılığı yok) —
   TradingView'in fiili dolaşım (free float) verisiyle 2 dilimli pasta: halka açık vs büyük ortaklar. */
function renderOwnershipEU(floatPct, floatShares, totalShares){
  const inst=document.getElementById('ownerInstBody');
  if(inst){ inst.classList.add('hidden'); inst.innerHTML=''; }
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
  if(!own || own.inst==null){ document.getElementById('ownerCard')?.classList.add('hidden'); return; }
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
const FORM4_CODE={ P:['Alım','up'], S:['Satış','down'], M:['Opsiyon Kullanımı','neutral'],
  A:['Hisse Ödülü','neutral'], F:['Vergi İçin Satış','neutral'], G:['Hediye','neutral'],
  D:['Elden Çıkarma','down'], C:['Dönüştürme','neutral'], X:['Opsiyon Kullanımı','neutral'] };
async function fetchInsiders(cik, myGen){
  const card=document.getElementById('insiderCard'), box=document.getElementById('insiderBody');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">Form 4 bildirimleri yükleniyor…</div>';
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
    box.innerHTML=`<table><thead><tr><th>Tarih</th><th>Kişi</th><th>İşlem</th><th>Adet</th><th>Fiyat</th><th></th></tr></thead><tbody>
      ${rows.map(r=>{
        const [ad,cls]=FORM4_CODE[r.code]||[r.code||'—','neutral'];
        return `<tr>
          <td style="white-space:nowrap">${fmtDate(r.tdate)}</td>
          <td style="white-space:normal">${safeHTML(r.name)}${r.title?`<br><span class="ratio-formula">${safeHTML(r.title)}</span>`:''}</td>
          <td class="${cls}">${ad}</td>
          <td>${r.shares!=null?Math.round(r.shares).toLocaleString('tr-TR'):'—'}</td>
          <td>${r.price!=null?'$'+r.price.toFixed(2):'—'}</td>
          <td><a href="${r.view}" target="_blank" rel="noopener">SEC'te gör →</a></td>
        </tr>`;
      }).join('')}
    </tbody></table>
    <div class="hint" style="margin-top:8px"><b>Alım (P)</b> açık piyasadan gerçek alımdır (en güçlü sinyal); Hisse Ödülü/Opsiyon Kullanımı rutin ödemedir, Vergi İçin Satış otomatiktir. Kaynak: SEC EDGAR Form 4.</div>`;
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
  box.innerHTML='<div class="hint">Grafik yükleniyor…</div>';
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
  <div class="hint" style="margin-top:6px">📍 altın çizgi = bilançonun SEC'e açıklandığı gün. Kaynak: Yahoo Finance.</div>`;
}

/* ---- Sektör Karşılaştırması (TradingView tarayıcı API'si) ---- */
async function fetchSectorComparison(sym, market, myGen, euOpt){
  const card=document.getElementById('sectorCard'), box=document.getElementById('sectorBody'), sub=document.getElementById('sectorSub');
  if(!card) return;
  card.classList.remove('hidden');
  box.innerHTML='<div class="hint">Sektör verisi yükleniyor…</div>';
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
    box.innerHTML=`<table><thead><tr><th>Hisse</th><th>Piyasa Değeri</th><th>F/K</th><th>PD/DD</th><th>ROE</th><th>Net Marj</th><th>Çalışan</th></tr></thead>
      <tbody>${trRows}
        <tr class="total"><td>Sektör Medyanı</td><td>—</td><td>${xx(medFK)}</td><td>${xx(medPD)}</td><td>${pp(medROE)}</td><td>—</td><td>—</td></tr>
      </tbody></table>
      <div class="hint" style="margin-top:8px"><span class="up">Yeşil</span> = gösterilen şirketler arasında o metrikte en iyi değer (F/K ve PD/DD'de en düşük, ROE ve Net Marj'da en yüksek).</div>`;
  }catch(e){ box.innerHTML='<div class="hint">Sektör verisi alınamadı: '+e.message+'</div>'; }
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
  if(!btn || !FIN) return;
  btn.classList.remove('hidden');
  const on=isWatched(watchSymFor(), FIN.market);
  btn.innerHTML = on ? '★ Listemde' : '☆ Listeme Ekle';
  btn.classList.toggle('primary', on);
}
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
  box.innerHTML='<div class="hint">Yükleniyor…</div>';
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
  const marketLbl={BIST:'BIST', US:'ABD', EU:'Avrupa'};
  const mkt=w=> w.country||marketLbl[w.market]||w.market;
  box.innerHTML=`<table><thead><tr><th>Hisse</th><th>Pazar</th><th>Fiyat</th><th>Günlük</th><th></th></tr></thead><tbody>
    ${rows.map(w=>`<tr>
      <td style="cursor:pointer" onclick="watchGo('${w.sym}','${w.market}')"><b>${safeHTML(w.sym)}</b></td>
      <td class="ratio-formula">${safeHTML(mkt(w))}</td>
      <td>${w.live!=null?ccy(w)+w.live.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}</td>
      <td class="${w.ch==null?'neutral':w.ch>0?'up':'down'}">${w.ch==null?'—':(w.ch>0?'▲ ':'▼ ')+pct(w.ch)}</td>
      <td class="row-actions"><button class="delrow" onclick="event.stopPropagation();removeWatch('${w.sym}','${w.market}')" title="Kaldır">✕</button></td>
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
      delta=`<div class="delta ${cls}">${ar} ${pct(ch)} <span class="neutral">(önceki ${fmtFn(p)})</span></div>`;
    }
    return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">${fmtFn(c)}</div>${delta}</div>`;
  };
  const cells=[
    kpi('Faaliyet Nakit Akışı', v(CF.opCF,C0), v(CF.opCF,C1), 'good'),
    kpi('Yatırım Nakit Akışı', v(CF.invCF,C0), v(CF.invCF,C1), 'plain'),
    kpi('Finansman Nakit Akışı', v(CF.finCF,C0), v(CF.finCF,C1), 'plain'),
    kpi('Serbest Nakit Akış (FCF)', v(CF.fcf,C0), v(CF.fcf,C1), 'good'),
  ];
  // FCF Marjı: aynı tarihte gelir varsa (ABD yıllık↔yıllık; BIST her modda hizalı)
  const rev0=v(FIN.income.revenue,C0), rev1=v(FIN.income.revenue,C1);
  const fm0=(rev0&&v(CF.fcf,C0)!=null)?v(CF.fcf,C0)/rev0:null;
  const fm1=(rev1&&v(CF.fcf,C1)!=null)?v(CF.fcf,C1)/rev1:null;
  if(fm0!=null) cells.push(kpi('FCF Marjı (FCF/Gelir)', fm0, fm1, 'good', x=>(x*100).toFixed(1)+'%'));
  grid.innerHTML=cells.join('');
  const isQ = FIN.market==='BIST' && FIN.mode==='quarter' && /03-31|06-30|09-30/.test(C0);
  note.textContent='Dönem: '+fmtDate(C0)+(C1?' ↔ '+fmtDate(C1):'')+(FIN.market!=='BIST'?' (ABD nakit akışları her zaman yıllıktır)':(isQ?' (çeyreklik)':''));
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
  let html=`<div style="font-weight:700;color:var(--ink);margin-bottom:6px">DuPont Analizi — ROE'nin Kaynağı</div>
  <table><thead><tr><th>Bileşen</th><th>Cari</th><th>Önceki</th></tr></thead><tbody>
    ${dpRow('Net Kâr Marjı (NI/Gelir)', d0.nm, d1&&d1.nm, pp, 1)}
    ${dpRow('Varlık Devir Hızı (Gelir/Varlık)', d0.at, d1&&d1.at, xx, 1)}
    ${dpRow('Kaldıraç Çarpanı (Varlık/Özkaynak)', d0.em, d1&&d1.em, xx, -1)}
    ${dpRow('= Özkaynak Kârlılığı (ROE)', d0.roe, d1&&d1.roe, pp, 1)}
  </tbody></table>
  ${FIN.mode==='quarter'?'<div class="hint" style="margin-top:4px">Çeyreklik akış kalemleri yıllıklandırıldı (×4).</div>':''}`;

  /* --- Piotroski F-Score (9 kriter; hesaplanamayan kriter kapsam dışı kalır) --- */
  const cfDates=Object.keys(CF.opCF||{}).sort().reverse();
  const CF0=cfDates[0];
  const niAtCF=g(I.netIncome,CF0);   // ABD çeyreklik modda nakit yıllık → NI hizasızsa kriter düşer
  const checks=[
    ['Aktif kârlılığı pozitif (ROA > 0)', (()=>{ const r=sd(g(I.netIncome,R0),g(D.assets,B0)); return r==null?null:r>0; })()],
    ['Faaliyet nakit akışı pozitif', CF0?(g(CF.opCF,CF0)>0):null],
    ['ROA iyileşiyor', (()=>{ if(!B1||!R1) return null; const a=sd(g(I.netIncome,R0),g(D.assets,B0)), b=sd(g(I.netIncome,R1),g(D.assets,B1)); return (a==null||b==null)?null:a>b; })()],
    ['Nakit akışı kârdan büyük (kalite)', (CF0&&niAtCF!=null)?(g(CF.opCF,CF0)>niAtCF):null],
    ['Kaldıraç azalıyor (Borç/Varlık)', (()=>{ if(!B1) return null; const l0=sd(liabTotal(D,B0),g(D.assets,B0)), l1=sd(liabTotal(D,B1),g(D.assets,B1)); return (l0==null||l1==null)?null:l0<l1; })()],
    ['Cari oran iyileşiyor', (()=>{ if(!B1||isBank) return null; const c0=sd(g(D.assetsCur,B0),g(D.liabCur,B0)), c1=sd(g(D.assetsCur,B1),g(D.liabCur,B1)); return (c0==null||c1==null)?null:c0>c1; })()],
    ['Sermaye sulandırması yok (ödenmiş sermaye ↑ değil)', (()=>{ if(!B1) return null; const s0=g(D.common,B0), s1=g(D.common,B1); return (s0==null||s1==null)?null:s0<=s1; })()],
    ['Brüt marj iyileşiyor', (()=>{ if(!R1) return null; const m0=sd(g(I.grossProfit,R0),g(I.revenue,R0)), m1=sd(g(I.grossProfit,R1),g(I.revenue,R1)); return (m0==null||m1==null)?null:m0>m1; })()],
    ['Varlık devir hızı iyileşiyor', (()=>{ if(!B1||!R1) return null; const a=sd(g(I.revenue,R0),g(D.assets,B0)), b=sd(g(I.revenue,R1),g(D.assets,B1)); return (a==null||b==null)?null:a>b; })()],
  ];
  const evaluable=checks.filter(c=>c[1]!==null);
  const score=evaluable.filter(c=>c[1]===true).length;
  const denom=evaluable.length;
  const sCls= score>=7?'good': score>=4?'warn':'bad';
  html+=`<div style="font-weight:700;color:var(--ink);margin:18px 0 6px">Piotroski F-Score
    <span class="pill ${sCls}" style="margin-left:8px;font-size:14px">${score} / ${denom}</span>
    ${denom<9?`<span class="hint" style="font-weight:400"> · ${9-denom} kriter veri yetersizliğinden kapsam dışı</span>`:''}</div>`;
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
    ['Gelir (Hasılat)', FIN.income.revenue],
    ['Net Kâr', FIN.income.netIncome],
    ['Serbest Nakit Akış (FCF)', FIN.income._cash && FIN.income._cash.fcf],
    ['Toplam Varlık', FIN.balance.assets],
    ['Özkaynak', FIN.balance.equity],
    ['Toplam Yükümlülük', FIN.balance.liab],
  ];
  const html=charts.map(([t,s])=>miniBarChart(t,s)).filter(Boolean).join('');
  document.getElementById('trendCharts').innerHTML = html || '<div class="hint">Trend için yeterli geçmiş veri bulunamadı.</div>';
}

/* ---- Bilanço dengesi ---- */
function renderBalCheck(T){
  const diff=T.cur.toplamV-T.cur.pasifTop;
  const ok=Math.abs(diff)<Math.max(1,T.cur.toplamV*0.005);
  const el=document.getElementById('balcheck');
  el.className='balcheck '+(ok?'ok':'no');
  el.innerHTML = ok
    ? `✓ Bilanço dengede: Toplam Varlık (${fmtAbbr(T.cur.toplamV)}) = Yükümlülük + Özkaynak (${fmtAbbr(T.cur.pasifTop)})`
    : `⚠ Bilanço dengede DEĞİL — Aktif ${fmtAbbr(T.cur.toplamV)} ≠ Pasif ${fmtAbbr(T.cur.pasifTop)} (fark ${fmtAbbr(diff)}). Girdileri kontrol edin.`;
}

/* ---- KPI kartları ---- */
function renderKPIs(T){
  const cards=[
    ['Toplam Varlık', T.cur.toplamV, T.prev.toplamV, false],
    ['Toplam Yükümlülük', T.cur.toplamYuk, T.prev.toplamYuk, true],
    ['Özkaynak', T.cur.ozkaynak, T.prev.ozkaynak, false],
    ['Net İşletme Sermayesi', T.cur.netSermaye, T.prev.netSermaye, false],
    ['Dönen Varlık', T.cur.donenV, T.prev.donenV, false],
    ['Kısa Vade. Yük.', T.cur.kvYuk, T.prev.kvYuk, true],
  ];
  document.getElementById('kpis').innerHTML = cards.map(([lbl,cur,prev,inv])=>{
    const ch = prev!==0 ? (cur-prev)/Math.abs(prev)*100 : (cur!==0?100:0);
    const goodDir = inv ? ch<0 : ch>0; // borç için azalış iyi
    const cls = Math.abs(ch)<0.05?'neutral':(goodDir?'up':'down');
    const arrow = Math.abs(ch)<0.05?'→':(ch>0?'▲':'▼');
    return `<div class="kpi"><div class="lbl">${lbl}</div>
      <div class="val">${fmtAbbr(cur)}</div>
      <div class="delta ${cls}">${arrow} ${pct(ch)} <span class="neutral">(önceki ${fmtAbbr(prev)})</span></div></div>`;
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
    ['Cari Oran','Dönen V. / KV Yük.', c.cari, pr.cari, 'x', v=> v>=1.5?'good':v>=1?'warn':'bad'],
    ['Asit-Test (Likidite)','(Dönen V. − Stok) / KV Yük.', c.asit, pr.asit, 'x', v=> v>=1?'good':v>=0.7?'warn':'bad'],
    ['Nakit Oranı','Nakit / KV Yük.', c.nakit, pr.nakit, 'x', v=> v>=0.2?'good':v>=0.1?'warn':'bad'],
    ['Borç / Özkaynak','Toplam Yük. / Özkaynak', c.borcOz, pr.borcOz, 'x', v=> v<=1?'good':v<=2?'warn':'bad'],
    ['Finansal Kaldıraç','Toplam Yük. / Toplam Varlık', c.kaldiraci, pr.kaldiraci, '%', v=> v<=0.5?'good':v<=0.7?'warn':'bad'],
    ['Özkaynak Oranı','Özkaynak / Toplam Varlık', c.ozkOran, pr.ozkOran, '%', v=> v>=0.4?'good':v>=0.25?'warn':'bad'],
    ['Duran V. Karşılama','Duran V. / Özkaynak', c.duranOzk, pr.duranOzk, 'x', v=> v<=1?'good':v<=1.5?'warn':'bad'],
  ];
  const showV=(v,f)=> v===null?'—':(f==='%'?(v*100).toFixed(1)+'%':v.toFixed(2)+'x');
  document.getElementById('ratioBody').innerHTML = defs.map(([nm,fo,cv,pv,f,st])=>{
    const status = cv===null?'warn':st(cv);
    const lbl = status==='good'?'İyi':status==='warn'?'Orta':'Zayıf';
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
    const tag = CAT_GROUP[r.cat]==='asset' ? (r.dv>0?'Artış':'Azalış') : (r.dv>0?'Artış':'Azalış');
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
    if(cari<1) add('bad','Likidite riski yüksek',`Cari oran ${cari.toFixed(2)}x — dönen varlıklar kısa vadeli borçları karşılamıyor. Nakit akışı baskısı olabilir.`);
    else if(cari<1.5) add('warn','Likidite sınırda',`Cari oran ${cari.toFixed(2)}x. 1,5x üzeri daha güvenli kabul edilir.`);
    else add('good','Likidite güçlü',`Cari oran ${cari.toFixed(2)}x — kısa vadeli yükümlülükler rahatça karşılanıyor.`);
  }
  if(asit!==null && asit<0.7) add('warn','Stoğa bağımlılık',`Asit-test ${asit.toFixed(2)}x. Likidite büyük ölçüde stoklara bağlı; stok devri yavaşsa risk artar.`);

  // Kaldıraç
  if(borcOz!==null){
    if(borcOz>2) add('bad','Yüksek borçluluk',`Borç/Özkaynak ${borcOz.toFixed(2)}x — özkaynağın 2 katından fazla borç. Faiz/kur şoklarına kırılgan.`);
    else if(borcOz>1) add('warn','Orta düzey kaldıraç',`Borç/Özkaynak ${borcOz.toFixed(2)}x. Borç yükü yakından izlenmeli.`);
    else add('good','Sağlam sermaye yapısı',`Borç/Özkaynak ${borcOz.toFixed(2)}x — düşük kaldıraç.`);
  }
  if(ozkOran!==null && ozkOran<0.25) add('bad','İnce özkaynak tabanı',`Özkaynak oranı %${(ozkOran*100).toFixed(0)} — varlıkların çok büyük kısmı borçla finanse ediliyor.`);

  // Net işletme sermayesi
  if(c.netSermaye<0) add('bad','Negatif işletme sermayesi',`Net işletme sermayesi ${fmtAbbr(c.netSermaye)} ${CUR} — kısa vadeli borçlar dönen varlıkları aşıyor.`);
  else if(p.netSermaye!==0 && c.netSermaye<p.netSermaye*0.7) add('warn','İşletme sermayesi eridi',`Net işletme sermayesi ${fmtAbbr(p.netSermaye)} → ${fmtAbbr(c.netSermaye)} ${CUR}'ye geriledi.`);

  // KV kredi artışı
  const kvKredi=d.filter(r=>/banka kred|kredi/i.test(r.name)&&r.cat==='liab_current');
  const kvK=kvKredi.reduce((a,r)=>a+r.cur,0), kvKp=kvKredi.reduce((a,r)=>a+r.prev,0);
  if(kvKp>0 && kvK>kvKp*1.5) add('warn','Kısa vadeli kredi sıçraması',`Kısa vadeli banka kredileri ${fmtAbbr(kvKp)} → ${fmtAbbr(kvK)} ${CUR} (%${((kvK/kvKp-1)*100).toFixed(0)} artış). Yeniden finansman riski.`);

  // Alacak / stok şişmesi
  const checkBloat=(rx,label)=>{
    const it=d.filter(r=>rx.test(r.name)&&CAT_GROUP[r.cat]==='asset');
    const cv=it.reduce((a,r)=>a+r.cur,0), pv=it.reduce((a,r)=>a+r.prev,0);
    const varG=(c.toplamV-p.toplamV);
    if(pv>0 && cv>pv*1.3 && (cv-pv) > Math.abs(varG)*0.3)
      add('warn',`${label} hızlı büyüdü`,`${label} ${fmtAbbr(pv)} → ${fmtAbbr(cv)} ${CUR} (%${((cv/pv-1)*100).toFixed(0)}). Toplam varlık büyümesinin önemli kısmını oluşturuyor — tahsilat/devir hızı izlenmeli.`);
  };
  checkBloat(/alacak/i,'Ticari alacaklar');
  checkBloat(/stok/i,'Stoklar');

  // Nakit erimesi
  if(p.nakit>0 && c.nakit<p.nakit*0.6) add('warn','Nakit pozisyonu zayıfladı',`Nakit ve benzerleri ${fmtAbbr(p.nakit)} → ${fmtAbbr(c.nakit)} ${CUR}'ye düştü (%${((1-c.nakit/p.nakit)*100).toFixed(0)} azalış).`);

  // Özkaynak büyümesi (olumlu)
  if(p.ozkaynak>0 && c.ozkaynak>p.ozkaynak*1.05) add('good','Özkaynak güçlendi',`Özkaynak ${fmtAbbr(p.ozkaynak)} → ${fmtAbbr(c.ozkaynak)} ${CUR}'ye yükseldi (kârlılık/sermaye katkısı).`);

  if(F.length===0) add('good','Belirgin risk işareti yok','Girilen verilere göre eşikleri aşan kritik bir sinyal bulunamadı.');

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
  const cName=(ECON_COUNTRIES.find(x=>x[0]===cc)||[cc,cc])[1];
  const title=document.getElementById('discTitle');
  const sub=document.getElementById('discSub');
  if(title) title.textContent='Bugünün Fırsatları — '+cName;
  if(sub) sub.textContent=cName+' borsasında günün yükselen, düşen ve en aktif hisseleri. Satıra tıkla → analiz. Kaynak: TradingView.';
  const bar=document.getElementById('discOpenBar');
  if(bar && focusCode){
    bar.style.display='flex';
    bar.innerHTML=`<button type="button" class="primary" onclick="searchExact('${safeHTML(focusCode)}')">📈 ${safeHTML(focusCode)} bilançosunu aç →</button>
      <span class="hint">Ülke: <b>${safeHTML(cName)}</b></span>`;
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
  if(location.protocol==='file:'){ box.innerHTML='<div class="hint">Yerel köprü gerekli.</div>'; return; }
  const m=TOP100_MARKETS[DISC_CC];
  if(!m){ box.innerHTML='<div class="hint">Ülke verisi yok.</div>'; return; }
  const myGen=++DISC_GEN;
  box.innerHTML='<div class="hint">Yükleniyor…</div>';
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
      columns:['name','description','close','change','volume','market_cap_basic','exchange'],
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
    if(!data.length){ box.innerHTML='<div class="hint">Liste boş (piyasa kapalı olabilir).</div>'; return; }
    const chg=v=>{
      if(v==null) return '—';
      const cls=v>0?'up':(v<0?'down':'neutral');
      return `<span class="${cls}"><b>${(v>0?'+':'')+Number(v).toFixed(2)}%</b></span>`;
    };
    const px=v=>{
      if(v==null) return '—';
      const dig=v<10?2:(v<100?2:2);
      return m.sym+Number(v).toLocaleString('tr-TR',{minimumFractionDigits:dig,maximumFractionDigits:dig});
    };
    const rows=data.map((d,i)=>{
      const code=m.click(String(d[0]).replace(/_/g,'-'));
      return `<tr style="cursor:pointer" onclick="searchExact('${code}')" title="Analizi aç">
        <td style="color:var(--muted)">${i+1}</td>
        <td><b>${safeHTML(String(d[0]).replace(/_/g,'-'))}</b></td>
        <td><span class="ratio-formula">${safeHTML(d[1]||'')}</span></td>
        <td>${px(d[2])}</td>
        <td>${chg(d[3])}</td>
        <td style="color:var(--muted);font-size:12px">${d[4]==null?'—':Number(d[4]).toLocaleString('tr-TR')}</td>
      </tr>`;
    }).join('');
    box.innerHTML=`<div style="overflow-x:auto"><table><thead><tr>
      <th>#</th><th>Kod</th><th>Şirket</th><th>Fiyat</th><th>Değişim</th><th>Hacim</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }catch(e){
    if(myGen===DISC_GEN) box.innerHTML='<div class="hint">Liste alınamadı: '+safeHTML(e.message)+'</div>';
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
  const cName=(ECON_COUNTRIES.find(x=>x[0]===cc)||[cc,cc])[1];
  const title=document.getElementById('eqCalTitle');
  const sub=document.getElementById('eqCalSub');
  if(title) title.textContent='Hisse Takvimi — '+cName;
  if(sub) sub.textContent=cName+' borsası ajandası. Satıra tıkla → analiz. ABD: Nasdaq · TR: KAP (IPO/bedelsiz) · diğer: TradingView.';
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
  if(location.protocol==='file:'){ box.innerHTML='<div class="hint">Yerel köprü gerekli.</div>'; return; }
  const myGen=++EQCAL_GEN;
  box.innerHTML='<div class="hint">Takvim yükleniyor…</div>';

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
      if(!rows.length){ box.innerHTML='<div class="hint">Bu gün için kayıt yok. Başka bir gün seçmeyi dene.</div>'; return; }
      const extra=EQCAL_TYPE==='earnings'?'<th>EPS Tahmin</th><th>EPS Gerçek</th>':(EQCAL_TYPE==='dividends'?'<th>Tutar</th>':'');
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
        <th>#</th><th>Kod</th><th>Şirket</th><th>Tarih</th>${extra}
      </tr></thead><tbody>${tr}</tbody></table></div>
      <div class="hint" style="margin-top:8px">ABD · Nasdaq Calendar · ${fmtCalDay(day)}</div>`;
    }catch(e){
      if(myGen===EQCAL_GEN) box.innerHTML='<div class="hint">Takvim alınamadı: '+safeHTML(e.message)+'</div>';
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
        <th>#</th><th>Kod</th><th>Şirket / Özet</th><th>Tarih</th><th>Konu</th><th></th>
      </tr></thead><tbody>${tr}</tbody></table></div>
      <div class="hint" style="margin-top:8px">Türkiye · KAP · ${EQCAL_TYPE==='ipo'?'halka arz bildirimleri':'bedelsiz sermaye artırımı / bölünme'}</div>`;
    }catch(e){
      if(myGen===EQCAL_GEN) box.innerHTML='<div class="hint">KAP takvimi alınamadı: '+safeHTML(e.message)+'</div>';
    }
    return;
  }

  // Diğer ülkeler: IPO/splits yalnızca ABD (+ TR yukarıda); TV kazanç/temettü
  if(EQCAL_TYPE==='ipo' || EQCAL_TYPE==='splits'){
    box.innerHTML='<div class="hint">IPO ve bölünme takvimi şu an <b>ABD</b> (Nasdaq) ve <b>Türkiye</b> (KAP) için. Bu ülke için <b>Bilanço</b> sekmesine bak.</div>';
    return;
  }
  const m=TOP100_MARKETS[EQCAL_CC];
  if(!m){ box.innerHTML='<div class="hint">Ülke verisi yok.</div>'; return; }
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
    if(myGen===EQCAL_GEN) box.innerHTML='<div class="hint">Takvim alınamadı: '+safeHTML(e.message)+'</div>';
  }
}

/* ---------- ETF (ABD Yahoo) · TR hisse fonları (TEFAS/KAP + holdings) ---------- */
const ETF_PRESETS_US=['SPY','QQQ','IWM','DIA','EEM','VEA','VWO','GLD','TLT','XLK','XLF','XLE','VNQ','ARKK','SMH'];
let ETF_MKT='US', ETF_PAGE_INIT=false, TEFAS_TOP=[];
/* Yahoo / TradingView / ETFDB sektör adları → Türkçe etiket */
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
function trSectorLabel(name){
  if(name==null||name==='') return '—';
  const raw=String(name).trim();
  const lower=raw.toLowerCase();
  const spaced=lower.replace(/[_/]+/g,' ').replace(/\s+/g,' ').trim();
  const compact=spaced.replace(/[\s\-]+/g,'');
  return ETF_SECTOR_TR[lower]||ETF_SECTOR_TR[spaced]||ETF_SECTOR_TR[compact]||raw;
}
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
    if(inp) inp.placeholder='örn. PHE';
  }else{
    chips.innerHTML=ETF_PRESETS_US.map(s=>
      `<button type="button" class="scan-chip" data-etf="${s}" onclick="loadEtf('${s}')">${s}</button>`).join('');
    if(inp) inp.placeholder='örn. SPY';
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
    box.innerHTML='<div class="hint">Hisse fonu listesi boş.</div>';
    return;
  }
  const rows=TEFAS_TOP.map((f,i)=>{
    const act=highlight&&highlight===f.code?'background:rgba(79,156,249,.08)':'';
    return `<tr style="cursor:pointer;${act}" onclick="loadTefasFund('${safeHTML(f.code)}')">
      <td style="color:var(--muted)">${i+1}</td>
      <td><b>${safeHTML(f.code)}</b></td>
      <td style="text-align:left">${safeHTML(f.name)}</td>
      <td><b>${fmtAumTr(f.aum)}</b></td>
      <td>${(f.investors||0).toLocaleString('tr-TR')}</td>
      <td>${f.price==null?'—':Number(f.price).toLocaleString('tr-TR',{maximumFractionDigits:6})}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div style="font-weight:700;margin-bottom:8px">Türkiye hisse senedi fonları</div>
    <div class="hint" style="margin-bottom:10px">Yalnızca sektör + varlık listesi olan fonlar · büyüklüğe göre. Satıra tıkla → detay.</div>
    <div style="overflow-x:auto"><table><thead><tr>
      <th>#</th><th>Kod</th><th style="text-align:left">Fon</th><th>Büyüklük</th><th>Yatırımcı</th><th>Fiyat</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}
async function loadTefasTop(){
  const box=document.getElementById('etfBody');
  const meta=document.getElementById('etfMeta');
  const filters=document.getElementById('etfTefasFilters');
  if(filters) filters.style.display='none';
  if(box) box.innerHTML='<div class="hint">Hisse fonları yükleniyor…</div>';
  if(meta) meta.textContent='';
  try{
    const j=await fetch('/tefas?view=top&limit=40').then(r=>r.ok?r.json():null);
    if(!j||!j.ok||!(j.funds||[]).length){
      if(box) box.innerHTML='<div class="hint">Hisse fonları alınamadı'+(j&&j.error?(': '+safeHTML(j.error)):'')+'.</div>';
      return;
    }
    TEFAS_TOP=j.funds;
    renderEtfChips();
    if(meta){
      const d=j.date||'';
      const dd=d.length===8?(d.slice(6,8)+'.'+d.slice(4,6)+'.'+d.slice(0,4)):d;
      meta.innerHTML=`<b>Hisse fonları</b> · sektör/varlık verisi olan <b>${TEFAS_TOP.length}</b> fon · ${safeHTML(dd)}`;
    }
    renderTefasTable();
  }catch(e){
    if(box) box.innerHTML='<div class="hint">TEFAS alınamadı: '+safeHTML(e.message)+'</div>';
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
  box.innerHTML='<div class="hint">Fon detayı yükleniyor…</div>';
  try{
    const j=await fetch('/tefas?view=fund&code='+encodeURIComponent(c)).then(r=>r.ok?r.json():null);
    if(!j||!j.ok||!j.fund){
      // Verisi olmayan fonları listeden sessizce çıkar
      TEFAS_TOP=TEFAS_TOP.filter(f=>f.code!==c);
      renderEtfChips();
      if(TEFAS_TOP.length){
        renderTefasTable();
        if(meta) meta.innerHTML=`<b>Hisse fonları</b> · sektör/varlık verisi olan <b>${TEFAS_TOP.length}</b> fon`;
      }else{
        box.innerHTML='<div class="hint">Gösterilecek fon kalmadı.</div>';
      }
      return;
    }
    const f=j.fund;
    const d=j.date||'';
    const dd=d.length===8?(d.slice(6,8)+'.'+d.slice(4,6)+'.'+d.slice(0,4)):d;
    if(meta){
      meta.innerHTML=`<b>${safeHTML(f.name)}</b> · <b>${safeHTML(f.code)}</b> · ${fmtAumTr(f.aum)} · ${(f.investors||0).toLocaleString('tr-TR')} yatırımcı · ${safeHTML(dd)}
        · <a href="https://www.tefas.gov.tr/tr/fon-karsilastirma?fon=${encodeURIComponent(f.code)}" target="_blank" rel="noopener">TEFAS</a>`;
    }
    let html=`<div style="margin-bottom:12px"><button type="button" class="scan-chip" onclick="renderTefasTable('${safeHTML(f.code)}')">← Listeye dön</button></div>`;
    const sectors=f.sectors||[];
    const holdings=f.holdings||[];
    if(sectors.length){
      const srows=sectors.map(s=>`<tr><td style="text-align:left">${safeHTML(trSectorLabel(s.sector))}</td><td><b>%${Number(s.weight).toFixed(1)}</b></td></tr>`).join('');
      html+=`<div style="margin-bottom:16px"><div style="font-weight:700;margin-bottom:8px">Sektör Ağırlıkları</div>
        <div class="hint" style="margin-bottom:8px">Portföy hisselerinin TradingView sektörlerine göre ağırlıklı dağılımı.</div>
        <div style="overflow-x:auto"><table><thead><tr><th style="text-align:left">Sektör</th><th>Ağırlık</th></tr></thead><tbody>${srows}</tbody></table></div></div>`;
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
      html+=`<div style="font-weight:700;margin-bottom:8px">En Büyük Varlıklar</div>
        <div class="hint" style="margin-bottom:8px">KAP portföy dağılım raporundan. Satıra tıkla → hisse analizi.</div>
        <div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Kod</th><th style="text-align:left">Varlık</th><th>Ağırlık</th></tr></thead><tbody>${hrows}</tbody></table></div>`;
    }
    if(!sectors.length && !holdings.length){
      html+='<div class="hint">Bu fon için sektör / varlık listesi henüz yok. Üstte fiyat ve büyüklük TEFAS’tan.</div>';
    }
    box.innerHTML=html;
  }catch(e){ box.innerHTML='<div class="hint">Fon alınamadı: '+safeHTML(e.message)+'</div>'; }
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
  box.innerHTML='<div class="hint">ETF verisi yükleniyor…</div>';
  if(meta) meta.textContent='';
  try{
    const j=await fetch('/yqs?s='+encodeURIComponent(ysym)+'&m=topHoldings,fundProfile,summaryDetail,quoteType,price').then(r=>r.ok?r.json():null);
    const hasHold=j&&j.topHoldings&&((j.topHoldings.holdings||[]).length||(j.topHoldings.sectorWeightings||[]).length);
    if(!j || (!hasHold && j.error && !j.quoteType && !j.summaryDetail && !j.price)){
      box.innerHTML='<div class="hint">Fon bulunamadı. ABD için <b>SPY</b> dene.</div>';
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
      meta.innerHTML=`<b>${safeHTML(name)}</b> · <b>${safeHTML(ysym)}</b>${pxTxt?' · '+pxTxt:''}${chgTxt} · ABD${fam?' · '+safeHTML(fam):''}${cat?' · '+safeHTML(cat):''}`;
    }
    let html='';
    if(sectors.length){
      const srows=sectors.map(s=>{
        const k=Object.keys(s||{})[0];
        const v=k!=null?s[k]:null;
        const pct=v==null?null:(v<=1?v*100:v);
        return `<tr><td>${safeHTML(trSectorLabel(k))}</td><td><b>${pct==null?'—':'%'+Number(pct).toFixed(1)}</b></td></tr>`;
      }).join('');
      html+=`<div style="margin-bottom:16px"><div style="font-weight:700;margin-bottom:8px">Sektör Ağırlıkları</div>
        <div style="overflow-x:auto"><table><thead><tr><th>Sektör</th><th>Ağırlık</th></tr></thead><tbody>${srows}</tbody></table></div></div>`;
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
      html+=`<div style="font-weight:700;margin-bottom:8px">En Büyük Varlıklar</div>
        <div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Kod</th><th>Varlık</th><th>Ağırlık</th></tr></thead><tbody>${hrows}</tbody></table></div>`;
    }
    if(!html) html='<div class="hint">Bu ETF için holdings verisi yok.</div>';
    box.innerHTML=html;
  }catch(e){ box.innerHTML='<div class="hint">ETF alınamadı: '+safeHTML(e.message)+'</div>'; }
}

/* başlangıç */
window.addEventListener('DOMContentLoaded',()=>{
  loadSample();
  renderWatchlist();   // önceki oturumdan kalan izleme listesi (localStorage)
  // Bilanço Verisi'nde değer/kategori değişince cari hücreleri anında yeniden renklendir
  const body=document.getElementById('inputBody');
  body.addEventListener('input', colorInputRows);
  body.addEventListener('change', colorInputRows);
  registerPwa();
  initMarketTape();
  // Bugünün Fırsatları + Hisse Takvimi: arama yapılana kadar gizli
});
