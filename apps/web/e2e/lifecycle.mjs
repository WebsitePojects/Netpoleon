/**
 * Browser end-to-end run for the slice 1 console. Drives the real UI through the whole
 * seven-step lifecycle with three different accounts, then tours every screen at desktop
 * and phone width in both themes.
 *
 * Playwright is not a dependency of this repo (it would add a browser download to CI for a
 * demo-data UI). Point PLAYWRIGHT_DIR at any folder that has `playwright-core` installed:
 *
 *   corepack pnpm --dir apps/web dev
 *   PLAYWRIGHT_DIR=D:/pw-tools node apps/web/e2e/lifecycle.mjs [outDir]
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), 'noop.js'));
const { chromium } = require('playwright-core');

const BASE = process.env.WMS_URL ?? 'http://localhost:5173';
const OUT = process.argv[2] ?? 'e2e-output';
mkdirSync(OUT, { recursive: true });

const results = [];
let failures = 0;
/** The page the current check is driving, so a failure can be photographed. */
let activePage = null;

/** Runs one named check; a failure is recorded and the run carries on to the next check. */
async function check(name, run) {
  try {
    await run();
    results.push(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    const shot = path.join(OUT, `FAILED-${failures}.png`);
    await activePage?.screenshot({ path: shot }).catch(() => {});
    results.push(`FAIL  ${name}\n      ${String(error.message ?? error).split('\n')[0]}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const readState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wms-demo-state')));
const unitOf = async (page, code) =>
  (await readState(page)).units.find((unit) => unit.code === code);
const loanOf = async (page, number) =>
  (await readState(page)).loans.find((loan) => loan.number === number);

/** Polls the saved demo data until `predicate` holds, so a check never races the UI. */
async function waitForState(page, predicate, what) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate(await readState(page))) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

async function signInEmpty(page) {
  await page.goto(`${BASE}/login`);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(`${BASE}/`);
}

async function switchTo(page, name) {
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: new RegExp(`Account menu for ${name}`) }).waitFor();
}

const dialog = (page) => page.getByRole('dialog');

/** Picks a value in one of the custom dropdowns: open it, then click the option. */
async function choose(page, field, value) {
  await field.click();
  await page.locator(`.popover [role="option"][data-value="${value}"]`).click();
  await page.locator('.popover').waitFor({ state: 'detached' });
}

async function workflow(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  activePage = page;
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(String(error)));

  let unitCode = '';
  let loanNumber = '';

  await check('a protected page sends a signed-out visitor to sign in', async () => {
    await page.goto(`${BASE}/units`);
    await page.waitForURL(`${BASE}/login`);
  });

  await check('wrong credentials are refused with a generic message', async () => {
    await page.getByPlaceholder('Username').fill('lara');
    await page.getByPlaceholder('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.getByText('Incorrect username or password.').waitFor();
    assert(page.url() === `${BASE}/login`, 'left the sign-in page');
  });

  await check('the sample account signs in and returns to the page first asked for', async () => {
    await page.getByPlaceholder('Password').fill('123456');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(`${BASE}/units`);
  });

  await check(
    'signing out, then an empty form, enters as the demo administrator on the dashboard',
    async () => {
      await page.getByRole('button', { name: /Account menu/ }).click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
      await page.waitForURL(`${BASE}/login`);
      await signInEmpty(page);
      await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
      await page.getByText('Total Demo Units').waitFor();
    },
  );

  await check('step 1-2: register a unit and stock it on a shelf', async () => {
    await page.goto(`${BASE}/units`);
    await page.getByRole('button', { name: 'Add Asset' }).click();
    await choose(page, dialog(page).getByLabel('Category'), 'FW');
    // Models come from the catalogue; a known model brings its accessories with it.
    await choose(page, dialog(page).getByLabel('Model', { exact: true }), 'FW|Fortinet|FG-60F');
    await dialog(page).getByLabel('Serial number').fill(`E2E${Date.now()}`);
    await choose(page, dialog(page).getByLabel('Shelf location'), 'shelf-c-1');
    await dialog(page).getByRole('button', { name: 'Register unit' }).click();
    await page.waitForURL(/\/units\/NTP-FW-\d{5}$/);
    unitCode = page.url().split('/').pop();
    const unit = await unitOf(page, unitCode);
    assert(
      unit.status === 'in_stock' && unit.locationId === 'shelf-c-1',
      'unit is not stocked on shelf C-01',
    );
    assert(unit.accessories.length === 3, 'accessories were not filled from the known model');
  });

  await check('the side panel covers and blurs the whole window, sidebar included', async () => {
    await page.goto(`${BASE}/borrow`);
    await page.getByRole('button', { name: 'New request' }).click();
    await dialog(page).waitFor();
    await page.waitForTimeout(700);
    const facts = await page.evaluate(() => {
      const overlay = document.querySelector('.overlay');
      const box = overlay.getBoundingClientRect();
      return {
        inBody: overlay.parentElement === document.body,
        covers:
          box.left <= 0 &&
          box.top <= 0 &&
          box.right >= innerWidth - 1 &&
          box.bottom >= innerHeight - 1,
        blur: getComputedStyle(overlay).backdropFilter,
        native: document.querySelectorAll(
          '.dialog select, .dialog input[type="date"], .dialog datalist',
        ).length,
      };
    });
    assert(facts.inBody && facts.covers, 'overlay does not cover the whole window');
    assert(/blur/.test(facts.blur), `backdrop is not blurred (${facts.blur})`);
    assert(facts.native === 0, 'a browser-default control is still in the panel');
    await page.screenshot({ path: path.join(OUT, 'panel-over-window.png') });
  });

  await check('the calendar picks a date and stays inside the window', async () => {
    const start = await dialog(page).getByLabel('Release date').getAttribute('data-value');
    await dialog(page).getByLabel('Expected return').click();
    const calendar = page.locator('.popover');
    await calendar.waitFor();
    await page.waitForTimeout(350);
    const fits = await calendar.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
    });
    assert(fits, 'calendar runs outside the window');
    const next = new Date(`${start}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 3);
    const day = next.toISOString().slice(0, 10);
    if ((await calendar.locator(`[data-day="${day}"]`).count()) === 0) {
      await calendar.getByRole('button', { name: /next month/i }).click();
    }
    await calendar.locator(`[data-day="${day}"]`).click();
    assert(
      (await dialog(page).getByLabel('Expected return').getAttribute('data-value')) === day,
      'date was not picked',
    );
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'detached' });
  });

  await check('the theme switch changes the look and the choice survives a reload', async () => {
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.locator('.theme-toggle').click();
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(after !== before, 'theme did not change');
    await page.reload();
    assert(
      (await page.evaluate(() => document.documentElement.dataset.theme)) === after,
      'theme was not remembered',
    );
    await page.locator('.theme-toggle').click();
    await page.waitForTimeout(1200);
  });

  await check('a duplicate serial number is refused', async () => {
    const serial = (await unitOf(page, unitCode)).serial;
    await page.goto(`${BASE}/units`);
    await page.getByRole('button', { name: 'Add Asset' }).click();
    await choose(page, dialog(page).getByLabel('Category'), 'FW');
    await choose(page, dialog(page).getByLabel('Model', { exact: true }), 'FW|Fortinet|FG-60F');
    await dialog(page).getByLabel('Serial number').fill(serial);
    await dialog(page).getByRole('button', { name: 'Register unit' }).click();
    await dialog(page)
      .getByText(/already registered/)
      .waitFor();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  });

  await check('step 3: file a borrowing request', async () => {
    await page.goto(`${BASE}/borrow`);
    await page.getByRole('button', { name: 'New request' }).click();
    await choose(page, dialog(page).getByLabel('Model requested'), 'Fortinet|FG-60F');
    await dialog(page).getByLabel('Company').fill('E2E Partner Corp');
    await dialog(page).getByLabel('Borrower name').fill('Ella Tester');
    await dialog(page).getByLabel('Email').fill('ella@e2e.example');
    await dialog(page).getByLabel('Contact number').fill('0917 000 0000');
    await dialog(page).getByRole('button', { name: 'Submit request' }).click();
    await page.waitForURL(/\/borrow\/BRR-\d{4}-\d{5}$/);
    loanNumber = page.url().split('/').pop();
    assert((await loanOf(page, loanNumber)).status === 'pending', 'request is not pending');
  });

  await check('the person who filed a request cannot approve it', async () => {
    await page.getByText(/another approver must decide it/).waitFor();
    assert(
      await page.getByRole('button', { name: 'Approve' }).isDisabled(),
      'Approve is enabled for the filer',
    );
  });

  await check('step 3b: a manager approves and assigns the physical unit', async () => {
    await switchTo(page, 'Cristina Imperial');
    await page.getByRole('button', { name: 'Approve' }).click();
    await choose(page, dialog(page).getByLabel('Unit to reserve'), unitCode);
    await dialog(page).getByRole('button', { name: 'Approve request' }).click();
    await waitForState(
      page,
      (state) => state.loans.find((loan) => loan.number === loanNumber).status === 'approved',
      'approved',
    );
    assert(
      (await unitOf(page, unitCode)).reservedFor === loanNumber,
      'unit is not reserved for the loan',
    );
  });

  await check('a manager has no release button (role wall)', async () => {
    assert(
      (await page.getByRole('button', { name: 'Release unit' }).count()) === 0,
      'manager can release',
    );
  });

  await check('step 4: release refuses a scan of the wrong unit', async () => {
    await switchTo(page, 'Marco Bautista');
    await page.getByRole('button', { name: 'Release unit' }).click();
    await dialog(page).getByPlaceholder('Scan or type the asset code').fill('NTP-SW-00001');
    await dialog(page).getByRole('button', { name: 'Confirm release' }).click();
    await dialog(page)
      .getByText(/Scanned NTP-SW-00001, but this transaction is for/)
      .waitFor();
    assert(
      (await loanOf(page, loanNumber)).status === 'approved',
      'loan changed despite the wrong scan',
    );
  });

  await check('step 4: a double click on release has exactly one effect', async () => {
    await dialog(page).getByRole('button', { name: 'Simulate scan' }).click();
    await dialog(page).getByText(`Label matches ${unitCode}`).waitFor();
    await dialog(page).getByRole('button', { name: 'Confirm release' }).dblclick();
    await waitForState(
      page,
      (state) => state.loans.find((loan) => loan.number === loanNumber).status === 'released',
      'released',
    );
    const state = await readState(page);
    const released = state.movements.filter(
      (item) => item.unitCode === unitCode && item.type === 'released',
    );
    assert(released.length === 1, `expected 1 release movement, found ${released.length}`);
    const unit = state.units.find((item) => item.code === unitCode);
    assert(
      unit.status === 'on_demo' && unit.locationId === 'client-site',
      'unit is not on demo at the client site',
    );
  });

  await check('step 5: receive the return with a missing accessory', async () => {
    await page.getByRole('button', { name: 'Receive return' }).click();
    await dialog(page).getByRole('button', { name: 'Simulate scan' }).click();
    await dialog(page).getByLabel('Power adapter').uncheck();
    await dialog(page)
      .getByText(/Missing: Power adapter/)
      .waitFor();
    await dialog(page).getByRole('button', { name: 'Confirm return' }).click();
    await waitForState(
      page,
      (state) => state.loans.find((loan) => loan.number === loanNumber).status === 'returned',
      'returned',
    );
    const loan = await loanOf(page, loanNumber);
    assert(/missing power adapter/.test(loan.returnNote), 'missing accessory not recorded');
    assert((await unitOf(page, unitCode)).status === 'returned', 'unit is not returned');
  });

  await check('the missing accessory raises an alert', async () => {
    await page.goto(`${BASE}/alerts`);
    await page.getByRole('tab', { name: /Returned with missing accessory/ }).click();
    await page.locator('.alert-card', { hasText: unitCode }).waitFor();
  });

  await check('step 5b: start the inspection', async () => {
    await page.goto(`${BASE}/inspection`);
    await page
      .locator('tr', { hasText: unitCode })
      .getByRole('button', { name: 'Start inspection' })
      .click();
    await waitForState(
      page,
      (state) => state.units.find((unit) => unit.code === unitCode).status === 'under_inspection',
      'under inspection',
    );
  });

  await check('step 6: record the result and restock', async () => {
    await page.getByRole('tab', { name: /Under inspection/ }).click();
    await page
      .locator('tr', { hasText: unitCode })
      .getByRole('button', { name: 'Record result' })
      .click();
    assert(
      !(await dialog(page).getByLabel('Accessories complete').isChecked()),
      'checklist ignores the missing accessory',
    );
    await dialog(page).getByRole('button', { name: 'Record inspection' }).click();
    await waitForState(
      page,
      (state) => state.units.find((unit) => unit.code === unitCode).status === 'in_stock',
      'restocked',
    );
    const state = await readState(page);
    assert(
      state.loans.find((loan) => loan.number === loanNumber).status === 'closed',
      'loan is not closed',
    );
    const unit = state.units.find((item) => item.code === unitCode);
    assert(
      unit.locationId.startsWith('shelf-'),
      `unit was restocked to ${unit.locationId}, not a shelf`,
    );
    assert(!state.readAlertIds.includes(`missing:${loanNumber}`), 'unexpected alert state');
  });

  await check('step 7: the unit history shows every step in order', async () => {
    await page.goto(`${BASE}/units/${unitCode}`);
    const state = await readState(page);
    const trail = state.movements
      .filter((item) => item.unitCode === unitCode)
      .map((item) => item.type);
    const expected = [
      'registered',
      'stocked',
      'reserved',
      'released',
      'returned',
      'inspection_started',
      'restocked',
    ];
    assert(JSON.stringify(trail) === JSON.stringify(expected), `trail was ${trail.join(' > ')}`);
    const table = page.locator('section', { hasText: 'Movement history' }).first();
    for (const label of [
      'Registered',
      'Stocked',
      'Reserved',
      'Release',
      'Return',
      'Inspection',
      'Restock',
    ]) {
      await table.getByText(label, { exact: true }).first().waitFor();
    }
  });

  await check('the audit trail recorded each actor', async () => {
    const state = await readState(page);
    const mine = state.audit.filter(
      (entry) => entry.target === loanNumber || entry.target === unitCode,
    );
    const actors = new Set(mine.map((entry) => entry.actor));
    assert(
      actors.has('lara') && actors.has('tina') && actors.has('marco'),
      `actors: ${[...actors].join(', ')}`,
    );
    await page.goto(`${BASE}/users?tab=activity`);
    await page.getByPlaceholder(/Search by person/).fill(loanNumber);
    await page.locator('tbody tr', { hasText: 'loan.approved' }).waitFor();
  });

  await check('repair path: send to repair, then repair complete', async () => {
    await page.goto(`${BASE}/units/${unitCode}`);
    await page.getByRole('button', { name: 'Send to repair' }).click();
    await dialog(page).getByLabel('What is wrong with it?').fill('Fan fault');
    await dialog(page).getByRole('button', { name: 'Send to repair' }).click();
    await waitForState(
      page,
      (state) => state.units.find((unit) => unit.code === unitCode).status === 'for_repair',
      'for repair',
    );
    await page.getByRole('button', { name: 'Repair complete' }).click();
    await dialog(page).getByRole('button', { name: 'Send to inspection' }).click();
    await waitForState(
      page,
      (state) => state.units.find((unit) => unit.code === unitCode).status === 'under_inspection',
      'back in inspection',
    );
  });

  await check('an auditor reads everything and can change nothing', async () => {
    await switchTo(page, 'Grace Lim');
    await page.goto(`${BASE}/units`);
    await page.getByRole('heading', { name: 'Demo Units' }).waitFor();
    assert(
      (await page.getByRole('button', { name: 'Add Asset' }).count()) === 0,
      'auditor sees Add Asset',
    );
    await page.goto(`${BASE}/settings`);
    await page.getByText(/viewing them read-only/).waitFor();
    assert(await page.getByLabel('Company name').isDisabled(), 'auditor can edit settings');
    await page.goto(`${BASE}/inspection`);
    await page.getByRole('heading', { name: 'Inspection' }).waitFor();
    assert(
      (await page.getByRole('button', { name: 'Start inspection' }).count()) === 0,
      'auditor can inspect',
    );
  });

  await check('settings save and survive a reload', async () => {
    await switchTo(page, 'Lara');
    await page.goto(`${BASE}/settings?section=loans`);
    const field = page.getByLabel('Default loan length (days)');
    await field.fill('10');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByText('All changes saved').waitFor();
    await page.reload();
    assert(
      (await page.getByLabel('Default loan length (days)').inputValue()) === '10',
      'setting was not saved',
    );
  });

  await check('an invalid setting is refused', async () => {
    await page.getByLabel('Default loan length (days)').fill('99');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByText(/between 1 day and the maximum/).waitFor();
    await page.getByRole('button', { name: 'Discard' }).click();
  });

  await check('reports render and export a CSV', async () => {
    await page.goto(`${BASE}/reports`);
    await page.getByText('Equipment Movement Report').waitFor();
    for (const tab of [
      'Borrower history',
      'Aging and condition',
      'Utilization',
      'Tracking record',
    ]) {
      await page.getByRole('tab', { name: tab }).click();
      // Router updates run in a transition: wait for the new tab to be the selected one.
      await page.locator('.tab[aria-selected="true"]', { hasText: tab }).waitFor();
    }
    await page.getByRole('heading', { name: 'Demo Unit Tracking Record' }).waitFor();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    assert(
      /^tracking-record-.*\.csv$/.test(download.suggestedFilename()),
      download.suggestedFilename(),
    );
  });

  await check('the tab highlight travels to the clicked tab and settles on it', async () => {
    const tab = page.getByRole('tab', { name: 'Utilization' });
    await tab.click();
    await page.waitForTimeout(1200);
    const [ink, target] = await Promise.all([
      page.locator('.tab-ink').evaluate((node) => node.getBoundingClientRect().toJSON()),
      tab.evaluate((node) => node.getBoundingClientRect().toJSON()),
    ]);
    assert(
      Math.abs(ink.x - target.x) < 1.5 && Math.abs(ink.width - target.width) < 1.5,
      `ink at ${ink.x}/${ink.width}, tab at ${target.x}/${target.width}`,
    );
  });

  await check('a table sorts, searches, selects and batch-exports rows', async () => {
    await page.goto(`${BASE}/units`);
    const codes = () =>
      page.$$eval('.table tbody td.td-lead', (cells) =>
        cells.map((cell) => cell.textContent.trim()),
      );
    await page.locator('.table tbody tr').first().waitFor();
    await page.getByRole('button', { name: 'Asset Code' }).click();
    await page.locator('th[aria-sort="ascending"]', { hasText: 'Asset Code' }).waitFor();
    await page.locator('.table[aria-busy="false"]').waitFor();
    const ascending = await codes();
    assert(
      ascending.join() === [...ascending].sort().join(),
      `not ascending: ${ascending.slice(0, 3)}`,
    );
    await page.getByRole('button', { name: 'Asset Code' }).click();
    await page.locator('th[aria-sort="descending"]', { hasText: 'Asset Code' }).waitFor();
    await page.locator('.table[aria-busy="false"]').waitFor();
    const descending = await codes();
    assert(descending[0] > descending.at(-1), 'not descending');

    await page.getByPlaceholder(/Search by asset code/).fill(unitCode);
    await page.waitForFunction(() => document.querySelectorAll('.table tbody tr').length === 1);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.table tbody tr').length > 1);

    const boxes = page.locator('.table tbody td.td-select input');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.locator('.batch[data-open="true"]').waitFor();
    assert(
      await page.locator('.th-select input').evaluate((node) => node.indeterminate),
      'header box is not partly ticked',
    );
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export selected' }).click(),
    ]);
    const file = await download.path();
    const lines = (await import('node:fs')).readFileSync(file, 'utf8').trim().split('\n');
    assert(lines.length === 3, `export has ${lines.length - 1} rows, expected 2`);
    await page.getByRole('button', { name: 'Clear selection' }).click();
    await page.locator('.batch[data-open="false"]').waitFor();
  });

  await check('an invited user sets a password through a single-use link', async () => {
    await page.goto(`${BASE}/users`);
    await page.getByRole('button', { name: 'Add user' }).click();
    await dialog(page).getByLabel('Full name').fill('E2E Invitee');
    await dialog(page).getByLabel('Email').fill('e2e.invitee@netpoleon.example');
    await dialog(page).getByRole('button', { name: 'Send invitation' }).click();
    const link = await page.getByLabel('Invitation link').inputValue();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.goto(link);
    await page.getByPlaceholder('New password', { exact: true }).fill('quiet-harbour-ninety');
    await page.getByPlaceholder('Repeat the new password').fill('quiet-harbour-ninety');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByText('Your account is ready').waitFor();
    // People sign in with their email; the demo also accepts its usernames.
    await page.getByPlaceholder('Username').fill('e2e.invitee@netpoleon.example');
    await page.getByPlaceholder('Password').fill('quiet-harbour-ninety');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(`${BASE}/`);
    await page.goto(link);
    await page.getByText('This link no longer works').waitFor();
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await signInEmpty(page);
  });

  await check('selected units go to the label sheet with scannable codes', async () => {
    await page.goto(`${BASE}/units`);
    const boxes = page.locator('.table tbody td.td-select input');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.locator('.batch').getByRole('button', { name: 'Print labels' }).click();
    await page.waitForURL(/units\/labels\?codes=/);
    await page.locator('.asset-label').nth(1).waitFor();
    assert((await page.locator('.asset-label').count()) === 2, 'expected two labels');
    assert((await page.locator('.asset-label .barcode rect').count()) > 40, 'barcode missing');
  });

  await check('a partner company is added and archived without losing history', async () => {
    await page.goto(`${BASE}/partners`);
    await page.getByRole('button', { name: 'Add company' }).click();
    await dialog(page).getByLabel('Company name').fill('E2E Partner Co');
    await dialog(page).getByRole('button', { name: 'Add company' }).click();
    await page.getByRole('heading', { name: 'E2E Partner Co' }).waitFor();
    await page.getByRole('button', { name: 'Archive' }).click();
    await page.getByText('Archived', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Restore' }).click();
    await page.getByText('Active', { exact: true }).first().waitFor();
  });

  await check('a batch action moves several units in one go', async () => {
    await page.goto(`${BASE}/units?status=in_stock&category=FW`);
    await page.locator('.table tbody tr').first().waitFor();
    const picked = await page.$$eval('.table tbody td.td-lead', (cells) =>
      cells.slice(0, 2).map((cell) => cell.textContent.trim()),
    );
    const boxes = page.locator('.table tbody td.td-select input');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole('button', { name: 'Move to shelf' }).click();
    await choose(page, dialog(page).getByLabel('Shelf'), 'shelf-g-1');
    await dialog(page).getByRole('button', { name: 'Move units' }).click();
    await waitForState(
      page,
      (state) =>
        picked.every(
          (code) => state.units.find((unit) => unit.code === code).locationId === 'shelf-g-1',
        ),
      'both units on the new shelf',
    );
  });

  await check('global search finds the unit and the transaction', async () => {
    await page.goto(`${BASE}/`);
    await page.getByPlaceholder(/Search assets/).fill(unitCode);
    await page.getByRole('option', { name: new RegExp(unitCode) }).click();
    await page.waitForURL(`${BASE}/units/${unitCode}`);
    await page.getByPlaceholder(/Search assets/).fill('E2E Partner');
    await page.getByRole('option', { name: new RegExp(loanNumber) }).click();
    await page.waitForURL(`${BASE}/borrow/${loanNumber}`);
  });

  await check('an unknown address shows the not-found page', async () => {
    await page.goto(`${BASE}/no-such-page`);
    await page.getByRole('heading', { name: 'Page not found' }).waitFor();
  });

  await check('the demo data resets', async () => {
    await page.goto(`${BASE}/settings?section=data`);
    await page.getByRole('button', { name: 'Reset' }).click();
    await dialog(page).getByRole('button', { name: 'Reset demo data' }).click();
    await waitForState(
      page,
      (state) => !state.units.some((unit) => unit.code === unitCode),
      'reset',
    );
  });

  await check('no console errors during the workflow', async () => {
    assert(errors.length === 0, errors.slice(0, 3).join(' | '));
  });

  await context.close();
}

