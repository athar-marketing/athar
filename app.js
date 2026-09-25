/* =============================================================
   أثر — نظام بيع باقات التسويق
   ============================================================= */
(function () {
"use strict";

const app = document.getElementById("app");
const configured = window.CONFIG && /^https:\/\//.test(CONFIG.SUPABASE_URL || "");
if (!configured) {
  app.innerHTML = `<div class="auth"><div class="auth-box"><h1>باقي خطوة واحدة</h1>
    <p class="muted">افتحي ملف <b>config.js</b> وضعي فيه رابط مشروع Supabase والمفتاح (anon key)، ثم احفظي الملف.</p></div></div>`;
  return;
}
const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/* ---------- helpers ---------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = n => Number(n || 0).toLocaleString("ar-SA-u-nu-arab");
const money = n => num(n) + " ر.س";
const date = d => new Date(d).toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" });
const STATUS = { new: "جديد", in_progress: "قيد التنفيذ", delivered: "تم التسليم", cancelled: "ملغي" };
const PAY = { unpaid: "بانتظار الدفع", paid: "مدفوع" };
const chip = s => `<span class="chip s-${s}">${STATUS[s] || s}</span>`;
const payChip = s => `<span class="chip p-${s}">${PAY[s] || s}</span>`;
const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
const go = h => { if (location.hash === h) route(); else location.hash = h; };
const val = id => (document.getElementById(id)?.value || "").trim();

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200);
}
function friendly(err) {
  const m = (err && (err.message || err.error_description)) || "";
  if (/Invalid login credentials/i.test(m)) return "الإيميل أو كلمة المرور غير صحيحة.";
  if (/already registered|already exists/i.test(m)) return "هذا الإيميل مسجّل من قبل. سجّل الدخول بدلاً من إنشاء حساب.";
  if (/Password should be at least/i.test(m)) return "كلمة المرور لازم تكون 6 أحرف أو أكثر.";
  if (/Email not confirmed/i.test(m)) return "لم يتم تأكيد الإيميل بعد. افتح بريدك واضغط رابط التأكيد.";
  if (/rate limit/i.test(m)) return "محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.";
  if (/network|fetch/i.test(m)) return "تعذّر الاتصال. تأكد من الإنترنت وحاول مرة أخرى.";
  return m || "حدث خطأ غير متوقع. حاول مرة أخرى.";
}
function busy(btn, on, text) {
  if (!btn) return;
  if (on) { btn.dataset.t = btn.textContent; btn.textContent = text || "لحظة…"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.t || btn.textContent; btn.disabled = false; }
}
function modal(title, body) {
  closeModal();
  const m = document.createElement("div");
  m.className = "modal"; m.id = "modal";
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><div class="modal-top"><h2 style="font-size:1.2rem">${esc(title)}</h2><button class="x" data-act="close-modal" aria-label="إغلاق">✕</button></div>${body}</div>`;
  document.body.appendChild(m);
  m.addEventListener("click", e => { if (e.target === m) closeModal(); });
  return m;
}
function closeModal() { document.getElementById("modal")?.remove(); }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ---------- state ---------- */
let session = null, profile = null, settings = {}, cats = [], pkgs = [];
let storeFilter = "all";

async function loadProfile() {
  profile = null;
  if (!session) return;
  const { data } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  profile = data;
}
async function loadCatalog() {
  const [s, c, p] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("categories").select("*").order("sort").order("id"),
    sb.from("packages").select("*").order("sort").order("id"),
  ]);
  settings = s.data || {};
  cats = c.data || [];
  pkgs = p.data || [];
  document.title = (settings.store_name || "أثر") + " | باقات التسويق";
}
const isAdmin = () => profile && profile.role === "admin";
const storeName = () => settings.store_name || "أثر";
const brand = (sub) => `<a class="brand" href="#/"><span class="ring" aria-hidden="true"></span><span>${esc(storeName())}${sub ? `<small>${esc(sub)}</small>` : ""}</span></a>`;
const waLink = (text) => `https://wa.me/${esc(settings.whatsapp || "")}?text=${encodeURIComponent(text)}`;

function topBar() {
  let links;
  if (!session) links = `<a class="btn ghost small" href="#/login">تسجيل الدخول</a><a class="btn small" href="#/signup">إنشاء حساب</a>`;
  else links = `${isAdmin() ? `<a class="btn dark small" href="#/admin">لوحة الإدارة</a>` : ""}<a class="btn ghost small" href="#/account">حسابي</a>`;
  return `<div class="top">${brand()}<div class="nav">${links}</div></div>`;
}

