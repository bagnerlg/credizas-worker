import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../src/index.js';
import {readFileSync} from 'node:fs';

const html = await (await worker.fetch(new Request('https://credizas.test/'), {})).text();
const ids=[
  ['coverageDepartment','coverageDeptDrop','coverageDepartments'],
  ['coverageMunicipality','coverageMunDrop','coverageMunicipalities'],
  ['coverageTown','coverageTownDrop','coverageTowns'],
  ['coverageZone','coverageZoneDrop','coverageZones'],
];
for(const [input,button,choices] of ids){
  const tag=html.match(new RegExp(`<input[^>]*id="${input}"[^>]*>`))?.[0];
  assert(tag,`Falta input ${input}`);
  assert(tag.includes(`data-options-id="${choices}"`),`Debe usar menú personalizado ${input}`);
  assert(!/\slist\s*=/.test(tag),`No permitir flecha nativa datalist ${input}`);
  assert(tag.includes('aria-expanded="false"'));
  const btn=html.match(new RegExp(`<button[^>]*id="${button}"[^>]*>`))?.[0];
  assert(btn?.includes('class="location-toggle"'),`La flecha no está dentro del input ${button}`);
  assert.equal((html.match(new RegExp(`id="${button}"`,'g'))||[]).length,1);
  assert(html.includes(`<datalist id="${choices}"></datalist>`));
}
for(const oldId of ['coverageDeptClear','coverageMunClear','coverageZoneClear'])assert(!html.includes(`id="${oldId}"`),'No debe existir botón extra fuera del campo');
assert.match(html,/\.location-picker \.location-toggle\{position:absolute;top:50%;right:6px/);
assert.match(html,/\.field \.location-picker input\{[^}]*padding-right:44px/);
assert.match(html,/input\.addEventListener\('click',\(\)=>updateMenu\(true\)\)/);
assert.match(html,/input\.addEventListener\('input',\(\)=>\{if\(!choosing\)updateMenu\(false\)\}\)/);
assert.match(html,/wireLocationPicker\('coverageTown','coverageTownDrop'\)/);

// Ejercitar el JS real del menú sin dependencias externas de navegador.
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const block1=source.slice(source.indexOf('const locationPickerUpdates='),source.indexOf('function coverageNoticeClass('));
const block2=source.slice(source.indexOf('function wireLocationPicker('),source.indexOf('function setupCoverageInputs('));
assert(block1.length>0&&block2.length>0);
class Classes{
  constructor(owner){this.owner=owner}
  get values(){return new Set(this.owner.className.split(/\s+/).filter(Boolean))}
  contains(s){return this.values.has(s)}
  add(s){const v=this.values;v.add(s);this.owner.className=[...v].join(' ')}
  remove(s){const v=this.values;v.delete(s);this.owner.className=[...v].join(' ')}
}
class El{
  constructor(id=''){this.id=id;this.value='';this.className='';this.classList=new Classes(this);this.attributes={};this.listeners={};this.dataset={};this.focused=false}
  addEventListener(ev,fn){(this.listeners[ev]??=[]).push(fn)}
  dispatchEvent(ev){ev.target??=this;for(const fn of this.listeners[ev.type]||[])fn(ev)}
  click(){this.dispatchEvent({type:'click',target:this})}
  setAttribute(k,v){this.attributes[k]=v}
  focus(){this.focused=true}
  closest(){return this.parent}
  scrollIntoView(){}
}
class Menu extends El{
  constructor(){super();this._html='';this._choices=[];this._clear=null;this.className='hidden'}
  set innerHTML(v){this._html=v;this._choices=[...v.matchAll(/data-choice="([^"]+)"/g)].map((match)=>{const e=new El();e.dataset.choice=match[1].replaceAll('&amp;','&');return e});this._clear=v.includes('data-clear-choice=')?new El():null}
  get innerHTML(){return this._html}
  querySelector(sel){if(sel==='[data-clear-choice]')return this._clear;if(sel==='[data-choice].active')return this._choices.find(x=>x.classList.contains('active'))||null;if(sel==='[data-choice]')return this._choices[0]||null;return null}
  querySelectorAll(sel){if(sel==='[data-choice]')return this._choices;return []}
}
class DL extends El{
  set innerHTML(v){this.options=[...v.matchAll(/<option value="([^"]+)"/g)].map(m=>({value:m[1]}))}
  get innerHTML(){return ''}
}
const elements=new Map();const listeners={};
const doc={createElement:tag=>tag==='div'?new Menu():new El(),addEventListener:(ev,fn)=>(listeners[ev]??=[]).push(fn)};
const sandbox={q:selector=>elements.get(selector.slice(1)),document:doc,Event:class {constructor(type){this.type=type}},esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
vm.createContext(sandbox);vm.runInContext(block1+'\n'+block2,sandbox);
for(const [inputId,buttonId,dlId] of ids){
  const input=new El(inputId),btn=new El(buttonId),dl=new DL(dlId);
  input.dataset.optionsId=dlId;
  const wrapper={child:null,appendChild(e){this.child=e},contains(el){return [input,btn,this.child,...(this.child?this.child._choices:[])].includes(el)}};
  input.parent=wrapper;elements.set(inputId,input);elements.set(buttonId,btn);elements.set(dlId,dl);
  vm.runInContext(`wireLocationPicker('${inputId}','${buttonId}')`,sandbox);
  const menu=wrapper.child;
  // Abrir al pulsar la flecha interna, no importa si el campo ya contiene un valor.
  sandbox.setDatalist(dlId,['GUATEMALA','ESCUINTLA','SACATEPÉQUEZ']);
  input.value='GUATEMALA';btn.click();assert(!menu.classList.contains('hidden'),`${inputId}: botón no abre`);
  assert(menu.innerHTML.includes('ESCUINTLA'),`${inputId}: botón debe mostrar todas las opciones aunque exista selección`);
  assert.equal(input.attributes['aria-expanded'],'true');
  // Cambiar la selección sin tener que borrar el texto antes.
  menu._choices.find(b=>b.dataset.choice==='ESCUINTLA').click();
  assert.equal(input.value,'ESCUINTLA');assert(menu.classList.contains('hidden'));assert.equal(input.attributes['aria-expanded'],'false');
  // Escribir abre coincidencias filtradas y la búsqueda mantiene entrada manual.
  input.value='sac';input.dispatchEvent({type:'input'});
  assert(menu.innerHTML.includes('SACATEPÉQUEZ'));assert(!menu.innerHTML.includes('GUATEMALA'));
  input.value='LUGAR MANUAL';input.dispatchEvent({type:'input'});
  assert(menu.innerHTML.includes('Puedes escribir el lugar manualmente'));
  // No se pierde la posibilidad de vaciar selección desde la propia lista.
  btn.click();btn.click(); // Cierra y reabre sin eliminar texto
  const clear=menu._clear;assert(clear);clear.click();assert.equal(input.value,'');
}
for(const script of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean))new vm.Script(script);
const adminHtml=await (await worker.fetch(new Request('https://credizas.test/admin'), {})).text();
for(const script of [...adminHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean))new vm.Script(script);
console.log('OK V23.6: una sola flecha dentro del cuadro para los 4 campos, abrir/cambiar/buscar/limpiar manualmente, listas asíncronas y sintaxis real vendedor/admin.');
