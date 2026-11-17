'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, '学习通刷课助手.user.js'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function setup(t, html = '') {
  const dom = new JSDOM(html, { url: 'https://example.test/work', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.document.fonts = new Set();
  const code = source.slice(0, source.indexOf('  /* ==================== 路由'))
    .replace('const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));', 'const sleep = async () => {};');
  vm.runInContext(code + '\nlog = () => {}; globalThis.api = { parseAIAnswer, completeAIAnswer, channelAI, extractQuizQuestion, extractWorkQuestion, readQuestionTasks, questionRoots, setQuizAnswer, isAnsweredInDom, optionNodes, questionStructure, showConfigUI, decodeFont, recognizeGlyphsLocally, loadLocalFontDeps, fontDiagnostics, config: (v) => Object.assign(CONFIG,v), stub: (name,value) => { eval(name + " = value"); } }; })();', dom.getInternalVMContext());
  return { win: dom.window, api: dom.window.api };
}

function question(title, controls, hidden = '') {
  return '<div class="TiMu"><div class="Zy_TItle">' + title + '</div>' + hidden + controls + '</div>';
}
function choices(type = 'radio', texts = ['苹果', '香蕉']) {
  return '<ul>' + texts.map((text) => '<li><input type="' + type + '" name="q"><span class="after">' + text + '</span></li>').join('') + '</ul>';
}
function wireRoles(win, el) {
  const nodes = [...el.querySelectorAll('[role=radio], [role=checkbox]')];
  nodes.forEach((node) => node.addEventListener('click', () => {
    if (node.getAttribute('role') === 'radio') nodes.forEach((other) => other.setAttribute('aria-checked', String(other === node)));
    else node.setAttribute('aria-checked', String(node.getAttribute('aria-checked') !== 'true'));
  }));
  return nodes;
}
const roles = (role = 'radio', texts = ['苹果', '香蕉']) => texts.map((text) => '<div role="' + role + '" aria-checked="false">' + text + '</div>').join('');

test('strict answers reject prose, uncertainty and later contradictory lines', (t) => {
  const { api } = setup(t);
  for (const [type, content] of [['0', 'Because the passage is incomplete'], ['0', 'A\n答案其实是B'], ['0', 'A because...'], ['0', 'AB'], ['1', 'A,Cat'], ['1', 'A\nC'], ['3', '暂时不确定'], ['3', '错误，因为题干中“正确”一词不成立。'], ['3', '正确或错误']]) {
    assert.deepEqual(plain(api.parseAIAnswer(type, content)), [], type + ': ' + content);
  }
});
test('strict answers accept explicit wrappers and all separated multiple choices', (t) => {
  const { api } = setup(t);
  for (const [type, text, expected] of [['0', '答案：**B**', ['B']], ['0', '**答案：C**', ['C']], ['1', 'a,c、a+H', ['A', 'C', 'H']], ['1', 'ABD', ['A', 'B', 'D']], ['3', 'Answer: false.', ['错误']], ['3', '正确', ['正确']]]) assert.deepEqual(plain(api.parseAIAnswer(type, text)), expected);
  assert.deepEqual(plain(api.parseAIAnswer('11', 'E|B|A|D|C')), ['E','B','A','D','C']);
  assert.deepEqual(plain(api.parseAIAnswer('2', '第1空：甲\n第2空：乙')), ['甲','乙']);
});
test('choice validation refuses letters outside actual options', (t) => {
  const { api } = setup(t);
  for (const [type, text] of [['0', 'C'], ['1', 'A,H']]) assert.match(api.completeAIAnswer({ type, options: ['甲', '乙'] }, text).error, /范围/);
  assert.deepEqual(plain(api.completeAIAnswer({ type: '1', options: ['甲', '乙'] }, 'A,B').answer), ['A','B']);
});
test('invalid ordinary answers use existing bounded model recovery', async (t) => {
  const { win, api } = setup(t);
  api.config({ aiEnabled: true, aiKey: 'synthetic-key', aiUrl: 'https://model.example.test/v1/chat/completions' });
  const responses = ['Because the passage is incomplete', 'B'];
  const requests = [];
  win.GM_xmlhttpRequest = (r) => { requests.push(JSON.parse(r.data)); r.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: responses.shift() }, finish_reason: 'stop' }] }) }); };
  assert.deepEqual(plain((await api.channelAI({ type: '0', question: '合成题目', options: ['甲','乙'] })).answer), ['B']);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].max_tokens, requests[0].max_tokens * 2);
});

