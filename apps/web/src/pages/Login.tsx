import { ArrowLeft, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth.js';
import { Brand, Button, FormError } from '../components/ui.js';
import { apiSend } from '../api/client.js';
import { useSubmit } from '../lib/hooks.js';

function LoginArt() {
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

function LoginFoot() {
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

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user && !submit.pending) return <Navigate to={from} replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    void submit.run(async () => {
      const error = await signIn(username, password, remember);
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
          <label className="input-wrap">
            <span className="sr-only">Username or email</span>
            <User aria-hidden="true" />
            <input
              className="input"
              name="username"
              placeholder="Username or email"
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
          <Button
            type="submit"
            variant="primary"
            block
            pending={submit.pending}
            disabled={!username.trim() || !password}
          >
            {submit.pending ? 'Signing in…' : 'Sign In'}
          </Button>
          <LoginFoot />
        </form>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const submit = useSubmit();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      await apiSend('POST', '/auth/forgot', { identifier: email });
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
              If an active account uses that address, a reset link is on its way. If nothing
              arrives, ask an administrator for a reset link.
            </p>
          ) : (
            <>
              <FormError message={submit.error} />
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
 * The page an invitation or reset link opens. The token is in the path, so it never reaches
 * the server's access log as a query string; it is sent once, in the body, and spent.
 */
export function SetPassword({ purpose }: { purpose: 'invite' | 'reset' }) {
  const { token = '' } = useParams();
  const submit = useSubmit();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      await apiSend('POST', purpose === 'invite' ? '/auth/accept-invite' : '/auth/reset', {
        token,
        password,
      });
      setDone(true);
    });
  };

  return (
    <div className="login">
      <div className="login-card">
        <LoginArt />
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <header>
            <h2>{purpose === 'invite' ? 'Set up your account' : 'Choose a new password'}</h2>
            <p>At least 12 characters. A short sentence is easy to remember and hard to guess.</p>
          </header>
          {done ? (
            <>
              <p className="banner info" role="status">
                <Lock aria-hidden="true" />
                Your password is set. Sign in with it now.
              </p>
              <Button
                variant="primary"
                block
                onClick={() => void navigate('/login', { replace: true })}
              >
                Go to sign in
              </Button>
            </>
          ) : (
            <>
              <label className="input-wrap">
                <span className="sr-only">New password</span>
                <Lock aria-hidden="true" />
                <input
                  className="input"
                  type="password"
                  placeholder="New password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="input-wrap">
                <span className="sr-only">Repeat the new password</span>
                <Lock aria-hidden="true" />
                <input
                  className="input"
                  type="password"
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </label>
              <FormError message={mismatch ? 'The two passwords do not match.' : submit.error} />
              <Button
                type="submit"
                variant="primary"
                block
                pending={submit.pending}
                disabled={password.length < 12 || password !== confirm}
              >
                Save password
              </Button>
            </>
          )}
          <LoginFoot />
        </form>
      </div>
    </div>
  );
}
