import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {buildCreditDashboardComparison,localDateKey} from '../src/credit-analytics.js';

class KV { db=new Map(); async get(k){return this.db.get(k)||null} async put(k,v){this.db.set(k,String(v))} async list({prefix='',limit=200,cursor}={}){const keys=[...this.db.keys()].filter(k=>k.startsWith(prefix)).sort();const i=Number(cursor||0),end=Math.min(i+limit,keys.length);return {keys:keys.slice(i,end).map(name=>({name})),list_complete:end===keys.length,cursor:end===keys.length?undefined:String(end)}} }
const env={CREDIZAS_KV:new KV(),ADMIN_USER:'admin',ADMIN_PASSWORD:'test-password',ADMIN_SESSION_SECRET:'dummy-long-test-secret-for-signing'};
const host='https://test.credizas.invalid';
const get=(url,cookie='')=>worker.fetch(new Request(host+url,{headers:{cookie}}),env);
const post=(url,body,cookie='')=>worker.fetch(new Request(host+url,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)}),env);
const register=async(name)=>{const r=await post('/api/seller/register',{name,pin:'4321'});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],seller:(await r.json()).seller}};
const {cookie,seller}=await register('Asesor prueba documentos');const other=await register('Asesor ajeno');
const now=new Date().toISOString();const localDay=localDateKey(now);
const pending=(id,ratified=false)=>({id,vendedor_id:seller.id,vendedor:seller.name,created_at:now,stage1:{submitted_at:now,control:{estado:'APROBADA'},data:{datos_basicos:{nombre_completo:'Cliente simulado'},solicitud:{monto_total_solicitado:1200},informacion_complementaria:{departamento:'GUATEMALA'}}},stage3:{status:ratified?'RATIFICADO':'PENDIENTE RATIFICACION',quotes:{options:[{term_months:6,monthly_payment:200}],down_payment:0,sent_at:now},...(ratified?{seller_ratification:{confirmed:true,confirmed_at:now,term_months:6,monthly_payment:200}}:{})},history:[]});
const put=rec=>env.CREDIZAS_KV.put('case:'+rec.id,JSON.stringify(rec));
await put(pending('pre'));await put(pending('post',true));
const action=(id,c=cookie)=>post('/api/stage3/no-documents',{case_id:id},c);
assert.equal((await action('pre','')).status,401);
assert.equal((await action('pre',other.cookie)).status,403);
let r=await action('pre');assert.equal(r.status,200);let marked=await r.json();assert.equal(marked.summary.estado_paso3,'CLIENTE NO ENVIA DATOS');assert.equal(marked.summary.cerrado,false);assert.equal(marked.summary.pending_for,'VENDEDOR');assert.equal(marked.case.stage3.quotes.options[0].monthly_payment,200);assert.equal(marked.case.stage3.seller_ratification,undefined);
assert.equal((await action('pre')).status,400); // no duplicar evento al insistir
for(const [path,data] of [['ratify',{selected_index:0}],['reject',{}],['no-answer',{}]])assert.equal((await post('/api/stage3/'+path,{case_id:'pre',...data},cookie)).status,400);
let active=await (await get('/api/seller/cases/pre',cookie)).json();assert.equal(active.permissions.start_stage3,false);
r=await post('/api/stage3/resume',{case_id:'pre'},cookie);assert.equal(r.status,200);assert.equal((await r.json()).case.stage3.status,'PENDIENTE RATIFICACION');
r=await post('/api/stage3/ratify',{case_id:'pre',selected_index:0},cookie);assert.equal(r.status,200);
assert.equal((await action('post')).status,200);
active=await (await get('/api/seller/cases/post',cookie)).json();assert.equal(active.permissions.start_stage2,false);assert.equal(active.case.stage3.seller_ratification.confirmed,true);
assert.equal((await post('/api/final/submit',{workflow:{reviewed_by_user:true},stage1:{expediente:{id:'post'}}},cookie)).status,400);
const fd=new FormData();fd.set('case_id','post');fd.set('selfie',new File(['x'],'selfie.jpg',{type:'image/jpeg'}));fd.append('utility_files',new File(['x'],'recibo.jpg',{type:'image/jpeg'}));
assert.equal((await worker.fetch(new Request(host+'/api/stage2/extract',{method:'POST',headers:{cookie},body:fd}),env)).status,400);
assert.equal((await post('/api/stage3/resume',{case_id:'post'},other.cookie)).status,403);
const login=await post('/api/admin/login',{user:'admin',password:'test-password'});const adminCookie=login.headers.get('set-cookie').split(';')[0];
const query='/api/admin/analytics?type=day&start_a='+localDay+'&end_a='+localDay;
const api=await (await get(query,adminCookie)).json();assert.equal(api.metrics.cliente_no_envia_datos.current,2);assert.equal(api.metrics.documentos_retomados.current,1);assert.equal(api.metrics.rechazadas_total.current,0);assert.equal(api.active_no_documents,1);assert.equal(api.department_submissions.total_a,2);assert.equal(api.department_submissions.amount_a,2400);
r=await post('/api/stage3/resume',{case_id:'post'},cookie);assert.equal(r.status,200);let restored=await r.json();assert.equal(restored.case.stage3.status,'RATIFICADO');assert.equal(restored.case.stage3.seller_ratification.confirmed,true);assert.equal(restored.summary.pending_detail,'Subir documentos de Formalización');
active=await (await get('/api/seller/cases/post',cookie)).json();assert.equal(active.permissions.start_stage2,true);
const complete=pending('complete',true);complete.stage2={control:{estado:'SUBIDA'}};await put(complete);assert.equal((await action('complete')).status,400);
const hasDocs=pending('with-docs',true);hasDocs.stage2_documents={selfie:[{key:'selfie'}],utility:[{key:'recibo'}]};await put(hasDocs);assert.equal((await action('with-docs')).status,400);
const closed=pending('closed');closed.stage1.control.estado='RECHAZADA';closed.closed_at=now;await put(closed);assert.equal((await action('closed')).status,400);

