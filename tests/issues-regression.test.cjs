'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '..', '学习通刷课助手.user.js'), 'utf8');

function setup(html = '', storedReviews = null) {
  const dom = new JSDOM(html, { url: 'https://example.test/work', runScripts: 'outside-only' });
  const win = dom.window;
  win.document.fonts = new Set();
  if (storedReviews) win.sessionStorage.setItem('cxPendingReviews:current', storedReviews);
  const code = source.slice(0, source.indexOf('  /* ==================== 路由'))
    .replace('const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));', 'const sleep = async () => {};');
  const harness = [
    'const logs = []; log = (msg) => logs.push(msg);',
    'globalThis.testAPI = {',
    'logs, decodeFont, findSecretFontSources, loadSecretFont, parseVisionGlyphs, MiniTypr,',
    'extractQuizQuestion, extractWorkQuestion, workTask, runSingleJobWithVerify, chapterLoop,',
    'cxFetch, recognizeBatchViaVisionAI, recognizeGlyphsViaVisionAI, topLevelQuiz, saveWorkDraft, togglePause,',
    'fontSourceUrls, loadedSecretFont, rememberReview, clearReview, reportPendingReviews, newChapterLoop, startWatch, renderLogLines,',
    'questionRoots, readQuestionTasks, compositeChildren, getAnswers, buildAIPrompt, channelAI, recordQuestion, isOrdinaryLocalFont, recordFontFailure, normalizeChatEndpoint, fontUnicodeContains,',
    'setQuizAnswer, isAnsweredInDom, parseAIAnswer, extractMatchingTask, precedingMaterials, labelledCompositeChildren, showConfigUI,',
    'setLogs: (rows) => { logLines = rows; },',
    'state: () => ({ paused: PAUSED, lastIframeUrl, pending: Array.from(pendingReviews.values()), aiFailCount, aiCooldownUntil }),',
    'config: (values) => Object.assign(CONFIG, values),',
    'stub: (name, value) => { eval(name + " = value"); }',
    '}; })();'
  ].join('\n');
  vm.runInContext(code + '\n' + harness, dom.getInternalVMContext());
  return { win, api: win.testAPI, dom };
}

function font12(codepoints = [0xe001, 0xe002]) {
  const length = 16 + codepoints.length * 12;
  const buffer = Buffer.alloc(28 + 12 + length);
  buffer.writeUInt32BE(0x10000, 0);
  buffer.writeUInt16BE(1, 4);
  buffer.write('cmap', 12);
  buffer.writeUInt32BE(28, 20);
  buffer.writeUInt32BE(12 + length, 24);
  buffer.writeUInt16BE(1, 30);
  buffer.writeUInt16BE(3, 32);
  buffer.writeUInt16BE(10, 34);
  buffer.writeUInt32BE(12, 36);
  buffer.writeUInt16BE(12, 40);
  buffer.writeUInt32BE(length, 44);
  buffer.writeUInt32BE(codepoints.length, 52);
  codepoints.forEach((cp, i) => {
    buffer.writeUInt32BE(cp, 56 + i * 12);
    buffer.writeUInt32BE(cp, 60 + i * 12);
    buffer.writeUInt32BE(i + 1, 64 + i * 12);
  });
  return buffer;
}
const fontMarkup = (content, font = font12()) => '<style>.font-cxsecret { font-family: cxsecret, serif; } @font-face {font-family:cxsecret;src:url(data:font/ttf;base64,' + font.toString('base64') + ');}</style>' + content;

test('class-only ordinary text does not require a font or OCR', async () => {
  const { win, api } = setup('<div class="font-cxsecret">Section A 普通题目</div>');
  api.stub('recognizeGlyphsViaVisionAI', () => { throw new Error('must not call OCR'); });
  assert.equal(await api.decodeFont(win), true);
  assert.equal(win.document.querySelector('div').textContent, 'Section A 普通题目');
});

test('missing fonts with suspicious characters or a secret family stop safely', async () => {
  for (const html of ['<div class="font-cxsecret">&#xe001;</div>', '<div class="font-cxsecret" style="font-family:cxsecret">普通文字</div>']) {
    const { win, api } = setup(html);
    const before = win.document.body.innerHTML;
    assert.equal(await api.decodeFont(win), false);
    assert.equal(win.document.body.innerHTML, before);
  }
});

test('OCR failure preserves original characters, classes, values and node identity', async () => {
  const { win, api } = setup(fontMarkup('<div class="font-cxsecret">&#xe001;<span class="font-cxsecret">&#xe002;</span><input value="saved"><button>go</button></div>'));
  const before = win.document.body.innerHTML;
  const input = win.document.querySelector('input');
  input.value = 'unsaved user edit';
  api.stub('recognizeGlyphsViaVisionAI', async () => new Map([['\ue001', '甲']]));
  assert.equal(await api.decodeFont(win), false);
  assert.equal(win.document.body.innerHTML, before);
  assert.equal(win.document.querySelector('input'), input);
  assert.equal(input.value, 'unsaved user edit');
  assert.equal(win.document.body.textContent.includes('[?]'), false);
});

test('successful decode changes text once without changing handlers or normal-font descendants', async () => {
  const { win, api } = setup(fontMarkup('<div class="font-cxsecret" data-value="&#xe001;">&#xe001;<span class="font-cxsecret">&#xe002;</span><span style="font-family:serif">&#xe001;</span><button>go</button></div>'));
  const button = win.document.querySelector('button');
  let clicks = 0;
  button.addEventListener('click', () => clicks++);
  api.stub('recognizeGlyphsViaVisionAI', async () => new Map([['\ue001', '\ue002'], ['\ue002', '乙']]));
  assert.equal(await api.decodeFont(win), true);
  const root = win.document.querySelector('div');
  assert.equal(root.firstChild.nodeValue, '\ue002');
  assert.equal(root.querySelector('span').textContent, '乙');
  assert.equal(root.querySelectorAll('span')[1].textContent, '\ue001');
  assert.equal(root.getAttribute('data-value'), '\ue001');
  assert.equal(win.document.querySelector('button'), button);
  button.click();
  assert.equal(clicks, 1);
  assert.equal(win.document.querySelectorAll('.font-cxsecret').length, 0);
  assert.equal(win.getComputedStyle(root).fontFamily.includes('cxsecret'), false);
});

test('unmapped characters remain ordinary text without OCR', async () => {
  const { win, api } = setup(fontMarkup('<div class="font-cxsecret">Reading Section B</div>'));
  api.stub('recognizeGlyphsViaVisionAI', () => { throw new Error('must not call OCR'); });
  assert.equal(await api.decodeFont(win), true);
});

test('external CSS font URLs resolve relative to the stylesheet', async () => {
  const { win, api } = setup('<div class="font-cxsecret" style="font-family:cxsecret">&#xe001;</div>');
  Object.defineProperty(win.document, 'styleSheets', { value: [{ href: 'https://cdn.example.test/css/work.css', get cssRules() { throw new Error('cross origin'); } }] });
  const requests = [];
  api.stub('cxFetch', async (url, options) => {
    requests.push([url, options]);
    return options?.responseType === 'arraybuffer' ? Uint8Array.from(font12()).buffer : '@font-face {font-family:cxsecret;src:url(../fonts/test.ttf)}';
  });
  const discovery = await api.findSecretFontSources(win, [win.document.querySelector('div').firstChild]);
  assert.equal(discovery.sources.length, 1);
  await api.loadSecretFont(discovery.sources[0]);
  assert.equal(requests[1][0], 'https://cdn.example.test/fonts/test.ttf');
  assert.equal(requests[1][1].responseType, 'arraybuffer');
});

test('unreadable external CSS is not mistaken for an unencrypted page', async () => {
  const { win, api } = setup('<div class="font-cxsecret">题目</div>');
  Object.defineProperty(win.document, 'styleSheets', { value: [{ href: 'https://cdn.example.test/work.css', get cssRules() { throw new Error('cross origin'); } }] });
  api.stub('cxFetch', async () => { throw new Error('HTTP 403'); });
  assert.equal(await api.decodeFont(win), false);
});

test('font parser rejects unsupported cmap and handles supplementary Unicode', () => {
  const { api } = setup();
  const bytes = font12([0x20000]);
  const parsed = api.MiniTypr.parse(bytes);
  assert.equal(api.MiniTypr.codeToGlyph(parsed, 0x20000), 1);
  assert.equal(api.MiniTypr.codeToGlyph(parsed, 0x41), 0);
  bytes.writeUInt16BE(2, 40);
  assert.throws(() => api.MiniTypr.parse(bytes), /Unicode cmap/);
  assert.throws(() => api.MiniTypr.parse(Buffer.from('wOFFbroken')), /TTF\/OTF/);
});

