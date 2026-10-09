'use strict';
// Reservierungen bleiben im vorhandenen Speicherformat (Text pro Schicht) kompatibel.
function reservationItems(value){
 try{const data=JSON.parse(value);if(data?.version===1&&Array.isArray(data.items)&&data.items.every(r=>r&&typeof r==='object'&&typeof r.time==='string'&&typeof r.note==='string'))return data.items;}catch(_){}
 return value?.trim()?[{time:'',people:'',note:String(value),legacy:true}]:[];
}
function reservationText(value){return reservationItems(value).map(r=>[r.time,r.people?`${r.people} ${Number(r.people)===1?'Person':'Personen'}`:'',r.note].filter(Boolean).join(' · ')).join('\n');}
let reservationDraft=new Map();
function reservationFields(id){
 const rows=reservationDraft.get(id)||[];
 return rows.map((r,i)=>`<div class="reservation-form-row"><div class="reservation-selects"><label>Uhrzeit<input type="time" step="900" id="${id}_time_${i}" value="${escapeHtml(r.time)}" oninput="updateReservation('${id}')"></label><label>Personen<select id="${id}_people_${i}" onchange="updateReservation('${id}')"><option value="">Auswählen</option>${Array.from({length:100},(_,n)=>`<option value="${n+1}" ${Number(r.people)===n+1?'selected':''}>${n+1}</option>`).join('')}</select></label></div><label>${r.legacy?'Bisheriger Eintrag / Hinweis':'Hinweis (optional)'}<textarea id="${id}_note_${i}" rows="2" maxlength="300" placeholder="Zum Beispiel Name oder Besonderheiten" oninput="updateReservation('${id}')">${escapeHtml(r.note)}</textarea></label>${r.legacy?'<p class="hint">Der bisherige Text bleibt erhalten. Uhrzeit und Personen kannst du ergänzen.</p>':''}<button type="button" class="text-action" onclick="removeReservation('${id}',${i})">Eintrag entfernen</button></div>`).join('')+`<button type="button" class="outline-button" onclick="addReservation('${id}')">+ Reservierung</button>`;
}
function readReservationRows(id){return(reservationDraft.get(id)||[]).map((r,i)=>({...r,time:document.getElementById(`${id}_time_${i}`).value,people:document.getElementById(`${id}_people_${i}`).value,note:document.getElementById(`${id}_note_${i}`).value}));}
function encodeReservation(rows){
 const items=rows.filter(r=>r.time||r.people||r.note.trim()).map(r=>({time:r.time,people:r.people?Number(r.people):null,note:r.note.trim(),...(r.legacy&&!r.time&&!r.people?{legacy:true}:{})}));
 return items.length?JSON.stringify({version:1,items}):'';
}
function updateReservation(id){if(!planEditor||planEditor.busy||planEditor.pending)return;const rows=readReservationRows(id);reservationDraft.set(id,rows);document.getElementById(id).value=encodeReservation(rows);editorMessage('Änderungen noch nicht gespeichert.');}
function addReservation(id){if(!planEditor||planEditor.busy||planEditor.pending)return;updateReservation(id);const rows=reservationDraft.get(id);if(rows.length>=12){editorMessage('Maximal 12 Reservierungen pro Schicht.',true);return;}rows.push({time:'',people:'',note:''});document.getElementById(id+'_fields').innerHTML=reservationFields(id);document.getElementById(`${id}_time_${rows.length-1}`).focus();}
function removeReservation(id,i){if(!planEditor||planEditor.busy||planEditor.pending)return;updateReservation(id);reservationDraft.get(id).splice(i,1);document.getElementById(id).value=encodeReservation(reservationDraft.get(id));document.getElementById(id+'_fields').innerHTML=reservationFields(id);}
const renderPlanEditorBeforeReservations=renderPlanEditor;
renderPlanEditor=function(data){
 reservationDraft.clear();renderPlanEditorBeforeReservations(data);
 if(settingsMode!=='reservierungen')return;
 for(const d of daysOfWeek)for(const period of ['tag','abend']){
  const id=`res_${d.key}_${period}`,input=document.getElementById(id),rows=reservationItems(input.value);
  reservationDraft.set(id,rows.length?rows:[{time:'',people:'',note:''}]);
  input.hidden=true;const original=input.parentElement,section=document.createElement('section'),heading=document.createElement('h4'),fields=document.createElement('div');heading.textContent='Reservierungen · '+(period==='tag'?'Tag':'Abend');fields.id=id+'_fields';fields.innerHTML=reservationFields(id);original.replaceWith(section);section.append(heading,input,fields);
 }
 planEditor.baseline=JSON.stringify(editorValues());
};
const savePlanEditorBeforeReservations=savePlanEditor;
savePlanEditor=async function(){
 if(settingsMode==='reservierungen')for(const[id]of reservationDraft){
  // Original legacy strings may remain untouched; validate only structured values.
  const stored=document.getElementById(id).value;if(!stored.startsWith('{'))continue;
  for(const r of reservationItems(stored))if(!r.legacy&&(!/^\d{2}:\d{2}$/.test(r.time)||Number(r.time.slice(0,2))>23||Number(r.time.slice(3))>59||!Number.isInteger(Number(r.people))||Number(r.people)<1||Number(r.people)>100)){editorMessage('Bitte Uhrzeit und Personenzahl auswählen oder den unvollständigen Eintrag entfernen.',true);return false;}
 }
 return savePlanEditorBeforeReservations();
};
// Beim Tageswechsel sowie nach einer Rückkehr aus dem Hintergrund dem Berliner Datum folgen.
let lastPlanDate=berlinToday(),pendingPlanDate=null;
function applyTodayToPlan(today){
 const monday=selectedMonday(today),parts=monday.split('-').map(Number);
 currentWeekStart=new Date(parts[0],parts[1]-1,parts[2],12);
 focusDay=daysOfWeek[(new Date(today+'T12:00:00Z').getUTCDay()+6)%7].key;
 if(daysOfWeek.find(d=>d.key===focusDay)?.isSpecial){showSpecialDays=true;document.getElementById('specialDaysBtn').innerText='✓ Mo & So sichtbar';document.getElementById('specialDaysBtn').setAttribute('aria-pressed','true');}
}
function planDayChangeBlocked(){return cloudBusy||!!planEditor||!!withdrawalContext||!!transferContext||!!absenceContext||!document.getElementById('assignmentModal').hidden;}
function refreshPlanDate(){
 const today=berlinToday();if(today!==lastPlanDate){pendingPlanDate=today;lastPlanDate=today;}
 if(!pendingPlanDate||planDayChangeBlocked())return;
 applyTodayToPlan(pendingPlanDate);pendingPlanDate=null;
 if(currentUser){renderApp();cloudSync();}
}
applyTodayToPlan(lastPlanDate);
setInterval(refreshPlanDate,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshPlanDate();if(typeof refreshTimeClock==='function')refreshTimeClock();}});
window.addEventListener('pageshow',refreshPlanDate);
window.addEventListener('focus',refreshPlanDate);
