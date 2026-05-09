(function () {
  const STORAGE_KEYS = {
    ENABLED: 'enabled',
    NEXT_TRIGGER_UTC: 'nextTriggerUTC',
    LAST_RESULT: 'lastResult',
    LAST_RUN_STATUS: 'lastRunStatus',
    PACKAGE_TYPE: 'packageType'
  };

  const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

  function el(id) { return document.getElementById(id); }

  function formatCST(utcTimeStr) {
    if (!utcTimeStr) return '计算中...';
    const d = new Date(utcTimeStr);
    const cstTime = new Date(d.getTime() + CST_OFFSET_MS);
    return `${cstTime.getFullYear()}-${String(cstTime.getMonth() + 1).padStart(2, '0')}-${String(cstTime.getDate()).padStart(2, '0')} ${String(cstTime.getHours()).padStart(2, '0')}:${String(cstTime.getMinutes()).padStart(2, '0')} CST`;
  }

  function getStatusText(status) {
    const map = { 'never': '从未运行', 'running': '运行中...', 'success': '成功', 'failed': '失败', 'error': '异常' };
    return map[status] || status || '未知';
  }

  function render() {
    chrome.storage.local.get([
      STORAGE_KEYS.ENABLED,
      STORAGE_KEYS.NEXT_TRIGGER_UTC,
      STORAGE_KEYS.LAST_RESULT,
      STORAGE_KEYS.LAST_RUN_STATUS,
      STORAGE_KEYS.PACKAGE_TYPE
    ], (items) => {
      const enabled = items[STORAGE_KEYS.ENABLED] !== false;
      el('enabledBox').checked = enabled;
      el('status').textContent = enabled ? '已开启' : '已关闭';
      const pkg = (items[STORAGE_KEYS.PACKAGE_TYPE] || 'pro').toLowerCase();
      const radios = document.querySelectorAll('input[name="pkg"]');
      radios.forEach(r => r.checked = (r.value === pkg));
      el('nextTime').textContent = formatCST(items[STORAGE_KEYS.NEXT_TRIGGER_UTC]);
      el('lastResult').textContent = items[STORAGE_KEYS.LAST_RESULT] || '无';
      el('lastStatus').textContent = getStatusText(items[STORAGE_KEYS.LAST_RUN_STATUS]);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();

    el('triggerBtn').addEventListener('click', () => {
      el('triggerBtn').disabled = true;
      el('triggerBtn').textContent = '触发中...';
      chrome.runtime.sendMessage({ type: 'trigger-now' }, () => {
        setTimeout(() => {
          render();
          el('triggerBtn').disabled = false;
          el('triggerBtn').textContent = '立即触发测试';
        }, 2000);
      });
    });

    el('enabledBox').addEventListener('change', (e) => {
      chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: e.target.checked }, () => {
        chrome.runtime.sendMessage({ type: 'recompute-next' }, render);
      });
    });

    document.querySelectorAll('input[name="pkg"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          chrome.storage.local.set({ [STORAGE_KEYS.PACKAGE_TYPE]: e.target.value }, render);
        }
      });
    });

    setInterval(render, 5000);
  });
})();
