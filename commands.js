// commands.js - EXO-CYBER command handler (Baileys, CommonJS)
//
// Install:  npm i @whiskeysockets/baileys wa-sticker-formatter sharp yt-search
// Use in your messages.upsert handler:
//
//   const { handleCommand, isAiOn } = require('./commands');
//   sock.ev.on('messages.upsert', async ({ messages }) => {
//     const msg = messages[0];
//     if (!msg.message) return;
//     const handled = await handleCommand(sock, msg);
//     if (!handled && isAiOn(msg.key.remoteJid)) {
//       // call your existing AI reply code here
//     }
//   });

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const PREFIX = '.';
const BOT_NAME = 'E X O - C Y B E R';
const OWNER = '0000000000'; // your number with country code, no +
const startedAt = Date.now();
const aiChats = new Set();

// ---------- helpers ----------

const getText = (msg) => {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
};

const normJid = (j = '') => j.split(':')[0].split('@')[0] + '@s.whatsapp.net';
const getSender = (sock, msg) =>
  msg.key.fromMe ? normJid(sock.user.id) : msg.key.participant || msg.key.remoteJid;
const getQuoted = (msg) => msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const reply = (sock, msg, text) =>
  sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m ${s % 60}s`;
};

async function download(media, type) {
  const stream = await downloadContentFromMessage(media, type);
  let buf = Buffer.from([]);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

// Finds an image/video/sticker in the message itself or in the replied message
async function getMedia(msg, kinds = ['imageMessage', 'videoMessage']) {
  const sources = [msg.message, getQuoted(msg)];
  for (const src of sources) {
    if (!src) continue;
    const kind = kinds.find((k) => src[k]);
    if (kind) {
      return { kind, buffer: await download(src[kind], kind.replace('Message', '')) };
    }
  }
  return null;
}

async function requireAdmin(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid.endsWith('@g.us')) {
    await reply(sock, msg, 'Groups only.');
    return null;
  }
  const meta = await sock.groupMetadata(jid);
  const sender = getSender(sock, msg);
  const isAdmin = meta.participants.some((p) => p.id === sender && p.admin);
  if (!isAdmin && !msg.key.fromMe) {
    await reply(sock, msg, 'Admins only.');
    return null;
  }
  return meta;
}

// ---------- view-once reveal (.damn / .cute) ----------

async function revealViewOnce(sock, msg, toDM) {
  const q = getQuoted(msg);
  if (!q) return reply(sock, msg, 'Reply to a view-once message.');

  // Older/newer WhatsApp versions wrap view-once differently
  const inner =
    q.viewOnceMessageV2?.message ||
    q.viewOnceMessageV2Extension?.message ||
    q.viewOnceMessage?.message ||
    q;
  const kind = ['imageMessage', 'videoMessage', 'audioMessage'].find((k) => inner[k]);
  if (!kind) return reply(sock, msg, 'That is not a view-once photo, video or voice note.');

  const media = inner[kind];
  const buffer = await download(media, kind.replace('Message', ''));
  const target = toDM ? getSender(sock, msg) : msg.key.remoteJid;
  const caption = media.caption || '';

  if (kind === 'imageMessage') await sock.sendMessage(target, { image: buffer, caption });
  else if (kind === 'videoMessage') await sock.sendMessage(target, { video: buffer, caption });
  else
    await sock.sendMessage(target, {
      audio: buffer,
      mimetype: media.mimetype || 'audio/ogg; codecs=opus',
      ptt: true,
    });
}

// ---------- command definitions ----------

const JOKES = [
  'I told my computer I needed a break. Now it will not stop sending me KitKat ads.',
  'Why do programmers prefer dark mode? Light attracts bugs.',
  'There are 10 kinds of people: those who get binary and those who do not.',
];
const BALL = ['Yes.', 'No.', 'Maybe.', 'Ask again later.', 'Definitely.', 'Not a chance.'];

const defs = [
  // GENERAL
  { section: 'GENERAL', name: 'menu', fn: (c) => reply(c.sock, c.msg, buildMenu()) },
  { section: 'GENERAL', name: 'help', fn: (c) => reply(c.sock, c.msg, buildMenu()) },
  {
    section: 'GENERAL',
    name: 'ping',
    fn: async (c) => {
      const t = Date.now();
      await reply(c.sock, c.msg, 'Pong.');
      await reply(c.sock, c.msg, `${Date.now() - t}ms`);
    },
  },
  {
    section: 'GENERAL',
    name: 'about',
    fn: (c) =>
      reply(c.sock, c.msg, `${BOT_NAME}\nA mini WhatsApp bot. Personality: nonchalant.\nPrefix: ${PREFIX}`),
  },
  {
    section: 'GENERAL',
    name: 'status',
    fn: (c) => reply(c.sock, c.msg, `Status: Online\nUptime: ${fmtTime(Date.now() - startedAt)}`),
  },
  { section: 'GENERAL', name: 'owner', fn: (c) => reply(c.sock, c.msg, `Owner: wa.me/${OWNER}`) },
  {
    section: 'GENERAL',
    name: 'uptime',
    fn: (c) => reply(c.sock, c.msg, fmtTime(Date.now() - startedAt)),
  },

  // AI SYSTEM
  {
    section: 'AI SYSTEM',
    name: 'ai',
    fn: (c) => {
      const mode = (c.args[0] || '').toLowerCase();
      if (mode === 'on') {
        aiChats.add(c.jid);
        return reply(c.sock, c.msg, 'AI is on for this chat.');
      }
      if (mode === 'off') {
        aiChats.delete(c.jid);
        return reply(c.sock, c.msg, 'AI is off for this chat.');
      }
      return reply(c.sock, c.msg, `Use ${PREFIX}ai on or ${PREFIX}ai off`);
    },
  },
  {
    section: 'AI SYSTEM',
    name: 'clear',
    fn: (c) => {
      // TODO: clear your stored AI conversation history for c.jid here
      return reply(c.sock, c.msg, 'AI memory cleared.');
    },
  },

  // STICKER TOOLS
  {
    section: 'STICKER TOOLS',
    name: 's',
    fn: async (c) => {
      const { Sticker, StickerTypes } = require('wa-sticker-formatter');
      const media = await getMedia(c.msg);
      if (!media) return reply(c.sock, c.msg, 'Send or reply to an image/video.');
      const sticker = new Sticker(media.buffer, {
        pack: BOT_NAME,
        author: 'EXO',
        type: StickerTypes.FULL,
        quality: 60,
      });
      await c.sock.sendMessage(c.jid, await sticker.toMessage(), { quoted: c.msg });
    },
  },
  {
    section: 'STICKER TOOLS',
    name: 'take',
    fn: async (c) => {
      const { Sticker } = require('wa-sticker-formatter');
      const media = await getMedia(c.msg, ['stickerMessage']);
      if (!media) return reply(c.sock, c.msg, 'Reply to a sticker. Usage: .take pack|author');
      const [pack, author] = c.text.split('|').map((x) => x.trim());
      const sticker = new Sticker(media.buffer, {
        pack: pack || BOT_NAME,
        author: author || 'EXO',
      });
      await c.sock.sendMessage(c.jid, await sticker.toMessage(), { quoted: c.msg });
    },
  },
  {
    section: 'STICKER TOOLS',
    name: 'toimg',
    fn: async (c) => {
      const sharp = require('sharp');
      const media = await getMedia(c.msg, ['stickerMessage']);
      if (!media) return reply(c.sock, c.msg, 'Reply to a sticker.');
      const png = await sharp(media.buffer).png().toBuffer(); // static stickers only
      await c.sock.sendMessage(c.jid, { image: png }, { quoted: c.msg });
    },
  },

  // MEDIA
  {
    section: 'MEDIA',
    name: 'play',
    fn: async (c) => {
      if (!c.text) return reply(c.sock, c.msg, 'Usage: .play <song name>');
      const yts = require('yt-search');
      const res = await yts(c.text);
      const v = res.videos[0];
      if (!v) return reply(c.sock, c.msg, 'Nothing found.');
      // TODO: add your audio downloader here and send it with
      // sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' })
      await reply(c.sock, c.msg, `${v.title}\n${v.timestamp}\n${v.url}`);
    },
  },
  {
    section: 'MEDIA',
    name: 'damn',
    fn: (c) => revealViewOnce(c.sock, c.msg, false), // resend in the same chat
  },
  {
    section: 'MEDIA',
    name: 'cute',
    fn: (c) => revealViewOnce(c.sock, c.msg, true), // resend to your DM only
  },

  // PROFILE
  {
    section: 'PROFILE',
    name: 'getpp',
    fn: async (c) => {
      const ctx = c.msg.message?.extendedTextMessage?.contextInfo;
      const target = ctx?.mentionedJid?.[0] || ctx?.participant || getSender(c.sock, c.msg);
      try {
        const url = await c.sock.profilePictureUrl(target, 'image');
        await c.sock.sendMessage(c.jid, { image: { url } }, { quoted: c.msg });
      } catch {
        await reply(c.sock, c.msg, 'No profile picture (or it is private).');
      }
    },
  },
  {
    section: 'PROFILE',
    name: 'whoami',
    fn: (c) => reply(c.sock, c.msg, `You are @${getSender(c.sock, c.msg).split('@')[0]}`),
  },

  // GROUP
  {
    section: 'GROUP',
    name: 'tagall',
    fn: async (c) => {
      const meta = await requireAdmin(c.sock, c.msg);
      if (!meta) return;
      const ids = meta.participants.map((p) => p.id);
      const list = ids.map((id) => `◈ @${id.split('@')[0]}`).join('\n');
      await c.sock.sendMessage(c.jid, { text: `${c.text || 'Attention'}\n${list}`, mentions: ids });
    },
  },
  {
    section: 'GROUP',
    name: 'hidetag',
    fn: async (c) => {
      const meta = await requireAdmin(c.sock, c.msg);
      if (!meta) return;
      await c.sock.sendMessage(c.jid, {
        text: c.text || '.',
        mentions: meta.participants.map((p) => p.id),
      });
    },
  },
  {
    section: 'GROUP',
    name: 'kick',
    fn: async (c) => {
      if (!(await requireAdmin(c.sock, c.msg))) return;
      const ctx = c.msg.message?.extendedTextMessage?.contextInfo;
      const target = ctx?.mentionedJid?.[0] || ctx?.participant;
      if (!target) return reply(c.sock, c.msg, 'Mention or reply to someone.');
      await c.sock.groupParticipantsUpdate(c.jid, [target], 'remove');
    },
  },

  // FUN
  { section: 'FUN', name: 'joke', fn: (c) => reply(c.sock, c.msg, pick(JOKES)) },
  { section: 'FUN', name: '8ball', fn: (c) => reply(c.sock, c.msg, pick(BALL)) },
  { section: 'FUN', name: 'flip', fn: (c) => reply(c.sock, c.msg, pick(['Heads', 'Tails'])) },
  {
    section: 'FUN',
    name: 'roll',
    fn: (c) => reply(c.sock, c.msg, String(1 + Math.floor(Math.random() * 6))),
  },
];

const commands = new Map(defs.map((d) => [d.name, d]));

// ---------- menu ----------

function buildMenu() {
  const sections = {};
  for (const d of defs) (sections[d.section] ||= []).push(d.name);

  let out = `╭━━━「 ${BOT_NAME} 」\n┃\n┃ Status: Online\n┃ Personality: Nonchalant.\n┃\n`;
  for (const [title, names] of Object.entries(sections)) {
    out += `┣━━━「 ${title} 」\n`;
    for (const n of names) {
      out += `┃ ◈ ${PREFIX}${n}${n === 'ai' ? ' on/off' : ''}\n`;
    }
    out += '┃\n';
  }
  return out + '╰━━━━━━━━━━━━';
}

// ---------- entry points ----------

async function handleCommand(sock, msg) {
  const body = getText(msg).trim();
  if (!body.startsWith(PREFIX)) return false;

  const [cmd, ...args] = body.slice(PREFIX.length).split(/\s+/);
  const def = commands.get(cmd.toLowerCase());
  if (!def) return false;

  const ctx = { sock, msg, jid: msg.key.remoteJid, args, text: args.join(' ') };
  try {
    await def.fn(ctx);
  } catch (err) {
    console.error(`[${cmd}]`, err);
    await reply(sock, msg, 'That one failed. Try again.');
  }
  return true;
}

const isAiOn = (jid) => aiChats.has(jid);

module.exports = { handleCommand, isAiOn, buildMenu };
