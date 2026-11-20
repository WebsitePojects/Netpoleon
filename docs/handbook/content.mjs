/**
 * The handbook's words and page plan. English is the main text; every section carries a
 * Tagalog side note. Pages are laid out by hand (one entry per printed page) so that no figure
 * is ever split; build.mjs fails if a page overflows.
 *
 * Helpers come from build.mjs: chapter, section, pair, steps, fig, tip, who, table, row.
 */

export function pages(h) {
  const { chapter, section, pair, steps, fig, tip, who, chips, lifecycle } = h;

  return [
    // ── Contents ─────────────────────────────────────────────────────────────────────────
    {
      running: 'Contents',
      body: () => `
        ${h.contents()}
        ${section('How to use this handbook')}
        ${pair(
          `<p>Each chapter follows the work as it happens in the warehouse. Every task is written as
           numbered steps, and every screen is shown with numbered callouts: the number on the
           screenshot matches the number on the note beside it.</p>
           <p>The badges under a heading say who can do the task. If you do not see a button
           described here, your role does not include that task — ask your administrator.</p>`,
          `<p>Sinusundan ng bawat kabanata ang daloy ng trabaho sa bodega. May bilang ang bawat
           hakbang, at ang numero sa screenshot ay tugma sa numero ng paliwanag sa tabi nito.</p>
           <p>Ang mga badge sa ilalim ng heading ay nagsasabi kung sinong role ang puwedeng gumawa.
           Kung wala sa iyo ang button, hindi ito kasama sa iyong role.</p>`,
        )}
        ${h.table(
          ['If you are…', 'Start with', 'Then read'],
          [
            ['Warehouse staff', 'Chapters 3, 4, 6', 'Chapter 5 (release and return), Chapter 9'],
            ['Manager / approver', 'Chapters 3, 5', 'Chapter 7, Chapter 9'],
            ['Administrator', 'Chapters 2, 3, 8', 'Every chapter'],
            ['Auditor', 'Chapters 3, 7', 'Chapter 8 (activity log)'],
          ],
        )}
      `,
    },

    // ── 1. Welcome ───────────────────────────────────────────────────────────────────────
    {
      running: 'Welcome',
      body: () => `
        ${chapter(1, 'Welcome to', 'Netpoleon WMS')}
        ${pair(
          `<p><b>Netpoleon WMS</b> is the ICT Equipment Warehouse and Demo Asset Management System
           of Netpoleon / NSPH INC. It keeps one record for every demo unit — firewalls, switches,
           routers, access points, servers, laptops — and follows it from the day it is registered
           to the day it comes back from a partner and returns to the shelf.</p>
           <p>Every movement is recorded with who did it and when. The status you see on a unit is
           always the result of its recorded movements, so the screen and the history can never
           disagree.</p>`,
          `<p>Ang <b>Netpoleon WMS</b> ang sistema para sa lahat ng demo unit ng Netpoleon. May
           iisang record ang bawat unit mula pagka-register, paghiram ng partner, pagbalik, hanggang
           maibalik sa shelf.</p>
           <p>Naitatala ang bawat galaw — sino at kailan. Ang status ng unit ay laging galing sa mga
           naitalang galaw, kaya hindi kailanman magkakaiba ang screen at ang history.</p>`,
        )}
        ${section('The seven steps of a demo unit')}
        ${lifecycle()}
        ${section('What each status means')}
        ${h.table(
          ['Status', 'Meaning', 'Sa Tagalog'],
          [
            [
              chips('in_stock', 'Available'),
              'On a shelf and free to lend.',
              'Nasa shelf at puwedeng ipahiram.',
            ],
            [
              chips('on_demo', 'Reserved'),
              'On a shelf, promised to an approved request, waiting for pickup.',
              'Nasa shelf pero naka-reserve na sa isang approved na request.',
            ],
            [
              chips('on_demo', 'On Demo'),
              'Out with a partner or client.',
              'Hiniram at nasa partner o kliyente.',
            ],
            [
              chips('returned', 'Returned'),
              'Back in the warehouse, not yet checked.',
              'Naibalik na pero hindi pa nasusuri.',
            ],
            [
              chips('under_inspection', 'Under Inspection'),
              'Being checked in the inspection area.',
              'Sinusuri sa inspection area.',
            ],
            [
              chips('for_repair', 'For Repair'),
              'Has a fault; out for repair.',
              'May sira at pinapaayos.',
            ],
            [
              chips('retired', 'Retired'),
              'Out of service for good. Its history is kept.',
              'Hindi na gagamitin; nananatili ang history.',
            ],
          ],
        )}
      `,
    },

    // ── 2. Roles ─────────────────────────────────────────────────────────────────────────
    {
      running: 'Roles and accounts',
      body: () => `
        ${chapter(2, 'Roles and', 'accounts')}
        ${pair(
          `<p>Everyone signs in with their own account. What you can do depends on your
           <b>role</b>. The system hides what your role cannot do, and the server refuses it even
           if someone tries anyway. One rule holds for every role: the person who files a request
           can never be the one who approves it.</p>`,
          `<p>May sariling account ang bawat isa. Ang puwede mong gawin ay depende sa iyong
           <b>role</b>. Itinatago ng sistema ang hindi para sa iyo, at tinatanggihan ito ng server.
           Isang patakaran para sa lahat: ang nag-file ng request ay hindi puwedeng mag-approve nito.</p>`,
        )}
        ${h.roleCards()}
        ${section('Who can do what')}
        ${h.permissionMatrix()}
      `,
    },
    {
      running: 'Roles and accounts',
      body: () => `
        ${section('Demo accounts')}
        ${pair(
          `<p>The demonstration system comes with one account per role. All four use the password
           <b>123456</b>. Use them to try every workflow in this handbook — for example sign in as
           <b>marco</b> in one browser and <b>tina</b> in another to file and approve a request.</p>`,
          `<p>May isang demo account bawat role, lahat ay may password na <b>123456</b>. Gamitin ang
           mga ito para subukan ang bawat proseso — halimbawa, si <b>marco</b> sa isang browser at si
           <b>tina</b> sa iba para mag-file at mag-approve.</p>`,
        )}
        ${h.table(
          ['Username', 'Name', 'Role', 'Typical work'],
          [
            [
              '<b class="mono">lara</b>',
              'Lara',
              'Administrator',
              'Users, settings, everything else',
            ],
            [
              '<b class="mono">tina</b>',
              'Cristina Imperial',
              'Manager',
              'Approves requests, extends loans, reports',
            ],
            [
              '<b class="mono">marco</b>',
              'Marco Bautista',
              'Warehouse',
              'Registers, releases, receives, inspects',
            ],
            [
              '<b class="mono">audit</b>',
              'Grace Lim',
              'Auditor',
              'Reads everything, changes nothing',
            ],
          ],
        )}
        ${tip(
          'warn',
          `<b>Before real records go in:</b> these four accounts share a simple, public password. An
           administrator must change all four passwords (or remove the demo data) before Netpoleon
           starts using the system for real work. New accounts must use at least 12 characters.`,
          `<b>Bago gamitin sa totoong trabaho:</b> palitan ang password ng apat na demo account o
           burahin ang demo data. Ang bagong account ay kailangan ng password na hindi bababa sa 12 character.`,
        )}
        ${section('Security in one paragraph')}
        ${pair(
          `<p>Sessions end after a period without activity, and at once when an administrator
           deactivates an account. Repeated wrong passwords lock the account for a while. Sign-in
           errors never say whether the username or the password was wrong. Every change is written
           to the activity log, which no one — not even an administrator — can edit or delete.</p>`,
          `<p>Natatapos ang session kapag matagal na walang ginagawa, at agad kapag na-deactivate ng
           admin. Nala-lock ang account kapag paulit-ulit na mali ang password. Lahat ng pagbabago ay
           nasa activity log na hindi mabubura ninuman, kahit ng admin.</p>`,
        )}
      `,
    },

    // ── 3. Getting started ───────────────────────────────────────────────────────────────
    {
      running: 'Getting started',
      body: () => `
        ${chapter(3, 'Getting', 'started')}
        ${section('Sign in')}
        ${who('all')}
        ${steps([
          [
            'Open <b>https://wms.princeitsolutions.tech</b> in Chrome, Edge or Safari.',
            'Buksan ang <b>https://wms.princeitsolutions.tech</b> sa Chrome, Edge o Safari.',
          ],
          [
            'Type your username or email and your password.',
            'I-type ang username o email at password.',
          ],
          [
            'Tick <b>Remember me</b> only on your own computer.',
            'I-check ang <b>Remember me</b> kung sariling computer lang.',
          ],
          [
            'Press <b>Sign In</b>. Your dashboard opens.',
            'Pindutin ang <b>Sign In</b>. Bubukas ang dashboard.',
          ],
        ])}
        ${fig('login', 'The sign-in screen', 'Ang screen para mag-login')}
        ${section('Forgot your password?')}
        ${steps([
          [
            'Press <b>Forgot password?</b> and enter your email.',
            'Pindutin ang <b>Forgot password?</b> at ilagay ang email.',
          ],
          [
            'Open the link in the email within one hour. It works once.',
            'Buksan ang link sa email sa loob ng isang oras. Isang beses lang ito gagana.',
          ],
          [
            'Choose a new password. All your other sessions are signed out.',
            'Pumili ng bagong password. Mala-logout ang ibang session mo.',
          ],
        ])}
        ${tip(
          'info',
          'Until an email service is connected, ask your administrator for a reset link instead (Users → the key button beside your name).',
          'Habang wala pang email service, humingi ng reset link sa admin (Users → key button sa tabi ng pangalan mo).',
        )}
      `,
    },
    {
      running: 'Getting started',
      body: () => `
        ${section('Finding your way around')}
        ${pair(
          `<p>Every screen has the same frame: the menu on the left, the search box and your
           account at the top, and the page in the middle. The menu shows only what your role can
           use. A number beside <b>Borrow / Return</b> or <b>Inspection</b> means work is waiting.</p>`,
          `<p>Pare-pareho ang ayos ng bawat screen: menu sa kaliwa, search at account sa itaas, at
           ang page sa gitna. Ang numero sa tabi ng <b>Borrow / Return</b> o <b>Inspection</b> ay mga
           gawaing naghihintay.</p>`,
        )}
        ${fig('shell', 'The frame around every page', 'Ang ayos ng bawat page')}
        ${tip(
          'info',
          'Search works from any page: type part of an asset code (FW-00031), a serial number or a borrower’s name, then pick a result.',
          'Puwedeng maghanap kahit nasaang page: i-type ang bahagi ng asset code, serial o pangalan ng borrower.',
        )}
      `,
    },
    {
      running: 'Getting started',
      body: () => `
        ${section('The dashboard')}
        ${who('all')}
        ${pair(
          `<p>The dashboard answers three questions at a glance: how many units are where, what moved
           recently, and what needs attention today. Every card and alert opens the matching list,
           already filtered.</p>`,
          `<p>Sinasagot ng dashboard ang tatlong tanong: ilan ang unit sa bawat status, ano ang huling
           gumalaw, at ano ang dapat asikasuhin ngayon. Bawat card at alerto ay may link sa listahan.</p>`,
        )}
        ${fig('dashboard', 'The dashboard', 'Ang dashboard')}
      `,
    },
    {
      running: 'Getting started',
      body: () => `
        ${section('Your profile and password')}
        ${who('all')}
        ${steps([
          [
            'Open the account menu (your name, top right) and choose <b>My profile</b>.',
            'Buksan ang account menu (pangalan mo sa kanang itaas) at piliin ang <b>My profile</b>.',
          ],
          [
            'Under <b>Change password</b>, type your current password, then the new one twice.',
            'Sa <b>Change password</b>, ilagay ang luma, tapos ang bago nang dalawang beses.',
          ],
          [
            'Press <b>Update password</b>. Other devices signed in as you are signed out.',
            'Pindutin ang <b>Update password</b>. Mala-logout ang ibang device.',
          ],
        ])}
        ${fig('profile', 'My profile', 'Ang iyong profile')}
      `,
    },
    {
      running: 'Getting started',
      body: () => `
        ${section('On a phone or tablet')}
        ${pair(
          `<p>The system works in the phone’s browser with nothing to install. The four screens used
           most sit in a bar at the bottom; the rest of the menu opens from the top-left button.
           Tables turn into cards so they stay readable. Scanning a label works with any scanner
           that types into the field, or by typing the code printed under the QR.</p>`,
          `<p>Gumagana ito sa browser ng cellphone, walang kailangang i-install. Nasa ibaba ang apat na
           pinakaginagamit na screen; ang ibang menu ay nasa button sa kaliwang itaas. Puwedeng
           gumamit ng scanner o i-type ang code na nasa ilalim ng QR.</p>`,
        )}
        ${fig('mobile', 'The phone layout', 'Itsura sa cellphone')}
        ${section('Signing out')}
        ${pair(
          `<p>Open the account menu and choose <b>Sign out</b>. Always sign out on a shared computer.</p>`,
          `<p>Buksan ang account menu at piliin ang <b>Sign out</b>. Laging mag-sign out sa shared na computer.</p>`,
        )}
      `,
    },

    // ── 4. Demo units ────────────────────────────────────────────────────────────────────
    {
      running: 'Demo units',
      body: () => `
        ${chapter(4, 'Demo', 'units')}
        ${pair(
          `<p><b>Demo Units</b> is the inventory: every unit with its asset code, model, shelf and
           current status. Retired units are hidden unless you filter for them. Open any unit to
           see its full record, label and history.</p>`,
          `<p>Ang <b>Demo Units</b> ang imbentaryo: bawat unit kasama ang asset code, model, shelf at
           status. Nakatago ang mga retired maliban kung i-filter. Buksan ang unit para makita ang
           buong record.</p>`,
        )}
        ${fig('units', 'The Demo Units list', 'Ang listahan ng Demo Units')}
      `,
    },
    {
      running: 'Demo units',
      body: () => `
        ${section('Register a new unit')}
        ${who(['admin', 'warehouse'])}
        ${steps([
          [
            'On <b>Demo Units</b>, press <b>Add Asset</b>.',
            'Sa <b>Demo Units</b>, pindutin ang <b>Add Asset</b>.',
          ],
          [
            'Choose the category and the model. If the model is new, choose <b>New model</b> and type brand, model and its accessories.',
            'Piliin ang category at model. Kung bago ang model, piliin ang <b>New model</b> at ilagay ang detalye.',
          ],
          [
            'Type the serial number exactly as printed on the unit.',
            'I-type ang serial na eksaktong nakasulat sa unit.',
          ],
          [
            'Choose the shelf and the condition, add notes if useful.',
            'Piliin ang shelf at kondisyon; magdagdag ng notes kung kailangan.',
          ],
          [
            'Press <b>Register unit</b>. The unit page opens with its new asset code — print its label straight away.',
            'Pindutin ang <b>Register unit</b>. Bubukas ang page ng unit; i-print agad ang label.',
          ],
        ])}
        ${fig('register', 'Registering a unit', 'Pag-register ng unit')}
        ${tip(
          'info',
          'Registering also records the stocking step: the unit is Available on its shelf from the first second.',
          'Kasama na sa pag-register ang pag-stock: Available na agad ang unit sa shelf.',
        )}
      `,
    },
    {
      running: 'Demo units',
      body: () => `
        ${section('A unit’s record')}
        ${who('all')}
        ${pair(
          `<p>The unit page holds everything about one unit: its details, its label, its accessories,
           every movement since registration and every borrower. Buttons appear only when the action
           is possible: a unit out on demo cannot be moved or retired.</p>`,
          `<p>Nasa page ng unit ang lahat: detalye, label, accessories, bawat galaw at bawat humiram.
           Lalabas lang ang button kung puwede: ang naka-demo ay hindi puwedeng ilipat o i-retire.</p>`,
        )}
        ${fig('unit-detail', 'A unit’s page', 'Ang page ng isang unit')}
        ${h.table(
          ['Action', 'What it does', 'Who'],
          [
            [
              '<b>Edit</b>',
              'Corrects serial, condition or notes. The change is logged.',
              'Admin, Warehouse',
            ],
            ['<b>Move shelf</b>', 'Moves an available unit to another shelf.', 'Admin, Warehouse'],
            [
              '<b>Send to repair</b>',
              'Records a fault and takes the unit out of lending.',
              'Admin, Warehouse',
            ],
            [
              '<b>Retire</b>',
              'Ends the unit’s service for good, with a reason. History stays.',
              'Admin',
            ],
            ['<b>Print</b>', 'Prints the QR label for the unit.', 'Everyone'],
          ],
        )}
      `,
    },
    {
      running: 'Demo units',
      body: () => `
        ${section('Move several units at once')}
        ${who(['admin', 'warehouse'])}
        ${steps([
          [
            'On <b>Demo Units</b>, filter for <b>Available</b> units if you like.',
            'Sa <b>Demo Units</b>, i-filter ang <b>Available</b> kung gusto.',
          ],
          [
            'Tick the units to move. A bar appears with the count.',
            'I-check ang mga ililipat. Lalabas ang bar na may bilang.',
          ],
          [
            'Press <b>Move to shelf</b>, choose the shelf and confirm.',
            'Pindutin ang <b>Move to shelf</b>, piliin ang shelf at kumpirmahin.',
          ],
          [
            'The result lists each unit: moved, or why not (for example it is out on demo).',
            'Ipapakita kung alin ang nailipat at kung bakit hindi ang iba.',
          ],
        ])}
        ${fig('units-select', 'Acting on ticked units', 'Pagkilos sa mga naka-check na unit')}
        ${section('Send a unit to repair, or retire it')}
        ${steps([
          [
            'Open the unit and press <b>Send to repair</b> (or <b>Retire</b>).',
            'Buksan ang unit at pindutin ang <b>Send to repair</b> (o <b>Retire</b>).',
          ],
          [
            'Describe the fault (or the reason) — it is kept on the record.',
            'Ilarawan ang sira (o dahilan); itatala ito.',
          ],
          [
            'Confirm. A repaired unit comes back through <b>Inspection</b> (Chapter 6).',
            'Kumpirmahin. Ang naayos na unit ay dadaan ulit sa <b>Inspection</b>.',
          ],
        ])}
      `,
    },

    // ── 5. Borrowing ─────────────────────────────────────────────────────────────────────
    {
      running: 'Borrowing and returns',
      body: () => `
        ${chapter(5, 'Borrowing and', 'returns')}
        ${pair(
          `<p>Every borrowing is one <b>transaction</b> with a number such as BRR-2026-00651. It moves
           through the same stages every time. The queues on <b>Borrow / Return</b> follow those
           stages, so each person can see their own work.</p>`,
          `<p>Ang bawat hiram ay isang <b>transaksyon</b> na may numero tulad ng BRR-2026-00651.
           Dumadaan ito sa parehong mga hakbang. Sinusundan ng mga tab sa <b>Borrow / Return</b> ang
           mga hakbang na ito.</p>`,
        )}
        ${h.stages()}
        ${fig('borrow', 'Borrow / Return', 'Borrow / Return')}
      `,
    },
    {
      running: 'Borrowing and returns',
      body: () => `
        ${section('File a borrowing request')}
        ${who(['admin', 'manager', 'warehouse'])}
        ${steps([
          [
            'Press <b>New request</b> (on Borrow / Return or the dashboard).',
            'Pindutin ang <b>New request</b>.',
          ],
          [
            'Choose the model. The hint shows how many units are free for your dates.',
            'Piliin ang model. Makikita kung ilan ang bakante sa mga petsa.',
          ],
          [
            'Type the company. Pick it from the suggestions if it is on file; a new company asks for its type.',
            'I-type ang kumpanya. Piliin sa suggestion kung mayroon na; kung bago, piliin ang uri.',
          ],
          [
            'Enter the borrower’s name, email and contact number, the purpose and the dates.',
            'Ilagay ang pangalan, email, numero, layunin at mga petsa.',
          ],
          [
            'Press <b>Submit request</b>. It waits in <b>Requests</b> for an approver. Nothing is reserved yet.',
            'Pindutin ang <b>Submit request</b>. Maghihintay ito ng approver. Wala pang naka-reserve.',
          ],
        ])}
        ${fig('new-request', 'A new borrowing request', 'Bagong borrowing request')}
      `,
    },
    {
      running: 'Borrowing and returns',
      body: () => `
        ${section('Approve a request')}
        ${who(['admin', 'manager'])}
        ${steps([
          [
            'On <b>Borrow / Return → Requests</b>, open a request marked <b>Pending approval</b>.',
            'Sa <b>Requests</b>, buksan ang request na <b>Pending approval</b>.',
          ],
          [
            'Check the borrower, the model, the dates and the purpose.',
            'Suriin ang borrower, model, petsa at layunin.',
          ],
          [
            'Press <b>Approve</b>, tick the exact units to reserve, and press <b>Approve request</b>.',
            'Pindutin ang <b>Approve</b>, i-check ang mga unit, at pindutin ang <b>Approve request</b>.',
          ],
        ])}
        ${fig('txn-pending', 'A request waiting for approval', 'Request na naghihintay ng approval')}
      `,
    },
    {
      running: 'Borrowing and returns',
      body: () => `
        ${fig('approve', 'Choosing the units to reserve', 'Pagpili ng mga unit na ire-reserve')}
        ${tip(
          'info',
          'Only units free for the whole period, plus the turnaround days for inspection, are offered. Two approvers pressing at the same moment cannot both reserve the same unit: one of them gets a clear “already taken” message.',
          'Ang bakante lang sa buong panahon (kasama ang turnaround para sa inspection) ang lalabas. Hindi puwedeng ma-reserve ng dalawang approver ang iisang unit.',
        )}
        ${section('Reject or cancel a request')}
        ${steps([
          [
            '<b>Reject</b> (approvers): give a reason; the filer sees it. Several pending requests can be rejected at once from the list.',
            '<b>Reject</b>: maglagay ng dahilan na makikita ng nag-file. Puwedeng sabay-sabay mula sa listahan.',
          ],
          [
            '<b>Cancel request</b>: for a request no longer needed, before release. Any reserved units become free again.',
            '<b>Cancel request</b>: kapag hindi na kailangan bago ma-release. Mababakante ulit ang mga unit.',
          ],
          [
            'An approved request not collected within the pickup grace days expires on its own and frees its units.',
            'Ang approved na hindi nakuha sa takdang araw ay kusang mag-e-expire.',
          ],
        ])}
      `,
    },
    {
      running: 'Borrowing and returns',
      body: () => `
        ${section('Release units to the borrower')}
        ${who(['admin', 'warehouse'])}
        ${steps([
          [
            'Open the approved transaction (filter <b>Approved</b> or search its number).',
            'Buksan ang approved na transaksyon.',
          ],
          [
            'Take the reserved unit from its shelf and press <b>Release unit</b>.',
            'Kunin ang unit sa shelf at pindutin ang <b>Release unit</b>.',
          ],
          [
            'Scan its label. A green tick confirms it is the reserved unit; any other unit is refused.',
            'I-scan ang label. May berdeng check kapag tama; tatanggihan ang ibang unit.',
          ],
          [
            'Tick every accessory handed over and press <b>Confirm release</b>.',
            'I-check ang bawat accessory na ibinigay at pindutin ang <b>Confirm release</b>.',
          ],
        ])}
        ${fig('release', 'Releasing a unit', 'Pag-release ng unit')}
        ${tip(
          'info',
          'For a request with several units, release each one the same way; the transaction shows On Demo once all have gone out.',
          'Kung marami ang unit, isa-isang i-release; magiging On Demo ang transaksyon kapag lahat ay nailabas na.',
        )}
      `,
    },
    {
      running: 'Borrowing and returns',
      body: () => `
        ${section('Receive a return')}
        ${who(['admin', 'warehouse'])}
        ${steps([
          [
            'Open the transaction from <b>On Demo</b> (or scan the unit in the search box).',
            'Buksan ang transaksyon mula sa <b>On Demo</b>.',
          ],
          [
            'Press <b>Receive return</b> and scan the unit’s label.',
            'Pindutin ang <b>Receive return</b> at i-scan ang label.',
          ],
          [
            'Tick each accessory that came back. Leave missing ones unticked.',
            'I-check ang bawat bumalik na accessory. Huwag i-check ang kulang.',
          ],
          [
            'Add remarks and press <b>Confirm return</b>. The unit goes to <b>Returned</b> and appears in Inspection.',
            'Maglagay ng puna at pindutin ang <b>Confirm return</b>. Mapupunta ito sa <b>Returned</b>.',
          ],
        ])}
        ${fig('receive', 'Receiving a return', 'Pagtanggap ng ibinalik na unit')}
        ${tip(
          'warn',
          'A missing accessory is recorded on the transaction and raises a “Returned with missing accessory” alert so the borrower can be followed up.',
          'Ang kulang na accessory ay itatala at magkakaroon ng alerto para ma-follow up ang borrower.',
        )}
      `,
    },
    {
      running: 'Borrowing and returns',
      body: () => `
        ${section('Extend a loan')}
        ${who(['admin', 'manager'])}
        ${steps([
          [
            'Open the transaction that is <b>On Demo</b> and press <b>Extend</b>.',
            'Buksan ang transaksyon na <b>On Demo</b> at pindutin ang <b>Extend</b>.',
          ],
          [
            'Choose the new return date and give the reason.',
            'Piliin ang bagong petsa at ilagay ang dahilan.',
          ],
          [
            'Press <b>Extend loan</b>. If the unit is already booked for someone else after the old date, the extension is refused — choose an earlier date or arrange a substitute.',
            'Pindutin ang <b>Extend loan</b>. Kapag may susunod nang booking, hindi ito papayagan.',
          ],
        ])}
        ${fig('extend', 'Extending a loan', 'Pag-extend ng hiram')}
        ${section('When a loan is overdue')}
        ${pair(
          `<p>Every hour the system checks due dates in Philippine time. An overdue loan is
           marked in red on every list, counted on the dashboard, and listed under <b>Alerts →
           Overdue return</b> with the days overdue. If the unit is already booked for someone else
           from that day, the booking is flagged <b>Booking needs a substitute</b> so an approver can
           assign another unit. Contact the borrower, then receive the return or extend the loan.</p>`,
          `<p>Bawat oras, sinusuri ng sistema ang mga due date. Ang overdue ay pula sa listahan,
           bilang sa dashboard, at nasa <b>Alerts → Overdue return</b>. Kontakin ang borrower, saka
           tanggapin ang balik o i-extend.</p>`,
        )}
      `,
    },

    // ── 6. Inspection ────────────────────────────────────────────────────────────────────
    {
      running: 'Inspection and restocking',
      body: () => `
        ${chapter(6, 'Inspection and', 'restocking')}
        ${pair(
          `<p>No returned unit is lent again before it is checked. <b>Inspection</b> has three queues:
           units waiting for a check, units being checked, and units at repair. Scan a unit in the
           box above the list to find it at once, however long the queue.</p>`,
          `<p>Walang ibinalik na unit na ipapahiram ulit nang hindi nasusuri. May tatlong listahan ang
           <b>Inspection</b>: naghihintay, sinusuri, at pinapaayos. I-scan ang unit para agad itong
           makita.</p>`,
        )}
        ${fig('inspection', 'The inspection queues', 'Ang mga listahan sa Inspection')}
        ${tip(
          'info',
          '<b>Start inspection</b> acts at once (there is no confirmation): the unit moves to Under Inspection.',
          'Agad gagana ang <b>Start inspection</b>; lilipat ang unit sa Under Inspection.',
        )}
      `,
    },
    {
      running: 'Inspection and restocking',
      body: () => `
        ${section('Record the inspection result')}
        ${who(['admin', 'warehouse'])}
        ${steps([
          [
            'On <b>Under inspection</b>, press <b>Record result</b> beside the unit.',
            'Sa <b>Under inspection</b>, pindutin ang <b>Record result</b>.',
          ],
          [
            'Go through the checklist; untick anything that failed.',
            'Dumaan sa checklist; alisin ang check sa pumalya.',
          ],
          [
            'Set the condition grade and choose the outcome (table below).',
            'Itakda ang kondisyon at piliin ang resulta.',
          ],
          [
            'Choose the shelf (or give the fault / reason) and press <b>Record inspection</b>.',
            'Piliin ang shelf (o ilagay ang sira) at pindutin ang <b>Record inspection</b>.',
          ],
        ])}
        ${fig('record-result', 'Recording an inspection', 'Pagtala ng inspection')}
        ${h.table(
          ['Outcome', 'Use when', 'The unit becomes'],
          [
            ['<b>Restock</b>', 'Good; back to its usual shelf.', chips('in_stock', 'Available')],
            ['<b>Reassign</b>', 'Good; to another shelf or team.', chips('in_stock', 'Available')],
            [
              '<b>Send to repair</b>',
              'Has a fault to fix first.',
              chips('for_repair', 'For Repair'),
            ],
            ['<b>Retire</b>', 'Not worth repairing.', chips('retired', 'Retired')],
          ],
        )}
      `,
    },
    {
      running: 'Inspection and restocking',
      body: () => `
        ${section('Bring a unit back from repair')}
        ${who(['admin', 'warehouse'])}
        ${steps([
          ['Open <b>Inspection → For repair</b>.', 'Buksan ang <b>Inspection → For repair</b>.'],
          [
            'When the unit is fixed, press <b>Repair complete</b> and note what was done.',
            'Kapag naayos na, pindutin ang <b>Repair complete</b> at itala ang ginawa.',
          ],
          [
            'The unit returns to <b>Under inspection</b>; record its result as usual.',
            'Babalik ito sa <b>Under inspection</b>; itala ang resulta gaya ng dati.',
          ],
        ])}
        ${fig('repair', 'Units at repair', 'Mga unit na pinapaayos')}
        ${tip(
          'info',
          'A repaired unit is lent again only after it passes inspection, so a booking is never handed a unit that has not been checked.',
          'Ipapahiram lang ulit ang naayos na unit kapag pumasa sa inspection.',
        )}
      `,
    },

    // ── 7. Alerts and reports ────────────────────────────────────────────────────────────
    {
      running: 'Alerts and reports',
      body: () => `
        ${chapter(7, 'Alerts and', 'reports')}
        ${who('all')}
        ${pair(
          `<p><b>Alerts</b> collects everything that needs a person: overdue returns, missing
           accessories, units waiting for inspection, units ready to lend again, and bookings whose
           unit became unavailable. The bell at the top shows how many are unread.</p>`,
          `<p>Nasa <b>Alerts</b> ang lahat ng kailangang asikasuhin: overdue, kulang na accessory,
           para sa inspection, handa nang ipahiram, at booking na kailangan ng kapalit. Ang bell sa
           itaas ang bilang ng hindi pa nababasa.</p>`,
        )}
        ${fig('alerts', 'Alerts and Notifications', 'Mga alerto')}
      `,
    },
    {
      running: 'Alerts and reports',
      body: () => `
        ${section('Reports')}
        ${who('all')}
        ${pair(
          `<p>Reports are built from the movement history, so they always agree with the units’
           records. Every table can be searched, filtered, sorted and exported to CSV for Excel —
           the whole list, or only the rows you tick.</p>`,
          `<p>Galing sa history ng galaw ang mga report kaya laging tugma. Puwedeng i-search, i-filter,
           i-sort at i-export sa CSV para sa Excel ang bawat table.</p>`,
        )}
        ${fig('reports', 'Reports — overview', 'Reports — overview')}
      `,
    },
    {
      running: 'Alerts and reports',
      body: () => `
        ${fig('report-borrowers', 'Borrower history by partner', 'Kasaysayan ng paghiram bawat partner')}
        ${h.table(
          ['Report', 'Answers', 'Sa Tagalog'],
          [
            [
              '<b>Overview</b>',
              'How much moved each month; how many units in each status.',
              'Ilan ang gumalaw bawat buwan; ilan sa bawat status.',
            ],
            [
              '<b>Tracking record</b>',
              'Every borrowing with dates, borrower, units and status.',
              'Lahat ng hiram: petsa, borrower, unit, status.',
            ],
            [
              '<b>Borrower history</b>',
              'Which partners borrow most, return late or lose accessories.',
              'Sinong partner ang madalas humiram o ma-late.',
            ],
            [
              '<b>Aging and condition</b>',
              'How old units are, their condition, which sit idle longest.',
              'Edad, kondisyon, at pinakamatagal na nakatengga.',
            ],
            [
              '<b>Utilization</b>',
              'Deployed versus available, per category.',
              'Ginagamit laban sa bakante, bawat category.',
            ],
          ],
        )}
        ${tip(
          'info',
          'Exported files open cleanly in Excel. Cells that start with = + - or @ are made safe so a spreadsheet never runs them as formulas.',
          'Maayos itong mabubuksan sa Excel at ligtas sa mga formula.',
        )}
      `,
    },

    // ── 8. Administration ────────────────────────────────────────────────────────────────
    {
      running: 'Administration',
      body: () => `
        ${chapter(8, 'Administration', '')}
        ${who(['admin'])}
        ${pair(
          `<p>Administrators look after the people and the rules: who can sign in and with which
           role, the categories and shelves, the loan rules, the alerts and the labels.</p>`,
          `<p>Ang administrator ang namamahala sa mga user at patakaran: sino ang makakapasok at ang
           kanilang role, mga category at shelf, patakaran sa paghiram, alerto at label.</p>`,
        )}
        ${fig('users', 'Users', 'Mga user')}
        ${section('Deactivate someone who leaves')}
        ${steps([
          [
            'On <b>Users</b>, switch their <b>Active</b> toggle off.',
            'Sa <b>Users</b>, i-off ang <b>Active</b> toggle.',
          ],
          [
            'They are signed out everywhere at once and cannot sign in. Their records stay, with their name.',
            'Agad silang mala-logout at hindi na makakapasok. Mananatili ang kanilang mga record.',
          ],
          [
            'Accounts are never deleted, so the history always names who did what.',
            'Hindi binubura ang account para laging alam kung sino ang gumawa.',
          ],
        ])}
      `,
    },
    {
      running: 'Administration',
      body: () => `
        ${section('Add a user')}
        ${steps([
          [
            'Press <b>Add user</b> and fill in username, full name, email, job title and role.',
            'Pindutin ang <b>Add user</b> at punan ang detalye at role.',
          ],
          [
            'Press <b>Add user</b>. A one-time link appears — copy it and send it to the person.',
            'Pindutin ang <b>Add user</b>. Kopyahin ang link at ipadala sa tao.',
          ],
          [
            'They open it, choose their own password and sign in. The link works once and expires after 7 days.',
            'Bubuksan nila ito at pipili ng sariling password. Isang beses lang at 7 araw lang ang bisa.',
          ],
        ])}
        ${fig('add-user', 'Adding a user', 'Pagdagdag ng user')}
        ${tip(
          'info',
          'Lost link or forgotten password? Press the key button beside the person to make a fresh one-time link. Nobody ever needs to tell anyone their password.',
          'Nawala ang link o nakalimutan ang password? Pindutin ang key button para sa bagong link.',
        )}
      `,
    },
    {
      running: 'Administration',
      body: () => `
        ${section('Roles and permissions')}
        ${pair(
          `<p>The <b>Roles and permissions</b> tab shows the same table as Chapter 2, straight from the
           system. Changing someone’s role takes effect at once: they are signed out and sign in
           again with the new permissions. An administrator cannot demote or deactivate the last
           active administrator.</p>`,
          `<p>Ipinapakita ng <b>Roles and permissions</b> ang parehong table sa Kabanata 2. Agad na
           magkakabisa ang pagpalit ng role. Hindi puwedeng alisin ang huling aktibong admin.</p>`,
        )}
        ${fig('roles', 'Roles and permissions', 'Mga role at pahintulot')}
      `,
    },
    {
      running: 'Administration',
      body: () => `
        ${section('The activity log')}
        ${who(['admin', 'manager', 'auditor'])}
        ${pair(
          `<p>Every change — a release, an approval, a new user, a changed setting — is written to the
           activity log with the person, the time and the record. Personal details such as a
           borrower’s email are recorded as “changed”, never copied into the log.</p>`,
          `<p>Nakatala sa activity log ang bawat pagbabago kasama ang tao, oras at record. Ang personal
           na detalye tulad ng email ay hindi kinokopya sa log.</p>`,
        )}
        ${fig('activity', 'The activity log', 'Ang activity log')}
      `,
    },
    {
      running: 'Administration',
      body: () => `
        ${section('Settings')}
        ${fig('settings', 'Settings — loan rules', 'Settings — patakaran sa paghiram')}
        ${h.table(
          ['Section', 'What you set', 'Sa Tagalog'],
          [
            [
              '<b>General</b>',
              'Company and warehouse names shown on labels and reports.',
              'Pangalan ng kumpanya at bodega.',
            ],
            [
              '<b>Categories</b>',
              'Equipment types and their asset-code prefix (FW, SW, RT…).',
              'Mga uri ng kagamitan at prefix ng code.',
            ],
            ['<b>Locations</b>', 'Sites, rooms and shelves.', 'Mga site, kuwarto at shelf.'],
            [
              '<b>Loan rules</b>',
              'Default and longest loan, units per request, turnaround and pickup days.',
              'Haba ng hiram, ilang unit, turnaround at pickup.',
            ],
            [
              '<b>Notifications</b>',
              'Which alerts are raised and when reminders go out.',
              'Aling alerto at kailan ang paalala.',
            ],
            [
              '<b>Labels</b>',
              'Label size and whether the serial is printed.',
              'Laki ng label at kung kasama ang serial.',
            ],
            [
              '<b>Security</b>',
              'Session length and lock after failed sign-ins.',
              'Haba ng session at pag-lock.',
            ],
          ],
        )}
      `,
    },

    // ── 9. Role playbooks ────────────────────────────────────────────────────────────────
    {
      running: 'Role playbooks',
      body: () => `
        ${chapter(9, 'Role', 'playbooks')}
        ${pair(
          `<p>One page of routine per role: what to do at the start of the day, during it, and before
           going home. Pin yours beside your desk.</p>`,
          `<p>Isang pahina ng gawain bawat role: sa simula, sa gitna, at bago umuwi.</p>`,
        )}
        ${h.playbook('warehouse', 'Warehouse', [
          [
            'Start of day',
            [
              [
                'Open <b>Dashboard</b>: check Returns Due Within 7 Days and the alerts.',
                'Tingnan ang dashboard: mga ibabalik sa loob ng 7 araw at alerto.',
              ],
              [
                'Open <b>Borrow / Return → Requests</b>, filter <b>Approved</b>: prepare today’s pickups.',
                'Ihanda ang mga kukunin ngayon (Approved).',
              ],
            ],
          ],
          [
            'During the day',
            [
              [
                'Register new stock and print labels (Ch. 4).',
                'Mag-register at mag-print ng label.',
              ],
              [
                'Release reserved units by scanning (Ch. 5).',
                'Mag-release sa pamamagitan ng pag-scan.',
              ],
              [
                'Receive returns by scanning; untick missing accessories (Ch. 5).',
                'Tumanggap ng balik; huwag i-check ang kulang.',
              ],
              [
                'Inspect returned units and restock or send to repair (Ch. 6).',
                'Mag-inspect at mag-restock o ipa-repair.',
              ],
            ],
          ],
          [
            'Before going home',
            [
              [
                '<b>Inspection</b> → Awaiting inspection should be as short as possible.',
                'Paikliin ang listahan ng naghihintay ng inspection.',
              ],
              [
                'No unit should be on a desk: every unit is on its recorded shelf.',
                'Dapat nasa tamang shelf ang lahat ng unit.',
              ],
            ],
          ],
        ])}
      `,
    },
    {
      running: 'Role playbooks',
      body: () => `
        ${h.playbook('manager', 'Manager / approver', [
          [
            'Every morning',
            [
              [
                '<b>Borrow / Return → Requests</b>: approve or reject pending requests (Ch. 5).',
                'I-approve o i-reject ang mga pending.',
              ],
              [
                '<b>Alerts → Overdue return</b>: contact borrowers; extend where agreed.',
                'Kontakin ang overdue; i-extend kung napagkasunduan.',
              ],
              [
                '<b>Alerts → Booking needs a substitute</b>: assign another unit in time.',
                'Pumili ng kapalit na unit para sa apektadong booking.',
              ],
            ],
          ],
          [
            'Every week',
            [
              [
                '<b>Reports → Borrower history</b>: which partners are late or lose accessories.',
                'Tingnan ang mga partner na madalas ma-late.',
              ],
              [
                '<b>Reports → Utilization</b>: categories that sit idle or are always out.',
                'Tingnan ang mga category na nakatengga o laging hiram.',
              ],
            ],
          ],
        ])}
        ${h.playbook('admin', 'Administrator', [
          [
            'When people join, move or leave',
            [
              [
                'Add users with the right role; send the one-time link (Ch. 8).',
                'Magdagdag ng user at ipadala ang link.',
              ],
              [
                'Change roles as jobs change; deactivate leavers the same day.',
                'Palitan ang role; i-deactivate agad ang umalis.',
              ],
            ],
          ],
          [
            'When the warehouse changes',
            [
              [
                'Add categories, models and shelves in <b>Settings</b> before stock arrives.',
                'Magdagdag ng category, model at shelf bago dumating ang stock.',
              ],
              [
                'Adjust loan rules and alert timing with the managers.',
                'Ayusin ang patakaran kasama ang mga manager.',
              ],
            ],
          ],
        ])}
        ${h.playbook('auditor', 'Auditor', [
          [
            'Any time',
            [
              [
                '<b>Users → Activity log</b>: who did what, when, to which record.',
                'Tingnan kung sino ang gumawa ng ano at kailan.',
              ],
              [
                '<b>Reports</b>: export what you need for the audit file.',
                'I-export ang kailangan para sa audit.',
              ],
              [
                'Open any unit: its movement history explains its current status.',
                'Buksan ang unit: ipinapaliwanag ng history ang status nito.',
              ],
            ],
          ],
        ])}
      `,
    },

    // ── 10. End to end ───────────────────────────────────────────────────────────────────
    {
      running: 'End to end',
      body: () => `
        ${chapter(10, 'One loan,', 'end to end')}
        ${pair(
          `<p>A partner, Metro Cloud Partners, asks to borrow a Palo Alto firewall for a two-week
           proof of concept at their client. This is the whole journey, with who does each step
           and which screen they use.</p>`,
          `<p>Humiram ang Metro Cloud Partners ng Palo Alto firewall para sa dalawang linggong proof of
           concept. Ito ang buong proseso: sino ang gagawa at saang screen.</p>`,
        )}
        ${h.journey([
          [
            'Day 0',
            'warehouse',
            'File the request',
            'Borrow / Return → New request',
            'Pending approval',
            'Mag-file ng request.',
          ],
          [
            'Day 0',
            'manager',
            'Approve and assign NTP-FW-00031',
            'Transaction → Approve',
            'Approved · unit Reserved',
            'I-approve at piliin ang unit.',
          ],
          [
            'Day 2',
            'warehouse',
            'Release: scan, tick accessories',
            'Transaction → Release unit',
            'On Demo',
            'I-release: i-scan at i-check ang accessories.',
          ],
          [
            'Day 12',
            'manager',
            'Client wants one more week: extend',
            'Transaction → Extend',
            'On Demo, new due date',
            'I-extend nang isang linggo.',
          ],
          [
            'Day 19',
            'warehouse',
            'Receive return; power adapter missing',
            'Transaction → Receive return',
            'Returned · alert raised',
            'Tanggapin; kulang ang power adapter.',
          ],
          [
            'Day 19',
            'manager',
            'Follow up the missing adapter',
            'Alerts → Missing accessory',
            'Borrower contacted',
            'I-follow up ang kulang na adapter.',
          ],
          [
            'Day 20',
            'warehouse',
            'Start inspection, record result: Restock',
            'Inspection',
            'Available · transaction Closed',
            'Suriin at i-restock.',
          ],
          [
            'Any time',
            'auditor',
            'Review the full trail',
            'Users → Activity log / unit history',
            'Every step on record',
            'Suriin ang buong record.',
          ],
        ])}
        ${tip(
          'info',
          'Try it yourself on the demo: sign in as marco and tina in two browsers and follow the table from the top.',
          'Subukan ito: mag-login bilang marco at tina sa dalawang browser at sundan ang table.',
        )}
      `,
    },

    // ── 11. FAQ and glossary ─────────────────────────────────────────────────────────────
    {
      running: 'Questions and answers',
      body: () => `
        ${chapter(11, 'Questions and', 'answers')}
        ${h.faq([
          [
            'I cannot see a button this handbook mentions.',
            'Your role does not include that action, or the unit is not in a state that allows it (for example a unit on demo cannot be moved). Check your profile’s “What you can do”.',
            'Wala ito sa iyong role, o hindi puwede sa kasalukuyang status ng unit.',
          ],
          [
            'The scan says the label does not match.',
            'You are holding a different unit from the one reserved. Find the unit with the code shown under “Expected unit”.',
            'Iba ang hawak mong unit. Hanapin ang unit na nasa “Expected unit”.',
          ],
          [
            'Approving says a unit is already booked.',
            'Someone reserved it for overlapping dates a moment before you. Choose another unit from the list.',
            'Na-reserve na ito ng iba sa parehong petsa. Pumili ng ibang unit.',
          ],
          [
            'I pressed the button twice by mistake.',
            'Nothing happens twice. Every button locks while it works, and the system recognises a repeated press as the same action.',
            'Walang madodoble. Naka-lock ang button habang gumagana.',
          ],
          [
            'I was signed out.',
            'Sessions end after a period without activity, after a password change, or when an administrator changes your role. Sign in again.',
            'Natatapos ang session kapag matagal na walang ginagawa o may pagbabago sa account.',
          ],
          [
            'A borrower lost an accessory.',
            'Leave it unticked at return. It is recorded on the transaction and stays under Alerts for 30 days so it can be followed up.',
            'Huwag i-check sa pagbalik. Itatala ito at mananatili sa Alerts nang 30 araw para ma-follow up.',
          ],
          [
            'Can I delete a wrong unit or transaction?',
            'No — history is never deleted. Edit wrong details, cancel a wrong request, or retire a wrongly registered unit with a reason.',
            'Hindi binubura ang history. I-edit, i-cancel, o i-retire na may dahilan.',
          ],
          [
            'Is my data backed up?',
            'Regular encrypted backups and security updates are part of the hosting service provided by Prince IT Solutions. Ask us for the current schedule.',
            'Kasama sa hosting service ang regular na encrypted backup at security update.',
          ],
        ])}
      `,
    },
    {
      running: 'Glossary',
      body: () => `
        ${section('Glossary')}
        ${h.glossary([
          [
            'Asset code',
            'The unit’s permanent number, e.g. NTP-FW-00031. It is what the label and scanner use.',
            'Permanenteng numero ng unit na nasa label.',
          ],
          [
            'Accessory',
            'A part that travels with a unit: adapter, cables, rack ears.',
            'Kasamang piyesa: adapter, cable, atbp.',
          ],
          [
            'Borrower',
            'The person responsible for borrowed units, at a partner company.',
            'Taong mananagot sa hiniram.',
          ],
          [
            'Condition grade',
            'A like new · B light wear · C heavy wear · D damaged.',
            'Antas ng kondisyon ng unit.',
          ],
          [
            'Movement',
            'One recorded step in a unit’s life: registered, released, returned, restocked…',
            'Isang naitalang galaw ng unit.',
          ],
          [
            'Partner',
            'A company that borrows units: partner, reseller, internal team or branch.',
            'Kumpanyang humihiram.',
          ],
          [
            'Reservation',
            'A unit promised to an approved request for its dates.',
            'Unit na naka-reserve sa isang request.',
          ],
          [
            'Turnaround days',
            'Days kept free after a loan so the unit can be inspected before its next booking.',
            'Araw para sa inspection bago ang susunod na booking.',
          ],
          [
            'Pickup grace',
            'Days an approved request waits for pickup before it expires.',
            'Araw na hinihintay bago mag-expire ang approved.',
          ],
          [
            'Transaction',
            'One borrowing, from request to closing, numbered BRR-YYYY-NNNNN.',
            'Isang paghiram mula request hanggang matapos.',
          ],
        ])}
        ${section('Support')}
        ${pair(
          `<p>For help with the system, contact <b>Prince IT Solutions OPC</b> at
           <b>princeitsol26@gmail.com</b> or <b>0906 913 3841</b>. Please include the asset code or
           transaction number and a screenshot.</p>`,
          `<p>Para sa tulong, kontakin ang <b>Prince IT Solutions OPC</b> sa
           <b>princeitsol26@gmail.com</b> o <b>0906 913 3841</b>. Isama ang asset code o transaction
           number at screenshot.</p>`,
        )}
      `,
    },
  ];
}
