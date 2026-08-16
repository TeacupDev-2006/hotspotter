import cron from 'node-cron';
import { config } from './config.js';
import { runScan, recentEventsForDigest } from './pipeline.js';
import { sendDigest, smtpConfigured } from './notifiers/email.js';

export function startScheduler() {
  const interval = Math.max(5, config.scanIntervalMinutes);

  const timer = setInterval(() => {
    runScan({ notify: true }).catch((e) => console.error('[scan]', e.message));
  }, interval * 60 * 1000);

  // 每日 08:00 / 20:00 邮件简报
  cron.schedule('0 8,20 * * *', async () => {
    if (!smtpConfigured()) return;
    const events = recentEventsForDigest(20);
    if (events.length) {
      sendDigest(events).catch((e) => console.error('[digest]', e.message));
    }
  });

  console.log(
    `[scheduler] 已启动：每 ${interval} 分钟自动扫描；邮件简报每日 08:00 / 20:00${smtpConfigured() ? '' : '（SMTP 未配置，暂不发送）'}`
  );
  return timer;
}
