#!/usr/bin/env python3
"""多平台视频分析器 — Douyin / Bilibili / YouTube"""

import os, json, uuid, threading, subprocess, re
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file

app = Flask(__name__)
app.config['SECRET_KEY'] = uuid.uuid4().hex
app.config['DOWNLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'downloads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
os.makedirs(app.config['DOWNLOAD_FOLDER'], exist_ok=True)

tasks = {}


class TaskStatus:
    PENDING = "pending"
    DOWNLOADING = "downloading"
    ANALYZING = "analyzing"
    EXTRACTING = "extracting"
    DONE = "done"
    ERROR = "error"


# ============ 平台检测 ============

PLATFORMS = {
    'douyin': {
        'name': '抖音',
        'icon': '🎵',
        'domains': ['douyin.com', 'v.douyin.com', 'iesdouyin.com'],
    },
    'bilibili': {
        'name': 'B站',
        'icon': '📺',
        'domains': ['bilibili.com', 'b23.tv', 'bili2233.cn', 'biliapi.net'],
    },
    'youtube': {
        'name': 'YouTube',
        'icon': '▶️',
        'domains': ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'm.youtube.com'],
    },
}


def detect_platform(url):
    """检测视频链接所属平台"""
    url_lower = url.lower()
    for platform, info in PLATFORMS.items():
        for domain in info['domains']:
            if domain in url_lower:
                return platform
    return 'unknown'


def get_platform_config(platform):
    """获取平台特定的 yt-dlp 参数"""
    cfg = {
        'douyin': {
            'sub_lang': 'zh,zh-Hans,zh-CN,en',
            'extra_args': [],
        },
        'bilibili': {
            'sub_lang': 'zh,zh-Hans,zh-CN,en',
            'extra_args': ['--referer', 'https://www.bilibili.com'],
        },
        'youtube': {
            'sub_lang': 'zh,zh-Hans,zh-Hant,zh-CN,en,ja',
            'extra_args': [],
        },
    }
    return cfg.get(platform, cfg['douyin'])


# ============ Cookies ============

