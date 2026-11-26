const parts = {
  mic: ['板载麦克风', '采集语音'],
  mosaico: ['Mosaico 主机', '处理输入'],
  speaker: ['板载扬声器', '播放回复'],
  amoled: ['AMOLED 屏', '显示表情帧'],
  imu: ['板载 BMI270', '检测晃动与放稳'],
  camera: ['H2 相机', '拍摄画面'],
  h2: ['H2 接口', '送入图像数据'],
  h1: ['H1 接口', '输出控制信号'],
  pca: ['PCA9685', '生成舵机 PWM'],
  servo: ['SG90 舵机', '调节头部俯仰'],
  d1: ['D1 · DRV8833', '驱动 M1、M2'],
  d2: ['D2 · DRV8833', '驱动 M3'],
  battery: ['1S 锂电池', '为驱动板供电'],
  m1: ['M1 转向桨', '控制左右转向'],
  m2: ['M2 升降桨', '控制上下升降'],
  m3: ['M3 前后桨', '控制前后移动'],
};

const paths = {
  voice: [['mic', 'mosaico', 'speaker'], '板载麦克风 → Mosaico / 小智 → 板载扬声器', '主机采音，小智经 Wi-Fi 返回语音，扬声器播放。'],
  face: [['mosaico', 'amoled'], 'Mosaico → Square Pop → AMOLED', '主机选择并渲染表情帧，屏幕显示当前画面。'],
  camera: [['camera', 'h2', 'mosaico'], 'H2 相机 → Mosaico JPEG → 局域网', '相机取景，主机生成 JPEG，配对后可领取。'],
  sense: [['imu', 'mosaico', 'amoled', 'speaker'], '板载 BMI270 → Mosaico → 屏幕与扬声器', '主机判断晃动和放稳，触发表情与安抚语音。'],
  tilt: [['h1', 'pca', 'servo'], 'H1 I²C → PCA9685 → SG90', 'PCA9685 将 I²C 控制转换为舵机 PWM，带动头部俯仰。'],
};
const motorParts = ['m1', 'm2', 'm3'];
const svgNS = 'http://www.w3.org/2000/svg';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function mountHardware(parent) {
  const figure = document.createElement('figure');
  figure.className = 'p1-anatomy';
  figure.innerHTML = `
    <figcaption><h2>硬件链路</h2><span class="p1-hardware-state"></span></figcaption>
    <div class="p1-assembly"><div class="p1-board"></div>
      <svg class="p1-leaders" aria-hidden="true"></svg><div class="p1-callouts"></div>
    </div>
    <div class="p1-part-detail"><strong></strong><p></p></div>`;
  parent.append(figure);

  const stage = figure.querySelector('.p1-assembly');
  const board = stage.querySelector('.p1-board');
  const leaders = stage.querySelector('.p1-leaders');
  const labels = stage.querySelector('.p1-callouts');
  const badge = figure.querySelector('.p1-hardware-state');
  const chain = figure.querySelector('.p1-part-detail strong');
  const detail = figure.querySelector('.p1-part-detail p');
  let layout = [];
  let marks = [];
  let projected = {};
  let selected = 'voice';
  let demonstrating = false;
  let running = null;
  let snapshot = null;
  let diagram, bounds, loading, camera, motion;
  let width = 0, height = 0;
  let currentRoute;

  function labelWidth() { return width < 340 ? 84 : 101; }

  function update() {
    const motorValues = snapshot?.simulated ? [] : (snapshot?.motors ?? []);
    const motors = motorParts.filter((_, index) => Number.isFinite(motorValues[index]) && motorValues[index] !== 0);
    const dialogue = snapshot?.dialogue?.phase;
    const reported = motors.length ? 'drive' : snapshot?.performance?.head_busy ? 'tilt' :
      ['listening', 'thinking', 'speaking'].includes(dialogue) ? 'voice' : null;
    const liveMotion = reported === 'drive' || reported === 'tilt';
    const showDemo = demonstrating && !liveMotion;
    const focused = liveMotion ? reported : showDemo ? selected : running ?? reported;
    const showingMotors = focused === 'drive';
    const showingLive = !showDemo && ((reported !== null && focused === reported) ||
      (focused === 'face' && snapshot?.face?.active));
    const [names, route, explanation] = showingMotors ? [
      ['h1', 'battery', ...new Set(motors.map(part => part === 'm3' ? 'd2' : 'd1')), ...motors],
      motors.length === 1 ? `H1 PWM → ${motors[0] === 'm3' ? 'D2' : 'D1'} → ${motors[0].toUpperCase()}` :
        `H1 PWM → DRV8833 → ${motors.map(part => part.toUpperCase()).join(' / ')}`,
      'H1 提供控制信号，1S 电池给驱动板供电。百分比为驱动输出。',
    ] : paths[focused || selected];
    const mode = showDemo ? '概念演示' : showingLive ? '设备回报' : focused ? '体验路径' : '场景路径';
    if (badge.textContent !== mode) badge.textContent = mode;
    if (chain.textContent !== route) chain.textContent = route;
    if (detail.textContent !== explanation) detail.textContent = explanation;
    const key = `${focused ?? ''}/${selected}/${mode}/${showingMotors ? motors.join() : ''}`;
    if (currentRoute !== key && diagram) {
      currentRoute = key;
      updatePath(focused ? names : [], focused ?? selected, showingLive ? (showingMotors ? motors : [focused]) : []);
    }
    for (const item of layout) {
      const value = showingMotors ? motorValues[motorParts.indexOf(item.name)] : undefined;
      const text = Number.isFinite(value) ? `驱动输出 ${value / 10}%` : parts[item.name][1];
      if (item.action.textContent !== text) item.action.textContent = text;
    }
  }

  function updatePath(names, path, active) {
    for (const { node, groups } of marks) {
      node.classList.toggle('rig-selected', groups.includes(path));
      node.classList.toggle('rig-live', active.some(name => groups.includes(name)));
    }
    labels.replaceChildren();
    leaders.replaceChildren();
    leaders.classList.toggle('is-live', active.length > 0);
    layout = names.map((name, index) => {
      const label = document.createElement('div');
      label.className = 'p1-callout';
      label.dataset.part = name;
      label.style.setProperty('--arrival', `${index * 65}ms`);
      const title = document.createElement('strong');
      const action = document.createElement('span');
      title.textContent = parts[name][0];
      label.append(title, action);
      labels.append(label);
      const wire = document.createElementNS(svgNS, 'polyline');
      const tip = document.createElementNS(svgNS, 'circle');
      tip.setAttribute('r', '2.5');
      leaders.append(wire, tip);
      return { name, label, action, wire, tip, ...projected[name] };
    });
    moveCamera();
  }

  function moveCamera() {
    if (!bounds || !width || !height) return;
    const base = Math.min((width - 12) / bounds.width, (height - 10) / bounds.height);
    const overview = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, base];
    let target = overview;
    if (layout.length) {
      const xs = layout.map(item => item.x);
      const ys = layout.map(item => item.y);
      const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
      const room = Math.min((width - 2 * (labelWidth() + 11)) / Math.max(right - left, 38),
        (height - 38) / Math.max(bottom - top, 34));
      target = [(left + right) / 2, (top + bottom) / 2, Math.max(base * 1.12, Math.min(base * 2.05, room))];
    }
    const start = camera ?? overview;
    cancelAnimationFrame(motion);
    if (!camera || reducedMotion.matches) {
      paint(target);
      return;
    }
    const began = performance.now();
    function animate(now) {
      const t = Math.min(1, (now - began) / 560);
      const eased = 1 - (1 - t) ** 3;
      paint(target.map((value, index) => start[index] + (value - start[index]) * eased));
      if (t < 1) motion = requestAnimationFrame(animate);
    }
    paint(start);
    motion = requestAnimationFrame(animate);
  }

  function paint(pose) {
    camera = pose;
    const [x, y, scale] = pose;
    diagram.setAttribute('viewBox', [x - width / (2 * scale), y - height / (2 * scale), width / scale, height / scale].join(' '));
    if (!layout.length) return;
    const byX = [...layout].sort((a,b) => a.x - b.x);
    const middle = Math.ceil(byX.length / 2);
    const columns = [byX.slice(0,middle), byX.slice(middle)];
    const cardWidth = labelWidth();
    for (const [side, items] of columns.entries()) {
      const labelX = side ? width - cardWidth - 4 : 4;
      const edge = side ? labelX : labelX + cardWidth;
      const elbow = edge + (side ? -9 : 9);
      const step = Math.min(38, (height - 6) / Math.max(items.length, 1));
      let previous = -Infinity;
      items.sort((a,b) => a.y - b.y).forEach((item, index) => {
        const anchorX = width / 2 + (item.x - x) * scale;
        const anchorY = height / 2 + (item.y - y) * scale;
        const idealY = anchorY + (side ? -9 : 9);
        const labelY = Math.max(18, previous + step, Math.min(idealY, height - 18 - (items.length - index - 1) * step));
        const elbowY = Math.abs(anchorY - labelY) < 5 ? labelY + (side ? 7 : -7) : anchorY;
        previous = labelY;
        item.label.style.transform = `translate(${labelX}px,${labelY - 16}px)`;
        item.label.style.width = `${cardWidth}px`;
        item.wire.setAttribute('points', `${edge},${labelY} ${elbow},${labelY} ${elbow},${elbowY} ${anchorX},${anchorY}`);
        item.tip.setAttribute('cx', anchorX);
        item.tip.setAttribute('cy', anchorY);
      });
    }
  }

  async function load() {
    try {
      const response = await fetch('assets/hardware/airboat-rig.svg?v=p1-engraving');
      if (!response.ok) throw new Error('Unable to load hardware drawing');
      const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
      if (svg.localName !== 'svg') throw new Error('Invalid hardware drawing');
      diagram = document.importNode(svg, true);
      board.replaceChildren(diagram);
      bounds = diagram.querySelector('.rig-world').getBBox();
      marks = [...diagram.querySelectorAll('[data-group]')].map(node => ({ node, groups: node.dataset.group.split(' ') }));
      projected = Object.fromEntries([...diagram.querySelectorAll('[data-anchor]')].map(node => [node.dataset.anchor, {
        x: Number(node.getAttribute('cx')), y: Number(node.getAttribute('cy')),
      }]));
      update();
    } catch {
      board.textContent = '装配图暂时无法加载。';
      loading = null;
    }
  }

  new ResizeObserver(([entry]) => {
    ({ width, height } = entry.contentRect);
    if (width && height) moveCamera();
  }).observe(stage);

  return {
    load() { if (!loading) loading = load(); },
    select(path) { selected = path; update(); },
    demo(active) { demonstrating = active; update(); },
    experience(path) { running = path; update(); },
    report(state) { snapshot = state; update(); },
  };
}
