// ============ 全局状态 ============
const pollingTimers = {};
const taskResults = {};
let currentPlatformFilter = 'all';

function t(key, fallback) {
    return (typeof I18n !== 'undefined') ? I18n.t(key, fallback) : (fallback || key);
}

// ============ 平台元数据 ============
const PLATFORM_META = {
    douyin:  { icon: '🎵', name: '抖音',    badgeClass: 'badge-douyin',    headerClass: 'platform-douyin' },
    bilibili:{ icon: '📺', name: 'B站',     badgeClass: 'badge-bilibili',  headerClass: 'platform-bilibili' },
    youtube: { icon: '▶️', name: 'YouTube', badgeClass: 'badge-youtube',   headerClass: 'platform-youtube' },
    unknown: { icon: '🌐', name: '',        badgeClass: '',                headerClass: '' },
};

function platformMeta(p) { return PLATFORM_META[p] || PLATFORM_META.unknown; }

// ============ 平台筛选 ============
function filterPlatform(platform) {
    currentPlatformFilter = platform;
    document.querySelectorAll('.platform-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.platform === platform);
    });
    // 筛选结果卡片
    document.querySelectorAll('.result-card').forEach(card => {
        const p = card.dataset.platform;
        if (platform === 'all' || p === platform) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
    // 筛选历史
    document.querySelectorAll('.history-item').forEach(item => {
        const p = item.dataset.platform;
        if (platform === 'all' || p === platform) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

// ============ Tab 切换 ============
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tb => tb.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`panel-${tabName}`).classList.add('active');
}

function toggleHistory() {
    const list = document.getElementById('history-list');
    const arrow = document.getElementById('history-arrow');
    list.classList.toggle('collapsed');
    arrow.classList.toggle('collapsed');
}

// ============ API ============
async function apiPost(url, data) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return res.json();
}
async function apiGet(url) {
    const res = await fetch(url);
    return res.json();
}

// ============ 视频分析 ============
async function startAnalyze() {
    const urlsText = document.getElementById('analyze-urls').value.trim();
    if (!urlsText) { showToast(t('toast.empty_url')); return; }
    const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u);
    if (urls.length === 0) { showToast(t('toast.invalid_url')); return; }

    const data = await apiPost('/api/analyze', { urls });
    if (data.error) { showToast(data.error); return; }

    const container = document.getElementById('analyze-results');
    data.task_ids.forEach(tid => {
        container.insertBefore(createResultCard(tid, 'analyze'), container.firstChild);
        pollTask(tid, 'analyze');
    });
    loadHistory();
}

// ============ 创作者分析 ============
async function startUserAnalyze() {
    const url = document.getElementById('user-url').value.trim();
    if (!url) { showToast(t('toast.empty_user')); return; }

    const data = await apiPost('/api/user', { url });
    if (data.error) { showToast(data.error); return; }

    const container = document.getElementById('user-results');
    container.insertBefore(createResultCard(data.task_id, 'user'), container.firstChild);
    pollTask(data.task_id, 'user');
    loadHistory();
}

// ============ 音频提取 ============
async function startAudioExtract() {
    const url = document.getElementById('audio-url').value.trim();
    if (!url) { showToast(t('toast.empty_audio')); return; }

    const data = await apiPost('/api/extract-audio', { url });
    if (data.error) { showToast(data.error); return; }

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
    card.dataset.platform = '';
    card.innerHTML = `
        <div class="result-header">
            <span class="result-platform-badge" id="badge-${taskId}" style="display:none"></span>
            <span class="result-status status-pending"></span>
            <span class="result-title">任务 ${taskId.slice(0, 8)}...</span>
            <span class="result-progress"><span class="spinner"></span> ${t('status.pending')}</span>
        </div>
        <div class="result-body" id="body-${taskId}">
            <p style="color: var(--text-muted)">${t('status.pending')}...</p>
        </div>
    `;
    return card;
}