def get_cookies_file():
    candidates = [
        os.path.join(os.path.dirname(__file__), 'cookies.txt'),
        os.path.expanduser('~/.config/yt-dlp/cookies.txt'),
        '/tmp/video_cookies.txt',
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


# ============ 字幕解析 ============

def parse_subtitle(content):
    lines = content.split('\n')
    text_lines = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('WEBVTT') or line.startswith('NOTE'):
            continue
        if '-->' in line:
            continue
        if re.match(r'^\d+$', line):
            continue
        line = re.sub(r'<[^>]+>', '', line)
        if line:
            text_lines.append(line)
    return ' '.join(text_lines)


# ============ 音频提取 ============

def extract_audio_from_video(video_path, task_id, out_dir):
    task = tasks[task_id]
    audio_path = os.path.join(out_dir, f"audio_{task_id}.mp3")
    try:
        task['status'] = TaskStatus.EXTRACTING
        task['progress'] = '正在提取音频...'
        cmd = ['ffmpeg', '-i', video_path, '-vn', '-acodec', 'libmp3lame',
               '-q:a', '2', '-y', audio_path]
        subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if os.path.exists(audio_path):
            task['audio_path'] = audio_path
            task['audio_filename'] = f"audio_{task_id}.mp3"
        else:
            task['audio_error'] = '音频提取失败'
    except Exception as e:
        task['audio_error'] = f'音频提取失败: {str(e)}'


# ============ 视频下载（统一入口） ============

def download_video(url, task_id, extract_audio=False):
    task = tasks[task_id]
    platform = task.get('platform', detect_platform(url))
    task['platform'] = platform
    out_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], task_id)
    os.makedirs(out_dir, exist_ok=True)

    cookies = get_cookies_file()
    pconf = get_platform_config(platform)

    # ── 获取元数据 ──
    cmd = ['yt-dlp', '--dump-json', '--no-warnings', '--no-check-certificates',
           '--socket-timeout', '30']
    if cookies:
        cmd.extend(['--cookies', cookies])
    cmd.extend(pconf['extra_args'])
    cmd.append(url)

    try:
        task['status'] = TaskStatus.DOWNLOADING
        task['progress'] = '正在获取视频信息...'
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            task['progress'] = '主方法失败，尝试备用方案...'
            return download_video_fallback(url, task_id, extract_audio)

        info = json.loads(result.stdout)
        video_info = {
            'title': info.get('title', '未知标题'),
            'description': info.get('description', ''),
            'uploader': info.get('uploader', info.get('uploader_id', '未知作者')),
            'uploader_id': info.get('uploader_id', ''),
            'duration': info.get('duration', 0),
            'view_count': info.get('view_count', 0),
            'like_count': info.get('like_count', 0),
            'comment_count': info.get('comment_count', 0),
            'upload_date': info.get('upload_date', ''),
            'webpage_url': info.get('webpage_url', url),
            'platform': platform,
        }
        task['video_info'] = video_info

        # ── 下载视频 ──
        video_filename = f"video_{task_id}.%(ext)s"
        dl_cmd = [
            'yt-dlp',
            '-o', os.path.join(out_dir, video_filename),
            '--no-warnings', '--no-check-certificates',
            '--merge-output-format', 'mp4',
        ]
        if cookies:
            dl_cmd.extend(['--cookies', cookies])
        dl_cmd.extend(['--write-subs', '--write-auto-subs',
                        '--sub-lang', pconf['sub_lang']])
        dl_cmd.extend(pconf['extra_args'])
        dl_cmd.append(url)

        task['progress'] = '正在下载视频...'
        subprocess.run(dl_cmd, capture_output=True, text=True, timeout=600)

        downloaded_files = os.listdir(out_dir)
        video_files = [f for f in downloaded_files if f.endswith(('.mp4', '.webm', '.mkv', '.flv'))]
        sub_files = [f for f in downloaded_files if f.endswith(('.vtt', '.srt', '.ass'))]

        if not video_files:
            return download_video_fallback(url, task_id, extract_audio)

        video_path = os.path.join(out_dir, video_files[0])
        task['video_path'] = video_path
        task['video_filename'] = video_files[0]

        # ── 字幕 ──
        subtitle_text = ""
        for sub_file in sub_files:
            try:
                with open(os.path.join(out_dir, sub_file), 'r', encoding='utf-8', errors='ignore') as f:
                    subtitle_text += parse_subtitle(f.read()) + "\n"
            except:
                pass
        task['subtitles'] = subtitle_text.strip()

        if extract_audio:
            extract_audio_from_video(video_path, task_id, out_dir)

        task['status'] = TaskStatus.DONE
        task['progress'] = '完成'
        task['done_at'] = datetime.now().isoformat()

    except subprocess.TimeoutExpired:
        task['status'] = TaskStatus.ERROR
        task['error'] = '下载超时，请检查网络连接'
    except json.JSONDecodeError:
        download_video_fallback(url, task_id, extract_audio)
    except Exception as e:
        task['status'] = TaskStatus.ERROR
        task['error'] = str(e)


