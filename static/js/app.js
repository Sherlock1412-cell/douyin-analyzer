// ============ 全局状态 ============
const pollingTimers = {};
const taskResults = {};

// ============ Tab 切换 ============
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`panel-${tabName}`).classList.add('active');
}

// ============ 历史记录切换 ============
function toggleHistory() {
    const list = document.getElementById('history-list');
    const arrow = document.getElementById('history-arrow');
    list.classList.toggle('collapsed');
    arrow.classList.toggle('collapsed');
}

// ============ API 请求 ============
async function apiPost(url, data) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

async function apiGet(url) {
    const res = await fetch(url);
    return res.json();
}

// ============ 视频分析 ============
async function startAnalyze() {
    const urlsText = document.getElementById('analyze-urls').value.trim();
    if (!urlsText) {
        showToast('请输入至少一个视频链接');
        return;
    }

    const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u);
    if (urls.length === 0) {
        showToast('请输入有效的视频链接');
        return;
    }

    const data = await apiPost('/api/analyze', { urls });
    if (data.error) {
        showToast(data.error);
        return;
    }

    // 为每个任务创建结果卡片
    const container = document.getElementById('analyze-results');
    data.task_ids.forEach(tid => {
        container.insertBefore(createResultCard(tid, 'analyze'), container.firstChild);
        pollTask(tid, 'analyze');
    });

    loadHistory();
}

// ============ 用户分析 ============
async function startUserAnalyze() {
    const url = document.getElementById('user-url').value.trim();
    if (!url) {
        showToast('请输入用户主页链接');
        return;
    }

    const data = await apiPost('/api/user', { url });
    if (data.error) {
        showToast(data.error);
        return;
    }

    const container = document.getElementById('user-results');
    container.insertBefore(createResultCard(data.task_id, 'user'), container.firstChild);
    pollTask(data.task_id, 'user');
    loadHistory();
}

// ============ 音频提取 ============
async function startAudioExtract() {
    const url = document.getElementById('audio-url').value.trim();
    if (!url) {
        showToast('请输入视频链接');
        return;
    }

    const data = await apiPost('/api/extract-audio', { url });
    if (data.error) {
        showToast(data.error);
        return;
    }

    const container = document.getElementById('audio-results');
    container.insertBefore(createResultCard(data.task_id, 'audio'), container.firstChild);
    pollTask(data.task_id, 'audio');
    loadHistory();
}

// ============ 创建结果卡片 ============
function createResultCard(taskId, type) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.id = `task-${taskId}`;
    card.innerHTML = `
        <div class="result-header">
            <span class="result-status status-pending"></span>
            <span class="result-title">任务 ${taskId.slice(0, 8)}...</span>
            <span class="result-progress"><span class="spinner"></span> 等待中...</span>
        </div>
        <div class="result-body" id="body-${taskId}">
            <p style="color: var(--text-muted)">准备中...</p>
        </div>
    `;
    return card;
}

// ============ 轮询任务状态 ============
function pollTask(taskId, type) {
    if (pollingTimers[taskId]) {
        clearInterval(pollingTimers[taskId]);
    }

    const check = async () => {
        try {
            const data = await apiGet(`/api/task/${taskId}`);
            updateResultCard(taskId, data, type);

            if (data.status === 'done' || data.status === 'error') {
                clearInterval(pollingTimers[taskId]);
                delete pollingTimers[taskId];
            }
        } catch (e) {
            console.error('Poll error:', e);
        }
    };

    check();
    pollingTimers[taskId] = setInterval(check, 2000);
}

// ============ 更新结果卡片 ============
function updateResultCard(taskId, data, type) {
    const card = document.getElementById(`task-${taskId}`);
    if (!card) return;

    const statusEl = card.querySelector('.result-status');
    const progressEl = card.querySelector('.result-progress');
    const titleEl = card.querySelector('.result-title');
    const bodyEl = document.getElementById(`body-${taskId}`);

    // 更新状态指示器
    statusEl.className = `result-status status-${data.status}`;

    // 更新进度
    const statusLabels = {
        pending: '等待中',
        downloading: '下载中',
        analyzing: '分析中',
        extracting: '提取中',
        done: '完成',
        error: '失败',
    };

    if (data.status === 'downloading' || data.status === 'analyzing' || data.status === 'extracting') {
        progressEl.innerHTML = `<span class="spinner"></span> ${data.progress || statusLabels[data.status]}`;
    } else {
        progressEl.textContent = data.progress || statusLabels[data.status] || '';
    }

    // 更新标题
    if (data.video_info && data.video_info.title) {
        titleEl.textContent = data.video_info.title;
    }

    // 更新内容
    if (data.status === 'done') {
        if (type === 'analyze') {
            bodyEl.innerHTML = renderAnalyzeResult(data);
        } else if (type === 'user') {
            bodyEl.innerHTML = renderUserResult(data);
        } else if (type === 'audio') {
            bodyEl.innerHTML = renderAudioResult(data);
        }
    } else if (data.status === 'error') {
        bodyEl.innerHTML = `<div class="error-msg">❌ ${data.error || '未知错误'}</div>`;
    }
}