const TOUR = [
  ['dashboard', '/'],
  ['units', '/units'],
  ['unit-detail', '/units/NTP-FW-00045'],
  ['borrow', '/borrow'],
  ['borrow-on-demo', '/borrow?tab=on_demo'],
  ['transaction', '/borrow/BRR-2026-00300'],
  ['inspection', '/inspection'],
  ['reports', '/reports'],
  ['reports-tracking', '/reports?tab=tracking'],
  ['reports-aging', '/reports?tab=aging'],
  ['alerts', '/alerts'],
  ['users', '/users'],
  ['users-roles', '/users?tab=roles'],
  ['settings', '/settings'],
  ['settings-labels', '/settings?section=labels'],
  ['profile', '/profile'],
  ['partners', '/partners'],
  ['partner-detail', '/partners/org-001'],
  ['labels', '/units/labels?codes=NTP-FW-00001,NTP-SW-00002,NTP-SRV-00003'],
  ['help', '/help'],
  ['not-found', '/nope'],
];

const VIEWS = [
  { name: 'desktop-light', width: 1440, height: 900, theme: 'light' },
  { name: 'desktop-dark', width: 1440, height: 900, theme: 'dark' },
  { name: 'laptop-light', width: 1366, height: 768, theme: 'light' },
  { name: 'laptop-dark', width: 1536, height: 864, theme: 'dark' },
  { name: 'phone-light', width: 390, height: 844, theme: 'light', mobile: true },
  { name: 'phone-dark', width: 390, height: 844, theme: 'dark', mobile: true },
];