// ============ 轮询 ============
function pollTask(taskId, type) {
    if (pollingTimers[taskId]) clearInterval(pollingTimers[taskId]);
    const check = async () => {
        try {
            const data = await apiGet(`/api/task/${taskId}`);
            updateResultCard(taskId, data, type);
            if (data.status === 'done' || data.status === 'error') {
                clearInterval(pollingTimers[taskId]);
                delete pollingTimers[taskId];
            }
        } catch (e) { console.error('Poll error:', e); }
    };
    check();
    pollingTimers[taskId] = setInterval(check, 2000);
}

// ============ 更新结果卡片 ============
function updateResultCard(taskId, data, type) {
    const card = document.getElementById(`task-${taskId}`);
    if (!card) return;

    const platform = data.platform || 'unknown';
    const meta = platformMeta(platform);
    card.dataset.platform = platform;

    // 平台徽章
    const badge = document.getElementById(`badge-${taskId}`);
    if (badge && meta.badgeClass) {
        badge.style.display = '';
        badge.className = `result-platform-badge ${meta.badgeClass}`;
        badge.textContent = `${meta.icon} ${meta.name}`;
    }

    // 头部着色
    const header = card.querySelector('.result-header');
    header.className = `result-header ${meta.headerClass}`;

    const statusEl = card.querySelector('.result-status');
    const progressEl = card.querySelector('.result-progress');
    const titleEl = card.querySelector('.result-title');
    const bodyEl = document.getElementById(`body-${taskId}`);

    statusEl.className = `result-status status-${data.status}`;

    const statusLabels = {
        pending: t('status.pending'), downloading: t('status.downloading'),
        analyzing: t('status.analyzing'), extracting: t('status.extracting'),
        done: t('status.done'), error: t('status.error'),
    };

    if (['downloading', 'analyzing', 'extracting'].includes(data.status)) {
        progressEl.innerHTML = `<span class="spinner"></span> ${data.progress || statusLabels[data.status]}`;
    } else {
        progressEl.textContent = data.progress || statusLabels[data.status] || '';
    }

    if (data.video_info?.title) titleEl.textContent = data.video_info.title;

    if (data.status === 'done') {
        if (type === 'analyze') bodyEl.innerHTML = renderAnalyzeResult(data);
        else if (type === 'user') bodyEl.innerHTML = renderUserResult(data);
        else if (type === 'audio') bodyEl.innerHTML = renderAudioResult(data);
    } else if (data.status === 'error') {
        bodyEl.innerHTML = `<div class="error-msg">❌ ${data.error || t('error.unknown')}</div>`;
    }
}

// ============ 渲染分析结果 ============
function renderAnalyzeResult(data) {
    const info = data.video_info || {};
    const meta = platformMeta(data.platform);
    let html = '';

    html += '<div class="video-info">';
    if (info.uploader) html += `<div class="info-item"><span class="info-label">${t('result.author')}</span><span class="info-value">${escHtml(info.uploader)}</span></div>`;
    if (info.duration) html += `<div class="info-item"><span class="info-label">${t('result.duration')}</span><span class="info-value">${formatDuration(info.duration)}</span></div>`;
    if (info.view_count) html += `<div class="info-item"><span class="info-label">${t('result.views')}</span><span class="info-value">${formatNum(info.view_count)}</span></div>`;
    if (info.like_count) html += `<div class="info-item"><span class="info-label">${t('result.likes')}</span><span class="info-value">${formatNum(info.like_count)}</span></div>`;
    if (info.comment_count) html += `<div class="info-item"><span class="info-label">${t('result.comments')}</span><span class="info-value">${formatNum(info.comment_count)}</span></div>`;
    html += '</div>';

    if (info.description) {
        html += `<div class="analysis-section"><h3>📝 ${t('result.description')}</h3><div class="content-block">${escHtml(info.description)}</div></div>`;
    }
    if (data.subtitles) {
        html += `<div class="analysis-section"><h3>💬 ${t('result.subtitles')}</h3><div class="content-block">${escHtml(data.subtitles)}</div></div>`;
    }

    html += `<div class="analysis-section"><h3>🤖 ${t('result.ai_analysis')}</h3>
        <div id="ai-analysis-${data.id}" class="content-block" style="min-height: 60px;">
            <button class="btn btn-secondary" onclick="triggerAI('${data.id}', 'analyze')">✨ ${t('result.ai_btn')}</button>
        </div></div>`;

    html += '<div class="action-bar">';
    if (data.video_download) html += `<a href="${data.video_download}" class="download-link" download>📥 ${t('result.download_video')}</a>`;
    if (data.audio_download) html += `<a href="${data.audio_download}" class="download-link" download>🎧 ${t('result.download_audio')}</a>`;
    html += '</div>';
    return html;
}