// ============ 渲染分析结果 ============
function renderAnalyzeResult(data) {
    const info = data.video_info || {};
    let html = '';

    // 视频信息网格
    html += '<div class="video-info">';
    if (info.uploader) html += `<div class="info-item"><span class="info-label">作者</span><span class="info-value">${escHtml(info.uploader)}</span></div>`;
    if (info.duration) html += `<div class="info-item"><span class="info-label">时长</span><span class="info-value">${formatDuration(info.duration)}</span></div>`;
    if (info.view_count) html += `<div class="info-item"><span class="info-label">播放量</span><span class="info-value">${formatNum(info.view_count)}</span></div>`;
    if (info.like_count) html += `<div class="info-item"><span class="info-label">点赞</span><span class="info-value">${formatNum(info.like_count)}</span></div>`;
    if (info.comment_count) html += `<div class="info-item"><span class="info-label">评论</span><span class="info-value">${formatNum(info.comment_count)}</span></div>`;
    html += '</div>';

    // 描述/文案
    if (info.description) {
        html += `
            <div class="analysis-section">
                <h3>📝 视频文案</h3>
                <div class="content-block">${escHtml(info.description)}</div>
            </div>
        `;
    }

    // 字幕/转录文本
    if (data.subtitles) {
        html += `
            <div class="analysis-section">
                <h3>💬 语音转录</h3>
                <div class="content-block">${escHtml(data.subtitles)}</div>
            </div>
        `;
    }

    // AI 分析区域
    html += `
        <div class="analysis-section">
            <h3>🤖 AI 内容分析</h3>
            <div id="ai-analysis-${data.id}" class="content-block" style="min-height: 60px;">
                <button class="btn btn-secondary" onclick="triggerAI('${data.id}', 'analyze')">
                    ✨ 生成AI分析总结
                </button>
            </div>
        </div>
    `;

    // 下载按钮
    html += '<div class="action-bar">';
    if (data.video_download) {
        html += `<a href="${data.video_download}" class="download-link" download>📥 下载视频</a>`;
    }
    if (data.audio_download) {
        html += `<a href="${data.audio_download}" class="download-link" download>🎧 下载音频</a>`;
    }
    html += '</div>';

    return html;
}

