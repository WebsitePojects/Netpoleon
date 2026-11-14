import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui.js';

export function NotFound({
  what = 'That page does not exist, or it has moved.',
}: {
  what?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="notfound">
      <span className="big num" aria-hidden="true">
        404
      </span>
      <h1 className="section-title" style={{ fontSize: 24 }}>
        Page not found
      </h1>
      <p className="muted">{what}</p>
      <div className="row" style={{ marginTop: 8 }}>
        <Button icon={ArrowLeft} onClick={() => void navigate(-1)}>
          Go back
        </Button>
        <Link to="/" className="btn btn-primary">
          <LayoutDashboard aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
