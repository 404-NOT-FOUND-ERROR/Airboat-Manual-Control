import { AirBoatLink } from './p1-link.js';
import { experiences, liveLane } from './p1-scenes.js';

const catalog = '1b835f35bd1cb71d08590f3027fba25d2892a8ec5bb7f56a5145e3be16ea359b';
const hardware = {
  face: ['表情', '回应编排 → Square Pop → Mosaico AMOLED', '主机显示人物当前的眼神，浏览器按相同素材的帧号同步。'],
  voice: ['对话', '板载麦克风 → 小智 → 板载扬声器', '唤醒和采音在主机完成，语音问答走 Wi-Fi。计时保存在主机。'],
  camera: ['相机', 'H2 相机 → Mosaico JPEG → 手机', '相机直插左侧 H2。主机抓拍后，手机通过局域网领取 JPEG。'],
  sense: ['姿态', '板载 BMI270 → 晃动与放稳 → 安抚', '加速度和角速度用于判定晃动与放稳。'],
  motor: ['动力', 'H1 六路 PWM → 两块 DRV8833 → 三台电机', 'M1 转向、M2 升降、M3 前后。推进使用独立 1S 电源。'],
  tilt: ['俯仰', 'H1 I²C → PCA9685 → SG90', 'PCA9685 提供舵机信号。活动头部与飞控联动待验。'],
  altitude: ['气压', 'H1 I²C → BMP581 → 相对高度', '气压模块已通过读取检查。定高控制待验。'],
};

