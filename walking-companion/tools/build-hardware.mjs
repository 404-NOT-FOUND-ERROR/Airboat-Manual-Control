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
const P = k.fitProjection(k.boxCorners(deck, -10, 22), width, height, { pad: 16, azimuth: 65, elevation: 36 });
const R = a.recorder(P, { ground: s => s.name.startsWith('bench.foot') });
const at = point => k.iso(point, P);
const trace = [];
const engraving = [];
const anchors = [];

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
function mark(text, x, y, size = 6) {
  const transform = k.topMatrix([x,y],.06,P);
  engraving.push(k.groupSvg([
    k.faceTextSvg(`${transform} translate(0 .48)`,text,{ size,tone:'hi' }),
    k.faceTextSvg(transform,text,{ size,tone:'hi' }),
  ], { class:'rig-engraving', 'data-engraving':text }));
}
function anchor(name, point) {
  const [x,y] = at(point);
  anchors.push(`<circle data-anchor="${name}" cx="${x}" cy="${y}" r="0"/>`);
}
function roundedRoute(points) {
  const project = point => at(point).map(value => value.toFixed(2)).join(' ');
  const toward = (from, to, radius, length) => from.map((value, axis) => value + (to[axis] - value) * radius / length);
  let path = `M${project(points[0])}`;
  for (let index = 1; index < points.length - 1; index++) {
    const [before, corner, after] = points.slice(index - 1, index + 2);
    const incoming = Math.hypot(...corner.map((value, axis) => value - before[axis]));
    const outgoing = Math.hypot(...corner.map((value, axis) => value - after[axis]));
    const radius = Math.min(3.8, incoming * .44, outgoing * .44);
    path += `L${project(toward(corner, before, radius, incoming))}`;
    path += `Q${project(corner)} ${project(toward(corner, after, radius, outgoing))}`;
  }
  return `${path}L${project(points.at(-1))}`;
}
function signal(name, group, points, kind = 'signal') {
  for (let index = 1; index < points.length; index++) {
    if (points[index].filter((value, axis) => value !== points[index - 1][axis]).length !== 1) {
      throw new Error(`${name}: every straight leg must follow exactly one world axis`);
    }
  }
  const path = roundedRoute(points);
  const terminals = [points[0], points.at(-1)].map(point => {
    const [x,y] = at(point);
    return `<circle class="iso-wire-end" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.85"/>`;
  });
  const wire = kind === 'logical' ? '' : k.groupSvg([k.lineSvg(path,{tone:'hi'}), ...terminals], { class:'iso-wire' });
  const ink = `<path class="rig-flow-track" d="${path}"/><path class="rig-flow-dash" d="${path}"/>`;
  trace.push(k.groupSvg(wire+ink,{'data-group':group,class:'rig-signal','data-wire':name,'data-kind':kind}));
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
mark('MOSAICO',23,25,9.5);
mark('AMOLED',63,101,6.2);
mark('BMI270',99,101,6.1);
mark('MIC',103,108,6.8);
mark('SPK',63,109,6.8);
mark('H1',132,52);
mark('H2',50,52);
anchor('mosaico',[94,50,18]);
anchor('amoled',[91,69,21]);
anchor('mic',[118,86,17]);
anchor('speaker',[76,85,17]);
anchor('imu',[103,88,16]);
anchor('h1',[130,62,10]);
anchor('h2',[55,65,10]);

box('camera.mount','camera',23,49,25,28,0,4,2);
box('camera.pcb','camera',24,50,24,27,4,1.4,2,'hi');
box('camera.shell','camera',29,54,14,14,5.4,3,2);
disk('camera.barrel','camera',36,61,8.4,6.4,5,'hi');
disk('camera.lens','camera',36,61,13.4,4.8,.7,'lit');
stripe('camera.connector','camera',43,65,5,8,5.4);
signal('camera ribbon','camera',[[48,67,10],[50,67,10]]);
mark('H2 CAM',21,86,7);
anchor('camera',[36,61,14]);

for (const [index,y] of [57,84].entries()) {
  const name = 'driver.'+index;
  const group = index === 0 ? 'motor m1 m2' : 'motor m3';
  box(name+'.pcb',group,149,y,27,17,0,2,1,'hi');
  box(name+'.ic',group,157,y+4,10,8,2,2,1);
  for (let i=0;i<4;i++) {
    stripe(name+'.left-pin.'+i,group,151+i*5,y+1,3,1.4,2);
    stripe(name+'.right-pin.'+i,group,151+i*5,y+14,3,1.4,2);
  }
  mark(index === 0 ? 'D1 / 8833' : 'D2 / 8833',148,y+23,6.1);
  anchor(index === 0 ? 'd1' : 'd2',[162,y+8,4]);
}
signal('H1 PWM to D1','motor m1 m2',[[133,60,10],[143,60,10],[143,60,2],[149,60,2]]);
signal('H1 PWM to D2','motor m3',[[133,73,10],[141,73,10],[141,73,2],[141,85,2],[149,85,2]]);

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
  mark('M'+(index+1),193,y+17,8);
  anchor(`m${index+1}`,[x,y,19.4]);
}
signal('D1 AO1/AO2 to M1','motor m1',[[176,60,2],[183,60,2],[183,25,2],[183,25,4],[187,25,4]]);
signal('D1 BO1/BO2 to M2','motor m2',[[176,65,2],[183,65,2],[183,65,4],[187,65,4]]);
signal('D2 AO1/AO2 to M3','motor m3',[[176,92,2],[182,92,2],[182,104,2],[182,104,4],[187,104,4]]);

