import { ScanLine } from 'lucide-react';
import { Link } from 'react-router-dom';
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="ResumeIQ home">
      <span className="brand-icon">
        <ScanLine size={21} />
      </span>
      resume<span className="brand-iq">IQ</span>
    </Link>
  );
}
