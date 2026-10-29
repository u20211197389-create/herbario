import readline from 'node:readline';
import { db } from './db.js';
import { hashPassword, passwordProblem } from './security.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

// La contraseña se escribe visible en la terminal; no se guarda en ningún archivo.
const username = (process.argv[2] || await ask('Nombre de usuario: ')).trim();
if (!/^[\w.@-]{3,60}$/.test(username)) { console.error('Usuario no válido (3 a 60 caracteres: letras, números, . _ - @).'); process.exit(1); }
const password = await ask('Contraseña (mínimo 10, con letras y números): ');
rl.close();
const problem = passwordProblem(password);
if (problem) { console.error(problem); process.exit(1); }

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashPassword(password), existing.id);
  console.log(`Contraseña de "${username}" actualizada.`);
} else {
  db.prepare('INSERT INTO users (username, passwordHash) VALUES (?, ?)').run(username, hashPassword(password));
  console.log(`Administrador "${username}" creado.`);
}
