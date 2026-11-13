import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import os from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import worker from '../src/index.js';

class FakeKV{
  constructor(){this.db=new Map()}
  async get(k){return this.db.get(k)||null}
  async put(k,v){this.db.set(k,String(v))}
  async list({prefix='',limit=1000}={}){return {keys:[...this.db.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(name=>({name})),list_complete:true}}
}
const env={CREDIZAS_KV:new FakeKV(),ADMIN_USER:'admin-test',ADMIN_PASSWORD:'password-ficticia',ADMIN_SESSION_SECRET:'clave-de-prueba-no-real'};
const origin='https://test.credizas.local';
async function req(path, cookie='',opts={}){return worker.fetch(new Request(origin+path,{...opts,headers:{...(opts.headers||{}),...(cookie?{cookie}:{})}}),env)}

// Cobertura y otros valores se obtienen de KV; la exportación NO consulta APIs externas.
const fixture={id:'TEST-123',vendedor:'Vendedor ficticio',vendedor_id:'v1',created_at:'2026-11-12T15:00:00.000Z',updated_at:'2026-11-13T19:30:00.000Z',
 stage1:{submitted_at:'2026-11-12T15:00:00.000Z',control:{estado:'APROBADA'},data:{
  datos_basicos:{nombre_completo:'Cliente Ñandú & Hijos',numero_dpi:'0012345678901',nit:'00033',numero_celular:'01234567',fecha_nacimiento:'1990-02-03',estado_civil:'CASADO',nombre_conyuge:'Persona ficticia',genero:'F',producto_interes:'CCO ELECTRO'},
  solicitud:{producto_id:'SKU-11',producto_sku:'ST-11',producto_solicitado:'Ropero de prueba',producto_precio_catalogo:1950,monto_total_solicitado:2150,enganche_precalificacion:107.5,cuota_estimada_seleccion:'12 meses — Q250'},
  informacion_complementaria:{departamento:'SACATEPÉQUEZ',municipio:'ANTIGUA GUATEMALA',poblado:'ALDEA SAN MATEO',tipo_vivienda:'PROPIA',tipo_nacionalidad:'GUATEMALA',fuente_ingresos:'VENTAS',origen_ingresos:'INDEPENDIENTE INFORMAL',subtipo_ingreso:'OFICIO MENOR',nivel_educacion:'PRIMARIA',ingreso_promedio_mensual:2500,cobertura_bda:{label:'HABILITADO',detail:'Casco urbano'}}
 }},
 stage2:{submitted_at:'2026-11-13T10:00:00.000Z',control:{estado:'SUBIDA'},data:{domicilio:{direccion_completa:'1 avenida, zona 2'},digitacion:{giro_oficio:'Costura',direccion_empresa:'En domicilio',telefono_empresa:'00000000',antiguedad:'5 años'},referencias:[{nombre_completo:'Ana Uno',parentesco:'PRIMA',celular:'00112233'},{nombre_completo:'Beto Dos',parentesco:'AMIGO',celular:'00445566'},{nombre_completo:'Ceci Tres',parentesco:'TÍA',celular:'00778899'}]}},
 stage3:{status:'EVIDENCIA RECIBIDA',quotes:{options:[{term_months:12,monthly_payment:270}],down_payment:0,sent_at:'2026-11-12T17:00:00.000Z'},seller_ratification:{confirmed:true,term_months:12,monthly_payment:270,down_payment:0,confirmed_at:'2026-11-12T19:00:00.000Z'},bank_approval:{authorization_number:'000001234',approved_amount:3000,down_payment:0,term_months:12,monthly_payment:260,response_date:'2026-11-12',recorded_at:'2026-11-13T10:00:00.000Z'},documents_ready_at:'2026-11-13T12:00:00.000Z',delivery:{location_url:'https://maps.app.goo.gl/testfake',delivered_at:'2026-11-13T18:00:00.000Z'}},stage3_documents:{approval_pdfs:[{key:'a'},{key:'b'},{key:'c'}]}};
await env.CREDIZAS_KV.put('case:TEST-123',JSON.stringify(fixture));
await env.CREDIZAS_KV.put('case:HISTORICO',JSON.stringify({id:'HISTORICO',vendedor_id:'v1',stage1:{control:{estado:'SUBIDA'}}}));
assert.equal((await req('/api/admin/export.xls')).status,401,'No permitir Excel sin sesión de admin');
const login=await req('/api/admin/login','',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user:env.ADMIN_USER,password:env.ADMIN_PASSWORD})});
assert.equal(login.status,200);const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
assert(cookie.startsWith('credizas_admin='));
const exported=await req('/api/admin/export.xls',cookie);assert.equal(exported.status,200);
const xml=await exported.text();
assert(xml.includes('Excel.Sheet')&&xml.includes('Departamento cliente')&&xml.includes('Municipio cliente'));
assert(xml.includes('SACATEPÉQUEZ')&&xml.includes('ANTIGUA GUATEMALA')&&xml.includes('ALDEA SAN MATEO'));
assert(xml.includes('1 avenida, zona 2')&&xml.includes('Ana Uno')&&xml.includes('Beto Dos')&&xml.includes('Ceci Tres'));
assert(xml.includes('Cliente Ñandú &amp; Hijos'),'Especiales XML deben escaparse');
assert(xml.includes('0012345678901')&&xml.includes('00033')&&xml.includes('01234567'),'DPI/NIT/teléfono deben conservar ceros iniciales');
assert(xml.includes('000001234'),'Número de autorización debe conservar ceros iniciales');
assert(xml.includes('12/11/2026'),'Fecha en formato local');
assert(xml.includes('HISTORICO'),'Expedientes con campos históricos ausentes deben exportarse');
const firstRow=(xml.match(/<Row>(.*?)<\/Row>/s)||[])[1]||'';
const count=(firstRow.match(/<Cell>/g)||[]).length;
assert(count>=75,`Esperaba al menos 75 columnas, llegaron ${count}`);
const rowCount=(xml.match(/<Row>/g)||[]).length;assert.equal(rowCount,3);
const filtered=await req('/api/admin/export.xls?q=%C3%91and%C3%BA',cookie);assert.equal((await filtered.text()).match(/<Row>/g).length,2);
const visible=await req('/api/admin/export.xls?fields=nombre,departamento,municipio,telefono',cookie);
const visibleXml=await visible.text();
assert.equal((visibleXml.match(/<Cell>/g)||[]).length,3*4);
assert(!visibleXml.includes('Referencia 1 nombre'),'El modo visibles no debe exportar columnas no pedidas');
// El selector visual y el Excel completo son acciones distintas.
const html=await (await req('/admin')).text();
assert(html.includes('Descargar Excel completo')&&html.includes('Excel · columnas visibles'));
assert(html.includes('departamento:"Departamento"')&&html.includes('municipio:"Municipio"'));
assert(html.includes('q("#exportBtn").onclick=()=>{location.href=queryUrl("/api/admin/export.xls")}'));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const [index,source] of scripts.entries()){
 const file=join(mkdtempSync(join(os.tmpdir(),'credizas-js-')),`admin-${index}.js`);
 writeFileSync(file,source);execFileSync(process.execPath,['--check',file]);
}
console.log(`OK: exportación completa ${count} columnas, 2 expedientes, datos P1/P2/P3, ubicación, referencias, números con ceros, filtros, modo visibles, protección admin, compatibilidad histórica, JS.`);
