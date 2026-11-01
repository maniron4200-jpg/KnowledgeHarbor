import { getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ADMIN = "maniron4200@gmail.com";
const MAX_SEC = 60;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const st = document.createElement("style");
st.textContent = `
.vc-card{display:flex;align-items:center;gap:10px;background:var(--soft);border:2px solid var(--gold);border-right-width:6px;border-radius:14px;padding:12px 14px;margin-bottom:14px}
.vc-ic{font-size:30px}
.vc-b{flex:1;min-width:0}
.vc-b b{display:block;font-size:14px;margin-bottom:6px;color:var(--ink)}
.vc-b audio{width:100%;height:40px}
.vc-card button{background:none;border:0;color:var(--muted);font-size:18px;cursor:pointer}
#vcOverlay{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}
#vcOverlay .vcbox{background:var(--bg);color:var(--ink);width:100%;max-width:640px;max-height:88vh;overflow:auto;border-radius:20px 20px 0 0;border-top:4px solid var(--gold);padding:16px;font-family:Tajawal,sans-serif}
#vcOverlay h2{margin:0 0 8px;font-size:19px}
#vcOverlay input{width:100%;padding:12px;margin:8px 0;border:1.5px solid var(--line);border-radius:10px;font:16px Tajawal,sans-serif;background:var(--card);color:var(--ink)}
#vcOverlay .vrow{display:flex;gap:8px;margin-top:10px}
#vcOverlay .vrow button{flex:1;padding:12px;border-radius:12px;border:2px solid var(--gold);background:var(--soft);color:var(--ink);font:800 15px Tajawal,sans-serif;cursor:pointer}
#vcOverlay .vrow button.main{background:linear-gradient(135deg,var(--gold),var(--gold2));color:#fff;border:0}
#vcOverlay .vrow button.rec{background:#c62828;color:#fff;border-color:#c62828}
#vcOverlay .vrow button:disabled{opacity:.5}
#vcOverlay .vt{text-align:center;font-size:30px;font-weight:900;direction:ltr;margin:10px 0;color:var(--gold)}
#vcOverlay .vn{font-size:13px;color:var(--muted2);line-height:1.7}
#vcOverlay audio{width:100%;margin-top:8px}
`;
document.head.appendChild(st);

const wrap = document.createElement("div");
wrap.id = "voiceWrap";
const annWrap = $("annWrap");
if (annWrap) annWrap.after(wrap);

function toast(m) {
  const t = $("toast");
  if (!t) return;
  t.textContent = m;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

async function loadVoice() {
  try {
    const s = await getDoc(doc(db, "settings", "voice"));
    if (!s.exists()) { wrap.innerHTML = ""; return; }
    const a = s.data();
    if (!a.active || !String(a.audio || "").startsWith("data:audio/")) { wrap.innerHTML = ""; return; }
    if (localStorage.getItem("voice_seen") === String(a.at)) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = `<div class="vc-card"><span class="vc-ic">🎙️</span><div class="vc-b"><b>${esc(a.title || "بصمة صوتية من المشرف")}</b><audio controls preload="none" src="${a.audio}"></audio></div><button id="vcX" aria-label="إغلاق">✕</button></div>`;
    $("vcX").onclick = () => { localStorage.setItem("voice_seen", String(a.at)); wrap.innerHTML = ""; };
  } catch (e) {}
}

function addAdminButton() {
  const menu = $("menu");
  if (!menu || $("voiceBtn")) return;
  const b = document.createElement("button");
  b.id = "voiceBtn";
  b.textContent = "🎙️ بصمة صوتية للطلاب";
  b.onclick = () => { menu.classList.remove("open"); openRecorder(); };
  const ref = $("annBtn");
  if (ref) ref.after(b); else menu.prepend(b);
}

function openRecorder() {
  const ov = document.createElement("div");
  ov.id = "vcOverlay";
  ov.innerHTML = `<div class="vcbox">
    <h2>🎙️ بصمة صوتية للطلاب</h2>
    <p class="vn">سجّل رسالة (حد أقصى ${MAX_SEC} ثانية) وانشرها، وتظهر للطلاب أعلى الصفحة.</p>
    <input id="vcTitle" maxlength="40" placeholder="عنوان الرسالة (اختياري)">
    <div class="vt" id="vcTime">00:00</div>
    <div class="vrow"><button id="vcRec" class="rec">⏺ ابدأ التسجيل</button></div>
    <div id="vcPrev"></div>
    <div class="vrow"><button id="vcPub" class="main" disabled>📢 نشر</button><button id="vcDel">🗑️ حذف المنشورة</button></div>
    <div class="vrow"><button id="vcClose">إغلاق</button></div>
  </div>`;
  document.body.appendChild(ov);

  let rec = null, stream = null, chunks = [], timer = null, t0 = 0, dataUrl = "";
  const fmt = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");

  const cleanup = () => {
    clearInterval(timer);
    try { if (rec && rec.state !== "inactive") rec.stop(); } catch (e) {}
    if (stream) stream.getTracks().forEach(t => t.stop());
  };
  const close = () => { cleanup(); ov.remove(); };
  ov.onclick = e => { if (e.target === ov) close(); };
  $("vcClose").onclick = close;

  const stopRec = () => {
    if (rec && rec.state !== "inactive") rec.stop();
    clearInterval(timer);
    $("vcRec").textContent = "⏺ تسجيل من جديد";
  };

  $("vcRec").onclick = async () => {
    if (rec && rec.state === "recording") { stopRec(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) { toast("لازم تسمح للمايكروفون"); return; }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
    } catch (e) { toast("المتصفح ما يدعم التسجيل"); return; }
    chunks = []; dataUrl = "";
    $("vcPub").disabled = true;
    $("vcPrev").innerHTML = "";
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const fr = new FileReader();
      fr.onload = () => {
        dataUrl = String(fr.result);
        if (!dataUrl.startsWith("data:audio/")) dataUrl = dataUrl.replace(/^data:[^;]*/, "data:audio/webm");
        if (dataUrl.length > 900000) { toast("التسجيل كبير، اختصره"); dataUrl = ""; return; }
        $("vcPrev").innerHTML = `<audio controls src="${dataUrl}"></audio>`;
        $("vcPub").disabled = false;
      };
      fr.readAsDataURL(blob);
    };
    rec.start();
    t0 = Date.now();
    $("vcRec").textContent = "⏹ إيقاف التسجيل";
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $("vcTime").textContent = fmt(s);
      if (s >= MAX_SEC) stopRec();
    }, 250);
  };

  $("vcPub").onclick = async () => {
    if (!dataUrl) return;
    try {
      await setDoc(doc(db, "settings", "voice"), { active: true, audio: dataUrl, title: $("vcTitle").value.trim(), at: Date.now() });
      toast("✅ تم نشر البصمة الصوتية");
      close();
      loadVoice();
    } catch (e) { alert("فشل النشر: " + (e.code || e.message)); }
  };

  $("vcDel").onclick = async () => {
    try {
      await setDoc(doc(db, "settings", "voice"), { active: false, audio: "", title: "", at: Date.now() });
      toast("🗑️ تم حذف البصمة الصوتية");
      close();
      loadVoice();
    } catch (e) { alert("فشل: " + (e.code || e.message)); }
  };
}

onAuthStateChanged(auth, u => {
  if (!u) return;
  if (u.email === ADMIN) addAdminButton();
  loadVoice();
});
