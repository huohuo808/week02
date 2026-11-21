'use strict';

/* ============================================================
 * 诉讼策略助手 · 前端主逻辑（API 驱动版）
 * 数据全部来自后端 REST API，前端只负责状态与渲染。
 * ============================================================ */

const state = {
  booted: false,
  bootError: '',
  tab: 'home',
  caseId: '',
  view: 'home',
  cases: [],        // 案件摘要列表（来自 /api/cases）
  cur: null,        // 当前案件完整数据（来自 /api/cases/:id）
  cfg: null,        // 系统配置（大模型/脱敏状态）
  evFilter: '全部',
  evQuery: '',
  maskMode: false,
  tlFilter: '全部',
  reasonTab: 'fact',
  stepDone: {},
  newEvDone: false,
  strategyGenerated: false,
  strategyTab: 'focus',
  strategy: null,
  checked: {},
  reportText: '',
  modal: null,
  busy: false,
};

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function curCase() { return state.cur; }

/* ---------------- 启动 ---------------- */
async function boot() {
  try {
    state.cfg = await API.config();
    state.cases = await API.cases();
    if (!state.cases.length) throw new Error('后端没有案件数据，请检查 data/db.json 或运行 npm run seed');
    state.caseId = state.cases[0].id;
    await loadCase(state.caseId);
    state.booted = true;
    render();
  } catch (e) {
    state.bootError = e.message;
    renderBootError();
  }
}

async function loadCase(id) {
  state.cur = await API.caseDetail(id);
  const rt = state.cur.runtime || {};
  state.newEvDone = !!rt.newEvDone;
  state.strategyGenerated = !!rt.strategyGenerated;
  state.strategy = rt.strategy || null;
  state.checked = rt.checked || {};
  state.reportText = rt.reportText || '';
}

function renderBootError() {
  document.getElementById('screen').innerHTML =
    '<div class="empty" style="padding:56px 16px"><h3 style="color:var(--navy);margin-bottom:12px">服务连接失败</h3>' +
    '<p style="line-height:1.8">' + esc(state.bootError) + '</p>' +
    '<p style="margin-top:16px;font-size:11px;color:var(--muted)">请通过 <b>npm start</b> 启动后端后刷新页面</p>' +
    '<button class="primary" style="margin-top:18px" onclick="location.reload()">重新连接</button></div>';
}

/* ---------------- 交互动作 ---------------- */
function setStep(v) {
  state.stepDone[v] = true;
  document.querySelectorAll('.steps .s').forEach(el => el.classList.toggle('on', !!state.stepDone[el.dataset.s]));
}
function goBack() { state.tab = 'home'; state.view = 'home'; render(); }
function setTab(t) { state.tab = t; state.view = t; setStep(t); render(); }

async function pickCase(id) {
  if (id === state.caseId && state.cur) return;
  state.busy = true; render();
  try {
    state.caseId = id;
    state.evQuery = ''; state.evFilter = '全部'; state.tlFilter = '全部';
    state.reasonTab = 'fact'; state.strategyTab = 'focus';
    await loadCase(id);
  } catch (e) { alert('加载案件失败：' + e.message); }
  finally { state.busy = false; render(); }
}

/* 证据库 */
function onSearch(v) {
  state.evQuery = v;
  clearTimeout(window.__searchTimer);
  window.__searchTimer = setTimeout(() => {
    render();
    setTimeout(() => {
      const el = document.getElementById('evSearch');
      if (el) { el.focus(); el.setSelectionRange(v.length, v.length); }
    }, 0);
  }, 180);
}
function clearSearch() { state.evQuery = ''; render(); }
function setEvFilter(f) { state.evFilter = f; render(); }
function toggleMask() { state.maskMode = !state.maskMode; render(); }

/* 时间线 */
function setTlFilter(f) { state.tlFilter = f; render(); }
async function confirmDate() {
  try {
    await API.confirmDates(state.caseId);
    await loadCase(state.caseId);
    render();
  } catch (e) { alert('确认失败：' + e.message); }
}
async function doNewEvidence() {
  try {
    const r = await API.incremental(state.caseId);
    await loadCase(state.caseId);
    state.modal = { type: 'change', result: r };
    render();
  } catch (e) { alert('增量处理失败：' + e.message); }
}

