// get DOM elements
'use strict';

let MODELS_CFG = null;
async function loadModelsConfig() {
  if (MODELS_CFG) return MODELS_CFG;
  MODELS_CFG = await (await fetch('config/models.json', { cache: 'no-store' })).json();
  return MODELS_CFG;
}

var dataChannelLog = document.getElementById('data-channel'),
    iceConnectionLog = document.getElementById('ice-connection-state'),
    iceGatheringLog = document.getElementById('ice-gathering-state'),
    signalingLog = document.getElementById('signaling-state'),
    testMsgsCount = document.getElementById('test-msgs'),
    statLog = document.getElementById('transmission-status'),
    video = document.getElementById('video'),
    model_name = document.getElementById('model-name'),
    statsBody = document.getElementById("stats-body"),
    statChartSelect = document.getElementById('stat-chart'),
    chartCanvas  = document.getElementById('stats-chart'),
    canvasEl = document.getElementById("output-canvas")
    
var selectBackend = document.getElementById("backend");

document.addEventListener('DOMContentLoaded', async function() {
  await updateModels();
  updateVideos();
});
const NUM_BITS = 14;

const height_values = [144, 240, 360, 480, 720, 1080];
let frame_id = 0;
let input_video_width, input_video_height, model_path;
let alphaChannel, adapter, device, context, presentationFormat, presentationSize, pipeline, sampler,sizeParams, sizeParamBuffer, Model;

let webglObj, webgl_texture_config, gl;
let Architecture;
let SaveFrames;
let OutputOffScreenCanvas;

var pc = null;

// data channel
var dc = null, dcInterval = null;
const framesToClose = {};

let timesDB = new StepTimesDB({ initialStep: 'input', finalStep: 'final' });
let save_frames_check;
const resolutions = {
  '90p':  { width: 160,  height: 90 },  
  '120p':  { width: 176,  height: 120 },
  '180p':  { width: 320,  height: 180 },
  '240p':  { width: 320,  height: 240 },
  '270p':  { width: 480,  height: 270 }, 
  '360p':  { width: 640,  height: 360 },
  '480p':  { width: 640,  height: 480 },
  '540p':  { width: 1024,  height: 540 },
  '720p':  { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 }
};


let reportedStats = {};


var Previous_Frame = 0;
var Frame_Latancy_array = [];


const jitterArray = [];
const freezeCountArray = [];
const framesDecodedArray = [];
const framesPerSecondArray = [];
const jitterBufferDelayArray = [];
const jitterBufferEmittedCountArray = [];
const packetsLostArray = [];
const totalFreezesDurationArray = [];
const totalInterFrameDelayArray = [];
const totalEndtoEndLatencyArray = [];
const totalDecodeTimeArray = [];
const totalAssemblyTimeArray = [];
const totalPausesDurationArray = [];
const totalProcessingDelayArray = [];
const totalSquaredInterFrameDelayArray = [];
const BandwidthArray = [];

let lastBytesReceived = 0;
let lastTimestamp = 0;
let lastPerformance = 0;
let frame_upsampled = 0;
let last_frame_id=0;
let lastPacketsLost = 0;
let lastPacketsReceived = 0;
//performance metrics 

let performance_times = [];
let wallms_times = [];
let lastFrameTime = -1;
let Buffer_Data = [];

//status
let InProgress = false;
let Finished = false;
let LastFrameDecoded = 0;