// ============ 渲染用户分析结果 ============
function renderUserResult(data) {
    const videos = data.videos || [];
    let html = '';

    html += `<div class="info-item" style="margin-bottom: 16px;">
        <span class="info-label">视频总数</span>
        <span class="info-value" style="font-size: 24px; color: var(--primary);">${data.video_count || videos.length}</span>
    </div>`;

    if (videos.length > 0) {
        // AI 总结按钮
        html += `
            <div class="analysis-section">
                <h3>🤖 AI 作品总结</h3>
                <div id="ai-analysis-${data.id}" class="content-block" style="min-height: 60px;">
                    <button class="btn btn-secondary" onclick="triggerAI('${data.id}', 'user')">
                        ✨ 生成作者作品总结
                    </button>
                </div>
            </div>
        `;

        html += '<h3 style="margin: 16px 0 8px; font-size: 14px; color: var(--accent);">📹 视频列表</h3>';
        html += '<div class="videos-list">';
        videos.forEach((v, i) => {
            html += `
                <div class="video-item">
                    <span class="video-index">${i + 1}</span>
                    <div class="video-item-info">
                        <div class="video-item-title">${escHtml(v.title || '无标题')}</div>
                        <div class="video-item-meta">
                            ${v.view_count ? `<span>▶ ${formatNum(v.view_count)}</span>` : ''}
                            ${v.like_count ? `<span>❤ ${formatNum(v.like_count)}</span>` : ''}
                            ${v.duration ? `<span>⏱ ${formatDuration(v.duration)}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    return html;
}

// ============ 渲染音频结果 ============
function renderAudioResult(data) {
    const info = data.video_info || {};
    let html = '';

    if (info.title) {
        html += `<div class="info-item" style="margin-bottom: 12px;">
            <span class="info-label">视频标题</span>
            <span class="info-value">${escHtml(info.title)}</span>
        </div>`;
    }

    if (data.audio_download) {
        html += `
            <div class="audio-player">
                <audio controls src="${data.audio_download}"></audio>
                <a href="${data.audio_download}" class="download-link" download>
                    📥 下载 MP3 音频
                </a>
            </div>
        `;
    } else if (data.audio_error) {
        html += `<div class="error-msg">${data.audio_error}</div>`;
    }

    return html;
}

// ============ AI 分析（调用后端或本地分析） ============
async function triggerAI(taskId, type) {
    const el = document.getElementById(`ai-analysis-${taskId}`);
    if (!el) return;

    el.innerHTML = '<div style="text-align: center; padding: 12px;"><span class="spinner"></span> <span style="color: var(--text-secondary);">AI 正在分析中...</span></div>';

    try {
        const data = await apiGet(`/api/task/${taskId}`);
        const info = data.video_info || {};
        const subtitles = data.subtitles || '';

        // 构建分析内容
        let analysisContent = '';
        let prompt = '';

        if (type === 'analyze') {
            analysisContent = `
标题: ${info.title || '未知'}
作者: ${info.uploader || '未知'}
描述: ${info.description || '无'}
播放量: ${info.view_count || '未知'}
点赞数: ${info.like_count || '未知'}
评论数: ${info.comment_count || '未知'}
字幕文本: ${subtitles.slice(0, 2000) || '无字幕'}
            `.trim();

            prompt = '请分析这个抖音视频的内容，包括：\n1. 内容主题概述\n2. 关键信息提取\n3. 文案风格分析\n4. 受众分析\n5. 内容亮点';
        } else if (type === 'user') {
            const videos = data.videos || [];
            const videosSummary = videos.slice(0, 20).map((v, i) =>
                `${i+1}. ${v.title || '无标题'} (播放: ${formatNum(v.view_count || 0)}, 点赞: ${formatNum(v.like_count || 0)})`
            ).join('\n');

            analysisContent = `
作者主页链接: ${data.url || '未知'}
视频总数: ${videos.length}
视频列表:
${videosSummary}
            `.trim();

            prompt = '请分析这个抖音作者的作品特点，包括：\n1. 内容领域定位\n2. 创作风格分析\n3. 热门作品特点\n4. 内容策略总结';
        }

        // 保存到 taskResults 供展示
        taskResults[taskId] = { content: analysisContent, prompt };

        // 在页面中展示提取的内容和分析提示
        el.innerHTML = `
            <div style="margin-bottom: 12px;">
                <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 8px;">📋 已提取以下内容，可复制到任意AI工具中分析：</p>
                <div style="background: var(--bg); padding: 12px; border-radius: 6px; font-size: 13px; white-space: pre-wrap; max-height: 200px; overflow-y: auto; border: 1px solid var(--border);">${escHtml(analysisContent)}</div>
            </div>
            <div>
                <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 8px;">💡 建议的分析提示词：</p>
                <div style="background: var(--bg); padding: 12px; border-radius: 6px; font-size: 13px; white-space: pre-wrap; border: 1px solid var(--border); color: var(--accent);">${escHtml(prompt)}</div>
            </div>
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                <button class="btn btn-secondary" onclick="copyToClip(\`${taskId}\`)">📋 复制内容</button>
            </div>
        `;
    } catch (e) {
        el.innerHTML = `<div class="error-msg">分析失败: ${e.message}</div>`;
    }
}

function copyToClip(taskId) {
    const data = taskResults[taskId];
    if (!data) return;
    const text = `${data.prompt}\n\n--- 内容 ---\n${data.content}`;
    navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板 ✅');
    });
}

// ============ 加载历史 ============
async function loadHistory() {
    try {
        const data = await apiGet('/api/tasks');
        const list = document.getElementById('history-list');

        if (!data || data.length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; padding: 8px 0;">暂无历史记录</p>';
            return;
        }

        list.innerHTML = data.slice(0, 20).map(t => {
            const typeLabels = { analyze: '分析', user: '作者', audio: '音频' };
            const badgeClass = `badge-${t.type || 'analyze'}`;
            const time = t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '';

            return `
                <div class="history-item" onclick="scrollToTask('${t.id}')">
                    <span class="badge ${badgeClass}">${typeLabels[t.type] || '任务'}</span>
                    <span class="history-url">${escHtml(t.video_info?.title || t.url || t.id)}</span>
                    <span class="history-time">${time}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Load history error:', e);
    }
}

function scrollToTask(taskId) {
    const el = document.getElementById(`task-${taskId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.borderColor = 'var(--primary)';
        setTimeout(() => { el.style.borderColor = ''; }, 2000);
    }
}

// ============ 工具函数 ============
function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDuration(seconds) {
    if (!seconds) return '未知';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatNum(n) {
    if (!n && n !== 0) return '0';
    n = Number(n);
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return n.toLocaleString();
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: var(--bg-card); color: var(--text); padding: 12px 24px;
        border-radius: 8px; border: 1px solid var(--primary); font-size: 14px;
        z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        animation: fadeIn 0.3s ease;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();

    // 支持粘贴自动识别
    document.getElementById('analyze-urls').addEventListener('paste', (e) => {
        setTimeout(() => {
            const val = e.target.value.trim();
            if (val && !val.includes('\n') && val.includes('douyin.com')) {
                // 单个链接直接开始分析（可选）
            }
        }, 100);
    });
});
