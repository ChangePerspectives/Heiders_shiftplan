'use strict';
let focusDay='do',activeTab='cards',transferContext=null,lastUndo=null;
const shortDay={mo:'Mo',di:'Di',mi:'Mi',do:'Do',fr:'Fr',sa:'Sa',so:'So'};
function serverNow(){return Date.now()+cloudServerOffset;}
function berlinToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(serverNow()));}
function shiftDateKey(week,day){const i=['mo','di','mi','do','fr','sa','so'].indexOf(day);const d=new Date(week+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);}
function isPastShift(week,day){return shiftDateKey(week,day)<berlinToday();}
function isShiftLocked(week,day,period){
 const date=shiftDateKey(week,day),today=berlinToday();
 if(date<today)return true;
 if(date!==today||period!=='tag')return false;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(new Date(serverNow())));
 return hour>=15;
}
function shiftLockText(week,day){return isPastShift(week,day)?'Abgeschlossen · Nur ansehen':'Tagschicht ab 15:00 Uhr geschlossen · Nur ansehen';}
function toggleWeekNotes(){const notes=document.getElementById('weekNotes');notes.open=!notes.open;document.getElementById('weekNotesButton').setAttribute('aria-expanded',String(notes.open));}
function closeWeekNotices(){document.querySelectorAll('#appMain details').forEach(el=>el.open=false);document.getElementById('weekNotesButton').setAttribute('aria-expanded','false');document.getElementById('noteEditBox').classList.add('hidden');}

