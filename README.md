# 路见｜AI 无障碍通道双向守护

一个用于演示无障碍通道 AI 双向守护系统的静态网站。

## 文件结构

```
lujian-demo/
├── index.html          # 主页面
├── favicon.svg         # 网站图标
├── og.png             # 社交媒体分享图片
└── assets/            # 静态资源目录
    ├── index-DHezgImu.css
    ├── index-BSzK71ck.js
    ├── layout-segment-context-CvOzlKHe.js
    ├── rolldown-runtime-S-ySWqyJ.js
    ├── framework-CXnKph_e.js
    └── RouteJianDemo-Ms2aTLlH.js
```

## 本地测试

使用 Python 启动本地服务器：

```bash
python3 -m http.server 8000
```

然后访问 http://localhost:8000

## 部署到国内平台

### 方案一：腾讯云 COS + CDN

1. 登录腾讯云控制台
2. 创建一个公有读的存储桶
3. 上传所有文件
4. 开启静态网站托管
5. 配置 CDN 加速

### 方案二：阿里云 OSS

1. 登录阿里云控制台
2. 创建 Bucket，设置为公共读
3. 上传所有文件
4. 开启静态网站托管

### 方案三：GitHub Pages + 国内镜像

1. 将文件推送到 GitHub
2. 启用 GitHub Pages
3. 使用国内镜像服务（如 Gitee Pages）

### 方案四：免费国内托管

- Vercel 国内镜像
- Netlify 国内镜像
- 自己的服务器（Nginx/Apache）

## 注意事项

- 所有资源路径已改为相对路径，无需修改
- 已移除 Cloudflare 机器人检测代码
- 支持本地和云端直接部署