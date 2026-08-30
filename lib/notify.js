'use strict';
/**
 * Notifikasi keluar (Telegram Bot + Webhook generik).
 *
 * Tanpa dependensi npm baru — hanya modul http/https bawaan — agar tetap ringan
 * di STB. Satu implementasi untuk kedua backend.
 */
const http = require('node:http');
const https = require('node:https');

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

function postJson(url, body, label, { timeout = 8000, userAgent = 'Web-CCTV' } = {}) {
  return new Promise(resolve => {
    let target;
    try { target = new URL(url); } catch { return resolve(false); }
    const isHttps = target.protocol === 'https:';
    if (!isHttps && target.protocol !== 'http:') return resolve(false);
    const payload = Buffer.from(JSON.stringify(body));
    const req = (isHttps ? https : http).request({
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        'User-Agent': userAgent
      },
      timeout
    }, res => {
      res.resume();
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      if (!ok) console.warn(`⚠️ ${label} HTTP ${res.statusCode}`);
      res.on('end', () => resolve(ok));
    });
    req.on('error', err => { console.warn(`⚠️ ${label}:`, err.message); resolve(false); });
    req.on('timeout', () => { req.destroy(); console.warn(`⚠️ ${label}: timeout`); resolve(false); });
    req.write(payload);
    req.end();
  });
}

/**
 * @param {object} cfg
 * @param {(key:string, fallback?:string)=>string} cfg.getSetting  pembaca setting
 * @param {()=>string} cfg.nowSql                                 waktu lokal "YYYY-MM-DD HH:MM:SS"
 * @param {string} cfg.version
 * @param {string} cfg.timezone
 */
function createNotifier(cfg) {
  const cooldowns = new Map();
  let failureStreak = 0;

  const events = () => String(cfg.getSetting('notify_events', '')).split(',')
    .map(s => s.trim()).filter(Boolean);

  function enabledFor(event) {
    if (cfg.getSetting('notify_enabled', '0') !== '1') return false;
    const list = events();
    if (!list.length) return false;
    return list.includes('all') || list.includes(event);
  }

  function notify(event, title, message, opts = {}) {
    try {
      if (!enabledFor(event)) return false;
      const cooldown = opts.cooldown === undefined ? DEFAULT_COOLDOWN_MS : opts.cooldown;
      const bucket = `${event}:${opts.key || 'global'}`;
      const now = Date.now();
      if (cooldown > 0 && now - (cooldowns.get(bucket) || 0) < cooldown) return false;
      cooldowns.set(bucket, now);

      const appName = cfg.getSetting('app_name', 'Web-CCTV');
      const time = cfg.nowSql();
      const payload = {
        app: appName, version: cfg.version, event, title, message, time,
        timezone: cfg.timezone,
        camera_id: opts.cameraId || null, camera_name: opts.cameraName || null
      };

      const token = cfg.getSetting('notify_telegram_token');
      const chat = cfg.getSetting('notify_telegram_chat');
      if (token && chat) {
        // Tanpa parse_mode: karakter khusus pada nama kamera bisa membuat
        // Telegram membalas 400 dan notifikasi hilang tanpa jejak.
        const text = `🎥 ${appName}\n\n${title}\n${message}\n\n⏱ ${time} (${cfg.timezone})`;
        postJson(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
          { chat_id: chat, text, disable_web_page_preview: true },
          'Notifikasi Telegram', { userAgent: `Web-CCTV/${cfg.version}` })
          .then(ok => {
            if (ok) { failureStreak = 0; return; }
            if (++failureStreak >= 5) {
              console.warn('⚠️ Notifikasi Telegram gagal 5x beruntun — periksa token/chat id.');
              failureStreak = 0;
            }
          });
      }

      const webhook = cfg.getSetting('notify_webhook_url');
      if (webhook) {
        postJson(webhook, payload, 'Notifikasi Webhook', { userAgent: `Web-CCTV/${cfg.version}` });
      }
      return true;
    } catch (err) {
      console.warn('⚠️ notify():', err.message);
      return false;
    }
  }

  return { notify, enabledFor, postJson, cooldowns };
}

module.exports = { createNotifier, postJson };