// ============ 渲染创作者结果 ============
function renderUserResult(data) {
    const videos = data.videos || [];
    let html = '';

    html += `<div class="info-item" style="margin-bottom: 16px;">
        <span class="info-label">${t('result.total_videos')}</span>
        <span class="info-value" style="font-size: 24px; color: var(--primary);">${data.video_count || videos.length}</span></div>`;

    if (videos.length > 0) {
        html += `<div class="analysis-section"><h3>🤖 ${t('result.ai_user_summary')}</h3>
            <div id="ai-analysis-${data.id}" class="content-block" style="min-height: 60px;">
                <button class="btn btn-secondary" onclick="triggerAI('${data.id}', 'user')">✨ ${t('result.ai_user_btn')}</button>
            </div></div>`;

        html += `<h3 style="margin: 16px 0 8px; font-size: 14px; color: var(--accent);">📹 ${t('result.video_list')}</h3>`;
        html += '<div class="videos-list">';
        videos.forEach((v, i) => {
            html += `<div class="video-item"><span class="video-index">${i + 1}</span>
                <div class="video-item-info">
                    <div class="video-item-title">${escHtml(v.title || '—')}</div>
                    <div class="video-item-meta">
                        ${v.view_count ? `<span>▶ ${formatNum(v.view_count)}</span>` : ''}
                        ${v.like_count ? `<span>❤ ${formatNum(v.like_count)}</span>` : ''}
                        ${v.duration ? `<span>⏱ ${formatDuration(v.duration)}</span>` : ''}
                    </div></div></div>`;
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
            <span class="info-label">${t('result.video_title')}</span>
            <span class="info-value">${escHtml(info.title)}</span></div>`;
    }
    if (data.audio_download) {
        html += `<div class="audio-player"><audio controls src="${data.audio_download}"></audio>
            <a href="${data.audio_download}" class="download-link" download>📥 ${t('result.download_mp3')}</a></div>`;
    } else if (data.audio_error) {
        html += `<div class="error-msg">${data.audio_error}</div>`;
    }
    return html;
}

// ============ AI 分析 ============
async function triggerAI(taskId, type) {
    const el = document.getElementById(`ai-analysis-${taskId}`);
    if (!el) return;
    el.innerHTML = `<div style="text-align: center; padding: 12px;"><span class="spinner"></span> <span style="color: var(--text-secondary);">${t('result.ai_analyzing')}</span></div>`;

    try {
        const data = await apiGet(`/api/task/${taskId}`);
        const info = data.video_info || {};
        const subtitles = data.subtitles || '';
        let analysisContent = '', prompt = '';

        if (type === 'analyze') {
            analysisContent = `${t('result.video_title')}: ${info.title || '—'}
${t('result.author')}: ${info.uploader || '—'}
${t('result.description')}: ${info.description || '—'}
${t('result.views')}: ${info.view_count || '—'}
${t('result.likes')}: ${info.like_count || '—'}
${t('result.comments')}: ${info.comment_count || '—'}
${t('result.subtitles')}: ${subtitles.slice(0, 2000) || '—'}`;
            prompt = t('ai.prompt.analyze');
        } else if (type === 'user') {
            const videos = data.videos || [];
            const videosSummary = videos.slice(0, 20).map((v, i) =>
                `${i+1}. ${v.title || '—'} (${t('result.views')}: ${formatNum(v.view_count||0)}, ${t('result.likes')}: ${formatNum(v.like_count||0)})`
            ).join('\n');
            analysisContent = `URL: ${data.url || '—'}
${t('result.total_videos')}: ${videos.length}
${t('result.video_list')}:\n${videosSummary}`;
            prompt = t('ai.prompt.user');
        }

        taskResults[taskId] = { content: analysisContent, prompt };
        el.innerHTML = `
            <div style="margin-bottom: 12px;">
                <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 8px;">📋 ${t('result.ai_content_hint')}</p>
                <div style="background: var(--bg); padding: 12px; border-radius: 6px; font-size: 13px; white-space: pre-wrap; max-height: 200px; overflow-y: auto; border: 1px solid var(--border);">${escHtml(analysisContent)}</div>
            </div>
            <div>
                <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 8px;">💡 ${t('result.ai_prompt_hint')}</p>
                <div style="background: var(--bg); padding: 12px; border-radius: 6px; font-size: 13px; white-space: pre-wrap; border: 1px solid var(--border); color: var(--accent);">${escHtml(prompt)}</div>
            </div>
            <div style="margin-top: 12px;">
                <button class="btn btn-secondary" onclick="copyToClip('${taskId}')">📋 ${t('result.copy_btn')}</button>
            </div>`;
    } catch (e) {
        el.innerHTML = `<div class="error-msg">${e.message}</div>`;
    }
}

function copyToClip(taskId) {
    const data = taskResults[taskId];
    if (!data) return;
    navigator.clipboard.writeText(`${data.prompt}\n\n--- Content ---\n${data.content}`).then(() => showToast(t('toast.copied')));
}

// ============ 历史记录 ============
async function loadHistory() {
    try {
        const data = await apiGet('/api/tasks');
        const list = document.getElementById('history-list');
        if (!data || data.length === 0) {
            list.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; padding: 8px 0;">${t('history.empty')}</p>`;
            return;
        }

        const typeLabels = { analyze: t('tab.analyze'), user: t('tab.user'), audio: t('tab.audio') };

        list.innerHTML = data.slice(0, 20).map(item => {
            const meta = platformMeta(item.platform);
            const badgeClass = `badge-${item.type || 'analyze'}`;
            const time = item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : '';
            const display = currentPlatformFilter === 'all' || item.platform === currentPlatformFilter ? '' : 'display:none';

            return `<div class="history-item" data-platform="${item.platform || ''}" onclick="scrollToTask('${item.id}')" style="${display}">
                <span class="badge ${badgeClass}">${typeLabels[item.type] || '—'}</span>
                ${meta.badgeClass ? `<span class="result-platform-badge ${meta.badgeClass}">${meta.icon}</span>` : ''}
                <span class="history-url">${escHtml(item.video_info?.title || item.url || item.id)}</span>
                <span class="history-time">${time}</span></div>`;
        }).join('');
    } catch (e) { console.error('Load history error:', e); }
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
function escHtml(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function formatDuration(s) { if (!s) return '—'; const m = Math.floor(s/60); return `${m}:${(Math.floor(s%60)).toString().padStart(2,'0')}`; }
function formatNum(n) { if (!n && n!==0) return '0'; n=Number(n); if (n>=1e8) return (n/1e8).toFixed(1)+'亿'; if (n>=1e4) return (n/1e4).toFixed(1)+'万'; return n.toLocaleString(); }

function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--bg-card);color:var(--text);padding:12px 24px;border-radius:8px;border:1px solid var(--primary);font-size:14px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5);animation:fadeIn 0.3s ease;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity 0.3s'; setTimeout(()=>toast.remove(),300); }, 3000);
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
    // 等待 i18n 加载完成再执行
    if (typeof I18n !== 'undefined' && I18n.ready) {
        await I18n.ready;
    }
    loadHistory();
});
