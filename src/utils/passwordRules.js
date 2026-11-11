import { PASSWORD_RULES } from './validators';

// The server rejects longer passwords; mirror it so the button never enables for one it would refuse.
export const PASSWORD_MAX_LENGTH = 128;

/**
 * One check used by the requirements checklist, the strength meter, the
 * "passwords match" message and every submit guard, so they never disagree.
 *
 * checkPassword('Abc123!x', 'Abc123!x') →
 *   { rules: [{ id, label, met }], allMet, tooLong, strength: { score, level, label }, matches, valid }
 */
export function checkPassword(password = '', confirm) {
  const value = String(password);
  const rules = PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, met: rule.test(value) }));
  const metCount = rules.filter((rule) => rule.met).length;
  const allMet = metCount === rules.length;
  const tooLong = value.length > PASSWORD_MAX_LENGTH;
  const strength = passwordStrength(value, metCount, allMet);
  const matches = confirm === undefined ? null : confirm !== '' && confirm === value;
  return { rules, allMet, tooLong, strength, matches, valid: allMet && !tooLong && matches !== false };
}

/** Weak / Fair / Strong. Strong needs every rule plus a longer password (12+ characters). */
function passwordStrength(value, metCount, allMet) {
  if (!value) return { score: 0, level: 'none', label: '' };
  if (allMet && value.length >= 12) return { score: 3, level: 'strong', label: 'Strong' };
  if (allMet || metCount >= 4) return { score: 2, level: 'fair', label: 'Fair' };
  return { score: 1, level: 'weak', label: 'Weak' };
}