async function tour(browser) {
  for (const view of VIEWS) {
    const context = await browser.newContext({
      viewport: { width: view.width, height: view.height },
      isMobile: view.mobile === true,
      hasTouch: view.mobile === true,
    });
    await context.addInitScript((theme) => localStorage.setItem('wms-theme', theme), view.theme);
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `${view.name}-login.png`) });
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(`${BASE}/`);

    for (const [name, route] of TOUR) {
      await check(`${view.name}: ${name} renders cleanly`, async () => {
        await page.goto(`${BASE}${route}`);
        await page.locator('h1').first().waitFor();
        await page.waitForTimeout(1500); // skeleton, then entrance animations
        const facts = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          headings: document.querySelectorAll('h1').length,
          theme: document.documentElement.dataset.theme,
        }));
        await page.screenshot({
          path: path.join(OUT, `${view.name}-${name}.png`),
          fullPage: view.mobile !== true,
        });
        assert(facts.overflow <= 0, `page scrolls sideways by ${facts.overflow}px`);
        assert(facts.headings === 1, `expected one h1, found ${facts.headings}`);
        assert(facts.theme === view.theme, `theme is ${facts.theme}`);
      });
    }

    if (view.mobile) {
      await check(`${view.name}: the menu drawer opens and navigates`, async () => {
        await page.goto(`${BASE}/`);
        await page
          .getByRole('navigation', { name: 'Quick navigation' })
          .getByRole('button', { name: 'Menu' })
          .click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, `${view.name}-drawer.png`) });
        await page
          .getByRole('complementary', { name: 'Main menu' })
          .getByRole('link', { name: 'Reports' })
          .click();
        await page.waitForURL(`${BASE}/reports`);
      });
    }
    await check(`${view.name}: no console errors`, async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
    await context.close();
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await workflow(browser);
  if (process.env.SKIP_TOUR !== '1') await tour(browser);
} finally {
  await browser.close();
}

console.log(results.join('\n'));
console.log(
  `\n${results.length - failures} passed, ${failures} failed. Screenshots: ${path.resolve(OUT)}`,
);
process.exit(failures === 0 ? 0 : 1);