function personName(id){return team.find(p=>p.id===id)?.name || 'Nicht aktives Profil';}
function shiftRevision(id,day,period,week=getWeekKey(currentWeekStart)){return cloudShiftRevisions.get([week,id,day,period].join('|'))||0;}
function effectiveTransferStatus(t){
 if(t.status!=='pending')return t.status;
 const data=db[getWeekKey(currentWeekStart)];
 if(!team.some(p=>p.id===t.giver_id)||!team.some(p=>p.id===t.taker_id)||t.source_revision!==shiftRevision(t.giver_id,t.day,t.period)||t.target_revision!==shiftRevision(t.taker_id,t.day,t.period)||data?.shifts[personName(t.giver_id)]?.[t.day]?.[t.period]!==t.shift_value)return 'stale';
 return 'pending';
}
function pendingFor(id,day,period){return cloudTransfers.find(t=>t.giver_id===id&&t.day===day&&t.period===period&&effectiveTransferStatus(t)==='pending');}
function switchTab(tab){
 closeWeekNotices();
 activeTab=tab;
 for(const [key,id]of [['cards','tabCards'],['week','tabWeek'],['myShifts','tabMyShifts'],['springer','tabSpringer']]){
 document.getElementById(id).classList.toggle('hidden',key!==tab);
 const button=document.getElementById(id+'Btn');button.className=key===tab?'active':'';button.setAttribute('aria-pressed',String(key===tab));
 }
 document.getElementById('screenTitle').textContent=({cards:'Tagesplan',week:'Gesamtplan',myShifts:'Mein Plan',springer:'Springer-Pool'})[tab];
 if(tab==='springer')renderSpringer();
 document.getElementById('screenTitle').focus({preventScroll:true});
 window.scrollTo({top:0,behavior:'instant'});
}
function visibleDays(){
 const data=db[getWeekKey(currentWeekStart)];
 return daysOfWeek.filter(d=>!d.isSpecial||showSpecialDays||(data?.soll[d.key]?.tag||0)>0||(data?.soll[d.key]?.abend||0)>0||data?.resTag[d.key]||data?.resAbend[d.key]);
}
function selectFocusDay(day){focusDay=day;renderDayViews();}
function renderDayViews(){
 const data=db[getWeekKey(currentWeekStart)];if(!data)return;
 const days=visibleDays();if(!days.some(d=>d.key===focusDay))focusDay=days[0]?.key||'di';
 const picker=days.map(d=>`<button data-day="${d.key}" class="${d.key===focusDay?'active':''}" aria-pressed="${d.key===focusDay}" onclick="selectFocusDay('${d.key}')">${shortDay[d.key]}<span>${getDateForDay(daysOfWeek.indexOf(d)).getDate()}</span></button>`).join('');
 const strip=`<button class="week-step" onclick="navigateWeekAtDays(-1)" aria-label="Vorherige Woche">‹</button><div class="day-track" aria-label="Tage dieser Woche">${picker}</div><button class="week-step" onclick="navigateWeekAtDays(1)" aria-label="Nächste Woche">›</button>`;
 document.getElementById('dayPickerCards').innerHTML=strip;
 const track=document.getElementById('dayPickerCards').querySelector('.day-track'),button=track?.querySelector('[aria-pressed="true"]');if(button)track.scrollLeft=Math.max(0,button.offsetLeft-track.offsetLeft-track.clientWidth/2+button.offsetWidth/2);
 document.getElementById('dailyCardsContainer').innerHTML=dayMarkup(true);
 document.getElementById('teamDayContainer').innerHTML=daysOfWeek.map(d=>`<section class="overview-day" id="overview-${d.key}" aria-label="${escapeHtml(d.label)}">${dayMarkup(false,d.key)}</section>`).join('');
}
function overviewToTop(){
 window.scrollTo({top:0,behavior:'smooth'});
 document.getElementById('screenTitle').focus({preventScroll:true});
}
function dayMarkup(edit,selectedDay=focusDay){
 const data=db[getWeekKey(currentWeekStart)],day=selectedDay,index=daysOfWeek.findIndex(d=>d.key===day);
 let html=`<h2 class="day-title">${daysOfWeek[index].label}, ${getDateForDay(index).toLocaleDateString('de-DE',{day:'numeric',month:'long'})}</h2>`;
 if(!edit)html+='<div class="overview-shifts">';
 for(const period of ['tag','abend']){
 const staff=team.filter(p=>isScheduled(data.shifts[p.name]?.[day]?.[period]));
 const absences=team.filter(p=>['u','k','f'].includes(data.shifts[p.name]?.[day]?.[period]));
 const needed=data.soll[day]?.[period]||0,open=Math.max(0,needed-staff.length),excess=Math.max(0,staff.length-needed),res=(period==='tag'?data.resTag:data.resAbend)?.[day];
 html+=`<article class="shift-card"><div class="shift-heading"><h3>${period==='tag'?'☀ Tagschicht':'☾ Abendschicht'}</h3><span class="${open||excess?'open-slot':needed>0?'occupancy is-complete':'occupancy'}">${excess?excess+' zu viel · '+staff.length+'/'+needed+' besetzt':open?open+' '+(open===1?'Platz frei':'Plätze frei'):(!needed&&!staff.length?'Kein Bedarf':(needed>0?'✓ ':'')+staff.length+' von '+needed+' besetzt')}</span></div><p class="hint">${period==='tag'?'Ab 10:30 Uhr':'Ab 15:00 Uhr'}</p><div class="reservation ${res?.trim()?'has-reservation':''}"><strong>${res?.trim()?'📌 ':''}Reservierungen · ${period==='tag'?'Tag':'Abend'}</strong>${res?escapeHtml(res):'Keine Reservierungen hinterlegt.'}</div><ul class="roster">${staff.map(p=>{
 const transfer=pendingFor(p.id,day,period);
 return `<li><div class="person-line"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(shiftRoleLabel(data.shifts[p.name][day][period]))}</span></div>${shiftTimeHint(p.name,day,period)}${data.shifts[p.name][day][period]==='offen'&&!transfer&&!isShiftLocked(getWeekKey(currentWeekStart),day,period)&&(cloudActor?.is_admin||cloudActor?.id===p.id)&&edit&&p.name!==currentUser?roleConfirmationButtons(p.id,day,period):''}${transfer?`<div class="transfer-status">Übernahme bei ${escapeHtml(personName(transfer.taker_id))} angefragt · Bestätigung offen</div>`:''}</li>`;
 }).join('')}</ul>${!staff.length?'<p class="hint">Noch niemand eingetragen.</p>':''}${absences.length?`<p class="absence-line">Abwesend / frei: ${absences.map(p=>escapeHtml(p.name)+' ('+escapeHtml(shiftRoleLabel(data.shifts[p.name][day][period]))+')').join(', ')}</p>`:''}${edit?renderClaimAction(day,period):''}</article>`;
 }
 return html+(!edit?'</div>':'');
}
function renderClaimAction(day,period){
 const person=team.find(p=>p.name===currentUser),data=db[getWeekKey(currentWeekStart)],value=data?.shifts[currentUser]?.[day]?.[period];if(!person)return '';
 if(isShiftLocked(getWeekKey(currentWeekStart),day,period))return `<p class="past-label">${shiftLockText(getWeekKey(currentWeekStart),day)}</p>`;
 const pending=pendingFor(person.id,day,period);
 if(value==='offen'&&!pending)return roleConfirmationButtons(person.id,day,period)+`<button class="wide secondary" onclick="openWithdrawal('${day}','${period}')">Eingetragen · Ändern</button>`;
 if(isScheduled(value))return pending?`<p class="hint">Übernahme angefragt. Bis zur Bestätigung bleibt die Eintragung bestehen.</p><button class="wide secondary" onclick="cancelTransfer('${pending.id}')">Anfrage zurückziehen</button>`:`<button class="wide secondary" onclick="openWithdrawal('${day}','${period}')">Eingetragen · Ändern</button>`;
 return `<div class="claim-roles"><p class="hint">${person.id===cloudActor?.id?'Mich':escapeHtml(person.name)} eintragen als:</p><div class="my-buttons"><button class="secondary" onclick="updateShift('${day}','${period}','se')">Service/Theke</button><button class="secondary" onclick="updateShift('${day}','${period}','kü')">Küche</button></div></div>`;
}
function renderMyShiftsTab(){
 const data=db[getWeekKey(currentWeekStart)],person=team.find(p=>p.name===currentUser);if(!data||!person)return;
 document.getElementById('myShiftsList').innerHTML=visibleDays().map(d=>`<article class="my-day"><h3>${d.label}, ${formatDateShort(getDateForDay(daysOfWeek.indexOf(d)))}</h3>${['tag','abend'].map(period=>{
 const past=isShiftLocked(getWeekKey(currentWeekStart),d.key,period),value=data.shifts[person.name]?.[d.key]?.[period]||'-',answered=shiftAnswered(getWeekKey(currentWeekStart),person.id,d.key,period),pending=pendingFor(person.id,d.key,period);
 return `<div class="my-period"><strong>${period==='tag'?'Tag':'Abend'} · ${answered?escapeHtml(shiftRoleLabel(value)):'Noch offen'}</strong>${shiftTimeHint(person.name,d.key,period)}${past?`<p class="past-label">${shiftLockText(getWeekKey(currentWeekStart),d.key)}</p>`:''}${pending?`<p class="transfer-status">${escapeHtml(personName(pending.taker_id))} angefragt · Bestätigung offen</p>`:''}<div class="my-buttons"><button class="${value==='se'?'selected':''}" ${past||(isScheduled(value)&&value!=='offen')?'disabled':''} onclick="updateShift('${d.key}','${period}','se')">Service/Theke</button><button class="${value==='kü'?'selected':''}" ${past||(isScheduled(value)&&value!=='offen')?'disabled':''} onclick="updateShift('${d.key}','${period}','kü')">Küche</button><button ${past||(value==='-'&&answered)?'disabled':''} onclick="updateShift('${d.key}','${period}','-')">${isScheduled(value)?'Ändern …':'Frei bestätigen'}</button></div></div>`;
 }).join('')}</article>`).join('');
}
function renderApp(){
 const week=getWeekKey(currentWeekStart);loadWeekData();
 document.getElementById('weekTitle').textContent=compactWeekRange(week);
 document.getElementById('weekRange').textContent=calendarWeekLabel(week);
 document.getElementById('planWeek').value=week;
 document.getElementById('noteDisplay').textContent=db[week].note||'Hier können Pia und Nelly Informationen für die ganze Woche hinterlegen, zum Beispiel Veranstaltungen oder besondere Aufgaben. Reservierungen werden separat pro Tag und Schicht erfasst.';
 document.getElementById('weekNotesButton').textContent=db[week].note?.trim()?'Hinweise für die Woche · vorhanden':'Hinweise für die Woche';
 document.getElementById('weekNotes').classList.toggle('has-note',!!db[week].note?.trim());
 document.getElementById('reservationEditButton').hidden=!cloudActor?.is_admin;
 renderDayViews();renderMyShiftsTab();renderSpringer();renderUndo();renderDeadline();renderIncomingRequests();renderCapacityWarning();if(!document.getElementById('employeesModal').hidden&&cloudActor?.is_admin)renderEmployees();
}
function renderDeadline(){
 const d=cloudDeadline,el=document.getElementById('deadlinePanel');
 if(!d){el.className='notice';el.innerHTML='<p class="hint">Eintragungsfrist für die gewählte Woche wird geladen …</p>';return;}
 const open=el.querySelector('details')?.open||false,complete=d.answered>=d.total,late=serverNow()>=Date.parse(d.deadline);
 const date=s=>new Date(s+'T12:00:00Z').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Berlin'});
 const deadline=new Date(d.deadline).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 el.className='notice deadline-'+(complete?'complete':late?'late':'open');
 el.innerHTML=`<strong>Eintragungsfrist: ${deadline} Uhr</strong><p class="hint">Planungswoche ${date(d.week)}–${date(d.end)}</p><details ${open?'open':''}><summary>${complete?'✓ Alle Rückmeldungen vorhanden':late?'Frist abgelaufen · Rückmeldungen fehlen':'Rückmeldungen noch offen'}</summary><p>${d.answered} von ${d.total} Antworten. Eintrag oder ausdrücklich Frei zählt.</p>${d.missing_people.map(p=>`<p>${escapeHtml(p.name)}: ${p.missing} offen</p>`).join('')}<button onclick="openPlanningWeek('${d.week}')">Zeitraum bearbeiten</button><p class="hint">Personalbedarf und Rückmeldungen werden getrennt geprüft.</p></details>`;
}
async function openWithdrawal(day,period){
 if(cloudBusy||!cloudActor)return;
 if(isShiftLocked(getWeekKey(currentWeekStart),day,period)){cloudStatus(shiftLockText(getWeekKey(currentWeekStart),day),true);return;}
 const person=team.find(p=>p.name===currentUser),week=getWeekKey(currentWeekStart);if(!person||!isScheduled(db[week]?.shifts[currentUser]?.[day]?.[period]))return;
 withdrawalContext={week,id:person.id,day,period,revision:shiftRevision(person.id,day,period),late:null};
 const context=withdrawalContext;modalReturnFocus=document.activeElement;
 document.getElementById('withdrawDetails').textContent=`${person.name} · ${getDateForDay(daysOfWeek.findIndex(d=>d.key===day)).toLocaleDateString('de-DE')} · ${period==='tag'?'Tag':'Abend'}`;
 document.getElementById('withdrawMessage').value='';document.getElementById('withdrawReason').value='';document.getElementById('withdrawError').textContent='';
 document.getElementById('withdrawRule').textContent='Frist wird auf dem Server geprüft …';document.getElementById('withdrawSubmit').disabled=true;document.getElementById('withdrawReasons').hidden=true;
 document.getElementById('withdrawModal').hidden=false;document.querySelector('#withdrawModal button').focus();
 try{
 const {data,error}=await cloudClient.rpc('get_change_rule',{p_week:week});if(error)throw error;if(withdrawalContext!==context)return;
 context.late=data.late;
 document.getElementById('withdrawRule').textContent=data.late?'Die Frist ist abgelaufen. Kurze Grundauswahl genügt; Text ist freiwillig. Admin-Meldung nach zwei Minuten, sofern du nicht rückgängig machst.':'Vor der Frist: ohne Grund und ohne Admin-Meldung austragen. Alternativ kannst du Ersatz anfragen.';
 document.getElementById('withdrawReasons').hidden=!data.late;document.getElementById('withdrawSubmit').disabled=false;
 }catch(e){if(withdrawalContext===context)document.getElementById('withdrawError').textContent='Fristprüfung nicht möglich. '+cloudError(e);}
}
async function confirmWithdrawal(){
 const c=withdrawalContext;if(!c||c.late===null||cloudBusy)return;
 const reason=document.getElementById('withdrawReason').value,message=document.getElementById('withdrawMessage').value.trim();
 if(c.late&&!reason){document.getElementById('withdrawError').textContent='Bitte einen Grund auswählen oder Ersatz anfragen.';return;}
 const button=document.getElementById('withdrawSubmit');button.disabled=true;
 try{
 const saved=await cloudWrite('withdraw_shift',{p_week:c.week,p_user:c.id,p_day:c.day,p_period:c.period,p_revision:c.revision,p_message:message,p_reason:reason},data=>{lastUndo={...data,week:c.week,day:c.day,period:c.period};});
 if(saved){closeWithdrawal();renderUndo();cloudStatus(lastUndo.late?'Ausgetragen · Admin-Meldung nach zwei Minuten.':'Ausgetragen · Keine Admin-Meldung.');}
 else{document.getElementById('withdrawError').textContent='Änderung nicht bestätigt. Bitte Fenster schließen und mit dem aktuellen Plan erneut öffnen.';}
 }finally{button.disabled=false;}
}
function renderUndo(){
 const el=document.getElementById('undoNotice');el.hidden=!lastUndo||serverNow()>=Date.parse(lastUndo.undo_until)||(lastUndo&&isShiftLocked(lastUndo.week,lastUndo.day,lastUndo.period));
 if(!el.hidden){el.className='undo-toast';el.innerHTML=`<span>Ausgetragen · 2 Minuten rückgängig möglich</span><button onclick="undoLastWithdrawal()">Rückgängig</button>`;}
}
async function undoLastWithdrawal(){
 if(!lastUndo)return;const saved=await cloudWrite('undo_withdrawal',{p_id:lastUndo.id},()=>{lastUndo=null;});if(saved)cloudStatus('Austragung rückgängig.');renderUndo();
}
function openTransferFromWithdrawal(){if(!withdrawalContext)return;const c={...withdrawalContext};closeWithdrawal();openTransfer(c);}
function openTransfer(context,target){
 if(!context||cloudBusy)return;
 if(isShiftLocked(context.week,context.day,context.period)){cloudStatus(shiftLockText(context.week,context.day),true);return;}
 transferContext=context;modalReturnFocus=document.activeElement;
 const candidates=team.filter(p=>p.id!==context.id&&p.hasLogin&&!['se','kü','th','offen','u','k'].includes(db[context.week]?.shifts[p.name]?.[context.day]?.[context.period]||'-'));
 const pool=cloudPool.filter(p=>p.available);
 candidates.sort((a,b)=>Number(pool.some(p=>p.user_id===b.id))-Number(pool.some(p=>p.user_id===a.id))||a.name.localeCompare(b.name,'de'));
 document.getElementById('transferDetails').textContent=`${personName(context.id)} · ${context.week} · ${shortDay[context.day]} · ${context.period==='tag'?'Tag':'Abend'} · ${shiftRoleLabel(db[context.week]?.shifts[personName(context.id)]?.[context.day]?.[context.period])}`;
 document.getElementById('transferTarget').innerHTML='<option value="">Bitte auswählen</option>'+candidates.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}${pool.some(row=>row.user_id===p.id)?' · Springer-Pool':''}</option>`).join('');
 if(target&&candidates.some(p=>p.id===target))document.getElementById('transferTarget').value=target;
 document.getElementById('transferNote').value='';document.getElementById('transferError').textContent=candidates.length?'':'Für diese Schicht ist gerade niemand auswählbar.';
 document.getElementById('transferSubmit').disabled=!candidates.length;document.getElementById('transferModal').hidden=false;updateTargetAvailability();document.getElementById('transferTarget').focus();
}
function updateTargetAvailability(){const id=document.getElementById('transferTarget').value,p=cloudPool.find(p=>p.user_id===id&&p.available);document.getElementById('transferAvailability').textContent=p?'Springer-Hinweis: '+(p.note||'Für diese Woche im Pool. Bitte konkrete Übernahme bestätigen lassen.'):'Außerhalb des Springer-Pools. Bitte Rolle und Verfügbarkeit abstimmen.';}
document.getElementById('transferTarget').addEventListener('change',updateTargetAvailability);
function closeTransfer(){const el=document.getElementById('transferModal');if(!el)return;if(cloudBusy&&transferContext)return;el.hidden=true;transferContext=null;if(modalReturnFocus?.isConnected)modalReturnFocus.focus();}
async function submitTransfer(){
 if(!transferContext||cloudBusy)return;const c={...transferContext},target=document.getElementById('transferTarget').value;if(!target)return;
 document.getElementById('transferSubmit').disabled=true;
 try{const saved=await cloudWrite('request_transfer',{p_week:c.week,p_user:c.id,p_day:c.day,p_period:c.period,p_target:target,p_note:document.getElementById('transferNote').value.trim(),p_revision:c.revision});
 if(saved){closeTransfer();cloudStatus('Übernahme angefragt. Ursprüngliche Eintragung bleibt bis zur Bestätigung bestehen.');}else document.getElementById('transferError').textContent='Anfrage nicht bestätigt. Bitte aktuellen Plan prüfen.';
 }finally{document.getElementById('transferSubmit').disabled=false;}
}
function renderSpringer(){
 const el=document.getElementById('springerContainer'),person=team.find(p=>p.name===currentUser),week=getWeekKey(currentWeekStart);if(!person||!db[week]){el.innerHTML='';return;}
 const own=cloudPool.find(p=>p.user_id===person.id),pool=cloudPool.filter(p=>p.available&&team.some(m=>m.id===p.user_id));
 // Eingaben bleiben bei der automatischen Synchronisation erhalten.
 const oldInput=el.querySelector('#springerNote');const draft=oldInput&&document.activeElement===oldInput?oldInput.value:null;
 el.innerHTML=`<p class="sub">Wer könnte in dieser Woche einspringen? Der Pool ist freiwillig und ersetzt keine bestätigte Schicht.</p><section class="plain-card pool-controls"><h3>${escapeHtml(person.name)} · ${own?.available?'Im Pool':'Noch nicht im Pool'}</h3><label>Verfügbarkeit (freiwillig)<textarea id="springerNote" rows="2" maxlength="300" placeholder="Zum Beispiel: nur abends, außer Freitag">${escapeHtml(draft??own?.note??'')}</textarea></label><div class="actions"><button class="primary" onclick="saveSpringer(true)">${own?.available?'Hinweis speichern':'Als Springer eintragen'}</button>${own?.available?'<button onclick="saveSpringer(false)">Pool verlassen</button>':''}</div></section><section class="plain-card"><h3>Springer diese Woche · ${pool.length}</h3>${pool.map(p=>`<div class="pool-person"><strong>${escapeHtml(personName(p.user_id))}</strong><p>${escapeHtml(p.note||'Keine Einschränkung angegeben. Konkrete Übernahme bitte abstimmen.')}</p>${p.user_id!==person.id?`<button onclick="askSpringer('${p.user_id}')">Für meine Schicht anfragen</button>`:''}</div>`).join('')||'<p class="hint">Noch niemand im Pool. Tragt euch für diese Woche ein.</p>'}</section><h3>Übernahme-Anfragen</h3>${cloudTransfers.filter(t=>t.giver_id===person.id||t.taker_id===cloudActor?.id||cloudActor?.is_admin).map(t=>transferMarkup(t)).join('')||'<p class="hint">Keine Anfragen in dieser Woche.</p>'}`;
 if(draft!==null){const next=el.querySelector('#springerNote');next.focus();next.setSelectionRange(draft.length,draft.length);}
}
async function saveSpringer(available){
 const person=team.find(p=>p.name===currentUser);if(!person)return;
 const own=cloudPool.find(p=>p.user_id===person.id),note=document.getElementById('springerNote').value.trim();
 return cloudWrite('save_springer',{p_week:getWeekKey(currentWeekStart),p_user:person.id,p_available:available,p_note:note,p_revision:own?.revision||0});
}
function transferMarkup(t){
 const status=effectiveTransferStatus(t),labels={pending:'Bestätigung offen',accepted:'Übernahme bestätigt',rejected:'Abgelehnt · Bitte anderen Ersatz anfragen',cancelled:'Zurückgezogen',stale:'Plan geändert · Anfrage nicht mehr gültig'};
 const ownTarget=t.taker_id===cloudActor?.id;
 return `<article class="request-card"><strong>${escapeHtml(personName(t.giver_id))} → ${escapeHtml(personName(t.taker_id))}</strong><p class="hint">${shortDay[t.day]} · ${t.period==='tag'?'Tag':'Abend'} · ${escapeHtml(shiftRoleLabel(t.shift_value))}</p><p>${labels[status]}</p>${t.note?`<p class="hint">${escapeHtml(t.note)}</p>`:''}${status==='pending'&&ownTarget?`<div class="actions"><button class="primary" onclick="respondTransfer('${t.id}',true)">Übernehmen</button><button onclick="respondTransfer('${t.id}',false)">Ablehnen</button></div>`:''}${t.status==='pending'&&(t.giver_id===cloudActor?.id||cloudActor?.is_admin)?`<button onclick="cancelTransfer('${t.id}')">Anfrage zurückziehen</button>`:''}</article>`;
}
function renderIncomingRequests(){
 const el=document.getElementById('incomingRequests'),badge=document.getElementById('incomingCount');
 const incoming=cloudIncoming.filter(t=>t.status==='pending'&&t.taker_id===cloudActor?.id&&team.some(p=>p.id===t.giver_id));
 el.hidden=!incoming.length;badge.hidden=!incoming.length;badge.textContent=incoming.length||'';
 if(!incoming.length){el.innerHTML='';return;}
 el.innerHTML=`<h2>Du wurdest angefragt · ${incoming.length}</h2><p class="hint">Bitte bestätige oder lehne die Übernahme ab. Bis dahin bleibt die bisherige Person eingetragen.</p>`+incoming.map(t=>{
 const date=new Date(shiftDateKey(t.week,t.day)+'T12:00:00Z').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Berlin'}),locked=isShiftLocked(t.week,t.day,t.period);
 return `<article class="incoming-item"><strong>${escapeHtml(personName(t.giver_id))} fragt dich an</strong><p>${escapeHtml(date)} · ${t.period==='tag'?'Tagschicht':'Abendschicht'} · ${escapeHtml(shiftRoleLabel(t.shift_value))}</p>${t.note?`<p class="hint">${escapeHtml(t.note)}</p>`:''}${locked?'<p class="past-label">Schicht bereits abgeschlossen · Übernahme nicht mehr möglich</p>':''}<div class="actions"><button class="primary" ${locked?'disabled':''} onclick="respondTransfer('${t.id}',true)">Übernehmen</button><button class="secondary" onclick="respondTransfer('${t.id}',false)">Ablehnen</button></div></article>`;
 }).join('');
}
async function respondTransfer(id,accept){
 const saved=await cloudWrite('respond_transfer',{p_id:id,p_accept:accept});if(!saved)return;
 let t=cloudTransfers.find(t=>t.id===id);
 if(!t){const result=await cloudClient.from('shift_transfers').select('status').eq('id',id).maybeSingle();if(!result.error)t=result.data;}
 cloudStatus(t?.status==='stale'?'Plan geändert – Übernahme nicht ausgeführt.':t?.status==='accepted'?'Übernahme bestätigt.':t?.status==='rejected'?'Übernahme abgelehnt.':'Anfrage bearbeitet. Bitte aktuellen Status prüfen.');
}
function cancelTransfer(id){return cloudWrite('cancel_transfer',{p_id:id});}
function notificationContent(n){
 const t=n.transfer;if(!t)return `<p class="message-body">${escapeHtml(n.message)}</p>`;
 const date=new Date(t.date+'T12:00:00Z').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Berlin'}),shift=t.period==='tag'?'Tagschicht':'Abendschicht';
 let sentence=n.message;
 if(n.title==='Schichtübernahme angefragt')sentence=`${t.giver} bittet ${t.taker}, die ${shift} zu übernehmen.`;
 else if(['Übernahme bestätigt','Schichtübernahme bestätigt'].includes(n.title))sentence=`${t.taker} übernimmt die ${shift} von ${t.giver}.`;
 else if(n.title==='Übernahme abgelehnt')sentence=`${t.taker} kann die ${shift} von ${t.giver} nicht übernehmen. Bitte anderen Ersatz anfragen.`;
 const pending=n.title==='Schichtübernahme angefragt'&&t.status==='pending'&&t.taker_id===cloudActor?.id,locked=isShiftLocked(n.week,t.day,t.period);
 return `<p class="message-body">${escapeHtml(sentence)}</p><div class="notification-shift"><strong>${escapeHtml(date)}</strong><span>${shift} · ab ${t.period==='tag'?'10:30':'15:00'} Uhr</span><span>Aufgabe: ${escapeHtml(shiftRoleLabel(t.role))}</span></div>${t.note?`<p class="hint">Nachricht: ${escapeHtml(t.note)}</p>`:''}${pending?`<p class="hint">Bis zur Bestätigung bleibt ${escapeHtml(t.giver)} eingetragen.</p><div class="actions"><button class="primary" ${locked?'disabled':''} onclick="respondTransfer('${t.id}',true)">Übernehmen</button><button onclick="respondTransfer('${t.id}',false)">Ablehnen</button></div>`:''}${n.title==='Schichtübernahme angefragt'&&t.status!=='pending'?`<p class="hint">${({accepted:'Diese Anfrage wurde bereits bestätigt.',rejected:'Diese Anfrage wurde abgelehnt.',cancelled:'Diese Anfrage wurde zurückgezogen.',stale:'Der Plan wurde geändert; diese Anfrage ist nicht mehr gültig.'})[t.status]||'Diese Anfrage ist erledigt.'}</p>`:''}<button class="message-plan-link" onclick="closeInbox();openCapacityWeek('${n.week}','${t.day}')">Schicht im Tagesplan ansehen →</button>`;
}
function renderInbox(){
 document.getElementById('inboxTopButton').hidden=(cloudInbox.items?.length||0)<2;
 const count=cloudInbox.unread||0;document.getElementById('unreadCount').textContent=count;document.getElementById('unreadCount').hidden=count===0;document.getElementById('inboxButton').classList.toggle('has-unread',count>0);document.getElementById('inboxButton').setAttribute('aria-label',count?'Nachrichten, '+count+' ungelesen':'Nachrichten');
 document.getElementById('inboxMessages').innerHTML=cloudInbox.items?.length?cloudInbox.items.map(n=>`<article class="message-card"><strong>${escapeHtml(n.title)}</strong><p class="hint">${escapeHtml(new Date(n.created_at).toLocaleString('de-DE'))} · ${n.is_read?'Gelesen':'Neu'}</p>${notificationContent(n)}${!n.transfer&&n.kind==='transfer'?`<button onclick="closeInbox();openPlanningWeek('${n.week}')">Planungswoche ansehen →</button>`:''}${!n.is_read?`<button onclick="readNotification('${n.id}')">Als gelesen markieren</button>`:''}</article>`).join(''):'<p>Noch keine Nachrichten.</p>';
}
async function openRequestWeek(week){if(cloudBusy)return;closeInbox();closeWithdrawal();closeTransfer();closeSollModal();document.getElementById('noteEditBox').classList.add('hidden');currentWeekStart=new Date(week+'T12:00:00');cloudLoadedWeek=null;cloudDeadline=null;cloudRule=null;loadWeekData();switchTab('springer');renderApp();await cloudSync();}
function askSpringer(target){
 const person=team.find(p=>p.name===currentUser);if(!person)return;
 const week=getWeekKey(currentWeekStart),data=db[week],options=[];
 for(const d of daysOfWeek)for(const period of ['tag','abend'])if(!isShiftLocked(week,d.key,period)&&isScheduled(data.shifts[person.name]?.[d.key]?.[period])&&!pendingFor(person.id,d.key,period))options.push({day:d.key,period});
 if(!options.length){cloudStatus('Du hast in dieser Woche keine Schicht, für die du Ersatz anfragen kannst.',true);return;}
 // Konkrete Schicht zuerst auswählen. Keine automatische Wahl einer beliebigen Schicht.
 transferContext={week,id:person.id,target,choosing:true};modalReturnFocus=document.activeElement;
 document.getElementById('transferDetails').innerHTML=`Schicht für ${escapeHtml(person.name)} auswählen: <select id="springerShift" aria-label="Schicht auswählen">${options.map(o=>`<option value="${o.day}|${o.period}">${daysOfWeek.find(d=>d.key===o.day).label} · ${o.period==='tag'?'Tag':'Abend'}</option>`).join('')}</select>`;
 document.getElementById('transferTarget').innerHTML=`<option value="${target}">${escapeHtml(personName(target))}</option>`;
 document.getElementById('transferNote').value='';document.getElementById('transferError').textContent='';document.getElementById('transferSubmit').disabled=false;
 document.getElementById('transferModal').hidden=false;updateTargetAvailability();document.getElementById('springerShift').focus();
}
const submitTransferConcrete=submitTransfer;
submitTransfer=async function(){if(transferContext?.choosing){const [day,period]=document.getElementById('springerShift').value.split('|');Object.assign(transferContext,{day,period,revision:shiftRevision(transferContext.id,day,period)});}return submitTransferConcrete();};
// Transfer-Dialog mit Tastatur bedienen.
document.addEventListener('keydown',event=>{
 const modal=[document.getElementById('transferModal'),document.getElementById('sollModal')].find(el=>!el.hidden&&!el.classList.contains('hidden'));if(!modal)return;
 if(event.key==='Escape'){event.preventDefault();modal.id==='transferModal'?closeTransfer():closeSollModal();}
 if(event.key==='Tab'){const focusRoot=modal.id==='sollModal'&&!document.getElementById('editorConfirm').hidden?document.getElementById('editorConfirm'):modal;const items=[...focusRoot.querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&!el.closest('[hidden]'));const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});
const legacyChangeWeek=changeWeek;
changeWeek=async function(direction){if(cloudBusy)return;closeTransfer();closeWeekNotices();return legacyChangeWeek(direction);};
setInterval(renderUndo,1000);
switchTab('cards');
let settingsMode='bedarf',settingsSnapshot=null,planEditor=null,planEditorRequest=0;
function compactWeekRange(week){
 const end=shiftDateKey(week,'so'),startYear=week.slice(0,4),endYear=end.slice(0,4);
 const short=key=>key.slice(8,10)+'.'+key.slice(5,7)+'.';
 return short(week)+(startYear!==endYear?startYear:'')+' – '+short(end)+endYear;
}
function calendarWeekLabel(week){
 const thursday=new Date(week+'T12:00:00Z');thursday.setUTCDate(thursday.getUTCDate()+3);
 const year=thursday.getUTCFullYear(),start=new Date(Date.UTC(year,0,1,12));
 return 'KW '+Math.ceil(((thursday-start)/86400000+1)/7);
}
function selectedMonday(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T12:00:00Z')))return null;
 const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10);
}
async function selectPlanWeek(value){
 const current=getWeekKey(currentWeekStart),week=selectedMonday(value);document.getElementById('planWeek').value=current;
 if(!week||week===current||cloudBusy)return;
 return changeWeek((Date.parse(week+'T12:00:00Z')-Date.parse(current+'T12:00:00Z'))/604800000);
}
function inboxToTop(){
 document.getElementById('inboxPanel').scrollTo({top:0,behavior:'smooth'});
 document.getElementById('inboxTitle').focus({preventScroll:true});
}
function editorWeekLabel(week){return compactWeekRange(week);}
function editorMessage(text,error=false){const el=document.getElementById('editorStatus');el.textContent=text;el.classList.toggle('editor-error',error);}
function editorBusy(busy){if(planEditor)planEditor.busy=busy;document.querySelectorAll('#sollModal input,#sollModal textarea,#sollModal select,#sollModal button').forEach(el=>el.disabled=busy);}
function editorValues(){
 if(!planEditor)return null;
 if(settingsMode==='hinweise')return {note:document.getElementById('editorNote').value};
 const values={};for(const d of daysOfWeek)for(const period of ['tag','abend']){const id=(settingsMode==='bedarf'?'soll_':'res_')+d.key+'_'+period;values[id]=document.getElementById(id).value;}
 return values;
}
function editorDirty(){return !!planEditor&&JSON.stringify(editorValues())!==planEditor.baseline;}
function renderPlanEditor(data){
 settingsSnapshot=structuredClone(data);const week=planEditor.week;
 document.getElementById('sollTitle').textContent=({bedarf:'Bedarf',reservierungen:'Reservierungen',hinweise:'Hinweise für die Woche'})[settingsMode];
 document.getElementById('editorWeek').value=week;document.getElementById('editorWeekLabel').textContent=editorWeekLabel(week);document.getElementById('editorWeekKW').textContent=calendarWeekLabel(week);
 document.getElementById('sollModalContent').innerHTML=settingsMode==='hinweise'?`<label class="note-editor-label" for="editorNote">Wochenhinweis bearbeiten</label><p class="hint">Gilt für die gesamte Woche. Zum Löschen den Text entfernen und speichern.</p><textarea id="editorNote" rows="10" maxlength="4000" placeholder="Informationen, Veranstaltungen oder besondere Aufgaben für diese Woche …">${escapeHtml(data.note||'')}</textarea>`:daysOfWeek.map(d=>`<section class="plain-card"><h3>${d.label}, ${new Date(shiftDateKey(week,d.key)+'T12:00:00Z').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',timeZone:'Europe/Berlin'})}</h3>${['tag','abend'].map(period=>settingsMode==='bedarf'?`<label>Benötigte Personen · ${period==='tag'?'Tag':'Abend'}<input type="number" id="soll_${d.key}_${period}" value="${Number(data.soll[d.key]?.[period])||0}" min="0" max="50" step="1"></label>`:`<label>Reservierungen · ${period==='tag'?'Tag':'Abend'}<textarea id="res_${d.key}_${period}" rows="3" maxlength="300" placeholder="Uhrzeit · Personen · Hinweis">${escapeHtml((period==='tag'?data.resTag:data.resAbend)?.[d.key]||'')}</textarea></label>`).join('')}</section>`).join('');
 planEditor.baseline=JSON.stringify(editorValues());document.getElementById('sollModalContent').scrollTop=0;
 editorMessage('Woche auswählen und Einträge bearbeiten.');
}
function openSollModal(mode='bedarf'){
 if(!cloudActor?.is_admin||cloudBusy)return;
 if(planEditor){requestEditorAction(()=>{closeSollModal(true);openSollModal(mode);});return;}
 const week=getWeekKey(currentWeekStart),data=db[week];if(!data)return;
 settingsMode=['bedarf','reservierungen','hinweise'].includes(mode)?mode:'bedarf';
 planEditor={week,actor:cloudActor.id,session:cloudSession?.user.id,busy:false,pending:null};planEditorRequest++;
 renderPlanEditor(data);editorBusy(false);document.getElementById('editorConfirm').hidden=true;
 document.getElementById('sollModal').classList.remove('hidden');document.getElementById('editorCloseTop').focus();
}
function toggleNoteEdit(){openSollModal('hinweise');}
function closeSollModal(force=false){
 if(force){planEditorRequest++;planEditor=null;settingsSnapshot=null;document.getElementById('editorConfirm').hidden=true;document.getElementById('sollModal').classList.add('hidden');return true;}
 if(!planEditor)return true;
 if(planEditor.busy)return false;
 if(planEditor.pending){resolveEditorPrompt('cancel');return false;}
 requestEditorAction(()=>{closeSollModal(true);document.getElementById(settingsMode==='hinweise'?'noteEditButton':'userBadgeName').focus();});return !planEditor;
}
function requestEditorAction(action){
 if(!planEditor||planEditor.busy)return;
 if(!editorDirty()){return action();}
 planEditor.pending=action;document.querySelectorAll('#sollModal input,#sollModal textarea,#sollModal .editor-week-picker button,#sollModal .editor-actions button').forEach(el=>el.disabled=true);document.getElementById('editorConfirm').hidden=false;document.getElementById('editorPromptSave').focus();
}
async function resolveEditorPrompt(choice){
 const context=planEditor;if(!context||context.busy)return;
 const action=context.pending;
 if(choice==='cancel'){editorBusy(false);context.pending=null;document.getElementById('editorConfirm').hidden=true;document.getElementById('editorSave').focus();return;}
 if(choice==='save'&&!await savePlanEditor()){if(planEditor===context){context.pending=null;document.getElementById('editorConfirm').hidden=true;}return;}
 if(planEditor!==context)return;
 editorBusy(false);context.pending=null;document.getElementById('editorConfirm').hidden=true;if(action)await action();
}
function changeEditorWeek(direction){if(!planEditor)return;return selectEditorWeek(shiftDateKey(planEditor.week,direction>0?'so':'mo'),direction);}
function selectEditorWeek(value,direction=0){
 if(!planEditor||planEditor.busy)return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T12:00:00Z'))){document.getElementById('editorWeek').value=planEditor.week;return;}
 const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7+(direction?direction*7:0));
 const week=date.toISOString().slice(0,10);document.getElementById('editorWeek').value=planEditor.week;if(week===planEditor.week)return;
 return requestEditorAction(()=>loadEditorWeek(week));
}
async function loadEditorWeek(week){
 const context=planEditor;if(!context)return;
 const request=++planEditorRequest;editorBusy(true);editorMessage('Woche wird geladen …');
 try{
  const {data,error}=await cloudClient.from('week_settings').select('*').eq('week',week).maybeSingle();if(error)throw error;
  if(planEditor!==context||request!==planEditorRequest||cloudActor?.id!==context.actor||cloudSession?.user.id!==context.session)return;
  const snapshot=cloudBlankWeek();if(data)Object.assign(snapshot,{soll:data.requirements,resTag:data.reservations_day,resAbend:data.reservations_evening,note:data.note,noteRevision:data.note_revision,settingsRevision:data.settings_revision});
  context.week=week;renderPlanEditor(snapshot);
 }catch(error){if(planEditor===context)editorMessage('Woche konnte nicht geladen werden. '+cloudError(error),true);}
 finally{if(planEditor===context)editorBusy(false);}
}
async function savePlanEditor(){
 const context=planEditor;if(!context||context.busy||!cloudActor?.is_admin||cloudActor.id!==context.actor||cloudSession?.user.id!==context.session)return false;
 const values=editorValues(),snapshot=structuredClone(settingsSnapshot),noteMode=settingsMode==='hinweise';
 if(noteMode){if(values.note.length>4000){editorMessage('Der Wochenhinweis darf maximal 4000 Zeichen enthalten.',true);return false;}snapshot.note=values.note;}
 else for(const d of daysOfWeek)for(const period of ['tag','abend']){
  const id=(settingsMode==='bedarf'?'soll_':'res_')+d.key+'_'+period,value=values[id];
  if(settingsMode==='bedarf'){
   const number=Number(value);if(value.trim()===''||!Number.isInteger(number)||number<0||number>50){editorMessage('Personalbedarf muss eine ganze Zahl zwischen 0 und 50 sein.',true);document.getElementById(id).focus();return false;}snapshot.soll[d.key][period]=number;
  }else{if(value.length>300){editorMessage('Reservierungen dürfen maximal 300 Zeichen pro Schicht enthalten.',true);document.getElementById(id).focus();return false;}(period==='tag'?snapshot.resTag:snapshot.resAbend)[d.key]=value;}
 }
 editorBusy(true);editorMessage('Wird gespeichert …');
 try{
  const saved=await cloudWrite(noteMode?'save_week_note':'save_week_settings',noteMode?{p_week:context.week,p_note:snapshot.note,p_revision:snapshot.noteRevision}:{p_week:context.week,p_requirements:snapshot.soll,p_day:snapshot.resTag,p_evening:snapshot.resAbend,p_revision:snapshot.settingsRevision});
  if(planEditor!==context)return false;
  if(!saved){editorMessage(document.getElementById('syncStatus').textContent+' Deine Eingaben bleiben erhalten. Mit „Neu laden“ kannst du den aktuellen Stand abrufen.',true);return false;}
  if(noteMode)snapshot.noteRevision++;else snapshot.settingsRevision++;
  settingsSnapshot=snapshot;context.baseline=JSON.stringify(values);
  editorMessage('✓ Woche '+editorWeekLabel(context.week)+' gespeichert.');document.getElementById('sollModalContent').scrollTop=0;return true;
 }catch(error){if(planEditor===context)editorMessage(cloudError(error)+' Deine Eingaben bleiben erhalten.',true);return false;}
 finally{if(planEditor===context)editorBusy(false);}
}
function saveSollSettings(){return savePlanEditor();}
function saveWeekNote(){return savePlanEditor();}
function reloadEditorWeek(){if(planEditor)return requestEditorAction(()=>loadEditorWeek(planEditor.week));}
document.addEventListener('input',event=>{if(planEditor&&!planEditor.busy&&event.target.closest?.('#sollModalContent'))editorMessage('Änderungen noch nicht gespeichert.');});
window.addEventListener('beforeunload',event=>{if(editorDirty()){event.preventDefault();event.returnValue='';}});

