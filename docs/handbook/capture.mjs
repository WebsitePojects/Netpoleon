/**
 * Captures every handbook figure from a running Netpoleon WMS and records where each annotated
 * element is, relative to the crop.
 *
 *   PW_DIR=<folder holding node_modules/playwright> HANDBOOK_BASE=https://… DEMO_PASSWORD=… \
 *     node docs/handbook/capture.mjs [figure-id …]
 *
 * Read-only by construction: every request to the API other than GET and the sign-in POST is
 * aborted, so a figure can open dialogs and type into them but can never save anything.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIGURES } from './figures.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(join(process.env.PW_DIR ?? '.', 'node_modules', 'playwright'));
const BASE = process.env.HANDBOOK_BASE ?? 'https://wms.princeitsolutions.tech';
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) throw new Error('DEMO_PASSWORD is required');
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'build', 'figures');
mkdirSync(OUT, { recursive: true });

const SCALE = 2;
const blocked = [];
const wanted = new Set(process.argv.slice(2));

async function open(browser, figure) {
  const viewport = figure.viewport ?? { width: 1280, height: 800 };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: SCALE,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.route('**/api/v1/**', (route) => {
    const request = route.request();
    const signIn = request.method() === 'POST' && request.url().endsWith('/auth/login');
    if (request.method() === 'GET' || signIn) return route.continue();
    blocked.push(`${figure.id}: ${request.method()} ${new URL(request.url()).pathname}`);
    return route.abort();
  });
  const page = await context.newPage();
  if (figure.user) {
    await page.goto(`${BASE}/login`);
    await page.getByPlaceholder('Username or email').fill(figure.user);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
  }
  await page.goto(`${BASE}${figure.path}`);
  await settle(page);
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page
    .locator('#boot')
    .waitFor({ state: 'detached', timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(600);
}

/**
 * Dialogs are drawers as tall as the window, so a short form leaves a white void. Shrinking the
 * window to the dialog's own content keeps every figure tight and printable at a larger scale.
 */
async function fitDialog(page) {
  const needed = await page.getByRole('dialog').evaluate((dialog) => {
    // Let the drawer take its natural height for one measurement, then put it back.
    const saved = [dialog, ...dialog.querySelectorAll('*')].map((el) => [
      el,
      el.getAttribute('style'),
    ]);
    // The drawer is pinned with top and bottom; release the bottom and the stretching body.
    dialog.style.bottom = 'auto';
    dialog.style.height = 'auto';
    dialog.style.maxHeight = 'none';
    for (const child of dialog.querySelectorAll('*')) {
      child.style.flex = 'none';
      child.style.minHeight = '0';
    }
    const natural = dialog.getBoundingClientRect().height;
    for (const [el, style] of saved) {
      if (style === null) el.removeAttribute('style');
      else el.setAttribute('style', style);
    }
    return Math.ceil(natural + dialog.getBoundingClientRect().top * 2 + 2);
  });
  const viewport = page.viewportSize();
  if (needed < viewport.height) {
    await page.setViewportSize({ width: viewport.width, height: Math.max(needed, 360) });
    await page.waitForTimeout(400);
  }
}

async function clipOf(page, figure) {
  if (figure.clip === 'viewport') {
    const v = page.viewportSize();
    return { x: 0, y: 0, width: v.width, height: v.height };
  }
  if (figure.clip === 'dialog') {
    const box = await page.getByRole('dialog').boundingBox();
    if (!box) throw new Error('dialog not visible');
    return {
      x: Math.floor(box.x),
      y: Math.floor(box.y),
      width: Math.ceil(box.width),
      height: Math.ceil(box.height),
    };
  }
  return figure.clip;
}

async function capture(browser, figure) {
  const { context, page } = await open(browser, figure);
  try {
    const h = { page, scope: page };
    if (figure.setup) await figure.setup(h);
    await page.waitForTimeout(500);
    if (figure.clip === 'dialog') await fitDialog(page);
    const clip = await clipOf(page, figure);
    // Callouts are measured inside the dialog when there is one, so field() finds its labels.
    const scope = figure.clip === 'dialog' ? page.getByRole('dialog') : page;
    const anchors = [];
    for (const [index, note] of figure.notes.entries()) {
      const target = note.target({ page, scope }).first();
      const box = await target.boundingBox({ timeout: 5000 }).catch(() => null);
      if (!box)
        throw new Error(`note ${index + 1} ("${note.en.slice(0, 40)}…") has no visible target`);
      const rel = { x: box.x - clip.x, y: box.y - clip.y, width: box.width, height: box.height };
      const inside =
        rel.x >= -1 &&
        rel.y >= -1 &&
        rel.x + rel.width <= clip.width + 1 &&
        rel.y + rel.height <= clip.height + 1;
      if (!inside)
        throw new Error(`note ${index + 1} target lies outside the crop: ${JSON.stringify(rel)}`);
      anchors.push(rel);
    }
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(OUT, `${figure.id}.png`), clip });
    writeFileSync(
      join(OUT, `${figure.id}.json`),
      JSON.stringify({ width: clip.width, height: clip.height, anchors }, null, 2),
    );
    console.log(`ok   ${figure.id} (${clip.width}×${clip.height}, ${anchors.length} callouts)`);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
let failed = 0;
for (const figure of FIGURES) {
  if (wanted.size && !wanted.has(figure.id)) continue;
  try {
    await capture(browser, figure);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${figure.id}: ${String(error.message).split('\n')[0]}`);
  }
}
await browser.close();
console.log(
  blocked.length ? `blocked writes:\n  ${blocked.join('\n  ')}` : 'no write was attempted',
);
process.exit(failed ? 1 : 0);