const power = 'motor drive m1 m2 m3';
box('battery.cage',power,145,13,35,27,0,2,3);
box('battery.1s',power,147,15,31,23,2,6,3,'hi');
box('battery.plug',power,157,43,10,6,0,5,1,'hi');
stripe('battery.strap.1',power,151,15,3,23,8);
stripe('battery.strap.2',power,172,15,3,23,8);
mark('1S LIPO',146,10,7.4);
anchor('battery',[164,26,8]);
signal('battery lead',power,[[162,43,5],[162,50,5],[162,50,2]],'power');
signal('1S to D1','motor m1 m2',[[162,50,2],[156,50,2],[156,57,2]],'power');
signal('1S to D2','motor m3',[[162,50,2],[146,50,2],[146,84,2],[149,84,2]],'power');

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
signal('I²C from H1','tilt altitude',[[133,76,6],[140,76,6],[140,76,2],[140,103,2]]);
signal('I²C to BMP581','altitude',[[140,103,2],[126,103,2],[126,108,2]]);
signal('I²C to PCA9685','tilt',[[140,103,2],[100,103,2],[100,110,2]]);
signal('SG90 PWM','tilt',[[66,121,2],[59,121,2],[59,117,2],[52,117,2]]);
mark('SG90',34,135,6.2);
mark('PCA9685',67,135,6.3);
mark('BMP581',118,132,6.8);
anchor('servo',[43,112,18]);
anchor('pca',[85,118,4]);
anchor('bmp',[127,115,4]);

// On-board overlays show logical data flow along the board axes.
signal('Mic to host','voice',[[118,86,17],[118,86,22],[118,50,22],[94,50,22],[94,50,18]],'logical');
signal('Host to speaker','voice sense',[[94,50,18],[94,50,22],[75,50,22],[75,85,22],[75,85,18]],'logical');
signal('IMU to host','sense',[[103,88,16],[103,88,22],[103,50,22],[94,50,22],[94,50,18]],'logical');
signal('Host to AMOLED','face sense',[[94,50,18],[94,50,22],[94,69,22],[91,69,22],[91,69,21]],'logical');
signal('Lens to H2 ribbon','camera',[[36,61,14],[42,61,14],[42,67,14],[42,67,10],[48,67,10]],'logical');
signal('H2 to host','camera',[[50,67,10],[55,67,10],[55,67,22],[55,50,22],[94,50,22],[94,50,18]],'logical');

a.settle(R,P);
a.auditOrExit(R,P);
if (process.exitCode) process.exit(process.exitCode);

const light = process.argv.includes('--light');
R.items.sort((left,right) => left.key-right.key);
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
  .rig-flow-track,.rig-flow-dash{display:none}
  .rig-engraving .iso-face-text{font-weight:750;letter-spacing:0}
  .rig-engraving text:first-child{fill:#152534;stroke:#152534;stroke-width:.48;paint-order:stroke}
  .rig-engraving text:last-child{fill:#e7f1f4}
  ${light ? `.iso[data-theme=light]{--anatomy-lit-top:#b4ea7c;--anatomy-hi:#2b3851;--anatomy-lo:#72819b;--anatomy-mid:#4f607b}
    .rig-engraving text:first-child{fill:#d8e5eb;stroke:#d8e5eb}
    .rig-engraving text:last-child{fill:#243649}` : ''}
</style>`;
const model = R.items.map(item => item.name === 'bench.deck' ? item.markup + engraving.join('') : item.markup).join('');
const svg = k.figureSvg({
  width,height,label:'Mosaico 中央托架、H2 相机、两块驱动板与三台推进电机，右侧为俯仰和气压扩展。',
  standalone:light?'light':'dark',body:materials+k.groupSvg(model+trace.join('')+anchors.join(''),{ class:'rig-world' }),
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
