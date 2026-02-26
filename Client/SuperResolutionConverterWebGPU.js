'use strict';
importScripts('Packages/tfjs.js');
importScripts('Packages/tfjs-backend-webgpu.js');

importScripts('WebGPUUtils/gpu-shaders.js');

async function SendFrame(Buffer, scale, model_name, resolution, FrameId) {

  const architecture = 'MultiThread';
  const backend = 'webgpu';
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

async function SuperResolutionWebGPU(config, OutputOffScreenCanvas) {
    const customBackendName = 'custom-webgpu';
  
    const kernels = tf.getKernelsForBackend('webgpu');
    kernels.forEach(kernelConfig => {
      const newKernelConfig = { ...kernelConfig, backendName: customBackendName };
      tf.registerKernel(newKernelConfig);
    });
  
    let adapter = await navigator.gpu.requestAdapter();
    let device = await adapter.requestDevice({
      requiredFeatures: ["timestamp-query"],//google-chrome-unstable --enable-unsafe-webgpu --enable-features=Vulkan --disable-dawn-features=disallow_unsafe_apis
    });
    tf.registerBackend(customBackendName, async () => {
      return new tf.WebGPUBackend(device);
    });
    await tf.setBackend(customBackendName);
  
    let context = OutputOffScreenCanvas.getContext('webgpu');
    let presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    let presentationSize = [
      OutputOffScreenCanvas.width,
      OutputOffScreenCanvas.height,
    ];
  
    context.configure({
      device,
      size: presentationSize,
      format: presentationFormat,
      alphaMode: 'opaque',
    });
  
    let pipeline = device.createRenderPipeline({
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
  
    let sizeParams = {
      width: OutputOffScreenCanvas.width,
      height: OutputOffScreenCanvas.height,
    };
  
    let sizeParamBuffer = device.createBuffer({
      size: 2 * Int32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  
    device.queue.writeBuffer(sizeParamBuffer, 0, new Int32Array([sizeParams.width, sizeParams.height]));

    const SR_Model = await tf.loadGraphModel(config.Model_Path);
    const alphaChannel = tf.ones([1,config.height*config.scale, config.width*config.scale, 1]);

    const frameSize = config.width * config.height * 4;
    const buffer = new Uint8Array(frameSize);
    
    let FrameId = 0;
  return {
    
    async transform(frame, controller) {

      await frame.copyTo(buffer);
      FrameId++;      

        const tensor1 = tf.tensor(buffer);
        const tensor2 = tf.reshape(tensor1,[1, config.height, config.width, 4]);
        const tensor3 = tensor2.slice([0, 0, 0, 0], [1, config.height, config.width, 3]);
        const tensor4 = tf.div(tensor3,255);
        const outputTensor = await SR_Model.predict(tensor4);
        const tensor5 = tf.concat([outputTensor, alphaChannel], 3) ;

        const data = tensor5.dataToGPU();

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

    }
  };
}