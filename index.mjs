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

async function apiCall(path, method, body) {
  const headers = {}

  let fetchBody = undefined

  if (body) {
    headers['content-type'] = 'application/json'
    fetchBody = JSON.stringify(body)
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: method ?? 'GET',
    headers,
    body: fetchBody,
  });
  if (!res.ok) throw new Error(`Invalid response for ${path}: ${res.status}`)

  if (res.headers.get('content-type')?.startsWith('application/json'))
    return res.json()

  return res.text()
}

const productionInfo = await apiCall(`/production/${options.productionId}`);
let targetLine = undefined

if (options.lineId) {
  targetLine = productionInfo.lines.find((line) => `${line.id}` === options.lineId)
} else {
  targetLine = productionInfo.lines.find((line) => line.programOutputLine)
}

console.log(`Selected target line: "${targetLine.id}"`)

const sessionInfo = await apiCall(`/session`, 'POST', {
  lineId: targetLine.id,
  productionId: options.productionId,
  username: options.userName,
});

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

await apiCall(`/session/${sessionInfo.sessionId}`, 'PATCH', {
  sdpAnswer: sdpAnswer.sdp,
});

console.log("Sending...")

const keepAlive = setInterval(() => {
  apiCall(`/heartbeat/${sessionInfo.sessionId}`)
    .then(() => {
      if (options.v) {
        console.log('Keepalive')
      }
    })
    .catch(() => {
      console.error('Keepalive failed')
    })
}, 10 * 1000)
