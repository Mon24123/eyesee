# EyeSee 路见 · AI 无障碍出行助手

面向视障人群的无障碍出行辅助系统交互原型。页面内的盲道与障碍物检测由浏览器端 ONNX 模型实时推理完成，不依赖服务器。

在线地址：https://mon24123.github.io/eyesee/

## 文件结构

```
eyesee/
├── index.html                        主页面（交互原型 + 端侧推理）
├── nav-ai.mjs                        浏览器端 AI 检测模块（ONNX Runtime Web）
├── models/
│   ├── blindpath_320.onnx            盲道检测模型
│   └── obstacle_320.onnx             障碍物检测模型
├── lujian-blindpath-detect-demo.mp4  检测演示视频
├── assets/                           语音提示等静态资源
└── archive/                          历史版本存档
```

## 本地预览

```bash
python3 -m http.server 8000
```

然后访问 http://localhost:8000

## 说明

- 首次访问需下载约 22MB 模型，加载期间状态栏会显示进度提示。
- ONNX Runtime 运行时首次需联网加载。
- 演示视频仅作为摄像头输入源，画面上的检测框由模型实时推理产生，页面已标注「演示视频 · 技术示意」。
