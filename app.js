const ROOM_RE = /^(?:[A-Z]\d{3,4}|\d{4,5})$/;

const els = {
  btnLoadInh: document.getElementById('btnLoadInh'),
  fileInh: document.getElementById('fileInh'),
  btnExport: document.getElementById('btnExport'),
  btnImport: document.getElementById('btnImport'),
  fileLog: document.getElementById('fileLog'),
  btnClear: document.getElementById('btnClear'),
  inhStatus: document.getElementById('inhStatus'),
  inhMeta: document.getElementById('inhMeta'),

  room: document.getElementById('room'),
  guests: document.getElementById('guests'),
  btnSave: document.getElementById('btnSave'),
  btnRefresh: document.getElementById('btnRefresh'),

  recent: document.getElementById('recent'),
  today: document.getElementById('today'),

  overlay: document.getElementById('overlay'),
  mTitle: document.getElementById('mTitle'),
  mBody: document.getElementById('mBody'),
  mRo: document.getElementById('mRo'),
  mActions: document.getElementById('mActions'),
};

function pad(n){return String(n).padStart(2,'0');}
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function nowISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function normRoom(s){
  let t = String(s ?? '').toUpperCase().trim();
  t = t.replace(/\s+/g,'');
  if (t.includes('/')) t = t.split('/')[0];
  return t;
}
function normName(s){
  let t = String(s ?? '').trim().replace(/\s+/g,' ');
  t = t.replace(/^\*+/, '').trim();
  if (t.includes(',')){
    const parts = t.split(',').map(x=>x.trim()).filter(Boolean);
    if (parts.length >= 2){
      const last = parts[0];
      const given = parts.slice(1).join(' ').trim();
      if (given) return `${given} ${last}`.replace(/\s+/g,' ').trim();
      return last;
    }
  }
  return t;
}

// Normalize header keys for flexible matching (trim, remove NBSP, remove punctuation, uppercase)
function normHeaderKey(s){
  let t = String(s ?? '');
  t = t.replace(/^\uFEFF/, '');          // BOM
  t = t.replace(/\u00A0/g, ' ');         // NBSP
  t = t.trim().toUpperCase();
  // remove punctuation/spaces
  t = t.replace(/[^A-Z0-9ก-๙]+/g, '');
  return t;
}

function findHeaderIndex(header, candidates){
  const H = header.map(h => normHeaderKey(h));
  for (const c of candidates){
    const key = normHeaderKey(c);
    const i = H.indexOf(key);
    if (i !== -1) return i;
  }
  return -1;
}

// Minimal CSV parser supporting quotes + auto-detect delimiter (comma/semicolon/tab)
// NOTE: Excel (ภาษาไทย/ยุโรป) มัก export CSV เป็น ';' ทำให้หา Room ไม่เจอถ้า parser คิดว่าเป็น ','
function guessDelimiter(text){
  const lines = String(text||'').split(/\r?\n/).filter(l=>l.trim().length>0);
  const first = lines[0] || '';
  const count = (ch)=> (first.match(new RegExp('\\'+ch,'g'))||[]).length;
  const cComma = count(',');
  const cSemi  = count(';');
  const cTab   = count('\t');
  const max = Math.max(cComma, cSemi, cTab);
  if (max === 0) return ','; // fallback
  if (max === cSemi) return ';';
  if (max === cTab) return '\t';
  return ',';
}