test('OCR parser preserves numbering, digits and punctuation, rejecting ambiguous glyphs', () => {
  const { api } = setup();
  assert.deepEqual(Array.from(api.parseVisionGlyphs('{"1":"7","2":".","3":"𠀀"}', ['a','b','c']), ([key, value]) => [key, value]), [['a','7'],['b','.'],['c','𠀀']]);
  assert.deepEqual(Array.from(api.parseVisionGlyphs('1:甲 3:丙', ['a','b','c']), ([key, value]) => [key, value]), [['a','甲'],['c','丙']]);
  assert.equal(api.parseVisionGlyphs('1:甲 1:乙', ['a']).size, 0);
  assert.equal(api.parseVisionGlyphs('{"1":"?","2":"无法识别"}', ['a','b']).size, 0);
});

test('long heading includes the following passage and word list', () => {
  const { win, api } = setup('<div class="TiMu"><div class="Zy_TItle">Complete the passage with the appropriate words from the box below.</div><ul><li>alpha</li><li>beta</li></ul><p>' + 'This is the passage that must be read before answering. '.repeat(8) + '</p><textarea></textarea><input name="answertype1" value="2"></div>');
  const q = api.extractQuizQuestion(win.document.querySelector('.TiMu'));
  assert.match(q.question, /alpha beta/);
  assert.match(q.question, /This is the passage/);
});

test('homework extraction retains a stem wrapped by the first span', () => {
  const { win, api } = setup('<div class="questionLi"><div class="mark_name"><span>This is the complete question with enough text to remain the primary stem.</span> (5分)</div><input name="answertype1" value="2"><textarea></textarea></div>');
  assert.match(api.extractWorkQuestion(win.document.querySelector('.questionLi')).question, /This is the complete question/);
});

function quizFixture({ autoSubmit = false, answered = true, extracted = true } = {}) {
  const env = setup();
  const quiz = new JSDOM('<div class="TiMu"></div>', { url: 'https://example.test/quiz' }).window;
  const outerWin = { document: { querySelector: () => ({ contentWindow: quiz }) } };
  let saves = 0, submits = 0;
  quiz.noSubmit = () => { saves++; };
  env.api.config({ autoSubmit, aiEnabled: false });
  env.api.stub('waitIframeLoaded', async () => {});
  env.api.stub('waitElementLoaded', async () => {});
  env.api.stub('extractQuizQuestion', () => extracted ? { type: '2', question: 'a question', options: [] } : null);
  env.api.stub('getAnswers', async () => ['answer']);
  env.api.stub('setQuizAnswer', () => answered);
  env.api.stub('recordQuestion', () => {});
  env.api.stub('isAnsweredInDom', () => answered);
  env.api.stub('clickButtonByText', () => { submits++; return true; });
  env.api.stub('handleSubmitConfirmModal', async () => 'confirmed');
  return { ...env, quiz, frame: { contentWindow: outerWin }, counts: () => ({ saves, submits }) };
}

test('100% coverage with auto-submit off saves once and never submits', async () => {
  const f = quizFixture();
  const alert = f.quiz.alert;
  assert.equal(await f.api.workTask(f.frame), 'awaiting_manual_submit');
  assert.deepEqual(f.counts(), { saves: 1, submits: 0 });
  assert.equal(f.quiz.alert, alert);
  assert(f.api.logs.some((s) => /自动提交已关闭.*100%/.test(s)));
  assert.equal(f.api.logs.some((s) => /低于阈值/.test(s)), false);
});

test('incomplete extraction or filling requires review without submitting', async () => {
  for (const options of [{ extracted: false }, { answered: false }]) {
    const f = quizFixture({ autoSubmit: true, ...options });
    assert.equal(await f.api.workTask(f.frame), 'needs_review');
    assert.deepEqual(f.counts(), { saves: 1, submits: 0 });
  }
});

test('enabled submission still runs when every answer is present', async () => {
  const f = quizFixture({ autoSubmit: true });
  await f.api.workTask(f.frame);
  assert.deepEqual(f.counts(), { saves: 0, submits: 1 });
});

test('manual/review results skip completion retries and false failure warnings', async () => {
  for (const status of ['awaiting_manual_submit', 'needs_review']) {
    const { api } = setup();
    const iframe = { src: '/ananas/modules/work/index.html', getAttribute: () => '{"name":"test"}' };
    const icon = { parentElement: { querySelector: () => iframe } };
    let runs = 0;
    api.stub('isCardContextAlive', () => true);
    api.stub('isTaskFinished', () => false);
    api.stub('workTask', async () => { runs++; return status; });
    assert.equal(await api.runSingleJobWithVerify(icon, {}, ''), status);
    assert.equal(runs, 1);
    assert.equal(api.logs.some((s) => /保底|未完成警告/.test(s)), false);
  }
});

test('pending review allows the chapter loop to continue navigating', async () => {
  const { api } = setup();
  let navigations = 0;
  api.stub('processCurrentCardTab', async () => ({ cardsWin: {}, needsReview: true }));
  api.stub('findNextSubTab', () => { navigations++; });
  api.stub('clickNextSection', () => { navigations++; return true; });
  assert.equal(await api.chapterLoop(), true);
  assert.equal(navigations, 2);
  assert.equal(api.state().paused, false);
});

test('deferred first job does not prevent a second job or chapter navigation', async () => {
  const { win, api } = setup('<iframe id="iframe"></iframe>');
  const cards = win.document.querySelector('#iframe').contentWindow;
  cards.document.body.innerHTML = '<div><span class="ans-job-icon"></span><iframe id="first" src="/ananas/modules/work/index.html"></iframe></div><div><span class="ans-job-icon"></span><iframe id="second" src="/ananas/modules/work/index.html"></iframe></div>';
  api.stub('waitElementLoaded', async () => {});
  api.stub('waitIframeLoaded', async () => {});
  api.stub('isCardContextAlive', () => true);
  api.stub('isTaskFinished', () => false);
  let runs = 0;
  api.stub('workTask', async () => { runs++; return 'awaiting_manual_submit'; });
  api.stub('findNextSubTab', () => null);
  api.stub('clickNextSection', () => true);
  assert.equal(await api.chapterLoop(), true);
  assert.equal(runs, 2);
  assert.equal(api.state().paused, false);
  assert.equal(api.state().pending.length, 2);
});

test('ordinary video completion retry is retained', async () => {
  const { api } = setup();
  const iframe = { src: '/ananas/modules/video/index.html', getAttribute: () => '{"name":"video"}' };
  const icon = { parentElement: { querySelector: () => iframe } };
  const retries = [];
  api.stub('isCardContextAlive', () => true);
  api.stub('isTaskFinished', () => false);
  api.stub('videoTask', async (frame, cards, parent, retry) => retries.push(retry));
  await api.runSingleJobWithVerify(icon, {}, '');
  assert.deepEqual(retries, [false, true]);
});

test('font text fallback ignores image data and handles quoted/unquoted URLs', async () => {
  for (const quote of ['', '"', "'"]) {
    const { win, api } = setup(fontMarkup('<div class="font-cxsecret">&#xe001;</div>'));
    const style = win.document.querySelector('style');
    style.textContent = '.icon {background:url(data:image/png;base64,AAAA)} .font-cxsecret {font-family:cxsecret} @font-face {font-family:cxsecret;src:url(' + quote + 'data:application/octet-stream;base64,' + font12().toString('base64') + quote + ');font-weight:normal;}';
    Object.defineProperty(win.document, 'styleSheets', { value: [] });
    const discovery = await api.findSecretFontSources(win, [win.document.querySelector('div').firstChild]);
    assert.equal(discovery.sources.length, 1);
    assert.deepEqual(Buffer.from(await api.loadSecretFont(discovery.sources[0])), font12());
  }
});

test('top-level quiz stops when decoding fails', async () => {
  const { api } = setup('<div class="font-cxsecret"></div><div class="TiMu"></div>');
  api.stub('decodeFont', async () => false);
  api.stub('getAnswers', () => { throw new Error('must not answer'); });
  assert.equal(await api.topLevelQuiz(), 'needs_review');
});

test('HTTP failures retain the status instead of becoming non-JSON failures', async () => {
  const { win, api } = setup();
  win.GM_xmlhttpRequest = (options) => options.onload({ status: 403, statusText: 'Forbidden', responseText: '' });
  await assert.rejects(api.cxFetch('https://example.test/api'), /HTTP 403 Forbidden/);
});

test('empty and SSE visual responses produce specific errors with stream disabled', async () => {
  const { win, api } = setup();
  win.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, strokeRect() {}, fillText() {} });
  win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,test';
  for (const [response, expected] of [['', /空响应/], ['data: {}', /SSE/]]) {
    api.stub('cxFetch', async (url, options) => {
      assert.equal(JSON.parse(options.data).stream, false);
      return response;
    });
    await assert.rejects(api.recognizeBatchViaVisionAI(['a'], 'test'), expected);
  }
});

