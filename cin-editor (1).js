// CIN editor: after you record or pick a video you land here (Back / Next, Sound, Volume).
// Sound library: Jamendo (free, licensed independent music). Paste your free Client ID below.
(function () {
  const JAMENDO_CLIENT_ID = "YOUR_JAMENDO_CLIENT_ID";

  const X = window.CINX; if (!X) return;
  const ic = (n, s) => CI.svg(n, s || 22);
  const hasKey = () => !/^YOUR_/.test(JAMENDO_CLIENT_ID);
  const fmt = t => { t = Math.round(+t || 0); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const FAV = 'cin_fav_tracks', REC = 'cin_recent_tracks';
  const input = $('#videoFile');

  X.musicTrack = null; X.vVol = 1; X.mVol = 0.7; X.media = null;
  let isPhoto = false, sndOnly = false, sndCb = null, curFile = null, source = 'studio', vUrl = null, fileKey = null, tab = 'hot', inst = '', q = '', selId = null, loadTok = 0;

  const css = document.createElement('style');
  css.textContent = `
#upload{padding-top:18px}
.clip .pimg{width:100%;height:100%;object-fit:cover;background:#151823;display:block}
.dhead{display:flex;align-items:center;justify-content:space-between;height:42px;margin-bottom:12px}.dhead b{font-size:17px}.dhead button{width:42px;height:42px;border-radius:50%;background:var(--panel2);display:grid;place-items:center;color:#fff}.dhead span{width:42px}
.dsum{display:flex;gap:14px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:12px;margin-bottom:8px}.dsum img{width:84px;height:112px;border-radius:12px;object-fit:cover;background:#000;flex:none;display:none}.dsum.photo img{display:block}.dsum.photo video{display:none}.dsum video{width:84px;height:112px;border-radius:12px;object-fit:cover;background:#000;flex:none}.dinfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}.dinfo b{font-size:15px}.dsound{font-size:12px;color:var(--accent);display:flex;gap:6px;align-items:center;overflow:hidden;white-space:nowrap}.dsound span{overflow:hidden;text-overflow:ellipsis}.dbtns{display:flex;gap:8px;margin-top:auto}.dbtns button{flex:1;padding:9px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px}

.ed{position:absolute;inset:0;z-index:30;background:#000;display:none}.ed.show{display:block}
.ed>video,.ed>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000}.ed>img{display:none}.ed.photo>img{display:block}.ed.photo>video{display:none}
.ed.snd-only{z-index:60;background:#0008}.ed.snd-only>video,.ed.snd-only>img,.ed.snd-only .ed-top,.ed.snd-only .ed-bar{display:none!important}.ed.snd-only .sh{bottom:0;max-height:78%}
.ed-top{position:absolute;top:0;left:0;right:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 12px;background:linear-gradient(#000a,transparent)}
.ed-top .eb{width:44px;height:44px;border-radius:50%;background:#0008;color:#fff;display:grid;place-items:center;flex:none}
.ed-top .pill{flex:1;justify-content:center;max-width:210px}
.ed-top .next{background:var(--accent);color:#10140b;font-weight:900;border-radius:22px;padding:0 20px;height:40px;flex:none}
.ed-bar{position:absolute;left:0;right:0;bottom:0;z-index:3;height:calc(76px + env(safe-area-inset-bottom));background:#000;display:flex;justify-content:center;align-items:center;gap:90px;padding-bottom:env(safe-area-inset-bottom)}
.ed-bar button{background:none;color:#fff;display:flex;flex-direction:column;align-items:center;gap:5px;font-size:13px;font-weight:700}
.sh{position:absolute;left:0;right:0;bottom:calc(76px + env(safe-area-inset-bottom));z-index:4;background:#14161d;border-radius:22px 22px 0 0;transform:translateY(120%);transition:transform .25s;display:flex;flex-direction:column;max-height:66%;visibility:hidden}.sh.show{transform:none;visibility:visible}
.sh .grab{width:48px;height:5px;border-radius:3px;background:#3a3f4d;margin:10px auto 6px;flex:none}
.s-tabs{display:flex;align-items:center;gap:20px;padding:6px 16px;border-bottom:1px solid var(--line);flex:none}.s-tabs button{background:none;color:#868b99;font-weight:800;font-size:16px;padding:8px 0;border-bottom:2px solid transparent}.s-tabs button.on{color:#fff;border-color:var(--accent)}.s-tabs .srch{margin-left:auto;color:#fff;border:0;padding:6px}
.s-search{display:none;padding:10px 16px 0;flex:none}.s-search.on{display:block}.s-search input{width:100%;background:#1d2029;border:1px solid var(--line);border-radius:12px;padding:12px;color:#fff;outline:0}
.s-opts{display:flex;gap:8px;padding:10px 16px 2px;flex:none;align-items:center;overflow-x:auto;scrollbar-width:none}.s-opts::-webkit-scrollbar{display:none}.s-opts button{flex:none;background:#1d2029;color:#c5c8d3;border-radius:18px;padding:7px 13px;font-size:12px;font-weight:700}.s-opts button.on{background:#fff;color:#000}.s-opts i{flex:none;width:1px;height:18px;background:var(--line);margin:0 2px}
.s-now{display:none;align-items:center;justify-content:space-between;gap:10px;margin:8px 16px 0;background:#1d2029;border-radius:12px;padding:8px 8px 8px 12px;font-size:12px;font-weight:700;flex:none}.s-now.on{display:flex}.s-now span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--accent)}.s-now button{background:#ffffff1a;color:#fff;border-radius:14px;padding:6px 12px;font-size:12px;font-weight:700}
.s-list{flex:1;overflow:auto;padding:4px 0 6px;min-height:120px}
.s-msg{padding:28px 20px;text-align:center;color:var(--muted);font-size:13px;line-height:1.5}.s-msg button{margin-top:12px}
.trk{display:flex;align-items:center;gap:12px;padding:9px 16px;cursor:pointer}.trk.sel{background:#ffffff0f}
.trk .art{width:54px;height:54px;border-radius:10px;background:#1d2029;overflow:hidden;flex:none;position:relative}.trk .art img{width:100%;height:100%;object-fit:cover;display:block}
.trk .tx{flex:1;min-width:0}.trk b{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.trk.sel b{color:#ff4f6d}.trk small{display:block;color:var(--muted);font-size:12px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trk .use{margin-top:8px;background:#ff2d55;color:#fff;font-weight:800;border-radius:8px;padding:8px 14px;font-size:13px}
.trk .bm{background:none;color:#fff;padding:8px;flex:none}.trk .bm.on{color:var(--accent)}
.eq{display:inline-flex;gap:2px;align-items:flex-end;height:12px;margin-right:6px}.eq i{width:3px;background:#ff4f6d;border-radius:1px;animation:eq .8s infinite ease-in-out}.eq i:nth-child(2){animation-delay:.2s}.eq i:nth-child(3){animation-delay:.4s}@keyframes eq{0%,100%{height:3px}50%{height:12px}}
.s-foot{flex:none;padding:8px 16px 12px;border-top:1px solid var(--line)}.s-foot button{width:100%;display:flex;align-items:center;justify-content:center;gap:8px}
.vol{padding:6px 18px 18px}.vol h3{margin:8px 0 14px;font-size:16px}.vol label{display:flex;justify-content:space-between;font-size:13px;color:#dfe1e8;margin:14px 0 8px}.vol label b{color:var(--accent)}.vol input[type=range]{width:100%;accent-color:var(--accent)}.vol input:disabled{opacity:.4}.vol .hint{margin:10px 0 0}.vol .primary{margin-top:16px}
`;
  document.head.append(css);

  // ================= details screen (after Next) =================
  const up = $('#upload');
  const h1 = up.querySelector(':scope > h1'), sub = up.querySelector(':scope > .sub');
  if (h1) h1.style.display = 'none'; if (sub) sub.style.display = 'none';
  ['.uploadbox', '.xrow', '.pv'].forEach(s => { const e = up.querySelector(s); if (e) e.style.display = 'none'; });
  const mood = $('#musicOpts').closest('.formrow'); if (mood) mood.style.display = 'none';
  const head = document.createElement('div');
  head.className = 'dhead';
  head.innerHTML = '<button type="button" id="dBack" aria-label="Back">' + ic('back') + '</button><b>New post</b><span></span>';
  up.prepend(head);
  const sum = document.createElement('div');
  sum.className = 'dsum';
  sum.innerHTML = '<video muted loop playsinline></video><img alt="Your photo"><div class="dinfo"><b id="dTitle">Your video</b><div class="dsound"></div><div class="dbtns"><button class="secondary" id="dEdit" type="button">Edit</button><button class="secondary" id="dSave" type="button">' + ic('save', 16) + 'Save</button></div></div>';
  head.after(sum);
  const dv = sum.querySelector('video');

  // ================= editor overlay =================
  const ed = document.createElement('div');
  ed.className = 'ed'; ed.id = 'ed';
  ed.innerHTML =
    '<video id="edV" playsinline loop></video><img id="edI" alt="Your photo">' +
    '<div class="ed-top"><button class="eb" id="edBack" type="button" aria-label="Back">' + ic('back') + '</button><button class="pill" id="edSnd" type="button"></button><button class="next" id="edNext" type="button">Next</button></div>' +
    '<div class="ed-bar"><button data-e="snd" type="button">' + ic('music', 26) + '<span>Sound</span></button><button data-e="vol" type="button">' + ic('volume', 26) + '<span>Volume</span></button></div>' +
    '<div class="sh" id="sndSh"><div class="grab"></div>' +
    '<div class="s-tabs"><button data-t="hot" class="on">Hot</button><button data-t="foryou">For You</button><button data-t="favs">Favorites</button><button data-t="recent">Recent</button><button class="srch" id="sSearchBtn" type="button" aria-label="Search">' + ic('search', 24) + '</button></div>' +
    '<div class="s-search" id="sSearch"><input id="sQ" maxlength="60" placeholder="Search songs or artists" enterkeyhint="search"></div>' +
    '<div class="s-opts" id="sOpts"><button data-v="" class="on">Songs</button><button data-v="instrumental">Instrumentals</button><i></i><button data-m="off">No sound</button><button data-m="chill">Chill</button><button data-m="upbeat">Upbeat</button><button data-m="inspire">Inspire</button></div>' +
    '<div class="s-now" id="sNow"><span></span><button id="sRemove" type="button">Remove</button></div>' +
    '<div class="s-list" id="sList"></div>' +
    '<div class="s-foot"><button class="secondary" id="sPhone" type="button">' + ic('music', 18) + 'From my phone</button></div></div>' +
    '<div class="sh" id="volSh"><div class="grab"></div><div class="vol"><h3>Volume</h3>' +
    '<div id="vOrig"><label><span>Original sound</span><b id="vvV">100%</b></label><input type="range" id="vV" min="0" max="100" value="100"></div>' +
    '<label><span>Music</span><b id="vmV">70%</b></label><input type="range" id="vM" min="0" max="100" value="70">' +
    '<p class="hint" id="vHint"></p><button class="primary" id="vDone" type="button">Done</button></div></div>';
  $('.app').append(ed);
  const edV = $('#edV'), edI = $('#edI'), sndSh = $('#sndSh'), volSh = $('#volSh');

  // ---------- sound state ----------
  const au = new Audio(), pa = new Audio();
  au.loop = true; pa.loop = true;
  const hasSound = () => !!(X.musicTrack || X.musicFile || musicPick !== 'off');
  function soundLabel() {
    if (X.musicTrack) return X.musicTrack.name + ' — ' + X.musicTrack.artist;
    if (X.musicFile) return X.musicFile.name.replace(/\.[^.]+$/, '');
    if (musicPick !== 'off') return 'Auto music: ' + cap(musicPick);
    return '';
  }
  function paintSound() {
    const l = soundLabel();
    const sp = document.createElement('span'); sp.textContent = l || 'Add sound';
    $('#edSnd').innerHTML = ic('music', 16); $('#edSnd').append(sp);
    const ds = sum.querySelector('.dsound'); ds.innerHTML = ic('music', 14);
    const t = document.createElement('span'); t.textContent = l || 'No sound added'; ds.append(t);
    $('#sNow').classList.toggle('on', !!l); $('#sNow span').textContent = l;
    $$('#sOpts [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === musicPick && !X.musicTrack && !X.musicFile));
    const track = !!(X.musicTrack || X.musicFile);
    $('#vM').disabled = !track;
    $('#vHint').textContent = track ? '' : (musicPick !== 'off' ? 'Volume for Auto music is fixed.' : 'Add a sound to change its volume.');
  }
  function stopSound() { au.pause(); if (typeof Music !== 'undefined') Music.stop(); }
  function playRaw(restart) {
    if (X.musicTrack || X.musicFile) {
      const key = X.musicTrack ? X.musicTrack.id : X.musicFile.name + X.musicFile.size;
      if (key !== fileKey) { fileKey = key; au.src = X.musicTrack ? X.musicTrack.url : URL.createObjectURL(X.musicFile); restart = true; }
      au.volume = X.mVol; if (restart) { try { au.currentTime = 0; } catch (e) {} } au.play().catch(() => {});
    } else if (musicPick !== 'off') Music.start(musicPick, 'ed' + Date.now());
  }
  function startSound() {
    stopSound();
    if (sndOnly || !ed.classList.contains('show') || (!isPhoto && edV.paused) || sheetOpen()) return;
    playRaw(true);
  }
  // used by the camera: play the chosen song while recording
  X.hasSound = hasSound;
  X.soundLabel = soundLabel;
  X.playSound = restart => playRaw(!!restart);
  X.pauseSound = () => { au.pause(); if (typeof Music !== 'undefined') Music.stop(); };
  X.stopSound = stopSound;
  function setSound(kind, track) {
    X.musicTrack = null;
    if (kind === 'track') { const off = $('#musicOpts [data-m="off"]'); if (off) off.click(); X.musicTrack = track; }
    else if (kind === 'off') { const off = $('#musicOpts [data-m="off"]'); if (off) off.click(); }
    paintSound(); startSound();
  }
  X.mFile.addEventListener('change', () => { if (X.mFile.files[0] && X.musicFile) { X.musicTrack = null; fileKey = null; paintSound(); if (sndOnly) { closeSheets(); toast('Sound added'); } else startSound(); } });

  edV.addEventListener('play', startSound);
  edV.addEventListener('pause', stopSound);
  edV.addEventListener('timeupdate', () => { if (edV.currentTime < .25 && au.currentTime > 1) au.currentTime = 0; });
  ed.addEventListener('click', e => { if (sndOnly && e.target === ed) closeSheets(); });
  edI.addEventListener('click', () => { if (sheetOpen()) closeSheets(); });
  edV.addEventListener('click', () => { if (sheetOpen()) { closeSheets(); return; } if (edV.muted) edV.muted = false; edV.paused ? edV.play().catch(() => {}) : edV.pause(); });

  // ---------- sheets ----------
  const sheetOpen = () => sndSh.classList.contains('show') || volSh.classList.contains('show');
  function stopPreview() { pa.pause(); selId = null; }
  function closeSheets() {
    stopPreview(); sndSh.classList.remove('show'); volSh.classList.remove('show');
    if (sndOnly) { endSndOnly(); return; }
    edV.volume = X.vVol;
    if (ed.classList.contains('show') && !isPhoto && edV.paused) edV.play().catch(() => {}); else startSound();
  }
  function openSheet(sh) {
    closeSheets0(); stopSound(); sh.classList.add('show');
    if (sh === sndSh) loadList();
  }
  function closeSheets0() { stopPreview(); sndSh.classList.remove('show'); volSh.classList.remove('show'); }
  $$('.ed-bar button').forEach(b => b.onclick = () => openSheet(b.dataset.e === 'snd' ? sndSh : volSh));
  $('#edSnd').onclick = () => openSheet(sndSh);
  $('#vDone').onclick = closeSheets;

  // ---------- volume ----------
  $('#vV').oninput = e => { X.vVol = e.target.value / 100; edV.volume = X.vVol; $('#vvV').textContent = e.target.value + '%'; };
  $('#vM').oninput = e => { X.mVol = e.target.value / 100; au.volume = X.mVol; $('#vmV').textContent = e.target.value + '%'; };

  // ---------- sound library ----------
  const isFav = id => lsGet(FAV).some(t => t.id === id);
  function toggleFav(t) { let f = lsGet(FAV); f = f.some(x => x.id === t.id) ? f.filter(x => x.id !== t.id) : [t, ...f].slice(0, 60); lsSet(FAV, f); }
  function addRecent(t) { lsSet(REC, [t, ...lsGet(REC).filter(x => x.id !== t.id)].slice(0, 30)); }
  async function fetchTracks() {
    const p = { client_id: JAMENDO_CLIENT_ID, format: 'json', limit: 30, imagesize: 200, audioformat: 'mp31' };
    if (q) { p.search = q; } else if (tab === 'hot') { p.order = 'popularity_week'; } else { p.order = 'popularity_month'; p.offset = Math.floor(Math.random() * 80); }
    if (inst) p.vocalinstrumental = inst;
    const u = new URL('https://api.jamendo.com/v3.0/tracks/');
    Object.keys(p).forEach(k => u.searchParams.set(k, p[k]));
    const r = await fetch(u), j = await r.json();
    if (j.headers && j.headers.status === 'failed') throw new Error(j.headers.error_message || 'failed');
    return (j.results || []).filter(t => t.audio).map(t => ({ id: 'j' + t.id, name: t.name, artist: t.artist_name, dur: t.duration, img: t.image || t.album_image || '', url: t.audio, link: t.shareurl || '' }));
  }
  function msg(text, retry) {
    const L = $('#sList'); L.innerHTML = '';
    const d = document.createElement('div'); d.className = 's-msg'; d.textContent = text;
    if (retry) { const b = document.createElement('button'); b.className = 'secondary'; b.textContent = 'Try again'; b.onclick = loadList; d.append(document.createElement('br'), b); }
    L.append(d);
  }
  function renderList(list) {
    const L = $('#sList'); L.innerHTML = '';
    if (!list.length) { msg(tab === 'favs' ? 'No favorites yet. Tap the bookmark on a song to save it.' : tab === 'recent' ? 'Songs you use will show up here.' : 'No songs found.'); return; }
    list.forEach(t => {
      const d = document.createElement('div'); d.className = 'trk' + (t.id === selId ? ' sel' : '');
      const art = document.createElement('div'); art.className = 'art';
      if (t.img && /^https:\/\//.test(t.img)) { const im = document.createElement('img'); im.src = t.img; im.alt = ''; im.loading = 'lazy'; art.append(im); }
      const tx = document.createElement('div'); tx.className = 'tx';
      const b = document.createElement('b');
      if (t.id === selId) { const e = document.createElement('span'); e.className = 'eq'; e.innerHTML = '<i></i><i></i><i></i>'; b.append(e); }
      b.append(document.createTextNode(t.name));
      const sm = document.createElement('small'); sm.textContent = t.artist + ' · ' + fmt(t.dur);
      tx.append(b, sm);
      if (t.id === selId) { const u = document.createElement('button'); u.type = 'button'; u.className = 'use'; u.textContent = 'Use this sound'; u.onclick = e => { e.stopPropagation(); chooseTrack(t); }; tx.append(u); }
      const bm = document.createElement('button'); bm.type = 'button'; bm.className = 'bm' + (isFav(t.id) ? ' on' : ''); bm.setAttribute('aria-label', 'Favorite'); bm.innerHTML = ic(isFav(t.id) ? 'bookmarkFill' : 'bookmark', 22);
      bm.onclick = e => { e.stopPropagation(); toggleFav(t); if (tab === 'favs') loadList(); else { bm.classList.toggle('on'); bm.innerHTML = ic(isFav(t.id) ? 'bookmarkFill' : 'bookmark', 22); } };
      d.append(art, tx, bm);
      d.onclick = () => selectTrack(t, list);
      L.append(d);
    });
  }
  let curList = [];
  function selectTrack(t, list) {
    if (selId === t.id) { stopPreview(); renderList(list); return; }
    selId = t.id; pa.src = t.url; pa.volume = .9; pa.play().catch(() => toast('Could not play this song')); renderList(list);
  }
  function chooseTrack(t) {
    addRecent(t); setSound('track', t); fileKey = null; closeSheets(); toast('Sound added');
  }
  async function loadList() {
    const tok = ++loadTok; stopPreview();
    $('#sOpts').style.display = (tab === 'favs' || tab === 'recent') ? 'none' : 'flex';
    if (tab === 'favs' || tab === 'recent') { curList = lsGet(tab === 'favs' ? FAV : REC); renderList(curList); return; }
    if (!hasKey()) { msg('The music library is not connected yet. You can still use Auto music or a song from your phone.'); return; }
    msg('Loading songs...');
    try { const list = await fetchTracks(); if (tok !== loadTok) return; curList = list; renderList(list); }
    catch (e) { if (tok !== loadTok) return; msg('Could not load songs. Check your connection.', true); }
  }
  $$('.s-tabs [data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; q = ''; $('#sQ').value = ''; $$('.s-tabs [data-t]').forEach(x => x.classList.toggle('on', x === b)); loadList(); });
  $('#sSearchBtn').onclick = () => { const on = $('#sSearch').classList.toggle('on'); if (on) { $('#sQ').focus(); if (tab === 'favs' || tab === 'recent') { tab = 'hot'; $$('.s-tabs [data-t]').forEach(x => x.classList.toggle('on', x.dataset.t === 'hot')); loadList(); } } else { q = ''; $('#sQ').value = ''; loadList(); } };
  let qT; $('#sQ').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { q = e.target.value.trim(); loadList(); }, 450); });
  $$('#sOpts [data-v]').forEach(b => b.onclick = () => { inst = b.dataset.v; $$('#sOpts [data-v]').forEach(x => x.classList.toggle('on', x === b)); loadList(); });
  $$('#sOpts [data-m]').forEach(b => b.onclick = () => {
    X.musicTrack = null; const real = $('#musicOpts [data-m="' + b.dataset.m + '"]'); if (real) real.click(); X.musicTrack = null;
    paintSound(); if (b.dataset.m !== 'off') { closeSheets(); toast('Auto music: ' + cap(b.dataset.m)); } else startSound();
  });
  $('#sRemove').onclick = () => { setSound('off'); X.clearFile && X.clearFile(); fileKey = null; paintSound(); toast('Sound removed'); };
  $('#sPhone').onclick = () => X.mFile.click();

  // ---------- sound picker on its own (camera / gallery, before there is a video) ----------
  function endSndOnly() {
    sndOnly = false; stopPreview(); ed.classList.remove('snd-only', 'show'); sndSh.classList.remove('show');
    const cb = sndCb; sndCb = null; if (cb) cb();
  }
  X.pickSound = function (cb) {
    sndOnly = true; sndCb = cb || null; isPhoto = false;
    ed.classList.remove('photo'); ed.classList.add('show', 'snd-only'); paintSound(); openSheet(sndSh);
  };

  // ---------- navigation ----------
  const isImg = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name || '');
  X.openEditor = function (file, src) {
    curFile = file; source = src || 'studio'; isPhoto = isImg(file); sndOnly = false;
    X.media = { file: file, kind: isPhoto ? 'photo' : 'video' };
    if (vUrl) URL.revokeObjectURL(vUrl);
    vUrl = URL.createObjectURL(file);
    ed.classList.toggle('photo', isPhoto); sum.classList.toggle('photo', isPhoto);
    $('#dTitle').textContent = isPhoto ? 'Your photo' : 'Your video';
    $('#vOrig').style.display = isPhoto ? 'none' : '';
    if (isPhoto) { edV.pause(); edV.removeAttribute('src'); edI.src = vUrl; }
    else { edI.removeAttribute('src'); edV.src = vUrl; }
    edV.muted = false; edV.volume = X.vVol;
    $('#vV').value = Math.round(X.vVol * 100); $('#vvV').textContent = Math.round(X.vVol * 100) + '%';
    $('#vM').value = Math.round(X.mVol * 100); $('#vmV').textContent = Math.round(X.mVol * 100) + '%';
    closeSheets0(); ed.classList.add('show'); paintSound();
    if (isPhoto) { startSound(); return; }
    edV.play().catch(() => { edV.muted = true; edV.play().catch(() => {}); toast('Tap the video to hear sound'); });
  };
  function closeEditor() { closeSheets0(); stopSound(); edV.pause(); ed.classList.remove('show'); }
  $('#edBack').onclick = () => {
    if (sheetOpen()) { closeSheets(); return; }
    if ((source === 'cam' || source === 'campho') && !confirm(isPhoto ? 'Discard this photo?' : 'Discard this recording?')) return;
    closeEditor(); input.value = ''; curFile = null;
    if (X.reset) X.reset();
    if (source === 'cam') X.openCam('video'); else if (source === 'campho') X.openCam('photo'); else X.openStudio();
  };
  $('#edNext').onclick = () => {
    closeEditor();
    if (vUrl) { if (isPhoto) { dv.removeAttribute('src'); sum.querySelector('img').src = vUrl; } else { dv.src = vUrl; dv.play().catch(() => {}); } }
    paintSound(); navigate('upload'); up.scrollTop = 0;
  };
  const backToEditor = () => { if (curFile) X.openEditor(curFile, source); else X.openStudio(); };
  $('#dBack').onclick = backToEditor; $('#dEdit').onclick = backToEditor;
  $('#dSave').onclick = () => {
    if (!curFile) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(curFile); a.download = curFile.name || (isPhoto ? 'cin-photo-' + Date.now() + '.jpg' : 'cin-video-' + Date.now() + '.mp4');
    document.body.append(a); a.click(); a.remove(); toast(isPhoto ? 'Photo saved to your phone' : 'Video saved to your phone');
  };

  // after posting: clear everything
  const r0 = X.reset;
  X.reset = () => {
    if (r0) r0();
    X.musicTrack = null; X.vVol = 1; X.mVol = .7; curFile = null; fileKey = null; X.media = null; isPhoto = false; sum.classList.remove('photo'); ed.classList.remove('photo');
    dv.removeAttribute('src'); stopSound(); paintSound();
  };
  paintSound();
})();
