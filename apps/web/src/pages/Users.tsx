import { Check, Pencil, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { Select, SkPage } from '../components/controls.js';
import { usePageReady } from '../lib/hooks.js';
import { DataTable, runBatch, type Column } from '../components/DataTable.js';
import { ActionDialog } from '../components/dialogs.js';
import {
  Avatar,
  Button,
  Field,
  PageHead,
  Switch,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import {
  ACTION_LABELS,
  can,
  ROLE_LABELS,
  ROLE_SUMMARIES,
  type Action,
} from '../data/permissions.js';
import { WmsError } from '../data/store.js';
import type { AuditEntry, Role, User } from '../data/types.js';
import { formatDateTime, formatRelative } from '../lib/dates.js';

type TabId = 'users' | 'roles' | 'activity';

const TABS: TabItem<TabId>[] = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles and permissions' },
  { id: 'activity', label: 'Activity log' },
];

const ROLES: Role[] = ['admin', 'manager', 'warehouse', 'auditor'];
const PAGE_SIZE = 15;

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export function Users() {
  const ready = usePageReady();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'users';
  const { can: allowed } = useAuth();
  const [editing, setEditing] = useState<User | 'new' | null>(null);

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
      {!ready ? (
        <SkPage kind="table" />
      ) : (
        <div className="stack">
          <Tabs
            tabs={TABS}
            value={tab}
            onChange={(next) => setParams({ tab: next }, { replace: true })}
            label="Users"
          />
          {tab === 'users' && <UserTable onEdit={setEditing} />}
          {tab === 'roles' && <RoleMatrix />}
          {tab === 'activity' && <ActivityLog />}
        </div>
      )}
      {editing && (
        <UserDialog user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function UserTable({ onEdit }: { onEdit: (user: User) => void }) {
  const { users } = useWmsState();
  const store = useStore();
  const me = useCurrentUser();
  const { can: allowed } = useAuth();
  const toast = useToast();
  const now = new Date();
  const manage = allowed('users.manage');

  const toggle = (user: User, active: boolean) => {
    try {
      store.setUserActive(me.username, user.username, active);
      toast(`${user.name} ${active ? 'reactivated' : 'deactivated'}`);
    } catch (error) {
      if (!(error instanceof WmsError)) throw error;
      toast(error.message, 'error');
    }
  };

  /** Sets the selected accounts on or off, skipping those already there. */
  const setActive = (picked: User[], active: boolean, clear: () => void) => {
    const result = runBatch(
      picked.filter((user) => user.active !== active),
      (user) => store.setUserActive(me.username, user.username, active),
    );
    clear();
    if (result.refused) toast(result.refused, 'error');
    if (result.done > 0)
      toast(
        `${result.done} user${result.done === 1 ? '' : 's'} ${active ? 'reactivated' : 'deactivated'}`,
      );
  };

  const columns: Column<User>[] = [
    {
      id: 'name',
      header: 'User',
      width: '1.6fr',
      skeleton: 'thumb',
      sort: (user) => user.name,
      cell: (user) => (
        <span className="unit-cell">
          <Avatar name={user.name} />
          <span>
            <span className="cell-main">{user.name}</span>
            <span className="cell-sub" style={{ display: 'block' }}>
              {user.title || user.email}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'username',
      header: 'Username',
      className: 'mono',
      skeleton: 90,
      sort: (user) => user.username,
      cell: (user) => user.username,
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
      sort: (user) => user.lastActiveAt ?? '',
      cell: (user) => (user.lastActiveAt ? formatRelative(user.lastActiveAt, now) : 'Never'),
    },
    {
      id: 'active',
      header: 'Active',
      width: '0.7fr',
      skeleton: 40,
      sort: (user) => (user.active ? 0 : 1),
      cell: (user) => (
        <Switch
          checked={user.active}
          disabled={!manage}
          label={`${user.name} can sign in`}
          onChange={(next) => toggle(user, next)}
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
            width: '0.7fr',
            skeleton: 60,
            cell: (user: User) => (
              <Button size="sm" icon={Pencil} onClick={() => onEdit(user)}>
                Edit
              </Button>
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
        rowKey={(user) => user.username}
        rowLabel={(user) => user.name}
        noun="users"
        syncUrl
        search={{
          placeholder: 'Search by name, username, or email…',
          text: (user) => `${user.name} ${user.username} ${user.email} ${user.title}`,
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
            allLabel: 'Active and inactive',
            options: [
              { value: 'active', label: 'Active only' },
              { value: 'inactive', label: 'Inactive only' },
            ],
            test: (user, value) => user.active === (value === 'active'),
          },
        ]}
        batchActions={
          manage
            ? [
                {
                  label: 'Reactivate',
                  icon: UserCheck,
                  run: (picked, clear) => setActive(picked, true, clear),
                },
                {
                  label: 'Deactivate',
                  icon: UserX,
                  danger: true,
                  run: (picked, clear) => setActive(picked, false, clear),
                },
              ]
            : []
        }
        exportCsv={{
          name: 'users',
          header: ['Name', 'Username', 'Email', 'Job title', 'Role', 'Active', 'Last active'],
          row: (user) => [
            user.name,
            user.username,
            user.email,
            user.title,
            ROLE_LABELS[user.role],
            user.active ? 'Yes' : 'No',
            user.lastActiveAt ?? '',
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

function ActivityLog() {
  const { audit, users } = useWmsState();
  const nameOf = useMemo(() => new Map(users.map((user) => [user.username, user.name])), [users]);
  const rows = useMemo(() => [...audit].reverse(), [audit]);

  const columns: Column<AuditEntry>[] = [
    {
      id: 'when',
      header: 'When',
      className: 'num',
      skeleton: 120,
      sort: (entry) => entry.at,
      cell: (entry) => formatDateTime(entry.at),
    },
    {
      id: 'who',
      header: 'Who',
      skeleton: 110,
      sort: (entry) => nameOf.get(entry.actor) ?? entry.actor,
      cell: (entry) => nameOf.get(entry.actor) ?? entry.actor,
    },
    {
      id: 'action',
      header: 'Action',
      className: 'mono',
      skeleton: 120,
      sort: (entry) => entry.action,
      cell: (entry) => entry.action,
    },
    {
      id: 'record',
      header: 'Record',
      className: 'mono',
      skeleton: 110,
      sort: (entry) => entry.target,
      cell: (entry) => entry.target,
    },
    {
      id: 'detail',
      header: 'Detail',
      width: '1.6fr',
      skeleton: 180,
      cell: (entry) => entry.detail || '—',
    },
  ];

  return (
    <div className="card table-card">
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(entry) => String(entry.id)}
        noun="entries"
        pageSize={PAGE_SIZE}
        syncUrl
        search={{
          placeholder: 'Search by person, action, or asset code…',
          text: (entry) =>
            `${entry.actor} ${nameOf.get(entry.actor) ?? ''} ${entry.action} ${entry.target} ${entry.detail}`,
        }}
        filters={[
          {
            id: 'who',
            label: 'Person',
            allLabel: 'Everyone',
            options: users.map((user) => ({ value: user.username, label: user.name })),
            test: (entry, value) => entry.actor === value,
          },
          {
            id: 'kind',
            label: 'Record type',
            allLabel: 'All records',
            options: [...new Set(audit.map((entry) => entry.action.split('.')[0] ?? ''))]
              .filter(Boolean)
              .sort()
              .map((kind) => ({ value: kind, label: kind[0]?.toUpperCase() + kind.slice(1) })),
            test: (entry, value) => entry.action.startsWith(`${value}.`),
          },
        ]}
        exportCsv={{
          name: 'activity-log',
          header: ['When', 'Who', 'Action', 'Record', 'Detail'],
          row: (entry) => [
            entry.at,
            nameOf.get(entry.actor) ?? entry.actor,
            entry.action,
            entry.target,
            entry.detail,
          ],
        }}
      />
    </div>
  );
}

function UserDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const store = useStore();
  const me = useCurrentUser();
  const toast = useToast();
  const [username, setUsername] = useState(user?.username ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'warehouse');

  return (
    <ActionDialog
      title={user ? `Edit ${user.name}` : 'Add a user'}
      description={
        user ? undefined : 'Demo build: the new account signs in with the shared demo password.'
      }
      confirmLabel={user ? 'Save changes' : 'Add user'}
      width={560}
      onClose={onClose}
      onConfirm={() => {
        if (user) {
          store.updateUser(me.username, user.username, { name, email, title, role });
          toast(`${name} updated`);
        } else {
          store.addUser(me.username, { username, name, email, title, role });
          toast(`${name} added`);
        }
      }}
    >
      <div className="form-grid cols-2">
        <Field label="Username" hint={user ? 'A username cannot be changed.' : undefined}>
          <input
            className="input mono"
            value={username}
            disabled={user !== null}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>
        <Field label="Full name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Email">
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
        <Field label="Role" hint={ROLE_SUMMARIES[role]} className="span-2">
          <Select
            value={role}
            onChange={(value) => setRole(value as Role)}
            options={ROLES.map((item) => ({ value: item, label: ROLE_LABELS[item] }))}
          />
        </Field>
      </div>
    </ActionDialog>
  );
}