test('temporary OCR fonts are released when image requests fail', async () => {
  const { win, api } = setup();
  win.FontFace = class { async load() { return this; } };
  api.config({ visionKey: 'test', visionModel: 'mock' });
  api.stub('recognizeBatchViaVisionAI', async () => { throw new Error('empty response'); });
  assert.equal((await api.recognizeGlyphsViaVisionAI(['a'], font12())).size, 0);
  assert.equal(win.document.fonts.size, 0);
});

test('font URL tokenizer handles spacing, comments, escapes and local fallback', () => {
  const { api } = setup();
  assert.deepEqual(Array.from(api.fontSourceUrls('local("宋体"), URL ( "../fonts/test.ttf" ) format("truetype")')), ['../fonts/test.ttf']);
  assert.deepEqual(Array.from(api.fontSourceUrls('url/**/("../fonts/a\\20 b.ttf")')), ['../fonts/a b.ttf']);
  assert.deepEqual(Array.from(api.fontSourceUrls('local("Arial")')), []);
});

test('local-only secret font decodes through the iframe document when loaded', async () => {
  const { win, api } = setup('<style>@font-face{font-family:cxsecret;src:local("test-face");}.font-cxsecret{font-family:cxsecret,serif}</style><div class="font-cxsecret">&#xe001;</div>');
  win.document.fonts = new Set([{ family: 'cxsecret', status: 'loaded' }]);
  win.document.fonts.load = async () => Array.from(win.document.fonts);
  let rendered = false;
  api.stub('recognizeGlyphsViaVisionAI', async (chars, bytes, existing) => {
    assert.equal(bytes, null);
    assert.equal(existing.document, win.document);
    assert.equal(existing.family, 'cxsecret');
    rendered = true;
    return new Map([['\ue001', '题']]);
  });
  assert.equal(await api.decodeFont(win), true);
  assert.equal(rendered, true);
  assert.equal(win.document.querySelector('div').textContent, '题');
});

test('font loaded dynamically without CSS src is recognized', async () => {
  const { win, api } = setup('<div class="font-cxsecret" style="font-family:cxsecret">&#xe001;</div>');
  win.document.fonts = new Set([{ family: 'cxsecret', status: 'loaded' }]);
  win.document.fonts.load = async () => Array.from(win.document.fonts);
  api.stub('recognizeGlyphsViaVisionAI', async () => new Map([['\ue001', '题']]));
  assert.equal(await api.decodeFont(win), true);
  assert.equal(win.document.querySelector('div').textContent, '题');
});

test('local() with no matching loaded face is not silently rendered with system fallback', async () => {
  const { win, api } = setup('<style>@font-face{font-family:cxsecret;src:local("missing")}</style><div class="font-cxsecret" style="font-family:cxsecret">&#xe001;</div>');
  win.document.fonts.load = async () => [];
  api.stub('recognizeGlyphsViaVisionAI', () => { throw new Error('must not render missing font'); });
  assert.equal(await api.decodeFont(win), false);
  assert.equal(win.document.querySelector('div').textContent, '\ue001');
});

test('inaccessible CSS is fetched even when inline font offers only local()', async () => {
  const { win, api } = setup('<style>@font-face{font-family:cxsecret;src:local("missing")}</style><div class="font-cxsecret" style="font-family:cxsecret">&#xe001;</div>');
  Object.defineProperty(win.document, 'styleSheets', { value: [{ href: 'https://cdn.example.test/main.css', get cssRules() { throw new Error('cross-origin'); } }] });
  api.stub('cxFetch', async () => '@font-face {font-family:cxsecret;src:url(data:font/ttf;base64,' + font12().toString('base64') + ')}');
  const found = await api.findSecretFontSources(win, [win.document.querySelector('div').firstChild]);
  assert(found.sources.some((s) => api.fontSourceUrls(s.source).length));
});

test('normal fallback family does not displace explicit secret font', async () => {
  const { win, api } = setup('<style>@font-face{font-family:serif;src:local("Times")} @font-face{font-family:cxsecret;src:local("Secret")}</style><div class="font-cxsecret" style="font-family:cxsecret,serif">&#xe001;</div>');
  const found = await api.findSecretFontSources(win, [win.document.querySelector('div').firstChild]);
  assert.deepEqual(Array.from(found.sources, (s) => s.family), ['cxsecret']);
});

test('existing page font OCR uses owning document and does not delete the page font', async () => {
  const { win, api } = setup();
  const face = { family: 'cxsecret', status: 'loaded' };
  win.document.fonts.add(face);
  api.config({ visionKey: 'test', visionModel: 'mock' });
  api.stub('recognizeBatchViaVisionAI', async (chars, family, doc) => {
    assert.equal(family, 'cxsecret');
    assert.equal(doc, win.document);
    return new Map([['x', '题']]);
  });
  const result = await api.recognizeGlyphsViaVisionAI(['x'], null, { family: 'cxsecret', document: win.document });
  assert.equal(result.get('x'), '题');
  assert.equal(win.document.fonts.has(face), true);
});

test('decode failure attempts to save and returns review status without asking the answer model', async () => {
  const f = quizFixture();
  f.quiz.document.body.innerHTML = '<div class="TiMu font-cxsecret">&#xe001;</div>';
  f.api.stub('decodeFont', async () => false);
  f.api.stub('getAnswers', () => { throw new Error('must not answer'); });
  assert.equal(await f.api.workTask(f.frame), 'needs_review');
  assert.deepEqual(f.counts(), { saves: 1, submits: 0 });
});

test('review summary deduplicates tasks, separates chapters and omits URL secrets', () => {
  const { win, api } = setup();
  const url = 'https://example.test/cards?courseId=1&chapterId=2&enc=secret-token&openc=other-secret';
  api.rememberReview('Section A', url, 'needs_review', 'j1');
  api.rememberReview('Section A', url, 'awaiting_manual_submit', 'j1');
  api.rememberReview('Section A', url.replace('chapterId=2', 'chapterId=3'), 'needs_review', 'j1');
  assert.equal(api.state().pending.length, 2);
  api.reportPendingReviews();
  assert.match(api.logs.at(-1), /待检查 2 个任务点/);
  assert.match(api.logs.at(-1), /chapterId=2/);
  assert.match(api.logs.at(-1), /chapterId=3/);
  assert.equal(api.logs.at(-1).includes('secret'), false);
  assert.equal(win.sessionStorage.getItem('cxPendingReviews:current').includes('secret'), false);
  api.clearReview('Section A', url, 'j1');
  assert.equal(api.state().pending.length, 1);
});

test('modern card keeps processing media after a deferred top-level quiz', async () => {
  const { api } = setup();
  const img = { src: '/ananas/modules/img/index.html' };
  const cardsWin = { document: { body: { textContent: '' }, querySelectorAll: () => [img] } };
  let images = 0;
  api.config({ autoWork: false, autoVideo: false });
  api.stub('topLevelQuiz', async () => 'needs_review');
  api.stub('isCardContextAlive', () => true);
  api.stub('imageTask', async () => { images++; });
  await api.newChapterLoop(cardsWin, 'https://example.test/cards?chapterId=2');
  assert.equal(images, 1);
  assert.equal(api.state().pending.length, 1);
  assert.equal(api.state().paused, false);
});

test('watch loop emits pending summary only when navigation ends', async () => {
  const { win, api } = setup('<iframe id="iframe"></iframe>');
  Object.defineProperty(win.document.querySelector('#iframe'), 'contentWindow', { value: { location: { href: 'https://example.test/cards?chapterId=4' } } });
  let tick;
  win.setInterval = (callback) => { tick = callback; return 1; };
  api.stub('initPanel', () => {});
  api.stub('enableBackgroundPlay', () => {});
  api.rememberReview('Section B', 'https://example.test/cards?chapterId=4', 'needs_review');
  api.stub('chapterLoop', async () => true);
  api.startWatch();
  await tick();
  assert.equal(api.logs.some((s) => s.startsWith('📋')), false);
  api.stub('chapterLoop', async () => false);
  await tick();
  assert(api.logs.some((s) => /📋 本轮自动遍历结束.*待检查 1/.test(s)));
  assert.equal(api.state().paused, false);
});

test('completed tasks disappear from the pending review list', async () => {
  const { api } = setup();
  const url = 'https://example.test/cards?chapterId=1';
  api.rememberReview('quiz', url, 'needs_review', 'job1');
  const iframe = { src: '/ananas/modules/work/index.html', getAttribute: () => '{"name":"quiz","jobid":"job1"}' };
  const icon = { parentElement: { querySelector: () => iframe } };
  api.stub('isCardContextAlive', () => true);
  let checks = 0;
  api.stub('isTaskFinished', () => ++checks > 1);
  api.stub('workTask', async () => undefined);
  await api.runSingleJobWithVerify(icon, {}, url);
  assert.equal(api.state().pending.length, 0);
});