def download_video_fallback(url, task_id, extract_audio=False):
    task = tasks[task_id]
    platform = task.get('platform', detect_platform(url))
    out_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], task_id)
    os.makedirs(out_dir, exist_ok=True)

    cookies = get_cookies_file()
    pconf = get_platform_config(platform)
    video_filename = f"video_{task_id}.%(ext)s"

    cmd = [
        'yt-dlp',
        '-o', os.path.join(out_dir, video_filename),
        '--no-warnings', '--no-check-certificates',
        '--merge-output-format', 'mp4', '--socket-timeout', '30',
    ]
    if cookies:
        cmd.extend(['--cookies', cookies])
    cmd.extend(pconf['extra_args'])
    cmd.append(url)

    try:
        task['progress'] = '使用备用方案下载...'
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

        downloaded_files = os.listdir(out_dir)
        video_files = [f for f in downloaded_files if f.endswith(('.mp4', '.webm', '.mkv', '.flv'))]

        if video_files:
            video_path = os.path.join(out_dir, video_files[0])
            task['video_path'] = video_path
            task['video_filename'] = video_files[0]

            # 尝试获取元数据
            try:
                info_cmd = ['yt-dlp', '--dump-json', '--no-warnings']
                if cookies:
                    info_cmd.extend(['--cookies', cookies])
                info_cmd.extend(pconf['extra_args'])
                info_cmd.append(url)
                info_res = subprocess.run(info_cmd, capture_output=True, text=True, timeout=60)
                if info_res.returncode == 0:
                    info = json.loads(info_res.stdout)
                    task['video_info'] = {
                        'title': info.get('title', '未知标题'),
                        'description': info.get('description', ''),
                        'uploader': info.get('uploader', info.get('uploader_id', '未知')),
                        'duration': info.get('duration', 0),
                        'view_count': info.get('view_count', 0),
                        'like_count': info.get('like_count', 0),
                        'platform': platform,
                    }
            except:
                pinfo = PLATFORMS.get(platform, {})
                task['video_info'] = {
                    'title': f'{pinfo.get("icon", "")} {pinfo.get("name", "")}视频',
                    'uploader': '未知', 'platform': platform}

            if extract_audio:
                extract_audio_from_video(video_path, task_id, out_dir)

            task['status'] = TaskStatus.DONE
            task['progress'] = '完成'
            task['done_at'] = datetime.now().isoformat()
        else:
            pinfo = PLATFORMS.get(platform, {})
            task['status'] = TaskStatus.ERROR
            task['error'] = (
                f'无法下载{pinfo.get("name", "")}视频。可能需要登录或视频已被删除。\n'
                f'提示：可在项目目录放置 cookies.txt 解决限制。'
            )
    except Exception as e:
        task['status'] = TaskStatus.ERROR
        task['error'] = f'下载失败: {str(e)}'


# ============ 用户视频列表 ============

def get_user_videos(user_url, task_id):
    task = tasks[task_id]
    platform = task.get('platform', detect_platform(user_url))
    task['platform'] = platform
    task['status'] = TaskStatus.DOWNLOADING
    task['progress'] = '正在获取视频列表...'

    cookies = get_cookies_file()
    pconf = get_platform_config(platform)

    cmd = [
        'yt-dlp', '--dump-json', '--flat-playlist',
        '--no-warnings', '--no-check-certificates',
        '--playlist-end', '50',
    ]
    if cookies:
        cmd.extend(['--cookies', cookies])
    cmd.extend(pconf['extra_args'])
    cmd.append(user_url)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

        if result.returncode != 0:
            task['status'] = TaskStatus.ERROR
            task['error'] = f'无法获取视频列表。yt-dlp 输出:\n{result.stderr[:500]}'
            return

        videos = []
        for line in result.stdout.strip().split('\n'):
            if line.strip():
                try:
                    info = json.loads(line)
                    videos.append({
                        'title': info.get('title', ''),
                        'description': info.get('description', ''),
                        'url': info.get('url', info.get('webpage_url', '')),
                        'duration': info.get('duration', 0),
                        'view_count': info.get('view_count', 0),
                        'like_count': info.get('like_count', 0),
                        'upload_date': info.get('upload_date', ''),
                    })
                except json.JSONDecodeError:
                    continue

        task['videos'] = videos
        task['video_count'] = len(videos)
        task['status'] = TaskStatus.DONE
        task['progress'] = f'获取完成，共 {len(videos)} 个视频'
        task['done_at'] = datetime.now().isoformat()

    except subprocess.TimeoutExpired:
        task['status'] = TaskStatus.ERROR
        task['error'] = '获取超时，频道可能有大量视频'
    except Exception as e:
        task['status'] = TaskStatus.ERROR
        task['error'] = str(e)


# ============ API 路由 ============

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    data = request.json
    urls = data.get('urls', [])
    if isinstance(urls, str):
        urls = [urls]
    if not urls:
        return jsonify({'error': '请提供至少一个视频链接'}), 400

    task_ids = []
    for url in urls:
        url = url.strip()
        if not url:
            continue
        task_id = uuid.uuid4().hex[:12]
        platform = detect_platform(url)
        tasks[task_id] = {
            'id': task_id, 'type': 'analyze', 'url': url,
            'platform': platform, 'status': TaskStatus.PENDING,
            'created_at': datetime.now().isoformat(),
        }
        t = threading.Thread(target=download_video, args=(url, task_id, False))
        t.daemon = True
        t.start()
        task_ids.append(task_id)

    return jsonify({'task_ids': task_ids, 'message': f'已创建 {len(task_ids)} 个分析任务'})


