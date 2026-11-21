'use strict';

/**
 * 前端 API 客户端
 * 所有数据交互统一走后端 REST API，前端不再硬编码案件数据。
 * 后端返回格式：{ ok: true, data: ... } 或 { ok: false, error: '...' }
 */
const API = (() => {
  // 优先级：本地保存的地址 > 配置文件 > 默认相对路径
  const saved = (() => { try { return localStorage.getItem('liti_api_base'); } catch (_) { return null; } })();
  const configured = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '';
  let base = saved || configured || '/api';
  let token = '';

  function setBase(url) {
    base = String(url || '/api').replace(/\/$/, '');
    try { localStorage.setItem('liti_api_base', base); } catch (_) { /* 忽略存储失败 */ }
  }
  function setToken(t) { token = t || ''; }
  function getBase() { return base; }

  async function request(method, path, payload) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers,
        body: payload == null ? undefined : JSON.stringify(payload),
      });
    } catch (e) {
      throw new Error('无法连接后端服务，请确认服务已启动');
    }
    let body;
    try { body = await res.json(); } catch (_) { throw new Error('后端返回格式异常（HTTP ' + res.status + '）'); }
    if (!res.ok || body.ok === false) throw new Error(body.error || ('请求失败（HTTP ' + res.status + '）'));
    return body.data;
  }

  return {
    setBase,
    getBase,
    setToken,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b == null ? {} : b),

    health: () => request('GET', '/health'),
    config: () => request('GET', '/config'),
    cases: () => request('GET', '/cases'),
    caseDetail: (id) => request('GET', '/cases/' + encodeURIComponent(id)),
    createCase: (payload) => request('POST', '/cases', payload),

    evidence: (id, q) => request('GET', '/cases/' + encodeURIComponent(id) + '/evidence' + (q ? '?q=' + encodeURIComponent(q) : '')),
    searchEvidence: (q, caseId) => request('GET', '/evidence/search?q=' + encodeURIComponent(q || '') + (caseId ? '&caseId=' + encodeURIComponent(caseId) : '')),
    addEvidence: (id, ev) => request('POST', '/cases/' + encodeURIComponent(id) + '/evidence', ev),
    mask: (text) => request('POST', '/redaction/mask', { text }),
    maskBatch: (texts) => request('POST', '/redaction/mask-batch', { texts }),

    timeline: (id, filter) => request('GET', '/cases/' + encodeURIComponent(id) + '/timeline' + (filter ? '?filter=' + encodeURIComponent(filter) : '')),
    confirmDates: (id) => request('POST', '/cases/' + encodeURIComponent(id) + '/timeline/confirm'),
    incremental: (id) => request('POST', '/cases/' + encodeURIComponent(id) + '/evidence/incremental'),

    reason: (id) => request('GET', '/cases/' + encodeURIComponent(id) + '/reason'),
    generateStrategy: (id) => request('POST', '/cases/' + encodeURIComponent(id) + '/strategy/generate'),
    getStrategy: (id) => request('GET', '/cases/' + encodeURIComponent(id) + '/strategy'),
    checkStrategy: (id, key, value) => request('POST', '/cases/' + encodeURIComponent(id) + '/strategy/check', { key, value }),
    report: (id) => request('POST', '/cases/' + encodeURIComponent(id) + '/strategy/report'),

    reseed: () => request('POST', '/system/reseed'),
  };
})();