test('stored review list survives page reload within the session', () => {
  const { win, api } = setup();
  api.rememberReview('Section C', 'https://example.test/cards?knowledgeid=8&enc=private', 'needs_review');
  const stored = win.sessionStorage.getItem('cxPendingReviews:current');
  const reloaded = setup('', stored);
  assert.equal(reloaded.api.state().pending.length, 1);
  reloaded.api.reportPendingReviews();
  assert.match(reloaded.api.logs.at(-1), /Section C/);
  assert.match(reloaded.api.logs.at(-1), /chapterId=8/);
});

test('summary logs render as escaped multiline text', () => {
  const { win, api } = setup('<div id="logs"></div>');
  api.setLogs([{ level: 'warn', line: 'First\n<img src=x onerror=alert(1)> & task' }]);
  const root = win.document.querySelector('#logs');
  root.innerHTML = api.renderLogLines();
  assert.equal(root.querySelector('img'), null);
  assert.equal(root.textContent, 'First\n<img src=x onerror=alert(1)> & task');
  assert.equal(root.firstChild.style.whiteSpace, 'pre-wrap');
});

test('standard local fonts do not block readable questions or trigger OCR', async () => {
  for (const family of ['Arial', 'Times New Roman', '宋体']) {
    const { win, api } = setup('<style>@font-face{font-family:"' + family + '";src:local("' + family + '");}</style><div class="font-cxsecret" style="font-family:\'' + family + '\'">Understanding the main idea</div>');
    win.document.fonts = new Set([{ family, status: 'unloaded' }]);
    win.document.fonts.load = async () => [];
    api.stub('recognizeGlyphsViaVisionAI', () => { throw new Error('ordinary font must not require OCR'); });
    assert.equal(await api.decodeFont(win), true);
    assert.equal(win.document.querySelector('div').textContent, 'Understanding the main idea');
    assert.equal(api.logs.some((line) => /字体二进制与页面字体均不可用/.test(line)), false);
  }
});

test('cxsecret alias of a standard local font is ordinary but private-use text stays blocked', async () => {
  const html = '<style>@font-face{font-family:cxsecret;src:local("Arial")}.font-cxsecret{font-family:cxsecret}</style><div class="font-cxsecret">';
  const ordinary = setup(html + 'Reading Comprehension</div>');
  assert.equal(await ordinary.api.decodeFont(ordinary.win), true);
  const unresolved = setup(html + '&#xe001;</div>');
  assert.equal(await unresolved.api.decodeFont(unresolved.win), false);
});

test('a remote font alternative prevents local-font bypass', async () => {
  const { win, api } = setup('<style>@font-face{font-family:cxsecret;src:local("Arial"),url(/secret.ttf)}.font-cxsecret{font-family:cxsecret}</style><div class="font-cxsecret">plain</div>');
  assert.equal(api.isOrdinaryLocalFont('local("Arial"), url(/secret.ttf)'), false);
  api.stub('cxFetch', async () => { throw new Error('offline'); });
  assert.equal(await api.decodeFont(win), false);
});

test('an unused secret font does not block ordinary marked text', async () => {
  const { win, api } = setup('<style>@font-face{font-family:cxsecret;src:local("missing")}</style><div class="font-cxsecret" style="font-family:Arial">A normal question</div>');
  assert.equal(await api.decodeFont(win), true);
});

const childHtml = (id, title, nested = true) => '<div class="' + (nested ? 'TiMu' : 'sub-question') + '"><input name="answertype' + id + '" value="0"><div class="Zy_TItle">' + title + '</div><ul><li><input type="radio" name="answer' + id + '" value="A"><span class="after">Choice ' + id + ' A</span></li><li><input type="radio" name="answer' + id + '" value="B"><span class="after">Choice ' + id + ' B</span></li></ul></div>';
const readingHtml = (nested = true, type = '15') => '<div class="TiMu"><input name="answertypeGroup" value="' + type + '"><div class="Zy_TItle">Read the passage and choose the answers.</div><p>Shared passage: a visitor learns how to communicate politely.</p>' + childHtml('1', 'What did the visitor learn?', nested) + childHtml('2', 'How did the visitor communicate?', nested) + '</div>';

test('nested reading questions become separate choice questions with the shared passage', () => {
  const { win, api } = setup(readingHtml());
  const roots = api.questionRoots(win.document);
  assert.equal(roots.length, 1);
  const tasks = api.readQuestionTasks(roots);
  assert.equal(tasks.length, 2);
  tasks.forEach(({ q }, i) => {
    assert.equal(q.type, '0');
    assert.equal(q.parentType, '15');
    assert.equal(q.subIndex, i + 1);
    assert.equal(q.options.length, 2);
    assert.equal(q.blockedReason, undefined);
    assert.match(q.question, /Shared passage/);
    const prompt = api.buildAIPrompt(q);
    assert.match(prompt, /单选题/);
    assert.match(prompt, /选项:/);
    assert.equal(prompt.includes('简答题'), false);
  });
  assert.match(tasks[0].q.question, /What did the visitor learn/);
  assert.equal(tasks[0].q.question.includes('How did the visitor communicate'), false);
  assert.equal(tasks[1].q.question.includes('What did the visitor learn'), false);
});

test('composite children with no TiMu class are found through their type fields', () => {
  const { win, api } = setup(readingHtml(false));
  const tasks = api.readQuestionTasks(api.questionRoots(win.document));
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].q.blockedReason, undefined);
  assert.match(tasks[1].q.question, /How did the visitor communicate/);
});

test('composite children can be isolated by native radio groups', () => {
  const { win, api } = setup(readingHtml(false).replace(/<input name="answertype[12]" value="0">/g, ''));
  const tasks = api.readQuestionTasks(api.questionRoots(win.document));
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].q.type, '0');
  assert.equal(tasks[0].q.blockedReason, undefined);
});

test('flat composite options are not invented into missing child stems', async () => {
  const { win, api } = setup('<div class="TiMu"><input name="answertypeGroup" value="15"><div class="Zy_TItle">A reading passage</div><ul><li>first choice</li><li>second choice</li></ul></div>');
  const tasks = api.readQuestionTasks(api.questionRoots(win.document));
  assert.equal(tasks.length, 1);
  assert.match(tasks[0].q.blockedReason, /未找到独立子题/);
  api.config({ aiEnabled: true, aiKey: 'test' });
  api.stub('channelAI', () => { throw new Error('must not send incomplete composite'); });
  assert.equal((await api.getAnswers(tasks[0].q)).length, 0);
});

test('audio-only composites are explicitly deferred without fabricating a transcript', async () => {
  const { win, api } = setup(readingHtml(true, '19'));
  const tasks = api.readQuestionTasks(api.questionRoots(win.document));
  assert.equal(tasks.length, 2);
  assert.match(tasks[0].q.blockedReason, /听力原文/);
  api.config({ aiEnabled: true, aiKey: 'test' });
  api.stub('channelAI', () => { throw new Error('no audio transcript'); });
  assert.equal((await api.getAnswers(tasks[0].q)).length, 0);
});

test('reasoning-only model responses never become answer text', async () => {
  const { win, api } = setup();
  api.config({ aiEnabled: true, aiKey: 'test' });
  win.GM_xmlhttpRequest = (options) => options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: '', reasoning_content: 'Long internal discussion ending with a possible answer.' } }] }) });
  const result = await api.channelAI({ type: '2', question: 'Complete the blank.', options: [] });
  assert.equal(result.answer.length, 0);
  assert(api.logs.some((line) => line.includes('仅返回思考过程')));
});

test('new exported questions identify version, time and parent group', () => {
  const { win, api } = setup();
  api.recordQuestion({ type: '0', question: 'Child question', options: ['a', 'b'], parentType: '15', subIndex: 1 }, ['A']);
  const saved = JSON.parse(win.localStorage.getItem('cxQuestions'));
  assert.equal(saved.at(-1).parentType, '15');
  assert.equal(saved.at(-1).subIndex, 1);
  assert.match(saved.at(-1).v, /^1\.0\./);
  assert.equal(Number.isNaN(Date.parse(saved.at(-1).at)), false);
});

