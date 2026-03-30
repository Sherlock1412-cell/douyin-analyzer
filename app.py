#!/usr/bin/env python3
"""抖音视频分析器 - 主应用"""

import os
import json
import uuid
import threading
import time
import subprocess
import re
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, Response

app = Flask(__name__)
app.config['SECRET_KEY'] = uuid.uuid4().hex
app.config['DOWNLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'downloads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

os.makedirs(app.config['DOWNLOAD_FOLDER'], exist_ok=True)

# ============ 任务存储 ============
tasks = {}

class TaskStatus:
    PENDING = "pending"
    DOWNLOADING = "downloading"
    ANALYZING = "analyzing"
    EXTRACTING = "extracting"
    DONE = "done"
    ERROR = "error"


def get_cookies_file():
    """查找 cookies 文件"""
    candidates = [
        os.path.join(os.path.dirname(__file__), 'cookies.txt'),
        os.path.expanduser('~/.config/yt-dlp/cookies.txt'),
        '/tmp/douyin_cookies.txt',
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def extract_video_id(url):
    """从抖音链接中提取视频ID"""
    patterns = [
        r'video/(\d+)',
        r'item_ids=(\d+)',
        r'v\.douyin\.com/(\w+)',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def download_video(url, task_id, extract_audio=False):
    """使用 yt-dlp 下载视频"""
    task = tasks[task_id]
    out_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], task_id)
    os.makedirs(out_dir, exist_ok=True)

    cookies = get_cookies_file()

    # 先获取视频信息
    cmd = ['yt-dlp', '--dump-json', '--no-warnings', '--no-check-certificates']
    if cookies:
        cmd.extend(['--cookies', cookies])
    cmd.append(url)

    try:
        task['status'] = TaskStatus.DOWNLOADING
        task['progress'] = '正在获取视频信息...'

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            # 尝试备用方法
            task['progress'] = '主方法失败，尝试备用方案...'
            return download_video_fallback(url, task_id, extract_audio)

        info = json.loads(result.stdout)
        video_info = {
            'title': info.get('title', '未知标题'),
            'description': info.get('description', ''),
            'uploader': info.get('uploader', '未知作者'),
            'uploader_id': info.get('uploader_id', ''),
            'duration': info.get('duration', 0),
            'view_count': info.get('view_count', 0),
            'like_count': info.get('like_count', 0),
            'comment_count': info.get('comment_count', 0),
            'upload_date': info.get('upload_date', ''),
            'webpage_url': info.get('webpage_url', url),
            'subtitles': list(info.get('subtitles', {}).keys()),
            'automatic_captions': list(info.get('automatic_captions', {}).keys()),
        }
        task['video_info'] = video_info

        # 下载视频
        video_filename = f"video_{task_id}.%(ext)s"
        dl_cmd = [
            'yt-dlp',
            '-o', os.path.join(out_dir, video_filename),
            '--no-warnings',
            '--no-check-certificates',
            '--merge-output-format', 'mp4',
        ]
        if cookies:
            dl_cmd.extend(['--cookies', cookies])

        # 尝试下载字幕
        dl_cmd.extend(['--write-subs', '--write-auto-subs', '--sub-lang', 'zh,zh-Hans,zh-CN,en'])
        dl_cmd.append(url)

        task['progress'] = '正在下载视频...'
        dl_result = subprocess.run(dl_cmd, capture_output=True, text=True, timeout=600)

        # 查找下载的文件
        downloaded_files = os.listdir(out_dir)
        video_files = [f for f in downloaded_files if f.endswith(('.mp4', '.webm', '.mkv', '.flv'))]
        sub_files = [f for f in downloaded_files if f.endswith(('.vtt', '.srt', '.ass'))]

        if not video_files:
            return download_video_fallback(url, task_id, extract_audio)

        video_path = os.path.join(out_dir, video_files[0])
        task['video_path'] = video_path
        task['video_filename'] = video_files[0]

        # 读取字幕内容
        subtitle_text = ""
        for sub_file in sub_files:
            sub_path = os.path.join(out_dir, sub_file)
            try:
                with open(sub_path, 'r', encoding='utf-8', errors='ignore') as f:
                    subtitle_text += parse_subtitle(f.read()) + "\n"
            except:
                pass
        task['subtitles'] = subtitle_text.strip()

        # 提取音频
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
    """备用下载方法 - 简化版"""
    task = tasks[task_id]
    out_dir = os.path.join(app.config['DOWNLOAD_FOLDER'], task_id)
    os.makedirs(out_dir, exist_ok=True)

    cookies = get_cookies_file()
    video_filename = f"video_{task_id}.%(ext)s"

    cmd = [
        'yt-dlp',
        '-o', os.path.join(out_dir, video_filename),
        '--no-warnings',
        '--no-check-certificates',
        '--merge-output-format', 'mp4',
        '--socket-timeout', '30',
    ]
    if cookies:
        cmd.extend(['--cookies', cookies])
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

            # 尝试用 yt-dlp 获取基本信息
            try:
                info_cmd = ['yt-dlp', '--dump-json', '--no-warnings']
                if cookies:
                    info_cmd.extend(['--cookies', cookies])
                info_cmd.append(url)
                info_res = subprocess.run(info_cmd, capture_output=True, text=True, timeout=60)
                if info_res.returncode == 0:
                    info = json.loads(info_res.stdout)
                    task['video_info'] = {
                        'title': info.get('title', '未知标题'),
                        'description': info.get('description', ''),
                        'uploader': info.get('uploader', '未知作者'),
                        'uploader_id': info.get('uploader_id', ''),
                        'duration': info.get('duration', 0),
                        'view_count': info.get('view_count', 0),
                        'like_count': info.get('like_count', 0),
                    }
            except:
                task['video_info'] = {'title': '抖音视频', 'uploader': '未知'}

            if extract_audio:
                extract_audio_from_video(video_path, task_id, out_dir)

            task['status'] = TaskStatus.DONE
            task['progress'] = '完成'
            task['done_at'] = datetime.now().isoformat()
        else:
            task['status'] = TaskStatus.ERROR
            task['error'] = '无法下载视频。可能需要登录或视频已被删除。\n提示：可以在 cookies.txt 中添加抖音 cookies 来解决地区/登录限制。'
    except Exception as e:
        task['status'] = TaskStatus.ERROR
        task['error'] = f'下载失败: {str(e)}'


def extract_audio_from_video(video_path, task_id, out_dir):
    """从视频中提取音频"""
    task = tasks[task_id]
    audio_path = os.path.join(out_dir, f"audio_{task_id}.mp3")

    try:
        task['status'] = TaskStatus.EXTRACTING
        task['progress'] = '正在提取音频...'

        cmd = [
            'ffmpeg', '-i', video_path,
            '-vn', '-acodec', 'libmp3lame',
            '-q:a', '2', '-y',
            audio_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if os.path.exists(audio_path):
            task['audio_path'] = audio_path
            task['audio_filename'] = f"audio_{task_id}.mp3"
        else:
            task['audio_error'] = '音频提取失败'
    except Exception as e:
        task['audio_error'] = f'音频提取失败: {str(e)}'


def parse_subtitle(content):
    """解析字幕文件，提取纯文本"""
    # 移除 VTT/SRT 格式标记
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
        # 移除 HTML 标签
        line = re.sub(r'<[^>]+>', '', line)
        if line:
            text_lines.append(line)
    return ' '.join(text_lines)


def get_user_videos(user_url, task_id):
    """获取用户的所有视频"""
    task = tasks[task_id]
    task['status'] = TaskStatus.DOWNLOADING
    task['progress'] = '正在获取用户视频列表...'

    cookies = get_cookies_file()
    cmd = [
        'yt-dlp',
        '--dump-json',
        '--flat-playlist',
        '--no-warnings',
        '--no-check-certificates',
        '--playlist-end', '50',  # 最多获取50个
    ]
    if cookies:
        cmd.extend(['--cookies', cookies])
    cmd.append(user_url)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

        if result.returncode != 0:
            task['status'] = TaskStatus.ERROR
            task['error'] = f'无法获取用户视频列表。yt-dlp 输出:\n{result.stderr[:500]}'
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
        task['error'] = '获取超时，用户可能有大量视频'
    except Exception as e:
        task['status'] = TaskStatus.ERROR
        task['error'] = str(e)


def analyze_content(task_id, analysis_type="single"):
    """分析视频内容（调用LLM）"""
    task = tasks[task_id]
    task['status'] = TaskStatus.ANALYZING

    video_info = task.get('video_info', {})
    subtitles = task.get('subtitles', '')

    # 构建分析提示
    content = f"""标题: {video_info.get('title', '未知')}
作者: {video_info.get('uploader', '未知')}
描述: {video_info.get('description', '无')}
播放量: {video_info.get('view_count', '未知')}
点赞数: {video_info.get('like_count', '未知')}
字幕/转录: {subtitles[:3000] if subtitles else '无可用字幕'}"""

    task['analysis_content'] = content
    task['analysis_ready'] = True
    task['progress'] = '内容已提取，等待AI分析...'


# ============ 路由 ============

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    """分析单个/多个视频"""
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
        tasks[task_id] = {
            'id': task_id,
            'type': 'analyze',
            'url': url,
            'status': TaskStatus.PENDING,
            'created_at': datetime.now().isoformat(),
        }

        t = threading.Thread(target=download_video, args=(url, task_id, False))
        t.daemon = True
        t.start()
        task_ids.append(task_id)

    return jsonify({'task_ids': task_ids, 'message': f'已创建 {len(task_ids)} 个分析任务'})


@app.route('/api/user', methods=['POST'])
def api_user():
    """分析用户所有作品"""
    data = request.json
    user_url = data.get('url', '').strip()

    if not user_url:
        return jsonify({'error': '请提供抖音用户链接'}), 400

    # 确保是用户主页链接
    if '/user/' not in user_url and 'sec_uid' not in user_url:
        # 尝试构建用户主页链接
        pass

    task_id = uuid.uuid4().hex[:12]
    tasks[task_id] = {
        'id': task_id,
        'type': 'user',
        'url': user_url,
        'status': TaskStatus.PENDING,
        'created_at': datetime.now().isoformat(),
    }

    t = threading.Thread(target=get_user_videos, args=(user_url, task_id))
    t.daemon = True
    t.start()

    return jsonify({'task_id': task_id, 'message': '已创建用户分析任务'})


@app.route('/api/extract-audio', methods=['POST'])
def api_extract_audio():
    """提取视频音频"""
    data = request.json
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': '请提供视频链接'}), 400

    task_id = uuid.uuid4().hex[:12]
    tasks[task_id] = {
        'id': task_id,
        'type': 'audio',
        'url': url,
        'status': TaskStatus.PENDING,
        'created_at': datetime.now().isoformat(),
    }

    t = threading.Thread(target=download_video, args=(url, task_id, True))
    t.daemon = True
    t.start()

    return jsonify({'task_id': task_id, 'message': '已创建音频提取任务'})


@app.route('/api/task/<task_id>')
def api_task_status(task_id):
    """查询任务状态"""
    task = tasks.get(task_id)
    if not task:
        return jsonify({'error': '任务不存在'}), 404

    response = {
        'id': task['id'],
        'type': task.get('type'),
        'status': task['status'],
        'progress': task.get('progress', ''),
        'created_at': task.get('created_at'),
    }

    if task['status'] == TaskStatus.DONE:
        response['video_info'] = task.get('video_info', {})
        response['subtitles'] = task.get('subtitles', '')
        response['analysis_content'] = task.get('analysis_content', '')
        response['analysis_ready'] = task.get('analysis_ready', False)
        response['video_count'] = task.get('video_count', 0)
        response['videos'] = task.get('videos', [])

        if task.get('audio_path'):
            response['audio_download'] = f'/api/download/{task_id}/audio'
        if task.get('video_path'):
            response['video_download'] = f'/api/download/{task_id}/video'

    if task['status'] == TaskStatus.ERROR:
        response['error'] = task.get('error', '未知错误')

    return jsonify(response)


@app.route('/api/download/<task_id>/<file_type>')
def api_download(task_id, file_type):
    """下载文件"""
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
    """获取所有任务"""
    task_list = []
    for tid, t in tasks.items():
        task_list.append({
            'id': tid,
            'type': t.get('type'),
            'status': t['status'],
            'progress': t.get('progress', ''),
            'url': t.get('url', ''),
            'created_at': t.get('created_at'),
            'video_info': t.get('video_info', {}),
        })
    # 按创建时间倒序
    task_list.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify(task_list)


if __name__ == '__main__':
    print("=" * 50)
    print("  🎵 抖音视频分析器")
    print("  访问: http://0.0.0.0:8860")
    print("=" * 50)
    app.run(host='0.0.0.0', port=8860, debug=False, threaded=True)