async function SetReportInterval(IntervalPeriod) {
    setInterval(async () => {
        if(InProgress == true && Finished == false){
            const stats = await pc.getStats();
            stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "video" && LastFrameDecoded != report.framesDecoded) {
                const jitter = report.jitter?.toFixed(3);
                jitterArray.push(jitter);
                document.getElementById("jitter").textContent = jitter * 1000;
            
                const freezeCount = report.freezeCount?.toFixed(3);
                freezeCountArray.push(freezeCount);
                document.getElementById("freeze-count").textContent = Math.round(freezeCount);
            
                const framesDecoded = report.framesDecoded?.toFixed(3);
                framesDecodedArray.push(framesDecoded);
                document.getElementById("frames-decoded").textContent = Math.round(framesDecoded);
            
                const framesPerSecond = report.framesPerSecond?.toFixed(3);
                framesPerSecondArray.push(framesPerSecond);
                document.getElementById("frames-per-second").textContent = Math.round(framesPerSecond);
            
                const jitterBufferDelay = report.jitterBufferDelay?.toFixed(3);
                jitterBufferDelayArray.push(jitterBufferDelay);
            
                const jitterBufferEmittedCount = report.jitterBufferEmittedCount?.toFixed(3);
                jitterBufferEmittedCountArray.push(jitterBufferEmittedCount);
            
                const rawPacketsLost = report.packetsLost
                const rawPacketsReceived = report.packetsReceived
                const deltaLost = rawPacketsLost - lastPacketsLost;
                const deltaReceived = rawPacketsReceived - lastPacketsReceived;
                const intervalPacketLossRatio =  (deltaLost / (deltaReceived + deltaLost));

                packetsLostArray.push((intervalPacketLossRatio * 100).toFixed(3));
                document.getElementById("packets-lost").textContent = (intervalPacketLossRatio * 100).toFixed(3);
            
                const totalFreezesDuration = report.totalFreezesDuration?.toFixed(3);
                totalFreezesDurationArray.push(totalFreezesDuration);
                document.getElementById("total-freeze-time").textContent = totalFreezesDuration;
            
                const totalInterFrameDelay = report.totalInterFrameDelay?.toFixed(3);
                totalInterFrameDelayArray.push(totalInterFrameDelay);
            
                const totalDecodeTime = report.totalDecodeTime?.toFixed(3);
                totalDecodeTimeArray.push(totalDecodeTime);
            
                const totalAssemblyTime = report.totalAssemblyTime?.toFixed(3);
                totalAssemblyTimeArray.push(totalAssemblyTime);
            
                const totalPausesDuration = report.totalPausesDuration?.toFixed(3);
                totalPausesDurationArray.push(totalPausesDuration);
            
                const totalProcessingDelay = report.totalProcessingDelay?.toFixed(3);
                totalProcessingDelayArray.push(totalProcessingDelay);
            
                const totalSquaredInterFrameDelay = report.totalSquaredInterFrameDelay?.toFixed(3);
                totalSquaredInterFrameDelayArray.push(totalSquaredInterFrameDelay);
            
                const bytesReceived = report.bytesReceived;
                const timestamp = report.timestamp;

                if (lastTimestamp) {
                    const bytesDelta = bytesReceived - lastBytesReceived;
                    const timeDelta = (timestamp - lastTimestamp) / 1000; // Convert ms to seconds

                    const throughput = (bytesDelta * 8) / timeDelta; // bps
                    BandwidthArray.push(throughput);
                    document.getElementById("bandwidth").textContent = (throughput/1e6).toFixed(3);
                }

                lastBytesReceived = bytesReceived;
                lastTimestamp = timestamp;

                lastPacketsLost = rawPacketsLost;
                lastPacketsReceived = rawPacketsReceived;

                LastFrameDecoded = report.framesDecoded;
                if(Architecture == 'SingleThread'){
                  const E2E_latency = wallms_times.slice(last_frame_id, frame_upsampled + 1)
                          .reduce((a,b)=>a+b,0) / (frame_upsampled - last_frame_id + 1);
                  last_frame_id = frame_upsampled;
                  document.getElementById("End-to-End-Latency").textContent = E2E_latency.toFixed(3);
                  totalEndtoEndLatencyArray.push(E2E_latency)
                }
                else if(Architecture == 'MultiThread'){
                  transformWorker.postMessage({ type: 'collect-stats' });
                }
                SendHardware();

            }
            });
        }
    }, IntervalPeriod);
    
}



