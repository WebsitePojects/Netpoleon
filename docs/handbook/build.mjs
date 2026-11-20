/**
 * Builds the Netpoleon WMS user handbook PDF from captured figures (capture.mjs) and the text
 * in content.mjs, in the Prince IT Solutions template, on long bond paper (8.5 × 13 in).
 *
 *   PW_DIR=<folder holding node_modules/playwright> node docs/handbook/build.mjs
 *
 * The page is laid out by layout.js inside Chromium, which also checks every figure (no leader
 * crosses another, runs through a label or number, or cuts through another highlight; no
 * labels overlap; no page overflows). Any violation is printed and no PDF is written.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pages as contentPages } from './content.mjs';
import { FIGURES } from './figures.mjs';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, 'build');
const REPO = resolve(HERE, '..', '..');
const OUTPUT = join(BUILD, 'Netpoleon-WMS-User-Handbook.pdf');
const EDITION = {
  ref: 'PITS-NTP-2026-HB-01',
  edition: 'Edition 1 · November 2026',
  version: '0fedabc',
  address: 'wms.princeitsolutions.tech',
};

const escape = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

// ── Brand assets copied next to the HTML so relative paths work in the browser ───────────
mkdirSync(BUILD, { recursive: true });
copyFileSync(join(HERE, 'handbook.css'), join(BUILD, 'handbook.css'));
copyFileSync(join(HERE, 'layout.js'), join(BUILD, 'layout.js'));
copyFileSync(join(HERE, 'assets', 'prince-logo.png'), join(BUILD, 'prince-logo.png'));
copyFileSync(
  join(REPO, 'apps', 'web', 'public', 'img', 'logo-white.png'),
  join(BUILD, 'netpoleon-white.png'),
);

const figureById = new Map(FIGURES.map((figure) => [figure.id, figure]));

// ── Helpers the content uses ──────────────────────────────────────────────────────────────
const ROLE_NAMES = {
  admin: 'Administrator',
  manager: 'Manager',
  warehouse: 'Warehouse',
  auditor: 'Auditor',
  all: 'Every role',
};

function makeHelpers(state) {
  const h = {
    chapter(n, plain, gold) {
      state.chapter = n;
      state.figure = 0;
      state.chapters.push({ n, title: `${plain} ${gold}`.trim(), page: state.page });
      return `<div class="chap"><div class="badge">${n}</div><h1>${escape(plain)} <span class="g">${escape(gold)}</span></h1></div>
              <div class="divider"><i></i><i></i><i></i></div>`;
    },
    section: (title) => `<h2 class="sec">${escape(title)}</h2>`,
    pair: (en, tl) =>
      `<div class="pair"><div class="en">${en}</div><div class="tl">${tl}</div></div>`,
    steps: (items) =>
      h.pair(
        `<ol class="steps">${items.map(([en]) => `<li>${en}</li>`).join('')}</ol>`,
        `<ol class="steps">${items.map(([, tl]) => `<li>${tl}</li>`).join('')}</ol>`,
      ),
    who(roles) {
      const list = roles === 'all' ? ['all'] : roles;
      return `<div class="who">Who can do this ${list.map((r) => `<span class="role ${r}">${ROLE_NAMES[r]}</span>`).join('')}</div>`;
    },
    chips: (status, text) => `<span class="chip ${status}">${escape(text)}</span>`,
    tip: (kind, en, tl) =>
      `<div class="tip ${kind}"><div class="ico">${kind === 'warn' ? '!' : 'i'}</div><div>${en}</div><div class="tl">${tl}</div></div>`,
    table(head, rows, cls = '') {
      return `<table class="t ${cls}"><thead><tr>${head.map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i === r.length - 1 && head[i] === 'Sa Tagalog' ? 'tl' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    },
    fig(id, caption, captionTl) {
      const figure = figureById.get(id);
      if (!figure) throw new Error(`unknown figure ${id}`);
      const dataFile = join(BUILD, 'figures', `${id}.json`);
      if (!existsSync(dataFile))
        throw new Error(`figure ${id} has not been captured (run capture.mjs)`);
      const data = JSON.parse(readFileSync(dataFile, 'utf8'));
      if (data.anchors.length !== figure.notes.length)
        throw new Error(`figure ${id}: capture is stale, recapture it`);
      state.figure += 1;
      const number = `${state.chapter}.${state.figure}`;
      const notes = figure.notes
        .map(
          (note, i) =>
            `<div class="note" data-side="${note.side ?? ''}" data-at="${note.at ?? ''}"><span class="n">${i + 1}</span>
               <span class="en">${escape(note.en)}</span><span class="tl">${escape(note.tl)}</span></div>`,
        )
        .join('');
      return `<figure class="fig" data-id="${id}" data-mode="${figure.mode}" data-display="${figure.display ?? ''}"
                 data-cw="${data.width}" data-ch="${data.height}" data-anchors='${JSON.stringify(data.anchors)}'>
          <div class="fig-stage"><img class="shot" src="figures/${id}.png" alt="">${notes}</div>
          <figcaption><b>FIGURE ${number}</b> &nbsp;${escape(caption)} &nbsp;·&nbsp; <i>${escape(captionTl)}</i></figcaption>
        </figure>`;
    },
    lifecycle() {
      const steps = [
        ['Registration', 'Serial, model, QR label', 'Pag-register'],
        ['Stocking', 'Placed on its shelf', 'Paglagay sa shelf'],
        ['Borrowing request', 'A partner asks; an approver decides', 'Paghiling at pag-apruba'],
        ['Release', 'Scanned out with accessories', 'Pag-release'],
        ['Return & inspection', 'Scanned in, then checked', 'Pagbalik at pagsusuri'],
        ['Restock or reassign', 'Back to a shelf, or to repair', 'Ibalik sa shelf o ipaayos'],
        ['Reports & audit', 'Every step on record', 'Ulat at audit trail'],
      ];
      return `<div class="life">${steps
        .map(
          ([t, d, tl], i) =>
            `<div class="s"><span class="k">${i + 1}</span><b>${t}</b><span>${d}</span><i>${tl}</i></div>`,
        )
        .join('')}</div>`;
    },
    stages() {
      const c = (s, t) => h.chips(s, t);
      return `<div class="flow">${c('for_repair', 'Pending approval')}<span class="arrow">→</span>${c('in_stock', 'Approved')}
          <span class="arrow">→</span>${c('on_demo', 'On Demo')}<span class="arrow">→</span>${c('returned', 'Returned')}
          <span class="arrow">→</span>${c('retired', 'Closed')}</div>
        <p class="flow-note">A request can also end as ${c('under_inspection', 'Rejected')} (by an approver),
          ${c('under_inspection', 'Cancelled')} (withdrawn before release) or ${c('under_inspection', 'Expired')}
          (approved but never collected). <i>Puwede ring ma-reject, ma-cancel o mag-expire ang request.</i></p>`;
    },
    roleCards() {
      const cards = [
        [
          'admin',
          'Administrator',
          'Everything, plus users and settings',
          'Lahat, pati users at settings.',
        ],
        [
          'manager',
          'Manager',
          'Approves requests, extends loans, sees all reports and the audit trail',
          'Nag-a-approve, nag-e-extend, at nakakakita ng lahat ng report.',
        ],
        [
          'warehouse',
          'Warehouse',
          'Registers, stocks, releases, receives and inspects units',
          'Nagre-register, nagre-release, tumatanggap at nag-i-inspect.',
        ],
        [
          'auditor',
          'Auditor',
          'Reads everything, changes nothing',
          'Nakakabasa ng lahat, walang binabago.',
        ],
      ];
      return `<div class="roles">${cards
        .map(
          ([r, t, en, tl]) =>
            `<div class="rcard"><div class="top">${t}<small><span class="role ${r}">${ROLE_NAMES[r]}</span></small></div><div class="body">${en}<i>${tl}</i></div></div>`,
        )
        .join('')}</div>`;
    },
    permissionMatrix() {
      // The grant table of the deployed version (packages/contracts/src/permissions.ts @ 0fedabc).
      const rows = [
        ['Register units', 'admin warehouse'],
        ['Edit unit details', 'admin warehouse'],
        ['Move units between shelves', 'admin warehouse'],
        ['Send to and return from repair', 'admin warehouse'],
        ['Retire units', 'admin'],
        ['File borrowing requests', 'admin manager warehouse'],
        ['Approve or reject requests', 'admin manager'],
        ['Extend loans', 'admin manager'],
        ['Cancel requests', 'admin manager'],
        ['Release units', 'admin warehouse'],
        ['Receive returns', 'admin warehouse'],
        ['Inspect and restock', 'admin warehouse'],
        ['Export reports', 'admin manager warehouse auditor'],
        ['Read the full audit trail', 'admin manager auditor'],
        ['Manage categories, models and locations', 'admin warehouse'],
        ['Manage users', 'admin'],
        ['Change settings', 'admin'],
        ['Manage partner companies', 'admin manager'],
      ];
      const roles = ['admin', 'manager', 'warehouse', 'auditor'];
      return h.table(
        ['Action', ...roles.map((r) => ROLE_NAMES[r])],
        rows.map(([action, who]) => [
          action,
          ...roles.map((r) =>
            who.split(' ').includes(r) ? '<span class="yes">✓</span>' : '<span class="no">—</span>',
          ),
        ]),
        'matrix',
      );
    },
    playbook(role, title, blocks) {
      return `<div class="play"><div class="ph">${escape(title)} <span class="role ${role}">${ROLE_NAMES[role]}</span></div>
        ${blocks
          .map(
            ([heading, items]) =>
              `<div class="blk"><h4>${escape(heading)}</h4>${items
                .map(
                  ([en, tl]) =>
                    `<div class="item"><span class="box"></span><span>${en}</span><span class="tl">${tl}</span></div>`,
                )
                .join('')}</div>`,
          )
          .join('')}</div>`;
    },
    journey(rows) {
      return h.table(
        ['When', 'Who', 'What', 'Screen', 'Result', 'Sa Tagalog'],
        rows.map(([when, role, what, screen, result, tl]) => [
          when,
          `<span class="role ${role}">${ROLE_NAMES[role]}</span>`,
          what,
          screen,
          result,
          tl,
        ]),
        'journey',
      );
    },
    faq: (items) =>
      `<div class="faq">${items
        .map(
          ([q, a, tl]) =>
            `<div class="q"><b>${escape(q)}</b><span>${escape(a)}</span><span class="tl">${escape(tl)}</span></div>`,
        )
        .join('')}</div>`,
    glossary: (items) =>
      `<div class="gloss">${items.map(([t, d, tl]) => `<div><b>${escape(t)}</b>${escape(d)}<i>${escape(tl)}</i></div>`).join('')}</div>`,
    contents() {
      const tl = {
        1: 'Pambungad',
        2: 'Mga role at account',
        3: 'Pagsisimula',
        4: 'Mga demo unit',
        5: 'Paghiram at pagbalik',
        6: 'Pagsusuri at pag-restock',
        7: 'Mga alerto at ulat',
        8: 'Pangangasiwa',
        9: 'Gabay bawat role',
        10: 'Buong proseso ng isang hiram',
        11: 'Mga tanong at sagot',
      };
      const list = state.known.length ? state.known : [];
      return `${h.chapterless('Contents')}<div class="toc">${list
        .map(
          (c) =>
            `<div class="row"><span class="n">${c.n}</span><span class="title">${escape(c.title)}</span><span class="tl">${tl[c.n] ?? ''}</span><span class="p">${c.page}</span></div>`,
        )
        .join('')}</div>`;
    },
    chapterless: (title) =>
      `<div class="chap"><div class="badge">≡</div><h1>${escape(title)}</h1></div><div class="divider"><i></i><i></i><i></i></div>`,
  };
  return h;
}

// ── Page frames ───────────────────────────────────────────────────────────────────────────
const ICON = {
  pin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#d5a33c"/><path d="M12 6a4 4 0 0 0-4 4c0 3 4 8 4 8s4-5 4-8a4 4 0 0 0-4-4zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" fill="#0a0c0a"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#d5a33c"/><circle cx="12" cy="12" r="6" fill="none" stroke="#0a0c0a" stroke-width="1.5"/><path d="M6 12h12M12 6c2 2 2 10 0 12M12 6c-2 2-2 10 0 12" fill="none" stroke="#0a0c0a" stroke-width="1.3"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#d5a33c"/><rect x="6" y="8" width="12" height="9" rx="1.5" fill="none" stroke="#0a0c0a" stroke-width="1.5"/><path d="M6.5 8.5l5.5 4.5 5.5-4.5" fill="none" stroke="#0a0c0a" stroke-width="1.5"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#d5a33c"/><path d="M9 6.5l2 3-1.3 1.2a7 7 0 0 0 3.6 3.6l1.2-1.3 3 2-1 2.2c-5.5 0-10.2-4.7-10.2-10.2z" fill="#0a0c0a"/></svg>',
};
const CONTACT = `<div class="contact">
  <span>${ICON.pin}SEC Reg. No. 2026070258826-03</span>
  <span>${ICON.web}princeitsolutions.tech</span>
  <span>${ICON.mail}princeitsol26@gmail.com</span>
  <span>${ICON.phone}0906 913 3841</span></div>`;

const frame = (pageNo, total, running, body) => `
  <section class="page" data-page="${pageNo}">
    <header class="page-head">
      <img class="logo" src="prince-logo.png" alt="">
      <div class="rule"></div>
      <div><div class="wordmark">PRINCE IT SOLUTIONS OPC</div><div class="tagline">INNOVATE • INTEGRATE • EMPOWER</div></div>
      <div class="doc"><div class="t">NETPOLEON WMS · USER HANDBOOK</div><div class="s">${escape(running)}</div></div>
    </header>
    <div class="page-body">${body}</div>
    <footer class="page-foot"><span class="co">PRINCE IT SOLUTIONS OPC</span><span class="bar">|</span>
      <span>INNOVATE • INTEGRATE • EMPOWER</span><span class="num">PAGE ${pageNo} OF ${total}</span></footer>
  </section>`;

const cover = (total) => `
  <section class="page cover" data-page="1">
    <div class="head">
      <img class="logo" src="prince-logo.png" alt="Prince IT Solutions">
      <div class="rule"></div>
      <div><div class="wordmark">PRINCE IT SOLUTIONS OPC</div><div class="tagline">INNOVATE • INTEGRATE • EMPOWER</div>${CONTACT}</div>
    </div>
    <div class="hero">
      <div class="kicker">USER HANDBOOK</div>
      <h1><span class="w">Netpoleon WMS</span><span class="g">User guide</span></h1>
      <div class="sub">ICT Equipment Warehouse &amp; Demo Asset Management System for <b>Netpoleon / NSPH INC.</b>
        Every workflow, step by step, for every role — in English, with Tagalog explanations.</div>
      <img class="np" src="netpoleon-white.png" alt="Netpoleon">
    </div>
    <div class="facts">
      <div><small>Prepared for</small>Netpoleon / NSPH INC.</div>
      <div><small>Prepared by</small>Prince IT Solutions OPC</div>
      <div><small>Document reference</small>${EDITION.ref}</div>
      <div><small>Edition</small>${EDITION.edition}</div>
      <div><small>System address</small>${EDITION.address}</div>
      <div><small>System version</small><span class="mono">${EDITION.version}</span></div>
    </div>
    <img class="shot" src="figures/dashboard.png" alt="">
    <div class="strip">
      <div><div class="ring">1</div><b>Register</b><span>Units and labels</span></div>
      <div><div class="ring">2</div><b>Borrow</b><span>Request and approve</span></div>
      <div><div class="ring">3</div><b>Release &amp; return</b><span>Scan out, scan in</span></div>
      <div><div class="ring">4</div><b>Inspect</b><span>Restock or repair</span></div>
      <div><div class="ring">5</div><b>Report</b><span>Every step on record</span></div>
    </div>
    <footer class="page-foot"><span class="co">PRINCE IT SOLUTIONS OPC</span><span class="bar">|</span>
      <span>INNOVATE • INTEGRATE • EMPOWER</span><span class="num">PAGE 1 OF ${total}</span></footer>
  </section>`;

const back = (pageNo, total) => `
  <section class="page cover back" data-page="${pageNo}">
    <div class="center">
      <img class="logo" src="prince-logo.png" alt="Prince IT Solutions">
      <div class="wordmark">PRINCE IT SOLUTIONS OPC</div>
      <div class="tagline">INNOVATE • INTEGRATE • EMPOWER</div>
      ${CONTACT}
      <div class="thanks">THANK YOU · SALAMAT PO</div>
    </div>
    <footer class="page-foot"><span class="co">PRINCE IT SOLUTIONS OPC</span><span class="bar">|</span>
      <span>INNOVATE • INTEGRATE • EMPOWER</span><span class="num">PAGE ${pageNo} OF ${total}</span></footer>
  </section>`;

// ── Two passes: the first learns which page each chapter starts on, for the contents ───────
function render(known) {
  const state = { chapter: 0, figure: 0, chapters: [], known, page: 0 };
  const h = makeHelpers(state);
  const list = contentPages(h);
  const total = list.length + 2;
  const html = list.map((p, i) => {
    state.page = i + 2;
    return frame(i + 2, total, p.running, p.body());
  });
  return { state, html: [cover(total), ...html, back(total, total)].join('\n'), total };
}

const first = render([]);
const { html, total } = render(first.state.chapters);

const document = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Netpoleon WMS — User Handbook</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Cinzel:wght@600;700&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">
<link rel="stylesheet" href="handbook.css"></head><body>${html}<script src="layout.js"></script></body></html>`;
const htmlPath = join(BUILD, 'handbook.html');
writeFileSync(htmlPath, document);

// ── Lay out, verify, print ───────────────────────────────────────────────────────────────
const { chromium } = require(join(process.env.PW_DIR ?? '.', 'node_modules', 'playwright'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__layout !== undefined, null, { timeout: 60000 });
const result = await page.evaluate(() => window.__layout);
console.log(`pages: ${total}, figures: ${result.figures}, callouts: ${result.callouts}`);
if (result.errors.length) {
  console.log(`LAYOUT ERRORS (${result.errors.length}):\n  ${result.errors.join('\n  ')}`);
  await browser.close();
  process.exit(1);
}
if (process.env.PREVIEW) {
  mkdirSync(join(BUILD, 'preview'), { recursive: true });
  const sections = await page.locator('section.page').all();
  for (const [i, section] of sections.entries()) {
    await section.screenshot({
      path: join(BUILD, 'preview', `page-${String(i + 1).padStart(2, '0')}.png`),
    });
  }
}
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: OUTPUT,
  width: '8.5in',
  height: '13in',
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log(`no layout violations; wrote ${OUTPUT}`);