@app.route('/api/user', methods=['POST'])
def api_user():
    data = request.json
    user_url = data.get('url', '').strip()
    if not user_url:
        return jsonify({'error': '请提供用户/频道链接'}), 400

    task_id = uuid.uuid4().hex[:12]
    platform = detect_platform(user_url)
    tasks[task_id] = {
        'id': task_id, 'type': 'user', 'url': user_url,
        'platform': platform, 'status': TaskStatus.PENDING,
        'created_at': datetime.now().isoformat(),
    }
    t = threading.Thread(target=get_user_videos, args=(user_url, task_id))
    t.daemon = True
    t.start()

    return jsonify({'task_id': task_id, 'message': '已创建创作者分析任务'})


@app.route('/api/extract-audio', methods=['POST'])
def api_extract_audio():
    data = request.json
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': '请提供视频链接'}), 400

    task_id = uuid.uuid4().hex[:12]
    platform = detect_platform(url)
    tasks[task_id] = {
        'id': task_id, 'type': 'audio', 'url': url,
        'platform': platform, 'status': TaskStatus.PENDING,
        'created_at': datetime.now().isoformat(),
    }
    t = threading.Thread(target=download_video, args=(url, task_id, True))
    t.daemon = True
    t.start()

    return jsonify({'task_id': task_id, 'message': '已创建音频提取任务'})


@app.route('/api/task/<task_id>')
def api_task_status(task_id):
    task = tasks.get(task_id)
    if not task:
        return jsonify({'error': '任务不存在'}), 404

    resp = {
        'id': task['id'], 'type': task.get('type'),
        'platform': task.get('platform', 'unknown'),
        'status': task['status'], 'progress': task.get('progress', ''),
        'created_at': task.get('created_at'),
    }
    if task['status'] == TaskStatus.DONE:
        resp['video_info'] = task.get('video_info', {})
        resp['subtitles'] = task.get('subtitles', '')
        resp['analysis_content'] = task.get('analysis_content', '')
        resp['video_count'] = task.get('video_count', 0)
        resp['videos'] = task.get('videos', [])
        if task.get('audio_path'):
            resp['audio_download'] = f'/api/download/{task_id}/audio'
        if task.get('video_path'):
            resp['video_download'] = f'/api/download/{task_id}/video'
    if task['status'] == TaskStatus.ERROR:
        resp['error'] = task.get('error', '未知错误')
    return jsonify(resp)


@app.route('/api/download/<task_id>/<file_type>')
def api_download(task_id, file_type):
    task = tasks.get(task_id)
    if not task:
        return '任务不存在', 404
    if file_type == 'audio' and task.get('audio_path'):
        return send_file(task['audio_path'], as_attachment=True,
                         download_name=task.get('audio_filename', 'audio.mp3'))
    elif file_type == 'video' and task.get('video_path'):
        return send_file(task['video_path'], as_attachment=True,
                         download_name=task.get('video_filename', 'video.mp4'))
    return '文件不存在', 404


@app.route('/api/tasks')
def api_tasks():
    task_list = []
    for tid, t in tasks.items():
        task_list.append({
            'id': tid, 'type': t.get('type'),
            'platform': t.get('platform', 'unknown'),
            'status': t['status'], 'progress': t.get('progress', ''),
            'url': t.get('url', ''), 'created_at': t.get('created_at'),
            'video_info': t.get('video_info', {}),
        })
    task_list.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify(task_list)


@app.route('/api/platforms')
def api_platforms():
    """返回支持的平台列表"""
    return jsonify(PLATFORMS)


if __name__ == '__main__':
    print("=" * 50)
    print("  🎬 多平台视频分析器")
    print("  支持: 抖音 · B站 · YouTube")
    print("  访问: http://0.0.0.0:8860")
    print("=" * 50)
    app.run(host='0.0.0.0', port=8860, debug=False, threaded=True)
