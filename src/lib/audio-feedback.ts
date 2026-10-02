/**
 * Audio and Haptic Feedback Engine
 * 
 * Generates synthetic institutional chimes using the browser's native Web Audio API.
 * Eliminates reliance on external audio assets, ensuring 100% zero-network-latency playback
 * for administrative actions (approvals, rejections) and counter scanning.
 */

type FeedbackType = "success" | "reject" | "warning" | "click" | "error";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Triggers audio feedback chime and tactile haptic vibration
 * 
 * @param type 'success' (two-tone ascending chime) | 'error' (low double-buzz alert) | 'reject' | 'warning' | 'click'
 */
export function playFeedback(type: FeedbackType = "success"): void {
  // 1. Tactile haptic feedback
  if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
    try {
      if (type === "success") {
        navigator.vibrate(40);
      } else if (type === "error") {
        navigator.vibrate([100, 50, 100]);
      } else if (type === "reject" || type === "warning") {
        navigator.vibrate([40, 60, 40]);
      } else {
        navigator.vibrate(15);
      }
    } catch {
      // Ignore vibration error if disabled
    }
  }

  // 2. Synthesized Web Audio chime
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    if (type === "success") {
      // Two-tone harmonic ascending chime (C5 523.25 Hz -> E5 659.25 Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";

      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5

      osc2.frequency.setValueAtTime(659.25, now + 0.08); // Harmonic layer
      osc2.frequency.exponentialRampToValueAtTime(783.99, now + 0.22); // G5

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.08);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } else if (type === "error") {
      // Low double-buzz alert (two short low-frequency sawtooth bursts: 130 Hz -> 115 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(130, now);
      gain1.gain.setValueAtTime(0.28, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.11);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.11);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(115, now + 0.15);
      gain2.gain.setValueAtTime(0.28, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.29);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.29);
    } else if (type === "reject" || type === "warning") {
      // Descending warning alert tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.linearRampToValueAtTime(220.0, now + 0.18); // A3

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      // Subtle click sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    }
  } catch (e) {
    console.debug("[AudioFeedback] Autoplay or audio context error:", e);
  }
}
