import {
  ACTION_LABELS,
  ACTIONS,
  can,
  ROLE_LABELS,
  ROLE_SUMMARIES,
  STAFF_ROLES,
  type AccessLink,
  type AuditEntry,
  type StaffRole,
  type User,
} from '@wms/contracts';
import { Check, Copy, KeyRound, Pencil, Search, UserPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiSend, newIntentKey } from '../api/client.js';
import { useAudit, useDebounced, useInvalidate, useUsers } from '../api/queries.js';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { Select, SkPage } from '../components/controls.js';
import { ActionDialog } from '../components/dialogs.js';
import {
  Avatar,
  Button,
  Dialog,
  Empty,
  Field,
  PageHead,
  Switch,
  TableFoot,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui.js';
import { formatDateTime, formatRelative } from '../lib/dates.js';
import { useSubmit } from '../lib/hooks.js';

type TabId = 'users' | 'roles' | 'activity';

const TABS: TabItem<TabId>[] = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles and permissions' },
  { id: 'activity', label: 'Activity log' },
];

const PAGE_SIZE = 15;

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

/** One line for an audit entry: its label and the values that may be shown. */
export function describeEntry(entry: AuditEntry): string {
  const parts: string[] = [];
  for (const [field, value] of Object.entries(entry.fields)) {
    if (value === null || value === undefined || field === 'label') continue;
    const shown = Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'object'
        ? Object.keys(value).join(', ')
        : typeof value === 'string'
          ? value
          : JSON.stringify(value);
    parts.push(value === true ? field : `${field}: ${shown}`);
  }
  const label = typeof entry.fields.label === 'string' ? entry.fields.label : null;
  return [label, parts.join(' · ')].filter(Boolean).join(' · ');
}

export function Users() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'users';
  const { can: allowed } = useAuth();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [link, setLink] = useState<AccessLink | null>(null);

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
        {tab === 'users' && <UserTable onEdit={setEditing} onLink={setLink} />}
        {tab === 'roles' && <RoleMatrix />}
        {tab === 'activity' && <ActivityLog />}
      </div>
      {editing && (
        <UserDialog
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={setLink}
        />
      )}
      {link && <LinkDialog link={link} onClose={() => setLink(null)} />}
    </div>
  );
}

function UserTable({
  onEdit,
  onLink,
}: {
  onEdit: (user: User) => void;
  onLink: (link: AccessLink) => void;
}) {
  const me = useCurrentUser();
  const { can: allowed } = useAuth();
  const [page, setPage] = useState(1);
  const users = useUsers({ page, pageSize: PAGE_SIZE }, allowed('users.manage'));
  const now = new Date();
  const manage = allowed('users.manage');

  if (!manage) {
    return (
      <div className="card">
        <Empty title="Only administrators manage users">
          Your own details are on your profile page.
        </Empty>
      </div>
    );
  }
  if (!users.data) return <SkPage kind="table" />;

  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Username</th>
            <th>Role</th>
            <th>Last sign-in</th>
            <th>Active</th>
            <th className="right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.data.items.map((user) => (
            <tr key={user.id}>
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
                {user.status === 'invited' && <span className="cell-sub"> · invited</span>}
              </td>
              <td data-label="Last sign-in">
                {user.lastLoginAt ? formatRelative(user.lastLoginAt, now) : 'Never'}
              </td>
              <td data-label="Active">
                <ActiveSwitch
                  user={user}
                  disabled={user.id === me.id || user.status === 'invited'}
                />
              </td>
              <td data-label="" className="right">
                <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  {user.status !== 'deactivated' && <LinkButton user={user} onLink={onLink} />}
                  <Button size="sm" icon={Pencil} onClick={() => onEdit(user)}>
                    Edit
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TableFoot
        page={page}
        pageSize={PAGE_SIZE}
        total={users.data.total}
        noun="users"
        onPage={setPage}
      />
    </div>
  );
}

/** Deactivation signs the person out everywhere on their next click; reactivation restores access. */
function ActiveSwitch({ user, disabled }: { user: User; disabled: boolean }) {
  const submit = useSubmit();
  const toast = useToast();
  const invalidate = useInvalidate();
  return (
    <Switch
      checked={user.status === 'active'}
      disabled={disabled || submit.pending}
      label={`${user.name} can sign in`}
      onChange={(next) => {
        void submit
          .run(async () => {
            await apiSend(
              'POST',
              `/users/${user.id}/${next ? 'reactivate' : 'deactivate'}`,
              {},
              newIntentKey(),
            );
            await invalidate('users');
            toast(`${user.name} ${next ? 'reactivated' : 'deactivated'}`);
          })
          .then((done) => {
            if (!done) toast(submit.error ?? 'That did not work', 'error');
          });
      }}
    />
  );
}

