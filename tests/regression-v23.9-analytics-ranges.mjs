import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync} from 'node:fs';
import os from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildCreditDashboardComparison} from '../src/credit-analytics.js';
import worker from '../src/index.js';
const record=(id,dept,created,submitted,seller='a')=>({id,vendedor_id:seller,created_at:created,updated_at:submitted,stage1:{submitted_at:submitted,data:{informacion_complementaria:{departamento:dept}},control:{estado:'APROBADA'}},history:[]});
const cases=[];
// Antes daba CERO en el día 19 porque se usaba created_at (18) en vez de la fecha de envío (19).
const a=record('a','GUATEMALA','2026-11-18T23:00:00Z','2026-11-19T15:00:00Z');
a.history=[{event:'STAGE1_SUBIDA',at:'2026-11-19T15:00:00Z'},{event:'STAGE3_CLIENTE_NO_CONTESTA',at:'2026-11-20T12:00:00Z'}];
a.stage3={status:'CLIENTE NO CONTESTA'};
cases.push(a);
const b=record('b','SACATEPÉQUEZ','2026-11-18T12:00:00Z','2026-11-18T15:00:00Z');
b.updated_at='2026-11-19T20:00:00Z';
b.history=[{event:'STAGE1_SUBIDA',at:'2026-11-18T15:00:00Z'},{event:'STAGE3_FINALIZADO',at:'2026-11-19T21:00:00Z'}];
b.stage3={status:'CREDITO FINALIZADO CON EXITO',finalized_at:'2026-11-19T21:00:00Z',bank_approval:{approved_amount:2000}};
cases.push(b);
const c=record('c','GUATEMALA','2026-11-18T12:00:00Z','2026-11-20T16:00:00Z');
c.history=[{event:'STAGE1_SUBIDA',at:'2026-11-20T16:00:00Z'},{event:'STAGE1_REINGRESADO',at:'2026-11-21T15:00:00Z'}];
c.stage1.submitted_at='2026-11-21T15:00:00Z'; // Corrección no debe cambiar el día original de envío
cases.push(c);
const correctionOnly=record('correction-only','GUATEMALA','2026-11-18T12:00:00Z','2026-11-19T16:00:00Z');
correctionOnly.history=[{event:'STAGE1_REINGRESADO',at:'2026-11-19T16:00:00Z'}];
const correctionCompare=buildCreditDashboardComparison([correctionOnly],{type:'day',start_a:'2026-11-19',end_a:'2026-11-19',start_b:'2026-11-18',end_b:'2026-11-18'});
assert.equal(correctionCompare.metrics.ingresadas.current,0);assert.equal(correctionCompare.metrics.ingresadas.previous,1);assert.equal(correctionCompare.legacy_submissions_previous,1);