statChartSelect.addEventListener('change', () => {
  const intervalMs = Number(document.getElementById('interval').value || 1000);
  const key = statChartSelect.value;
  if (!key) return;

  const STAT_META = {
  jitter:              { label: 'Jitter',               unit: 'ms',   transform: v => v * 1000 }, // spec is seconds → ms
  freezeCount:         { label: 'Freeze Count',         unit: '' },
  totalFreezeTime:     { label: 'Total Freeze Duration',unit: 's',    alias: 'totalFreezesDuration' },
  framesDecoded:       { label: 'Frames Decoded',       unit: '' },
  framesPerSecond:     { label: 'Frames Per Second',    unit: 'fps' },
  packetsLost:         { label: 'Packets Lost',         unit: '%' },
  EndtoEndLatency:     { label: 'End to End Latency',unit: 'ms'},
  bandwidth:           { label: 'Bandwidth',            unit: 'Mbps', transform: v => v / 1e6 }   // if array is bps
  };

  // Map menu values -> data arrays (keep both new/legacy keys)
  const seriesByKey = {
    jitter:              typeof jitterArray !== 'undefined' ? jitterArray : [],
    freezeCount:         typeof freezeCountArray !== 'undefined' ? freezeCountArray : [],
    framesDecoded:       typeof framesDecodedArray !== 'undefined' ? framesDecodedArray : [],
    framesPerSecond:     typeof framesPerSecondArray !== 'undefined' ? framesPerSecondArray : [],
    jitterBufferDelay:   typeof jitterBufferDelayArray !== 'undefined' ? jitterBufferDelayArray : [],
    jitterBufferEmittedCount: typeof jitterBufferEmittedCountArray !== 'undefined' ? jitterBufferEmittedCountArray : [],
    packetsLost:         typeof packetsLostArray !== 'undefined' ? packetsLostArray : [],
    totalInterFrameDelay:typeof totalInterFrameDelayArray !== 'undefined' ? totalInterFrameDelayArray : [],
    totalFreezesDuration:typeof totalFreezesDurationArray !== 'undefined' ? totalFreezesDurationArray : [],
    totalDecodeTime:     typeof totalDecodeTimeArray !== 'undefined' ? totalDecodeTimeArray : [],
    totalAssemblyTime:   typeof totalAssemblyTimeArray !== 'undefined' ? totalAssemblyTimeArray : [],
    totalPausesDuration: typeof totalPausesDurationArray !== 'undefined' ? totalPausesDurationArray : [],
    totalProcessingDelay:typeof totalProcessingDelayArray !== 'undefined' ? totalProcessingDelayArray : [],
    EndtoEndLatency:     typeof totalEndtoEndLatencyArray !== 'undefined' ? totalEndtoEndLatencyArray : [],
    totalSquaredInterFrameDelay: typeof totalSquaredInterFrameDelayArray !== 'undefined' ? totalSquaredInterFrameDelayArray : [],
    bandwidth:           typeof BandwidthArray !== 'undefined' ? BandwidthArray :
                         (typeof bandwidthArray !== 'undefined' ? bandwidthArray : [])
  };
  
  // NEW: pull meta (handles alias + unit + transform)
  const meta = STAT_META[key] || { label: key, unit: '' };
  const dataKey = meta.alias || key;


  const raw = Array.isArray(seriesByKey[dataKey]) ? seriesByKey[dataKey] : [];
  const nums = raw.map(n => Number(n));                  // handle strings from .toFixed
  const dataSeries = meta.transform ? nums.map(meta.transform) : nums;

  const labels = dataSeries.map((_, i) => (i + 1) * intervalMs / 1000);

  // Destroy any existing chart for this canvas (no global var needed)
  const existing =
    (typeof Chart?.getChart === 'function'
      ? (Chart.getChart(chartCanvas) || Chart.getChart('stats-chart'))
      : null)
    || chartCanvas._chart   // fallback for older setups
    || window.myChart;      // if old code left this around
  if (existing && typeof existing.destroy === 'function') existing.destroy();

  // Create the new chart
  const ctx = chartCanvas.getContext('2d');
  const newChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: meta.label,                      // NEW: nicer label
        data: dataSeries,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          enabled: true,
          mode: 'nearest',
          intersect: false,
          // NEW: show unit in tooltip
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y;
              return `${meta.label}: ${val}${meta.unit ? ' ' + meta.unit : ''}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 10 }, title: { display: true, text: 'Time (s)' } },
        y: {
          beginAtZero: true,
          // NEW: axis title + tick formatter with unit
          title: { display: true, text: meta.unit ? `${meta.label} (${meta.unit})` : meta.label },
          ticks: { callback: (v) => meta.unit ? `${v}` : v }
        }
      }
    }
  });


  chartCanvas._chart = newChart;

  chartCanvas.style.display = 'block';
});


async function reportStats() {
    
    const mainStats = InstrumentedTransformStream.collectStats();
    timesDB.addEntries(mainStats);
    if (reportedStats.transformWorker) {
      timesDB.addEntries(reportedStats.transformWorker);
    }
    if (reportedStats.overlayWorker) {
      timesDB.addEntries(reportedStats.overlayWorker);
    }
    const report = timesDB.computeStats();
    const tbody = document.querySelector('#processing-stats-table tbody');
    tbody.innerHTML = '';

    function reportCounter(name) {
      const stats = report.stats[name];
      const label =
        name === 'queued' ? 'Queue Latency' :
        name === 'end2end' ? 'End to End Latency' :
        name === 'SR' ? 'Model Inference' :
        name; // rename just for display
      const res = `<tr>
        <td>${label}</td>
        <td data-unit="#">${stats.count}</td>
        <td data-unit="ms">${stats.ColdStart}</td>
        <td data-unit="ms">${stats.avg}</td>
        <td data-unit="ms">${stats.median}</td>
        <td data-unit="ms">${stats.min}</td>
        <td data-unit="ms">${stats.max}</td>
      </tr>`;
      tbody.innerHTML += res;
    }

    const orderedCounters = [
      'toCPU-rgbx', 'RGBX Converter',
      'toCPU-transform', 'background', 'SR',
      'toCPU-encode', 'toGPU-encode', 'encode', 'decode',
      'outoforder', 'longer',
      'toCPU-overlay', 'toGPU-overlay', 'overlay',
      'display',
      'end2end',
      'queued'
    ];

    for (const counter of orderedCounters) {
      if (report.stats[counter]?.count > 0) {
        reportCounter(counter);
      }
    }
    await SendTiming(report.stats);

}

const computeTimingStats = durations => {
    durations = durations.slice()
    const count = durations.length;
    const ColdStart = durations.shift(); // Pop the first item
    durations = durations.sort();
    const sum = durations.reduce((sum, duration) => sum + duration, 0);
    const half = count >> 1;
    const median = count % 2 === 1 ? durations[half] : (durations[half - 1] + durations[half]) / 2;
    return {
      count: count,
      ColdStart: ColdStart.toFixed(2),
      min: parseFloat(Math.min(...durations).toFixed(2)),
      max: parseFloat(Math.max(...durations).toFixed(2)),
      avg: parseFloat((sum / count).toFixed(2)),
      median: parseFloat(median.toFixed(2))
    };
}

async function populateStatsTablePerformance() {
    const tbody = document.querySelector('#processing-stats-table tbody');
    if (!tbody) {
            console.warn('No stats table found, creating fallback');
            return;
    }
  
    const statsSection = document.getElementById('processing-stats');
    if (statsSection && statsSection.hidden) {
        statsSection.hidden = false;
    }
    tbody.innerHTML = '';

    const wallms_stats = computeTimingStats(wallms_times);

    const stats = [
        { name: "End-to-End", data: wallms_stats },
    ]

    function reportCounter(stat) {

        const res = `<tr>
          <td data-unit="">${stat.name}</td>
          <td data-unit="#">${stat.data.count} </td>
          <td data-unit="ms">${stat.data.ColdStart}</td>
          <td data-unit="ms">${stat.data.avg}</td>
          <td data-unit="ms">${stat.data.median}</td>
          <td data-unit="ms">${stat.data.min}</td>
          <td data-unit="ms">${stat.data.max}</td>
        </tr>`;
        tbody.innerHTML += res;
      }
    
    stats.forEach(stat => {
        reportCounter(stat);
    });

    await SendTiming(wallms_stats);
}

const transformWorker = new Worker('worker-transform.js');

transformWorker.addEventListener('message', e => {
    if (e.data.type === 'stats') {
      reportedStats.transformWorker = e.data.stats;
      console.log('final',reportedStats.transformWorker)
      wallms_times = e.data.walltimes;
        reportStats();
      
    }
});

transformWorker.addEventListener('message', e => {
  if (e.data.type === 'collect-stats') {
    

  const mainStats = InstrumentedTransformStream.collectStats();
  timesDB.addEntries(mainStats);
  if (reportedStats.transformWorker) {
    timesDB.addEntries(reportedStats.transformWorker);
  }
  if (reportedStats.overlayWorker) {
    timesDB.addEntries(reportedStats.overlayWorker);
  }
  const report = timesDB.computeStats();
  document.getElementById("End-to-End-Latency").textContent = (report.stats.end2end.avg).toFixed(3);
  totalEndtoEndLatencyArray.push(report.stats.end2end.avg)

    }
});

function appendDataChannelLog(line){
    var scrolled = false;
    if(Math.abs(dataChannelLog.scrollHeight - dataChannelLog.clientHeight - dataChannelLog.scrollTop) < 10)
        scrolled = true;
    // Shorten the amount of stuff in the log window
    if (dataChannelLog.textContent.length > 10000) {
        dataChannelLog.textContent = dataChannelLog.textContent.substring(dataChannelLog.textContent.length - 10000)
    }
    dataChannelLog.textContent += line+'\n';
    if(scrolled)
        dataChannelLog.scrollTop = dataChannelLog.scrollHeight;
}


function createPeerConnection() {
    var config = {
        sdpSemantics: 'unified-plan',
        bundlePolicy: 'max-bundle'
    };

    if (document.getElementById('use-stun').checked) {
        config.iceServers = [{urls: ['stun:stun.l.google.com:19302']}];
    }

    pc = new RTCPeerConnection(config);

    // register some listeners to help debugging
    pc.addEventListener('icegatheringstatechange', function() {
        iceGatheringLog.textContent += ' -> ' + pc.iceGatheringState;
    }, false);
    iceGatheringLog.textContent = pc.iceGatheringState;

    pc.addEventListener('iceconnectionstatechange', function() {
        iceConnectionLog.textContent += ' -> ' + pc.iceConnectionState;
    }, false);
    iceConnectionLog.textContent = pc.iceConnectionState;

    pc.addEventListener('signalingstatechange', function() {
        signalingLog.textContent += ' -> ' + pc.signalingState;
    }, false);
    signalingLog.textContent = pc.signalingState;

    pc.addEventListener('track', function(evt) {
        evt.receiver.playoutDelayHint = 0;
        evt.receiver.playoutDelay = 0;
        evt.receiver.jitterBufferDelayHint = 0;

        

        if (Architecture == 'SingleThread'){

            if (evt.track.kind == 'video')
                document.getElementById('video').srcObject = evt.streams[0];
            else
                document.getElementById('audio').srcObject = evt.streams[0];
        }

        else if(Architecture == 'MultiThread' && evt.track.kind == 'video'){

            const input_video_resoltion = document.getElementById('video-resolution');

            input_video_width = resolutions[input_video_resoltion.value].width
            input_video_height = resolutions[input_video_resoltion.value].height

            const closeHack = true;
            
            const config = {
                selected_backend:selectBackend.value,
                streamMode:"usermedia",
                width: input_video_width,
                height: input_video_height,
                closeHack:closeHack,
                Model_Path:model_path,
                save_frames:(document.getElementById("save-frame").checked),
                scale: document.getElementById("scale").value,
                Model_Name: document.getElementById('model-name').value,
                resolution: String(canvasEl.width) + "x" + String(canvasEl.height),

            };

            const overlayWorker = new Worker('worker-overlay.js');

            const OutputOffScreenCanvas = canvasEl.transferControlToOffscreen();
            const inputTransform = new InstrumentedTransformStream({
                name: 'input',
                transform(frame, controller) {
                  if (closeHack) {
                    framesToClose[frame.timestamp] = frame;
                  }  
                  controller.enqueue(frame);
                }
            });
            const mediaStream = evt.streams[0];
            let inputTrack = mediaStream.getVideoTracks()[0];
            const processor = new MediaStreamTrackProcessor({ track: inputTrack });
            processor.readable.pipeTo(inputTransform.writable);
            
            let stream = inputTransform.readable;            
            const identityTransform = new TransformStream({
            transform(frame, controller) {
                if (closeHack) {

                    if (framesToClose[frame.timestamp]) {
                    framesToClose[frame.timestamp].close();
                    }
                    framesToClose[frame.timestamp] = frame;
                }
                controller.enqueue(frame);
                }
            });
            
            transformWorker.postMessage({
                type: 'start',
                config,
                streams: {
                  input: stream,
                  output: identityTransform.writable,
                  OutputOffScreenCanvas: OutputOffScreenCanvas,
                }
              }, [stream, identityTransform.writable, OutputOffScreenCanvas]);
              stream = identityTransform.readable;


            const closeTransform = new InstrumentedTransformStream({
                name: 'final',
                transform(frame, controller) {
                  
                  if (closeHack) {
    
                    transformWorker.postMessage({
                      type: 'closeframe',
                      timestamp: frame.timestamp
                    });
                    const inputFrame = framesToClose[frame.timestamp];
                    if (inputFrame) {
                      if (inputFrame !== frame) {
                        inputFrame.close();
                      }
                      delete framesToClose[frame.timestamp];
                    }
                  }
                  controller.enqueue(frame);
                }
            });
    
    
            stream = stream.pipeThrough(closeTransform);
              
            const outputFramesToTrack = new MediaStreamTrackGenerator({ kind: 'video' });
            stream.pipeTo(outputFramesToTrack.writable);
            document.getElementById('video').srcObject = new MediaStream([outputFramesToTrack]);
    

        }


    });

    
    return pc;
}

function negotiate() {
    return pc.createOffer(
            {
                iceRestart: true,
                offerToReceiveVideo: true,
                offerToReceiveAudio: true
            })
        .then(function(offer) {
        return pc.setLocalDescription(sdpForceStereoAudio(offer));
    }).then(function() {
        // wait for ICE gathering to complete
        return new Promise(function(resolve) {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(function() {
        var offer = pc.localDescription;

        const codec = document.getElementById('video-codec').value;
        if (codec !== 'default') {
            offer.sdp = sdpFilterCodec('video', codec, offer.sdp);
        }

        const input_video_name = document.getElementById('video-selection');
        document.getElementById('offer-sdp').textContent = offer.sdp;
        return fetch('http://127.0.0.1:8080/offer', {
            body: JSON.stringify({
                PlayFile: input_video_name.value,
                sdp: offer.sdp,
                type: offer.type,
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then(function(response) {
        return response.json();
    }).then(function(answer) {
        document.getElementById('answer-sdp').textContent = answer.sdp;
        return pc.setRemoteDescription(answer);
    }).catch(function(e) {
        console.error(e);
        alert(e);
    });
}


async function SendStats() {
    const scale = document.getElementById("scale").value;
    const model_name = document.getElementById('model-name').value;
    const IntervalPeriod = document.getElementById("interval").value;
    const architecture = document.getElementById("architecture").value;
    const backend = document.getElementById("backend").value;

    const stats = {
        jitterArray: jitterArray,
        freezeCountArray: freezeCountArray,
        framesDecodedArray: framesDecodedArray,
        framesPerSecondArray: framesPerSecondArray,
        jitterBufferDelayArray: jitterBufferDelayArray,
        jitterBufferEmittedCountArray: jitterBufferEmittedCountArray,
        packetsLostArray: packetsLostArray,
        totalFreezesDurationArray: totalFreezesDurationArray,
        totalInterFrameDelayArray: totalInterFrameDelayArray,
        totalDecodeTimeArray: totalDecodeTimeArray,
        totalAssemblyTimeArray: totalAssemblyTimeArray,
        totalPausesDurationArray: totalPausesDurationArray,
        totalProcessingDelayArray: totalProcessingDelayArray,
        totalSquaredInterFrameDelayArray: totalSquaredInterFrameDelayArray,
        Bandwidth: BandwidthArray,
    };

    const config = {
        scale:scale,
        model_name:model_name,
        IntervalPeriod:IntervalPeriod,
        architecture:architecture,
        backend: backend,
    }
  
    fetch('http://127.0.0.1:5000/stat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({stats, config}),
    })
      .then(response => response.text())
      .then(data => console.log("Server response:", data))
      .catch(error => console.error('Error:', error));


}
let firsttime = true;
async function SendHardware() {
    const scale = document.getElementById("scale").value;
    const model_name = document.getElementById('model-name').value;
    const IntervalPeriod = document.getElementById("interval").value;
    const architecture = document.getElementById("architecture").value;
    const backend = document.getElementById("backend").value;
    const first_time = firsttime;
    const config = {
        first_time:first_time,
        scale:scale,
        model_name:model_name,
        IntervalPeriod:IntervalPeriod,
        architecture:architecture,
        backend: backend,
    }
    firsttime = false;

    fetch('http://127.0.0.1:5000/systeminfo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({config}),
    })
      .then(response => response.text())
      .then(data => console.log(""))
      .catch(error => console.error('Error:', error));
}
async function SendTiming(wallms_stats) {
    
    const scale = document.getElementById("scale").value;
    const model_name = document.getElementById('model-name').value;
    const IntervalPeriod = document.getElementById("interval").value;
    const architecture = document.getElementById("architecture").value;
    const backend = document.getElementById("backend").value;
    
    const config = {
        scale:scale,
        model_name:model_name,
        IntervalPeriod:IntervalPeriod,
        architecture:architecture,
        backend: backend,
    }

    fetch('http://127.0.0.1:5000/timing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({wallms_stats, config}),
      })
        .then(response => response.text())
        .then(data => console.log("Server response:", data))
        .catch(error => console.error('Error:', error));    

}


function start() {
    
    document.getElementById('start-button').style.display = 'none';

    pc = createPeerConnection();
    InProgress = true;

    document.getElementById('media-section').style.display = 'block';

    pc.restartIce();
    setTimeout(negotiate, 100);

    
    document.getElementById('stop-button').style.display = 'inline-block';

    document.getElementById("webrtc-stats-section").hidden = false;
    
    if (!document.getElementById('toggle-lowres').checked){
        document.getElementById("video").style.visibility = "hidden";
        document.getElementById("video").style.width = "0px";
        document.getElementById("video").style.height = "0px";
        document.querySelector('#media-section h2').style.display = 'none';
    }
    


}

async function stop() {

    Finished = true;
    document.getElementById('webrtc-stats-section').hidden = true;
    document.getElementById("stat-chart").style.display = "block";
    document.getElementById('stop-button').style.display = 'none';
    document.getElementById('processing-stats').hidden = false;
 
    document.querySelector('.chart-container').hidden = false; // reveal first one
    document.getElementById('stats-chart').style.display = 'block'; // ensure canvas is visible
    
    document.getElementById('stats-section').hidden = false; // processing + chart

    if (Architecture == 'MultiThread')
        transformWorker.postMessage({ type: 'stop' });
    else if(Architecture == 'SingleThread')
        populateStatsTablePerformance()

    await SendStats();
    
    
    if (dc) {
        dc.close();
    }

    // close transceivers
    if (pc.getTransceivers) {
        pc.getTransceivers().forEach(function(transceiver) {
            if (transceiver.stop) {
                transceiver.stop();
            }
        });
    }

    // close local audio / video
    pc.getSenders().forEach(function(sender) {
        sender.track.stop();
    });

    // close peer connection
    setTimeout(function() {
        pc.close();
    }, 500);


}

function sdpForceStereoAudio(localOffer){
    localOffer.sdp = localOffer.sdp.replace("useinbandfec=1", "useinbandfec=1; stereo=1");
    return localOffer;
}

function sdpFilterCodec(kind, codec, realSdp) {
    var allowed = []
    var rtxRegex = new RegExp('a=fmtp:(\\d+) apt=(\\d+)\r$');
    var codecRegex = new RegExp('a=rtpmap:([0-9]+) ' + escapeRegExp(codec))
    var videoRegex = new RegExp('(m=' + kind + ' .*?)( ([0-9]+))*\\s*$')
    
    var lines = realSdp.split('\n');

    var isKind = false;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=' + kind + ' ')) {
            isKind = true;
        } else if (lines[i].startsWith('m=')) {
            isKind = false;
        }

        if (isKind) {
            var match = lines[i].match(codecRegex);
            if (match) {
                allowed.push(parseInt(match[1]));
            }

            match = lines[i].match(rtxRegex);
            if (match && allowed.includes(parseInt(match[2]))) {
                allowed.push(parseInt(match[1]));
            }
        }
    }

    var skipRegex = 'a=(fmtp|rtcp-fb|rtpmap):([0-9]+)';
    var sdp = '';

    isKind = false;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=' + kind + ' ')) {
            isKind = true;
        } else if (lines[i].startsWith('m=')) {
            isKind = false;
        }

        if (isKind) {
            var skipMatch = lines[i].match(skipRegex);
            if (skipMatch && !allowed.includes(parseInt(skipMatch[2]))) {
                continue;
            } else if (lines[i].match(videoRegex)) {
                sdp += lines[i].replace(videoRegex, '$1 ' + allowed.join(' ')) + '\n';
            } else {
                sdp += lines[i] + '\n';
            }
        } else {
            sdp += lines[i] + '\n';
        }
    }

    return sdp;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

let Rebuffering_array = [];
let rebufferingStartTime = 0;
let totalRebufferingTime = 0;

async function init_canvas() {

    const scale = document.getElementById("scale").value;
    const input_video_resoltion = document.getElementById('video-resolution');

    input_video_width = resolutions[input_video_resoltion.value].width
    input_video_height = resolutions[input_video_resoltion.value].height

    canvasEl.width = input_video_width * scale;
    canvasEl.height = input_video_height * scale;
    canvasEl.style.width = `${canvasEl.width}px`;
    canvasEl.style.height = `${canvasEl.height}px`;
}

async function init_alphaChannel(){
    const scale = document.getElementById("scale").value;
    alphaChannel = tf.ones([1,input_video_height*scale, input_video_width*scale, 1]);
}

async function init_webgl() {

    const scale = document.getElementById("scale").value;
    gl = getWebGLRenderingContext(canvasEl);
    if (tf.findBackendFactory('webgl')) {
        tf.removeBackend('webgl');
    }
    tf.registerBackend('webgl', () => {
        return new tf.MathBackendWebGL(
            new tf.GPGPUContext(gl));
    });
    tf.setBackend('webgl');
    webglObj = new MaskStep(gl);
    webgl_texture_config = { width: input_video_width * scale , height: input_video_height * scale};
}

async function init_webgpu() {

    const customBackendName = 'custom-webgpu';
  
    const kernels = tf.getKernelsForBackend('webgpu');
    kernels.forEach(kernelConfig => {
      const newKernelConfig = { ...kernelConfig, backendName: customBackendName };
      tf.registerKernel(newKernelConfig);
    });
  
    adapter = await navigator.gpu.requestAdapter();
    device = await adapter.requestDevice({
        requiredFeatures: ["timestamp-query"],
    });
    tf.registerBackend(customBackendName, async () => {
      return new tf.WebGPUBackend(device);
    });
    await tf.setBackend(customBackendName);
  
    context = canvasEl.getContext('webgpu');
    presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    presentationSize = [
      canvasEl.width,
      canvasEl.height,
    ];
  
    context.configure({
      device,
      size: presentationSize,
      format: presentationFormat,
      alphaMode: 'opaque',
    });
  
    pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: VERTEX_SHADER,
        }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({
          code: PIXEL_SHADER,
        }),
        entryPoint: 'main',
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  
    sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });
  
    sizeParams = {
      width: canvasEl.width,
      height: canvasEl.height,
    };
  
    sizeParamBuffer = device.createBuffer({
      size: 2 * Int32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  
    device.queue.writeBuffer(sizeParamBuffer, 0, new Int32Array([sizeParams.width, sizeParams.height]));
}


async function SendFrame(Buffer,FrameId) {
    const scale = document.getElementById("scale").value;
    const model_name = document.getElementById('model-name').value;
    const resolution = String(canvasEl.width) + "x" + String(canvasEl.height);
    const architecture = 'SingleThread';
    const backend = selectBackend.value;

    const metadata = JSON.stringify({ FrameId, resolution, scale, model_name, architecture, backend});

    const formData = new FormData();
    formData.append("metadata", metadata);
    formData.append("file", new Blob([Buffer], { type: "application/octet-stream" }));

    fetch('http://127.0.0.1:5000/FrameUpload', {
      method: 'POST',
      body: formData,
    })
      .then(response => response.text())
      .then(data => console.log(data))
      .catch(error => console.error('Error:', error));

}


async function WebGl_Prediction() {
    if (!video.paused && !video.ended && document.getElementById('stop-button').style.display != 'none') {

        if (lastFrameTime !== video.currentTime) {
        const timingInfo = await tf.time(async () => {
            // Measure time before and after prediction
            const input_tensor = await tf.browser.fromPixels(video);         
            
            const tensor1 = await tf.expandDims(input_tensor, 0);
            const tensor2 = await tf.cast(tensor1, 'float32');
            const tensor3 = await tf.div(tensor2, 255);
        
            // Step 4: Get the output from the model
            const outputTensor = await Model.predict(tensor3);

            const tensor4 = await tf.concat([outputTensor, alphaChannel], 3);

            const data = tensor4.dataToGPU({customTexShape: [webgl_texture_config.height, webgl_texture_config.width]});
            const result = webglObj.process(webgl_texture_config , createTexture(
            gl, data.texture, webgl_texture_config.width, webgl_texture_config.height)); // the second one is of type GlTextureImpl

            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, result.framebuffer_);
            gl.blitFramebuffer(
                0, 0, webgl_texture_config.width, webgl_texture_config.height, 0, webgl_texture_config.height, webgl_texture_config.width, 0, gl.COLOR_BUFFER_BIT,
                gl.NEAREST);



                if(save_frames_check == true){
                    const safeOutput = outputTensor.clone();  
                    (async () => {
                        const Buffer = await safeOutput.data();
                        SendFrame(Buffer, frame_upsampled);
                        safeOutput.dispose();
                    })();

                }

            input_tensor.dispose();
            tensor1.dispose();
            tensor2.dispose();
            tensor3.dispose();
            tensor4.dispose();
            outputTensor.dispose();
            data.tensorRef.dispose();

            });
            
            wallms_times.push(timingInfo.wallMs);
            lastFrameTime = video.currentTime;
    }
        requestAnimationFrame(WebGl_Prediction);
    }
}

async function WebGPU_Prediction() {
    if (!video.paused && !video.ended && document.getElementById('stop-button').style.display != 'none') {

        if (lastFrameTime !== video.currentTime) {

            const timingInfo = await tf.time(async () => {
                
                const input_tensor = await tf.browser.fromPixels(video);
      
                const tensor1 = await tf.expandDims(input_tensor, 0);
                const tensor2 = await tf.cast(tensor1, 'float32');
                const tensor3 = await tf.div(tensor2, 255);
            
                const outputTensor = await Model.execute(tensor3);

                const tensor4 = await tf.concat([outputTensor, alphaChannel], 3);
                const data = await tensor4.dataToGPU();

                const uniformBindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    {
                    binding: 1,
                    resource: {
                        buffer: data.buffer,
                    }
                    },
                    {
                    binding: 2,
                    resource: {
                        buffer: sizeParamBuffer,
                    }
                    }
                ],
                });
            
                const commandEncoder = device.createCommandEncoder();
                const textureView = context.getCurrentTexture().createView();
            
                const renderPassDescriptor = {
                colorAttachments: [
                    {
                    view: textureView,
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                    },
                ],
                };
            
                const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
                passEncoder.setPipeline(pipeline);
                passEncoder.setBindGroup(0, uniformBindGroup);
                passEncoder.draw(6, 1, 0, 0);
                passEncoder.end();
                device.queue.submit([commandEncoder.finish()]);

                if(save_frames_check == true){
                    const safeOutput = outputTensor.clone();  
                    (async () => {
                        const Buffer = await safeOutput.data();
                        SendFrame(Buffer, frame_upsampled);
                        safeOutput.dispose();
                    })();

                }

                input_tensor.dispose();
                tensor1.dispose();
                tensor2.dispose();
                tensor3.dispose();
                tensor4.dispose();
                outputTensor.dispose();
                data.tensorRef.dispose();
                
                lastFrameTime = video.currentTime;
                frame_upsampled++;
        });
        wallms_times.push(timingInfo.wallMs);
    }
       requestAnimationFrame(WebGPU_Prediction);
    }
}

video.addEventListener('play', () => {
    if (Architecture == 'SingleThread'){
        if (selectBackend.value == 'webgpu'){
            requestAnimationFrame(WebGPU_Prediction);
        }
        else if(selectBackend.value == 'webgl'){
            requestAnimationFrame(WebGl_Prediction);
        }
    }
    else if(Architecture == 'MultiThread'){
        console.log('multi-threaded!')
    }

});


async function updateModels() {
    const modelSelect = document.getElementById("model-name");
    
    modelSelect.innerHTML = "";
    const cfg = await loadModelsConfig();
    const scale = document.getElementById("scale").value;
    

    const availableModels = (cfg.modelsByScale?.[scale] || []).map(m => ({ value: m, text: m }));
    
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select a model";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    modelSelect.appendChild(defaultOption);
    
    availableModels.forEach(model => {
        const option = document.createElement("option");
        option.value = model.value;
        option.textContent = model.text;
        modelSelect.appendChild(option);
        
    });

    const defaultFromCfg = cfg.defaultModelByScale?.[scale] ?? "";
    // only select it if it exists in the options we just populated
    const hasDefault = availableModels.some(m => m.value === defaultFromCfg);

    if (hasDefault) {
    modelSelect.value = defaultFromCfg;
    } else if (availableModels.length > 0) {
    // fallback: choose first real model (not the disabled "Select a model")
    modelSelect.value = availableModels[0].value;
    } else {
    // nothing available; keep the "Select a model" placeholder selected
    modelSelect.value = "";
    }
    // Optional: Trigger change event if needed
    modelSelect.dispatchEvent(new Event('change'));
}

function updateVideos() {
    const videoCatalogByRes = {
    '270p': [
        { value: 'BigBuckBunny.mp4',   text: 'Big Buck Bunny' },
        { value: 'TalkingHeads.mp4',   text: 'Talking Heads' },
    ],
    };
    const resEl = document.getElementById('video-resolution');
    const videoSelect = document.getElementById('video-selection');
    const selectedRes = resEl.value;

    // clear current options
    videoSelect.innerHTML = '';

    const list = videoCatalogByRes[selectedRes] || [];
    if (list.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No videos for this resolution';
        opt.disabled = true;
        opt.selected = true;
        videoSelect.appendChild(opt);
        return;
    }

    // populate options for the selected resolution
    list.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.value;
        opt.textContent = v.text;
        videoSelect.appendChild(opt);
    });
}

function pingElevaluationServer(stats = {}, config = {}) {

    return fetch('http://127.0.0.1:5000/health', {
      method: 'POST',
    })
    .then(response => true)
    .catch(error => {
      alert('Unable to reach the evaluation server. Please first run the evaluation server.');
      return false;
    });


}

document.getElementById("setup-button").addEventListener("click", async function() {

    document.getElementById("architecture").disabled = true;
    document.getElementById("backend").disabled = true;
    document.getElementById("scale").disabled = true;
    document.getElementById("model-name").disabled = true;
    document.querySelectorAll('.config-group input, .config-group select, .config-group button')
    .forEach(el => el.disabled = true);
    document.getElementById("interval").disabled = true;
    document.getElementById("video-resolution").disabled = true;
    document.getElementById("video-selection").disabled = true;
    document.getElementById("video-codec").disabled = true;

    document.getElementById("start-button").disabled = false;
    if(document.getElementById('save-frame').checked || document.getElementById('send-metrics').checked){
        await pingElevaluationServer();
    }

    const modelSelect = document.getElementById("model-name");
    save_frames_check = document.getElementById('save-frame').checked;
    const scale = document.getElementById("scale").value;
    const input_video_resoltion = document.getElementById('video-resolution');
    model_path = `Models/${scale}/${modelSelect.value}/${input_video_resoltion.value}/model.json`; 

    console.log('Model path is: ', model_path);

    this.disabled = true;
    Architecture = document.getElementById("architecture").value;
    if(Architecture == 'SingleThread'){
        if (selectBackend.value == 'webgpu'){
            await init_canvas();
            await init_webgpu();
            Model = await tf.loadGraphModel(model_path);
            await init_alphaChannel();
        }
        
        else if(selectBackend.value == 'webgl'){
            await init_canvas();
            await init_webgl();
            Model = await tf.loadGraphModel(model_path);
            await init_alphaChannel();
        }
        console.log(Model)
    }
    
    else if(Architecture == 'MultiThread'){
        await init_canvas();
        //await setupWorker();
        
        
    }
    const IntervalPeriod = document.getElementById("interval").value;
    await SetReportInterval(IntervalPeriod);

});