test('reading quiz fills each native radio group once and saves without submitting', async () => {
  const { win, api } = setup(readingHtml());
  const seen = [];
  let saves = 0;
  win.noSubmit = () => { saves++; };
  api.config({ aiEnabled: true, aiKey: 'test', autoSubmit: false });
  api.stub('waitIframeLoaded', async () => {});
  api.stub('waitElementLoaded', async () => {});
  api.stub('channelAI', async (q) => { seen.push(q); return { answer: [q.subIndex === 1 ? 'A' : 'B'] }; });
  const frame = { contentWindow: { document: { querySelector: () => ({ contentWindow: win }) } } };
  assert.equal(await api.workTask(frame), 'awaiting_manual_submit');
  assert.equal(seen.length, 2);
  assert(seen.every((q) => q.type === '0' && q.options.length === 2));
  assert.equal(win.document.querySelector('input[name=answer1][value=A]').checked, true);
  assert.equal(win.document.querySelector('input[name=answer2][value=B]').checked, true);
  assert.equal(saves, 1);
  assert(api.logs.some((line) => /覆盖率 100%/.test(line)));
});

test('missing second child answer prevents submission after the first child succeeds', async () => {
  const { win, api } = setup(readingHtml());
  let saves = 0, submits = 0;
  win.noSubmit = () => { saves++; };
  api.config({ aiEnabled: true, aiKey: 'test', autoSubmit: true });
  api.stub('waitIframeLoaded', async () => {});
  api.stub('waitElementLoaded', async () => {});
  api.stub('channelAI', async (q) => ({ answer: q.subIndex === 1 ? ['A'] : [] }));
  api.stub('clickButtonByText', () => { submits++; return true; });
  const frame = { contentWindow: { document: { querySelector: () => ({ contentWindow: win }) } } };
  assert.equal(await api.workTask(frame), 'needs_review');
  assert.equal(saves, 1);
  assert.equal(submits, 0);
  assert.equal(win.document.querySelector('input[name=answer1][value=A]').checked, true);
  assert.equal(win.document.querySelectorAll('input[name=answer2]:checked').length, 0);
});

test('parent type after nested children and id-only type fields are read correctly', () => {
  const html = readingHtml().replace('<input name="answertypeGroup" value="15">', '').replace(/<\/div>$/, '<input id="answertypeGroup" value="15"></div>');
  const { win, api } = setup(html);
  const tasks = api.readQuestionTasks(api.questionRoots(win.document));
  assert.equal(tasks.length, 2);
  assert(tasks.every((task) => task.q.parentType === '15'));
});

test('missing child stem is not reconstructed from its option labels', () => {
  const html = readingHtml().replace('<div class="Zy_TItle">What did the visitor learn?</div>', '').replace(/<span class="after">(Choice 1 [AB])<\/span>/g, '$1');
  const { win, api } = setup(html);
  const tasks = api.readQuestionTasks(api.questionRoots(win.document));
  assert.equal(tasks.length, 2);
  assert.match(tasks[0].q.blockedReason, /题干缺失/);
});

test('unmapped option text blocks answer lookup even when the stem is readable', async () => {
  const { api } = setup();
  api.config({ aiEnabled: true, aiKey: 'test' });
  api.stub('channelAI', () => { throw new Error('unreadable option must not be answered'); });
  assert.equal((await api.getAnswers({ type: '0', question: 'Choose one.', options: ['readable', '\ue001'] })).length, 0);
});

test('font failure export contains current diagnostics but no source URL or credentials', async () => {
  const { win, api } = setup('<style>@font-face{font-family:cxsecret;src:url(https://cdn.example.test/font.ttf?enc=private-token)}.font-cxsecret,.font-cxsecret *{font-family:cxsecret}</style><div class="TiMu font-cxsecret"><input name="answertype1" value="2"><div class="Zy_TItle">&#xe001;</div><textarea></textarea></div>');
  api.stub('cxFetch', async () => { throw new Error('offline'); });
  assert.equal(await api.decodeFont(win), false);
  api.recordFontFailure(win);
  const savedText = win.localStorage.getItem('cxQuestions');
  const saved = JSON.parse(savedText).at(-1);
  assert.match(saved.blockedReason, /未经解码/);
  assert.equal(saved.fontDiagnostics.candidates[0].urlCount, 1);
  assert.deepEqual(saved.structure.typeFields, ['2']);
  assert.equal(savedText.includes('private-token'), false);
  assert.equal(savedText.includes('cdn.example.test'), false);
});

test('base API addresses are normalized without duplicating complete endpoints', () => {
  const { api } = setup();
  for (const [base, expected] of [
    ['https://gateway.test/', 'https://gateway.test/v1/chat/completions'],
    ['https://gateway.test/v1/', 'https://gateway.test/v1/chat/completions'],
    ['https://gateway.test/v1/chat/completions/', 'https://gateway.test/v1/chat/completions'],
    ['https://gateway.test/chat/completions', 'https://gateway.test/chat/completions'],
    ['https://gateway.test/api/paas/v4', 'https://gateway.test/api/paas/v4/chat/completions']
  ]) assert.equal(api.normalizeChatEndpoint(base), expected);
  assert.throws(() => api.normalizeChatEndpoint('https://gateway.test/v1/responses'), /Chat Completions/);
});

test('vision root URL uses normalized endpoint and recognizes all returned test glyphs', async () => {
  const { win, api } = setup();
  win.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, strokeRect() {}, fillText() {} });
  win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,test';
  api.config({ visionUrl: 'https://gateway.test/', visionKey: 'test', visionModel: 'mock' });
  api.stub('cxFetch', async (url, options) => {
    assert.equal(url, 'https://gateway.test/v1/chat/completions');
    const body = JSON.parse(options.data);
    assert.equal(body.stream, false);
    assert.equal(body.messages[0].content[1].type, 'image_url');
    return JSON.stringify({ choices: [{ message: { content: '{"1":"中","2":"文","3":"A","4":"7"}' } }] });
  });
  const result = await api.recognizeBatchViaVisionAI(['a','b','c','d'], 'test');
  assert.equal(Array.from(result.values()).join(''), '中文A7');
});

test('HTML gateway response identifies a wrong API route without exposing the page body', async () => {
  const { win, api } = setup();
  win.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, strokeRect() {}, fillText() {} });
  win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,test';
  api.stub('cxFetch', async () => '<!doctype html><html>private page body</html>');
  await assert.rejects(api.recognizeBatchViaVisionAI(['a'], 'test'), (error) => /HTML.*chat\/completions/.test(error.message) && !error.message.includes('private page body'));
});

test('font Unicode ranges support intervals and wildcard groups conservatively', () => {
  const { api } = setup();
  assert.equal(api.fontUnicodeContains('U+2018-2019,U+201C-201D', 'A'), false);
  assert.equal(api.fontUnicodeContains('U+2018-2019,U+201C-201D', '’'), true);
  assert.equal(api.fontUnicodeContains('U+4??', String.fromCodePoint(0x4ff)), true);
  assert.equal(api.fontUnicodeContains('U+4??', '中'), false);
  assert.equal(api.fontUnicodeContains('bad-range', 'A'), true);
});

test('quote-only cxchinesequote does not block ASCII text even when no face loads', async () => {
  const range = 'U+2018-2019,U+201C-201D';
  const { win, api } = setup('<style>@font-face{font-family:CxChineseQuote;src:local("unknown local quote");unicode-range:' + range + '}</style><div class="font-cxsecret" style="font-family:CxChineseQuote,Arial">Reading Comprehension</div>');
  win.document.fonts = new Set([{ family: 'CxChineseQuote', unicodeRange: range, status: 'unloaded' }]);
  win.document.fonts.load = () => { throw new Error('out of range font should never load'); };
  assert.equal(await api.decodeFont(win), true);
  assert(api.logs.some((line) => /字符范围未覆盖/.test(line)));
});

test('verified local quote typography preserves curly quotes without OCR', async () => {
  const { win, api } = setup('<style>@font-face{font-family:CxChineseQuote;src:local("Quote Font");unicode-range:U+2018-2019,U+201C-201D}</style><div class="font-cxsecret" style="font-family:CxChineseQuote,Arial">It’s a method.</div>');
  api.stub('recognizeGlyphsViaVisionAI', () => { throw new Error('typographic quotes need no OCR'); });
  assert.equal(await api.decodeFont(win), true);
  assert.equal(win.document.querySelector('div').textContent, 'It’s a method.');
});

test('quote font with broad/unknown range or remote source still requires verification', async () => {
  for (const rule of ['src:local("Quote Font");unicode-range:U+0-10FFFF', 'src:url(/real-secret.ttf);unicode-range:U+2019']) {
    const { win, api } = setup('<style>@font-face{font-family:CxChineseQuote;' + rule + '}</style><div class="font-cxsecret" style="font-family:CxChineseQuote">It’s a method.</div>');
    api.stub('cxFetch', async () => { throw new Error('offline'); });
    assert.equal(await api.decodeFont(win), false);
  }
});

const customChild = (id, qtype = '0') => '<section class="subquestion"><p>What is the answer for item ' + id + '?</p>' +
  ['A', 'B', 'C', 'D'].map((letter) => '<div qid="' + id + '" qtype="' + qtype + '"><span class="num_option" data="' + letter + '">' + letter + '</span><span>Item ' + id + ' choice ' + letter + '</span></div>').join('') + '</section>';

