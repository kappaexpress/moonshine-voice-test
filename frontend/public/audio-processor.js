class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(1600); // 100ms at 16kHz
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (input.length === 0 || input[0].length === 0) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._offset++] = channelData[i];
      if (this._offset >= this._buffer.length) {
        this.port.postMessage(this._buffer.slice());
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('audio-stream-processor', AudioStreamProcessor);
