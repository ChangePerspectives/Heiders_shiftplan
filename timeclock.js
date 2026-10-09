'use strict';
let timeClockData=null,timeClockBusy=false,timeClockRequest=0,timeClockActor=null,timeCorrection=null;
function timeMonthNow(){return berlinToday().slice(0,7);}
function timeFormat(stamp){return stamp?new Date(stamp).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}):'–';}
function durationText(seconds){const mins=Math.round(Math.max(0,seconds)/60);return Math.floor(mins/60)+':'+String(mins%60).padStart(2,'0');}
function timeEntrySeconds(entry,start=-Infinity,end=Infinity,now=serverNow()){
 if(entry.voided)return {gross:0,pause:0,net:0};
 const a=Math.max(Date.parse(entry.started_at),start),b=Math.min(entry.ended_at?Date.parse(entry.ended_at):now,end);if(b<=a)return {gross:0,pause:0,net:0};
 const pause=(entry.breaks||[]).reduce((sum,p)=>sum+Math.max(0,Math.min(p.end?Date.parse(p.end):now,b)-Math.max(Date.parse(p.start),a)),0)/1000;
 return {gross:(b-a)/1000,pause,net:Math.max(0,(b-a)/1000-pause)};
}
function berlinLocalValue(stamp){if(!stamp)return '';const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(stamp));return parts.replace(' ','T');}
function berlinLocalISO(value,original=null){
 if(original&&berlinLocalValue(original)===value)return original;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Bitte Datum und Uhrzeit vollständig eingeben.');
 const nominal=Date.parse(value+'Z'),matches=[];
 for(const offset of [60,120]){const stamp=new Date(nominal-offset*60000).toISOString();if(berlinLocalValue(stamp)===value)matches.push(stamp);}
 if(matches.length!==1)throw new Error(matches.length?'Diese Uhrzeit ist bei der Zeitumstellung doppeldeutig. Bitte eine eindeutige Uhrzeit wählen.':'Diese Uhrzeit existiert nicht. Bitte Datum und Uhrzeit prüfen.');return matches[0];
}
function timeMonthBounds(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Bitte einen gültigen Monat auswählen.');const[y,m]=month.split('-').map(Number),next=new Date(Date.UTC(y,m,1));return [Date.parse(berlinLocalISO(month+'-01T00:00')),Date.parse(berlinLocalISO(next.toISOString().slice(0,7)+'-01T00:00'))];}
function timeError(message){document.getElementById('timeClockError').textContent=message;cloudStatus(message,true);}
function clearTimeClock(){timeClockRequest++;timeClockData=null;timeClockActor=null;timeCorrection=null;timeClockBusy=false;document.getElementById('timeClockBar').hidden=true;document.getElementById('timeClockModal').hidden=true;document.getElementById('timeCorrectionModal').hidden=true;}
async function refreshTimeClock(){
 if(!cloudActor||!cloudSession||!navigator.onLine||timeClockBusy)return;
 const actor=cloudActor.id,session=cloudSession.user.id,request=++timeClockRequest;
 const modal=document.getElementById('timeClockModal'),open=!modal.hidden;
 const month=open?document.getElementById('timeMonth').value:timeMonthNow();
 const user=open&&cloudActor.is_admin?document.getElementById('timePerson').value:actor;
 try{
  const {data,error}=await cloudClient.rpc('heiders_get_work_times',{p_month:month+'-01',p_user:user==='all'?null:user});if(error)throw error;
  if(request!==timeClockRequest||cloudActor?.id!==actor||cloudSession?.user.id!==session)return;
  timeClockData=data;timeClockActor=actor;document.getElementById('timeClockError').textContent='';renderTimeClock();
 }catch(error){if(request===timeClockRequest&&cloudActor?.id===actor){timeClockData=null;renderTimeClock();document.getElementById('timeClockError').textContent='Arbeitszeiten konnten nicht geladen werden. '+cloudError(error);}}
}
function renderTimeClock(){
 const bar=document.getElementById('timeClockBar');bar.hidden=!cloudActor;if(!cloudActor)return;
 const current=timeClockData?.active,paused=current?.breaks?.some(b=>!b.end),elapsed=current?timeEntrySeconds(current):null;
 bar.innerHTML=`<div><strong>Meine Arbeitszeit${timeClockActor===cloudActor.id?' · '+escapeHtml(cloudActor.name):''}</strong><p class="hint">${current?(paused?'Pause seit '+timeFormat(current.breaks.at(-1).start):'Beginn '+timeFormat(current.started_at))+' · '+durationText(elapsed.net)+' Std. gearbeitet':'Arbeitsbeginn und -ende unabhängig von der Anmeldung erfassen.'}</p>${current&&serverNow()-Date.parse(current.started_at)>12*3600000?'<p class="error">Läuft seit mehr als 12 Stunden. Arbeitsende vergessen? Bitte Pia oder Nelly um eine Korrektur bitten.</p>':''}</div><div class="time-clock-actions">${timeClockData?current?`<button type="button" onclick="recordWorkAction('${paused?'resume':'pause'}')" ${timeClockBusy?'disabled':''}>${paused?'Weiterarbeiten':'Pause'}</button><button type="button" class="primary" onclick="recordWorkAction('end')" ${timeClockBusy?'disabled':''}>Arbeitsende</button>`:`<button type="button" class="primary" onclick="recordWorkAction('start')" ${timeClockBusy?'disabled':''}>Arbeitsbeginn</button>`:'<span class="hint">Zeiterfassung wird geladen …</span>'}<button type="button" class="outline-button" onclick="openTimeClock()">Monatsübersicht</button></div>`;
 if(document.getElementById('timeClockModal').hidden)return;
 const data=timeClockData,rows=data?.entries||[],bounds=data?[Date.parse(data.month_start),Date.parse(data.month_end)]:[0,0];
 const closed=rows.filter(r=>r.ended_at&&!r.voided),sum=closed.reduce((n,r)=>n+timeEntrySeconds(r,...bounds).net,0),running=rows.filter(r=>!r.ended_at&&!r.voided).length;
 document.getElementById('timeSummary').textContent=`${durationText(sum)} Std. abgeschlossen${running?' · '+running+' laufende Einträge noch nicht in der Summe':''}`;
 document.getElementById('timeEntries').innerHTML=rows.length?rows.map(r=>{const t=timeEntrySeconds(r,...bounds);return `<article class="plain-card"><strong>${escapeHtml(r.name||personName(r.user_id))}</strong><p>${timeFormat(r.started_at)} → ${r.ended_at?timeFormat(r.ended_at):'läuft noch'}</p><p>${r.voided?'Storniert':r.ended_at?durationText(t.net)+' Std. netto · '+durationText(t.pause)+' Std. Pause':'Vorläufig · '+durationText(t.net)+' Std. netto'}${r.corrected?' · Korrigiert':''}</p>${cloudActor.is_admin&&r.correction_reason?`<p class="hint">${escapeHtml(r.correction_reason)}</p>`:''}${cloudActor.is_admin?`<button type="button" onclick="openTimeCorrection('${r.id}')">Korrigieren / Verlauf</button>`:''}</article>`;}).join(''):'<p class="hint">Für diesen Monat sind noch keine Zeiten erfasst.</p>';
 for(const id of ['timeExportPdf','timeExportCsv'])document.getElementById(id).disabled=timeClockBusy||!data;
 document.getElementById('timeManualButton').hidden=!cloudActor.is_admin;
}
async function recordWorkAction(action){
 if(!cloudActor||!cloudSession||timeClockBusy||cloudBusy)return;
 if(!navigator.onLine){timeError('Offline – Arbeitszeiten können nicht gespeichert werden. Bitte den Zeitpunkt notieren und später durch Pia oder Nelly nachtragen lassen.');return;}
 if(action==='end'&&!window.confirm('Arbeitszeit jetzt beenden? Eine laufende Pause wird ebenfalls beendet.'))return;
 const actor=cloudActor.id,session=cloudSession.user.id;let failure='';timeClockBusy=true;renderTimeClock();
 try{const {error}=await cloudClient.rpc('heiders_work_action',{p_action:action});if(error)throw error;if(cloudActor?.id===actor&&cloudSession?.user.id===session){document.getElementById('timeClockError').textContent='';cloudStatus(({start:'Arbeitsbeginn',pause:'Pausenbeginn',resume:'Pausenende',end:'Arbeitsende'})[action]+' gespeichert.');}}
 catch(error){if(cloudActor?.id===actor&&cloudSession?.user.id===session)failure=cloudError(error);}
 finally{timeClockBusy=false;if(cloudActor?.id===actor&&cloudSession?.user.id===session){await refreshTimeClock();if(failure)timeError(failure);}}
}
function openTimeClock(){if(!cloudActor)return;document.getElementById('timeMonth').value=timeMonthNow();const select=document.getElementById('timePerson');select.innerHTML=(cloudActor.is_admin?'<option value="all">Gesamtes Team</option>':'')+team.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');select.value=cloudActor.id;document.getElementById('timePersonLabel').hidden=!cloudActor.is_admin;document.getElementById('timeClockModal').hidden=false;document.getElementById('timeClockTitle').focus();timeClockData=null;renderTimeClock();refreshTimeClock();}
function changeTimeMonth(direction){const input=document.getElementById('timeMonth'),[y,m]=input.value.split('-').map(Number);input.value=new Date(Date.UTC(y,m-1+direction,1)).toISOString().slice(0,7);loadTimeSelection();}
function loadTimeSelection(){timeClockData=null;renderTimeClock();try{timeMonthBounds(document.getElementById('timeMonth').value);}catch(error){timeError(error.message);return;}refreshTimeClock();}
function closeTimeClock(){if(timeClockBusy)return;document.getElementById('timeClockModal').hidden=true;refreshTimeClock();}
function correctionBreakFields(breaks){return breaks.map((b,i)=>`<div class="reservation-selects"><label>Pause von<input type="datetime-local" id="correctionBreakStart_${i}" value="${berlinLocalValue(b.start)}" required></label><label>Pause bis<input type="datetime-local" id="correctionBreakEnd_${i}" value="${berlinLocalValue(b.end)}" required></label><button type="button" onclick="removeCorrectionBreak(${i})">Pause entfernen</button></div>`).join('');}
function readCorrectionBreaks(){return timeCorrection.breaks.map((_,i)=>({start:berlinLocalISO(document.getElementById('correctionBreakStart_'+i).value,timeCorrection.breaks[i].start),end:berlinLocalISO(document.getElementById('correctionBreakEnd_'+i).value,timeCorrection.breaks[i].end)}));}
function addCorrectionBreak(){try{timeCorrection.breaks=readCorrectionBreaks();timeCorrection.breaks.push({start:null,end:null});document.getElementById('correctionBreaks').innerHTML=correctionBreakFields(timeCorrection.breaks);}catch(error){document.getElementById('timeCorrectionError').textContent=error.message;}}
function removeCorrectionBreak(index){const rows=timeCorrection.breaks.map((_,i)=>({start:document.getElementById('correctionBreakStart_'+i).value,end:document.getElementById('correctionBreakEnd_'+i).value}));rows.splice(index,1);timeCorrection.breaks=rows.map(r=>({start:r.start?berlinLocalISO(r.start):null,end:r.end?berlinLocalISO(r.end):null}));document.getElementById('correctionBreaks').innerHTML=correctionBreakFields(timeCorrection.breaks);}
async function openTimeCorrection(id=null){
 if(!cloudActor?.is_admin||timeClockBusy)return;const row=id?timeClockData?.entries.find(r=>r.id===id):null;if(id&&!row)return;
 timeCorrection={id,revision:row?.revision||0,user:row?.user_id||cloudActor.id,breaks:structuredClone(row?.breaks||[]),actor:cloudActor.id,session:cloudSession.user.id,originalStart:row?.started_at,originalEnd:row?.ended_at};
 document.getElementById('timeCorrectionPerson').innerHTML=team.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');document.getElementById('timeCorrectionPerson').value=timeCorrection.user;document.getElementById('timeCorrectionPerson').disabled=!!id;
 document.getElementById('timeCorrectionStart').value=berlinLocalValue(row?.started_at);document.getElementById('timeCorrectionEnd').value=berlinLocalValue(row?.ended_at);
 document.getElementById('timeCorrectionReason').value='';document.getElementById('timeCorrectionVoided').checked=!!row?.voided;document.getElementById('timeCorrectionVoidedLabel').hidden=!id;
 document.getElementById('correctionBreaks').innerHTML=correctionBreakFields(timeCorrection.breaks);document.getElementById('timeCorrectionError').textContent='';document.getElementById('timeAudit').textContent='';document.getElementById('timeCorrectionModal').hidden=false;
 if(id){const context=timeCorrection;const{data,error}=await cloudClient.rpc('heiders_get_work_audit',{p_id:id});if(timeCorrection!==context||cloudActor?.id!==context.actor)return;document.getElementById('timeAudit').textContent=error?'Verlauf konnte nicht geladen werden.':(data||[]).map(a=>timeFormat(a.created_at)+' · '+a.actor_name+' · '+a.reason+'\nVorher: '+timeAuditText(a.before_data)+'\nNachher: '+timeAuditText(a.after_data)).join('\n\n')||'Noch keine Korrekturen.';}
}
function timeAuditText(row){if(!row)return 'Neuer Eintrag';return timeFormat(row.started_at)+' → '+timeFormat(row.ended_at)+' · Pausen: '+(row.breaks||[]).map(b=>timeFormat(b.start)+'–'+timeFormat(b.end)).join(', ')+(row.voided?' · storniert':'');}
function closeTimeCorrection(){if(timeClockBusy)return;if(timeCorrection&&!window.confirm('Korrekturfenster schließen? Noch nicht gespeicherte Eingaben werden verworfen.'))return;timeCorrection=null;document.getElementById('timeCorrectionModal').hidden=true;}
async function saveTimeCorrection(){
 const ctx=timeCorrection;if(!ctx||!cloudActor?.is_admin||cloudActor.id!==ctx.actor||cloudSession?.user.id!==ctx.session||timeClockBusy)return;
 if(!navigator.onLine){document.getElementById('timeCorrectionError').textContent='Offline – die Korrektur wurde nicht gespeichert.';return;}
 let args;try{args={p_id:ctx.id,p_user:document.getElementById('timeCorrectionPerson').value,p_start:berlinLocalISO(document.getElementById('timeCorrectionStart').value,ctx.originalStart),p_end:berlinLocalISO(document.getElementById('timeCorrectionEnd').value,ctx.originalEnd),p_breaks:readCorrectionBreaks(),p_reason:document.getElementById('timeCorrectionReason').value.trim(),p_voided:document.getElementById('timeCorrectionVoided').checked,p_revision:ctx.revision};if(!args.p_reason)throw new Error('Bitte einen Korrekturgrund angeben.');}catch(error){document.getElementById('timeCorrectionError').textContent=error.message;return;}
 timeClockBusy=true;document.getElementById('timeCorrectionSave').disabled=true;
 try{const{error}=await cloudClient.rpc('heiders_correct_work_time',args);if(error)throw error;if(timeCorrection===ctx&&cloudActor?.id===ctx.actor){timeCorrection=null;document.getElementById('timeCorrectionModal').hidden=true;cloudStatus('Arbeitszeit mit Korrekturverlauf gespeichert.');}}
 catch(error){if(timeCorrection===ctx)document.getElementById('timeCorrectionError').textContent=cloudError(error);}
 finally{timeClockBusy=false;document.getElementById('timeCorrectionSave').disabled=false;if(cloudActor?.id===ctx.actor)refreshTimeClock();}
}
function timeReportSnapshot(){if(!timeClockData||timeClockActor!==cloudActor?.id||timeClockBusy)throw new Error('Bitte zuerst die Monatsübersicht laden.');return structuredClone({...timeClockData,demo:!!window.heidersDemoActive,exported:new Date().toISOString(),selection:document.getElementById('timePerson').selectedOptions?.[0]?.textContent||cloudActor.name});}
function timeReportRows(snapshot){const bounds=[Date.parse(snapshot.month_start),Date.parse(snapshot.month_end)];return snapshot.entries.map(r=>{const t=timeEntrySeconds(r,...bounds,Date.parse(snapshot.server_now));return {...r,...t,status:r.voided?'Storniert':r.ended_at?'Abgeschlossen':'Laufend – vorläufig'};});}
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
function buildWorkCsv(snapshot){const rows=timeReportRows(snapshot);return '\ufeff'+[['Name','Beginn (Europe/Berlin)','Ende (Europe/Berlin)','Brutto im Monat (Std:Min)','Pause im Monat (Std:Min)','Netto im Monat (Std:Min)','Nettostunden dezimal','Status','Korrigiert','Korrekturgrund','Eintrags-ID','Beginn UTC','Ende UTC','Netto im Monat (Sekunden)'],...rows.map(r=>[r.name,timeFormat(r.started_at),r.ended_at?timeFormat(r.ended_at):'',durationText(r.gross),durationText(r.pause),durationText(r.net),(r.net/3600).toFixed(4).replace('.',','),r.status,r.corrected?'Ja':'Nein',r.correction_reason||'',r.id,r.started_at,r.ended_at||'',r.net.toFixed(0)]),['Gesamt abgeschlossen','','','','',durationText(rows.filter(r=>r.ended_at&&!r.voided).reduce((n,r)=>n+r.net,0))]].map(row=>row.map(csvCell).join(';')).join('\r\n');}
function buildWorkPdf(snapshot){
 const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});doc.addFileToVFS('Heiders-Regular.ttf',window.HEIDERS_PDF_FONT.regular);doc.addFont('Heiders-Regular.ttf','Heiders','normal');doc.addFileToVFS('Heiders-Bold.ttf',window.HEIDERS_PDF_FONT.bold);doc.addFont('Heiders-Bold.ttf','Heiders','bold');let y=0;
 function header(){doc.setFont('Heiders','bold');doc.setFontSize(17);doc.text('Heider’s · Arbeitszeiten',12,20);doc.setFont('Heiders','normal');doc.setFontSize(10);doc.text(snapshot.month+' · '+snapshot.selection,12,28);doc.setFontSize(8);doc.text((snapshot.demo?'TESTDATEN · ':'')+'Datenstand '+timeFormat(snapshot.server_now)+' · Berliner Zeit',12,35);doc.setDrawColor(226,0,26);doc.line(12,39,198,39);y=46;}
 function lines(text,bold=false){doc.setFont('Heiders',bold?'bold':'normal');doc.setFontSize(9);for(const line of doc.splitTextToSize(String(text),184)){if(y>278){doc.addPage();header();}doc.text(line,12,y);y+=4.8;}}
 header();const rows=timeReportRows(snapshot);for(const r of rows){if(y>245){doc.addPage();header();}lines(r.name+' · '+r.status,true);lines(timeFormat(r.started_at)+' → '+(r.ended_at?timeFormat(r.ended_at):'läuft noch'));lines('Brutto '+durationText(r.gross)+' · Pause '+durationText(r.pause)+' · Netto '+durationText(r.net)+' Std. im Monat'+(r.corrected?' · Korrigiert':''));if(r.correction_reason)lines('Korrekturgrund: '+r.correction_reason);y+=4;}
 if(!rows.length)lines('Keine Arbeitszeiten in diesem Monat.');const total=rows.filter(r=>r.ended_at&&!r.voided).reduce((n,r)=>n+r.net,0);lines('Gesamt abgeschlossen: '+durationText(total)+' Std. ('+(total/3600).toFixed(2).replace('.',',')+' Dezimalstunden)',true);y+=4;lines('Laufende Einträge sind vorläufig und nicht in der Gesamtsumme enthalten. Schichten über Monatsgrenzen werden zeitanteilig im jeweiligen Monat ausgewiesen. Stornierte Einträge zählen nicht. Die erfassten Zeiten werden nicht aus dem Dienstplan abgeleitet.');
 const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('Heiders','normal');doc.setFontSize(8);doc.text('Heider’s · Arbeitszeiten · Seite '+i+' / '+pages,12,289);}return doc;
}
function exportWorkTimes(type){try{const snapshot=timeReportSnapshot(),name=(snapshot.demo?'TEST-':'')+'Heiders-Arbeitszeiten-'+snapshot.month;if(type==='pdf')buildWorkPdf(snapshot).save(name+'.pdf');else{const blob=new Blob([buildWorkCsv(snapshot)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}cloudStatus('Monatsexport erstellt.');}catch(error){timeError(error.message);}}
const timeCloudSync=cloudSync;cloudSync=async function(){await timeCloudSync();if(timeClockActor&&timeClockActor!==cloudActor?.id)clearTimeClock();if(cloudActor)refreshTimeClock();};
const timeCloudClear=cloudClear;cloudClear=function(){clearTimeClock();return timeCloudClear();};
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!document.getElementById('timeCorrectionModal').hidden)closeTimeCorrection();else if(!document.getElementById('timeClockModal').hidden)closeTimeClock();}});
setInterval(()=>{if(timeClockData?.active&&!timeClockBusy)renderTimeClock();},30000);
