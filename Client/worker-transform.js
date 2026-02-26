'use strict';

/**
 * Worker that takes a stream of VideoFrame as input and applies requested
 * transformations to it.
 * 
 * Currently available transformations are very basic: delays or H.264
 * encode/decode. H.264 encode/decode was typically adapted from:
 * https://github.com/w3c/webcodecs/pull/583
 * (although note the code does not queue frames onto the
 * VideoEncoder/VideoDecoder but rather relies on streams to handle queueing
 * and backpressure)
 */

importScripts('InstrumentedTransformStream.js');
importScripts('ToRGBXVideoFrameConverter.js');

let started = false;
let encoder;
let decoder;

// TEMP: VideoFrames sent through a TransformStream are serialized (and thus
// cloned) and not transferred for now. This means that they need to be closed
// on both ends, in particular when TransformStream sits across workers.
// Unfortunately, they cannot be closed right away on the sender's end because
// the receiver may not yet have received them. Workaround is to close them at
// the end of the processing.
// For additional context, see https://github.com/whatwg/streams/issues/1187
const framesToClose = {};

self.addEventListener('message', async function(e) {
  if (e.data.type === 'start') {

    InstrumentedTransformStream.resetStats();
    const inputStream = e.data.streams.input;
    const outputStream = e.data.streams.output;
    const OutputOffScreenCanvas = e.data.streams.OutputOffScreenCanvas;

    var config = e.data.config;
    const save_frames = config.save_frames;

    let intermediaryStream = inputStream;

    const toRGBXConverter = new ToRGBXVideoFrameConverter(config);
    const convertToRGBX = new InstrumentedTransformStream(
      Object.assign({ name: 'RGBX Converter' }, toRGBXConverter));
    intermediaryStream = intermediaryStream.pipeThrough(convertToRGBX);

    let SuperResolutionConverter;
    if(config.selected_backend == 'webgpu'){
      importScripts('SuperResolutionConverterWebGPU.js');
      SuperResolutionConverter = await SuperResolutionWebGPU(config, OutputOffScreenCanvas);
    }
    else if(config.selected_backend == 'webgl'){
      importScripts('SuperResolutionConverterWebGL.js');
      SuperResolutionConverter = await SuperResolutionWebGL(config, OutputOffScreenCanvas);
    }

    const SuperResolutionStream = new InstrumentedTransformStream(
      Object.assign({ name: 'SR' }, SuperResolutionConverter));
    intermediaryStream = intermediaryStream.pipeThrough(SuperResolutionStream);

    intermediaryStream
      .pipeThrough(new TransformStream({
        transform(frame, controller) {
          if (config.closeHack) {
            framesToClose[frame.timestamp] = frame;
          }
          controller.enqueue(frame);
        }
      }))
      .pipeTo(outputStream);
  }
  else if (e.data.type === 'stop') {
    const stats = InstrumentedTransformStream.collectStats();
    InstrumentedTransformStream.resetStats();

    self.postMessage({ type: 'stats', stats});
    if (encoder) {
      encoder.close();
      encoder = null;
    }
    if (decoder) {
      decoder.close();
      decoder = null;
    }
  }
  else if (e.data.type === 'collect-stats') {
  const stats = InstrumentedTransformStream.collectStats();
  self.postMessage({ type: 'collect-stats', stats });
}
  else if (e.data.type === 'closeframe') {
    const frame = framesToClose[e.data.timestamp];
    if (frame) {
      frame.close();
      delete framesToClose[e.data.timestamp];
    }
  }
});