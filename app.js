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
function viewStore() {
  const shown = cats.map(c => ({ c, list: pkgs.filter(p => p.category_id === c.id && p.active) })).filter(x => x.list.length);
  app.innerHTML = `<div class="wrap">
    ${topBar()}
    <div class="hero">
      <h1>تسويقك كامل في <em>باقة واحدة</em></h1>
      <p>إعلانات ممولة، تصميم، إدارة حسابات، كول سنتر، وفيديوهات بالذكاء الاصطناعي. اختر باقتك، وتابع طلبك خطوة بخطوة من حسابك.</p>
      <div class="facts"><span class="fact">الأسعار بالريال السعودي</span><span class="fact">متابعة الطلب من حسابك</span><span class="fact">تعديلان مجاناً على كل تصميم</span></div>
    </div>
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
    <footer class="foot"><p>${esc(storeName())} لخدمات التسويق · المملكة العربية السعودية</p>
      ${settings.whatsapp ? `<p>واتساب: <span dir="ltr">+${esc(settings.whatsapp)}</span></p>` : ""}
      <p>ميزانية الإعلانات الممولة تُدفع للمنصة مباشرة ولا تدخل في سعر الباقة.</p></footer>
  </div>`;
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
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9h16l-1-5H5L4 9Z"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/></svg>',
};
const MENU = [["dashboard", "لوحة القيادة"], ["orders", "الطلبات"], ["customers", "العملاء"], ["packages", "الباقات"], ["settings", "الإعدادات"]];

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
  const [{ data: orders }, { count: customers }] = await Promise.all([
    sb.from("orders").select("id,package_name,price,status,payment_status,created_at,profiles(full_name)").order("created_at", { ascending: false }),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
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
  if (act === "filter") {
    storeFilter = b.dataset.f;
    app.querySelectorAll(".tabs .tab").forEach(t => t.setAttribute("aria-pressed", t === b));
    app.querySelectorAll("section.cat").forEach(s => (s.hidden = storeFilter !== "all" && s.dataset.cat != storeFilter));
  }
  else if (act === "order") go("#/order/" + b.dataset.id);
  else if (act === "logout") { await sb.auth.signOut(); }
  else if (act === "menu") document.getElementById("shell")?.classList.toggle("open");
  else if (act === "order-filter") { orderFilter = b.dataset.f; adminOrders(); }
  else if (act === "open-order") openOrder(b.dataset.id);
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
