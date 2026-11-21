'use strict';

/**
 * 移动端设置：运行时修改后端地址，无需重新打包。
 * 典型场景：手机连电脑局域网调试，电脑 IP 变了直接在 APP 里改。
 */

function openServerSetting() {
  const cur = API.getBase();
  const host = document.getElementById('settingHost');
  host.innerHTML = `
    <div class="setting-mask" id="setMask">
      <div class="setting-card">
        <h3>服务器设置</h3>
        <div class="tip">APP 要连接后端才能取数据。电脑跑后端时，填电脑的局域网 IP。</div>
        <input id="apiBaseInput" type="text" placeholder="http://192.168.1.10:3000/api" value="${esc(cur === '/api' ? '' : cur)}" autocapitalize="off" autocomplete="off" spellcheck="false">
        <div class="cur">当前：${esc(cur)}</div>
        <div class="btnrow">
          <button class="btn-ghost" onclick="closeServerSetting()">取消</button>
          <button class="btn-main" onclick="saveServerSetting()">保存并连接</button>
        </div>
        <button class="btn-del" style="width:100%;margin-top:8px" onclick="resetServerSetting()">恢复默认（同源 /api）</button>
        <div class="hint">
          · 手机与电脑需连同一个 WiFi<br>
          · 电脑 IP：macOS 终端运行 <b>ipconfig getifaddr en0</b><br>
          · 后端需监听 0.0.0.0（工程默认已设置）<br>
          · 部署到公网后填域名即可，如 https://your-domain.com/api
        </div>
      </div>
    </div>`;
  document.getElementById('setMask').addEventListener('click', e => {
    if (e.target.id === 'setMask') closeServerSetting();
  });
  setTimeout(() => { const el = document.getElementById('apiBaseInput'); if (el) el.focus(); }, 50);
}

function closeServerSetting() {
  document.getElementById('settingHost').innerHTML = '';
}

function saveServerSetting() {
  const raw = (document.getElementById('apiBaseInput').value || '').trim();
  if (!raw) { alert('请填写后端地址，或点「恢复默认」'); return; }
  if (!/^https?:\/\//i.test(raw)) { alert('地址需以 http:// 或 https:// 开头'); return; }
  API.setBase(raw.replace(/\/$/, ''));
  closeServerSetting();
  alert('已保存，正在重新连接…');
  boot();
}

function resetServerSetting() {
  try { localStorage.removeItem('liti_api_base'); } catch (_) {}
  closeServerSetting();
  alert('已恢复默认，正在重新连接…');
  boot();
}

/* ---------------- PWA 安装引导 ---------------- */
function showInstallTipOnce() {
  try {
    if (localStorage.getItem('liti_install_tip_shown')) return;
    localStorage.setItem('liti_install_tip_shown', '1');
  } catch (_) { /* 忽略 */ }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const guide = document.getElementById('itGuide');
  const note = document.getElementById('itNote');
  if (isIOS) {
    guide.innerHTML = '这是苹果手机：点底部中间的 <b>分享按钮（□↑）</b> → 下滑找到 <b>「添加到主屏幕」</b> → 点右上角「添加」，桌面就会出现 APP 图标。';
    note.textContent = '提示：请确认是用 Safari 浏览器打开，其它浏览器可能没有此选项。';
  } else {
    guide.innerHTML = '这是安卓手机：点浏览器 <b>右上角菜单（⋮）</b> → 选择 <b>「添加到主屏幕」/「安装应用」</b>，桌面就会出现 APP 图标。';
    note.textContent = '若下方出现「一键安装」按钮，直接点它更快。';
  }
  document.getElementById('installTip').style.display = 'flex';
}

function closeInstallTip() {
  const el = document.getElementById('installTip');
  if (el) el.style.display = 'none';
}

async function doInstall() {
  if (!window.deferredPrompt) { closeInstallTip(); return; }
  window.deferredPrompt.prompt();
  await window.deferredPrompt.userChoice;
  window.deferredPrompt = null;
  closeInstallTip();
}

// 首次进入显示安装引导（延迟 1.2 秒，避免遮挡加载）
setTimeout(showInstallTipOnce, 1200);
