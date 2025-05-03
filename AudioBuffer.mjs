import { Writable } from 'stream';

export class AudioBuffer extends Writable {
  buffer = [];
  chunkLength = 0;
  totalBytes = 0;
  chunkSize = 0;

  constructor(options) {
    super(options);
    this.chunkLength = options.chunkLength;
    this.chunkSize = options.chunkLength * options.sampleRate * ((options.bitsPerSample ?? 16) / 8) * (options.channelCount ?? 1)
  }

  emitChunkIfAvailable() {
    if (this.totalBytes < this.chunkSize) return

    const newChunk = Buffer.alloc(this.chunkSize)
    let cursor = 0;

    while (cursor < this.chunkSize) {
      const head = this.buffer.shift()
      if (head === undefined) throw new Error('Buffer underflow error')
  
      const bytesFromHead = Math.min(this.chunkSize - cursor, head.byteLength)
      head.copy(newChunk, cursor, 0, bytesFromHead)
      cursor += bytesFromHead
      if (bytesFromHead < head.byteLength) {
        const leftOverSize = head.byteLength - bytesFromHead
        const leftOver = Buffer.from(head.buffer, bytesFromHead, leftOverSize)

        this.buffer.unshift(leftOver)
      }
    }

    this.totalBytes = this.totalBytes - this.chunkSize

    this.emit('data', newChunk)

    setTimeout(() => {
      this.emitChunkIfAvailable()
    }, (this.chunkLength * 1000) - 2)
  }

  _write(chunk, encoding, callback) {
    this.buffer.push(chunk)
    this.totalBytes += chunk.byteLength

    // this.emit('data', chunk); // Emit 'data' event on write
    this.emitChunkIfAvailable()
    callback(); // Signal that writing is done
  }
}
