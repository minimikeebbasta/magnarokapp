// Magnarok – mini app
// Realtime via Firebase (opzionale) + fallback localStorage.
//
// 1) Inserisci qui la config Firebase (console -> Project settings -> Your apps -> Firebase SDK snippet -> config)
const FIREBASE_CONFIG = null; // <-- sostituisci con: { apiKey: "...", authDomain: "...", databaseURL: "...", projectId: "...", appId: "..." }

// --- UI helpers
const $ = (id) => document.getElementById(id);

const DEFAULT_STATE = {
  players: []
};

// Values order
const VALUE_KEYS = [
  ["med", "Medicina/Scienza"],
  ["cur", "Curiosità"],
  ["dia", "Dialogo"],
  ["for", "Forza"],
  ["fur", "Furbizia"],
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clamp0(n){ return Math.max(0, n|0); }

// --- Storage adapters
class LocalAdapter {
  constructor(sessionId){ this.key = `magnarok:${sessionId}`; }
  async init(){ return; }
  async load(){
    try{
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : structuredClone(DEFAULT_STATE);
    } catch { return structuredClone(DEFAULT_STATE); }
  }
  async save(state){
    localStorage.setItem(this.key, JSON.stringify(state));
  }
  onChange(_cb){ /* no realtime */ }
}

class FirebaseAdapter {
  constructor(sessionId){
    this.sessionId = sessionId;
    this.app = null;
    this.db = null;
    this.auth = null;
    this.ref = null;
    this.unsub = null;
  }
  async init(){
    if(!FIREBASE_CONFIG) throw new Error("Firebase non configurato");
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const { getDatabase, ref, onValue, set, get, child } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js");
    const { getAuth, signInAnonymously } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");

    this._ref = ref; this._onValue = onValue; this._set = set; this._get = get; this._child = child;

    this.app = initializeApp(FIREBASE_CONFIG);
    this.db = getDatabase(this.app);
    this.auth = getAuth(this.app);
    await signInAnonymously(this.auth);
    this.ref = ref(this.db, `sessions/${this.sessionId}`);
  }
  async load(){
    const snap = await this._get(this.ref);
    if(!snap.exists()) return structuredClone(DEFAULT_STATE);
    return snap.val();
  }
  async save(state){
    await this._set(this.ref, state);
  }
  onChange(cb){
    if(this.unsub) this.unsub();
    this.unsub = this._onValue(this.ref, (snap)=>{
      if(!snap.exists()) return cb(structuredClone(DEFAULT_STATE));
      cb(snap.val());
    });
  }
}

// --- App state
let adapter = null;
let sessionId = "";
let mode = "firebase";
let state = structuredClone(DEFAULT_STATE);
let connected = false;

// --- Rendering
function render(){
  const wrap = $("players");
  wrap.innerHTML = "";
  if(!state.players.length){
    const empty = document.createElement("div");
    empty.className = "small";
    empty.textContent = "Nessun giocatore ancora. Premi “Aggiungi giocatore”.";
    wrap.appendChild(empty);
    return;
  }

  for(const p of state.players){
    const el = document.createElement("div");
    el.className = "player";

    el.innerHTML = `
      <div class="playerHead">
        <div>
          <div class="playerName">${escapeHtml(p.name || "Senza nome")}</div>
          <div class="badges">
            <span class="badge">Motrice: <b>${escapeHtml(p.motrice || "—")}</b></span>
            <span class="badge">Bloccante: <b>${escapeHtml(p.bloccante || "—")}</b></span>
          </div>
        </div>
        <div class="row">
          <button class="ghost" data-act="edit" data-id="${p.id}">Modifica</button>
          <button class="danger" data-act="del" data-id="${p.id}">Rimuovi</button>
        </div>
      </div>

      <div class="cols">
        <div class="values">
          ${VALUE_KEYS.map(([k,label])=>valueRow(p.id,k,label,p.values?.[k] ?? 0)).join("")}
        </div>
        <div>
          <label>Visione (note su altri giocatori / emozioni)</label>
          <textarea data-act="vision" data-id="${p.id}" placeholder="Es. 1) X motrice: ... bloccante: ...">${escapeHtml(p.vision || "")}</textarea>

          <label style="margin-top:10px;">Cartella clinica (ferite, disabilità, danni permanenti)</label>
          <textarea data-act="clinic" data-id="${p.id}" placeholder="Es. Ferita alla spalla, non guarita">${escapeHtml(p.clinic || "")}</textarea>
        </div>
      </div>
    `;
    wrap.appendChild(el);
  }
}

function valueRow(pid, key, label, val){
  return `
    <div class="valueRow">
      <div>
        <div class="name">${label}</div>
      </div>
      <button class="ghost" data-act="dec" data-id="${pid}" data-key="${key}">−</button>
      <div class="pill">${val}</div>
      <button data-act="inc" data-id="${pid}" data-key="${key}">+</button>
    </div>
  `;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c] || c));
}