export function mountP1({ drawer, panel, frame, notify, developerMode, manager }) {
  const link = new AirBoatLink();
  let selected, running, online = false, lastFace, photoURL;
  let pendingStart;
  let bridge;
  let workbenchReady = false;
  const scene = document.createElement('section');
  scene.className = 'p1-scene';
  scene.innerHTML = `
    <div class="p1-scenes" aria-label="场景功能"></div>
    <div class="p1-detail">
      <div><h2></h2><p class="p1-description"></p></div>
      <button type="button" class="p1-start">体验 <span aria-hidden="true">↗</span></button>
    </div>
    <p class="p1-feedback" role="status"></p>
    <div class="p1-photo" hidden><button type="button">领取照片</button><a hidden download>保存照片 ↓</a></div>`;
  drawer.querySelector('.scene-tabs').after(scene);
  const choose = scene.querySelector('.p1-scenes');
  const play = scene.querySelector('.p1-start');
  const feedback = scene.querySelector('.p1-feedback');
  const photo = scene.querySelector('.p1-photo');
  const toolbar = document.createElement('div');
  toolbar.className = 'p1-toolbar';
  toolbar.innerHTML = `
    <span class="p1-source"><i></i><span>场景预览</span></span>
    <div><button type="button" class="p1-connect">连接主机</button>
    <button type="button" class="p1-hardware">硬件链路 ↗</button></div>`;
  panel.prepend(toolbar);
  const status = toolbar.querySelector('.p1-source span');
  const connect = toolbar.querySelector('.p1-connect');
  const pairing = makeDialog('连接 Mosaico', `
    <p class="p1-pair-help"></p>
    <form class="p1-pair"><label for="p1-code">配对码</label>
      <input id="p1-code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required>
      <button type="submit">配对</button>
    </form>
    <p class="p1-pair-result" role="status"></p>`);
  const developer = makeDialog('开发者模式', `
    <div class="p1-dev-options">
      <a class="p1-console" hidden href="/device-console/">手动控制、急停和设备工具 ↗</a>
      <a href="workbench/expression-workbench.html" target="_blank" rel="noopener">完整表情工作台 ↗</a>
      <button type="button" class="p1-dev-connect">连接 Mosaico</button>
    </div>
    <p class="p1-dev-info" role="status"></p>`);
  const anatomy = makeDialog('硬件链路', `
    <figure class="p1-anatomy">
      <figcaption><span>FIG. 01</span><span>Mosaico 托架与外设</span></figcaption>
      <div class="p1-assembly" aria-label="Mosaico 外设装配示意"></div>
      <div class="p1-parts" aria-label="硬件支路"></div>
      <div class="p1-part-detail"><strong></strong><p></p></div>
    </figure>`);
  const parts = anatomy.querySelector('.p1-parts');
  let hardwareKey = 'voice';
  let diagram;
  for (const [key, [label]] of Object.entries(hardware)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.part = key;
    button.textContent = label;
    button.addEventListener('click', () => showHardware(key));
    parts.append(button);
  }
  function showHardware(key) {
    hardwareKey = key;
    for (const button of parts.children) button.setAttribute('aria-pressed', String(button.dataset.part === key));
    const [, chain, detail] = hardware[key];
    anatomy.querySelector('.p1-part-detail strong').textContent = chain;
    anatomy.querySelector('.p1-part-detail p').textContent = detail;
    if (diagram) diagram.dataset.part = key;
  }

  toolbar.querySelector('.p1-hardware').addEventListener('click', async () => {
    anatomy.showModal();
    showHardware(selected.hardware);
    if (diagram) return;
    const stage = anatomy.querySelector('.p1-assembly');
    try {
      const response = await fetch('assets/hardware/airboat-rig.svg');
      if (!response.ok) throw new Error();
      const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
      if (svg.localName !== 'svg') throw new Error();
      diagram = document.importNode(svg, true);
      stage.replaceChildren(diagram);
      showHardware(hardwareKey);
    } catch {
      stage.textContent = '装配图暂时无法加载。';
    }
  });

  async function integration() {
    if (!bridge) bridge = fetch('/device-config', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : {})
      .catch(() => ({}));
    return bridge;
  }
  async function askPair() {
    const config = await integration();
    if (pairing.open) return;
    pairing.querySelector('.p1-pair').hidden = !config.enabled;
    pairing.querySelector('.p1-pair-help').textContent = config.enabled
      ? '在主机打开「控制 → 手机 → 开启遥控」，输入屏幕上的六位码，再回到双眼首页。'
      : '当前打开的是场景预览。连接实机请打开项目的局域网预览地址。';
    pairing.querySelector('.p1-pair-result').textContent = '';
    pairing.showModal();
  }
  connect.addEventListener('click', askPair);
  developer.querySelector('.p1-dev-connect').addEventListener('click', () => {
    developer.close();
    void askPair();
  });
  developerMode.register(async () => {
    developer.showModal();
    const config = await integration();
    developer.querySelector('.p1-console').hidden = !config.enabled;
    developer.querySelector('.p1-dev-info').textContent = config.enabled
      ? '实机工具沿用 Mosaico 当前固件的控制与急停。'
      : '连接局域网实机后可打开手动控制。';
  });
  pairing.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await link.pair(form.querySelector('input').value);
      form.reset();
      pairing.close();
      link.watch(isVisible());
    } catch (error) {
      pairing.querySelector('.p1-pair-result').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  function isVisible() {
    return document.body.classList.contains('experience') && !document.hidden;
  }
  function preview(focus = true) {
    if (workbenchReady && !lastFace) notify('preview', { semantic: selected.face, lane: selected.lane, focus });
  }
  function refresh() {
    scene.querySelector('h2').textContent = selected.title;
    scene.querySelector('.p1-description').textContent = selected.description;
    play.firstChild.textContent = running === selected && selected.cancel ? '结束 ' : '体验 ';
    for (const button of choose.children) button.setAttribute('aria-pressed', String(button.textContent === selected.title));
    photo.hidden = !selected.photo || !link.snapshot?.photo?.id || !online;
  }
  function select(experience) {
    selected = experience;
    if (pendingStart) pendingStart = experience;
    feedback.textContent = running === experience ? experience.instruction : '';
    refresh();
    if (lastFace) notify('focus', { lane: liveLane(lastFace.semantic) || experience.lane, semantic: lastFace.semantic });
    else preview();
    if (anatomy.open) showHardware(experience.hardware);
  }
  function pickScene(current) {
    const options = experiences[current.id];
    choose.replaceChildren(...options.map(experience => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = experience.title;
      button.addEventListener('click', () => select(experience));
      return button;
    }));
    choose.hidden = options.length < 2;
    select(options[0]);
  }
  function connectionLabel(text, live = false) {
    toolbar.classList.toggle('p1-is-live', live);
    status.textContent = text;
    connect.textContent = online ? '已连接' : '连接主机';
    connect.hidden = online;
  }
  async function startExperience(experience) {
    play.disabled = true;
    try {
      if (running === experience && experience.cancel) {
        await link.command(experience.cancel);
        running = null;
        feedback.textContent = '体验已结束。';
      } else {
        if (running?.cancel) await link.command(running.cancel);
        if (experience.command) await link.command(experience.command);
        running = experience;
        feedback.textContent = experience.instruction;
        if (lastFace) notify('focus', { lane: experience.lane, semantic: lastFace.semantic });
        else preview();
      }
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      play.disabled = false;
      refresh();
    }
  }
  link.addEventListener('status', ({ detail }) => {
    online = true;
    const next = pendingStart;
    pendingStart = null;
    const face = detail.face;
    const valid = face?.catalog === catalog && face.active && typeof face.semantic === 'string';
    if (valid) {
      const focus = !lastFace || face.semantic !== lastFace.semantic || face.generation !== lastFace.generation;
      lastFace = face;
      if (workbenchReady) notify('live', { face, lane: liveLane(face.semantic) || selected.lane, focus });
      connectionLabel('实机同步', true);
    } else {
      if (lastFace) notify('stop-live');
      lastFace = null;
      connectionLabel(face?.active ? '素材版本待匹配' : face ? '主机表情页已离开' : '已连接 · 表情预览');
    }
    if (running?.command?.[0] === 'invite' && [4, 5, 6, 7].includes(detail.experience?.phase)) {
      running = null;
      feedback.textContent = detail.experience.phase === 4 ? '本轮邀请结束。' : '邀请已结束，可以再试一次。';
    }
    refresh();
    if (next && isVisible()) void startExperience(next);
  });
  link.addEventListener('unavailable', ({ detail }) => {
    online = false;
    lastFace = null;
    notify('stop-live');
    connectionLabel('连接中断');
    feedback.textContent = detail;
    refresh();
  });
  play.addEventListener('click', async () => {
    if (!online && !link.session) {
      pendingStart = selected;
      await askPair();
      return;
    }
    if (!online) {
      feedback.textContent = '正在恢复 Mosaico 连接…';
      link.watch(isVisible());
      pendingStart = selected;
      return;
    }
    await startExperience(selected);
  });
  photo.querySelector('button').addEventListener('click', async ({ currentTarget: button }) => {
    const item = link.snapshot.photo;
    button.disabled = true;
    try {
      const blob = await link.readPhoto(item);
      if (photoURL) URL.revokeObjectURL(photoURL);
      photoURL = URL.createObjectURL(blob);
      const download = photo.querySelector('a');
      download.href = photoURL;
      download.download = `union-${item.id}.jpg`;
      download.hidden = false;
      feedback.textContent = '照片已收到，可以保存。';
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  manager.addEventListener('change', event => pickScene(event.detail));
  addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.type !== 'ready') return;
    workbenchReady = true;
    preview();
  });
  const visible = () => link.watch(isVisible());
  document.addEventListener('visibilitychange', visible);
  pickScene(manager.current);
  return { visible };
}

function makeDialog(title, content) {
  const dialog = document.createElement('dialog');
  dialog.className = 'p1-dialog';
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `<header><h2>${title}</h2><button type="button" aria-label="关闭">×</button></header>${content}`;
  dialog.querySelector('header button').addEventListener('click', () => dialog.close());
  document.body.append(dialog);
  return dialog;
}