if(window.ResizeObserver)new ResizeObserver(entries=>document.documentElement.style.setProperty('--header-height',entries[0].target.getBoundingClientRect().height+'px')).observe(document.querySelector('.app-header'));

if(window.ResizeObserver)new ResizeObserver(entries=>document.documentElement.style.setProperty('--nav-height',entries[0].target.getBoundingClientRect().height+'px')).observe(document.querySelector('.bottom-nav'));

let lastShiftClockKey='';
function refreshShiftClock(){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(new Date(serverNow()));const clockKey=berlinToday()+'|'+(Number(parts)>=15);if(clockKey!==lastShiftClockKey){lastShiftClockKey=clockKey;if(currentUser&&db[getWeekKey(currentWeekStart)]){renderDayViews();renderMyShiftsTab();renderUndo();renderIncomingRequests();}}}
setInterval(refreshShiftClock,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshShiftClock();});

function renderCapacityWarning(){
 const el=document.getElementById('capacityWarning');el.hidden=!cloudCapacity.length;if(!cloudCapacity.length){el.innerHTML='';return;}
 const open=el.querySelector('details')?.open||false;
 const total=cloudCapacity.reduce((n,a)=>n+a.missing,0);
 el.innerHTML=`<strong>⚠ Personal fehlt trotz abgelaufener Rückmeldefrist</strong><p>${cloudCapacity.length} Schichten unterbesetzt · ${total} Plätze offen</p><details ${open?'open':''}><summary>Betroffene Schichten anzeigen</summary>${cloudCapacity.map(a=>{const date=new Date(a.date+'T12:00:00Z').toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'Europe/Berlin'});return `<div class="capacity-row"><span>${escapeHtml(date)} · ${a.period==='tag'?'Tag':'Abend'} · ${a.filled}/${a.required} besetzt</span><button onclick="openCapacityWeek('${a.week}','${a.day}')">${a.missing} ${a.missing===1?'Platz offen':'Plätze offen'} →</button></div>`;}).join('')}</details>`;
}
async function openCapacityWeek(week,day){if(planEditor){requestEditorAction(()=>{closeSollModal(true);return openCapacityWeek(week,day);});return;}if(cloudBusy)return;closeWithdrawal();closeTransfer();closeSollModal();closeWeekNotices();focusDay=day;currentWeekStart=new Date(week+'T12:00:00');cloudLoadedWeek=null;cloudDeadline=null;cloudRule=null;loadWeekData();switchTab('cards');renderApp();await cloudSync();}


