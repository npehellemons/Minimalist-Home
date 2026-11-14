let audioContext: AudioContext | null = null;

function scheduleTone(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function playChime(context: AudioContext) {
  const start = context.currentTime;
  scheduleTone(context, 659.25, start, 0.16);
  scheduleTone(context, 987.77, start + 0.1, 0.22);
}

export function playCompletionSound() {
  if (typeof window === "undefined") return;

  const audioWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextClass =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

  if (!AudioContextClass) return;

  try {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass();
    }

    const context = audioContext;
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => playChime(context))
        .catch(() => undefined);
      return;
    }

    playChime(context);
  } catch {
    // Audio feedback must never prevent a task from being completed.
  }
}
