import { Check, Pencil, Search, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { Select, SkPage } from '../components/controls.js';
import { usePageReady } from '../lib/hooks.js';
import { ActionDialog } from '../components/dialogs.js';
import {
  Avatar,
  Button,
  Empty,
  Field,
  PageHead,
  Switch,
  TableFoot,
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
import type { Role, User } from '../data/types.js';
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

  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Username</th>
            <th>Role</th>
            <th>Last active</th>
            <th>Active</th>
            {manage && <th className="right">Edit</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.username}>
              <td data-label="User">
                <span className="unit-cell">
                  <Avatar name={user.name} />
                  <span>
                    <span className="cell-main">{user.name}</span>
                    <span className="cell-sub" style={{ display: 'block' }}>
                      {user.title || user.email}
                    </span>
                  </span>
                </span>
              </td>
              <td data-label="Username" className="mono">
                {user.username}
              </td>
              <td data-label="Role">
                <span className="chip plain">{ROLE_LABELS[user.role]}</span>
              </td>
              <td data-label="Last active">
                {user.lastActiveAt ? formatRelative(user.lastActiveAt, now) : 'Never'}
              </td>
              <td data-label="Active">
                <Switch
                  checked={user.active}
                  disabled={!manage}
                  label={`${user.name} can sign in`}
                  onChange={(next) => toggle(user, next)}
                />
              </td>
              {manage && (
                <td data-label="" className="right">
                  <Button size="sm" icon={Pencil} onClick={() => onEdit(user)}>
                    Edit
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const nameOf = useMemo(() => new Map(users.map((user) => [user.username, user.name])), [users]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const newestFirst = [...audit].reverse();
    if (!needle) return newestFirst;
    return newestFirst.filter((entry) =>
      `${entry.actor} ${nameOf.get(entry.actor) ?? ''} ${entry.action} ${entry.target} ${entry.detail}`
        .toLowerCase()
        .includes(needle),
    );
  }, [audit, query, nameOf]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="card table-card">
      <div className="toolbar">
        <label className="input-wrap">
          <span className="sr-only">Search the activity log</span>
          <Search aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Search by person, action, or asset code…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {visible.length === 0 ? (
        <Empty title="No activity matches">Try a shorter search.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Record</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr key={entry.id}>
                <td data-label="When" className="num">
                  {formatDateTime(entry.at)}
                </td>
                <td data-label="Who">{nameOf.get(entry.actor) ?? entry.actor}</td>
                <td data-label="Action" className="mono">
                  {entry.action}
                </td>
                <td data-label="Record" className="mono">
                  {entry.target}
                </td>
                <td data-label="Detail">{entry.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <TableFoot
        page={current}
        pageSize={PAGE_SIZE}
        total={rows.length}
        noun="entries"
        onPage={setPage}
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
