import {ImageSlices,CompanionMotion} from './effects.js';
import {scenes,SceneManager} from './scenes.js?v=p1-video';
import {DeviceService} from './device.js';
const $=s=>document.querySelector(s);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let globalPaused=reduced.matches,videoActive=false,selection=0;
const heroFX=new ImageSlices($('#hero-canvas'),{strength:.8});
const sceneFX=new ImageSlices($('#scene-canvas'),{strength:.9});
sceneFX.photographic=document.body.classList.contains('metal-theme');
const motion=new CompanionMotion([...document.querySelectorAll('.pet-body')]);
export const manager=new SceneManager();
const device=new DeviceService(),video=$('#scene-video');
const report=message=>{$('#device-feedback').textContent=message;};
function applyMotion(){heroFX.setPaused(globalPaused);sceneFX.setPaused(globalPaused);motion.setPaused(globalPaused);$('#motion-toggle').setAttribute('aria-pressed',String(globalPaused));$('#motion-toggle').textContent=globalPaused?'▷':'Ⅱ';$('#motion-toggle').setAttribute('aria-label',globalPaused?'恢复页面动效':'暂停页面动效');}
$('#motion-toggle').addEventListener('click',()=>{globalPaused=!globalPaused;applyMotion();});
reduced.addEventListener('change',e=>{globalPaused=e.matches;applyMotion();});
heroFX.setSource('assets/images/walking.png').catch(()=>heroFX.setSource('assets/images/visual-reference.png'));
const tabs=$('.scene-tabs');
scenes.forEach((scene,i)=>{const button=document.createElement('button');button.type='button';button.id=`tab-${scene.id}`;button.role='tab';button.setAttribute('aria-controls','scene-panel');button.textContent=scene.label;button.addEventListener('click',()=>manager.select(scene.id));button.addEventListener('keydown',e=>{let n=i;if(e.key==='ArrowRight')n=(i+1)%scenes.length;else if(e.key==='ArrowLeft')n=(i+scenes.length-1)%scenes.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=scenes.length-1;else return;e.preventDefault();manager.select(scenes[n].id);tabs.children[n].focus();});tabs.append(button);});
const sceneStage=$('.scene-stage');
const mediaMessage=$('#media-message');
const videoToggle=$('#video-toggle');
const playbackToggle=$('#play-toggle');
function syncPlayback(){
 playbackToggle.textContent=video.paused?'▶ 播放':'Ⅱ 暂停';
 playbackToggle.setAttribute('aria-label',video.paused?'播放场景视频':'暂停场景视频');
}
video.addEventListener('play',syncPlayback);
video.addEventListener('pause',syncPlayback);
export function stopSceneVideo(){
 if(sceneStage.classList.contains('has-video'))sceneStage.dispatchEvent(new CustomEvent('scene-video',{detail:false}));
 videoActive=false;
 video.pause();
 video.hidden=true;
 if(video.hasAttribute('src')){video.removeAttribute('src');video.load();}
 sceneStage.classList.remove('has-video');
 $('#scene-canvas').hidden=false;
 $('#scene-pet').hidden=false;
 $('#media-label').textContent='场景预览';
 videoToggle.textContent='▶ 播放演示';
 mediaMessage.textContent='';
}
function mediaError(){if(!videoActive)return;stopSceneVideo();videoToggle.textContent='重试视频 ↗';mediaMessage.textContent='视频暂时无法播放。';}
video.addEventListener('error',mediaError);
video.addEventListener('waiting',()=>{if(videoActive)$('#media-message').textContent='视频加载中…';});
video.addEventListener('playing',()=>{
 if(!videoActive)return;
 const opening=!sceneStage.classList.contains('has-video');
 sceneStage.classList.add('has-video');video.hidden=false;$('#scene-canvas').hidden=true;$('#scene-pet').hidden=true;
 $('#media-label').textContent='概念演示';mediaMessage.textContent='';videoToggle.textContent='退出演示';
 if(opening)sceneStage.dispatchEvent(new CustomEvent('scene-video',{detail:true}));
});
async function updateScene(scene){const token=++selection;stopSceneVideo();motion.scene=scene.id;motion.react('float');
 const index=scenes.indexOf(scene);[...tabs.children].forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});
 $('#scene-panel').setAttribute('aria-labelledby',`tab-${scene.id}`);$('#scene-number').textContent=scene.label;$('#scene-kicker').textContent=scene.kicker;$('#scene-title').innerHTML=scene.title;$('#scene-description').textContent=scene.description;$('#device-scene').textContent=scene.name[0]+scene.name.slice(1).toLowerCase();
 const stage=$('.scene-stage');stage.classList.remove('is-transitioning');void stage.offsetWidth;stage.classList.add('is-transitioning');
 try{await sceneFX.setSource(scene.poster);if(token!==selection)return;}catch{if(token!==selection)return;$('#media-message').textContent='场景照片暂时无法加载，请检查本地图片资源。';}
 applyMotion();try{await device.setScene(scene);}catch(error){report(error.message);}
}
manager.addEventListener('change',e=>updateScene(e.detail));
playbackToggle.addEventListener('click',()=>{if(!videoActive)return;if(video.paused)video.play().catch(error=>{if(error.name!=='AbortError')mediaError();});else video.pause();});
$('#mute-toggle').addEventListener('click',()=>{video.muted=!video.muted;$('#mute-toggle').setAttribute('aria-pressed',String(video.muted));$('#mute-toggle').textContent=`声音：${video.muted?'关':'开'}`;});
videoToggle.addEventListener('click',async()=>{if(videoActive){stopSceneVideo();return;}
 const token=selection;
 videoActive=true;video.src=manager.current.video;video.poster=manager.current.poster;videoToggle.textContent='取消加载';mediaMessage.textContent='正在加载场景视频…';
 try{await video.play();}catch(error){if(token===selection&&error.name!=='AbortError')mediaError();}
});
const connect=$('#connect-button');
device.addEventListener('status',e=>{const s=e.detail;$('.device-console').classList.toggle('connected',s.connected);$('#connection-label').textContent=s.connected?'伙伴已连接':'尚未连接';$('#device-name').textContent=s.connected?s.name:'—';$('#device-id').textContent=s.connected?s.id:'—';$('#device-state').textContent=s.connected?s.behavior:'等待相遇';connect.textContent=s.connected?'断开连接 ↗':'连接伙伴 ↗';document.querySelectorAll('[data-action]').forEach(b=>b.disabled=!s.connected);});
connect.addEventListener('click',async()=>{connect.disabled=true;const wasConnected=device.connected;$('#connection-label').textContent=wasConnected?'正在断开…':'正在寻找伙伴…';
 try{if(wasConnected){await device.disconnect();report('伙伴已断开，可以随时再打个招呼。');}else{await device.connect();report(`你好！伙伴已经进入 ${manager.current.name} 场景。`);motion.react('greet');}}
 catch(error){report(error.message);$('#connection-label').textContent=device.connected?'伙伴已连接':'连接失败，请重试';}finally{connect.disabled=false;}
});
document.querySelectorAll('[data-action]').forEach(button=>{button.disabled=true;button.addEventListener('click',async()=>{const action=button.dataset.action;button.disabled=true;try{await device.behavior(action);motion.react(action);report({come:'它正在慢慢靠近你。',float:'给它一点空间，它会自在地漂浮。',greet:'收到！它摇了摇身体，向你打招呼。'}[action]);}catch(error){report(error.message);}finally{button.disabled=!device.connected;}});});
updateScene(scenes[0]);applyMotion();
// A small stable integration surface for future hardware and video integration.
window.companionApp={scenes,manager,device,heroFX,sceneFX,motion};
