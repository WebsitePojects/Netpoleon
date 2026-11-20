/**
 * Every annotated figure in the handbook: how to reach the screen on the live demo, what to
 * crop, and what each callout points at and says (English, then Tagalog).
 *
 * `setup` only navigates, opens dialogs and types into fields. capture.mjs blocks every
 * non-GET API call except sign-in at the network layer, so no figure can change demo data even
 * if a step clicked a confirm button by mistake.
 *
 * Layout modes (see build.mjs):
 *   'lr' — callouts in left/right gutters, horizontal leaders. For tall, narrow dialogs.
 *   'tb' — callouts in bands above/below, vertical leaders. For wide screens.
 * `side` on a note pins it to a gutter or band; otherwise the nearer one is used.
 */

const field = (h, label) =>
  h.scope.locator('label.field').filter({ has: h.page.locator(`span:text-is("${label}")`) });
const button = (h, name) => h.scope.getByRole('button', { name, exact: true });

export const FIGURES = [
  // ── Getting started ────────────────────────────────────────────────────────────────────
  {
    id: 'login',
    user: null,
    path: '/login',
    clip: { x: 254, y: 176, width: 772, height: 460 },
    mode: 'lr',
    display: 430,
    setup: async (h) => {
      await h.page.getByPlaceholder('Username or email').fill('marco');
      await h.page.getByPlaceholder('Password').fill('123456');
    },
    notes: [
      {
        target: (h) => h.page.getByPlaceholder('Username or email'),
        side: 'left',
        en: 'Your username (for example marco) or the email on your account.',
        tl: 'Ilagay ang username o email ng iyong account.',
      },
      {
        target: (h) => h.page.getByPlaceholder('Password'),
        side: 'left',
        en: 'Your password. The eye icon shows what you typed.',
        tl: 'Ang iyong password. Pindutin ang mata para makita ang tinype.',
      },
      {
        target: (h) => h.page.getByText('Remember me', { exact: true }),
        side: 'left',
        en: 'Keeps you signed in on this computer for 7 days. Leave it off on shared PCs.',
        tl: 'Hindi ka na magla-login ulit sa loob ng 7 araw. Huwag i-check sa shared na PC.',
      },
      {
        target: (h) => h.page.getByText('Forgot password?'),
        side: 'right',
        en: 'Sends a one-time reset link to your email.',
        tl: 'Magpapadala ng reset link sa iyong email.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Sign In' }),
        side: 'right',
        en: 'Opens your dashboard. Wrong details show one general message, never which part was wrong.',
        tl: 'Papasok sa dashboard. Kapag mali, iisang mensahe lang ang lalabas para sa seguridad.',
      },
    ],
  },
  {
    id: 'shell',
    user: 'lara',
    path: '/',
    clip: 'viewport',
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.locator('.side-nav'),
        side: 'bottom',
        at: 'bottom',
        en: 'Main menu. You only see the parts your role may use; numbers show work waiting.',
        tl: 'Pangunahing menu. Ang makikita lang ay ang para sa iyong role; ang numero ay mga naghihintay na gawain.',
      },
      {
        target: (h) => h.page.locator('.header-search'),
        side: 'top',
        en: 'Search from any page: asset code, serial number or borrower.',
        tl: 'Maghanap mula kahit saang page: asset code, serial o borrower.',
      },
      {
        target: (h) => h.page.locator('.theme-toggle'),
        side: 'top',
        en: 'Light or dark screen.',
        tl: 'Light o dark na itsura ng screen.',
      },
      {
        target: (h) => h.page.locator('.bell'),
        side: 'top',
        en: 'Alerts: overdue returns, missing accessories, units to inspect.',
        tl: 'Mga alerto: overdue, kulang na accessory, at mga dapat i-inspect.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: /Account menu/ }),
        side: 'top',
        en: 'Your account: profile, password, theme and Sign out.',
        tl: 'Iyong account: profile, password, theme at Sign out.',
      },
      {
        target: (h) => h.page.locator('main h1, .page h1').first(),
        side: 'bottom',
        at: 'bottom',
        en: 'The page you are on, with a one-line description.',
        tl: 'Ang kasalukuyang page at maikling paliwanag nito.',
      },
    ],
  },
  {
    id: 'dashboard',
    user: 'lara',
    path: '/',
    clip: { x: 210, y: 60, width: 1060, height: 740 },
    mode: 'tb',
    notes: [
      {
        target: (h) =>
          h.page
            .getByText('Total Demo Units', { exact: true })
            .locator('xpath=ancestor::*[contains(@class,"card") or contains(@class,"kpi")][1]'),
        side: 'top',
        en: 'Status cards: total units and how many are available, on demo, returned or being inspected.',
        tl: 'Bilang ng lahat ng unit at ilan ang available, naka-demo, naibalik o ini-inspect.',
      },
      {
        target: (h) => h.page.getByText('New request', { exact: true }),
        side: 'top',
        en: 'Start a borrowing request straight from the dashboard.',
        tl: 'Gumawa agad ng borrowing request mula rito.',
      },
      {
        target: (h) => h.page.getByText('Asset Status Distribution', { exact: true }),
        side: 'bottom',
        at: 'bottom',
        en: 'Where every unit is right now, as a chart.',
        tl: 'Chart kung nasaan ang bawat unit ngayon.',
      },
      {
        target: (h) => h.page.getByText('Recent Activities', { exact: true }),
        side: 'top',
        en: 'The latest movements: who released, returned or inspected what.',
        tl: 'Mga pinakabagong galaw: sino ang nag-release, nagbalik o nag-inspect.',
      },
      {
        target: (h) => h.page.getByText(/^View all \d+$/),
        side: 'bottom',
        at: 'bottom',
        en: 'Alerts that need attention today; View all opens the full list.',
        tl: 'Mga dapat asikasuhin ngayon, pinakabago muna.',
      },
    ],
  },
  {
    id: 'profile',
    user: 'lara',
    path: '/profile',
    viewport: { width: 1280, height: 900 },
    clip: { x: 210, y: 60, width: 1060, height: 690 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.getByRole('group', { name: 'Theme' }).last(),
        side: 'top',
        en: 'Appearance: Light, Dark, or follow your computer.',
        tl: 'Itsura: Light, Dark, o sundan ang setting ng computer.',
      },
      {
        target: (h) => h.page.getByText('What you can do', { exact: true }),
        side: 'bottom',
        at: 'bottom',
        en: 'Exactly what your role allows, so you know which buttons you will see.',
        tl: 'Listahan ng puwede mong gawin ayon sa iyong role.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Update password' }),
        side: 'top',
        en: 'Change your password: current one, then the new one twice.',
        tl: 'Palitan ang password: ilagay ang luma, tapos ang bago nang dalawang beses.',
      },
      {
        target: (h) => h.page.getByText('Your recent activity', { exact: true }),
        side: 'bottom',
        at: 'bottom',
        en: 'Your own latest actions, from the audit trail.',
        tl: 'Ang iyong mga huling ginawa sa system.',
      },
    ],
  },
  {
    id: 'mobile',
    user: 'marco',
    path: '/',
    viewport: { width: 390, height: 844 },
    clip: 'viewport',
    mode: 'lr',
    display: 300,
    notes: [
      {
        target: (h) => h.page.getByRole('button', { name: 'Open menu' }),
        side: 'left',
        en: 'Full menu on a phone.',
        tl: 'Buong menu sa cellphone.',
      },
      {
        target: (h) => h.page.locator('.bell'),
        side: 'right',
        en: 'Alerts, as on a computer.',
        tl: 'Mga alerto, gaya sa computer.',
      },
      {
        target: (h) => h.page.locator('.tabbar'),
        side: 'left',
        at: 'left',
        en: 'Quick bar: the four screens used most, one tap away.',
        tl: 'Mabilis na bar: apat na pinakaginagamit na screen.',
      },
    ],
  },

  // ── Demo units ─────────────────────────────────────────────────────────────────────────
  {
    id: 'units',
    user: 'marco',
    path: '/units',
    clip: { x: 210, y: 60, width: 1060, height: 740 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.getByRole('button', { name: 'Add Asset' }),
        side: 'top',
        en: 'Register a new demo unit.',
        tl: 'Mag-register ng bagong demo unit.',
      },
      {
        target: (h) => h.page.getByPlaceholder(/Search/).last(),
        side: 'top',
        en: 'Find a unit by asset code, serial number or model.',
        tl: 'Hanapin ang unit gamit ang asset code, serial o model.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Status' }).first(),
        side: 'top',
        en: 'Filters: status, category and shelf location.',
        tl: 'Filter ayon sa status, category at shelf.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Export CSV' }),
        side: 'bottom',
        at: 'bottom',
        en: 'Download the list as a spreadsheet (CSV).',
        tl: 'I-download ang listahan bilang spreadsheet.',
      },
      {
        target: (h) => h.page.locator('tbody tr').nth(1).locator('input[type=checkbox]'),
        side: 'bottom',
        at: 'bottom',
        en: 'Tick units to act on several at once.',
        tl: 'I-check ang mga unit para sabay-sabay na gawin.',
      },
      {
        target: (h) => h.page.locator('tbody tr').nth(2).locator('a.row-link'),
        side: 'bottom',
        at: 'bottom',
        en: 'Asset code: open the unit for its full record.',
        tl: 'Pindutin ang asset code para makita ang buong record.',
      },
      {
        target: (h) => h.page.locator('tbody tr').nth(3).locator('.chip').first(),
        side: 'bottom',
        at: 'bottom',
        en: 'Current status, always matching the unit’s history.',
        tl: 'Kasalukuyang status, laging tugma sa history ng unit.',
      },
    ],
  },
  {
    id: 'units-select',
    user: 'marco',
    path: '/units?status=in_stock',
    clip: { x: 210, y: 120, width: 1060, height: 420 },
    mode: 'tb',
    setup: async (h) => {
      for (const n of [0, 1, 2])
        await h.page.locator('tbody tr').nth(n).locator('input[type=checkbox]').check();
    },
    notes: [
      {
        target: (h) => h.page.getByRole('button', { name: 'Move to shelf' }),
        side: 'top',
        en: 'Move every ticked unit to one shelf in a single step.',
        tl: 'Ilipat lahat ng naka-check sa iisang shelf.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Export selected' }),
        side: 'top',
        en: 'Download only the ticked rows.',
        tl: 'I-download lang ang mga naka-check.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Clear selection' }),
        side: 'top',
        en: 'Untick everything.',
        tl: 'Alisin ang lahat ng check.',
      },
      {
        target: (h) => h.page.locator('tbody tr').nth(1).locator('input[type=checkbox]'),
        side: 'bottom',
        at: 'bottom',
        en: 'Ticked units. The bar above counts them.',
        tl: 'Mga naka-check na unit; bilang nila ay nasa itaas.',
      },
    ],
  },
  {
    id: 'register',
    user: 'marco',
    path: '/units',
    viewport: { width: 1280, height: 860 },
    clip: 'dialog',
    mode: 'lr',
    setup: async (h) => {
      await h.page.getByRole('button', { name: 'Add Asset' }).click();
      const d = h.page.getByRole('dialog');
      await field({ scope: d, page: h.page }, 'Serial number').locator('input').fill('CNHXK9T0QZ');
      await field({ scope: d, page: h.page }, 'Notes')
        .locator('textarea')
        .fill('Sealed box; demo stickers on the side.');
    },
    notes: [
      {
        target: (h) => field(h, 'Category'),
        side: 'left',
        en: 'Category (firewall, switch…). Decides the asset code, e.g. NTP-FW-…',
        tl: 'Uri ng unit. Dito nakabatay ang asset code.',
      },
      {
        target: (h) => field(h, 'Model'),
        side: 'right',
        en: 'Brand and model. Its usual accessories come with it.',
        tl: 'Brand at model; kasama na ang karaniwang accessories.',
      },
      {
        target: (h) => field(h, 'Serial number'),
        side: 'left',
        en: 'Serial exactly as printed. The same serial for the same model is refused.',
        tl: 'Serial na eksaktong nakasulat sa unit. Bawal ang doble.',
      },
      {
        target: (h) => field(h, 'Shelf location'),
        side: 'right',
        en: 'Shelf where the unit is stored.',
        tl: 'Shelf kung saan ilalagay ang unit.',
      },
      {
        target: (h) => field(h, 'Condition'),
        side: 'left',
        en: 'Condition A (like new) to D (heavy wear).',
        tl: 'Kondisyon: A (parang bago) hanggang D (luma na).',
      },
      {
        target: (h) => field(h, 'Notes'),
        side: 'right',
        en: 'Anything worth knowing: dents, missing feet, stickers.',
        tl: 'Dagdag na detalye: gasgas, kulang na piyesa, atbp.',
      },
      {
        target: (h) => button(h, 'Register unit'),
        side: 'right',
        en: 'Saves the unit and gives it its asset code.',
        tl: 'I-save; bibigyan ng asset code ang unit.',
      },
    ],
  },
  {
    id: 'unit-detail',
    user: 'lara',
    path: '/units?status=in_stock',
    clip: { x: 210, y: 60, width: 1060, height: 660 },
    mode: 'tb',
    setup: async (h) => {
      await h.page.locator('tbody tr a.row-link').first().click();
      await h.page.getByText('Unit information', { exact: true }).waitFor();
    },
    notes: [
      {
        target: (h) => h.page.getByRole('button', { name: 'Edit', exact: true }),
        side: 'top',
        en: 'Actions: Edit · Move shelf · Send to repair · Retire. Only the ones allowed now appear.',
        tl: 'Mga aksyon: Edit, Ilipat, Ipa-repair, I-retire. Lalabas lang ang puwede ngayon.',
      },
      {
        target: (h) =>
          h.page
            .getByText('Unit information', { exact: true })
            .locator('xpath=ancestor::section[1]')
            .locator('.chip')
            .first(),
        side: 'top',
        en: 'Current status of this unit.',
        tl: 'Kasalukuyang status ng unit.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Print' }),
        side: 'top',
        en: 'Print the QR label to stick on the unit.',
        tl: 'I-print ang QR label na ididikit sa unit.',
      },
      {
        target: (h) => h.page.getByText('Movement history', { exact: true }),
        side: 'bottom',
        at: 'bottom',
        en: 'Every movement, newest first: who, when, where to. It can never be edited.',
        tl: 'Lahat ng galaw ng unit: sino, kailan, saan. Hindi ito mabubura.',
      },
      {
        target: (h) => h.page.getByText('Accessories', { exact: true }),
        side: 'bottom',
        at: 'bottom',
        en: 'Accessories that belong with this model.',
        tl: 'Mga accessory na kasama ng model.',
      },
      {
        target: (h) => h.page.getByText('Borrower history', { exact: true }),
        side: 'bottom',
        at: 'bottom',
        en: 'Who borrowed it before, and for what.',
        tl: 'Mga humiram dati at para saan.',
      },
    ],
  },

  // ── Borrowing ──────────────────────────────────────────────────────────────────────────
  {
    id: 'borrow',
    user: 'tina',
    path: '/borrow',
    clip: { x: 210, y: 60, width: 1060, height: 740 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.getByRole('tab', { name: /^Requests/ }),
        side: 'top',
        en: 'Queues: Requests, On Demo, Returned, All. The number is how many.',
        tl: 'Mga listahan: Requests, On Demo, Returned, All. May bilang bawat isa.',
      },
      {
        target: (h) => h.page.getByPlaceholder(/Search by transaction/),
        side: 'top',
        en: 'Search by transaction number, borrower or company.',
        tl: 'Hanapin gamit ang transaction no., borrower o kumpanya.',
      },
      {
        target: (h) => h.page.getByLabel('Company', { exact: true }).first(),
        side: 'top',
        en: 'Filters: company and due date (overdue, due this week).',
        tl: 'Filter: kumpanya at due date (overdue, ngayong linggo).',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'New request' }),
        side: 'top',
        en: 'File a new borrowing request.',
        tl: 'Gumawa ng bagong borrowing request.',
      },
      {
        target: (h) => h.page.locator('tbody tr').nth(1).locator('input[type=checkbox]'),
        side: 'bottom',
        at: 'bottom',
        en: 'Tick pending requests to reject several at once.',
        tl: 'I-check para sabay-sabay na i-reject.',
      },
      {
        target: (h) => h.page.locator('tbody tr').nth(2).locator('a.row-link'),
        side: 'bottom',
        at: 'bottom',
        en: 'Open the transaction to act on it.',
        tl: 'Buksan ang transaksyon para kumilos.',
      },
      {
        target: (h) =>
          h.page
            .locator('tbody tr')
            .filter({ hasText: 'Unit not assigned yet' })
            .nth(3)
            .getByText('Unit not assigned yet'),
        side: 'bottom',
        at: 'bottom',
        en: 'Units are chosen by the approver, not when filing.',
        tl: 'Ang approver ang pipili ng unit, hindi ang nag-file.',
      },
      {
        target: (h) => h.page.locator('tbody tr').nth(4).locator('.chip').first(),
        side: 'bottom',
        at: 'bottom',
        en: 'Where the request is: pending, approved, released…',
        tl: 'Kalagayan ng request: pending, approved, released…',
      },
    ],
  },
  {
    id: 'new-request',
    user: 'marco',
    path: '/borrow?new=1',
    viewport: { width: 1280, height: 1040 },
    clip: 'dialog',
    mode: 'lr',
    setup: async (h) => {
      const d = h.page.getByRole('dialog');
      const f = (label) => field({ scope: d, page: h.page }, label);
      await f('Company').locator('input').fill('Metro Cloud Partners');
      await f('Borrower name').locator('input').fill('Katrina Uy');
      await f('Email').locator('input').fill('katrina.uy@metrocloud.example');
      await f('Contact number').locator('input').fill('0917 000 1270');
      await f('End customer').locator('input').fill('Pacific Bank (PoC)');
    },
    notes: [
      {
        target: (h) => field(h, 'Model requested'),
        side: 'left',
        en: 'Model wanted. The hint shows how many units are free for the dates.',
        tl: 'Model na kailangan. Makikita kung ilan ang bakante sa mga petsa.',
      },
      {
        target: (h) => field(h, 'Company'),
        side: 'left',
        en: 'Borrowing company. Known companies are suggested; a new one asks for its type.',
        tl: 'Kumpanyang hihiram. May suggestion; kapag bago, piliin ang uri.',
      },
      {
        target: (h) => field(h, 'Units'),
        side: 'right',
        en: 'How many units of that model.',
        tl: 'Ilang unit ng model na iyon.',
      },
      {
        target: (h) => field(h, 'Borrower name'),
        side: 'left',
        en: 'The person responsible for the units.',
        tl: 'Taong mananagot sa mga unit.',
      },
      {
        target: (h) => field(h, 'Email'),
        side: 'right',
        en: 'Their email: approval and reminder mails go here.',
        tl: 'Email nila; dito ipapadala ang approval at paalala.',
      },
      {
        target: (h) => field(h, 'Purpose'),
        side: 'left',
        en: 'Why: demo, training, proof of concept…',
        tl: 'Dahilan: demo, training, proof of concept…',
      },
      {
        target: (h) => field(h, 'Expected return'),
        side: 'right',
        en: 'Release and return dates. The loan length is checked against the rules.',
        tl: 'Petsa ng release at balik; sinusuri ang haba ng hiram.',
      },
      {
        target: (h) => button(h, 'Submit request'),
        side: 'right',
        en: 'Sends it for approval. Nothing is reserved yet.',
        tl: 'Ipapadala para i-approve. Wala pang naka-reserve.',
      },
    ],
  },
  {
    id: 'txn-pending',
    user: 'tina',
    path: '/borrow',
    clip: { x: 210, y: 60, width: 1060, height: 680 },
    mode: 'tb',
    setup: async (h) => {
      await h.page
        .locator('tbody tr')
        .filter({ hasText: 'Pending approval' })
        .first()
        .locator('a.row-link')
        .click();
      await h.page.getByText('Borrower Information').waitFor();
    },
    notes: [
      {
        target: (h) => h.page.getByRole('button', { name: 'Reject' }),
        side: 'top',
        en: 'Refuse, with a reason the filer will see.',
        tl: 'Tanggihan, may dahilan na makikita ng nag-file.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Approve' }),
        side: 'top',
        en: 'Approve and choose the exact units to reserve.',
        tl: 'I-approve at piliin ang mismong mga unit.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Cancel request' }),
        side: 'top',
        en: 'Withdraw the request (for example the client cancelled).',
        tl: 'Bawiin ang request (hal. kinansela ng kliyente).',
      },
      {
        target: (h) => h.page.getByText('Borrower Information'),
        side: 'top',
        en: 'Who borrows: person, company, contact details.',
        tl: 'Sino ang hihiram: tao, kumpanya, contact.',
      },
      {
        target: (h) => h.page.getByText('Progress', { exact: true }),
        side: 'bottom',
        at: 'bottom',
        en: 'The five steps of every loan and where this one is.',
        tl: 'Limang hakbang ng bawat hiram at nasaan na ito.',
      },
      {
        target: (h) => h.page.getByText('Transaction Details', { exact: true }).last(),
        side: 'bottom',
        at: 'bottom',
        en: 'Purpose, dates, length of loan and who approved.',
        tl: 'Layunin, mga petsa, haba ng hiram at sino ang nag-approve.',
      },
    ],
  },
  {
    id: 'approve',
    user: 'tina',
    path: '/borrow',
    clip: 'dialog',
    mode: 'lr',
    setup: async (h) => {
      await h.page
        .locator('tbody tr')
        .filter({ hasText: 'Pending approval' })
        .first()
        .locator('a.row-link')
        .click();
      await h.page.getByRole('button', { name: 'Approve' }).click();
      const box = h.page.getByRole('dialog').locator('input[type=checkbox]');
      await box.first().waitFor();
      await box.first().check();
    },
    notes: [
      {
        target: (h) => h.page.getByRole('dialog').getByText(/Units to reserve/),
        side: 'left',
        en: 'Units free for the whole loan period. You may pick up to the number requested.',
        tl: 'Mga unit na bakante sa buong panahon ng hiram.',
      },
      {
        target: (h) => h.page.getByRole('dialog').locator('input[type=checkbox]').first(),
        side: 'left',
        en: 'Tick each unit to reserve. A unit already promised elsewhere is never offered.',
        tl: 'I-check ang unit na ire-reserve. Hindi lalabas ang naka-reserve na sa iba.',
      },
      {
        target: (h) => button(h, 'Approve request'),
        side: 'right',
        en: 'Reserves the ticked units and tells the borrower.',
        tl: 'Ire-reserve ang mga unit at aabisuhan ang borrower.',
      },
    ],
  },
  {
    id: 'release',
    user: 'marco',
    path: '/borrow',
    clip: 'dialog',
    mode: 'lr',
    setup: async (h) => {
      await h.page
        .locator('tbody tr')
        .filter({ hasText: 'Approved' })
        .first()
        .locator('a.row-link')
        .click();
      await h.page.getByRole('button', { name: 'Release unit' }).click();
      const d = h.page.getByRole('dialog');
      const expected =
        (
          await d
            .getByText(/Expected unit:/)
            .locator('.mono')
            .textContent()
        )?.trim() ?? '';
      await d.getByPlaceholder('Scan or type the asset code').fill(expected);
    },
    notes: [
      {
        target: (h) => h.page.getByRole('dialog').getByPlaceholder('Scan or type the asset code'),
        side: 'left',
        en: 'Scan the QR label (or type the code). Only the reserved unit is accepted.',
        tl: 'I-scan ang QR label. Ang naka-reserve lang na unit ang tatanggapin.',
      },
      {
        target: (h) => h.page.getByRole('dialog').getByText(/Label matches/),
        side: 'right',
        en: 'Green tick: the right unit is in your hands.',
        tl: 'Berdeng check: tama ang unit na hawak mo.',
      },
      {
        target: (h) => h.page.getByRole('dialog').getByText(/Accessories going out/),
        side: 'left',
        en: 'Tick what leaves with the unit. This becomes the return checklist.',
        tl: 'I-check ang mga accessory na kasama. Ito ang checklist sa pagbalik.',
      },
      {
        target: (h) => button(h, 'Confirm release'),
        side: 'right',
        en: 'Records the release: the unit is now On Demo.',
        tl: 'Itatala ang release; naka-demo na ang unit.',
      },
    ],
  },
  {
    id: 'receive',
    user: 'marco',
    path: '/borrow?tab=on_demo',
    clip: 'dialog',
    mode: 'lr',
    setup: async (h) => {
      await h.page.locator('tbody tr a.row-link').first().click();
      await h.page.getByRole('button', { name: 'Receive return' }).click();
      const d = h.page.getByRole('dialog');
      const expected = (
        await d
          .getByText(/Expected unit:/)
          .locator('.mono')
          .textContent()
          .catch(() => '')
      )?.trim();
      if (expected) await d.getByPlaceholder('Scan or type the asset code').fill(expected);
      const boxes = d.locator('fieldset input[type=checkbox]');
      if ((await boxes.count()) > 1) await boxes.last().uncheck();
      await d.locator('textarea').fill('Box slightly dented; works.');
    },
    notes: [
      {
        target: (h) => h.page.getByRole('dialog').getByPlaceholder('Scan or type the asset code'),
        side: 'left',
        en: 'Scan the returned unit’s label.',
        tl: 'I-scan ang label ng ibinalik na unit.',
      },
      {
        target: (h) => h.page.getByRole('dialog').getByText(/Tick each accessory/),
        side: 'left',
        en: 'Tick what came back. Anything left unticked is recorded as missing and raises an alert.',
        tl: 'I-check ang bumalik. Ang hindi naka-check ay ituturing na kulang at magkaka-alert.',
      },
      {
        target: (h) => h.page.getByRole('dialog').locator('textarea'),
        side: 'right',
        en: 'Remarks about the condition at return.',
        tl: 'Puna tungkol sa kondisyon pagbalik.',
      },
      {
        target: (h) => button(h, 'Confirm return'),
        side: 'right',
        en: 'Unit goes to Returned and waits for inspection.',
        tl: 'Mapupunta sa Returned at hihintayin ang inspection.',
      },
    ],
  },
  {
    id: 'extend',
    user: 'tina',
    path: '/borrow?tab=on_demo',
    clip: 'dialog',
    mode: 'lr',
    setup: async (h) => {
      await h.page.locator('tbody tr a.row-link').first().click();
      await h.page.getByRole('button', { name: 'Extend' }).click();
      await h.page
        .getByRole('dialog')
        .locator('textarea')
        .fill('Client extended the proof of concept by one week.');
    },
    notes: [
      {
        target: (h) => field(h, 'New return date'),
        side: 'left',
        en: 'The new return date. Refused if it collides with another booking of the unit.',
        tl: 'Bagong petsa ng balik. Hindi puwede kung may susunod nang booking.',
      },
      {
        target: (h) => h.page.getByRole('dialog').locator('textarea'),
        side: 'right',
        en: 'Why it is extended; kept on the record.',
        tl: 'Dahilan ng extension; mananatili sa record.',
      },
      {
        target: (h) => button(h, 'Extend loan'),
        side: 'right',
        en: 'Saves the new due date.',
        tl: 'I-save ang bagong due date.',
      },
    ],
  },

  // ── Inspection ─────────────────────────────────────────────────────────────────────────
  {
    id: 'inspection',
    user: 'marco',
    path: '/inspection',
    clip: { x: 210, y: 60, width: 1060, height: 740 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.getByRole('tab', { name: /^Awaiting inspection/ }),
        side: 'top',
        en: 'Returned units waiting for a check.',
        tl: 'Mga naibalik na naghihintay ng inspection.',
      },
      {
        target: (h) => h.page.getByRole('tab', { name: /^Under inspection/ }),
        side: 'top',
        en: 'Units being checked now.',
        tl: 'Mga unit na sinusuri ngayon.',
      },
      {
        target: (h) => h.page.getByRole('tab', { name: /^For repair/ }),
        side: 'top',
        en: 'Units out for repair.',
        tl: 'Mga unit na pinapaayos.',
      },
      {
        target: (h) => h.page.getByPlaceholder(/Scan or type/),
        side: 'bottom',
        at: 'bottom',
        en: 'Scan a unit to jump straight to it.',
        tl: 'I-scan ang unit para agad itong mahanap.',
      },
      {
        target: (h) =>
          h.page.locator('tbody tr').nth(1).getByRole('button', { name: 'Start inspection' }),
        side: 'bottom',
        at: 'bottom',
        en: 'Moves the unit to the inspection area and starts the check.',
        tl: 'Ililipat sa inspection area at sisimulan ang pagsusuri.',
      },
    ],
  },
  {
    id: 'record-result',
    user: 'marco',
    path: '/inspection?tab=inspecting',
    clip: 'dialog',
    mode: 'lr',
    setup: async (h) => {
      await h.page.getByRole('button', { name: 'Record result' }).first().click();
      await h.page
        .getByRole('dialog')
        .locator('textarea')
        .fill('All ports tested; factory reset done.');
    },
    notes: [
      {
        target: (h) => h.page.getByRole('dialog').getByText('Checklist', { exact: true }),
        side: 'left',
        en: 'The standard checks. Untick any that failed.',
        tl: 'Mga karaniwang pagsusuri. Alisin ang check kung pumalya.',
      },
      {
        target: (h) => field(h, 'Condition grade'),
        side: 'left',
        en: 'Condition after the check, A to D.',
        tl: 'Kondisyon matapos suriin, A hanggang D.',
      },
      {
        target: (h) => h.page.getByRole('dialog').getByRole('button', { name: /^Restock/ }),
        side: 'left',
        en: 'Restock: good, back to a shelf.',
        tl: 'Restock: maayos, ibalik sa shelf.',
      },
      {
        target: (h) => h.page.getByRole('dialog').getByRole('button', { name: /^Send to repair/ }),
        side: 'right',
        en: 'Repair needs a fault description. Retire takes it out of service for good.',
        tl: 'Repair: ilagay ang sira. Retire: hindi na gagamitin kailanman.',
      },
      {
        target: (h) => field(h, 'Restock on'),
        side: 'right',
        en: 'Which shelf it goes back to.',
        tl: 'Saang shelf ibabalik.',
      },
      {
        target: (h) => button(h, 'Record inspection'),
        side: 'right',
        en: 'Saves the result; the unit moves on.',
        tl: 'I-save ang resulta; lilipat na ang unit.',
      },
    ],
  },
  {
    id: 'repair',
    user: 'marco',
    path: '/inspection?tab=repair',
    clip: { x: 210, y: 60, width: 1060, height: 520 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.getByRole('tab', { name: /^For repair/ }),
        side: 'top',
        en: 'Units at repair, with the fault noted when they were sent.',
        tl: 'Mga unit na pinapaayos at ang nakatalang sira.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Repair complete' }).first(),
        side: 'bottom',
        at: 'bottom',
        en: 'When it is fixed: Repair complete. It goes back through inspection before it can be lent.',
        tl: 'Kapag naayos na: Repair complete. Dadaan ulit sa inspection bago ipahiram.',
      },
    ],
  },

  // ── Alerts and reports ─────────────────────────────────────────────────────────────────
  {
    id: 'alerts',
    user: 'tina',
    path: '/alerts',
    clip: { x: 210, y: 60, width: 1060, height: 740 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.getByRole('tab', { name: /^Overdue return/ }),
        side: 'top',
        en: 'Alert types: overdue, missing accessory, for inspection, ready to lend, booking needs a substitute.',
        tl: 'Uri ng alerto: overdue, kulang na accessory, para sa inspection, handa nang ipahiram.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: /^Mark .* as read$/ }),
        side: 'top',
        en: 'Clear the unread count once you have seen them.',
        tl: 'Tanggalin ang unread na bilang kapag nabasa na.',
      },
      {
        target: (h) =>
          h.page
            .locator('main a, .page a')
            .filter({ hasText: /NTP-|BRR-/ })
            .nth(1),
        side: 'bottom',
        at: 'bottom',
        en: 'Each alert links to the unit or transaction to act on.',
        tl: 'Bawat alerto ay may link sa unit o transaksyon.',
      },
    ],
  },
  {
    id: 'reports',
    user: 'audit',
    path: '/reports',
    clip: { x: 210, y: 60, width: 1060, height: 740 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.getByRole('tab', { name: 'Overview' }),
        side: 'top',
        en: 'Overview: movement per month and inventory by status.',
        tl: 'Overview: galaw bawat buwan at bilang ayon sa status.',
      },
      {
        target: (h) => h.page.getByRole('tab', { name: 'Tracking record' }),
        side: 'top',
        en: 'Tracking record: every borrowing, filterable and exportable.',
        tl: 'Tracking record: lahat ng hiram, may filter at export.',
      },
      {
        target: (h) => h.page.getByRole('tab', { name: 'Borrower history' }),
        side: 'top',
        en: 'Borrower history: totals per partner company.',
        tl: 'Borrower history: kabuuan bawat partner.',
      },
      {
        target: (h) => h.page.getByRole('tab', { name: 'Utilization' }),
        side: 'top',
        en: 'Aging and Utilization: condition, idle time, deployed vs available.',
        tl: 'Aging at Utilization: kondisyon, tagal na nakatengga, gamit vs bakante.',
      },
      {
        target: (h) => h.page.getByText('Equipment Movement Report'),
        side: 'bottom',
        at: 'bottom',
        en: 'Released, returned and restocked per month.',
        tl: 'Bilang ng release, balik at restock bawat buwan.',
      },
      {
        target: (h) => h.page.getByText('Inventory Status Report'),
        side: 'bottom',
        at: 'bottom',
        en: 'How many units in each status right now.',
        tl: 'Ilang unit sa bawat status ngayon.',
      },
    ],
  },
  {
    id: 'report-borrowers',
    user: 'audit',
    path: '/reports',
    clip: { x: 210, y: 120, width: 1060, height: 520 },
    mode: 'tb',
    setup: async (h) => {
      await h.page.getByRole('tab', { name: 'Borrower history' }).click();
      await h.page.waitForTimeout(800);
    },
    notes: [
      {
        target: (h) => h.page.getByText('Borrowing and Return History by Partner'),
        side: 'top',
        en: 'One row per partner: requests, units borrowed, returns, overdue.',
        tl: 'Isang hilera bawat partner: request, hiniram, naibalik, overdue.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Export CSV' }),
        side: 'top',
        en: 'Download for Excel.',
        tl: 'I-download para sa Excel.',
      },
    ],
  },

  // ── Administration ─────────────────────────────────────────────────────────────────────
  {
    id: 'users',
    user: 'lara',
    path: '/users',
    clip: { x: 210, y: 60, width: 1060, height: 520 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.getByRole('tab', { name: 'Roles and permissions' }),
        side: 'top',
        en: 'Tabs: Users, Roles and permissions, Activity log.',
        tl: 'Mga tab: Users, Roles and permissions, Activity log.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Add user' }),
        side: 'top',
        en: 'Invite a new staff member.',
        tl: 'Mag-imbita ng bagong staff.',
      },
      {
        target: (h) => h.page.locator('tbody tr').first().locator('.chip').first(),
        side: 'bottom',
        at: 'bottom',
        en: 'Their role decides what they can do.',
        tl: 'Ang role ang nagtatakda ng puwede nilang gawin.',
      },
      {
        target: (h) => h.page.getByRole('switch').nth(1),
        side: 'bottom',
        at: 'bottom',
        en: 'Active switch: off signs the person out at once and blocks sign-in.',
        tl: 'Kapag in-off, agad mala-logout at hindi na makakapasok.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: /link/i }).first(),
        side: 'bottom',
        at: 'bottom',
        en: 'One-time link to set or reset a password, to hand over.',
        tl: 'Isang-gamit na link para mag-set o mag-reset ng password.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Edit' }).first(),
        side: 'bottom',
        at: 'bottom',
        en: 'Change name, email, title or role.',
        tl: 'Palitan ang pangalan, email, titulo o role.',
      },
    ],
  },
  {
    id: 'add-user',
    user: 'lara',
    path: '/users',
    clip: 'dialog',
    mode: 'lr',
    setup: async (h) => {
      await h.page.getByRole('button', { name: 'Add user' }).click();
      const d = h.page.getByRole('dialog');
      const f = (label) => field({ scope: d, page: h.page }, label).locator('input');
      await f('Username').fill('jcruz');
      await f('Full name').fill('Jose Cruz');
      await f('Email').fill('jose.cruz@netpoleon.example');
      await f('Job title').fill('Warehouse Associate');
    },
    notes: [
      {
        target: (h) => field(h, 'Username'),
        side: 'left',
        en: 'Sign-in name: lower case, no spaces.',
        tl: 'Pangalang gagamitin sa login: maliliit na titik, walang space.',
      },
      {
        target: (h) => field(h, 'Email'),
        side: 'left',
        en: 'Work email, for the invitation and password resets.',
        tl: 'Email sa trabaho para sa imbitasyon at reset.',
      },
      {
        target: (h) => field(h, 'Full name'),
        side: 'right',
        en: 'Name shown on every record they make.',
        tl: 'Pangalang lalabas sa bawat record.',
      },
      {
        target: (h) => field(h, 'Role'),
        side: 'left',
        en: 'Administrator, Manager, Warehouse or Auditor.',
        tl: 'Administrator, Manager, Warehouse o Auditor.',
      },
      {
        target: (h) => button(h, 'Add user'),
        side: 'right',
        en: 'Creates the account and shows a one-time link. They choose their own password.',
        tl: 'Gagawa ng account at magbibigay ng link; sila ang pipili ng password.',
      },
    ],
  },
  {
    id: 'roles',
    user: 'lara',
    path: '/users?tab=roles',
    clip: { x: 210, y: 120, width: 1060, height: 680 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.locator('table thead th').nth(1),
        side: 'top',
        en: 'One column per role.',
        tl: 'Isang column bawat role.',
      },
      {
        target: (h) => h.page.locator('table tbody tr').first().locator('td, th').first(),
        side: 'bottom',
        at: 'bottom',
        en: 'One row per action. A tick means the role may do it; the server checks every request.',
        tl: 'Isang hilera bawat aksyon. May check kung puwede; sinusuri ito ng server.',
      },
    ],
  },
  {
    id: 'activity',
    user: 'audit',
    path: '/users?tab=activity',
    clip: { x: 210, y: 120, width: 1060, height: 680 },
    mode: 'tb',
    notes: [
      {
        target: (h) => h.page.locator('main input, .page input').first(),
        side: 'top',
        en: 'Search the trail: action, record, person.',
        tl: 'Hanapin: aksyon, record, tao.',
      },
      {
        target: (h) => h.page.locator('.feed-item, tbody tr').nth(1),
        side: 'bottom',
        at: 'bottom',
        en: 'Who did what, when and to which record. Entries can never be edited or deleted.',
        tl: 'Sino, ano, kailan at saang record. Hindi ito mabubura o mababago.',
      },
    ],
  },
  {
    id: 'settings',
    user: 'lara',
    path: '/settings',
    clip: { x: 210, y: 60, width: 1060, height: 560 },
    mode: 'tb',
    setup: async (h) => {
      await h.page.getByRole('button', { name: 'Loan rules' }).first().click();
      await h.page.waitForTimeout(500);
    },
    notes: [
      {
        target: (h) => h.page.getByRole('button', { name: 'Categories' }).first(),
        side: 'bottom',
        at: 'bottom',
        en: 'Sections: categories, shelves, loan rules, alerts, labels, security.',
        tl: 'Mga bahagi: category, shelf, patakaran sa hiram, alerto, label, seguridad.',
      },
      {
        target: (h) => h.page.getByText('Loan rules', { exact: true }).last(),
        side: 'top',
        en: 'Loan rules: default and longest loan, units per request, turnaround days.',
        tl: 'Patakaran sa hiram: karaniwan at pinakamahabang hiram, ilang unit, turnaround.',
      },
      {
        target: (h) => h.page.getByRole('button', { name: 'Save changes' }),
        side: 'bottom',
        at: 'bottom',
        en: 'Nothing changes until you save; Discard undoes your edits.',
        tl: 'Walang magbabago hangga’t hindi naka-save.',
      },
    ],
  },
];
