import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import {join} from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import worker from '../src/index.js';
import {buildCreditDashboardComparison,buildCreditDashboard} from '../src/credit-analytics.js';

const stamp='2026-11-19T16:00:00Z'; // 19/11 en Guatemala
const oldDay='2026-11-19T04:30:00Z'; // 18/11 en Guatemala
const sample=(id,seller='s1')=>({id,vendedor_id:seller,created_at:'2026-11-17T12:00:00Z',updated_at:stamp,stage1:{submitted_at:'2026-11-17T12:00:00Z',data:{informacion_complementaria:{departamento:'GUATEMALA'}},control:{estado:'SUBIDA'}},history:[]});
const cases=[];
const pre=sample('pre');pre.stage1.control.estado='RECHAZADA';pre.closed_at=stamp;pre.history=[{at:stamp,event:'ADMIN_CONTROL_PRECALIFICACION',from_state:'EN REVISION',to_state:'RECHAZADA',detail:'Criterio administrativo'}];cases.push(pre);
const formal=sample('formal');formal.stage1.control.estado='APROBADA';formal.formalizacion_control={estado:'RECHAZADA'};formal.closed_at=stamp;formal.history=[{at:stamp,event:'ADMIN_CONTROL_FORMALIZACION',to_state:'RECHAZADA'}];cases.push(formal);
const client=sample('client');client.stage1.control.estado='APROBADA';client.stage3={status:'CREDITO NO ACEPTADO POR CLIENTE',client_rejection:{rejected_at:stamp}};client.closed_at=stamp;cases.push(client);
const mixed=sample('mixed');mixed.stage1.control.estado='APROBADA';mixed.stage3={status:'CREDITO NO ACEPTADO POR CLIENTE',client_rejection:{rejected_at:stamp}};mixed.history=[{at:stamp,event:'ADMIN_CONTROL_PRECALIFICACION',to_state:'RECHAZADA'},{at:stamp,event:'STAGE3_RECHAZADO_CLIENTE'}];mixed.closed_at=stamp;cases.push(mixed);
const old=sample('old');old.stage1.control.estado='RECHAZADA';old.closed_at=oldDay;cases.push(old);
const legacy=sample('legacy');legacy.stage1.control.estado='RECHAZADA';legacy.closed_at=stamp;cases.push(legacy);
const estimate=sample('estimate');estimate.stage1.control.estado='RECHAZADA';cases.push(estimate); // solo updated_at, señalada como aproximación
const undated=sample('undated');undated.stage1.control.estado='RECHAZADA';undated.updated_at=null;cases.push(undated);
const reopened=sample('reopened');reopened.stage1.control.estado='APROBADA';reopened.history=[{at:stamp,event:'ADMIN_CONTROL_PRECALIFICACION',to_state:'RECHAZADA'},{at:'2026-11-20T16:00:00Z',event:'ADMIN_CONTROL_PRECALIFICACION',to_state:'APROBADA'}];cases.push(reopened);
const separate=sample('separate','s2');separate.stage1.control.estado='RECHAZADA';separate.closed_at=stamp;cases.push(separate);

const a=buildCreditDashboardComparison(cases,{type:'day',start_a:'2026-11-19',end_a:'2026-11-19',start_b:'2026-11-18',end_b:'2026-11-18'});
const m=a.metrics;
assert.equal(m.precalificacion_rechazada.current,6,'pre A'); // pre,mixed,legacy,estimate,reopened, (other seller = +1)
assert.equal(m.precalificacion_rechazada.previous,1,'pre B');
assert.equal(m.formalizacion_rechazada.current,1,'formal A');
assert.equal(m.cliente_rechaza.current,2,'client A');
assert.equal(m.rechazo_administrativo.current,7,'admin all distinct A');
assert.equal(m.rechazadas_total.current,8,'all distinct A: one mixed case has two reasons');
assert.equal(m.rechazadas_total.previous,1,'old day counted under previous period');
assert.equal(a.currently_rejected,9,'includes undated, not reopened');
assert.equal(a.undated_rejections,1,'legacy without timestamp shown as warning');
assert.equal(a.estimated_rejections_current,1,'last updated fallback disclosed');
assert.equal(a.estimated_rejections_previous,0);
assert.equal(buildCreditDashboardComparison(cases,{type:'day',start_a:'2026-11-19',end_a:'2026-11-19',start_b:'2026-11-18',end_b:'2026-11-18',seller_id:'s1'}).metrics.rechazadas_total.current,7,'filter seller');
assert.equal(buildCreditDashboardComparison(cases,{type:'month',start_a:'2026-11',end_a:'2026-11',start_b:'2026-10',end_b:'2026-10'}).metrics.rechazadas_total.current,9,'month includes old');
assert.equal(buildCreditDashboardComparison(cases,{type:'year',start_a:'2026',end_a:'2026',start_b:'2025',end_b:'2025'}).metrics.rechazadas_total.current,9,'year');
assert.equal(buildCreditDashboard(cases,{type:'day',period:'2026-11-19'}).metrics.rechazadas_total.current,8,'legacy engine still supported');
assert.equal(a.metrics.finalizados.current,0,'rechazos no son créditos finalizados');

