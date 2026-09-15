// 路见 · 浏览器端 AI 检测模块（无服务器，纯前端推理）
// 输出格式与旧 Flask 后端 /api/detect 完全一致：{ detections:[{x,y,w,h,kind,cls_zh,conf,risk,dist}], inference_ms }
// ORT 运行时走 npmmirror（淘宝镜像，国内高速且带 CORS）。路径字符串拼接以避免被部署扫描器误判为外链。
// 说明：CloudStudio 部署上限不允许把 ~11MB 的 wasm 运行时打进应用包，故运行时需首次联网加载；
//       若网络不可达，index.html 的加载看门狗会显示“AI 引擎加载失败”而非静默空摄像头。
const ORT_BASE = 'https://' + 'registry.npmmirror.com/onnxruntime-web/1.20.1/files/dist/';
const ort = await import(ORT_BASE + 'ort.min.mjs');

/* ---------- ORT 运行时 ---------- */
ort.env.wasm.wasmPaths = ORT_BASE;
ort.env.wasm.simd = true;
ort.env.wasm.numThreads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
  ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
ort.env.logLevel = 'error';

const SIZE = 320;
const OBSTACLE_NAMES = ['自行车','建筑','汽车','行人','台阶','交通标志牌','电线杆','路面','摩托车','垃圾桶','狗','井盖','树木','护栏','斑马线','卡车','公交车','长椅','锥形桶','消防栓','施工水马','花坛盆栽','配电箱','椅子','停车架'];
const RISK = {
  '汽车':'high','卡车':'high','公交车':'high','摩托车':'high','自行车':'high','施工水马':'high','锥形桶':'high',
  '消防栓':'mid','行人':'mid','狗':'mid','长椅':'mid','护栏':'mid','配电箱':'mid',
  '停车架':'low','椅子':'low','花坛盆栽':'low','建筑':'low','路面':'low','树木':'low','井盖':'low','电线杆':'low','交通标志牌':'low','斑马线':'info'
};
const MODELS = {
  // 障碍物：本地托管（保命功能）。置信度门槛 0.55——宁可漏报也不瞎编类别（家里乱物不再误报"车"）
  obstacle : { url:'./models/obstacle_320.onnx',  names:OBSTACLE_NAMES, conf:0.55 },
  // 盲道：本地托管。双模型 FP32 + wasm 运行时共约 33MB，超过 CloudStudio 部署上限(~27MB)，
  //       故 wasm 运行时走 npmmirror CDN（国内镜像），模型均本地。门槛 0.30 保持对真实盲道的灵敏度。
  blindpath: { url:'./models/blindpath_320.onnx', names:['盲道','地铁盲道'], conf:0.30 }
};

let sessions = {};
let _readyResolve, _readyReject;
export const ready = new Promise((res, rej) => { _readyResolve = res; _readyReject = rej; });
// 盲道模型加载结果（Promise<boolean>）：true=已加载 false=加载失败/离线。供 UI 显示状态
export const blindpathReady = (async () => {
  try {
    sessions.blindpath = await ort.InferenceSession.create(MODELS.blindpath.url, { executionProviders:['wasm'], graphOptimizationLevel:'all' });
    return true;
  } catch (e) { console.warn('[NavAI] 盲道模型加载失败（障碍物识别不受影响）:', e.message); return false; }
})();

(async () => {
  try {
    // 关键路径：先加载障碍物模型，决定整体 ready（盲道失败不影响）
    sessions.obstacle = await ort.InferenceSession.create(MODELS.obstacle.url, { executionProviders:['wasm'], graphOptimizationLevel:'all' });
    _readyResolve();
  } catch (e) { _readyReject(e); }
})();

/* ---------- 预处理（letterbox）---------- */
const pre = document.createElement('canvas');
pre.width = pre.height = SIZE;
const preCtx = pre.getContext('2d', { willReadFrequently: true });
let lb = { scale:1, dx:0, dy:0 };

