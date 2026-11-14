// CIN cloud glue: connects the existing index.html screens to the Firebase backend.
// If cin-backend.js has no Firebase config yet, this file does nothing and the app stays in local-demo mode.
import { CIN } from "./cin-backend.js?v=7";

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
  async function loadAccount(user) {
    let p = null;
    for (let i = 0; i < 6 && !p; i++) { p = await CIN.getProfile(user.uid); if (!p) await sleep(500); }
    if (!p) { toast('Could not load your profile'); return; }
    state.account = true; state.uid = user.uid; state.name = p.name; state.handle = p.handle; state.posts = p.postsCount || 0;
    localStorage.setItem('cin_account', '1'); localStorage.setItem('cin_name', p.name); localStorage.setItem('cin_handle', p.handle);
    if (Array.isArray(p.interests) && p.interests.length) { try { localStorage.setItem('cin_interests', JSON.stringify(p.interests)); } catch (e) {} }
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
    clip.querySelector('.creator').textContent = '@' + v.handle;
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
      if (au) { au.loop = true; au.volume = v.musicVol == null ? .7 : v.musicVol; snd.textContent = (v.musicName || 'Music') + (v.musicLink ? ' · Jamendo' : ''); }
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
      snd.textContent = (v.musicName || 'Music') + (v.musicLink ? ' · Jamendo' : '');
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
    catch (e) { toast('Could not save profile'); }
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
      const list = await CIN.getUserVideos(state.uid);
      mine.innerHTML = '';
      $('#profile .empty').style.display = list.length ? 'none' : '';
      $('#postCount').textContent = list.length; state.posts = list.length;
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
        if ((v.privacy || 'everyone') !== 'everyone') { const l = document.createElement('b'); l.className = 'lk'; l.innerHTML = CI.svg('lock', 14); t.append(l); }
        mine.append(t);
      });
    } catch (e) { console.warn('My posts failed', e); toast('Could not load your posts'); }
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
