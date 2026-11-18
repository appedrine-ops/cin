// CIN LIVE: phone-to-phone live video (WebRTC). Firestore carries only the handshake and the chat.
import { CIN } from "./cin-backend.js?v=23";
if (CIN.configured) {
  const X = window.CINX || {};
  const userTurn = window.CIN_CONFIG && window.CIN_CONFIG.turn;
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }].concat(userTurn || [
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }]) };
  const MAX_VIEWERS = 6;
  const ic = (n, s) => CI.svg(n, s || 22);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const css = document.createElement('style');
  css.textContent = `
.lv{position:absolute;inset:0;z-index:45;background:#07080c;display:none;flex-direction:column}.lv.show{display:flex}
.lv-pane{display:none;flex:1;min-height:0;flex-direction:column;position:relative}.lv-pane.show{display:flex}
.lv-top{display:flex;align-items:center;gap:10px;padding:14px 12px}.lv-top b{flex:1;font-size:17px}
.lv-ib{width:42px;height:42px;border-radius:50%;background:#ffffff18;color:#fff;display:grid;place-items:center;flex:none}
.lv-badge{background:#ff2d55;color:#fff;font-weight:900;font-size:12px;letter-spacing:.5px;padding:5px 10px;border-radius:8px}
.lv-cnt{background:#0008;color:#fff;font-size:12px;font-weight:800;padding:5px 10px;border-radius:8px}
.lv-go{margin:6px 16px 4px;padding:15px;border-radius:16px;font-weight:900;font-size:16px;background:linear-gradient(135deg,#ff2d55,#ff7a45);color:#fff;display:flex;align-items:center;justify-content:center;gap:10px}
.lv-list{flex:1;overflow:auto;padding:8px 16px 20px;display:flex;flex-direction:column;gap:10px}
.lv-card{display:flex;align-items:center;gap:12px;background:#14161d;border-radius:16px;padding:12px;text-align:left;color:#fff;width:100%}
.lv-av{width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#b8ff4a,#2fb58a);color:#10140b;display:grid;place-items:center;font-weight:900;font-size:18px;flex:none}
.lv-card .t{flex:1;min-width:0}.lv-card .t b{display:block;font-size:15px}.lv-card .t span{display:block;color:#9aa0b0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lv-empty{color:#9aa0b0;text-align:center;padding:40px 20px;font-size:15px}
.lv-setup{flex:1;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:24px}.lv-setup input{background:#14161d;border:1px solid #2a2d3a;border-radius:14px;padding:15px;color:#fff;font-size:16px;outline:0}.lv-setup p{color:#9aa0b0;font-size:13px;margin:0}
.lv-stage{position:absolute;inset:0;background:#000;display:flex;align-items:center;justify-content:center}.lv-stage video{width:100%;height:100%;object-fit:cover}
.lv-over{position:relative;z-index:2;display:flex;flex-direction:column;flex:1;min-height:0;background:linear-gradient(#0009,#0000 22%,#0000 55%,#000b)}
.lv-mid{flex:1}.lv-status{position:absolute;left:0;right:0;top:45%;text-align:center;color:#fff;font-weight:700;z-index:3;padding:0 30px;text-shadow:0 1px 4px #000}
.lv-chat{max-height:34%;overflow:auto;padding:0 14px;display:flex;flex-direction:column;gap:4px;mask-image:linear-gradient(transparent,#000 25%)}
.lv-chat div{font-size:14px;color:#fff;text-shadow:0 1px 3px #000;word-break:break-word}.lv-chat b{color:#b8ff4a;margin-right:6px}
.lv-in{display:flex;gap:8px;padding:10px 12px calc(12px + env(safe-area-inset-bottom))}.lv-in input{flex:1;background:#0009;border:1px solid #ffffff30;border-radius:22px;padding:12px 16px;color:#fff;outline:0;font-size:15px}.lv-in button{width:44px;height:44px;border-radius:50%;background:#b8ff4a;color:#10140b;display:grid;place-items:center}
.lv-end{background:#ff2d55;color:#fff;font-weight:800;border-radius:20px;padding:9px 16px}`;
  document.head.append(css);

  const lv = document.createElement('div'); lv.className = 'lv'; lv.id = 'lv';
  const chatHTML = '<div class="lv-chat"></div><form class="lv-in"><input maxlength="200" placeholder="Say something" aria-label="Chat message"><button type="submit" aria-label="Send">' + ic('send', 20) + '</button></form>';
  lv.innerHTML =
    '<div class="lv-pane" id="lvLobby"><div class="lv-top"><button type="button" class="lv-ib" id="lvBack" aria-label="Back">' + ic('back') + '</button><b>LIVE</b></div>' +
      '<button type="button" class="lv-go" id="lvGoBtn">' + ic('live', 22) + 'Go LIVE</button><div class="lv-list" id="lvList"></div></div>' +
    '<div class="lv-pane" id="lvSetup"><div class="lv-top"><button type="button" class="lv-ib" id="lvSetBack" aria-label="Back">' + ic('back') + '</button><b>Go LIVE</b></div>' +
      '<div class="lv-setup"><input id="lvTitle" maxlength="60" placeholder="Add a title"><p>Your camera and microphone turn on. Up to ' + MAX_VIEWERS + ' people can watch at once. Use Wi-Fi or a strong signal.</p><button type="button" class="lv-go" id="lvStart" style="margin:0">' + ic('live', 22) + 'Start</button></div></div>' +
    '<div class="lv-pane" id="lvHost"><div class="lv-stage"><video id="lvHostV" playsinline muted autoplay></video></div><div class="lv-over">' +
      '<div class="lv-top"><span class="lv-badge">LIVE</span><span class="lv-cnt" id="lvHostCnt">0 watching</span><b></b><button type="button" class="lv-ib" id="lvFlip" aria-label="Flip camera">' + ic('flip') + '</button><button type="button" class="lv-end" id="lvEnd">End</button></div><div class="lv-mid"></div>' + chatHTML + '</div></div>' +
    '<div class="lv-pane" id="lvView"><div class="lv-stage"><video id="lvViewV" playsinline autoplay></video></div><div class="lv-status" id="lvStatus">Connecting...</div><div class="lv-over">' +
      '<div class="lv-top"><span class="lv-badge">LIVE</span><b id="lvWho"></b><span class="lv-cnt" id="lvViewCnt"></span><button type="button" class="lv-ib" id="lvLeave" aria-label="Leave">' + ic('close') + '</button></div><div class="lv-mid"></div>' + chatHTML + '</div></div>';
  $('.app').append(lv);
  const pane = id => { $$('.lv-pane').forEach(p => p.classList.toggle('show', p.id === id)); lv.classList.add('show'); };
  const hide = () => { lv.classList.remove('show'); $$('.lv-pane').forEach(p => p.classList.remove('show')); };

  function gathered(pc) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, 4500);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }
  const desc = pc => ({ type: pc.localDescription.type, sdp: pc.localDescription.sdp });
  function paintChat(root, msgs) {
    const box = root.querySelector('.lv-chat'); const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    box.innerHTML = msgs.map(m => '<div><b>' + esc(m.handle) + '</b>' + esc(m.text) + '</div>').join('');
    if (atEnd) box.scrollTop = box.scrollHeight;
  }
  function wireChat(root, getId) {
    const f = root.querySelector('.lv-in'), inp = f.querySelector('input'); let last = 0;
    f.onsubmit = async e => {
      e.preventDefault(); const t = inp.value.trim(); if (!t || Date.now() - last < 1200) return; last = Date.now(); inp.value = '';
      try { await CIN.live.sendChat(getId(), t); } catch (er) { toast('Could not send'); }
    };
  }

  // ---------- lobby ----------
  let unsubAll = null;
  const fresh = l => { const t = l.lastBeat && l.lastBeat.seconds; return !t || Date.now() / 1000 - t < 90; };
  function openLobby() {
    pane('lvLobby');
    if (unsubAll) unsubAll();
    const list = $('#lvList'); list.innerHTML = '<div class="lv-empty">Looking for live streams...</div>';
    unsubAll = CIN.live.watchAll(items => {
      items = items.filter(fresh); list.innerHTML = '';
      if (!items.length) { list.innerHTML = '<div class="lv-empty">Nobody is live right now.<br>Be the first and tap Go LIVE.</div>'; return; }
      items.forEach(l => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'lv-card';
        b.innerHTML = '<span class="lv-av">' + esc((l.handle || '?')[0].toUpperCase()) + '</span><span class="t"><b>@' + esc(l.handle) + '</b><span>' + esc(l.title) + '</span></span><span class="lv-badge">LIVE</span>';
        b.onclick = () => watch(l); list.append(b);
      });
    }, () => { list.innerHTML = '<div class="lv-empty">Could not load live streams.</div>'; });
  }
  function closeLobby() { if (unsubAll) { unsubAll(); unsubAll = null; } hide(); }
  $('#lvBack').onclick = closeLobby;
  $('#lvGoBtn').onclick = () => state.account ? openSetup() : gate(openSetup);
  function openSetup() { pane('lvSetup'); }
  $('#lvSetBack').onclick = openLobby;

  // ---------- host ----------
  let H = null;
  async function startHost() {
    const title = $('#lvTitle').value.trim();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Your browser cannot use the camera here'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true }); }
    catch (e) { toast('Allow camera and microphone to go live'); return; }
    let id;
    try { id = await CIN.live.start(title); } catch (e) { stream.getTracks().forEach(t => t.stop()); toast(/permission/i.test(String(e && (e.code || e.message))) ? 'Firebase blocked LIVE. Publish the new Firestore rules first.' : 'Could not start the live'); return; }
    H = { id, stream, pcs: new Map(), facing: 'user', timers: [], unsubs: [] };
    $('#lvHostV').srcObject = stream; pane('lvHost'); $('#lvHost .lv-chat').innerHTML = '';
    try { if (navigator.wakeLock) H.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    const count = () => { const n = [...H.pcs.values()].filter(p => p.connectionState === 'connected').length; $('#lvHostCnt').textContent = n + ' watching'; return n; };
    H.count = count;
    H.timers.push(setInterval(() => CIN.live.beat(id, count()).catch(() => {}), 20000));
    H.unsubs.push(CIN.live.watchChat(id, m => paintChat($('#lvHost'), m)));
    H.unsubs.push(CIN.live.watchPeers(id, async (type, pid, data) => {
      if (type === 'removed') { const o = H.pcs.get(pid); if (o) { o.close(); H.pcs.delete(pid); count(); } return; }
      if (!data || !data.offer || data.answer) return;
      const old = H.pcs.get(pid); if (old) { old.close(); H.pcs.delete(pid); }
      if (H.pcs.size >= MAX_VIEWERS) return;
      const pc = new RTCPeerConnection(ICE); H.pcs.set(pid, pc);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState) && H && H.pcs.get(pid) === pc) { H.pcs.delete(pid); } if (H) CIN.live.beat(id, count()).catch(() => {}); };
      try {
        await pc.setRemoteDescription(data.offer); await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
        await CIN.live.sendAnswer(id, pid, desc(pc));
      } catch (e) { console.warn('viewer handshake failed', e); pc.close(); H.pcs.delete(pid); }
    }));
  }
  async function endHost(ask) {
    if (!H) return; if (ask && !confirm('End your live?')) return;
    const h = H; H = null;
    h.timers.forEach(clearInterval); h.unsubs.forEach(u => u && u()); h.pcs.forEach(p => p.close());
    h.stream.getTracks().forEach(t => t.stop()); try { h.wake && h.wake.release(); } catch (e) {}
    try { await CIN.live.end(h.id); } catch (e) {}
    $('#lvHostV').srcObject = null; toast('Your live has ended'); openLobby();
  }
  $('#lvStart').onclick = startHost;
  $('#lvEnd').onclick = () => endHost(true);
  $('#lvFlip').onclick = async () => {
    if (!H) return; const next = H.facing === 'user' ? 'environment' : 'user';
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next }, audio: false }), nt = ns.getVideoTracks()[0];
      H.pcs.forEach(pc => pc.getSenders().forEach(s => { if (s.track && s.track.kind === 'video') s.replaceTrack(nt); }));
      H.stream.getVideoTracks().forEach(t => { t.stop(); H.stream.removeTrack(t); }); H.stream.addTrack(nt); H.facing = next;
      $('#lvHostV').srcObject = H.stream;
    } catch (e) { toast('Could not switch camera'); }
  };
  wireChat($('#lvHost'), () => H && H.id);

  // ---------- viewer ----------
  let V = null;
  async function watch(live) {
    if (!state.account) { gate(() => watch(live)); return; }
    if (state.uid && live.uid === state.uid) { toast('This is your own live'); return; }
    if (unsubAll) { unsubAll(); unsubAll = null; }
    pane('lvView'); $('#lvWho').textContent = '@' + live.handle; $('#lvViewCnt').textContent = ''; $('#lvViewV').srcObject = null;
    const st = $('#lvStatus'); st.style.display = ''; st.textContent = 'Connecting...'; $('#lvView .lv-chat').innerHTML = '';
    const pc = new RTCPeerConnection(ICE); V = { id: live.id, pc, unsubs: [], timer: null };
    const v = V;
    pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = e => { const vid = $('#lvViewV'); if (vid.srcObject !== e.streams[0]) vid.srcObject = e.streams[0]; vid.play().catch(() => {}); st.style.display = 'none'; };
    pc.onconnectionstatechange = () => { if (V === v && ['failed', 'disconnected'].includes(pc.connectionState)) { st.style.display = ''; st.textContent = 'Connection lost. Check your signal.'; } };
    try {
      await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
      let answered = false;
      v.unsubs.push(CIN.live.watchPeer(live.id, d => { if (d && d.answer && !answered) { answered = true; pc.setRemoteDescription(d.answer).catch(() => {}); } }));
      await CIN.live.sendOffer(live.id, desc(pc));
    } catch (e) { console.warn(e); st.textContent = 'Could not join this live'; }
    v.unsubs.push(CIN.live.watchOne(live.id, l => {
      if (!l || l.status === 'ended') { if (V === v) { st.style.display = ''; st.textContent = 'This live has ended'; setTimeout(() => { if (V === v) leave(); }, 2200); } return; }
      $('#lvViewCnt').textContent = (l.viewers || 0) + ' watching';
    }));
    v.unsubs.push(CIN.live.watchChat(live.id, m => paintChat($('#lvView'), m)));
    v.timer = setTimeout(() => { if (V === v && st.style.display !== 'none') st.textContent = 'Still connecting. The live may be full, or your network blocks live video. Try Wi-Fi.'; }, 22000);
  }
  function leave() {
    if (!V) return; const v = V; V = null;
    clearTimeout(v.timer); v.unsubs.forEach(u => u && u()); v.pc.close(); CIN.live.dropPeer(v.id);
    $('#lvViewV').srcObject = null; openLobby();
  }
  $('#lvLeave').onclick = leave;
  wireChat($('#lvView'), () => V && V.id);
  window.addEventListener('pagehide', () => { if (V) CIN.live.dropPeer(V.id); if (H) CIN.live.end(H.id); });

  // ---------- entry points ----------
  $('#liveBtn').onclick = openLobby;
  const go = $('#stGoLive'); if (go) go.onclick = () => { const t = $('#stLiveTitle').value; if (X.closeStudio) X.closeStudio(); $('#lvTitle').value = t || ''; state.account ? openSetup() : gate(openSetup); };
  window.CINlive = { open: openLobby };
}
