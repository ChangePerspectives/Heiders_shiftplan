'use strict';
let manualWorkContext=null;
async function openManualWork(id=null){
 if(!cloudActor||!cloudSession||timeClockBusy)return;const row=id?timeClockData?.entries.find(r=>r.id===id):null;
 if(id&&(!row||row.entry_mode!=='manual'||row.voided||row.user_id!==cloudActor.id&&!cloudActor.is_admin))return;
 manualWorkContext={id,revision:row?.revision||0,actor:cloudActor.id,session:cloudSession.user.id,originalStart:row?.started_at,originalEnd:row?.ended_at};
 const admin=!!cloudActor.is_admin,people=admin?team:team.filter(p=>p.id===cloudActor.id),select=document.getElementById('manualWorkPerson');select.innerHTML=people.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');if(admin&&row&&!team.some(p=>p.id===row.user_id))select.innerHTML+=`<option value="${row.user_id}">${escapeHtml(row.name||personName(row.user_id))}</option>`;select.value=row?.user_id||cloudActor.id;select.disabled=!admin||!!id;document.getElementById('manualWorkPersonLabel').hidden=!admin;document.getElementById('manualWorkOwnPerson').hidden=admin;document.getElementById('manualWorkOwnPerson').textContent='Für '+cloudActor.name;
 const start=berlinLocalValue(row?.started_at),end=berlinLocalValue(row?.ended_at);
 document.getElementById('manualWorkDate').value=start?start.slice(0,10):berlinToday();document.getElementById('manualWorkFrom').value=start?start.slice(11):'';document.getElementById('manualWorkTo').value=end?end.slice(11):'';
 document.getElementById('manualWorkOvernight').checked=!!row&&start.slice(0,10)!==end.slice(0,10);document.getElementById('manualWorkPause').value=String(row?.manual_break_minutes||0);document.getElementById('manualWorkNote').value='';document.getElementById('manualWorkNote').required=!!id;
 document.getElementById('manualWorkNoteLabel').textContent=id?'Grund der Änderung':'Hinweis (optional)';document.getElementById('manualWorkTitle').textContent=id?'Arbeitszeit ändern':'Arbeitszeit eintragen';document.getElementById('manualWorkError').textContent='';document.getElementById('manualWorkNet').textContent='Von und Bis eingeben. Die Pause wird abgezogen.';
 document.getElementById('manualWorkModal').hidden=false;manualWorkContext.baseline=JSON.stringify(manualWorkDraft());document.getElementById('manualWorkBody').scrollTop=0;document.getElementById('manualWorkNoteDetails').open=!!id;updateManualWorkDateLabel();document.getElementById('manualWorkTitle').focus({preventScroll:true});calculateManualWork();
 const context=manualWorkContext;document.getElementById('manualWorkAuditDetails').hidden=!cloudActor.is_admin||!id;document.getElementById('manualWorkAudit').textContent='';if(id&&cloudActor.is_admin){const{data,error}=await cloudClient.rpc('heiders_get_work_audit',{p_id:id});if(manualWorkContext===context&&cloudActor?.id===context.actor)document.getElementById('manualWorkAudit').textContent=error?'Verlauf konnte nicht geladen werden.':(data||[]).map(a=>timeFormat(a.created_at)+' · '+a.actor_name+' · '+a.reason+'\nVorher: '+timeAuditText(a.before_data)+'\nNachher: '+timeAuditText(a.after_data)).join('\n\n');}
}
function manualWorkValues(){
 const day=document.getElementById('manualWorkDate').value,from=document.getElementById('manualWorkFrom').value,to=document.getElementById('manualWorkTo').value,overnight=document.getElementById('manualWorkOvernight').checked;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(from)||!/^\d{2}:\d{2}$/.test(to))throw new Error('Bitte Datum sowie Von und Bis vollständig auswählen.');
 const endDate=new Date(day+'T12:00:00Z');if(overnight)endDate.setUTCDate(endDate.getUTCDate()+1);const endDay=endDate.toISOString().slice(0,10);
 const start=berlinLocalISO(day+'T'+from,manualWorkContext?.originalStart),end=berlinLocalISO(endDay+'T'+to,manualWorkContext?.originalEnd),pauseValue=document.getElementById('manualWorkPause').value,pause=Number(pauseValue),gross=(Date.parse(end)-Date.parse(start))/60000;
 if(gross<=0)throw new Error('Bis muss nach Von liegen. Bei einer Schicht über Mitternacht „Ende am nächsten Tag“ aktivieren.');
 if(gross>25*60)throw new Error('Bitte einen Zeitraum von höchstens einem Tag eintragen.');
 if(pauseValue.trim()===''||!Number.isInteger(pause)||pause<0||pause>=gross)throw new Error('Pausenminuten müssen eine ganze Zahl sein und kleiner als die gesamte Zeit.');
 return {p_start:start,p_end:end,p_pause:pause,netSeconds:(gross-pause)*60};
}
function updateManualWorkDateLabel(){const value=document.getElementById('manualWorkDate').value;document.getElementById('manualWorkDateDisplay').textContent=value?(value===berlinToday()?'Heute · ':'')+new Date(value+'T12:00:00Z').toLocaleDateString('de-DE',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Berlin'}):'Datum auswählen';}
function calculateManualWork(){if(!manualWorkContext)return;if(!document.getElementById('manualWorkFrom').value||!document.getElementById('manualWorkTo').value){document.getElementById('manualWorkNet').textContent='Von und Bis eingeben. Die Pause wird abgezogen.';return;}try{const values=manualWorkValues();document.getElementById('manualWorkNet').textContent='Arbeitszeit nach Pause: '+durationText(values.netSeconds)+' Std.';}catch(error){document.getElementById('manualWorkNet').textContent=error.message;}}
function manualWorkDraft(){return ['manualWorkPerson','manualWorkDate','manualWorkFrom','manualWorkTo','manualWorkPause','manualWorkNote'].map(id=>document.getElementById(id).value).concat(document.getElementById('manualWorkOvernight').checked);}
function manualWorkDirty(){return !!manualWorkContext&&JSON.stringify(manualWorkDraft())!==manualWorkContext.baseline;}
function closeManualWork(force=false){if(timeClockBusy&&!force)return;if(!force&&manualWorkDirty()&&!window.confirm('Eingaben verwerfen und schließen? Die Arbeitszeit wurde noch nicht gespeichert.'))return;manualWorkContext=null;document.getElementById('manualWorkModal').hidden=true;}
async function saveManualWork(){
 const ctx=manualWorkContext;if(!ctx||timeClockBusy||!cloudActor||cloudActor.id!==ctx.actor||cloudSession?.user.id!==ctx.session)return;
 const error=document.getElementById('manualWorkError');if(!navigator.onLine){error.textContent='Offline – nicht gespeichert. Deine Eingaben bleiben im Fenster erhalten. Bitte wieder verbinden und erneut speichern.';return;}
 let args;try{const values=manualWorkValues(),note=document.getElementById('manualWorkNote').value.trim();if(ctx.id&&!note)throw new Error('Bitte kurz angeben, warum du den Eintrag änderst.');if(Date.parse(values.p_end)>serverNow())throw new Error('Bitte erst nach Arbeitsende speichern. Das Ende darf nicht in der Zukunft liegen.');args={p_id:ctx.id,p_user:cloudActor.is_admin?document.getElementById('manualWorkPerson').value:cloudActor.id,p_start:values.p_start,p_end:values.p_end,p_pause:values.p_pause,p_note:note,p_revision:ctx.revision};}catch(e){error.textContent=e.message;return;}
 timeClockBusy=true;document.getElementById('manualWorkFields').disabled=true;document.getElementById('manualWorkSave').disabled=true;error.textContent='';
 try{const{data,error:e}=await cloudClient.rpc('heiders_save_manual_work',args);if(e)throw e;if(manualWorkContext!==ctx||cloudActor?.id!==ctx.actor||cloudSession?.user.id!==ctx.session)return;
  closeManualWork(true);cloudStatus('Arbeitszeit gespeichert und in die Monatsübersicht übernommen.');
  if(!document.getElementById('timeClockModal').hidden){document.getElementById('timeMonth').value=berlinLocalValue(args.p_start).slice(0,7);if(cloudActor.is_admin)document.getElementById('timePerson').value=args.p_user;}
 }catch(e){if(manualWorkContext===ctx)error.textContent=cloudError(e)+' Deine Eingaben bleiben erhalten.';}
 finally{timeClockBusy=false;document.getElementById('manualWorkFields').disabled=false;document.getElementById('manualWorkSave').disabled=false;if(cloudActor?.id===ctx.actor&&cloudSession?.user.id===ctx.session)await refreshTimeClock();}
}
const openClockTimeCorrection=openTimeCorrection;
openTimeCorrection=function(id=null){const row=id?timeClockData?.entries.find(r=>r.id===id):null;if(!id||row?.entry_mode==='manual')return openManualWork(id);return openClockTimeCorrection(id);};
const clearClockBeforeManual=clearTimeClock;
clearTimeClock=function(){closeManualWork(true);return clearClockBeforeManual();};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('manualWorkModal').hidden)closeManualWork();});

window.addEventListener('beforeunload',event=>{if(manualWorkDirty()){event.preventDefault();event.returnValue='';}});
