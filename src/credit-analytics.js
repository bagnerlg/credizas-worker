// CrediZas V23.7 — Métricas operativas. No realiza decisiones crediticias ni modifica expedientes.
const GT_TIMEZONE = 'America/Guatemala';
const dtf = new Intl.DateTimeFormat('en-US', {timeZone:GT_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const METRIC_IDS = [
  'ingresadas','precalificacion_aprobada','cuotas_enviadas','cliente_acepta',
  'cliente_no_responde','cliente_no_envia_datos','documentos_retomados','contacto_retomado','cliente_rechaza',
  'precalificacion_rechazada','formalizacion_rechazada','rechazo_administrativo','rechazadas_total','formalizacion_enviada',
  'formalizacion_aprobada','banco_registrado','finalizados','monto_finalizado'
];
export const ANALYTICS_METRIC_LABELS = {
  ingresadas:'Solicitudes ingresadas',
  precalificacion_aprobada:'Precalificación aprobada',
  cuotas_enviadas:'Ofertas de cuotas enviadas',
  cliente_acepta:'Cliente acepta las condiciones',
  cliente_no_responde:'Cliente no responde',
  cliente_no_envia_datos:'Cliente no envía datos',
  documentos_retomados:'Documentos retomados',
  contacto_retomado:'Contacto retomado',
  cliente_rechaza:'Cliente rechaza las condiciones',
  precalificacion_rechazada:'Precalificaciones rechazadas (administrador)',
  formalizacion_rechazada:'Formalizaciones rechazadas (administrador)',
  rechazo_administrativo:'Total de rechazos administrativos',
  rechazadas_total:'TOTAL DE SOLICITUDES RECHAZADAS (incluye cliente)',
  formalizacion_enviada:'Formalización enviada',
  formalizacion_aprobada:'Formalización aprobada',
  banco_registrado:'Respuesta bancaria registrada',
  finalizados:'Créditos finalizados con éxito',
  monto_finalizado:'Monto aprobado de créditos finalizados'
};
function pad(n){return String(n).padStart(2,'0')}
export function localDateKey(timestamp){
  if(!timestamp)return '';
  const dt=new Date(timestamp);if(!Number.isFinite(dt.valueOf()))return '';
  const o={};for(const p of dtf.formatToParts(dt))if(p.type!=='literal')o[p.type]=p.value;
  return `${o.year}-${o.month}-${o.day}`;
}
export function normalizePeriodType(type){return ['day','month','year'].includes(type)?type:'month'}
export function periodKeyFromTimestamp(timestamp,type){const d=localDateKey(timestamp);return type==='day'?d:type==='year'?d.slice(0,4):d.slice(0,7)}
function validDay(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const dt=new Date(value+'T12:00:00Z');return Number.isFinite(dt.valueOf())&&dt.toISOString().slice(0,10)===value}
function validMonth(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)}
function validYear(value){return /^(19|20|21)\d{2}$/.test(value)}
export function resolvePeriod(type,period,now=new Date()){
  const t=normalizePeriodType(type),today=localDateKey(now),fallback=t==='day'?today:t==='year'?today.slice(0,4):today.slice(0,7);
  const value=String(period||'');return {type:t,period:(t==='day'?validDay(value):t==='month'?validMonth(value):validYear(value))?value:fallback};
}
export function shiftPeriod(type,key,delta){
  const t=normalizePeriodType(type),parts=key.split('-').map(Number);
  const dt=new Date(Date.UTC(parts[0],(parts[1]||1)-1,parts[2]||1,12));
  if(t==='year')dt.setUTCFullYear(dt.getUTCFullYear()+delta);
  else if(t==='month')dt.setUTCMonth(dt.getUTCMonth()+delta);
  else dt.setUTCDate(dt.getUTCDate()+delta);
  const p=dt.toISOString().slice(0,10);
  return t==='day'?p:t==='year'?p.slice(0,4):p.slice(0,7);
}
function normalizedDepartment(rec){
  const raw=String(rec?.stage1?.data?.informacion_complementaria?.departamento||'').replace(/\s+/g,' ').trim();
  if(!raw)return 'SIN DEPARTAMENTO';
  const key=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const canon={'QUICHE':'QUICHÉ','PETEN':'PETÉN','SOLOLA':'SOLOLÁ','SACATEPEQUEZ':'SACATEPÉQUEZ','SUCHITEPEQUEZ':'SUCHITEPÉQUEZ','HUEHUETENANGO':'HUEHUETENANGO','ALTA VERAPAZ':'ALTA VERAPAZ','BAJA VERAPAZ':'BAJA VERAPAZ','EL PROGRESO':'EL PROGRESO'};
  return canon[key]||raw.toLocaleUpperCase('es-GT');
}
// Los rechazos son eventos, no simple estado final. Un expediente puede ser reabierto
// y rechazado de nuevo; dentro de cada intervalo cuenta como máximo una vez por indicador.
function rejectionState(rec){
  const p1=String(rec?.stage1?.control?.estado || (rec?.proceso==='PRECALIFICACION'?rec?.estado:'') || (!rec?.stage1?.control?.estado && rec?.stage1?.decision?.status==='VALIDACION_NEGATIVA'?'RECHAZADA':'')).toUpperCase();
  const p2=String(rec?.stage2?.control?.estado||rec?.formalizacion_control?.estado||(rec?.proceso==='FORMALIZACION DE CREDITO'?rec?.estado:'')).toUpperCase();
  const client=String(rec?.stage3?.status||'')==='CREDITO NO ACEPTADO POR CLIENTE';
  return {p1:p1==='RECHAZADA',p2:p2==='RECHAZADA',client};
}
function metricEvents(rec){
  const ev=[];const add=(metric,at,estimated=false)=>{if(at&&localDateKey(at))ev.push({metric,at,estimated})};
  const rejection=(kind,at,estimated=false)=>{
    add(kind,at,estimated);
    if(kind!=='cliente_rechaza')add('rechazo_administrativo',at,estimated);
    add('rechazadas_total',at,estimated);
  };
  add('ingresadas',rec?.created_at||rec?.stage1?.submitted_at);
  add('cuotas_enviadas',rec?.stage3?.quotes?.sent_at);
  add('cliente_acepta',rec?.stage3?.seller_ratification?.confirmed_at);
  add('cliente_no_responde',rec?.stage3?.client_followup?.started_at);
  add('cliente_no_envia_datos',rec?.stage3?.documents_followup?.first_at);
  add('cliente_no_envia_datos',rec?.stage3?.documents_followup?.started_at);
  add('documentos_retomados',rec?.stage3?.documents_followup?.resumed_at);
  rejection('cliente_rechaza',rec?.stage3?.client_rejection?.rejected_at);
  add('contacto_retomado',rec?.stage3?.client_followup?.resumed_at);
  add('formalizacion_enviada',rec?.stage2?.submitted_at);
  add('banco_registrado',rec?.stage3?.bank_approval?.recorded_at);
  for(const h of Array.isArray(rec?.history)?rec.history:[]){
    const e=h?.event||'';
    if(e==='ADMIN_CONTROL_PRECALIFICACION'&&h.to_state==='APROBADA')add('precalificacion_aprobada',h.at);
    if(e==='ADMIN_CONTROL_FORMALIZACION'&&h.to_state==='APROBADA')add('formalizacion_aprobada',h.at);
    if(e==='STAGE3_CLIENTE_NO_CONTESTA')add('cliente_no_responde',h.at);
    if(e==='STAGE2_CLIENTE_NO_ENVIA_DATOS')add('cliente_no_envia_datos',h.at);
    if(e==='STAGE2_DOCUMENTOS_RETOMADOS')add('documentos_retomados',h.at);
    if(e==='STAGE3_CONTACTO_RETOMADO')add('contacto_retomado',h.at);
    if(e==='STAGE3_RECHAZADO_CLIENTE')rejection('cliente_rechaza',h.at);
    if(e==='ADMIN_CONTROL_PRECALIFICACION'&&String(h.to_state||'').toUpperCase()==='RECHAZADA')rejection('precalificacion_rechazada',h.at);
    if(e==='ADMIN_CONTROL_FORMALIZACION'&&String(h.to_state||'').toUpperCase()==='RECHAZADA')rejection('formalizacion_rechazada',h.at);
    if(e==='STAGE3_RATIFICADO')add('cliente_acepta',h.at);
    if(e==='STAGE3_CUOTAS_ENVIADAS')add('cuotas_enviadas',h.at);
    if(e==='STAGE2_SUBIDA'||e==='STAGE2_REINGRESADO')add('formalizacion_enviada',h.at);
    if(e==='STAGE3_BANCO_APROBADO'||e==='STAGE3_BANCO_APROBADO_OCR')add('banco_registrado',h.at);
  }
  // Compatibilidad para expedientes antiguos sin eventos tipificados.
  // 'closed_at' lo fija el backend cuando rechaza. 'updated_at' es aproximado
  // y se informa al administrador para no presentarlo como fecha comprobada.
  const states=rejectionState(rec);
  for(const [kind,active] of [
    ['precalificacion_rechazada',states.p1],
    ['formalizacion_rechazada',states.p2],
    ['cliente_rechaza',states.client]
  ]){
    if(!active||ev.some(e=>e.metric===kind))continue;
    const control=kind==='precalificacion_rechazada'?rec?.stage1?.control:kind==='formalizacion_rechazada'?(rec?.stage2?.control||rec?.formalizacion_control):rec?.stage3?.client_rejection;
    const verified=control?.rejected_at||control?.decided_at||rec?.closed_at;
    if(localDateKey(verified))rejection(kind,verified);
    else if(localDateKey(rec?.updated_at))rejection(kind,rec.updated_at,true);
  }
  // Cerrados efectivos: nunca contar aprobaciones parciales, rechazos o aceptaciones de cuotas.
  if(String(rec?.stage3?.status||'')==='CREDITO FINALIZADO CON EXITO'){
    const fromHistory=(Array.isArray(rec?.history)?rec.history:[]).filter(h=>h?.event==='STAGE3_FINALIZADO'&&h.at).at(-1)?.at;
    add('finalizados',rec?.stage3?.finalized_at||fromHistory);
  }
  return ev;
}
function freshCount(){return Object.fromEntries(METRIC_IDS.map(id=>[id,0]))}
function increment(map,metric,value=1){map[metric]=(map[metric]||0)+value}
function finalizationTime(rec){
  if(String(rec?.stage3?.status||'')!=='CREDITO FINALIZADO CON EXITO')return null;
  return rec?.stage3?.finalized_at || (Array.isArray(rec?.history)?rec.history:[]).filter(h=>h?.event==='STAGE3_FINALIZADO'&&h.at).at(-1)?.at||null;
}
export function buildCreditDashboard(records,{type='month',period='',seller_id=''}={},now=new Date()){
  const sel=resolvePeriod(type,period,now),previous=shiftPeriod(sel.type,sel.period,-1);
  const span=sel.type==='day'?7:sel.type==='month'?6:5;
  const periods=Array.from({length:span},(_,i)=>shiftPeriod(sel.type,sel.period,i-span+1));
  const allKeys=[...new Set([...periods,previous,sel.period])];
  const metrics=Object.fromEntries(allKeys.map(k=>[k,freshCount()]));
  const cohorts=Object.fromEntries(allKeys.map(k=>[k,{ingresadas:0,aprobadas:0,con_oferta:0,aceptadas:0,formalizadas:0,finalizadas:0}]));
  const geo=new Map();let undatedFinalized=0,unknownAmount=0,activeNoAnswer=0,totalRecords=0;
  for(const rec of records||[]){
    if(seller_id&&String(rec?.vendedor_id||'')!==String(seller_id))continue;
    totalRecords++;
    const startKey=periodKeyFromTimestamp(rec?.created_at||rec?.stage1?.submitted_at,sel.type);
    if(cohorts[startKey]){
      const c=cohorts[startKey],history=Array.isArray(rec?.history)?rec.history:[];
      const pre=rec?.stage1?.control?.estado==='APROBADA'||history.some(h=>h.event==='ADMIN_CONTROL_PRECALIFICACION'&&h.to_state==='APROBADA')||Boolean(rec?.stage3?.quotes?.options?.length)||Boolean(rec?.stage2);
      const hasOffer=Boolean(rec?.stage3?.quotes?.options?.length)||history.some(h=>h.event==='STAGE3_CUOTAS_ENVIADAS');
      const accepted=Boolean(rec?.stage3?.seller_ratification?.confirmed)||history.some(h=>h.event==='STAGE3_RATIFICADO');
      const formalized=Boolean(rec?.stage2)||history.some(h=>h.event==='STAGE2_SUBIDA'||h.event==='STAGE2_REINGRESADO');
      c.ingresadas++;
      if(pre)c.aprobadas++;
      if(hasOffer)c.con_oferta++;
      if(accepted)c.aceptadas++;
      if(formalized)c.formalizadas++;
      if(rec?.stage3?.status==='CREDITO FINALIZADO CON EXITO')c.finalizadas++;
    }
    if(rec?.stage3?.status==='CLIENTE NO CONTESTA')activeNoAnswer++;
    const seen=new Set();
    for(const {metric,at} of metricEvents(rec)){
      const key=periodKeyFromTimestamp(at,sel.type);if(!key||!metrics[key]||seen.has(`${metric}:${key}`))continue;
      seen.add(`${metric}:${key}`);increment(metrics[key],metric);
    }
    const dept=normalizedDepartment(rec);
    if(!geo.has(dept))geo.set(dept,{department:dept,count:{},amount:{}});
    const at=finalizationTime(rec);
    if(rec?.stage3?.status==='CREDITO FINALIZADO CON EXITO'&&!at)undatedFinalized++;
    if(!at)continue;
    const key=periodKeyFromTimestamp(at,sel.type);
    const d=geo.get(dept);d.count[key]=(d.count[key]||0)+1;
    const amount=Number(rec?.stage3?.bank_approval?.approved_amount);
    if(Number.isFinite(amount)&&amount>0){d.amount[key]=(d.amount[key]||0)+amount;increment(metrics[key]||{},'monto_finalizado',amount)}
    else if(key===sel.period)unknownAmount++;
  }
  const rows=[...geo.values()].map(d=>({
    department:d.department,
    counts:periods.map(p=>d.count[p]||0),
    amounts:periods.map(p=>d.amount[p]||0),
    current:d.count[sel.period]||0,previous:d.count[previous]||0,
    current_amount:d.amount[sel.period]||0
  })).sort((a,b)=>b.current-a.current||b.counts.reduce((x,y)=>x+y,0)-a.counts.reduce((x,y)=>x+y,0)||a.department.localeCompare(b.department,'es'));
  const totals=periods.map((_,i)=>rows.reduce((n,r)=>n+r.counts[i],0));
  return {
    ok:true,timezone:GT_TIMEZONE,type:sel.type,period:sel.period,previous,
    periods,metric_labels:ANALYTICS_METRIC_LABELS,
    cohorts:{current:cohorts[sel.period],previous:cohorts[previous]},
    metrics:Object.fromEntries(METRIC_IDS.map(id=>[id,{current:metrics[sel.period][id]||0,previous:metrics[previous][id]||0}])),
    active_no_answer:activeNoAnswer,records_scanned:totalRecords,undated_finalized:undatedFinalized,unknown_amount:unknownAmount,
    departments:rows,totals
  };
}

// V23.9 — Comparaciones de intervalos independientes, sin modificar expedientes.
// Los casos enviados se miden por el primer envío del Paso 1, NO por updated_at.
export const COMPARISON_METRIC_LABELS={
  actividad:'Expedientes con actividad registrada',
  ...ANALYTICS_METRIC_LABELS,
  ingresadas:'Solicitudes enviadas (Paso 1)'
};
function validKey(type,key){return type==='day'?validDay(key):type==='month'?validMonth(key):validYear(key)}
function comparisonRange(type,start,end,defaultKey){
  const a=start===undefined||start===null||start===''?defaultKey:String(start);
  const b=end===undefined||end===null||end===''?a:String(end);
  if(!validKey(type,a)||!validKey(type,b))throw Error('Selecciona fechas válidas para los dos rangos.');
  if(b<a)throw Error('La fecha final no puede ser anterior a la fecha inicial.');
  const max=type==='day'?93:type==='month'?36:20;
  const keys=[];
  for(let at=a;at<=b;at=shiftPeriod(type,at,1)){
    if(keys.length>=max)throw Error('El rango excede el límite de '+max+' '+(type==='day'?'días':type==='month'?'meses':'años')+'. Reduce las fechas para comparar.');
    keys.push(at);
  }
  return {start:a,end:b,keys};
}
function firstDatedHistory(record,names){
  const hits=(Array.isArray(record?.history)?record.history:[])
    .filter(h=>names.includes(h?.event)&&localDateKey(h?.at))
    .map(h=>h.at).sort();
  return hits[0]||null;
}
function submissionInfo(record){
  if(!record?.stage1)return {date:null,source:'none'};
  const historical=firstDatedHistory(record,['STAGE1_SUBIDA','ADMIN_CREATE_STAGE1','STAGE1_REGISTRADA']);
  if(historical)return {date:historical,source:'history'};
  const corrected=firstDatedHistory(record,['STAGE1_REINGRESADO','ADMIN_EDIT_STAGE1']);
  // Si solo quedan registros de corrección, NO los confundimos con un ingreso nuevo.
  // La fecha de creación se utiliza como aproximación identificada de versiones anteriores.
  if(corrected&&localDateKey(record.created_at))return {date:record.created_at,source:'legacy_created_at'};
  if(localDateKey(record.stage1.submitted_at))return {date:record.stage1.submitted_at,source:corrected?'correction_only':'submitted_at'};
  // Expedientes antiguos: no existe fecha de envío distinguible. Se identifica
  // expresamente la estimación en lugar de ocultar un caso o inventar precisión.
  if(localDateKey(record.created_at))return {date:record.created_at,source:'legacy_created_at'};
  return {date:null,source:'none'};
}
function uniqueEventsV239(record){
  const events=metricEvents(record).filter(e=>e.metric!=='ingresadas');
  const add=(metric,at)=>{if(localDateKey(at))events.push({metric,at})};
  const submission=submissionInfo(record);
  add('ingresadas',submission.date);
  // Actualización sin evento tipificado también implica actividad; por ejemplo
  // un archivo reemplazado o un cambio administrativo en expedientes antiguos.
  add('actividad',record?.updated_at);
  for(const h of Array.isArray(record?.history)?record.history:[])add('actividad',h?.at);
  if(!record?.updated_at)add('actividad',record?.stage1?.submitted_at);
  return {events,submission};
}
function groupInRange(timestamp,type,range){
  const key=periodKeyFromTimestamp(timestamp,type);
  return key&&key>=range.start&&key<=range.end?key:null;
}
function computedCohort(rec){
  const history=Array.isArray(rec?.history)?rec.history:[];
  return {
    aprobadas:rec?.stage1?.control?.estado==='APROBADA'||history.some(h=>h.event==='ADMIN_CONTROL_PRECALIFICACION'&&h.to_state==='APROBADA')||Boolean(rec?.stage3?.quotes?.options?.length)||Boolean(rec?.stage2),
    con_oferta:Boolean(rec?.stage3?.quotes?.options?.length)||history.some(h=>h.event==='STAGE3_CUOTAS_ENVIADAS'),
    aceptadas:Boolean(rec?.stage3?.seller_ratification?.confirmed)||history.some(h=>h.event==='STAGE3_RATIFICADO'),
    formalizadas:Boolean(rec?.stage2)||history.some(h=>['STAGE2_SUBIDA','STAGE2_REINGRESADO','ADMIN_CREATE_STAGE2'].includes(h.event)),
    finalizadas:String(rec?.stage3?.status||'')==='CREDITO FINALIZADO CON EXITO'
  };
}
// V23.11 — Cohortes de ingreso por departamento. Las rechazadas son un subconjunto
// de las ingresadas en el mismo intervalo, según su estado actual. No son eventos
// de rechazo del intervalo (ese indicador permanece independiente en el embudo).
function requestedCents(rec){
  const raw=rec?.stage1?.data?.solicitud?.monto_total_solicitado;
  if(raw===null||raw===undefined||String(raw).trim()==='')return null;
  const n=Number(raw);return Number.isFinite(n)&&n>0&&Number.isSafeInteger(Math.round(n*100))?Math.round(n*100):null;
}
function freshGeoBucket(){return {count:{},cents:{},count_b:0,cents_b:0,unknown_a:0,unknown_b:0}}
function addGeoBucket(bucket,name,key,cents){
  if(name==='A'){bucket.count[key]=(bucket.count[key]||0)+1; if(cents!==null)bucket.cents[key]=(bucket.cents[key]||0)+cents;else bucket.unknown_a++;}
  else{bucket.count_b++;if(cents!==null)bucket.cents_b+=cents;else bucket.unknown_b++;}
}
function geoCohortReport(groups,kind,keys){
  const rows=[...groups.values()].map(g=>{const d=g[kind],counts=keys.map(k=>d.count[k]||0),amounts=keys.map(k=>(d.cents[k]||0)/100);return {department:g.department,counts,amounts,current:counts.reduce((a,b)=>a+b,0),previous:d.count_b,current_amount:keys.reduce((a,k)=>a+(d.cents[k]||0),0)/100,previous_amount:d.cents_b/100,unknown_a:d.unknown_a,unknown_b:d.unknown_b}}).sort((a,b)=>b.current-a.current||b.previous-a.previous||a.department.localeCompare(b.department,'es'));
  const totals=keys.map((_,i)=>rows.reduce((n,r)=>n+r.counts[i],0));
  const sum=k=>rows.reduce((n,r)=>n+r[k],0);
  return {rows,totals,total_a:sum('current'),total_b:sum('previous'),amount_a:Math.round(sum('current_amount')*100)/100,amount_b:Math.round(sum('previous_amount')*100)/100,unknown_a:sum('unknown_a'),unknown_b:sum('unknown_b')};
}
export function buildCreditDashboardComparison(records,{type='month',period='',seller_id='',start_a,end_a,start_b,end_b}={},now=new Date()){
  const sel=resolvePeriod(type,period,now),t=sel.type;
  const A=comparisonRange(t,start_a,end_a,sel.period);
  const defaultBStart=shiftPeriod(t,A.start,-A.keys.length);
  const defaultBEnd=shiftPeriod(t,A.start,-1);
  const B=comparisonRange(t,start_b,(!start_b&&!end_b)?defaultBEnd:end_b,defaultBStart);
  const ids=['actividad',...METRIC_IDS];
  const fresh=()=>Object.fromEntries(ids.map(id=>[id,0]));
  const counts={A:fresh(),B:fresh()};
  const freshCohort=()=>({ingresadas:0,aprobadas:0,con_oferta:0,aceptadas:0,formalizadas:0,finalizadas:0});
  const cohorts={A:freshCohort(),B:freshCohort()};
  const groups=new Map(),cohortGeo=new Map();let activeNoDocuments=0;let recordsScanned=0,undatedFinalized=0,unknownAmount=0,activeNoAnswer=0,legacyA=0,legacyB=0,undatedSubmissions=0,estimatedRejectionsA=0,estimatedRejectionsB=0,undatedRejections=0,currentlyRejected=0;
  for(const rec of records||[]){
    if(seller_id&&String(rec?.vendedor_id||'')!==String(seller_id))continue;
    recordsScanned++;
    const {events,submission}=uniqueEventsV239(rec);
    const rejected=rejectionState(rec);
    if(rejected.p1||rejected.p2||rejected.client){
      currentlyRejected++;
      if(!events.some(e=>e.metric==='rechazadas_total'))undatedRejections++;
    }
    const seen={A:new Set(),B:new Set()};
    for(const {metric,at,estimated} of events){
      if(!ids.includes(metric))continue;
      for(const [name,rng] of [['A',A],['B',B]]){
        if(!groupInRange(at,t,rng)||seen[name].has(metric))continue;
        seen[name].add(metric);counts[name][metric]++;
        if(metric==='rechazadas_total'&&estimated){if(name==='A')estimatedRejectionsA++;else estimatedRejectionsB++;}
      }
    }
    if(rec?.stage1&&!submission.date)undatedSubmissions++;
    const cohort=computedCohort(rec);
    const dep=normalizedDepartment(rec),isRejected=!cohort.finalizadas&&(rejected.p1||rejected.p2||rejected.client),cents=requestedCents(rec);
    if(!cohortGeo.has(dep))cohortGeo.set(dep,{department:dep,ingresadas:freshGeoBucket(),rechazadas:freshGeoBucket()});
    const geo=cohortGeo.get(dep);
    if(rec?.stage3?.status==='CLIENTE NO ENVIA DATOS'&&!isRejected&&!cohort.finalizadas)activeNoDocuments++;
    for(const [name,rng] of [['A',A],['B',B]]){
      const key=groupInRange(submission.date,t,rng);if(!key)continue;
      addGeoBucket(geo.ingresadas,name,key,cents);if(isRejected)addGeoBucket(geo.rechazadas,name,key,cents);
      const c=cohorts[name];c.ingresadas++;
      for(const field of ['aprobadas','con_oferta','aceptadas','formalizadas','finalizadas'])if(cohort[field])c[field]++;
      if(submission.source==='legacy_created_at')name==='A'?legacyA++:legacyB++;
    }
    if(rec?.stage3?.status==='CLIENTE NO CONTESTA')activeNoAnswer++;
    if(!groups.has(dep))groups.set(dep,{department:dep,count:{},amount:{},total_b:0,amount_b:0});
    const last=finalizationTime(rec);
    if(rec?.stage3?.status==='CREDITO FINALIZADO CON EXITO'&&!last)undatedFinalized++;
    if(!last)continue;
    const d=groups.get(dep),key=periodKeyFromTimestamp(last,t);
    const amount=Number(rec?.stage3?.bank_approval?.approved_amount);
    for(const [name,rng] of [['A',A],['B',B]]){
      if(!groupInRange(last,t,rng))continue;
      if(name==='A')d.count[key]=(d.count[key]||0)+1;
      else d.total_b++;
      if(Number.isFinite(amount)&&amount>0){
        if(name==='A')d.amount[key]=(d.amount[key]||0)+amount;
        else d.amount_b+=amount;
        counts[name].monto_finalizado+=amount;
      } else if(name==='A')unknownAmount++;
    }
  }
  const rows=[...groups.values()].map(d=>({
    department:d.department,
    counts:A.keys.map(k=>d.count[k]||0),
    amounts:A.keys.map(k=>d.amount[k]||0),
    current:A.keys.reduce((n,k)=>n+(d.count[k]||0),0),
    previous:d.total_b,
    current_amount:A.keys.reduce((n,k)=>n+(d.amount[k]||0),0),
    previous_amount:d.amount_b
  })).sort((x,y)=>y.current-x.current||y.previous-x.previous||x.department.localeCompare(y.department,'es'));
  const totals=A.keys.map((_,i)=>rows.reduce((acc,r)=>acc+r.counts[i],0));
  return {
    ok:true,timezone:GT_TIMEZONE,type:t,
    period:A.end,previous:B.end,periods:A.keys,range_a:{start:A.start,end:A.end},range_b:{start:B.start,end:B.end},
    metric_labels:COMPARISON_METRIC_LABELS,
    metrics:Object.fromEntries(ids.map(id=>[id,{current:counts.A[id],previous:counts.B[id]}])),
    cohorts:{current:cohorts.A,previous:cohorts.B},
    departments:rows,totals,total_a:counts.A.finalizados,total_b:counts.B.finalizados,
    department_submissions:geoCohortReport(cohortGeo,"ingresadas",A.keys),
    department_rejections:geoCohortReport(cohortGeo,"rechazadas",A.keys),active_no_documents:activeNoDocuments,
    active_no_answer:activeNoAnswer,records_scanned:recordsScanned,
    undated_finalized:undatedFinalized,undated_submissions:undatedSubmissions,
    legacy_submissions_current:legacyA,legacy_submissions_previous:legacyB,unknown_amount:unknownAmount,
    currently_rejected:currentlyRejected,undated_rejections:undatedRejections,
    estimated_rejections_current:estimatedRejectionsA,estimated_rejections_previous:estimatedRejectionsB
  };
}