test('missing type uses checkbox structure and title labels, not stem keywords', (t) => {
  const { win, api } = setup(t, question('选择两种颜色', choices('checkbox')) + question('【单选题】以下哪一项是判断题的特点？', choices()));
  const roots = win.document.querySelectorAll('.TiMu');
  assert.equal(api.extractQuizQuestion(roots[0]).type, '1');
  assert.equal(api.extractQuizQuestion(roots[1]).type, '0');
});
test('explicit type wins and unknown free text does not silently become choice', (t) => {
  const { win, api } = setup(t, question('【多选题】选择颜色', choices(), '<input name="answertype1" value="0">') + question('写出自己的解释', '<textarea></textarea>'));
  const roots = win.document.querySelectorAll('.TiMu');
  assert.equal(api.extractQuizQuestion(roots[0]).type, '0');
  assert.equal(api.extractQuizQuestion(roots[1]).type, '?');
});
test('parent without a type does not borrow a nested child field', (t) => {
  const { win, api } = setup(t, question('共享材料', question('【多选题】子题问题', choices('checkbox'), '<input name="answertype1" value="1">')));
  assert.equal(api.extractQuizQuestion(win.document.querySelector('.TiMu')).type, '?');
});
test('judgment semantics and homework labels support absent type fields', (t) => {
  const { win, api } = setup(t, question('这是合成的判断问题', choices('radio', ['错误','正确'])) + '<div class="questionLi"><div class="mark_name">【填空题】填入合成内容</div><textarea></textarea></div>');
  assert.equal(api.extractQuizQuestion(win.document.querySelector('.TiMu')).type, '3');
  assert.equal(api.extractWorkQuestion(win.document.querySelector('.questionLi')).type, '2');
});
test('mixed control types and multiple unrelated native groups stay unknown', (t) => {
  const { win, api } = setup(t, question('选择合适的内容', '<input type="radio" name="a"><input type="checkbox" name="b">') + question('选择合适的内容', '<input type="radio" name="a"><input type="radio" name="b">'));
  for (const el of win.document.querySelectorAll('.TiMu')) assert.equal(api.extractQuizQuestion(el).type, '?');
});

