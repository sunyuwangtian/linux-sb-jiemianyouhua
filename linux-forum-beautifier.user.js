// ==UserScript==
// @name         LINUX SB 现代化界面
// @namespace    https://linux.sb/
// @version      0.7.4
// @description  将 LINUX SB 重排为现代三栏卡片界面，全面对齐现代设计规范，保留原站登录、发帖、分页和主题功能。
// @author       You
// @match        https://linux.sb/*
// @match        https://www.linux.sb/*
// @icon         https://linux.sb/app/assets/index.svg
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const NS = 'lsb-modern';
  const BOOTING_CLASS = `${NS}--booting`;
  let scheduled = false;
  let disabled = false;
  let observer = null;
  let route = `${location.pathname}${location.search}`;
  let bootPending = true;
  let notificationHrefSnapshot = '';
  let routeHrefCache = new Map();
  const prefetchedTopicUrls = new Set();
  const topicPrefetchTimers = new WeakMap();
  const SHARED_SIDEBAR_CACHE_KEY = `${NS}:shared-sidebar:v1`;
  let sharedSidebarFetch = null;
  let sharedSidebarCacheValue = '';
  const middlePageCache = new Map();
  let middleNavigationController = null;
  let middleNavigationSequence = 0;
  let displayedMiddleUrl = location.href;
  let historyScrollScheduled = false;
  let middleNavigationPending = false;

  // Apply the theme marker before the first paint so the native layout never flashes.
  document.documentElement?.classList.add(NS, BOOTING_CLASS);
  const bootSafetyTimer = window.setTimeout(() => {
    bootPending = false;
    document.documentElement?.classList.remove(BOOTING_CLASS);
  }, 2500);

  function finishBoot() {
    bootPending = false;
    window.clearTimeout(bootSafetyTimer);
    document.documentElement?.classList.remove(BOOTING_CLASS);
  }

  const normalizeLinkLabel = (value) => String(value || '').replace(/\s+/g, '').trim();

  const isUsableHref = (href) => Boolean(
    href && href !== '#' && !/^(?:javascript|data):/i.test(href)
  );

  function nativeAnchors(selector = 'a[href]') {
    return [...document.querySelectorAll(selector)].filter((link) => {
      const href = link.getAttribute('href');
      return isUsableHref(href) && !link.closest(`.${NS}__left,.${NS}__top-actions,.${NS}__user-dropdown,.${NS}__footer,.${NS}__card-heading`);
    });
  }

  function findNativeHref(labels, selector = 'a[href]') {
    const wanted = (Array.isArray(labels) ? labels : [labels]).map(normalizeLinkLabel);
    const links = nativeAnchors(selector);
    const exact = links.find((link) => wanted.includes(normalizeLinkLabel(link.textContent)));
    const match = exact || links.find((link) => {
      const text = normalizeLinkLabel(link.textContent).replace(/[\d,.]+$/, '');
      return wanted.includes(text);
    });
    return match?.getAttribute('href') || '';
  }

  function currentUserHref() {
    const link = nativeAnchors('.nav-mine[href],.user-card a[href],.user-header a[href],a.user-name[href]')
      .find((item) => /(?:\/user\/\d+|[?&]a=user(?:&|&amp;)id=\d+)/.test(item.getAttribute('href') || ''));
    return link?.getAttribute('href') || '';
  }

  function userTabHref(tab) {
    const userHref = currentUserHref();
    if (!userHref) return '';
    try {
      const url = new URL(userHref, location.origin);
      url.searchParams.set('tab', tab);
      return `${url.pathname}${url.search}`;
    } catch (_) {
      return '';
    }
  }

  function routeHref(name) {
    if (routeHrefCache.has(name)) return routeHrefCache.get(name);
    const routes = {
      home: () => findNativeHref(['全部主题', '全部']) || '/',
      featured: () => findNativeHref(['精华', '精选']) || '/topic_featured',
      technology: () => findNativeHref('技术交流', '.forum-link[href],a[href*="/forum/"]') || '/forum/4',
      resources: () => findNativeHref('资源分享', '.forum-link[href],a[href*="/forum/"]') || '/forum/3',
      questions: () => findNativeHref('求助问答', '.forum-link[href],a[href*="/forum/"]') || '/forum/5',
      announcements: () => findNativeHref('社区公告', '.forum-link[href],a[href*="/forum/"]') || '/forum/9',
      leaderboard: () => findNativeHref('用户榜单') || '/leaderboard',
      topics: () => findNativeHref(['我的主题', '主题'], '.user-card a[href],.user-menu a[href],.user-actions a[href]') || userTabHref('topics'),
      replies: () => findNativeHref(['我的回复', '我的回帖', '回复'], '.user-card a[href],.user-menu a[href],.user-actions a[href]') || userTabHref('replies'),
      favorites: () => findNativeHref(['我的收藏', '收藏'], '.user-card a[href],.user-menu a[href],.user-actions a[href]') || userTabHref('favorites'),
      points: () => findNativeHref(['我的积分', '积分明细', '积分'], '.user-card a[href],.user-menu a[href],.nav-mine-menu a[href],.user-actions a[href],.user-links a[href],.feature-links a[href]') || userTabHref('points'),
      notifications: () => findNativeHref(['我的通知', '通知', '我的消息'], '.user-card a[href],.user-menu a[href],.user-actions a[href],.nav-mine-menu a[href],.user-links a[href],.feature-links a[href]') || userTabHref('notifications'),
      profile: () => findNativeHref(['个人设置', '编辑资料'], '.user-menu a[href],.nav-mine-menu a[href]') || (currentUserHref() ? '/profile' : ''),
      invite: () => findNativeHref(['邀请中心', '邀请码'], '.user-menu a[href],.nav-mine-menu a[href],.quick-actions a[href]'),
      logout: () => findNativeHref('退出登录', '.user-menu a[href],.nav-mine-menu a[href],a[href*="logout"]'),
      login: () => findNativeHref('登录', 'a[href*="login"]') || '/login',
      newTopic: () => findNativeHref(['发布新帖', '发帖'], 'a[href]') || '/topic_edit'
    };
    const href = routes[name]?.() || '';
    routeHrefCache.set(name, href);
    return href;
  }

  function invalidateRouteHrefCache() {
    routeHrefCache = new Map();
  }

  function isNotificationHref(href = location.href) {
    try {
      const url = new URL(href, location.origin);
      return url.searchParams.get('tab') === 'notifications'
        || /(?:^|\/)notifications\/?$/.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function clearNotificationState() {
    document.querySelectorAll(`.${NS}__top-actions .${NS}__badge-dot`).forEach((badge) => badge.remove());
    document.querySelectorAll('.user-links .notify-badge,.feature-links .notify-badge,.nav-mine .notify-badge,.user-menu .notify-badge,.nav-mine-menu .notify-badge')
      .forEach((badge) => badge.remove());
    document.querySelectorAll('.user-links [data-notification-count],.user-links [data-unread-count],.feature-links [data-notification-count],.feature-links [data-unread-count]')
      .forEach((node) => {
        if (node.hasAttribute('data-notification-count') && node.dataset.notificationCount !== '0') {
          node.dataset.notificationCount = '0';
        }
        if (node.hasAttribute('data-unread-count') && node.dataset.unreadCount !== '0') {
          node.dataset.unreadCount = '0';
        }
      });
  }

  function nativeNotificationInfo() {
    if (isNotificationHref()) {
      clearNotificationState();
      if (!notificationHrefSnapshot) notificationHrefSnapshot = routeHref('notifications');
      return { href: notificationHrefSnapshot, count: '' };
    }
    const nativeLink = nativeAnchors('a[href]').find((link) => {
      const href = (link.getAttribute('href') || '').replace(/&amp;/g, '&');
      const label = normalizeLinkLabel(link.textContent).replace(/[\d,.+]+$/, '');
      return /[?&]tab=notifications(?:&|$)/.test(href) || ['我的通知', '通知', '我的消息'].includes(label);
    });
    const nativeBadge = nativeLink?.matches('.notify-badge,[data-notification-count],[data-unread-count]')
      ? nativeLink
      : nativeLink?.querySelector('.notify-badge,[data-notification-count],[data-unread-count]')
        || nativeLink?.parentElement?.querySelector(':scope > .notify-badge,:scope > [data-notification-count],:scope > [data-unread-count]');
    const rawCount = nativeBadge?.dataset.notificationCount
      || nativeBadge?.dataset.unreadCount
      || nativeBadge?.textContent
      || nativeBadge?.getAttribute('aria-label')
      || '';
    const count = String(rawCount).trim().match(/\d+\+?/)?.[0] || '';
    const nativeHref = nativeLink?.getAttribute('href') || '';
    if (nativeHref) notificationHrefSnapshot = nativeHref;
    if (!notificationHrefSnapshot) notificationHrefSnapshot = routeHref('notifications');

    // The URL may be retained after the native header is replaced, but unread
    // state must always come from the current DOM. No badge means zero unread.
    return { href: notificationHrefSnapshot, count };
  }

  const escapeAttr = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

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
    html.${NS}.${NS}--booting body {
      visibility: hidden !important;
    }

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
      gap: 8px;
      color: var(--lsbm-text);
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.2px;
      text-decoration: none;
    }
    html.${NS} .top .brand::before {
      content: "";
      width: 34px;
      height: 34px;
      flex: 0 0 34px !important;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%23f1f2f4'/%3E%3Cpath d='M18.5 6.5 14.2 17.2' fill='none' stroke='%23272a2f' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='m13.1 20.5-2.7 6.7' fill='none' stroke='%23ffb000' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat;
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
    html.${NS} .${NS}__user-dropdown a.${NS}__ud-item,
    html.${NS} .${NS}__user-dropdown button.${NS}__ud-item,
    .${NS}__ud-item {
      width: 100% !important;
      min-height: 34px !important;
      padding: 7px 10px !important;
      margin: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 10px !important;
      border: 0 !important;
      outline: 0 !important;
      border-radius: 8px !important;
      background: transparent !important;
      color: var(--lsbm-secondary) !important;
      font-family: inherit !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      line-height: 1.4 !important;
      text-align: left !important;
      text-decoration: none !important;
      text-indent: 0 !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      box-sizing: border-box !important;
      box-shadow: none !important;
      appearance: none !important;
      -webkit-appearance: none !important;
    }
    .${NS}__ud-item svg {
      width: 16px !important;
      height: 16px !important;
      min-width: 16px !important;
      flex: 0 0 16px !important;
      margin: 0 !important;
      padding: 0 !important;
      opacity: 0.75;
    }
    .${NS}__ud-item span {
      margin: 0 !important;
      padding: 0 !important;
      text-align: left !important;
      line-height: 1.4 !important;
    }
    .${NS}__ud-item:hover {
      background: var(--lsbm-accent-soft) !important;
      color: var(--lsbm-accent) !important;
    }
    .${NS}__ud-item:hover svg {
      opacity: 1;
      stroke: var(--lsbm-accent);
    }
    .${NS}__ud-item--danger:hover {
      background: #fff1f0 !important;
      color: #ff4d4f !important;
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

    /* Reset all outer wrapper containers so there is NO outer frame / card box */
    html.${NS} main.wrap,
    html.${NS} .wrap,
    html.${NS} .home-shell,
    html.${NS} .topic-shell,
    html.${NS} .detail-shell,
    html.${NS} .forum-shell,
    html.${NS} .main-shell,
    html.${NS} .shell,
    html.${NS} .forum-layout,
    html.${NS} .forum-layout.${NS}__layout,
    html.${NS} .forum-main,
    html.${NS} .main-panel,
    html.${NS} .content-wrap,
    html.${NS} .layout-wrap,
    html.${NS} .site-content,
    html.${NS} .main-content,
    html.${NS} .site-box,
    html.${NS} .forum-container,
    html.${NS} .layout-container,
    html.${NS} #main,
    html.${NS} .container {
      border: 0 !important;
      outline: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    html.${NS} main.wrap {
      box-sizing: border-box;
      width: 100%;
      max-width: var(--lsbm-page) !important;
      margin: 0 auto !important;
      padding: 16px 20px 48px !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    html.${NS} .home-shell,
    html.${NS} .topic-shell,
    html.${NS} .detail-shell,
    html.${NS} .forum-shell,
    html.${NS} .main-shell,
    html.${NS} .shell,
    html.${NS} .content-wrap,
    html.${NS} .layout-wrap {
      padding: 0 !important;
      margin: 0 !important;
      width: 100% !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    html.${NS} .forum-layout.${NS}__layout {
      display: grid !important;
      grid-template-columns: 218px minmax(580px, 1fr) 340px !important;
      gap: 16px !important;
      align-items: start;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
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
    html.${NS} .forum-main.${NS}__middle-loading {
      cursor: progress;
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
      justify-content: flex-start !important;
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
    .${NS}__nav svg,
    .${NS}__left-panel svg {
      flex: 0 0 18px !important;
      width: 18px !important;
      height: 18px !important;
      margin: 0 !important;
    }
    .${NS}__nav .${NS}__nav-label {
      flex: 1 1 auto !important;
      text-align: left !important;
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

    /* Native forum list, relocated into the unused left-column space */
    .${NS}__left-forums {
      min-height: 0;
      max-height: 420px;
      margin: 12px 2px 10px;
      padding: 12px 8px 8px;
      overflow-y: auto;
      border: 1px solid var(--lsbm-line);
      border-radius: 10px;
      background: color-mix(in srgb, var(--lsbm-panel) 96%, var(--lsbm-bg));
      scrollbar-width: thin;
    }
    .${NS}__left-forums-title {
      margin: 0 4px 7px;
      color: var(--lsbm-text);
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
    }
    html.${NS} .sidebar .${NS}__forum-source {
      display: none !important;
    }
    html.${NS} .sidebar .${NS}__quick-source {
      display: none !important;
    }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 5px !important;
      margin: 0 !important;
      padding: 0 !important;
      list-style: none !important;
    }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list > li,
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list > li:nth-child(n+7) {
      position: relative !important;
      display: block !important;
      margin: 0 !important;
      padding: 0 !important;
      list-style: none !important;
      border-bottom: 0 !important;
    }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list > li::before {
      content: "";
      position: absolute;
      z-index: 1;
      top: 11px;
      left: 7px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #1677ff;
      pointer-events: none;
    }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list > li:nth-child(2n)::before { background: #536b95; }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list > li:nth-child(4n)::before { background: #f52269; }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list > li:nth-child(5n)::before { background: #389e0d; }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list > li:nth-child(7n)::before { background: #9a6548; }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list a {
      width: 100% !important;
      min-height: 45px !important;
      margin: 0 !important;
      padding: 7px 5px 6px 17px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      justify-content: center !important;
      gap: 4px !important;
      border-radius: 6px !important;
      background: var(--lsbm-bg) !important;
      box-sizing: border-box !important;
      text-align: left !important;
    }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list a:hover {
      background: var(--lsbm-accent-soft) !important;
    }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-name,
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list a .forum-name,
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list a span:first-of-type {
      min-width: 0 !important;
      flex: 1 1 auto !important;
      margin: 0 !important;
      color: var(--lsbm-secondary) !important;
      width: 100% !important;
      font-size: 11.5px !important;
      font-weight: 500 !important;
      line-height: 1.25 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-count,
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list a .forum-count,
    html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list a span:last-of-type {
      flex: 0 0 auto !important;
      margin: 0 !important;
      color: var(--lsbm-muted) !important;
      font-size: 10.5px !important;
      font-weight: 400 !important;
      line-height: 1 !important;
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
      position: relative;
      flex: 0 0 auto;
    }
    html.${NS} .topic-toolbar .${NS}__toolbar-filter-trigger {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      min-height: 30px !important;
      padding: 5px 9px !important;
      border: 1px solid transparent !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: var(--lsbm-muted) !important;
      font-size: 12px !important;
      cursor: pointer !important;
    }
    html.${NS} .topic-toolbar .${NS}__toolbar-filter-trigger:hover,
    html.${NS} .topic-toolbar .${NS}__toolbar-filter.is-open .${NS}__toolbar-filter-trigger {
      border-color: var(--lsbm-line) !important;
      background: var(--lsbm-bg) !important;
      color: var(--lsbm-text) !important;
    }
    .${NS}__toolbar-filter-trigger svg {
      transition: transform 0.15s ease;
    }
    .${NS}__toolbar-filter.is-open .${NS}__toolbar-filter-trigger svg {
      transform: rotate(180deg);
    }
    .${NS}__toolbar-filter-menu {
      position: absolute;
      top: calc(100% + 7px);
      right: 0;
      z-index: 1300;
      width: 142px;
      padding: 6px;
      display: none;
      gap: 2px;
      border: 1px solid var(--lsbm-line);
      border-radius: 9px;
      background: var(--lsbm-panel);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
    }
    .${NS}__toolbar-filter.is-open .${NS}__toolbar-filter-menu {
      display: grid;
    }
    html.${NS} .topic-toolbar .${NS}__toolbar-filter-option {
      display: flex !important;
      align-items: center !important;
      min-height: 32px !important;
      padding: 0 9px !important;
      border: 0 !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: var(--lsbm-secondary) !important;
      font-size: 12px !important;
      text-decoration: none !important;
    }
    html.${NS} .topic-toolbar .${NS}__toolbar-filter-option:hover,
    html.${NS} .topic-toolbar .${NS}__toolbar-filter-option.is-active {
      background: var(--lsbm-accent-soft) !important;
      color: var(--lsbm-accent) !important;
    }
    html.${NS} .topic-toolbar .block-settings,
    html.${NS} .topic-toolbar .shield-btn,
    html.${NS} .topic-toolbar a[href*="block"],
    html.${NS} .topic-toolbar a[href*="shield"],
    html.${NS} .topic-toolbar button:not(.tab):not(.${NS}__toolbar-filter-trigger) {
      padding: 4px 8px !important;
      border-radius: 6px !important;
      border: 1px solid var(--lsbm-line) !important;
      background: var(--lsbm-bg) !important;
      color: var(--lsbm-secondary) !important;
      font-size: 12px !important;
      text-decoration: none !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
      margin-left: 8px !important;
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

    /* Badges & Stamps Unified Styling */
    html.${NS} .topic-badge,
    html.${NS} .topic-stamp-badge,
    html.${NS} .topic-stamp,
    html.${NS} [class*="topic-stamp"],
    html.${NS} [class*="stamp-"],
    .${NS}__tag-hot,
    .${NS}__tag-unread,
    .${NS}__tag-lottery {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: 20px !important;
      min-height: 20px !important;
      line-height: 1 !important;
      padding: 0 6px !important;
      margin: 0 2px !important;
      border-radius: 4px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
      letter-spacing: 0 !important;
      box-sizing: border-box !important;
      vertical-align: middle !important;
      border: 1px solid transparent !important;
    }

    /* Pinned / 置顶 */
    html.${NS} .topic-badge.pinned,
    html.${NS} .topic-stamp-pinned,
    html.${NS} .stamp-pinned {
      background: #e8f7f0 !important;
      color: #00b96b !important;
      border-color: #b7eb8f !important;
    }

    /* Digest / 精华 */
    html.${NS} .topic-stamp-digest,
    html.${NS} .stamp-digest {
      background: #fff7e6 !important;
      color: #fa8c16 !important;
      border-color: #ffd591 !important;
    }

    /* Hot / 热 */
    html.${NS} .topic-stamp-hot,
    html.${NS} .stamp-hot,
    .${NS}__tag-hot {
      background: #fff2e8 !important;
      color: #fa541c !important;
      border-color: #ffbb96 !important;
    }

    /* Unread / 未读 */
    html.${NS} .topic-stamp-unread,
    html.${NS} .stamp-unread,
    .${NS}__tag-unread {
      background: #e8f7f0 !important;
      color: #00b96b !important;
      border-color: #b7eb8f !important;
    }

    /* Lottery / 抽奖中 */
    html.${NS} .topic-stamp-lottery,
    html.${NS} .stamp-lottery,
    .${NS}__tag-lottery {
      background: #fff7e6 !important;
      color: #fa8c16 !important;
      border-color: #ffd591 !important;
    }

    /* Image Count (e.g. 🖼️ 2) */
    html.${NS} .topic-stamp-img,
    html.${NS} [class*="stamp-img"],
    html.${NS} [class*="stamp-image"] {
      background: #f1f5f9 !important;
      color: #475569 !important;
      border-color: #e2e8f0 !important;
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
    @media (min-width: 981px) {
      html.${NS} .forum-layout.${NS}__layout > .forum-main,
      html.${NS} .forum-layout.${NS}__layout > .sidebar,
      html.${NS} .forum-layout.${NS}__layout > .${NS}__left > .${NS}__left-panel {
        min-height: calc(100vh - 100px) !important;
        box-sizing: border-box !important;
      }
      html.${NS} .forum-layout.${NS}__layout > .sidebar {
        align-content: space-between !important;
      }
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
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 12px !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      text-align: left !important;
    }
    html.${NS} .user-avatar-big,
    html.${NS} .user-header .avatar-img,
    html.${NS} .user-header img {
      width: 52px !important;
      height: 52px !important;
      min-width: 52px !important;
      max-width: 52px !important;
      flex: 0 0 52px !important;
      margin: 0 !important;
      padding: 0 !important;
      border-radius: 50% !important;
      object-fit: cover !important;
    }
    html.${NS} .user-header .user-info-wrap,
    html.${NS} .user-header > div:not(.avatar-wrap) {
      flex: 1 1 auto !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      text-align: left !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: flex-start !important;
    }
    .${NS}__user-info-top {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 6px !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      flex-wrap: nowrap !important;
    }
    html.${NS} .user-name {
      font-size: 15px !important;
      font-weight: 750 !important;
      color: var(--lsbm-text) !important;
      line-height: 1.2 !important;
      margin: 0 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    .${NS}__user-tag {
      padding: 1px 6px !important;
      border-radius: 4px !important;
      background: #f0f2f5 !important;
      color: #4e5969 !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
      margin: 0 !important;
    }
    .${NS}__user-level-badge {
      width: 14px !important;
      height: 14px !important;
      min-width: 14px !important;
      border-radius: 3px !important;
      background: #252a31 !important;
      color: #fff !important;
      font-size: 9px !important;
      font-weight: 800 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-shrink: 0 !important;
      margin: 0 !important;
      line-height: 1 !important;
    }
    .${NS}__user-points {
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
      min-height: 22px !important;
      margin-top: 8px !important;
      padding: 2px 8px !important;
      border: 1px solid rgba(0, 185, 107, 0.16) !important;
      border-radius: 999px !important;
      background: var(--lsbm-accent-soft) !important;
      color: var(--lsbm-accent) !important;
      font-size: 11.5px !important;
      line-height: 1 !important;
      white-space: nowrap !important;
    }
    .${NS}__user-points svg {
      width: 13px !important;
      height: 13px !important;
      flex: 0 0 auto !important;
    }
    .${NS}__user-points strong {
      color: inherit !important;
      font-size: 12px !important;
      font-weight: 750 !important;
    }
    html.${NS} .user-rank {
      font-size: 11.5px !important;
      color: var(--lsbm-muted) !important;
      margin: 4px 0 0 0 !important;
      padding: 0 !important;
      text-align: left !important;
      white-space: nowrap !important;
      line-height: 1.2 !important;
    }
    .${NS}__profile-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin-top: 18px;
      text-align: center;
    }
    .${NS}__profile-stat {
      min-width: 0;
      color: inherit;
      text-decoration: none;
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
    html.${NS} .sidebar .user-card > :not(.user-wrap):not(.user-header):not(.${NS}__profile-stats):not(.${NS}__user-cta),
    html.${NS} .sidebar .user-card .user-wrap > :not(.user-header):not(.${NS}__profile-stats):not(.${NS}__user-cta),
    html.${NS} .sidebar .user-card .user-actions,
    html.${NS} .sidebar .user-card .user-menu,
    html.${NS} .sidebar .user-card .user-nav,
    html.${NS} .sidebar .user-card .side-auth,
    html.${NS} .sidebar .user-card .side-publish,
    html.${NS} .sidebar .user-card .side-publish-btn,
    html.${NS} .sidebar .user-card .side-btn,
    html.${NS} .sidebar .user-card .side-post,
    html.${NS} .sidebar .user-card .btn:not(.${NS}__profile-stat),
    html.${NS} .sidebar .user-card button:not(.${NS}__user-cta),
    html.${NS} .sidebar .user-card a.create-topic,
    html.${NS} .sidebar .user-card a[href*="topic_edit"],
    html.${NS} .sidebar .user-card a[href*="topic/edit"],
    html.${NS} .sidebar .user-card a[href*="topic_create"],
    html.${NS} .sidebar .user-card a[href*="topic/create"],
    html.${NS} .sidebar .user-card a[href*="topic_add"],
    html.${NS} .sidebar .user-card a[href*="topic/add"],
    html.${NS} .sidebar .user-card a.btn-publish,
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
    html.${NS} .daily-hot-topics-card .quick-wrap {
      padding: 12px 14px !important;
    }
    html.${NS} .daily-hot-topics-card .${NS}__card-heading {
      margin-bottom: 7px !important;
    }
    html.${NS} .daily-hot-topics-card .${NS}__card-title-group {
      font-size: 13px !important;
    }
    html.${NS} .daily-hot-topics-card .${NS}__card-title-group svg {
      width: 14px !important;
      height: 14px !important;
    }
    html.${NS} .daily-hot-topics-card .${NS}__card-action {
      min-height: 24px !important;
      padding: 0 !important;
      font-size: 11px !important;
    }
    html.${NS} .daily-hot-topics-head,
    html.${NS} .daily-hot-topics-card .quick-title,
    html.${NS} .daily-hot-topics-card .card-head {
      display: none !important;
    }
    html.${NS} .daily-hot-topics-list {
      display: flex !important;
      flex-direction: column !important;
      gap: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      list-style: none !important;
    }
    html.${NS} .daily-hot-topics-list > li {
      margin: 0 !important;
      padding: 0 !important;
      border-bottom: 1px solid var(--lsbm-line) !important;
      list-style: none !important;
    }
    html.${NS} .daily-hot-topics-list > li:nth-child(5) {
      border-bottom: 0 !important;
    }
    html.${NS} .daily-hot-topics-list > li:nth-child(n+6) {
      display: none !important;
    }
    html.${NS} .daily-hot-topics-list > li > a,
    html.${NS} .daily-hot-topics-list a {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 7px !important;
      min-height: 35px !important;
      padding: 3px 0 !important;
      text-decoration: none !important;
      color: var(--lsbm-text) !important;
      font-size: 13px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    html.${NS} .daily-hot-topics-list .${NS}__hot-rank {
      width: 17px !important;
      height: 17px !important;
      min-width: 17px !important;
      flex: 0 0 17px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 4px !important;
      background: #8c9ba5 !important;
      color: #ffffff !important;
      font-size: 10px !important;
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
    html.${NS} .daily-hot-topics-list .daily-hot-topics-content {
      flex: 1 1 auto !important;
      display: grid !important;
      gap: 0 !important;
      min-width: 0 !important;
      line-height: 1.25 !important;
    }
    html.${NS} .daily-hot-topics-list .daily-hot-topics-title {
      display: block !important;
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: var(--lsbm-text) !important;
      font-size: 12.5px !important;
    }
    html.${NS} .daily-hot-topics-list a:hover .daily-hot-topics-title {
      color: var(--lsbm-accent) !important;
    }
    html.${NS} .daily-hot-topics-list .daily-hot-topics-count {
      display: block !important;
      margin: 1px 0 0 !important;
      color: var(--lsbm-muted) !important;
      font-size: 10.5px !important;
      line-height: 1.2 !important;
      white-space: nowrap !important;
    }

    /* Forum Stats Grid Card */
    html.${NS} .forum-enhancements-sidebar-card {
      order: -8;
    }
    html.${NS} .forum-enhancements-sidebar-list {
      display: grid !important;
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 8px !important;
      padding: 0 !important;
      margin: 0 !important;
      list-style: none !important;
    }
    html.${NS} .forum-enhancements-sidebar-list > li {
      margin: 0 !important;
      padding: 0 !important;
      list-style: none !important;
    }
    html.${NS} .forum-enhancements-sidebar-list > li:nth-child(n+7) {
      display: none !important;
    }
    html.${NS} .forum-enhancements-sidebar-list a {
      min-height: 52px !important;
      padding: 10px 4px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 8px !important;
      background: var(--lsbm-bg) !important;
      text-align: center !important;
      text-decoration: none !important;
      transition: background 0.15s ease !important;
      box-sizing: border-box !important;
    }
    html.${NS} .forum-enhancements-sidebar-list a:hover {
      background: var(--lsbm-accent-soft) !important;
    }
    /* Hide native colored dots and badges in forum stats */
    html.${NS} .forum-enhancements-sidebar-list a::before,
    html.${NS} .forum-enhancements-sidebar-list a::after,
    html.${NS} .forum-enhancements-sidebar-list a .badge-category-bg,
    html.${NS} .forum-enhancements-sidebar-list a .category-color,
    html.${NS} .forum-enhancements-sidebar-list a .forum-color,
    html.${NS} .forum-enhancements-sidebar-list a .forum-dot,
    html.${NS} .forum-enhancements-sidebar-list a i,
    html.${NS} .forum-enhancements-sidebar-list a .dot,
    html.${NS} .forum-enhancements-sidebar-list a span[style*="background"],
    html.${NS} .forum-enhancements-sidebar-list a span[style*="border-radius: 50%"],
    html.${NS} .forum-enhancements-sidebar-list a span[style*="border-radius:50%"] {
      display: none !important;
    }
    html.${NS} .forum-enhancements-sidebar-name,
    html.${NS} .forum-enhancements-sidebar-list a .forum-name,
    html.${NS} .forum-enhancements-sidebar-list a span:first-of-type {
      font-size: 12.5px !important;
      font-weight: 600 !important;
      color: var(--lsbm-text) !important;
      line-height: 1.3 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    html.${NS} .forum-enhancements-sidebar-count,
    html.${NS} .forum-enhancements-sidebar-list a .forum-count,
    html.${NS} .forum-enhancements-sidebar-list a span:last-of-type {
      color: var(--lsbm-muted) !important;
      font-size: 11.5px !important;
      margin-top: 4px !important;
      line-height: 1 !important;
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
    .${NS}__settings.is-open {
      display: block;
    }
    .${NS}__settings.is-desktop-anchor {
      right: auto;
      bottom: auto;
    }
    .${NS}__settings.is-desktop-anchor .${NS}__settings-toggle {
      display: none;
    }
    .${NS}__settings.is-desktop-anchor .${NS}__settings-menu {
      top: 0;
      right: auto;
      bottom: auto;
      left: 0;
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

    /* ===================================================
       Topic Detail & Nested Comments Tree (楼中楼回复区)
       =================================================== */
    html.${NS} .topic-post,
    html.${NS} .topic-detail,
    html.${NS} .post-stream,
    html.${NS} .comments-wrap,
    html.${NS} .comment-tree {
      max-width: 100%;
    }

    /* Main Parent Comment Row */
    html.${NS} .topic-post,
    html.${NS} .comment-item,
    html.${NS} .reply-item,
    html.${NS} .post-stream > .post-item {
      padding: 16px 20px !important;
      border-bottom: 1px solid var(--lsbm-line) !important;
      background: var(--lsbm-panel) !important;
      transition: background 0.15s ease;
    }
    html.${NS} .topic-post:hover,
    html.${NS} .comment-item:hover,
    html.${NS} .reply-item:hover {
      background: rgba(0, 0, 0, 0.01) !important;
    }
    html.${NS}[data-themes-color-mode="dark"] .topic-post:hover,
    html.${NS}[data-themes-color-mode="dark"] .comment-item:hover {
      background: rgba(255, 255, 255, 0.02) !important;
    }

    /* Nested Child Comments (楼中楼 / 嵌套子回复) */
    html.${NS} .comment-children,
    html.${NS} .comment-nested,
    html.${NS} .reply-children,
    html.${NS} .sub-comments,
    html.${NS} .tree-children {
      margin-top: 12px !important;
      margin-left: 28px !important;
      padding-left: 16px !important;
      border-left: 2px solid var(--lsbm-line) !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
    }

    /* Nested Child Item Sub-Card */
    html.${NS} .comment-child,
    html.${NS} .comment-children .comment-item,
    html.${NS} .reply-children .reply-item,
    html.${NS} .sub-comment-item {
      padding: 10px 14px !important;
      border-radius: 10px !important;
      background: var(--lsbm-bg) !important;
      border: 1px solid var(--lsbm-line) !important;
      transition: all 0.15s ease;
    }
    html.${NS} .comment-child:hover,
    html.${NS} .comment-children .comment-item:hover,
    html.${NS} .sub-comment-item:hover {
      border-color: rgba(0, 185, 107, 0.3) !important;
      background: var(--lsbm-panel) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    /* bbs1.org quote_threads: replies are reordered sibling <li>s, not nested containers. */
    html.${NS} .topic-post-list > .post-entry {
      min-height: 0 !important;
      padding: 14px 18px !important;
      grid-template-columns: 38px minmax(0, 1fr) !important;
      grid-template-areas: "avatar body" "content content" !important;
      gap: 0 12px !important;
      align-items: start !important;
      content-visibility: auto;
      contain-intrinsic-block-size: auto 180px;
    }
    html.${NS} .topic-post-list > .post-entry .post-avatar,
    html.${NS} .topic-post-list > .post-entry .post-avatar .avatar-img,
    html.${NS} .topic-post-list > .post-entry .post-avatar img {
      width: 38px !important;
      height: 38px !important;
      border-radius: 9px !important;
    }
    html.${NS} .topic-post-list > .post-entry .post-head {
      display: flex !important;
      align-items: center !important;
      min-height: 20px !important;
      gap: 5px !important;
      padding-right: 92px !important;
      flex-wrap: wrap !important;
    }
    html.${NS} .topic-post-list > .post-entry .post-meta {
      display: flex !important;
      align-items: center !important;
      gap: 5px !important;
      margin-top: 3px !important;
      color: var(--lsbm-muted) !important;
      font-size: 11.5px !important;
    }
    html.${NS} .topic-post-list > .post-entry .post-content {
      grid-area: content !important;
      margin-top: 8px !important;
      padding-top: 0 !important;
      border: 0 !important;
      color: var(--lsbm-text) !important;
      font-size: 14px !important;
      line-height: 1.65 !important;
      overflow-wrap: anywhere;
    }
    html.${NS} .topic-post-list > .post-entry .post-content > :first-child {
      margin-top: 0 !important;
    }
    html.${NS} .topic-post-list > .post-entry .post-content > :last-child {
      margin-bottom: 0 !important;
    }

    html.${NS} .topic-post-list > .quote-threads-child {
      position: relative !important;
      min-height: 0 !important;
      margin: 0 14px 0 34px !important;
      padding: 10px 12px 11px 14px !important;
      grid-template-columns: 28px minmax(0, 1fr) !important;
      grid-template-areas: "avatar body" "content content" !important;
      gap: 0 9px !important;
      border: 0 !important;
      border-left: 2px solid var(--lsbm-line) !important;
      border-bottom: 0 !important;
      border-radius: 0 !important;
      background: color-mix(in srgb, var(--lsbm-bg) 72%, var(--lsbm-panel)) !important;
      box-shadow: none !important;
    }
    html.${NS} .topic-post-list > .quote-threads-child::before {
      position: absolute !important;
      top: 23px !important;
      left: -2px !important;
      width: 11px !important;
      border-top: 2px solid var(--lsbm-line) !important;
      content: "" !important;
    }
    html.${NS} .topic-post-list > .quote-threads-child:hover {
      border-left-color: color-mix(in srgb, var(--lsbm-accent) 42%, var(--lsbm-line)) !important;
      background: var(--lsbm-accent-soft) !important;
    }
    html.${NS} .topic-post-list > .quote-threads-child.quote-threads-thread-end {
      margin-bottom: 8px !important;
      border-bottom: 1px solid var(--lsbm-line) !important;
      border-radius: 0 0 9px 9px !important;
    }
    html.${NS} .topic-post-list > .quote-threads-child .post-avatar,
    html.${NS} .topic-post-list > .quote-threads-child .post-avatar .avatar-img,
    html.${NS} .topic-post-list > .quote-threads-child .post-avatar img {
      width: 28px !important;
      height: 28px !important;
      border-radius: 7px !important;
    }
    html.${NS} .topic-post-list > .quote-threads-child .post-head {
      min-height: 18px !important;
      padding-right: 82px !important;
    }
    html.${NS} .topic-post-list > .quote-threads-child .post-title,
    html.${NS} .topic-post-list > .quote-threads-child .post-author {
      font-size: 13.5px !important;
    }
    html.${NS} .topic-post-list > .quote-threads-child .post-content {
      margin-top: 7px !important;
      font-size: 13.5px !important;
      line-height: 1.6 !important;
    }
    html.${NS} .topic-post-list .quote-threads-reference {
      display: inline-flex !important;
      align-items: center !important;
      gap: 3px !important;
      padding: 1px 5px !important;
      border-radius: 4px !important;
      background: var(--lsbm-accent-soft) !important;
      color: var(--lsbm-accent) !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      line-height: 1.35 !important;
      white-space: nowrap !important;
    }
    html.${NS} .topic-post-list .quote-threads-reference::before {
      content: "↳" !important;
    }
    html.${NS} .topic-post-list > .quote-threads-toggle-row {
      margin: 0 14px 8px 34px !important;
      padding: 6px 0 8px 14px !important;
      border-left: 2px solid var(--lsbm-line) !important;
      background: transparent !important;
    }
    html.${NS} .topic-post-list .quote-threads-toggle {
      min-height: 28px !important;
      padding: 4px 10px !important;
      border: 1px solid var(--lsbm-line) !important;
      border-radius: 7px !important;
      background: var(--lsbm-panel) !important;
      color: var(--lsbm-muted) !important;
      font-size: 11.5px !important;
      cursor: pointer !important;
    }
    html.${NS} .topic-post-list .quote-threads-toggle:hover {
      border-color: var(--lsbm-accent) !important;
      background: var(--lsbm-accent-soft) !important;
      color: var(--lsbm-accent) !important;
    }
    html.${NS} .topic-post-list > .quote-threads-is-collapsed {
      display: none !important;
    }

    /* Comment Header & User Meta */
    html.${NS} .comment-header,
    html.${NS} .reply-header,
    html.${NS} .topic-meta-data {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      margin-bottom: 6px !important;
      flex-wrap: wrap !important;
    }
    html.${NS} .comment-avatar,
    html.${NS} .reply-avatar {
      width: 36px !important;
      height: 36px !important;
      border-radius: 10px !important;
      object-fit: cover !important;
      flex-shrink: 0 !important;
    }
    html.${NS} .comment-child .comment-avatar,
    html.${NS} .sub-comment-item .comment-avatar {
      width: 28px !important;
      height: 28px !important;
      border-radius: 7px !important;
    }
    html.${NS} .comment-user,
    html.${NS} .reply-user {
      font-weight: 700 !important;
      color: var(--lsbm-text) !important;
      font-size: 13.5px !important;
      text-decoration: none !important;
    }
    html.${NS} .comment-user:hover,
    html.${NS} .reply-user:hover {
      color: var(--lsbm-accent) !important;
    }

    /* User Role / UID / Title Badges in Comments */
    html.${NS} .comment-badge,
    html.${NS} .user-badge,
    html.${NS} .role-badge,
    html.${NS} .user-title {
      display: inline-flex !important;
      align-items: center !important;
      padding: 1px 6px !important;
      border-radius: 4px !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      line-height: 1.2 !important;
    }
    html.${NS} .role-badge,
    html.${NS} .badge-creator {
      background: #f0f2f5 !important;
      color: #64748b !important;
    }
    html.${NS} .badge-dragon,
    html.${NS} .user-title {
      background: #fff7e6 !important;
      color: #fa8c16 !important;
      border: 1px solid #ffd591 !important;
    }
    html.${NS} .badge-cat {
      background: #e8f7f0 !important;
      color: #00b96b !important;
      border: 1px solid #b7eb8f !important;
    }
    html.${NS} .user-uid {
      color: var(--lsbm-muted) !important;
      font-size: 11px !important;
    }

    /* Reply to Reply Indicator (↳ 回复 #13 4小时前) */
    html.${NS} .reply-reference,
    html.${NS} .reply-to-info {
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      color: var(--lsbm-muted) !important;
      font-size: 11.5px !important;
      margin-top: 2px !important;
      width: 100% !important;
    }

    /* Comment Content Body */
    html.${NS} .comment-content,
    html.${NS} .reply-content,
    html.${NS} .post-body-text {
      color: var(--lsbm-text) !important;
      font-size: 14px !important;
      line-height: 1.6 !important;
      margin-top: 6px !important;
      word-break: break-word !important;
    }

    /* Mentions (@username #13) */
    html.${NS} .mention,
    html.${NS} a.mention,
    html.${NS} .reply-mention {
      color: var(--lsbm-accent) !important;
      font-weight: 600 !important;
      background: var(--lsbm-accent-soft) !important;
      padding: 1px 6px !important;
      border-radius: 4px !important;
      text-decoration: none !important;
      display: inline-block !important;
      margin-right: 4px !important;
    }
    html.${NS} .mention:hover {
      text-decoration: underline !important;
    }

    /* Action Toolbar (↩ 回复, ♡ 点赞, ⚐ 举报, #13 楼层号) */
    html.${NS} .comment-actions,
    html.${NS} .reply-actions {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      color: var(--lsbm-muted) !important;
      font-size: 12px !important;
      margin-left: auto !important;
    }
    html.${NS} .comment-action-btn,
    html.${NS} .reply-action-btn {
      color: var(--lsbm-muted) !important;
      cursor: pointer !important;
      transition: color 0.15s ease !important;
      text-decoration: none !important;
    }
    html.${NS} .comment-action-btn:hover,
    html.${NS} .reply-action-btn:hover {
      color: var(--lsbm-accent) !important;
    }
    html.${NS} .comment-floor,
    html.${NS} .reply-floor {
      font-weight: 700 !important;
      color: var(--lsbm-muted) !important;
      font-size: 12px !important;
    }

    @media (max-width: 700px) {
      html.${NS} .topic-post-list > .post-entry {
        padding: 12px 10px !important;
        grid-template-columns: 34px minmax(0, 1fr) !important;
        gap: 0 9px !important;
      }
      html.${NS} .topic-post-list > .post-entry .post-avatar,
      html.${NS} .topic-post-list > .post-entry .post-avatar .avatar-img,
      html.${NS} .topic-post-list > .post-entry .post-avatar img {
        width: 34px !important;
        height: 34px !important;
      }
      html.${NS} .topic-post-list > .quote-threads-child {
        margin-right: 6px !important;
        margin-left: 18px !important;
        padding: 9px 8px 10px 10px !important;
        grid-template-columns: 26px minmax(0, 1fr) !important;
        gap: 0 7px !important;
      }
      html.${NS} .topic-post-list > .quote-threads-child .post-avatar,
      html.${NS} .topic-post-list > .quote-threads-child .post-avatar .avatar-img,
      html.${NS} .topic-post-list > .quote-threads-child .post-avatar img {
        width: 26px !important;
        height: 26px !important;
      }
      html.${NS} .topic-post-list > .post-entry .post-head,
      html.${NS} .topic-post-list > .quote-threads-child .post-head {
        padding-right: 0 !important;
      }
      html.${NS} .topic-post-list > .quote-threads-toggle-row {
        margin-right: 6px !important;
        margin-left: 18px !important;
        padding-left: 10px !important;
      }
    }

    /* Compact both sticky sidebars when desktop screens are short. */
    @media (min-width: 981px) and (max-height: 860px) {
      .${NS}__left-panel {
        padding: 9px;
        max-height: calc(100vh - 84px);
        overflow-y: auto;
        scrollbar-width: thin;
      }
      .${NS}__nav {
        gap: 1px;
      }
      .${NS}__nav a,
      .${NS}__nav button {
        min-height: 38px !important;
      }
      .${NS}__separator {
        margin-top: 5px;
        margin-bottom: 5px;
      }
      .${NS}__left-forums {
        max-height: 238px;
        margin-top: 8px;
        margin-bottom: 8px;
        padding: 8px 6px 6px;
      }
      .${NS}__left-forums-title {
        margin-bottom: 5px;
        font-size: 12px;
      }
      html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list a {
        min-height: 38px !important;
        padding-top: 5px !important;
        padding-bottom: 5px !important;
        gap: 2px !important;
      }
      html.${NS} .${NS}__left-forums .forum-enhancements-sidebar-list > li::before {
        top: 9px;
      }
      .${NS}__signature-card {
        padding: 7px 9px;
      }
      .${NS}__signature-logo {
        width: 20px;
        height: 20px;
        flex-basis: 20px;
      }
      html.${NS} .forum-layout.${NS}__layout > .sidebar {
        max-height: calc(100vh - 84px);
        gap: 8px !important;
        overflow-y: auto;
        scrollbar-width: thin;
      }
      html.${NS} .sidebar-card .quick-wrap,
      html.${NS} .sidebar-card .stats-wrap,
      html.${NS} .sidebar-card .online-users-wrap {
        padding: 10px 12px !important;
      }
      html.${NS} .user-card .user-wrap {
        padding: 12px 14px !important;
      }
      html.${NS} .user-avatar-big,
      html.${NS} .user-header .avatar-img,
      html.${NS} .user-header img {
        width: 44px !important;
        height: 44px !important;
        min-width: 44px !important;
        max-width: 44px !important;
        flex-basis: 44px !important;
      }
      .${NS}__profile-stats {
        margin-top: 11px;
      }
      .${NS}__profile-stat strong {
        font-size: 16px;
      }
      .${NS}__profile-stat span {
        margin-top: 2px;
      }
      .${NS}__user-cta {
        height: 34px !important;
        margin-top: 10px !important;
      }
      html.${NS} .daily-hot-topics-card .quick-wrap {
        padding: 9px 12px !important;
      }
      html.${NS} .daily-hot-topics-list > li > a,
      html.${NS} .daily-hot-topics-list a {
        min-height: 30px !important;
        padding-top: 2px !important;
        padding-bottom: 2px !important;
      }
      html.${NS} .online-users-avatar,
      html.${NS} .online-users-avatar img,
      html.${NS} .online-users-item,
      .${NS}__more-users-btn {
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        flex-basis: 32px !important;
      }
      html.${NS} .online-users-more {
        margin-top: 6px;
      }
      html.${NS} .sidebar .${NS}__invite-card > div {
        padding-top: 10px !important;
        padding-bottom: 10px !important;
      }
      html.${NS} .sidebar .${NS}__invite-card a,
      html.${NS} .sidebar .${NS}__invite-card button {
        min-height: 32px !important;
      }
    }
    @media (min-width: 981px) and (max-height: 720px) {
      .${NS}__nav a,
      .${NS}__nav button {
        min-height: 34px !important;
      }
      .${NS}__signature-slogan {
        display: none;
      }
      html.${NS} .daily-hot-topics-list > li:nth-child(5) {
        display: none !important;
      }
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
      .${NS}__left-forums {
        display: none !important;
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
      const mount = document.head || document.documentElement;
      if (mount) mount.append(node);
      else document.addEventListener('readystatechange', () => (document.head || document.documentElement)?.append(node), { once: true });
    }
  }

  const navItem = (href, svgKey, label, active = false) =>
    `<a href="${escapeAttr(href)}" class="${active ? 'is-active' : ''}">${getSvg(svgKey)}<span class="${NS}__nav-label">${label}</span></a>`;

  function isActive(path) {
    if (path === '/') return (location.pathname === '/' && !location.search) || location.protocol === 'file:';
    return `${location.pathname}${location.search}`.startsWith(path);
  }

  function buildLeft() {
    const links = {
      home: routeHref('home'),
      featured: routeHref('featured'),
      technology: routeHref('technology'),
      resources: routeHref('resources'),
      questions: routeHref('questions'),
      announcements: routeHref('announcements'),
      favorites: routeHref('favorites') || routeHref('login')
    };
    const node = document.createElement('aside');
    node.className = `${NS}__left`;
    node.setAttribute('aria-label', '主导航');
    node.innerHTML = `
      <div class="${NS}__left-panel">
        <nav class="${NS}__nav">
          ${navItem(links.home, 'home', '首页', isActive('/'))}
          <button type="button" data-lsb-new>${getSvg('plus-circle')}<span class="${NS}__nav-label">新帖</span></button>
          ${navItem(links.featured, 'star', '精选', isActive('/topic_featured'))}
          <div class="${NS}__separator"></div>
          ${navItem(links.technology, 'code', '技术交流', isActive('/forum/4'))}
          ${navItem(links.resources, 'folder', '资源分享', isActive('/forum/3'))}
          ${navItem(links.questions, 'help', '求助问答', isActive('/forum/5'))}
          ${navItem(links.announcements, 'megaphone', '社区公告', isActive('/forum/9'))}
          <div class="${NS}__separator"></div>
          ${navItem(links.favorites, 'bookmark', '收藏', /[?&]tab=favorites/.test(location.search))}
          <button type="button" data-lsb-settings aria-haspopup="menu" aria-expanded="false">${getSvg('gear')}<span class="${NS}__nav-label">设置</span></button>
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
    const footerItems = [
      ['友情链接', findNativeHref('友情链接')],
      ['帮助中心', findNativeHref('帮助中心')],
      ['APP 下载', findNativeHref(['APP 下载', 'APP下载'])],
      ['关于我们', findNativeHref('关于我们')]
    ].filter(([, href]) => isUsableHref(href));
    if (!footerItems.length) return;
    const footer = document.createElement('footer');
    footer.className = `${NS}__footer`;
    footer.innerHTML = `
      <div class="${NS}__footer-links">
        ${footerItems.map(([label, href]) => `<a href="${escapeAttr(href)}">${label}</a>`).join('')}
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

  function syncHeaderNotification(actions) {
    if (!actions) return;
    const { href, count } = nativeNotificationInfo();
    let link = actions.querySelector('[data-lsb-notifications]');
    if (!href) {
      link?.remove();
      return;
    }
    if (!link) {
      link = document.createElement('a');
      link.className = `${NS}__icon-btn`;
      link.dataset.lsbNotifications = '';
      link.innerHTML = getSvg('bell');
      actions.append(link);
    }
    link.href = href;
    const unread = Number.parseInt(count, 10) > 0 ? count : '';
    link.title = unread ? `${unread} 条未读通知` : '通知与消息';
    link.setAttribute('aria-label', link.title);
    let badge = link.querySelector(`.${NS}__badge-dot`);
    if (!unread) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = `${NS}__badge-dot`;
      badge.setAttribute('aria-hidden', 'true');
      link.append(badge);
    }
    if (badge.textContent !== unread) badge.textContent = unread;
  }

  function enhanceHeader() {
    const bar = document.querySelector('.top .bar');
    if (!bar) return;
    const mine = bar.querySelector('.nav-mine');
    const leaderboardHref = routeHref('leaderboard');
    const inviteHref = routeHref('invite');
    
    // Top right actions
    let actions = bar.querySelector(`.${NS}__top-actions`);
    if (!actions) {
      actions = document.createElement('nav');
      actions.className = `${NS}__top-actions`;
      actions.setAttribute('aria-label', '快捷入口');
      actions.innerHTML = `
        <a href="${escapeAttr(leaderboardHref)}">用户榜单</a>
        ${inviteHref ? `<a href="${escapeAttr(inviteHref)}">邀请中心</a>` : ''}
      `;
      bar.insertBefore(actions, mine || null);
    }
    syncHeaderNotification(actions);

    if (mine) {
      let wrap = mine.closest(`.${NS}__user-menu-wrap`);
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = `${NS}__user-menu-wrap`;
        mine.before(wrap);
        wrap.append(mine);

        // The compact native header can contain a generic placeholder avatar.
        // Prefer the profile card, which carries the user's actual avatar.
        const existingImg = document.querySelector('.user-card img.avatar-img, .user-header img.avatar-img, .user-card img, .user-header img') || mine.querySelector('img');
        const realAvatarSrc = existingImg?.src || 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=token';

        let avatar = mine.querySelector(`.${NS}__header-avatar`);
        if (!avatar) {
          avatar = document.createElement('img');
          avatar.className = `${NS}__header-avatar`;
          avatar.src = realAvatarSrc;
          avatar.alt = 'token';
          mine.innerHTML = '';
          mine.append(avatar);
        }

        const dropdownLinks = {
          topics: routeHref('topics'),
          replies: routeHref('replies'),
          favorites: routeHref('favorites'),
          points: routeHref('points'),
          notifications: routeHref('notifications'),
          invite: routeHref('invite'),
          leaderboard: routeHref('leaderboard'),
          profile: routeHref('profile'),
          logout: routeHref('logout')
        };
        const dropdownLink = (href, icon, label, extra = '') => href
          ? `<a href="${escapeAttr(href)}" class="${NS}__ud-item ${extra}">${getSvg(icon)}<span>${label}</span></a>`
          : '';
        const dropdown = document.createElement('div');
        dropdown.className = `${NS}__user-dropdown`;
        dropdown.innerHTML = `
          <div class="${NS}__ud-header">
            <div class="${NS}__ud-user-top">
              <span class="${NS}__ud-name">token</span>
              <span class="${NS}__ud-badge">吃瓜群众</span>
              <span class="${NS}__ud-level">N</span>
            </div>
          </div>
          <div class="${NS}__ud-divider"></div>
          <div class="${NS}__ud-group">
            ${dropdownLink(dropdownLinks.topics, 'document', '我的主题')}
            ${dropdownLink(dropdownLinks.replies, 'chat', '我的回帖')}
            ${dropdownLink(dropdownLinks.favorites, 'bookmark', '我的收藏')}
            ${dropdownLink(dropdownLinks.points, 'coin', '我的积分')}
          </div>
          <div class="${NS}__ud-divider"></div>
          <div class="${NS}__ud-group">
            ${dropdownLink(dropdownLinks.notifications, 'bell', '我的通知')}
            ${dropdownLink(dropdownLinks.invite, 'gift', '邀请中心')}
            ${dropdownLink(dropdownLinks.leaderboard, 'chart', '用户榜单')}
            <button type="button" class="${NS}__ud-item" data-lsb-action="toggle-theme">${getSvg('moon')}<span>主题切换</span></button>
          </div>
          <div class="${NS}__ud-divider"></div>
          <div class="${NS}__ud-group">
            ${dropdownLink(dropdownLinks.profile, 'gear', '个人设置')}
            ${dropdownLink(dropdownLinks.logout, 'logout', '退出登录', `${NS}__ud-item--danger`)}
          </div>
        `;
        wrap.append(dropdown);
      }

      // Keep the header avatar aligned with the profile card after partial page
      // updates. The site's header placeholder and real profile image may load
      // at different times.
      const headerAvatar = wrap.querySelector(`.${NS}__header-avatar`);
      const profileAvatar = document.querySelector('.user-card img.avatar-img, .user-header img.avatar-img, .user-card img, .user-header img');
      if (headerAvatar && profileAvatar?.src && headerAvatar.src !== profileAvatar.src) {
        headerAvatar.src = profileAvatar.src;
        headerAvatar.alt = profileAvatar.alt || '用户头像';
      }
    }
  }

  function nativeProfileStat(labels) {
    const wanted = labels.map(normalizeLinkLabel);
    const candidates = [...document.querySelectorAll(
      '.user-card .user-links a[href],.user-card .user-actions a[href],.user-card .user-menu a[href],.user-card .user-nav a[href],.feature-links a[href]'
    )].filter((link) => !link.closest(`.${NS}__profile-stats`));
    const source = candidates.find((link) => {
      const label = normalizeLinkLabel(link.textContent).replace(/[\d,.万kK]+$/, '');
      return wanted.includes(label);
    });
    if (!source) return { href: '', count: '' };

    const countNode = source.querySelector('[data-count],[data-total],[data-total-count],.count,.num,.badge,strong,b');
    const rawCount = source.dataset.count
      || source.dataset.total
      || source.dataset.totalCount
      || countNode?.dataset.count
      || countNode?.dataset.total
      || countNode?.dataset.totalCount
      || countNode?.textContent
      || source.textContent.replace(/\s+/g, '').replace(new RegExp(wanted.join('|'), 'g'), '');
    const count = String(rawCount || '').match(/\d+(?:[.,]\d+)*(?:[万kK])?/)?.[0] || '';
    return { href: source.getAttribute('href') || '', count };
  }

  function enhanceUserCard() {
    const card = document.querySelector('.sidebar .user-card .user-wrap') || document.querySelector('.sidebar .user-card');
    if (!card) return;
    const loggedOut = Boolean(card.querySelector('.side-auth a[href="/login"], .side-auth a[href*="login"]'));

    // Reconstruct user header
    let userHeader = card.querySelector('.user-header');
    if (userHeader && !userHeader.querySelector(`.${NS}__user-info-top`)) {
      const avatarImg = userHeader.querySelector('img.avatar-img') || userHeader.querySelector('img') || document.querySelector('.top .nav-mine img');
      const nativeRankText = userHeader.querySelector('.user-rank')?.textContent || '';
      const nativePoints = nativeRankText.match(/积分\s*[:：]?\s*(-?\d+(?:[.,]\d+)*(?:[万kK])?)/)?.[1] || '';
      if (nativePoints) card.dataset.lsbUserPoints = nativePoints;

      // Extract username safely from candidate elements
      let userName = '';
      const nameCandidates = userHeader.querySelectorAll('.user-name, .username, a[href*="/user/"], .nickname, .name, strong, b, span');
      for (const el of nameCandidates) {
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (text && !/^[\d\s|:,./]+$/.test(text) && !text.includes('积分') && !text.includes('经验') && !text.includes('吃瓜群众')) {
          userName = text;
          break;
        }
      }
      if (!userName) {
        const navMine = document.querySelector('.top .nav-mine');
        const navMineText = navMine?.getAttribute('title') || navMine?.getAttribute('aria-label') || navMine?.textContent?.replace(/\s+/g, ' ').trim();
        if (navMineText && !navMineText.includes('菜单') && !navMineText.includes('通知')) {
          userName = navMineText;
        }
      }
      if (!userName) userName = 'token';

      const realAvatarSrc = avatarImg?.src || 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=token';
      
      userHeader.innerHTML = `
        <img class="avatar-img" src="${realAvatarSrc}" alt="${escapeAttr(userName)}">
        <div class="user-info-wrap">
          <div class="${NS}__user-info-top">
            <span class="user-name">${escapeAttr(userName)}</span>
            <span class="${NS}__user-tag">吃瓜群众</span>
            <span class="${NS}__user-level-badge">N</span>
          </div>
          ${card.dataset.lsbUserPoints ? `<div class="${NS}__user-points" title="当前总积分">${getSvg('coin')}<span>总积分</span><strong>${escapeAttr(card.dataset.lsbUserPoints)}</strong></div>` : ''}
        </div>
      `;
    }

    if (!loggedOut) {
      const notification = nativeNotificationInfo();
      const definitions = [
        { key: 'topics', label: '我的主题', labels: ['我的主题', '主题'] },
        {
          key: 'replies',
          label: '我的回复',
          labels: [],
          href: routeHref('replies'),
          count: notification.count || '0'
        },
        { key: 'favorites', label: '我的收藏', labels: ['我的收藏', '收藏'] }
      ];
      let stats = card.querySelector(`.${NS}__profile-stats`);
      if (!stats) {
        stats = document.createElement('div');
        stats.className = `${NS}__profile-stats`;
        card.querySelector('.user-header')?.insertAdjacentElement('afterend', stats);
      }
      definitions.forEach(({ key, label, labels, href: definedHref, count: definedCount }) => {
        const native = labels.length ? nativeProfileStat(labels) : { href: '', count: '' };
        const href = definedHref || native.href || routeHref(key);
        let item = stats.querySelector(`[data-lsb-profile-stat="${key}"]`);
        if (!item) {
          item = document.createElement('a');
          item.className = `${NS}__profile-stat`;
          item.dataset.lsbProfileStat = key;
          item.innerHTML = '<strong></strong><span></span>';
          stats.append(item);
        }
        if (isUsableHref(href)) item.setAttribute('href', href);
        else item.removeAttribute('href');
        const actualCount = definedCount ?? native.count;
        const value = actualCount || '—';
        const countElement = item.querySelector('strong');
        if (countElement.textContent !== value) countElement.textContent = value;
        item.querySelector('span').textContent = label;
        item.title = actualCount ? `${label}：${actualCount}` : `${label}：原站未提供数量`;
      });
    }

    if (!card.querySelector(`.${NS}__user-cta`)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${NS}__user-cta`;
      button.dataset.lsbNew = '';
      button.textContent = loggedOut ? '登录后发帖' : '+ 发布新帖';
      card.append(button);
    }

    // Hide any duplicate native buttons inside or outside user-wrap
    const rootUserCard = card.closest('.user-card') || card;
    rootUserCard.querySelectorAll('a[href*="topic"], button, .side-publish, .side-btn, .btn-publish, .create-topic, .side-post').forEach((el) => {
      if (!el.classList.contains(`${NS}__user-cta`) && !el.classList.contains(`${NS}__profile-stat`)) {
        el.style.display = 'none';
      }
    });
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
        ? `<a href="${escapeAttr(actionHref)}" class="${NS}__card-action"><span>${actionText}</span></a>`
        : `<button type="button" class="${NS}__card-action" data-lsb-hot-refresh>${actionText === '换一换' ? getSvg('refresh') : ''}<span>${actionText}</span></button>`
      }
    `;
    wrap.prepend(heading);
  }

  function classifySidebarCard(card) {
    const title = normalizeLinkLabel(card.querySelector('.quick-title, .card-title, .card-head')?.textContent);
    const labels = [...card.querySelectorAll('a, button')].map((item) => normalizeLinkLabel(item.textContent));
    const quickLabels = ['每日签到', '邀请中心', '用户榜单', '主题切换'];
    if (title === '快捷功能' || quickLabels.filter((label) => labels.includes(label)).length >= 3) {
      card.classList.add(`${NS}__quick-source`);
    } else if (title === '邀请中心' || normalizeLinkLabel(card.textContent).startsWith('邀请中心')) {
      card.classList.add(`${NS}__invite-card`);
    }
  }

  function absolutizeElementUrls(root, baseUrl) {
    root.querySelectorAll('[href],[src],[action]').forEach((node) => {
      ['href', 'src', 'action'].forEach((attribute) => {
        const value = node.getAttribute(attribute);
        if (!value || /^(?:#|data:|javascript:|mailto:|tel:)/i.test(value)) return;
        try { node.setAttribute(attribute, new URL(value, baseUrl).href); } catch (_) {}
      });
    });
  }

  function sharedSidebarIdentity() {
    return currentUserHref() || 'guest';
  }

  function sharedSidebarSnapshot(sidebar, baseUrl = document.baseURI) {
    const cards = [
      sidebar.querySelector('.online-users-card'),
      sidebar.querySelector(`.${NS}__invite-card`)
    ].filter(Boolean);
    if (!cards.length) return [];
    return cards.map((card) => {
      const clone = card.cloneNode(true);
      clone.querySelectorAll(`.${NS}__card-heading,.${NS}__more-users-btn`).forEach((node) => node.remove());
      clone.querySelectorAll('.quick-title,.online-users-head,.card-head').forEach((title) => title.style.removeProperty('display'));
      absolutizeElementUrls(clone, baseUrl);
      clone.dataset.lsbSharedSidebar = '';
      return clone.outerHTML;
    });
  }

  function cacheSharedSidebar(sidebar) {
    const cards = sharedSidebarSnapshot(sidebar);
    if (!cards.length) return;
    const value = JSON.stringify({ identity: sharedSidebarIdentity(), cards });
    if (value === sharedSidebarCacheValue) return;
    try {
      sessionStorage.setItem(SHARED_SIDEBAR_CACHE_KEY, value);
      sharedSidebarCacheValue = value;
    } catch (_) {}
  }

  function readSharedSidebarCache() {
    try {
      const value = sessionStorage.getItem(SHARED_SIDEBAR_CACHE_KEY) || '';
      const cached = JSON.parse(value || 'null');
      if (!cached || cached.identity !== sharedSidebarIdentity() || !Array.isArray(cached.cards)) return [];
      sharedSidebarCacheValue = value;
      return cached.cards;
    } catch (_) {
      return [];
    }
  }

  function mountSharedSidebarCards(sidebar, cards) {
    if (!sidebar || !cards.length) return false;
    const template = document.createElement('template');
    template.innerHTML = cards.join('');
    let changed = false;
    [...template.content.children].forEach((card) => {
      classifySidebarCard(card);
      const isOnline = card.classList.contains('online-users-card');
      const isInvite = card.classList.contains(`${NS}__invite-card`);
      if ((!isOnline && !isInvite)
        || (isOnline && sidebar.querySelector('.online-users-card'))
        || (isInvite && sidebar.querySelector(`.${NS}__invite-card`))) return;
      sidebar.append(card);
      changed = true;
    });
    return changed;
  }

  function requestSharedSidebar(sidebar) {
    if (sharedSidebarFetch || !sidebar) return;
    const run = async () => {
      try {
        const response = await fetch(routeHref('home'), { credentials: 'same-origin' });
        if (!response.ok) return;
        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
        const sourceSidebar = parsed.querySelector('.sidebar');
        if (!sourceSidebar) return;
        sourceSidebar.querySelectorAll('.card,.sidebar-card').forEach(classifySidebarCard);
        const cards = sharedSidebarSnapshot(sourceSidebar, response.url);
        if (!cards.length) return;
        const value = JSON.stringify({ identity: sharedSidebarIdentity(), cards });
        try {
          sessionStorage.setItem(SHARED_SIDEBAR_CACHE_KEY, value);
          sharedSidebarCacheValue = value;
        } catch (_) {}
        mountSharedSidebarCards(sidebar, cards);
        schedule();
      } catch (_) {}
    };
    sharedSidebarFetch = new Promise((resolve) => {
      const start = () => run().finally(resolve);
      if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 700 });
      else window.setTimeout(start, 120);
    });
  }

  function enhanceSidebarCards() {
    [...document.querySelectorAll('.sidebar .card, .sidebar .sidebar-card')].forEach(classifySidebarCard);
    const sidebar = document.querySelector('.sidebar');
    const homePage = location.pathname === '/';
    if (sidebar && homePage) {
      cacheSharedSidebar(sidebar);
    } else if (sidebar) {
      mountSharedSidebarCards(sidebar, readSharedSidebarCache());
      if (!sidebar.querySelector('.online-users-card') || !sidebar.querySelector(`.${NS}__invite-card`)) {
        requestSharedSidebar(sidebar);
      }
    }
    makeCardHeading(document.querySelector('.daily-hot-topics-card'), '热门话题', 'fire', '换一换');
    makeCardHeading(document.querySelector('.forum-enhancements-sidebar-card'), '版块统计', 'chart', '查看全部', routeHref('home'));

    const onlineCard = document.querySelector('.sidebar .online-users-card');
    if (onlineCard) {
      makeCardHeading(onlineCard, '活跃用户', 'people', '查看更多', routeHref('leaderboard'));
    }
  }

  function enhanceLeftForums() {
    const panel = document.querySelector(`.${NS}__left-panel`);
    const sourceCard = document.querySelector(`.sidebar .forum-enhancements-sidebar-card`);
    const sourceList = sourceCard?.querySelector('.forum-enhancements-sidebar-list');
    if (!panel || !sourceCard || !sourceList) return;

    sourceCard.classList.add(`${NS}__forum-source`);
    const duplicateLabels = new Set(['技术交流', '资源分享', '求助问答', '社区公告']);
    const forumLabel = (link) => normalizeLinkLabel(link.textContent).replace(/[\d,.]+$/, '');
    const sourceLinks = [...sourceList.querySelectorAll('a[href]')]
      .filter((link) => !duplicateLabels.has(forumLabel(link)));
    const signature = sourceLinks
      .map((link) => `${link.getAttribute('href') || ''}|${link.textContent.replace(/\s+/g, ' ').trim()}`)
      .join('\u001f');
    if (!signature) return;

    let section = panel.querySelector(`.${NS}__left-forums`);
    if (!section) {
      section = document.createElement('section');
      section.className = `${NS}__left-forums`;
      section.innerHTML = `<div class="${NS}__left-forums-title">更多版块</div><div class="${NS}__left-forums-content"></div>`;
      const signatureCard = panel.querySelector(`.${NS}__signature-card`);
      panel.insertBefore(section, signatureCard || null);
    }
    if (section.dataset.sourceSignature === signature) return;

    const clone = sourceList.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    clone.querySelectorAll('a[href]').forEach((link) => {
      if (duplicateLabels.has(forumLabel(link))) (link.closest('li') || link).remove();
    });
    section.querySelector(`.${NS}__left-forums-content`)?.replaceChildren(clone);
    section.dataset.sourceSignature = signature;
  }

  function enhanceToolbar() {
    const search = document.querySelector('.top .search-input');
    if (search) search.placeholder = '搜索帖子、用户、标签或内容...';

    const tabBar = document.querySelector('.topic-toolbar .tab-bar');
    if (tabBar) {
      [...tabBar.querySelectorAll('a[href]')].forEach((tab) => {
        const label = normalizeLinkLabel(tab.textContent);
        if (label === '新帖子') tab.textContent = '最新发布';
        if (label === '新评论') tab.textContent = '最新回复';
      });
    }

    const toolbar = document.querySelector('.topic-toolbar');
    if (toolbar && tabBar && !toolbar.querySelector(`.${NS}__toolbar-filter`)) {
      const seen = new Set();
      const options = [...tabBar.querySelectorAll('a[href]')].map((tab) => ({
        label: tab.textContent.trim(),
        href: tab.getAttribute('href') || '',
        active: tab.classList.contains('active')
      })).filter((option) => {
        const key = `${normalizeLinkLabel(option.label)}|${option.href}`;
        if (!option.label || !isUsableHref(option.href) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (options.length) {
        const selected = options.find((option) => option.active) || options.find((option) => option.label === '最新发布') || options[0];
        const filter = document.createElement('div');
        filter.className = `${NS}__toolbar-filter`;
        filter.innerHTML = `
          <button type="button" class="${NS}__toolbar-filter-trigger" data-lsb-filter-toggle aria-haspopup="menu" aria-expanded="false">
            <span>${escapeAttr(selected.label)}</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="${NS}__toolbar-filter-menu" role="menu">
            ${options.map((option) => `<a class="${NS}__toolbar-filter-option ${option.active ? 'is-active' : ''}" href="${escapeAttr(option.href)}" role="menuitem">${escapeAttr(option.label)}</a>`).join('')}
          </div>`;
        toolbar.append(filter);
      }
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
      moreBtn.href = routeHref('leaderboard');
      moreBtn.textContent = '···';
      grid.append(moreBtn);
    }
  }

  function enhanceTopicRows() {
    // Detail replies share .post-list/.post-item with the home feed. Keep metrics off reply floors.
    document.querySelectorAll(`.topic-post-list .${NS}__row-metrics`).forEach((metrics) => metrics.remove());
    document.querySelectorAll('.forum-main .post-list:not(.topic-post-list) > .post-item').forEach((row, index) => {
      // Reformat meta line
      const meta = row.querySelector('.post-meta');
      if (meta && !meta.querySelector('.meta-author')) {
        const elements = [...meta.children];
        const authorText = elements[0]?.textContent?.trim() || '用户';
        const timeText = elements[elements.length - 1]?.textContent?.trim() || '刚刚';
        const replyCount = elements
          .map((element) => element.textContent?.trim() || '')
          .find((text) => /^\d+$/.test(text)) || '';
        if (replyCount) row.dataset.lsbReplyCount = replyCount;
        
        meta.innerHTML = `
          <span class="meta-author">${getSvg('user')}${authorText}</span>
          <span class="meta-dot">·</span>
          <span class="meta-time">${getSvg('clock')}${timeText}</span>
        `;
      }

      // Add special tags (only in local file preview mode to avoid duplicating live tags)
      if (location.protocol === 'file:') {
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
      }

      // Only show the native reply count. The site does not provide views or likes here.
      if (!row.querySelector(`.${NS}__row-metrics`)) {
        const replyCount = row.dataset.lsbReplyCount || '';
        if (replyCount) {
          const metrics = document.createElement('div');
          metrics.className = `${NS}__row-metrics`;
          metrics.dataset.source = 'native';
          metrics.innerHTML = `<span class="${NS}__row-metric" title="回复数（原站数据）">${getSvg('chat')}<span>${replyCount}</span></span>`;
          row.append(metrics);
        }
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
    const original = document.querySelector('a[href*="topic_edit"],a[href*="topic_create"],a[href*="topic/create"],a[href*="topic/add"],.create-topic,.new-topic,[data-create-topic]');
    if (original && !original.closest(`.${NS}__left`)) { original.click(); return; }
    const loggedOut = document.querySelector('.user-card .side-auth a[href*="login"],.nav-mine[href*="login"]') || !currentUserHref();
    location.href = loggedOut ? routeHref('login') : routeHref('newTopic');
  }

  function closeSettings() {
    const settings = document.querySelector(`.${NS}__settings`);
    if (!settings) return;
    settings.classList.remove('is-open', 'is-desktop-anchor');
    settings.style.removeProperty('left');
    settings.style.removeProperty('top');
    settings.querySelector(`.${NS}__settings-toggle`)?.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('[data-lsb-settings]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }

  function closeToolbarFilter() {
    const filter = document.querySelector(`.${NS}__toolbar-filter.is-open`);
    if (!filter) return;
    filter.classList.remove('is-open');
    filter.querySelector('[data-lsb-filter-toggle]')?.setAttribute('aria-expanded', 'false');
  }

  function toggleSettings(anchor) {
    const settings = document.querySelector(`.${NS}__settings`);
    if (!settings) return;
    if (settings.classList.contains('is-open')) {
      closeSettings();
      return;
    }

    const desktopAnchor = anchor?.matches?.('[data-lsb-settings]') && !window.matchMedia('(max-width: 720px)').matches;
    settings.classList.toggle('is-desktop-anchor', desktopAnchor);
    settings.classList.add('is-open');
    if (desktopAnchor) {
      const rect = anchor.getBoundingClientRect();
      const menu = settings.querySelector(`.${NS}__settings-menu`);
      const menuHeight = menu?.offsetHeight || 140;
      settings.style.left = `${Math.min(rect.right + 10, window.innerWidth - 210)}px`;
      settings.style.top = `${Math.max(8, Math.min(rect.top - 4, window.innerHeight - menuHeight - 8))}px`;
    }
    settings.querySelector(`.${NS}__settings-toggle`)?.setAttribute('aria-expanded', 'true');
    document.querySelectorAll('[data-lsb-settings]').forEach((button) => button.setAttribute('aria-expanded', 'true'));
  }

  function teardown() {
    disabled = true;
    finishBoot();
    observer?.disconnect();
    document.documentElement.classList.remove(NS, BOOTING_CLASS, `${NS}--compact`, `${NS}--no-right`);
    document.querySelector(`.${NS}__left`)?.remove();
    document.querySelector(`.${NS}__settings`)?.remove();
    document.querySelector(`.${NS}__footer`)?.remove();
    document.querySelector('.forum-layout')?.classList.remove(`${NS}__layout`);
  }

  function middleCacheKey(href) {
    try {
      const url = new URL(href, location.href);
      url.hash = '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function rememberMiddlePage(href = displayedMiddleUrl) {
    const key = middleCacheKey(href);
    const main = document.querySelector('.forum-main');
    if (!key || !main) return;
    middlePageCache.delete(key);
    middlePageCache.set(key, { main, title: document.title });
    while (middlePageCache.size > 8) middlePageCache.delete(middlePageCache.keys().next().value);
  }

  function updateCurrentHistoryScroll() {
    if (middleNavigationPending || !history.state?.lsbMiddleNavigation) return;
    history.replaceState({ ...history.state, scrollY: window.scrollY }, '', location.href);
  }

  function markInitialMiddleHistory() {
    displayedMiddleUrl = middleCacheKey(location.href) || location.href;
    history.replaceState({
      ...(history.state || {}),
      lsbMiddleNavigation: true,
      url: displayedMiddleUrl,
      scrollY: window.scrollY
    }, '', location.href);
    rememberMiddlePage(displayedMiddleUrl);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }

  function topicLinkForMiddleNavigation(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download')) return null;
    let url;
    try { url = new URL(link.href, location.href); } catch (_) { return null; }
    if (url.origin !== location.origin || middleCacheKey(url.href) === middleCacheKey(displayedMiddleUrl)) return null;
    const topicRoute = /\/topic\/[^/?#]+\/?$/i.test(url.pathname)
      || (url.searchParams.get('a') === 'topic' && Boolean(url.searchParams.get('id')));
    const topicSurface = link.matches('.post-title,.daily-hot-topics-list a') || topicRoute;
    return topicSurface && document.querySelector('.forum-main') ? url : null;
  }

  async function navigateMiddle(href, { push = true, scrollY = 0 } = {}) {
    const targetUrl = new URL(href, location.href);
    const targetKey = middleCacheKey(targetUrl.href);
    if (!targetKey || targetKey === middleCacheKey(displayedMiddleUrl)) return;

    const sequence = ++middleNavigationSequence;
    middleNavigationController?.abort();
    const controller = new AbortController();
    middleNavigationController = controller;
    if (push) updateCurrentHistoryScroll();
    middleNavigationPending = true;
    rememberMiddlePage(displayedMiddleUrl);

    const outgoingMain = document.querySelector('.forum-main');
    outgoingMain?.classList.add(`${NS}__middle-loading`);
    let destination = middlePageCache.get(targetKey);
    let fallbackHref = targetUrl.href;
    try {
      if (!destination) {
        const response = await fetch(targetUrl.href, {
          credentials: 'same-origin',
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        fallbackHref = response.url || fallbackHref;
        if (response.redirected && middleCacheKey(response.url) !== targetKey) {
          if (push) location.assign(response.url);
          else location.reload();
          return;
        }
        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
        const main = parsed.querySelector('.forum-main');
        if (!main) throw new Error('目标页面缺少主内容区域');
        absolutizeElementUrls(main, response.url || targetUrl.href);
        destination = { main, title: parsed.title || document.title };
        middlePageCache.set(targetKey, destination);
      }
      if (sequence !== middleNavigationSequence) return;

      const currentMain = document.querySelector('.forum-main');
      if (!currentMain) throw new Error('当前页面缺少主内容区域');
      destination.main.classList.remove(`${NS}__middle-loading`);
      currentMain.replaceWith(destination.main);
      document.title = destination.title;
      displayedMiddleUrl = targetKey;
      if (push) {
        history.pushState({ lsbMiddleNavigation: true, url: targetKey, scrollY: 0 }, '', targetUrl.href);
      }
      window.scrollTo(0, Math.max(0, Number(scrollY) || 0));
      invalidateRouteHrefCache();
      schedule();
    } catch (error) {
      if (error?.name === 'AbortError' || sequence !== middleNavigationSequence) return;
      if (push) location.assign(fallbackHref);
      else location.reload();
    } finally {
      if (sequence === middleNavigationSequence) {
        middleNavigationPending = false;
        document.querySelector('.forum-main')?.classList.remove(`${NS}__middle-loading`);
      }
    }
  }

  function refreshLeftNavigation() {
    const current = document.querySelector(`.${NS}__left .${NS}__nav`);
    if (!current) return;
    const replacement = buildLeft().querySelector(`.${NS}__nav`);
    if (replacement) current.replaceWith(replacement);
  }

  function bindEvents() {
    if (document.body.dataset.lsbModernBound) return;
    document.body.dataset.lsbModernBound = 'true';
    document.addEventListener('click', (event) => {
      const openSettings = document.querySelector(`.${NS}__settings.is-open`);
      if (openSettings && !event.target.closest(`.${NS}__settings,[data-lsb-settings]`)) closeSettings();
      const openFilter = document.querySelector(`.${NS}__toolbar-filter.is-open`);
      if (openFilter && !event.target.closest(`.${NS}__toolbar-filter`)) closeToolbarFilter();
      const target = event.target.closest('button,a');
      if (!target) return;
      if (target.hasAttribute('data-lsb-notifications') || isNotificationHref(target.getAttribute('href') || '')) {
        clearNotificationState();
      }
      if (target.hasAttribute('data-lsb-filter-toggle')) {
        const filter = target.closest(`.${NS}__toolbar-filter`);
        const open = filter?.classList.toggle('is-open') || false;
        target.setAttribute('aria-expanded', String(open));
      }
      if (target.matches(`.${NS}__toolbar-filter-option`)) closeToolbarFilter();
      if (target.matches('[data-lsb-new]')) openNewTopic();
      if (target.matches('[data-lsb-settings],.lsb-modern__settings-toggle')) toggleSettings(target);
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
      if (target.dataset.lsbAction === 'disable') teardown();
      if (target.closest(`.${NS}__settings-menu`) && target.dataset.lsbAction) closeSettings();
      if (target.hasAttribute('data-lsb-hot-refresh')) {
        const list = document.querySelector('.daily-hot-topics-list');
        if (list?.firstElementChild) list.append(list.firstElementChild);
        [...(list?.children || [])].forEach((item, index) => {
          const rank = item.querySelector(`.${NS}__hot-rank`);
          if (rank) rank.textContent = String(index + 1);
        });
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeSettings();
        closeToolbarFilter();
      }
    });

    // Warm the browser cache while the user is aiming at a topic. This keeps
    // normal native navigation semantics, but removes a network round trip
    // from the common hover/click path on desktop and pointer-down on touch.
    const topicLinkFromEvent = (event) => event.target.closest?.(
      '.forum-main .post-list:not(.topic-post-list) .post-title[href]'
    );
    const prefetchTopic = (link) => {
      if (!link || prefetchedTopicUrls.size >= 16) return;
      let url;
      try {
        url = new URL(link.href, location.href);
      } catch (_) {
        return;
      }
      if (url.origin !== location.origin || url.href === location.href || prefetchedTopicUrls.has(url.href)) return;
      prefetchedTopicUrls.add(url.href);
      const hint = document.createElement('link');
      hint.rel = 'prefetch';
      hint.as = 'document';
      hint.href = url.href;
      document.head?.append(hint);
    };
    document.addEventListener('pointerover', (event) => {
      const link = topicLinkFromEvent(event);
      if (!link || topicPrefetchTimers.has(link)) return;
      const timer = window.setTimeout(() => {
        topicPrefetchTimers.delete(link);
        prefetchTopic(link);
      }, 70);
      topicPrefetchTimers.set(link, timer);
    }, { passive: true });
    document.addEventListener('pointerout', (event) => {
      const link = topicLinkFromEvent(event);
      if (!link || link.contains(event.relatedTarget)) return;
      const timer = topicPrefetchTimers.get(link);
      if (timer) window.clearTimeout(timer);
      topicPrefetchTimers.delete(link);
    }, { passive: true });
    document.addEventListener('pointerdown', (event) => prefetchTopic(topicLinkFromEvent(event)), { passive: true });
    document.addEventListener('focusin', (event) => prefetchTopic(topicLinkFromEvent(event)), { passive: true });
    markInitialMiddleHistory();
    document.addEventListener('click', (event) => {
      const url = topicLinkForMiddleNavigation(event);
      if (!url) return;
      event.preventDefault();
      closeSettings();
      closeToolbarFilter();
      navigateMiddle(url.href, { push: true });
    });
    window.addEventListener('popstate', (event) => {
      if (!event.state?.lsbMiddleNavigation) {
        location.reload();
        return;
      }
      navigateMiddle(event.state.url || location.href, {
        push: false,
        scrollY: event.state.scrollY || 0
      });
    });
    window.addEventListener('scroll', () => {
      if (historyScrollScheduled) return;
      historyScrollScheduled = true;
      requestAnimationFrame(() => {
        historyScrollScheduled = false;
        updateCurrentHistoryScroll();
      });
    }, { passive: true });
  }

  function enhance() {
    scheduled = false;
    if (disabled) return;
    const layout = document.querySelector('.forum-layout');
    if (!layout) return;
    const currentRoute = `${location.pathname}${location.search}`;
    if (currentRoute !== route) {
      route = currentRoute;
      invalidateRouteHrefCache();
      if (isNotificationHref()) clearNotificationState();
      refreshLeftNavigation();
    }
    addStyles();
    document.documentElement.classList.add(NS);
    layout.classList.add(`${NS}__layout`);
    if (!layout.querySelector(`:scope>.${NS}__left`)) layout.prepend(buildLeft());
    if (!document.querySelector(`.${NS}__settings`)) document.body.append(buildSettings());
    enhanceHeader();
    enhanceUserCard();
    enhanceSidebarCards();
    enhanceLeftForums();
    enhanceToolbar();
    enhanceHotTopics();
    enhanceActiveUsers();
    enhanceTopicRows();
    buildFooter();
    applyPreferences();
    bindEvents();
    finishBoot();

    // Do not let our own idempotent DOM decorations wake the observer and
    // trigger another full document pass on the next animation frame.
    observer?.takeRecords();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function observeDocument() {
    if (observer || disabled) return;
    const target = document.documentElement;
    if (!target) {
      window.setTimeout(observeDocument, 0);
      return;
    }
    if (bootPending) target.classList.add(NS, BOOTING_CLASS);
    observer = new MutationObserver((mutations) => {
      const hasNativeChange = mutations.some((mutation) => {
        if (mutation.type === 'attributes') return true;
        const target = mutation.target.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target.parentElement;
        return !target?.closest?.(`.${NS}__left,.${NS}__top-actions,.${NS}__user-dropdown,.${NS}__settings,.${NS}__footer,.${NS}__card-heading,.${NS}__row-metrics`);
      });
      if (!hasNativeChange) return;
      invalidateRouteHrefCache();
      schedule();
    });
    observer.observe(target, {
      childList: true,
      attributes: true,
      attributeFilter: ['data-notification-count', 'data-unread-count'],
      subtree: true
    });
  }

  addStyles();
  enhance();
  observeDocument();
  document.addEventListener('DOMContentLoaded', () => {
    enhance();
    if (!document.querySelector('.forum-layout')) finishBoot();
  }, { once: true });
})();
