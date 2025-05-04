import { Writable } from 'stream';

export class AudioBuffer extends Writable {
  buffer = [];
  chunkLength = 0;
  totalBytes = 0;
  chunkSize = 0;
  chunkLowWaterMark = 0;

  constructor(options) {
    super(options);
    this.chunkLength = options.chunkLength;
    this.chunkLowWaterMark = (options.lowWaterMark ?? 0 + 1) * this.chunkSize;
    this.chunkSize =
      options.chunkLength *
      options.sampleRate *
      (
        (options.bitsPerSample ?? 16) / 8
      ) *
      (options.channelCount ?? 1);
  }

  emitChunkIfAvailable() {
    if (this.totalBytes < this.chunkLowWaterMark) {
      return
    }

    const newChunk = Buffer.alloc(this.chunkSize);
    let cursor = 0;

    while (cursor < this.chunkSize && this.buffer.length) {
      const head = this.buffer.shift();
  
      const bytesFromHead = Math.min(this.chunkSize - cursor, head.byteLength);
      head.copy(newChunk, cursor, 0, bytesFromHead);
      cursor += bytesFromHead;
      
      if (bytesFromHead < head.byteLength) {
        const leftOverSize = head.byteLength - bytesFromHead;
        const leftOver = Buffer.alloc(leftOverSize);
        head.copy(leftOver, 0, bytesFromHead, head.byteLength);

        this.buffer.unshift(leftOver);
      }
    }

    this.totalBytes = this.totalBytes - this.chunkSize;

    this.emit('data', newChunk);

    // don't schedule a new timeout, if one is already scheduled
    if (this._emitTimeout) return

    this._emitTimeout = setTimeout(() => {
      this._emitTimeout = null;
      this.emitChunkIfAvailable();
    }, this.chunkLength * 1000)
  }

  _write(chunk, encoding, callback) {
    this.buffer.push(chunk)
    this.totalBytes += chunk.byteLength

    this.emitChunkIfAvailable()
    callback(); // Signal that writing is done
  }
}
