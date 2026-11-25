export const experiences = {
  walking: [
    { title: '陪我出去走走', description: '它先开口邀你散步。你可以说「走吧」，也可以和它改约。',
      command: ['invite'], cancel: ['invite-cancel'], hardware: 'voice', lane: 'reply', face: 'happy',
      instruction: '听完邀请后，直接说「走吧」或「我还在忙」。' },
  ],
  chilling: [
    { title: '晃晃，哄哄它', description: '晃动时眼神发懵。放稳后，听听它想说什么。',
      hardware: 'sense', lane: 'comfort', face: 'confused',
      instruction: '托稳主机，轻晃后放稳。听它开口，再说一句「没事啦」。' },
  ],
  working: [
    { title: '帮我记个时间', description: '工作间隙说一句，让它替你记住休息时间。',
      hardware: 'voice', lane: 'listen', face: 'listening',
      instruction: '对主机说「小酥肉」。等它聆听，再说「倒计时二十秒」。' },
  ],
  exploring: [
    { title: '小摄影师', description: '它帮你拍一张，照片会送到这台手机。',
      hardware: 'camera', lane: 'listen', face: 'listening', photo: true,
      instruction: '对主机说「小酥肉，帮我拍张照片发到手机」。' },
  ],
  playing: [
    { title: '给我眨个眼', description: '点一下，看看它真的在屏幕上眨眼。',
      command: ['perform', 'face', 'winking'], cancel: ['perform', 'stop'],
      hardware: 'face', lane: 'remote', face: 'winking',
      instruction: '看主机屏幕，它会做一个眨眼动作。' },
    { title: '听它的小曲', description: '叫它选一首喜欢的曲子。声音和眼神会一起回应。',
      hardware: 'voice', lane: 'reply', face: 'beat_swing',
      instruction: '对主机说「小酥肉，播放帝国进行曲」。点主机的脸可以结束。' },
  ],
};

export function liveLane(semantic) {
  if (semantic === 'listening') return 'listen';
  if (semantic === 'thinking') return 'think';
  if (semantic === 'confused') return 'comfort';
  return null;
}
