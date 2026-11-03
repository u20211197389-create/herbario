import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT } from './db.js';

// Lee variables de un archivo .env (no se publica) sin pisar las ya definidas.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* sin .env */ }

export const mailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const noCRLF = (s) => String(s).replace(/[\r\n]+/g, ' ');

// Cliente SMTP mínimo: TLS directo (puerto 465) o STARTTLS (587).
export const sendMail = ({ to, subject, text }) => new Promise((resolve, reject) => {
  if (!mailConfigured()) return reject(new Error('El envío de correo no está configurado.'));
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const from = process.env.SMTP_FROM || user;
  const fromAddr = (from.match(/<([^>]+)>/) || [null, from])[1];
  let socket;
  let buffer = '';
  let waiting = null;
  let done = false;

  const fail = (err) => { if (done) return; done = true; socket?.destroy(); reject(err instanceof Error ? err : new Error(String(err))); };
  const timer = setTimeout(() => fail(new Error('Tiempo de espera agotado al enviar el correo.')), 20_000);

  const attach = (s) => {
    socket = s;
    s.setEncoding('utf8');
    s.on('error', fail);
    s.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\r\n');
      if (lines.length < 2) return;
      const last = lines[lines.length - 2];
      if (/^\d{3} /.test(last) && waiting) {
        const reply = buffer; buffer = ''; const w = waiting; waiting = null; w(reply);
      }
    });
  };
  const read = () => new Promise((r) => { waiting = r; });
  const cmd = async (line, ok) => {
    socket.write(`${line}\r\n`);
    const reply = await read();
    if (!ok.includes(reply.trim().slice(0, 3))) throw new Error(`SMTP rechazó el comando: ${reply.trim().split('\r\n').pop()}`);
    return reply;
  };

  (async () => {
    if (port === 465) {
      attach(tls.connect({ host, port, servername: host }));
      const first = read();
      await new Promise((r) => socket.once('secureConnect', r));
      await first;
    } else {
      attach(net.connect({ host, port }));
      await read();
    }
    const ehlo = os.hostname().replace(/[^\w.-]/g, '') || 'localhost';
    await cmd(`EHLO ${ehlo}`, ['250']);
    if (port !== 465) {
      await cmd('STARTTLS', ['220']);
      const plain = socket;
      plain.removeAllListeners('data');
      attach(tls.connect({ socket: plain, servername: host }));
      await new Promise((r) => socket.once('secureConnect', r));
      await cmd(`EHLO ${ehlo}`, ['250']);
    }
    await cmd('AUTH LOGIN', ['334']);
    await cmd(b64(user), ['334']);
    await cmd(b64(process.env.SMTP_PASS), ['235']);
    await cmd(`MAIL FROM:<${fromAddr}>`, ['250']);
    await cmd(`RCPT TO:<${noCRLF(to)}>`, ['250', '251']);
    await cmd('DATA', ['354']);
    const body = [
      `From: ${noCRLF(from)}`,
      `To: ${noCRLF(to)}`,
      `Subject: ${header(noCRLF(subject))}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(text).replace(/(.{76})/g, '$1\r\n'),
    ].join('\r\n');
    await cmd(`${body}\r\n.`, ['250']);
    socket.write('QUIT\r\n');
    done = true;
    clearTimeout(timer);
    socket.end();
    resolve();
  })().catch((e) => { clearTimeout(timer); fail(e); });
});
