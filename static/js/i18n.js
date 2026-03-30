/**
 * i18n.js — 多语言国际化模块
 * 支持动态切换语言，自动检测浏览器语言
 */
const I18n = (() => {
    let currentLang = localStorage.getItem('lang') || detectLang();
    let translations = {};
    let loaded = {};

    function detectLang() {
        const nav = navigator.language || navigator.userLanguage || 'zh';
        if (nav.startsWith('zh')) return 'zh';
        if (nav.startsWith('ja')) return 'ja';
        return 'en';
    }

    async function loadLang(lang) {
        if (loaded[lang]) {
            translations = loaded[lang];
            return;
        }
        try {
            const res = await fetch(`/static/i18n/${lang}.json`);
            if (!res.ok) throw new Error(`Failed to load ${lang}`);
            loaded[lang] = await res.json();
            translations = loaded[lang];
        } catch (e) {
            console.error('i18n load error:', e);
            // fallback to zh
            if (lang !== 'zh') {
                await loadLang('zh');
            }
        }
    }

    function t(key, fallback) {
        return translations[key] || fallback || key;
    }

    /** 将 HTML 中所有 data-i18n 属性的元素翻译 */
    function translateDOM() {
        // 文本内容
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = t(key);
        });
        // placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = t(key);
        });
        // HTML 内容（支持 <code> 等标签）
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            el.innerHTML = t(key);
        });
        // title 属性
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = t(key);
        });
        // 页面标题
        document.title = t('app.title');
    }

    async function setLang(lang) {
        currentLang = lang;
        localStorage.setItem('lang', lang);
        await loadLang(lang);
        translateDOM();
        // 更新语言选择器状态
        document.querySelectorAll('.lang-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    }

    function getLang() {
        return currentLang;
    }

    /** 初始化 */
    async function init() {
        await loadLang(currentLang);
        translateDOM();
        buildLangSwitcher();
    }

    /** 构建语言切换器 */
    function buildLangSwitcher() {
        const langs = [
            { code: 'zh', label: '中文' },
            { code: 'en', label: 'EN' },
            { code: 'ja', label: '日本語' },
        ];

        // 查找或创建语言切换容器
        let container = document.getElementById('lang-switcher');
        if (!container) {
            container = document.createElement('div');
            container.id = 'lang-switcher';
            container.className = 'lang-switcher';

            const header = document.querySelector('.header');
            if (header) {
                header.appendChild(container);
            }
        }

        container.innerHTML = langs.map(l =>
            `<button class="lang-option ${l.code === currentLang ? 'active' : ''}"
                     data-lang="${l.code}"
                     onclick="I18n.setLang('${l.code}')">${l.label}</button>`
        ).join('');
    }

    return { init, setLang, getLang, t, translateDOM };
})();

// 自动初始化
document.addEventListener('DOMContentLoaded', () => I18n.init());
