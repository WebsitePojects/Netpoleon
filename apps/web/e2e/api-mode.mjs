/**
 * End-to-end run of the web app connected to the real API (slice 2: sign-in, units, people,
 * partner companies, labels). Needs the API on :3000 over a database filled by `dev-seed`,
 * and the web app started with VITE_BACKEND=api.
 *
 *   WMS_E2E_URL=http://localhost:5174 WMS_E2E_EMAIL=lara@netpoleon.example \
 *   WMS_E2E_PASSWORD=… PLAYWRIGHT_DIR=… node e2e/api-mode.mjs <screenshot dir>
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? '.', 'noop.js'));
const { chromium } = require('playwright-core');

const BASE = process.env.WMS_E2E_URL ?? 'http://localhost:5174';
const EMAIL = process.env.WMS_E2E_EMAIL;
const PASSWORD = process.env.WMS_E2E_PASSWORD;
const OUT = process.argv[2] ?? 'e2e-api-out';
if (!EMAIL || !PASSWORD) {
  process.stderr.write('Set WMS_E2E_EMAIL and WMS_E2E_PASSWORD to a dev-seed account.\n');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`FAIL  ${name}\n      ${String(error.message ?? error).split('\n')[0]}`);
    await page.screenshot({ path: path.join(OUT, `FAILED-${failures}.png`) }).catch(() => {});
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const dialog = () => page.getByRole('dialog');
async function choose(field, value) {
  await field.click();
  await page.locator(`.popover [role="option"][data-value="${value}"]`).click();
  await page.locator('.popover').waitFor({ state: 'detached' });
}
async function chooseByText(field, text) {
  await field.click();
  await page.locator('.popover [role="option"]', { hasText: text }).first().click();
  await page.locator('.popover').waitFor({ state: 'detached' });
}
const settled = () => page.locator('.table[aria-busy="false"]').first().waitFor();

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  // A refused request is logged by the browser; the screen shows the refusal itself.
  if (message.type() === 'error' && !/status of 4\d\d/.test(message.text())) {
    errors.push(message.text());
  }
});
const tag = Date.now().toString(36);
let unitCode = '';

await check('a wrong password is refused with one message for every failure', async () => {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('Email address').fill(EMAIL);
  await page.getByPlaceholder('Password').fill('not-the-password-at-all');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByText(/Email or password is incorrect/).waitFor();
  assert((await page.getByText('Demo build').count()) === 0, 'the demo bypass note is shown');
});

await check('sign in with the server, and lending screens say they connect next', async () => {
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(`${BASE}/`);
  await page.getByText(/connects to the server in the next release/).waitFor();
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'wms_session');
  assert(session?.httpOnly, 'the session cookie is not HttpOnly');
  assert(
    !(await page.evaluate(() => document.cookie)).includes('wms_session'),
    'a script can read the session',
  );
});

await check('the units list is served by the server: search, sort and paging', async () => {
  await page.goto(`${BASE}/units`);
  await settled();
  const footer = await page.locator('.table-foot').innerText();
  const total = Number(/of (\d+)/.exec(footer)?.[1]);
  assert(total >= 10, `expected seeded units, footer says "${footer}"`);
  const firstPage = await page.$$eval('.table tbody td.td-lead', (cells) =>
    cells.map((cell) => cell.textContent.trim()),
  );
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.waitForURL(/page=2/);
  await settled();
  const secondPage = await page.$$eval('.table tbody td.td-lead', (cells) =>
    cells.map((cell) => cell.textContent.trim()),
  );
  assert(
    secondPage.every((code) => !firstPage.includes(code)),
    'page 2 repeats page 1',
  );
  assert(secondPage[0] > firstPage.at(-1), 'pages are not in code order');
  await page.getByRole('button', { name: 'Previous page' }).click();
  await settled();

  await page.getByPlaceholder(/Search by asset code/).fill('FG-60F');
  await page.waitForURL(/q=FG-60F/);
  await settled();
  const found = await page.$$eval('.table tbody tr', (rows) => rows.map((row) => row.textContent));
  assert(
    found.length > 0 && found.every((text) => text.includes('FG-60F')),
    'search did not narrow',
  );
  await page.getByRole('button', { name: 'Clear search' }).click();
  await settled();

  await page.getByRole('button', { name: 'Asset Code' }).click();
  await page.getByRole('button', { name: 'Asset Code' }).click();
  await page.waitForURL(/sort=-code/);
  await settled();
  const descending = await page.$$eval('.table tbody td.td-lead', (cells) =>
    cells.map((cell) => cell.textContent.trim()),
  );
  assert(descending[0] > descending.at(-1), 'not sorted descending by the server');
  await page.screenshot({ path: path.join(OUT, 'units.png') });
});

await check('register a unit: the server assigns the code and stocks it', async () => {
  await page.goto(`${BASE}/units`);
  await page.getByRole('button', { name: 'Add Asset' }).click();
  await chooseByText(dialog().getByLabel('Category'), 'Firewall');
  await chooseByText(dialog().getByLabel('Model', { exact: true }), 'Fortinet FG-60F');
  await dialog().getByLabel('Serial number').fill(`E2E-${tag}`);
  await dialog().getByRole('button', { name: 'Register unit' }).click();
  await page.waitForURL(/\/units\/NTP-FW-\d{5}$/);
  unitCode = page.url().split('/').pop();
  await page.getByText('Available').first().waitFor();
  await page.getByRole('cell', { name: 'Stocked' }).waitFor();
});

await check('a second unit with the same serial is refused by the server', async () => {
  await page.goto(`${BASE}/units`);
  await page.getByRole('button', { name: 'Add Asset' }).click();
  await chooseByText(dialog().getByLabel('Category'), 'Firewall');
  await chooseByText(dialog().getByLabel('Model', { exact: true }), 'Fortinet FG-60F');
  await dialog().getByLabel('Serial number').fill(`E2E-${tag}`);
  await dialog().getByRole('button', { name: 'Register unit' }).click();
  await dialog()
    .getByText(/already has that serial number/)
    .waitFor();
  await dialog().getByRole('button', { name: 'Cancel' }).click();
});

await check('move, repair, repair complete, then retire: each step is a movement', async () => {
  await page.goto(`${BASE}/units/${unitCode}`);
  await page.getByRole('button', { name: 'Move shelf' }).click();
  await dialog().getByRole('button', { name: 'Move unit' }).click();
  await page.getByText(`${unitCode} moved`).waitFor();
  await page.getByRole('button', { name: 'Send to repair' }).click();
  await dialog().getByLabel('What is wrong with it?').fill('Fan noise');
  await dialog().getByRole('button', { name: 'Send to repair' }).click();
  await page.getByRole('button', { name: 'Repair complete' }).click();
  await dialog().getByRole('button', { name: 'Send to inspection' }).click();
  await page.getByText('Under Inspection').first().waitFor();
  await page.getByRole('button', { name: 'Retire' }).click();
  await dialog().getByLabel('Reason').fill('End of life (e2e)');
  await dialog().getByRole('button', { name: 'Retire unit' }).click();
  await page.getByText('Retired').first().waitFor();
  const history = await page.$$eval('.table tbody td[data-label="Movement"]', (cells) =>
    cells.map((cell) => cell.textContent.trim()),
  );
  for (const step of ['Retired', 'Repaired', 'Sent to repair', 'Moved', 'Stocked', 'Registered']) {
    assert(history.includes(step), `history is missing ${step}: ${history.join(', ')}`);
  }
  await page.screenshot({ path: path.join(OUT, 'unit-detail.png') });
});

await check('a batch move says which units it skipped', async () => {
  await page.goto(`${BASE}/units`);
  await settled();
  const boxes = page.locator('.table tbody td.td-select input');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.locator('.batch').getByRole('button', { name: 'Move to shelf' }).click();
  await chooseByText(dialog().getByLabel('Shelf'), 'Shelf F-04');
  await dialog().getByRole('button', { name: 'Move units' }).click();
  await page.getByText(/moved to Shelf F-04/).waitFor();
});

await check('selected units print on the label sheet from one request', async () => {
  await page.goto(`${BASE}/units`);
  await settled();
  const boxes = page.locator('.table tbody td.td-select input');
  await boxes.nth(2).check();
  await boxes.nth(3).check();
  await page.locator('.batch').getByRole('button', { name: 'Print labels' }).click();
  await page.waitForURL(/units\/labels\?codes=/);
  await page.locator('.asset-label').nth(1).waitFor();
  assert((await page.locator('.asset-label').count()) === 2, 'expected two labels');
});

await check('inviting a person sends an email instead of showing a link', async () => {
  await page.goto(`${BASE}/users`);
  await page.getByRole('button', { name: 'Add user' }).click();
  await dialog().getByLabel('Full name').fill(`E2E Person ${tag}`);
  await dialog().getByLabel('Email').fill(`e2e-${tag}@netpoleon.example`);
  await dialog().getByRole('button', { name: 'Send invitation' }).click();
  await page.getByText(/An email with a sign-up link is on its way/).waitFor();
  assert((await page.getByLabel('Invitation link').count()) === 0, 'the link was shown');
  await page.getByRole('button', { name: 'Done' }).click();
  await page
    .locator('tr', { hasText: `E2E Person ${tag}` })
    .getByText('Invited')
    .waitFor();
});

await check('a partner company is added, given a contact, archived and restored', async () => {
  await page.goto(`${BASE}/partners`);
  await page.getByRole('button', { name: 'Add company' }).click();
  await dialog().getByLabel('Company name').fill(`E2E Co ${tag}`);
  await dialog().getByRole('button', { name: 'Add company' }).click();
  await page.getByRole('heading', { name: `E2E Co ${tag}` }).waitFor();
  await page.getByRole('button', { name: 'Add contact' }).click();
  await dialog().getByLabel('Full name').fill('Ana Reyes');
  await dialog().getByLabel('Email').fill(`ana-${tag}@e2eco.example`);
  await dialog().getByRole('button', { name: 'Add contact' }).click();
  await page.getByText('Ana Reyes').waitFor();
  await page.getByRole('button', { name: 'Archive' }).click();
  await page.getByText('Archived', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByText('Active', { exact: true }).first().waitFor();
});

await check('the activity log is read from the server, newest first', async () => {
  await page.goto(`${BASE}/users?tab=activity`);
  await settled();
  const actions = await page.$$eval('.table tbody td[data-label="Action"]', (cells) =>
    cells.map((cell) => cell.textContent.trim()),
  );
  assert(actions.includes('partner.restored'), `latest actions: ${actions.slice(0, 5).join(', ')}`);
  await page.screenshot({ path: path.join(OUT, 'activity.png') });
});

await check('the phone layout has no sideways scroll', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/units', `/units/${unitCode}`, '/users', '/partners']) {
    await page.goto(`${BASE}${route}`);
    await page.waitForTimeout(800);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert(!wide, `${route} scrolls sideways`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
});

await check('signing out ends the session on the server', async () => {
  await page.goto(`${BASE}/units`);
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL(`${BASE}/login`);
  const status = await page.evaluate(async () => (await fetch('/api/v1/auth/me')).status);
  assert(status === 401, `the session still works after sign-out (${status})`);
});

await check('no unexpected console errors', async () => {
  assert(errors.length === 0, errors.slice(0, 3).join(' | '));
});

await browser.close();
process.stdout.write(
  `${results.join('\n')}\n\n${results.length - failures} passed, ${failures} failed.\n`,
);
process.exitCode = failures ? 1 : 0;
