import { ArrowLeft, CircleCheck, Eye, EyeOff, Inbox, Lock, Mail, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth.js';
import { Brand, Button, FormError } from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import { formatDateTime } from '../lib/dates.js';
import { useSubmit } from '../lib/hooks.js';

export function LoginArt() {
  return (
    <div className="login-art">
      <img src="/img/warehouse.jpg" alt="" />
      <Brand />
      <h1>
        Warehouse
        <br />
        Management System
      </h1>
      <p>Demo Asset Management for Netpoleon / NSPH INC.</p>
    </div>
  );
}

export function LoginFoot() {
  return (
    <p className="login-foot">
      <strong>Netpoleon WMS</strong>
      Powered by Prince IT Solutions OPC
    </p>
  );
}

export function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const submit = useSubmit();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const routeState = location.state as { from?: string; notice?: string } | null;
  const from = routeState?.from ?? '/';
  const notice = routeState?.notice ?? null;
  if (user && !submit.pending) return <Navigate to={from} replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    void submit.run(() => {
      const error = signIn(username, password, remember);
      if (error) setFailure(error);
      else void navigate(from, { replace: true });
    });
  };

  return (
    <div className="login">
      <div className="login-card">
        <LoginArt />
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <header>
            <h2>Welcome Back</h2>
            <p>Sign in to your account</p>
          </header>
          {notice && (
            <p className="banner success" role="status">
              <CircleCheck aria-hidden="true" />
              {notice}
            </p>
          )}
          <label className="input-wrap">
            <span className="sr-only">Username</span>
            <User aria-hidden="true" />
            <input
              className="input"
              name="username"
              placeholder="Username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="input-wrap">
            <span className="sr-only">Password</span>
            <Lock aria-hidden="true" />
            <input
              className="input"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </label>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label className="check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>
            <Link to="/forgot-password" className="link">
              Forgot password?
            </Link>
          </div>
          <FormError message={failure ?? submit.error} />
          <Button type="submit" variant="primary" block pending={submit.pending}>
            {submit.pending ? 'Signing in…' : 'Sign In'}
          </Button>
          <p className="demo-note">
            <strong>Demo build</strong>
            Leave both fields empty and press Sign In to enter as the demo administrator.
          </p>
          <LoginFoot />
        </form>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const store = useStore();
  const { mailbox } = useWmsState();
  const submit = useSubmit();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(() => {
      store.requestPasswordReset(email);
      setSent(true);
    });
  };

  return (
    <div className="login">
      <div className="login-card">
        <LoginArt />
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <header>
            <h2>Reset your password</h2>
            <p>Enter the email address on your account.</p>
          </header>
          {sent ? (
            <p className="banner info" role="status">
              <Mail aria-hidden="true" />
              If an account uses that address, a reset link is on its way. It works once, for one
              hour.
            </p>
          ) : (
            <>
              <label className="input-wrap">
                <span className="sr-only">Email address</span>
                <Mail aria-hidden="true" />
                <input
                  className="input"
                  type="email"
                  name="email"
                  placeholder="Email address"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                block
                pending={submit.pending}
                disabled={!email.includes('@')}
              >
                Send reset link
              </Button>
            </>
          )}
          {sent && <DemoMailbox mails={mailbox.slice(0, 3)} />}
          <Link to="/login" className="link row" style={{ justifyContent: 'center', gap: 6 }}>
            <ArrowLeft aria-hidden="true" width={15} height={15} />
            Back to sign in
          </Link>
          <LoginFoot />
        </form>
      </div>
    </div>
  );
}

/**
 * Demo build only: there is no mail server, so the messages the server would send are shown
 * here. With the API connected, the email goes out through the outbox and this box is gone.
 */
function DemoMailbox({
  mails,
}: {
  mails: { id: number; at: string; to: string; subject: string; link: string }[];
}) {
  return (
    <section className="demo-mailbox" aria-label="Demo mailbox">
      <h3>
        <Inbox aria-hidden="true" />
        Demo mailbox
      </h3>
      {mails.length === 0 ? (
        <p className="muted">No messages. Try an address such as marco@netpoleon.example.</p>
      ) : (
        <ul>
          {mails.map((mail) => (
            <li key={mail.id}>
              <span className="muted">
                To {mail.to} · {formatDateTime(mail.at)}
              </span>
              <Link to={mail.link} className="link">
                {mail.subject}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