const old=record('legacy','PETEN','2026-11-18T15:00:00Z',null);
delete old.stage1.submitted_at;old.updated_at=null;
cases.push(old);
const missing={id:'missing',vendedor_id:'a',updated_at:'2026-11-19T14:00:00Z',history:[]};cases.push(missing);
const other=record('other','ESCUINTLA','2026-11-18T12:00:00Z','2026-11-19T17:00:00Z','b');cases.push(other);
const cmp=buildCreditDashboardComparison(cases,{type:'day',start_a:'2026-11-19',end_a:'2026-11-20',start_b:'2026-11-18',end_b:'2026-11-18'});
assert.deepEqual(cmp.periods,['2026-11-19','2026-11-20']);
assert.equal(cmp.metrics.ingresadas.current,3); // a + c + asesor b, b original solo actividad
assert.equal(cmp.metrics.ingresadas.previous,2); // b + legacy
assert.equal(cmp.metrics.actividad.current,5); // a, b, c, missing, otro asesor
assert.equal(cmp.legacy_submissions_previous,1);
assert.equal(cmp.metrics.finalizados.current,1);
assert.equal(cmp.total_a,1);assert.equal(cmp.total_b,0);assert.equal(cmp.totals.reduce((n,x)=>n+x,0),cmp.total_a);
assert.equal(cmp.departments.find(x=>x.department==='SACATEPÉQUEZ').current,1);
assert.equal(cmp.metrics.monto_finalizado.current,2000);
assert.equal(buildCreditDashboardComparison(cases,{type:'day',start_a:'2026-11-19',end_a:'2026-11-19',start_b:'2026-11-20',end_b:'2026-11-20'}).metrics.ingresadas.current,2);
assert.equal(buildCreditDashboardComparison(cases,{type:'day',start_a:'2026-11-19',end_a:'2026-11-19',start_b:'2026-11-20',end_b:'2026-11-20'}).metrics.ingresadas.previous,1);
assert.equal(buildCreditDashboardComparison(cases,{type:'day',start_a:'2026-11-19',end_a:'2026-11-20',start_b:'2026-11-18',end_b:'2026-11-18',seller_id:'b'}).metrics.ingresadas.current,1);
for(const invalid of [{start_a:'2026-11-21',end_a:'2026-11-19'},{start_a:'2026-02-30',end_a:'2026-03-01'},{start_a:'2026-01-01',end_a:'2026-05-01'}])assert.throws(()=>buildCreditDashboardComparison([], {type:'day',...invalid}));
const monthly=buildCreditDashboardComparison(cases,{type:'month',start_a:'2026-10',end_a:'2026-11',start_b:'2025-10',end_b:'2025-11'});
assert.equal(monthly.periods.length,2);assert.equal(monthly.metrics.ingresadas.current,5);assert.equal(monthly.metrics.ingresadas.previous,0);
const annual=buildCreditDashboardComparison(cases,{type:'year',start_a:'2025',end_a:'2026',start_b:'2023',end_b:'2024'});assert.equal(annual.periods.length,2);
// API protegida y comparación con dos períodos: no mezcla casos de otros asesores.
class KV{db=new Map();async get(k){return this.db.get(k)||null}async put(k,v){this.db.set(k,v)}async list({prefix='',limit=200,cursor}={}){const keys=[...this.db.keys()].filter(k=>k.startsWith(prefix)).sort();const start=Number(cursor||0),end=Math.min(start+limit,keys.length);return {keys:keys.slice(start,end).map(name=>({name})),list_complete:end===keys.length,cursor:end===keys.length?undefined:String(end)}}}
const kv=new KV(),env={CREDIZAS_KV:kv,ADMIN_USER:'admin',ADMIN_PASSWORD:'clave-falsa',ADMIN_SESSION_SECRET:'clave-prueba-suficientemente-larga'};
for(const r of cases)await kv.put('case:'+r.id,JSON.stringify(r));
for(let n=0;n<208;n++)await kv.put('case:ficticio'+n,JSON.stringify({id:'ficticio'+n,vendedor_id:'a'}));
const base='https://testing.credizas.test',path='/api/admin/analytics?type=day&start_a=2026-11-19&end_a=2026-11-20&start_b=2026-11-18&end_b=2026-11-18';
assert.equal((await worker.fetch(new Request(base+path),env)).status,401);
const login=await worker.fetch(new Request(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user:'admin',password:'clave-falsa'})}),env);
assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
const res=await worker.fetch(new Request(base+path,{headers:{cookie}}),env);assert.equal(res.status,200);const data=await res.json();
assert.equal(data.records_scanned,214);assert.equal(data.metrics.ingresadas.current,3);assert.equal(data.metrics.actividad.current,5);assert.equal(data.periods.length,2);
const admin=await (await worker.fetch(new Request(base+'/admin'),env)).text();
for(const id of ['creditStartA','creditEndA','creditStartB','creditEndB','adminAnalysisTab','adminCasesTab'])assert(admin.includes('id="'+id+'"'),id);
assert(admin.includes('start_a'));assert(admin.includes('Total A'));assert(admin.includes('Total B'));
for(const [i,match] of [...admin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()){
 const f=join(mkdtempSync(join(os.tmpdir(),'credizas-v239-')),'admin'+i+'.js');writeFileSync(f,match[1]);execFileSync(process.execPath,['--check',f]);
}
console.log('OK V23.9: envíos históricos, dos rangos, fecha Guatemala, actividad independiente, cierres, precios, columnas, paginación KV, filtro asesor, seguridad y JS.');
