'use strict';
// 仅手动运行。凭据从 Issues.txt 读取,不写入测试源码或报告。
// node tools/诊断-视觉接口.cjs            仅 GET 网站首页
// node tools/诊断-视觉接口.cjs --vision   额外发送一次自制 A/7 图片,可能消耗少量额度
// --sample=路径 --expect=中文A7          改用指定测试图片及本地校验期望值
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function samplePng() {
  const width = 280, height = 160;
  const pixels = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  const pixel = (x, y, value) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    pixels.fill(value, offset, offset + 3);
  };
  const draw = (pattern, x, y, scale) => pattern.forEach((row, r) => [...row].forEach((v, c) => {
    if (v !== '1') return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) pixel(x + c * scale + dx, y + r * scale + dy, 0);
  }));
  draw(['01110','10001','10001','11111','10001','10001','10001'], 35, 42, 12);
  draw(['11111','00001','00010','00100','01000','01000','01000'], 175, 42, 12);
  draw(['010','110','010','010','111'], 8, 8, 3);
  draw(['111','001','111','100','111'], 148, 8, 3);
  for (let y = 0; y < height; y++) pixel(139, y, 180);
  const crc = (data) => {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, data) => {
    const type = Buffer.from(name), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, checksum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  const root = path.join(__dirname, '..');
  const issue = fs.readFileSync(path.join(root, 'Issues.txt'), 'utf8');
  const address = issue.match(/https?:\/\/[^\s，。]+/);
  const secret = issue.match(/sk-[A-Za-z0-9_-]+/);
  const model = issue.match(/模型[：:]\s*([^\s，。]+)/);
  if (!address) throw new Error('Issues.txt 未找到测试 API 地址');
  const base = new URL(address[0]);
  if (base.protocol !== 'https:') throw new Error('测试 API 须使用 HTTPS');
  const sanitize = (text) => String(text || '').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 300);
  const home = await fetch(base.origin + '/', { redirect: 'error', signal: AbortSignal.timeout(20000) });
  const homeBody = await home.text();
  console.log(JSON.stringify({ kind: 'homepage', status: home.status, contentType: home.headers.get('content-type'), html: /^\s*(?:<!doctype|<html)/i.test(homeBody), title: sanitize((homeBody.match(/<title>([^<]*)<\/title>/i) || [])[1]) }));
  if (!process.argv.includes('--vision')) return;
  if (!secret || !model) throw new Error('Issues.txt 未找到测试密钥或模型');
  const dom = new JSDOM('', { url: 'https://example.test', runScripts: 'outside-only' });
  const source = fs.readFileSync(path.join(root, '学习通刷课助手.user.js'), 'utf8');
  const prefix = source.slice(0, source.indexOf('  /* ==================== 路由'));
  vm.runInContext(prefix + '\nglobalThis.api = { normalizeChatEndpoint, recognizeBatchViaVisionAI, configure: value => Object.assign(CONFIG, value) };})();', dom.getInternalVMContext());
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, strokeRect() {}, fillText() {} });
  const imageArg = process.argv.find((arg) => arg.startsWith('--sample='));
  const expected = Array.from((process.argv.find((arg) => arg.startsWith('--expect=')) || '--expect=A7').slice(9));
  const png = imageArg ? fs.readFileSync(path.resolve(root, imageArg.slice(9))) : samplePng();
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,' + png.toString('base64');
  dom.window.GM_xmlhttpRequest = (options) => {
    const endpoint = new URL(options.url);
    if (endpoint.origin !== base.origin) throw new Error('请求目标必须与测试地址同源');
    fetch(options.url, { method: options.method, headers: options.headers, body: options.data, redirect: 'error', signal: AbortSignal.timeout(options.timeout) }).then(async (response) => {
      const body = await response.text();
      let payload;
      try { payload = JSON.parse(body); } catch {}
      const choice = payload?.choices?.[0];
      console.log(JSON.stringify({ kind: 'vision-response', path: endpoint.pathname, status: response.status, contentType: response.headers.get('content-type'), json: !!payload, finishReason: choice?.finish_reason, content: sanitize(choice?.message?.content), error: sanitize(payload?.error?.message || payload?.error), usage: payload?.usage }));
      options.onload({ status: response.status, statusText: response.statusText, responseText: body });
    }).catch(() => options.onerror({ error: '网络请求失败或重定向被拒绝' }));
  };
  dom.window.api.configure({ visionUrl: base.href, visionKey: secret[0], visionModel: model[1] });
  const keys = expected.map((_, i) => String.fromCodePoint(0xe001 + i));
  const result = await dom.window.api.recognizeBatchViaVisionAI(keys, 'test');
  const recognized = keys.map((key) => result.get(key) || '?').join('');
  const passed = recognized === expected.join('');
  console.log(JSON.stringify({ kind: 'parsed-result', recognized, expected: expected.join(''), passed }));
  if (!passed) process.exitCode = 1;
  dom.window.close();
}
main().catch((error) => { console.log(JSON.stringify({ error: String(error.message).replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]') })); process.exitCode = 1; });
