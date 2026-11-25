import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const skill = process.env.AIRBOAT_ANATOMY || join(homedir(), '.codex', 'skills', 'anatomy');
const load = name => import(pathToFileURL(join(skill, 'kit', name + '.mjs')));
const [k, g, a] = await Promise.all([load('iso-kit'), load('lathe'), load('audit')]);
const plan = (x, y, w, d, r = 0) => ({ x, y, w, d, r });
const deck = plan(0, 0, 226, 142, 5);
const width = 700, height = 410;
const P = k.fitProjection(k.boxCorners(deck, -10, 22), width, height, { pad: 16, azimuth: 42, elevation: 36 });
const R = a.recorder(P, { ground: s => s.name.startsWith('bench.foot') });
const at = point => k.iso(point, P);
const trace = [];

function solid(name, group, point, shape, svg, tone) {
  R.put({ name, at: point, shapes: [R.solid(shape)], markup:
    k.groupSvg(k.solidSvg(svg, { tone, lit: tone === 'lit' }), { 'data-group': group }) });
}
function box(name, group, x, y, w, d, z, h, r = 0, tone = 'mid') {
  const p = plan(x, y, w, d, r);
  solid(name, group, [x+w/2,y+d/2,z+h/2], a.extruded(k.ringOf(p, 6), z, h, { name }),
    k.slabOf(p,z,h,P,6), tone);
}
function disk(name, group, x, y, z, radius, h, tone = 'mid') {
  const f = g.frameAlong([x,y,z], [0,0,1]);
  solid(name,group,[x,y,z+h/2],a.solid(f,[[0,radius],[h,radius]],{name}),
    k.cylinder(x,y,radius,z,h,P,24),tone);
}
function stripe(name, group, x, y, w, d, z) {
  box(name, group, x, y, w, d, z, .45, .4, 'hi');
}
function label(text, x, y, z, size = 5) {
  const markup = k.faceTextSvg(k.topMatrix([x,y],z,P),text,{ size,tone:'hi' });
  trace.push(markup);
}
function signal(name, group, points) {
  const stops = points.map(at);
  const line = k.wireSvg(stops[0],stops.at(-1),{via:stops.slice(1,-1),tone:'hi',size:2});
  trace.push(k.groupSvg(line,{'data-group':group,class:'rig-signal','data-wire':name}));
}

for (const [index,[x,y]] of k.corners(deck,13).entries()) {
  disk('bench.foot.'+index,'bench',x,y,-9,6,5,'lo');
}
box('bench.deck','bench',0,0,226,142,-4,4,5,'lo');
box('bench.rib-front','bench',15,3,196,4,-6,2,1,'lo');
box('bench.rib-back','bench',15,135,196,4,-6,2,1,'lo');
for (const [index,[x,y]] of k.corners(deck,9).entries()) {
  disk('bench.screw.'+index,'bench',x,y,0,2.1,.8,'hi');
}

const head = 'face voice camera sense tilt motor';
box('head.support','tilt',59,45,67,47,0,4,3);
box('head.shell',head,60,46,65,45,4,13,5);
box('head.bezel','face voice sense',63,49,59,39,17,2.6,4,'hi');
box('head.amoled','face voice',67,52,51,31,19.6,.9,3,'lit');
for (const [index,x] of [82,103].entries()) {
  box('face.eye.'+index,'face',x-6,61,12,13,20.5,.4,5,'hi');
  disk('face.pupil.'+index,'face',x+2,65,20.9,2.4,.35,'lo');
}
box('head.h1','motor drive m1 m2 m3 tilt altitude',125,54,8,24,4,6,1,'hi');
box('head.h2','camera',50,56,10,19,4,6,1,'hi');
for (let i=0;i<5;i++) stripe('head.speaker.'+i,'voice',65+i*4,85,2.7,1.3,17);
disk('head.mic','voice',118,86,17,1.3,.4,'hi');
box('head.usb','voice',82,91,13,6,4,4,1,'hi');

