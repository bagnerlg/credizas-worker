import assert from 'node:assert/strict';
import { writeFileSync,mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import worker from '../src/index.js';

class KV {
  data=new Map();
  async get(key){return this.data.get(key)??null}
  async put(key,value){this.data.set(key,String(value))}
  async delete(key){this.data.delete(key)}
  async list({prefix='',limit=1000}={}){return {keys:[...this.data.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(name=>({name})),list_complete:true}}
}
const store=new KV();
const env={CREDIZAS_KV:store, ADMIN_USER:'testadmin', ADMIN_PASSWORD:'dummy-test-secret', ADMIN_SESSION_SECRET:'dummy-test-long-unique-secret',ZASHOME_COVERAGE_URL:'https://api.zashome.com.gt/mock/coberturas'};
const base='https://credizas.test';
let sellerCookie='';
const get=(path,admin=false)=>worker.fetch(new Request(base+path,{headers: sellerCookie&&!admin?{'cookie':sellerCookie}:{}}),env);
const post=(path,body,cookie=sellerCookie)=>worker.fetch(new Request(base+path,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)}),env);
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=> {
  if(String(url)==='https://api.zashome.com.gt/mock/coberturas'){
    return new Response(JSON.stringify({data:{departamentos:[{departamento:'GUATEMALA',municipios:['GUATEMALA','VILLA NUEVA']},{departamento:'SACATEPÉQUEZ',municipios:['ANTIGUA GUATEMALA']}]}}),{status:200,headers:{'content-type':'application/json'}});
  }
  return originalFetch(url,options);
};
const registration=await post('/api/seller/register',{name:'Prueba de regresión',pin:'4321'},'');
assert.equal(registration.status,200);
const reg=await registration.json();sellerCookie=(registration.headers.get('set-cookie')||'').split(';')[0];
assert(sellerCookie.startsWith('credizas_seller='));
const id='case-regression-v23';
const caseRec={id,created_at:'2026-11-10T12:00:00.000Z',updated_at:'2026-11-10T12:00:00.000Z',vendedor_id:reg.seller.id,vendedor:reg.seller.name,proceso:'PRECALIFICACION',estado:'APROBADA',stage1:{submitted_at:'2026-11-10T12:00:00.000Z',control:{proceso:'PRECALIFICACION',estado:'APROBADA'},data:{datos_basicos:{nombre_completo:'Cliente de prueba',numero_dpi:'1234567890123'},solicitud:{producto_solicitado:'Demo'},informacion_complementaria:{}}},stage3:{status:'PENDIENTE RATIFICACION',quotes:{options:[{term_months:12,monthly_payment:235}],down_payment:0,sent_at:'2026-11-10T15:00:00.000Z'}},history:[]};
await store.put('case:'+id,JSON.stringify(caseRec));
const list=await (await get('/api/seller/cases')).json();
assert.equal(list.cases[0].pending_for,'VENDEDOR');
assert.equal(list.cases[0].stage1_submitted_at,'2026-11-10T12:00:00.000Z');
assert(list.cases[0].history_tail.some(e=>e.event==='STAGE3_CUOTAS_FECHA'));
const noAnswer=await (await post('/api/stage3/no-answer',{case_id:id,note:'Se llamó sin respuesta'})).json();
assert.equal(noAnswer.ok,true,JSON.stringify(noAnswer));
assert.equal(noAnswer.summary.estado_paso3,'CLIENTE NO CONTESTA');
assert.equal(noAnswer.summary.cerrado,false);
assert.equal(noAnswer.summary.pending_for,'VENDEDOR');
assert.equal(noAnswer.summary.pending_detail,'Volver a contactar al cliente');
assert(noAnswer.summary.history_tail.some(e=>e.event==='STAGE3_CLIENTE_NO_CONTESTA'));
const shouldReject=await post('/api/stage3/ratify',{case_id:id,selected_index:0,note:'sin retomar'});
assert.equal(shouldReject.status,400);
const resumed=await (await post('/api/stage3/resume',{case_id:id})).json();
assert.equal(resumed.case.stage3.status,'PENDIENTE RATIFICACION');
assert(resumed.summary.history_tail.some(e=>e.event==='STAGE3_CONTACTO_RETOMADO'));
const rat=await (await post('/api/stage3/ratify',{case_id:id,selected_index:0,note:'Confirmado'})).json();
assert.equal(rat.ok,true,JSON.stringify(rat));
assert.equal(rat.summary.pending_for,'VENDEDOR');
assert.equal(rat.summary.pending_detail,'Subir documentos de Formalización');
assert.equal(rat.case.stage3.seller_ratification.confirmed,true);
const unsupported=await post('/api/stage3/no-answer',{case_id:id});assert.equal(unsupported.status,400);
const departments=await (await get('/api/coverage/departments')).json();
assert.equal(departments.source,'ZASHOME_API',JSON.stringify(departments));
assert(departments.departments.includes('GUATEMALA'));
const municipalities=await (await get('/api/coverage/municipalities?department=GUATEMALA')).json();
assert.deepEqual(municipalities.municipalities,['GUATEMALA','VILLA NUEVA']);
const towns=await (await get('/api/coverage/towns?department=QUICH%C3%89&municipality=CHICHICASTENANGO')).json();
assert(towns.ok);assert(towns.towns.some(t=>t.includes('CHUPOL')),'Aldea/caserío de BDA debe preservarse');
// Check generated browser scripts, not just the Worker.
for(const [route,label] of [['/','seller'],['/admin','admin']]){
 const resp=await get(route);assert.equal(resp.status,200);const html=await resp.text();
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 assert(scripts.length,`${label}: scripts no encontrados`);
 const dir=mkdtempSync(join(os.tmpdir(),`credizas-${label}-`));
 for(let i=0;i<scripts.length;i++){
  const file=join(dir,`script-${i}.js`);writeFileSync(file,scripts[i]);execFileSync(process.execPath,['--check',file]);
 }
 if(label==='seller'){assert(html.includes('Cliente no contesta'));assert(html.includes('Retomar contacto'));assert(html.includes('canWorkOnStage2'));}
 if(label==='admin'){assert(html.includes('Pendiente de'));assert(html.includes('Bitácora y fechas'));}
}
// JS logic regression: ratified case must enable read after selfie + utility, even with stale permissions.
const sellerHtml=await (await get('/')).text();
const mainScript=[...sellerHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(t=>t.includes('function canWorkOnStage2()'));
assert(mainScript);
const begin=mainScript.indexOf('function canWorkOnStage2()');
const end=mainScript.indexOf('const incomeRules=',begin);
const buttonsJS=mainScript.slice(begin,end);
const elements={};const q=(sel)=>elements[sel]??(elements[sel]={disabled:true,className:'',innerHTML:''});
const ctx={adminMode:false,currentRecordState:{stage1:{control:{estado:'APROBADA'}},stage3:{seller_ratification:{confirmed:true}}},currentPermissions:{start_stage2:false,edit_stage2:false,edit_stage1:false},preparedUploads:{dpiFront:[],dpiBack:[],stage2Selfie:[{name:'selfie.png'}],stage2Utility:[{name:'recibo.png'}],stage2Income:[]},sentPayload:{},stage2AnalyzedSignature:'',stage2Policy:()=>({required:false}),stage2Signature:()=>('demo'),stage1State:(r)=>r.stage1?.control?.estado,formalizationState:(r)=>r.stage2?.control?.estado,q};
vm.createContext(ctx);vm.runInContext(buttonsJS,ctx);vm.runInContext('updateButtons()',ctx);
assert.equal(q('#stage2AnalyzeBtn').disabled,false,'Regresión: botón no se habilita después de ratificar y cargar selfie + recibo');
ctx.currentRecordState.stage3.seller_ratification.confirmed=false;
vm.runInContext('updateButtons()',ctx);
assert.equal(q('#stage2AnalyzeBtn').disabled,true,'No permitir lectura antes de ratificar');
ctx.currentRecordState.stage3.seller_ratification.confirmed=true;
ctx.preparedUploads.stage2Utility=[];
vm.runInContext('updateButtons()',ctx);
assert.equal(q('#stage2AnalyzeBtn').disabled,true,'No permitir lectura sin recibo');

// verify old record tolerates missing metadata.
await store.put('case:historic-v20',JSON.stringify({id:'historic-v20',vendedor_id:reg.seller.id,vendedor:reg.seller.name,stage1:{control:{estado:'SUBIDA'}}}));
const oldList=await (await get('/api/seller/cases')).json();assert(oldList.cases.some(c=>c.id==='historic-v20'));
assert.equal((await get('/api/stage3/resume')).status,404);
console.log('OK: registro/sesión, estado sin respuesta, reanudación, ratificación, permisos backend, BDA, ZasHome simulado, historial, compatibilidad, sintaxis JS vendedor/admin.');