/* ================= STORE ================= */
function pkgCard(p, c) {
  const unit = p.unit || c.unit || "";
  return `<article class="card${p.popular ? " pop" : ""}">
    ${p.popular ? '<span class="badge">الأكثر طلباً</span>' : ""}
    <div><div class="tier">${esc(p.tier)}</div><h3>${esc(p.name)}</h3></div>
    <div class="price"><b>${num(p.price)}</b><span>ر.س ${esc(unit)}</span>${p.old_price ? `<s>${num(p.old_price)}</s>` : ""}</div>
    <ul class="feat">${(p.features || []).map(f => `<li>${esc(f)}</li>`).join("")}</ul>
    ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
    <button class="btn" data-act="order" data-id="${p.id}">اطلب الباقة</button>
  </article>`;
}
const HOME_CSS = `
.hero2{display:grid;grid-template-columns:1.2fr .8fr;gap:30px;align-items:center;padding-block:34px 30px}
@media (max-width:760px){.hero2{grid-template-columns:1fr;gap:10px;padding-block:18px 22px}.hero2-art{order:0}.hero-ill{width:min(320px,86vw)}}
.hero2 .eyebrow{display:inline-block;font-family:var(--display);font-weight:500;color:var(--gold);letter-spacing:.02em;border:1px solid #3A3222;background:var(--lime);border-radius:999px;padding:3px 14px;font-size:.9rem;justify-self:start}
.hero2-text{display:grid;gap:16px}
.hero2 h1{font-size:clamp(2.1rem,6vw,3.3rem);line-height:1.2}
.hero2 h1 em{font-style:normal;color:var(--gold)}
.hero2 p{color:var(--muted);font-size:1.08rem;max-width:56ch}
.cta-row{display:flex;flex-wrap:wrap;gap:10px}
.cta-row .btn{padding:13px 22px;font-size:1rem}
.hero2-art{display:grid;place-items:center}
.hero2-art .glow{width:min(300px,62vw);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 50% 50%,rgba(212,166,74,.22),rgba(212,166,74,.04) 55%,transparent 70%)}
.hero2-art .ring{width:62%;height:62%}
.home-sec{padding-block:38px 8px;display:grid;gap:18px}
.home-sec .cat-head p{max-width:60ch}
.svc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media (max-width:760px){.svc-grid{grid-template-columns:repeat(2,1fr);gap:10px}.svc{padding:14px}.svc p{display:none}.svc h3{font-size:.98rem}}
.svc{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;display:grid;gap:8px;text-align:right;color:var(--ink);cursor:pointer;transition:border-color .15s}
.svc:hover,.svc:focus-visible{border-color:var(--gold)}
.svc svg{width:34px;height:34px;color:var(--gold)}
.svc h3{font-size:1.08rem}
.svc p{color:var(--muted);font-size:.92rem}
.svc span{color:var(--gold);font-size:.88rem;font-weight:600}
.why-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.why{border-top:2px solid var(--gold);padding-top:12px;display:grid;gap:6px}
.why h3{font-size:1.05rem}
.why p{color:var(--muted);font-size:.93rem}
.final-cta{margin-top:40px;background:linear-gradient(135deg,#1F1A10,#161410);border:1px solid #3A3222;border-radius:18px;padding:30px 22px;display:grid;gap:14px;justify-items:center;text-align:center}
.final-cta h2{font-size:clamp(1.5rem,4.5vw,2.1rem)}
.final-cta p{color:var(--muted)}
.foot .legal-links a{color:var(--ink);text-underline-offset:3px}
.hero-ill{width:min(380px,90vw)}
.hero-ill svg{width:100%;height:auto;display:block}
@media (prefers-reduced-motion:no-preference){.hero-ill .float1{animation:fl 5s ease-in-out infinite}.hero-ill .float2{animation:fl 6s ease-in-out infinite .8s}.hero-ill .float3{animation:fl 5.5s ease-in-out infinite 1.6s}@keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}}
.journey{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;position:relative}
@media (max-width:860px){.journey{grid-template-columns:repeat(2,1fr)}}
@media (max-width:480px){.journey{grid-template-columns:1fr}}
.jstep{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;display:grid;gap:8px;align-content:start}
.jstep .jart{background:#171511;border-radius:12px;display:grid;place-items:center;padding:10px}
.jstep .jart svg{width:100%;max-width:190px;height:auto}
.jstep .jn{font-family:var(--display);font-weight:700;color:var(--bg);background:var(--gold);width:28px;height:28px;border-radius:50%;display:inline-grid;place-items:center;font-size:.9rem}
.jstep .jh{display:flex;align-items:center;gap:8px}
.jstep h3{font-size:1.05rem}
.jstep p{color:var(--muted);font-size:.92rem}
`;
const SVC_ICONS = [
  [/إعلان/, '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M18 6a8 8 0 0 1 0 12"/>'],
  [/تصميم/, '<path d="M12 21l-4-8 4-9 4 9z"/><path d="M12 13v8"/><circle cx="12" cy="11" r="1.3"/>'],
  [/سوشيال/, '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>'],
  [/CRM|كول/, '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19c0 2-2 3-5 3h-1"/>'],
  [/ذكاء/, '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M10 10v4l3.5-2z"/><path d="M8 3l1 3M16 3l-1 3M12 2v3"/>'],
  [/مونتاج/, '<rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 9l2-5 16 0-2 5"/><path d="M8 4l-1.5 5M13 4l-1.5 5M18 4l-1.5 5"/>'],
];
const svcIcon = name => { const m = SVC_ICONS.find(([r]) => r.test(name)); return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${m ? m[1] : SVC_ICONS[0][1]}</svg>`; };
const HOME_FAQ = [
  ["هل السعر المعروض هو السعر النهائي؟", "نعم. السعر المعروض على كل باقة هو المبلغ الذي تدفعه، بدون أي رسوم إضافية."],
  ["هل ميزانية الإعلانات داخلة في سعر الباقة؟", "لا. ميزانية الإعلانات تُدفع للمنصة مباشرة من حسابك، ولا نأخذ منها أي نسبة. نقترح عليك الميزانية المناسبة لنشاطك وأهدافك قبل البدء."],
  ["متى تبدأون العمل؟", "نبدأ خلال 48 ساعة من تأكيد الدفع واستلام بيانات نشاطك."],
  ["كم تعديلاً يشمل التصميم؟", "يشمل كل تصميم تعديلين مجاناً."],
  ["كيف أدفع؟", "بعد إرسال طلبك تظهر لك طريقة الدفع وخطواتها في صفحة الطلب داخل حسابك."],
  ["هل الاشتراك ملزم لمدة طويلة؟", "لا. الاشتراك شهري، ويمكنك إيقافه قبل نهاية الشهر دون أي رسوم. وإذا اشتركت لعدة أشهر بسعر مخفّض ثم أردت الإيقاف، نعيد لك قيمة الأشهر المتبقية بعد خصم فرق التخفيض."],
  ["هل تحتاجون كلمة مرور حساباتي؟", "لا. نطلب صلاحية إدارة عبر الأدوات الرسمية للمنصات مثل Meta Business Suite، ويبقى الحساب ملكاً لك بالكامل، ويمكنك إلغاء الصلاحية في أي وقت."],
  ["ماذا لو لم يعجبني العمل؟", "نعدّل العمل حسب ملاحظاتك في حدود التعديلات المشمولة في باقتك. وإذا طلبت الإلغاء قبل أن نبدأ التنفيذ، نعيد لك المبلغ كاملاً."],
  ["هل يمكن تجهيز باقة خاصة بنشاطي؟", "نعم. تواصل معنا على واتساب من زر الاستشارة المجانية، ونجهز لك باقة تناسب نشاطك وميزانيتك."],
];
function viewStore() {
  if (!document.getElementById("home-css")) { const st = document.createElement("style"); st.id = "home-css"; st.textContent = HOME_CSS; document.head.appendChild(st); }
  const shown = cats.map(c => ({ c, list: pkgs.filter(p => p.category_id === c.id && p.active) })).filter(x => x.list.length);
  const services = shown.filter(({ c }) => !c.is_bundle);
  const consult = settings.whatsapp ? waLink("السلام عليكم، أبغى استشارة مجانية عن تسويق نشاطي") : "";
  app.innerHTML = `<div class="wrap">
    ${topBar()}
    <section class="hero2">
      <div class="hero2-text">
        <span class="eyebrow">أثر تصنع أثر</span>
        <h1>تسويق يصنع <em>فرقاً</em> في مبيعاتك</h1>
        <p>إعلانات ممولة، تصميم، إدارة حسابات، فيديوهات بالذكاء الاصطناعي، ومونتاج، وكول سنتر. كل ما يحتاجه نشاطك في مكان واحد، بباقات واضحة بالريال السعودي.</p>
        <div class="cta-row">
          <button class="btn" type="button" data-act="scroll" data-to="packages">تصفّح الباقات</button>
          ${consult ? `<a class="btn ghost" href="${consult}" target="_blank" rel="noopener">استشارة مجانية على واتساب</a>` : ""}
        </div>
        <div class="facts"><span class="fact">الأسعار بالريال السعودي</span><span class="fact">نبدأ خلال 48 ساعة</span><span class="fact">تابع طلبك من حسابك</span></div>
      </div>
      <div class="hero2-art"><div class="hero-ill"><svg viewBox="0 0 380 380" direction="ltr" style="direction:ltr" role="img" aria-label="رسمة: موبايل عليه بوست وحوله إعلان ممول ورسالة من عميل ورسم بياني صاعد">
  <defs><radialGradient id="hg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#D4A64A" stop-opacity=".22"/><stop offset="1" stop-color="#D4A64A" stop-opacity="0"/></radialGradient></defs>
  <circle cx="190" cy="190" r="185" fill="url(#hg)"/>
  <rect x="120" y="40" width="140" height="280" rx="24" fill="#1C1C1C" stroke="#3A3222" stroke-width="2"/>
  <rect x="165" y="52" width="50" height="8" rx="4" fill="#2E2B27"/>
  <circle cx="146" cy="84" r="12" fill="#D4A64A"/><rect x="164" y="78" width="60" height="6" rx="3" fill="#3A3528"/><rect x="164" y="88" width="38" height="5" rx="2.5" fill="#2E2B27"/>
  <rect x="134" y="106" width="112" height="112" rx="10" fill="#26211A"/>
  <path d="M150 196 L178 166 L198 184 L230 140" fill="none" stroke="#D4A64A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M224 138 L234 138 L232 150" fill="none" stroke="#D4A64A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M140 234 c4-6 12-6 14 0 c2-6 10-6 14 0 c0 8-14 14-14 14 s-14-6-14-14z" fill="#E06A5A"/>
  <rect x="176" y="234" width="16" height="12" rx="3" fill="none" stroke="#A9A196" stroke-width="2.5"/>
  <rect x="134" y="258" width="100" height="6" rx="3" fill="#3A3528"/><rect x="134" y="270" width="70" height="6" rx="3" fill="#2E2B27"/>
  <g class="float1"><rect x="8" y="70" width="128" height="52" rx="12" fill="#1F1B13" stroke="#D4A64A" stroke-width="1.5"/>
    <path d="M28 90v8a3 3 0 0 0 3 3h5l11 8V79l-11 8h-5a3 3 0 0 0-3 3z" fill="#D4A64A"/>
    <text x="120" y="92" text-anchor="end" font-family="Readex Pro, sans-serif" font-size="13" fill="#F2EDE4" font-weight="600">إعلان ممول</text>
    <text x="120" y="110" text-anchor="end" font-family="Readex Pro, sans-serif" font-size="10.5" fill="#A9A196">لعملاء أكثر</text></g>
  <g class="float2"><rect x="238" y="150" width="136" height="54" rx="12" fill="#1F1B13" stroke="#3A3222" stroke-width="1.5"/>
    <circle cx="354" cy="177" r="11" fill="#5CC98E"/><path d="M349 177l4 4 6-7" fill="none" stroke="#10301F" stroke-width="2.5" stroke-linecap="round"/>
    <text x="336" y="172" text-anchor="end" font-family="Readex Pro, sans-serif" font-size="12.5" fill="#F2EDE4" font-weight="600">رسالة جديدة</text>
    <text x="336" y="190" text-anchor="end" font-family="Readex Pro, sans-serif" font-size="10.5" fill="#A9A196">«أبغى أطلب الباقة»</text></g>
  <g class="float3"><rect x="22" y="252" width="118" height="80" rx="12" fill="#1F1B13" stroke="#3A3222" stroke-width="1.5"/>
    <text x="126" y="272" text-anchor="end" font-family="Readex Pro, sans-serif" font-size="12" fill="#F2EDE4" font-weight="600">نمو المبيعات</text>
    <rect x="36" y="306" width="12" height="16" rx="2" fill="#3A3222"/><rect x="54" y="298" width="12" height="24" rx="2" fill="#5A4A2A"/><rect x="72" y="290" width="12" height="32" rx="2" fill="#8A6E36"/><rect x="90" y="282" width="12" height="40" rx="2" fill="#D4A64A"/>
    <path d="M112 300 l8-12 8 12" fill="none" stroke="#D4A64A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
</svg></div></div>
    </section>
    ${services.length ? `<section class="home-sec" aria-labelledby="svc-h">
      <div class="cat-head"><h2 id="svc-h">خدماتنا</h2><p>اختر الخدمة التي يحتاجها نشاطك، ونوصلك لباقاتها مباشرة.</p></div>
      <div class="svc-grid">${services.map(({ c }) => `<button class="svc" type="button" data-act="svc" data-f="${c.id}">${svcIcon(c.name)}<h3>${esc(c.name)}</h3>${c.description ? `<p>${esc(c.description)}</p>` : ""}<span>شاهد الباقات ←</span></button>`).join("")}</div>
    </section>` : ""}
    <section class="home-sec" aria-labelledby="jr-h">
      <div class="cat-head"><h2 id="jr-h">كيف نساعد مشروعك ينمو</h2><p>نمشي معك خطوة بخطوة، من فهم نشاطك لين تشوف النتائج.</p></div>
      <div class="journey">
        <div class="jstep"><div class="jart"><svg viewBox="0 0 190 120" aria-hidden="true"><rect x="20" y="20" width="110" height="80" rx="8" fill="#1F1B13" stroke="#3A3222"/><rect x="32" y="34" width="50" height="6" rx="3" fill="#3A3528"/><rect x="32" y="48" width="80" height="5" rx="2.5" fill="#2E2B27"/><rect x="32" y="60" width="66" height="5" rx="2.5" fill="#2E2B27"/><rect x="32" y="72" width="74" height="5" rx="2.5" fill="#2E2B27"/><circle cx="130" cy="72" r="26" fill="#171511" stroke="#D4A64A" stroke-width="5"/><path d="M149 91 l22 22" stroke="#D4A64A" stroke-width="8" stroke-linecap="round"/><circle cx="130" cy="72" r="12" fill="#D4A64A" fill-opacity=".25"/></svg></div><div class="jh"><span class="jn">١</span><h3>نفهم مشروعك</h3></div><p>ندرس نشاطك وجمهورك ومنافسيك، ونحدد وش يميّزك.</p></div>
        <div class="jstep"><div class="jart"><svg viewBox="0 0 190 120" aria-hidden="true"><rect x="22" y="18" width="146" height="86" rx="8" fill="#1F1B13" stroke="#3A3222"/><path d="M22 40h146" stroke="#3A3222"/><circle cx="36" cy="29" r="3" fill="#3A3528"/><circle cx="46" cy="29" r="3" fill="#3A3528"/><rect x="36" y="52" width="34" height="40" rx="5" fill="#2A2416"/><rect x="78" y="52" width="34" height="40" rx="5" fill="#2A2416"/><rect x="120" y="52" width="34" height="40" rx="5" fill="#D4A64A" fill-opacity=".85"/><path d="M44 72l5 5 9-10" fill="none" stroke="#D4A64A" stroke-width="3" stroke-linecap="round"/><path d="M86 72l5 5 9-10" fill="none" stroke="#D4A64A" stroke-width="3" stroke-linecap="round"/><path d="M128 72h18M128 80h12" stroke="#171511" stroke-width="3" stroke-linecap="round"/></svg></div><div class="jh"><span class="jn">٢</span><h3>نبني الخطة</h3></div><p>خطة محتوى وإعلانات وميزانية واضحة، تناسب هدفك.</p></div>
        <div class="jstep"><div class="jart"><svg viewBox="0 0 190 120" aria-hidden="true"><rect x="70" y="10" width="54" height="100" rx="10" fill="#1F1B13" stroke="#3A3222"/><rect x="78" y="24" width="38" height="38" rx="5" fill="#2A2416"/><path d="M84 54l9-10 7 6 10-12" fill="none" stroke="#D4A64A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="78" y="70" width="30" height="4" rx="2" fill="#3A3528"/><rect x="78" y="80" width="22" height="4" rx="2" fill="#2E2B27"/><path d="M18 58v10a3 3 0 0 0 3 3h6l14 10V45L27 55h-6a3 3 0 0 0-3 3z" fill="#D4A64A"/><path d="M48 50a12 12 0 0 1 0 22" fill="none" stroke="#D4A64A" stroke-width="3" stroke-linecap="round"/><rect x="136" y="30" width="42" height="30" rx="8" fill="#2A2416" stroke="#D4A64A"/><path d="M146 60 l-4 8 10-8" fill="#2A2416" stroke="#D4A64A"/><circle cx="148" cy="45" r="3" fill="#D4A64A"/><circle cx="157" cy="45" r="3" fill="#D4A64A"/><circle cx="166" cy="45" r="3" fill="#D4A64A"/><path d="M140 84 c4-6 12-6 14 0 c2-6 10-6 14 0 c0 8-14 14-14 14 s-14-6-14-14z" fill="#E06A5A"/></svg></div><div class="jh"><span class="jn">٣</span><h3>ننفّذ ونطلق</h3></div><p>نصمم وننشر ونطلق الإعلانات، ونتابع عملاءك المحتملين.</p></div>
        <div class="jstep"><div class="jart"><svg viewBox="0 0 190 120" aria-hidden="true"><rect x="16" y="14" width="158" height="92" rx="8" fill="#1F1B13" stroke="#3A3222"/><path d="M32 30v62h128" fill="none" stroke="#3A3222" stroke-width="2"/><path d="M40 84 L68 70 L92 76 L120 52 L150 34" fill="none" stroke="#D4A64A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 84 L68 70 L92 76 L120 52 L150 34 L150 92 L40 92Z" fill="#D4A64A" fill-opacity=".12"/><circle cx="150" cy="34" r="6" fill="#D4A64A"/><path d="M142 26 l8-8 8 8" fill="none" stroke="#D4A64A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,-2)"/></svg></div><div class="jh"><span class="jn">٤</span><h3>نقيس ونطوّر</h3></div><p>تقارير واضحة بالأرقام، وتحسين مستمر عشان النمو ما يوقف.</p></div>
      </div>
    </section>
    <section class="home-sec" aria-labelledby="why-h">
      <div class="cat-head"><h2 id="why-h">لماذا أثر؟</h2></div>
      <div class="why-grid">
        <div class="why"><h3>أسعار واضحة</h3><p>كل باقة بسعرها النهائي بالريال، بدون رسوم مخفية ولا مفاجآت.</p></div>
        <div class="why"><h3>نبدأ خلال 48 ساعة</h3><p>من تأكيد الدفع واستلام بيانات نشاطك، ونسلّمك أول نتائج بسرعة.</p></div>
        <div class="why"><h3>طلبك تحت عينك</h3><p>تابع حالة طلبك ورسائل الفريق من حسابك في أي وقت.</p></div>
        <div class="why"><h3>حساباتك ملكك</h3><p>نعمل بصلاحيات رسمية من المنصات، ولا نطلب كلمات المرور أبداً.</p></div>
      </div>
    </section>
    <section class="home-sec" id="packages" aria-labelledby="pkg-h" style="padding-bottom:0">
      <div class="cat-head"><h2 id="pkg-h">باقاتنا</h2><p>قارن الباقات واطلب مباشرة. وتقدر تتواصل معنا لو احتجت باقة مخصصة.</p></div>
    </section>
    <nav class="tabs" aria-label="أقسام الخدمات">
      <button class="tab" data-act="filter" data-f="all" aria-pressed="${storeFilter === "all"}">الكل</button>
      ${shown.map(({ c }) => `<button class="tab" data-act="filter" data-f="${c.id}" aria-pressed="${storeFilter == c.id}">${esc(c.name)}</button>`).join("")}
    </nav>
    ${shown.length ? shown.map(({ c, list }) => `<section class="cat${c.is_bundle ? " bundle" : ""}" data-cat="${c.id}" ${storeFilter !== "all" && storeFilter != c.id ? "hidden" : ""}>
      <div class="cat-head"><h2>${esc(c.name)}</h2>${c.description ? `<p>${esc(c.description)}</p>` : ""}</div>
      <div class="grid">${list.map(p => pkgCard(p, c)).join("")}</div></section>`).join("")
      : `<div class="empty" style="margin-top:30px">لا توجد باقات حالياً.</div>`}
    <section class="section">
      <div class="cat-head"><h2>كيف تطلب</h2></div>
      <div class="steps">
        <div class="step"><h3>أنشئ حسابك</h3><p>بالإيميل وكلمة مرور، في أقل من دقيقة.</p></div>
        <div class="step"><h3>اختر الباقة</h3><p>واكتب تفاصيل نشاطك وما تحتاجه.</p></div>
        <div class="step"><h3>ادفع بالتحويل</h3><p>تظهر لك بيانات الحساب البنكي في صفحة طلبك.</p></div>
        <div class="step"><h3>تابع التنفيذ</h3><p>حالة طلبك تتحدث في حسابك حتى التسليم.</p></div>
      </div>
    </section>
    <section class="faq" id="faq"><div class="cat-head"><h2>الأسئلة الشائعة</h2></div><div class="faq-list">${HOME_FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></section>
    <section class="final-cta">
      <h2>جاهز تصنع أثر لنشاطك؟</h2>
      <p>ابدأ بالباقة المناسبة، أو كلّمنا ونساعدك تختار.</p>
      <div class="cta-row" style="justify-content:center">
        <button class="btn" type="button" data-act="scroll" data-to="packages">تصفّح الباقات</button>
        ${consult ? `<a class="btn ghost" href="${consult}" target="_blank" rel="noopener">استشارة مجانية</a>` : ""}
      </div>
    </section>
    <footer class="foot"><p>${esc(storeName())} لخدمات التسويق · المملكة العربية السعودية</p>
      ${settings.whatsapp ? `<p>واتساب: <span dir="ltr">+${esc(settings.whatsapp)}</span></p>` : ""}
      <p>ميزانية الإعلانات الممولة تُدفع للمنصة مباشرة ولا تدخل في سعر الباقة.</p>
      <p class="legal-links"><a href="legal.html#terms">الشروط والأحكام</a> · <a href="legal.html#refund">الإلغاء والاسترجاع</a> · <a href="legal.html#privacy">سياسة الخصوصية</a></p></footer>
  </div>`;
}
function applyFilter(f) {
  storeFilter = f;
  app.querySelectorAll(".tabs .tab").forEach(t => t.setAttribute("aria-pressed", String(t.dataset.f == f)));
  app.querySelectorAll("section.cat").forEach(s => (s.hidden = storeFilter !== "all" && s.dataset.cat != storeFilter));
}

/* ================= AUTH ================= */
function viewAuth(mode) {
  const signup = mode === "signup";
  app.innerHTML = `<div class="auth"><form class="auth-box" id="auth-form" novalidate>
    ${brand()}
    <div><h1>${signup ? "إنشاء حساب جديد" : "تسجيل الدخول"}</h1>
    <p class="muted">${signup ? "حسابك يحفظ طلباتك ويعرض لك حالتها أولاً بأول." : "أهلاً بعودتك."}</p></div>
    ${signup ? `<div class="field"><label for="a-name">الاسم</label><input id="a-name" autocomplete="name" required></div>
    <div class="field"><label for="a-phone">رقم الجوال</label><input id="a-phone" type="tel" dir="ltr" placeholder="05XXXXXXXX" autocomplete="tel"></div>` : ""}
    <div class="field"><label for="a-email">الإيميل</label><input id="a-email" type="email" dir="ltr" autocomplete="email" required></div>
    <div class="field"><label for="a-pass">كلمة المرور</label><input id="a-pass" type="password" dir="ltr" autocomplete="${signup ? "new-password" : "current-password"}" required>${signup ? "<small>6 أحرف على الأقل</small>" : ""}</div>
    <p class="err" id="a-err" hidden></p>
    <button class="btn" type="submit" id="a-btn">${signup ? "إنشاء الحساب" : "دخول"}</button>
    <p class="switch">${signup ? `لديك حساب؟ <a href="#/login">سجّل الدخول</a>` : `ليس لديك حساب؟ <a href="#/signup">أنشئ حساباً</a>`}</p>
    <p class="switch"><a href="#/">← الرجوع للباقات</a></p>
  </form></div>`;
  document.getElementById("auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("a-btn"), errEl = document.getElementById("a-err");
    const showErr = t => { errEl.textContent = t; errEl.hidden = false; };
    errEl.hidden = true;
    const email = val("a-email"), password = document.getElementById("a-pass").value;
    if (!email || !password) return showErr("اكتب الإيميل وكلمة المرور.");
    if (signup && !val("a-name")) return showErr("اكتب اسمك.");
    busy(btn, true);
    try {
      if (signup) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: val("a-name"), phone: val("a-phone") } } });
        if (error) throw error;
        if (!data.session) {
          busy(btn, false);
          app.querySelector(".auth-box").innerHTML = `${brand()}<h1>تم إنشاء الحساب</h1><p class="muted">أرسلنا رابط تأكيد إلى <b dir="ltr">${esc(email)}</b>. افتح بريدك واضغط الرابط، ثم سجّل الدخول.</p><a class="btn" href="#/login">تسجيل الدخول</a>`;
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // onAuthStateChange takes it from here
    } catch (err) { busy(btn, false); showErr(friendly(err)); }
  });
}
function afterLogin() {
  const pending = sessionStorage.getItem("pendingPkg");
  if (pending) { sessionStorage.removeItem("pendingPkg"); return go("#/order/" + pending); }
  go(isAdmin() ? "#/admin" : "#/account");
}

/* ================= ORDER ================= */
function viewOrder(id) {
  const p = pkgs.find(x => x.id == id && x.active);
  if (!p) { toast("هذه الباقة غير متاحة الآن."); return go("#/"); }
  const c = cats.find(x => x.id === p.category_id) || {};
  const unit = p.unit || c.unit || "";
  app.innerHTML = `<div class="wrap">${topBar()}
    <div class="page" style="max-width:620px">
      <a href="#/" class="muted" style="font-size:.9rem">← الرجوع للباقات</a>
      <h1 style="font-size:1.6rem">تأكيد الطلب</h1>
      <div class="panel">
        <div class="order-top"><div><div class="tier">${esc(c.name)}</div><h2>${esc(p.name)}</h2></div><div class="price"><b style="font-size:1.6rem">${num(p.price)}</b><span>ر.س ${esc(unit)}</span></div></div>
        <ul class="feat">${(p.features || []).map(f => `<li>${esc(f)}</li>`).join("")}</ul>
      </div>
      <form class="panel form" id="order-form" novalidate>
        <div class="field"><label for="o-biz">اسم النشاط أو الحساب</label><input id="o-biz" placeholder="مثال: متجر ورد الرياض"></div>
        <div class="field"><label for="o-notes">تفاصيل الطلب</label><textarea id="o-notes" placeholder="روابط حساباتك، المنصات المطلوبة، موعد البدء، أي تفاصيل تساعدنا"></textarea></div>
        <p class="err" id="o-err" hidden></p>
        <button class="btn" type="submit" id="o-btn">تأكيد الطلب</button>
        <p class="muted" style="font-size:.86rem">بعد التأكيد تظهر لك بيانات التحويل البنكي في حسابك.</p>
      </form>
    </div></div>`;
  document.getElementById("order-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("o-btn");
    busy(btn, true, "جارٍ إرسال الطلب…");
    const { data, error } = await sb.from("orders").insert({ customer_id: session.user.id, package_id: p.id, business: val("o-biz"), notes: val("o-notes") }).select().single();
    if (error) { busy(btn, false); const el = document.getElementById("o-err"); el.textContent = friendly(error); el.hidden = false; return; }
    sessionStorage.setItem("justOrdered", data.id);
    go("#/account");
  });
}

/* ================= CUSTOMER ACCOUNT ================= */
function payInfo(o) {
  if (o.payment_status === "paid" || o.status === "cancelled") return "";
  const bank = settings.iban
    ? `<span>حوّل المبلغ إلى:</span><span>${esc(settings.bank_name || "")}${settings.bank_holder ? " · " + esc(settings.bank_holder) : ""}</span><b dir="ltr">${esc(settings.iban)}</b>`
    : `<span>سنرسل لك بيانات التحويل البنكي على واتساب.</span>`;
  const msg = `السلام عليكم، طلبي رقم ${o.id} (${o.package_name}) بمبلغ ${o.price} ر.س. أرسلت إيصال التحويل.`;
  return `<div class="pay-box">${bank}<span>المبلغ: <b>${money(o.price)}</b></span>
    ${settings.whatsapp ? `<a class="btn small" style="justify-self:start;margin-top:6px" href="${waLink(msg)}" target="_blank" rel="noopener">إرسال الإيصال على واتساب</a>` : ""}</div>`;
}
async function viewAccount() {
  app.innerHTML = `<div class="wrap">${topBar()}<div class="page"><div class="boot">جارٍ تحميل طلباتك…</div></div></div>`;
  const { data: orders, error } = await sb.from("orders").select("*").eq("customer_id", session.user.id).order("created_at", { ascending: false });
  const just = sessionStorage.getItem("justOrdered"); sessionStorage.removeItem("justOrdered");
  app.innerHTML = `<div class="wrap">${topBar()}<div class="page">
    <div class="page-head"><h1>أهلاً ${esc(profile?.full_name || "")}</h1><a class="btn small" href="#/">طلب باقة جديدة</a></div>
    ${just ? `<div class="panel" style="border-color:var(--ok)"><h2>تم استلام طلبك رقم ${num(just)}</h2><p class="muted">حوّل المبلغ وأرسل الإيصال، وسنبدأ التنفيذ خلال 48 ساعة من تأكيد الدفع.</p></div>` : ""}
    <div class="panel"><h2>طلباتي</h2>
      ${error ? `<p class="err">${esc(friendly(error))}</p>` : !orders.length ? `<div class="empty">لا توجد طلبات بعد. <a href="#/">تصفّح الباقات</a></div>` :
      orders.map(o => `<div class="order">
        <div class="order-top"><div><h3>${esc(o.package_name)}</h3><div class="meta"><span>طلب رقم ${num(o.id)}</span><span>${date(o.created_at)}</span><span>${money(o.price)} ${esc(o.unit || "")}</span></div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${chip(o.status)}${payChip(o.payment_status)}</div></div>
        ${o.admin_note ? `<p style="font-size:.92rem"><b>رسالة من الفريق:</b> ${esc(o.admin_note)}</p>` : ""}
        ${payInfo(o)}
      </div>`).join("")}
    </div>
    <form class="panel form" id="prof-form" novalidate><h2>بياناتي</h2>
      <div class="two"><div class="field"><label for="p-name">الاسم</label><input id="p-name" value="${esc(profile?.full_name)}"></div>
      <div class="field"><label for="p-phone">رقم الجوال</label><input id="p-phone" dir="ltr" value="${esc(profile?.phone)}"></div></div>
      <div class="field"><label>الإيميل</label><input value="${esc(session.user.email)}" dir="ltr" disabled></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit" id="p-btn">حفظ البيانات</button><button class="btn ghost" type="button" data-act="logout">تسجيل الخروج</button></div>
    </form>
  </div></div>`;
  document.getElementById("prof-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("p-btn"); busy(btn, true);
    const { error } = await sb.from("profiles").update({ full_name: val("p-name"), phone: val("p-phone") }).eq("id", session.user.id);
    busy(btn, false);
    if (error) return toast(friendly(error));
    profile.full_name = val("p-name"); profile.phone = val("p-phone"); toast("تم حفظ بياناتك.");
  });
}

/* ================= ADMIN ================= */
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
  customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14.5c2.3 0 4 1.5 4.6 4"/></svg>',
  packages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z"/><path d="M3.5 7.5v9L12 21l8.5-4.5v-9"/><path d="M12 12v9"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  leads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4Z"/></svg>',
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9h16l-1-5H5L4 9Z"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/></svg>',
};
const MENU = [["dashboard", "لوحة القيادة"], ["orders", "الطلبات"], ["leads", "العملاء المحتملون"], ["customers", "العملاء"], ["packages", "الباقات"], ["settings", "الإعدادات"]];

function shell(section, content) {
  app.innerHTML = `<div class="shell" id="shell">
    <aside class="side">
      ${brand("لوحة الإدارة")}
      <nav>${MENU.map(([k, l]) => `<a class="item" href="#/admin/${k}" ${section === k ? 'aria-current="page"' : ""}>${ICONS[k]}<span>${l}</span></a>`).join("")}
        <a class="item" href="#/">${ICONS.store}<span>عرض المتجر</span></a></nav>
      <div class="foot"><span>${esc(profile?.full_name || session.user.email)}</span><button data-act="logout">تسجيل الخروج</button></div>
    </aside>
    <div class="scrim" data-act="menu"></div>
    <main class="main">
      <div class="mob-bar">${brand()}<button class="btn ghost small" data-act="menu" aria-label="القائمة">☰ القائمة</button></div>
      <div class="page" id="admin-page">${content}</div>
    </main></div>`;
}
const setPage = html => { const el = document.getElementById("admin-page"); if (el) el.innerHTML = html; };

async function adminDashboard() {
  shell("dashboard", `<div class="boot">جارٍ التحميل…</div>`);
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: orders }, { count: customers }, { count: dueLeads }] = await Promise.all([
    sb.from("orders").select("id,package_name,price,status,payment_status,created_at,profiles(full_name)").order("created_at", { ascending: false }),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    sb.from("leads").select("id", { count: "exact", head: true }).lte("next_follow_up", today).not("stage", "in", "(won,lost)"),
  ]);
  const o = orders || [];
  const now = new Date(), monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidMonth = o.filter(x => x.payment_status === "paid" && new Date(x.created_at) >= monthStart).reduce((a, x) => a + Number(x.price || 0), 0);
  const unpaid = o.filter(x => x.payment_status === "unpaid" && x.status !== "cancelled").reduce((a, x) => a + Number(x.price || 0), 0);
  setPage(`<div class="page-head"><h1>لوحة القيادة</h1></div>
    <div class="stats">
      <div class="stat"><span>طلبات جديدة</span><b>${num(o.filter(x => x.status === "new").length)}</b></div>
      <div class="stat"><span>قيد التنفيذ</span><b>${num(o.filter(x => x.status === "in_progress").length)}</b></div>
      <div class="stat"><span>مبيعات مدفوعة هذا الشهر</span><b>${money(paidMonth)}</b></div>
      <div class="stat"><span>مبالغ بانتظار الدفع</span><b>${money(unpaid)}</b></div>
      <div class="stat"><span>العملاء</span><b>${num(customers || 0)}</b></div>
      <a class="stat" href="#/admin/leads" style="text-decoration:none;color:inherit${dueLeads ? ";border-color:var(--gold)" : ""}"><span>متابعات اليوم</span><b>${num(dueLeads || 0)}</b></a>
    </div>
    <div class="panel"><div class="page-head"><h2>آخر الطلبات</h2><a class="btn ghost small" href="#/admin/orders">كل الطلبات</a></div>
      ${ordersTable(o.slice(0, 6))}</div>`);
}
function ordersTable(list) {
  if (!list.length) return `<div class="empty">لا توجد طلبات.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>رقم</th><th>العميل</th><th>الباقة</th><th>المبلغ</th><th>الحالة</th><th>الدفع</th><th>التاريخ</th></tr></thead><tbody>
    ${list.map(o => `<tr class="link" data-act="open-order" data-id="${o.id}"><td class="num">${num(o.id)}</td><td>${esc(o.profiles?.full_name || "—")}</td><td>${esc(o.package_name)}</td><td class="num">${money(o.price)}</td><td>${chip(o.status)}</td><td>${payChip(o.payment_status)}</td><td>${date(o.created_at)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

let orderFilter = "all";
async function adminOrders() {
  shell("orders", `<div class="boot">جارٍ التحميل…</div>`);
  let q = sb.from("orders").select("*,profiles(full_name,phone,email)").order("created_at", { ascending: false });
  if (orderFilter === "unpaid") q = q.eq("payment_status", "unpaid").neq("status", "cancelled");
  else if (orderFilter !== "all") q = q.eq("status", orderFilter);
  const { data, error } = await q;
  const f = [["all", "الكل"], ["new", "جديد"], ["in_progress", "قيد التنفيذ"], ["delivered", "تم التسليم"], ["unpaid", "بانتظار الدفع"], ["cancelled", "ملغي"]];
  setPage(`<div class="page-head"><h1>الطلبات</h1></div>
    <div class="filters">${f.map(([k, l]) => `<button class="tab" data-act="order-filter" data-f="${k}" aria-pressed="${orderFilter === k}">${l}</button>`).join("")}</div>
    ${error ? `<p class="err">${esc(friendly(error))}</p>` : ordersTable(data || [])}`);
}
async function openOrder(id) {
  const { data: o, error } = await sb.from("orders").select("*,profiles(full_name,phone,email)").eq("id", id).single();
  if (error) return toast(friendly(error));
  const c = o.profiles || {};
  const phone = String(c.phone || "").replace(/\D/g, "").replace(/^0/, "966");
  const m = modal(`طلب رقم ${num(o.id)}`, `
    <div class="panel" style="padding:14px"><h3>${esc(o.package_name)}</h3>
      <div class="meta"><span>${money(o.price)} ${esc(o.unit || "")}</span><span>${date(o.created_at)}</span></div>
      ${o.business ? `<p><b>النشاط:</b> ${esc(o.business)}</p>` : ""}
      ${o.notes ? `<p style="white-space:pre-wrap"><b>التفاصيل:</b> ${esc(o.notes)}</p>` : ""}</div>
    <div class="panel" style="padding:14px"><h3>العميل</h3>
      <p>${esc(c.full_name || "—")}</p><p dir="ltr" style="text-align:right">${esc(c.email || "")}</p><p dir="ltr" style="text-align:right">${esc(c.phone || "")}</p>
      ${phone ? `<a class="btn small ghost" style="justify-self:start" target="_blank" rel="noopener" href="https://wa.me/${esc(phone)}">مراسلة العميل على واتساب</a>` : ""}</div>
    <form class="form" id="ord-form">
      <div class="two"><div class="field"><label for="ord-status">حالة الطلب</label><select id="ord-status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="ord-pay">الدفع</label><select id="ord-pay">${Object.entries(PAY).map(([k, l]) => `<option value="${k}" ${o.payment_status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <div class="field"><label for="ord-note">رسالة تظهر للعميل في حسابه</label><textarea id="ord-note" placeholder="مثال: استلمنا الدفع، التسليم يوم الخميس">${esc(o.admin_note || "")}</textarea></div>
      <button class="btn" type="submit" id="ord-btn">حفظ التحديث</button>
    </form>`);
  m.querySelector("#ord-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = m.querySelector("#ord-btn"); busy(btn, true);
    const { error } = await sb.from("orders").update({ status: val("ord-status"), payment_status: val("ord-pay"), admin_note: val("ord-note") || null }).eq("id", o.id);
    busy(btn, false);
    if (error) return toast(friendly(error));
    closeModal(); toast("تم تحديث الطلب."); route();
  });
}

/* ================= CRM: LEADS ================= */
const STAGES = { new: "جديد", contacted: "تواصلنا", quoted: "أرسلنا عرض سعر", won: "اشترى", lost: "غير مهتم" };
const STAGE_CLASS = { new: "s-new", contacted: "s-in_progress", quoted: "st-quoted", won: "s-delivered", lost: "s-cancelled" };
const SOURCES = { whatsapp: "واتساب", instagram: "إنستقرام", tiktok: "تيك توك", snapchat: "سناب شات", x: "إكس", website: "الموقع", referral: "معرفة / توصية", other: "أخرى" };
const CRM_CSS = `.st-quoted{background:#2E2440;color:#C4A8F0}.due-late{color:var(--danger);font-weight:600}.due-today{color:var(--gold);font-weight:600}.lead-sub{color:var(--muted);font-size:.82rem}`;
let leadFilter = "open";
const todayISO = () => new Date().toISOString().slice(0, 10);
const waNum = ph => String(ph || "").replace(/\D/g, "").replace(/^0/, "966");
function dueLabel(d) {
  if (!d) return `<span class="muted">—</span>`;
  const t = todayISO();
  if (d < t) return `<span class="due-late">متأخر · ${date(d)}</span>`;
  if (d === t) return `<span class="due-today">اليوم</span>`;
  return date(d);
}
async function adminLeads() {
  if (!document.getElementById("crm-css")) { const st = document.createElement("style"); st.id = "crm-css"; st.textContent = CRM_CSS; document.head.appendChild(st); }
  shell("leads", `<div class="boot">جارٍ التحميل…</div>`);
  const { data, error } = await sb.from("leads").select("*").order("next_follow_up", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  const all = data || [], t = todayISO();
  const open = all.filter(l => l.stage !== "won" && l.stage !== "lost");
  const due = open.filter(l => l.next_follow_up && l.next_follow_up <= t);
  const pipeline = open.reduce((a, l) => a + Number(l.expected_value || 0), 0);
  const list = leadFilter === "open" ? open : leadFilter === "due" ? due : leadFilter === "all" ? all : all.filter(l => l.stage === leadFilter);
  const f = [["open", `المفتوحون (${num(open.length)})`], ["due", `متابعات اليوم (${num(due.length)})`], ...Object.entries(STAGES).map(([k, v]) => [k, `${v} (${num(all.filter(l => l.stage === k).length)})`]), ["all", "الكل"]];
  setPage(`<div class="page-head"><h1>العملاء المحتملون</h1><button class="btn small" data-act="edit-lead" data-id="">+ عميل محتمل</button></div>
    <div class="stats">
      <div class="stat"><span>مفتوحون</span><b>${num(open.length)}</b></div>
      <div class="stat"${due.length ? ' style="border-color:var(--gold)"' : ""}><span>متابعات اليوم</span><b>${num(due.length)}</b></div>
      <div class="stat"><span>قيمة متوقعة</span><b>${money(pipeline)}</b></div>
      <div class="stat"><span>اشتروا</span><b>${num(all.filter(l => l.stage === "won").length)}</b></div>
    </div>
    <div class="filters">${f.map(([k, l]) => `<button class="tab" data-act="lead-filter" data-f="${k}" aria-pressed="${leadFilter === k}">${l}</button>`).join("")}</div>
    ${error ? `<p class="err">${esc(friendly(error))}</p>` : !list.length ? `<div class="empty">${all.length ? "لا يوجد عملاء في هذا الفلتر." : "لا يوجد عملاء محتملون بعد. أضيفي أول واحد من زر «+ عميل محتمل»، أو هيتضافوا تلقائياً لما حد يسجّل في الموقع."}</div>` :
    `<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الجوال</th><th>المصدر</th><th>مهتم بـ</th><th>المرحلة</th><th>المتابعة الجاية</th><th>القيمة</th></tr></thead><tbody>
    ${list.map(l => `<tr class="link" data-act="edit-lead" data-id="${l.id}"><td><b>${esc(l.full_name)}</b>${l.business ? `<div class="lead-sub">${esc(l.business)}</div>` : ""}</td>
      <td dir="ltr" style="text-align:right">${l.phone ? `<a href="https://wa.me/${esc(waNum(l.phone))}" target="_blank" rel="noopener" data-stop="1">${esc(l.phone)}</a>` : "—"}</td>
      <td>${esc(SOURCES[l.source] || l.source)}</td><td>${esc(l.interest || "—")}</td>
      <td><span class="chip ${STAGE_CLASS[l.stage] || ""}">${STAGES[l.stage] || l.stage}</span></td>
      <td>${dueLabel(l.next_follow_up)}</td><td class="num">${l.expected_value ? money(l.expected_value) : "—"}</td></tr>`).join("")}
    </tbody></table></div>`}`);
}
async function editLead(id) {
  let l = { full_name: "", phone: "", business: "", source: "whatsapp", interest: "", stage: "new", expected_value: "", next_follow_up: todayISO(), notes: "" };
  if (id) { const { data, error } = await sb.from("leads").select("*").eq("id", id).single(); if (error) return toast(friendly(error)); l = data; }
  const opt = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${v}</option>`).join("");
  const services = cats.filter(c => !c.is_bundle).map(c => c.name).concat(["باقة مجمّعة", "غير محدد"]);
  const m = modal(id ? "العميل المحتمل" : "عميل محتمل جديد", `<form class="form" id="lead-form">
    <div class="two"><div class="field"><label for="l-name">الاسم</label><input id="l-name" value="${esc(l.full_name)}" required></div>
    <div class="field"><label for="l-phone">الجوال / واتساب</label><input id="l-phone" dir="ltr" value="${esc(l.phone || "")}" placeholder="05XXXXXXXX"></div></div>
    <div class="two"><div class="field"><label for="l-biz">النشاط</label><input id="l-biz" value="${esc(l.business || "")}" placeholder="مثال: متجر عطور"></div>
    <div class="field"><label for="l-src">جاء من</label><select id="l-src">${opt(SOURCES, l.source)}</select></div></div>
    <div class="two"><div class="field"><label for="l-int">مهتم بـ</label><select id="l-int"><option value="">—</option>${services.map(n => `<option ${n === l.interest ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
    <div class="field"><label for="l-val">القيمة المتوقعة (ر.س)</label><input id="l-val" type="number" inputmode="decimal" value="${esc(l.expected_value || "")}"></div></div>
    <div class="two"><div class="field"><label for="l-stage">المرحلة</label><select id="l-stage">${opt(STAGES, l.stage)}</select></div>
    <div class="field"><label for="l-due">المتابعة الجاية</label><input id="l-due" type="date" value="${esc(l.next_follow_up || "")}"></div></div>
    <div class="field"><label for="l-notes">ملاحظات</label><textarea id="l-notes" placeholder="اتكلمنا إمتى، قال إيه، محتاج إيه">${esc(l.notes || "")}</textarea></div>
    ${l.phone ? `<a class="btn small ghost" style="justify-self:start" target="_blank" rel="noopener" href="https://wa.me/${esc(waNum(l.phone))}">مراسلة على واتساب</a>` : ""}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit" id="l-btn">حفظ</button>
    ${id ? `<button class="btn danger" type="button" id="l-del">حذف</button>` : ""}</div></form>`);
  m.querySelector("#lead-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!val("l-name")) return toast("اكتبي الاسم.");
    const row = { full_name: val("l-name"), phone: val("l-phone") || null, business: val("l-biz") || null, source: val("l-src"), interest: val("l-int") || null,
      expected_value: val("l-val") ? Number(val("l-val")) : null, stage: val("l-stage"), next_follow_up: val("l-due") || null, notes: val("l-notes") || null };
    const btn = m.querySelector("#l-btn"); busy(btn, true);
    const { error } = id ? await sb.from("leads").update(row).eq("id", id) : await sb.from("leads").insert(row);
    busy(btn, false);
    if (error) return toast(friendly(error));
    closeModal(); toast("تم الحفظ."); adminLeads();
  });
  m.querySelector("#l-del")?.addEventListener("click", async e => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "اضغطي مرة ثانية لتأكيد الحذف"; return; }
    const { error } = await sb.from("leads").delete().eq("id", id);
    if (error) return toast(friendly(error));
    closeModal(); toast("تم الحذف."); adminLeads();
  });
}

async function adminCustomers() {
  shell("customers", `<div class="boot">جارٍ التحميل…</div>`);
  const { data, error } = await sb.from("profiles").select("id,full_name,phone,email,created_at,orders(price,payment_status)").eq("role", "customer").order("created_at", { ascending: false });
  const list = data || [];
  setPage(`<div class="page-head"><h1>العملاء</h1><span class="muted">${num(list.length)} عميل</span></div>
    ${error ? `<p class="err">${esc(friendly(error))}</p>` : !list.length ? `<div class="empty">لا يوجد عملاء بعد.</div>` :
    `<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الجوال</th><th>الإيميل</th><th>الطلبات</th><th>المدفوع</th><th>تاريخ التسجيل</th></tr></thead><tbody>
    ${list.map(c => { const os = c.orders || []; const paid = os.filter(x => x.payment_status === "paid").reduce((a, x) => a + Number(x.price || 0), 0);
      return `<tr><td>${esc(c.full_name || "—")}</td><td dir="ltr">${esc(c.phone || "")}</td><td dir="ltr">${esc(c.email || "")}</td><td class="num">${num(os.length)}</td><td class="num">${money(paid)}</td><td>${date(c.created_at)}</td></tr>`; }).join("")}
    </tbody></table></div>`}`);
}

async function adminPackages() {
  shell("packages", `<div class="boot">جارٍ التحميل…</div>`);
  await loadCatalog();
  setPage(`<div class="page-head"><h1>الباقات</h1><button class="btn small" data-act="edit-cat" data-id="">+ قسم جديد</button></div>
    <p class="muted">أي تعديل هنا يظهر في المتجر فوراً.</p>
    ${cats.map(c => `<div class="panel">
      <div class="page-head"><div><h2>${esc(c.name)}</h2><p class="muted" style="font-size:.88rem">${esc(c.description || "")}</p></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost small" data-act="edit-cat" data-id="${c.id}">تعديل القسم</button><button class="btn small" data-act="edit-pkg" data-id="" data-cat="${c.id}">+ باقة</button></div></div>
      <div>${pkgs.filter(p => p.category_id === c.id).map(p => `<div class="pkg-row"><div class="${p.active ? "" : "off"}"><b>${esc(p.name)}</b> <span class="muted" style="font-size:.88rem">· ${esc(p.tier || "")} · ${money(p.price)}</span>${p.popular ? ' <span class="chip s-in_progress">الأكثر طلباً</span>' : ""}${p.active ? "" : ' <span class="chip s-cancelled">مخفية</span>'}</div>
        <button class="btn ghost small" data-act="edit-pkg" data-id="${p.id}" data-cat="${c.id}">تعديل</button></div>`).join("") || `<p class="muted">لا توجد باقات في هذا القسم.</p>`}</div>
    </div>`).join("")}`);
}
function editCat(id) {
  const c = cats.find(x => x.id == id) || { name: "", description: "", unit: "شهرياً", note: "", is_bundle: false, sort: cats.length + 1 };
  const m = modal(id ? "تعديل القسم" : "قسم جديد", `<form class="form" id="cat-form">
    <div class="field"><label for="c-name">اسم القسم</label><input id="c-name" value="${esc(c.name)}" required></div>
    <div class="field"><label for="c-desc">الوصف</label><input id="c-desc" value="${esc(c.description)}"></div>
    <div class="two"><div class="field"><label for="c-unit">الوحدة</label><input id="c-unit" value="${esc(c.unit)}" placeholder="شهرياً"></div>
    <div class="field"><label for="c-sort">الترتيب</label><input id="c-sort" type="number" value="${esc(c.sort)}"></div></div>
    <div class="field"><label for="c-note">ملاحظة تظهر على كل باقة (اختياري)</label><input id="c-note" value="${esc(c.note)}"></div>
    <label class="check"><input type="checkbox" id="c-bundle" ${c.is_bundle ? "checked" : ""}> قسم باقات مجمّعة (خلفية داكنة)</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit" id="c-btn">حفظ</button>
    ${id ? `<button class="btn danger" type="button" id="c-del">حذف القسم وباقاته</button>` : ""}</div></form>`);
  m.querySelector("#cat-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!val("c-name")) return toast("اكتبي اسم القسم.");
    const row = { name: val("c-name"), description: val("c-desc"), unit: val("c-unit"), note: val("c-note") || null, sort: Number(val("c-sort") || 0), is_bundle: m.querySelector("#c-bundle").checked };
    const btn = m.querySelector("#c-btn"); busy(btn, true);
    const { error } = id ? await sb.from("categories").update(row).eq("id", id) : await sb.from("categories").insert(row);
    busy(btn, false);
    if (error) return toast(friendly(error));
    closeModal(); toast("تم الحفظ."); adminPackages();
  });
  m.querySelector("#c-del")?.addEventListener("click", async e => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "اضغطي مرة ثانية لتأكيد الحذف"; return; }
    const { error } = await sb.from("categories").delete().eq("id", id);
    if (error) return toast(friendly(error));
    closeModal(); toast("تم حذف القسم."); adminPackages();
  });
}
function editPkg(id, catId) {
  const p = pkgs.find(x => x.id == id) || { name: "", tier: "", price: "", old_price: "", unit: "", features: [], popular: false, active: true, sort: pkgs.filter(x => x.category_id == catId).length + 1, category_id: Number(catId) };
  const m = modal(id ? "تعديل الباقة" : "باقة جديدة", `<form class="form" id="pkg-form">
    <div class="two"><div class="field"><label for="k-name">اسم الباقة</label><input id="k-name" value="${esc(p.name)}" required></div>
    <div class="field"><label for="k-tier">المستوى</label><input id="k-tier" value="${esc(p.tier)}" placeholder="أساسية / احترافية / متقدمة"></div></div>
    <div class="two"><div class="field"><label for="k-price">السعر (ر.س)</label><input id="k-price" type="number" inputmode="decimal" value="${esc(p.price)}"></div>
    <div class="field"><label for="k-old">السعر قبل الخصم <small>(اختياري)</small></label><input id="k-old" type="number" inputmode="decimal" value="${esc(p.old_price || "")}"></div></div>
    <div class="two"><div class="field"><label for="k-unit">وحدة خاصة <small>(اتركيها فارغة لوحدة القسم)</small></label><input id="k-unit" value="${esc(p.unit || "")}"></div>
    <div class="field"><label for="k-cat">القسم</label><select id="k-cat">${cats.map(c => `<option value="${c.id}" ${c.id == p.category_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div></div>
    <div class="field"><label for="k-feat">ما تشمله الباقة <small>(كل سطر ميزة)</small></label><textarea id="k-feat">${esc((p.features || []).join("\n"))}</textarea></div>
    <div class="two"><div class="field"><label for="k-sort">الترتيب</label><input id="k-sort" type="number" value="${esc(p.sort)}"></div></div>
    <label class="check"><input type="checkbox" id="k-pop" ${p.popular ? "checked" : ""}> تمييزها كـ "الأكثر طلباً"</label>
    <label class="check"><input type="checkbox" id="k-active" ${p.active ? "checked" : ""}> ظاهرة للعملاء</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit" id="k-btn">حفظ</button>
    ${id ? `<button class="btn danger" type="button" id="k-del">حذف الباقة</button>` : ""}</div></form>`);
  m.querySelector("#pkg-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!val("k-name")) return toast("اكتبي اسم الباقة.");
    const row = { name: val("k-name"), tier: val("k-tier"), price: Number(val("k-price") || 0), old_price: val("k-old") ? Number(val("k-old")) : null, unit: val("k-unit") || null,
      category_id: Number(val("k-cat")), features: lines(document.getElementById("k-feat").value), sort: Number(val("k-sort") || 0),
      popular: m.querySelector("#k-pop").checked, active: m.querySelector("#k-active").checked };
    const btn = m.querySelector("#k-btn"); busy(btn, true);
    const { error } = id ? await sb.from("packages").update(row).eq("id", id) : await sb.from("packages").insert(row);
    busy(btn, false);
    if (error) return toast(friendly(error));
    closeModal(); toast("تم حفظ الباقة."); adminPackages();
  });
  m.querySelector("#k-del")?.addEventListener("click", async e => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "اضغطي مرة ثانية لتأكيد الحذف"; return; }
    const { error } = await sb.from("packages").delete().eq("id", id);
    if (error) return toast(friendly(error));
    closeModal(); toast("تم حذف الباقة."); adminPackages();
  });
}

function adminSettings() {
  const s = settings;
  shell("settings", `<div class="page-head"><h1>الإعدادات</h1></div>
    <form class="panel form" id="set-form" style="max-width:640px">
      <div class="field"><label for="s-name">اسم المتجر</label><input id="s-name" value="${esc(s.store_name || "")}"></div>
      <div class="field"><label for="s-wa">رقم واتساب <small>(بمفتاح الدولة بدون +، مثال 9665XXXXXXXX)</small></label><input id="s-wa" dir="ltr" value="${esc(s.whatsapp || "")}"></div>
      <h2 style="margin-top:6px">بيانات التحويل البنكي</h2>
      <p class="muted" style="font-size:.88rem">تظهر للعميل في صفحة طلبه. اتركيها فارغة لو تفضلين إرسالها على واتساب.</p>
      <div class="two"><div class="field"><label for="s-bank">اسم البنك</label><input id="s-bank" value="${esc(s.bank_name || "")}"></div>
      <div class="field"><label for="s-holder">اسم صاحب الحساب</label><input id="s-holder" value="${esc(s.bank_holder || "")}"></div></div>
      <div class="field"><label for="s-iban">رقم الآيبان</label><input id="s-iban" dir="ltr" value="${esc(s.iban || "")}" placeholder="SA00 0000 0000 0000 0000 0000"></div>
      <button class="btn" type="submit" id="s-btn" style="justify-self:start">حفظ الإعدادات</button>
    </form>`);
  document.getElementById("set-form").addEventListener("submit", async e => {
    e.preventDefault();
    const wa = val("s-wa").replace(/\D/g, "");
    if (wa && wa.length < 10) return toast("رقم واتساب غير مكتمل. اكتبيه بمفتاح الدولة.");
    const row = { store_name: val("s-name") || "أثر", whatsapp: wa, bank_name: val("s-bank"), bank_holder: val("s-holder"), iban: val("s-iban") };
    const btn = document.getElementById("s-btn"); busy(btn, true);
    const { error } = await sb.from("settings").update(row).eq("id", 1);
    busy(btn, false);
    if (error) return toast(friendly(error));
    Object.assign(settings, row); toast("تم حفظ الإعدادات."); adminSettings();
  });
}

/* ================= ROUTER ================= */
async function route() {
  closeModal();
  const parts = (location.hash.replace(/^#\/?/, "") || "").split("/");
  const [page, sub] = parts;
  window.scrollTo(0, 0);
  if (page === "login" || page === "signup") { if (session) return afterLogin(); return viewAuth(page); }
  if (page === "order") { if (!session) { sessionStorage.setItem("pendingPkg", sub); return go("#/signup"); } return viewOrder(sub); }
  if (page === "account") { if (!session) return go("#/login"); return viewAccount(); }
  if (page === "admin") {
    if (!session) return go("#/login");
    if (!isAdmin()) { toast("هذه الصفحة للإدارة فقط."); return go("#/account"); }
    const s = sub || "dashboard";
    if (s === "orders") return adminOrders();
    if (s === "leads") return adminLeads();
    if (s === "customers") return adminCustomers();
    if (s === "packages") return adminPackages();
    if (s === "settings") return adminSettings();
    return adminDashboard();
  }
  viewStore();
}

/* ================= EVENTS ================= */
app.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "filter") applyFilter(b.dataset.f);
  else if (act === "svc") { applyFilter(b.dataset.f); document.getElementById("packages")?.scrollIntoView({ behavior: "smooth" }); }
  else if (act === "scroll") document.getElementById(b.dataset.to)?.scrollIntoView({ behavior: "smooth" });
  else if (act === "order") go("#/order/" + b.dataset.id);
  else if (act === "logout") { await sb.auth.signOut(); }
  else if (act === "menu") document.getElementById("shell")?.classList.toggle("open");
  else if (act === "order-filter") { orderFilter = b.dataset.f; adminOrders(); }
  else if (act === "open-order") openOrder(b.dataset.id);
  else if (act === "lead-filter") { leadFilter = b.dataset.f; adminLeads(); }
  else if (act === "edit-lead") { if (e.target.closest("[data-stop]")) return; editLead(b.dataset.id); }
  else if (act === "edit-cat") editCat(b.dataset.id);
  else if (act === "edit-pkg") editPkg(b.dataset.id, b.dataset.cat);
});
document.body.addEventListener("click", e => { if (e.target.closest('[data-act="close-modal"]')) closeModal(); });

window.addEventListener("hashchange", route);

(async function boot() {
  try {
    const { data } = await sb.auth.getSession();
    session = data.session;
    await Promise.all([loadCatalog(), loadProfile()]);
  } catch (err) {
    app.innerHTML = `<div class="auth"><div class="auth-box"><h1>تعذّر الاتصال</h1><p class="muted">${esc(friendly(err))}</p><button class="btn" onclick="location.reload()">إعادة المحاولة</button></div></div>`;
    return;
  }
  route();
  sb.auth.onAuthStateChange(async (event, s) => {
    const was = !!session; session = s;
    if (event === "SIGNED_IN" && !was) { await loadProfile(); afterLogin(); }
    else if (event === "SIGNED_OUT") { profile = null; go("#/"); }
  });
})();
})();
