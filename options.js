(function () {
  const KEYS = {
    ENABLED: 'enabled',
    OFFSET_MIN: 'offsetMin',
    NOTIFY: 'notify',
    PACKAGE_TYPE: 'packageType'
  };

  function $(id) { return document.getElementById(id); }

  function loadSettings() {
    chrome.storage.local.get([KEYS.ENABLED, KEYS.OFFSET_MIN, KEYS.NOTIFY, KEYS.PACKAGE_TYPE], (items) => {
      $('enableAuto').checked = items[KEYS.ENABLED] !== false;
      $('packageType').value = items[KEYS.PACKAGE_TYPE] || 'pro';
      $('offsetMin').value = Number(items[KEYS.OFFSET_MIN] || 0);
      $('notify').checked = items[KEYS.NOTIFY] !== false;
    });
  }

  function saveSettings() {
    chrome.storage.local.set({
      [KEYS.ENABLED]: $('enableAuto').checked,
      [KEYS.PACKAGE_TYPE]: $('packageType').value,
      [KEYS.OFFSET_MIN]: Number($('offsetMin').value || 0),
      [KEYS.NOTIFY]: $('notify').checked
    }, () => {
      chrome.runtime.sendMessage({ type: 'recompute-next' }, () => alert('设置已保存！'));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    const saveBtn = $('saveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);
  });
})();
