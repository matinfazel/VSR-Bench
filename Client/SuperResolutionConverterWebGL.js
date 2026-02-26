'use strict';
importScripts('Packages/tfjs.js');

importScripts('WebGLUtils/gl-class.js');
importScripts('WebGLUtils/gl-shaders.js');
importScripts('WebGLUtils/gl-util.js');
importScripts('WebGLUtils/ui-util.js');

/**
 * Returns a transformer for a TransformStream that converts an RGBX VideoFrame
 * to shades of grey.
 *
 * The transformer uses pure JavaScript.
*/
// let test;


async function SendFrame(Buffer, scale, model_name, resolution, FrameId) {

  const architecture = 'MultiThread';
  const backend = 'webgl';
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

async function SuperResolutionWebGL(config, OutputOffScreenCanvas) {

  let gl = getWebGLRenderingContext(OutputOffScreenCanvas);
  if (tf.findBackendFactory('webgl')) {
    tf.removeBackend('webgl');
  }

  tf.registerBackend('webgl', () => {
    return new tf.MathBackendWebGL(
        new tf.GPGPUContext(gl));
  });

  tf.setBackend('webgl');
  
  const SR_Model = await tf.loadGraphModel(config.Model_Path);

  const applyMask = new MaskStep(gl);
  const frameSize = config.width * config.height * 4;

  const buffer = new Uint8Array(frameSize);
  const alphaChannel = tf.ones([1,config.height*config.scale, config.width*config.scale, 1]);
  const texture_config = { width: config.width * config.scale , height: config.height * config.scale};

  let FrameId = 0;
  return {
    
    async transform(frame, controller) {
      
      FrameId++;
      await frame.copyTo(buffer);

      //tf.tidy( () => {
        const tensor1 = tf.tensor(buffer);
        const tensor2 = tf.reshape(tensor1,[1, config.height, config.width, 4]);
        const tensor3 = tensor2.slice([0, 0, 0, 0], [1, config.height, config.width, 3]);
        const tensor4 = tf.div(tensor3,255);
        const outputTensor = SR_Model.predict(tensor4);
        const tensor5 = tf.concat([outputTensor, alphaChannel], 3) ;

        const data = tensor5.dataToGPU({customTexShape: [config.height  * config.scale, config.width * config.scale]});

        const result = applyMask.process(texture_config , createTexture(
           gl, data.texture, texture_config.width, texture_config.height)); 
           gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
           gl.bindFramebuffer(gl.READ_FRAMEBUFFER, result.framebuffer_);
           gl.blitFramebuffer(
               0, 0, texture_config.width, texture_config.height, 0, texture_config.height, texture_config.width, 0, gl.COLOR_BUFFER_BIT,
               gl.NEAREST);


               if(config.save_frames == true){
                const safeOutput = outputTensor.clone();  
                  (async () => {
                    const Buffer = await safeOutput.data();
                    SendFrame(Buffer, config.scale, config.Model_Name, config.resolution, FrameId)
                    safeOutput.dispose();
                  })();
        
              }
            
        tensor1.dispose();
        tensor2.dispose();
        tensor3.dispose();
        tensor4.dispose();
        tensor5.dispose();
        outputTensor.dispose();
        data.tensorRef.dispose();

    controller.enqueue(frame);
      //});
    }
  };
}