test('reading groups with only qid/qtype controls are split into correct subquestions', async () => {
  const html = '<input type="hidden" id="answer101"><input type="hidden" id="answer102"><div class="TiMu"><input name="answertypeRoot" value="15"><p>Shared passage about navigation satellites and their uses.</p>' + customChild('101') + customChild('102') + '</div>';
  const { win, api } = setup(html);
  let saves = 0;
  win.noSubmit = () => { saves++; };
  win.document.querySelectorAll('[qid][qtype]').forEach((node) => node.addEventListener('click', () => {
    const id = node.getAttribute('qid');
    win.document.querySelectorAll('[qid="' + id + '"]').forEach((peer) => peer.classList.remove('check_answer'));
    node.classList.add('check_answer');
    win.document.getElementById('answer' + id).value = node.querySelector('[data]').getAttribute('data');
  }));
  const tasks = api.readQuestionTasks(api.questionRoots(win.document));
  assert.equal(tasks.length, 2);
  assert.deepEqual(Array.from(tasks[0].q.options), ['Item 101 choice A', 'Item 101 choice B', 'Item 101 choice C', 'Item 101 choice D']);
  assert.equal(tasks[0].q.question.includes('Item 101 choice'), false);
  assert.equal(tasks[0].q.question.includes('item 102'), false);
  api.config({ aiEnabled: true, aiKey: 'test', autoSubmit: false });
  api.stub('waitIframeLoaded', async () => {});
  api.stub('waitElementLoaded', async () => {});
  api.stub('channelAI', async (q) => ({ answer: [q.subIndex === 1 ? 'B' : 'D'] }));
  const frame = { contentWindow: { document: { querySelector: () => ({ contentWindow: win }) } } };
  assert.equal(await api.workTask(frame), 'awaiting_manual_submit');
  assert.equal(win.document.getElementById('answer101').value, 'B');
  assert.equal(win.document.getElementById('answer102').value, 'D');
  assert.equal(saves, 1);
});

const synthetic = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic-questions.json'), 'utf8'));
const htmlEscape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function matchingMarkup(withPassage = true) {
  return (withPassage ? '<article>' + htmlEscape(synthetic.matchingPassage).replace(/\n/g, '<br>') + '</article>' : '') +
    '<div class="TiMu"><input name="answertypeMatch" value="11"><div class="Zy_TItle">Below are the sentences missing from the passage. Put them back to complete the passage.</div>' +
    '<ul><li>第一组数据</li>' + synthetic.left.map((item) => '<li>' + item.id + '、 ' + htmlEscape(item.text) + '</li>').join('') + '</ul>' +
    '<ul><li>第二组数据</li>' + synthetic.right.map((item) => '<li>' + item.id + '、 ' + item.text + '</li>').join('') + '</ul>' +
    '<div>连线答案</div><p>提示：请在下拉框中选择第一组数据对应的正确答案</p>' +
    synthetic.left.map((item) => '<label>' + item.id + '<select name="match' + item.id + '"><option value="">请选择</option>' + synthetic.right.map((choice, i) => '<option value="server-' + (20 + i) + '">' + choice.id + '</option>').join('') + '</select></label>').join('') + '</div>';
}

function labelledReadingMarkup() {
  return '<div class="TiMu"><input name="answertypeReading" value="15"><div class="Zy_TItle">' + htmlEscape(synthetic.readingPassage).replace(/\n/g, '<br>') + '</div>' +
    synthetic.readingQuestions.map((q) => '<h3><span>(' + q.id + ') [单选题]</span> ' + htmlEscape(q.stem) + '</h3>' +
      '<ul>' + q.options.map((option, i) => '<li role="radio" aria-checked="false"><span class="num_option">' + String.fromCharCode(65 + i) + '</span><span class="after">' + htmlEscape(option) + '</span></li>').join('') + '</ul>').join('') + '</div>';
}

test('synthetic matching question reads all five sentences and the preceding passage', () => {
  const { win, api } = setup(matchingMarkup());
  const tasks = api.readQuestionTasks(api.questionRoots(win.document));
  assert.equal(tasks.length, 1);
  const q = tasks[0].q;
  assert.equal(q.blockedReason, undefined);
  assert.equal(q.matching.left.length, 5);
  assert.equal(q.matching.right.length, 5);
  assert(q.question.includes(synthetic.title));
  assert.match(q.question, /\[Blank A\]/);
  assert.match(q.question, /\[Blank E\]/);
  assert.equal((q.question.match(/\[Blank [A-E]\]/g) || []).length, 5);
  const prompt = api.buildAIPrompt(q);
  assert.match(prompt, /第一组→第二组/);
  assert(prompt.includes(synthetic.left[0].text));
  assert(prompt.includes(synthetic.left[4].text));
});

test('matching answer maps labels to actual option values and dispatches events', () => {
  const { win, api } = setup(matchingMarkup());
  const { q, el } = api.readQuestionTasks(api.questionRoots(win.document))[0];
  let changes = 0;
  el.querySelectorAll('select').forEach((select) => select.addEventListener('change', () => changes++));
  // 这是填写映射用的桩答案,测试不调用模型。
  assert.equal(api.setQuizAnswer(['E','B','A','D','C'], q, el, win), true);
  assert.deepEqual(Array.from(el.querySelectorAll('select'), (select) => select.value), ['server-24','server-21','server-20','server-23','server-22']);
  assert.equal(changes, 5);
  assert.equal(api.isAnsweredInDom(el, q, win), true);
  el.querySelector('select').value = 'server-20';
  assert.equal(api.isAnsweredInDom(el, q, win), false);
});

test('matching answers are fully validated before any dropdown changes', () => {
  const { win, api } = setup(matchingMarkup());
  const { q, el } = api.readQuestionTasks(api.questionRoots(win.document))[0];
  for (const answers of [['A'], ['A','B','C','D','Z'], ['A','B','C','D','E','F']]) {
    assert.equal(api.setQuizAnswer(answers, q, el, win), false);
    assert(Array.from(el.querySelectorAll('select')).every((select) => select.value === ''));
  }
  assert.equal(api.parseAIAnswer('11', '1:E 2:B 3:A 4:D 5:C').length, 0);
  assert.deepEqual(Array.from(api.parseAIAnswer('11', 'E|B|A|D|C')), ['E','B','A','D','C']);
});

test('matching with missing passage or a wrong dropdown count is deferred', async () => {
  for (const html of [matchingMarkup(false), matchingMarkup().replace(/<label>5[\s\S]*?<\/label>/, '')]) {
    const { win, api } = setup(html);
    const { q } = api.readQuestionTasks(api.questionRoots(win.document))[0];
    assert(q.blockedReason);
    api.config({ aiEnabled: true, aiKey: 'test' });
    api.stub('channelAI', () => { throw new Error('incomplete matching material'); });
    assert.equal((await api.getAnswers(q)).length, 0);
  }
});

test('matching can read a passage before the outer task iframe', () => {
  const outer = new JSDOM('<article>' + htmlEscape(synthetic.matchingPassage) + '</article><div><iframe id="task"></iframe></div>').window;
  const { win, api } = setup(matchingMarkup(false));
  const tasks = api.readQuestionTasks(api.questionRoots(win.document), { materialAnchors: [outer.document.querySelector('#task')] });
  assert.equal(tasks[0].q.blockedReason, undefined);
  assert(tasks[0].q.question.includes(synthetic.title));
});

test('synthetic reading question splits into five live ranges without qid or radio inputs', () => {
  const { win, api } = setup(labelledReadingMarkup());
  const tasks = api.readQuestionTasks(api.questionRoots(win.document));
  assert.equal(tasks.length, 5);
  tasks.forEach(({ q, el }, i) => {
    assert.equal(q.type, '0');
    assert.equal(q.blockedReason, undefined);
    assert.equal(q.options.length, 4);
    assert(q.question.includes(synthetic.readingPassage));
    assert(q.question.includes(synthetic.readingQuestions[i].stem));
    synthetic.readingQuestions.forEach((other, j) => { if (i !== j) assert.equal(q.question.includes(other.stem), false); });
    assert.equal(el.querySelectorAll('li').length, 4);
    assert.equal(el.querySelector('li').isConnected, true);
  });
});

