import { ArrowLeft, CircleCheck, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, FormError } from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import { passwordProblem } from '../lib/passwords.js';
import { useSubmit } from '../lib/hooks.js';
import { LoginArt, LoginFoot } from './Login.js';

type Purpose = 'invite' | 'password_reset';

const COPY: Record<Purpose, { title: string; lead: string; button: string; done: string }> = {
  invite: {
    title: 'Set up your account',
    lead: 'Choose the password you will sign in with.',
    button: 'Create account',
    done: 'Your account is ready. Sign in with your new password.',
  },
  password_reset: {
    title: 'Choose a new password',
    lead: 'The link works once. Pick something you have not used here before.',
    button: 'Save new password',
    done: 'Password changed. Sign in with the new one.',
  },
};

/** One screen for both single-use links: accepting an invitation and resetting a password. */
function SetPassword({ purpose }: { purpose: Purpose }) {
  const { token = '' } = useParams();
  const store = useStore();
  const { settings } = useWmsState();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const copy = COPY[purpose];

  // Read once: once the link is spent the same render must not flip to "expired" under the
  // person's feet while the success navigation runs.
  const owner = useMemo(() => store.inspectToken(token, purpose), [store, token, purpose]);
  const problem = passwordProblem(password, settings.passwordMinLength);
  const mismatch = confirm.length > 0 && confirm !== password;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (problem || confirm !== password) return;
    void submit
      .run(() => {
        store.completeToken(token, purpose, password);
      })
      .then((done) => {
        if (done) void navigate('/login', { replace: true, state: { notice: copy.done } });
      });
  };

  return (
    <div className="login">
      <div className="login-card">
        <LoginArt />
        {owner ? (
          <form className="login-form" onSubmit={onSubmit} noValidate>
            <header>
              <h2>{copy.title}</h2>
              <p>{copy.lead}</p>
            </header>
            <p className="banner info">
              <KeyRound aria-hidden="true" />
              <span>
                Signing in as <strong>{owner.name}</strong>, username{' '}
                <span className="mono">{owner.username}</span>
              </span>
            </p>
            <label className="input-wrap">
              <span className="sr-only">New password</span>
              <Lock aria-hidden="true" />
              <input
                className="input"
                type={show ? 'text' : 'password'}
                placeholder="New password"
                autoComplete="new-password"
                data-autofocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={touched && problem !== null}
                aria-describedby="password-rule"
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={show ? 'Hide password' : 'Show password'}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </label>
            <label className="input-wrap">
              <span className="sr-only">Repeat the new password</span>
              <Lock aria-hidden="true" />
              <input
                className="input"
                type={show ? 'text' : 'password'}
                placeholder="Repeat the new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                aria-invalid={mismatch}
              />
            </label>
            <ul className="pw-rules" id="password-rule">
              <li data-ok={password.length >= settings.passwordMinLength}>
                <CircleCheck aria-hidden="true" />
                At least {settings.passwordMinLength} characters
              </li>
              <li data-ok={password.length > 0 && problem === null}>
                <CircleCheck aria-hidden="true" />
                Not a common password
              </li>
              <li data-ok={confirm.length > 0 && !mismatch}>
                <CircleCheck aria-hidden="true" />
                Both entries match
              </li>
            </ul>
            <FormError
              message={
                submit.error ??
                (!touched
                  ? null
                  : (problem ?? (confirm !== password ? 'The two passwords do not match.' : null)))
              }
            />
            <Button type="submit" variant="primary" block pending={submit.pending}>
              {copy.button}
            </Button>
            <LoginFoot />
          </form>
        ) : (
          <div className="login-form">
            <header>
              <h2>This link no longer works</h2>
              <p>
                {purpose === 'invite'
                  ? 'Invitation links last 72 hours and work once. Ask an administrator to send a new one.'
                  : 'Reset links last one hour and work once. Request a new one below.'}
              </p>
            </header>
            {purpose === 'password_reset' && (
              <Link to="/forgot-password" className="btn btn-primary btn-block">
                Request a new link
              </Link>
            )}
            <Link to="/login" className="link row" style={{ justifyContent: 'center', gap: 6 }}>
              <ArrowLeft aria-hidden="true" width={15} height={15} />
              Back to sign in
            </Link>
            <LoginFoot />
          </div>
        )}
      </div>
    </div>
  );
}

export function AcceptInvite() {
  return <SetPassword purpose="invite" />;
}

export function ResetPassword() {
  return <SetPassword purpose="password_reset" />;
}
