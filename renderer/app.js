const api = window.weekcal;

const state = {
  settings: null,
  extra: { desktopMode: true, reserveIconSpace: true, lockWidget: false, theme: 'dark' },
  connected: false,
  calendars: [],
  events: [],
  weekOffset: 0,
  busy: false,
  writeEnabled: false,
  eventColors: {},
  editorEvent: null,
  selectedColorId: '',
  resizeTimer: null,
};

const $ = (id) => document.getElementById(id);
const DAYS = ["lun","mar","mié","jue","vie","sáb","dom"];
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeek(offset = 0) {
  const d = new Date();
  d.setHours(0,0,0,0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 + offset * 7);
  return d;
}

function sameDay(a,b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmtTime(d) {
  return d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",hour12:false});
}

function dateInputValue(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function timeInputValue(date) {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function cleanBc2Description(value="") {
  return String(value).split(/\r?\n/).filter(line=>!/^\s*BC2-Color:\s*-?\d+\s*$/i.test(line)).join("\n").trim();
}

function hexToRgb(hex) {
  const value=String(hex||"").replace("#","");
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)];
}

function nearestEventColorId(hex) {
  const rgb=hexToRgb(hex);
  if (!rgb) return "";
  let best="", distance=Infinity;
  for (const [id,entry] of Object.entries(state.eventColors||{})) {
    const other=hexToRgb(entry.background);
    if (!other) continue;
    const d=(rgb[0]-other[0])**2+(rgb[1]-other[1])**2+(rgb[2]-other[2])**2;
    if (d<distance) { distance=d; best=id; }
  }
  return best;
}

function escapeHtml(value="") {
  return String(value).replace(/[&<>'"]/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
  }[ch]));
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function effectiveTheme() {
  if (state.extra.theme !== 'system') return state.extra.theme || 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  document.documentElement.dataset.theme = effectiveTheme();
  document.body.classList.toggle('desktop-mode', Boolean(state.extra.desktopMode));
}

function demoEvents(start) {
  const make = (day,h1,m1,h2,m2,title,color,location="") => ({
    id: Math.random().toString(36).slice(2),
    calendarId: 'Demo',
    calendarName: 'Demo',
    title,
    color,
    foreground: '#fff',
    start: new Date(start.getFullYear(),start.getMonth(),start.getDate()+day,h1,m1).toISOString(),
    end: new Date(start.getFullYear(),start.getMonth(),start.getDate()+day,h2,m2).toISOString(),
    allDay:false,
    location
  });
  return [
    make(0,13,0,14,0,"Robótica","#2874f0","Q3"),
    make(1,8,0,9,0,"Control","#087a1d","Q5"),
    make(1,12,0,13,0,"IA","#ef5b0c","AE2"),
    make(1,13,0,14,0,"Robótica","#2874f0","Q3"),
    make(1,14,0,15,0,"MovApps","#8424e8","AE2"),
    make(2,12,0,14,0,"Labo IA","#ff8f10","AE2"),
    make(2,15,0,17,0,"Labo Robótica","#2099ef","LM1"),
    make(3,9,0,11,0,"Labo Ctrl","#29995d","Y6"),
    make(3,12,0,13,0,"Examen","#e2232c"),
    make(3,14,0,15,0,"Lab MovApps","#9b30df","AE2"),
    make(4,8,0,9,0,"Control","#087a1d","Q5"),
    make(4,12,0,13,0,"IA","#ef5b0c","AE2"),
    make(4,13,0,14,0,"Robótica","#2874f0","Q3")
  ];
}

function layoutEvents(events) {
  const sorted = [...events].sort((a,b)=>new Date(a.start)-new Date(b.start));
  const groups=[]; let group=[], groupEnd=-Infinity;
  for (const ev of sorted) {
    const s=+new Date(ev.start), e=+new Date(ev.end);
    if (group.length && s>=groupEnd) { groups.push(group); group=[]; groupEnd=-Infinity; }
    group.push({ev,s,e,col:0});
    groupEnd=Math.max(groupEnd,e);
  }
  if (group.length) groups.push(group);

  const out=[];
  for (const g of groups) {
    const colEnds=[];
    for (const item of g) {
      let col=colEnds.findIndex(end=>end<=item.s);
      if (col<0) col=colEnds.length;
      colEnds[col]=item.e;
      item.col=col;
    }
    const count=Math.max(1,colEnds.length);
    for (const item of g) out.push({ev:item.ev,left:item.col*(100/count),width:100/count});
  }
  return out;
}

function render() {
  if (!state.settings) return;
  applyTheme();

  const grid=$("weekGrid");
  grid.innerHTML="";
  const s=state.settings;
  const days=Number(s.visibleDays||7);
  const week=startOfWeek(state.weekOffset);
  const end=addDays(week,days-1);
  const today=new Date();
  const focusDate = state.weekOffset === 0 ? today : week;

  $("monthTitle").textContent=MONTHS[focusDate.getMonth()];
  $("yearTitle").textContent=String(focusDate.getFullYear());
  const w1=isoWeek(week), w2=isoWeek(end);
  $("weekNumberLabel").textContent=w1===w2 ? `Semana ${w1}` : `Semanas ${w1}–${w2}`;

  const cols=`var(--time-w) repeat(${days}, minmax(0,1fr))`;

  const head=document.createElement("div");
  head.className="grid-head";
  head.style.gridTemplateColumns=cols;
  const corner=document.createElement("div");
  corner.className="corner";
  head.appendChild(corner);
  for (let i=0;i<days;i++) {
    const d=addDays(week,i);
    const el=document.createElement("div");
    const weekend=days===7 && i>=5;
    el.className="day-head"+(sameDay(d,today)?" today":"")+(weekend?" weekend":"");
    el.innerHTML=`<span class="day-name">${DAYS[i]}</span><span class="day-number">${d.getDate()}</span>`;
    head.appendChild(el);
  }
  grid.appendChild(head);

  const all=document.createElement("div");
  all.className="all-day-row";
  all.style.gridTemplateColumns=cols;
  const label=document.createElement("div");
  label.className="all-day-label";
  all.appendChild(label);
  for (let i=0;i<days;i++) {
    const d=addDays(week,i);
    const weekend=days===7 && i>=5;
    const cell=document.createElement("div");
    cell.className="all-day-cell"+(sameDay(d,today)?" today":"")+(weekend?" weekend":"");
    for (const ev of state.events.filter(e=>e.allDay && String(e.start).slice(0,10)===localDateKey(d))) {
      const item=document.createElement("div");
      item.className="all-day-event";
      item.textContent=ev.title;
      item.style.background=ev.color||"#6f7cff";
      item.style.color="#fff";
      item.title=ev.title;
      item.onclick=()=>openEventEditor(ev);
      cell.appendChild(item);
    }
    all.appendChild(cell);
  }
  grid.appendChild(all);

  const startHour=Number(s.dayStartHour ?? 8);
  const endHour=Number(s.dayEndHour ?? 23);
  const hours=Math.max(4,endHour-startHour);

  const gridRect=grid.getBoundingClientRect();
  const headH=head.getBoundingClientRect().height || 42;
  const allH=all.getBoundingClientRect().height || 34;
  const available=Math.max(150, gridRect.height-headH-allH);
  const hourHeight=available/hours;
  grid.style.setProperty("--hour-h",`${hourHeight}px`);

  const area=document.createElement("div");
  area.className="time-area";
  area.style.gridTemplateColumns=cols;
  area.style.height=`${available}px`;

  const timeCol=document.createElement("div");
  timeCol.className="time-col";
  for (let h=0;h<=hours;h++) {
    const y=h*hourHeight;
    if (h<hours) {
      const t=document.createElement("div");
      t.className="time-label";
      t.style.top=`${y+Math.min(14,hourHeight*.26)}px`;
      t.textContent=String(startHour+h).padStart(2,"0");
      timeCol.appendChild(t);
    }
    const line=document.createElement("div");
    line.className="hour-line";
    line.style.top=`${y}px`;
    timeCol.appendChild(line);
  }
  area.appendChild(timeCol);

  for (let i=0;i<days;i++) {
    const d=addDays(week,i);
    const weekend=days===7 && i>=5;
    const col=document.createElement("div");
    col.className="day-col"+(sameDay(d,today)?" today":"")+(weekend?" weekend":"");

    for (let h=0;h<=hours;h++) {
      const line=document.createElement("div");
      line.className="hour-line";
      line.style.top=`${h*hourHeight}px`;
      col.appendChild(line);
    }

    const timed=state.events.filter(ev=>!ev.allDay && sameDay(new Date(ev.start),d));
    for (const item of layoutEvents(timed)) {
      const ev=item.ev, st=new Date(ev.start), en=new Date(ev.end);
      const stMin=(st.getHours()-startHour)*60+st.getMinutes();
      const enMin=(en.getHours()-startHour)*60+en.getMinutes();
      if (enMin<=0 || stMin>=hours*60) continue;

      const top=Math.max(0,stMin)/60*hourHeight;
      const rawHeight=(Math.min(hours*60,enMin)-Math.max(0,stMin))/60*hourHeight;
      const height=Math.max(13,rawHeight-1);
      const card=document.createElement("div");
      card.className="event"+(height<27?" compact":"");
      card.style.top=`${top}px`;
      card.style.height=`${height}px`;
      card.style.left=`calc(${item.left}% + 1px)`;
      card.style.width=`calc(${item.width}% - 2px)`;
      card.style.background=ev.color||"#6f7cff";
      card.style.color="#fff";
      const second=ev.location ? `<div class="event-sub">${escapeHtml(ev.location)}</div>` : "";
      card.innerHTML=`<div class="event-title">${escapeHtml(ev.title)}</div>${second}`;
      card.title=`${ev.title}\n${fmtTime(st)}–${fmtTime(en)}${ev.location?"\n"+ev.location:""}${ev.calendarName?"\n"+ev.calendarName:""}`;
      card.onclick=()=>openEventEditor(ev);
      col.appendChild(card);
    }

    if (sameDay(d,today)) {
      const mins=(today.getHours()-startHour)*60+today.getMinutes();
      if (mins>=0 && mins<=hours*60) {
        const now=document.createElement("div");
        now.className="now-line";
        now.style.top=`${mins/60*hourHeight}px`;
        col.appendChild(now);
      }
    }
    area.appendChild(col);
  }
  grid.appendChild(area);
}

function renderCalendarChooser() {
  const host=$("calendarChooser");
  host.innerHTML="";
  const selected=new Set(state.settings.selectedCalendars?.length ? state.settings.selectedCalendars : state.calendars.filter(c=>c.selected).map(c=>c.id));
  for (const cal of state.calendars) {
    const row=document.createElement("label");
    row.className="calendar-item";
    const swatch=document.createElement("span");
    swatch.className="calendar-color";
    swatch.style.background=cal.backgroundColor;
    const name=document.createElement("span");
    name.className="calendar-name";
    name.textContent=cal.name;
    const box=document.createElement("input");
    box.type="checkbox";
    box.checked=selected.has(cal.id);
    box.dataset.id=cal.id;
    box.onchange=async()=>{
      const ids=[...host.querySelectorAll('input[type="checkbox"]')].filter(x=>x.checked).map(x=>x.dataset.id);
      state.settings=await api.setDisplay({selectedCalendars:ids});
      await refresh(true);
    };
    row.append(swatch,name,box);
    host.appendChild(row);
  }
}

function syncControls() {
  $("visibleDays").value=String(state.settings.visibleDays||7);
  $("dayStart").value=String(state.settings.dayStartHour ?? 8);
  $("dayEnd").value=String(state.settings.dayEndHour ?? 23);
  $("opacity").value=String(Math.round((state.settings.opacity||.97)*100));
  $("startupToggle").checked=Boolean(state.settings.startWithWindows);
  $("themeSelect").value=state.extra.theme||'dark';
  $("desktopModeToggle").checked=Boolean(state.extra.desktopMode);
  $("reserveIconSpaceToggle").checked=Boolean(state.extra.reserveIconSpace);
  $("reserveIconSpaceToggle").disabled=!state.extra.desktopMode;
  $("lockWidgetToggle").checked=Boolean(state.extra.lockWidget);
  applyTheme();
}

async function updateGoogleState() {
  const status=await api.googleStatus();
  state.connected=Boolean(status.connected);
  state.writeEnabled=Boolean(status.writeEnabled);
  $("googleDisconnected").classList.toggle("hidden",state.connected);
  $("googleConnected").classList.toggle("hidden",!state.connected);
  $("syncStatus").className=state.connected?"sync-status ok":"sync-status";
  $("syncText").textContent=state.connected?"Google":"Demo";
  if (state.connected) {
    try {
      state.calendars=await api.listCalendars();
      state.eventColors=await api.listEventColors();
      renderCalendarChooser();
    } catch (e) {
      toast("No se pudieron leer los calendarios: "+e.message);
    }
  } else {
    state.calendars=[];
    $("calendarChooser").innerHTML="";
  }
}

async function refresh(notify=false) {
  if (state.busy) return;
  state.busy=true;
  const week=startOfWeek(state.weekOffset);
  try {
    if (state.connected) {
      const ids=state.settings.selectedCalendars?.length ? state.settings.selectedCalendars : state.calendars.filter(c=>c.selected).map(c=>c.id);
      const data=await api.getEvents({timeMin:week.toISOString(),timeMax:addDays(week,7).toISOString(),calendarIds:ids});
      state.events=data.events||[];
      $("syncStatus").className="sync-status ok";
      $("syncText").textContent="Google";
      if (notify) toast("Calendario actualizado");
    } else {
      state.events=demoEvents(week);
    }
  } catch (e) {
    $("syncStatus").className="sync-status err";
    $("syncText").textContent="Error";
    toast(e.message||"Error al actualizar");
    if (!state.events.length) state.events=demoEvents(week);
  } finally {
    state.busy=false;
    render();
  }
}

function fillHourSelects() {
  for (let h=0;h<=24;h++) {
    const text=`${String(h).padStart(2,"0")}:00`;
    if (h<21) $("dayStart").add(new Option(text,h));
    if (h>=4) $("dayEnd").add(new Option(text,h));
  }
}

async function updateDisplay() {
  let start=Number($("dayStart").value), end=Number($("dayEnd").value);
  if (end<=start+3) {
    end=start+4;
    $("dayEnd").value=String(end);
  }
  state.settings=await api.setDisplay({
    visibleDays:Number($("visibleDays").value),
    dayStartHour:start,
    dayEndHour:end
  });
  render();
}

function writableCalendars() {
  return state.calendars.filter(c=>c.writable);
}

function renderEditorCalendars(selectedId="") {
  const select=$("eventCalendar");
  select.innerHTML="";
  const writable=writableCalendars();
  for (const cal of writable) {
    const opt=new Option(cal.name,cal.id);
    select.add(opt);
  }
  if (selectedId && writable.some(c=>c.id===selectedId)) select.value=selectedId;
  else if (writable.some(c=>c.primary)) select.value=writable.find(c=>c.primary).id;
}

function renderEventColorPalette(hex) {
  const host=$("eventColorPalette");
  host.innerHTML="";
  const sorted=Object.entries(state.eventColors||{}).sort((a,b)=>Number(a[0])-Number(b[0]));
  for (const [id,entry] of sorted) {
    const sw=document.createElement("button");
    sw.type="button";
    sw.className="event-color-swatch"+(id===state.selectedColorId?" selected":"");
    sw.style.background=entry.background;
    sw.title=entry.background;
    sw.onclick=()=>{
      state.selectedColorId=id;
      $("eventCustomColor").value=entry.background;
      renderEventColorPalette(entry.background);
    };
    host.appendChild(sw);
  }
}

function defaultEditorDate() {
  const week=startOfWeek(state.weekOffset);
  const today=new Date();
  if (today>=week && today<addDays(week,7)) return today;
  return week;
}

function openEventEditor(ev=null) {
  if (!state.connected) {
    toast("Conecta Google Calendar primero");
    toggleSettings(true);
    return;
  }
  const writable=writableCalendars();
  if (!writable.length) {
    toast("No hay un calendario con permiso de edición");
    return;
  }

  state.editorEvent=ev;
  $("eventEditorTitle").textContent=ev?"Editar evento":"Nuevo evento";
  $("eventEditorSubtitle").textContent=ev?"Los cambios se sincronizan con Google Calendar":"Se guardará directamente en Google Calendar";
  $("eventDeleteBtn").classList.toggle("hidden",!ev);
  $("eventWriteNotice").classList.toggle("hidden",state.writeEnabled);

  renderEditorCalendars(ev?.calendarId||"");

  const base=ev?(ev.allDay?new Date(String(ev.start).slice(0,10)+"T12:00:00"):new Date(ev.start)):defaultEditorDate();
  const start=ev?new Date(ev.start):new Date(base.getFullYear(),base.getMonth(),base.getDate(),9,0);
  const end=ev?new Date(ev.end):new Date(base.getFullYear(),base.getMonth(),base.getDate(),10,0);

  $("eventTitle").value=ev?.title||"";
  $("eventDate").value=dateInputValue(base);
  $("eventAllDay").checked=Boolean(ev?.allDay);
  $("eventStartTime").value=timeInputValue(start);
  $("eventEndTime").value=timeInputValue(end);
  $("eventLocation").value=ev?.location||"";
  $("eventDescription").value=cleanBc2Description(ev?.description||"");
  $("eventRepeat").value="none";
  $("eventRepeat").disabled=Boolean(ev);
  $("eventReminder").value="default";
  $("eventTimeRow").classList.toggle("hidden",$("eventAllDay").checked);

  const defaultHex=ev?.color||writable.find(c=>c.id===$("eventCalendar").value)?.backgroundColor||"#1367FB";
  $("eventCustomColor").value=defaultHex;
  state.selectedColorId=ev?.colorId||nearestEventColorId(defaultHex);
  renderEventColorPalette(defaultHex);

  $("eventModal").classList.remove("hidden");
  $("eventModal").setAttribute("aria-hidden","false");
  setTimeout(()=>$("eventTitle").focus(),30);
}

function closeEventEditor() {
  $("eventModal").classList.add("hidden");
  $("eventModal").setAttribute("aria-hidden","true");
  state.editorEvent=null;
}

async function ensureWriteAccess() {
  if (state.writeEnabled) return true;
  $("eventWriteNotice").classList.remove("hidden");
  toast("Autoriza edición de Google Calendar una sola vez…");
  try {
    const result=await api.googleAuthorizeWrite();
    if (!result?.connected) return false;
    await updateGoogleState();
    $("eventWriteNotice").classList.add("hidden");
    return true;
  } catch(e) {
    toast("No se pudo activar edición: "+e.message);
    return false;
  }
}

function eventPayload() {
  const allDay=$("eventAllDay").checked;
  const start=$("eventStartTime").value||"09:00";
  let end=$("eventEndTime").value||"10:00";
  if (!allDay && end<=start) {
    const [h,m]=start.split(":").map(Number);
    const mins=h*60+m+60;
    end=`${String(Math.floor(mins/60)%24).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`;
    $("eventEndTime").value=end;
  }
  const colorHex=$("eventCustomColor").value;
  return {
    id:state.editorEvent?.id||"",
    calendarId:$("eventCalendar").value,
    title:$("eventTitle").value.trim(),
    date:$("eventDate").value,
    allDay,
    startTime:start,
    endTime:end,
    location:$("eventLocation").value.trim(),
    description:$("eventDescription").value.trim(),
    repeat:$("eventRepeat").value,
    reminder:$("eventReminder").value,
    colorHex,
    colorId:nearestEventColorId(colorHex)
  };
}

async function saveEditorEvent() {
  const payload=eventPayload();
  if (!payload.title) { toast("Escribe el nombre de la actividad"); $("eventTitle").focus(); return; }
  if (!payload.date) { toast("Selecciona una fecha"); return; }
  if (!await ensureWriteAccess()) return;

  $("eventSaveBtn").disabled=true;
  $("eventSaveBtn").textContent="Guardando…";
  try {
    const wasEditing=Boolean(state.editorEvent);
    if (wasEditing) await api.updateEvent(payload);
    else await api.createEvent(payload);
    closeEventEditor();
    await refresh(false);
    toast(wasEditing?"Evento actualizado":"Evento creado");
  } catch(e) {
    if (String(e.message).includes("WRITE_AUTH_REQUIRED")) {
      state.writeEnabled=false;
      if (await ensureWriteAccess()) return saveEditorEvent();
    }
    toast("No se pudo guardar: "+e.message);
  } finally {
    $("eventSaveBtn").disabled=false;
    $("eventSaveBtn").textContent="Guardar";
  }
}

async function deleteEditorEvent() {
  if (!state.editorEvent) return;
  if (!await ensureWriteAccess()) return;
  if (!confirm(`¿Eliminar “${state.editorEvent.title}”?`)) return;
  try {
    await api.deleteEvent({id:state.editorEvent.id,calendarId:state.editorEvent.calendarId});
    closeEventEditor();
    await refresh(false);
    toast("Evento eliminado");
  } catch(e) {
    toast("No se pudo eliminar: "+e.message);
  }
}

function toggleSettings(open) {
  $("settingsPanel").classList.toggle("open",open);
  $("settingsPanel").setAttribute("aria-hidden",String(!open));
}

function toast(msg) {
  const t=$("toast");
  t.textContent=msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove("show"),2600);
}