test('reading range answers select only their own live options and pass final readback', async () => {
  const { win, api } = setup(labelledReadingMarkup());
  win.document.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => {
    Array.from(li.parentElement.children).forEach((peer) => peer.setAttribute('aria-checked', peer === li ? 'true' : 'false'));
  }));
  let saves = 0, requests = 0;
  win.noSubmit = () => { saves++; };
  api.config({ aiEnabled: true, aiKey: 'test', autoSubmit: false });
  api.stub('waitIframeLoaded', async () => {});
  api.stub('waitElementLoaded', async () => {});
  api.stub('channelAI', async (q) => { requests++; return { answer: [['D','C','A','D','B'][q.subIndex - 1]] }; });
  const frame = { contentWindow: { document: { querySelector: () => ({ contentWindow: win }) } } };
  assert.equal(await api.workTask(frame), 'awaiting_manual_submit');
  assert.equal(requests, 5);
  assert.equal(saves, 1);
  assert.equal(win.document.querySelectorAll('li[aria-checked=true]').length, 5);
  assert.deepEqual(Array.from(win.document.querySelectorAll('li[aria-checked=true] .num_option'), (node) => node.textContent), ['D','C','A','D','B']);
});

test('missing or duplicated reading subquestion numbers cannot pass the fallback', () => {
  for (const html of [labelledReadingMarkup().replace('(3) [单选题]', '(4) [单选题]'), labelledReadingMarkup().replace('(3) [单选题]', '')]) {
    const { win, api } = setup(html);
    const tasks = api.readQuestionTasks(api.questionRoots(win.document));
    assert.equal(tasks.length, 1);
    assert(tasks[0].q.blockedReason);
  }
});

test('complete matching work saves once after all five dropdown values are written', async () => {
  const { win, api } = setup(matchingMarkup());
  let saves = 0, submits = 0, requests = 0;
  win.noSubmit = () => {
    assert(Array.from(win.document.querySelectorAll('select')).every((select) => select.value));
    saves++;
  };
  api.config({ aiEnabled: true, aiKey: 'test', autoSubmit: false });
  api.stub('waitIframeLoaded', async () => {});
  api.stub('waitElementLoaded', async () => {});
  api.stub('channelAI', async (q) => {
    requests++;
    assert.equal(q.type, '11');
    assert(q.question.includes(synthetic.title));
    return { answer: ['E','B','A','D','C'] };
  });
  api.stub('clickButtonByText', () => { submits++; return true; });
  const frame = { contentWindow: { document: { querySelector: () => ({ contentWindow: win }) } } };
  assert.equal(await api.workTask(frame), 'awaiting_manual_submit');
  assert.equal(requests, 1);
  assert.equal(saves, 1);
  assert.equal(submits, 0);
  const exported = JSON.parse(win.localStorage.getItem('cxQuestions')).at(-1);
  assert.equal(exported.matchingGroups.left.length, 5);
  assert.equal(exported.structure.selectCount, 5);
});

test('matching work uses material before the real task frame when the quiz has no passage', async () => {
  const { win, api } = setup(matchingMarkup(false));
  const outer = new JSDOM('<article>' + htmlEscape(synthetic.matchingPassage) + '</article><iframe id="task"></iframe>').window;
  const frame = outer.document.querySelector('#task');
  Object.defineProperty(frame, 'contentWindow', { value: { document: { querySelector: () => ({ contentWindow: win }) } } });
  api.config({ aiEnabled: true, aiKey: 'test', autoSubmit: false });
  win.noSubmit = () => {};
  api.stub('waitIframeLoaded', async () => {});
  api.stub('waitElementLoaded', async () => {});
  api.stub('channelAI', async (q) => {
    assert(q.question.includes(synthetic.title));
    return { answer: ['E','B','A','D','C'] };
  });
  assert.equal(await api.workTask(frame, outer), 'awaiting_manual_submit');
});

test('changed matching dropdown definitions are rejected before writing', () => {
  const { win, api } = setup(matchingMarkup());
  const { q, el } = api.readQuestionTasks(api.questionRoots(win.document))[0];
  el.querySelector('option[value=server-24]').value = 'new-value';
  assert.equal(api.setQuizAnswer(['E','B','A','D','C'], q, el, win), false);
  assert(Array.from(el.querySelectorAll('select')).every((select) => select.value === ''));
});

test('matching change handler reverting a value fails verification and prevents submission', async () => {
  const { win, api } = setup(matchingMarkup());
  win.document.querySelector('select').addEventListener('change', (event) => { event.target.value = ''; });
  let submits = 0;
  win.noSubmit = () => {};
  api.config({ aiEnabled: true, aiKey: 'test', autoSubmit: true });
  api.stub('waitIframeLoaded', async () => {});
  api.stub('waitElementLoaded', async () => {});
  api.stub('channelAI', async () => ({ answer: ['E','B','A','D','C'] }));
  api.stub('clickButtonByText', () => { submits++; return true; });
  const frame = { contentWindow: { document: { querySelector: () => ({ contentWindow: win }) } } };
  assert.equal(await api.workTask(frame), 'needs_review');
  assert.equal(submits, 0);
});

test('matching refuses ambiguous or still-encrypted preceding passages', () => {
  const ambiguous = '<article>' + htmlEscape(synthetic.matchingPassage.replace(synthetic.title, 'An unrelated reading')) + '</article>' + matchingMarkup();
  const encrypted = matchingMarkup().replace('<article>', '<article class="font-cxsecret" style="font-family:font-cxsecret">');
  for (const html of [ambiguous, encrypted]) {
    const { win, api } = setup(html);
    const task = api.readQuestionTasks(api.questionRoots(win.document))[0];
    assert(task.q.blockedReason);
  }
});

test('reading range without one subquestion stem or enough options remains incomplete', () => {
  for (const html of [
    labelledReadingMarkup().replace(htmlEscape(synthetic.readingQuestions[1].stem), ''),
    labelledReadingMarkup().replace(/<ul>[\s\S]*?<\/ul>/, '<ul><li><span class="after">only one option</span></li></ul>')
  ]) {
    const { win, api } = setup(html);
    const tasks = api.readQuestionTasks(api.questionRoots(win.document));
    assert(tasks.some((task) => !task.q || task.q.blockedReason));
  }
});

test('unresolved characters inside either matching group block model requests', async () => {
  const { win, api } = setup(matchingMarkup().replace(synthetic.left[0].text, '\ue001 unresolved item'));
  const { q } = api.readQuestionTasks(api.questionRoots(win.document))[0];
  api.config({ aiEnabled: true, aiKey: 'test' });
  api.stub('channelAI', () => { throw new Error('unresolved matching item'); });
  assert.equal((await api.getAnswers(q)).length, 0);
});

function aiReply(content, finishReason = 'stop', reasoning = '', completionTokens = 20) {
  return { status: 200, responseText: JSON.stringify({
    choices: [{ finish_reason: finishReason, message: { content, reasoning_content: reasoning } }],
    usage: { prompt_tokens: 900, completion_tokens: completionTokens, completion_tokens_details: { reasoning_tokens: reasoning ? completionTokens - 1 : 0 } }
  }) };
}

function matchingModelFixture() {
  const env = setup(matchingMarkup());
  const task = env.api.readQuestionTasks(env.api.questionRoots(env.win.document))[0];
  env.api.config({ aiEnabled: true, aiKey: 'test', aiModel: 'deepseek-flash', autoSubmit: false });
  return { ...env, ...task };
}

test('reasoning-only matching response retries with a larger budget and fills only the final answer', async () => {
  const { win, api, q } = matchingModelFixture();
  api.config({ aiUrl: 'https://gateway.test/v1/chat/completions' });
  const requests = [];
  win.GM_xmlhttpRequest = (options) => {
    const body = JSON.parse(options.data);
    requests.push(body);
    assert.equal(body.stream, false);
    assert.equal(options.timeout, 60000);
    assert.equal(body.thinking, undefined);
    options.onload(requests.length === 1 ? aiReply('', 'length', 'private reasoning text', 8192) : aiReply('E|B|A|D|C'));
  };
  const result = await api.channelAI(q);
  assert.deepEqual(Array.from(result.answer), ['E','B','A','D','C']);
  assert.deepEqual(requests.map((r) => r.max_tokens), [8192, 16384]);
  assert.equal(requests[1].messages.some((m) => m.content.includes('private reasoning text')), false);
  assert.equal(q.aiDiagnostics.attempts[0].finishReason, 'length');
  assert.equal(q.aiDiagnostics.attempts[0].reasoningChars, 22);
  assert.equal(q.aiDiagnostics.outcome, 'succeeded');
  assert.equal(api.state().aiFailCount, 0);
});

test('truncated content is rejected even if it looks like all five matching answers', async () => {
  const { win, api, q } = matchingModelFixture();
  let calls = 0;
  win.GM_xmlhttpRequest = (options) => {
    calls++;
    options.onload(calls === 1 ? aiReply('A|B|C|D|E', 'length') : aiReply('E|B|A|D|C'));
  };
  const result = await api.channelAI(q);
  assert.equal(calls, 2);
  assert.deepEqual(Array.from(result.answer), ['E','B','A','D','C']);
});

