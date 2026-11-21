// CIN cloud glue: connects the existing index.html screens to the Firebase backend.
// If cin-backend.js has no Firebase config yet, this file does nothing and the app stays in local-demo mode.
import { CIN } from "./cin-backend.js?v=39";

if (CIN.configured) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clipEl = id => id ? $('.clip[data-id="' + CSS.escape(id) + '"]') : null;
  const nameOf = {}; const blocked = new Set(); let blocksLoaded = false; const handleUid = {};            // '@handle' -> uid
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
  const forgotBtn = document.createElement('button'); forgotBtn.type = 'button'; forgotBtn.style.cssText = 'width:100%;margin-top:6px;background:none;color:#8ab4ff;font-weight:700;font-size:14px;padding:10px;display:none'; forgotBtn.textContent = 'Forgot password?'; swap.after(forgotBtn);
  forgotBtn.onclick = async () => { const em = $('#joinEmail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) { toast('Type your email in the email box first'); return; } forgotBtn.disabled = true; try { await CIN.resetPassword(em); toast('If this email has an account, a reset link is on its way. Check Spam too.'); } catch (e) { toast(friendly(e)); } forgotBtn.disabled = false; };
  let mode = 'signup';
  function setMode(m) {
    mode = m; const login = m === 'login';
    nameRow.style.display = handleRow.style.display = agree.style.display = intRow.style.display = login ? 'none' : '';
    $('#joinBtn').textContent = login ? 'Log in' : 'Join CIN';
    $('#authModal .sheethead strong').textContent = login ? 'Log in' : 'Join CIN';
    swap.textContent = login ? 'New here? Create an account' : 'I already have an account'; forgotBtn.style.display = login ? '' : 'none';
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
  const TIER_NAME = { blue: 'Blue: verified member', red: 'Red: leaders, politicians and businesses', green: 'Green: heads of state and royalty', gold: 'Gold: official CIN account', purple: 'Purple: community or organisation' };
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
      const nm = { blue: 'Blue tick: verified member', red: 'Red tick: leader, politician or business', green: 'Green tick: head of state or royalty', gold: 'Gold tick: official CIN account', purple: 'Purple tick: community or organisation' }[state.tier];
      body.innerHTML = '<div class="adm-row" style="flex-direction:column;align-items:flex-start;gap:8px"><span style="display:flex;align-items:center;gap:8px;font-weight:800">' + CI.verified(26, state.tier) + ' You are verified</span><span style="color:#9aa0b0;font-size:14px">' + nm + '.</span><span style="color:#9aa0b0;font-size:13px">To protect your tick, a verified account cannot change its name. If your details change, contact the CIN owner.</span></div>'; return;
    }
    let req = null; try { req = await CIN.myRequest(); } catch (e) {}
    if (req && req.status === 'pending') { body.innerHTML = '<div class="adm-row" style="flex-direction:column;align-items:flex-start;gap:6px"><b>Application sent</b><span style="color:#9aa0b0;font-size:14px">The CIN owner reviews every application. You will see your tick here once it is approved.</span></div>'; return; }
    let want = 'blue';
    body.innerHTML = (req && req.status === 'rejected' ? '<div class="adm-h" style="color:#ff7a90">Your last application was not approved. You can apply again.</div>' : '') +
      '<div class="adm-h" style="color:#fff;font-size:15px">Ask the CIN owner for a verified tick. Fill in two short boxes and send. If approved, you get a <b style="color:#1d9bf0">blue tick</b>.</div><div id="apWant" style="display:flex;flex-direction:column;gap:8px"></div><button type="button" id="apMore" style="background:none;color:#8ab4ff;font-weight:700;font-size:14px;padding:8px 0;text-align:left">I am a leader, business or community. Show other ticks</button>' +
      '<div class="adm-h">Who are you? (one or two sentences)</div><textarea id="apWhy" maxlength="300" rows="4" class="pm-cap-in" placeholder="Example: I am a student and a creator in Kampala. I post tech tips."></textarea>' +
      '<div class="adm-h">A link that proves it (optional)</div><input id="apLink" maxlength="200" placeholder="Official website or social page" style="margin:0" class="pm-cap-in"><button type="button" class="primary" id="apSend" style="margin-top:12px;width:100%">Send application</button>';
    const box = $('#apWant'); let more = null;
    [['blue', 'Blue', 'Verified member'], ['red', 'Red', 'Leader, politician or business'], ['green', 'Green', 'Head of state or royalty'], ['purple', 'Purple', 'Community, group, school or organisation']].forEach(([t, n, d]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'adm-row'; b.style.cssText = 'width:100%;text-align:left;color:#fff;border:2px solid ' + (t === want ? '#b8ff4a' : 'transparent');
      b.innerHTML = CI.verified(26, t) + '<span class="t"><b>' + n + '</b><span>' + d + '</span></span>';
      b.onclick = () => { want = t; $$('#apWant button').forEach(x => x.style.borderColor = 'transparent'); b.style.borderColor = '#b8ff4a'; };
      box.append(b); if (t !== 'blue') { b.style.display = 'none'; b.dataset.more = '1'; }
    });
    $('#apMore').onclick = () => { $$('#apWant [data-more]').forEach(x => x.style.display = ''); $('#apMore').remove(); };
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
    if (t === 'red' || t === 'green' || t === 'gold' || t === 'purple') {
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
      const AC = { give: 'gave', approve: 'approved', remove: 'removed the tick from', reject: 'rejected', rename: 'renamed' };
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
    r.innerHTML = '<span class="lv-av" style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#b8ff4a,#2fb58a);color:#10140b;display:grid;place-items:center;font-weight:900;flex:none"></span><span class="t"><b></b><span></span></span><div class="adm-tiers" style="width:100%;display:flex;flex-wrap:wrap;gap:6px"></div>';
    r.querySelector('.lv-av').textContent = ((u.name || u.handle || '?')[0] || '?').toUpperCase();
    r.querySelector('b').textContent = '@' + u.handle; if (cur) r.querySelector('b').append(badgeEl(cur));
    r.querySelector('.t > span').textContent = u.name || '';
    const box = r.querySelector('.adm-tiers');
    const rn = document.createElement('button'); rn.type = 'button'; rn.textContent = 'Change name'; rn.style.cssText = 'width:100%;padding:9px 0;border-radius:18px;font-weight:800;font-size:13px;color:#10140b;background:#b8ff4a;border:0';
    rn.onclick = async () => {
      const n = prompt('New display name for @' + u.handle + ' (max 30 letters):', u.name || ''); if (n === null) return;
      const nn = n.trim().slice(0, 30); if (!nn || nn === u.name) return;
      const why = prompt('Reason (saved in the log):', ''); if (why === null) return;
      rn.disabled = true;
      try { await CIN.adminRename(u.id, nn, { handle: u.handle, note: why }); u.name = nn; if (u.id === state.uid) { state.name = nn; updateProfile(); } r.replaceWith(admRow(u)); toast('Name changed to ' + nn); }
      catch (e) { rn.disabled = false; toast('Firebase blocked this. Publish the new Firestore rules.'); }
    };
    box.append(rn);
    [['blue', 'Blue', '#1d9bf0'], ['red', 'Red', '#ff3b30'], ['green', 'Green', '#1fb455'], ['gold', 'Gold', '#f5b301'], ['purple', 'Purple', '#8b5cf6'], ['', 'None', '#3a3f4d']].forEach(([t, label, col]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.style.cssText = 'flex:1 1 30%;padding:9px 0;border-radius:18px;font-weight:800;font-size:13px;color:#fff;background:' + (cur === t ? col : '#1d2029') + ';border:2px solid ' + col;
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
      if (!q) { try { const me0 = await CIN.getProfile(state.uid); if (me0) { const h0 = document.createElement('div'); h0.className = 'adm-h'; h0.textContent = 'Your own account. Give yourself a tick here.'; list.prepend(h0); h0.after(admRow(me0)); } } catch (e) {} }
      items.filter(u => u.id !== state.uid).forEach(u => list.append(admRow(u)));
    } catch (e) { list.innerHTML = '<div class="adm-h">Could not load members.</div>'; }
  }
  const WANT = { blue: 'Blue (member)', red: 'Red (leader or business)', green: 'Green (head of state or royalty)', purple: 'Purple (community or organisation)' };
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
        const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
        const COL = { blue: '#1d9bf0', red: '#ff3b30', green: '#1fb455', purple: '#8b5cf6', gold: '#f5b301', '': '#3a3f4d' }, NAME = { blue: 'Blue', red: 'Red', green: 'Green', purple: 'Purple', gold: 'Gold', '': 'Reject' };
        const act = (t, big) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t ? (big ? 'Approve: give ' + NAME[t] + ' tick' : NAME[t]) : 'Reject'; b.style.cssText = (big ? 'flex:1 1 100%;padding:14px 0;font-size:15px;' : 'flex:1 1 30%;padding:10px 0;font-size:13px;') + 'border-radius:18px;font-weight:800;color:#fff;background:' + COL[t];
          b.onclick = async () => {
            const meta = askAdmin(q, t, NAME[t]); if (!meta) return; b.disabled = true;
            try { await CIN.decideRequest(q.id, t, meta); vCache.set(q.id, t); repaintBadges(); toast(t ? '@' + q.handle + ' approved' : 'Application rejected'); admRequests(); }
            catch (e) { b.disabled = false; toast('Firebase blocked this. Publish the new Firestore rules.'); }
          }; return b; };
        const wanted = ['blue', 'red', 'green', 'purple'].includes(q.wanted) ? q.wanted : 'blue';
        row.append(act(wanted, true), act('', false));
        const oh = document.createElement('div'); oh.style.cssText = 'flex:1 1 100%;color:#9aa0b0;font-size:12px;margin-top:4px'; oh.textContent = 'Or give a different tick:'; row.append(oh);
        ['blue', 'red', 'green', 'purple', 'gold'].filter(t => t !== wanted).forEach(t => row.append(act(t, false)));
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
        (q.kind === 'person' ? Promise.resolve({ __person: 1 }) : CIN.getVideoDoc(q.videoId)).then(v => {
          if (v && v.__person) { info.textContent = 'Person: @' + q.handle + ' (id ' + q.targetUid + ')'; row.append(dismiss); return; }
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
    state.photoURL = p.photoURL || ''; state.bannerURL = p.bannerURL || ''; state.bannerType = p.bannerType || ''; loadStories();
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
    handleUid['@' + v.handle] = v.uid; clip.dataset.views = v.viewsCount || 0;
    { const sn = v.musicName || (v.music && v.music !== 'off' ? v.music : ''); if (sn) { clip.dataset.sname = sn; clip.dataset.sfield = v.musicName ? 'musicName' : 'music'; } }
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
    if (loading) return; loading = true; skel(true);
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
      if (state.account && !blocksLoaded) { try { (await CIN.listBlocks()).forEach(u => blocked.add(u)); blocksLoaded = true; } catch (e) {} }
      const vids = raw.filter((v, i) => okv[i] && !blocked.has(v.uid));
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
    finally { loading = false; skel(false); }
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
      items.forEach(x => { const d = document.createElement('div'); d.className = 'comment cm-row'; const av = document.createElement('span'); av.className = 'cm-av'; circle(av, '', x.handle); if (x.uid) photoOf(x.uid).then(u => u && circle(av, u, x.handle)); const w = document.createElement('div'); w.className = 'cm-t'; const b = document.createElement('b'); b.textContent = '@' + x.handle; w.append(b, document.createTextNode(x.text)); d.append(av, w); list.append(d); });
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
      { const cl = $$('.clip[data-uid]').find(c => (c.querySelector('.creator') || {}).textContent === name), pu = handleUid[name] || (cl && cl.dataset.uid), mn = d.querySelector('.mini'); if (pu) photoOf(pu).then(u => u && circle(mn, u, name)); }
      d.querySelector('strong').textContent = name;
      d.querySelector('small').textContent = (nameOf[name] ? nameOf[name] + ' · ' : '') + (BIOS[name] || 'CIN creator');
      const b = d.querySelector('button'); b.dataset.name = name; b.onclick = e => { e.stopPropagation(); window.toggleFollow(name); };
      d.querySelector('.info').style.cursor = d.querySelector('.mini').style.cursor = 'pointer';
      d.onclick = () => { const cl = $$('.clip[data-uid]').find(c => (c.querySelector('.creator') || {}).textContent === name), pu = handleUid[name] || (cl && cl.dataset.uid); if (pu) window.openPublicProfile(pu); else toast('Profile not available'); };
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
          searchNames = res.map(u => { handleUid['@' + u.handle] = u.id; nameOf['@' + u.handle] = u.name || ''; return '@' + u.handle; });
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
    ['How do I get a verification tick?', 'Open the menu on Profile and tap Verification. Send a short reason and a proof link. The CIN owner checks and decides. Blue is a verified member, purple a community or organisation, red a leader or business, green a head of state or royalty.'],
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
      card('Version', 'Beta. New things are added often. Tell us what to improve.') + card('Who runs it', 'CIN is built and run by its founder, Mugonyi Edrine Dickson, in Kampala, Uganda.') +
      card('Free and independent', 'CIN is free to use. Videos are stored on free cloud plans, so very large files are limited.') +
      '<button type="button" class="secondary" data-go="help">Help and feedback</button><a href="about.html" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:12px;color:#8ab4ff;font-weight:700">Founder page</a>';
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

  // ---------- Activity center (history kept on this phone only) ----------
  const J = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch (e) { return JSON.parse(d); } };
  const S = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const ago = t => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'Just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
  // record what you watch (the clip that stays on screen for a moment)
  { let wt = null; const feed = $('#feed');
    const rec = () => { const fr = feed.getBoundingClientRect(); let best = null, bd = 1e9; $$('#feed .clip[data-cloud]').forEach(c => { const d = Math.abs(c.getBoundingClientRect().top - fr.top); if (d < bd) { bd = d; best = c; } });
      if (!best || bd > fr.height * .3 || !$('#home').classList.contains('active')) return; const id = best.dataset.id, w = J('cin_watch', '[]'); if (w[0] && w[0].id === id) return;
      w.unshift({ id, h: (best.querySelector('.creator') || {}).firstChild ? best.querySelector('.creator').firstChild.textContent : '', c: ((best.querySelector('.caption') || {}).textContent || '').slice(0, 80), t: Date.now() }); S('cin_watch', w.filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).slice(0, 60)); };
    feed.addEventListener('scroll', () => { clearTimeout(wt); wt = setTimeout(rec, 1500); }, { passive: true }); setTimeout(rec, 4000); }
  { const si = $('#searchInput'); if (si) { const rs = () => { const q = si.value.trim(); if (q.length < 2) return; const a = J('cin_searches', '[]').filter(x => x.q !== q); a.unshift({ q, t: Date.now() }); S('cin_searches', a.slice(0, 30)); };
    si.addEventListener('keydown', e => { if (e.key === 'Enter') rs(); }); si.addEventListener('change', rs); } }
  const acss = document.createElement('style');
  acss.textContent = `.act{position:absolute;inset:0;z-index:36;background:#07080c;display:none;flex-direction:column}.act.show{display:flex}.act-top{display:flex;align-items:center;gap:10px;padding:14px 12px}.act-top b{flex:1;font-size:18px}.act-top button{width:42px;height:42px;border-radius:50%;background:#ffffff18;color:#fff;display:grid;place-items:center}
.act-body{flex:1;overflow:auto;padding:0 16px calc(24px + env(safe-area-inset-bottom))}.act-note{color:#9aa0b0;font-size:13px;line-height:1.5;margin:4px 0 14px}.act-card{background:#14161d;border-radius:16px;overflow:hidden;margin-bottom:12px}
.act-row{display:flex;align-items:center;gap:14px;width:100%;padding:15px 14px;background:none;color:#fff;text-align:left;border-bottom:1px solid #20232d}.act-row:last-child{border-bottom:0}.act-row .ai{width:38px;height:38px;border-radius:12px;background:#222633;display:grid;place-items:center;color:#b8ff4a;flex:none}.act-row .tx{flex:1;min-width:0}.act-row .tx b{display:block;font-size:15px}.act-row .tx small{display:block;color:#9aa0b0;font-size:13px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.act-row i{font-style:normal;color:#6b7080}
.act-empty{text-align:center;color:#9aa0b0;padding:40px 10px;font-size:14px}.act-clear{width:100%;padding:14px;border-radius:14px;background:#3a1620;color:#ff7a90;font-weight:800;margin-top:6px}`;
  document.head.append(acss);
  const act = document.createElement('div'); act.className = 'act'; act.id = 'act';
  act.innerHTML = '<div class="act-top"><button type="button" id="actBack" aria-label="Back">' + CI.svg('back', 22) + '</button><b id="actTitle">Activity center</b></div><div class="act-body" id="actBody"></div>';
  $('.app').append(act);
  let actPage = '';
  const arow = (icon, title, sub, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'act-row'; b.innerHTML = '<span class="ai">' + CI.svg(icon, 20) + '</span><span class="tx"><b></b><small></small></span><i>&rsaquo;</i>'; b.querySelector('b').textContent = title; b.querySelector('small').textContent = sub || ''; if (fn) b.onclick = fn; else b.querySelector('i').remove(); return b; };
  function actHome() {
    actPage = ''; $('#actTitle').textContent = 'Activity center';
    const body = $('#actBody'); body.innerHTML = '<p class="act-note">Your history on this phone. Only you can see it. It is not shared with anyone.</p>';
    const card = document.createElement('div'); card.className = 'act-card';
    const w = J('cin_watch', '[]').length, sr = J('cin_searches', '[]').length, lk = (state.liked || []).length, cm = Object.values(state.comments || {}).reduce((a, b) => a + b.length, 0);
    card.append(arow('play', 'Watch history', w + (w === 1 ? ' video' : ' videos'), () => actList('watch')), arow('heart', 'Liked posts', lk + (lk === 1 ? ' post' : ' posts'), () => actList('likes')), arow('comment', 'Comment history', cm + (cm === 1 ? ' comment' : ' comments'), () => actList('comments')), arow('search', 'Search history', sr + (sr === 1 ? ' search' : ' searches'), () => actList('search')), arow('people', 'Account history', 'Sign-ins and verification', () => actList('account')));
    body.append(card);
  }
  const goClip = id => { act.classList.remove('show'); navigate('home'); const c = clipEl(id); if (c) setTimeout(() => c.scrollIntoView(), 80); else toast('That post is no longer in your feed'); };
  function actList(kind) {
    actPage = kind; const body = $('#actBody'); body.innerHTML = ''; const card = document.createElement('div'); card.className = 'act-card';
    const empty = t => { body.innerHTML = '<div class="act-empty">' + t + '</div>'; };
    let key = null, items = [];
    if (kind === 'watch') { $('#actTitle').textContent = 'Watch history'; key = 'cin_watch'; items = J('cin_watch', '[]'); if (!items.length) return empty('Videos you watch will show here.'); items.forEach(x => card.append(arow('play', '@' + (x.h || 'creator'), (x.c ? x.c + ' · ' : '') + ago(x.t), () => goClip(x.id)))); }
    else if (kind === 'likes') { $('#actTitle').textContent = 'Liked posts'; const ids = (state.liked || []).filter(id => !SEED || SEED[id] === undefined); if (!ids.length) return empty('Posts you like will show here.'); ids.slice().reverse().forEach(id => { const c = clipEl(id); card.append(arow('heart', c ? ((c.querySelector('.creator') || {}).firstChild || {}).textContent || 'Post' : 'Post', c ? ((c.querySelector('.caption') || {}).textContent || '') : 'Tap to open', () => goClip(id))); }); }
    else if (kind === 'comments') { $('#actTitle').textContent = 'Comment history'; let n = 0; Object.entries(state.comments || {}).forEach(([id, list]) => list.slice().reverse().forEach(t => { n++; const c = clipEl(id); card.append(arow('comment', t, c ? 'On ' + (((c.querySelector('.creator') || {}).firstChild || {}).textContent || 'a post') : 'On a post', () => goClip(id))); })); if (!n) return empty('Comments you write will show here.'); }
    else if (kind === 'search') { $('#actTitle').textContent = 'Search history'; key = 'cin_searches'; items = J('cin_searches', '[]'); if (!items.length) return empty('What you search will show here.'); items.forEach(x => card.append(arow('search', x.q, ago(x.t), () => { act.classList.remove('show'); navigate('discover'); const si = $('#searchInput'); if (si) { si.value = x.q; si.dispatchEvent(new Event('input', { bubbles: true })); } }))); }
    else { $('#actTitle').textContent = 'Account history'; key = 'cin_acct'; items = J('cin_acct', '[]'); if (state.account) card.append(arow('people', '@' + state.handle, state.tier ? 'Verified account (' + state.tier + ' tick)' : 'Not verified yet')); items.forEach(x => card.append(arow('check', x.m, ago(x.t)))); if (!card.children.length) return empty('Sign in to see your account history.'); }
    body.append(card);
    if (key) { const cl = document.createElement('button'); cl.type = 'button'; cl.className = 'act-clear'; cl.textContent = 'Clear this history'; cl.onclick = () => { if (!confirm('Clear this history from your phone?')) return; S(key, []); actList(kind); toast('History cleared'); }; body.append(cl); }
  }
  $('#actBack').onclick = () => { if (actPage) actHome(); else act.classList.remove('show'); };
  function openActivity() { actHome(); act.classList.add('show'); }
  function logAcct(m) { const a = J('cin_acct', '[]'); a.unshift({ m, t: Date.now() }); S('cin_acct', a.slice(0, 40)); }

  // ---------- My QR code + profile links ----------
  const qcss = document.createElement('style');
  qcss.textContent = `.qrc{position:absolute;inset:0;z-index:38;background:linear-gradient(160deg,#1b1034,#0b2a3a);display:none;flex-direction:column;align-items:center;padding:14px 20px calc(18px + env(safe-area-inset-bottom));overflow:auto}.qrc.show{display:flex}.qrc .qx{align-self:flex-start;width:42px;height:42px;border-radius:50%;background:#ffffff22;color:#fff;display:grid;place-items:center;margin-bottom:6px}
.qr-card{background:#fff;border-radius:26px;padding:22px 20px 18px;width:100%;max-width:340px;text-align:center;color:#10140b;margin-top:34px;position:relative}.qr-av{position:absolute;left:50%;top:-34px;transform:translateX(-50%);width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg,#b8ff4a,#2fb58a);border:4px solid #fff;display:grid;place-items:center;font-weight:900;font-size:28px}.qr-card h2{margin:30px 0 0;font-size:20px;display:flex;align-items:center;justify-content:center;gap:4px}.qr-card .h{color:#7a7f8c;margin-bottom:12px}.qr-card canvas{width:100%;height:auto;display:block}.qr-card .b{margin-top:8px;font-weight:900;letter-spacing:1px}
.qr-btns{display:flex;gap:10px;width:100%;max-width:340px;margin-top:14px}.qr-btns button{flex:1;padding:14px 6px;border-radius:16px;background:#fff;color:#10140b;font-weight:800;font-size:14px;display:flex;flex-direction:column;align-items:center;gap:6px}.qr-note{color:#cfd2dc;font-size:13px;text-align:center;max-width:320px;margin-top:12px}`;
  document.head.append(qcss);
  const qrc = document.createElement('div'); qrc.className = 'qrc'; qrc.id = 'qrc';
  qrc.innerHTML = '<button type="button" class="qx" id="qrX" aria-label="Close">' + CI.svg('close', 22) + '</button><div class="qr-card"><div class="qr-av" id="qrAv"></div><h2 id="qrName"></h2><div class="h" id="qrHandle"></div><canvas id="qrCanvas" width="520" height="520"></canvas><div class="b">CIN</div></div>' +
    '<div class="qr-btns"><button type="button" id="qrCopy">' + CI.svg('link', 22) + 'Copy link</button><button type="button" id="qrShare">' + CI.svg('share', 22) + 'Share profile</button><button type="button" id="qrSave">' + CI.svg('save', 22) + 'Save image</button></div><p class="qr-note">Anyone who scans this with their phone camera opens your CIN profile.</p>';
  $('.app').append(qrc);
  const profLink = h => (location.protocol.startsWith('http') ? location.origin + location.pathname : 'https://appedrine-ops.github.io/cin/') + '#u/' + h;
  function drawQR() {
    const url = profLink(state.handle), m = CINQR.make(url), n = m.length, c = $('#qrCanvas'), g = c.getContext('2d'), q = 2, cell = Math.floor(c.width / (n + 2 * q)), off = Math.floor((c.width - cell * n) / 2);
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) g.fillRect(off + x * cell, off + y * cell, cell, cell);
  }
  function openQR() {
    if (!state.account || !state.handle) { gate(null); return; }
    $('#qrAv').textContent = ((state.name || state.handle)[0] || '?').toUpperCase(); $('#qrName').textContent = state.name || state.handle; if (state.tier) $('#qrName').append(badgeEl(state.tier)); $('#qrHandle').textContent = '@' + state.handle;
    try { drawQR(); } catch (e) { toast('Could not make the QR code'); return; } qrc.classList.add('show');
  }
  $('#qrX').onclick = () => qrc.classList.remove('show');
  $('#qrCopy').onclick = async () => { const t = profLink(state.handle); try { await navigator.clipboard.writeText(t); toast('Link copied'); } catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.append(a); a.select(); try { document.execCommand('copy'); toast('Link copied'); } catch (x) { toast(t); } a.remove(); } };
  $('#qrShare').onclick = () => { const d = { title: 'CIN', text: 'Follow me on CIN: @' + state.handle, url: profLink(state.handle) }; if (navigator.share) navigator.share(d).catch(() => {}); else $('#qrCopy').click(); };
  $('#qrSave').onclick = () => { $('#qrCanvas').toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'cin-qr-' + state.handle + '.png'; document.body.append(a); a.click(); a.remove(); toast('QR image saved'); }); };

  // ---------- Analytics (creator numbers, colourful) ----------
  { const acss = document.createElement('style');
    acss.textContent = `.anl{position:absolute;inset:0;z-index:37;background:#08090d;display:none;overflow:auto;padding:14px 18px calc(24px + env(safe-area-inset-bottom))}.anl.show{display:block}.anl .ax{width:42px;height:42px;border-radius:50%;background:#ffffff18;color:#fff;display:grid;place-items:center}.anl h1{font-size:30px;margin:10px 0 2px}.anl .as{color:#9da2b1;font-size:13px;margin-bottom:16px}.anl .ag{display:grid;grid-template-columns:1fr 1fr;gap:10px}.anl .ac{border-radius:18px;padding:16px 14px;color:#10140b}.anl .ac b{display:block;font-size:30px;font-weight:900;line-height:1.1}.anl .ac span{font-size:12px;font-weight:800;opacity:.8}.anl h2{font-size:16px;margin:22px 0 10px}.anl .bars{display:flex;align-items:flex-end;gap:8px;height:130px;background:#11131a;border-radius:18px;padding:14px 12px 10px}.anl .bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:5px;font-size:10px;color:#9da2b1}.anl .bar i{display:block;width:100%;min-height:4px;border-radius:7px 7px 3px 3px;background:linear-gradient(180deg,#ff4f91,#8b5cf6)}.anl .top{display:flex;gap:12px;align-items:center;background:#11131a;border-radius:16px;padding:10px;margin-bottom:8px}.anl .top img,.anl .top .ph{width:52px;height:68px;border-radius:10px;object-fit:cover;background:linear-gradient(135deg,#8b5cf6,#ff4f91);flex:none}.anl .top div{font-size:13px}.anl .top small{display:block;color:#9da2b1;margin-top:3px}`;
    document.head.append(acss);
    const an = document.createElement('div'); an.className = 'anl'; an.id = 'anl';
    an.innerHTML = '<button type="button" class="ax" id="anX" aria-label="Close">' + CI.svg('close', 22) + '</button><h1>Analytics</h1><div class="as" id="anSub"></div><div id="anBody"></div>';
    $('.app').append(an);
    $('#anX').onclick = () => an.classList.remove('show');
    const CARD = [['#b8ff4a', '#7be0a0'], ['#ff4f91', '#ff9a8b'], ['#4fc3ff', '#8b5cf6'], ['#ffd34f', '#ff8a3d'], ['#8b5cf6', '#c084fc'], ['#2fb58a', '#4fc3ff']];
    async function openAnalytics() {
      if (!state.account) { gate(null); return; }
      const body = $('#anBody'); body.innerHTML = '<div class="as">Loading...</div>'; $('#anSub').textContent = '@' + state.handle; an.classList.add('show');
      try {
        const [p, vs] = await Promise.all([CIN.getProfile(state.uid), CIN.getUserVideos(state.uid)]);
        const likes = vs.reduce((a, v) => a + (v.likesCount || 0), 0), com = vs.reduce((a, v) => a + (v.commentsCount || 0), 0);
        const d7 = Date.now() / 1000 - 7 * 86400, new7 = vs.filter(v => v.createdAt && v.createdAt.seconds > d7).length;
        const stats = [['Followers', (p && p.followersCount) || 0], ['Posts', vs.length], ['Likes', likes], ['Comments', com], ['Views', vs.reduce((a, v) => a + (v.viewsCount || 0), 0)], ['Posts, last 7 days', new7]];
        body.innerHTML = '<div class="ag"></div>';
        stats.forEach(([l, n], i) => { const c = document.createElement('div'); c.className = 'ac'; c.style.background = 'linear-gradient(135deg,' + CARD[i][0] + ',' + CARD[i][1] + ')'; c.innerHTML = '<b></b><span></span>'; c.firstChild.textContent = n; c.lastChild.textContent = l; body.firstChild.append(c); });
        const rec = vs.slice(0, 7).reverse(), mx = Math.max(1, ...rec.map(v => v.likesCount || 0));
        const h2 = document.createElement('h2'); h2.textContent = 'Likes on your latest posts'; body.append(h2);
        if (!rec.length) { const e = document.createElement('div'); e.className = 'as'; e.textContent = 'Post something and your numbers will show here.'; body.append(e); return; }
        const bars = document.createElement('div'); bars.className = 'bars';
        rec.forEach(v => { const b = document.createElement('div'); b.className = 'bar'; b.innerHTML = '<span></span><i></i>'; b.firstChild.textContent = v.likesCount || 0; b.lastChild.style.height = Math.max(4, Math.round(((v.likesCount || 0) / mx) * 84)) + '%'; bars.append(b); });
        body.append(bars);
        const h3 = document.createElement('h2'); h3.textContent = 'Top posts'; body.append(h3);
        vs.slice().sort((a, b) => ((b.likesCount || 0) + (b.commentsCount || 0)) - ((a.likesCount || 0) + (a.commentsCount || 0))).slice(0, 3).forEach(v => {
          const r = document.createElement('div'); r.className = 'top';
          const th = v.photoURL || (v.videoURL ? v.videoURL.replace('/upload/', '/upload/so_0,w_120,h_160,c_fill/').replace(/\.(mp4|mov|webm)$/i, '.jpg') : '');
          if (th) { const im = document.createElement('img'); im.alt = ''; im.src = th; im.onerror = () => { const ph = document.createElement('div'); ph.className = 'ph'; im.replaceWith(ph); }; r.append(im); } else { const ph = document.createElement('div'); ph.className = 'ph'; r.append(ph); }
          const t = document.createElement('div'); t.textContent = (v.caption || 'No caption').slice(0, 60); const sm = document.createElement('small'); sm.textContent = (v.likesCount || 0) + ' likes  ·  ' + (v.commentsCount || 0) + ' comments'; t.append(sm); r.append(t); body.append(r);
        });
      } catch (e) { body.innerHTML = '<div class="as">Could not load your numbers. Check your internet and try again.</div>'; }
    }
    const arow = ['analytics', 'Analytics', '']; MENU[0][1].push(arow); const ma2 = window.menuAction;
    window.menuAction = function (k) { if (k === 'analytics') { closeDrawer(); openAnalytics(); return; } return ma2.apply(this, arguments); };
  }
  // colourful accents on the profile numbers, tabs and menu
  { const ccss = document.createElement('style');
    ccss.textContent = `.stats>*:nth-child(1) strong{color:#ff4f91}.stats>*:nth-child(2) strong{color:#4fc3ff}.stats>*:nth-child(3) strong{color:#b8ff4a}.stats>*:nth-child(4) strong{color:#ffd34f}.stats{background:linear-gradient(135deg,#1b1034,#0f2a3a)}.chip{background:linear-gradient(135deg,#2a1b4a,#14344a)}.primary{background:linear-gradient(135deg,#b8ff4a,#4fe0a0)}`;
    document.head.append(ccss); }

  // ---------- profile photos in the feed, heart pop, branded share card ----------
  { const pcss = document.createElement('style');
    pcss.textContent = `.avatar,.mini,.cm-av{background-size:cover!important;background-position:center!important}.cm-row{display:flex;gap:10px;align-items:flex-start}.cm-av{flex:none;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#b8ff4a,#159b91);color:#10140b;display:grid;place-items:center;font-weight:900;font-size:14px}.cm-t{min-width:0;word-break:break-word}.action.like.liked span{animation:cinPop .45s ease}@keyframes cinPop{0%{transform:scale(1)}30%{transform:scale(1.5) rotate(-8deg)}60%{transform:scale(.9)}100%{transform:scale(1)}}.sharecard-btn{width:100%;margin-top:12px;padding:13px;border-radius:14px;background:linear-gradient(135deg,#8b5cf6,#ff4f91);color:#fff;font-weight:800}`;
    document.head.append(pcss);
    const paintAv = () => $$('.clip[data-cloud]').forEach(c => { const av = c.querySelector('.actions .avatar'), u = c.dataset.uid; if (av && u && !av.dataset.ph) { av.dataset.ph = '1'; photoOf(u).then(url => { if (url) circle(av, url, ''); else av.dataset.ph = ''; }); } });
    const lb0 = loadBadges; window.addEventListener('cin-feed-painted', paintAv);
    const mo = new MutationObserver(() => { clearTimeout(paintAv.t); paintAv.t = setTimeout(paintAv, 250); });
    mo.observe($('#feed'), { childList: true });
    // branded share card
    function wrapText(g, t, x, y, w, lh, max) { const words = t.split(/\s+/); let line = '', n = 0; for (const wd of words) { const tt = line ? line + ' ' + wd : wd; if (g.measureText(tt).width > w && line) { g.fillText(line, x, y); y += lh; line = wd; if (++n >= max) return; } else line = tt; } if (line) g.fillText(line, x, y); }
    async function makeCard(id) {
      const c = id ? $('.clip[data-id="' + CSS.escape(id) + '"]') : null;
      const who = c ? ((c.querySelector('.creator') || {}).childNodes[0] || {}).textContent || '' : '@' + (state.handle || ''), cap = c ? ((c.querySelector('.caption') || {}).textContent || '') : 'Create. Inspire. Network.';
      const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const g = cv.getContext('2d');
      const bg = g.createLinearGradient(0, 0, 1080, 1350); bg.addColorStop(0, '#2d1d44'); bg.addColorStop(.6, '#1a1229'); bg.addColorStop(1, '#0b2a3a'); g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
      const rg = g.createRadialGradient(540, 430, 20, 540, 430, 520); rg.addColorStop(0, 'rgba(139,92,246,.45)'); rg.addColorStop(1, 'rgba(139,92,246,0)'); g.fillStyle = rg; g.fillRect(0, 0, 1080, 1350);
      await new Promise(r => { const im = new Image(); im.onload = () => { g.drawImage(im, 390, 160, 300, 300); r(); }; im.onerror = r; im.src = 'logo-clear.png'; });
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 96px sans-serif'; g.fillText('CIN', 540, 600);
      g.fillStyle = '#ffb02e'; g.font = '700 38px sans-serif'; g.fillText('Create. Inspire. Network.', 540, 660);
      g.fillStyle = '#fff'; g.font = '700 54px sans-serif'; wrapText(g, cap.slice(0, 120) || 'Watch me on CIN', 540, 790, 880, 72, 3);
      g.fillStyle = '#b8ff4a'; g.font = '800 52px sans-serif'; g.fillText(who, 540, 1040);
      g.fillStyle = '#c9cbe0'; g.font = '600 34px sans-serif'; g.fillText('Free short videos, photos and stories', 540, 1100);
      const pill = 'appedrine-ops.github.io/cin'; g.font = '800 38px sans-serif'; const pw = g.measureText(pill).width + 70; g.fillStyle = '#ffb02e'; g.beginPath(); g.roundRect ? g.roundRect(540 - pw / 2, 1180, pw, 80, 40) : g.rect(540 - pw / 2, 1180, pw, 80); g.fill(); g.fillStyle = '#1a1229'; g.fillText(pill, 540, 1233);
      return new Promise(r => cv.toBlob(r, 'image/png'));
    }
    const os0 = window.openShare;
    window.openShare = function (id) {
      os0.apply(this, arguments);
      const g = $('#shareGrid'); if (!g || g.parentNode.querySelector('.sharecard-btn')) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sharecard-btn'; b.textContent = 'Share as a CIN picture card';
      b.onclick = async () => { b.disabled = true; try { const bl = await makeCard(id), f = new File([bl], 'cin-card.png', { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'CIN', text: 'Join me on CIN' }); else { const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'cin-card.png'; document.body.append(a); a.click(); a.remove(); toast('Card saved to your phone'); } } catch (e) { if (!e || e.name !== 'AbortError') toast('Could not make the card'); } b.disabled = false; };
      g.after(b);
    };
  }

  // ---------- public profile page: tap a creator's photo or name, or swipe left on a video ----------
  { const css = document.createElement('style');
    css.textContent = `.pub{position:absolute;inset:0;z-index:37;background:#08090d;display:none;overflow:auto;padding-bottom:calc(24px + env(safe-area-inset-bottom))}.pub.show{display:block}.pub .pbn{height:170px;background:linear-gradient(135deg,#2b1c55,#0f5a63 60%,#1a7f4b);position:relative;overflow:hidden}.pub .pbn img,.pub .pbn video{width:100%;height:100%;object-fit:cover;display:block}.pub .pbk{position:absolute;top:12px;left:12px;z-index:2;width:42px;height:42px;border-radius:50%;background:#0009;color:#fff;display:grid;place-items:center}.pub .pbd{padding:0 18px;margin-top:-44px;position:relative}.pub .pav{width:92px;height:92px;border-radius:50%;border:4px solid #08090d;background:linear-gradient(135deg,#b8ff4a,#159b91) center/cover;display:grid;place-items:center;font-size:34px;font-weight:900;color:#10140b}.pub h2{margin:10px 0 2px;font-size:24px}.pub .ph2{color:#9da2b1;font-size:14px}.pub .pbio{margin:10px 0;font-size:14px;color:#d8dbe4}.pub .pst{display:flex;justify-content:space-around;text-align:center;background:linear-gradient(135deg,#1b1034,#0f2a3a);border-radius:16px;padding:14px 6px;margin:14px 0}.pub .pst b{display:block;font-size:19px}.pub .pst small{color:#9da2b1;font-size:11px}.pub .pgr{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.pub .pgr button{aspect-ratio:3/4;border-radius:8px;overflow:hidden;background:linear-gradient(135deg,#8b5cf6,#ff4f91);padding:0;position:relative}.pub .pgr img{width:100%;height:100%;object-fit:cover;display:block}.pub .pgr small{position:absolute;left:5px;bottom:4px;font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 3px #000}.pvw{position:absolute;inset:0;z-index:39;background:#000;display:none;align-items:center;justify-content:center}.pvw.show{display:flex}.pvw img,.pvw video{max-width:100%;max-height:100%}.pvw button{position:absolute;top:14px;left:14px;width:42px;height:42px;border-radius:50%;background:#fff3;color:#fff;display:grid;place-items:center}`;
    document.head.append(css);
    const pub = document.createElement('div'); pub.className = 'pub'; pub.id = 'pub';
    pub.innerHTML = '<div class="pbn" id="pbn"><button type="button" class="pbk" id="pbk" aria-label="Back">' + CI.svg('close', 22) + '</button></div><div class="pbd"><div class="pav" id="pav"></div><h2 id="pnm"></h2><div class="ph2" id="phd"></div><div class="pbio" id="pbi"></div><button type="button" id="pfw" class="primary" style="width:100%;margin:6px 0 0">Follow</button><button type="button" id="pmsg" class="secondary" style="width:100%;margin:8px 0 0">Message</button><div style="display:flex;gap:8px;margin-top:8px"><button type="button" id="pblk" class="secondary" style="flex:1">Block</button><button type="button" id="prpt" class="secondary" style="flex:1">Report</button></div><div class="pst"><div><b id="ps1">0</b><small>Followers</small></div><div><b id="ps2">0</b><small>Following</small></div><div><b id="ps3">0</b><small>Posts</small></div></div><div class="pgr" id="pgr"></div></div>';
    const pvw = document.createElement('div'); pvw.className = 'pvw'; pvw.id = 'pvw'; pvw.innerHTML = '<button type="button" id="pvwX" aria-label="Close">' + CI.svg('close', 22) + '</button><div id="pvwB" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"></div>';
    $('.app').append(pub, pvw);
    $('#pvwX').onclick = () => { pvw.classList.remove('show'); $('#pvwB').innerHTML = ''; };
    $('#pbk').onclick = () => pub.classList.remove('show');
    async function openPublic(uid) {
      if (!uid) return;
      if (uid === state.uid) { pub.classList.remove('show'); window.navigate && window.navigate('profile'); return; }
      try {
        const p = await CIN.getProfile(uid); if (!p) { toast('That profile was not found'); return; }
        const pbn = $('#pbn'); Array.from(pbn.children).forEach(c => { if (c.id !== 'pbk') c.remove(); }); if (p.bannerURL) pbn.prepend(mediaEl(p.bannerURL, p.bannerType));
        circle($('#pav'), p.photoURL || '', p.name || p.handle); $('#pnm').textContent = p.name || p.handle; const t = tierOf(p); if (t) $('#pnm').append(badgeEl(t));
        $('#phd').textContent = '@' + p.handle; $('#pbi').textContent = p.bio || ''; $('#ps1').textContent = p.followersCount || 0; $('#ps2').textContent = p.followingCount || 0; $('#ps3').textContent = p.postsCount || 0;
        const fb = $('#pfw'); let on = false; if (state.account) { try { on = (await CIN.getFollowingIds()).includes(uid); } catch (e) {} }
        const paint = () => { fb.textContent = on ? 'Following' : 'Follow'; fb.className = on ? 'secondary' : 'primary'; fb.style.width = '100%'; }; paint();
        fb.onclick = async () => { if (!state.account) { pub.classList.remove('show'); gate(null); return; } fb.disabled = true; try { on = await CIN.toggleFollow(uid); paint(); $('#ps1').textContent = Math.max(0, (parseInt($('#ps1').textContent, 10) || 0) + (on ? 1 : -1)); } catch (e) { toast('Could not follow. Try again.'); } fb.disabled = false; };
        const gr = $('#pgr'); gr.innerHTML = ''; pub.classList.add('show'); pub.scrollTop = 0; window.__curPub = { uid, handle: p.handle, name: p.name || p.handle }; window.__pubPaint && window.__pubPaint();
        let vs = []; try { vs = (await CIN.getUserVideos(uid)).filter(v => (v.privacy || 'everyone') === 'everyone'); } catch (e) {}
        if (!vs.length) { gr.style.display = 'block'; gr.innerHTML = '<div class="as" style="color:#9da2b1;text-align:center;padding:24px 0">No public posts yet.</div>'; return; } gr.style.display = '';
        vs.forEach(v => {
          const b = document.createElement('button'); b.type = 'button';
          const th = v.photoURL || (v.videoURL ? v.videoURL.replace('/upload/', '/upload/so_0,w_300,h_400,c_fill/').replace(/\.(mp4|mov|webm)$/i, '.jpg') : '');
          if (th) { const im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.src = th; im.onerror = () => im.remove(); b.append(im); }
          const sm = document.createElement('small'); sm.textContent = (v.likesCount || 0) + ' likes'; b.append(sm);
          b.onclick = () => { const bx = $('#pvwB'); bx.innerHTML = ''; let el; if (v.type === 'photo' || v.photoURL) { el = document.createElement('img'); el.src = v.photoURL; } else { el = document.createElement('video'); el.src = v.videoURL; el.controls = true; el.autoplay = true; el.playsInline = true; } bx.append(el); pvw.classList.add('show'); };
          gr.append(b);
        });
      } catch (e) { toast('Could not open that profile'); }
    }
    window.openPublicProfile = openPublic;
    // taps on the creator photo or name in the feed
    $('#feed').addEventListener('click', e => {
      const hit = e.target.closest('.actions .avatar, .creator'); if (!hit) return;
      const c = hit.closest('.clip[data-uid]'); if (!c) return; e.stopPropagation(); e.preventDefault(); openPublic(c.dataset.uid);
    }, true);
    // swipe left on a video opens its creator
    let sx = 0, sy = 0, st = 0; const feed = $('#feed');
    feed.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    feed.addEventListener('touchend', e => {
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Date.now() - st > 700 || dx > -90 || Math.abs(dy) > Math.abs(dx) * 0.5) return;
      const el = document.elementFromPoint(t.clientX, t.clientY), c = el && el.closest('.clip[data-uid]'); if (c) openPublic(c.dataset.uid);
    }, { passive: true });
  }

  // ---------- swipe right anywhere on a page to go back ----------
  { const BACKS = [['#pvw.show', '#pvwX'], ['#dmc.show', '#dmcX'], ['#dml.show', '#dmlX'], ['#ntf.show', '#ntfX'], ['#lst.show', '#lstX'], ['#pub.show', '#pbk'], ['#pvc.show', '#pvX'], ['#qrc.show', '#qrX'], ['#anl.show', '#anX'], ['#hlp.show', '#hlpBack'], ['#act.show', '#actBack'], ['#adm.show', '#admBack'], ['#settings.show', '#setBack']];
    let bx = 0, by = 0, bt = 0, ok = false; const app = $('.app');
    app.addEventListener('touchstart', e => { const t = e.touches[0]; bx = t.clientX; by = t.clientY; bt = Date.now(); const w = app.getBoundingClientRect(); ok = t.clientX - w.left < w.width * 0.3 && !e.target.closest('input,textarea,video,.stt'); }, { passive: true });
    // closes the top-most page or sheet; returns true if it closed something
    window.cinGoBack = () => {
      for (const [sel, btn] of BACKS) { if ($(sel)) { const b = $(btn); if (b) { b.click(); return true; } } }
      const dr = $('.drawer.show, .drawer.open'); if (dr) { try { closeDrawer(); } catch (e) { dr.classList.remove('show', 'open'); } return true; }
      const md = $('.modal.show'); if (md) { md.classList.remove('show'); return true; }
      if (state.screen && state.screen !== 'home') { navigate('home'); return true; }
      return false;
    };
    app.addEventListener('touchend', e => {
      if (!ok) return; const t = e.changedTouches[0], dx = t.clientX - bx, dy = t.clientY - by; if (dx < 90 || Math.abs(dy) > dx * 0.5 || Date.now() - bt > 700) return;
      window.cinGoBack();
    }, { passive: true });
  }

  // ---------- skeleton loading, pull to refresh ----------
  const skCss = document.createElement('style');
  skCss.textContent = `#feedSk{position:absolute;inset:0 0 66px;z-index:2;background:#0b0d14;display:none;flex-direction:column;justify-content:flex-end;padding:0 16px 30px;gap:12px;pointer-events:none}#feedSk.show{display:flex}#feedSk .sk{border-radius:10px;background:linear-gradient(90deg,#171a24 25%,#262a38 50%,#171a24 75%);background-size:200% 100%;animation:cinSk 1.2s linear infinite}@keyframes cinSk{0%{background-position:200% 0}100%{background-position:-200% 0}}#ptr{position:absolute;top:72px;left:50%;transform:translate(-50%,-140px);opacity:0;visibility:hidden;pointer-events:none;z-index:9;background:#fff;color:#111;font-weight:800;font-size:12px;padding:8px 14px;border-radius:20px;transition:transform .2s,opacity .2s,visibility .2s}#ptr.on{transform:translate(-50%,0);opacity:1;visibility:visible}`;
  document.head.append(skCss);
  const skel0 = document.createElement('div'); skel0.id = 'feedSk';
  skel0.innerHTML = '<div style="display:flex;gap:12px;align-items:flex-end"><div style="flex:1;display:flex;flex-direction:column;gap:10px"><div class="sk" style="height:18px;width:45%"></div><div class="sk" style="height:14px;width:85%"></div><div class="sk" style="height:14px;width:60%"></div></div><div style="display:flex;flex-direction:column;gap:16px"><div class="sk" style="width:44px;height:44px;border-radius:50%"></div><div class="sk" style="width:44px;height:44px;border-radius:50%"></div><div class="sk" style="width:44px;height:44px;border-radius:50%"></div></div></div>';
  $('.app').append(skel0);
  function skel(on) { const el = $('#feedSk'); if (!el) return; if (on && !$('.clip[data-cloud]')) el.classList.add('show'); else el.classList.remove('show'); }
  { const ptr = document.createElement('div'); ptr.id = 'ptr'; ptr.textContent = 'Refreshing...'; $('.app').append(ptr);
    const f = $('#feed'); let py = 0, pt = 0, pok = false;
    f.addEventListener('touchstart', e => { pok = f.scrollTop <= 2; py = e.touches[0].clientY; pt = Date.now(); }, { passive: true });
    f.addEventListener('touchend', e => { if (!pok) return; const dy = e.changedTouches[0].clientY - py; if (dy > 110 && Date.now() - pt < 900 && f.scrollTop <= 2) { ptr.classList.add('on'); loadFeed(true).finally(() => setTimeout(() => ptr.classList.remove('on'), 500)); } }, { passive: true }); }

  // ---------- helpers for the social pages ----------
  const agoS = sec => { if (!sec) return 'now'; const d = Math.max(0, Date.now() / 1000 - sec); if (d < 60) return 'now'; if (d < 3600) return Math.floor(d / 60) + 'm'; if (d < 86400) return Math.floor(d / 3600) + 'h'; return Math.floor(d / 86400) + 'd'; };
  const kfmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
  const BELL = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
  const sCss = document.createElement('style');
  sCss.textContent = `.sov{position:absolute;inset:0;z-index:37;background:#08090d;display:none;flex-direction:column}.sov.show{display:flex}.sov .shd{display:flex;align-items:center;gap:12px;padding:14px 14px 10px}.sov .shd button.sx{width:42px;height:42px;border-radius:50%;background:#ffffff18;color:#fff;display:grid;place-items:center;flex:none}.sov .shd h2{margin:0;font-size:21px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sov .sb{flex:1;overflow:auto;padding:0 14px 20px}.srow{display:flex;gap:12px;align-items:center;background:#11131a;border-radius:16px;padding:12px;margin-bottom:8px;cursor:pointer}.srow.unread{background:linear-gradient(135deg,#1b1034,#0f2a3a)}.srow .sa{flex:none;width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#b8ff4a,#159b91) center/cover;display:grid;place-items:center;font-weight:900;color:#10140b}.srow .st{flex:1;min-width:0;font-size:14px}.srow .st small{display:block;color:#9da2b1;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.srow .sd{width:10px;height:10px;border-radius:50%;background:#ff4f91;flex:none}.sempty{text-align:center;color:#9da2b1;padding:40px 10px;font-size:14px}.inbtns{display:flex;gap:10px;margin:14px 0 4px}.inbtns button{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 8px;border-radius:16px;font-weight:800;color:#fff;background:linear-gradient(135deg,#8b5cf6,#ff4f91);position:relative}.inbtns button+button{background:linear-gradient(135deg,#2fb58a,#4fc3ff)}.inbtns em{font-style:normal;background:#fff;color:#111;border-radius:10px;padding:1px 7px;font-size:12px;display:none}.inbtns em.on{display:inline-block}.dmlog{flex:1;overflow:auto;padding:6px 14px;display:flex;flex-direction:column;gap:6px}.bub{max-width:78%;padding:9px 13px;border-radius:18px;font-size:14px;word-break:break-word;background:#1d2029;align-self:flex-start}.bub.me{align-self:flex-end;background:linear-gradient(135deg,#8b5cf6,#ff4f91);color:#fff}.dmin{display:flex;gap:8px;padding:10px 12px calc(12px + env(safe-area-inset-bottom));background:#0b0d14}.dmin input{flex:1;min-width:0;background:#191c25;border:1px solid #292d39;border-radius:22px;padding:12px 16px;color:#fff;outline:0;font-size:15px}.dmin button{background:linear-gradient(135deg,#b8ff4a,#4fe0a0);color:#10140b;font-weight:900;border-radius:22px;padding:0 18px}.tg{background:none;color:inherit;font:inherit;padding:0;margin-right:6px;font-weight:700}.vws{font-size:12px;color:#d0d3de;margin-top:4px}.tagchips{display:flex;gap:8px;overflow-x:auto;padding:0 0 12px}.tagchips button{flex:none;background:linear-gradient(135deg,#2a1b4a,#14344a);color:#b8ff4a;font-weight:800;font-size:13px;padding:8px 13px;border-radius:20px}`;
  document.head.append(sCss);
  const mkOv = (id, title, extra) => { const o = document.createElement('div'); o.className = 'sov'; o.id = id; o.innerHTML = '<div class="shd"><button type="button" class="sx" id="' + id + 'X" aria-label="Back">' + CI.svg('back', 22) + '</button><h2 id="' + id + 'T">' + title + '</h2>' + (extra || '') + '</div>'; $('.app').append(o); $('#' + id + 'X').onclick = () => o.classList.remove('show'); return o; };
  const pcP = {}; const profOf = async uid => { if (!pcP[uid]) pcP[uid] = CIN.getProfile(uid).catch(() => null); return pcP[uid]; };
  const avFill = (el, uid, nm) => { circle(el, '', nm || '?'); photoOf(uid).then(u => u && circle(el, u, nm)); };
  const openPub = uid => window.openPublicProfile(uid);

  // ---------- notifications (bell) ----------
  let notes = [], unsubN = null, unsubC2 = null, chatsList = [], dmUnread = 0;
  const ntf = mkOv('ntf', 'Notifications'); ntf.insertAdjacentHTML('beforeend', '<div class="sb" id="ntfB"></div>');
  function hubDotPaint() { const nUn = notes.filter(n => !n.read).length; const d = $('#hubDot'); if (d) d.classList.toggle('on', nUn + dmUnread > 0); const e1 = $('#nBadge'), e2 = $('#mBadge'); if (e1) { e1.textContent = nUn; e1.classList.toggle('on', nUn > 0); } if (e2) { e2.textContent = dmUnread; e2.classList.toggle('on', dmUnread > 0); } }
  const NT = { like: 'liked your post', follow: 'started following you', comment: 'commented on your post' };
  function paintNotes() {
    const b = $('#ntfB'); b.innerHTML = ''; if (!notes.length) { b.innerHTML = '<div class="sempty">Nothing yet. When someone likes, comments or follows, it shows up here.</div>'; return; }
    notes.forEach(n => { const r = document.createElement('div'); r.className = 'srow' + (n.read ? '' : ' unread'); r.innerHTML = '<div class="sa"></div><div class="st"><b></b> <span></span><small></small></div>' + (n.read ? '' : '<i class="sd"></i>');
      avFill(r.querySelector('.sa'), n.sender, n.fromName); r.querySelector('b').textContent = '@' + n.fromHandle; r.querySelector('span').textContent = NT[n.type] || 'sent you something'; r.querySelector('small').textContent = (n.text ? '"' + n.text + '"  ·  ' : '') + agoS(n.createdAt && n.createdAt.seconds);
      r.onclick = () => { openPub(n.sender); }; b.append(r); });
  }
  function openNotes() { if (!state.account) { gate(null); return; } paintNotes(); ntf.classList.add('show'); const ids = notes.filter(n => !n.read).map(n => n.id); if (ids.length) CIN.markNotificationsRead(ids).catch(() => {}); }

  // ---------- direct messages ----------
  const dml = mkOv('dml', 'Messages'); dml.insertAdjacentHTML('beforeend', '<div class="sb" id="dmlB"></div>');
  const dmc = mkOv('dmc', ''); dmc.querySelector('.shd').insertAdjacentHTML('beforeend', ''); dmc.insertAdjacentHTML('beforeend', '<div class="dmlog" id="dmLog"></div><div class="dmin"><input id="dmIn" maxlength="500" placeholder="Message"><button type="button" id="dmSend">Send</button></div>');
  let curChat = null, unsubChat = null;
  const unreadChat = c => c.lastFrom && c.lastFrom !== state.uid && (!c['r_' + state.uid] || (c.lastAt && c['r_' + state.uid].seconds < c.lastAt.seconds));
  async function paintChats() {
    dmUnread = chatsList.filter(unreadChat).length; hubDotPaint(); const b = $('#dmlB'); if (!dml.classList.contains('show')) return; b.innerHTML = '';
    const list = chatsList.slice().sort((a, c) => ((c.lastAt && c.lastAt.seconds) || 9e12) - ((a.lastAt && a.lastAt.seconds) || 9e12));
    if (!list.length) { b.innerHTML = '<div class="sempty">No messages yet. Open someone\'s profile and tap Message.</div>'; return; }
    for (const c of list) { const other = c.members.find(m => m !== state.uid); if (!other || blocked.has(other)) continue; const un = unreadChat(c);
      const r = document.createElement('div'); r.className = 'srow' + (un ? ' unread' : ''); r.innerHTML = '<div class="sa"></div><div class="st"><b></b><small></small></div>' + (un ? '<i class="sd"></i>' : '');
      r.querySelector('small').textContent = (c.lastFrom === state.uid ? 'You: ' : '') + (c.last || ''); b.append(r); r.onclick = () => openChat(other);
      profOf(other).then(p => { r.querySelector('b').textContent = p ? (p.name || p.handle) : 'CIN member'; avFill(r.querySelector('.sa'), other, p && (p.name || p.handle)); }); }
  }
  function openMsgs() { if (!state.account) { gate(null); return; } dml.classList.add('show'); paintChats(); }
  async function openChat(uid) {
    if (!state.account) { gate(null); return; } if (uid === state.uid) return;
    curChat = uid; const p = await profOf(uid); $('#dmcT').textContent = p ? (p.name || p.handle) : 'Chat'; $('#dmcT').style.cursor = 'pointer'; $('#dmcT').onclick = () => openPub(uid);
    const log = $('#dmLog'); log.innerHTML = ''; dmc.classList.add('show'); if (unsubChat) unsubChat();
    chatItems = []; chatFailed = []; unsubChat = CIN.watchChat(uid, (items, err) => { chatItems = items; chatErr = err || null; drawChat(); if (!err) CIN.markChatRead(uid); });
  }
  $('#dmcX').onclick = () => { dmc.classList.remove('show'); if (unsubChat) { unsubChat(); unsubChat = null; } curChat = null; };
  let chatItems = [], chatFailed = [], chatErr = null;
  const dmWhy = e => { const c = e && e.code; return c === 'permission-denied' ? 'Not allowed. Publish the newest Firestore rules, or this person blocked you.' : c === 'unavailable' ? 'No internet connection.' : 'Could not send.'; };
  function drawChat() {
    const log = $('#dmLog'); if (!log) return; const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 140; log.innerHTML = '';
    if (chatErr) { log.innerHTML = '<div class="sempty">Could not load this chat.<br>' + (chatErr.code === 'permission-denied' ? 'Publish the newest Firestore rules in Firebase.' : 'Check your internet.') + '</div>'; return; }
    if (!chatItems.length && !chatFailed.length) log.innerHTML = '<div class="sempty">Say hello.</div>';
    chatItems.forEach(m => { const d = document.createElement('div'); d.className = 'bub' + (m.sender === state.uid ? ' me' : ''); d.textContent = m.text; if (m.sender === state.uid) { const st = document.createElement('small'); st.style.cssText = 'display:block;text-align:right;font-size:10px;opacity:.8;margin-top:2px'; st.textContent = m.pending ? 'Sending...' : 'Sent'; d.append(st); } log.append(d); });
    chatFailed.forEach(f => { const d = document.createElement('div'); d.className = 'bub me'; d.style.cssText = 'background:#5a1d28;border:1px solid #ff4f6a'; d.textContent = f.text; const st = document.createElement('small'); st.style.cssText = 'display:block;font-size:11px;margin-top:3px;color:#ffb3bf'; st.textContent = f.why + ' Tap to try again.'; d.append(st); d.onclick = () => { chatFailed = chatFailed.filter(x => x !== f); drawChat(); sendText(f.text); }; log.append(d); });
    if (atEnd || chatItems.length < 12) log.scrollTop = log.scrollHeight;
  }
  async function sendText(t) {
    if (!curChat) return; const to = curChat;
    try { await CIN.sendDM(to, t); } catch (e) { if (to === curChat) { chatFailed.push({ text: t, why: dmWhy(e) }); drawChat(); } toast(dmWhy(e)); }
  }
  function sendDm() {
    const inp = $('#dmIn'), t = inp.value.trim(); if (!t || !curChat) return; if (blocked.has(curChat)) { toast('You blocked this person. Unblock them to message.'); return; } if (!rateOk()) return;
    inp.value = ''; sendText(t);
  }
  $('#dmSend').onclick = sendDm; $('#dmIn').addEventListener('keydown', e => { if (e.key === 'Enter') sendDm(); });

  // start / stop live listeners when someone logs in or out
  CIN.onUser(u => {
    if (unsubN) { unsubN(); unsubN = null; } if (unsubC2) { unsubC2(); unsubC2 = null; } notes = []; chatsList = []; dmUnread = 0; hubDotPaint();
    if (!u) return;
    try { unsubN = CIN.watchNotifications(l => { notes = l; hubDotPaint(); if (ntf.classList.contains('show')) paintNotes(); }); unsubC2 = CIN.watchChats(l => { chatsList = l; paintChats(); }); } catch (e) {}
  });
  { const ib = document.createElement('div'); ib.className = 'inbtns';
    ib.innerHTML = '<button type="button" id="nBtn">' + BELL + 'Notifications <em id="nBadge"></em></button><button type="button" id="mBtn">' + CI.svg('chat', 22) + 'Messages <em id="mBadge"></em></button>';
    $('#inboxSeg').before(ib); $('#nBtn').onclick = openNotes; $('#mBtn').onclick = openMsgs; }
  { const nr = ['notes', 'Notifications', ''], mr = ['msgs', 'Messages', ''], br = ['blocked', 'Blocked accounts', '']; const ma3 = window.menuAction;
    window.menuAction = function (k) { if (k === 'notes') { closeDrawer(); openNotes(); return; } if (k === 'msgs') { closeDrawer(); openMsgs(); return; } if (k === 'blocked') { closeDrawer(); openBlocked(); return; } return ma3.apply(this, arguments); }; }

  // ---------- block and report a person, buttons on the public profile ----------
  window.__pubPaint = () => { const c = window.__curPub; if (!c) return; $('#pblk').textContent = blocked.has(c.uid) ? 'Unblock' : 'Block'; };
  $('#pmsg').onclick = () => { const c = window.__curPub; if (!c) return; $('#pub').classList.remove('show'); openChat(c.uid); };
  $('#pblk').onclick = async () => {
    const c = window.__curPub; if (!c) return; if (!state.account) { $('#pub').classList.remove('show'); gate(null); return; }
    try {
      if (blocked.has(c.uid)) { await CIN.unblockUser(c.uid); blocked.delete(c.uid); toast('@' + c.handle + ' unblocked'); }
      else { if (!confirm('Block @' + c.handle + '?\n\nTheir videos will be hidden from you and they cannot message you. You can unblock them any time in Menu > Blocked accounts.')) return; await CIN.blockUser(c.uid); blocked.add(c.uid); $$('.clip[data-uid]').forEach(el => { if (el.dataset.uid === c.uid) { const v = el.querySelector('video'); if (v) v.pause(); el.remove(); } }); toast('@' + c.handle + ' blocked'); $('#pub').classList.remove('show'); }
      window.__pubPaint();
    } catch (e) { toast('Could not do that. Publish the new Firestore rules.'); }
  };
  $('#prpt').onclick = async () => {
    const c = window.__curPub; if (!c) return; if (!state.account) { $('#pub').classList.remove('show'); gate(null); return; }
    const r = prompt('Why are you reporting @' + c.handle + '? (for example: fake account, spam, abuse, nudity)', ''); if (r === null || !r.trim()) return;
    try { await CIN.reportUser(c.uid, c.handle, r.trim()); toast('Report sent. Thank you.'); } catch (e) { toast('Could not send the report. Try again.'); }
  };
  async function openBlocked() {
    if (!state.account) { gate(null); return; }
    try { const ids = await CIN.listBlocks(); const ps = await Promise.all(ids.map(profOf)); showInfo('Blocked accounts', ids.length ? ['People you blocked. Tap one to unblock.'] : ['You have not blocked anyone.'], ids.map((id, i) => ['Unblock @' + ((ps[i] && ps[i].handle) || 'member'), async () => { try { await CIN.unblockUser(id); blocked.delete(id); toast('Unblocked'); $('#infoModal').classList.remove('show'); } catch (e) { toast('Could not unblock'); } }])); }
    catch (e) { toast('Could not load the list'); }
  }

  // ---------- hashtag pages and sound pages, view counts ----------
  const lst = mkOv('lst', ''); lst.classList.add('pub'); lst.style.display = ''; lst.insertAdjacentHTML('beforeend', '<div class="sb"><div class="ph2" id="lstS" style="color:#9da2b1;margin:0 2px 12px"></div><div class="pgr" id="lstG"></div></div>');
  const playPost = v => { const pvw = $('#pvw'), bx = $('#pvwB'); bx.innerHTML = ''; let el; if (v.type === 'photo' || v.photoURL) { el = document.createElement('img'); el.src = v.photoURL; } else { el = document.createElement('video'); el.src = v.videoURL; el.controls = true; el.autoplay = true; el.playsInline = true; } bx.append(el); pvw.classList.add('show'); };
  async function openList(title, sub, loader) {
    $('#lstT').textContent = title; $('#lstS').textContent = sub; const g = $('#lstG'); g.style.display = 'block'; g.innerHTML = '<div class="sempty">Loading...</div>'; lst.classList.add('show');
    try {
      const vs = (await loader()).filter(v => (v.privacy || 'everyone') === 'everyone' && !blocked.has(v.uid)).sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
      $('#lstS').textContent = sub + (vs.length ? ' · ' + vs.length + ' post' + (vs.length > 1 ? 's' : '') : '');
      if (!vs.length) { g.innerHTML = '<div class="sempty">No posts yet.</div>'; return; } g.style.display = ''; g.innerHTML = '';
      vs.forEach(v => { const b = document.createElement('button'); b.type = 'button'; const th = v.photoURL || (v.videoURL ? v.videoURL.replace('/upload/', '/upload/so_0,w_300,h_400,c_fill/').replace(/\.(mp4|mov|webm)$/i, '.jpg') : ''); if (th) { const im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.src = th; im.onerror = () => im.remove(); b.append(im); } const sm = document.createElement('small'); sm.textContent = '@' + v.handle; b.append(sm); b.onclick = () => playPost(v); g.append(b); });
    } catch (e) { g.innerHTML = '<div class="sempty">Could not load. Check your internet.</div>'; }
  }
  window.openTagPage = tag => openList('#' + tag, 'Videos and photos with this hashtag', () => CIN.videosByTag(tag));
  const viewed = (() => { try { return new Set(JSON.parse(localStorage.getItem('cin_viewed') || '[]')); } catch (e) { return new Set(); } })();
  const vio = new IntersectionObserver(es => es.forEach(en => {
    const c = en.target; clearTimeout(c._vt); if (!en.isIntersecting || en.intersectionRatio < 0.6) return;
    c._vt = setTimeout(() => { const id = c.dataset.id; if (!id || viewed.has(id) || !state.account || c.dataset.uid === state.uid) return; viewed.add(id); try { localStorage.setItem('cin_viewed', JSON.stringify([...viewed].slice(-400))); } catch (e) {} CIN.countView(id).then(() => { c.dataset.views = (+c.dataset.views || 0) + 1; paintClipExtras(c); }).catch(() => {}); }, 2000);
  }), { threshold: [0.6] });
  function paintClipExtras(c) {
    const info = c.querySelector('.clip-info'); if (!info) return;
    let vw = info.querySelector('.vws'); if (!vw) { vw = document.createElement('div'); vw.className = 'vws'; const snd = info.querySelector('.sound'); snd ? snd.before(vw) : info.append(vw); }
    const n = +c.dataset.views || 0; vw.textContent = kfmt(n) + (n === 1 ? ' view' : ' views');
    if (!c.dataset.tg) { c.dataset.tg = '1'; const tg = info.querySelector('.tags'); if (tg) { const tags = (tg.textContent.match(/#[a-z0-9_]+/gi) || []); tg.innerHTML = ''; tags.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tg'; b.textContent = t; b.onclick = e => { e.stopPropagation(); window.openTagPage(t.slice(1).toLowerCase()); }; tg.append(b); }); }
      const sn = info.querySelector('.sound'); if (sn) { sn.style.cursor = 'pointer'; sn.onclick = e => { e.stopPropagation(); if (c.dataset.sname) { const nm = c.dataset.sname; openList('Sound: ' + decEnt(nm).slice(0, 40), 'Videos and photos using this sound', () => CIN.videosBySound(c.dataset.sfield, nm)); } else if (c.dataset.uid) openPub(c.dataset.uid); }; } }
  }
  const clipWatch = new MutationObserver(() => $$('.clip[data-cloud]').forEach(c => { if (!c._ex) { c._ex = 1; paintClipExtras(c); vio.observe(c); } }));
  clipWatch.observe($('#feed'), { childList: true });
  // trending hashtags row on the Friends page, and #tag search
  { const row = document.createElement('div'); row.className = 'tagchips'; row.id = 'tagChips'; $('#discover .searchbox').after(row);
    const paintTags = () => { const cnt = {}; $$('.clip[data-cloud] .tags .tg').forEach(b => { const k = b.textContent.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; }); const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10); row.innerHTML = ''; top.forEach(([t]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => window.openTagPage(t.slice(1)); row.append(b); }); row.style.display = top.length ? '' : 'none'; };
    setInterval(() => { if ($('#discover').classList.contains('show')) paintTags(); }, 1500);
    $('#searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { const v = $('#searchInput').value.trim(); if (v.startsWith('#') && v.length > 1) window.openTagPage(v.slice(1).toLowerCase().replace(/[^a-z0-9_]/g, '')); } }); }

  // ---------- phone Back button: close pages first, then press Back twice to leave the app ----------
  { let armed = 0; const guard = () => { try { history.pushState({ cin: 1 }, '', location.href); } catch (e) {} };
    try { history.replaceState({ cin: 0 }, '', location.href); } catch (e) {} guard();
    window.addEventListener('popstate', () => {
      if (window.cinGoBack && window.cinGoBack()) { guard(); return; }
      if (Date.now() - armed < 2200) { armed = 0; history.back(); return; }
      armed = Date.now(); guard(); toast('Press Back again to exit CIN');
    }); }
  // opening a profile link (someone scanned a QR code)
  const pv = document.createElement('div'); pv.className = 'qrc'; pv.id = 'pvc';
  pv.innerHTML = '<button type="button" class="qx" id="pvX" aria-label="Close">' + CI.svg('close', 22) + '</button><div class="qr-card"><div class="qr-av" id="pvAv"></div><h2 id="pvName"></h2><div class="h" id="pvHandle"></div><p id="pvBio" style="margin:0 0 12px;color:#333;font-size:14px"></p><p id="pvStat" style="margin:0 0 14px;color:#555;font-size:13px"></p><button type="button" id="pvFollow" class="primary" style="width:100%">Follow</button></div>';
  $('.app').append(pv); $('#pvX').onclick = () => { pv.classList.remove('show'); history.replaceState(null, '', location.pathname); };
  async function openProfileLink(handle) {
    handle = String(handle).toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20); if (!handle) return;
    try {
      const p = await CIN.findByHandle(handle); if (!p) { toast('That profile was not found'); return; }
      $('#pvAv').textContent = ((p.name || p.handle)[0] || '?').toUpperCase(); $('#pvName').textContent = p.name || p.handle; const t = p.tier || (p.verified ? 'blue' : ''); if (t) $('#pvName').append(badgeEl(t));
      $('#pvHandle').textContent = '@' + p.handle; $('#pvBio').textContent = p.bio || ''; $('#pvStat').textContent = (p.followersCount || 0) + ' followers · ' + (p.postsCount || 0) + ' posts';
      const fb = $('#pvFollow'); fb.style.display = p.id === state.uid ? 'none' : '';
      let on = false; if (state.account && p.id !== state.uid) { try { on = (await CIN.getFollowingIds()).includes(p.id); } catch (e) {} }
      const paint = () => { fb.textContent = on ? 'Following' : 'Follow'; fb.className = on ? 'secondary' : 'primary'; }; paint();
      fb.onclick = async () => { if (!state.account) { pv.classList.remove('show'); gate(null); return; } fb.disabled = true; try { on = await CIN.toggleFollow(p.id); paint(); } catch (e) { toast('Could not follow. Try again.'); } fb.disabled = false; };
      pv.classList.add('show');
    } catch (e) { toast('Could not open that profile'); }
  }
  // menu rows: Activity center (real screen), My QR code
  { const qrow = ['qr', 'My QR code', '']; MENU[0][1].push(qrow); const ma1 = window.menuAction;
    window.menuAction = function (k) { if (k === 'activity') { closeDrawer(); openActivity(); return; } if (k === 'qr') { closeDrawer(); openQR(); return; } return ma1.apply(this, arguments); }; }

  // ---------- Profile: banner, profile photo, pencil, and stories ----------
  const pcss = document.createElement('style');
  pcss.textContent = `#profile .pf-banner{position:relative;height:150px;border-radius:20px;overflow:hidden;background:linear-gradient(135deg,#2b1c55,#0f5a63 60%,#1a7f4b);margin:0 0 0}#profile .pf-banner img,#profile .pf-banner video{width:100%;height:100%;object-fit:cover;display:block}
.pf-pen{position:absolute;top:10px;right:10px;width:40px;height:40px;border-radius:50%;background:#000a;color:#fff;display:grid;place-items:center;z-index:2}
#profile .profile-head{margin-top:-40px;position:relative;z-index:1;padding:0 6px;align-items:flex-end}#profile .profile-head>div:last-child{padding-bottom:6px}#profile .profile-avatar{position:relative;border:4px solid var(--bg);box-sizing:content-box;background-size:cover;background-position:center}#profile .profile-avatar.has-story{box-shadow:0 0 0 3px var(--bg),0 0 0 6px #b8ff4a}
.pf-plus{position:absolute;right:-6px;bottom:-6px;width:30px;height:30px;border-radius:50%;background:#b8ff4a;color:#10140b;display:grid;place-items:center;border:3px solid var(--bg);padding:0;z-index:2}
.ed-media{display:flex;align-items:center;gap:12px;background:#14161d;border-radius:16px;padding:12px;margin-bottom:10px}.ed-media .tx{flex:1;min-width:0}.ed-media b{display:block;font-size:15px}.ed-media small{color:#9aa0b0;font-size:12px}
.ed-media button{padding:10px 16px;border-radius:16px;background:#b8ff4a;color:#10140b;font-weight:800;font-size:13px}.ed-av{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#b8ff4a,#159b91) center/cover;display:grid;place-items:center;font-weight:900;color:#10140b;flex:none}.ed-bn{width:74px;height:50px;border-radius:12px;background:linear-gradient(135deg,#2b1c55,#0f5a63) center/cover;flex:none;overflow:hidden}.ed-bn img,.ed-bn video{width:100%;height:100%;object-fit:cover}
.ed-link{background:none;color:#ff7a90;font-weight:700;font-size:13px;padding:2px 0 12px}
.stt{display:flex;gap:14px;overflow-x:auto;padding:4px 0 16px;margin:0 -4px}.stt::-webkit-scrollbar{display:none}.stb{flex:none;width:68px;text-align:center;background:none;color:#fff;padding:0}.stb .rg{width:64px;height:64px;border-radius:50%;padding:3px;background:conic-gradient(#b8ff4a,#2fb58a,#8b5cf6,#b8ff4a);margin:0 auto 5px;position:relative}.stb.seen .rg{background:#3a3f4d}.stb.add .rg{background:#2a2d3a}
.stb .in{width:100%;height:100%;border-radius:50%;border:3px solid var(--bg);background:linear-gradient(135deg,#b8ff4a,#159b91) center/cover;display:grid;place-items:center;font-weight:900;color:#10140b;font-size:22px;box-sizing:border-box}.stb small{display:block;font-size:11px;color:#cfd2dc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stb .pl{position:absolute;right:-2px;bottom:-2px;width:22px;height:22px;border-radius:50%;background:#b8ff4a;color:#10140b;display:grid;place-items:center;border:2px solid var(--bg);font-weight:900;font-size:15px;line-height:1}
.stv{position:absolute;inset:0;z-index:60;background:#000;display:none;flex-direction:column}.stv.show{display:flex}.stv-bars{display:flex;gap:4px;padding:12px 12px 6px}.stv-bars i{flex:1;height:3px;border-radius:3px;background:#ffffff44;overflow:hidden;display:block}.stv-bars i b{display:block;height:100%;width:0;background:#fff}
.stv-top{display:flex;align-items:center;gap:10px;padding:6px 12px;color:#fff}.stv-top .in{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#b8ff4a,#159b91) center/cover;display:grid;place-items:center;font-weight:900;color:#10140b;flex:none}.stv-top .tx{flex:1;min-width:0}.stv-top .tx b{display:block;font-size:15px}.stv-top .tx small{color:#cfd2dc;font-size:12px}.stv-top button{width:40px;height:40px;border-radius:50%;background:#ffffff22;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:800}
.stv-m{flex:1;position:relative;display:grid;place-items:center;overflow:hidden}.stv-m img,.stv-m video{max-width:100%;max-height:100%;object-fit:contain}.stv-m .zl,.stv-m .zr{position:absolute;top:0;bottom:0;z-index:2}.stv-m .zl{left:0;width:32%}.stv-m .zr{right:0;width:68%}.stv-cap{position:absolute;left:0;right:0;bottom:0;padding:40px 18px calc(22px + env(safe-area-inset-bottom));background:linear-gradient(transparent,#000c);color:#fff;font-size:16px;text-align:center;z-index:1}
.sta{position:absolute;inset:0;z-index:59;background:#07080c;display:none;flex-direction:column}.sta.show{display:flex}.sta-pv{flex:1;display:grid;place-items:center;overflow:hidden;padding:10px}.sta-pv img,.sta-pv video{max-width:100%;max-height:100%;border-radius:16px}.sta-bt{padding:12px 16px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px}.sta-bt input{background:#14161d;border:1px solid #2a2d3a;border-radius:14px;padding:13px;color:#fff;font-size:15px;outline:0}
.sta-pick{flex:1;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:20px}.sta-pick button{display:flex;align-items:center;gap:14px;background:#14161d;color:#fff;border-radius:18px;padding:18px;font-weight:800;font-size:16px;text-align:left;width:100%}.sta-pick small{display:block;color:#9aa0b0;font-weight:500;font-size:13px;margin-top:3px}`;
  document.head.append(pcss);
  const PEN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const head = $('#profile .profile-head'), pb = document.createElement('div'); pb.className = 'pf-banner'; pb.id = 'pfBanner';
  pb.innerHTML = '<button type="button" class="pf-pen" id="pfPen" aria-label="Edit profile">' + PEN + '</button>'; head.before(pb);
  const pav = $('#profileInitial'), ppl = document.createElement('button'); ppl.type = 'button'; ppl.className = 'pf-plus'; ppl.id = 'pfPlus'; ppl.setAttribute('aria-label', 'Add to your story'); ppl.innerHTML = PLUS; pav.append(ppl);
  const mediaEl = (url, type) => { const m = document.createElement(type === 'video' ? 'video' : 'img'); m.src = url; if (type === 'video') { m.muted = true; m.loop = true; m.autoplay = true; m.playsInline = true; m.setAttribute('playsinline', ''); m.play && m.play().catch(() => {}); } return m; };
  function paintProfileExtras() {
    const on = !!state.account; pb.style.display = on ? '' : 'none'; head.style.marginTop = on ? '' : '18px';
    ppl.style.display = on ? '' : 'none';
    Array.from(pb.children).forEach(c => { if (c.id !== 'pfPen') c.remove(); }); if (state.bannerURL) pb.prepend(mediaEl(state.bannerURL, state.bannerType));
    // keep the letter, but put it in a text node so the plus button stays
    Array.from(pav.childNodes).forEach(n => { if (n.nodeType === 3) n.remove(); });
    if (!pav.contains(ppl)) pav.append(ppl);
    if (state.photoURL) pav.style.background = 'url("' + String(state.photoURL).replace(/"/g, '') + '") center/cover'; else { pav.style.background = ''; pav.prepend(document.createTextNode(((state.name || 'Y').trim()[0] || 'Y').toUpperCase())); }
    pav.classList.toggle('has-story', !!(state.uid && stories.some(s => s.uid === state.uid)));
    const av = $('#edAv'); if (av) { av.style.backgroundImage = state.photoURL ? 'url("' + state.photoURL + '")' : ''; av.textContent = state.photoURL ? '' : ((state.name || 'Y').trim()[0] || 'Y').toUpperCase(); }
    const bn = $('#edBn'); if (bn) { bn.innerHTML = ''; if (state.bannerURL) bn.append(mediaEl(state.bannerURL, state.bannerType)); } const bd = $('#edBnDel'); if (bd) bd.style.display = state.bannerURL ? '' : 'none';
  }
  { const up0 = window.updateProfile; window.updateProfile = function () { const r = up0.apply(this, arguments); paintProfileExtras(); return r; }; }
  window.CINX && (CINX.paintAvatar = url => { state.photoURL = url; paintProfileExtras(); });
  // edit sheet: profile photo + banner
  { const sheet = $('#editModal .sheet'), first = sheet.querySelector('.formrow');
    const w = document.createElement('div'); w.innerHTML = '<div class="ed-media"><div class="ed-av" id="edAv"></div><div class="tx"><b>Profile photo</b><small>Shows on your profile, stories and QR code</small></div><button type="button" id="edAvBtn">Change</button></div><div class="ed-media"><div class="ed-bn" id="edBn"></div><div class="tx"><b>Banner</b><small>A photo or a short video (up to 15 seconds)</small></div><button type="button" id="edBnBtn">Change</button></div><button type="button" class="ed-link" id="edBnDel">Remove banner</button><input type="file" id="fileAv" accept="image/*" hidden><input type="file" id="fileBn" accept="image/*,video/*" hidden>';
    while (w.firstChild) first.before(w.firstChild);
    $('#edAvBtn').onclick = () => $('#fileAv').click(); $('#edBnBtn').onclick = () => $('#fileBn').click();
    const squareJpeg = async (file, size) => { const bmp = await createImageBitmap(file), s = Math.min(bmp.width, bmp.height), c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size); return new Promise(r => c.toBlob(r, 'image/jpeg', .86)); };
    const videoLen = f => new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { res(v.duration); URL.revokeObjectURL(v.src); }; v.onerror = () => res(0); v.src = URL.createObjectURL(f); });
    $('#fileAv').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const b = $('#edAvBtn'); b.disabled = true; b.textContent = 'Uploading...';
      try { const blob = await squareJpeg(f, 512); state.photoURL = await CIN.setAvatar(new File([blob], 'avatar.jpg', { type: 'image/jpeg' })); paintProfileExtras(); toast('Profile photo updated'); } catch (x) { toast('Could not upload the photo. Try again.'); } b.disabled = false; b.textContent = 'Change'; };
    $('#fileBn').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const b = $('#edBnBtn');
      const isV = /^video\//.test(f.type); if (isV) { const d = await videoLen(f); if (d > 15.5) { toast('Banner videos can be up to 15 seconds'); return; } }
      b.disabled = true; b.textContent = 'Uploading...';
      try { const r = await CIN.setBanner(f, pc => { b.textContent = pc + '%'; }); state.bannerURL = r.url; state.bannerType = r.type; paintProfileExtras(); toast('Banner updated'); } catch (x) { toast(/too big/i.test(String(x.message)) ? x.message : 'Could not upload the banner. Try again.'); } b.disabled = false; b.textContent = 'Change'; };
    $('#edBnDel').onclick = async () => { try { await CIN.removeBanner(); state.bannerURL = ''; state.bannerType = ''; paintProfileExtras(); toast('Banner removed'); } catch (x) { toast('Could not remove it'); } };
  }
  $('#pfPen').onclick = () => { if (!state.account) { gate(null); return; } paintProfileExtras(); $('#editModal').classList.add('show'); };

  // ----- stories -----
  let stories = [], seen = new Set(J('cin_seen', '[]')), pcache = {};
  const markSeen = id => { if (seen.has(id)) return; seen.add(id); S('cin_seen', Array.from(seen).slice(-300)); };
  async function loadStories() { try { stories = await CIN.listStories(); } catch (e) { stories = []; } paintTray(); paintProfileExtras(); }
  const trayHost = document.createElement('div'); trayHost.className = 'stt'; trayHost.id = 'stTray'; $('#discover .searchbox').before(trayHost);
  const circle = (el, url, name) => { el.style.backgroundImage = url ? 'url("' + url + '")' : ''; el.textContent = url ? '' : ((name || '?')[0] || '?').toUpperCase(); };
  async function photoOf(uid) { if (uid === state.uid) return state.photoURL || ''; if (pcache[uid] === undefined) { pcache[uid] = ''; try { const p = await CIN.getProfile(uid); pcache[uid] = (p && p.photoURL) || ''; } catch (e) {} } return pcache[uid]; }
  function paintTray() {
    trayHost.innerHTML = ''; const byUser = new Map(); stories.forEach(s => { if (!byUser.has(s.uid)) byUser.set(s.uid, []); byUser.get(s.uid).push(s); });
    const mk = (cls, name, label, onclick) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'stb ' + cls; b.innerHTML = '<div class="rg"><div class="in"></div></div><small></small>'; b.querySelector('small').textContent = label; b.onclick = onclick; trayHost.append(b); return b; };
    const mine = byUser.get(state.uid), my = mk(mine ? '' : 'add', state.name, 'Your story', () => { if (!state.account) { gate(null); return; } mine ? openViewer(state.uid) : openAdd(); });
    circle(my.querySelector('.in'), state.photoURL, state.name); if (!mine) { const pl = document.createElement('span'); pl.className = 'pl'; pl.textContent = '+'; my.querySelector('.rg').append(pl); }
    byUser.forEach((items, uid) => { if (uid === state.uid) return; const allSeen = items.every(i => seen.has(i.id)); const b = mk(allSeen ? 'seen' : '', items[0].name, items[0].handle, () => openViewer(uid)); circle(b.querySelector('.in'), '', items[0].name); photoOf(uid).then(u => u && circle(b.querySelector('.in'), u, items[0].name)); });
  }
  // viewer
  const stv = document.createElement('div'); stv.className = 'stv'; stv.id = 'stv';
  stv.innerHTML = '<div class="stv-bars" id="stvBars"></div><div class="stv-top"><div class="in" id="stvAv"></div><div class="tx"><b id="stvName"></b><small id="stvTime"></small></div><button type="button" id="stvDel" style="display:none;width:auto;padding:0 14px;border-radius:20px">Delete</button><button type="button" id="stvX" aria-label="Close">' + CI.svg('close', 20) + '</button></div><div class="stv-m" id="stvM"><div class="zl" id="stvL"></div><div class="zr" id="stvR"></div></div>';
  $('.app').append(stv);
  let groups = [], gi = 0, si = 0, tm = null;
  const stClose = () => { clearTimeout(tm); stv.classList.remove('show'); const m = $('#stvM .mm'); if (m) m.remove(); paintTray(); };
  function openViewer(uid) { const by = new Map(); stories.forEach(s => { if (!by.has(s.uid)) by.set(s.uid, []); by.get(s.uid).push(s); }); groups = [by.get(uid)].concat(Array.from(by.entries()).filter(([u]) => u !== uid).map(([, v]) => v)).filter(Boolean); gi = 0; si = 0; if (!groups.length) return; stv.classList.add('show'); stShow(); }
  function stNext() { si++; if (si >= groups[gi].length) { gi++; si = 0; if (gi >= groups.length) { stClose(); return; } } stShow(); }
  function stPrev() { if (si > 0) si--; else if (gi > 0) { gi--; si = groups[gi].length - 1; } stShow(); }
  function stShow() {
    clearTimeout(tm); const g = groups[gi], s = g[si]; markSeen(s.id);
    const bars = $('#stvBars'); bars.innerHTML = ''; g.forEach((x, i) => { const bi = document.createElement('i'), bb = document.createElement('b'); bb.style.width = i < si ? '100%' : '0'; bi.append(bb); bars.append(bi); });
    const fill = ms => { const bb = bars.children[si].firstChild; bb.style.transition = 'none'; bb.style.width = '0'; void bb.offsetWidth; bb.style.transition = 'width ' + ms + 'ms linear'; bb.style.width = '100%'; };
    circle($('#stvAv'), '', s.name); photoOf(s.uid).then(u => u && circle($('#stvAv'), u, s.name)); $('#stvName').textContent = s.handle || s.name; const mins = s.createdAt && s.createdAt.seconds ? Math.floor((Date.now() / 1000 - s.createdAt.seconds) / 60) : 0; $('#stvTime').textContent = mins < 1 ? 'Just now' : mins < 60 ? mins + ' min ago' : Math.floor(mins / 60) + ' h ago';
    $('#stvDel').style.display = s.uid === state.uid ? '' : 'none';
    const M = $('#stvM'); const old = M.querySelector('.mm'); if (old) old.remove(); const wrap = document.createElement('div'); wrap.className = 'mm'; wrap.style.cssText = 'display:grid;place-items:center;width:100%;height:100%';
    if (s.type === 'video') { const v = document.createElement('video'); v.src = s.url; v.playsInline = true; v.setAttribute('playsinline', ''); v.onloadedmetadata = () => fill((v.duration || 8) * 1000); v.onended = stNext; v.onerror = stNext; wrap.append(v); v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
    else { const im = document.createElement('img'); im.src = s.url; wrap.append(im); fill(5000); tm = setTimeout(stNext, 5000); }
    if (s.caption) { const c = document.createElement('div'); c.className = 'stv-cap'; c.textContent = s.caption; wrap.append(c); }
    M.prepend(wrap);
  }
  $('#stvR').onclick = stNext; $('#stvL').onclick = stPrev; $('#stvX').onclick = stClose;
  $('#stvDel').onclick = async () => { const s = groups[gi][si]; if (!confirm('Delete this story?')) return; try { await CIN.deleteStory(s.id); stories = stories.filter(x => x.id !== s.id); groups[gi].splice(si, 1); toast('Story deleted'); if (!groups[gi].length) { groups.splice(gi, 1); si = 0; if (gi >= groups.length) { stClose(); paintTray(); paintProfileExtras(); return; } } else if (si >= groups[gi].length) si = groups[gi].length - 1; paintProfileExtras(); stShow(); } catch (e) { toast('Could not delete it'); } };
  // add a story
  const sta = document.createElement('div'); sta.className = 'sta'; sta.id = 'sta';
  sta.innerHTML = '<div class="stv-top" style="padding:14px 12px"><button type="button" id="staX" aria-label="Close">' + CI.svg('close', 20) + '</button><div class="tx"><b>Add to your story</b><small>Disappears after 24 hours</small></div></div><div class="sta-pick" id="staPick"><button type="button" id="staCam"><span>' + CI.svg('camera', 26) + '</span><span>Camera<small>Take a photo or video now</small></span></button><button type="button" id="staGal"><span>' + CI.svg('image', 26) + '</span><span>Gallery<small>Choose a photo or video (video up to 30 seconds)</small></span></button></div><div class="sta-pv" id="staPv" style="display:none"></div><div class="sta-bt" id="staBt" style="display:none"><input id="staCap" maxlength="80" placeholder="Add a caption (optional)"><button type="button" class="primary" id="staGo">Share to story</button></div><input type="file" id="fileStC" accept="image/*,video/*" capture hidden><input type="file" id="fileStG" accept="image/*,video/*" hidden>';
  $('.app').append(sta);
  let stFile = null;
  const staReset = () => { stFile = null; $('#staPick').style.display = ''; $('#staPv').style.display = 'none'; $('#staBt').style.display = 'none'; $('#staPv').innerHTML = ''; $('#staCap').value = ''; };
  function openAdd() { if (!state.account) { gate(null); return; } staReset(); sta.classList.add('show'); }
  $('#staX').onclick = () => sta.classList.remove('show'); $('#staCam').onclick = () => $('#fileStC').click(); $('#staGal').onclick = () => $('#fileStG').click();
  async function staPicked(e) { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const isV = /^video\//.test(f.type) || /\.(mp4|webm|mov|3gp|mkv)$/i.test(f.name);
    if (isV) { const d = await new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { res(v.duration); URL.revokeObjectURL(v.src); }; v.onerror = () => res(0); v.src = URL.createObjectURL(f); }); if (d > 30.5) { toast('Story videos can be up to 30 seconds'); return; } if (f.size > 25 * 1024 * 1024) { toast('That video is too big. Use one under 25 MB.'); return; } }
    stFile = f; const pv = $('#staPv'); pv.innerHTML = ''; const m = document.createElement(isV ? 'video' : 'img'); m.src = URL.createObjectURL(f); if (isV) { m.controls = true; m.muted = true; m.playsInline = true; } pv.append(m); pv.style.display = ''; $('#staPick').style.display = 'none'; $('#staBt').style.display = ''; }
  $('#fileStC').onchange = staPicked; $('#fileStG').onchange = staPicked;
  $('#staGo').onclick = async () => { if (!stFile) return; const b = $('#staGo'); b.disabled = true; b.textContent = 'Sharing...';
    try { await CIN.postStory(stFile, $('#staCap').value.trim(), pc => { b.textContent = 'Sharing ' + pc + '%'; }); sta.classList.remove('show'); toast('Story shared'); await loadStories(); }
    catch (x) { toast(/too big/i.test(String(x.message)) ? x.message : /permission/i.test(String(x.code || x.message)) ? 'Firebase blocked this. Publish the new Firestore rules.' : 'Could not share. Try again.'); }
    b.disabled = false; b.textContent = 'Share to story'; };
  $('#pfPlus').onclick = e => { e.stopPropagation(); openAdd(); };
  pav.addEventListener('click', e => { if (e.target.closest('#pfPlus')) return; if (state.account && stories.some(s => s.uid === state.uid)) openViewer(state.uid); });
  $$('.nav[data-screen=discover]').forEach(b => b.addEventListener('click', () => loadStories()));
  setInterval(() => { if (state.account && !stv.classList.contains('show')) loadStories(); }, 120000);

  // ---------- Start ----------
  let first = true;
  CIN.onUser(async user => {
    if (signingUp) return;
    if (user) { await loadAccount(user); if (!sessionStorage.getItem('cin_sess')) { sessionStorage.setItem('cin_sess', '1'); logAcct('Signed in'); } const lt = localStorage.getItem('cin_lasttier_' + user.uid); if ((lt || '') !== (state.tier || '')) { if (lt !== null || state.tier) logAcct(state.tier ? 'Verified: ' + state.tier + ' tick' : 'Tick removed'); localStorage.setItem('cin_lasttier_' + user.uid, state.tier || ''); } }
    else { state.account = false; state.uid = null; localStorage.removeItem('cin_account'); paintAccount(); }
    await loadFeed(true);
    if (first) { first = false; const h = decodeURIComponent(location.hash.slice(1)); if (h.startsWith('u/')) openProfileLink(h.slice(2)); if (h === 'verify') setTimeout(() => { history.replaceState(null, '', location.pathname); window.menuAction('verify'); }, 900); const t = h && !h.startsWith('u/') && h !== 'verify' && clipEl(h); if (t) setTimeout(() => t.scrollIntoView(), 150); }
  });
}
