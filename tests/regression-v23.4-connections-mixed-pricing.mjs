import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../src/index.js';
class MemoryKV {
  map = new Map();
  async get(k){return this.map.get(k)??null}
  async put(k,v){this.map.set(k,String(v))}
  async delete(k){this.map.delete(k)}
  async list({prefix='',limit=1000}={}){return{keys:[...this.map.keys()].filter(x=>x.startsWith(prefix)).slice(0,limit).map(name=>({name})),list_complete:true}}
}
const env={CREDIZAS_KV:new MemoryKV(),ADMIN_USER:'admin',ADMIN_PASSWORD:'dummy-admin-password',ADMIN_SESSION_SECRET:'dummy-long-session-secret',FCB_API_USER:'test-user',FCB_API_PASSWORD:'test-password'};
const base='https://credizas.test';
const call=(path,{method='GET',body,cookie=''}={})=>worker.fetch(new Request(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);
const getCookie=response=>(response.headers.get('set-cookie')||'').split(';')[0];
const adminCookie=getCookie(await call('/api/admin/login',{method:'POST',body:{user:env.ADMIN_USER,password:env.ADMIN_PASSWORD}}));
const sellerReg=await call('/api/seller/register',{method:'POST',body:{name:'Asesor productos mixtos',pin:'9876'}});
assert.equal(sellerReg.status,200);
const sellerCookie=getCookie(sellerReg),sellerId=(await sellerReg.json()).seller.id;
const seller=(path,opts={})=>call(path,{cookie:sellerCookie,...opts});
const admin=(path,opts={})=>call(path,{cookie:adminCookie,...opts});
const originalFetch=globalThis.fetch;
const calls=[];let offHostRedirect=false;
const fcbData=[
  {id:'1',item_code:'A-10',sku:'A-10 - REFRIGERADORA',whs_code:'B033',bodega:'PETAPA',disp:'5',costo:'170.00'},
  {id:'2',item_code:'A-10',sku:'A-10 - REFRIGERADORA',whs_code:'B023',bodega:'XENACOJ',disp:'3',costo:'140.00'},
  {id:'3',item_code:'B-22',sku:'B-22 - COCINA',whs_code:'B033',bodega:'PETAPA',disp:'2',costo:'200.00'}
];
const catalog=[
  {producto_id:'combo1',sku:'C-1',nombre:'Combo sala',descripcion:'Combo sala',categoria:'Combos',tipo_producto:'Combo',precio:1000,activo:true},
  {producto_id:'ind1',sku:'I-1',nombre:'Mesa',descripcion:'Mesa',categoria:'Mesas',tipo_producto:'Individual',precio:250,activo:true}
];
const coverage=[{departamento:'GUATEMALA',municipio:'GUATEMALA'},{departamento:'ESCUINTLA',municipio:'ESCUINTLA'}];
const json=data=>Response.json({data});
globalThis.fetch=async(target,opts={})=>{
  const url=new URL(String(target));calls.push({url:url.toString(),opts});
  // Model the production Worker: reject unsupported redirect modes.
  assert(['manual','follow',undefined].includes(opts.redirect), 'Workers no admite redirect:error');
  if(url.hostname==='api.zashome.com.gt'){
    if(url.pathname.endsWith('/catalog'))return json(catalog);
    if(url.searchParams.has('rerouted'))return json(coverage);
    return new Response('',{status:302,headers:{location:'/api/integrations/excel/coverage?rerouted=1'}});
  }
  if(url.hostname==='n8n.lauinc.dpdns.org'){
    assert.equal(opts.headers.Authorization,'Basic '+Buffer.from('test-user:test-password').toString('base64'));
    if(offHostRedirect)return new Response('',{status:302,headers:{location:'https://other.example/steal'}});
    if(url.searchParams.has('rerouted'))return Response.json(fcbData);
    return new Response('',{status:307,headers:{location:'/webhook/dupaza-inventario-publico?rerouted=1'}});
  }
  if(url.hostname==='other.example')assert.fail('Nunca enviar credenciales a un host externo');
  return originalFetch(target,opts);
};
// Same-origin redirects for both integrations, never expose credentials.
const z=await (await admin('/api/admin/coverage/test')).json();
assert.equal(z.ok,true);assert.equal(z.departments,2);assert.equal(z.municipalities,2);
const fcbTest=await (await admin('/api/admin/fcb/warehouses?fresh=1')).json();
assert.equal(fcbTest.ok,true);assert.equal(fcbTest.warehouses.length,2);
assert.equal(calls.filter(x=>x.url.startsWith('https://api.zashome.com.gt')).length,2);
assert.equal(calls.filter(x=>x.url.startsWith('https://n8n.lauinc.dpdns.org')).length,2);
assert(!JSON.stringify(z).includes(env.FCB_API_PASSWORD));
// Only authorised seller may see FCB for specifically assigned warehouses.
const grant=await (await admin('/api/admin/fcb/access',{method:'POST',body:{seller_id:sellerId,enabled:true,warehouses:['B033','B023']}})).json();
assert.equal(grant.enabled,true);
const fcbAvailable=await (await seller('/api/fcb/products?q=REFRIGERADORA')).json();
assert.equal(fcbAvailable.data.length,2);
assert(!JSON.stringify(fcbAvailable).includes('costo'));
// Four lines across three modes, two FCB prices typed by seller; 1 combo, 2 tables, 1 FCB in each warehouse.
const products=[
  {fuente:'ZASHOME',tipo:'COMBO',producto_id:'combo1',sku:'C-1',cantidad:1},
  {fuente:'ZASHOME',tipo:'INDIVIDUAL',producto_id:'ind1',sku:'I-1',cantidad:2},
  {fuente:'FCB',tipo:'FCB',sku:'A-10',whs_code:'B033',cantidad:2,precio_unitario_venta:325.50},
  {fuente:'FCB',tipo:'FCB',sku:'A-10',whs_code:'B023',cantidad:1,precio_unitario_venta:270.00},
  {fuente:'FCB',tipo:'FCB',sku:'B-22',whs_code:'B033',cantidad:1,precio_unitario_venta:145.00}
];
const payload={expediente:{id:'v234-mixed',vendedor_id:sellerId},datos_basicos:{nombre_completo:'Cliente prueba',numero_dpi:'1234567890123',fecha_nacimiento:'1985-04-07',nit:'CF',numero_celular:'45671234',estado_civil:'SOLTERO',genero:'MASCULINO'},informacion_complementaria:{ingreso_promedio_mensual:5000,fuente_ingresos:'SALARIO',origen_ingresos:'SALARIO INFORMAL',subtipo_ingreso:'SIN DESCUENTO IGSS',tipo_vivienda:'PROPIA',departamento:'ESCUINTLA',municipio:'ESCUINTLA',nivel_educacion:'DIVERSIFICADO'},solicitud:{productos:products}};
const rsp=await seller('/api/stage1/submit',{method:'POST',body:payload});const out=await rsp.json();assert.equal(rsp.status,200,JSON.stringify(out));
const s=out.result.stage1_data.solicitud;
// 1000 + 500 + 651 + 270 + 145 = 2566; *1.10=2822.60 -> 2850
assert.equal(s.total_venta_productos,2566);
assert.equal(s.monto_total_solicitado,2850);
assert.equal(s.enganche_precalificacion,142.50);
assert.equal(s.productos.length,5);
assert.equal(s.productos[2].precio_unitario,325.50);
assert.equal(s.productos[3].precio_unitario,270);
assert.equal(s.productos[4].precio_unitario,145);
assert(s.productos.filter(x=>x.fuente==='FCB').every(x=>x.precio_fuente==='MANUAL_VENTA'));
assert(!JSON.stringify(s.productos).includes('costo'));
// Reject missing prices, malformed decimals, cumulative stock oversubscription, disallowed warehouse.
for(const [name,alter,expected] of [
  ['missing',p=>p.solicitud.productos[2].precio_unitario_venta=0,400],
  ['decimals',p=>p.solicitud.productos[2].precio_unitario_venta=49.999,400],
  ['stock',p=>p.solicitud.productos.push({...p.solicitud.productos[2],cantidad:4}),400],
  ['permission',p=>p.solicitud.productos[2].whs_code='B999',403],
]){
  const p=structuredClone(payload);p.expediente.id='v234-'+name;alter(p);
  const r=await seller('/api/stage1/submit',{method:'POST',body:p});
  assert.equal(r.status,expected, name+' '+await r.text());
}
// A foreign-domain redirect must be rejected before any Authorization header is leaked.
offHostRedirect=true;
const forbidden=await admin('/api/admin/fcb/warehouses?fresh=1');
assert.equal(forbidden.status,502);assert.match((await forbidden.json()).error,/Redirección rechazada/i);
assert(!calls.some(x=>x.url.includes('other.example')));
// Both actual embedded browser scripts must remain syntactically valid.
for(const path of ['/','/admin']){
  const html=await (await call(path)).text();
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
  for(const script of scripts)new vm.Script(script);
  if(path==='/'){
    assert(html.includes('Precio de venta unitario Q'));
    assert(html.includes("[data-line-price]"));
    assert(html.includes('refreshSelectedProductsSummary()'));
    assert(html.includes('data-catalog-mode="combo"')&&html.includes('data-catalog-mode="individual"')&&html.includes('data-catalog-mode="fcb"'));
    assert(html.includes('Monto para solicitar al banco'));
  }
}
console.log('OK V23.4: redirecciones Cloudflare seguras, ZasHome y FCB, permisos, 5 artículos mixtos, precios por vendedor, suma +10%/Q50, enganche, stock acumulado, exportación histórica y scripts embebidos.');
