/**
 * Board sounds (SND-01, SND-02). Original sounds synthesized with the Web Audio API:
 * no audio files, nothing fetched. Sound is never the only feedback; every result also has text.
 */
export type BoardSound = "move" | "capture" | "check" | "correct" | "wrong";

const STORAGE_KEY = "caissa-sound";
const listeners = new Set<() => void>();
let context: AudioContext | null = null;
let offInMemory = false;

export function soundEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return !offInMemory;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  offInMemory = !enabled;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be blocked (private mode); the in-memory choice still holds for this visit.
  }
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** delaySeconds lets a result chime follow the move sound instead of covering it. */
export function playBoardSound(kind: BoardSound, delaySeconds = 0): void {
  if (!soundEnabled() || typeof window.AudioContext !== "function") {
    return;
  }
  context ??= new window.AudioContext();
  void context.resume();
  const now = context.currentTime + delaySeconds;
  switch (kind) {
    case "move":
      thock(context, now, 0.5, 1400);
      return;
    case "capture":
      thock(context, now, 0.7, 1100);
      thock(context, now + 0.045, 0.45, 2000);
      return;
    case "check":
      thock(context, now, 0.55, 1400);
      tone(context, now + 0.03, 880, 0.12, 0.05, "sine");
      return;
    case "correct":
      tone(context, now, 660, 0.11, 0.06, "sine");
      tone(context, now + 0.1, 990, 0.16, 0.06, "sine");
      return;
    case "wrong":
      tone(context, now, 196, 0.18, 0.07, "triangle");
      tone(context, now + 0.09, 165, 0.2, 0.06, "triangle");
      return;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/** A wooden piece landing: a short filtered noise burst over a low body tone. */
function thock(audio: AudioContext, at: number, level: number, pitch: number): void {
  const length = Math.floor(audio.sampleRate * 0.05);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3;
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const band = audio.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = pitch;
  band.Q.value = 1.2;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(level * 0.35, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  noise.connect(band).connect(gain).connect(audio.destination);
  noise.start(at);
  tone(audio, at, 170, 0.07, level * 0.12, "sine");
}

function tone(
  audio: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  level: number,
  type: OscillatorType,
): void {
  const oscillator = audio.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}