/** The one-time invitation or reset link, for an admin to hand over while no mail provider is set. */
function LinkButton({ user, onLink }: { user: User; onLink: (link: AccessLink) => void }) {
  const submit = useSubmit();
  const toast = useToast();
  const key = useRef(newIntentKey());
  return (
    <Button
      size="sm"
      icon={KeyRound}
      pending={submit.pending}
      title={
        user.status === 'invited' ? 'Create an invitation link' : 'Create a password reset link'
      }
      onClick={() => {
        void submit
          .run(async () => {
            const link = await apiSend<AccessLink>(
              'POST',
              `/users/${user.id}/access-link`,
              {},
              key.current,
            );
            key.current = newIntentKey();
            onLink(link);
          })
          .then((done) => {
            if (!done) toast(submit.error ?? 'That did not work', 'error');
          });
      }}
    >
      {user.status === 'invited' ? 'Invite link' : 'Reset link'}
    </Button>
  );
}

function LinkDialog({ link, onClose }: { link: AccessLink; onClose: () => void }) {
  const toast = useToast();
  return (
    <Dialog
      title={link.purpose === 'invite' ? 'Invitation link' : 'Password reset link'}
      description={`Send this to the person yourself. It works once and expires ${formatDateTime(link.expiresAt)}. It is not shown again.`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Done</Button>
          <Button
            variant="primary"
            icon={Copy}
            onClick={() => {
              void navigator.clipboard.writeText(link.url).then(() => toast('Link copied'));
            }}
          >
            Copy link
          </Button>
        </>
      }
    >
      <input
        className="input mono"
        readOnly
        value={link.url}
        onFocus={(event) => event.target.select()}
      />
    </Dialog>
  );
}

function RoleMatrix() {
  return (
    <div className="card table-card">
      <table className="table matrix">
        <thead>
          <tr>
            <th>Permission</th>
            {STAFF_ROLES.map((role) => (
              <th key={role} title={ROLE_SUMMARIES[role]}>
                {ROLE_LABELS[role]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ACTIONS.map((action) => (
            <tr key={action}>
              <td data-label="Permission">
                <span className="cell-main">{ACTION_LABELS[action]}</span>
              </td>
              {STAFF_ROLES.map((role) => (
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
  const { can: allowed } = useAuth();
  const [query, setQuery] = useState('');
  const needle = useDebounced(query.trim().toLowerCase());
  const audit = useAudit(allowed('audit.read') ? {} : { actor: 'me' });
  const entries = (audit.data?.pages ?? []).flatMap((page) => page.items);
  // The loaded entries are filtered in place; "load more" fetches older ones from the server.
  const visible = needle
    ? entries.filter((entry) =>
        `${entry.actor?.name ?? ''} ${entry.actor?.username ?? ''} ${entry.action} ${describeEntry(entry)}`
          .toLowerCase()
          .includes(needle),
      )
    : entries;

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
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {!audit.data ? (
        <SkPage kind="table" />
      ) : visible.length === 0 ? (
        <Empty title="No activity matches">Try a shorter search, or load older entries.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr key={entry.id}>
                <td data-label="When" className="num">
                  {formatDateTime(entry.at)}
                </td>
                <td data-label="Who">{entry.actor?.name ?? 'System'}</td>
                <td data-label="Action" className="mono">
                  {entry.action}
                </td>
                <td data-label="Detail">{describeEntry(entry) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {audit.hasNextPage && (
        <div className="card-pad">
          <Button
            size="sm"
            pending={audit.isFetchingNextPage}
            onClick={() => void audit.fetchNextPage()}
          >
            Load older entries
          </Button>
        </div>
      )}
    </div>
  );
}

function UserDialog({
  user,
  onClose,
  onCreated,
}: {
  user: User | null;
  onClose: () => void;
  onCreated: (link: AccessLink) => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [username, setUsername] = useState(user?.username ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [role, setRole] = useState<StaffRole>(
    user && user.role in ROLE_SUMMARIES ? (user.role as StaffRole) : 'warehouse',
  );

  return (
    <ActionDialog
      title={user ? `Edit ${user.name}` : 'Add a user'}
      description={
        user
          ? undefined
          : 'The person is invited: you get a one-time link to send them, and they choose their own password.'
      }
      confirmLabel={user ? 'Save changes' : 'Add user'}
      width={560}
      canConfirm={username.trim() !== '' && name.trim() !== '' && email.includes('@')}
      onClose={onClose}
      onConfirm={async (key) => {
        const body = {
          username: username.trim(),
          name: name.trim(),
          email: email.trim(),
          title: title.trim() || null,
          role,
        };
        if (user) {
          await apiSend('PATCH', `/users/${user.id}`, body, key);
          toast(`${body.name} updated`);
        } else {
          const created = await apiSend<User>('POST', '/users', body, key);
          const link = await apiSend<AccessLink>(
            'POST',
            `/users/${created.id}/access-link`,
            {},
            `${key}:link`,
          );
          toast(`${body.name} added`);
          onCreated(link);
        }
        await invalidate('users');
      }}
    >
      <div className="form-grid cols-2">
        <Field label="Username" hint="Lower case letters, digits, dot, dash or underscore.">
          <input
            className="input mono"
            value={username}
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
            onChange={(value) => setRole(value as StaffRole)}
            options={STAFF_ROLES.map((item) => ({ value: item, label: ROLE_LABELS[item] }))}
          />
        </Field>
      </div>
    </ActionDialog>
  );
}
