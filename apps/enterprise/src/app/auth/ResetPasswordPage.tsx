import { AuthRecoveryGate, PasswordRecoveryPage } from '@roam/auth-client';

export function ResetPasswordPage() {
  return (
    <AuthRecoveryGate
      title="Reset password"
      subtitle="Choose a new password for your Roam Enterprise account"
      signInHref="/login"
    >
      <PasswordRecoveryPage
        title="Reset password"
        subtitle="Choose a new password for your Roam Enterprise account"
        signInHref="/login"
      />
    </AuthRecoveryGate>
  );
}
