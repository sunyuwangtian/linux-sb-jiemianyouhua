// ==UserScript==
// @name         LINUX SB 现代化界面
// @namespace    https://linux.sb/
// @version      0.5.0
// @description  将 LINUX SB 重排为现代三栏卡片界面，全面对齐现代设计规范，保留原站登录、发帖、分页和主题功能。
// @author       You
// @match        https://linux.sb/*
// @match        https://www.linux.sb/*
// @icon         https://linux.sb/app/assets/index.svg
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const NS = 'lsb-modern';
  let scheduled = false;
  let disabled = false;
  let observer = null;
  let route = `${location.pathname}${location.search}`;

  const getValue = (key, fallback) => {
    try {
      return typeof GM_getValue === 'function'
        ? GM_getValue(`${NS}:${key}`, fallback)
        : JSON.parse(localStorage.getItem(`${NS}:${key}`) ?? JSON.stringify(fallback));
    } catch (_) { return fallback; }
  };

  const setValue = (key, value) => {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(`${NS}:${key}`, value);
      else localStorage.setItem(`${NS}:${key}`, JSON.stringify(value));
    } catch (_) {}
  };

  // SVG Icons
  const SVGS = {
    'home': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    'plus-circle': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
    'star': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    'code': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
    'folder': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
    'help': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    'bell': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`,
    'megaphone': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path></svg>`,
    'bookmark': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>`,
    'gear': `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    'crown': `<svg viewBox="0 0 24 24" width="22" height="22" fill="#fa8c16"><path d="M2 20h20v2H2v-2zm1.15-5C2.51 15 2 14.49 2 13.85c0-.34.14-.65.37-.88l3.14-3.14 3.78 4.72 4.71-7.07 4.71 7.07 3.78-4.72 3.14 3.14c.23.23.37.54.37.88 0 .64-.51 1.15-1.15 1.15H3.15z"></path></svg>`,
    'search': `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    'user': `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
    'clock': `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    'chat': `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
    'eye': `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    'thumbs-up': `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`,
    'dots-vertical': `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>`,
    'fire': `<svg viewBox="0 0 24 24" width="16" height="16" fill="#ff4d4f"><path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.784 1.399 8.169-7.333-3.856-7.333 3.856 1.4-8.169-5.934-5.784 8.2-1.192zm0 5.702l-2.099 4.253-4.693.682 3.396 3.31-.802 4.674 4.198-2.207 4.198 2.207-.802-4.674 3.396-3.31-4.693-.682z"></path></svg>`,
    'chart': `<svg viewBox="0 0 24 24" width="16" height="16" fill="#00b96b"><path d="M18 20V10H22V20H18ZM11 20V4H15V20H11ZM4 20V14H8V20H4Z"></path></svg>`,
    'people': `<svg viewBox="0 0 24 24" width="16" height="16" fill="#00b96b"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"></path></svg>`,
    'refresh': `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`,
    'bolt': `<svg viewBox="0 0 24 24" width="22" height="22" fill="#fa8c16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    'document': `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
    'award': `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`,
    'coin': `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-5 0c0 4 5 2 5 6a2.5 2.5 0 0 1-5 0"></path></svg>`,
    'calendar': `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
    'moon': `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
    'gift': `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>`,
    'logout': `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`
  };

  const getSvg = (name) => SVGS[name] || '';

  const css = `
    :root {
      --lsbm-accent: #00b96b;
      --lsbm-accent-hover: #00a85f;
      --lsbm-accent-soft: #e8f7f0;
      --lsbm-bg: #f5f7f9;
      --lsbm-panel: #ffffff;
      --lsbm-text: #1f2329;
      --lsbm-secondary: #4e5969;
      --lsbm-muted: #86909c;
      --lsbm-line: #eef1f4;
      --lsbm-radius: 14px;
      --lsbm-shadow: 0 4px 20px rgba(0, 0, 0, 0.025);
      --lsbm-page: 1540px;
    }
    html.${NS}[data-themes-color-mode="dark"] {
      --lsbm-accent: #51c995;
      --lsbm-accent-hover: #6dd9a9;
      --lsbm-accent-soft: #18382c;
      --lsbm-bg: #141719;
      --lsbm-panel: #1e2225;
      --lsbm-text: #e6ebed;
      --lsbm-secondary: #a6b2ba;
      --lsbm-muted: #72808a;
      --lsbm-line: #2b3236;
      --lsbm-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
    }
    html.${NS}, html.${NS} body {
      background: var(--lsbm-bg) !important;
      color: var(--lsbm-text) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
    }

    /* Top Navigation Header */
    html.${NS} .top {
      position: sticky;
      top: 0;
      z-index: 1000;
      height: 64px;
      background: var(--lsbm-panel) !important;
      border-bottom: 1px solid var(--lsbm-line);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02) !important;
    }
    html.${NS} .top .bar {
      position: relative;
      max-width: var(--lsbm-page);
      height: 64px;
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    html.${NS} .top .brand {
      min-width: 170px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--lsbm-text);
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.3px;
      text-decoration: none;
    }
    html.${NS} .top .brand::before {
      content: "";
      width: 28px;
      height: 28px;
      flex: 0 0 28px !important;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='28' height='28'%3E%3Cdefs%3E%3ClinearGradient id='bolt' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23fa8c16'/%3E%3Cstop offset='100%25' stop-color='%23faad14'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpolygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2' fill='url(%23bolt)'/%3E%3C/svg%3E") center/contain no-repeat;
    }
    html.${NS} .top .forum-nav, html.${NS} .top .forum-more-toggle, html.${NS} .forum-more-region {
      display: none !important;
    }
    html.${NS} .top .search-form {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(520px, 36vw) !important;
      height: 38px !important;
      margin: 0 !important;
      display: flex;
      align-items: center;
      border: 1px solid transparent !important;
      border-radius: 20px !important;
      background: var(--lsbm-bg) !important;
      padding: 0 12px 0 36px !important;
      transition: all 0.2s ease;
      z-index: 10;
    }
    html.${NS} .top .search-form::before {
      content: "";
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='%2386909c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'%3E%3C/circle%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'%3E%3C/line%3E%3C/svg%3E") center/contain no-repeat;
      pointer-events: none;
    }
    html.${NS} .top .search-form:focus-within {
      background: #ffffff !important;
      border-color: var(--lsbm-accent) !important;
      box-shadow: 0 0 0 3px rgba(0, 185, 107, 0.12);
    }
    html.${NS} .top .search-field {
      display: none !important;
    }
    html.${NS} .top .search-input {
      width: 100% !important;
      height: 100% !important;
      border: 0 !important;
      outline: 0 !important;
      background: transparent !important;
      color: var(--lsbm-text) !important;
      font-size: 13px !important;
      padding: 0 !important;
    }
    html.${NS} .top .search-btn {
      width: 22px;
      height: 22px;
      border: 0 !important;
      background: transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='%2386909c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'%3E%3C/circle%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'%3E%3C/line%3E%3C/svg%3E") center/14px no-repeat !important;
      font-size: 0;
      cursor: pointer;
      opacity: 0.7;
    }
    html.${NS} .top .search-btn:hover {
      opacity: 1;
    }

    /* Header Right Actions */
    .${NS}__top-actions {
      order: 3;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-left: auto;
      white-space: nowrap;
    }
    .${NS}__top-actions a {
      color: var(--lsbm-secondary);
      font-size: 13px;
      text-decoration: none;
      padding: 6px 8px;
      border-radius: 6px;
      transition: color 0.15s;
    }
    .${NS}__top-actions a:hover {
      color: var(--lsbm-accent);
    }
    .${NS}__icon-btn {
      position: relative;
      width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      color: var(--lsbm-secondary);
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
    }
    .${NS}__icon-btn:hover {
      background: var(--lsbm-bg);
      color: var(--lsbm-accent);
    }
    .${NS}__badge-dot {
      position: absolute;
      top: 1px;
      right: 1px;
      background: var(--lsbm-accent);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      height: 16px;
      min-width: 16px;
      padding: 0 4px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      box-shadow: 0 0 0 2px var(--lsbm-panel);
    }
    html.${NS} .top .nav-mine {
      display: flex;
      align-items: center;
      text-decoration: none;
      padding: 0;
      cursor: pointer;
    }
    html.${NS} .top .nav-mine .${NS}__header-avatar,
    html.${NS} .top .nav-mine img {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: cover;
      transition: transform 0.15s ease;
    }
    .${NS}__user-menu-wrap {
      position: relative;
      order: 4;
      margin-left: 4px;
    }
    .${NS}__user-menu-wrap:hover .${NS}__header-avatar {
      transform: scale(1.05);
    }
    .${NS}__user-menu-wrap:hover .${NS}__user-dropdown,
    .${NS}__user-menu-wrap:focus-within .${NS}__user-dropdown,
    .${NS}__user-dropdown.is-open {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
      transform: translateY(0);
    }
    .${NS}__user-dropdown {
      position: absolute;
      right: 0;
      top: calc(100% + 10px);
      width: 230px;
      border-radius: 14px;
      background: var(--lsbm-panel);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.12);
      border: 1px solid var(--lsbm-line);
      padding: 8px;
      z-index: 2000;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
      transform: translateY(8px);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .${NS}__user-dropdown::before {
      content: "";
      position: absolute;
      top: -12px;
      left: 0;
      right: 0;
      height: 12px;
    }
    .${NS}__ud-header {
      padding: 8px 10px;
    }
    .${NS}__ud-user-top {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .${NS}__ud-name {
      font-size: 15px;
      font-weight: 750;
      color: var(--lsbm-text);
    }
    .${NS}__ud-badge {
      padding: 1px 6px;
      border-radius: 4px;
      background: #f0f2f5;
      color: #4e5969;
      font-size: 10.5px;
      font-weight: 500;
    }
    .${NS}__ud-level {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      background: #252a31;
      color: #fff;
      font-size: 9px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .${NS}__ud-meta {
      font-size: 11px;
      color: var(--lsbm-muted);
      margin-top: 4px;
    }
    .${NS}__ud-divider {
      height: 1px;
      margin: 5px 4px;
      background: var(--lsbm-line);
    }
    .${NS}__ud-group {
      display: grid;
      gap: 2px;
    }
    .${NS}__ud-item {
      width: 100%;
      padding: 7px 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--lsbm-secondary);
      font-size: 13px;
      font-weight: 500;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s;
      box-sizing: border-box;
    }
    .${NS}__ud-item svg {
      opacity: 0.75;
      flex-shrink: 0;
    }
    .${NS}__ud-item:hover {
      background: var(--lsbm-accent-soft);
      color: var(--lsbm-accent);
    }
    .${NS}__ud-item:hover svg {
      opacity: 1;
      stroke: var(--lsbm-accent);
    }
    .${NS}__ud-item--danger:hover {
      background: #fff1f0;
      color: #ff4d4f;
    }
    .${NS}__ud-item--danger:hover svg {
      stroke: #ff4d4f;
    }
    .${NS}__ud-count {
      margin-left: auto;
      color: var(--lsbm-muted);
      font-size: 11px;
      font-weight: 600;
    }
    .${NS}__ud-tag {
      margin-left: auto;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10.5px;
      background: #fff7e6;
      color: #fa8c16;
      border: 1px solid #ffd591;
    }
    .${NS}__ud-tag.is-done {
      background: #e8f7f0;
      color: #00b96b;
      border-color: #b7eb8f;
    }
    html.${NS} .top .nav-mine span:not(.${NS}__header-avatar) {
      display: none !important;
    }

    /* Main Layout Grid */
    html.${NS} main.wrap {
      box-sizing: border-box;
      width: 100%;
      max-width: var(--lsbm-page) !important;
      margin: 0 auto !important;
      padding: 16px 20px 48px !important;
    }
    html.${NS} .forum-layout.${NS}__layout {
      display: grid !important;
      grid-template-columns: 218px minmax(580px, 1fr) 340px !important;
      gap: 16px !important;
      align-items: start;
    }
    html.${NS} .forum-layout.${NS}__layout > .forum-main {
      grid-column: 2;
      min-width: 0;
    }
    html.${NS} .forum-layout.${NS}__layout > .sidebar {
      grid-column: 3;
      width: auto !important;
      min-width: 0;
      position: sticky;
      top: 80px;
    }
    html.${NS} .forum-main, html.${NS} .main-panel {
      min-width: 0;
      width: auto !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    html.${NS} .mobile-forum-strip {
      display: none !important;
    }

    /* Left Sidebar Navigation */
    .${NS}__left {
      grid-column: 1;
      grid-row: 1;
      position: sticky;
      top: 80px;
    }
    .${NS}__left-panel {
      padding: 12px;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--lsbm-line);
      border-radius: var(--lsbm-radius);
      background: var(--lsbm-panel);
      box-shadow: var(--lsbm-shadow);
      min-height: calc(100vh - 100px);
    }
    .${NS}__nav {
      display: grid;
      gap: 4px;
    }
    .${NS}__nav a,
    .${NS}__nav button,
    .${NS}__left-panel a,
    .${NS}__left-panel button {
      min-height: 44px;
      padding: 0 14px !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
      border-radius: 10px !important;
      background: transparent !important;
      color: var(--lsbm-secondary) !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      text-align: left !important;
      text-decoration: none !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .${NS}__nav a:hover,
    .${NS}__nav button:hover,
    .${NS}__left-panel a:hover,
    .${NS}__left-panel button:hover {
      color: var(--lsbm-accent) !important;
      background: var(--lsbm-accent-soft) !important;
    }
    .${NS}__nav a.is-active,
    .${NS}__nav button.is-active {
      color: var(--lsbm-accent) !important;
      background: var(--lsbm-accent-soft) !important;
      font-weight: 700 !important;
    }
    .${NS}__nav a.is-active svg,
    .${NS}__nav button.is-active svg {
      stroke: var(--lsbm-accent) !important;
    }
    .${NS}__separator {
      height: 1px;
      margin: 8px 10px;
      background: var(--lsbm-line);
    }

    /* Left Sidebar VIP Card */
    .${NS}__vip-card {
      margin-top: auto;
      padding: 14px;
      border: 1px solid #f6e8cc;
      border-radius: 12px;
      background: linear-gradient(180deg, #fffdf8 0%, #fff9ec 100%);
    }
    html.${NS}[data-themes-color-mode="dark"] .${NS}__vip-card {
      border-color: #3d3522;
      background: linear-gradient(180deg, #221e16 0%, #1a1711 100%);
    }
    .${NS}__vip-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .${NS}__vip-crown {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: #fff4db;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .${NS}__vip-title-wrap {
      min-width: 0;
    }
    .${NS}__vip-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--lsbm-text);
      line-height: 1.2;
    }
    .${NS}__vip-subtitle {
      font-size: 11px;
      color: var(--lsbm-muted);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .${NS}__vip-btn {
      width: 100%;
      height: 34px;
      margin-top: 10px;
      border: 0;
      border-radius: 8px;
      background: var(--lsbm-accent);
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .${NS}__vip-btn:hover {
      background: var(--lsbm-accent-hover);
    }

    /* Left Sidebar Signature Card */
    .${NS}__signature-card {
      margin-top: auto;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-radius: 10px;
      background: var(--lsbm-bg);
      border: 1px solid var(--lsbm-line);
    }
    .${NS}__signature-logo {
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
    }
    .${NS}__signature-text {
      min-width: 0;
    }
    .${NS}__signature-name {
      font-size: 12px;
      font-weight: 700;
      color: var(--lsbm-text);
      line-height: 1.2;
    }
    .${NS}__signature-slogan {
      font-size: 10px;
      color: var(--lsbm-muted);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Topic Toolbar / Tabs */
    html.${NS} .topic-toolbar {
      min-height: 52px;
      margin: 0 0 10px !important;
      padding: 6px 10px !important;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1px solid var(--lsbm-line) !important;
      border-radius: var(--lsbm-radius) !important;
      background: var(--lsbm-panel) !important;
      box-shadow: var(--lsbm-shadow);
    }
    html.${NS} .tab-bar {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    html.${NS} .tab-bar .tab {
      padding: 7px 14px;
      border: 0 !important;
      border-radius: 8px;
      color: var(--lsbm-secondary);
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.15s;
    }
    html.${NS} .tab-bar .tab:hover {
      background: var(--lsbm-bg);
      color: var(--lsbm-text);
    }
    html.${NS} .tab-bar .tab.active {
      background: var(--lsbm-accent) !important;
      color: #fff !important;
      font-weight: 600;
    }
    .${NS}__toolbar-filter {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      color: var(--lsbm-muted);
      font-size: 12px;
      cursor: pointer;
      border-radius: 6px;
    }
    .${NS}__toolbar-filter:hover {
      color: var(--lsbm-text);
      background: var(--lsbm-bg);
    }

    /* Post / Topic List */
    html.${NS} .post-list {
      display: flex !important;
      flex-direction: column !important;
      gap: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      background: var(--lsbm-panel) !important;
      border: 1px solid var(--lsbm-line) !important;
      border-radius: var(--lsbm-radius) !important;
      box-shadow: var(--lsbm-shadow) !important;
      overflow: hidden !important;
      list-style: none;
    }
    html.${NS} .post-list > .post-item {
      min-height: 64px;
      margin: 0 !important;
      padding: 12px 18px !important;
      display: grid !important;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      border: 0 !important;
      border-bottom: 1px solid var(--lsbm-line) !important;
      border-radius: 0 !important;
      background: var(--lsbm-panel) !important;
      box-shadow: none !important;
      transition: background 0.15s ease;
    }
    html.${NS} .post-list > .post-item:last-child {
      border-bottom: 0 !important;
    }
    html.${NS} .post-list > .post-item:hover {
      background: var(--lsbm-bg) !important;
    }
    html.${NS} .post-avatar {
      width: 42px !important;
      height: 42px !important;
      margin: 0 !important;
      flex-shrink: 0;
    }
    html.${NS} .post-avatar .avatar-img,
    html.${NS} .post-avatar img {
      width: 42px !important;
      height: 42px !important;
      border-radius: 10px !important;
      object-fit: cover;
    }
    html.${NS} .post-body {
      min-width: 0;
    }
    html.${NS} .post-title-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    html.${NS} .post-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--lsbm-text) !important;
      font-size: 14.5px !important;
      font-weight: 600 !important;
      text-decoration: none;
    }
    html.${NS} .post-title:hover {
      color: var(--lsbm-accent) !important;
    }

    /* Badges */
    html.${NS} .topic-badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
    }
    html.${NS} .topic-badge.pinned {
      background: var(--lsbm-accent-soft) !important;
      color: var(--lsbm-accent) !important;
    }
    .${NS}__tag-hot {
      display: inline-flex;
      align-items: center;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      background: #fff2e8;
      color: #fa541c;
      border: 1px solid #ffbb96;
      flex-shrink: 0;
    }
    .${NS}__tag-unread {
      display: inline-flex;
      align-items: center;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      background: #e8f7f0;
      color: #00b96b;
      border: 1px solid #b7eb8f;
      flex-shrink: 0;
    }
    .${NS}__tag-lottery {
      display: inline-flex;
      align-items: center;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      background: #fff7e6;
      color: #fa8c16;
      border: 1px solid #ffd591;
      flex-shrink: 0;
    }

    /* Meta Info */
    html.${NS} .post-meta {
      margin-top: 4px !important;
      display: flex;
      align-items: center;
      gap: 6px !important;
      color: var(--lsbm-muted) !important;
      font-size: 12px !important;
      line-height: 1.3;
    }
    html.${NS} .post-meta .meta-author {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--lsbm-secondary);
    }
    html.${NS} .post-meta .meta-author svg {
      opacity: 0.7;
    }
    html.${NS} .post-meta .meta-dot {
      color: var(--lsbm-line);
    }
    html.${NS} .post-meta .meta-time {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--lsbm-muted);
    }
    html.${NS} .post-meta .meta-time svg {
      opacity: 0.6;
    }
    html.${NS} .post-tag {
      display: none !important;
    }

    /* Post Row Right Metrics */
    .${NS}__row-metrics {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
      color: var(--lsbm-muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .${NS}__row-metric {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 42px;
    }
    .${NS}__row-metric svg {
      opacity: 0.65;
    }
    .${NS}__row-more-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      color: var(--lsbm-muted);
      cursor: pointer;
      transition: background 0.15s;
    }
    .${NS}__row-more-btn:hover {
      background: var(--lsbm-bg);
      color: var(--lsbm-text);
    }
    html.${NS} .post-meta > .${NS}__moved {
      display: none !important;
    }

    /* Sidebar Cards */
    html.${NS} .sidebar {
      display: grid !important;
      gap: 14px !important;
    }
    html.${NS} .sidebar > .card {
      margin: 0 !important;
      border: 1px solid var(--lsbm-line) !important;
      border-radius: var(--lsbm-radius) !important;
      background: var(--lsbm-panel) !important;
      box-shadow: var(--lsbm-shadow) !important;
      overflow: hidden;
    }
    html.${NS} .sidebar-card .quick-wrap,
    html.${NS} .sidebar-card .stats-wrap,
    html.${NS} .sidebar-card .online-users-wrap {
      padding: 16px !important;
    }

    /* User Profile Card */
    html.${NS} .sidebar .user-card {
      order: -10;
      position: relative;
    }
    html.${NS} .sidebar .user-card::before {
      content: "";
      position: absolute;
      right: 0;
      top: 0;
      width: 120px;
      height: 120px;
      background: radial-gradient(circle at 100% 0%, rgba(0, 185, 107, 0.08) 0%, transparent 70%);
      pointer-events: none;
    }
    html.${NS} .user-card .user-wrap {
      padding: 18px !important;
    }
    html.${NS} .user-header {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    html.${NS} .user-avatar-big,
    html.${NS} .user-header .avatar-img,
    html.${NS} .user-header img {
      width: 52px !important;
      height: 52px !important;
      border-radius: 50% !important;
      object-fit: cover;
    }
    .${NS}__user-info-top {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    html.${NS} .user-name {
      font-size: 16px !important;
      font-weight: 750 !important;
      color: var(--lsbm-text) !important;
    }
    .${NS}__user-tag {
      padding: 1px 6px;
      border-radius: 4px;
      background: #f0f2f5;
      color: #4e5969;
      font-size: 11px;
      font-weight: 500;
    }
    .${NS}__user-level-badge {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      background: #252a31;
      color: #fff;
      font-size: 9px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    html.${NS} .user-rank {
      font-size: 12px !important;
      color: var(--lsbm-muted) !important;
      margin-top: 4px;
    }
    .${NS}__profile-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin-top: 18px;
      text-align: center;
    }
    .${NS}__profile-stat {
      min-width: 0;
    }
    .${NS}__profile-stat strong {
      display: block;
      color: var(--lsbm-accent);
      font-size: 18px;
      font-weight: 750;
      line-height: 1.2;
    }
    .${NS}__profile-stat span {
      display: block;
      margin-top: 4px;
      color: var(--lsbm-muted);
      font-size: 11.5px;
    }
    .${NS}__user-cta {
      width: 100% !important;
      height: 38px !important;
      margin-top: 16px !important;
      border: 0 !important;
      border-radius: 8px !important;
      background: var(--lsbm-accent) !important;
      color: #ffffff !important;
      font-size: 13.5px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: background 0.15s !important;
      box-shadow: none !important;
    }
    .${NS}__user-cta:hover {
      background: var(--lsbm-accent-hover) !important;
    }
    /* Hide all extra native actions, menus, duplicate post buttons on live site */
    html.${NS} .user-card .user-wrap > :not(.user-header):not(.${NS}__profile-stats):not(.${NS}__user-cta),
    html.${NS} .user-card .user-actions,
    html.${NS} .user-card .user-menu,
    html.${NS} .user-card .user-nav,
    html.${NS} .user-card .side-auth,
    html.${NS} .user-card .side-publish,
    html.${NS} .user-card .side-publish-btn,
    html.${NS} .user-card > a.create-topic,
    html.${NS} .user-card a[href*="topic_create"],
    html.${NS} .user-card a[href*="topic/create"],
    html.${NS} .user-card a[href*="topic/add"],
    html.${NS} .stats-card {
      display: none !important;
    }

    /* Card Headings */
    .${NS}__card-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .${NS}__card-title-group {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 750;
      color: var(--lsbm-text);
    }
    .${NS}__card-action {
      display: flex;
      align-items: center;
      gap: 4px;
      border: 0;
      background: transparent;
      color: var(--lsbm-muted);
      font-size: 11.5px;
      text-decoration: none;
      cursor: pointer;
      transition: color 0.15s;
    }
    .${NS}__card-action:hover {
      color: var(--lsbm-accent);
    }

    /* Hot Topics Card */
    html.${NS} .daily-hot-topics-card {
      order: -9;
    }
    html.${NS} .daily-hot-topics-head,
    html.${NS} .daily-hot-topics-card .quick-title,
    html.${NS} .daily-hot-topics-card .card-head {
      display: none !important;
    }
    html.${NS} .daily-hot-topics-list {
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
      padding: 0 !important;
      margin: 0 !important;
      list-style: none !important;
    }
    html.${NS} .daily-hot-topics-list > li {
      margin: 0 !important;
      padding: 0 !important;
      list-style: none !important;
    }
    html.${NS} .daily-hot-topics-list > li:nth-child(n+6) {
      display: none !important;
    }
    html.${NS} .daily-hot-topics-list > li > a,
    html.${NS} .daily-hot-topics-list a {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 8px !important;
      padding: 4px 0 !important;
      text-decoration: none !important;
      color: var(--lsbm-text) !important;
      font-size: 13px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    html.${NS} .daily-hot-topics-list .${NS}__hot-rank {
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      flex: 0 0 18px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 4px !important;
      background: #8c9ba5 !important;
      color: #ffffff !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      line-height: 1 !important;
    }
    html.${NS} .daily-hot-topics-list > li:nth-child(1) .${NS}__hot-rank {
      background: #ff4d4f !important;
    }
    html.${NS} .daily-hot-topics-list > li:nth-child(2) .${NS}__hot-rank {
      background: #fa8c16 !important;
    }
    html.${NS} .daily-hot-topics-list > li:nth-child(3) .${NS}__hot-rank {
      background: #faad14 !important;
    }
    html.${NS} .daily-hot-topics-list .daily-hot-topics-title,
    html.${NS} .daily-hot-topics-list a span:not(.${NS}__hot-rank):not(.daily-hot-topics-count) {
      flex: 1 1 auto !important;
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: var(--lsbm-text) !important;
      font-size: 13px !important;
    }
    html.${NS} .daily-hot-topics-list a:hover .daily-hot-topics-title,
    html.${NS} .daily-hot-topics-list a:hover span:not(.${NS}__hot-rank):not(.daily-hot-topics-count) {
      color: var(--lsbm-accent) !important;
    }
    html.${NS} .daily-hot-topics-list .daily-hot-topics-count {
      flex: 0 0 auto !important;
      margin-left: auto !important;
      color: var(--lsbm-muted) !important;
      font-size: 11.5px !important;
      white-space: nowrap !important;
    }

    /* Forum Stats Grid Card */
    html.${NS} .forum-enhancements-sidebar-card {
      order: -8;
    }
    html.${NS} .forum-enhancements-sidebar-list {
      display: grid !important;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px !important;
      padding: 0 !important;
      margin: 0 !important;
      list-style: none;
    }
    html.${NS} .forum-enhancements-sidebar-list a {
      min-height: 48px;
      padding: 8px 4px !important;
      display: flex !important;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--lsbm-bg);
      text-align: center;
      text-decoration: none;
      transition: background 0.15s;
    }
    html.${NS} .forum-enhancements-sidebar-list a:hover {
      background: var(--lsbm-accent-soft);
    }
    html.${NS} .forum-enhancements-sidebar-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--lsbm-secondary);
      line-height: 1.2;
    }
    html.${NS} .forum-enhancements-sidebar-count {
      color: var(--lsbm-muted);
      font-size: 11px;
      margin-top: 2px;
    }

    /* Active Users Card */
    html.${NS} .online-users-card {
      order: -7;
      display: block !important;
    }
    html.${NS} .online-users-head {
      display: none !important;
    }
    html.${NS} .online-users-grid {
      display: flex !important;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
    html.${NS} .online-users-item {
      flex: 0 0 38px;
      min-width: 38px;
      text-decoration: none;
    }
    html.${NS} .online-users-avatar,
    html.${NS} .online-users-avatar img {
      width: 38px !important;
      height: 38px !important;
      border-radius: 50% !important;
      object-fit: cover;
    }
    html.${NS} .online-users-name {
      display: none !important;
    }
    .${NS}__more-users-btn {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--lsbm-bg);
      color: var(--lsbm-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 750;
      cursor: pointer;
      text-decoration: none;
    }
    html.${NS} .online-users-more {
      margin-top: 12px;
      color: var(--lsbm-muted);
      font-size: 12px;
      text-align: center;
    }

    /* Footer */
    .${NS}__footer {
      max-width: var(--lsbm-page);
      margin: 32px auto 0;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--lsbm-muted);
      font-size: 12px;
    }
    .${NS}__footer-links {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .${NS}__footer-links a {
      color: var(--lsbm-muted);
      text-decoration: none;
      transition: color 0.15s;
    }
    .${NS}__footer-links a:hover {
      color: var(--lsbm-accent);
    }
    .${NS}__footer-copy {
      color: var(--lsbm-muted);
    }

    /* Pagination */
    html.${NS} .pagination-bar {
      margin-top: 16px;
    }
    html.${NS} .pagination ul {
      display: flex;
      gap: 6px;
      padding: 0;
      list-style: none;
    }
    html.${NS} .pagination a {
      display: block;
      padding: 6px 12px;
      border-radius: 8px;
      background: var(--lsbm-panel);
      border: 1px solid var(--lsbm-line);
      color: var(--lsbm-text);
      font-size: 13px;
      text-decoration: none;
    }
    html.${NS} .pagination a:hover {
      border-color: var(--lsbm-accent);
      color: var(--lsbm-accent);
    }

    /* Mobile settings */
    .${NS}__settings {
      display: none;
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 1200;
    }
    .${NS}__settings-toggle {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--lsbm-line);
      border-radius: 50%;
      background: var(--lsbm-panel);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
      cursor: pointer;
    }
    .${NS}__settings-menu {
      position: absolute;
      right: 0;
      bottom: 54px;
      width: 190px;
      padding: 8px;
      display: none;
      border: 1px solid var(--lsbm-line);
      border-radius: 12px;
      background: var(--lsbm-panel);
      box-shadow: var(--lsbm-shadow);
    }
    .${NS}__settings.is-open .${NS}__settings-menu {
      display: grid;
      gap: 4px;
    }
    .${NS}__settings-menu button {
      padding: 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--lsbm-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .${NS}__settings-menu button:hover {
      background: var(--lsbm-accent-soft);
    }

    @media (max-width: 1240px) {
      html.${NS} .forum-layout.${NS}__layout {
        grid-template-columns: 76px minmax(520px, 1fr) 280px !important;
      }
      .${NS}__left-panel {
        padding: 8px;
      }
      .${NS}__nav a, .${NS}__nav button {
        justify-content: center;
        padding: 0;
      }
      .${NS}__nav-label, .${NS}__vip-card, .${NS}__signature-card {
        display: none;
      }
      html.${NS} .top .brand {
        min-width: 76px;
      }
    }
    @media (max-width: 980px) {
      html.${NS} .forum-layout.${NS}__layout {
        grid-template-columns: 68px minmax(0, 1fr) !important;
      }
      html.${NS} .forum-layout > .sidebar {
        display: none !important;
      }
    }
    @media (max-width: 720px) {
      .${NS}__settings {
        display: block;
      }
      .${NS}__top-actions {
        display: none;
      }
      html.${NS} .top, html.${NS} .top .bar {
        height: 56px;
      }
      html.${NS} .top .search-form {
        display: none !important;
      }
      html.${NS} main.wrap {
        padding: 9px 8px 80px !important;
      }
      html.${NS} .forum-layout.${NS}__layout {
        display: block !important;
      }
      .${NS}__left {
        position: fixed;
        inset: auto 8px 8px;
        z-index: 1100;
      }
      .${NS}__left-panel {
        min-height: 0;
        padding: 6px;
      }
      .${NS}__nav {
        grid-template-columns: repeat(5, 1fr);
      }
      .${NS}__nav > * {
        display: none !important;
      }
      .${NS}__nav > a:nth-child(1), .${NS}__nav > button[data-lsb-new], .${NS}__nav > a:nth-child(3), .${NS}__nav > a:nth-child(5), .${NS}__nav > a:nth-child(7) {
        display: flex !important;
      }
      .${NS}__nav a, .${NS}__nav button {
        min-height: 46px;
      }
      html.${NS} .topic-toolbar {
        overflow-x: auto;
      }
      html.${NS} .tab-bar {
        min-width: max-content;
      }
      html.${NS} .post-list > .post-item {
        grid-template-columns: 40px minmax(0, 1fr) !important;
        padding: 10px !important;
      }
      .${NS}__row-metrics {
        display: none;
      }
      .${NS}__footer {
        flex-direction: column;
        gap: 8px;
        text-align: center;
      }
    }
  `;

  function addStyles() {
    if (document.getElementById(`${NS}-style`)) return;
    if (typeof GM_addStyle === 'function') {
      const node = GM_addStyle(css);
      if (node) node.id = `${NS}-style`;
    } else {
      const node = document.createElement('style');
      node.id = `${NS}-style`;
      node.textContent = css;
      document.head.append(node);
    }
  }

  const navItem = (href, svgKey, label, active = false) =>
    `<a href="${href}" class="${active ? 'is-active' : ''}">${getSvg(svgKey)}<span class="${NS}__nav-label">${label}</span></a>`;

  function isActive(path) {
    if (path === '/') return (location.pathname === '/' && !location.search) || location.protocol === 'file:';
    return `${location.pathname}${location.search}`.startsWith(path);
  }

  function buildLeft() {
    const node = document.createElement('aside');
    node.className = `${NS}__left`;
    node.setAttribute('aria-label', '主导航');
    node.innerHTML = `
      <div class="${NS}__left-panel">
        <nav class="${NS}__nav">
          ${navItem('/', 'home', '首页', isActive('/'))}
          <button type="button" data-lsb-new>${getSvg('plus-circle')}<span class="${NS}__nav-label">新帖</span></button>
          ${navItem('/topic_featured', 'star', '精选', isActive('/topic_featured'))}
          <div class="${NS}__separator"></div>
          ${navItem('/forum/4', 'code', '技术交流', isActive('/forum/4'))}
          ${navItem('/forum/3', 'folder', '资源分享', isActive('/forum/3'))}
          ${navItem('/forum/5', 'help', '求助问答', isActive('/forum/5'))}
          ${navItem('/forum/9', 'megaphone', '社区公告', isActive('/forum/9'))}
          <div class="${NS}__separator"></div>
          ${navItem('/favorites', 'bookmark', '收藏', isActive('/favorites'))}
          <button type="button" data-lsb-settings>${getSvg('gear')}<span class="${NS}__nav-label">设置</span></button>
        </nav>
        <div class="${NS}__signature-card">
          <div class="${NS}__signature-logo">${getSvg('bolt')}</div>
          <div class="${NS}__signature-text">
            <div class="${NS}__signature-name">LINUX SB</div>
            <div class="${NS}__signature-slogan">让技术连接每一位开发者</div>
          </div>
        </div>
      </div>`;
    return node;
  }

  function buildFooter() {
    if (document.querySelector(`.${NS}__footer`)) return;
    const footer = document.createElement('footer');
    footer.className = `${NS}__footer`;
    footer.innerHTML = `
      <div class="${NS}__footer-links">
        <a href="/links">友情链接</a>
        <a href="/help">帮助中心</a>
        <a href="/app">APP 下载</a>
        <a href="/about">关于我们</a>
      </div>
      <div class="${NS}__footer-copy">© 2024 LINUX SB · 让技术连接每一位开发者</div>
    `;
    const mainWrap = document.querySelector('main.wrap');
    if (mainWrap) {
      mainWrap.after(footer);
    } else {
      document.body.append(footer);
    }
  }

  function buildSettings() {
    const node = document.createElement('div');
    node.className = `${NS}__settings`;
    node.innerHTML = `
      <div class="${NS}__settings-menu">
        <button type="button" data-lsb-action="compact">切换紧凑模式</button>
        <button type="button" data-lsb-action="right">显示 / 隐藏右栏</button>
        <button type="button" data-lsb-action="disable">本页恢复原样</button>
      </div>
      <button type="button" class="${NS}__settings-toggle" aria-label="界面设置" aria-expanded="false">${getSvg('gear')}</button>
    `;
    return node;
  }

  function enhanceHeader() {
    const bar = document.querySelector('.top .bar');
    if (!bar) return;
    const mine = bar.querySelector('.nav-mine');
    
    // Top right actions
    let actions = bar.querySelector(`.${NS}__top-actions`);
    if (!actions) {
      actions = document.createElement('nav');
      actions.className = `${NS}__top-actions`;
      actions.setAttribute('aria-label', '快捷入口');
      actions.innerHTML = `
        <a href="/leaderboard">用户榜单</a>
        <a href="/invite_code">邀请中心</a>
        <a href="/notifications" class="${NS}__icon-btn" title="通知与消息">
          ${getSvg('bell')}
          <span class="${NS}__badge-dot">3</span>
        </a>
      `;
      bar.insertBefore(actions, mine || null);
    }

    if (mine) {
      let wrap = mine.closest(`.${NS}__user-menu-wrap`);
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = `${NS}__user-menu-wrap`;
        mine.before(wrap);
        wrap.append(mine);

        let avatar = mine.querySelector(`.${NS}__header-avatar`);
        if (!avatar) {
          avatar = document.createElement('img');
          avatar.className = `${NS}__header-avatar`;
          avatar.src = 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=token';
          avatar.alt = 'token';
          mine.innerHTML = '';
          mine.append(avatar);
        }

        const isChecked = getValue('checkedIn', false);
        const dropdown = document.createElement('div');
        dropdown.className = `${NS}__user-dropdown`;
        dropdown.innerHTML = `
          <div class="${NS}__ud-header">
            <div class="${NS}__ud-user-top">
              <span class="${NS}__ud-name">token</span>
              <span class="${NS}__ud-badge">吃瓜群众</span>
              <span class="${NS}__ud-level">N</span>
            </div>
            <div class="${NS}__ud-meta">创作者 · 积分 2500 · 经验 1280</div>
          </div>
          <div class="${NS}__ud-divider"></div>
          <div class="${NS}__ud-group">
            <a href="/my/topics" class="${NS}__ud-item">${getSvg('document')}<span>我的主题</span><span class="${NS}__ud-count">12</span></a>
            <a href="/my/replies" class="${NS}__ud-item">${getSvg('chat')}<span>我的回帖</span><span class="${NS}__ud-count">56</span></a>
            <a href="/favorites" class="${NS}__ud-item">${getSvg('bookmark')}<span>我的收藏</span><span class="${NS}__ud-count">128</span></a>
            <a href="/my/badges" class="${NS}__ud-item">${getSvg('award')}<span>我的称号</span></a>
            <a href="/my/points" class="${NS}__ud-item">${getSvg('coin')}<span>我的积分</span></a>
          </div>
          <div class="${NS}__ud-divider"></div>
          <div class="${NS}__ud-group">
            <button type="button" class="${NS}__ud-item" data-lsb-action="checkin">${getSvg('calendar')}<span>每日签到</span><span class="${NS}__ud-tag ${isChecked ? 'is-done' : ''}">${isChecked ? '已签到' : '未签到'}</span></button>
            <a href="/notifications" class="${NS}__ud-item">${getSvg('bell')}<span>我的通知</span></a>
            <a href="/invite_code" class="${NS}__ud-item">${getSvg('gift')}<span>邀请中心</span></a>
            <a href="/leaderboard" class="${NS}__ud-item">${getSvg('chart')}<span>用户榜单</span></a>
            <button type="button" class="${NS}__ud-item" data-lsb-action="toggle-theme">${getSvg('moon')}<span>主题切换</span></button>
          </div>
          <div class="${NS}__ud-divider"></div>
          <div class="${NS}__ud-group">
            <a href="/settings" class="${NS}__ud-item">${getSvg('gear')}<span>个人设置</span></a>
            <a href="/logout" class="${NS}__ud-item ${NS}__ud-item--danger">${getSvg('logout')}<span>退出登录</span></a>
          </div>
        `;
        wrap.append(dropdown);
      }
    }
  }

  function enhanceUserCard() {
    const card = document.querySelector('.sidebar .user-card .user-wrap');
    if (!card) return;
    const loggedOut = Boolean(card.querySelector('.side-auth a[href="/login"]'));

    // Reconstruct user header
    let userHeader = card.querySelector('.user-header');
    if (userHeader && !userHeader.querySelector(`.${NS}__user-info-top`)) {
      const avatarImg = userHeader.querySelector('img.avatar-img') || userHeader.querySelector('img');
      const userNameElem = userHeader.querySelector('.user-name');
      const userName = userNameElem ? userNameElem.textContent.trim() : 'token';
      
      userHeader.innerHTML = `
        <img class="avatar-img" src="${avatarImg ? avatarImg.src : 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=token'}" alt="${userName}">
        <div class="user-info-wrap">
          <div class="${NS}__user-info-top">
            <span class="user-name">${userName}</span>
            <span class="${NS}__user-tag">吃瓜群众</span>
            <span class="${NS}__user-level-badge">N</span>
          </div>
          <div class="user-rank">积分 2500　|　经验 1280</div>
        </div>
      `;
    }

    if (!loggedOut && !card.querySelector(`.${NS}__profile-stats`)) {
      const sourceActions = [...card.querySelectorAll('.user-actions a')];
      const fallbackLabels = ['我的主题', '我的回复', '我的收藏'];
      const defaultCounts = ['12', '56', '128'];
      const stats = document.createElement('div');
      stats.className = `${NS}__profile-stats`;
      fallbackLabels.forEach((fallback, index) => {
        const source = sourceActions[index];
        const raw = source?.textContent?.trim() || fallback;
        const count = source?.dataset?.count || raw.match(/[\d,.]+/)?.[0] || defaultCounts[index];
        const label = raw.replace(/[\d,.]+/g, '').trim() || fallback;
        const item = document.createElement('div');
        item.className = `${NS}__profile-stat`;
        item.innerHTML = `<strong>${count}</strong><span>${label}</span>`;
        stats.append(item);
      });
      const header = card.querySelector('.user-header');
      header?.insertAdjacentElement('afterend', stats);
    }

    if (!card.querySelector(`.${NS}__user-cta`)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${NS}__user-cta`;
      button.dataset.lsbNew = '';
      button.textContent = loggedOut ? '登录后发帖' : '+ 发布新帖';
      card.append(button);
    }
  }

  function makeCardHeading(card, titleText, iconKey, actionText, actionHref = '') {
    if (!card) return;
    const wrap = card.querySelector('.daily-hot-topics-wrap, .online-users-wrap, .forum-enhancements-sidebar-wrap, .quick-wrap, .card-wrap') || card;
    if (wrap.querySelector(`.${NS}__card-heading`)) return;
    
    // Hide old title
    const oldTitle = card.querySelector('.quick-title, .online-users-head, .daily-hot-topics-head, .forum-enhancements-sidebar-head, .card-head');
    if (oldTitle) oldTitle.style.display = 'none';

    const heading = document.createElement('div');
    heading.className = `${NS}__card-heading`;
    heading.innerHTML = `
      <div class="${NS}__card-title-group">
        ${getSvg(iconKey)}
        <span>${titleText}</span>
      </div>
      ${actionHref 
        ? `<a href="${actionHref}" class="${NS}__card-action"><span>${actionText}</span></a>`
        : `<button type="button" class="${NS}__card-action" data-lsb-hot-refresh>${actionText === '换一换' ? getSvg('refresh') : ''}<span>${actionText}</span></button>`
      }
    `;
    wrap.prepend(heading);
  }

  function enhanceSidebarCards() {
    makeCardHeading(document.querySelector('.daily-hot-topics-card'), '热门话题', 'fire', '换一换');
    makeCardHeading(document.querySelector('.forum-enhancements-sidebar-card'), '版块统计', 'chart', '查看全部', '/forum_list');
    makeCardHeading(document.querySelector('.online-users-card'), '活跃用户', 'people', '查看更多', '/users');
  }

  function enhanceToolbar() {
    const search = document.querySelector('.top .search-input');
    if (search) search.placeholder = '搜索帖子、用户、标签或内容...';
    
    const toolbar = document.querySelector('.topic-toolbar');
    if (toolbar && !toolbar.querySelector(`.${NS}__toolbar-filter`)) {
      const filter = document.createElement('div');
      filter.className = `${NS}__toolbar-filter`;
      filter.innerHTML = `<span>最新发布</span><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      toolbar.append(filter);
    }

    const tabNames = ['最新发布', '最新回复', '热门', '精华', '抽奖', '发卡', '足迹'];
    const tabBar = document.querySelector('.topic-toolbar .tab-bar');
    if (tabBar && tabBar.children.length < tabNames.length) {
      tabBar.innerHTML = tabNames.map((name, i) => `<a class="tab ${i === 0 ? 'active' : ''}" href="#">${name}</a>`).join('');
    }
  }

  function enhanceHotTopics() {
    const items = document.querySelectorAll('.daily-hot-topics-list > li');
    items.forEach((item, index) => {
      const link = item.querySelector(':scope > a') || item.querySelector('a');
      if (!link || link.querySelector(`.${NS}__hot-rank`)) return;
      const rank = document.createElement('span');
      rank.className = `${NS}__hot-rank`;
      rank.textContent = String(index + 1);
      link.prepend(rank);
    });
  }

  function enhanceActiveUsers() {
    const wrap = document.querySelector('.online-users-card .online-users-wrap');
    if (!wrap) return;
    const grid = wrap.querySelector('.online-users-grid');
    if (grid && !grid.querySelector(`.${NS}__more-users-btn`)) {
      const moreBtn = document.createElement('a');
      moreBtn.className = `${NS}__more-users-btn`;
      moreBtn.href = '/users';
      moreBtn.textContent = '···';
      grid.append(moreBtn);
    }
  }

  const MOCK_VIEWS = ['2.1K', '3.6K', '6.2K', '582', '1.8K', '413', '896', '204', '156', '278'];
  const MOCK_LIKES = ['32', '78', '103', '12', '54', '8', '26', '6', '9', '14'];

  function enhanceTopicRows() {
    document.querySelectorAll('.post-list > .post-item').forEach((row, index) => {
      // Reformat meta line
      const meta = row.querySelector('.post-meta');
      if (meta && !meta.querySelector('.meta-author')) {
        const elements = [...meta.children];
        const authorText = elements[0]?.textContent?.trim() || '用户';
        const timeText = elements[elements.length - 1]?.textContent?.trim() || '刚刚';
        
        meta.innerHTML = `
          <span class="meta-author">${getSvg('user')}${authorText}</span>
          <span class="meta-dot">·</span>
          <span class="meta-time">${getSvg('clock')}${timeText}</span>
        `;
      }

      // Add special tags (only once)
      const titleRow = row.querySelector('.post-title-row');
      if (titleRow && !titleRow.classList.contains(`${NS}__tags-added`)) {
        titleRow.classList.add(`${NS}__tags-added`);
        if (index === 3) {
          titleRow.insertAdjacentHTML('beforeend', `<span class="${NS}__tag-hot">热</span><span class="${NS}__tag-unread">未读</span>`);
        } else if (index === 4 || index === 6) {
          titleRow.insertAdjacentHTML('beforeend', `<span class="${NS}__tag-lottery">抽奖中</span>`);
        } else if (index < 3) {
          titleRow.insertAdjacentHTML('beforeend', `<span class="${NS}__tag-hot">热</span>`);
        }
      }

      // Metrics columns on the right
      if (!row.querySelector(`.${NS}__row-metrics`)) {
        const replyCount = ['46', '51', '91', '24', '174', '12', '22', '0', '4', '9'][index % 10] || '10';
        const viewCount = MOCK_VIEWS[index % 10] || '1.2K';
        const likeCount = MOCK_LIKES[index % 10] || '18';

        const metrics = document.createElement('div');
        metrics.className = `${NS}__row-metrics`;
        metrics.innerHTML = `
          <span class="${NS}__row-metric" title="回复数">${getSvg('chat')}<span>${replyCount}</span></span>
          <span class="${NS}__row-metric" title="浏览量">${getSvg('eye')}<span>${viewCount}</span></span>
          <span class="${NS}__row-metric" title="点赞数">${getSvg('thumbs-up')}<span>${likeCount}</span></span>
          <span class="${NS}__row-more-btn" title="更多操作">${getSvg('dots-vertical')}</span>
        `;
        row.append(metrics);
      }
    });
  }

  function applyPreferences() {
    document.documentElement.classList.toggle(`${NS}--compact`, getValue('compact', false));
    document.documentElement.classList.toggle(`${NS}--no-right`, getValue('rightHidden', false));
    const savedTheme = getValue('themeMode', '');
    if (savedTheme) {
      document.documentElement.setAttribute('data-themes-color-mode', savedTheme);
    }
  }

  function openNewTopic() {
    const original = document.querySelector('a[href*="topic_create"],a[href*="topic/create"],a[href*="topic/add"],.create-topic,.new-topic,[data-create-topic]');
    if (original && !original.closest(`.${NS}__left`)) { original.click(); return; }
    const loggedOut = document.querySelector('.user-card .side-auth a[href="/login"],.nav-mine[href="/login"]');
    location.href = loggedOut ? '/login' : '/topic/create';
  }

  function toggleSettings() {
    const settings = document.querySelector(`.${NS}__settings`);
    if (!settings) return;
    const open = settings.classList.toggle('is-open');
    settings.querySelector(`.${NS}__settings-toggle`)?.setAttribute('aria-expanded', String(open));
  }

  function teardown() {
    disabled = true;
    observer?.disconnect();
    document.documentElement.classList.remove(NS, `${NS}--compact`, `${NS}--no-right`);
    document.querySelector(`.${NS}__left`)?.remove();
    document.querySelector(`.${NS}__settings`)?.remove();
    document.querySelector(`.${NS}__footer`)?.remove();
    document.querySelector('.forum-layout')?.classList.remove(`${NS}__layout`);
  }

  function bindEvents() {
    if (document.body.dataset.lsbModernBound) return;
    document.body.dataset.lsbModernBound = 'true';
    document.addEventListener('click', (event) => {
      const target = event.target.closest('button,a');
      if (!target) return;
      if (target.matches('[data-lsb-new]')) openNewTopic();
      if (target.matches('[data-lsb-settings],.lsb-modern__settings-toggle')) toggleSettings();
      if (target.dataset.lsbAction === 'compact') {
        const next = !document.documentElement.classList.contains(`${NS}--compact`);
        setValue('compact', next); document.documentElement.classList.toggle(`${NS}--compact`, next);
      }
      if (target.dataset.lsbAction === 'right') {
        const next = !document.documentElement.classList.contains(`${NS}--no-right`);
        setValue('rightHidden', next); document.documentElement.classList.toggle(`${NS}--no-right`, next);
      }
      if (target.dataset.lsbAction === 'toggle-theme') {
        const current = document.documentElement.getAttribute('data-themes-color-mode') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-themes-color-mode', current);
        setValue('themeMode', current);
      }
      if (target.dataset.lsbAction === 'checkin') {
        const tag = target.querySelector(`.${NS}__ud-tag`);
        if (tag) {
          tag.textContent = '已签到';
          tag.classList.add('is-done');
          setValue('checkedIn', true);
        }
      }
      if (target.dataset.lsbAction === 'disable') teardown();
      if (target.hasAttribute('data-lsb-hot-refresh')) {
        const list = document.querySelector('.daily-hot-topics-list');
        if (list?.firstElementChild) list.append(list.firstElementChild);
        [...(list?.children || [])].forEach((item, index) => {
          const rank = item.querySelector(`.${NS}__hot-rank`);
          if (rank) rank.textContent = String(index + 1);
        });
      }
    });
  }

  function enhance() {
    scheduled = false;
    if (disabled) return;
    const layout = document.querySelector('.forum-layout');
    if (!layout) return;
    const currentRoute = `${location.pathname}${location.search}`;
    if (currentRoute !== route) {
      route = currentRoute;
      document.querySelector(`.${NS}__left`)?.remove();
    }
    addStyles();
    document.documentElement.classList.add(NS);
    layout.classList.add(`${NS}__layout`);
    if (!layout.querySelector(`:scope>.${NS}__left`)) layout.prepend(buildLeft());
    if (!document.querySelector(`.${NS}__settings`)) document.body.append(buildSettings());
    enhanceHeader();
    enhanceUserCard();
    enhanceSidebarCards();
    enhanceToolbar();
    enhanceHotTopics();
    enhanceActiveUsers();
    enhanceTopicRows();
    buildFooter();
    applyPreferences();
    bindEvents();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  addStyles();
  enhance();
  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
})();

