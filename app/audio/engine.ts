import type { GameSfxKind } from "./types";

export type AudioContextLike = Pick<
  AudioContext,
  | "createOscillator"
  | "createGain"
  | "createBiquadFilter"
  | "createBufferSource"
  | "createBuffer"
  | "currentTime"
  | "destination"
  | "state"
  | "sampleRate"
>;

export type SfxEngineOptions = {
  readonly context: AudioContextLike;
  readonly masterGain?: GainNode;
};

const now = (context: AudioContextLike): number => context.currentTime;

export const createMasterGain = (
  context: AudioContextLike,
): GainNode => {
  const gain = context.createGain();
  gain.gain.value = 1;
  gain.connect(context.destination);
  return gain;
};

export const playSfx = (
  context: AudioContextLike,
  destination: AudioNode,
  kind: GameSfxKind,
  level = 1,
): void => {
  const t = now(context);
  const output = context.createGain();
  output.gain.value = level;
  output.connect(destination);

  switch (kind) {
    case "move":
      playMove(context, output, t);
      break;
    case "attack":
      playAttack(context, output, t);
      break;
    case "hit":
      playHit(context, output, t);
      break;
    case "pickup":
      playPickup(context, output, t);
      break;
    case "descend":
      playDescend(context, output, t);
      break;
    case "win":
      playWin(context, output, t);
      break;
    case "lose":
      playLose(context, output, t);
      break;
  }
};

const playMove = (
  context: AudioContextLike,
  destination: AudioNode,
  t: number,
): void => {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(920, t);
  osc.frequency.exponentialRampToValueAtTime(640, t + 0.04);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(t);
  osc.stop(t + 0.06);
};

const playAttack = (
  context: AudioContextLike,
  destination: AudioNode,
  t: number,
): void => {
  const noise = createNoiseBurst(context, 0.06);
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1800, t);
  filter.Q.setValueAtTime(0.8, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.18, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  noise.start(t);
  noise.stop(t + 0.08);
};

const playHit = (
  context: AudioContextLike,
  destination: AudioNode,
  t: number,
): void => {
  const osc = context.createOscillator();
  const noise = createNoiseBurst(context, 0.1);
  const filter = context.createBiquadFilter();
  const mix = context.createGain();
  const thud = context.createGain();
  const grit = context.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(58, t + 0.09);
  thud.gain.setValueAtTime(0.0001, t);
  thud.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
  thud.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(420, t);
  grit.gain.setValueAtTime(0.0001, t);
  grit.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
  grit.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

  osc.connect(thud);
  thud.connect(mix);
  noise.connect(filter);
  filter.connect(grit);
  grit.connect(mix);
  mix.connect(destination);
  osc.start(t);
  osc.stop(t + 0.14);
  noise.start(t);
  noise.stop(t + 0.1);
};

const playPickup = (
  context: AudioContextLike,
  destination: AudioNode,
  t: number,
): void => {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(1180, t + 0.1);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.14, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(t);
  osc.stop(t + 0.16);
};

const playDescend = (
  context: AudioContextLike,
  destination: AudioNode,
  t: number,
): void => {
  const noise = createNoiseBurst(context, 0.45);
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2200, t);
  filter.frequency.exponentialRampToValueAtTime(180, t + 0.42);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  noise.start(t);
  noise.stop(t + 0.5);
};

const playWin = (
  context: AudioContextLike,
  destination: AudioNode,
  t: number,
): void => {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((frequency, index) => {
    const start = t + index * 0.09;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(start);
    osc.stop(start + 0.24);
  });
};

const playLose = (
  context: AudioContextLike,
  destination: AudioNode,
  t: number,
): void => {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(280, t);
  osc.frequency.exponentialRampToValueAtTime(72, t + 0.55);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(t);
  osc.stop(t + 0.66);
};

const createNoiseBurst = (
  context: AudioContextLike,
  durationSec: number,
): AudioBufferSourceNode => {
  const sampleRate = context.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
};

export const isBrowserAudioAvailable = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.AudioContext !== "undefined";

export const createBrowserAudioContext = (): AudioContext | null => {
  if (!isBrowserAudioAvailable()) {
    return null;
  }

  const AudioCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (AudioCtor === undefined) {
    return null;
  }

  return new AudioCtor();
};