test('official DeepSeek auto mode disables thinking while third-party aliases keep provider defaults', async () => {
  for (const [url, expected] of [['https://api.deepseek.com/v1/chat/completions', 'disabled'], ['https://gateway.test/v1/chat/completions', undefined]]) {
    const { win, api, q } = matchingModelFixture();
    api.config({ aiUrl: url });
    win.GM_xmlhttpRequest = (options) => {
      assert.equal(JSON.parse(options.data).thinking?.type, expected);
      options.onload(aiReply('E|B|A|D|C'));
    };
    assert.equal((await api.channelAI(q)).answer.length, 5);
  }
});

test('explicit thinking mode is retained during budget recovery', async () => {
  const { win, api, q } = matchingModelFixture();
  api.config({ aiThinking: 'enabled' });
  let calls = 0;
  win.GM_xmlhttpRequest = (options) => {
    calls++;
    const body = JSON.parse(options.data);
    assert.equal(body.thinking.type, 'enabled');
    assert.equal(body.temperature, undefined);
    options.onload(calls === 1 ? aiReply('', 'length', 'reasoning') : aiReply('E|B|A|D|C'));
  };
  assert.equal((await api.channelAI(q)).answer.length, 5);
  assert.equal(calls, 2);
});

test('unsupported thinking parameter gets at most one compatibility retry', async () => {
  const { win, api, q } = matchingModelFixture();
  const requests = [];
  win.GM_xmlhttpRequest = (options) => {
    const body = JSON.parse(options.data);
    requests.push(body);
    options.onload(requests.length === 1
      ? { status: 400, responseText: '{"error":{"message":"unknown parameter thinking"}}' }
      : aiReply('E|B|A|D|C'));
  };
  assert.equal((await api.channelAI(q)).answer.length, 5);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].thinking.type, 'disabled');
  assert.equal(requests[1].thinking, undefined);
});

test('two reasoning-only responses count as one failed question and never write a dropdown', async () => {
  const { win, api, q, el } = matchingModelFixture();
  let calls = 0;
  win.GM_xmlhttpRequest = (options) => { calls++; options.onload(aiReply('', 'stop', 'Perhaps the answer might be E|B|A|D|C')); };
  const result = await api.channelAI(q);
  assert.equal(result.answer.length, 0);
  assert.equal(calls, 2);
  assert.equal(api.state().aiFailCount, 1);
  assert.equal(q.aiDiagnostics.outcome, 'failed');
  assert(Array.from(el.querySelectorAll('select')).every((select) => select.value === ''));
});

test('matching response with missing or invalid labels is repaired before filling', async () => {
  for (const incomplete of ['E|B|A', 'E|B|A|D|Z']) {
    const { win, api, q } = matchingModelFixture();
    let calls = 0;
    win.GM_xmlhttpRequest = (options) => { calls++; options.onload(aiReply(calls === 1 ? incomplete : 'E|B|A|D|C')); };
    assert.equal((await api.channelAI(q)).answer.length, 5);
    assert.equal(calls, 2);
  }
});

test('matching request recovery integrates with actual workTask dropdowns and draft save', async () => {
  const { win, api } = matchingModelFixture();
  let requests = 0, saves = 0;
  api.stub('waitIframeLoaded', async () => {});
  api.stub('waitElementLoaded', async () => {});
  win.noSubmit = () => { saves++; };
  win.GM_xmlhttpRequest = (options) => {
    requests++;
    if (requests === 1) assert(Array.from(win.document.querySelectorAll('select')).every((select) => select.value === ''));
    options.onload(requests === 1 ? aiReply('', 'length', 'truncated thoughts', 8192) : aiReply('E|B|A|D|C'));
  };
  const frame = { contentWindow: { document: { querySelector: () => ({ contentWindow: win }) } } };
  assert.equal(await api.workTask(frame), 'awaiting_manual_submit');
  assert.equal(requests, 2);
  assert.equal(saves, 1);
  assert.deepEqual(Array.from(win.document.querySelectorAll('select'), (select) => select.value), ['server-24','server-21','server-20','server-23','server-22']);
  const saved = JSON.parse(win.localStorage.getItem('cxQuestions')).at(-1);
  assert.equal(saved.aiDiagnostics.attempts.length, 2);
  assert.equal(saved.aiDiagnostics.outcome, 'succeeded');
  assert.equal(JSON.stringify(saved).includes('truncated thoughts'), false);
});

test('authentication errors are not retried and do not expose response secrets', async () => {
  const { win, api, q } = matchingModelFixture();
  let calls = 0;
  win.GM_xmlhttpRequest = (options) => { calls++; options.onload({ status: 401, responseText: 'sensitive response sk-secret-value' }); };
  assert.equal((await api.channelAI(q)).answer.length, 0);
  assert.equal(calls, 1);
  assert.equal(api.logs.join('').includes('sensitive response'), false);
  assert.equal(api.logs.join('').includes('sk-secret-value'), false);
});

test('content filtering, tool calls and explicit refusal never produce answer retries', async () => {
  for (const response of [aiReply('E|B|A|D|C', 'content_filter'), aiReply('E|B|A|D|C', 'tool_calls'), aiReply('题目未提供完整原文，无法确定答案，请补充材料。')]) {
    const { win, api, q } = matchingModelFixture();
    let calls = 0;
    win.GM_xmlhttpRequest = (options) => { calls++; options.onload(response); };
    assert.equal((await api.channelAI(q)).answer.length, 0);
    assert.equal(calls, 1);
  }
});

test('pause and changed model configuration discard in-flight results without retrying', async () => {
  for (const cancel of [(api) => api.togglePause(), (api) => api.config({ aiModel: 'another-model' })]) {
    const { win, api, q } = matchingModelFixture();
    let calls = 0;
    win.GM_xmlhttpRequest = (options) => {
      calls++;
      cancel(api);
      options.onload(aiReply('', 'length', 'private thoughts'));
    };
    const result = await api.channelAI(q);
    assert.equal(result.cancelled, true);
    assert.equal(calls, 1);
    assert.equal(api.state().aiFailCount, 0);
  }
});

test('three failed questions trigger cooldown after bounded retries', async () => {
  const { win, api, q } = matchingModelFixture();
  let calls = 0;
  win.GM_xmlhttpRequest = (options) => { calls++; options.onload(aiReply('', 'length', 'still thinking')); };
  for (let i = 0; i < 3; i++) assert.equal((await api.channelAI(q)).answer.length, 0);
  assert.equal(calls, 6);
  assert(api.state().aiCooldownUntil > Date.now());
  assert.equal((await api.channelAI(q)).answer.length, 0);
  assert.equal(calls, 6);
});

test('budget recovery stays within the configured bounds and timeout errors are finite', async () => {
  const { win, api, q } = matchingModelFixture();
  api.config({ aiMaxTokens: 999999, aiTimeoutSeconds: 9999 });
  let calls = 0;
  win.GM_xmlhttpRequest = (options) => {
    calls++;
    assert.equal(JSON.parse(options.data).max_tokens, 32768);
    assert.equal(options.timeout, 180000);
    if (calls === 1) options.onload(aiReply('', 'length', 'still thinking'));
    else options.ontimeout();
  };
  assert.equal((await api.channelAI(q)).answer.length, 0);
  assert.equal(calls, 2);
  assert.match(q.aiDiagnostics.error, /180s/);
});

test('answer model settings show defaults and persist the selected mode, budget and timeout', () => {
  const { win, api } = setup();
  api.showConfigUI();
  assert.equal(win.document.querySelector('#cfgAIMaxTokens').value, '8192');
  assert.equal(win.document.querySelector('#cfgAITimeout').value, '60');
  assert.equal(win.document.querySelector('#cfgAIThinking').value, 'auto');
  win.document.querySelector('#cfgAIThinking').value = 'enabled';
  win.document.querySelector('#cfgAIMaxTokens').value = '16384';
  win.document.querySelector('#cfgAITimeout').value = '120';
  win.document.querySelector('#cfgSave').click();
  const config = JSON.parse(win.localStorage.getItem('cxConfig'));
  assert.equal(config.aiThinking, 'enabled');
  assert.equal(config.aiMaxTokens, 16384);
  assert.equal(config.aiTimeoutSeconds, 120);
});

test('an HTTP success containing a JSON API error is not retried or treated as answer text', async () => {
  const { win, api, q } = matchingModelFixture();
  let calls = 0;
  win.GM_xmlhttpRequest = (options) => {
    calls++;
    options.onload({ status: 200, responseText: '{"error":{"message":"quota details are private"}}' });
  };
  assert.equal((await api.channelAI(q)).answer.length, 0);
  assert.equal(calls, 1);
  assert.equal(api.logs.join('').includes('quota details are private'), false);
});
