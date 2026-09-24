const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(__dirname, '../../docs/screenshots');
const BASE = 'http://localhost/webchat';

fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(OUT, name),
    fullPage: false,
    type: 'png',
  });
  console.log('saved', name, 'from', page.url());
}

async function loginUser(page, login, password) {
  await page.goto(`${BASE}/login.php`, { waitUntil: 'networkidle' });
  await page.fill('#login', login);
  await page.fill('#password', password);
  await page.click('#loginBtn');
  await page.waitForTimeout(1500);
  return !page.url().includes('login.php');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // 01 — real login page
  await page.goto(`${BASE}/login.php`, { waitUntil: 'networkidle' });
  await shot(page, '01-login.png');

  let ok = await loginUser(page, 'Lwh_0326', 'Hong0326');
  if (!ok) {
    console.log('Hong0326 failed, trying user123...');
    ok = await loginUser(page, 'Lwh_0326', 'user123');
  }
  if (!ok) {
    throw new Error('User login failed for Lwh_0326');
  }
  console.log('logged in as user:', page.url());

  // 02 — chat
  await page.goto(`${BASE}/chat.php`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const peer = page.locator('[data-peer-id], .wc-peer-item, .wc-chat-peer, a[href*="peer="]').first();
  if (await peer.count()) {
    await peer.click().catch(() => {});
    await page.waitForTimeout(900);
  } else {
    // fallback: any clickable row in left list
    const row = page.locator('.wc-chat-sidebar .list-group-item, #chatList .list-group-item, #peerList button, #peerList a').first();
    if (await row.count()) {
      await row.click().catch(() => {});
      await page.waitForTimeout(900);
    }
  }
  await shot(page, '02-chat.png');

  // 03 — groups (prefer open group chat if available)
  await page.goto(`${BASE}/groups.php`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const groupLink = page.locator('a[href*="group_chat.php"], [data-group-id], .wc-group-card a, .wc-group-item').first();
  if (await groupLink.count()) {
    await groupLink.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  await shot(page, '03-groups.png');

  // 04 — forums
  await page.goto(`${BASE}/forums.php`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await shot(page, '04-forums.png');

  // 05 — real call overlay from project markup (voice UI)
  await page.goto(`${BASE}/chat.php`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const overlay = document.getElementById('callOverlay');
    if (!overlay) return;
    overlay.classList.remove('d-none');
    overlay.setAttribute('aria-hidden', 'false');
    const voice = document.getElementById('callVoiceArea');
    const video = document.getElementById('callVideoArea');
    if (voice) voice.classList.remove('d-none');
    if (video) video.classList.add('d-none');
    const name = document.getElementById('callPeerName');
    const status = document.getElementById('callStatusText');
    const timer = document.getElementById('callVoiceTimer');
    if (name) name.textContent = 'WebConnect Call';
    if (status) status.textContent = 'Connected';
    if (timer) timer.textContent = '2:14';
  });
  await shot(page, '05-calls.png');

  await context.close();

  // 06 — admin dashboard
  const adminCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const admin = await adminCtx.newPage();
  await admin.goto(`${BASE}/admin/login.php`, { waitUntil: 'networkidle' });
  await admin.fill('#username', 'admin');
  await admin.fill('#password', 'admin123');
  await admin.click('button[type="submit"]');
  await admin.waitForTimeout(1200);
  if (admin.url().includes('login.php')) {
    throw new Error('Admin login failed');
  }
  await admin.goto(`${BASE}/admin/index.php`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(900);
  await shot(admin, '06-admin.png');

  await adminCtx.close();
  await browser.close();
  console.log('Done — screenshots from live project UI.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
