'use strict';
let cloudClient, cloudActor, cloudSession, cloudBusy = false, cloudRequest = 0;
let cloudNoteRevision = 0, cloudSettingsRevision = 0, cloudEditWeek = null;
let cloudShiftRevisions = new Map();
let cloudLoadedWeek = null;
let cloudCapacity=[],cloudIncoming=[],cloudRule=null, cloudTransfers=[],cloudPool=[],cloudServerOffset=0;
let cloudDeadline=null,cloudInbox={items:[],unread:0},withdrawalContext=null,modalReturnFocus=null;
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function cloudStatus(message, error=false) {
  if(window.heidersDemoActive)message='TESTMODUS · '+message;
  const el = document.getElementById('syncStatus');
  el.textContent = message;
  el.style.color = error ? '#b91c1c' : '#554D47';
}
function cloudError(error) {
  if (error?.code === '40001') return 'Zwischenzeitlich geändert. Bitte neu prüfen und erneut speichern.';
  if (error?.code === '23505') return 'Du bist bereits eingetragen oder hast diese Schicht schon beantwortet.';
  if (error?.code === '22023') return error.message || 'Bitte Eingabe prüfen.';
  if (error?.code === '42501') return 'Du hast für diese Änderung keine Berechtigung.';
  return navigator.onLine ? 'Verbindung oder Berechtigung prüfen. Die Änderung wurde nicht bestätigt.' : 'Offline – Änderungen können gerade nicht gespeichert werden.';
}
function cloudBlankWeek() {
  return {events:{},resTag:{},resAbend:{},soll:{mo:{tag:0,abend:0},di:{tag:2,abend:3},mi:{tag:2,abend:3},do:{tag:2,abend:2},fr:{tag:2,abend:3},sa:{tag:2,abend:3},so:{tag:0,abend:0}},note:'',shiftSources:Object.create(null),shifts:Object.create(null),noteRevision:0,settingsRevision:0};
}
function cloudClear() {
  cloudRequest++;cloudLoadedWeek=null;cloudDeadline=null;cloudInbox={items:[],unread:0};cloudTransfers=[];cloudIncoming=[];cloudCapacity=[];cloudPool=[];cloudRule=null;closeWithdrawal();closeInbox();closeTransfer();closeEmployees();closeAdminAssignment();
  cloudActor=null; cloudSession=null; currentUser=null; team=[]; db={}; cloudShiftRevisions.clear();
  document.getElementById('appMain').hidden=true;
  document.getElementById('adminUserSelectWrapper').classList.add('hidden');
  document.getElementById('userBadgeName').textContent='Abgemeldet';document.getElementById('accountMenu').open=false;document.getElementById('accountDetails').textContent='Nicht angemeldet';
  document.getElementById('loginModal').classList.remove('hidden');
  closeSollModal(); document.getElementById('noteEditBox').classList.add('hidden');
}
async function cloudSync() {
  if (!cloudSession || cloudBusy) return;
  const request=++cloudRequest, sessionId=cloudSession.user.id, week=getWeekKey(currentWeekStart);
  if (!navigator.onLine) {cloudStatus('Offline – der angezeigte Plan kann veraltet sein.',true);return;}
  try {
    const profileResult=await cloudClient.from('profiles').select('id,name,job_role,is_admin,active,auth_user_id').order('name');
    if(profileResult.error)throw profileResult.error;
    const actor=profileResult.data.find(p=>(p.auth_user_id===sessionId||(window.heidersDemoActive&&!p.auth_user_id&&p.id===sessionId))&&p.active);
    if(!actor){if(request===cloudRequest&&cloudSession?.user.id===sessionId){cloudClear();document.getElementById('loginError').textContent='Dein Konto wurde noch keinem aktiven Teamprofil zugeordnet.';}return;}
    const results=await Promise.all([
      Promise.resolve(profileResult),
      cloudClient.from('shifts').select('*').eq('week',week),
      cloudClient.from('week_settings').select('*').eq('week',week).maybeSingle(),
      cloudClient.rpc('get_reply_deadline',{p_week:week}),
      cloudClient.rpc('get_notifications'),
      cloudClient.from('shift_transfers').select('*').eq('week',week).order('created_at',{ascending:false}),
      cloudClient.from('springer_pool').select('*').eq('week',week),
      cloudClient.rpc('get_change_rule',{p_week:week}),
      cloudClient.from('shift_transfers').select('*').eq('taker_id',actor.id).eq('status','pending').order('created_at',{ascending:false}),
      cloudClient.rpc('get_capacity_alerts',{p_week:week})
    ]);
    for (const r of results) if(r.error) throw r.error;
    if (request !== cloudRequest || !cloudSession || cloudSession.user.id !== sessionId) return;
    const profiles=results[0].data;
    cloudActor=actor;
    if(!cloudActor) {cloudClear();document.getElementById('loginError').textContent='Dein Konto wurde noch keinem aktiven Teamprofil zugeordnet.';return;}
    team=profiles.filter(p=>p.active).map(p=>({id:p.id,name:p.name,role:p.job_role,isAdmin:p.is_admin,hasLogin:!!p.auth_user_id||!!window.heidersDemoActive}));
    if (!cloudActor.is_admin || !team.some(p=>p.name===currentUser)) currentUser=cloudActor.name;
    const data=cloudBlankWeek(), settings=results[2].data;
    if(settings) Object.assign(data,{note:settings.note,soll:settings.requirements,resTag:settings.reservations_day,resAbend:settings.reservations_evening,noteRevision:settings.note_revision,settingsRevision:settings.settings_revision});
    const revisions=new Map();
    for(const row of results[1].data) {
      const person=team.find(p=>p.id===row.user_id); if(!person) continue;
      data.shifts[person.name] ??= {};
      data.shifts[person.name][row.day] ??= {tag:'-',abend:'-'};
      data.shifts[person.name][row.day][row.period]=row.value;
      data.shiftSources[person.name]??={};data.shiftSources[person.name][row.day]??={};data.shiftSources[person.name][row.day][row.period]={text:row.source_text||'',task:row.special_task||''};
      revisions.set([week,row.user_id,row.day,row.period].join('|'),row.revision);
    }
    db[week]=data; cloudShiftRevisions=revisions;cloudLoadedWeek=week;cloudDeadline=results[3].data;cloudInbox=results[4].data;cloudTransfers=results[5].data;cloudPool=results[6].data;cloudRule=results[7].data;cloudIncoming=results[8].data;cloudCapacity=results[9].data.alerts||[];cloudServerOffset=new Date(cloudRule.server_now).getTime()-Date.now();
    const scroll=document.getElementById('weekTableScroll');
    const scrollTop=scroll.scrollTop,scrollLeft=scroll.scrollLeft;
    setupUserInterface();renderApp();renderDeadline();renderInbox();
    scroll.scrollTop=scrollTop;scroll.scrollLeft=scrollLeft;
    document.getElementById('appMain').hidden=false;
    document.getElementById('loginModal').classList.add('hidden');
    cloudStatus('Synchronisiert · '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}));
  } catch(error) {if(request===cloudRequest) cloudStatus('Plan konnte nicht aktualisiert werden. '+cloudError(error),true);}
}
async function cloudWrite(name,args,onSuccess) {
  if(!cloudSession || !cloudActor) return;
  if(cloudLoadedWeek!==getWeekKey(currentWeekStart)){cloudStatus('Bitte warten, bis der Plan geladen wurde.',true);return;}
  if(cloudBusy) {cloudStatus('Speicherung läuft – bitte kurz warten.');return;}
  if(!navigator.onLine) {cloudStatus(cloudError({}),true);return;}
  cloudBusy=true;cloudRequest++;cloudStatus('Wird gespeichert …');
  let saved=false;
  try {
    const {data,error}=await cloudClient.rpc(name,args);
    if(error) throw error;
    saved=true;if(onSuccess) onSuccess(data);
  } catch(error) {cloudStatus('Speicherung nicht bestätigt. '+cloudError(error),true);}
  finally {cloudBusy=false;}
  // Nach Konflikten Daten aktualisieren, aber den Hinweis beibehalten.
  const message=document.getElementById('syncStatus').textContent;
  await cloudSync();
  if(!saved) cloudStatus(message,true);
  return saved;
}
async function cloudInit() {
  if(location.hash==='#test' || sessionStorage.getItem('heiders_test_active')==='1'){await startDemo();return;}
  cloudClear();switchTab('cards');
  document.getElementById('rememberLogin').checked=localStorage.getItem('heiders_auth_remember')!=='0';
  const config=window.HEIDERS_CONFIG || {};
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || '') || !config.publishableKey) {
    document.getElementById('loginError').textContent='Die App wird noch eingerichtet. Projektadresse und öffentlicher Schlüssel fehlen.';
    document.getElementById('loginSubmit').disabled=true;
    return;
  }
  let secretKey=config.publishableKey.startsWith('sb_secret_');
  if(config.publishableKey.startsWith('eyJ')) {
    try {
      const part=config.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      secretKey=JSON.parse(atob(part)).role!=='anon';
    } catch(_) {secretKey=true;}
  }
  if(secretKey) {document.getElementById('loginError').textContent='Falscher Schlüsseltyp in config.js.';return;}
  cloudClient=supabase.createClient(config.supabaseUrl,config.publishableKey,{auth:{storageKey:'heiders_cloud_auth',storage:cloudAuthStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const {data,error}=await cloudClient.auth.getSession();
  if(error) {document.getElementById('loginError').textContent='Die Anmeldung konnte nicht wiederhergestellt werden.';return;}
  cloudSession=data.session;
  cloudClient.auth.onAuthStateChange((event,session)=>{
    if(window.heidersDemoActive)return;
    if(event==='SIGNED_OUT') cloudClear();
    else {cloudSession=session; if(event==='SIGNED_IN') setTimeout(cloudSync,0);}
  });
  if(cloudSession) await cloudSync();
  setInterval(()=>{if(!document.hidden) cloudSync();},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) cloudSync();});
  window.addEventListener('online',cloudSync);
  window.addEventListener('offline',()=>cloudStatus('Offline – Änderungen können gerade nicht gespeichert werden.',true));
}
async function confirmUserChoice() {
  if(!cloudClient) return;
  const button=document.getElementById('loginSubmit'), errorEl=document.getElementById('loginError');
  button.disabled=true;errorEl.textContent='';
  try {
    const remember=document.getElementById('rememberLogin').checked;localStorage.setItem('heiders_auth_remember',remember?'1':'0');
    if(remember)sessionStorage.removeItem('heiders_cloud_auth');else localStorage.removeItem('heiders_cloud_auth');
    const {data,error}=await cloudClient.auth.signInWithPassword({email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value});
    if(error) throw error;
    cloudSession=data.session;document.getElementById('loginPassword').value='';await cloudSync();
  } catch(_) {errorEl.textContent='Anmeldung fehlgeschlagen. Bitte E-Mail, Passwort und Internetverbindung prüfen.';}
  finally {button.disabled=false;}
}
async function resetUserChoice() {
  if(window.heidersDemoActive){exitDemo();return;}
  if(cloudBusy) {cloudStatus('Bitte zuerst die Speicherung abwarten.');return;}
  if(!cloudClient) return;
  await cloudClient.auth.signOut({scope:'local'});cloudClear();
}
function setupUserInterface() {
  const admin=!!cloudActor?.is_admin;
  for(const id of ['adminAssignmentButton','demandEditButton','reservationEditButton','employeesButton'])document.getElementById(id).hidden=!admin;
  document.getElementById('userBadgeName').textContent=cloudActor?.name || 'Abgemeldet';
  document.getElementById('accountDetails').textContent=(window.heidersDemoActive?'Testmodus · ': '')+(admin?'Admin':'Teammitglied')+(cloudSession?.user.email?' · '+cloudSession.user.email:'');
  document.getElementById('currentUserDisplay').textContent=currentUser;
  document.getElementById('noteEditButton').hidden=!admin;
  document.getElementById('adminControls').classList.toggle('hidden',!admin);
  document.getElementById('adminUserSelectWrapper').classList.toggle('hidden',!admin);
  if(admin) document.getElementById('userSelect').innerHTML=team.map(p=>`<option value="${escapeHtml(p.name)}" ${p.name===currentUser?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
}
function changeUser(name) {
  if(!cloudActor?.is_admin || !team.some(p=>p.name===name)) return;
  currentUser=name;setupUserInterface();if(db[getWeekKey(currentWeekStart)])renderApp();
}
function getWeekKey(date) {
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function loadWeekData() {const week=getWeekKey(currentWeekStart);db[week] ??= cloudBlankWeek();}
function saveDB() {throw new Error('Lokales Speichern ist in der gemeinsamen App deaktiviert.');}
async function changeWeek(direction) {
  if(cloudBusy) return;
  closeSollModal();closeWithdrawal();document.getElementById('noteEditBox').classList.add('hidden');
  currentWeekStart.setDate(currentWeekStart.getDate()+direction*7);
  cloudLoadedWeek=null;cloudDeadline=null;cloudRule=null;loadWeekData();renderApp();cloudStatus('Plan wird geladen …');await cloudSync();
  // Navigation bleibt auch bei Verbindungsfehler sichtbar; bereits geladene Woche wird als veraltet markiert.
  if(db[getWeekKey(currentWeekStart)]) {renderApp();document.getElementById('appMain').hidden=false;}
}
function quickClaim(day,period) {
 selectFocusDay(day);switchTab('cards');cloudStatus('Bitte Service/Theke oder Küche für die Eintragung auswählen.');
}
async function updateShift(day,period,value) {
  const person=team.find(p=>p.name===currentUser),week=getWeekKey(currentWeekStart);
  if(!person) return;
  if(isShiftLocked(week,day,period)){cloudStatus(shiftLockText(week,day),true);return;}
  const old=db[week]?.shifts[currentUser]?.[day]?.[period] || '-';
  if(old==='offen'&&['se','kü'].includes(value))return confirmShiftRole(person.id,day,period,value);
  if(isScheduled(old) && value!==old) return openWithdrawal(day,period);
  if(value===old && shiftAnswered(week,person.id,day,period)) {cloudStatus('Bereits eingetragen oder beantwortet.');return;}
  const saved=await cloudWrite('save_shift',{p_week:week,p_user:person.id,p_day:day,p_period:period,p_value:value,p_revision:cloudShiftRevisions.get([week,person.id,day,period].join('|')) || 0});
  if(saved&&isScheduled(value)&&db[week]?.shifts[person.name]?.[day]?.[period]!==value)cloudStatus('Nicht eingetragen: Bedarf bereits gedeckt. Pia und Nelly wurden zur Prüfung informiert.',true);
  return saved;
}
const legacyToggleNoteEdit=toggleNoteEdit;
toggleNoteEdit=function() {
  if(!cloudActor?.is_admin) return;
  const week=getWeekKey(currentWeekStart);cloudEditWeek=week;cloudNoteRevision=db[week]?.noteRevision || 0;
  legacyToggleNoteEdit();
};
function saveWeekNote() {
  if(!cloudActor?.is_admin || cloudEditWeek!==getWeekKey(currentWeekStart))return;
  return cloudWrite('save_week_note',{p_week:cloudEditWeek,p_note:document.getElementById('noteInput').value,p_revision:cloudNoteRevision},()=>document.getElementById('noteEditBox').classList.add('hidden'));
}
const legacyOpenSollModal=openSollModal;
openSollModal=function() {
  if(!cloudActor?.is_admin) return;
  const week=getWeekKey(currentWeekStart);cloudEditWeek=week;cloudSettingsRevision=db[week]?.settingsRevision || 0;
  legacyOpenSollModal();
};
function saveSollSettings() {
 if(!cloudActor?.is_admin||cloudEditWeek!==getWeekKey(currentWeekStart)||!settingsSnapshot)return;
 const requirements=structuredClone(settingsSnapshot.soll),day={...settingsSnapshot.resTag},evening={...settingsSnapshot.resAbend};
 for(const d of daysOfWeek){
 if(settingsMode==='bedarf'){
 requirements[d.key]={};for(const period of ['tag','abend']){
 const input=document.getElementById(`soll_${d.key}_${period}`),value=Number(input.value);
 if(input.value.trim()===''||!Number.isInteger(value)||value<0||value>50){cloudStatus('Personalbedarf muss eine ganze Zahl zwischen 0 und 50 sein.',true);input.focus();return;}
 requirements[d.key][period]=value;
 }
 }else{
 day[d.key]=document.getElementById(`res_${d.key}_tag`).value;evening[d.key]=document.getElementById(`res_${d.key}_abend`).value;
 if(day[d.key].length>300||evening[d.key].length>300){cloudStatus('Reservierungstext ist zu lang (maximal 300 Zeichen).',true);return;}
 }
 }
 return cloudWrite('save_week_settings',{p_week:cloudEditWeek,p_requirements:requirements,p_day:day,p_evening:evening,p_revision:cloudSettingsRevision},closeSollModal);
}
window.onload=()=>cloudInit().catch(()=>cloudStatus('App konnte nicht geladen werden. Bitte erneut öffnen.',true));

function isScheduled(value) {return ['se','kü','th','offen'].includes(value);}
function shiftRoleLabel(value) {return ({offen:'Aufgabe noch offen',se:'Service/Theke',th:'Theke','kü':'Küche',u:'Urlaub',k:'Krank',f:'Frei','-':'Frei'})[value] || value;}
function shiftAnswered(week,id,day,period) {return (cloudShiftRevisions.get([week,id,day,period].join('|')) || 0)>0;}
function renderClaimAction(day,period) {
  const person=team.find(p=>p.name===currentUser),value=db[getWeekKey(currentWeekStart)]?.shifts[currentUser]?.[day]?.[period];
  const own=person?.id===cloudActor?.id;
  if(isScheduled(value)) return `<div class="text-[11px] text-emerald-800 mb-1">${own?'Du bist':'Ausgewählte Person ist'} eingetragen.</div><button onclick="openWithdrawal('${day}','${period}')" class="w-full py-2 bg-white border border-red-200 rounded-lg text-[11px] font-bold text-red-800">Aus Schicht austragen …</button>`;
  return `<button onclick="quickClaim('${day}','${period}')" class="w-full py-2 bg-white border border-stone-300 rounded-lg text-[11px] font-bold">+ ${own?'Mich':'Ausgewählte Person'} eintragen</button>`;
}
function openWithdrawal(day,period) {
  if(cloudBusy || !cloudActor)return;
  const person=team.find(p=>p.name===currentUser),week=getWeekKey(currentWeekStart);
  if(!person || !isScheduled(db[week]?.shifts[currentUser]?.[day]?.[period]))return;
  withdrawalContext={week,id:person.id,day,period,revision:cloudShiftRevisions.get([week,person.id,day,period].join('|')) || 0};
  const date=getDateForDay(daysOfWeek.findIndex(d=>d.key===day));
  document.getElementById('withdrawDetails').textContent=`${person.name} · ${date.toLocaleDateString('de-DE')} · ${period==='tag'?'Tag':'Abend'}`;
  document.getElementById('withdrawMessage').value='';document.getElementById('withdrawError').textContent='';
  modalReturnFocus=document.activeElement;
  document.getElementById('withdrawModal').hidden=false;document.getElementById('withdrawMessage').focus();
}
function closeWithdrawal() {
  if(cloudBusy && withdrawalContext)return;
  const el=document.getElementById('withdrawModal');if(!el)return;
  el.hidden=true;withdrawalContext=null;if(modalReturnFocus?.isConnected)modalReturnFocus.focus();
}
async function confirmWithdrawal() {
  if(!withdrawalContext || cloudBusy)return;
  const message=document.getElementById('withdrawMessage').value.trim();
  if(message.length<2 || message.length>1000){document.getElementById('withdrawError').textContent='Bitte eine Nachricht mit 2 bis 1000 Zeichen eingeben.';return;}
  const context={...withdrawalContext},button=document.getElementById('withdrawSubmit');button.disabled=true;
  try {
    const saved=await cloudWrite('withdraw_shift',{p_week:context.week,p_user:context.id,p_day:context.day,p_period:context.period,p_message:message,p_revision:context.revision});
    if(saved){closeWithdrawal();cloudStatus('Ausgetragen. Die Nachricht wurde für die Admins gespeichert.');}
    else document.getElementById('withdrawError').textContent='Austragung nicht bestätigt. Bitte aktuellen Plan prüfen; bei einer zwischenzeitlichen Änderung das Fenster schließen und neu öffnen.';
  } finally {button.disabled=false;}
}
function openInbox() {
  modalReturnFocus=document.activeElement;renderInbox();document.getElementById('inboxModal').hidden=false;
  document.querySelector('#inboxModal button').focus();
}
function closeInbox() {
  const el=document.getElementById('inboxModal');if(!el)return;el.hidden=true;
  if(modalReturnFocus?.isConnected)modalReturnFocus.focus();
}
function renderInbox() {
  document.getElementById('unreadCount').textContent=cloudInbox.unread || 0;
  document.getElementById('inboxMessages').innerHTML=cloudInbox.items?.length ? cloudInbox.items.map(n=>`<article class="message-card ${n.is_read?'':'bg-amber-50'}">
    <div class="font-bold">${escapeHtml(n.title)}</div>
    <div class="text-[10px] text-stone-500 mt-1">${escapeHtml(new Date(n.created_at).toLocaleString('de-DE'))}${n.is_read?' · Gelesen':' · Neu'}</div>
    <p class="message-body mt-2">${escapeHtml(n.message)}</p>
    ${n.is_read?'':`<button class="mt-2 text-[#8C1D40] underline" onclick="readNotification('${n.id}')">Als gelesen markieren</button>`}
  </article>`).join(''):'<p class="text-sm mt-4">Noch keine Nachrichten.</p>';
}
async function readNotification(id) {
  if(!cloudSession || cloudBusy)return;
  const {error}=await cloudClient.rpc('mark_notification_read',{p_id:id});
  if(error){cloudStatus('Nachricht konnte nicht als gelesen markiert werden.',true);return;}
  await cloudSync();
}
function getUpcomingPlanningWeek() {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Date.now()+cloudServerOffset));
 const value=type=>parts.find(p=>p.type===type).value;
 const date=new Date(`${value('year')}-${value('month')}-${value('day')}T12:00:00Z`);
 const weekday=date.getUTCDay()||7;date.setUTCDate(date.getUTCDate()+8-weekday+14);
 return date.toISOString().slice(0,10);
}
function renderDeadline() {
  const el=document.getElementById('deadlinePanel'),d=cloudDeadline;if(!d)return;
  const detailsOpen=el.querySelector('details')?.open || false;
  const complete=d.answered>=d.total,late=Date.now()+cloudServerOffset>new Date(d.deadline).getTime();
  el.className=`p-3 rounded-2xl border text-xs ${complete?'bg-emerald-50 border-emerald-200':late?'bg-red-50 border-red-200':'bg-amber-50 border-amber-200'}`;
  const format=date=>new Date(date+'T12:00:00Z').toLocaleDateString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit'});
  el.innerHTML=`<div class="font-bold">${complete?'✅ Alle Rückmeldungen vorhanden':late?'🔴 Frist abgelaufen – Rückmeldungen fehlen':'🟡 Rückmeldungen noch offen'}</div>
    <div class="mt-1">Planungswoche: ${format(d.week)}–${format(d.end)} · Frist: ${new Date(d.deadline).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} Uhr</div>
    <div class="mt-1">${d.answered} von ${d.total} Schichtantworten · Eintrag oder ausdrücklich Frei zählt.</div>
    ${!complete?`<details class="mt-2"><summary>Fehlende Antworten anzeigen (${d.missing_people.length} Personen)</summary><div class="mt-1">${d.missing_people.map(p=>`${escapeHtml(p.name)}: ${p.missing} offen`).join('<br>')}</div></details>`:''}
    <button class="mt-2 underline font-bold text-[#8C1D40]" onclick="openPlanningWeek('${d.week}')">Planungswoche bearbeiten</button>
    <div class="text-[10px] text-stone-500 mt-1">Die Schichtbesetzung wird separat geprüft.</div>`;
  if(el.querySelector('details'))el.querySelector('details').open=detailsOpen;
}
async function openPlanningWeek(week) {
  if(cloudBusy)return;closeWithdrawal();closeSollModal();document.getElementById('noteEditBox').classList.add('hidden');
  currentWeekStart=new Date(week+'T12:00:00');cloudLoadedWeek=null;cloudDeadline=null;cloudRule=null;loadWeekData();switchTab('myShifts');renderApp();await cloudSync();
}
document.addEventListener('keydown',event=>{
  const modal=[document.getElementById('withdrawModal'),document.getElementById('inboxModal')].find(el=>el && !el.hidden);
  if(!modal)return;
  if(event.key==='Escape'){event.preventDefault();modal.id==='withdrawModal'?closeWithdrawal():closeInbox();}
  if(event.key==='Tab'){
    const focusable=[...modal.querySelectorAll('button,textarea,input,select,[tabindex="0"]')].filter(el=>!el.disabled && !el.closest('[hidden]'));
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  }
});

// Sitzungsdaten speichern, niemals das eingegebene Passwort.
const cloudAuthStorage={
 getItem(key){return(localStorage.getItem('heiders_auth_remember')==='0'?sessionStorage:localStorage).getItem(key);},
 setItem(key,value){(localStorage.getItem('heiders_auth_remember')==='0'?sessionStorage:localStorage).setItem(key,value);},
 removeItem(key){localStorage.removeItem(key);sessionStorage.removeItem(key);}
};
