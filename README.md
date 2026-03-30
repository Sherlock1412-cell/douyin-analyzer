# 🎵 抖音视频分析器

一个基于 Flask + yt-dlp + FFmpeg 的抖音视频分析工具，支持视频内容分析、作者作品总结和音频提取。

## 功能

- **📊 视频分析** — 输入一个或多个抖音视频链接，分析视频文案、字幕转录、播放数据，生成内容总结
- **👤 作者分析** — 输入抖音用户主页链接，获取该作者所有作品列表并生成创作特点总结
- **🎧 音频提取** — 输入抖音视频链接，提取音频为 MP3 格式并提供下载

## 技术栈

- **后端**: Python 3 / Flask
- **视频下载**: yt-dlp
- **音频处理**: FFmpeg
- **前端**: 原生 HTML / CSS / JavaScript（暗色主题 UI）

## 快速开始

### 环境要求

- Python 3.8+
- FFmpeg
- yt-dlp

### 安装

```bash
# 安装依赖
pip install flask yt-dlp requests

# 启动应用
cd douyin-analyzer
python app.py
```

应用启动后访问 `http://localhost:8860`

### 使用 cookies（可选）

如果遇到下载失败（地区限制 / 登录验证），可以在项目根目录放置 `cookies.txt` 文件：

1. 使用浏览器插件（如 Get cookies.txt LOCALLY）导出抖音 cookies
2. 将导出的文件保存为 `cookies.txt` 放到项目根目录

## 项目结构

```
douyin-analyzer/
├── app.py              # Flask 后端主程序
├── templates/
│   └── index.html      # 前端页面
├── static/
│   ├── css/style.css   # 暗色主题样式
│   └── js/app.js       # 前端交互逻辑
├── downloads/          # 下载文件存储（自动创建）
└── cookies.txt         # (可选) 抖音 cookies 文件
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/analyze` | POST | 分析视频，传入 `{urls: ["https://..."]}` |
| `/api/user` | POST | 分析用户，传入 `{url: "https://..."}` |
| `/api/extract-audio` | POST | 提取音频，传入 `{url: "https://..."}` |
| `/api/task/<id>` | GET | 查询任务状态 |
| `/api/download/<id>/<type>` | GET | 下载文件（video/audio） |
| `/api/tasks` | GET | 获取所有任务列表 |

## 注意事项

- 本工具依赖 yt-dlp 对抖音的支持，部分视频可能因地区限制无法下载
- 如需批量分析大量视频，建议配置 cookies
- AI 分析功能会提取视频元数据和字幕文本，可一键复制到任意 AI 工具进行深度分析

## License

MIT
