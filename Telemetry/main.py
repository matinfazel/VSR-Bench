from flask import Flask, json, request, render_template_string
import os
from flask_cors import CORS
import csv 
import numpy as np
import cv2
import time
import pwd
import subprocess
import pynvml

UNIT="vsr-chrome"
user = os.environ.get("SUDO_USER") or os.environ.get("LOGNAME") or os.environ.get("USER") or "ubuntu"
uid  = pwd.getpwnam(user).pw_uid
print(f"Monitoring cgroup for user: {user}, uid: {uid}")
CG = f"/user.slice/user-{uid}.slice/user@{uid}.service/app.slice/{UNIT}.service"
cpu=f"/sys/fs/cgroup{CG}/cpu.stat"
memfile=f"/sys/fs/cgroup{CG}/memory.current"
NPROC=int(subprocess.run('nproc', shell=True, capture_output=True, text=True).stdout.strip())

def get_gpu_memory():
    pynvml.nvmlInit()
    handle = pynvml.nvmlDeviceGetHandleByIndex(0)
    procs = pynvml.nvmlDeviceGetComputeRunningProcesses(handle)
    for proc in procs:
        if 'vsr-profile' in pynvml.nvmlSystemGetProcessName(proc.pid):
            pynvml.nvmlShutdown()
            return proc.usedGpuMemory // (1024*1024)

def get_gpu_power():
    """Use NVIDIA ML library - more reliable than sysfs"""
    pynvml.nvmlInit()
    handle = pynvml.nvmlDeviceGetHandleByIndex(0)
    power_mw = pynvml.nvmlDeviceGetPowerUsage(handle)
    GPU_eng = power_mw / 1000.0
    enforced_watts = pynvml.nvmlDeviceGetEnforcedPowerLimit(handle) // 1000
    GPU_eng_util = (GPU_eng / enforced_watts) * 100 
    pynvml.nvmlShutdown()
    return GPU_eng, GPU_eng_util

pcpuusr = 0
pcpusys = 0
Eprev = 0
tprev = 0
pts = 0

def imsave(img, img_path):
    img = np.squeeze(img)
    if img.ndim == 3:
        img = img[:, :, [2, 1, 0]]
    cv2.imwrite(img_path, img)

app = Flask(__name__)
CORS(app)

@app.route('/systeminfo', methods=['POST'])
def monitor_system():
    global pcpuusr, pcpusys, Eprev, tprev, pts
    data = request.get_json()
    tnow = time.time()
    for l in open(cpu):
        if l.startswith("user_usec"):
            cpuusr = int(l.split()[1])
        if l.startswith("system_usec"):
            cpusys = int(l.split()[1])

    mem = int(open(memfile).read())

    if data['config']['first_time']:
        cpu_pct = 0
    else:
        du = cpuusr - pcpuusr 
        ds = cpusys - pcpusys
        dt_s = (tnow - pts)

        cpu_pct = round(100.0*(du+ds)/((dt_s)*1e6*NPROC), 2)

    pts = tnow

    pcpuusr = cpuusr
    pcpusys = cpusys
    tprev=tnow

    result = subprocess.run(['nvidia-smi', 'pmon', '-c', '1'], 
                          capture_output=True, text=True, check=True)
    nvidia_line = next((line for line in result.stdout.split('\n') if 'vsr-profile' in line), '')

    parts = nvidia_line.split()
    sm_util, gpu_util = parts[3], parts[4] if len(parts) > 4 else ('', '')

    GPU_mem = get_gpu_memory()
    GPU_eng, GPU_eng_util = get_gpu_power()

    stats_energy_path = f"HardwareUsage/{data['config']['scale']}/{data['config']['model_name']}/{data['config']['architecture']}/{data['config']['backend']}"
    os.makedirs(stats_energy_path, exist_ok=True)
    csv_file = os.path.join(stats_energy_path, 'performance.csv')

    row_data = {
            'timestamp': time.time(),
            'sm_util': sm_util,
            'gpu_util': gpu_util,
            'cpu_pct': cpu_pct,
            'MEM': mem,
            'GPU_mem': GPU_mem,
            'NPROC': NPROC,
            'GPU_eng': GPU_eng,
            'GPU_eng_util': GPU_eng_util,
        }
    file_exists = os.path.isfile(csv_file)
    with open(csv_file, 'a', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=row_data.keys())
        
        if not file_exists:
            writer.writeheader()
        
        writer.writerow(row_data)
        
    return row_data

@app.route('/FrameUpload', methods=['POST'])
def upload_data():

    metadata = request.form.get("metadata")
    metadata = json.loads(metadata)
    FrameId = int(metadata['FrameId'])
    resolution = metadata['resolution']
    scale = metadata['scale']
    model_name = metadata['model_name']
    width, height = resolution.split('x')
    architecture  = metadata['architecture']
    backend  = metadata['backend']

    dir_path = f"RawFrames/{scale}/{model_name}/{resolution}/{architecture}/{backend}"
    os.makedirs(dir_path, exist_ok=True)

    file = request.files.get("file")  
    binary_data = file.read()

    float_data = np.frombuffer(binary_data, dtype=np.float32)
    tensor = float_data.reshape((int(height), int(width), 3))

    img = np.clip(tensor, 0, 1)
    img_sr = np.uint8((img * 255.0 ).round())

    imsave(img_sr, f'{dir_path}/{FrameId}.png')

    return 'Data received and saved successfully.', 200

@app.route('/stat', methods=['POST'])
def say_static():
    data = request.get_json()
    config = data['config']
    stats = data['stats']

    dir_path = f"Stats/{config['scale']}/{config['model_name']}/Interval_{config['IntervalPeriod']}/{config['architecture']}/{config['backend']}"
    os.makedirs(dir_path, exist_ok=True)

    csv_filename = os.path.join(dir_path, "stats.csv")

    rows = zip(*stats.values())

    with open(csv_filename, mode="w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(stats.keys())
        writer.writerows(rows)

    return '200'

@app.route('/timing', methods=['POST'])
def say_timing():
    data = request.get_json()
    config = data['config']
    wallms_timing = data['wallms_stats']
    dir_path = f"Timing/{config['scale']}/{config['model_name']}/{config['architecture']}/{config['backend']}"
    os.makedirs(dir_path, exist_ok=True)

    wallms_filename = os.path.join(dir_path, "TotalTime.json")


    with open(wallms_filename, mode="w") as file:
        json.dump(wallms_timing, file, indent=2)

    return '200'


@app.route('/upload', methods=['POST'])
def upload():
    file = request.files.get('file')
    if not file:
        return 'No file uploaded.', 400

    # Save file with its original filename
    file.save(f"./{file.filename}")
    return 'File received and saved.', 200


@app.route('/health', methods=['POST'])
def health():
    return '200'

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)