/* 策略 */
function setReasonTab(t) { state.reasonTab = t; render(); }
function setSTab(t) { state.strategyTab = t; render(); }
async function genStrategy() {
  state.strategyGenerated = true;
  state.view = 'loading';
  render();
  let n = 0;
  const logs = ['读取事实时间线（含待确认日期）…', '挂接待证事实与证据对应关系…', '汇总矛盾与我方风险…', '生成攻防策略草案…'];
  const iv = setInterval(() => {
    n++;
    const el = document.getElementById('loadLog');
    if (n >= logs.length) {
      clearInterval(iv);
      state.view = 'strategy';
      render();
    } else if (el) {
      el.innerHTML = logs.slice(0, n).map(x => '✓ ' + x).join('<br>') + '<br><span style="color:var(--gold)">▸ ' + logs[n] + '</span>';
    }
  }, 550);
  try {
    const s = await API.generateStrategy(state.caseId);
    state.strategy = s;
    clearInterval(iv);
    state.view = 'strategy';
    render();
  } catch (e) {
    clearInterval(iv);
    state.view = 'strategy';
    alert('生成策略失败：' + e.message);
    render();
  }
}
async function mark(k, v) {
  try {
    const r = await API.checkStrategy(state.caseId, k, v);
    state.checked = r.checked;
    render();
  } catch (e) { alert('标记失败：' + e.message); }
}
async function genReport() {
  try {
    const r = await API.report(state.caseId);
    state.reportText = r.report;
    state.reportDone = true;
    state.view = 'report';
    render();
  } catch (e) { alert('导出报告失败：' + e.message); }
}
function copyReport() {
  const txt = state.reportText || '';
  if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
  alert('报告已复制到剪贴板');
}

/* 弹层 */
function openMask(id) { state.modal = { type: 'mask', id }; render(); }
function showSource(id) { state.modal = { type: 'src', id }; render(); }
function openModal(type) { state.modal = { type }; render(); }
function closeModal() { state.modal = null; render(); }

/* 重置演示 */
async function resetAll() {
  if (!confirm('确定重置演示数据？所有确认、策略与核对记录将恢复到初始状态。')) return;
  try {
    await API.reseed();
    state.caseId = '';
    await boot();
  } catch (e) { alert('重置失败：' + e.message + '（生产环境不允许重置）'); }
}

/* ---------------- 渲染 ---------------- */
function render() {
  if (!state.booted) return;
  setStep(state.view);
  document.getElementById('barTitle').textContent = barTitle();
  document.getElementById('back').style.display = state.tab === 'home' ? 'none' : 'block';

  const tabs = [['home', '⌂', '工作台'], ['evidence', '▤', '证据库'], ['timeline', '◷', '时间线'], ['reason', '⌘', '推理'], ['strategy', '◇', '策略']];
  document.getElementById('tabs').innerHTML = tabs.map(t =>
    `<div class="${state.tab === t[0] ? 'on' : ''}" onclick="setTab('${t[0]}')"><span class="ic">${t[1]}</span><span>${t[2]}</span></div>`
  ).join('');

  let html = '';
  if (state.view === 'home') html = viewHome();
  else if (state.view === 'evidence') html = viewEvidence();
  else if (state.view === 'timeline') html = viewTimeline();
  else if (state.view === 'reason') html = viewReason();
  else if (state.view === 'strategy') html = viewStrategy();
  else if (state.view === 'loading') html = viewLoading();
  else if (state.view === 'report') html = viewReport();

  if (state.busy) html = '<div class="loading"><div class="spin"></div><p>加载案件数据…</p></div>' + html;
  document.getElementById('screen').innerHTML = html;
  document.getElementById('modalHost').innerHTML = state.modal ? modalHtml() : '';
  const sc = document.getElementById('screen'); if (sc) sc.scrollTop = 0;

  // 更新侧栏状态标签
  const badge = document.getElementById('engineBadge');
  if (badge && state.cfg) {
    badge.textContent = state.cfg.llm.ready ? ('大模型：' + state.cfg.llm.model) : '引擎：内置规则（未接大模型）';
  }
}

