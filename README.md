# 🎬 多平台视频分析器

支持 **抖音 · B站 · YouTube** 的视频分析工具，基于 Flask + yt-dlp + FFmpeg。

## 功能

- **📊 视频分析** — 输入视频链接，分析文案、字幕转录、播放数据，生成内容总结
- **👤 创作者分析** — 输入用户/频道主页链接，获取并总结全部作品
- **🎧 音频提取** — 输入视频链接，提取音频为 MP3 格式
- **🌐 多语言** — 支持中文 / English / 日本語，自动检测浏览器语言
- **🔀 混合平台** — 同时分析来自不同平台的视频链接

## 支持平台

| 平台 | 域名 | 视频分析 | 创作者分析 | 音频提取 |
|------|------|---------|-----------|---------|
| 🎵 抖音 | douyin.com | ✅ | ✅ | ✅ |
| 📺 B站 | bilibili.com | ✅ | ✅ | ✅ |
| ▶️ YouTube | youtube.com | ✅ | ✅ | ✅ |

## 技术栈

- **后端**: Python 3 / Flask
- **视频下载**: yt-dlp
- **音频处理**: FFmpeg
- **前端**: 原生 HTML / CSS / JavaScript（暗色主题 UI）
- **国际化**: 自研 i18n 模块（JSON 语言包 + DOM 属性绑定）

## 快速开始

### 环境要求

- Python 3.8+
- FFmpeg
- yt-dlp

### 安装与运行

```bash
# 安装依赖
pip install flask yt-dlp requests

# 启动
cd douyin-analyzer
python app.py
```

访问 `http://localhost:8860`

### 使用 cookies（可选）

如遇下载失败（地区限制 / 登录验证），在项目根目录放置 `cookies.txt`：

1. 使用浏览器插件（如 Get cookies.txt LOCALLY）导出对应平台的 cookies
2. 保存为 `cookies.txt` 放到项目根目录

## 项目结构

```
douyin-analyzer/
├── app.py                  # Flask 后端（多平台路由 + yt-dlp 封装）
├── templates/
│   └── index.html          # 前端页面
├── static/
│   ├── css/style.css       # 暗色主题样式
│   ├── js/app.js           # 前端交互逻辑
│   ├── js/i18n.js          # 国际化模块
│   └── i18n/
│       ├── zh.json         # 中文
│       ├── en.json         # English
│       └── ja.json         # 日本語
├── downloads/              # 下载文件存储
├── cookies.txt             # (可选) cookies 文件
└── README.md
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/analyze` | POST | 分析视频，`{urls: [...]}` |
| `/api/user` | POST | 分析创作者，`{url: "..."}` |
| `/api/extract-audio` | POST | 提取音频，`{url: "..."}` |
| `/api/task/<id>` | GET | 查询任务状态 |
| `/api/download/<id>/<type>` | GET | 下载文件 |
| `/api/tasks` | GET | 获取所有任务 |
| `/api/platforms` | GET | 获取支持的平台列表 |

## 扩展新平台

1. 在 `app.py` 的 `PLATFORMS` 字典中添加平台配置
2. 在 `static/i18n/*.json` 中添加对应翻译
3. 在 `static/css/style.css` 中添加平台色变量
4. 在前端 `templates/index.html` 添加平台 chip 按钮

## License

MIT