// --- Mutations
async function mutate(fn){
  if(!connected){
    alert("Non connesso. Inserisci codice sessione e premi Connetti.");
    return;
  }
  const next = structuredClone(state);
  fn(next);
  state = next;
  render();
  await adapter.save(state);
}

function addPlayer(){
  mutate((st)=>{
    st.players.push({
      id: uid(),
      name: "Nuovo",
      motrice: "",
      bloccante: "",
      values: { med:0, cur:0, dia:0, for:0, fur:0 },
      vision: "",
      clinic: ""
    });
  });
}

function removePlayer(id){
  mutate((st)=>{ st.players = st.players.filter(p=>p.id!==id); });
}

function setPlayer(id, patch){
  mutate((st)=>{
    const p = st.players.find(x=>x.id===id);
    if(!p) return;
    Object.assign(p, patch);
  });
}

function incVal(id,key,delta){
  mutate((st)=>{
    const p = st.players.find(x=>x.id===id);
    if(!p) return;
    p.values = p.values || { med:0,cur:0,dia:0,for:0,fur:0 };
    p.values[key] = clamp0((p.values[key] ?? 0) + delta);
  });
}

// --- Connect
async function connect(){
  sessionId = $("sessionId").value.trim();
  mode = $("mode").value;
  if(!sessionId){
    alert("Inserisci un codice sessione.");
    return;
  }

  try{
    if(mode === "local"){
      adapter = new LocalAdapter(sessionId);
      await adapter.init();
      state = await adapter.load();
      connected = true;
      setStatus(true, "Connesso (locale)");
      render();
      // no realtime
      return;
    }

    adapter = new FirebaseAdapter(sessionId);
    await adapter.init();
    connected = true;
    setStatus(true, "Connesso (realtime)");
    // subscribe changes
    adapter.onChange((st)=>{
      state = st || structuredClone(DEFAULT_STATE);
      render();
    });
    // initialize if empty
    const st = await adapter.load();
    state = st || structuredClone(DEFAULT_STATE);
    await adapter.save(state);
    render();
  } catch (e){
    console.error(e);
    connected = false;
    setStatus(false, "Errore: " + (e?.message || "impossibile connettersi"));
    alert("Realtime non disponibile. Configura Firebase in app.js oppure scegli modalità Solo locale.");
  }
}

function setStatus(ok, text){
  const s = $("status");
  s.textContent = text;
  s.className = "status" + (ok ? " ok" : "");
}

// --- Import/Export
function exportJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `magnarok-${sessionId || "session"}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importJSON(file){
  const txt = await file.text();
  const data = JSON.parse(txt);
  await mutate((st)=>{
    st.players = Array.isArray(data.players) ? data.players : [];
  });
}

// --- Install prompt (PWA)
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").hidden = false;
});
$("installBtn").addEventListener("click", async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").hidden = true;
});

// --- Events
$("connectBtn").addEventListener("click", connect);
$("addPlayerBtn").addEventListener("click", addPlayer);
$("exportBtn").addEventListener("click", exportJSON);
$("importFile").addEventListener("change", (e)=>{
  const f = e.target.files?.[0];
  if(f) importJSON(f);
});

// delegate clicks / inputs
$("players").addEventListener("click", (e)=>{
  const btn = e.target.closest("button");
  if(!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;
  const key = btn.dataset.key;
  if(act==="inc") return incVal(id,key,+1);
  if(act==="dec") return incVal(id,key,-1);
  if(act==="del") return removePlayer(id);
  if(act==="edit"){
    const p = state.players.find(x=>x.id===id);
    if(!p) return;
    const name = prompt("Nome inventato:", p.name ?? "") ?? p.name;
    const mot = prompt("Emozione Motrice:", p.motrice ?? "") ?? p.motrice;
    const blo = prompt("Emozione Bloccante:", p.bloccante ?? "") ?? p.bloccante;
    return setPlayer(id, { name, motrice: mot, bloccante: blo });
  }
});

$("players").addEventListener("input", (e)=>{
  const ta = e.target.closest("textarea");
  if(!ta) return;
  const act = ta.dataset.act;
  const id = ta.dataset.id;
  const val = ta.value;
  if(act==="vision") return setPlayer(id, { vision: val });
  if(act==="clinic") return setPlayer(id, { clinic: val });
});

// service worker
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=> navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
}

// initial
setStatus(false, "Non connesso");
render();
