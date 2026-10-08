'use strict';
let absenceContext=null,absenceSettingsDraft=new Map();
function absenceAt(id,date,period,items=cloudAbsences){return items.find(a=>{
 if(a.user_id!==id||date<a.start_date||date>a.end_date||(a.period!=='all'&&a.period!==period))return false;
 if(a.status==='active')return true;
 if(!a.cancelled_at)return false;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(a.cancelled_at));const part=k=>parts.find(p=>p.type===k)?.value;
 const cancelledDate=part('year')+'-'+part('month')+'-'+part('day');return date<cancelledDate||date===cancelledDate&&period==='tag'&&Number(part('hour'))>=15;
});}
function absencePeriodText(period){return period==='all'?'Ganzer Tag':period==='tag'?'Tagschicht':'Abendschicht';}
function absenceDateText(date){return new Date(date+'T12:00:00Z').toLocaleDateString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric'});}
compactWeekRange=function(week){const end=shiftDateKey(week,'so');return week.slice(8,10)+'.'+week.slice(5,7)+'.'+(week.slice(0,4)!==end.slice(0,4)?week.slice(0,4):'')+'–'+end.slice(8,10)+'.'+end.slice(5,7)+'.'+end.slice(0,4);};
function clearAbsenceUI(){absenceContext=null;absenceSettingsDraft.clear();document.getElementById('employeesModal').hidden=true;for(const id of ['absenceModal','absenceOverviewModal'])document.getElementById(id).hidden=true;}
function openAbsence(){
 const person=team.find(p=>p.name===currentUser);if(cloudBusy||!person?.absenceEnabled||!cloudActor||person.id!==cloudActor.id&&!cloudActor.is_admin)return;
 if(cloudLoadedWeek!==getWeekKey(currentWeekStart)){cloudStatus('Bitte warten, bis die gewählte Woche geladen wurde.',true);return;}
 absenceContext={id:person.id,actor:cloudActor.id,session:cloudSession.user.id};modalReturnFocus=document.activeElement;
 const first=getWeekKey(currentWeekStart)>berlinToday()?getWeekKey(currentWeekStart):berlinToday();
 document.getElementById('absencePerson').textContent='Für '+person.name;document.getElementById('absenceStart').min=berlinToday();document.getElementById('absenceStart').value=first;document.getElementById('absenceEnd').value=first;updateAbsenceEnd();
 document.getElementById('absencePeriod').value=first===berlinToday()&&Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(new Date(serverNow())))>=15?'abend':'all';
 document.getElementById('absenceReason').value='';document.getElementById('absenceNote').value='';document.getElementById('absenceError').textContent='';document.getElementById('absenceSubmit').disabled=false;document.getElementById('absenceFields').disabled=false;document.getElementById('absenceModal').hidden=false;document.getElementById('absenceStart').focus();
}
function updateAbsenceEnd(){const start=document.getElementById('absenceStart').value,end=document.getElementById('absenceEnd');end.min=start;if(end.value<start)end.value=start;}
function closeAbsence(force=false){if(cloudBusy&&!force)return;absenceContext=null;document.getElementById('absenceModal').hidden=true;if(modalReturnFocus?.isConnected)modalReturnFocus.focus();}
async function submitAbsence(){
 const context=absenceContext;if(!context||cloudBusy||cloudActor?.id!==context.actor||cloudSession?.user.id!==context.session)return;
 const start=document.getElementById('absenceStart').value,end=document.getElementById('absenceEnd').value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||start<berlinToday()||end<start||(Date.parse(end)-Date.parse(start))/86400000>365){document.getElementById('absenceError').textContent='Bitte einen gültigen Zeitraum ab heute wählen (maximal ein Jahr).';return;}
 document.getElementById('absenceSubmit').disabled=true;document.getElementById('absenceFields').disabled=true;
 try{
  const saved=await cloudWrite('heiders_report_absence',{p_user:context.id,p_start:start,p_end:end,p_period:document.getElementById('absencePeriod').value,p_reason:document.getElementById('absenceReason').value,p_note:document.getElementById('absenceNote').value.trim()});
  if(absenceContext!==context||cloudActor?.id!==context.actor||cloudSession?.user.id!==context.session)return;
  if(saved){closeAbsence();cloudStatus('Abwesenheit gemeldet. Pia und Nelly erhalten eine Nachricht; bitte betroffene Schichten prüfen.');}
  else document.getElementById('absenceError').textContent=document.getElementById('syncStatus').textContent;
 }finally{document.getElementById('absenceSubmit').disabled=false;document.getElementById('absenceFields').disabled=false;}
}
function absenceCard(a,admin=false){const period=absencePeriodText(a.period);return `<article class="absence-item"><strong>${escapeHtml(personName(a.user_id))}</strong><p>${absenceDateText(a.start_date)}–${absenceDateText(a.end_date)} · ${period}</p>${a.reason?`<p class="hint">${escapeHtml(a.reason)}</p>`:''}${a.note?`<p>${escapeHtml(a.note)}</p>`:''}<p class="hint">Eingeplante Schichten zählen in diesem Zeitraum nicht als besetzt. Bitte Ersatz prüfen.</p>${admin?`<button onclick="inspectAbsentAssignments('${a.user_id}')">Zuweisungen prüfen</button>`:''}${a.status==='active'&&a.end_date>=berlinToday()&&(admin||a.user_id===cloudActor?.id)?`<button type="button" onclick="cancelAbsence('${a.id}')">Abwesenheit zurückziehen</button>`:''}</article>`;}
function inspectAbsentAssignments(id){if(!cloudActor?.is_admin)return;const person=team.find(p=>p.id===id);if(!person)return;closeAbsenceOverview();currentUser=person.name;setupUserInterface();renderApp();switchTab('myShifts');}
async function cancelAbsence(id){
 const a=cloudAbsences.find(a=>a.id===id);if(!a||cloudBusy||!cloudActor||a.user_id!==cloudActor.id&&!cloudActor.is_admin)return;
 if(!window.confirm('Abwesenheit zurückziehen? Bereits eingeplante Schichten werden ab jetzt wieder als besetzt gezählt. Falls inzwischen Ersatz eingetragen ist, müssen die Admins zuerst die Zuweisungen prüfen.'))return;
 const saved=await cloudWrite('heiders_cancel_absence',{p_id:id,p_revision:a.revision});renderAbsenceOverview();renderMyShiftsTab();if(saved)cloudStatus('Abwesenheit zurückgezogen.');else{document.getElementById('absenceOverviewError').textContent=document.getElementById('syncStatus').textContent;const error=document.getElementById('myAbsenceError');if(error)error.textContent=document.getElementById('syncStatus').textContent;}
}
function openAbsenceOverview(){if(!cloudActor?.is_admin)return;document.getElementById('absenceOverviewError').textContent='';document.getElementById('absenceOverviewModal').hidden=false;renderAbsenceOverview();document.getElementById('absenceOverviewTitle').focus();}
function closeAbsenceOverview(){if(cloudBusy)return;document.getElementById('absenceOverviewModal').hidden=true;}
function renderAbsenceOverview(){if(document.getElementById('absenceOverviewModal').hidden||!cloudActor?.is_admin)return;document.getElementById('absenceOverviewWeek').textContent=compactWeekRange(getWeekKey(currentWeekStart))+' | '+calendarWeekLabel(getWeekKey(currentWeekStart));const active=cloudAbsences.filter(a=>a.status==='active');document.getElementById('absenceOverviewList').innerHTML=active.length?active.map(a=>absenceCard(a,true)).join(''):'<p>Keine Abwesenheitsmeldungen in dieser Woche.</p>';}
async function openAbsenceWeek(week){closeInbox();await openPlanningWeek(week);if(cloudActor?.is_admin&&cloudLoadedWeek===week)openAbsenceOverview();}
function currentOpenSlots(){const week=getWeekKey(currentWeekStart),data=db[week];if(!data||cloudLoadedWeek!==week)return [];const result=[];for(const d of daysOfWeek)for(const period of ['tag','abend']){if(isShiftLocked(week,d.key,period))continue;const needed=Number(data.soll[d.key]?.[period])||0,filled=team.filter(p=>isScheduled(data.shifts[p.name]?.[d.key]?.[period])&&!absenceAt(p.id,shiftDateKey(week,d.key),period)).length;if(needed>filled)result.push({day:d.key,period,date:shiftDateKey(week,d.key),missing:needed-filled});}return result;}
function showOpenShifts(){const slot=currentOpenSlots()[0];if(slot)focusDay=slot.day;switchTab('cards');renderDayViews();}
renderDeadline=function(){
 const week=getWeekKey(currentWeekStart),d=cloudDeadline,el=document.getElementById('deadlinePanel');
 if(!d||cloudLoadedWeek!==week){el.className='notice';el.innerHTML='<p class="hint">Planungsfrist für die gewählte Woche wird geladen …</p>';document.getElementById('planningSupport').hidden=true;return;}
 const late=serverNow()>=Date.parse(d.deadline),person=team.find(p=>p.name===currentUser);el.className='notice';
 el.innerHTML=`<strong>Planung bis ${new Date(d.deadline).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric'})}, 00:00 Uhr</strong><p class="hint">${late?'Planungsfrist abgelaufen. ':''}${person?.absenceEnabled?'Bitte bis dahin eintragen oder Abwesenheit melden.':'Wenn du arbeiten möchtest, trag dich bis dahin ein. Keine Zeit? Du musst nichts melden.'}</p>`;
 const slots=currentOpenSlots(),card=document.getElementById('planningSupport');card.hidden=shiftDateKey(week,'so')<berlinToday();card.className='plain-card'+(slots.length?' has-gaps':'');
 card.innerHTML=slots.length?`<strong>Noch Unterstützung gesucht</strong><p class="hint">${slots.reduce((n,s)=>n+s.missing,0)} Plätze in ${slots.length} Schichten frei${late?' · Planungsfrist abgelaufen':''}</p>${slots.slice(0,2).map(s=>`<p>${shortDay[s.day]}, ${absenceDateText(s.date)} · ${s.period==='tag'?'Tag':'Abend'}: <span class="missing-number">${s.missing} ${s.missing===1?'Platz frei':'Plätze frei'}</span></p>`).join('')}${slots.length>2?`<details><summary>Weitere ${slots.length-2} Schichten anzeigen</summary>${slots.slice(2).map(s=>`<p>${shortDay[s.day]}, ${absenceDateText(s.date)} · ${s.period==='tag'?'Tag':'Abend'}: <span class="missing-number">${s.missing} frei</span></p>`).join('')}</details>`:''}<button class="plain-action wide" onclick="showOpenShifts()">Freie Schichten ansehen</button>`:'<strong class="capacity-complete">✓ Alle noch anstehenden Schichten sind besetzt.</strong>';
};
renderMyShiftsTab=function(){
 const week=getWeekKey(currentWeekStart),data=db[week],person=team.find(p=>p.name===currentUser);if(!data||!person)return;
 const count=daysOfWeek.reduce((n,d)=>n+['tag','abend'].filter(period=>isScheduled(data.shifts[person.name]?.[d.key]?.[period])&&!absenceAt(person.id,shiftDateKey(week,d.key),period)).length,0);
 document.getElementById('myPlanSummary').innerHTML=person.absenceEnabled?`<article class="plain-card"><h3>Deine eingeplanten Schichten</h3><p>${count?count+' Schichten in dieser Woche.':'Noch keine Schichten in dieser Woche zugewiesen.'}</p><button onclick="openAbsence()">Abwesenheit melden</button><p class="hint">Nur melden, wenn du nicht kommen kannst. Keine automatische Zuweisung durch diese Einstellung.</p></article>`:'<article class="plain-card"><h3>Du möchtest arbeiten?</h3><p>Wähle eine passende freie Schicht.</p><button onclick="showOpenShifts()">Freie Schichten ansehen</button><p class="hint">Keine Zeit? Du musst nichts melden. Bereits zugesagte Schichten bleiben verbindlich.</p></article>';
 const own=cloudAbsences.filter(a=>a.user_id===person.id&&a.status==='active');document.getElementById('myAbsenceList').innerHTML=own.length?'<article class="plain-card"><h3>Deine Abwesenheiten</h3>'+own.map(a=>absenceCard(a,!!cloudActor?.is_admin)).join('')+'<p id="myAbsenceError" class="error" role="alert"></p></article>':'';
 document.getElementById('myShiftsList').innerHTML=visibleDays().map(d=>`<article class="my-day"><h3>${d.label}, ${formatDateShort(getDateForDay(daysOfWeek.indexOf(d)))}</h3>${['tag','abend'].map(period=>{
 const locked=isShiftLocked(week,d.key,period),value=data.shifts[person.name]?.[d.key]?.[period]||'-',away=absenceAt(person.id,shiftDateKey(week,d.key),period),pending=pendingFor(person.id,d.key,period);
 return `<div class="my-period"><strong>${period==='tag'?'Tag':'Abend'} · ${away?'Abwesenheit gemeldet':value==='-'?'Nicht eingeplant':escapeHtml(shiftRoleLabel(value))}</strong>${shiftTimeHint(person.name,d.key,period)}${away&&isScheduled(value)?'<p class="absence-info">Ursprüngliche Zuweisung bleibt zur Klärung erhalten. Du zählst für diese Schicht nicht als besetzt.</p>':''}${locked?`<p class="past-label">${shiftLockText(week,d.key)}</p>`:''}${pending?`<p class="transfer-status">${escapeHtml(personName(pending.taker_id))} angefragt · Bestätigung offen</p>`:''}${!locked&&away&&isScheduled(value)&&cloudActor?.is_admin?`<button class="plain-action" onclick="openWithdrawal('${d.key}','${period}')">Zuweisung ändern …</button>`:''}${!locked&&!away?`<div class="my-buttons"><button class="${value==='se'?'selected':''}" ${isScheduled(value)&&value!=='offen'?'disabled':''} onclick="updateShift('${d.key}','${period}','se')">Service/Theke</button><button class="${value==='kü'?'selected':''}" ${isScheduled(value)&&value!=='offen'?'disabled':''} onclick="updateShift('${d.key}','${period}','kü')">Küche</button>${isScheduled(value)?`<button onclick="openWithdrawal('${d.key}','${period}')">Ändern …</button>`:''}</div>`:''}</div>`;
 }).join('')}</article>`).join('');
};
const renderEmployeesWithoutAbsence=renderEmployees;
renderEmployees=function(){renderEmployeesWithoutAbsence();if(!cloudActor?.is_admin)return;renderAbsenceSettings();};
function renderAbsenceSettings(){
 let box=document.getElementById('absenceTeamSettings');if(!box){box=document.createElement('section');box.id='absenceTeamSettings';box.className='plain-card';document.getElementById('employeesList').insertAdjacentElement('afterend',box);}
 const people=team.slice().sort((a,b)=>Number(b.absenceEnabled)-Number(a.absenceEnabled)||a.name.localeCompare(b.name,'de'));
 box.innerHTML='<h3>Abwesenheitsmeldung anzeigen</h3><p class="hint">Nur für Admins · Pia und Nelly. Für regelmäßig eingeplante Personen aktivieren. Bestehende Abwesenheiten bleiben beim Ausschalten erhalten.</p>'+people.map(p=>`<label class="absence-setting"><span>${escapeHtml(p.name)}</span><input type="checkbox" role="switch" aria-label="Abwesenheitsmeldung für ${escapeHtml(p.name)}" ${absenceSettingsDraft.has(p.id)?absenceSettingsDraft.get(p.id).enabled?'checked':'':p.absenceEnabled?'checked':''} ${cloudBusy?'disabled':''} onchange="draftAbsenceSetting('${p.id}',this.checked)"></label>`).join('')+'<button id="absenceSettingsSave" class="primary wide" onclick="saveAbsenceSettings()" '+(cloudBusy||!absenceSettingsDraft.size?'disabled':'')+'>Einstellungen speichern</button><p id="absenceSettingsStatus" class="hint" role="status">'+(absenceSettingsDraft.size?'Änderungen noch nicht gespeichert.':'Später jederzeit für weitere Personen aktivierbar.')+'</p>';
}
function draftAbsenceSetting(id,enabled){if(!cloudActor?.is_admin)return;const person=team.find(p=>p.id===id);if(!person)return;const previous=absenceSettingsDraft.get(id);if(enabled===person.absenceEnabled)absenceSettingsDraft.delete(id);else absenceSettingsDraft.set(id,{id,enabled,revision:previous?.revision??person.absenceRevision});renderAbsenceSettings();}
async function saveAbsenceSettings(){
 if(!cloudActor?.is_admin||cloudBusy||!absenceSettingsDraft.size)return;
 const changes=[...absenceSettingsDraft.values()];const saved=await cloudWrite('heiders_save_absence_settings',{p_changes:changes},()=>absenceSettingsDraft.clear());
 if(saved){document.getElementById('absenceSettingsStatus').textContent='Gespeichert. Die Einstellung gilt ab sofort.';cloudStatus('Abwesenheits-Einstellungen gespeichert.');}else document.getElementById('absenceSettingsStatus').textContent=document.getElementById('syncStatus').textContent;
}
const closeEmployeesWithoutAbsence=closeEmployees;
closeEmployees=function(){if(cloudBusy)return;if(absenceSettingsDraft.size&&!window.confirm('Ungespeicherte Abwesenheits-Einstellungen verwerfen?'))return;absenceSettingsDraft.clear();closeEmployeesWithoutAbsence();};
const renderAppWithoutAbsence=renderApp;
renderApp=function(){renderAppWithoutAbsence();document.getElementById('absenceAdminButton').hidden=!cloudActor?.is_admin;renderAbsenceOverview();};
const notificationContentWithoutAbsence=notificationContent;
notificationContent=function(n){return notificationContentWithoutAbsence(n)+(n.kind==='absence'&&cloudActor?.is_admin?`<button onclick="openAbsenceWeek('${n.week}')">Abwesenheiten ansehen</button>`:'');};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('absenceModal').hidden){event.preventDefault();closeAbsence();}else if(event.key==='Escape'&&!document.getElementById('absenceOverviewModal').hidden){event.preventDefault();closeAbsenceOverview();}});
