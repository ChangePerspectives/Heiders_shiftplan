'use strict';
let cloudClient, cloudActor, cloudSession, cloudBusy = false, cloudRequest = 0;
let cloudNoteRevision = 0, cloudSettingsRevision = 0, cloudEditWeek = null;
let cloudShiftRevisions = new Map();
let cloudLoadedWeek = null;
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function cloudStatus(message, error=false) {
  const el = document.getElementById('syncStatus');
  el.textContent = message;
  el.style.color = error ? '#b91c1c' : '#554D47';
}
function cloudError(error) {
  if (error?.code === '40001') return 'Zwischenzeitlich geändert. Bitte neu prüfen und erneut speichern.';
  if (error?.code === '42501') return 'Du hast für diese Änderung keine Berechtigung.';
  return navigator.onLine ? 'Verbindung oder Berechtigung prüfen. Die Änderung wurde nicht bestätigt.' : 'Offline – Änderungen können gerade nicht gespeichert werden.';
}
function cloudBlankWeek() {
  return {events:{},resTag:{},resAbend:{},soll:{mo:{tag:0,abend:0},di:{tag:2,abend:3},mi:{tag:2,abend:3},do:{tag:2,abend:2},fr:{tag:2,abend:3},sa:{tag:2,abend:3},so:{tag:0,abend:0}},note:'',shifts:Object.create(null),noteRevision:0,settingsRevision:0};
}
function cloudClear() {
  cloudRequest++;cloudLoadedWeek=null;
  cloudActor=null; cloudSession=null; currentUser=null; team=[]; db={}; cloudShiftRevisions.clear();
  document.getElementById('appMain').hidden=true;
  document.getElementById('adminUserSelectWrapper').classList.add('hidden');
  document.getElementById('userBadgeName').textContent='Abgemeldet';
  document.getElementById('loginModal').classList.remove('hidden');
  closeSollModal(); document.getElementById('noteEditBox').classList.add('hidden');
}
async function cloudSync() {
  if (!cloudSession || cloudBusy) return;
  const request=++cloudRequest, sessionId=cloudSession.user.id, week=getWeekKey(currentWeekStart);
  if (!navigator.onLine) {cloudStatus('Offline – der angezeigte Plan kann veraltet sein.',true);return;}
  try {
    const results=await Promise.all([
      cloudClient.from('profiles').select('id,name,job_role,is_admin,active').order('name'),
      cloudClient.from('shifts').select('*').eq('week',week),
      cloudClient.from('week_settings').select('*').eq('week',week).maybeSingle()
    ]);
    for (const r of results) if(r.error) throw r.error;
    if (request !== cloudRequest || !cloudSession || cloudSession.user.id !== sessionId) return;
    const profiles=results[0].data;
    cloudActor=profiles.find(p=>p.id===sessionId && p.active);
    if(!cloudActor) {cloudClear();document.getElementById('loginError').textContent='Dein Konto wurde noch keinem aktiven Teamprofil zugeordnet.';return;}
    team=profiles.filter(p=>p.active).map(p=>({id:p.id,name:p.name,role:p.job_role,isAdmin:p.is_admin}));
    if (!cloudActor.is_admin || !team.some(p=>p.name===currentUser)) currentUser=cloudActor.name;
    const data=cloudBlankWeek(), settings=results[2].data;
    if(settings) Object.assign(data,{note:settings.note,soll:settings.requirements,resTag:settings.reservations_day,resAbend:settings.reservations_evening,noteRevision:settings.note_revision,settingsRevision:settings.settings_revision});
    const revisions=new Map();
    for(const row of results[1].data) {
      const person=team.find(p=>p.id===row.user_id); if(!person) continue;
      data.shifts[person.name] ??= {};
      data.shifts[person.name][row.day] ??= {tag:'-',abend:'-'};
      data.shifts[person.name][row.day][row.period]=row.value;
      revisions.set([week,row.user_id,row.day,row.period].join('|'),row.revision);
    }
    db[week]=data; cloudShiftRevisions=revisions;cloudLoadedWeek=week;
    const scroll=document.getElementById('weekTableScroll');
    const scrollTop=scroll.scrollTop,scrollLeft=scroll.scrollLeft;
    setupUserInterface();renderApp();
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
    const {error}=await cloudClient.rpc(name,args);
    if(error) throw error;
    saved=true;if(onSuccess) onSuccess();
  } catch(error) {cloudStatus('Speicherung nicht bestätigt. '+cloudError(error),true);}
  finally {cloudBusy=false;}
  // Nach Konflikten Daten aktualisieren, aber den Hinweis beibehalten.
  const message=document.getElementById('syncStatus').textContent;
  await cloudSync();
  if(!saved) cloudStatus(message,true);
}
async function cloudInit() {
  cloudClear();switchTab('cards');
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
  cloudClient=supabase.createClient(config.supabaseUrl,config.publishableKey,{auth:{storageKey:'heiders_cloud_auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const {data,error}=await cloudClient.auth.getSession();
  if(error) {document.getElementById('loginError').textContent='Die Anmeldung konnte nicht wiederhergestellt werden.';return;}
  cloudSession=data.session;
  cloudClient.auth.onAuthStateChange((event,session)=>{
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
    const {data,error}=await cloudClient.auth.signInWithPassword({email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value});
    if(error) throw error;
    cloudSession=data.session;document.getElementById('loginPassword').value='';await cloudSync();
  } catch(_) {errorEl.textContent='Anmeldung fehlgeschlagen. Bitte E-Mail, Passwort und Internetverbindung prüfen.';}
  finally {button.disabled=false;}
}
async function resetUserChoice() {
  if(cloudBusy) {cloudStatus('Bitte zuerst die Speicherung abwarten.');return;}
  if(!cloudClient) return;
  await cloudClient.auth.signOut({scope:'local'});cloudClear();
}
function setupUserInterface() {
  const admin=!!cloudActor?.is_admin;
  document.getElementById('userBadgeName').textContent=cloudActor?.name || 'Abgemeldet';
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
  closeSollModal();document.getElementById('noteEditBox').classList.add('hidden');
  currentWeekStart.setDate(currentWeekStart.getDate()+direction*7);
  cloudLoadedWeek=null;loadWeekData();renderApp();cloudStatus('Plan wird geladen …');await cloudSync();
  // Navigation bleibt auch bei Verbindungsfehler sichtbar; bereits geladene Woche wird als veraltet markiert.
  if(db[getWeekKey(currentWeekStart)]) {renderApp();document.getElementById('appMain').hidden=false;}
}
function quickClaim(day,period) {
  const person=team.find(p=>p.name===currentUser);if(!person)return;
  return updateShift(day,period,person.role.includes('Küche')&&!person.role.includes('Service')?'kü':'se');
}
function updateShift(day,period,value) {
  const person=team.find(p=>p.name===currentUser),week=getWeekKey(currentWeekStart);
  if(!person) return;
  return cloudWrite('save_shift',{p_week:week,p_user:person.id,p_day:day,p_period:period,p_value:value,p_revision:cloudShiftRevisions.get([week,person.id,day,period].join('|')) || 0});
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
  if(!cloudActor?.is_admin || cloudEditWeek!==getWeekKey(currentWeekStart))return;
  const requirements={},day={},evening={};
  for(const d of daysOfWeek) {
    requirements[d.key]={};
    for(const period of ['tag','abend']) {
      const input=document.getElementById(`soll_${d.key}_${period}`),value=Number(input.value);
      if(input.value.trim()==='' || !Number.isInteger(value) || value<0 || value>50) {cloudStatus('Personalbedarf muss eine ganze Zahl zwischen 0 und 50 sein.',true);input.focus();return;}
      requirements[d.key][period]=value;
    }
    day[d.key]=document.getElementById(`res_${d.key}_tag`).value;
    evening[d.key]=document.getElementById(`res_${d.key}_abend`).value;
    if(day[d.key].length>300 || evening[d.key].length>300){cloudStatus('Reservierungstext ist zu lang (maximal 300 Zeichen).',true);return;}
  }
  return cloudWrite('save_week_settings',{p_week:cloudEditWeek,p_requirements:requirements,p_day:day,p_evening:evening,p_revision:cloudSettingsRevision},closeSollModal);
}
window.onload=()=>cloudInit().catch(()=>cloudStatus('App konnte nicht geladen werden. Bitte erneut öffnen.',true));
