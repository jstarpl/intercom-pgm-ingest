import { program } from 'commander';
import wrtc from '@roamhq/wrtc';
import ffmpeg from 'fluent-ffmpeg';
import { AudioBuffer } from './AudioBuffer.mjs';

program
  .requiredOption('-p, --productionId <productionId>', 'Production ID to connect to')
  .option('-l, --lineId <lineId>', 'Line ID to connect to')
  .requiredOption('-u, --userName <userName>', 'Username to present as in the Line')
  .requiredOption('-s, --serverUrl <serverUrl>', 'Intercom Manager Server base URL (e.g. "http://localhost:8000")')
  .requiredOption('--apiPrefix <apiPrefix>', 'Intercom Manager API version prefix (default is "/api/v1")', '/api/v1')
  .option('-f <inputFormat>', 'Input format to use for ffmpeg (e.g. "alsa" or "jack")')
  .option('-v', 'Verbose output')
  .argument("[inputFileOrStream]")

program.parse();

const options = program.opts();
const args = program.args;

const baseUrl = `${options.serverUrl}${options.apiPrefix}`;

const productionUrl = new URL(`${baseUrl}/production/${options.productionId}`);

const res0 = await fetch(productionUrl, {
  method: 'GET'
});

if (!res0.ok) throw new Error(`Invalid response for production: ${res0.status}`);

const productionInfo = await res0.json();
let targetLine = undefined

if (options.lineId) {
  targetLine = productionInfo.lines.find((line) => `${line.id}` === options.lineId)
} else {
  targetLine = productionInfo.lines.find((line) => line.programOutputLine)
}

console.log(`Selected target line: "${targetLine.id}"`)

const newSessionUrl = new URL(`${baseUrl}/session`);

const res1 = await fetch(newSessionUrl, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    lineId: targetLine.id,
    productionId: options.productionId,
    username: options.userName,
  })
});

if (!res1.ok) throw new Error(`Invalid response for session creation: ${res1.status}`);

const sessionInfo = await res1.json();

console.log(`Created session: "${sessionInfo.sessionId}"`)

const pc = new wrtc.RTCPeerConnection();

console.log(`Setting up local audio track...`)

const pgmAudio = new wrtc.nonstandard.RTCAudioSource();
const pgmTrack = pgmAudio.createTrack();

// pgmAudio.onData({
//   bitsPerSample: 16,
//   sampleRate: 48000,
//   channelCount: 1,
//   samples
// })

const cmd = ffmpeg()
  .input(args[0]);

if (options.inputFormat) {
  cmd.inputFormat(options.inputFormat);
}

const AUDIO_CHANNELS = 1
const SAMPLE_RATE = 48000
const BITS_PER_SAMPLE = 16
const CHUNK_LENGTH_MS = 0.01 // 10ms

cmd
  .outputFormat(`s${BITS_PER_SAMPLE}le`)
  .audioChannels(AUDIO_CHANNELS)
  .audioFrequency(SAMPLE_RATE)

const outputStream = new AudioBuffer({
  chunkLength: CHUNK_LENGTH_MS, // 10ms
  sampleRate: SAMPLE_RATE,
  bitsPerSample: BITS_PER_SAMPLE,
})

cmd
  .output(outputStream)

outputStream.on('data', (data) => {
  pgmAudio.onData({
    bitsPerSample: BITS_PER_SAMPLE,
    sampleRate: SAMPLE_RATE,
    channelCount: AUDIO_CHANNELS,
    samples: new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2)
  })
})

pc.addTrack(pgmTrack);

cmd.run()

if (options.v) {
  console.log(`Received remote sdp: "${sessionInfo.sdp}"`)
}

await pc.setRemoteDescription({
  sdp: sessionInfo.sdp,
  type: "offer",
});

const sdpAnswer = await pc.createAnswer();

if (!sdpAnswer.sdp) {
  throw new Error("No sdp in answer");
}

await pc.setLocalDescription(sdpAnswer);

const patchSessionUrl = new URL(`${baseUrl}/session/${sessionInfo.sessionId}`);

if (options.v) {
  console.log(`Sending local sdp: "${sdpAnswer.sdp}"`)
}

const res2 = await fetch(patchSessionUrl, {
  method: 'PATCH',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    sdpAnswer: sdpAnswer.sdp,
  })
});

console.log("Sending...")

if (!res2.ok) throw new Error(`Invalid response for session patch: ${res2.status}`);

const keepAlive = setInterval(() => {
  const patchSessionUrl = new URL(`${baseUrl}/heartbeat/${sessionInfo.sessionId}`);

  fetch(patchSessionUrl)
    .then(() => {
      if (options.v) {
        console.log('Keepalive')
      }
    })
    .catch(() => {
      console.error('Keepalive failed')
    })
}, 10 * 1000)