function bindUI() {
  $("prevWeek").onclick=()=>{state.weekOffset--;refresh(false);};
  $("nextWeek").onclick=()=>{state.weekOffset++;refresh(false);};
  $("todayBtn").onclick=()=>{state.weekOffset=0;refresh(false);};
  $("refreshBtn").onclick=()=>refresh(true);
  $("addEventBtn").onclick=()=>openEventEditor();
  $("settingsBtn").onclick=()=>toggleSettings(true);
  $("settingsClose").onclick=()=>toggleSettings(false);
  $("eventEditorClose").onclick=closeEventEditor;
  $("eventCancelBtn").onclick=closeEventEditor;
  $("eventSaveBtn").onclick=saveEditorEvent;
  $("eventDeleteBtn").onclick=deleteEditorEvent;
  $("eventAllDay").onchange=(e)=>$("eventTimeRow").classList.toggle("hidden",e.target.checked);
  $("eventCustomColor").oninput=(e)=>{
    state.selectedColorId=nearestEventColorId(e.target.value);
    renderEventColorPalette(e.target.value);
  };
  $("eventModal").onclick=(e)=>{ if(e.target===$("eventModal")) closeEventEditor(); };
  $("minBtn").onclick=()=>api.minimize();
  $("closeBtn").onclick=()=>api.close();

  $("themeSelect").onchange=async(e)=>{
    state.extra=await api.setTheme(e.target.value);
    applyTheme();
    render();
  };
  $("desktopModeToggle").onchange=async(e)=>{
    const response=await api.setDesktopMode(e.target.checked);
    state.extra=response.settings||state.extra;
    syncControls();
    toast(response.result?.ok===false ? `No se pudo fijar: ${response.result.error}` : (e.target.checked?"Widget fijado al escritorio":"Modo ventana activado"));
  };
  $("reserveIconSpaceToggle").onchange=async(e)=>{
    const response=await api.setReserveIconSpace(e.target.checked);
    state.extra=response.settings||state.extra;
    syncControls();
    if (response.result?.ok===false) {
      toast("No se pudieron acomodar los iconos: "+response.result.error);
    } else {
      const moved=response.result?.moved;
      toast(e.target.checked ? (Number.isFinite(moved) ? `Iconos acomodados: ${moved}` : "Espacio reservado para WeekCal") : "Posiciones de iconos restauradas");
    }
  };
  $("lockWidgetToggle").onchange=async(e)=>{
    state.extra=await api.setLock(e.target.checked);
    syncControls();
    toast(e.target.checked?"Posición y tamaño bloqueados":"Widget desbloqueado");
  };
  $("startupToggle").onchange=async(e)=>{state.settings=await api.setStartup(e.target.checked);};
  $("opacity").oninput=async(e)=>{state.settings=await api.setOpacity(Number(e.target.value)/100);};
  $("visibleDays").onchange=updateDisplay;
  $("dayStart").onchange=updateDisplay;
  $("dayEnd").onchange=updateDisplay;

  $("connectGoogle").onclick=async()=>{
    try {
      toast("Selecciona tus credenciales OAuth de Google…");
      const result=await api.googleConnect();
      if (!result?.canceled) {
        await updateGoogleState();
        await refresh(true);
      }
    } catch(e) { toast("No se pudo conectar: "+e.message); }
  };

  $("disconnectGoogle").onclick=async()=>{
    await api.googleDisconnect();
    state.events=[];
    await updateGoogleState();
    await refresh(false);
  };

  window.addEventListener("resize",()=>{
    clearTimeout(state.resizeTimer);
    state.resizeTimer=setTimeout(render,70);
  });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{
    if (state.extra.theme==='system') { applyTheme(); render(); }
  });
}

async function init() {
  state.settings=await api.getSettings();
  try { state.extra=await api.getExtraSettings(); } catch {}
  fillHourSelects();
  syncControls();
  bindUI();
  await updateGoogleState();
  await refresh(false);
  setInterval(()=>refresh(false),5*60*1000);
  setInterval(render,60*1000);
}

document.addEventListener("DOMContentLoaded",init);
