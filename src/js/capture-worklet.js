/* Sample-accurate audio capture for the looper. Runs on the audio thread, so a busy UI
   (camera, canvas, video) can no longer put gaps or crackle into a recorded loop.
   Messages in : {cmd:'start', t0:<context seconds>, target:<frames or 0 for free length>}
                 {cmd:'finish'} | {cmd:'cancel'}
   Messages out: {done:true, data:Float32Array, t0:<seconds the first sample was captured at>} */
class RccCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap = null;
    this.port.onmessage = e => {
      const m = e.data || {};
      if (m.cmd === 'start') this.cap = { startFrame: Math.round(m.t0 * sampleRate), target: m.target | 0, chunks: [], len: 0, started: false };
      else if (m.cmd === 'finish') this.flush();
      else if (m.cmd === 'cancel') this.cap = null;
    };
  }
  flush() {
    const c = this.cap; if (!c) return; this.cap = null;
    const out = new Float32Array(c.len); let o = 0;
    for (const ch of c.chunks) { out.set(ch, o); o += ch.length; }
    this.port.postMessage({ done: true, data: out, t0: c.startFrame / sampleRate }, [out.buffer]);
  }
  process(inputs) {
    const c = this.cap; if (!c) return true;
    const inp = inputs[0] && inputs[0][0], n = inp ? inp.length : 128, frame = currentFrame;
    let from = 0;
    if (!c.started) { if (c.startFrame >= frame + n) return true; from = Math.max(0, c.startFrame - frame); c.started = true; }
    let to = n; if (c.target && c.len + (to - from) > c.target) to = from + (c.target - c.len);
    const chunk = new Float32Array(Math.max(0, to - from)); if (inp) chunk.set(inp.subarray(from, to));
    c.chunks.push(chunk); c.len += chunk.length;
    if (c.target && c.len >= c.target) this.flush();
    return true;
  }
}
registerProcessor('rcc-capture', RccCapture);
