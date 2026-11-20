// CrediZas V23.7 — Métricas operativas. No realiza decisiones crediticias ni modifica expedientes.
const GT_TIMEZONE = 'America/Guatemala';
const dtf = new Intl.DateTimeFormat('en-US', {timeZone:GT_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const METRIC_IDS = [
  'ingresadas','precalificacion_aprobada','cuotas_enviadas','cliente_acepta',
  'cliente_no_responde','contacto_retomado','cliente_rechaza','formalizacion_enviada',
  'formalizacion_aprobada','banco_registrado','finalizados','monto_finalizado'
];
export const ANALYTICS_METRIC_LABELS = {
  ingresadas:'Solicitudes ingresadas',
  precalificacion_aprobada:'Precalificación aprobada',
  cuotas_enviadas:'Ofertas de cuotas enviadas',
  cliente_acepta:'Cliente acepta las condiciones',
  cliente_no_responde:'Cliente no responde',
  contacto_retomado:'Contacto retomado',
  cliente_rechaza:'Cliente rechaza las condiciones',
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
function metricEvents(rec){
  const ev=[];const add=(metric,at)=>{if(at&&localDateKey(at))ev.push({metric,at})};
  add('ingresadas',rec?.created_at||rec?.stage1?.submitted_at);
  add('cuotas_enviadas',rec?.stage3?.quotes?.sent_at);
  add('cliente_acepta',rec?.stage3?.seller_ratification?.confirmed_at);
  add('cliente_no_responde',rec?.stage3?.client_followup?.started_at);
  add('cliente_rechaza',rec?.stage3?.client_rejection?.rejected_at);
  add('contacto_retomado',rec?.stage3?.client_followup?.resumed_at);
  add('formalizacion_enviada',rec?.stage2?.submitted_at);
  add('banco_registrado',rec?.stage3?.bank_approval?.recorded_at);
  for(const h of Array.isArray(rec?.history)?rec.history:[]){
    const e=h?.event||'';
    if(e==='ADMIN_CONTROL_PRECALIFICACION'&&h.to_state==='APROBADA')add('precalificacion_aprobada',h.at);
    if(e==='ADMIN_CONTROL_FORMALIZACION'&&h.to_state==='APROBADA')add('formalizacion_aprobada',h.at);
    if(e==='STAGE3_CLIENTE_NO_CONTESTA')add('cliente_no_responde',h.at);
    if(e==='STAGE3_CONTACTO_RETOMADO')add('contacto_retomado',h.at);
    if(e==='STAGE3_RECHAZADO_CLIENTE')add('cliente_rechaza',h.at);
    if(e==='STAGE3_RATIFICADO')add('cliente_acepta',h.at);
    if(e==='STAGE3_CUOTAS_ENVIADAS')add('cuotas_enviadas',h.at);
    if(e==='STAGE2_SUBIDA'||e==='STAGE2_REINGRESADO')add('formalizacion_enviada',h.at);
    if(e==='STAGE3_BANCO_APROBADO'||e==='STAGE3_BANCO_APROBADO_OCR')add('banco_registrado',h.at);
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
