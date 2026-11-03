import { connect } from 'cloudflare:sockets';

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (s) => btoa(String.fromCharCode(...enc.encode(s)));
const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const noCRLF = (s) => String(s).replace(/[\r\n]+/g, ' ');

export const mailConfigured = (env) => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

// Cliente SMTP mínimo sobre sockets TCP de Cloudflare: STARTTLS (587) o TLS directo (465).
export async function sendMail(env, { to, subject, text }) {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT || 587);
  const from = env.SMTP_FROM || env.SMTP_USER;
  const fromAddr = (from.match(/<([^>]+)>/) || [null, from])[1];

  const run = async () => {
    let socket = connect({ hostname: host, port }, { secureTransport: port === 465 ? 'on' : 'starttls' });
    let reader = socket.readable.getReader();
    let writer = socket.writable.getWriter();
    let buf = '';
    const readReply = async () => {
      for (;;) {
        const m = buf.match(/^(?:\d{3}-.*\r\n)*\d{3} .*\r\n/);
        if (m) { buf = buf.slice(m[0].length); return m[0]; }
        const { value, done } = await reader.read();
        if (done) throw new Error('La conexión SMTP se cerró.');
        buf += dec.decode(value);
      }
    };
    const cmd = async (line, ok) => {
      await writer.write(enc.encode(`${line}\r\n`));
      const reply = await readReply();
      if (!ok.includes(reply.slice(0, 3))) throw new Error(`SMTP rechazó el comando: ${reply.trim().split('\r\n').pop()}`);
    };

    await readReply();
    await cmd('EHLO herbario-surco', ['250']);
    if (port !== 465) {
      await cmd('STARTTLS', ['220']);
      reader.releaseLock();
      writer.releaseLock();
      socket = socket.startTls({ expectedServerHostname: host });
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
      buf = '';
      await cmd('EHLO herbario-surco', ['250']);
    }
    await cmd('AUTH LOGIN', ['334']);
    await cmd(b64(env.SMTP_USER), ['334']);
    await cmd(b64(env.SMTP_PASS), ['235']);
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
    await writer.write(enc.encode('QUIT\r\n'));
    await socket.close().catch(() => {});
  };

  await Promise.race([run(), new Promise((_, rej) => setTimeout(() => rej(new Error('Tiempo de espera agotado al enviar el correo.')), 15_000))]);
}