box('camera.mount','camera',23,49,25,28,0,4,2);
box('camera.pcb','camera',24,50,24,27,4,1.4,2,'hi');
box('camera.shell','camera',29,54,14,14,5.4,3,2);
disk('camera.barrel','camera',36,61,8.4,6.4,5,'hi');
disk('camera.lens','camera',36,61,13.4,4.8,.7,'lit');
stripe('camera.connector','camera',43,65,5,8,5.4);
signal('camera ribbon','camera',[[48,67,10],[50,67,10]]);

for (const [index,y] of [57,84].entries()) {
  const name = 'driver.'+index;
  const group = index === 0 ? 'motor m1 m2' : 'motor m3';
  box(name+'.pcb',group,149,y,27,17,0,2,1,'hi');
  box(name+'.ic',group,157,y+4,10,8,2,2,1);
  for (let i=0;i<4;i++) {
    stripe(name+'.left-pin.'+i,group,151+i*5,y+1,3,1.4,2);
    stripe(name+'.right-pin.'+i,group,151+i*5,y+14,3,1.4,2);
  }
}
signal('H1 PWM to D1','motor m1 m2',[[133,60,10],[141,60,10],[149,61,2]]);
signal('H1 PWM to D2','motor m3',[[133,73,10],[140,77,10],[149,85,2]]);

for (const [index,y] of [25,65,104].entries()) {
  const name = 'motor.'+(index+1), x = 198;
  const group = `motor m${index+1}`;
  box(name+'.clamp',group,x-11,y-8,22,16,0,4,2);
  disk(name+'.can',group,x,y,4,7,11,'hi');
  disk(name+'.bearing',group,x,y,15,3.7,2);
  disk(name+'.hub',group,x,y,17,2,.8,'hi');
  for (const [side,offset] of [-8,8].entries()) {
    disk(name+'.screw.'+side,group,x+offset,y+4.5,4,1.2,.6,'hi');
  }
  for (let blade=0;blade<3;blade++) {
    const angle = blade * Math.PI * 2 / 3;
    const rim = [[2,-1.4],[13,-4],[15,-1.8],[12,2.2],[2,1.7]].map(([u,v]) =>
      [x+u*Math.cos(angle)-v*Math.sin(angle),y+u*Math.sin(angle)+v*Math.cos(angle)]);
    const bladeName = name+'.blade.'+blade;
    solid(bladeName,group,[x+Math.cos(angle)*7,y+Math.sin(angle)*7,17.4],
      a.extruded(rim,17,.8,{name:bladeName}), k.extrude(rim,17,.8,P,{convex:true}),'hi');
  }
  disk(name+'.pin',group,x,y,17.8,1.25,1.6,'hi');
  label('M'+(index+1),185,y+19,.2,5);
}
signal('D1 AO1/AO2 to M1','motor m1',[[176,60,2],[183,56,2],[186,32,2],[187,25,4]]);
signal('D1 BO1/BO2 to M2','motor m2',[[176,66,2],[184,66,2],[187,65,4]]);
signal('D2 AO1/AO2 to M3','motor m3',[[176,92,2],[182,94,2],[187,104,4]]);

const power = 'motor drive m1 m2 m3';
box('battery.cage',power,145,13,35,27,0,2,3);
box('battery.1s',power,147,15,31,23,2,6,3,'hi');
box('battery.plug',power,157,43,10,6,0,5,1,'hi');
stripe('battery.strap.1',power,151,15,3,23,8);
stripe('battery.strap.2',power,172,15,3,23,8);
signal('battery lead',power,[[162,43,5],[162,47,5],[162,50,4]]);
signal('1S to D1','motor m1 m2',[[162,50,4],[155,53,3],[149,57,2]]);
signal('1S to D2','motor m3',[[162,50,4],[145,53,3],[145,80,2],[149,84,2]]);