function barTitle() {
  if (state.view === 'report') return '策略报告';
  if (state.view === 'loading') return 'AI 生成中';
  return ({ home: '工作台', evidence: '证据库', timeline: '事实时间线', reason: '证据推理', strategy: '诉讼策略' })[state.tab] || '诉讼策略助手';
}

/* ---------- 视图 1：工作台 ---------- */
function viewHome() {
  const c = curCase();
  let h = `<div class="brand"><div class="lg">诉</div><h2>诉讼策略助手</h2><p>证据推理 × 庭审策略 · 一体化办案</p></div>`;
  h += `<div class="sec-t">选择案件<span style="font-size:10px;color:var(--muted);font-weight:400">时间线将按所选案件分别罗列</span></div>`;
  h += state.cases.map(x => {
    const sel = x.id === state.caseId ? 'sel' : '';
    return `<div class="case-card ${sel}" onclick="pickCase('${x.id}')">
      <div class="ct"><b>${esc(x.name)}</b><span class="cause">${esc(x.cause)}</span></div>
      <div class="meta">${esc(x.role)} · 标的 ${esc(x.amount)}<br>${esc(x.desc)}</div>
      <div class="foot"><span class="chip">${x.evidenceCount} 份证据</span>
      ${x.unconfirmed ? `<span class="chip warn">${x.unconfirmed} 处日期待确认</span>` : ''}
      <span class="chip ok">${esc(x.status)}</span></div></div>`;
  }).join('');
  h += `<div class="sec-t">融合后的流程</div><div class="flowbox"><div class="flowrow">
    <span class="fl">证据材料<br>我方/对方</span><span class="fa">→</span>
    <span class="fl mid">证据推理层<br>时间线·对应·矛盾·风险·增量</span><span class="fa">→</span>
    <span class="fl end">庭审策略<br>攻防意见</span></div>
    <div class="notice">证据推理层先把证据理成带出处的结论，策略层再基于结论生成意见；对方新证据只推送「本次变化」，不从头重生成。</div></div>`;
  h += `<div class="sec-t">当前案件 · ${esc(c.cause)}</div>`;
  h += `<div class="card"><div class="meta" style="font-size:12px;color:#4a5563;line-height:1.75">
    ${esc(c.name)}｜${esc(c.role)}<br>标的 ${esc(c.amount)}。共 ${c.evidence.length} 份证据、${c.timeline.length} 个时间节点、${c.risks.length} 项我方风险。</div></div>`;
  return h;
}

/* ---------- 视图 2：证据库 ---------- */
function viewEvidence() {
  const c = curCase();
  let list = c.evidence.filter(e =>
    state.evFilter === '全部' ||
    (state.evFilter === '我方' && e.side === '我方') ||
    (state.evFilter === '对方' && e.side === '对方') ||
    (state.evFilter === '含敏感' && e.sens)
  );
  const q = state.evQuery.trim().toLowerCase();
  if (q) list = list.filter(e => (e.id + e.name + e.prove + e.raw).toLowerCase().includes(q));

  let h = `<div class="sec-t">证据库 <span style="font-size:10px;color:var(--muted);font-weight:400">共 ${c.evidence.length} 份</span></div>`;
  h += `<div class="searchbox"><span class="mag">⌕</span><input id="evSearch" type="text" placeholder="搜索证据编号、名称、关键词…" value="${esc(state.evQuery)}" oninput="onSearch(this.value)">${state.evQuery ? `<span class="clr" onclick="clearSearch()">✕</span>` : ''}</div>`;
  h += `<div class="filterbar">
    ${['全部', '我方', '对方', '含敏感'].map(f => `<button class="${state.evFilter === f ? 'on' : ''}" onclick="setEvFilter('${f}')">${f}</button>`).join('')}
    <button class="maskbtn ${state.maskMode ? 'on' : ''}" onclick="toggleMask()">${state.maskMode ? '脱敏中' : '脱敏预览'}</button></div>`;

  if (state.maskMode) {
    // 批量向后端请求脱敏结果
    const cache = state._maskCache || {};
    const need = list.filter(e => !cache[e.id]);
    if (need.length) {
      API.maskBatch(need.map(e => e.raw)).then(r => {
        need.forEach((e, i) => { cache[e.id] = r.items[i]; });
        state._maskCache = cache;
        render();
      }).catch(() => {});
      h += '<div class="empty-tip">正在向后端请求脱敏…</div>';
    }
  }

  if (!list.length) h += `<div class="empty">未找到匹配证据<br><span style="font-size:11px">试试「质量」「欠款」或证据编号</span></div>`;

  list.forEach(e => {
    let rawHtml = esc(e.raw);
    if (state.maskMode && state._maskCache && state._maskCache[e.id]) {
      rawHtml = highlightMasked(state._maskCache[e.id]);
    }
    h += `<div class="ev"><div class="h"><b>${esc(e.name)} <span class="id">${e.id}</span></b><span class="side ${e.side === '对方' ? 'opp' : ''}">${e.side}</span></div>
      <div class="prove">${esc(e.prove)}</div>
      <div class="raw">${rawHtml}</div>
      <div class="ac"><button onclick="showSource('${e.id}')">查看原文位置</button>${e.sens ? `<button class="mk" onclick="openMask('${e.id}')">脱敏对比</button>` : ''}</div></div>`;
  });

  h += `<div class="notice">脱敏规则由后端提供：默认内置正则识别（姓名/手机/身份证/银行卡）；配置 REDACTION_MODE=presidio 后切换 Microsoft Presidio，支持法律领域自定义识别器，敏感信息不出本地。</div>`;
  return h;
}

