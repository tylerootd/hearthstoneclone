let _ctx = null;
function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

export function playSwoosh() {
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(150, c.currentTime + 0.15);
  gain.gain.setValueAtTime(0.12, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.15);
}

export function playImpact() {
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(120, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.12);
  gain.gain.setValueAtTime(0.18, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.12);

  const bufSize = c.sampleRate * 0.08;
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
  const noise = c.createBufferSource();
  const nGain = c.createGain();
  noise.buffer = buf;
  nGain.gain.setValueAtTime(0.15, c.currentTime);
  nGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
  noise.connect(nGain).connect(c.destination);
  noise.start(c.currentTime);
}
