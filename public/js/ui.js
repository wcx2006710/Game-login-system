/*!
 * ui.js - 交互增强工具集（零依赖，离线可用）
 * 配套样式：public/styles/components.css
 *
 * 提供：
 *   UI.toast(msg, type, duration)    Toast 通知
 *   UI.withSpinner(btn, fn)          按钮 loading 状态
 *   UI.renderSkeleton(tbody, r, c)   表格骨架屏
 *   UI.scorePassword(pwd, username)  密码强度评分（0-4）
 *   UI.formatDate(str)               格式化后端返回的 created_at
 *
 * 说明：所有用户可控内容一律用 textContent 写入，不使用 innerHTML，避免 XSS。
 */
(function () {
  'use strict';

  /* ---------------- Toast ---------------- */

  var TOAST_ICON = {
    success: 'circle-check',
    error: 'triangle-alert',
    warning: 'triangle-alert',
    info: 'zap'
  };

  function ensureStack() {
    var stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  /**
   * 弹出一条 Toast。
   * @param {string} message 文案
   * @param {'success'|'error'|'warning'|'info'} [type='info']
   * @param {number} [duration=3000] 毫秒，0 表示不自动关闭
   */
  function toast(message, type, duration) {
    type = TOAST_ICON[type] ? type : 'info';
    duration = typeof duration === 'number' ? duration : 3000;

    var el = document.createElement('div');
    el.className = 'toast toast--' + type;

    var icon = document.createElement('span');
    icon.className = 'icon';
    icon.setAttribute('data-icon', TOAST_ICON[type]);
    el.appendChild(icon);

    var text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);

    ensureStack().appendChild(el);
    if (window.Icons) window.Icons.render(el);

    var timer = null;
    function dismiss() {
      if (timer) clearTimeout(timer);
      el.classList.add('is-leaving');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 220);
    }

    el.addEventListener('click', dismiss);
    if (duration > 0) timer = setTimeout(dismiss, duration);
    return dismiss;
  }

  /* ---------------- 按钮 Loading ---------------- */

  /**
   * 让按钮进入 loading 态并执行异步任务，结束后自动恢复。
   * @param {HTMLElement} btn
   * @param {Function} task 返回 Promise 的函数
   * @returns {Promise}
   */
  function withSpinner(btn, task) {
    var original = btn.innerHTML;
    var spinner = document.createElement('span');
    spinner.className = 'spinner';

    btn.classList.add('is-loading');
    btn.disabled = true;
    btn.innerHTML = '';
    btn.appendChild(spinner);

    function restore() {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      btn.innerHTML = original;
    }

    return Promise.resolve()
      .then(task)
      .then(
        function (value) {
          restore();
          return value;
        },
        function (error) {
          restore();
          throw error;
        }
      );
  }

  /* ---------------- 骨架屏 ---------------- */

  /**
   * 在 tbody 中渲染骨架行。
   * @param {HTMLElement} tbody
   * @param {number} rows 行数
   * @param {number} cols 列数
   */
  function renderSkeleton(tbody, rows, cols) {
    if (!tbody) return;
    tbody.textContent = '';
    rows = rows || 4;
    cols = cols || 5;

    for (var r = 0; r < rows; r += 1) {
      var tr = document.createElement('tr');
      tr.className = 'skeleton-row';
      for (var c = 0; c < cols; c += 1) {
        var td = document.createElement('td');
        var bar = document.createElement('div');
        bar.className = 'skeleton skeleton-bar';
        // 让每列宽度略有差异，视觉更自然
        bar.style.width = 55 + ((r * 7 + c * 13) % 35) + '%';
        td.appendChild(bar);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  /* ---------------- 密码强度 ---------------- */

  var WEAK_LIST = [
    '123456',
    '12345678',
    '123456789',
    '111111',
    '000000',
    'password',
    'abc123',
    'a123456',
    'qwerty',
    'iloveyou',
    'admin',
    'root',
    'test123',
    '123123',
    '654321',
    'password123',
    'letmein',
    'welcome',
    'monkey',
    'dragon'
  ];

  var LABELS = ['请输入密码', '弱', '中', '较强', '强'];

  /**
   * 轻量密码强度评分（替代 398 KB 的 zxcvbn）。
   * @param {string} pwd
   * @param {string} [username] 用于检测「密码包含用户名」
   * @returns {{score:number,label:string}}
   */
  function scorePassword(pwd, username) {
    if (!pwd) return { score: 0, label: LABELS[0] };

    var lower = pwd.toLowerCase();

    // 弱口令 / 包含用户名 → 直接判弱
    if (WEAK_LIST.indexOf(lower) !== -1) return { score: 1, label: LABELS[1] };
    if (username && lower.indexOf(String(username).toLowerCase()) !== -1) {
      return { score: 1, label: '不可包含用户名' };
    }

    var score = 0;

    // 长度
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;

    // 字符种类
    var kinds = 0;
    if (/[a-z]/.test(pwd)) kinds += 1;
    if (/[A-Z]/.test(pwd)) kinds += 1;
    if (/[0-9]/.test(pwd)) kinds += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) kinds += 1;
    if (kinds >= 3) score += 1;
    if (kinds === 4 && pwd.length >= 10) score += 1;

    // 扣分：连续或重复字符（abc / 123 / aaa）
    if (/(.)\1{2,}/.test(pwd)) score -= 1;
    if (/(?:abc|bcd|cde|123|234|345|456|567|678|789|012)/i.test(pwd)) score -= 1;

    score = Math.max(1, Math.min(4, score));
    return { score: score, label: LABELS[score] };
  }

  /* ---------------- 日期格式化 ---------------- */

  /**
   * 后端 created_at 形如 "2026-09-21 14:03:12"（UTC，非 ISO）。
   * 这里只做字符串切片，避免 new Date() 在不同环境下解析出 NaN。
   * @param {string} value
   * @returns {string}
   */
  function formatDate(value) {
    if (!value) return '—';
    var s = String(value);
    var date = s.slice(0, 10);
    if (!date) return '—';
    if (s.length > 10) return date + ' ' + s.slice(11, 16);
    return date;
  }

  /** 取日期部分（YYYY-MM-DD），空值返回 '未知' */
  function dayOf(value) {
    if (!value) return '未知';
    var d = String(value).slice(0, 10);
    return d || '未知';
  }

  window.UI = {
    toast: toast,
    withSpinner: withSpinner,
    renderSkeleton: renderSkeleton,
    scorePassword: scorePassword,
    formatDate: formatDate,
    dayOf: dayOf
  };
})();
