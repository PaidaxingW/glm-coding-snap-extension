const ALARM_NAME = 'glm-snap-alarm';
const TARGET_URL = 'https://bigmodel.cn/glm-coding';
const CST_OFFSET_MS = 8 * 60 * 60 * 1000; // CST = UTC+8, no DST

const STORAGE_KEY = {
  ENABLED: 'enabled',
  OFFSET_MIN: 'offsetMin',
  NOTIFY: 'notify',
  LAST_RESULT: 'lastResult',
  NEXT_TRIGGER_UTC: 'nextTriggerUTC',
  PACKAGE_TYPE: 'packageType'
};

function computeNextTriggerUTC(offsetMin = 0) {
  const now = new Date();
  const today02UTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 0, 0, 0));
  let target = new Date(today02UTC.getTime() - offsetMin * 60 * 1000);
  if (target.getTime() <= now.getTime()) {
    target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
  }
  return target;
}

function formatUTCToCST(utcTime) {
  const d = new Date(utcTime + CST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} CST`;
}

function sendNotification(title, message) {
  chrome.storage.local.get([STORAGE_KEY.NOTIFY], (result) => {
    if (result[STORAGE_KEY.NOTIFY] !== false) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: title,
        message: message
      });
    }
  });
}

function ensureActiveAlarm() {
  chrome.storage.local.get([STORAGE_KEY.ENABLED, STORAGE_KEY.OFFSET_MIN], (items) => {
    const enabled = items[STORAGE_KEY.ENABLED] !== false;
    const offsetMin = Number(items[STORAGE_KEY.OFFSET_MIN] || 0);

    if (!enabled) {
      chrome.alarms.clear(ALARM_NAME);
      return;
    }

    const next = computeNextTriggerUTC(offsetMin);
    chrome.storage.local.set({ [STORAGE_KEY.NEXT_TRIGGER_UTC]: next.toISOString() });

    chrome.alarms.get(ALARM_NAME, (existing) => {
      if (!existing || Math.abs(existing.scheduledTime - next.getTime()) > 60000) {
        chrome.alarms.clear(ALARM_NAME, () => {
          chrome.alarms.create(ALARM_NAME, { when: next.getTime(), periodInMinutes: 1440 });
          console.log(`[GLM Snap] Alarm set: ${formatUTCToCST(next)}`);
        });
      }
    });
  });
}

function findOrCreateTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: TARGET_URL + '*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true }, (tab) => resolve(tab));
      } else {
        chrome.tabs.create({ url: TARGET_URL, active: true }, (tab) => resolve(tab));
      }
    });
  });
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('页面加载超时'));
    }, 30000);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1500);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('标签页不存在'));
        return;
      }
      if (tab.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1500);
      }
    });
  });
}

function sendMessageToTab(tabId, message, retry = true) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError && retry) {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        }, () => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (retryResponse) => {
              resolve(retryResponse || { success: false, error: '无法与页面通信' });
            });
          }, 1000);
        });
      } else {
        resolve(response || { success: false, error: '无响应' });
      }
    });
  });
}

async function executeSnapSequence() {
  try {
    sendNotification('抢购启动', '正在准备抢购 GLM Coding Pro...');
    chrome.storage.local.set({ lastRunStatus: 'running', lastRunTime: Date.now() });

    const tab = await findOrCreateTab();
    if (!tab) throw new Error('无法创建或找到目标标签页');

    await waitForTabLoad(tab.id);
    const data = await new Promise(resolve => chrome.storage.local.get([STORAGE_KEY.PACKAGE_TYPE], resolve));
    const packageType = data[STORAGE_KEY.PACKAGE_TYPE] || 'pro';
    const response = await sendMessageToTab(tab.id, { action: 'snap', packageType });

    if (response && response.success) {
      sendNotification('抢购操作完成', response.message || '已成功点击购买按钮');
      chrome.storage.local.set({
        lastRunStatus: 'success',
        lastRunResult: response.message || '成功'
      });
    } else {
      const errorMsg = response?.error || response?.reason || '未知错误';
      sendNotification('抢购失败', `错误: ${errorMsg}`);
      chrome.storage.local.set({ lastRunStatus: 'failed', lastRunResult: errorMsg });
    }
  } catch (error) {
    sendNotification('抢购异常', error.message);
    chrome.storage.local.set({ lastRunStatus: 'error', lastRunResult: error.message });
  }

  ensureActiveAlarm();
}

// ========== 事件监听 ==========

// 定时任务触发
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    chrome.storage.local.get([STORAGE_KEY.ENABLED], (result) => {
      if (result[STORAGE_KEY.ENABLED] !== false) {
        executeSnapSequence();
      } else {
        console.log('[GLM Snap] 扩展已禁用，跳过本次触发');
      }
    });
  }
});

// 扩展安装/启动时初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[GLM Snap] 扩展已安装/更新');
  chrome.storage.local.set({
    [STORAGE_KEY.ENABLED]: true,
    [STORAGE_KEY.OFFSET_MIN]: 0,
    [STORAGE_KEY.NOTIFY]: true,
    [STORAGE_KEY.LAST_RESULT]: '无',
    lastRunStatus: 'never'
  }, () => {
    ensureActiveAlarm();
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[GLM Snap] 浏览器启动');
  ensureActiveAlarm();
});

// 接收来自popup/options的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'trigger-now') {
    executeSnapSequence().then(() => sendResponse({ ok: true }));
    return true; // 异步响应
  } else if (request.type === 'recompute-next') {
    ensureActiveAlarm();
    sendResponse({ ok: true });
    return true;
  } else if (request.type === 'get-status') {
    chrome.storage.local.get([
      STORAGE_KEY.ENABLED,
      STORAGE_KEY.NEXT_TRIGGER_UTC,
      'lastRunStatus',
      'lastRunTime',
      STORAGE_KEY.LAST_RESULT
    ], (data) => {
      sendResponse(data);
    });
    return true; // 异步响应
  }
});

// 初始化
ensureActiveAlarm();
