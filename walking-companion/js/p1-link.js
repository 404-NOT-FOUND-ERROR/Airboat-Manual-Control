const sessionKey = 'airboat-remote-session-v1';
const idPattern = /^[a-f0-9]{32}$/;

const errors = {
  code: '配对码不一致，试试屏幕上的当次六位码。',
  busy: '已有手机配对。请在主机重新开启遥控。',
  closed: '请在主机打开控制 → 手机 → 开启遥控。',
  pair: '遥控已更新，请重新配对。',
  wait: '稍等片刻，再输入配对码。',
  'perform-busy': '请让主机停在双眼首页，并结束正在进行的互动。',
  'scene-busy': '请先结束当前互动。',
  offline: '暂时连不到 Mosaico，请检查局域网和遥控地址。',
};

export class AirBoatLink extends EventTarget {
  constructor() {
    super();
    this.client = Array.from(crypto.getRandomValues(new Uint8Array(16)), value =>
      value.toString(16).padStart(2, '0')).join('');
    this.serial = Promise.resolve();
    this.snapshot = null;
    this.timer = null;
    this.session = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey));
      if (saved && [saved.boot, saved.token, saved.client].every(value => idPattern.test(value))) {
        this.session = saved;
        this.client = saved.client;
      }
    } catch { /* Private browsing may disable session storage. */ }
  }

  save(session) {
    this.session = session;
    try {
      if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
      else sessionStorage.removeItem(sessionKey);
    } catch { /* Pairing remains available for this page. */ }
  }

  queue(work) {
    const job = this.serial.then(work);
    this.serial = job.catch(() => {});
    return job;
  }

  async request(body, path = '/api') {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'X-AirBoat-Control': '1' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    }).catch(() => { throw new Error(errors.offline, { cause: 'offline' }); });
    if (path === '/api') {
      const reply = await response.json().catch(() => ({}));
      if (response.ok && !reply.error) return reply;
      const reason = reply.error || 'offline';
      if (reason === 'pair' || reason === 'closed') this.save(null);
      throw new Error(errors[reason] || '主机还没准备好，请稍后再试。', { cause: reason });
    }
    if (!response.ok) {
      const reply = await response.json().catch(() => ({}));
      const reason = reply.error || 'offline';
      if (reason === 'pair' || reason === 'closed') this.save(null);
      throw new Error(errors[reason] || '主机还没准备好，请稍后再试。', { cause: reason });
    }
    return response.arrayBuffer();
  }

  get proof() {
    const { boot, token, client } = this.session;
    return `${boot} ${token} ${client}`;
  }

  publish(state) {
    if (state.boot !== this.session?.boot) {
      this.save(null);
      throw new Error(errors.pair, { cause: 'pair' });
    }
    this.snapshot = state;
    this.dispatchEvent(new CustomEvent('status', { detail: state }));
    return state;
  }

  pair(code) {
    return this.queue(async () => {
      if (!/^\d{6}$/.test(code)) throw new Error('请输入六位配对码。');
      const state = await this.request(`pair ${this.client} ${code}`);
      if (![state.boot, state.token].every(value => idPattern.test(value))) throw new Error(errors.offline);
      this.save({ client: this.client, boot: state.boot, token: state.token, sequence: state.seq });
      return this.publish(state);
    });
  }

  command([operation, ...args]) {
    return this.queue(async () => {
      if (!this.session) throw new Error(errors.pair);
      const proof = this.proof;
      const current = this.publish(await this.request(`status ${proof}`));
      const sequence = ((current.seq + 1) >>> 0) || 1;
      this.save({ ...this.session, sequence });
      return this.publish(await this.request(
        [operation, proof, sequence, current.epoch, current.ticket, ...args].join(' ')));
    });
  }

  watch(visible) {
    clearTimeout(this.timer);
    this.watching = visible;
    if (!visible || this.polling || !this.session) return;
    this.polling = true;
    this.queue(async () => {
      if (this.watching && this.session) this.publish(await this.request(`status ${this.proof}`));
    }).catch(error => {
      this.dispatchEvent(new CustomEvent('unavailable', { detail: error.message }));
    }).finally(() => {
      this.polling = false;
      if (this.watching && this.session) {
        this.timer = setTimeout(() => this.watch(true), this.snapshot?.face ? 200 : 350);
      }
    });
  }

  async readPhoto(photo) {
    const { id, bytes, crc } = photo;
    if (![id, bytes, crc].every(Number.isInteger) || id < 1 || bytes < 4 || bytes > 2_000_000) {
      throw new Error('照片还未送达。');
    }
    const data = new Uint8Array(bytes);
    const boot = this.session?.boot;
    for (let offset = 0; offset < data.length;) {
      const part = await this.queue(async () => {
        if (!this.session || this.session.boot !== boot) throw new Error(errors.pair);
        return new Uint8Array(await this.request(`photo-get ${this.proof} ${id} ${offset}`, '/photo'));
      });
      if (!part.length || part.length > data.length - offset) throw new Error('照片传输中断。');
      data.set(part, offset);
      offset += part.length;
    }
    let checksum = 0xffffffff;
    for (const byte of data) {
      checksum ^= byte;
      for (let bit = 0; bit < 8; bit++) checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
    if (((~checksum) >>> 0) !== crc || data[0] !== 0xff || data[1] !== 0xd8) {
      throw new Error('照片校验失败，请重新领取。');
    }
    return new Blob([data], { type: 'image/jpeg' });
  }
}