async function navigateWeekAtDays(direction){
 if(cloudBusy)return;const y=window.scrollY;await changeWeek(direction);
 const days=visibleDays();focusDay=(direction>0?days[0]:days.at(-1))?.key||'di';renderDayViews();
 window.scrollTo({top:y,behavior:'instant'});
}
let daySwipe=null;
document.addEventListener('touchstart',event=>{
 const track=event.target.closest?.('.day-track');if(!track||event.touches.length!==1){daySwipe=null;return;}
 const touch=event.touches[0];daySwipe={track,x:touch.clientX,y:touch.clientY,start:track.scrollLeft,max:Math.max(0,track.scrollWidth-track.clientWidth),week:getWeekKey(currentWeekStart)};
},{passive:true});
document.addEventListener('touchend',event=>{
 const swipe=daySwipe;daySwipe=null;if(!swipe||!event.changedTouches.length||cloudBusy||swipe.week!==getWeekKey(currentWeekStart))return;
 const touch=event.changedTouches[0],dx=touch.clientX-swipe.x,dy=touch.clientY-swipe.y;
 if(Math.abs(dx)<50||Math.abs(dx)<Math.abs(dy)*1.5)return;
 // Erst Tage scrollen; ein weiterer Wisch über den Rand öffnet die nächste/vorherige Woche.
 if(dx<0&&swipe.start>=swipe.max-3)navigateWeekAtDays(1);
 else if(dx>0&&swipe.start<=3)navigateWeekAtDays(-1);
},{passive:true});
document.addEventListener('touchcancel',()=>{daySwipe=null;},{passive:true});

