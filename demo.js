'use strict';
// Vollständig isolierte Beispieldaten: kein Supabase-Aufruf und keine echten Auth-Konten.
const DEMO_KEY='heiders_demo_v3';let demoStore=null;
const demoPeople=[['Test Nelly','Service/Theke',true],['Test Pia','Service/Theke',true],['Test Lea','Service/Theke',false],['Test Max','Küche',false],['Test Sam','Service/Theke',false],['Test Alex','Service/Theke & Küche',false]].map(([name,job_role,is_admin],i)=>({id:'00000000-0000-0000-0000-'+String(901+i).padStart(12,'0'),name,job_role,is_admin,active:true}));
function demoId(){return crypto.randomUUID();}
function demoWeek(delta=0){const d=getStartOfCurrentWeek();d.setDate(d.getDate()+delta*7);return getWeekKey(d);}
function demoBlankStore(){
 const state={version:3,profiles:demoPeople,shifts:[],week_settings:[],shift_transfers:[],springer_pool:[],notifications:[],notification_reads:[],undos:[]};
 for(const offset of [-1,0,1,2,3,4]){
 const week=demoWeek(offset),setting=cloudBlankWeek();
 state.week_settings.push({week,note:'Beispieldaten: Übernahmen bestätigen und Springer anfragen.',requirements:setting.soll,reservations_day:{do:'14:00 · 4 Personen'},reservations_evening:{do:'18:30 · Gruppe, 8 Personen'},note_revision:1,settings_revision:1});
 for(const [person,day,period,value]of [[0,'do','tag','se'],[1,'do','tag','se'],[3,'do','abend','kü'],[0,'fr','abend','se'],[2,'fr','tag','se']])state.shifts.push({week,user_id:demoPeople[person].id,day,period,value,revision:1});
 for(const [person,note]of [[2,'Tagsüber und abends, außer Freitag'],[4,'Nur abends'],[5,'Flexibel; Küche und Service/Theke']])state.springer_pool.push({week,user_id:demoPeople[person].id,available:true,note,revision:1});
 }
 return state;
}
function demoPersist(){localStorage.setItem(DEMO_KEY,JSON.stringify(demoStore));}
function demoActor(){return demoStore.profiles.find(p=>p.id===cloudSession?.user.id&&p.active);}
function demoAssert(value,message='Keine Berechtigung',code='42501'){if(!value)throw {message,code};}
function demoOwn(id){const actor=demoActor();demoAssert(actor&&(id===actor.id||actor.is_admin));}
function demoShift(week,id,day,period,create=false){let s=demoStore.shifts.find(s=>s.week===week&&s.user_id===id&&s.day===day&&s.period===period);if(!s&&create){s={week,user_id:id,day,period,value:'-',revision:0};demoStore.shifts.push(s);}return s;}
function demoDeadline(week){
 const anchor=Date.parse('2026-10-12T00:00:00Z'),start=new Date(anchor+Math.floor((Date.parse(week+'T00:00:00Z')-anchor)/1209600000)*1209600000),thursday=new Date(start.getTime()-345600000);
 const offset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',timeZoneName:'shortOffset'}).formatToParts(thursday).find(p=>p.type==='timeZoneName').value;
 const hours=Number(offset.replace('GMT',''));
 return {week:start.toISOString().slice(0,10),deadline:new Date(thursday.getTime()+(24-hours)*3600000-1000).toISOString()};
}
function demoNotice(kind,audience,title,message,week,recipient=null,delay=0){const n={id:demoId(),kind,audience,title,message,week,recipient_id:recipient,created_at:new Date().toISOString(),available_at:new Date(Date.now()+delay).toISOString()};demoStore.notifications.push(n);return n.id;}
function demoInbox(){const actor=demoActor();const items=demoStore.notifications.filter(n=>Date.parse(n.available_at)<=Date.now()&&(n.audience==='team'||n.audience==='admins'&&actor.is_admin||n.audience==='user'&&n.recipient_id===actor.id)).map(n=>({...n,is_read:demoStore.notification_reads.some(r=>r.notification_id===n.id&&r.user_id===actor.id)})).sort((a,b)=>b.created_at.localeCompare(a.created_at));return {items:items.slice(0,100),unread:items.filter(n=>!n.is_read).length};}
function demoReplyStatus(week){
 const rule=demoDeadline(week),missing_people=[];let total=0,answered=0;
 for(const person of demoStore.profiles.filter(p=>p.active)){
 let missing=0;
 for(let w=0;w<2;w++){
 const key=new Date(Date.parse(rule.week+'T00:00:00Z')+w*604800000).toISOString().slice(0,10),settings=demoStore.week_settings.find(s=>s.week===key)?.requirements||cloudBlankWeek().soll;
 for(const d of daysOfWeek)for(const period of ['tag','abend']){
 if(d.isSpecial&&!settings[d.key]?.[period])continue;total++;
 if((demoShift(key,person.id,d.key,period)?.revision||0)>0)answered++;else missing++;
 }
 }
 if(missing)missing_people.push({id:person.id,name:person.name,missing});
 }
 return {...rule,end:new Date(Date.parse(rule.week+'T00:00:00Z')+13*86400000).toISOString().slice(0,10),total,answered,missing_people,server_now:new Date().toISOString()};
}
function demoEffective(t){if(t.status!=='pending')return t.status;const s=demoShift(t.week,t.giver_id,t.day,t.period),target=demoShift(t.week,t.taker_id,t.day,t.period);return s?.revision===t.source_revision&&target?.revision===t.target_revision&&s?.value===t.shift_value?'pending':'stale';}
function demoExecute(name,a){
 const actor=demoActor();demoAssert(actor);
 if(name==='get_reply_deadline')return demoReplyStatus(a.p_week);
 if(name==='get_change_rule'){const rule=demoDeadline(a.p_week);return {...rule,late:Date.now()>Date.parse(rule.deadline),server_now:new Date().toISOString()};}
 if(name==='get_notifications')return demoInbox();
 if(name==='mark_notification_read'){demoAssert(demoInbox().items.some(n=>n.id===a.p_id));if(!demoStore.notification_reads.some(r=>r.notification_id===a.p_id&&r.user_id===actor.id))demoStore.notification_reads.push({notification_id:a.p_id,user_id:actor.id});return null;}
 if(name==='save_shift'||name==='withdraw_shift'){
 demoAssert(!isPastShift(a.p_week,a.p_day),'Vergangene Tage können nicht bearbeitet werden','22023');
 demoOwn(a.p_user);const s=demoShift(a.p_week,a.p_user,a.p_day,a.p_period,true);demoAssert(s.revision===a.p_revision,'Zwischenzeitlich geändert','40001');
 if(name==='save_shift'){
 demoAssert(['-','se','kü','th','u','k','f'].includes(a.p_value),'Ungültige Eingabe','22023');
 demoAssert(!(s.value===a.p_value&&s.revision>0),'Bereits beantwortet','23505');
 demoAssert(!(isScheduled(s.value)&&s.value!==a.p_value),'Bitte Austragen-Funktion verwenden','22023');s.value=a.p_value;s.revision++;return null;
 }
 demoAssert(isScheduled(s.value),'Keine eingetragene Schicht','22023');const late=Date.now()>Date.parse(demoDeadline(a.p_week).deadline);
 demoAssert(!late||['Vertan','Kann nicht kommen'].includes(a.p_reason),'Frist abgelaufen: Bitte Grund auswählen','22023');
 demoAssert(typeof a.p_message==='string'&&a.p_message.length<=1000,'Nachricht zu lang','22023');
 const old=s.value;s.value='-';s.revision++;
 const notice=late?demoNotice('withdrawal','admins',personName(a.p_user)+' · Austragung',`${a.p_week} · ${a.p_day} · ${a.p_period}\nGrund: ${a.p_reason}\n${a.p_message}`,a.p_week,null,120000):null;
 const undo={id:demoId(),actor_id:actor.id,week:a.p_week,user_id:a.p_user,day:a.p_day,period:a.p_period,old_value:old,after_revision:s.revision,undo_until:new Date(Date.now()+120000).toISOString(),notification_id:notice,used:false};demoStore.undos.push(undo);return {id:undo.id,undo_until:undo.undo_until,late};
 }
 if(name==='undo_withdrawal'){
 const u=demoStore.undos.find(u=>u.id===a.p_id&&u.actor_id===actor.id);demoAssert(u);demoAssert(!u.used&&Date.now()<Date.parse(u.undo_until),'Rückgängig-Frist abgelaufen','22023');demoAssert(!isPastShift(u.week,u.day),'Vergangene Tage können nicht bearbeitet werden','22023');const s=demoShift(u.week,u.user_id,u.day,u.period);demoAssert(s?.revision===u.after_revision&&s.value==='-','Schicht wurde inzwischen geändert','40001');s.value=u.old_value;s.revision++;u.used=true;demoStore.notifications=demoStore.notifications.filter(n=>n.id!==u.notification_id);return null;
 }
 if(name==='save_springer'){
 demoOwn(a.p_user);let p=demoStore.springer_pool.find(p=>p.week===a.p_week&&p.user_id===a.p_user);demoAssert((p?.revision||0)===a.p_revision,'Zwischenzeitlich geändert','40001');demoAssert(a.p_note.length<=300,'Hinweis zu lang','22023');if(!p){p={week:a.p_week,user_id:a.p_user,revision:0};demoStore.springer_pool.push(p);}Object.assign(p,{available:a.p_available,note:a.p_note,revision:p.revision+1});return null;
 }
 if(name==='request_transfer'){
 demoAssert(!isPastShift(a.p_week,a.p_day),'Vergangene Tage können nicht bearbeitet werden','22023');
 demoOwn(a.p_user);demoAssert(a.p_user!==a.p_target&&demoStore.profiles.some(p=>p.id===a.p_target&&p.active),'Ungültiger Ersatz','22023');
 const s=demoShift(a.p_week,a.p_user,a.p_day,a.p_period),target=demoShift(a.p_week,a.p_target,a.p_day,a.p_period,true);
 demoAssert(s?.revision===a.p_revision,'Zwischenzeitlich geändert','40001');demoAssert(isScheduled(s.value),'Keine eingetragene Schicht','22023');demoAssert(!['se','kü','th','u','k'].includes(target.value),'Ersatz bereits eingetragen oder abwesend','22023');
 for(const t of demoStore.shift_transfers)if(t.status==='pending'&&demoEffective(t)==='stale')t.status='stale';
 demoAssert(!demoStore.shift_transfers.some(t=>t.week===a.p_week&&t.giver_id===a.p_user&&t.day===a.p_day&&t.period===a.p_period&&t.status==='pending'),'Übernahme bereits angefragt','23505');
 demoAssert(a.p_note.length<=1000,'Nachricht zu lang','22023');
 const t={id:demoId(),week:a.p_week,day:a.p_day,period:a.p_period,giver_id:a.p_user,taker_id:a.p_target,requester_id:actor.id,shift_value:s.value,source_revision:s.revision,target_revision:target.revision,status:'pending',note:a.p_note,created_at:new Date().toISOString()};demoStore.shift_transfers.push(t);demoNotice('transfer','user','Schichtübernahme angefragt',personName(t.giver_id)+' fragt dich für '+t.day+' · '+t.period+'. Bitte unter Springer antworten.',t.week,t.taker_id);return t.id;
 }
 if(name==='respond_transfer'){
 const t=demoStore.shift_transfers.find(t=>t.id===a.p_id);demoAssert(t&&t.taker_id===actor.id,'Nur die angefragte Person kann bestätigen');demoAssert(t.status==='pending','Anfrage nicht mehr offen','40001');
 if(demoEffective(t)==='stale'){t.status='stale';return null;}
 if(a.p_accept){demoAssert(!isPastShift(t.week,t.day),'Vergangene Tage können nicht bearbeitet werden','22023');const s=demoShift(t.week,t.giver_id,t.day,t.period),target=demoShift(t.week,t.taker_id,t.day,t.period);s.value='-';s.revision++;target.value=t.shift_value;target.revision++;t.status='accepted';if(Date.now()>Date.parse(demoDeadline(t.week).deadline))demoNotice('transfer','admins','Schichtübernahme bestätigt',personName(t.giver_id)+' → '+personName(t.taker_id)+' · '+t.day+' · '+t.period,t.week);}
 else t.status='rejected';
 demoNotice('transfer','user',a.p_accept?'Übernahme bestätigt':'Übernahme abgelehnt',personName(t.taker_id)+(a.p_accept?' übernimmt deine Schicht.':' kann nicht übernehmen. Bitte anderen Ersatz anfragen.'),t.week,t.giver_id);return null;
 }
 if(name==='cancel_transfer'){const t=demoStore.shift_transfers.find(t=>t.id===a.p_id);demoAssert(t&&t.status==='pending'&&(t.giver_id===actor.id||actor.is_admin));t.status='cancelled';return null;}
 if(name==='save_week_note'||name==='save_week_settings'){
 demoAssert(actor.is_admin);let s=demoStore.week_settings.find(s=>s.week===a.p_week);if(!s){const blank=cloudBlankWeek();s={week:a.p_week,note:'',note_revision:0,settings_revision:0,requirements:blank.soll,reservations_day:{},reservations_evening:{}};demoStore.week_settings.push(s);}
 const key=name==='save_week_note'?'note_revision':'settings_revision';demoAssert(s[key]===a.p_revision,'Zwischenzeitlich geändert','40001');
 if(name==='save_week_note')s.note=a.p_note;else Object.assign(s,{requirements:a.p_requirements,reservations_day:a.p_day,reservations_evening:a.p_evening});s[key]++;return null;
 }
 throw {message:'Unbekannter Testaufruf: '+name,code:'22023'};
}
function createDemoClient(){return {
 from(table){const filters=[];let single=false,orderBy=null,ascending=true;const q={select(){return q;},eq(key,value){filters.push([key,value]);return q;},order(key,options={}){orderBy=key;ascending=options.ascending!==false;return q;},maybeSingle(){single=true;return q;},then(resolve,reject){try{let data=(demoStore[table]||[]).filter(row=>filters.every(([k,v])=>row[k]===v)).map(row=>({...row}));if(orderBy)data.sort((a,b)=>String(a[orderBy]).localeCompare(String(b[orderBy]))*(ascending?1:-1));return Promise.resolve({data:single?(data[0]||null):data,error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;},
 async rpc(name,args={}){const before=structuredClone(demoStore);try{const data=demoExecute(name,args);demoPersist();return {data,error:null};}catch(error){demoStore=before;return {data:null,error};}}
};}
async function startDemo(){
 if(cloudBusy)return;
 window.heidersDemoActive=true;sessionStorage.setItem('heiders_test_active','1');
 try{demoStore=JSON.parse(localStorage.getItem(DEMO_KEY));if(demoStore?.version!==3)demoStore=null;}catch(_){demoStore=null;}
 if(!demoStore){demoStore=demoBlankStore();demoPersist();}
 closeWithdrawal();closeTransfer();closeInbox();lastUndo=null;
 cloudClient=createDemoClient();cloudSession={user:{id:demoPeople[0].id}};currentUser=null;db={};cloudActor=null;cloudLoadedWeek=null;cloudRequest++;cloudShiftRevisions.clear();
 currentWeekStart=getStartOfCurrentWeek();focusDay='do';
 document.getElementById('demoBanner').hidden=false;
 document.getElementById('demoPerson').innerHTML=demoPeople.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}${p.is_admin?' · Admin':' · Team'}</option>`).join('');
 switchTab('cards');await cloudSync();
 if(!window.heidersDemoTimer)window.heidersDemoTimer=setInterval(()=>{if(window.heidersDemoActive&&!document.hidden)cloudSync();},15000);
}
async function switchDemoPerson(id){
 if(!window.heidersDemoActive||cloudBusy||!demoPeople.some(p=>p.id===id)){document.getElementById('demoPerson').value=cloudSession?.user.id;return;}
 closeWithdrawal();closeTransfer();closeInbox();lastUndo=null;cloudSession={user:{id}};cloudActor=null;currentUser=null;cloudRequest++;await cloudSync();
}
async function resetDemo(){if(cloudBusy)return;localStorage.removeItem(DEMO_KEY);await startDemo();cloudStatus('Testdaten zurückgesetzt.');}
function exitDemo(){if(cloudBusy)return;sessionStorage.removeItem('heiders_test_active');if(location.hash==='#test')history.replaceState(null,'',location.pathname+location.search);location.reload();}
