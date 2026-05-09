function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function humanDelay(min = 100, max = 500) {
  const ms = Math.floor(min + Math.random() * (max - min));
  await sleep(ms);
}

function isLoggedIn() {
  const loggedInSelectors = [
    '[class*="user-info"]',
    '[class*="avatar"]',
    'img[alt*="头像"]',
    '.user-avatar'
  ];
  if (loggedInSelectors.some(sel => document.querySelector(sel))) return true;

  const allButtons = Array.from(document.querySelectorAll('button, a'));
  const hasLoginBtn = allButtons.some(el => /登录|Login|Sign in/i.test(el.textContent || ''));
  return !hasLoginBtn;
}

function clickLogin() {
  const allButtons = Array.from(document.querySelectorAll('button, a'));
  const loginBtn = allButtons.find(el => /登录|Login|Sign in/i.test(el.textContent || ''));
  if (loginBtn) {
    loginBtn.click();
    return true;
  }
  return false;
}

async function waitForLogin(maxAttempts = 6, initialDelay = 1000) {
  let attempt = 0;
  let delay = initialDelay;
  while (attempt < maxAttempts) {
    if (isLoggedIn()) return true;
    await sleep(delay);
    delay = Math.min(delay * 1.5, 5000);
    attempt++;
  }
  return isLoggedIn();
}

function findPackageButton(packageType) {
  const type = (packageType || 'pro').toLowerCase();
  const target = { lite: 'lite', pro: 'pro', max: 'max' }[type] || 'pro';

  const selectors = [
    `[data-package="${target}"]`,
    `[data-plan="${target}"]`,
    `[data-product="${target}"]`,
    `button[data-name*="${target}" i]`,
    `a[data-name*="${target}" i]`,
    `.${target}-package button`,
    `.package-${target} button`
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  const allButtons = Array.from(document.querySelectorAll('button, a'));
  const patterns = {
    lite: /Lite.*购买|立即购买.*Lite|Lite.*Buy/i,
    pro: /Pro.*购买|立即购买.*Pro|Pro.*Buy/i,
    max: /Max.*购买|立即购买.*Max|Max.*Buy/i
  };

  for (const el of allButtons) {
    if (patterns[target]?.test(el.textContent || '')) return el;
  }

  const cards = document.querySelectorAll('[class*="package"], [class*="plan"], [class*="card"]');
  for (const card of cards) {
    if (new RegExp(target, 'i').test(card.textContent || '')) {
      const btn = card.querySelector('button, a');
      if (btn) return btn;
    }
  }

  return null;
}

async function performSnap(message) {
  const packageType = (message && message.packageType) || 'pro';
  try {
    if (!isLoggedIn()) {
      if (clickLogin()) {
        const loginOk = await waitForLogin();
        if (!loginOk) return { success: false, error: '未在规定时间内完成登录' };
      } else {
        return { success: false, error: '未检测到登录入口' };
      }
    }

    await humanDelay(200, 800);

    let btn = findPackageButton(packageType);
    if (!btn) {
      window.scrollTo(0, document.body.scrollHeight / 2);
      await humanDelay(500, 1000);
      window.scrollTo(0, 0);
      await humanDelay(500, 1000);
      btn = findPackageButton(packageType);
    }

    if (!btn) return { success: false, error: `未找到${packageType.toUpperCase()}购买按钮` };

    await humanDelay();
    btn.click();

    return { success: true, message: `已点击${packageType.toUpperCase()}购买按钮，请手动完成支付` };
  } catch (err) {
    return { success: false, error: `执行异常: ${err.message}` };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'snap') {
    performSnap(message).then(sendResponse);
    return true;
  }
});
