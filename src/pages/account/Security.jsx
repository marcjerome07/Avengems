import { ShieldCheck } from 'lucide-react';
import Button from '../../components/ui/Button';
import { FormAlert } from '../../components/auth/AuthShell';
import useDocumentTitle from '../../hooks/useDocumentTitle';

export default function Security() {
  useDocumentTitle('Security');
  return <><header><h1 className="account-title">Security</h1>
    <p className="account-subtitle">Change your password using your verified email.</p></header>
    <section className="panel"><FormAlert type="info" icon={ShieldCheck}>
      Request an emailed recovery code to choose a new password. Recovery requires email verification and asks you to sign in again afterward.
    </FormAlert><Button to="/forgot-password">Change password securely</Button></section></>;
}
