'use strict';
let otpContext=null,otpGeneration=0,otpWorking=false;
const otpLastSent=new Map(),teamLoginEmails=new Map();
function resetCodeLogin(){otpGeneration++;otpContext=null;document.getElementById('passwordMode').checked=false;document.getElementById('passwordLoginBox').hidden=true;document.getElementById('loginPassword').required=false;document.getElementById('loginPassword').value='';document.getElementById('loginCodeBox').hidden=true;document.getElementById('loginCode').required=false;document.getElementById('loginCode').value='';document.getElementById('loginEmail').disabled=false;document.getElementById('loginSubmit').textContent='Anmeldecode senden';}
function loginBusy(busy){otpWorking=busy;for(const id of ['loginSubmit','loginResend','loginRestart','loginEmail','loginCode','passwordMode'])document.getElementById(id).disabled=busy||(id==='loginEmail'&&!!otpContext);}
function rememberLoginChoice(){const remember=document.getElementById('rememberLogin').checked;localStorage.setItem('heiders_auth_remember',remember?'1':'0');if(remember)sessionStorage.removeItem('heiders_cloud_auth');else localStorage.removeItem('heiders_cloud_auth');}
function restartCodeLogin(){if(otpWorking)return;resetCodeLogin();document.getElementById('loginError').textContent='';document.getElementById('loginNotice').textContent='';document.getElementById('loginEmail').focus();}
function setPasswordLogin(enabled){if(otpWorking)return;resetCodeLogin();document.getElementById('passwordLoginBox').hidden=!enabled;document.getElementById('loginPassword').required=enabled;document.getElementById('passwordMode').checked=enabled;document.getElementById('loginSubmit').textContent=enabled?'Mit bestehendem Passwort anmelden':'Anmeldecode senden';document.getElementById('loginNotice').textContent='';}
const confirmPasswordLogin=confirmUserChoice;
confirmUserChoice=async function(){
 if(otpWorking||!cloudClient)return;
 if(document.getElementById('passwordMode').checked){loginBusy(true);try{return await confirmPasswordLogin();}finally{loginBusy(false);}}
 if(!otpContext)return sendLoginCode();
 const context=otpContext,generation=otpGeneration,token=document.getElementById('loginCode').value.replace(/\s/g,'');
 if(!/^\d{6,8}$/.test(token)){document.getElementById('loginError').textContent='Bitte den vollständigen Zahlencode aus der E-Mail eingeben.';return;}
 loginBusy(true);document.getElementById('loginError').textContent='';
 try{
  rememberLoginChoice();const {data,error}=await cloudClient.auth.verifyOtp({email:context.email,token,type:'email'});if(error)throw error;
  if(generation!==otpGeneration)return;
  cloudSession=data.session;document.getElementById('loginCode').value='';await cloudSync();
 }catch(error){if(generation===otpGeneration)document.getElementById('loginError').textContent='Code ungültig oder abgelaufen. Bitte prüfen oder einen neuen Code anfordern.';}
 finally{loginBusy(false);}
};
async function sendLoginCode(){
 if(otpWorking||!cloudClient)return;
 const email=(otpContext?.email||document.getElementById('loginEmail').value).trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){document.getElementById('loginError').textContent='Bitte eine gültige E-Mail-Adresse eingeben.';return;}
 const wait=Math.ceil((60000-(Date.now()-(otpLastSent.get(email)||0)))/1000);
 if(wait>0){document.getElementById('loginError').textContent='Bitte noch '+wait+' Sekunden warten, bevor du einen neuen Code anforderst.';return;}
 const generation=otpGeneration;loginBusy(true);document.getElementById('loginError').textContent='';
 try{
  const {error}=await cloudClient.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
  if(generation!==otpGeneration)return;
  // Keine öffentliche Auskunft darüber, welche Teamadressen existieren.
  if(error&&!['otp_disabled','signup_disabled','user_not_found','email_not_confirmed'].includes(error.code))throw error;
  otpLastSent.set(email,Date.now());otpContext={email};
  document.getElementById('loginCodeBox').hidden=false;document.getElementById('loginCode').required=true;document.getElementById('loginCode').value='';document.getElementById('loginSubmit').textContent='Code bestätigen';
  document.getElementById('loginNotice').textContent='Wenn diese Adresse freigeschaltet ist, wurde ein Anmeldecode versendet. Bitte auch den Spam-Ordner prüfen.';document.getElementById('loginCode').focus();
 }catch(error){if(generation===otpGeneration)document.getElementById('loginError').textContent=error.status===429?'Zu viele Anfragen. Bitte etwas warten und erneut versuchen.':'Der Code konnte nicht angefordert werden. Bitte Internetverbindung prüfen; falls es erneut scheitert, Pia oder Nelly kontaktieren.';}
 finally{loginBusy(false);}
}
async function loadTeamLoginEmails(){
 if(!cloudActor?.is_admin||window.heidersDemoActive)return;
 const actor=cloudActor.id,client=cloudClient;try{const {data,error}=await client.rpc('heiders_team_login_emails');if(error)throw error;if(cloudActor?.id!==actor||client!==cloudClient)return;teamLoginEmails.clear();for(const row of data||[])teamLoginEmails.set(row.id,row.email||'');renderEmployees();}catch(error){if(cloudActor?.id===actor)document.getElementById('employeeResult').textContent='E-Mail-Liste nicht geladen. Bitte Datenbank-Update v4.11 prüfen.';}
}
const openEmployeesWithoutEmails=openEmployees;
openEmployees=function(){openEmployeesWithoutEmails();if(cloudActor?.is_admin)loadTeamLoginEmails();};
renderEmployees=function(){
 document.getElementById('employeesList').innerHTML=team.map(p=>`<div class="employee-row"><strong>${escapeHtml(p.name)}</strong><span>${p.hasLogin?escapeHtml(teamLoginEmails.get(p.id)||'Zugang verbunden'):'E-Mail noch nicht hinterlegt · einplanbar'}</span></div>`).join('');
 const select=document.getElementById('employeeLinkPerson'),selected=select.value,unlinked=team.filter(p=>!p.hasLogin);select.innerHTML=unlinked.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');if(unlinked.some(p=>p.id===selected))select.value=selected;
 document.getElementById('employeeLinkForm').hidden=!unlinked.length||!!window.heidersDemoActive;
};
linkEmployeeLogin=async function(){
 if(!cloudActor?.is_admin||cloudBusy||window.heidersDemoActive)return;
 const id=document.getElementById('employeeLinkPerson').value,email=document.getElementById('employeeEmail').value.trim().toLowerCase(),actor=cloudActor.id;
 if(!id||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){document.getElementById('employeeResult').textContent='Bitte Person und gültige E-Mail-Adresse auswählen.';return;}
 cloudBusy=true;document.getElementById('employeeEmailSave').disabled=true;document.getElementById('employeeResult').textContent='E-Mail wird hinterlegt …';
 try{
  const {data,error}=await cloudClient.functions.invoke('heiders-team-login',{body:{profile_id:id,email}});
  if(error){let message='Zugang nicht bestätigt. Bitte Einrichtung der Serverfunktion prüfen.';try{message=(await error.context.json()).error||message;}catch(_){}throw new Error(message);}
  if(!data?.saved)throw new Error('Zugang nicht bestätigt. Bitte erneut prüfen.');
  if(cloudActor?.id!==actor)return;teamLoginEmails.set(id,email);document.getElementById('employeeEmail').value='';document.getElementById('employeeResult').textContent='E-Mail hinterlegt. Die Person kann jetzt selbst einen Anmeldecode anfordern. Alle Schichten bleiben erhalten.';
 }catch(error){if(cloudActor?.id===actor)document.getElementById('employeeResult').textContent=error.message;}
 finally{cloudBusy=false;document.getElementById('employeeEmailSave').disabled=false;await cloudSync();}
};
