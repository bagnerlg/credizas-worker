import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { BDA_ZONES_V233 } from '../src/bda-zones.js';
class KV{store=new Map();async get(k){return this.store.get(k)??null}async put(k,v){this.store.set(k,String(v))}async list({prefix='',limit=500}={}){return{keys:[...this.store.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(name=>({name})),list_complete:true}}async delete(k){this.store.delete(k)}}
const base='https://credizas.test';const kv=new KV();
const env={CREDIZAS_KV:kv,ADMIN_USER:'admin',ADMIN_PASSWORD:'dummy-test-admin-password',ADMIN_SESSION_SECRET:'dummy-test-admin-secret-long',FCB_API_USER:'dummy-inventory-user',FCB_API_PASSWORD:'dummy-inventory-secret'};
const origFetch=globalThis.fetch;
const catalog=[{producto_id:'combo-1',sku:'CO-001',nombre:'Combo sala',descripcion:'Combo sala',categoria:'COMBOS',tipo_producto:'Combo',precio:1000,activo:true},{producto_id:'individual-1',sku:'IN-001',nombre:'Mesa individual',descripcion:'Mesa individual',categoria:'MESAS',tipo_producto:'Individual',precio:200,activo:true}];
const fcb=[{id:'1',base:'DUPAZA',item_code:'50026',sku:'50026 - COMEDOR BOHOCHIC 6PX',sku_tipo:'Terceros',whs_code:'B033',bodega:'B033-PETAPA',disp:'5.0000',costo:'1406.2500'},{id:'2',base:'DUPAZA',item_code:'50026',sku:'50026 - COMEDOR BOHOCHIC 6PX',sku_tipo:'Terceros',whs_code:'B023',bodega:'B023-XENACOJ',disp:'10.0000',costo:'1350.0000'}];
const remote=[];
globalThis.fetch=async (url,opts={})=>{
 const u=String(url);remote.push({url:u,headers:opts.headers});
 if(u.startsWith('https://api.zashome.com.gt/api/integrations/excel/catalog'))return new Response(JSON.stringify({data:catalog}),{status:200});
 if(u.includes('/api/integrations/excel/coverage'))return new Response(JSON.stringify({data:[{departamento:'GUATEMALA',municipio:'VILLA NUEVA'},{departamento:'GUATEMALA',municipio:'GUATEMALA'}]}),{status:200});
 if(u.includes('dupaza-inventario-publico')){assert.equal(opts.headers.Authorization,'Basic '+Buffer.from('dummy-inventory-user:dummy-inventory-secret').toString('base64'));return new Response(JSON.stringify(fcb),{status:200})}
 return origFetch(url,opts);
};
const call=async (path,{method='GET',body,cookie=''}={})=>worker.fetch(new Request(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);
const sellerReg=await call('/api/seller/register',{method:'POST',body:{name:'Asesor Pruebas FCB',pin:'1234'}});assert.equal(sellerReg.status,200);const sellerCookie=sellerReg.headers.get('set-cookie').split(';')[0];const sellerId=(await sellerReg.json()).seller.id;
const adminLogin=await call('/api/admin/login',{method:'POST',body:{user:'admin',password:env.ADMIN_PASSWORD}});assert.equal(adminLogin.status,200);const adminCookie=adminLogin.headers.get('set-cookie').split(';')[0];
const admin=async (path,opts={})=>call(path,{cookie:adminCookie,...opts});const seller=async(path,opts={})=>call(path,{cookie:sellerCookie,...opts});
// Coverage diagnostics: admin only, fresh check, no secrets
assert.equal((await seller('/api/admin/coverage/test')).status,401);
const cov=await (await admin('/api/admin/coverage/test')).json();assert(cov.ok&&cov.municipalities===2&&cov.departments===1);assert(!JSON.stringify(cov).includes(env.FCB_API_PASSWORD));
// Warehouse visibility and admin assignment
assert.equal((await seller('/api/fcb/products?q=BOHOCHIC')).status,403);
const warehouses=await (await admin('/api/admin/fcb/warehouses')).json();assert(warehouses.ok);assert.equal(warehouses.warehouses.length,2);
const settings=await (await admin('/api/admin/fcb/access',{method:'POST',body:{seller_id:sellerId,enabled:true,warehouses:['B033']}})).json();assert(settings.ok&&settings.enabled);assert.deepEqual(settings.warehouses,['B033']);
const products=await (await seller('/api/fcb/products?q=BOHOCHIC')).json();assert.equal(products.data.length,1);assert.equal(products.data[0].whs_code,'B033');assert(!JSON.stringify(products).includes('costo'));assert.equal((await seller('/api/fcb/products?warehouse=B023&q=BOHOCHIC')).status,403);
// Combo/Individual true server filtering
const combos=await (await seller('/api/catalog?q=combo&mode=combo')).json();assert(combos.ok&&combos.data.length===1&&combos.data[0].sku==='CO-001');
const indiv=await (await seller('/api/catalog?q=mesa&mode=individual')).json();assert(indiv.ok&&indiv.data.length===1&&indiv.data[0].sku==='IN-001');
const basic={nombre_completo:'Cliente de prueba',numero_dpi:'1234567890123',fecha_nacimiento:'1990-01-01',nit:'CF',numero_celular:'55554444',estado_civil:'SOLTERO',genero:'MASCULINO'};
const comp={ingreso_promedio_mensual:4000,fuente_ingresos:'SALARIO',origen_ingresos:'SALARIO INFORMAL',subtipo_ingreso:'SIN DESCUENTO IGSS',tipo_vivienda:'PROPIA',departamento:'ESCUINTLA',municipio:'ESCUINTLA',poblado:'PALMERAS DEL SUR',zona:'4',nivel_educacion:'DIVERSIFICADO'};
const payload={expediente:{id:'case-v233',vendedor_id:sellerId},datos_basicos:basic,informacion_complementaria:comp,solicitud:{productos:[{fuente:'ZASHOME',tipo:'COMBO',sku:'CO-001',producto_id:'combo-1',cantidad:1},{fuente:'ZASHOME',tipo:'INDIVIDUAL',sku:'IN-001',producto_id:'individual-1',cantidad:2},{fuente:'FCB',tipo:'FCB',sku:'50026',whs_code:'B033',cantidad:1,precio_unitario_venta:500}]}};
const submitted=await seller('/api/stage1/submit',{method:'POST',body:payload});const body=await submitted.json();assert.equal(submitted.status,200,JSON.stringify(body));assert.equal(body.result.stage1_data.solicitud.productos.length,3);assert.equal(body.result.stage1_data.solicitud.monto_total_solicitado,2100);assert.equal(body.result.stage1_data.solicitud.enganche_precalificacion,105);
assert.equal(body.result.stage1_data.informacion_complementaria.zona,'4');
const saved=JSON.parse(await kv.get('case:case-v233'));assert(saved);assert.equal(saved.stage1.data.solicitud.productos.length,3);
const xls=await admin('/api/admin/export.xls');assert.equal(xls.status,200);const excel=await xls.text();assert(excel.includes('Productos seleccionados'));assert(excel.includes('Zona del domicilio'));assert(excel.includes('B033-PETAPA'));
// No stock leakage and no unauthorised warehouse in incoming payload
const badPayload=structuredClone(payload);badPayload.expediente.id='case-v233-notallowed';badPayload.solicitud.productos[2].whs_code='B023';const bad=await seller('/api/stage1/submit',{method:'POST',body:badPayload});assert.equal(bad.status,403);
const badPrice=structuredClone(payload);badPrice.expediente.id='case-v233-noprice';badPrice.solicitud.productos[2].precio_unitario_venta=0;assert.equal((await seller('/api/stage1/submit',{method:'POST',body:badPrice})).status,400);
// BDA zone matching and original notes: preservation; no overwrite of historical KV keys
assert(BDA_ZONES_V233.some(x=>x.department==='ESCUINTLA'&&x.municipality==='ESCUINTLA'&&x.town==='PALMERAS DEL SUR'&&x.zone==='4'));
const chk=await (await seller('/api/coverage/check?department=ESCUINTLA&municipality=ESCUINTLA&town=PALMERAS%20DEL%20SUR&zone=4')).json();assert(chk.ok);assert(chk.coverage.detail.includes('CASAS SOBRE LÍNEA FÉRREA'));assert.equal(chk.coverage.zone,'4');
const zones=await (await seller('/api/coverage/zones?department=ESCUINTLA&municipality=ESCUINTLA&town=PALMERAS%20DEL%20SUR')).json();assert(zones.ok&&zones.zones.includes('4'));
// Both frontends compile independently
for(const path of ['/','/admin']){const response=await call(path);assert.equal(response.status,200);const html=await response.text();if(path==='/')assert(html.includes('data-catalog-mode="fcb"')&&html.includes('coverageZoneDrop')&&html.includes('sellerLoginPin'));else assert(html.includes('Probar conexión ZasHome')&&html.includes('fcbWarehousePermissions'))}
console.log('OK V23.3: cobertura ZasHome/test, tipos Combo/Individual, FCB auth Basic, permisos por bodega, sin costo expuesto, 3 productos, validación y monto, Excel, zona BDA, retrocompatibilidad.');
