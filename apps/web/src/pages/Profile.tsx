import { ACTION_LABELS, ROLE_LABELS, ROLE_SUMMARIES } from '@wms/contracts';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { apiSend, newIntentKey } from '../api/client.js';
import { useAudit } from '../api/queries.js';
import { useCurrentUser, useReference } from '../auth/auth.js';
import { Avatar, Button, Field, FormError, PageHead, useToast } from '../components/ui.js';
import { formatDateTime } from '../lib/dates.js';
import { useSubmit, useTheme, type ThemeChoice } from '../lib/hooks.js';
import { describeEntry } from './Users.js';

const THEMES: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'Match system', icon: Monitor },
];

const RECENT_ACTIONS = 8;

export function Profile() {
  const user = useCurrentUser();
  const { settings, permissions } = useReference();
  const audit = useAudit({ actor: 'me' });
  const intent = useRef(newIntentKey());
  const [theme, setTheme] = useTheme();
  const toast = useToast();
  const submit = useSubmit();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [mismatch, setMismatch] = useState<string | null>(null);

  const mine = (audit.data?.pages[0]?.items ?? []).slice(0, RECENT_ACTIONS);
  const allowed = permissions;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (next.length < settings.passwordMinLength) {
      setMismatch(`Use at least ${settings.passwordMinLength} characters.`);
      return;
    }
    setMismatch(null);
    void submit.run(async () => {
      await apiSend(
        'POST',
        '/auth/password',
        { currentPassword: current, newPassword: next },
        intent.current,
      );
      intent.current = newIntentKey();
      setCurrent('');
      setNext('');
      toast('Password changed. Other devices were signed out.');
    });
  };

  return (
    <div className="page">
      <PageHead title="My profile" lead="Your account, appearance and recent activity" />
      {
        <div className="grid-2 even">
          <div className="stack">
            <section className="card card-pad">
              <div className="row" style={{ gap: 16, marginBottom: 12 }}>
                <Avatar name={user.name} large />
                <div>
                  <h2 className="section-title">{user.name}</h2>
                  <p className="muted">{user.title}</p>
                </div>
              </div>
              <dl className="facts">
                <div>
                  <dt>Username</dt>
                  <dd className="mono">{user.username}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>
                    {ROLE_LABELS[user.role]}
                    <span className="cell-sub" style={{ display: 'block' }}>
                      {ROLE_SUMMARIES[user.role]}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Last sign-in</dt>
                  <dd className="num">{formatDateTime(user.lastLoginAt)}</dd>
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
                <Field label="Current password">
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                  />
                </Field>
                <Field
                  label="New password"
                  hint={`At least ${settings.passwordMinLength} characters.`}
                >
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
                  mine.map((entry) => (
                    <div
                      key={entry.id}
                      className="feed-item"
                      style={{ gridTemplateColumns: '1fr auto' }}
                    >
                      <span>
                        <strong className="mono">{entry.action}</strong>
                        <span className="cell-sub" style={{ display: 'block' }}>
                          {describeEntry(entry)}
                        </span>
                      </span>
                      <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      }
    </div>
  );
}
