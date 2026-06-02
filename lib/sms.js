/**
 * SMS 发送模块
 * 
 * 支持以下短信服务商:
 *   console    - 控制台打印（默认，不实际发送）
 *   aliyun     - 阿里云短信 (AccessKey + SecretKey)
 *   tencent    - 腾讯云短信 (SecretId + SecretKey)
 *   webhook    - 通用 HTTP 接口
 *
 * 配置方式：设置环境变量后重启服务器
 *   SMS_PROVIDER=aliyun
 *   SMS_ALIYUN_ACCESS_KEY=你的AccessKeyId
 *   SMS_ALIYUN_SECRET_KEY=你的AccessKeySecret
 *   SMS_ALIYUN_SIGN_NAME=你的短信签名
 *   SMS_ALIYUN_TEMPLATE_CODE=SMS_123456789
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const querystring = require('querystring');

const PROVIDER = process.env.SMS_PROVIDER || 'console';

// ====== 短信发送主函数 ======

function sendSMS(phone, code) {
  const provider = PROVIDER;

  if (provider === 'console') {
    return sendViaConsole(phone, code);
  }
  if (provider === 'aliyun') {
    return sendViaAliyun(phone, code);
  }
  if (provider === 'tencent') {
    return sendViaTencent(phone, code);
  }
  if (provider === 'webhook') {
    return sendViaWebhook(phone, code);
  }

  console.warn(`[SMS] Unknown provider "${provider}", falling back to console`);
  return sendViaConsole(phone, code);
}

// ====== Console 模式（开发测试）======

function sendViaConsole(phone, code) {
  const msg = `
╔══════════════════════════════════╗
║         📱 验证码短信            ║
║──────────────────────────────────║
║  手机号: ${phone.padEnd(17)}║
║  验证码: ${String(code).padEnd(17)}║
║  有效期: 5 分钟                  ║
║──────────────────────────────────║
║  SMS_PROVIDER=console            ║
║  生产环境请设置真实短信服务商     ║
╚══════════════════════════════════╝`;
  console.log(msg);
  return Promise.resolve({ success: true, provider: 'console' });
}

// ====== 阿里云短信 ======

function sendViaAliyun(phone, code) {
  const accessKey = process.env.SMS_ALIYUN_ACCESS_KEY;
  const secretKey = process.env.SMS_ALIYUN_SECRET_KEY;
  const signName = process.env.SMS_ALIYUN_SIGN_NAME;
  const templateCode = process.env.SMS_ALIYUN_TEMPLATE_CODE;

  if (!accessKey || !secretKey || !signName || !templateCode) {
    console.warn('[SMS] Aliyun SMS not configured. Set SMS_ALIYUN_ACCESS_KEY, SMS_ALIYUN_SECRET_KEY, SMS_ALIYUN_SIGN_NAME, SMS_ALIYUN_TEMPLATE_CODE');
    return sendViaConsole(phone, code);
  }

  const params = {
    AccessKeyId: accessKey,
    Action: 'SendSms',
    Format: 'JSON',
    OutId: '123',
    PhoneNumbers: phone,
    RegionId: 'cn-hangzhou',
    SignName: signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: String(Date.now()),
    SignatureVersion: '1.0',
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}/, ''),
    Version: '2017-05-25',
  };

  return new Promise((resolve, reject) => {
    try {
      // Build canonical query string
      const sortedKeys = Object.keys(params).sort();
      const canonical = sortedKeys.map(k => {
        const v = String(params[k]);
        return `${percentEncode(k)}=${percentEncode(v)}`;
      }).join('&');

      const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonical)}`;
      const sign = crypto.createHmac('sha1', secretKey + '&').update(stringToSign).digest('base64');
      params.Signature = sign;

      const body = querystring.stringify(params);
      const req = https.request({
        hostname: 'dysmsapi.aliyuncs.com',
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`[SMS] Aliyun response: ${data}`);
          resolve({ success: res.statusCode < 400, data, provider: 'aliyun' });
        });
      });
      req.on('error', (err) => {
        console.error(`[SMS] Aliyun error: ${err.message}`);
        resolve(sendViaConsole(phone, code));
      });
      req.write(body);
      req.end();
    } catch (err) {
      console.error(`[SMS] Aliyun exception: ${err.message}`);
      resolve(sendViaConsole(phone, code));
    }
  });
}

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%7E/g, '~')
    .replace(/%20/g, '+');
}

// ====== 腾讯云短信 ======

function sendViaTencent(phone, code) {
  const secretId = process.env.SMS_TENCENT_SECRET_ID;
  const secretKey = process.env.SMS_TENCENT_SECRET_KEY;
  const sdkAppId = process.env.SMS_TENCENT_SDK_APP_ID;
  const sign = process.env.SMS_TENCENT_SIGN;
  const templateId = process.env.SMS_TENCENT_TEMPLATE_ID;

  if (!secretId || !secretKey || !sdkAppId || !sign || !templateId) {
    console.warn('[SMS] Tencent SMS not configured. Set SMS_TENCENT_SECRET_ID, SMS_TENCENT_SECRET_KEY, SMS_TENCENT_SDK_APP_ID, SMS_TENCENT_SIGN, SMS_TENCENT_TEMPLATE_ID');
    return sendViaConsole(phone, code);
  }

  return new Promise((resolve, reject) => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        SmsSdkAppId: sdkAppId,
        SignName: sign,
        TemplateId: templateId,
        TemplateParamSet: [code],
        PhoneNumberSet: ['+86' + phone],
        SessionContext: '',
      });

      const signStr = `TC3-HMAC-SHA256\n${timestamp}\n;content-type;host\n${crypto.createHash('sha256').update(body).digest('hex')}`;
      const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(new Date().toISOString().slice(0, 10)).digest();
      const secretService = crypto.createHmac('sha256', secretDate).update('sms').digest();
      const signingKey = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
      const signature = crypto.createHmac('sha256', signingKey).update(signStr).digest('hex');
      const auth = `TC3-HMAC-SHA256 Credential=${secretId}/${new Date().toISOString().slice(0, 10)}/sms/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`;

      const req = https.request({
        hostname: 'sms.tencentcloudapi.com',
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TC-Action': 'SendSms',
          'X-TC-Version': '2021-01-11',
          'X-TC-Timestamp': String(timestamp),
          'Authorization': auth,
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`[SMS] Tencent response: ${data}`);
          resolve({ success: res.statusCode < 400, data, provider: 'tencent' });
        });
      });
      req.on('error', (err) => {
        console.error(`[SMS] Tencent error: ${err.message}`);
        resolve(sendViaConsole(phone, code));
      });
      req.write(body);
      req.end();
    } catch (err) {
      console.error(`[SMS] Tencent exception: ${err.message}`);
      resolve(sendViaConsole(phone, code));
    }
  });
}

// ====== 通用 Webhook 模式 ======

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
    const sep = url.includes('?') ? '&' : '?';
    url += sep + keyParam + '=' + encodeURIComponent(apiKey);
  }

  return new Promise((resolve) => {
    const caller = url.startsWith('https') ? https : http;
    caller.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[SMS] Webhook response (${res.statusCode}): ${data.slice(0, 200)}`);
        resolve({ success: res.statusCode < 400, provider: 'webhook' });
      });
    }).on('error', (err) => {
      console.error(`[SMS] Webhook error: ${err.message}`);
      resolve(sendViaConsole(phone, code));
    });
  });
}

module.exports = { sendSMS, sendViaConsole };