let assignmentWeek=null;
function openAdminAssignment(){
 if(!cloudActor?.is_admin||cloudBusy)return;assignmentWeek=getWeekKey(currentWeekStart);
 document.getElementById('assignmentWeek').textContent='Ab der ausgewählten Woche: '+document.getElementById('weekTitle').textContent;
 document.getElementById('assignmentPerson').innerHTML=team.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
 document.getElementById('assignmentDays').innerHTML=daysOfWeek.map(d=>`<div class="assignment-day"><strong>${shortDay[d.key]}</strong>${['tag','abend'].map(period=>`<select id="assignment_${d.key}_${period}" aria-label="${d.label} ${period==='tag'?'Tagschicht':'Abendschicht'}"><option value="">—</option><option value="se">Service/Theke</option><option value="kü">Küche</option></select>`).join('')}</div>`).join('');
 document.getElementById('assignmentWeeks').value=1;document.getElementById('assignmentResult').textContent='';
 document.getElementById('assignmentFields').disabled=false;
 for(const id of ['assignmentDone'])document.getElementById(id).hidden=true;
 for(const id of ['assignmentSubmit','assignmentCancel'])document.getElementById(id).hidden=false;
 document.getElementById('assignmentModal').hidden=false;document.getElementById('assignmentPerson').focus();
}
function closeAdminAssignment(){if(cloudBusy)return;document.getElementById('assignmentModal').hidden=true;assignmentWeek=null;}
function assignmentPattern(){return daysOfWeek.flatMap(d=>['tag','abend'].map(period=>({day:d.key,period,role:document.getElementById(`assignment_${d.key}_${period}`).value}))).filter(item=>item.role);}
async function submitAdminAssignment(){
 if(!assignmentWeek||!cloudActor?.is_admin||cloudBusy)return;
 const pattern=assignmentPattern();if(!pattern.length){document.getElementById('assignmentResult').textContent='Bitte mindestens eine Schicht in der Wochenvorlage auswählen.';return;}
 const button=document.getElementById('assignmentSubmit');button.disabled=true;
 try{const saved=await cloudWrite('assign_week_template',{p_start:assignmentWeek,p_user:document.getElementById('assignmentPerson').value,p_pattern:pattern,p_weeks:Number(document.getElementById('assignmentWeeks').value)},result=>{
 const assigned=result.items.filter(item=>item.status==='assigned').length;
 document.getElementById('assignmentResult').textContent=`Gespeichert: ${assigned} Schichten neu zugewiesen.\n\n`+result.items.map(item=>`${new Date(item.date+'T12:00:00Z').toLocaleDateString('de-DE')} · ${item.period==='tag'?'Tag':'Abend'} · ${shiftRoleLabel(item.role)}: ${({assigned:'Zugewiesen',full:'Übersprungen – Bedarf gedeckt, Admins informiert',past:'Abgeschlossen – übersprungen',unavailable:'Frei/Abwesenheit bestätigt – übersprungen',existing:'Bereits eingeplant – unverändert'})[item.status]||item.status}`).join('\n');
 document.getElementById('assignmentFields').disabled=true;button.hidden=true;document.getElementById('assignmentCancel').hidden=true;document.getElementById('assignmentDone').hidden=false;
 });if(!saved)document.getElementById('assignmentResult').textContent='Nicht gespeichert. Bitte die Meldung zum Synchronisationsstatus prüfen.';
 else document.getElementById('assignmentDone').focus();
 }finally{button.disabled=false;}
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('assignmentModal').hidden)closeAdminAssignment();});