function csvParse(text, delimiter){
  const delim = delimiter || guessDelimiter(text);
  const rows = [];
  let i=0, field='', row=[], inQ=false;
  while (i < text.length){
    const c = text[i];
    if (inQ){
      if (c === '"'){
        if (text[i+1] === '"'){ field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim){ row.push(field); field=''; }
      else if (c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if (c === '\r'){ /* ignore */ }
      else field += c;
    }
    i++;
  }
  if (field.length || row.length){ row.push(field); rows.push(row); }
  // trim + strip BOM
  return rows.map((r,ri)=>r.map((x,ci)=>{
    let s = String(x ?? '').trim();
    if (ri===0 && ci===0) s = s.replace(/^\uFEFF/, ''); // BOM
    return s;
  }));
}

function saveLocal(key,val){ localStorage.setItem(key, JSON.stringify(val)); }
function loadLocal(key,fallback){
  const s = localStorage.getItem(key);
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

function setInhStatus(loaded, meta=''){
  if (loaded){
    els.inhStatus.textContent = 'โหลดแล้ว';
    els.inhStatus.className = 'pill ok';
    els.inhMeta.textContent = meta ? ` — ${meta}` : '';
  } else {
    els.inhStatus.textContent = 'ยังไม่ได้โหลด';
    els.inhStatus.className = 'pill no';
    els.inhMeta.textContent = '';
  }
}

function showModal({title='แจ้งเตือน', body='', isRO=false, ask=false}){
  els.mTitle.textContent = title;
  els.mBody.textContent = body;
  els.mRo.style.display = isRO ? 'block' : 'none';
  els.mActions.innerHTML = '';
  return new Promise((resolve)=>{
    const close = (val)=>{
      els.overlay.style.display = 'none';
      resolve(val);
    };
    if (ask){
      const btnNo = document.createElement('button');
      btnNo.className = 'secondary';
      btnNo.textContent = 'ยกเลิก';
      btnNo.onclick = ()=>close(false);

      const btnYes = document.createElement('button');
      btnYes.textContent = 'ตกลง';
      btnYes.onclick = ()=>close(true);

      els.mActions.appendChild(btnNo);
      els.mActions.appendChild(btnYes);
    } else {
      const btnOK = document.createElement('button');
      btnOK.textContent = 'OK';
      btnOK.onclick = ()=>close(true);
      els.mActions.appendChild(btnOK);
    }
    els.overlay.style.display = 'flex';
    const onKey = (e)=>{
      if (e.key === 'Escape'){ window.removeEventListener('keydown', onKey); close(false); }
      if (e.key === 'Enter'){ window.removeEventListener('keydown', onKey); close(true); }
    };
    window.addEventListener('keydown', onKey);
  });
}

// INH: room -> {name, pkg}

// =======================
// Cloud Sync (Firebase Firestore)
// ทุกเครื่องใช้ข้อมูลเดียวกัน ถ้าตั้งค่า FIREBASE_CONFIG แล้ว
// =======================
let cloudEnabled = false;
let cloudReady = false;
let cloudClearBefore = null; // soft-clear timestamp
let cloudInhMap = null;      // room -> {name, pkg}
let cloudLogs = [];          // today logs

function setCloudPill(state, kind='no'){
  const el = document.getElementById('cloudPill');
  if (!el) return;
  el.className = 'pill ' + (kind || 'no');
  el.textContent = state;
}

async function initCloud(){
  if (!window.__fb || !window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.projectId || window.FIREBASE_CONFIG.projectId === 'PASTE_HERE'){
    setCloudPill('Cloud: ไม่ได้ตั้งค่า', 'no');
    return;
  }
  cloudEnabled = true;
  setCloudPill('Cloud: กำลังเชื่อมต่อ…', 'warn');

  const { auth, signInAnonymously, onAuthStateChanged } = window.__fb;

  try{ await signInAnonymously(auth); }catch(e){}

  await new Promise((resolve)=>{
    const unsub = onAuthStateChanged(auth, (u)=>{
      if (u){
        cloudReady = true;
        setCloudPill('Cloud: เชื่อมต่อแล้ว', 'ok');
        unsub();
        resolve(true);
      }
    });
    setTimeout(()=>resolve(false), 3000);
  });

  if (!cloudReady){
    setCloudPill('Cloud: เชื่อมต่อไม่สำเร็จ', 'warn');
    return;
  }

  subscribeTodayMeta();
  subscribeTodayInh();
  subscribeTodayLogs();
}

function hotelPath(){
  const hid = (window.HOTEL_ID || 'default').trim();
  return `hotels/${hid}`;
}
function dayPath(){
  return `${hotelPath()}/days/${todayISO()}`;
}

function subscribeTodayMeta(){
  const { db, doc, onSnapshot } = window.__fb;
  const metaRef = doc(db, dayPath() + '/meta');
  onSnapshot(metaRef, (snap)=>{
    const d = snap.data();
    if (d && d.clearedAt){
      cloudClearBefore = d.clearedAt.toDate ? d.clearedAt.toDate() : null;
      renderRecent();
initCloud();
    }
  });
}

function subscribeTodayInh(){
  const { db, collection, onSnapshot } = window.__fb;
  const roomsRef = collection(db, dayPath() + '/inh_rooms');
  onSnapshot(roomsRef, (snap)=>{
    const map = {};
    snap.forEach(docu=>{
      const v = docu.data() || {};
      map[docu.id] = { name: v.name || '-', pkg: (String(v.pkg||'RB').toUpperCase()==='RO')?'RO':'RB' };
    });
    cloudInhMap = map;

    if (!inhMap && Object.keys(map).length){
      inhMap = cloudInhMap;
      const rooms = Object.keys(inhMap).length;
      const ro = Object.values(inhMap).filter(x=>x.pkg==='RO').length;
      inhMeta = {rooms, ro, file:'(Cloud)', loadedAt: nowISO()};
      saveLocal('inhMap', inhMap);
      saveLocal('inhMeta', inhMeta);
      setInhStatus(true, `Rooms: ${rooms} | RO: ${ro} | Cloud`);
    }
  });
}

function subscribeTodayLogs(){
  const { db, collection, onSnapshot, query, orderBy, limit } = window.__fb;
  const logsRef = collection(db, dayPath() + '/checkins');
  const q = query(logsRef, orderBy('DateTime', 'desc'), limit(60));
  onSnapshot(q, (snap)=>{
    const arr = [];
    snap.forEach(docu=>{
      const v = docu.data() || {};
      arr.push({
        DateTime: v.DateTime || '',
        Room: v.Room || '',
        Guests: v.Guests || 0,
        GuestName: v.GuestName || '-',
        Package: (String(v.Package||'RB').toUpperCase()==='RO')?'RO':'RB',
        NeedPayment: v.NeedPayment || 'NO',
        InhFound: v.InhFound || 'NO',
      });
    });
    cloudLogs = arr;
    renderRecent();
  });
}

async function uploadInhToCloud(map){
  const { db, doc, setDoc, writeBatch, serverTimestamp } = window.__fb;
  const entries = Object.entries(map || {});
  const rooms = entries.length;
  const ro = entries.filter(([_,v]) => (v && String(v.pkg||'').toUpperCase()==='RO')).length;

  await setDoc(doc(db, dayPath() + '/meta'), {
    inhRooms: rooms,
    inhRO: ro,
    inhUpdatedAt: serverTimestamp(),
  }, { merge:true });

  let i=0;
  while (i < entries.length){
    const batch = writeBatch(db);
    const slice = entries.slice(i, i+450);
    for (const [room, val] of slice){
      const r = normRoom(room);
      if (!ROOM_RE.test(r)) continue;
      batch.set(doc(db, dayPath() + `/inh_rooms/${r}`), {
        name: val?.name || '-',
        pkg: (String(val?.pkg||'RB').toUpperCase()==='RO')?'RO':'RB',
        updatedAt: serverTimestamp(),
      }, { merge:true });
    }
    await batch.commit();
    i += 450;
  }
}

async function saveCheckinCloud(payload){
  const { db, doc, getDoc, setDoc, addDoc, collection, serverTimestamp } = window.__fb;
  const room = payload.Room;

  const statusRef = doc(db, dayPath() + `/room_status/${room}`);
  const snap = await getDoc(statusRef);
  if (snap.exists()){
    const prev = snap.data() || {};
    const ok = await showModal({
      title:'ห้องนี้เช็คอินแล้ว',
      body:`ชื่อ: ${payload.GuestName}\nห้อง: ${room}\nเวลา: ${prev.DateTime || '-'}\nต้องการบันทึกซ้ำหรือไม่?`,
      ask:true
    });
    if (!ok) return false;
  }

  await addDoc(collection(db, dayPath() + '/checkins'), {
    DateTime: payload.DateTime,
    Room: payload.Room,
    Guests: payload.Guests,
    GuestName: payload.GuestName,
    Package: payload.Package,
    NeedPayment: payload.NeedPayment,
    InhFound: payload.InhFound,
    createdAt: serverTimestamp(),
  });

  await setDoc(statusRef, {
    DateTime: payload.DateTime,
    Room: payload.Room,
    Guests: payload.Guests,
    GuestName: payload.GuestName,
    Package: payload.Package,
    NeedPayment: payload.NeedPayment,
    InhFound: payload.InhFound,
    updatedAt: serverTimestamp(),
  }, { merge:true });

  return true;
}

async function softClearTodayCloud(){
  const { db, doc, setDoc, serverTimestamp } = window.__fb;
  await setDoc(doc(db, dayPath() + '/meta'), { clearedAt: serverTimestamp() }, { merge:true });
  cloudClearBefore = new Date();
  renderRecent();
}
// =======================
// /Cloud Sync
// =======================

let inhMap = loadLocal('inhMap', null);
let inhMeta = loadLocal('inhMeta', null);
if (inhMap && inhMeta) setInhStatus(true, `Rooms: ${inhMeta.rooms} | RO: ${inhMeta.ro} | ${inhMeta.file}`);
else setInhStatus(false);

function buildInhMapFromCsv(text, filename){
  const rows = csvParse(text).filter(r=>r.some(x=>x));
  if (rows.length < 2) throw new Error('CSV ว่างหรือรูปแบบไม่ถูกต้อง');

  const header = rows[0].map(h=>String(h ?? '').trim());
  // Flexible header matching (supports Room/ห้อง/เลขห้อง, etc.)
  const iRoom = findHeaderIndex(header, ['Room','ห้อง','เลขห้อง','Room No','RoomNo','Room Number','Rm','Rms']);
  const iPkg  = findHeaderIndex(header, ['Package','Pkg','แพคเกจ','MealPlan','Meal Plan','MealPlan_or_Comment','RatePlan','Rate Plan']);
  const iName = findHeaderIndex(header, ['Guest Full Name','Guest Name','Full Name','Name','ชื่อ-นามสกุล','ชื่อแขก','AllNames','PrimaryName']);

  if (iRoom === -1) {
  const delim = guessDelimiter(text);
  throw new Error(`ไม่พบคอลัมน์ Room/ห้อง
ตัวคั่นที่ตรวจพบ: ${delim === "	" ? "TAB" : delim}
หัวคอลัมน์ที่พบ: ${header.join(" | ")}

คำแนะนำ: ถ้าไฟล์มาจาก Excel ให้ลอง Save As → CSV UTF-8 (Comma delimited) หรือใช้ XLSX (เวอร์ชันนี้รองรับ)`);
}
  if (iName === -1) throw new Error('ไม่พบคอลัมน์ "Guest Full Name/ชื่อ-นามสกุล"');
  if (iPkg === -1) throw new Error('ไม่พบคอลัมน์ "Package/แพคเกจ"');

  const map = {};
  let rooms=0, ro=0;

  for (let r=1;r<rows.length;r++){
    const row = rows[r];
    const room = normRoom(row[iRoom] || '');
    if (!ROOM_RE.test(room)) continue;

    const name = normName(row[iName] || '') || '-';
    let pkg = String(row[iPkg] || '').trim().toUpperCase();
    pkg = (pkg === 'RO' || pkg.startsWith('RO')) ? 'RO' : 'RB';

    if (!map[room]){
      map[room] = {name, pkg};
      rooms++;
      if (pkg === 'RO') ro++;
    } else {
      if (name !== '-' && map[room].name !== name){
        const parts = map[room].name.split(';').map(x=>x.trim()).filter(Boolean);
        if (!parts.includes(name)) map[room].name = map[room].name + '; ' + name;
      }
      if (map[room].pkg !== 'RO' && pkg === 'RO'){ map[room].pkg='RO'; ro++; }
    }
  }

  inhMap = map;
  inhMeta = {rooms, ro, file: filename, loadedAt: nowISO()};
  saveLocal('inhMap', inhMap);
  saveLocal('inhMeta', inhMeta);
  setInhStatus(true, `Rooms: ${rooms} | RO: ${ro} | ${filename}`);
  if (cloudReady){ uploadInhToCloud(map).catch(()=>{}); }
}

function getLogs(){
  if (cloudReady) return cloudLogs.slice();
  const t = todayISO();
  return loadLocal('logs_' + t, []);
}
function setLogs(logs){
  const t = todayISO();
  saveLocal('logs_' + t, logs);
}
function findLogToday(room){
  if (cloudReady){
    for (let i=0;i<cloudLogs.length;i++){
      if (cloudLogs[i].Room === room) return cloudLogs[i];
    }
    return null;
  }
  const logs = getLogs();
  for (let i=logs.length-1;i>=0;i--){
    if (logs[i].Room === room) return logs[i];
  }
  return null;
}

function renderRecent(){
  const t = todayISO();
  els.today.textContent = t;

  let logs = (cloudReady ? cloudLogs.slice(0,60) : getLogs().slice(-40).reverse());
  if (cloudClearBefore){
    logs = logs.filter(l=>{
      try{ return new Date(String(l.DateTime||'').replace(' ', 'T')) >= cloudClearBefore; }catch{ return true; }
    });
  }
  if (!logs.length){
    els.recent.textContent = 'วันนี้ยังไม่มีรายการ';
    return;
  }
  const lines = logs.map(l=>{
    const pay = l.NeedPayment === 'YES' ? 'PAY' : 'OK';
    return `${l.DateTime} | ${l.Room} | ${l.Guests} | ${l.GuestName} | ${l.Package} | ${pay}`;
  });
  els.recent.textContent = lines.join('\n');
}

function exportLogsCSV(){
  const t = todayISO();
  const logsRaw = cloudReady ? cloudLogs.slice() : getLogs();
  let logs = logsRaw;
  if (cloudClearBefore){
    logs = logsRaw.filter(l=>{
      try{ return new Date(String(l.DateTime||'').replace(' ', 'T')) >= cloudClearBefore; }catch{ return true; }
    });
  }
  if (!logs.length){ showModal({title:'ยังไม่มีข้อมูล', body:'วันนี้ยังไม่มีรายการให้ export'}); return; }

  const headers = ['DateTime','Date','Room','Guests','GuestName','Package','NeedPayment','InhFound'];
  const esc = (v)=>{
    const s = String(v ?? '');
    if (/[",
]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  };

  const ordered = logs.slice().reverse();

  const csv = [headers.join(',')]
    .concat(ordered.map(l=>headers.map(h=>esc(h==='Date'?t:l[h])).join(',')))
    .join('
');

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `breakfast_checkins_${t}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importLogsCSV(file){
  const text = await file.text();
  const rows = csvParse(text).filter(r=>r.some(x=>x));
  if (rows.length < 2) throw new Error('ไฟล์ Logs ว่าง');
  const H = rows[0].map(x=>x.trim().toUpperCase());
  const idx = (name)=> H.indexOf(name.toUpperCase());

  const iDT = idx('DateTime');
  const iDate = idx('Date');
  const iRoom = idx('Room');
  const iGuests = idx('Guests');
  const iName = idx('GuestName');
  const iPkg = idx('Package');
  const iPay = idx('NeedPayment');
  const iFound = idx('InhFound');

  if (iDate === -1 || iRoom === -1) throw new Error('Logs CSV ต้องมีคอลัมน์ Date และ Room');

  // group by date
  const byDate = new Map();
  for (let r=1;r<rows.length;r++){
    const row = rows[r];
    const d = row[iDate] || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const room = normRoom(row[iRoom] || '');
    if (!room) continue;
    const item = {
      DateTime: row[iDT] || nowISO(),
      Room: room,
      Guests: parseInt(row[iGuests] || '1',10) || 1,
      GuestName: row[iName] || '-',
      Package: (String(row[iPkg]||'RB').toUpperCase()==='RO')?'RO':'RB',
      NeedPayment: (String(row[iPay]||'NO').toUpperCase()==='YES')?'YES':'NO',
      InhFound: (String(row[iFound]||'NO').toUpperCase()==='YES')?'YES':'NO',
    };
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(item);
  }

  for (const [d, arr] of byDate.entries()){
    const key = 'logs_' + d;
    const existing = loadLocal(key, []);
    const sig = new Set(existing.map(x=>`${x.DateTime}|${x.Room}|${x.Guests}`));
    for (const it of arr){
      const s = `${it.DateTime}|${it.Room}|${it.Guests}`;
      if (!sig.has(s)){
        existing.push(it);
        sig.add(s);
      }
    }
    existing.sort((a,b)=>String(a.DateTime).localeCompare(String(b.DateTime)));
    saveLocal(key, existing);
  }
}

els.btnLoadInh.addEventListener('click', ()=>els.fileInh.click());
els.fileInh.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    const name = file.name || '';
    const ext = name.toLowerCase().split('.').pop();

    if (ext === 'xlsx'){
      if (typeof XLSX === 'undefined'){
        throw new Error('ยังโหลดตัวอ่านไฟล์ XLSX ไม่สำเร็จ\nแนะนำ: เปิดเว็บนี้ด้วยอินเทอร์เน็ต 1 ครั้ง แล้วรีเฟรชใหม่');
      }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});

      // Prefer sheet name 'Guests' if present
      const sheetName = (wb.SheetNames || []).includes('Guests') ? 'Guests' : (wb.SheetNames?.[0]);
      if (!sheetName) throw new Error('ไม่พบชีตในไฟล์ Excel');
      const ws = wb.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''}); // array of arrays
      if (!rows || rows.length < 2) throw new Error('ไฟล์ Excel ว่างหรือไม่มีข้อมูล');

      // Find header row within first 30 rows (Room/ห้อง/เลขห้อง)
      const looksLikeHeader = (row)=>{
        const keys = row.map(x=>String(x??'')).join(' | ').toLowerCase();
        return keys.includes('room') || keys.includes('ห้อง') || keys.includes('เลขห้อง');
      };
      let headerRow = 0;
      for (let i=0;i<Math.min(30, rows.length);i++){
        if (looksLikeHeader(rows[i])) { headerRow = i; break; }
      }
      const trimmed = rows.slice(headerRow);

      // Convert to CSV (comma) then reuse parser
      const esc = (v)=>{
        const s = String(v ?? '');
        if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
        return s;
      };
      const csv = trimmed.map(r=>r.map(esc).join(',')).join('\n');
      buildInhMapFromCsv(csv, name);
    } else {
      // csv or others
      const text = await file.text();
      buildInhMapFromCsv(text, name);
    }

    await showModal({title:'สำเร็จ', body:'โหลด INH เรียบร้อย'});
  }catch(err){
    await showModal({title:'โหลด INH ไม่สำเร็จ', body: err?.message || String(err)});
  }finally{
    els.fileInh.value = '';
  }
});

els.btnExport.addEventListener('click', exportLogsCSV);

els.btnImport.addEventListener('click', ()=>els.fileLog.click());
els.fileLog.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    await importLogsCSV(file);
    await showModal({title:'นำเข้าเสร็จ', body:'Import Logs สำเร็จ'});
    renderRecent();
  }catch(err){
    await showModal({title:'Import ไม่สำเร็จ', body: err?.message || String(err)});
  }finally{
    els.fileLog.value = '';
  }
});

els.btnClear.addEventListener('click', async ()=>{
  const ok = await showModal({title:'ล้าง Logs', body:'ต้องการล้าง Logs ของ “วันนี้” หรือไม่?', ask:true});
  if (!ok) return;
  if (cloudReady){
    await softClearTodayCloud();
    await showModal({title:'ล้างแล้ว', body:'ล้าง Logs ของวันนี้ (Cloud) เรียบร้อย'});
  } else {
    setLogs([]);
    renderRecent();
  }
});

els.btnSave.addEventListener('click', saveFlow);
els.btnRefresh.addEventListener('click', renderRecent);

// Enter flow
els.room.addEventListener('keydown', (e)=>{
  if (e.key === 'Enter'){ e.preventDefault(); els.guests.focus(); }
});
els.guests.addEventListener('keydown', (e)=>{
  if (e.key === 'Enter'){ e.preventDefault(); saveFlow(); }
});

async function saveFlow(){
  const room = normRoom(els.room.value);
  const guestsTxt = String(els.guests.value || '').trim();

  if (!room) { await showModal({title:'ข้อมูลไม่ครบ', body:'กรุณาใส่เลขห้อง'}); return; }
  if (!ROOM_RE.test(room)) { await showModal({title:'เลขห้องไม่ถูกต้อง', body:'ตัวอย่าง: A203, D610, 8224'}); return; }
  if (!/^[0-9]+$/.test(guestsTxt)) { await showModal({title:'จำนวนท่านไม่ถูกต้อง', body:'จำนวนท่านต้องเป็นตัวเลข'}); return; }

  const guests = parseInt(guestsTxt,10);
  if (guests <= 0 || guests > 20){ await showModal({title:'จำนวนท่านไม่ถูกต้อง', body:'จำนวนท่านต้องอยู่ระหว่าง 1-20'}); return; }

  const hasInh = !!inhMap;
  const inhFound = (hasInh && inhMap[room]) ? 'YES' : 'NO';
  const guestName = (hasInh && inhMap[room]) ? (inhMap[room].name || '-') : '-';
  const pkg = (hasInh && inhMap[room]) ? (inhMap[room].pkg || 'RB') : 'RB';
  const needPay = (pkg === 'RO') ? 'YES' : 'NO';

  const last = findLogToday(room);
  if (last){
    const ok = await showModal({title:'ห้องนี้เช็คอินแล้ว', body:`ชื่อ: ${guestName}\nห้อง: ${room}\nเวลา: ${last.DateTime}\nต้องการบันทึกซ้ำหรือไม่?`, ask:true});
    if (!ok) return;
  }

  if (!hasInh){
    const ok = await showModal({title:'ยังไม่ได้โหลด INH', body:'ต้องการบันทึกต่อหรือไม่?', ask:true});
    if (!ok) return;
  }

  if (needPay === 'YES'){
    await showModal({
      title:'RO - ต้องเก็บเงิน',
      body:`ชื่อ: ${guestName}\nห้อง: ${room}\nกรุณาเก็บเงินอาหารเช้าก่อนให้เข้าห้องอาหาร`,
      isRO:true
    });
  }

  if (cloudReady){
  const ok = await saveCheckinCloud({
    DateTime: nowISO(),
    Room: room,
    Guests: guests,
    GuestName: guestName,
    Package: (pkg === 'RO') ? 'RO' : 'RB',
    NeedPayment: needPay,
    InhFound: inhFound
  });
  if (!ok) return;
} else {
  const logs = getLogs();
  logs.push({
    DateTime: nowISO(),
    Room: room,
    Guests: guests,
    GuestName: guestName,
    Package: (pkg === 'RO') ? 'RO' : 'RB',
    NeedPayment: needPay,
    InhFound: inhFound
  });
  setLogs(logs);
}

  await showModal({title:'บันทึกแล้ว', body:`ชื่อ: ${guestName}\nห้อง: ${room}\nจำนวน: ${guests} ท่าน\nแพคเกจ: ${(pkg==='RO')?'RO':'RB'}`, isRO:(pkg==='RO')});

  els.room.value = '';
  els.guests.value = '';
  els.room.focus();
  renderRecent();
}

renderRecent();