class KV{db=new Map();async get(k){return this.db.get(k)||null}async put(k,v){this.db.set(k,String(v))}async list({prefix='',limit=200,cursor}={}){const all=[...this.db.keys()].filter(x=>x.startsWith(prefix)).sort();const i=Number(cursor||0),end=Math.min(i+limit,all.length);return {keys:all.slice(i,end).map(name=>({name})),list_complete:end===all.length,cursor:end===all.length?undefined:String(end)}}}
const env={CREDIZAS_KV:new KV(),ADMIN_USER:'admin',ADMIN_PASSWORD:'test-password',ADMIN_SESSION_SECRET:'long-enough-fake-secret-for-testing'};
for(const rec of cases)await env.CREDIZAS_KV.put('case:'+rec.id,JSON.stringify(rec));
const host='https://testing.credizas.invalid';
assert.equal((await worker.fetch(new Request(host+'/api/admin/analytics?type=day&start_a=2026-11-19&end_a=2026-11-19&start_b=2026-11-18&end_b=2026-11-18'),env)).status,401);
const login=await worker.fetch(new Request(host+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user:'admin',password:'test-password'})}),env);
assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie').split(';')[0];
const r=await worker.fetch(new Request(host+'/api/admin/analytics?type=day&start_a=2026-11-19&end_a=2026-11-19&start_b=2026-11-18&end_b=2026-11-18',{headers:{cookie}}),env);
assert.equal(r.status,200);
const d=await r.json();assert.equal(d.metrics.rechazadas_total.current,8);
const admin=await (await worker.fetch(new Request(host+'/admin'),env)).text();
assert(admin.includes('Solicitudes rechazadas · A'));
assert(admin.includes('Rechazadas por administrador · A'));
assert(admin.includes('precalificacion_rechazada'));
assert(admin.includes('formalizacion_rechazada'));
for(const [i,match] of [...admin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()){
  const path=join(mkdtempSync(join(os.tmpdir(),'credizas-v2310-')),'admin'+i+'.js');writeFileSync(path,match[1]);execFileSync(process.execPath,['--check',path]);
}
// Renderizar la lógica real de pantalla sin depender de capturas o inferencias de HTML.
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const js=source.slice(source.indexOf('let creditDashboardInitialized=false,'),source.indexOf('\nlet fcbWarehouseList=[]'));
const elements=new Map();
const q=selector=>{if(!elements.has(selector))elements.set(selector,{textContent:'',innerHTML:'',value:'',addEventListener(){}});return elements.get(selector)};
const context={q,esc:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;'),Intl,Date,Number,Math,Error,URL,fetch:async()=>{throw Error('No network')}};
vm.createContext(context);vm.runInContext(js+'\nglobalThis.renderV2310=creditReportRender;',context);
context.renderV2310(d);
assert(elements.get('#creditReportKpis').innerHTML.includes('Solicitudes rechazadas · A'));
assert(elements.get('#creditReportKpis').innerHTML.includes('<strong>8</strong>'));
assert(elements.get('#creditFunnelRows').innerHTML.includes('Precalificaciones rechazadas (administrador)'));
assert(elements.get('#creditFunnelRows').innerHTML.includes('Formalizaciones rechazadas (administrador)'));
assert(elements.get('#creditFunnelRows').innerHTML.includes('TOTAL DE SOLICITUDES RECHAZADAS'));
assert(elements.get('#creditDeptNote').textContent.includes('fecha aproximada'));
console.log('OK V23.10: rechazos Precalificación, Formalización y cliente, deduplicación de totales, historial, legados y fechas aproximadas, GMT-6, filtros, API admin y renderizado JS frontend.');