// Comparison by first submission, not by rejection date; reopened and finalized are not rejected cohorts.
const a='2026-11-19T12:00:00Z',b='2026-11-18T12:00:00Z',later='2026-11-20T12:00:00Z';
function sample(id,date,dep,amount,state='SUBIDA',sellerId=seller.id){return {id,vendedor_id:sellerId,created_at:date,updated_at:later,stage1:{submitted_at:date,control:{estado:state},data:{solicitud:{monto_total_solicitado:amount},informacion_complementaria:{departamento:dep}}},history:[{at:date,event:'STAGE1_SUBIDA'},...(state==='RECHAZADA'?[{at:later,event:'ADMIN_CONTROL_PRECALIFICACION',to_state:'RECHAZADA'}]:[])]}}
const cases=[sample('a1',a,'Guatemala',1000,'RECHAZADA'),sample('a2',a,'Guatemala',2500),sample('a3',a,'Quiche',1200.25,'RECHAZADA'),sample('a4',a,'Quiché',null,'RECHAZADA'),sample('b1',b,'Guatemala',1500,'RECHAZADA'),sample('b2',b,'Quiche',900)];
const reopened=sample('reopened',a,'Guatemala',300,'APROBADA');reopened.history.push({at:later,event:'ADMIN_CONTROL_PRECALIFICACION',to_state:'RECHAZADA'},{at:later,event:'ADMIN_CONTROL_PRECALIFICACION',to_state:'APROBADA'});cases.push(reopened);
const noDocs=sample('waiting',a,'Guatemala',500,'APROBADA');noDocs.stage3={status:'CLIENTE NO ENVIA DATOS',documents_followup:{first_at:later,started_at:later}};cases.push(noDocs);
const old=sample('old','2026-11-17T12:00:00Z','Guatemala',4000,'RECHAZADA');cases.push(old);
const final=sample('final',a,'Guatemala',800,'APROBADA');final.stage3={status:'CREDITO FINALIZADO CON EXITO',finalized_at:later,bank_approval:{approved_amount:750}};cases.push(final);
cases.push(sample('other',a,'GUATEMALA',9999,'RECHAZADA',other.seller.id));
const options={type:'day',start_a:'2026-11-19',end_a:'2026-11-20',start_b:'2026-11-18',end_b:'2026-11-18',seller_id:seller.id};
const d=buildCreditDashboardComparison(cases,options);
assert.equal(d.department_submissions.total_a,7);assert.equal(d.department_submissions.total_b,2);assert.equal(d.department_submissions.amount_a,6300.25);assert.equal(d.department_submissions.amount_b,2400);assert.equal(d.department_rejections.total_a,3);assert.equal(d.department_rejections.amount_a,2200.25);assert.equal(d.department_rejections.total_b,1);assert.equal(d.department_rejections.amount_b,1500);assert.equal(d.department_rejections.unknown_a,1);assert.equal(d.metrics.rechazadas_total.current,6);assert.equal(d.department_rejections.rows.find(x=>x.department==='QUICHÉ').current,2);assert.equal(d.total_a,1);assert.equal(d.metrics.monto_finalizado.current,750);assert.equal(d.metrics.cliente_no_envia_datos.current,1);
assert.deepEqual(d.department_submissions.totals,[7,0]);assert.deepEqual(d.department_rejections.totals,[3,0]);
for(const opt of [{type:'month',start_a:'2026-11',end_a:'2026-11',start_b:'2026-10',end_b:'2026-10'},{type:'year',start_a:'2026',end_a:'2026',start_b:'2025',end_b:'2025'}]){const result=buildCreditDashboardComparison(cases,{...opt,seller_id:seller.id});assert.equal(result.department_submissions.total_a,result.metrics.ingresadas.current);assert.equal(result.department_rejections.total_a,5);assert.equal(result.department_rejections.amount_a,7700.25)}
const admin=await (await get('/admin')).text(),sellerHtml=await (await get('/')).text();
assert(admin.includes('id="creditSubmittedTab"')&&admin.includes('id="creditRejectedTab"')&&admin.includes('id="creditDepartmentPanel"'));
assert(sellerHtml.includes('id="stage2NoDocumentsBtn"')&&sellerHtml.includes('id="stage3NoDocumentsBtn"')&&sellerHtml.includes('Retomar documentos'));
const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const script=src.slice(src.indexOf('let creditDashboardInitialized=false,'),src.indexOf('\nlet fcbWarehouseList=[]'));
const elements=new Map();const q=s=>{if(!elements.has(s))elements.set(s,{innerHTML:'',textContent:'',addEventListener(){},classList:{toggle(){}},setAttribute(){}});return elements.get(s)};
const ctx={q,esc:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;'),Intl,Date,Number,Math,Error,URL};vm.createContext(ctx);vm.runInContext(script+'\nglobalThis.render=creditReportRender;globalThis.select=selectCreditSubmission;',ctx);ctx.render(d);
function aligned(){const count=(str)=>(str.match(/<(?:th|td)\b/g)||[]).length;assert.equal(count(q('#creditSubmissionHead').innerHTML),count(q('#creditSubmissionFoot').innerHTML));for(const row of q('#creditSubmissionRows').innerHTML.split('</tr>').filter(Boolean))assert.equal(count(row),count(q('#creditSubmissionHead').innerHTML))}
aligned();assert(q('#creditSubmissionFoot').innerHTML.includes('6,300.25'));ctx.select('rechazadas');aligned();assert(q('#creditSubmissionFoot').innerHTML.includes('2,200.25'));assert(q('#creditSubmissionFoot').innerHTML.includes('42.9%'));assert(q('#creditSubmissionNote').textContent.includes('sin monto válido'));ctx.select('ingresadas');aligned();assert(q('#creditSubmissionFoot').innerHTML.includes('6,300.25'));
console.log('OK V23.11: permisos, pausa/retoma antes y después de ratificar, bloqueo de envío y OCR mientras espera, historial, métricas independientes, cohortes y montos por departamento, filtros día/mes/año, pestañas y alineación del frontend.');