test('ARIA option extraction and selection work without native inputs', (t) => {
  const { win, api } = setup(t, question('选择一种水果', roles()));
  const el = win.document.querySelector('.TiMu');
  const nodes = wireRoles(win, el);
  const q = api.extractQuizQuestion(el);
  assert.equal(q.type, '0');
  assert.deepEqual(plain(q.options), ['苹果','香蕉']);
  assert.equal(api.setQuizAnswer(['B'], q, el, win), true);
  assert.equal(nodes[1].getAttribute('aria-checked'), 'true');
  assert.equal(api.isAnsweredInDom(el, q, win), true);
});
test('semantic options align exact text when DOM order differs', (t) => {
  const { win, api } = setup(t, question('选择一种水果', roles('radio', ['香蕉','苹果'])));
  const el = win.document.querySelector('.TiMu');
  const nodes = wireRoles(win, el);
  assert.equal(api.setQuizAnswer(['B'], { type: '0', options: ['苹果','香蕉'] }, el, win), true);
  assert.equal(nodes[0].getAttribute('aria-checked'), 'true');
});
test('duplicate or mismatched semantic texts are rejected before clicks', (t) => {
  const { win, api } = setup(t, question('选择一种水果', roles('radio', ['苹果','苹果'])) + question('选择一种水果', roles('radio', ['苹果汁','香蕉'])));
  let clicks = 0;
  win.document.addEventListener('click', () => clicks++);
  const roots = win.document.querySelectorAll('.TiMu');
  assert.equal(api.setQuizAnswer(['A'], { type: '0', options: ['苹果','苹果'] }, roots[0], win), false);
  assert.equal(api.setQuizAnswer(['A'], { type: '0', options: ['苹果','香蕉'] }, roots[1], win), false);
  assert.equal(clicks, 0);
});
test('CSS-only changes and false aria state never report a selection', (t) => {
  const { win, api } = setup(t, question('选择一种水果', roles()));
  const el = win.document.querySelector('.TiMu');
  el.querySelectorAll('[role=radio]').forEach((node) => node.addEventListener('click', () => node.classList.add('active')));
  assert.equal(api.setQuizAnswer(['B'], { type: '0', options: ['苹果','香蕉'] }, el, win), false);
});
test('semantic components without aria reject generic active styling', (t) => {
  const { win, api } = setup(t, question('选择一种水果', '<div class="option-item">苹果</div><div class="option-item">香蕉</div>'));
  const el = win.document.querySelector('.TiMu');
  el.querySelectorAll('.option-item').forEach((node) => node.onclick = () => node.classList.add('active'));
  assert.equal(api.setQuizAnswer(['B'], { type: '0', options: ['苹果','香蕉'] }, el, win), false);
});
test('nested Element checkboxes resolve one root per option and verified states', (t) => {
  const { win, api } = setup(t, question('【多选题】选择水果', '<label class="el-checkbox"><span class="option-item">苹果</span><input type="checkbox"></label><label class="el-checkbox"><span class="option-item">香蕉</span><input type="checkbox"></label>'));
  const el = win.document.querySelector('.TiMu');
  const q = api.extractQuizQuestion(el);
  assert.deepEqual(plain(q.options), ['苹果','香蕉']);
  assert.equal(api.setQuizAnswer(['A','B'], q, el, win), true);
  assert.equal(el.querySelectorAll('input:checked').length, 2);
});
test('hidden duplicate component templates are ignored during extraction', (t) => {
  const { win, api } = setup(t, question('选择水果', roles() + '<div hidden>' + roles() + '</div>'));
  const el = win.document.querySelector('.TiMu');
  assert.deepEqual(plain(api.extractQuizQuestion(el).options), ['苹果','香蕉']);
});
test('multiselect removes residual values and repeated selection is idempotent', (t) => {
  const { win, api } = setup(t, question('选择水果', roles('checkbox', ['苹果','香蕉','梨'])));
  const el = win.document.querySelector('.TiMu');
  const nodes = wireRoles(win, el);
  nodes[1].setAttribute('aria-checked', 'true');
  const q = { type: '1', options: ['苹果','香蕉','梨'] };
  assert.equal(api.setQuizAnswer(['A','C'], q, el, win), true);
  assert.equal(api.setQuizAnswer(['A','C'], q, el, win), true);
  assert.deepEqual(nodes.map((node) => node.getAttribute('aria-checked')), ['true','false','true']);
});
test('semantic selection still requires a populated platform hidden answer', (t) => {
  const { win, api } = setup(t, question('选择一种水果', roles(), '<input type="hidden" name="answer1" value="">'));
  const el = win.document.querySelector('.TiMu');
  wireRoles(win, el);
  assert.equal(api.setQuizAnswer(['B'], { type: '0', options: ['苹果','香蕉'] }, el, win), false);
});
test('question diagnostics exclude unrelated editors and all content text', (t) => {
  const { win, api } = setup(t, question('本题内容', '<textarea hidden></textarea><div id="here"></div>') + '<div id="outside"></div>');
  win.UE = { instants: { own: { container: win.document.querySelector('#here'), setContent() {}, getContent: () => '<p>甲乙</p>' }, unrelated: { container: win.document.querySelector('#outside'), setContent() {}, getContent: () => 'sensitive outside content' } } };
  const result = api.questionStructure(win.document.querySelector('.TiMu')).editors;
  assert.deepEqual(plain(result), { textareas: 1, hiddenTextareas: 1, frames: 0, readableFrames: 0, editables: 0, ueInstances: 1, ueContentLengths: [2] });
  assert.equal(JSON.stringify(result).includes('sensitive'), false);
});