document.addEventListener('click',event=>{const menu=document.getElementById('accountMenu');if(menu.open&&!menu.contains(event.target))menu.open=false;});
document.addEventListener('keydown',event=>{const menu=document.getElementById('accountMenu');if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}});

function roleConfirmationButtons(id,day,period){return `<div class="role-confirmation"><p class="hint">Eingeplant · Aufgabe festlegen:</p><div class="my-buttons"><button onclick="confirmShiftRole('${id}','${day}','${period}','se')">Service/Theke</button><button onclick="confirmShiftRole('${id}','${day}','${period}','kü')">Küche</button></div></div>`;}
async function confirmShiftRole(id,day,period,value){
 const week=getWeekKey(currentWeekStart);if(!['se','kü'].includes(value)||isShiftLocked(week,day,period))return;
 return cloudWrite('confirm_shift_role',{p_week:week,p_user:id,p_day:day,p_period:period,p_value:value,p_revision:shiftRevision(id,day,period)},()=>cloudStatus('Aufgabe bestätigt. Die Schicht bleibt eingeplant.'));
}
function closeEmployees(){if(cloudBusy)return;document.getElementById('employeesModal').hidden=true;}
function renderEmployees(){
 document.getElementById('employeesList').innerHTML=team.map(p=>`<div class="employee-row"><strong>${escapeHtml(p.name)}</strong><span>${p.hasLogin?'Zugang verbunden':'Ohne Login · einplanbar'}</span></div>`).join('');
 const select=document.getElementById('employeeLinkPerson'),selected=select.value,unlinked=team.filter(p=>!p.hasLogin);
 select.innerHTML=unlinked.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');if(unlinked.some(p=>p.id===selected))select.value=selected;
 document.getElementById('employeeLinkForm').hidden=!unlinked.length||!!window.heidersDemoActive;
}
function openEmployees(){if(!cloudActor?.is_admin||cloudBusy)return;document.getElementById('employeeName').value='';document.getElementById('employeeEmail').value='';document.getElementById('employeeResult').textContent='';document.getElementById('employeesModal').hidden=false;renderEmployees();}
async function createEmployee(){
 if(!cloudActor?.is_admin||cloudBusy)return;
 const input=document.getElementById('employeeName'),name=input.value.trim();if(!name)return;
 const saved=await cloudWrite('create_employee',{p_name:name});if(saved){input.value='';document.getElementById('employeeResult').textContent=name+' angelegt. Schichten können jetzt zugewiesen werden.';renderEmployees();}
}
async function linkEmployeeLogin(){
 if(!cloudActor?.is_admin||cloudBusy||window.heidersDemoActive)return;
 const saved=await cloudWrite('link_employee_login',{p_user:document.getElementById('employeeLinkPerson').value,p_email:document.getElementById('employeeEmail').value.trim()});if(saved){document.getElementById('employeeEmail').value='';document.getElementById('employeeResult').textContent='Zugang verbunden. Alle Schichten bleiben erhalten.';renderEmployees();}
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('employeesModal').hidden)closeEmployees();});

function shiftTimeHint(name,day,period){const source=db[getWeekKey(currentWeekStart)]?.shiftSources?.[name]?.[day]?.[period]||{},raw=source.text||'',time=raw.match(/(?:ab\s*)?\d[^)]*/i)?.[0];return (source.task?`<p class="special-task">Sonderaufgabe: ${escapeHtml(source.task)}</p>`:'')+(time?`<p class="hint">Zeitangabe aus dem Plan: ${escapeHtml(time)}</p>`:'');}
