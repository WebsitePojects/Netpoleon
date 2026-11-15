import { SkPage } from '../components/controls.js';
import { Info, Monitor, Moon, Sun } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCurrentUser } from '../auth/auth.js';
import { Avatar, Button, Field, FormError, PageHead, useToast } from '../components/ui.js';
import { useBackend, useResource } from '../backend/context.js';
import { useWmsState } from '../data/context.js';
import { ACTION_LABELS, can, roleLabel, ROLE_SUMMARIES, type Action } from '../data/permissions.js';
import { describeEntry } from '../lib/audit.js';
import { formatDateTime } from '../lib/dates.js';
import { isStaffRole, MIN_PASSWORD_LENGTH, passwordProblem } from '@wms/contracts/client';
import { usePageReady, useSubmit, useTheme, type ThemeChoice } from '../lib/hooks.js';

const THEMES: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'Match system', icon: Monitor },
];

const RECENT_ACTIONS = 8;

export function Profile() {
  const ready = usePageReady();
  const user = useCurrentUser();
  const backend = useBackend();
  const { settings } = useWmsState();
  const [theme, setTheme] = useTheme();
  const toast = useToast();
  const submit = useSubmit();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [mismatch, setMismatch] = useState<string | null>(null);
  const minLength = backend.mode === 'demo' ? settings.passwordMinLength : MIN_PASSWORD_LENGTH;

  const people = useResource('users', () => backend.users());
  const me = people.data?.find((person) => person.id === user.id);
  const activity = useResource(`audit:actor:${user.id}`, () =>
    backend.audit({ actorId: user.id, limit: RECENT_ACTIONS }),
  );
  const mine = activity.data?.items ?? [];
  const role = isStaffRole(user.role) ? user.role : null;
  const allowed = role
    ? (Object.keys(ACTION_LABELS) as Action[]).filter((action) => can(role, action))
    : [];

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(next, minLength);
    if (problem) {
      setMismatch(problem);
      return;
    }
    setMismatch(null);
    void submit.runAsync(async () => {
      await backend.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast('Password changed');
    });
  };

  return (
    <div className="page">
      <PageHead title="My profile" lead="Your account, appearance and recent activity" />
      {!ready ? (
        <SkPage kind="profile" />
      ) : (
        <div className="grid-2 even">
          <div className="stack">
            <section className="card card-pad">
              <div className="row" style={{ gap: 16, marginBottom: 12 }}>
                <Avatar name={user.fullName} large />
                <div>
                  <h2 className="section-title">{user.fullName}</h2>
                  <p className="muted">{me?.jobTitle ?? ''}</p>
                </div>
              </div>
              <dl className="facts">
                <div>
                  <dt>Email</dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>
                    {roleLabel(user.role)}
                    {role && (
                      <span className="cell-sub" style={{ display: 'block' }}>
                        {ROLE_SUMMARIES[role]}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Last sign-in</dt>
                  <dd className="num">{formatDateTime(me?.lastLoginAt ?? null)}</dd>
                </div>
              </dl>
            </section>

            <section className="card card-pad" aria-labelledby="theme-title">
              <h2 id="theme-title" className="section-title" style={{ marginBottom: 10 }}>
                Appearance
              </h2>
              <div className="choice-grid" role="group" aria-label="Theme">
                {THEMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="choice"
                    aria-pressed={theme === item.id}
                    onClick={() => setTheme(item.id)}
                  >
                    <item.icon aria-hidden="true" width={18} height={18} />
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="card card-pad" aria-labelledby="can-title">
              <h2 id="can-title" className="section-title" style={{ marginBottom: 8 }}>
                What you can do
              </h2>
              <ul className="row" style={{ gap: 6 }}>
                {allowed.map((action) => (
                  <li key={action} className="chip plain">
                    {ACTION_LABELS[action]}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="stack" style={{ alignContent: 'start' }}>
            <section className="card card-pad" aria-labelledby="password-title">
              <h2 id="password-title" className="section-title" style={{ marginBottom: 10 }}>
                Change password
              </h2>
              <form className="form-grid" onSubmit={onSubmit} noValidate>
                <p className="banner info" role="note">
                  <Info aria-hidden="true" />
                  Changing it signs out every other device where you are signed in.
                  {backend.mode === 'demo' &&
                    ' Demo build: until you change it, the shared demo password works.'}
                </p>
                <Field label="Current password">
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                  />
                </Field>
                <Field label="New password" hint={`At least ${minLength} characters.`}>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={next}
                    onChange={(event) => setNext(event.target.value)}
                  />
                </Field>
                <FormError message={mismatch ?? submit.error} />
                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    pending={submit.pending}
                    disabled={!current || !next}
                  >
                    Update password
                  </Button>
                </div>
              </form>
            </section>

            <section className="card" aria-labelledby="mine-title">
              <div className="card-head">
                <h2 id="mine-title">Your recent activity</h2>
              </div>
              <div className="feed">
                {mine.length === 0 ? (
                  <p className="muted" style={{ padding: '12px 0' }}>
                    Nothing recorded yet.
                  </p>
                ) : (
                  mine.map((entry) => {
                    const { record, detail } = describeEntry(entry);
                    return (
                      <div
                        key={entry.id}
                        className="feed-item"
                        style={{ gridTemplateColumns: '1fr auto' }}
                      >
                        <span>
                          <strong className="mono">{entry.action}</strong>
                          <span className="cell-sub" style={{ display: 'block' }}>
                            {record}
                            {detail ? ` · ${detail}` : ''}
                          </span>
                        </span>
                        <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
