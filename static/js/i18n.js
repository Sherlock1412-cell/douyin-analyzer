/**
 * i18n.js — 多语言国际化模块
 * 支持动态切换语言，自动检测浏览器语言
 */
const I18n = (() => {
    let currentLang = localStorage.getItem('lang') || detectLang();
    let translations = {};
    let loaded = {};
    let ready = null;
    let readyResolve = null;

    // 创建 ready promise
    ready = new Promise(resolve => { readyResolve = resolve; });

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
            if (lang !== 'zh') {
                await loadLang('zh');
            }
        }
    }

    function t(key, fallback) {
        return translations[key] || fallback || key;
    }

    function translateDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
        });
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.getAttribute('data-i18n-title'));
        });
        document.title = t('app.title');
    }

    async function setLang(lang) {
        currentLang = lang;
        localStorage.setItem('lang', lang);
        await loadLang(lang);
        translateDOM();
        document.querySelectorAll('.lang-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    }

    function getLang() { return currentLang; }

    async function init() {
        await loadLang(currentLang);
        translateDOM();
        buildLangSwitcher();
        readyResolve();
    }

    function buildLangSwitcher() {
        const langs = [
            { code: 'zh', label: '中文' },
            { code: 'en', label: 'EN' },
            { code: 'ja', label: '日本語' },
        ];

        let container = document.getElementById('lang-switcher');
        if (!container) {
            container = document.createElement('div');
            container.id = 'lang-switcher';
            container.className = 'lang-switcher';
            const header = document.querySelector('.header');
            if (header) header.appendChild(container);
        }

        container.innerHTML = langs.map(l =>
            `<button class="lang-option ${l.code === currentLang ? 'active' : ''}"
                     data-lang="${l.code}"
                     onclick="I18n.setLang('${l.code}')">${l.label}</button>`
        ).join('');
    }

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init, setLang, getLang, t, translateDOM, ready };
})();
