'use strict';
function pdfText(value){return String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[\u2010-\u2015]/g,'-').replace(/\p{Extended_Pictographic}/gu,'');}
function pdfPlanSnapshot(){
 const week=getWeekKey(currentWeekStart),data=db[week];
 if(!cloudActor||!data||cloudLoadedWeek!==week)throw new Error('Bitte warten, bis die ausgewählte Woche geladen ist.');
 return structuredClone({week,data,team,absences:cloudAbsences.map(a=>({user_id:a.user_id,start_date:a.start_date,end_date:a.end_date,period:a.period,status:a.status,cancelled_at:a.cancelled_at})),transfers:cloudTransfers.map(t=>({...t,status:effectiveTransferStatus(t)})),pool:cloudPool.filter(p=>p.available),demo:!!window.heidersDemoActive,offline:!navigator.onLine,exported:new Date().toISOString(),synced:cloudRule?.server_now||null});
}
function buildPlanPdf(snapshot){
 const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 doc.addFileToVFS('Heiders-Regular.ttf',window.HEIDERS_PDF_FONT.regular);doc.addFont('Heiders-Regular.ttf','Heiders','normal');
 doc.addFileToVFS('Heiders-Bold.ttf',window.HEIDERS_PDF_FONT.bold);doc.addFont('Heiders-Bold.ttf','Heiders','bold');
 doc.setFont('Heiders','normal');doc.setProperties({title:"Heider’s Dienstplan "+snapshot.week,subject:'Wochenplan zum Ausdrucken',creator:'Heider’s Dienstplan'});
 const margin=12,bottom=281,width=186,lineHeight=4.1,colWidths=[26,80,80],xs=[12,38,118];let y=0;
 const end=new Date(snapshot.week+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);
 const range=new Date(snapshot.week+'T12:00:00Z').toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'})+' - '+end.toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'});
 const format=value=>new Date(value).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 function header(){
  doc.setFont('Heiders','bold');doc.setFontSize(17);doc.setTextColor(65,64,64);doc.text("Heider’s · Dienstplan",margin,20);
  doc.setFont('Heiders','normal');doc.setFontSize(10);doc.text(range,margin,28);
  doc.setFontSize(8);doc.text((snapshot.demo?'TESTDATEN · ':'')+(snapshot.offline?'OFFLINE · ':'')+'Datenstand: '+(snapshot.synced?format(snapshot.synced):'nicht bestätigt')+' · Export: '+format(snapshot.exported),margin,35);
  doc.setDrawColor(226,0,26);doc.setLineWidth(.6);doc.line(margin,39,margin+width,39);y=44;
 }
 function tableHeader(){
  doc.setFillColor(248,244,244);doc.rect(margin,y,width,10,'F');doc.setFont('Heiders','bold');doc.setFontSize(9);doc.setTextColor(65,64,64);
  ['Tag / Datum','Tagschicht · ab 10:30','Abendschicht · ab 15:00'].forEach((label,i)=>doc.text(label,xs[i]+3,y+6.5));y+=10;
 }
 function nextPage(table=false){doc.addPage();header();if(table)tableHeader();}
 function wrap(text,available){doc.setFont('Heiders','normal');doc.setFontSize(8.8);return doc.splitTextToSize(pdfText(text),available);}
 function periodText(day,period){
  const staff=snapshot.team.filter(p=>isScheduled(snapshot.data.shifts[p.name]?.[day]?.[period])&&!absenceAt(p.id,shiftDateKey(snapshot.week,day),period,snapshot.absences||[]));
  const required=snapshot.data.soll[day]?.[period]||0,lines=[required||staff.length?`${staff.length} von ${required} besetzt`:'Kein Personalbedarf hinterlegt'];
  if(staff.length>required)lines.push((staff.length-required)+' zu viel · Bedarf prüfen');
  if(staff.length<required){const missing=required-staff.length;lines.push(`${missing} ${missing===1?'Platz offen':'Plätze offen'}`);}
  for(const person of staff){
   lines.push(person.name+' · '+shiftRoleLabel(snapshot.data.shifts[person.name][day][period]));
   const source=snapshot.data.shiftSources?.[person.name]?.[day]?.[period],time=source?.text?.match(/(?:ab\s*)?\d[^)]*/i)?.[0];
   if(source?.task)lines.push('  Sonderaufgabe: '+source.task);
   if(time)lines.push('  Zeitangabe aus dem Plan: '+time);
   const request=snapshot.transfers.find(t=>t.giver_id===person.id&&t.day===day&&t.period===period&&t.status==='pending');
   if(request)lines.push('  Übernahme bei '+(snapshot.team.find(p=>p.id===request.taker_id)?.name||'Profil')+' angefragt - unbestätigt');
  }
  const absent=snapshot.team.filter(p=>['u','k','f'].includes(snapshot.data.shifts[p.name]?.[day]?.[period])||absenceAt(p.id,shiftDateKey(snapshot.week,day),period,snapshot.absences||[]));
  if(absent.length)lines.push('Abwesend / frei: '+absent.map(p=>p.name+' ('+(absenceAt(p.id,shiftDateKey(snapshot.week,day),period,snapshot.absences||[])?'Abwesenheit gemeldet':shiftRoleLabel(snapshot.data.shifts[p.name]?.[day]?.[period]))+')').join(', '));
  const res=(period==='tag'?snapshot.data.resTag:snapshot.data.resAbend)?.[day];
  lines.push('Reservierungen '+(period==='tag'?'Tag':'Abend')+': '+(res||'-'));
  return lines.join('\n');
 }
 header();tableHeader();
 const dayNames=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'],keys=['mo','di','mi','do','fr','sa','so'];
 for(let i=0;i<7;i++){
  const date=new Date(snapshot.week+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);
  const dateText=date.toLocaleDateString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit'});
  let columns=[wrap(dayNames[i]+'\n'+dateText,colWidths[0]-6),wrap(periodText(keys[i],'tag'),colWidths[1]-6),wrap(periodText(keys[i],'abend'),colWidths[2]-6)];
  const fullHeight=Math.max(...columns.map(c=>c.length))*lineHeight+8;
  if(fullHeight<=bottom-54&&y+fullHeight>bottom)nextPage(true);
  let continuation=false;
  while(columns.some(c=>c.length)){
   if(bottom-y<lineHeight*3+8)nextPage(true);
   const maxLines=Math.floor((bottom-y-8)/lineHeight),count=Math.min(maxLines,Math.max(...columns.map(c=>c.length))),height=count*lineHeight+8;
   doc.setFillColor(i%2?255:252,i%2?255:250,i%2?255:250);doc.rect(margin,y,width,height,'F');doc.setDrawColor(225,220,220);doc.setLineWidth(.2);doc.rect(margin,y,width,height);
   for(let c=0;c<3;c++){
    const chunk=columns[c].splice(0,count);doc.setFont('Heiders',c===0?'bold':'normal');doc.setFontSize(8.8);doc.setTextColor(65,64,64);
    if(c===0&&continuation&&!chunk.length)chunk.push(dayNames[i],'Fortsetzung');
    chunk.forEach((line,n)=>doc.text(line,xs[c]+3,y+5+n*lineHeight));
    if(c)doc.line(xs[c],y,xs[c],y+height);
   }
   y+=height;
   if(columns.some(c=>c.length)){continuation=true;nextPage(true);}
  }
 }
 function textSection(title,body){
  const lines=wrap(body,width-6);
  if(y+18>bottom)nextPage();y+=8;doc.setFont('Heiders','bold');doc.setFontSize(10);doc.text(title,margin,y);y+=7;
  for(const line of lines){if(y+lineHeight>bottom)nextPage();doc.setFont('Heiders','normal');doc.setFontSize(8.8);doc.text(line,margin,y);y+=lineHeight;}
 }
 if(snapshot.data.note.trim())textSection('Wochenhinweise',snapshot.data.note);
 const pool=snapshot.pool.filter(p=>snapshot.team.some(m=>m.id===p.user_id));
 textSection('Springer-Pool dieser Woche',pool.length?pool.map(p=>snapshot.team.find(m=>m.id===p.user_id).name+' · '+(p.note||'Keine Einschränkung angegeben')).join('\n'):'Noch niemand im Springer-Pool.');
 textSection('Hinweis zum Ausdruck','Übernahme-Anfragen sind unverbindlich, bis der Ersatz bestätigt. Maßgeblich ist der aktuelle Plan in der App. Der Ausdruck zeigt den oben genannten Datenstand.');
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFont('Heiders','normal');doc.setFontSize(8);doc.setTextColor(105,100,100);doc.text((snapshot.demo?'TESTDATEN · ':'')+'Heider’s · '+range,margin,289);doc.text('Seite '+p+' / '+pages,198,289,{align:'right'});}
 return doc;
}
function exportPlanPdf(){
 if(cloudBusy){cloudStatus('Bitte zuerst die Speicherung abwarten.',true);return;}
 const button=document.getElementById('exportPdfButton');button.disabled=true;
 try{
  const snapshot=pdfPlanSnapshot(),doc=buildPlanPdf(snapshot);
  doc.save((snapshot.demo?'TEST-':'')+'Heiders-Dienstplan-'+snapshot.week+'.pdf');
  cloudStatus('PDF erstellt. Du kannst die Datei öffnen und ausdrucken.');
 }catch(error){cloudStatus(error.message||'PDF konnte nicht erstellt werden.',true);}
 finally{button.disabled=false;}
}
