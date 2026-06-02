/**
 * SMS 发送模块
 * 
 * 环境变量配置:
 *   SMS_PROVIDER=console           # console | webhook (默认 console)
 *   SMS_WEBHOOK_URL=...           # webhook 模式: 短信接口URL
 *   SMS_WEBHOOK_PHONE_PARAM=phone # webhook 手机号参数名
 *   SMS_WEBHOOK_CODE_PARAM=code   # webhook 验证码参数名
 *   SMS_WEBHOOK_API_KEY=...       # webhook API密钥(可选)
 *   SMS_WEBHOOK_KEY_PARAM=apikey  # webhook API密钥参数名
 *
 * 示例 webhook URL:
 *   https://api.sms-provider.com/send?phone={phone}&code={code}&apikey=xxx
 *
 * 模板中的 {phone} 和 {code} 会被自动替换。
 */

const http = require('http');
const https = require('https');

const PROVIDER = process.env.SMS_PROVIDER || 'console';

function sendSMS(phone, code) {
  if (PROVIDER === 'webhook') {
    return sendViaWebhook(phone, code);
  }
  // Default: console mode
  return sendViaConsole(phone, code);
}

function sendViaConsole(phone, code) {
  const msg = `
╔══════════════════════════════════╗
║         📱 验证码短信            ║
║──────────────────────────────────║
║  手机号: ${phone.padEnd(17)}║
║  验证码: ${String(code).padEnd(17)}║
║  有效期: 5 分钟                  ║
╚══════════════════════════════════╝`;
  console.log(msg);
  return Promise.resolve({ success: true, provider: 'console' });
}

function sendViaWebhook(phone, code) {
  const webhookUrl = process.env.SMS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[SMS] SMS_WEBHOOK_URL not configured, falling back to console');
    return sendViaConsole(phone, code);
  }

  const phoneParam = process.env.SMS_WEBHOOK_PHONE_PARAM || 'phone';
  const codeParam = process.env.SMS_WEBHOOK_CODE_PARAM || 'code';
  const apiKey = process.env.SMS_WEBHOOK_API_KEY || '';
  const keyParam = process.env.SMS_WEBHOOK_KEY_PARAM || 'apikey';

  let url = webhookUrl
    .replace(/\{phone\}/g, encodeURIComponent(phone))
    .replace(/\{code\}/g, encodeURIComponent(code));

  if (apiKey) {
    const separator = url.includes('?') ? '&' : '?';
    url += separator + keyParam + '=' + encodeURIComponent(apiKey);
  }

  return new Promise((resolve, reject) => {
    const caller = url.startsWith('https') ? https : http;
    caller.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[SMS] Webhook response (${res.statusCode}): ${data.slice(0, 200)}`);
        resolve({ success: res.statusCode < 400, provider: 'webhook' });
      });
    }).on('error', (err) => {
      console.error('[SMS] Webhook error:', err.message);
      // Fallback to console
      sendViaConsole(phone, code).then(resolve).catch(reject);
    });
  });
}

module.exports = { sendSMS };
