const api = window.weekcal;

const state = {
  settings: null,
  connected: false,
  calendars: [],
  events: [],
  weekOffset: 0,
  busy: false,
};

const $ = (id) => document.getElementById(id);
const DAYS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
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

function escapeHtml(value="") {
  return String(value).replace(/[&<>'"]/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
  }[ch]));
}

function isLight(hex="#666666") {
  const h = hex.replace("#","");
  if (h.length !== 6) return false;
  const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  return (r*299 + g*587 + b*114)/1000 > 165;
}

function demoEvents(start) {
  const make = (day,h1,m1,h2,m2,title,color,calendarName) => ({
    id: Math.random().toString(36).slice(2),
    calendarId: calendarName,
    calendarName,
    title,
    color,
    foreground: isLight(color) ? "#171717" : "#fff",
    start: new Date(start.getFullYear(),start.getMonth(),start.getDate()+day,h1,m1).toISOString(),
    end: new Date(start.getFullYear(),start.getMonth(),start.getDate()+day,h2,m2).toISOString(),
    allDay:false
  });
  return [
    make(0,8,0,9,20,"Anatomía","#3d7cff","Trabajo"),
    make(0,11,30,12,40,"Planeación semanal","#905ff7","Trabajo"),
    make(1,7,30,8,20,"Gimnasio","#ff5b55","Deportes"),
    make(1,10,0,12,0,"Epidemiología","#21b67a","Trabajo"),
    make(2,9,0,10,30,"Premedicina EXANI-II","#2e73df","Trabajo"),
    make(3,8,0,9,30,"Técnicas Clínicas","#f0a53c","Trabajo"),
    make(4,9,0,11,0,"Preparar material","#4cb56e","Trabajo"),
    make(5,8,0,12,0,"English class","#2e78e8","Trabajo"),
    make(6,10,0,11,30,"Deporte","#ef5350","Deportes")
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
  const grid=$("weekGrid");
  grid.innerHTML="";
  const s=state.settings;
  const days=Number(s.visibleDays||7);
  const week=startOfWeek(state.weekOffset);
  const end=addDays(week,days-1);
  const today=new Date();

  $("weekLabel").textContent =
    `${week.getDate()} ${MONTHS[week.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;

  const cols=`72px repeat(${days}, minmax(112px,1fr))`;

  const head=document.createElement("div");
  head.className="grid-head";
  head.style.gridTemplateColumns=cols;
  const corner=document.createElement("div");
  corner.className="corner";
  head.appendChild(corner);
  for (let i=0;i<days;i++) {
    const d=addDays(week,i);
    const el=document.createElement("div");
    el.className="day-head"+(sameDay(d,today)?" today":"");
    el.innerHTML=`<div class="day-name">${DAYS[i]}</div><div class="day-number">${d.getDate()}</div><div class="day-month">${MONTHS[d.getMonth()]}</div>`;
    head.appendChild(el);
  }
  grid.appendChild(head);

  const all=document.createElement("div");
  all.className="all-day-row";
  all.style.gridTemplateColumns=cols;
  const label=document.createElement("div");
  label.className="all-day-label";
  label.textContent="Todo el día";
  all.appendChild(label);
  for (let i=0;i<days;i++) {
    const d=addDays(week,i);
    const cell=document.createElement("div");
    cell.className="all-day-cell";
    for (const ev of state.events.filter(e=>e.allDay && String(e.start).slice(0,10)===localDateKey(d))) {
      const item=document.createElement("div");
      item.className="all-day-event";
      item.textContent=ev.title;
      item.style.background=ev.color||"#6f7cff";
      item.style.color=ev.foreground||"#fff";
      if (ev.htmlLink) item.onclick=()=>api.openLink(ev.htmlLink);
      cell.appendChild(item);
    }
    all.appendChild(cell);
  }
  grid.appendChild(all);

  const startHour=Number(s.dayStartHour ?? 6);
  const endHour=Number(s.dayEndHour ?? 23);
  const hours=Math.max(4,endHour-startHour);

  const area=document.createElement("div");
  area.className="time-area";
  area.style.gridTemplateColumns=cols;
  area.style.height=`${hours*54}px`;

  const timeCol=document.createElement("div");
  timeCol.className="time-col";
  for (let h=0;h<=hours;h++) {
    const y=h*54;
    const t=document.createElement("div");
    t.className="time-label";
    t.style.top=`${y}px`;
    t.textContent=`${String(startHour+h).padStart(2,"0")}:00`;
    timeCol.appendChild(t);
    const line=document.createElement("div");
    line.className="hour-line";
    line.style.top=`${y}px`;
    timeCol.appendChild(line);
  }
  area.appendChild(timeCol);

  for (let i=0;i<days;i++) {
    const d=addDays(week,i);
    const col=document.createElement("div");
    col.className="day-col"+(sameDay(d,today)?" today":"");

    for (let h=0;h<=hours;h++) {
      const line=document.createElement("div");
      line.className="hour-line";
      line.style.top=`${h*54}px`;
      col.appendChild(line);
      if (h<hours) {
        const half=document.createElement("div");
        half.className="half-line";
        half.style.top=`${h*54+27}px`;
        col.appendChild(half);
      }
    }

    const timed=state.events.filter(ev=>!ev.allDay && sameDay(new Date(ev.start),d));
    for (const item of layoutEvents(timed)) {
      const ev=item.ev, st=new Date(ev.start), en=new Date(ev.end);
      const stMin=(st.getHours()-startHour)*60+st.getMinutes();
      const enMin=(en.getHours()-startHour)*60+en.getMinutes();
      if (enMin<=0 || stMin>=hours*60) continue;

      const top=Math.max(0,stMin)/60*54;
      const height=Math.max(22,(Math.min(hours*60,enMin)-Math.max(0,stMin))/60*54-2);
      const card=document.createElement("div");
      card.className="event";
      card.style.top=`${top}px`;
      card.style.height=`${height}px`;
      card.style.left=`calc(${item.left}% + 4px)`;
      card.style.width=`calc(${item.width}% - 8px)`;
      card.style.right="auto";
      card.style.background=ev.color||"#6f7cff";
      card.style.color=ev.foreground||(isLight(ev.color)?"#171717":"#fff");
      card.innerHTML=`<div class="event-title">${escapeHtml(ev.title)}</div><div class="event-time">${fmtTime(st)}–${fmtTime(en)}</div>${ev.location?`<div class="event-location">${escapeHtml(ev.location)}</div>`:""}`;
      card.title=`${ev.title}\n${fmtTime(st)}–${fmtTime(en)}${ev.calendarName?"\n"+ev.calendarName:""}`;
      if (ev.htmlLink) card.onclick=()=>api.openLink(ev.htmlLink);
      col.appendChild(card);
    }

    if (sameDay(d,today)) {
      const mins=(today.getHours()-startHour)*60+today.getMinutes();
      if (mins>=0 && mins<=hours*60) {
        const now=document.createElement("div");
        now.className="now-line";
        now.style.top=`${mins/60*54}px`;
        now.style.left="0";
        now.style.right="0";
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
  $("dayStart").value=String(state.settings.dayStartHour ?? 6);
  $("dayEnd").value=String(state.settings.dayEndHour ?? 23);
  $("opacity").value=String(Math.round((state.settings.opacity||.97)*100));
  $("startupToggle").checked=Boolean(state.settings.startWithWindows);
  $("pinToggle").checked=Boolean(state.settings.alwaysOnTop);
}

async function updateGoogleState() {
  const status=await api.googleStatus();
  state.connected=Boolean(status.connected);
  $("googleDisconnected").classList.toggle("hidden",state.connected);
  $("googleConnected").classList.toggle("hidden",!state.connected);
  $("syncStatus").className=state.connected?"sync-status ok":"sync-status";
  $("syncText").textContent=state.connected?"Google":"Demo";
  if (state.connected) {
    try {
      state.calendars=await api.listCalendars();
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
  $("settingsBtn").onclick=()=>toggleSettings(true);
  $("settingsClose").onclick=()=>toggleSettings(false);
  $("minBtn").onclick=()=>api.minimize();
  $("closeBtn").onclick=()=>api.close();

  $("pinBtn").onclick=async()=>{
    state.settings=await api.setPin(!state.settings.alwaysOnTop);
    syncControls();
  };
  $("pinToggle").onchange=async(e)=>{
    state.settings=await api.setPin(e.target.checked);
    syncControls();
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
      if (!result?.cancelled) {
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
}

async function init() {
  state.settings=await api.getSettings();
  fillHourSelects();
  syncControls();
  bindUI();
  await updateGoogleState();
  await refresh(false);
  setInterval(()=>refresh(false),5*60*1000);
  setInterval(render,60*1000);
}

document.addEventListener("DOMContentLoaded",init);
