import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const {chromium} = await import(process.env.HQ_PLAYWRIGHT_MODULE || 'playwright');
const folder = mkdtempSync(join(tmpdir(), 'leax-guest-browser-'));
let browser, child;

try {
  child = spawn(process.execPath, [
    process.env.HQ_TEST_PACKAGED === '1' ? 'dist/application/runtime/server.mjs' : 'src/server.ts',
  ], {
    env: {
      ...process.env,
      HQ_DATA_DIR: folder,
      HQ_SETUP_CODE: 'synthetic-guest-browser-1234567890',
      HOST: '127.0.0.1',
      PORT: '0',
      RENDER: 'false',
      PUBLIC_ORIGIN: '',
      RENDER_EXTERNAL_URL: '',
      HQ_REQUIRE_ONLINE_ACCESS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const origin = await new Promise((resolve, reject) => {
    let out = '', err = '';
    const timeout = setTimeout(() => reject(Error(err || 'Server startup timed out')), 15000);
    child.stderr.on('data', chunk => err += chunk);
    child.stdout.on('data', chunk => {
      out += chunk;
      const port = out.match(/listening on port (\d+)/);
      if (port) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${port[1]}`);
      }
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(Error(err || 'Server exited before startup'));
    });
  });

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HQ_CHROME_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const host = await browser.newContext({baseURL: origin, viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const guest = await browser.newContext({baseURL: origin, viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const a = await host.newPage(), b = await guest.newPage(), errors = [];
  for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));

  const registered = await host.request.post('/api/shared/register', {
    headers: {Origin: origin},
    data: {handle: 'tourhost', name: 'Tour Host', password: 'synthetic-guest-browser-password'},
  });
  assert.equal(registered.status(), 201);

  await a.goto('/offices');
  await a.locator('#lobby').waitFor({state: 'visible'});
  await a.locator('#office-list button').first().click();
  await a.locator('#room').waitFor({state: 'visible'});
  await a.locator('#open-guest-invites').waitFor({state: 'visible'});
  await a.locator('#open-guest-invites').click();
  await a.locator('#guest-purpose').selectOption('training');
  await a.locator('#guest-invite').click();
  await a.locator('#guest-link-label').waitFor({state: 'visible'});
  const link = await a.locator('#guest-link').inputValue();

  await b.goto(link);
  assert.equal(new URL(b.url()).hash, '');
  await b.locator('#guest-entry').waitFor({state: 'visible'});
  await b.locator('#lobby-backdrop').evaluate(frame => new Promise(resolve => {
    if (frame.contentDocument?.readyState === 'complete') return resolve(true);
    frame.addEventListener('load', () => resolve(true), {once: true});
  }));
  assert.equal(await b.locator('#lobby-backdrop').isVisible(), true);
  await b.getByLabel('Your name').fill('Phone visitor');
  assert.equal(await b.locator('#lobby-backdrop').isVisible(), true);
  await b.getByRole('button', {name: 'Join office'}).click();
  await b.locator('#visitor').waitFor({state: 'visible'});
  await b.locator('#scene canvas').waitFor();
  assert.match(await b.locator('#purpose-label').textContent(), /Training/);

  await a.locator('#guest-visits').getByText('In office: Phone visitor').waitFor();
  const follow = a.locator('#guest-visits').getByRole('button', {name: 'Follow guest view'});
  await follow.waitFor({state: 'visible'});
  await follow.click();
  await b.getByRole('button', {name: 'Go to meeting room'}).click();

  assert.equal((await guest.request.get('/api/state')).status(), 401);
  assert.equal((await guest.request.get('/api/shared/me')).status(), 401);
  for (const width of [320, 390, 768, 1024]) {
    await b.setViewportSize({width, height: 844});
    await a.setViewportSize({width, height: 844});
    assert.equal(await b.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `guest overflow at ${width}px`);
    assert.equal(await a.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `host overflow at ${width}px`);
  }
  await b.setViewportSize({width: 390, height: 844});
  await a.setViewportSize({width: 390, height: 844});

  const officeAddress = new URL(await a.locator('#room-address').inputValue()).searchParams.get('office');
  const visits = await host.request.post('/api/shared/guest-admin/list', {
    headers: {Origin: origin}, data: {address: officeAddress},
  });
  assert.equal(visits.status(), 200);
  const linkState = (await visits.json()).links[0];
  assert.equal(linkState.name, 'Phone visitor');
  assert.equal(linkState.purpose, 'training');
  const revoked = await host.request.post('/api/shared/guest-admin/revoke', {
    headers: {Origin: origin}, data: {address: officeAddress, id: linkState.id},
  });
  assert.equal(revoked.status(), 200);
  await b.locator('#guest-entry').waitFor({state: 'visible'});
  await b.locator('#visitor').waitFor({state: 'hidden'});
  assert.match(await b.locator('#entry-status').textContent(), /revoked|ended|expired/i);
  assert.equal((await guest.request.get('/api/shared/guest/state')).status(), 410);
  assert.deepEqual(errors, []);
  console.log('PASS: office invite button, lobby while entering a name, phone-sized join, 3D meeting room, host follow view, 320–1024px layouts, private API denial, and immediate revocation.');
} finally {
  await browser?.close();
  if (child?.exitCode === null) {
    const stopped = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await stopped;
  }
  rmSync(folder, {recursive: true, force: true});
}