function highlightMasked(m) {
  let html = esc(m.masked || '');
  (m.entities || []).forEach(en => {
    if (en.masked) html = html.split(esc(en.masked)).join('<mark>' + esc(en.masked) + '</mark>');
  });
  return html;
}

/* ---------- 视图 3：时间线 ---------- */
function viewTimeline() {
  const c = curCase();
  let list = c.timeline.filter(e => {
    if (state.tlFilter === '全部') return true;
    if (state.tlFilter === '待确认') return e.pending || e.dstate === '推断待确认';
    if (state.tlFilter === '新证据') return e.added;
    if (state.tlFilter === '确定') return e.dstate === '确定' && !e.added;
    return true;
  });
  let h = `<div class="sec-t">事实时间线</div>`;
  h += `<div class="casesel"><label>选择案件</label><select onchange="pickCase(this.value)">
    ${state.cases.map(x => `<option value="${x.id}" ${x.id === state.caseId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`;
  h += `<div class="mfilter">${['全部', '确定', '待确认', '新证据'].map(f => `<button class="${state.tlFilter === f ? 'on' : ''}" onclick="setTlFilter('${f}')">${f}</button>`).join('')}</div>`;

  const pendingCount = c.timeline.filter(t => t.pending || t.dstate === '推断待确认').length;
  if (state.caseId === 'c1' && !state.newEvDone) {
    h += `<div class="card" style="padding:10px 12px"><div style="font-size:11.5px;color:#4a5563;line-height:1.6">对方新证据 D01–D04 已到，尚未并入时间线。</div><button class="primary gold" style="margin-top:8px;padding:10px" onclick="doNewEvidence()">处理新证据增量（定位→插入→校验）</button></div>`;
  }
  if (!list.length) h += `<div class="empty-tip">该筛选下暂无事件</div>`;
  h += `<div class="tl">`;
  list.forEach(e => {
    const bdCls = e.pending || e.dstate === '推断待确认' ? 'pending' : (e.added ? 'added' : '');
    const bdTxt = e.pending || e.dstate === '推断待确认' ? '推断·待确认' : (e.added ? '新证据' : '确定');
    h += `<div class="ev-node ${bdCls}"><div class="d">${esc(e.date)} <span class="bd ${bdCls}">${bdTxt}</span></div>
      <div class="desc">${esc(e.desc)}</div>
      ${e.alt ? `<div class="alt">${esc(e.alt)} · 律师确认前不能导出</div>` : ''}
      ${e.rawdate ? `<div class="alt">原文：${esc(e.rawdate)}</div>` : ''}
      <div class="src"><span>来源 ${esc(e.src)}</span>${e.pending || e.dstate === '推断待确认' ? `<button onclick="confirmDate()">确认此日期</button>` : ''}</div></div>`;
  });
  h += `</div>`;
  h += `<div class="notice">设计原则：推断日期醒目标「待确认」，确认前不作为确定事实；新证据只插入受影响节点并重新校验，已确认结果保持不变。</div>`;
  return h;
}

/* ---------- 视图 4：证据推理 ---------- */
function viewReason() {
  const c = curCase();
  const s = { facts: c.facts || [], conflicts: c.conflicts || [], risks: c.risks || [] };
  let h = `<div class="sec-t">证据推理 <span style="font-size:10px;color:var(--muted);font-weight:400"> engine: ${esc((state.cfg && state.cfg.llm.ready) ? '大模型就绪' : '内置规则')}</span></div>`;
  h += `<div class="subtabs">${[['fact', '待证事实'], ['conflict', '矛盾识别'], ['risk', '我方风险']].map(t => `<button class="${state.reasonTab === t[0] ? 'on' : ''}" onclick="setReasonTab('${t[0]}')">${t[1]}</button>`).join('')}</div>`;

  if (state.reasonTab === 'fact') {
    h += `<div class="notice" style="margin-bottom:10px">案由：${esc(c.cause)} · 按待证事实模板挂接证据，标出缺口与薄弱点（只提示不下结论）。</div>`;
    s.facts.forEach(f => {
      const st = f.state === '充分' ? 'ok' : (f.state === '有缺口' ? 'gap' : 'risk');
      h += `<div class="fact"><div class="ft"><b>${esc(f.name)}</b><span class="st ${st}">${esc(f.state)}</span></div>
        <div class="fb">支撑证据：${esc(f.support)}<br>${esc(f.fb)}</div>
        ${f.sug ? `<div class="sug">补证建议：${esc(f.sug)}</div>` : ''}</div>`;
    });
  } else if (state.reasonTab === 'conflict') {
    if (!s.conflicts.length) h += `<div class="empty">当前案件未识别到明显矛盾</div>`;
    s.conflicts.forEach(x => {
      h += `<div class="conflict"><div class="ct"><span class="ty">${esc(x.type)}矛盾</span></div>
        <div class="desc">${esc(x.desc)}</div><div class="pair">证据：${esc(x.pair)} · 只提示，采不采纳由律师决定</div></div>`;
    });
    h += `<div class="notice">日期与金额矛盾用规则逐项比对，不让大模型估算；说法矛盾由大模型判断语义。</div>`;
  } else {
    s.risks.forEach(r => {
      const cls = r.level === '高' ? 'hi' : 'mid';
      h += `<div class="risk"><div class="rt"><b style="font-size:13px;color:var(--navy)">${esc(r.id)}</b><span class="lv ${cls}">${esc(r.level)}风险</span></div>
        <div class="rd">${esc(r.desc)}</div>
        <div class="ru">对方可能：${esc(r.use)}</div>
        <div class="ra">应对建议：${esc(r.advice)}</div></div>`;
    });
    h += `<div class="notice">是否提交、如何应对由律师决定；补材料后可自动重新排查。</div>`;
  }

  if (state.caseId === 'c1') {
    h += `<div class="sec-t">新证据增量处理</div>`;
    if (!state.newEvDone) {
      h += `<div class="card"><div style="font-size:11.5px;color:#4a5563;line-height:1.65">对方在举证期最后一天提交 D01–D04。不重排全部证据，分三步：定位关联 → 插入时间线 → 重新校验。</div>
        <button class="primary" style="margin-top:9px" onclick="doNewEvidence()">运行增量处理</button></div>`;
    } else {
      h += `<div class="changelog"><h4>本次变化清单</h4><div class="cl">
        · 新增 1 个时间节点：D01 送检日 06-28<br>
        · 事实状态变化：「未在检验期内异议」由缺口 → 有风险<br>
        · 新增 2 处矛盾：日期（06-28 晚于 06-22）、说法（资金紧张 ↔ 质量问题）<br>
        · 原有证据对应关系保持不变</div></div>`;
    }
  }
  return h;
}

/* ---------- 视图 5：诉讼策略 ---------- */
function viewStrategy() {
  const c = curCase();
  if (!state.strategyGenerated || !state.strategy) {
    return `<div class="brand"><div class="lg">◇</div><h2>生成诉讼策略草案</h2><p>基于已整理的证据推理结果，而非原始材料</p></div>
      <div class="disclaim">系统只输出可审查的策略初稿，不构成胜诉承诺；每条论点都挂证据编号，可逐条核对。</div>
      <div class="card"><div style="font-size:12px;color:#4a5563;line-height:1.8">
      <b style="color:var(--navy)">将读取的证据推理结果：</b><br>
      · 事实时间线（${c.timeline.length} 个节点）${c.unconfirmed ? '，含待确认日期' : ''}<br>
      · 待证事实与缺口（${c.facts.length} 项）<br>
      · 证据矛盾（${c.conflicts.length} 处）· 我方风险（${c.risks.length} 项）</div></div>
      <button class="primary" onclick="genStrategy()">生成诉讼策略草案</button>`;
  }
  const s = state.strategy;
  let h = `<div class="disclaim">${esc(s.generateNote || 'AI 初稿 · 不构成胜诉承诺 · 每条可核对来源')}</div>`;
  h += `<div class="subtabs">${[['focus', '争议焦点'], ['attack', '攻防'], ['evidence', '证据'], ['risk', '风险']].map(t => `<button class="${state.strategyTab === t[0] ? 'on' : ''}" onclick="setSTab('${t[0]}')">${t[1]}</button>`).join('')}</div>`;

  if (state.strategyTab === 'focus') {
    (s.focus || []).forEach((x, i) => {
      const ck = state.checked['f' + i];
      h += `<div class="blk"><div class="h"><h4>${i + 1}. ${esc(x.t)}</h4><span class="bd2 ${x.lv === '高' ? 'hi' : 'mid'}">${esc(x.lv)}优先级</span></div>
        <p><b>为什么重要：</b>${esc(x.why)}</p><p><b>${esc(x.base)}</b></p>
        <p style="color:var(--gold)">依据：${esc(x.ref)}</p>
        <div style="display:flex;gap:7px;margin-top:9px;flex-wrap:wrap"><button class="chk ${ck === 'ok' ? 'done' : ''}" onclick="mark('f${i}','ok')">${ck === 'ok' ? '✓ 已核对' : '标已核对'}</button>
        <button class="chk ${ck === 'bad' ? 'bad' : ''}" onclick="mark('f${i}','bad')">有疑问</button>
        <button class="chk" onclick="openModal('src')">查看依据原文</button></div></div>`;
    });
  } else if (state.strategyTab === 'attack') {
    const a = s.attack || {};
    h += `<div class="att"><b>我方主张</b><br>${esc(a.claim)}</div>`;
    h += `<div class="def"><b>对方可能抗辩</b><br>${esc(a.defense)}</div>`;
    h += `<div class="att"><b>应对要点</b><br>${esc(a.response)}</div>`;
    h += `<div class="notice">来源：矛盾识别（日期/金额/说法）、我方风险。攻防为双视角草案，由律师确认后使用。</div>`;
  } else if (state.strategyTab === 'evidence') {
    (s.evidence || []).forEach(f => {
      h += `<div class="blk"><div class="h"><h4>${esc(f.name)}</h4><span class="bd2 ${f.state === '充分' ? 'low' : (f.state === '有缺口' ? 'mid' : 'hi')}">${esc(f.state)}</span></div>
        <p>支撑：${esc(f.support)}</p>${f.advice ? `<p style="color:var(--warn)">庭前补强：${esc(f.advice)}</p>` : ''}</div>`;
    });
  } else {
    (s.risk || []).forEach(r => {
      h += `<div class="blk"><div class="h"><h4>${esc(r.id)} · ${esc(r.level)}风险</h4></div><p>${esc(r.desc)}</p><p style="color:var(--warn)">对方可能：${esc(r.use)}</p><p style="color:var(--ok)">应对：${esc(r.advice)}</p></div>`;
    });
  }
  h += `<button class="primary" style="margin-top:6px" onclick="genReport()">导出策略报告</button>`;
  return h;
}

function viewLoading() {
  return `<div class="loading"><div class="spin"></div><p style="font-weight:600;color:var(--navy)">AI 正在生成策略草案</p><p id="loadLog" style="text-align:left;max-width:260px;margin:12px auto">▸ 读取事实时间线（含待确认日期）…</p></div>`;
}

/* ---------- 报告 ---------- */
function viewReport() {
  const c = curCase();
  let h = `<div class="brand"><div class="lg" style="background:var(--ok)">✓</div><h2>策略报告已生成</h2><p>${esc(c.name)} · ${esc(c.cause)}</p></div>`;
  if (state.reportText) {
    h += `<div class="card"><div style="font-size:11.5px;color:#4a5563;line-height:1.8;white-space:pre-wrap;word-break:break-word">${esc(state.reportText)}</div></div>`;
  }
  h += `<div class="notice" style="margin-bottom:12px">报告每条论点均可追溯到证据编号；如有未确认的推断日期，须先确认再导出。</div>`;
  h += `<button class="primary" onclick="copyReport()">复制报告全文</button>`;
  h += `<button class="primary gold" style="margin-top:8px" onclick="goBack()">返回工作台</button>`;
  return h;
}

/* ---------- 弹层 ---------- */
function modalHtml() {
  const m = state.modal;
  if (m.type === 'mask') {
    const e = curCase().evidence.find(x => x.id === m.id) || curCase().evidence[0];
    API.mask(e.raw).then(r => {
      const host = document.getElementById('modalHost');
      if (!host || !state.modal || state.modal.type !== 'mask') return;
      let src = esc(e.raw);
      (r.entities || []).forEach(en => { if (en.raw) src = src.split(esc(en.raw)).join('<mark>' + esc(en.raw) + '</mark>'); });
      let h = `<div class="sheet"><div class="sh"><b>脱敏对比 · ${esc(e.id)}</b><span class="x" onclick="closeModal()">✕</span></div>
        <div class="cmp"><div class="col"><h5>原文（含敏感信息）</h5><div class="txt">${src}</div></div>
        <div class="col mask"><h5>脱敏后（可出本地）</h5><div class="txt">${highlightMasked(r)}</div></div></div>
        <div class="detect"><h5>识别到的敏感信息 · ${(r.entities || []).length} 处</h5>`;
      if (!(r.entities || []).length) h += `<div class="row">未识别到敏感信息</div>`;
      (r.entities || []).forEach(en => { h += `<div class="row"><span>${esc(en.type)}</span><b>${esc(en.raw)} → ${esc(en.masked)}</b></div>`; });
      h += `</div><div class="notice">来源：${esc(r.source)}${r.note ? ' · ' + esc(r.note) : ''}</div>
        <button class="primary" onclick="closeModal()">知道了</button></div>`;
      host.innerHTML = '<div class="modal" onclick="if(event.target===this)closeModal()">' + h + '</div>';
    }).catch(err => alert('脱敏失败：' + err.message));
    return `<div class="modal"><div class="sheet"><div class="loading"><div class="spin"></div><p>正在脱敏…</p></div></div></div>`;
  }
  if (m.type === 'src') {
    const e = curCase().evidence[0];
    return `<div class="modal" onclick="if(event.target===this)closeModal()"><div class="sheet"><div class="sh"><b>依据原文位置 · ${esc(e.id)}</b><span class="x" onclick="closeModal()">✕</span></div>
      <div class="srcbox">${esc(e.raw)}<br><br><span style="color:var(--muted)">来源：${esc(e.name)} · ${esc(e.date)}</span></div>
      <div class="notice">每条策略论点都可点回证据原文；无原文依据的 AI 结果不展示。</div>
      <button class="primary" onclick="closeModal()">关闭</button></div></div>`;
  }
  if (m.type === 'change') {
    const r = m.result || {};
    const changes = Array.isArray(r.changes) ? r.changes.join('<br>') : esc(r.changes || '处理完成');
    return `<div class="modal" onclick="if(event.target===this)closeModal()"><div class="sheet"><div class="sh"><b>新证据增量 · 本次变化</b><span class="x" onclick="closeModal()">✕</span></div>
      <div class="changelog"><h4>D01–D04 处理完成</h4><div class="cl">${r.alreadyDone ? '本次结果保持不变。<br>' : ''}${changes}</div></div>
      <div class="notice">庭审策略据此只更新受影响部分，「质量异议」成为新的主要矛盾。</div>
      <button class="primary" onclick="closeModal()">查看时间线</button></div></div>`;
  }
  return '';
}

boot();