box('pca.board','tilt',66,110,36,17,0,2,1,'hi');
box('pca.ic','tilt',80,115,11,7,2,2,1);
for (let i=0;i<6;i++) stripe('pca.output.'+i,'tilt',69+i*5,123,2.6,2.3,2);
box('pca.power','tilt',68,111,8,5,2,3,1,'hi');
box('sg90.mount','tilt',32,104,24,24,0,2,2);
box('sg90.case','tilt',35,106,17,20,2,13,2);
disk('sg90.gear','tilt',43,112,15,4,2,'hi');
box('sg90.horn','tilt',33,110,21,4,17,1,1,'hi');
disk('sg90.screw','tilt',43,112,18,1.5,.6);
box('bmp.board','altitude',118,108,19,15,0,2,1,'hi');
box('bmp.can','altitude',124,112,7,6,2,1.6,1,'hi');
disk('bmp.vent','altitude',127,115,3.6,.8,.2);
for (let i=0;i<4;i++) stripe('bmp.pin.'+i,'altitude',119+i*4,120,1.8,1.5,2);
signal('I²C to distribution','tilt altitude',[[133,76,6],[140,79,6],[140,103,2],[126,108,2]]);
signal('I²C to PCA9685','tilt',[[140,103,2],[108,103,2],[100,110,2]]);
signal('SG90 PWM','tilt',[[66,121,2],[61,119,2],[52,117,2]]);

a.settle(R,P);
a.auditOrExit(R,P);
if (process.exitCode) process.exit(process.exitCode);

const light = process.argv.includes('--light');
const objects = R.items.sort((left,right) => left.key-right.key).map(item => item.markup);
const materials = `<style>
  .iso{--anatomy-paper:#31394a;--anatomy-top:#596781;--anatomy-face:#9bcd59;
    --anatomy-shade-0:#272f43;--anatomy-shade-1:#35405a;--anatomy-shade-2:#3c4864;--anatomy-shade-3:#485772;
    --anatomy-hi:#bec9e1;--anatomy-mid:#91a2bf;--anatomy-lo:#7488a7;--anatomy-faint:#627390;--anatomy-lit:#ddfa9d;
    --anatomy-lit-top:#adf259;--anatomy-lit-shade:#335228}
  [data-group=face] .iso-solid:not([data-lit])>.iso-top{fill:#f2f6ee}
  [data-group=face]:has(.iso-solid[data-lit])>.iso-solid>.iso-top{fill:#b2f558}
  [data-group=face] .iso-solid:has([data-tone=lo])>.iso-top{fill:#293249}
  .rig-signal .iso-line{stroke-width:2;stroke:#dbb795}
  .rig-signal .iso-wire-end{fill:#e5c7aa}
  ${light ? '.iso[data-theme=light]{--anatomy-lit-top:#b4ea7c;--anatomy-hi:#2b3851;--anatomy-lo:#72819b;--anatomy-mid:#4f607b}' : ''}
</style>`;
const svg = k.figureSvg({
  width,height,label:'Mosaico 中央托架、H2 相机、两块驱动板与三台推进电机，右侧为俯仰和气压扩展。',
  standalone:light?'light':'dark',body:materials+objects.join('')+trace.join(''),
});
const target = new URL('../assets/hardware/',import.meta.url);
mkdirSync(target,{recursive:true});
if (!light) writeFileSync(new URL('airboat-rig.svg',target),svg);
if (process.argv.includes('--plates')) {
  const plate = k.plateHtml({ fig:'FIG. 01',title:'Mosaico 托架与外设',hint:'硬件功能示意',body:svg });
  writeFileSync(new URL(light?'rig-light.html':'rig-dark.html',target),k.pageHtml({
    title:'Mosaico 托架与外设',theme:light?'light':'dark',body:plate,width:760,
  }));
}
console.log(`Mosaico rig · ${R.items.length} parts · ${R.solids.length} recorded solids`);
