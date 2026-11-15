import type { AuditEntry, StaffRole, User } from '@wms/contracts';
import { Check, Copy, Mail, Pencil, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import {
  invalidate,
  useBackend,
  useCursorPaging,
  useIntent,
  useResource,
} from '../backend/context.js';
import { Select, SkPage } from '../components/controls.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { ActionDialog } from '../components/dialogs.js';
import {
  Avatar,
  Button,
  Dialog,
  Field,
  FormError,
  PageHead,
  Switch,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui.js';
import {
  ACTION_LABELS,
  can,
  ROLE_LABELS,
  ROLE_SUMMARIES,
  type Action,
} from '../data/permissions.js';
import { WmsError } from '../data/store.js';
import { describeEntry } from '../lib/audit.js';
import { formatDateTime, formatRelative } from '../lib/dates.js';

type TabId = 'users' | 'roles' | 'activity';

const TABS: TabItem<TabId>[] = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles and permissions' },
  { id: 'activity', label: 'Activity log' },
];

const ROLES: StaffRole[] = ['admin', 'manager', 'warehouse', 'auditor'];
const LOG_PAGE_SIZE = 15;

const STATUS_TONES: Record<User['status'], string> = {
  active: 'in_stock',
  invited: 'for_repair',
  deactivated: 'retired',
};
const STATUS_TEXT: Record<User['status'], string> = {
  active: 'Active',
  invited: 'Invited',
  deactivated: 'Deactivated',
};

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

/** The link to hand over, when the backend returned one (the demo has no mail server). */
interface InviteNotice {
  name: string;
  email: string;
  link: string | null;
}

export function Users() {
  const backend = useBackend();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'users';
  const { can: allowed } = useAuth();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [invite, setInvite] = useState<InviteNotice | null>(null);
  const people = useResource('users', () => backend.users());

  return (
    <div className="page">
      <PageHead
        title="Users"
        lead="Who can sign in, what each role may do, and everything that was done"
        actions={
          allowed('users.manage') &&
          tab === 'users' && (
            <Button variant="primary" icon={UserPlus} onClick={() => setEditing('new')}>
              Add user
            </Button>
          )
        }
      />
      <div className="stack">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={(next) => setParams({ tab: next }, { replace: true })}
          label="Users"
        />
        {tab === 'users' &&
          (people.loading ? (
            <SkPage kind="table" />
          ) : people.error ? (
            <FormError message={people.error} />
          ) : (
            <UserTable users={people.data ?? []} onEdit={setEditing} onInvited={setInvite} />
          ))}
        {tab === 'roles' && <RoleMatrix />}
        {tab === 'activity' && <ActivityLog people={people.data ?? []} />}
      </div>
      {editing && (
        <UserDialog
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onInvited={setInvite}
        />
      )}
      {invite && <InviteDialog notice={invite} onClose={() => setInvite(null)} />}
    </div>
  );
}

function UserTable({
  users,
  onEdit,
  onInvited,
}: {
  users: User[];
  onEdit: (user: User) => void;
  onInvited: (notice: InviteNotice) => void;
}) {
  const backend = useBackend();
  const me = useCurrentUser();
  const { can: allowed } = useAuth();
  const toast = useToast();
  const intent = useIntent();
  const now = new Date();
  const manage = allowed('users.manage');

  const toggle = async (user: User, active: boolean) => {
    try {
      await backend.setUserActive(intent.key, user.id, active);
      intent.renew();
      invalidate('users');
      toast(`${user.fullName} ${active ? 'reactivated' : 'deactivated'}`);
    } catch (error) {
      if (!(error instanceof WmsError)) throw error;
      toast(error.message, 'error');
    }
  };

  /** Sets the selected accounts on or off, one request each, skipping those already there. */
  const setActive = async (picked: User[], active: boolean, clear: () => void) => {
    let done = 0;
    let refused = '';
    for (const user of picked.filter((item) => (item.status === 'active') !== active)) {
      try {
        // One intent per person: each is its own change, safe to repeat on its own.
        await backend.setUserActive(`${intent.key}-${user.id}`, user.id, active);
        done += 1;
      } catch (error) {
        if (!(error instanceof WmsError)) throw error;
        refused ||= error.message;
      }
    }
    intent.renew();
    clear();
    invalidate('users');
    if (refused) toast(refused, 'error');
    if (done > 0)
      toast(`${done} user${done === 1 ? '' : 's'} ${active ? 'reactivated' : 'deactivated'}`);
  };

  const resend = async (user: User) => {
    try {
      const result = await backend.resendInvite(intent.key, user.id);
      intent.renew();
      onInvited({ name: user.fullName, email: user.email, link: result.link });
    } catch (error) {
      if (!(error instanceof WmsError)) throw error;
      toast(error.message, 'error');
    }
  };

  const columns: Column<User>[] = [
    {
      id: 'name',
      header: 'User',
      width: '1.6fr',
      skeleton: 'thumb',
      sort: (user) => user.fullName,
      cell: (user) => (
        <span className="unit-cell">
          <Avatar name={user.fullName} />
          <span>
            <span className="cell-main">{user.fullName}</span>
            <span className="cell-sub" style={{ display: 'block' }}>
              {user.jobTitle ?? ''}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      width: '1.4fr',
      skeleton: 140,
      sort: (user) => user.email,
      cell: (user) => user.email,
    },
    {
      id: 'role',
      header: 'Role',
      skeleton: 'chip',
      sort: (user) => ROLE_LABELS[user.role],
      cell: (user) => <span className="chip plain">{ROLE_LABELS[user.role]}</span>,
    },
    {
      id: 'seen',
      header: 'Last active',
      skeleton: 90,
      // Newest first reads naturally, so the value sorts by time, not by the label.
      sort: (user) => user.lastLoginAt ?? '',
      cell: (user) => (user.lastLoginAt ? formatRelative(user.lastLoginAt, now) : 'Never'),
    },
    {
      id: 'active',
      header: 'Active',
      width: '0.8fr',
      skeleton: 40,
      sort: (user) => user.status,
      cell: (user) =>
        user.status === 'invited' ? (
          <span className="chip" data-tone={STATUS_TONES.invited}>
            Invited
          </span>
        ) : (
          <Switch
            checked={user.status === 'active'}
            disabled={!manage || user.id === me.id}
            label={`${user.fullName} can sign in`}
            onChange={(next) => void toggle(user, next)}
          />
        ),
    },
    ...(manage
      ? [
          {
            id: 'edit',
            header: 'Edit',
            label: '',
            align: 'right' as const,
            width: '1fr',
            skeleton: 60,
            cell: (user: User) => (
              <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                {user.status === 'invited' && (
                  <Button size="sm" icon={Mail} onClick={() => void resend(user)}>
                    Resend invite
                  </Button>
                )}
                <Button size="sm" icon={Pencil} onClick={() => onEdit(user)}>
                  Edit
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="card table-card">
      <DataTable
        rows={users}
        columns={columns}
        rowKey={(user) => user.id}
        rowLabel={(user) => user.fullName}
        noun="users"
        syncUrl
        search={{
          placeholder: 'Search by name, email, or job title…',
          text: (user) => `${user.fullName} ${user.email} ${user.jobTitle ?? ''}`,
        }}
        filters={[
          {
            id: 'role',
            label: 'Role',
            allLabel: 'All roles',
            options: ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
            test: (user, value) => user.role === value,
          },
          {
            id: 'access',
            label: 'Access',
            allLabel: 'Every status',
            options: (Object.keys(STATUS_TEXT) as User['status'][]).map((status) => ({
              value: status,
              label: `${STATUS_TEXT[status]} only`,
            })),
            test: (user, value) => user.status === value,
          },
        ]}
        batchActions={
          manage
            ? [
                {
                  label: 'Reactivate',
                  icon: UserCheck,
                  run: (picked, clear) => void setActive(picked, true, clear),
                },
                {
                  label: 'Deactivate',
                  icon: UserX,
                  danger: true,
                  run: (picked, clear) => void setActive(picked, false, clear),
                },
              ]
            : []
        }
        exportCsv={{
          name: 'users',
          header: ['Name', 'Email', 'Job title', 'Role', 'Status', 'Last active'],
          row: (user) => [
            user.fullName,
            user.email,
            user.jobTitle ?? '',
            ROLE_LABELS[user.role],
            STATUS_TEXT[user.status],
            user.lastLoginAt ?? '',
          ],
        }}
      />
    </div>
  );
}

function RoleMatrix() {
  const actions = Object.keys(ACTION_LABELS) as Action[];
  return (
    <div className="card table-card">
      <table className="table matrix">
        <thead>
          <tr>
            <th>Permission</th>
            {ROLES.map((role) => (
              <th key={role} title={ROLE_SUMMARIES[role]}>
                {ROLE_LABELS[role]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action}>
              <td data-label="Permission">
                <span className="cell-main">{ACTION_LABELS[action]}</span>
              </td>
              {ROLES.map((role) => (
                <td key={role} data-label={ROLE_LABELS[role]}>
                  {can(role, action) ? (
                    <>
                      <Check aria-hidden="true" />
                      <span className="sr-only">Allowed</span>
                    </>
                  ) : (
                    <span className="no" aria-label="Not allowed">
                      —
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The activity log, newest first, paged by the server. It cannot be edited by anyone. */
function ActivityLog({ people }: { people: User[] }) {
  const backend = useBackend();
  const [params, setParams] = useSearchParams();
  const actorId = params.get('who') ?? undefined;
  const action = params.get('kind') ?? undefined;
  const q = params.get('q') ?? undefined;
  const filterKey = JSON.stringify({ actorId, action, q });
  const paging = useCursorPaging(
    filterKey,
    Math.max(1, Number(params.get('page')) || 1),
    (next) => {
      const updated = new URLSearchParams(params);
      if (next <= 1) updated.delete('page');
      else updated.set('page', String(next));
      setParams(updated, { replace: true });
    },
  );
  const log = useResource(`audit:${filterKey}:${paging.cursor ?? ''}`, () =>
    backend.audit({ actorId, action, q, cursor: paging.cursor, limit: LOG_PAGE_SIZE }),
  );

  const columns: Column<AuditEntry>[] = [
    {
      id: 'when',
      header: 'When',
      className: 'num',
      skeleton: 120,
      cell: (entry) => formatDateTime(entry.occurredAt),
    },
    { id: 'who', header: 'Who', skeleton: 110, cell: (entry) => entry.actorName ?? 'System' },
    {
      id: 'action',
      header: 'Action',
      className: 'mono',
      skeleton: 120,
      cell: (entry) => entry.action,
    },
    {
      id: 'record',
      header: 'Record',
      className: 'mono',
      skeleton: 110,
      cell: (entry) => describeEntry(entry).record,
    },
    {
      id: 'detail',
      header: 'Detail',
      width: '1.6fr',
      skeleton: 180,
      cell: (entry) => describeEntry(entry).detail || '—',
    },
  ];

  return (
    <div className="card table-card">
      <DataTable
        rows={log.data?.items ?? []}
        columns={columns}
        rowKey={(entry) => entry.id}
        noun="entries"
        loading={log.loading}
        pageSize={LOG_PAGE_SIZE}
        syncUrl
        remote={{
          // The log is append-only and can be long; the server does not count it, so the
          // footer counts what has been paged through.
          total: (paging.page - 1) * LOG_PAGE_SIZE + (log.data?.items.length ?? 0),
          page: paging.page,
          hasNext: Boolean(log.data?.nextCursor),
          onPage: (next) => paging.goTo(next, log.data?.nextCursor),
          refreshing: log.refreshing,
        }}
        search={{
          placeholder: 'Search by person, action, or asset code…',
          text: (entry) => entry.action,
        }}
        filters={[
          {
            id: 'who',
            label: 'Person',
            allLabel: 'Everyone',
            options: people.map((person) => ({ value: person.id, label: person.fullName })),
            test: () => true,
          },
          {
            id: 'kind',
            label: 'Record type',
            allLabel: 'All records',
            options: [
              { value: 'asset', label: 'Units' },
              { value: 'unit', label: 'Units (demo)' },
              { value: 'loan', label: 'Loans' },
              { value: 'user', label: 'People' },
              { value: 'partner', label: 'Partner companies' },
              { value: 'auth', label: 'Sign-ins' },
              { value: 'settings', label: 'Settings' },
            ],
            test: () => true,
          },
        ]}
        exportCsv={{
          name: 'activity-log',
          header: ['When', 'Who', 'Action', 'Record', 'Detail'],
          row: (entry) => {
            const { record, detail } = describeEntry(entry);
            return [entry.occurredAt, entry.actorName ?? 'System', entry.action, record, detail];
          },
        }}
      />
    </div>
  );
}

function UserDialog({
  user,
  onClose,
  onInvited,
}: {
  user: User | null;
  onClose: () => void;
  onInvited: (notice: InviteNotice) => void;
}) {
  const backend = useBackend();
  const toast = useToast();
  const intent = useIntent();
  const [name, setName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [title, setTitle] = useState(user?.jobTitle ?? '');
  const [role, setRole] = useState<StaffRole>(user?.role ?? 'warehouse');

  return (
    <ActionDialog
      title={user ? `Edit ${user.fullName}` : 'Add a user'}
      description={
        user
          ? undefined
          : 'They get a link to set their own password. The link works once, for 72 hours.'
      }
      confirmLabel={user ? 'Save changes' : 'Send invitation'}
      width={560}
      onClose={onClose}
      onConfirmAsync={async () => {
        if (user) {
          await backend.editUser(intent.key, user.id, {
            fullName: name,
            email,
            jobTitle: title.trim() || null,
            role,
          });
          toast(`${name.trim()} updated`);
        } else {
          const result = await backend.inviteUser(intent.key, {
            email,
            fullName: name,
            role,
            jobTitle: title.trim() || null,
            phone: null,
          });
          onInvited({ name: result.user.fullName, email: result.user.email, link: result.link });
        }
        invalidate('users');
      }}
    >
      <div className="form-grid cols-2">
        <Field label="Full name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Email" hint="They sign in with this address.">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Job title">
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="Role" hint={ROLE_SUMMARIES[role]}>
          <Select
            value={role}
            onChange={(value) => setRole(value as StaffRole)}
            options={ROLES.map((item) => ({ value: item, label: ROLE_LABELS[item] }))}
          />
        </Field>
      </div>
    </ActionDialog>
  );
}

/**
 * Confirms an invitation. With the API the link is emailed and never shown here; the demo has
 * no mail server, so it shows the link once for the administrator to hand over.
 */
function InviteDialog({ notice, onClose }: { notice: InviteNotice; onClose: () => void }) {
  const toast = useToast();
  const link = notice.link ? `${window.location.origin}${notice.link}` : null;
  const copy = () => {
    if (!link) return;
    void navigator.clipboard
      .writeText(link)
      .then(() => toast('Invitation link copied'))
      .catch(() => toast('Copy did not work; select the link and copy it by hand', 'error'));
  };
  return (
    <Dialog
      title={`Invitation for ${notice.name}`}
      description={
        link
          ? 'Send this link to them. It works once and expires in 72 hours.'
          : `An email with a sign-up link is on its way to ${notice.email}. It works once and expires in 72 hours.`
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Done</Button>
          {link && (
            <Button variant="primary" icon={Copy} onClick={copy}>
              Copy link
            </Button>
          )}
        </>
      }
    >
      {link ? (
        <>
          <div className="invite-link">
            <input
              className="input mono"
              readOnly
              value={link}
              aria-label="Invitation link"
              onFocus={(event) => event.target.select()}
            />
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Demo build: no email is sent, so copy the link. It also appears in the demo mailbox on
            the Forgot password screen.
          </p>
        </>
      ) : (
        <p className="banner info">
          <Mail aria-hidden="true" />
          The person appears as Invited until they set their password.
        </p>
      )}
    </Dialog>
  );
}
