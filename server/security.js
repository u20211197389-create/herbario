import crypto from 'node:crypto';

export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
};

// Con hash nulo se hace igualmente el cálculo para no revelar si el usuario existe.
export const verifyPassword = (password, stored) => {
  const [scheme, saltHex, hashHex] = String(stored || 'scrypt$00$00').split('$');
  const salt = Buffer.from(saltHex || '00', 'hex');
  const expected = Buffer.from(hashHex || '00', 'hex');
  const actual = crypto.scryptSync(password, salt, Math.max(expected.length, 1));
  return Boolean(stored) && scheme === 'scrypt' && actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

export const newToken = () => crypto.randomBytes(32).toString('hex');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const passwordProblem = (password) => {
  if (typeof password !== 'string' || password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'La contraseña debe incluir letras y números.';
  return null;
};
