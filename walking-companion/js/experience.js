import {developerMode} from './developer.js';
import {mountP1} from './p1.js?v=p1-video';
import {manager, stopSceneVideo} from './main.js?v=p1-video';
const $=s=>document.querySelector(s),drawer=$('#moments'),hero=$('.hero');
window.companionDeveloper=developerMode;
const open=document.createElement('button');open.id='experience-open';open.className='experience-open';open.innerHTML='立即体验 <span>↗</span><small>MEET YOUR LITTLE COMPANION</small>';open.setAttribute('aria-controls','moments');open.setAttribute('aria-expanded','false');hero.append(open);
const close=document.createElement('button');close.id='experience-close';close.type='button';close.textContent='← 返回首页';$('.site-header nav').replaceChildren();
const panel=document.createElement('div');panel.className='expression-layer';panel.hidden=true;
hero.append(panel);
const graph=document.createElement('section');
graph.className='p1-graph';
graph.innerHTML='<h2>表情链路</h2><div class="p1-graph-stage"><div class="workbench-loading" role="status">正在载入表情链路…</div><iframe id="expression-workbench" title="实时表情节点画布，可拖动和缩放" data-src="workbench/expression-workbench.html?view=p1-graph&v=2"></iframe></div>';
const frame=graph.querySelector('iframe');
function notify(type,extra={}){frame.contentWindow?.postMessage({unionWorkbench:true,type,...extra},location.origin);}
frame.addEventListener('load',()=>{graph.classList.add('workbench-loaded');notify('visibility',{visible:document.body.classList.contains('experience')});});
addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.origin===location.origin&&e.data?.unionWorkbench&&e.data.type==='close')setOpen(false);if(e.source===frame.contentWindow&&e.origin===location.origin&&e.data?.unionWorkbench&&e.data.type==='ready')notify('visibility',{visible:document.body.classList.contains('experience')});});
const showcase=document.createElement('div');showcase.className='p1-showcase';
const telemetry=document.createElement('div');telemetry.className='p1-telemetry';
const tabs=$('.scene-tabs');
tabs.before(showcase);
const media=document.createElement('div');media.className='p1-media';
media.append($('.scene-stage'),$('#media-message'));
showcase.append(tabs,media);
drawer.append(telemetry);
drawer.inert=true;
function setOpen(value){
  document.body.classList.toggle('experience',value);
  drawer.inert=!value;
  panel.hidden=!value;
  open.setAttribute('aria-expanded',String(value));
  if(value){
    close.focus();
    if(!frame.hasAttribute('src'))frame.src=frame.dataset.src;
  }else{
    stopSceneVideo();
    open.focus();
  }
  notify('visibility',{visible:value});
  p1.visible();
}
open.addEventListener('click',()=>setOpen(true));close.addEventListener('click',()=>setOpen(false));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('experience')&&!document.querySelector('dialog[open]'))setOpen(false);});
$('.hero .text-link').addEventListener('click',e=>{e.preventDefault();setOpen(true);});$('.scroll-cue').hidden=true;
const developerEntry=$('#scene-device-link');
developerEntry.innerHTML='开发者模式 <span>↗</span>';
developerEntry.setAttribute('href','#developer-mode');
$('.site-header nav').append(developerEntry);
const developerButton=document.createElement('button');
developerButton.type='button';developerButton.textContent='开发者模式 ↗';developerButton.id='p1-developer';
$('#motion-toggle').hidden=true;
$('#motion-toggle').style.display='none';
$('.site-header .wordmark').addEventListener('click',e=>{e.preventDefault();setOpen(false);});
const developerStatus=document.createElement('p');developerStatus.className='developer-status';developerStatus.setAttribute('role','status');$('.site-header').append(developerStatus);
async function openDeveloper(e){
 e.preventDefault();
 const status=document.body.classList.contains('experience')?panel.querySelector('.developer-status'):developerStatus;
 const context={scene:window.companionApp?.manager.current.id||'walking',workbench:frame.contentWindow};
 try{const handled=await developerMode.open(context);status.textContent=handled?'':'开发者模式暂未接入';}
 catch{status.textContent='开发者模式暂时无法打开';}
}
developerEntry.addEventListener('click',openDeveloper);
developerButton.addEventListener('click',openDeveloper);
$('#motion-toggle').addEventListener('click',()=>setTimeout(()=>notify('visibility',{visible:document.body.classList.contains('experience')&&$('#motion-toggle').getAttribute('aria-pressed')!=='true'}),0));
const p1=mountP1({showcase,telemetry,panel,graph,frame,notify,developerMode,manager});
const actions=document.createElement('div');actions.className='p1-actions';
const actionStatus=document.createElement('p');actionStatus.className='developer-status';actionStatus.setAttribute('role','status');
actions.append(close,developerButton,actionStatus);
panel.append(actions);
