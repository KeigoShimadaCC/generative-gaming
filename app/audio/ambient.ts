import type { DepthBand } from "./types";
import type { AudioContextLike } from "./engine";

export type AmbientLayer = {
  readonly stop: () => void;
  readonly setBand: (band: DepthBand) => void;
  readonly setLevel: (level: number) => void;
};

type BandPatch = {
  readonly baseHz: number;
  readonly detuneCents: readonly number[];
  readonly filterHz: number;
  readonly mix: number;
};

const BAND_PATCHES: Readonly<Record<DepthBand, BandPatch>> = {
  shallows: {
    baseHz: 110,
    detuneCents: [-7, 0, 9],
    filterHz: 680,
    mix: 0.55,
  },
  middle: {
    baseHz: 82.5,
    detuneCents: [-9, 0, 11],
    filterHz: 520,
    mix: 0.62,
  },
  lowest: {
    baseHz: 55,
    detuneCents: [-6, 0, 8],
    filterHz: 360,
    mix: 0.7,
  },
};

const CROSSFADE_SEC = 1.4;

export const createAmbientLayer = (
  context: AudioContextLike,
  destination: AudioNode,
  initialBand: DepthBand,
): AmbientLayer => {
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(destination);

  const voices = new Map<
    DepthBand,
    {
      readonly output: GainNode;
      readonly oscillators: readonly OscillatorNode[];
      readonly lfo: OscillatorNode;
      readonly lfoGain: GainNode;
      readonly filter: BiquadFilterNode;
    }
  >();

  for (const band of Object.keys(BAND_PATCHES) as DepthBand[]) {
    voices.set(band, createBandVoice(context, master, band));
  }

  let activeBand: DepthBand = initialBand;
  setActiveBand(context, voices, activeBand, 1);

  return {
    stop: () => {
      for (const voice of voices.values()) {
        for (const oscillator of voice.oscillators) {
          try {
            oscillator.stop();
          } catch {
            // already stopped
          }
        }
        try {
          voice.lfo.stop();
        } catch {
          // already stopped
        }
      }
      master.disconnect();
    },
    setBand: (band) => {
      if (band === activeBand) {
        return;
      }
      const previous = activeBand;
      activeBand = band;
      crossfadeBands(context, voices, previous, band);
    },
    setLevel: (level) => {
      const t = context.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(level, t + 0.08);
    },
  };
};

const createBandVoice = (
  context: AudioContextLike,
  destination: GainNode,
  band: DepthBand,
) => {
  const patch = BAND_PATCHES[band];
  const output = context.createGain();
  output.gain.value = 0;
  output.connect(destination);

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = patch.filterHz;
  filter.Q.value = 0.6;
  filter.connect(output);

  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 0.05 + patch.mix * 0.02;
  lfoGain.gain.value = patch.filterHz * 0.18;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const oscillators = patch.detuneCents.map((detuneCents) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = patch.baseHz;
    osc.detune.value = detuneCents;
    gain.gain.value = 0.14 / patch.detuneCents.length;
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
    return osc;
  });

  return { output, oscillators, lfo, lfoGain, filter };
};

const setActiveBand = (
  context: AudioContextLike,
  voices: ReadonlyMap<DepthBand, { readonly output: GainNode }>,
  band: DepthBand,
  level: number,
): void => {
  const t = context.currentTime;
  for (const [key, voice] of voices.entries()) {
    voice.output.gain.cancelScheduledValues(t);
    voice.output.gain.setValueAtTime(voice.output.gain.value, t);
    voice.output.gain.linearRampToValueAtTime(key === band ? level : 0, t + 0.02);
  }
};

const crossfadeBands = (
  context: AudioContextLike,
  voices: ReadonlyMap<DepthBand, { readonly output: GainNode }>,
  from: DepthBand,
  to: DepthBand,
): void => {
  const t = context.currentTime;
  const fromVoice = voices.get(from);
  const toVoice = voices.get(to);
  if (fromVoice === undefined || toVoice === undefined) {
    return;
  }

  fromVoice.output.gain.cancelScheduledValues(t);
  fromVoice.output.gain.setValueAtTime(fromVoice.output.gain.value, t);
  fromVoice.output.gain.linearRampToValueAtTime(0, t + CROSSFADE_SEC);

  toVoice.output.gain.cancelScheduledValues(t);
  toVoice.output.gain.setValueAtTime(toVoice.output.gain.value, t);
  toVoice.output.gain.linearRampToValueAtTime(1, t + CROSSFADE_SEC);
};
