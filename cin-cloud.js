// CIN cloud glue: connects the existing index.html screens to the Firebase backend.
// If cin-backend.js has no Firebase config yet, this file does nothing and the app stays in local-demo mode.
import { CIN } from "./cin-backend.js?v=17";

if (CIN.configured) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clipEl = id => id ? $('.clip[data-id="' + CSS.escape(id) + '"]') : null;
  const handleUid = {};            // '@handle' -> uid
  let signingUp = false, cursor = null, loading = false, exhausted = false;
  let unsubC = null, unsubCircle = null, unsubCollabs = null;
  let cloudIn = [], outList = [], searchNames = [], searching = false;
  const circleCache = {};
  state.uid = null;

  const ERR = {
    'auth/email-already-in-use': 'That email already has an account. Try logging in.',
    'auth/invalid-credential': 'Wrong email or password',
    'auth/wrong-password': 'Wrong email or password',
    'auth/user-not-found': 'Wrong email or password',
    'auth/invalid-email': 'That email does not look right',
    'auth/weak-password': 'Use a password with at least 6 characters',
    'auth/network-request-failed': 'No internet connection',
    'auth/too-many-requests': 'Too many tries. Wait a moment.'
  };
  const friendly = e => ERR[e && e.code] || (e && e.message && e.message.length < 70 ? e.message : 'Something went wrong. Try again.');

  // ---------- Sign in / sign up UI ----------
  const nameRow = $('#joinName').closest('.formrow'), handleRow = $('#joinHandle').closest('.formrow'), agree = $('#joinAge').closest('label');
  function mkRow(label, id, type, ph) {
    const d = document.createElement('div'); d.className = 'formrow';
    const l = document.createElement('label'); l.textContent = label;
    const i = document.createElement('input'); i.id = id; i.type = type; i.placeholder = ph;
    i.autocomplete = type === 'password' ? 'current-password' : 'email';
    d.append(l, i); return d;
  }
  const emailRow = mkRow('Email', 'joinEmail', 'email', 'you@example.com');
  const passRow = mkRow('Password', 'joinPass', 'password', 'At least 6 characters');
  handleRow.after(emailRow); emailRow.after(passRow);
  // choose what you love: used to shape your For You feed
  const TOPICS = ['Dance', 'Comedy', 'Education', 'Technology', 'Music', 'Lifestyle'], picked = new Set();
  const intRow = document.createElement('div'); intRow.className = 'formrow';
  intRow.innerHTML = '<label>What do you want to see? (pick any)</label><div class="intchips"></div>';
  TOPICS.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => { picked.has(t) ? picked.delete(t) : picked.add(t); b.classList.toggle('on', picked.has(t)); }; intRow.querySelector('.intchips').append(b); });
  passRow.after(intRow);
  const swap = document.createElement('button'); swap.className = 'secondary'; swap.style.cssText = 'width:100%;margin-top:10px';
  $('#joinBtn').after(swap);
  let mode = 'signup';
  function setMode(m) {
    mode = m; const login = m === 'login';
    nameRow.style.display = handleRow.style.display = agree.style.display = intRow.style.display = login ? 'none' : '';
    $('#joinBtn').textContent = login ? 'Log in' : 'Join CIN';
    $('#authModal .sheethead strong').textContent = login ? 'Log in' : 'Join CIN';
    swap.textContent = login ? 'New here? Create an account' : 'I already have an account';
  }
  swap.onclick = () => setMode(mode === 'login' ? 'signup' : 'login');
  setMode('signup');
  { const ps = $$('#authModal p.sub'); if (ps[1]) ps[1].textContent = 'Your account is protected by Firebase sign-in. Never share your password.'; }
  $('#upload p.sub:last-of-type') && ($('#upload p.sub:last-of-type').textContent = 'Videos upload to the cloud and appear in the feed for everyone.');
  $('#discover .empty').textContent = 'Type a username above to find creators.';
  $('#handleInput').readOnly = true;

  async function afterLogin() {
    $('#authModal').classList.remove('show');
    const f = pendingAction; pendingAction = null; if (f) f();
  }
  $('#joinBtn').onclick = async () => {
    const email = $('#joinEmail').value.trim(), pass = $('#joinPass').value;
    if (!email || pass.length < 6) { toast('Enter your email and a 6+ character password'); return; }
    const btn = $('#joinBtn'); btn.disabled = true;
    try {
      if (mode === 'login') { await CIN.signIn(email, pass); }
      else {
        const n = $('#joinName').value.trim(), h = $('#joinHandle').value.trim();
        if (!n || !h) { toast('Add your name and a username'); return; }
        if (!$('#joinAge').checked) { toast('You must be 13 or older to join'); return; }
        signingUp = true;
        try { localStorage.setItem('cin_interests', JSON.stringify([...picked])); } catch (e) {}
        await CIN.signUp({ email, password: pass, name: n, handle: h, interests: [...picked] });
        signingUp = false;
        await loadAccount(CIN.auth.currentUser);
      }
      toast('Welcome to CIN');
      afterLogin();
    } catch (e) { signingUp = false; toast(friendly(e)); }
    finally { btn.disabled = false; }
  };

  // ---------- Account state ----------
  // ---------- verification badges ----------
  const vCache = new Map();
  const decEnt = t => { const e = document.createElement('textarea'); e.innerHTML = String(t); return e.value; };
  const vcss = document.createElement('style');
  vcss.textContent = '.vbadge{display:inline-flex;vertical-align:-3px;margin-left:5px}.vbadge svg{display:block}.admbtn{width:100%;margin-top:10px;padding:14px;border-radius:16px;background:#14161d;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px}.adm{position:absolute;inset:0;z-index:36;background:#07080c;display:none;flex-direction:column}.adm.show{display:flex}.adm-top{display:flex;align-items:center;gap:10px;padding:14px 12px}.adm-top b{flex:1;font-size:17px}.adm-top button{width:42px;height:42px;border-radius:50%;background:#ffffff18;color:#fff;display:grid;place-items:center}.adm input{margin:4px 16px 10px;background:#14161d;border:1px solid #2a2d3a;border-radius:14px;padding:14px;color:#fff;font-size:16px;outline:0}.adm-list{flex:1;overflow:auto;padding:0 16px 20px;display:flex;flex-direction:column;gap:8px}.adm-row{display:flex;align-items:center;gap:12px;background:#14161d;border-radius:14px;padding:11px}.adm-row .t{flex:1;min-width:0}.adm-row .t b{display:flex;align-items:center;font-size:15px}.adm-row .t>span{display:block;color:#9aa0b0;font-size:13px}.adm-row button{padding:9px 14px;border-radius:18px;font-weight:800;font-size:13px;background:#1d9bf0;color:#fff}.adm-row button.rm{background:#2a2d3a;color:#ff7a90}.adm-tabs{display:flex;gap:8px;padding:0 16px 10px;overflow-x:auto}.adm-tabs button{flex:none;white-space:nowrap;padding:11px 15px;border-radius:14px;background:#14161d;color:#9aa0b0;font-weight:800}.adm-tabs button.on{background:#b8ff4a;color:#10140b}.adm-h{color:#9aa0b0;font-size:13px;padding:6px 16px}';
  document.head.append(vcss);
  const tierOf = p => (p && (p.tier || (p.verified ? 'blue' : ''))) || '';
  const TIER_NAME = { blue: 'Blue: verified member', red: 'Red: leaders, politicians and businesses', green: 'Green: heads of state and royalty' };
  const badgeEl = tier => { const s = document.createElement('span'); s.className = 'vbadge'; s.title = TIER_NAME[tier] || ''; s.innerHTML = CI.verified(17, tier || 'blue'); return s; };
  function paintBadges() {
    $$('.clip[data-cloud]').forEach(c => { const cr = c.querySelector('.creator'); const t = vCache.get(c.dataset.uid); if (cr && t && !cr.querySelector('.vbadge')) cr.append(badgeEl(t)); });
  }
  function repaintBadges() { $$('.clip[data-cloud] .creator .vbadge').forEach(b => b.remove()); paintBadges(); }
  async function loadBadges() {
    const need = [...new Set(Array.from($$('.clip[data-cloud]')).map(c => c.dataset.uid))].filter(u => u && !vCache.has(u));
    await Promise.all(need.map(u => CIN.getProfile(u).then(p => vCache.set(u, tierOf(p))).catch(() => vCache.set(u, ''))));
    paintBadges();
  }
  window.CINloadBadges = loadBadges;
  { const up0 = window.updateProfile; window.updateProfile = function () { up0.apply(this, arguments); paintMyBadge(); }; }
  function paintMyBadge() {
    const n = $('#profileName'); if (!n) return; const old = n.querySelector('.vbadge'); if (old) old.remove();
    if (state.tier) n.append(badgeEl(state.tier));
    paintApply();
  }
  // ---- member: apply for a tick ----
  const ap = document.createElement('div'); ap.className = 'adm'; ap.id = 'vap';
  ap.innerHTML = '<div class="adm-top"><button type="button" id="apBack" aria-label="Back">' + CI.svg('back', 22) + '</button><b>Apply for verification</b></div><div class="adm-list" id="apBody"></div>';
  $('.app').append(ap);
  async function openApply() {
    ap.classList.add('show'); const body = $('#apBody'); body.innerHTML = '<div class="adm-h">Loading...</div>';
    if (state.tier) {
      const nm = { blue: 'Blue tick: verified member', red: 'Red tick: leader, politician or business', green: 'Green tick: head of state or royalty' }[state.tier];
      body.innerHTML = '<div class="adm-row" style="flex-direction:column;align-items:flex-start;gap:8px"><span style="display:flex;align-items:center;gap:8px;font-weight:800">' + CI.verified(26, state.tier) + ' You are verified</span><span style="color:#9aa0b0;font-size:14px">' + nm + '.</span><span style="color:#9aa0b0;font-size:13px">To protect your tick, a verified account cannot change its name. If your details change, contact the CIN owner.</span></div>'; return;
    }
    let req = null; try { req = await CIN.myRequest(); } catch (e) {}
    if (req && req.status === 'pending') { body.innerHTML = '<div class="adm-row" style="flex-direction:column;align-items:flex-start;gap:6px"><b>Application sent</b><span style="color:#9aa0b0;font-size:14px">The CIN owner reviews every application. You will see your tick here once it is approved.</span></div>'; return; }
    let want = 'blue';
    body.innerHTML = (req && req.status === 'rejected' ? '<div class="adm-h" style="color:#ff7a90">Your last application was not approved. You can apply again.</div>' : '') +
      '<div class="adm-h">Which tick are you applying for?</div><div id="apWant" style="display:flex;flex-direction:column;gap:8px"></div>' +
      '<div class="adm-h">Why should you be verified?</div><textarea id="apWhy" maxlength="300" rows="4" class="pm-cap-in" placeholder="Tell us who you are and what you do"></textarea>' +
      '<div class="adm-h">A link that proves it (optional)</div><input id="apLink" maxlength="200" placeholder="Official website or social page" style="margin:0" class="pm-cap-in"><button type="button" class="primary" id="apSend" style="margin-top:12px;width:100%">Send application</button>';
    const box = $('#apWant');
    [['blue', 'Blue', 'Verified member'], ['red', 'Red', 'Leader, politician or business'], ['green', 'Green', 'Head of state or royalty']].forEach(([t, n, d]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'adm-row'; b.style.cssText = 'width:100%;text-align:left;color:#fff;border:2px solid ' + (t === want ? '#b8ff4a' : 'transparent');
      b.innerHTML = CI.verified(26, t) + '<span class="t"><b>' + n + '</b><span>' + d + '</span></span>';
      b.onclick = () => { want = t; $$('#apWant button').forEach(x => x.style.borderColor = 'transparent'); b.style.borderColor = '#b8ff4a'; };
      box.append(b);
    });
    $('#apSend').onclick = async () => {
      const why = $('#apWhy').value.trim(); if (why.length < 10) { toast('Please tell us a little more about you'); return; }
      const lk = $('#apLink').value.trim();
      try { await CIN.applyVerify({ wanted: want, reason: why, link: lk }); toast('Application sent'); openApply(); }
      catch (e) { toast(/permission/i.test(String((e && (e.code || e.message)) || '')) ? 'Firebase blocked this. Publish the new Firestore rules.' : 'Could not send. Try again.'); }
    };
  }
  $('#apBack').onclick = () => ap.classList.remove('show');
  // the verification entry lives in the menu (not on the profile)
  const vrow = ['verify', 'Verification', ''];
  { MENU[0][1].push(vrow);
    const ma0 = window.menuAction;
    window.menuAction = function (k) { if (k === 'verify') { closeDrawer(); if (!state.account) { gate(null); return; } if (state.admin) { $('#admQ').value = ''; adm.classList.add('show'); admTab('req'); } else openApply(); return; } return ma0.apply(this, arguments); }; }
  function paintApply() { vrow[1] = state.admin ? 'Admin panel' : 'Verification'; vrow[2] = !state.account ? 'Apply' : state.admin ? 'Admin' : state.tier ? 'Verified' : 'Apply'; }
  // admin panel: search a member and give or remove the blue tick
  const adm = document.createElement('div'); adm.className = 'adm'; adm.id = 'adm';
  adm.innerHTML = '<div class="adm-top"><button type="button" id="admBack" aria-label="Back">' + CI.svg('back', 22) + '</button><b>Admin</b></div><div class="adm-tabs"><button type="button" id="admTReq" class="on">Applications</button><button type="button" id="admTMem">Members</button><button type="button" id="admTRep">Reports</button><button type="button" id="admTFb">Feedback</button><button type="button" id="admTLog">Log</button></div><input id="admQ" placeholder="Search a username" autocomplete="off" style="display:none"><div class="adm-list" id="admList"></div>';
  $('.app').append(adm);
  // safety check before a tick is given or removed; the answer is saved in the log
  function askAdmin(u, t, label) {
    const who = '@' + u.handle;
    if (t === 'red' || t === 'green') {
      if (!confirm('Give the ' + label.toUpperCase() + ' tick to ' + who + '?\n\nOnly do this after you have checked who they really are (official website, ID or a call). A wrong tick lets an impostor fool people.')) return null;
      const n = prompt('Short note for the log: how did you check ' + who + '?', ''); if (n === null) return null; return { handle: u.handle, note: n };
    }
    if (!t) { if (!confirm('Remove the tick from / reject ' + who + '?')) return null; const n = prompt('Reason (saved in the log):', ''); if (n === null) return null; return { handle: u.handle, note: n }; }
    if (!confirm('Give the BLUE tick to ' + who + '?')) return null; return { handle: u.handle, note: '' };
  }
  async function admLog() {
    const list = $('#admList'); list.innerHTML = '<div class="adm-h">Loading...</div>';
    try {
      const items = await CIN.listLog(); list.innerHTML = items.length ? '<div class="adm-h">Last actions. This log cannot be edited.</div>' : '<div class="adm-h">Nothing yet.</div>';
      const AC = { give: 'gave', approve: 'approved', remove: 'removed the tick from', reject: 'rejected' };
      items.forEach(e => {
        const r = document.createElement('div'); r.className = 'adm-row'; r.style.cssText = 'flex-direction:column;align-items:flex-start;gap:3px';
        const d = e.at && e.at.seconds ? new Date(e.at.seconds * 1000).toLocaleString() : 'just now';
        const a = document.createElement('div'); a.style.cssText = 'font-size:14px'; a.textContent = '@' + e.byHandle + ' ' + (AC[e.action] || e.action) + ' @' + e.handle + (e.tier ? ' (' + e.tier + ')' : '');
        const m = document.createElement('div'); m.style.cssText = 'color:#9aa0b0;font-size:12px'; m.textContent = d + (e.note ? ' · ' + e.note : '');
        r.append(a, m); list.append(r);
      });
    } catch (e) { list.innerHTML = '<div class="adm-h">Could not load the log.</div>'; }
  }
  function admRow(u) {
    const cur = tierOf(u), r = document.createElement('div'); r.className = 'adm-row'; r.style.flexWrap = 'wrap';
    r.innerHTML = '<span class="lv-av" style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#b8ff4a,#2fb58a);color:#10140b;display:grid;place-items:center;font-weight:900;flex:none"></span><span class="t"><b></b><span></span></span><div class="adm-tiers" style="width:100%;display:flex;gap:6px"></div>';
    r.querySelector('.lv-av').textContent = ((u.name || u.handle || '?')[0] || '?').toUpperCase();
    r.querySelector('b').textContent = '@' + u.handle; if (cur) r.querySelector('b').append(badgeEl(cur));
    r.querySelector('.t > span').textContent = u.name || '';
    const box = r.querySelector('.adm-tiers');
    [['blue', 'Blue', '#1d9bf0'], ['red', 'Red', '#ff3b30'], ['green', 'Green', '#1fb455'], ['', 'None', '#3a3f4d']].forEach(([t, label, col]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.style.cssText = 'flex:1;padding:9px 0;border-radius:18px;font-weight:800;font-size:13px;color:#fff;background:' + (cur === t ? col : '#1d2029') + ';border:2px solid ' + col;
      b.onclick = async () => {
        if (cur === t) return;
        const meta = askAdmin(u, t, label); if (!meta) return; b.disabled = true;
        try { await CIN.setTier(u.id, t, meta); u.tier = t; u.verified = !!t; vCache.set(u.id, t); if (u.id === state.uid) { state.tier = t; paintMyBadge(); } repaintBadges(); r.replaceWith(admRow(u)); toast(t ? '@' + u.handle + ' now has the ' + label.toLowerCase() + ' tick' : 'Tick removed'); }
        catch (e) { b.disabled = false; toast('Firebase blocked this. Publish the new Firestore rules and add yourself as admin.'); }
      };
      box.append(b);
    });
    return r;
  }
  async function admLoad(q) {
    const list = $('#admList'); list.innerHTML = '<div class="adm-h">Loading...</div>';
    try {
      const items = q ? await CIN.searchUsers(q) : await CIN.listVerified();
      list.innerHTML = '<div class="adm-h">' + (q ? 'Results' : 'Verified members') + '</div>';
      if (!items.length) list.innerHTML += '<div class="adm-h">' + (q ? 'No member found.' : 'Nobody is verified yet. Search a username above.') + '</div>';
      items.forEach(u => list.append(admRow(u)));
    } catch (e) { list.innerHTML = '<div class="adm-h">Could not load members.</div>'; }
  }
  const WANT = { blue: 'Blue (member)', red: 'Red (leader or business)', green: 'Green (head of state or royalty)' };
  async function admRequests() {
    const list = $('#admList'); list.innerHTML = '<div class="adm-h">Loading...</div>';
    try {
      const items = await CIN.pendingRequests();
      $('#admTReq').textContent = 'Applications' + (items.length ? ' (' + items.length + ')' : '');
      list.innerHTML = items.length ? '' : '<div class="adm-h">No applications waiting.</div>';
      items.forEach(q => {
        const r = document.createElement('div'); r.className = 'adm-row'; r.style.cssText = 'flex-direction:column;align-items:stretch;gap:8px';
        const h = document.createElement('div'); h.style.cssText = 'font-weight:800;display:flex;align-items:center;gap:6px'; h.textContent = '@' + q.handle + (q.name ? ' · ' + q.name : '');
        const w = document.createElement('div'); w.style.cssText = 'color:#b8ff4a;font-size:13px;font-weight:700'; w.textContent = 'Asks for: ' + (WANT[q.wanted] || q.wanted);
        const why = document.createElement('div'); why.style.cssText = 'color:#dfe1e8;font-size:14px;white-space:pre-wrap;word-break:break-word'; why.textContent = q.reason || '';
        r.append(h, w, why);
        if (q.link) { const l = document.createElement('div'); l.style.cssText = 'color:#8ab4ff;font-size:13px;word-break:break-all'; l.textContent = 'Proof: ' + q.link; r.append(l); }
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px';
        [['blue', 'Blue', '#1d9bf0'], ['red', 'Red', '#ff3b30'], ['green', 'Green', '#1fb455'], ['', 'Reject', '#3a3f4d']].forEach(([t, label, col]) => {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'flex:1;padding:10px 0;border-radius:18px;font-weight:800;font-size:13px;color:#fff;background:' + col;
          b.onclick = async () => {
            const meta = askAdmin(q, t, label); if (!meta) return; b.disabled = true;
            try { await CIN.decideRequest(q.id, t, meta); vCache.set(q.id, t); repaintBadges(); toast(t ? '@' + q.handle + ' approved' : 'Application rejected'); admRequests(); }
            catch (e) { b.disabled = false; toast('Firebase blocked this. Publish the new Firestore rules.'); }
          };
          row.append(b);
        });
        r.append(row); list.append(r);
      });
    } catch (e) { list.innerHTML = '<div class="adm-h">Could not load applications.</div>'; }
  }
  const TABS = { req: 'admTReq', mem: 'admTMem', rep: 'admTRep', fb: 'admTFb', log: 'admTLog' };
  function admTab(t) { Object.keys(TABS).forEach(k => $('#' + TABS[k]).classList.toggle('on', k === t)); $('#admQ').style.display = t === 'mem' ? '' : 'none'; if (t === 'req') admRequests(); else if (t === 'mem') admLoad(''); else if (t === 'rep') admReports(); else if (t === 'fb') admFeedback(); else admLog(); }
  Object.keys(TABS).forEach(k => { $('#' + TABS[k]).onclick = () => admTab(k); });
  const when = x => x && x.createdAt && x.createdAt.seconds ? new Date(x.createdAt.seconds * 1000).toLocaleString() : 'just now';
  const mkBtn = (label, bg, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'flex:1;padding:10px 0;border-radius:18px;font-weight:800;font-size:13px;color:#fff;background:' + bg; b.onclick = fn; return b; };
  async function admReports() {
    const list = $('#admList'); list.innerHTML = '<div class="adm-h">Loading...</div>';
    try {
      const items = await CIN.listReports(); $('#admTRep').textContent = 'Reports' + (items.length ? ' (' + items.length + ')' : '');
      list.innerHTML = items.length ? '<div class="adm-h">Videos and photos people reported. Look, then remove or dismiss.</div>' : '<div class="adm-h">No reports. Nice.</div>';
      for (const q of items) {
        const r = document.createElement('div'); r.className = 'adm-row'; r.style.cssText = 'flex-direction:column;align-items:stretch;gap:8px';
        const h = document.createElement('div'); h.style.cssText = 'font-weight:800'; h.textContent = 'Reason: ' + q.reason;
        const m = document.createElement('div'); m.style.cssText = 'color:#9aa0b0;font-size:12px'; m.textContent = when(q);
        const info = document.createElement('div'); info.style.cssText = 'color:#dfe1e8;font-size:14px;word-break:break-word'; info.textContent = 'Loading post...';
        const box = document.createElement('div'); const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px';
        r.append(h, m, info, box, row); list.append(r);
        const dismiss = mkBtn('Dismiss', '#3a3f4d', async () => { try { await CIN.closeReport(q.id); r.remove(); toast('Report closed'); } catch (e) { toast('Could not close. Publish the new Firestore rules.'); } });
        CIN.getVideoDoc(q.videoId).then(v => {
          if (!v) { info.textContent = 'This post was already removed.'; row.append(dismiss); return; }
          info.textContent = '@' + v.handle + ' · ' + (v.type === 'photo' ? 'Photo' : 'Video') + (v.caption ? ' · ' + v.caption : '');
          row.append(mkBtn('Preview', '#2b6cff', () => { if (box.firstChild) { box.innerHTML = ''; return; } const m2 = document.createElement(v.type === 'photo' ? 'img' : 'video'); m2.style.cssText = 'width:100%;max-height:50vh;object-fit:contain;background:#000;border-radius:10px'; if (v.type === 'photo') m2.src = v.photoURL; else { m2.src = v.videoURL; m2.controls = true; m2.playsInline = true; } box.append(m2); }),
            mkBtn('Remove post', '#ff3b30', async () => { if (!confirm('Remove this post for everyone? This cannot be undone.')) return; try { await CIN.removeVideoAsAdmin(q.videoId); await CIN.closeReport(q.id); r.remove(); loadFeed(true); toast('Post removed'); } catch (e) { toast('Could not remove. Publish the new Firestore rules.'); } }), dismiss);
        }).catch(() => { info.textContent = 'Could not load the post.'; row.append(dismiss); });
      }
    } catch (e) { list.innerHTML = '<div class="adm-h">Could not load reports. Publish the new Firestore rules.</div>'; }
  }
  const FBK = { idea: 'Idea', problem: 'Problem', delete: 'Delete account', person: 'Report a person' };
  async function admFeedback() {
    const list = $('#admList'); list.innerHTML = '<div class="adm-h">Loading...</div>';
    try {
      const items = await CIN.listFeedback(); $('#admTFb').textContent = 'Feedback' + (items.length ? ' (' + items.length + ')' : '');
      list.innerHTML = items.length ? '<div class="adm-h">Messages from members. Close each one when done.</div>' : '<div class="adm-h">No messages yet.</div>';
      items.forEach(q => {
        const r = document.createElement('div'); r.className = 'adm-row'; r.style.cssText = 'flex-direction:column;align-items:stretch;gap:6px';
        const h = document.createElement('div'); h.style.cssText = 'font-weight:800;color:' + (q.kind === 'delete' ? '#ff7a90' : '#b8ff4a'); h.textContent = (FBK[q.kind] || q.kind) + ' · @' + (q.handle || '?');
        const t = document.createElement('div'); t.style.cssText = 'color:#dfe1e8;font-size:14px;white-space:pre-wrap;word-break:break-word'; t.textContent = q.text;
        const m = document.createElement('div'); m.style.cssText = 'color:#9aa0b0;font-size:12px'; m.textContent = when(q);
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px';
        row.append(mkBtn('Close', '#3a3f4d', async () => { try { await CIN.closeFeedback(q.id); r.remove(); toast('Closed'); } catch (e) { toast('Could not close. Publish the new Firestore rules.'); } }));
        r.append(h, t, m, row); list.append(r);
      });
    } catch (e) { list.innerHTML = '<div class="adm-h">Could not load feedback. Publish the new Firestore rules.</div>'; }
  }
  let admT = null;
  $('#admQ').oninput = () => { clearTimeout(admT); admT = setTimeout(() => admLoad($('#admQ').value.trim().toLowerCase().replace(/^@/, '')), 300); };
  $('#admBack').onclick = () => adm.classList.remove('show');
  function paintAdmin() {
    if (state.admin) CIN.pendingRequests().then(l => { vrow[2] = l.length ? 'Admin · ' + l.length + ' waiting' : 'Admin'; }).catch(() => {});
  }
  async function loadAccount(user) {
    let p = null;
    for (let i = 0; i < 6 && !p; i++) { p = await CIN.getProfile(user.uid); if (!p) await sleep(500); }
    if (!p) { toast('Could not load your profile'); return; }
    state.account = true; state.uid = user.uid; state.name = p.name; state.handle = p.handle; state.posts = p.postsCount || 0;
    localStorage.setItem('cin_account', '1'); localStorage.setItem('cin_name', p.name); localStorage.setItem('cin_handle', p.handle);
    if (Array.isArray(p.interests) && p.interests.length) { try { localStorage.setItem('cin_interests', JSON.stringify(p.interests)); } catch (e) {} }
    state.tier = tierOf(p); vCache.set(user.uid, state.tier); paintMyBadge();
    CIN.isAdmin().then(a => { state.admin = a; paintAdmin(); paintApply(); });
    updateProfile(); paintAccount(); setTimeout(() => window.CINrefreshMine && window.CINrefreshMine(), 0);
    if (p.photoURL && window.CINX) CINX.paintAvatar(p.photoURL);
    $('#postCount').textContent = state.posts;
    const st = $$('.stats strong'); if (st[1]) st[1].textContent = p.followersCount || 0;
    try {
      const ids = (await CIN.getFollowingIds()).slice(0, 50);
      const profs = (await Promise.all(ids.map(id => CIN.getProfile(id)))).filter(Boolean);
      const cloudNames = profs.map(x => { handleUid['@' + x.handle] = x.id; return '@' + x.handle; });
      state.following = state.following.filter(n => BIOS[n]).concat(cloudNames);
    } catch (e) {}
    $('#followingCount').textContent = state.following.length; paintFollows();
    if (unsubCollabs) unsubCollabs();
    unsubCollabs = CIN.watchCollabs(list => {
      cloudIn = list.filter(c => c.status !== 'declined').map(c => ({ id: c.id, from: c.fromHandle, note: c.note, status: c.status === 'accepted' ? 'accepted' : 'new', dir: 'in' }));
      state.collabs = [...cloudIn, ...outList]; renderHub();
    });
  }

  // ---------- Feed ----------
  function buildClip(v, liked) {
    const clip = document.createElement('section');
    clip.className = 'clip'; clip.dataset.id = v.id; clip.dataset.cloud = '1'; clip.dataset.uid = v.uid; clip.dataset.cc = v.commentsCount || 0;
    clip.dataset.base = Math.max(0, (v.likesCount || 0) - (liked ? 1 : 0));
    clip.innerHTML = '<video playsinline loop></video><div class="shade"></div><div class="clip-info"><div class="creator"></div><div class="caption"></div><div class="tags"></div><div class="sound">Original sound</div></div><div class="actions"><div class="avatar"></div><button class="action like"><span>' + CI.heart + '</span><small class="like-count">0</small></button><button class="action comments"><span>' + CI.comment + '</span><small>Comments</small></button><button class="action share"><span>' + CI.share + '</span><small>Share</small></button></div>';
    const photo = v.type === 'photo';
    if (photo) { const im = document.createElement('img'); im.className = 'pimg'; im.alt = 'Photo by @' + v.handle; im.src = v.photoURL; clip.querySelector('video').replaceWith(im); }
    else clip.querySelector('video').src = v.videoURL;
    clip.querySelector('.creator').textContent = '@' + v.handle; if (state.uid && v.uid === state.uid && (v.privacy || 'everyone') !== 'everyone') { const pt = document.createElement('span'); pt.className = 'privtag'; pt.innerHTML = CI.svg('lock', 12) + (v.privacy === 'only_me' ? 'Only you' : 'Friends'); clip.querySelector('.creator').append(pt); }
    clip.querySelector('.caption').textContent = v.caption || '';
    clip.querySelector('.tags').textContent = (v.tags || []).map(t => '#' + t).join(' ');
    clip.querySelector('.avatar').textContent = (v.handle[0] || 'C').toUpperCase();
    if (v.music && v.music !== 'off') { clip.dataset.music = v.music; clip.querySelector('.sound').textContent = 'Auto music: ' + v.music[0].toUpperCase() + v.music.slice(1); }
    handleUid['@' + v.handle] = v.uid;
    clip.querySelector('.like').onclick = () => window.toggleLike(v.id);
    clip.querySelector('.comments').onclick = () => { if (v.allowComments === false) { toast('Comments are turned off for this post'); return; } activeClip = v.id; window.renderComments(); $('#commentsModal').classList.add('show'); };
    clip.querySelector('.share').onclick = () => openShare(v.id);
    setupVideo(clip); setupInfo(clip); addFollow(clip);
    if (v.videoVol != null && !photo) clip.querySelector('video').volume = v.videoVol;
    if (photo && (v.musicURL || (v.music && v.music !== 'off'))) {
      const au = v.musicURL ? new Audio(v.musicURL) : null, snd = clip.querySelector('.sound'), me = 'ph' + v.id;
      if (au) { au.loop = true; au.volume = v.musicVol == null ? .7 : v.musicVol; snd.textContent = decEnt(v.musicName || 'Music') + (v.musicLink ? ' · Jamendo' : ''); }
      if (v.musicLink && /^https:\/\/(www\.)?jamendo\.com\//.test(v.musicLink)) { snd.style.cursor = 'pointer'; snd.onclick = () => window.open(v.musicLink, '_blank', 'noopener,noreferrer'); }
      let playing = false;
      const on = force => { if (!force && !state.settings.autoplay) return; playing = true; window.__phNow = me; if (au) { au.muted = state.muted; try { au.currentTime = 0; } catch (e) {} au.play().catch(() => {}); } else if (!state.muted) Music.start(v.music, me); };
      const off = () => { playing = false; if (au) au.pause(); else if (window.__phNow === me) Music.stop(); if (window.__phNow === me) window.__phNow = null; };
      const pio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.intersectionRatio >= .6) on(); else off(); }), { root: $('#feed'), threshold: [0, .6] });
      pio.observe(clip); clip._off = () => { pio.disconnect(); off(); };
      clip._tap = () => { const now = au ? !au.paused : playing; if (now) { off(); return false; } on(true); return true; };
    } else if (v.musicURL && !photo) {
      const vd = clip.querySelector('video'), au = new Audio(v.musicURL);
      au.loop = true; au.volume = v.musicVol == null ? .7 : v.musicVol; au.muted = vd.muted;
      const snd = clip.querySelector('.sound');
      snd.textContent = decEnt(v.musicName || 'Music') + (v.musicLink ? ' · Jamendo' : '');
      if (v.musicLink && /^https:\/\/(www\.)?jamendo\.com\//.test(v.musicLink)) { snd.style.cursor = 'pointer'; snd.onclick = () => window.open(v.musicLink, '_blank', 'noopener,noreferrer'); }
      vd.addEventListener('play', () => { try { au.currentTime = vd.currentTime; } catch (e) {} au.play().catch(() => {}); });
      vd.addEventListener('pause', () => au.pause());
      vd.addEventListener('volumechange', () => { au.muted = vd.muted; });
      vd.addEventListener('timeupdate', () => { if (vd.currentTime < .3 && au.currentTime > 1) au.currentTime = 0; });
    }
    // tap to pause (video) or tap (photo) -> a Save button appears so anyone can keep a copy
    const sv = document.createElement('button'); sv.type = 'button'; sv.className = 'savebtn'; sv.innerHTML = CI.svg('save', 20) + '<span>Save to phone</span>';
    if (v.allowSave !== false || (state.uid && v.uid === state.uid)) clip.append(sv);
    sv.onclick = e => {
      e.stopPropagation();
      const src = photo ? v.photoURL : v.videoURL;
      const href = /res\.cloudinary\.com/.test(src) ? src.replace('/upload/', '/upload/fl_attachment:cin-' + String(v.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 12) + '/') : src;
      const a = document.createElement('a'); a.href = href; a.download = 'cin-' + v.id + (photo ? '.jpg' : '.mp4'); a.rel = 'noopener';
      document.body.append(a); a.click(); a.remove(); toast('Saving to your phone'); sv.classList.remove('show');
    };
    if (photo) {
      let tt = null;
      clip.addEventListener('click', e => {
        if (e.target.closest('.actions,button,a,.clip-info')) return;
        const run = () => { const playingNow = clip._tap ? clip._tap() : null; if (playingNow === null) sv.classList.toggle('show'); else { sv.classList.toggle('show', !playingNow); flash(clip, CI.svg(playingNow ? 'play' : 'pause', 56)); } };
        if (tt) { clearTimeout(tt); tt = null; run(); return; }
        run(); tt = setTimeout(() => { tt = null; }, 320);
      });
      new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) sv.classList.remove('show'); }), { root: $('#feed'), threshold: [0] }).observe(clip);
    } else {
      const vd2 = clip.querySelector('video');
      vd2.addEventListener('pause', () => { if (vd2.currentTime > 0 && !vd2.ended) setTimeout(() => { if (vd2.paused) sv.classList.add('show'); }, 380); });
      vd2.addEventListener('play', () => sv.classList.remove('show'));
    }
    if (state.uid && v.uid === state.uid) { const f = clip.querySelector('.follow'); if (f) f.remove(); }
    return clip;
  }
  async function loadFeed(reset) {
    if (loading) return; loading = true;
    try {
      if (reset) {
        $$('.clip[data-cloud]').forEach(c => { const v = c.querySelector('video'); if (v) { io.unobserve(v); v.pause(); } if (c._off) c._off(); c.remove(); });
        cursor = null; exhausted = false; state.liked = state.liked.filter(id => SEED[id] !== undefined);
      }
      if (exhausted) return;
      const raw = await CIN.getFeed({ size: 10, after: cursor });
      if (raw.length < 10) exhausted = true;
      if (raw.length) cursor = raw[raw.length - 1]._snap;
      // privacy: "only me" is hidden from others, "friends" only for people who follow each other
      const okv = await Promise.all(raw.map(async v => {
        const p = v.privacy || 'everyone';
        if (p === 'everyone' || (state.uid && v.uid === state.uid)) return true;
        if (p === 'only_me' || !state.uid) return false;
        try { return await CIN.isFriend(v.uid); } catch (e) { return false; }
      }));
      const vids = raw.filter((_, i) => okv[i]);
      const likedSet = new Set();
      if (state.account) await Promise.all(vids.map(v => CIN.hasLiked(v.id).then(l => { if (l) likedSet.add(v.id); }).catch(() => {})));
      const anchor = $('.clip[data-id="welcome"]');
      vids.forEach(v => {
        if (clipEl(v.id)) return;
        const liked = likedSet.has(v.id);
        if (liked && !state.liked.includes(v.id)) state.liked.push(v.id);
        $('#feed').insertBefore(buildClip(v, liked), anchor);
      });
      loadBadges();
      if (reset) {
        // put videos that match what the member chose at sign-up first
        let want = []; try { want = JSON.parse(localStorage.getItem('cin_interests') || '[]').map(x => x.toLowerCase()); } catch (e) {}
        if (want.length) {
          const alias = { technology: ['tech', 'technology', 'stem', 'science'], education: ['education', 'stem', 'learn'], music: ['music', 'song'], dance: ['dance'], comedy: ['comedy', 'funny'], lifestyle: ['lifestyle'] };
          const keys = new Set(want.flatMap(w => alias[w] || [w]));
          const cl = Array.from($$('.clip[data-cloud]')), hit = c => ((((c.querySelector('.tt') || c.querySelector('.tags') || {}).textContent) || '').toLowerCase().match(/#[a-z0-9_]+/g) || []).some(t => keys.has(t.slice(1)));
          const top = cl.filter(hit), rest = cl.filter(c => !hit(c)), a = $('.clip[data-id="welcome"]');
          [...top, ...rest].forEach(c => $('#feed').insertBefore(c, a));
        }
        $('#feed').scrollTop = 0;
      }
      syncLikes(); renderPeople(); applyFeed(null, false); renderHub();
    } catch (e) { console.warn('Feed load failed', e); toast('Could not load the feed: ' + String((e && (e.code || e.message)) || 'error').slice(0, 60)); }
    finally { loading = false; }
  }
  $('#feed').addEventListener('scroll', () => { const f = $('#feed'); if (!exhausted && f.scrollTop + f.clientHeight > f.scrollHeight - f.clientHeight * 1.6) loadFeed(false); }, { passive: true });

  // ---------- Likes ----------
  const origToggleLike = window.toggleLike;
  window.toggleLike = async function (id) {
    const c = clipEl(id);
    if (!c || !c.dataset.cloud) return origToggleLike(id);
    if (!state.account) { gate(() => window.toggleLike(id)); return; }
    if (!rateOk()) return;
    const was = state.liked.includes(id);
    state.liked = was ? state.liked.filter(x => x !== id) : [...state.liked, id];
    syncLikes();
    try { await CIN.toggleLike(id); if (!was) logActivity('You liked a video'); else renderHub(); }
    catch (e) { state.liked = was ? [...state.liked, id] : state.liked.filter(x => x !== id); syncLikes(); toast('Could not update like'); }
  };
  const origSync = window.syncLikes;
  window.syncLikes = function () {
    origSync();
    $$('.clip[data-cloud]').forEach(c => { const n = +c.dataset.cc || 0; const s = c.querySelector('.comments small'); if (s) s.textContent = n || 'Comments'; });
  };

  // ---------- Comments ----------
  const origRenderComments = window.renderComments;
  window.renderComments = function () {
    if (unsubC) { unsubC(); unsubC = null; }
    const c = clipEl(activeClip);
    if (!c || !c.dataset.cloud) return origRenderComments();
    const list = $('#commentList'); list.innerHTML = '<div class="comment">Loading...</div>';
    unsubC = CIN.watchComments(activeClip, items => {
      list.innerHTML = '';
      if (!items.length) list.innerHTML = '<div class="comment">Be the first to comment.</div>';
      items.forEach(x => { const d = document.createElement('div'); d.className = 'comment'; const b = document.createElement('b'); b.textContent = '@' + x.handle; d.append(b, document.createTextNode(x.text)); list.append(d); });
      c.dataset.cc = items.length; syncLikes();
    });
  };
  $('#commentsModal [data-close]').addEventListener('click', () => { if (unsubC) { unsubC(); unsubC = null; } });
  { const old = $('#sendComment'), sc = old.cloneNode(true); old.replaceWith(sc);
    sc.addEventListener('click', async () => {
      const v = $('#commentInput').value.trim(); if (!v) return;
      if (!state.account) { gate(() => sc.click()); return; }
      if (!rateOk()) return;
      const c = clipEl(activeClip);
      if (c && c.dataset.cloud) {
        try { await CIN.addComment(activeClip, v); $('#commentInput').value = ''; logActivity('You commented on a video'); }
        catch (e) { toast('Could not post comment'); }
      } else {
        state.comments[activeClip] ??= []; state.comments[activeClip].push(v);
        localStorage.setItem('cin_comments', JSON.stringify(state.comments));
        $('#commentInput').value = ''; window.renderComments(); logActivity('You commented on a video'); syncLikes(); toast('Comment added on this device');
      }
    }); }

  // ---------- Follow and search ----------
  window.toggleFollow = async function (name) {
    if (!state.account) { gate(() => window.toggleFollow(name)); return; }
    if (name === '@' + state.handle) { toast("That's you"); return; }
    const on = state.following.includes(name), uid = handleUid[name];
    if (uid) {
      if (!rateOk()) return;
      try { await CIN.toggleFollow(uid); } catch (e) { toast('Could not update follow'); return; }
    }
    state.following = on ? state.following.filter(x => x !== name) : [...state.following, name];
    save('cin_following', state.following.filter(n => !handleUid[n]));
    paintFollows(); $('#followingCount').textContent = state.following.length;
    toast(on ? 'Unfollowed ' + name : 'Following ' + name); applyFeed(null, false);
  };
  window.renderPeople = function () {
    const box = $('#peopleList'); box.innerHTML = '';
    let names;
    if (searching) names = searchNames;
    else names = [...new Set($$('.clip[data-id]').filter(c => !c.dataset.id.startsWith('local-')).map(c => (c.querySelector('.creator') || {}).textContent).filter(Boolean))];
    names = names.filter(n => n !== '@' + state.handle);
    if (searching && !names.length) box.innerHTML = '<div class="empty">No creators found.</div>';
    names.forEach(name => {
      const d = document.createElement('div'); d.className = 'person';
      d.innerHTML = '<div class="mini"></div><div class="info"><strong></strong><small></small></div><button></button>';
      d.querySelector('.mini').textContent = (name.replace('@', '')[0] || '?').toUpperCase();
      d.querySelector('strong').textContent = name;
      d.querySelector('small').textContent = BIOS[name] || 'CIN creator';
      const b = d.querySelector('button'); b.dataset.name = name; b.onclick = () => window.toggleFollow(name);
      box.append(d);
    });
    paintFollows();
  };
  { const old = $('#searchInput'), inp = old.cloneNode(true); old.replaceWith(inp); let t;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = inp.value.trim().replace(/^[@#]/, '');
        if (!q) { searching = false; searchNames = []; renderPeople(); return; }
        try {
          const res = await CIN.searchUsers(q);
          searchNames = res.map(u => { handleUid['@' + u.handle] = u.id; return '@' + u.handle; });
          searching = true; renderPeople();
        } catch (e) { toast('Search failed'); }
      }, 350);
    }); }

  // ---------- Profile ----------
  $('#saveProfile').onclick = async () => {
    if (!state.account) { $('#editModal').classList.remove('show'); gate(null); return; }
    const n = $('#nameInput').value.trim().slice(0, 30) || state.name;
    try { await CIN.updateProfile({ name: n }); state.name = n; localStorage.setItem('cin_name', n); updateProfile(); $('#editModal').classList.remove('show'); toast('Profile saved'); }
    catch (e) { toast(state.tier ? 'Verified accounts cannot change their name. Ask the CIN owner.' : 'Could not save profile'); }
  };
  const origSettingAction = window.settingAction;
  window.settingAction = function (k) {
    if (k === 'auth' && state.account) {
      CIN.signOut().finally(() => { ['cin_account', 'cin_name', 'cin_handle'].forEach(x => localStorage.removeItem(x)); location.reload(); });
      return;
    }
    return origSettingAction(k);
  };

  // ---------- Publish ----------
  { const old = $('#publishBtn'), pb = old.cloneNode(true); old.replaceWith(pb);
    pb.addEventListener('click', async () => {
      if (!state.account) { gate(() => pb.click()); return; }
      const m = (window.CINX || {}).media, f = m ? m.file : $('#videoFile').files[0], isPh = !!(m && m.kind === 'photo');
      if (!f) { toast('Choose a video or photo first'); return; }
      const caption = $('#captionInput').value.trim() || (isPh ? 'My first CIN photo!' : 'My first CIN video!');
      const tags = $('#tagInput').value.match(/[A-Za-z0-9_]+/g) || [];
      pb.disabled = true;
      try {
        await (isPh ? CIN.publishPhoto : CIN.publishVideo)(f, { caption, tags, music: musicPick, musicFile: (window.CINX || {}).musicFile, musicTrack: (window.CINX || {}).musicTrack, videoVol: (window.CINX || {}).vVol, musicVol: (window.CINX || {}).mVol }, p => { pb.textContent = 'Uploading ' + p + '%'; });
        state.posts++; $('#postCount').textContent = state.posts; logActivity(isPh ? 'You published a new photo' : 'You published a new video');
        setPreview(false); if (window.CINX) CINX.reset(); $('#videoFile').value = ''; $('#captionInput').value = ''; $('#tagInput').value = '';
        navigate('home'); await loadFeed(true); $('#feed').scrollTo({ top: 0 }); refreshMine(); toast(isPh ? 'Your photo is live' : 'Your video is live');
      } catch (e) {
        console.warn('Post failed', e);
        const m = String((e && (e.code || e.message)) || '');
        toast(/Cloudinary details/.test(m) ? 'Cloudinary name and preset are missing in cin-backend.js'
          : /permission/i.test(m) ? 'Firebase blocked this post. Log in again and check the Firestore rules.'
          : /preset/i.test(m) ? 'Cloudinary preset problem: ' + m.slice(0, 70)
          : /network/i.test(m) ? 'No internet connection'
          : m && m.length < 90 ? 'Could not post: ' + m : 'Upload failed. Check your connection and try again.');
      }
      finally { pb.disabled = false; pb.textContent = 'Post'; }
    }); }

  // ---------- Circles ----------
  window.circleMsgs = function (id) {
    const c = CIRCLES.find(x => x.id === id);
    return [{ who: 'cin_community', text: 'Welcome to the ' + c.name + ' circle. Share what you are working on.' },
      ...(circleCache[id] || []).map(m => ({ who: m.handle, text: m.text, me: !!state.uid && m.uid === state.uid }))];
  };
  window.openCircle = function (id) {
    activeCircle = id; $('#circleTitle').textContent = CIRCLES.find(x => x.id === id).name + ' circle';
    renderChat(); $('#circleModal').classList.add('show');
    if (unsubCircle) unsubCircle();
    unsubCircle = CIN.watchCircle(id, list => { circleCache[id] = list; renderChat(); renderCircles(); });
  };
  $('#circleModal [data-close]').addEventListener('click', () => { if (unsubCircle) { unsubCircle(); unsubCircle = null; } });
  window.sendCircle = async function () {
    const v = $('#circleInput').value.trim(); if (!v) return;
    if (!state.account) { gate(window.sendCircle); return; }
    if (!rateOk()) return;
    try { await CIN.sendCircleMessage(activeCircle, v); $('#circleInput').value = ''; }
    catch (e) { toast('Could not send message'); }
  };
  $('#sendCircle').onclick = () => window.sendCircle();

  // ---------- Collabs ----------
  window.setCollab = async function (id, status) {
    if (!state.account) { gate(() => window.setCollab(id, status)); return; }
    try { await CIN.respondCollab(id, status === 'accepted' ? 'accepted' : 'declined'); if (status === 'accepted') logActivity('You accepted a collab'); }
    catch (e) { toast('Could not update collab'); }
  };
  $('#inviteBtn').onclick = async () => {
    if (!state.account) { gate(() => $('#inviteBtn').click()); return; }
    const h = $('#inviteInput').value.trim().replace(/^@/, '').replace(/\s/g, '_').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 20);
    if (!h) { toast('Type a creator ID first'); return; }
    try {
      await CIN.inviteCollab(h, 'Let us create something together!');
      outList.unshift({ id: 'o' + Date.now(), from: h, note: 'You invited this creator to collab.', status: 'sent', dir: 'out' });
      state.collabs = [...cloudIn, ...outList]; $('#inviteInput').value = ''; logActivity('You invited @' + h + ' to collab'); toast('Invite sent');
    } catch (e) { toast(friendly(e)); }
  };

  // ---------- Reports ----------
  $('#shareReport').onclick = () => {
    $('#shareModal').classList.remove('show'); const id = shareId;
    showInfo('Report this video', ['Why are you reporting it?'],
      ['Spam', 'Harassment or bullying', 'Nudity or sexual content', 'Violence or dangerous acts', 'Something else'].map(r => [r, async () => {
        $('#infoModal').classList.remove('show');
        const c = clipEl(id);
        if (c && c.dataset.cloud) { if (!state.account) { gate(null); return; } try { await CIN.report(id, r); } catch (e) {} }
        toast('Thanks. We will review this video.');
      }]));
  };

  // ---------- My posts on the profile ----------
  const mine = document.createElement('div'); mine.className = 'mygrid'; mine.id = 'myGrid';
  $('#profile .empty').before(mine);
  async function refreshMine() {
    if (!state.uid) { mine.innerHTML = ''; $('#profile .empty').style.display = ''; return; }
    try {
      pfList = await CIN.getUserVideos(state.uid);
      $('#postCount').textContent = pfList.length; state.posts = pfList.length;
      paintMine();
    } catch (e) { console.warn('My posts failed', e); toast('Could not load your posts'); }
  }
  function paintMine() {
    {
      const all = pfList, nPriv = all.filter(v => (v.privacy || 'everyone') !== 'everyone').length;
      $('#pfPriv').textContent = 'Private' + (nPriv ? ' (' + nPriv + ')' : '');
      const list = pfFilter === 'private' ? all.filter(v => (v.privacy || 'everyone') !== 'everyone') : all;
      mine.innerHTML = '';
      const emp = $('#profile .empty'); emp.style.display = list.length ? 'none' : '';
      if (!list.length && all.length) { emp.style.display = 'none'; const n = document.createElement('p'); n.className = 'hlp-p'; n.style.cssText = 'grid-column:1/-1;text-align:center;color:#9aa0b0'; n.textContent = 'No private posts. Open a post and choose Privacy settings to make one Friends or Only you.'; mine.append(n); }
      list.forEach(v => {
        const t = document.createElement('button'); t.type = 'button'; t.className = 'mytile'; t.setAttribute('aria-label', 'Open post');
        const photo = v.type === 'photo';
        const m = document.createElement(photo ? 'img' : 'video');
        if (photo) { m.src = v.photoURL; m.alt = ''; m.loading = 'lazy'; }
        else { m.muted = true; m.preload = 'metadata'; m.setAttribute('playsinline', ''); m.src = v.videoURL + '#t=0.1'; }
        t.append(m);
        if (!photo) { const i = document.createElement('i'); i.innerHTML = CI.svg('play', 14); t.append(i); }
        t.onclick = async () => {
          openManager(v);
        };
        if ((v.privacy || 'everyone') !== 'everyone') { const l = document.createElement('b'); l.className = 'lk'; l.innerHTML = CI.svg('lock', 14) + (v.privacy === 'only_me' ? '<span style="font-size:11px;margin-left:3px">Only you</span>' : '<span style="font-size:11px;margin-left:3px">Friends</span>'); t.append(l); }
        mine.append(t);
      });
    }
  }
  // ---- manage one of my posts (privacy settings) ----
  const mcss = document.createElement('style');
  mcss.textContent = `.pm{position:absolute;inset:0;z-index:35;background:#07080c;display:none;flex-direction:column}.pm.show{display:flex}
.pm-top{display:flex;align-items:center;justify-content:space-between;padding:14px 12px}.pm-top b{font-size:17px}.pm-top button{width:42px;height:42px;border-radius:50%;background:var(--panel2);color:#fff;display:grid;place-items:center}.pm-top span{width:42px}
.pm-media{flex:1;min-height:0;background:#000;display:flex;align-items:center;justify-content:center}.pm-media img,.pm-media video{max-width:100%;max-height:100%;object-fit:contain}
.pm-info{padding:12px 16px 4px}.pm-line{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px}.pm-badge{display:inline-flex;align-items:center;gap:5px;background:var(--panel2);border-radius:12px;padding:3px 9px;font-size:12px;color:var(--accent)}.pm-cap{margin:6px 0;color:#dfe1e8;font-size:14px}.pm-stats{display:flex;gap:16px;color:var(--muted);font-size:13px}
.pm-bar{display:flex;gap:10px;padding:10px 16px calc(14px + env(safe-area-inset-bottom))}.pm-bar button{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;font-size:14px}
.pm-sheet{position:absolute;left:0;right:0;bottom:0;max-height:88%;overflow:auto;background:#14161d;border-radius:22px 22px 0 0;transform:translateY(110%);transition:transform .25s;visibility:hidden;padding:6px 16px calc(18px + env(safe-area-inset-bottom));z-index:2}.pm-sheet.show{transform:none;visibility:visible}
.pm-sh-h{display:flex;align-items:center;justify-content:space-between;padding:12px 0}.pm-sh-h b{font-size:17px}.pm-sh-h button{background:none;color:#fff;padding:6px}
.pm-card{background:#1d2029;border-radius:16px;padding:6px 14px;margin-bottom:12px}.pm-card h4{margin:12px 0 4px;font-size:15px}
.pm-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;background:none;color:#fff;text-align:left;padding:12px 0}.pm-opt small{display:block;color:var(--muted);font-size:12px;margin-top:3px;font-weight:500}.pm-opt .rdo{display:grid;font-style:normal;width:24px;height:24px;border-radius:50%;border:2px solid #4a4f5e;flex:none;display:grid;place-items:center}.pm-opt.on .rdo{border-color:var(--accent)}.pm-opt.on .rdo:after{content:'';width:12px;height:12px;border-radius:50%;background:var(--accent)}
.pm-sw{display:block;width:50px;height:30px;border-radius:15px;background:#3a3f4d;position:relative;flex:none;transition:background .2s}.pm-sw:after{content:'';position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .2s}.pm-opt.on .pm-sw{background:var(--accent)}.pm-opt.on .pm-sw:after{transform:translateX(20px)}
.pm-cap-in{width:100%;background:#14161d;border:1px solid var(--line);border-radius:12px;padding:12px;color:#fff;outline:0;margin:8px 0;resize:none}.pm-sheet .primary,.pm-sheet .secondary{width:100%;margin:4px 0}.pm-del{background:#3a1620;color:#ff7a90;font-weight:800;border-radius:14px;padding:13px;width:100%;margin-top:6px}
.mytile .lk{position:absolute;right:6px;top:6px;color:#fff;display:flex;background:#0009;border-radius:8px;padding:3px}`;
  document.head.append(mcss);
  const pm = document.createElement('div'); pm.className = 'pm'; pm.id = 'pm';
  pm.innerHTML = '<div class="pm-top"><button type="button" id="pmBack" aria-label="Back">' + CI.svg('back', 22) + '</button><b>Your post</b><span></span></div><div class="pm-media" id="pmMedia"></div>' +
    '<div class="pm-info"><div class="pm-line"><span id="pmWho"></span><span class="pm-badge" id="pmBadge"></span></div><div class="pm-cap" id="pmCap"></div><div class="pm-stats"><span id="pmLikes"></span><span id="pmComm"></span><span id="pmAge"></span></div></div>' +
    '<div class="pm-bar"><button type="button" class="primary" id="pmPriv">' + CI.svg('lock', 18) + 'Privacy settings</button><button type="button" class="secondary" id="pmView">View in feed</button></div>' +
    '<div class="pm-sheet" id="pmSheet"><div class="pm-sh-h"><b>Privacy settings</b><button type="button" id="pmClose" aria-label="Close">' + CI.svg('close', 22) + '</button></div>' +
    '<div class="pm-card"><h4>Who can see this post</h4>' +
    '<button type="button" class="pm-opt" data-p="everyone"><span>Everyone</span><i class="rdo"></i></button>' +
    '<button type="button" class="pm-opt" data-p="friends"><span>Friends<small>People you follow who follow you back</small></span><i class="rdo"></i></button>' +
    '<button type="button" class="pm-opt" data-p="only_me"><span>Only you</span><i class="rdo"></i></button></div>' +
    '<div class="pm-card"><button type="button" class="pm-opt" id="pmCom"><span>Allow comments</span><i class="pm-sw"></i></button>' +
    '<button type="button" class="pm-opt" id="pmSave"><span>Allow saving<small>Lets people download this post to their phone</small></span><i class="pm-sw"></i></button></div>' +
    '<div class="pm-card"><h4>Caption</h4><textarea class="pm-cap-in" id="pmCapIn" maxlength="150" rows="2"></textarea><button type="button" class="secondary" id="pmCapSave">Save caption</button></div>' +
    '<button type="button" class="pm-del" id="pmDel">Delete this post</button></div>';
  $('.app').append(pm);
  let cur = null, dirty = false;
  const PL = { everyone: 'Everyone', friends: 'Friends', only_me: 'Only you' };
  const age = v => { const s = v.createdAt && v.createdAt.seconds; if (!s) return 'Just now'; const d = Math.floor((Date.now() / 1000 - s) / 86400); return d < 1 ? 'Today' : d + 'd ago'; };
  function paintMgr() {
    const p = cur.privacy || 'everyone';
    $('#pmBadge').innerHTML = CI.svg(p === 'everyone' ? 'sun' : 'lock', 13) + ' ' + PL[p];
    $$('#pmSheet [data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
    $('#pmCom').classList.toggle('on', cur.allowComments !== false);
    $('#pmSave').classList.toggle('on', cur.allowSave !== false);
    $('#pmCap').textContent = cur.caption || '';
  }
  function openManager(v) {
    cur = v; dirty = false;
    const photo = v.type === 'photo', box = $('#pmMedia'); box.innerHTML = '';
    const m = document.createElement(photo ? 'img' : 'video');
    if (photo) { m.src = v.photoURL; m.alt = ''; } else { m.src = v.videoURL; m.controls = true; m.playsInline = true; m.loop = true; }
    box.append(m);
    $('#pmWho').textContent = '@' + v.handle + ' · ' + (photo ? 'Photo' : 'Video');
    $('#pmLikes').textContent = (v.likesCount || 0) + ' likes'; $('#pmComm').textContent = (v.commentsCount || 0) + ' comments'; $('#pmAge').textContent = age(v);
    $('#pmCapIn').value = v.caption || ''; paintMgr(); $('#pmSheet').classList.remove('show'); pm.classList.add('show');
  }
  async function closeManager() {
    const vv = $('#pmMedia video'); if (vv) vv.pause(); $('#pmMedia').innerHTML = ''; pm.classList.remove('show'); $('#pmSheet').classList.remove('show');
    if (dirty) { dirty = false; refreshMine(); loadFeed(true); }
  }
  async function save(fields, msg) {
    try { await CIN.updatePost(cur.id, fields); Object.assign(cur, fields); dirty = true; paintMgr(); toast(msg || 'Saved'); }
    catch (e) { console.warn(e); toast(/permission/i.test(String((e && (e.code || e.message)) || '')) ? 'Firebase blocked this. Publish the new Firestore rules first.' : 'Could not save. Try again.'); }
  }
  $('#pmBack').onclick = closeManager;
  $('#pmPriv').onclick = () => { const v = $('#pmMedia video'); if (v) v.pause(); $('#pmSheet').classList.add('show'); };
  $('#pmClose').onclick = () => $('#pmSheet').classList.remove('show');
  $$('#pmSheet [data-p]').forEach(b => b.onclick = () => save({ privacy: b.dataset.p }, 'Now visible to: ' + PL[b.dataset.p]));
  $('#pmCom').onclick = () => save({ allowComments: cur.allowComments === false }, cur.allowComments === false ? 'Comments on' : 'Comments off');
  $('#pmSave').onclick = () => save({ allowSave: cur.allowSave === false }, cur.allowSave === false ? 'Saving allowed' : 'Saving turned off');
  $('#pmCapSave').onclick = () => save({ caption: $('#pmCapIn').value.trim() }, 'Caption saved');
  $('#pmDel').onclick = async () => {
    if (!confirm('Delete this post for good?')) return;
    try { await CIN.deleteVideo(cur.id); dirty = false; closeManager(); refreshMine(); loadFeed(true); toast('Post deleted'); } catch (e) { toast('Could not delete. Try again.'); }
  };
  $('#pmView').onclick = async () => { const id = cur.id; await closeManager(); navigate('home'); let c = clipEl(id); if (!c) { await loadFeed(true); c = clipEl(id); } if (c) setTimeout(() => c.scrollIntoView(), 80); else toast('Scroll the feed to find it'); };
  window.CINrefreshMine = refreshMine;
  { const nav0 = window.navigate; window.navigate = function (s) { nav0.apply(this, arguments); if (s === 'profile') refreshMine(); }; }

  // ---------- real time: new posts from other people ----------
  { const pill = document.createElement('button'); pill.type = 'button'; pill.className = 'newpill'; pill.style.display = 'none'; $('.app').append(pill);
    const css2 = document.createElement('style');
    css2.textContent = '.newpill{position:absolute;top:76px;left:50%;transform:translateX(-50%);z-index:20;background:var(--accent);color:#10140b;font-weight:900;font-size:14px;padding:10px 18px;border-radius:24px;box-shadow:0 6px 20px #0008;display:flex;align-items:center;gap:8px}';
    document.head.append(css2);
    const known = new Set(), fresh = new Set(); let first = true;
    CIN.watchNewest(async list => {
      if (first) { first = false; list.forEach(v => known.add(v.id)); return; }
      for (const v of list) {
        if (known.has(v.id) || !v.createdAt) continue; known.add(v.id);
        if (state.uid && v.uid === state.uid) continue;
        const p = v.privacy || 'everyone';
        if (p === 'only_me') continue;
        if (p === 'friends') { let ok = false; try { ok = !!state.uid && await CIN.isFriend(v.uid); } catch (e) {} if (!ok) continue; }
        if (clipEl(v.id)) continue; fresh.add(v.id);
      }
      if (fresh.size) { pill.innerHTML = CI.svg('plus', 16) + (fresh.size === 1 ? '1 new post' : fresh.size + ' new posts'); pill.style.display = state.screen === 'home' ? 'flex' : 'none'; }
    });
    pill.onclick = async () => { pill.style.display = 'none'; fresh.clear(); navigate('home'); await loadFeed(true); $('#feed').scrollTo({ top: 0 }); };
    const nav2 = window.navigate; window.navigate = function (s) { nav2.apply(this, arguments); if (s !== 'home') pill.style.display = 'none'; else if (fresh.size) pill.style.display = 'flex'; };
  }

  // ---------- Help center, guidelines, privacy, about ----------
  const hcss = document.createElement('style');
  hcss.textContent = `.hlp{position:absolute;inset:0;z-index:37;background:#07080c;display:none;flex-direction:column}.hlp.show{display:flex}
.hlp-top{display:flex;align-items:center;gap:10px;padding:14px 12px}.hlp-top b{flex:1;font-size:18px}.hlp-top button{width:42px;height:42px;border-radius:50%;background:#ffffff18;color:#fff;display:grid;place-items:center}
.hlp-body{flex:1;overflow:auto;padding:0 16px calc(24px + env(safe-area-inset-bottom))}.hlp-body h3{margin:18px 0 8px;font-size:13px;color:#9aa0b0;letter-spacing:.5px;text-transform:uppercase}
.hlp-body details{background:#14161d;border-radius:14px;padding:14px;margin-bottom:8px}.hlp-body summary{font-weight:800;font-size:15px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:10px}.hlp-body summary::after{content:'+';color:#b8ff4a;font-size:20px;line-height:1}.hlp-body details[open] summary::after{content:'\\2212'}
.hlp-body details p,.hlp-p{color:#cfd2dc;font-size:14px;line-height:1.55;margin:10px 0 0}.hlp-card{background:#14161d;border-radius:14px;padding:14px;margin-bottom:10px}.hlp-card b{display:block;margin-bottom:4px}
.hlp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px}.hlp-chips button{padding:10px 14px;border-radius:20px;background:#1d2029;color:#dfe1e8;font-weight:800;font-size:13px}.hlp-chips button.on{background:#b8ff4a;color:#10140b}
.hlp-body textarea{width:100%;background:#14161d;border:1px solid #2a2d3a;border-radius:14px;padding:12px;color:#fff;font-size:15px;outline:0;resize:none;margin-bottom:10px}.hlp-body .primary,.hlp-body .secondary{width:100%;margin-top:8px}
.privtag{display:inline-flex;align-items:center;gap:4px;background:#000a;border-radius:10px;padding:2px 8px;font-size:12px;margin-left:8px;vertical-align:middle}
.pf-seg{display:flex;gap:8px;margin:14px 0 0}.pf-seg button{padding:9px 16px;border-radius:18px;background:#1d2029;color:#cfd2dc;font-weight:800;font-size:13px}.pf-seg button.on{background:#b8ff4a;color:#10140b}`;
  document.head.append(hcss);
  const hlp = document.createElement('div'); hlp.className = 'hlp'; hlp.id = 'hlp';
  hlp.innerHTML = '<div class="hlp-top"><button type="button" id="hlpBack" aria-label="Back">' + CI.svg('back', 22) + '</button><b id="hlpTitle"></b></div><div class="hlp-body" id="hlpBody"></div>';
  $('.app').append(hlp);
  $('#hlpBack').onclick = () => hlp.classList.remove('show');
  const FAQ = [
    ['How do I post a video or photo?', 'Tap the + button. Under Post, tap Gallery and choose what you want, or tap Camera. Videos and Photos tabs show only that kind. Tap Next, add a caption and sound, then Post.'],
    ['Where is a post I made Only you?', 'Open Profile. Posts that are not public show a lock. Tap the Private button above your posts to see only those. Tap a post, then Privacy settings, to change who can see it.'],
    ['What do Everyone, Friends and Only you mean?', 'Everyone: anybody. Friends: people you follow who also follow you back. Only you: nobody else sees it inside CIN.'],
    ['How do I add music?', 'When you add a sound you can search free music online (credited to the artist) or use a song from your phone. Tap Add sound under Create, or Sound on the camera.'],
    ['How do I get a verification tick?', 'Open the menu on Profile and tap Verification. Send a short reason and a proof link. The CIN owner checks and decides. Blue is a verified member, red a leader or business, green a head of state or royalty.'],
    ['How do I go LIVE?', 'Tap +, then LIVE. A few people can watch at once. Use Wi-Fi or a strong signal. Live works best when the viewers also have a good connection.'],
    ['How do I stop someone annoying me?', 'Tap Share on their video, then Report this video. You can also send us a message below with Report a person. Reports are reviewed by a real person.'],
    ['I forgot my password. What now?', 'Use Forgot password on the sign-in screen if it is there, or send us a Problem message from another account.'],
    ['Can I delete my account?', 'Yes, yourself. Open Profile, menu, Settings and privacy, then Delete my account. Type your password to confirm. Your profile, username and posts are removed for good.'],
    ['Can I have two accounts?', 'Yes. Use a different email for each. Open Settings and tap Switch account to log out and sign in with the other one.']
  ];
  function hAccordion(list) { return list.map(([q, a]) => '<details><summary>' + esc(q) + '</summary><p>' + esc(a) + '</p></details>').join(''); }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const card = (t, d) => '<div class="hlp-card"><b>' + esc(t) + '</b><div class="hlp-p" style="margin:0">' + esc(d) + '</div></div>';
  function pageHelp() {
    $('#hlpTitle').textContent = 'Help and feedback';
    $('#hlpBody').innerHTML = '<h3>Quick answers</h3>' + hAccordion(FAQ) +
      '<h3>Send us a message</h3><p class="hlp-p" style="margin:0 0 10px">A real person reads every message. Tell us what is wrong or what to add.</p>' +
      '<div class="hlp-chips" id="fbKinds"><button type="button" data-k="idea" class="on">Idea</button><button type="button" data-k="problem">Problem</button><button type="button" data-k="person">Report a person</button></div>' +
      '<textarea id="fbText" rows="4" maxlength="600" placeholder="Write here (at least 5 letters)"></textarea><button type="button" class="primary" id="fbSend">Send</button>' +
      '<h3>More</h3><button type="button" class="secondary" data-go="rules">Community guidelines</button><button type="button" class="secondary" data-go="privacy">Privacy and data</button><button type="button" class="secondary" data-go="about">About CIN</button>';
    let kind = 'idea';
    $$('#fbKinds button').forEach(b => b.onclick = () => { kind = b.dataset.k; $$('#fbKinds button').forEach(x => x.classList.toggle('on', x === b)); });
    $('#fbSend').onclick = async () => {
      if (!state.account) { hlp.classList.remove('show'); gate(null); return; }
      const t = $('#fbText').value.trim(); if (t.length < 5) { toast('Write a few more words'); return; }
      const btn = $('#fbSend'); btn.disabled = true;
      try { await CIN.sendFeedback(kind, t); $('#fbText').value = ''; toast('Sent. Thank you.'); }
      catch (e) { toast('Could not send. Check your internet and try again.'); }
      btn.disabled = false;
    };
    $$('#hlpBody [data-go]').forEach(b => b.onclick = () => openHelp(b.dataset.go));
  }
  function pageRules() {
    $('#hlpTitle').textContent = 'Community guidelines';
    $('#hlpBody').innerHTML = '<p class="hlp-p">CIN is for creating, inspiring and connecting. These rules keep it safe and fair for everyone.</p><h3>Not allowed</h3>' +
      card('Harassment and hate', 'No bullying, threats, or attacks on people for who they are.') + card('Sexual content and nudity', 'Keep CIN safe for everyone. Adult content is not allowed.') +
      card('Violence and danger', 'No violence, self-harm, or dangerous challenges.') + card('Scams and fake accounts', 'Do not pretend to be someone else, sell fake things or trick people for money. Fake ticks are removed.') +
      card('Other people\'s work', 'Only post what you made or have the right to share. Use the free music from the CIN music search and credit the artist.') +
      card('Children', 'You must be 13 or older. We remove anything that puts a child at risk.') +
      '<h3>What happens if you break them</h3><p class="hlp-p">Posts can be removed. Repeat or serious cases can lead to the account being removed. Anyone can report a post with Share, then Report this video.</p>';
  }
  function pagePrivacy() {
    $('#hlpTitle').textContent = 'Privacy and data';
    $('#hlpBody').innerHTML = '<p class="hlp-p">The plain truth about your data.</p><h3>What CIN keeps</h3>' +
      card('Your account', 'Email, name, username, profile photo and the interests you chose. Your password is handled by Google Firebase and is never visible to CIN.') +
      card('What you post', 'Videos, photos, captions, comments, likes, follows and messages. Files are stored with Cloudinary, everything else in Google Firebase.') +
      '<h3>What CIN does not do</h3>' + card('No selling', 'We do not sell your data and we do not show ads.') + card('No tracking by others', 'Outside scripts and trackers are blocked by the app.') +
      '<h3>Please know</h3>' + card('Only you and Friends', 'These hide a post inside CIN from other people. They are not encryption, so never post something truly secret.') +
      card('Live and music', 'LIVE connects viewers directly to you, so they can see your network address, like any video call. Free music comes from Jamendo.') +
      card('Delete your data', 'You can delete your own account any time: Settings, then Delete my account. Your profile, username and posts are removed. Clear data on this device removes only what is saved on your phone.');
  }
  function pageAbout() {
    $('#hlpTitle').textContent = 'About CIN';
    $('#hlpBody').innerHTML = '<div class="hlp-card" style="text-align:center"><img src="logo.png" alt="" width="72" height="72" style="border-radius:18px"><b style="font-size:20px;margin-top:8px">CIN</b><div class="hlp-p" style="margin:0">Create. Inspire. Network.</div></div>' +
      card('Version', 'Beta. New things are added often. Tell us what to improve.') + card('Who runs it', 'CIN is built and run by Dickson in Kampala, Uganda.') +
      card('Free and independent', 'CIN is free to use. Videos are stored on free cloud plans, so very large files are limited.') +
      '<button type="button" class="secondary" data-go="help">Help and feedback</button>';
    $$('#hlpBody [data-go]').forEach(b => b.onclick = () => openHelp(b.dataset.go));
  }
  function openHelp(k) { ({ help: pageHelp, rules: pageRules, privacy: pagePrivacy, about: pageAbout }[k] || pageHelp)(); $('#hlpBody').scrollTop = 0; hlp.classList.add('show'); }
  window.CINhelp = openHelp;

  // ---------- profile: All / Public / Private filter ----------
  const seg = document.createElement('div'); seg.className = 'pf-seg'; seg.id = 'pfSeg';
  seg.innerHTML = '<button type="button" data-f="all" class="on">All</button><button type="button" data-f="private" id="pfPriv">Private</button>';
  mine.before(seg);
  let pfFilter = 'all', pfList = [];
  seg.querySelectorAll('button').forEach(b => b.onclick = () => { pfFilter = b.dataset.f; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); paintMine(); });

  // ---------- switch account / delete my account ----------
  window.CINacct = async function (k) {
    if (k === 'switch') {
      if (!state.account) { gate(null); return; }
      if (!confirm('Log out and sign in with another account? You can come back to this one any time with its email and password.')) return;
      try { await CIN.signOut(); } catch (e) {}
      location.reload(); return;
    }
    if (!state.account) { gate(null); return; }
    if (!confirm('Delete your account for good?\n\nYour profile, username and all your posts will be removed. This cannot be undone.')) return;
    const pw = prompt('Type your password to confirm. Type nothing to cancel.', ''); if (!pw) return;
    try { await CIN.deleteMyAccount(pw); toast('Your account was deleted'); setTimeout(() => location.reload(), 900); }
    catch (e) {
      const c = String((e && (e.code || e.message)) || '');
      toast(/wrong-password|invalid-credential|invalid-login/i.test(c) ? 'Wrong password. Nothing was deleted.' : /permission/i.test(c) ? 'Firebase blocked this. Publish the new Firestore rules first.' : /requires-recent/i.test(c) ? 'Please log in again, then try once more.' : 'Could not delete. Try again.');
    }
  };

  // ---------- Start ----------
  let first = true;
  CIN.onUser(async user => {
    if (signingUp) return;
    if (user) await loadAccount(user);
    else { state.account = false; state.uid = null; localStorage.removeItem('cin_account'); paintAccount(); }
    await loadFeed(true);
    if (first) { first = false; const h = decodeURIComponent(location.hash.slice(1)), t = h && clipEl(h); if (t) setTimeout(() => t.scrollIntoView(), 150); }
  });
}
