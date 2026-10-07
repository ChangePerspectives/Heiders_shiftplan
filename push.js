 'use strict';
let devicePushBusy=false;
const pushSupported=()=>typeof navigator!=='undefined'&&'serviceWorker'in navigator&&typeof PushManager!=='undefined'&&typeof Notification!=='undefined';
function pushStatus(message){document.getElementById('pushStatus').textContent=message;}
function openPushSettings(){document.getElementById('accountMenu').open=false;document.getElementById('pushSettingsModal').hidden=false;document.getElementById('pushEnable').disabled=devicePushBusy;document.getElementById('pushDisable').disabled=devicePushBusy;pushStatus(!pushSupported()?'Auf diesem Gerät bitte die App zum Startbildschirm hinzufügen und dort öffnen. Falls Benachrichtigungen nicht unterstützt werden, bleiben die Nachrichten in der App verfügbar.':Notification.permission==='denied'?'Benachrichtigungen wurden blockiert. Du kannst sie in den Einstellungen deines Geräts wieder erlauben.':Notification.permission==='granted'?'Benachrichtigungen sind erlaubt. Mit „Aktivieren“ meldest du dieses Gerät an.':'Du kannst Benachrichtigungen für dieses Gerät erlauben.');}
function closePushSettings(){document.getElementById('pushSettingsModal').hidden=true;}
function publicPushKey(value){const bytes=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(bytes,c=>c.charCodeAt(0));}
async function enableDevicePush(){
 if(devicePushBusy||!cloudActor||window.heidersDemoActive)return;
 if(!pushSupported()){openPushSettings();return;}
 if(!window.HEIDERS_PUSH_PUBLIC_KEY){pushStatus('Benachrichtigungen sind noch nicht eingerichtet. Bitte Pia oder Nelly kontaktieren.');return;}
 const actor=cloudActor.id,client=cloudClient;devicePushBusy=true;document.getElementById('pushEnable').disabled=true;
 let subscription,created=false;
 try{
  // Berechtigung direkt beim Tippen anfordern, besonders wichtig auf dem iPhone.
  const permission=await Notification.requestPermission();if(permission!=='granted'){pushStatus('Benachrichtigungen wurden nicht erlaubt. Du kannst sie später aktivieren.');return;}
  const registration=await navigator.serviceWorker.ready;subscription=await registration.pushManager.getSubscription();
  if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicPushKey(window.HEIDERS_PUSH_PUBLIC_KEY)});created=true;}
  if(cloudActor?.id!==actor||client!==cloudClient)throw new Error('Zugang wurde gewechselt. Bitte erneut anmelden.');
  const {error}=await client.rpc('heiders_register_push',{p_subscription:subscription.toJSON()});if(error)throw error;
  if(cloudActor?.id!==actor){await subscription.unsubscribe();return;}
  pushStatus('Aktiviert. Neue Nachrichten werden auf diesem Gerät gemeldet. Die Markierung am App-Symbol hängt von den Geräteeinstellungen ab.');await updatePushBadge();
 }catch(error){if(created&&subscription)try{await subscription.unsubscribe();}catch(_){}pushStatus('Aktivierung fehlgeschlagen. Bitte Verbindung und Einrichtung prüfen und erneut versuchen.');}
 finally{devicePushBusy=false;document.getElementById('pushEnable').disabled=false;}
}
async function clearPushBadge(){
 if(typeof navigator==='undefined')return;
 try{if(navigator.clearAppBadge)await navigator.clearAppBadge();}catch(_){}
 try{if('serviceWorker'in navigator){const registration=await navigator.serviceWorker.getRegistration();if(registration){const notifications=await registration.getNotifications({tag:'heiders-unread'});notifications.forEach(n=>n.close());}}}catch(_){}
}
async function updatePushBadge(){
 if(window.heidersDemoActive)return;
 if(!cloudActor||!cloudInbox.unread)return clearPushBadge();
 try{if(navigator.setAppBadge)await navigator.setAppBadge();}catch(_){}
}
async function disableDevicePush(){
 if(typeof navigator==='undefined'||!('serviceWorker'in navigator)){await clearPushBadge();return;}
 try{
  const registration=await navigator.serviceWorker.getRegistration();const subscription=registration&&await registration.pushManager.getSubscription();
  if(subscription){try{if(cloudActor&&!window.heidersDemoActive)await cloudClient.rpc('heiders_unregister_push',{p_endpoint:subscription.endpoint});}finally{await subscription.unsubscribe();}}
  pushStatus('Benachrichtigungen auf diesem Gerät deaktiviert.');
 }catch(_){pushStatus('Bitte Verbindung prüfen. Das Deaktivieren konnte nicht vollständig bestätigt werden.');}
 finally{await clearPushBadge();}
}
const renderInboxWithoutPush=renderInbox;
renderInbox=function(){renderInboxWithoutPush();void updatePushBadge();if(pushOpenInboxPending&&cloudActor){pushOpenInboxPending=false;openInbox();}};
let pushOpenInboxPending=typeof location!=='undefined'&&new URLSearchParams(location.search||'').get('inbox')==='1';
if(typeof navigator!=='undefined'&&'serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='OPEN_HEIDERS_INBOX'){if(cloudActor)openInbox();else pushOpenInboxPending=true;}});
