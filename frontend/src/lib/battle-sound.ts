type BattleSound = {
  play: () => void;
  stop: () => void;
};

export function primeBattleSound(): BattleSound {
  const Ctx = window.AudioContext;
  if (!Ctx) {
    return { play() {}, stop() {} };
  }
  const ctx = new Ctx();
  void ctx.resume();
  let playing = false;
  let timer = 0;

  function beat(step: number) {
    if (!playing) {
      return;
    }
    const time = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = step % 2 === 0 ? "triangle" : "sine";
    osc.frequency.value = step % 2 === 0 ? 98 : 146;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.07, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.18);
    timer = window.setTimeout(() => beat(step + 1), 380);
  }

  return {
    play() {
      if (playing) {
        return;
      }
      playing = true;
      beat(0);
    },
    stop() {
      playing = false;
      window.clearTimeout(timer);
      // stop() runs again when the form is submitted twice; closing a closed context throws.
      if (ctx.state !== "closed") {
        void ctx.close();
      }
    },
  };
}
