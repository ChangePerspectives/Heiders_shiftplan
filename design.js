'use strict';
let focusDay='do',activeTab='cards',transferContext=null,lastUndo=null;
const shortDay={mo:'Mo',di:'Di',mi:'Mi',do:'Do',fr:'Fr',sa:'Sa',so:'So'};
function serverNow(){return Date.now()+cloudServerOffset;}
function berlinToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(serverNow()));}
function shiftDateKey(week,day){const i=['mo','di','mi','do','fr','sa','so'].indexOf(day);const d=new Date(week+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);}
function isPastShift(week,day){return shiftDateKey(week,day)<berlinToday();}
function closeWeekNotices(){document.querySelectorAll('#appMain details').forEach(el=>el.open=false);document.getElementById('noteEditBox').classList.add('hidden');}

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
 const picker=days.map(d=>`<button class="${d.key===focusDay?'active':''}" aria-pressed="${d.key===focusDay}" onclick="selectFocusDay('${d.key}')">${shortDay[d.key]}<span>${getDateForDay(daysOfWeek.indexOf(d)).getDate()}</span></button>`).join('');
 document.getElementById('dayPickerCards').innerHTML=picker;document.getElementById('dayPickerTeam').innerHTML=picker;
 document.getElementById('dailyCardsContainer').innerHTML=dayMarkup(true);
 document.getElementById('teamDayContainer').innerHTML=dayMarkup(false);
}
function dayMarkup(edit){
 const data=db[getWeekKey(currentWeekStart)],day=focusDay,index=daysOfWeek.findIndex(d=>d.key===day);
 let html=`<h2 class="day-title">${daysOfWeek[index].label}, ${getDateForDay(index).toLocaleDateString('de-DE',{day:'numeric',month:'long'})}</h2>`;
 for(const period of ['tag','abend']){
 const staff=team.filter(p=>isScheduled(data.shifts[p.name]?.[day]?.[period]));
 const needed=data.soll[day]?.[period]||0,open=Math.max(0,needed-staff.length),res=(period==='tag'?data.resTag:data.resAbend)?.[day];
 html+=`<article class="shift-card"><div class="shift-heading"><h3>${period==='tag'?'☀ Tagschicht':'☾ Abendschicht'}</h3><span class="${open?'open-slot':'occupancy'}">${open?open+' '+(open===1?'Platz frei':'Plätze frei'):staff.length+' von '+needed+' besetzt'}</span></div><p class="hint">${period==='tag'?'Ab 10:30 Uhr':'Ab 15:00 Uhr'}</p><ul class="roster">${staff.map(p=>{
 const transfer=pendingFor(p.id,day,period);
 return `<li><div class="person-line"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(shiftRoleLabel(data.shifts[p.name][day][period]))}</span></div>${transfer?`<div class="transfer-status">Übernahme bei ${escapeHtml(personName(transfer.taker_id))} angefragt · Bestätigung offen</div>`:''}</li>`;
 }).join('')}</ul>${!staff.length?'<p class="hint">Noch niemand eingetragen.</p>':''}<div class="reservation"><strong>Reservierungen · ${period==='tag'?'Tag':'Abend'}</strong>${res?escapeHtml(res):'Keine Reservierungen hinterlegt.'}</div>${edit?renderClaimAction(day,period):''}</article>`;
 }
 return html;
}
function renderClaimAction(day,period){
 const person=team.find(p=>p.name===currentUser),data=db[getWeekKey(currentWeekStart)],value=data?.shifts[currentUser]?.[day]?.[period];if(!person)return '';
 if(isPastShift(getWeekKey(currentWeekStart),day))return '<p class="past-label">Abgeschlossen · Nur ansehen</p>';
 const pending=pendingFor(person.id,day,period);
 if(isScheduled(value))return pending?`<p class="hint">Übernahme angefragt. Bis zur Bestätigung bleibt die Eintragung bestehen.</p><button class="wide secondary" onclick="cancelTransfer('${pending.id}')">Anfrage zurückziehen</button>`:`<button class="wide secondary" onclick="openWithdrawal('${day}','${period}')">Eingetragen · Ändern</button>`;
 return `<button class="wide primary" onclick="quickClaim('${day}','${period}')">${person.id===cloudActor?.id?'Mich':'Ausgewählte Person'} eintragen</button>`;
}
function renderMyShiftsTab(){
 const data=db[getWeekKey(currentWeekStart)],person=team.find(p=>p.name===currentUser);if(!data||!person)return;
 document.getElementById('myShiftsList').innerHTML=visibleDays().map(d=>`<article class="my-day"><h3>${d.label}, ${formatDateShort(getDateForDay(daysOfWeek.indexOf(d)))}</h3>${['tag','abend'].map(period=>{
 const past=isPastShift(getWeekKey(currentWeekStart),d.key),value=data.shifts[person.name]?.[d.key]?.[period]||'-',answered=shiftAnswered(getWeekKey(currentWeekStart),person.id,d.key,period),pending=pendingFor(person.id,d.key,period);
 return `<div class="my-period"><strong>${period==='tag'?'Tag':'Abend'} · ${answered?escapeHtml(shiftRoleLabel(value)):'Noch offen'}</strong>${past?'<p class="past-label">Abgeschlossen · Nur ansehen</p>':''}${pending?`<p class="transfer-status">${escapeHtml(personName(pending.taker_id))} angefragt · Bestätigung offen</p>`:''}<div class="my-buttons"><button class="${value==='se'?'selected':''}" ${past||isScheduled(value)?'disabled':''} onclick="updateShift('${d.key}','${period}','se')">Service/Theke</button><button class="${value==='kü'?'selected':''}" ${past||isScheduled(value)?'disabled':''} onclick="updateShift('${d.key}','${period}','kü')">Küche</button><button ${past||(value==='-'&&answered)?'disabled':''} onclick="updateShift('${d.key}','${period}','-')">${isScheduled(value)?'Ändern …':'Frei bestätigen'}</button></div></div>`;
 }).join('')}</article>`).join('');
}
function renderApp(){
 const week=getWeekKey(currentWeekStart);loadWeekData();
 document.getElementById('weekTitle').textContent=currentWeekStart.toLocaleDateString('de-DE',{day:'numeric',month:'long'});
 const end=getDateForDay(6);document.getElementById('weekRange').textContent=`${formatDateShort(currentWeekStart)}–${formatDateShort(end)}${end.getFullYear()}`;
 document.getElementById('noteDisplay').textContent=db[week].note||'Keine Hinweise für diese Woche.';
 renderDayViews();renderMyShiftsTab();renderSpringer();renderUndo();renderDeadline();
}
function renderDeadline(){
 const d=cloudDeadline,el=document.getElementById('deadlinePanel');
 if(!d){el.className='notice';el.innerHTML='<p class="hint">Eintragungsfrist für die gewählte Woche wird geladen …</p>';return;}
 const open=el.querySelector('details')?.open||false,complete=d.answered>=d.total,late=serverNow()>Date.parse(d.deadline);
 const date=s=>new Date(s+'T12:00:00Z').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Berlin'});
 const deadline=new Date(d.deadline).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 el.className='notice deadline-'+(complete?'complete':late?'late':'open');
 el.innerHTML=`<strong>Eintragungsfrist: ${deadline} Uhr</strong><p class="hint">Zweiwochenblock ${date(d.week)}–${date(d.end)}</p><details ${open?'open':''}><summary>${complete?'✓ Alle Rückmeldungen vorhanden':late?'Frist abgelaufen · Rückmeldungen fehlen':'Rückmeldungen noch offen'}</summary><p>${d.answered} von ${d.total} Antworten. Eintrag oder ausdrücklich Frei zählt.</p>${d.missing_people.map(p=>`<p>${escapeHtml(p.name)}: ${p.missing} offen</p>`).join('')}<button onclick="openPlanningWeek('${d.week}')">Zeitraum bearbeiten</button><p class="hint">Personalbedarf und Rückmeldungen werden getrennt geprüft.</p></details>`;
}
async function openWithdrawal(day,period){
 if(cloudBusy||!cloudActor)return;
 if(isPastShift(getWeekKey(currentWeekStart),day)){cloudStatus('Vergangene Tage können nicht bearbeitet werden.',true);return;}
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
 const saved=await cloudWrite('withdraw_shift',{p_week:c.week,p_user:c.id,p_day:c.day,p_period:c.period,p_revision:c.revision,p_message:message,p_reason:reason},data=>{lastUndo={...data,week:c.week};});
 if(saved){closeWithdrawal();renderUndo();cloudStatus(lastUndo.late?'Ausgetragen · Admin-Meldung nach zwei Minuten.':'Ausgetragen · Keine Admin-Meldung.');}
 else{document.getElementById('withdrawError').textContent='Änderung nicht bestätigt. Bitte Fenster schließen und mit dem aktuellen Plan erneut öffnen.';}
 }finally{button.disabled=false;}
}
function renderUndo(){
 const el=document.getElementById('undoNotice');el.hidden=!lastUndo||serverNow()>=Date.parse(lastUndo.undo_until);
 if(!el.hidden){el.className='undo-toast';el.innerHTML=`<span>Ausgetragen · 2 Minuten rückgängig möglich</span><button onclick="undoLastWithdrawal()">Rückgängig</button>`;}
}
async function undoLastWithdrawal(){
 if(!lastUndo)return;const saved=await cloudWrite('undo_withdrawal',{p_id:lastUndo.id},()=>{lastUndo=null;});if(saved)cloudStatus('Austragung rückgängig.');renderUndo();
}
function openTransferFromWithdrawal(){if(!withdrawalContext)return;const c={...withdrawalContext};closeWithdrawal();openTransfer(c);}
function openTransfer(context,target){
 if(!context||cloudBusy)return;
 if(isPastShift(context.week,context.day)){cloudStatus('Vergangene Tage können nicht bearbeitet werden.',true);return;}
 transferContext=context;modalReturnFocus=document.activeElement;
 const candidates=team.filter(p=>p.id!==context.id&&!['se','kü','th','u','k'].includes(db[context.week]?.shifts[p.name]?.[context.day]?.[context.period]||'-'));
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
async function respondTransfer(id,accept){const saved=await cloudWrite('respond_transfer',{p_id:id,p_accept:accept});if(saved){const t=cloudTransfers.find(t=>t.id===id);cloudStatus(t?.status==='stale'?'Plan geändert – Übernahme nicht ausgeführt.':accept?'Übernahme bestätigt.':'Übernahme abgelehnt.');}}
function cancelTransfer(id){return cloudWrite('cancel_transfer',{p_id:id});}
function renderInbox(){
 document.getElementById('unreadCount').textContent=cloudInbox.unread||0;
 document.getElementById('inboxMessages').innerHTML=cloudInbox.items?.length?cloudInbox.items.map(n=>`<article class="message-card"><strong>${escapeHtml(n.title)}</strong><p class="hint">${escapeHtml(new Date(n.created_at).toLocaleString('de-DE'))} · ${n.is_read?'Gelesen':'Neu'}</p><p class="message-body">${escapeHtml(n.message)}</p>${n.kind==='transfer'?`<button onclick="openRequestWeek('${n.week}')">Anfragen dieser Woche öffnen</button>`:''}${!n.is_read?`<button onclick="readNotification('${n.id}')">Als gelesen markieren</button>`:''}</article>`).join(''):'<p>Noch keine Nachrichten.</p>';
}
async function openRequestWeek(week){if(cloudBusy)return;closeInbox();closeWithdrawal();closeTransfer();closeSollModal();document.getElementById('noteEditBox').classList.add('hidden');currentWeekStart=new Date(week+'T12:00:00');cloudLoadedWeek=null;cloudDeadline=null;cloudRule=null;loadWeekData();switchTab('springer');renderApp();await cloudSync();}
function askSpringer(target){
 const person=team.find(p=>p.name===currentUser);if(!person)return;
 const week=getWeekKey(currentWeekStart),data=db[week],options=[];
 for(const d of daysOfWeek)for(const period of ['tag','abend'])if(!isPastShift(week,d.key)&&isScheduled(data.shifts[person.name]?.[d.key]?.[period])&&!pendingFor(person.id,d.key,period))options.push({day:d.key,period});
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
 if(event.key==='Tab'){const items=[...modal.querySelectorAll('button,select,textarea')].filter(el=>!el.disabled&&!el.closest('[hidden]'));const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});
const legacyChangeWeek=changeWeek;
changeWeek=async function(direction){if(cloudBusy)return;closeTransfer();closeWeekNotices();return legacyChangeWeek(direction);};
setInterval(renderUndo,1000);
switchTab('cards');
function openSollModal(){
 if(!cloudActor?.is_admin)return;
 const week=getWeekKey(currentWeekStart),data=db[week];if(!data)return;cloudEditWeek=week;cloudSettingsRevision=data.settingsRevision||0;
 document.getElementById('sollModalContent').innerHTML=daysOfWeek.map((d,index)=>`<section class="plain-card"><h3>${d.label}, ${formatDateShort(getDateForDay(index))}</h3>${['tag','abend'].map(period=>`<label>Personalbedarf · ${period==='tag'?'Tag':'Abend'}<input style="width:100%;margin:5px 0 10px" type="number" id="soll_${d.key}_${period}" value="${Number(data.soll[d.key]?.[period])||0}" min="0" max="50" step="1"></label><label>Reservierungen · ${period==='tag'?'Tag':'Abend'}<textarea id="res_${d.key}_${period}" rows="2" maxlength="300" placeholder="Uhrzeit · Personen · Hinweis">${escapeHtml((period==='tag'?data.resTag:data.resAbend)?.[d.key]||'')}</textarea></label>`).join('')}</section>`).join('');
 document.getElementById('sollModal').classList.remove('hidden');document.querySelector('#sollModal button').focus();
}

if(window.ResizeObserver)new ResizeObserver(entries=>document.documentElement.style.setProperty('--header-height',entries[0].target.getBoundingClientRect().height+'px')).observe(document.querySelector('.app-header'));
