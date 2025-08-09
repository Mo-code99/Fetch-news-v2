const SETTINGS = {
  NEWS_API_KEY: "YOUR_NEWSDATA_API_KEY",     // اختياري لهذه النسخة
  WEATHER_API_KEY: "YOUR_OPENWEATHER_API_KEY",// اختياري لهذه النسخة
  CITY: "Cairo,EG",
  COUNTRY: "eg",
  LANGUAGE: "ar",
  // روابط RSS عامة (عربي + عالمي)
  FEEDS: [
    // عربي
    { url:"https://feeds.bbci.co.uk/arabic/rss.xml", name:"BBC Arabic" },
    { url:"https://www.aljazeera.net/aljazeerarss/ar/pages/ebb54b7b-200c-4720-8e88-3fbc47f82c74", name:"Al Jazeera Arabic - آخر الأخبار" },
    { url:"https://www.skynewsarabia.com/rss", name:"Sky News Arabia" },
    { url:"https://www.france24.com/ar/rss", name:"France 24 Arabic" },
    { url:"https://www.alarabiya.net/.mrss/ar.xml", name:"Al Arabiya" },
    { url:"https://www.dw.com/ara/rss", name:"DW Arabic" },

    // عالمي إنجليزي
    { url:"https://rss.cnn.com/rss/edition_world.rss", name:"CNN World" },
    { url:"https://www.reuters.com/world/rss", name:"Reuters World" },
    { url:"https://apnews.com/hub/apf-intlnews?output=rss", name:"AP International" },
    { url:"https://feeds.npr.org/1004/rss.xml", name:"NPR World" },
    { url:"https://www.theguardian.com/world/rss", name:"The Guardian World" },

    // اقتصاد/تقنية عامة
    { url:"https://feeds.bbci.co.uk/news/business/rss.xml", name:"BBC Business" },
    { url:"https://www.reuters.com/finance/markets/rss", name:"Reuters Markets" },
    { url:"https://feeds.arstechnica.com/arstechnica/index", name:"Ars Technica" }
  ],
};

/* =============== خلفية Particles خفيفة ================= */
window.addEventListener("DOMContentLoaded", () => {
  if (window.particlesJS) {
    particlesJS('particles-js', {
      particles: { number:{ value:30, density:{ enable:false } },
        color:{ value:"#ffffff" }, size:{ value:1.6, random:true },
        move:{ enable:true, speed:.3, direction:"top", out_mode:"out" },
        line_linked:{ enable:false }, opacity:{ value:.6 } },
      interactivity:{ events:{ onhover:{ enable:false }, onclick:{ enable:false }, resize:true } },
      retina_detect:false
    });
  }
});

/* =============== وقت/تاريخ (Africa/Cairo) =============== */
function updateClock(){
  const now = new Date();
  const time = now.toLocaleTimeString('ar-EG', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'Africa/Cairo' });
  const date = now.toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric', timeZone:'Africa/Cairo' });
  document.getElementById('time').textContent = time;
  document.getElementById('date').textContent = date;
}
setInterval(updateClock, 1000); updateClock();

/* =============== طقس (اختياري) ========================== */
async function fetchWeather(){
  const key = SETTINGS.WEATHER_API_KEY;
  if (!key) return;
  try{
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(SETTINGS.CITY)}&appid=${key}&units=metric`;
    const res = await fetch(url);
    if(!res.ok) throw new Error("Weather fetch failed");
    const data = await res.json();
    const t = Math.round(data.main?.temp ?? 0);
    const w = (data.weather?.[0]?.main || '').toLowerCase();
    const icon = {
      clear:'fa-sun', clouds:'fa-cloud', rain:'fa-cloud-showers-heavy', snow:'fa-snowflake',
      thunderstorm:'fa-bolt', drizzle:'fa-cloud-rain', mist:'fa-smog'
    }[w] || 'fa-cloud';

    document.getElementById('weather-temp').textContent = t ? `${t}°` : '';
    document.getElementById('weather-icon').className = `fa-solid ${icon}`;
  }catch(e){ /* تجاهل في النسخة التجريبية */ }
}
fetchWeather();

/* =============== أدوات مساعدة =========================== */
function fmtDate(str){
  if(!str) return '—';
  const d = new Date(str);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit',
    hour12:false, timeZone:'Africa/Cairo'
  }).format(d);
}
function markVisited(url){ localStorage.setItem(`visited:${url}`,'1'); }
function isVisited(url){ return localStorage.getItem(`visited:${url}`)==='1'; }

/* =============== باتش الثبات: timeout + multi-proxy + cache =============== */

// مهلة للطلبات
function withTimeout(promise, ms=12000){
  return Promise.race([
    promise,
    new Promise((_,rej)=> setTimeout(()=>rej(new Error('Timeout')), ms))
  ]);
}

// بروكسيّات بديلة بالتتابع
const PROXIES = [
  (url)=> `https://cors.isomorphic-git.org/${url}`,
  (url)=> `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url)=> `https://thingproxy.freeboard.io/fetch/${url}`,
];

