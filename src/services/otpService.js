// Recovery codes are issued and verified only by Supabase through Express.
import { ServiceError } from './serviceError';
import { requestRecoveryCode, verifyRecoveryCode } from './recoveryService';

function requireRecovery(purpose) {
  if (purpose !== 'reset') throw new ServiceError('INVALID_PURPOSE', 'Use the email confirmation flow for registration.');
}
export function sendOtp(email, purpose = 'reset') {
  requireRecovery(purpose);
  return requestRecoveryCode(email);
}
export function verifyOtp(email, purpose, code) {
  requireRecovery(purpose);
  return verifyRecoveryCode(email, code);
}