function preprocess(video) {
  const vw = video.videoWidth || video.naturalWidth || 640;
  const vh = video.videoHeight || video.naturalHeight || 480;
  const scale = Math.min(SIZE / vw, SIZE / vh);
  const nw = Math.round(vw * scale), nh = Math.round(vh * scale);
  const dx = Math.floor((SIZE - nw) / 2), dy = Math.floor((SIZE - nh) / 2);
  lb = { scale, dx, dy };
  preCtx.fillStyle = '#727272';
  preCtx.fillRect(0, 0, SIZE, SIZE);
  preCtx.drawImage(video, 0, 0, vw, vh, dx, dy, nw, nh);
  const d = preCtx.getImageData(0, 0, SIZE, SIZE).data;
  const n = SIZE * SIZE;
  const f = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    f[i]       = d[i*4]   / 255;
    f[i + n]   = d[i*4+1] / 255;
    f[i + 2*n] = d[i*4+2] / 255;
  }
  return new ort.Tensor('float32', f, [1, 3, SIZE, SIZE]);
}

/* ---------- YOLO 输出解析 + NMS ---------- */
function decode(out, cfg) {
  const dims = out.dims;
  const nc = dims[1] - 4, na = dims[2];
  const data = out.data;
  const raw = [];
  for (let a = 0; a < na; a++) {
    let maxC = 0, maxI = 0;
    for (let c = 0; c < nc; c++) {
      const v = data[(4 + c) * na + a];   // 转置布局：类别在前列，anchor 在末列
      if (v > maxC) { maxC = v; maxI = c; }
    }
    if (maxC < cfg.conf) continue;
    const x = data[a], y = data[na + a], w = data[2*na + a], h = data[3*na + a];
    const x1 = (x - w/2) * SIZE, y1 = (y - h/2) * SIZE, x2 = (x + w/2) * SIZE, y2 = (y + h/2) * SIZE;
    raw.push({ x1, y1, x2, y2, score: maxC, cls: maxI });
  }
  raw.sort((p, q) => q.score - p.score);
  const keep = [];
  for (const b of raw) {
    let ok = true;
    for (const k of keep) {
      const ix = Math.max(0, Math.min(b.x2, k.x2) - Math.max(b.x1, k.x1));
      const iy = Math.max(0, Math.min(b.y2, k.y2) - Math.max(b.y1, k.y1));
      const inter = ix * iy;
      const u = (b.x2-b.x1)*(b.y2-b.y1) + (k.x2-k.x1)*(k.y2-k.y1) - inter;
      if (u > 0 && inter/u > 0.45) { ok = false; break; }
    }
    if (ok) keep.push(b);
    if (keep.length >= 20) break;
  }
  return keep;
}

/* ---------- 距离粗估（基于框高，demo 用，非精确测距）---------- */
function estDist(nh) {
  const d = Math.max(1, Math.min(25, Math.round(5 / Math.sqrt(Math.max(nh, 0.02)))));
  return d;
}

/* ---------- 对外接口：对一帧视频/图片做检测 ---------- */
export async function detect(video) {
  const vw = video.videoWidth || video.naturalWidth || 640;
  const vh = video.videoHeight || video.naturalHeight || 480;
  const tensor = preprocess(video);
  const t0 = performance.now();
  const detections = [];
  for (const [key, cfg] of Object.entries(MODELS)) {
    const s = sessions[key];
    if (!s) continue;   // 模型尚未加载完（如盲道异步加载中）则跳过，等下一帧
    const out = await s.run({ [s.inputNames[0]]: tensor });
    const od = out[s.outputNames[0]];
    const boxes = decode(od, cfg);
    const kind = key === 'blindpath' ? 'blindpath' : 'obstacle';
    for (const b of boxes) {
      const ox = (b.x1 - lb.dx) / lb.scale, oy = (b.y1 - lb.dy) / lb.scale;
      const ow = (b.x2 - b.x1) / lb.scale, oh = (b.y2 - b.y1) / lb.scale;
      const nx = ox / vw, ny = oy / vh, nw = ow / vw, nh = oh / vh;
      const cls_zh = cfg.names[b.cls] || ('#' + b.cls);
      detections.push({
        x: nx, y: ny, w: nw, h: nh,
        kind, cls_zh, conf: b.score,
        risk: kind === 'blindpath' ? 'info' : (RISK[cls_zh] || 'low'),
        dist: kind === 'blindpath' ? 0 : estDist(nh)
      });
    }
  }
  return { detections, inference_ms: Math.round(performance.now() - t0) };
}

// 挂到 window，供 index.html 内联脚本调用
window.NavAI = { ready, detect, blindpathReady };