// طلب عبر البروكسيات حتى ينجح واحد
async function fetchViaProxies(url){
  let lastErr;
  for(const make of PROXIES){
    const proxied = make(url);
    try{
      const res = await withTimeout(fetch(proxied, { cache:'no-store' }));
      if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text(); // XML كنص خام
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('All proxies failed');
}

// كاش 30 دقيقة في localStorage
const CACHE_TTL = 30 * 60 * 1000;
function getCache(key){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(Date.now() - obj.t > CACHE_TTL) return null;
    return obj.v;
  }catch{ return null; }
}
function setCache(key, value){
  try{ localStorage.setItem(key, JSON.stringify({ t:Date.now(), v:value })); }catch{}
}

// دالة fetchRSS (مستبدلة)
async function fetchRSS(url){
  const cacheKey = `rss:${url}`;
  const cached = getCache(cacheKey);
  if(cached) return cached;

  try{
    const xmlText = await fetchViaProxies(url);
    const xml = (new DOMParser()).parseFromString(xmlText, "application/xml");

    if (xml.querySelector('parsererror')) throw new Error('XML parse error');

    const items = Array.from(xml.querySelectorAll("item")).map(x => ({
      title: x.querySelector("title")?.textContent?.trim() || "—",
      link:  x.querySelector("link")?.textContent?.trim()  || "#",
      pubDate:x.querySelector("pubDate")?.textContent?.trim() || "",
      description:x.querySelector("description")?.textContent?.trim() || ""
    }));

    setCache(cacheKey, items);
    return items;
  }catch(e){
    console.warn("RSS fail:", url, e);
    const fallback = getCache(cacheKey);
    return fallback || [];
  }
}

/* =============== تحميل العناوين ========================== */
let ALL_ITEMS = [];       // كل العناصر
let FILTERED_ITEMS = [];  // بعد الفلترة
const BATCH = 60;
let idx = 0;

const sourceSelect = document.getElementById('source-filter');
SETTINGS.FEEDS.forEach(f => {
  const opt = document.createElement('option');
  opt.value = f.url; opt.textContent = f.name;
  sourceSelect.appendChild(opt);
});

async function loadHeadlines(){
  document.getElementById('error').textContent = '';
  ALL_ITEMS = [];
  const results = await Promise.all(SETTINGS.FEEDS.map(f => fetchRSS(f.url).then(items =>
    items.map(it => ({...it, feedUrl:f.url, feedName:f.name}))
  )));
  results.forEach(arr => ALL_ITEMS.push(...arr));

  // إزالة تكرارات عنوان/رابط
  const seen = new Set(); ALL_ITEMS = ALL_ITEMS.filter(x => {
    const k = (x.title||'').toLowerCase() + '|' + (x.link||'').toLowerCase();
    if(seen.has(k)) return false; seen.add(k); return true;
  });

  // ترتيب حسب التاريخ (الأحدث أولاً)
  ALL_ITEMS.sort((a,b)=> new Date(b.pubDate) - new Date(a.pubDate));

  // فلترة افتراضية: الكل
  applySourceFilter('all');
  // أول 14 خبر لـ Ticker
  fillTicker(ALL_ITEMS.slice(0,14));
}
function applySourceFilter(val){
  idx = 0;
  FILTERED_ITEMS = (val==='all') ? [...ALL_ITEMS] : ALL_ITEMS.filter(x => x.feedUrl===val);
  document.getElementById('headlines').innerHTML='';
  renderBatch();
}
function renderBatch(){
  const ul = document.getElementById('headlines');
  const slice = FILTERED_ITEMS.slice(idx, idx+BATCH);
  slice.forEach(item => {
    const li = document.createElement('li');

    const a = document.createElement('a');
    a.className='headline-link';
    a.href=item.link; a.target='_blank'; a.rel='noopener';
    a.textContent=item.title.replace(/@\w+:\s*/,'');
    if(isVisited(item.link)) a.classList.add('visited');
    a.addEventListener('click', ()=>{ markVisited(item.link); a.classList.add('visited'); });

    const meta = document.createElement('div');
    meta.className='headline-meta';
    const src = document.createElement('span'); src.className='headline-source'; src.textContent=item.feedName || '—';
    const dt  = document.createElement('span'); dt.textContent = fmtDate(item.pubDate);
    const share = document.createElement('button'); share.className='share-btn'; share.innerHTML='<i class="fa-solid fa-share-nodes"></i> مشاركة';
    share.addEventListener('click', ()=>{
      const data = {title:item.title, text:item.title, url:item.link};
      if(navigator.share){ navigator.share(data).catch(()=>{}); }
      else{ navigator.clipboard?.writeText(item.link); alert('تم نسخ الرابط.'); }
    });

    meta.append(src, dt, share);
    li.append(a, meta);
    ul.appendChild(li);
  });
  idx += slice.length;
}

function fillTicker(items){
  const cont = document.getElementById('ticker-content');
  cont.innerHTML='';
  const list = [...items, ...items]; // تكرار بسيط للانسيابية
  list.forEach(it=>{
    const span = document.createElement('span');
    const link = document.createElement('a');
    link.href=it.link; link.target='_blank'; link.rel='noopener';
    link.textContent = it.title;
    span.appendChild(link);
    cont.appendChild(span);
  });
}

/* =============== بحث بسيط في العناوين =================== */
const searchBox = document.getElementById('search-box');
searchBox.addEventListener('input', ()=>{
  const q = searchBox.value.trim().toLowerCase();
  const val = sourceSelect.value;
  const set = (val==='all') ? ALL_ITEMS : ALL_ITEMS.filter(x=>x.feedUrl===val);
  FILTERED_ITEMS = q ? set.filter(x => (x.title||'').toLowerCase().includes(q)) : set;
  idx = 0; document.getElementById('headlines').innerHTML=''; renderBatch();
});

/* =============== فلتر المصدر ============================= */
sourceSelect.addEventListener('change', e => applySourceFilter(e.target.value));

/* =============== أزرار التصنيف (تجريبية مبسطة) ========= */
document.getElementById('all-btn').addEventListener('click', ()=>{ sourceSelect.value='all'; applySourceFilter('all'); });
document.getElementById('intl-btn').addEventListener('click', ()=>{
  // في الديمو نفس الكل (ممكن لاحقًا نصفي باسم المصدر)
  sourceSelect.value='all'; applySourceFilter('all');
});
document.getElementById('biz-btn').addEventListener('click', ()=>{ searchBox.value='اقتصاد'; searchBox.dispatchEvent(new Event('input')); });
document.getElementById('tech-btn').addEventListener('click', ()=>{ searchBox.value='تقنية'; searchBox.dispatchEvent(new Event('input')); });

/* =============== زر للأعلى =============================== */
const toTop = document.getElementById('scroll-to-top');
window.addEventListener('scroll', ()=>{
  const show = (document.documentElement.scrollTop || document.body.scrollTop) > 160;
  toTop.style.display = show ? 'block' : 'none';
});
toTop.addEventListener('click', ()=> window.scrollTo({top:0, behavior:'smooth'}));

/* =============== تشغيل أولي ============================== */
loadHeadlines();

