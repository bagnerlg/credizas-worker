import assert from 'node:assert/strict';
import worker from '../src/index.js';

class MemoryKV {
  data = new Map();
  async get(key) { return this.data.get(key) ?? null; }
  async put(key, value) { this.data.set(key, String(value)); }
  async delete(key) { this.data.delete(key); }
  async list({prefix='', limit=1000}={}) { return {keys:[...this.data.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(name=>({name})),list_complete:true}; }
}
const env = {CREDIZAS_KV:new MemoryKV(),ADMIN_USER:'testadmin',ADMIN_PASSWORD:'dummy-test-secret',ADMIN_SESSION_SECRET:'dummy-long-test-secret',ZASHOME_API_KEY:'dummy-secret-used-only-in-worker'};
const base = 'https://credizas.test';
const official = 'https://api.zashome.com.gt/api/integrations/excel/coverage';
const originalFetch=globalThis.fetch;
const seen=[];
globalThis.fetch=async (target,opts={})=>{
  if(!String(target).startsWith(official))return originalFetch(target,opts);
  seen.push({url:String(target),options:opts});
  const data=[
    {municipio_id:1,departamento:'GUATEMALA',municipio:'MIXCO',latitud:14.6,longitud:-90.6,distancia_bodega_km:5},
    {municipio_id:2,departamento:'GUATEMALA',municipio:'VILLA NUEVA',latitud:14.5,longitud:-90.5},
    {municipio_id:3,departamento:'SACATEPÉQUEZ',municipio:'ANTIGUA GUATEMALA'},
    {municipio_id:2,departamento:'GUATEMALA',municipio:'VILLA NUEVA'}
  ];
  if(String(target).includes('scenario=auth')){
    if(!opts.headers?.Authorization)return new Response(JSON.stringify({error:'auth required'}),{status:401});
    assert.equal(opts.headers.Authorization, 'Bearer '+env.ZASHOME_API_KEY);
    return Response.json({data});
  }
  if(String(target).includes('scenario=error'))return new Response('unavailable',{status:503});
  return Response.json({data});
};
const post = (path,body,cookie='')=>worker.fetch(new Request(base+path,{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify(body)}),env);
const registered=await post('/api/seller/register',{name:'Vendedor cobertura',pin:'4321'});
assert.equal(registered.status,200);
const cookie=(registered.headers.get('set-cookie')||'').split(';')[0];
assert(cookie.startsWith('credizas_seller='));
const get=path=>worker.fetch(new Request(base+path,{headers:{cookie}}),env);
const unauth=await worker.fetch(new Request(base+'/api/coverage/departments'),env);
assert.equal(unauth.status,401,'Sólo sesiones válidas acceden al directorio interno');
const departments=await (await get('/api/coverage/departments')).json();
assert.equal(departments.ok,true);
assert.equal(departments.source,'ZASHOME_API');
assert.deepEqual(departments.departments,['GUATEMALA','SACATEPÉQUEZ']);
assert.equal(seen.length,1);
assert.equal(seen[0].url,official,'Debe usar URL oficial sin variable adicional');
assert.equal(seen[0].options.headers.Authorization,undefined,'No envía Bearer en ruta pública');
assert.equal(seen[0].options.redirect,'manual','Cloudflare exige redirect manual; validar destino antes de seguir');
const guate=await (await get('/api/coverage/municipalities?department=GUATEMALA')).json();
assert.deepEqual(guate.municipalities,['MIXCO','VILLA NUEVA']);
assert.equal(seen.length,1,'Reutiliza la caché para seleccionar municipios');
const towns=await (await get('/api/coverage/towns?department=QUICH%C3%89&municipality=CHICHICASTENANGO')).json();
assert(towns.towns.some(t=>t.includes('CHUPOL')),'Aldea/caserío debe venir de BDA');
const bda=await (await get('/api/coverage/check?department=QUICH%C3%89&municipality=CHICHICASTENANGO&town=CANT%C3%93N%20CHUPOL')).json();
assert.equal(bda.ok,true);
assert.equal(seen.length,1,'BDA no depende de API ZasHome');

// Confirma que una ruta pública cambiada a privada sólo recibe secret desde backend.
env.ZASHOME_COVERAGE_URL=official+'?scenario=auth';
const authed=await (await get('/api/coverage/departments')).json();
assert.equal(authed.source,'ZASHOME_API');
assert.equal(seen.length,3,'Debe intentar primero GET público y luego Bearer');

// Si el servicio no responde, mantener captura posible y advertencia de BDA de respaldo.
env.ZASHOME_COVERAGE_URL=official+'?scenario=error';
const offline=await (await get('/api/coverage/departments')).json();
assert.equal(offline.source,'BDA_RESPALDO');
assert(offline.departments.includes('GUATEMALA'));
assert.equal(offline.api_status,'ZasHome HTTP 503');

const browser=await (await get('/')).text();
assert(!browser.includes(env.ZASHOME_API_KEY),'El secreto no puede aparecer en el HTML');
assert(!browser.includes(official),'Navegador consulta al Worker, no a la API externa');
assert(browser.includes('/api/coverage/departments'));
console.log('OK V23.2: endpoint oficial automático, datos reales de contrato simulado, municipios, caché, BDA, autenticación opcional, fallback y secreto no expuesto.');
