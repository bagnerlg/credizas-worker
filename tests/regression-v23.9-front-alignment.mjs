import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildCreditDashboardComparison} from '../src/credit-analytics.js';
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const script=source.slice(source.indexOf('let creditDashboardInitialized=false,'),source.indexOf('\nlet fcbWarehouseList=[]'));
const nodes=new Map();
const q=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',value:'',addEventListener(){}});return nodes.get(selector)};
const ctx={q,esc:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;'),Intl,Date,Number,Math,Error,URL,fetch:async()=>{throw Error('No network in frontend render test')}};
vm.createContext(ctx);
vm.runInContext(script+'\nglobalThis.renderForTest=creditReportRender;',ctx);
const records=[{id:'1',created_at:'2026-11-17T12:00:00Z',updated_at:'2026-11-19T12:00:00Z',stage1:{submitted_at:'2026-11-19T12:00:00Z',data:{informacion_complementaria:{departamento:'GUATEMALA'}}},stage3:{status:'CREDITO FINALIZADO CON EXITO',finalized_at:'2026-11-20T12:00:00Z',bank_approval:{approved_amount:2200}}},
{id:'2',created_at:'2026-11-18T12:00:00Z',stage1:{submitted_at:'2026-11-18T12:00:00Z',data:{informacion_complementaria:{departamento:'SACATEPÉQUEZ'}}},stage3:{status:'CREDITO FINALIZADO CON EXITO',finalized_at:'2026-11-19T12:00:00Z',bank_approval:{approved_amount:1300}}}];
for(const [type,a,b,c,d] of [
 ['day','2026-11-19','2026-11-20','2026-11-17','2026-11-18'],
 ['month','2026-10','2026-11','2026-08','2026-09'],
 ['year','2025','2026','2023','2024']]){
 const data=buildCreditDashboardComparison(records,{type,start_a:a,end_a:b,start_b:c,end_b:d});
 ctx.renderForTest(data);
 const header=q('#creditDeptHead').innerHTML,body=q('#creditDeptRows').innerHTML,footer=q('#creditDeptFoot').innerHTML;
 const thCount=(header.match(/<th\b/g)||[]).length;
 const footerCount=(footer.match(/<(?:td|th)\b/g)||[]).length;
 assert.equal(thCount,data.periods.length+5,`${type} header`);
 assert.equal(footerCount,thCount,`${type} footer`);
 const bodyFirst=body.split('</tr>')[0];
 assert.equal((bodyFirst.match(/<(?:td|th)\b/g)||[]).length,thCount,`${type} body`);
 assert.equal((q('#creditFunnelRows').innerHTML.match(/<tr\b/g)||[]).length,18); // 13 indicadores + 1 sección + 4 tasas
 assert(q('#creditCompareCurrent').textContent.includes('A ·'));
 assert(q('#creditComparePrevious').textContent.includes('B ·'));
 assert(q('#creditReportStatus').textContent.includes('expedientes en base analizados'));
}
console.log('OK V23.9 frontend: alineación exacta de cabecera, filas y totales en días, meses y años; cinco KPI y dos rangos.');
