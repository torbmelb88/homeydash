/**
 * Intercom AudioWorklet Processor (Homeydash)
 * Ported from intercom_native's frontend processor.
 * Runs in a separate audio thread and converts Float32 mic samples to
 * Int16 PCM at 16 kHz in 512-sample (32 ms) chunks — matching the ESP
 * AUDIO_CHUNK_SIZE so frames line up with the firmware.
 */

const TARGET_SAMPLE_RATE = 16000;

class IntercomRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._targetSamples = 512; // 32 ms @ 16 kHz
    // Fractional resampler works for any input rate (44.1 kHz, 48 kHz, ...)
    this._resampleRatio = sampleRate / TARGET_SAMPLE_RATE;
    this._resampleAccum = 0;
  }

  process(inputList) {
    if (!inputList || inputList.length === 0) return true;
    const channel = inputList[0] && inputList[0][0];
    if (!channel || channel.length === 0) return true;

    for (let i = 0; i < channel.length; i++) {
      this._resampleAccum += 1;
      if (this._resampleAccum >= this._resampleRatio) {
        this._buffer.push(channel[i]);
        this._resampleAccum -= this._resampleRatio;
      }
    }

    while (this._buffer.length >= this._targetSamples) {
      const chunk = this._buffer.splice(0, this._targetSamples);
      const int16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      try {
        this.port.postMessage({ type: "audio", buffer: int16.buffer }, [int16.buffer]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[IntercomProcessor] postMessage error:", err);
      }
    }
    return true;
  }
}

registerProcessor("intercom-processor", IntercomRecorderProcessor);