// Small synthetic cmap + outline, independent of downloaded or personal fonts.
function cmapTable(codepoints = [0xe001, 0xe002]) {
  const b = Buffer.alloc(28 + codepoints.length * 12);
  b.writeUInt16BE(1, 2); b.writeUInt16BE(3, 4); b.writeUInt16BE(10, 6); b.writeUInt32BE(12, 8);
  b.writeUInt16BE(12, 12); b.writeUInt32BE(16 + codepoints.length * 12, 16); b.writeUInt32BE(codepoints.length, 24);
  codepoints.forEach((cp, i) => { b.writeUInt32BE(cp, 28 + i * 12); b.writeUInt32BE(cp, 32 + i * 12); b.writeUInt32BE(i + 1, 36 + i * 12); });
  return b;
}
function sfnt(tables) {
  const entries = Object.entries(tables);
  let offset = 12 + entries.length * 16;
  const records = entries.map(([tag, data]) => { const record = { tag, data, offset }; offset += (data.length + 3) & ~3; return record; });
  const b = Buffer.alloc(offset); b.writeUInt32BE(0x10000, 0); b.writeUInt16BE(entries.length, 4);
  records.forEach(({ tag, data, offset }, i) => { b.write(tag, 12 + i * 16); b.writeUInt32BE(offset, 20 + i * 16); b.writeUInt32BE(data.length, 24 + i * 16); data.copy(b, offset); });
  return b;
}
function syntheticOutline(cp = 0x20000) {
  const head = Buffer.alloc(54); head.writeUInt16BE(1000, 18); head.writeInt16BE(1, 50);
  const maxp = Buffer.alloc(6); maxp.writeUInt32BE(0x5000, 0); maxp.writeUInt16BE(2, 4);
  const glyf = Buffer.alloc(34); glyf.writeInt16BE(1, 0); glyf.writeInt16BE(100, 6); glyf.writeInt16BE(100, 8); glyf.writeUInt16BE(3, 10);
  glyf.fill(1, 14, 18); [0,100,0,-100,0,0,100,0].forEach((v, i) => glyf.writeInt16BE(v, 18 + i * 2));
  const loca = Buffer.alloc(12); loca.writeUInt32BE(glyf.length, 8);
  return sfnt({ head, maxp, cmap: cmapTable([cp]), loca, glyf });
}
function fontHtml(content) {
  return '<style>.font-cxsecret{font-family:cxsecret,serif}@font-face{font-family:cxsecret;src:url(data:font/ttf;base64,' + sfnt({ cmap: cmapTable() }).toString('base64') + ')}</style><div class="TiMu"><div class="Zy_TItle font-cxsecret">' + content + '</div></div>';
}
test('embedded dependencies remain lazy, isolated and hash pinned', (t) => {
  const { win, api } = setup(t);
  assert.equal(win.Typr, undefined); assert.equal(win.md5, undefined);
  const deps = api.loadLocalFontDeps();
  assert.equal(deps.md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(api.loadLocalFontDeps(), deps);
  assert.equal(Object.keys(deps.table).filter((k) => /^[a-f0-9]{8}$/.test(k)).length, 20902);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'vendor/font-deps.lock.json')));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'vendor/font-deps.js'))).digest('hex'), lock.sha256);
});
test('real Typr parser handles a synthetic outline and supplementary codepoint', (t) => {
  const { api } = setup(t);
  const bytes = syntheticOutline();
  const deps = api.loadLocalFontDeps();
  const parsed = deps.Typr.parse(Uint8Array.from(bytes).buffer)[0];
  const outline = deps.Typr.U.glyphToPath(parsed, deps.Typr.U.codeToGlyph(parsed, 0x20000));
  assert(outline.cmds.length > 0);
  const key = crypto.createHash('md5').update(JSON.stringify(outline)).digest('hex').slice(-8);
  deps.table[key] = '甲'.codePointAt(0); // Synthetic mapping; no coverage claim about real font table.
  const wrapped = Buffer.concat([Buffer.from([1,2,3]), bytes, Buffer.from([4])]);
  const result = api.recognizeGlyphsLocally([String.fromCodePoint(0x20000)], new Uint8Array(wrapped.buffer, wrapped.byteOffset + 3, bytes.length));
  assert.equal(result.resolved.get(String.fromCodePoint(0x20000)), '甲');
  assert.equal(result.status, 'checked');
});
test('unknown outlines, damaged fonts and missing bytes yield no guessed mapping', (t) => {
  const { api } = setup(t);
  const deps = api.loadLocalFontDeps();
  api.stub('loadLocalFontDeps', () => ({ ...deps, table: {} }));
  assert.equal(api.recognizeGlyphsLocally([String.fromCodePoint(0x20000)], syntheticOutline()).resolved.size, 0);
  assert.equal(api.recognizeGlyphsLocally(['甲'], new Uint8Array([1])).resolved.size, 0);
  assert.equal(api.recognizeGlyphsLocally(['甲'], null).status, 'unavailable');
});
test('local font hits avoid vision and preserve live controls', async (t) => {
  const { win, api } = setup(t, fontHtml('\ue001<button>go</button>'));
  const button = win.document.querySelector('button'); let clicks = 0; button.onclick = () => clicks++;
  api.stub('recognizeGlyphsLocally', () => ({ resolved: new Map([['\ue001','甲']]), status: 'checked', tableVersion: 'synthetic' }));
  api.stub('recognizeGlyphsViaVisionAI', () => { throw new Error('vision must not be called'); });
  assert.equal(await api.decodeFont(win), true); button.click();
  assert.equal(clicks, 1); assert.equal(win.document.querySelector('button'), button);
  const diag = api.fontDiagnostics.get(win.document);
  assert.equal(diag.localHits, 1); assert.equal(diag.visionRequested, 0);
});
test('partial local hits send only unknown glyphs to vision and export counts', async (t) => {
  const { win, api } = setup(t, fontHtml('\ue001\ue002'));
  api.stub('recognizeGlyphsLocally', () => ({ resolved: new Map([['\ue001','甲']]), status: 'checked', tableVersion: 'synthetic' }));
  api.stub('recognizeGlyphsViaVisionAI', async (chars) => { assert.deepEqual(Array.from(chars), ['\ue002']); return new Map([['\ue002','乙']]); });
  assert.equal(await api.decodeFont(win), true);
  assert.equal(win.document.querySelector('.TiMu').textContent, '甲乙');
  const q = api.readQuestionTasks(api.questionRoots(win.document))[0].q;
  assert.equal(q.fontDiagnostics.localHits, 1); assert.equal(q.fontDiagnostics.visionHits, 1); assert.equal(q.fontDiagnostics.unresolved, 0);
});
test('failed vision after partial local hits leaves original DOM intact', async (t) => {
  const { win, api } = setup(t, fontHtml('\ue001<span class="font-cxsecret">\ue002</span><input value="keep">'));
  const before = win.document.body.innerHTML; const input = win.document.querySelector('input');
  api.stub('recognizeGlyphsLocally', () => ({ resolved: new Map([['\ue001','甲']]), status: 'checked', tableVersion: 'synthetic' }));
  api.stub('recognizeGlyphsViaVisionAI', async () => { throw new Error('offline'); });
  assert.equal(await api.decodeFont(win), false);
  assert.equal(win.document.body.innerHTML, before); assert.equal(win.document.querySelector('input'), input);
  assert.equal(api.fontDiagnostics.get(win.document).unresolved, 1);
});
test('local dependency failure falls back to vision without changing discovery', async (t) => {
  const { win, api } = setup(t, fontHtml('\ue001'));
  api.stub('loadLocalFontDeps', () => { throw new Error('unavailable'); });
  api.stub('recognizeGlyphsViaVisionAI', async () => new Map([['\ue001','甲']]));
  assert.equal(await api.decodeFont(win), true);
  assert.equal(api.fontDiagnostics.get(win.document).localStatus, 'failed');
});
test('local font switch persists and bypasses all local dependency loading', async (t) => {
  const { win, api } = setup(t, fontHtml('\ue001'));
  api.showConfigUI();
  assert.equal(win.document.querySelector('#cfgLocalFont').checked, true);
  win.document.querySelector('#cfgLocalFont').checked = false;
  win.document.querySelector('#cfgSave').click();
  assert.equal(JSON.parse(win.localStorage.getItem('cxConfig')).localFontEnabled, false);
  api.stub('loadLocalFontDeps', () => { throw new Error('must not load'); });
  api.stub('recognizeGlyphsViaVisionAI', async () => new Map([['\ue001','甲']]));
  assert.equal(await api.decodeFont(win), true);
  assert.equal(api.fontDiagnostics.get(win.document).localStatus, 'disabled');
  assert.equal(api.fontDiagnostics.get(win.document).visionRequested, 1);
});
test('local mappings use simultaneous replacement and preserve ordinary descendants', async (t) => {
  const { win, api } = setup(t, fontHtml('\ue001<span class="font-cxsecret">\ue002</span><span style="font-family:serif">\ue001</span>'));
  api.stub('recognizeGlyphsLocally', () => ({ resolved: new Map([['\ue001','\ue002'],['\ue002','乙']]), status: 'checked', tableVersion: 'synthetic' }));
  assert.equal(await api.decodeFont(win), true);
  const el = win.document.querySelector('.TiMu').firstElementChild;
  assert.equal(el.firstChild.nodeValue, '\ue002');
  assert.equal(el.querySelector('span').textContent, '乙');
  assert.equal(el.querySelectorAll('span')[1].textContent, '\ue001');
});
