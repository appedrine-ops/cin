// CIN extras: video preview before publishing, music from your phone, in-app camera (video + photo).
(function () {
  const X = window.CINX = { musicFile: null };
  const css = document.createElement('style');
  css.textContent = `
.xrow{display:flex;gap:10px;margin:14px 0}.xrow button{flex:1}
.pv{margin:14px 0}.pv video{width:100%;max-height:46vh;border-radius:16px;background:#000;display:block}.pv .secondary{width:100%;margin-top:8px}
.mrow{margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mname{font-size:12px;color:var(--accent);font-weight:700}
.cam{position:absolute;inset:0;z-index:40;background:#000;display:none}.cam.show{display:block}
.cam>video{width:100%;height:100%;object-fit:cover}.cam>video.mirror{transform:scaleX(-1)}
.cam-top{position:absolute;top:14px;left:12px;right:12px;display:flex;justify-content:space-between;z-index:2}
.cam-top button{width:44px;height:44px;border-radius:50%;background:#0008;color:#fff;font-size:20px}
.cam-mode{position:absolute;bottom:128px;left:0;right:0;display:flex;justify-content:center;gap:22px;z-index:2}
.cam-mode button{background:none;color:#ffffffb3;font-weight:800;font-size:15px;padding:6px 4px;border-bottom:2px solid transparent}.cam-mode button.on{color:#fff;border-color:#fff}
.cam-bar{position:absolute;bottom:34px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:2}
#camT{color:#fff;font-weight:800;font-size:13px;height:16px;text-shadow:0 1px 6px #000}
#camShot{width:76px;height:76px;border-radius:50%;background:#ff2d55;border:5px solid #fff;transition:.15s}#camShot.photo{background:#fff;border-color:#ffffff99}#camShot.rec{border-radius:20px;width:60px;height:60px}
.cam-res{position:absolute;inset:0;z-index:3;background:#000e;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px}.cam-res.show{display:flex}
.cam-res img{max-width:100%;max-height:58vh;border-radius:16px}.cam-res button{width:100%;max-width:320px}`;
  document.head.append(css);

  const input = $('#videoFile'), box = $('#upload .uploadbox');

  // ---------- Camera buttons + preview ----------
  const row = document.createElement('div');
  row.className = 'xrow';
  row.innerHTML = '<button class="secondary" id="xRec">🎥 Record video</button><button class="secondary" id="xPhoto">📷 Take photo</button>';
  box.after(row);
  const pv = document.createElement('div');
  pv.className = 'pv'; pv.style.display = 'none';
  pv.innerHTML = '<video playsinline controls loop></video><button class="secondary" type="button">Remove video</button>';
  row.after(pv);
  const pvVideo = pv.querySelector('video');
  let pvUrl = null;
  const au = new Audio(); au.loop = true; au.volume = .7;

  function playMusicWithVideo() {
    if (X.musicFile) { try { au.currentTime = pvVideo.currentTime; } catch (e) {} au.play().catch(() => {}); }
    else if (musicPick !== 'off') Music.start(musicPick, 'pv' + Date.now());
  }
  function stopMusic() { au.pause(); Music.stop(); }
  pvVideo.addEventListener('play', playMusicWithVideo);
  pvVideo.addEventListener('pause', stopMusic);
  pvVideo.addEventListener('timeupdate', () => { if (X.musicFile && pvVideo.currentTime < .3 && au.currentTime > 1) au.currentTime = 0; });

  function showPreview(f) {
    stopMusic();
    if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; }
    if (!f) { pv.style.display = 'none'; pvVideo.removeAttribute('src'); return; }
    pvUrl = URL.createObjectURL(f);
    pvVideo.src = pvUrl; pv.style.display = 'block';
    setTimeout(() => pv.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    pvVideo.muted = false;
    pvVideo.play().catch(() => { pvVideo.muted = true; pvVideo.play().catch(() => {}); });
  }
  input.addEventListener('change', () => setTimeout(() => showPreview(input.files[0]), 0));
  pv.querySelector('button').onclick = () => { input.value = ''; showPreview(null); };

  // ---------- Music from phone ----------
  const mBox = $('#musicPreview').parentElement;
  const mrow = document.createElement('div');
  mrow.className = 'mrow';
  mrow.innerHTML = '<button class="secondary" type="button" id="xMusicPick">♪ Choose music from your phone</button><span class="mname" id="xMusicName"></span><input type="file" id="xMusicFile" accept="audio/*" hidden>';
  mBox.append(mrow);
  const mFile = $('#xMusicFile'), mName = $('#xMusicName');
  $('#xMusicPick').onclick = () => mFile.click();
  mFile.addEventListener('change', () => {
    const f = mFile.files[0]; if (!f) return;
    if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(f.name)) { toast('Please choose an audio file'); mFile.value = ''; return; }
    if (f.size > 15 * 1024 * 1024) { toast('Choose music under 15 MB'); mFile.value = ''; return; }
    X.musicFile = f; au.src = URL.createObjectURL(f);
    musicPick = 'off'; paintMusic(); setPreview(false);
    mName.textContent = '♫ ' + f.name.replace(/\.[^.]+$/, '').slice(0, 28) + ' ✕'; mName.style.cursor = 'pointer';
    if (!pvVideo.paused) playMusicWithVideo();
    toast('Your music is added');
  });
  function clearMusicFile() { X.musicFile = null; au.pause(); au.removeAttribute('src'); mFile.value = ''; mName.textContent = ''; }
  mName.onclick = () => { clearMusicFile(); toast('Music removed'); };
  $$('#musicOpts [data-m]').forEach(b => b.addEventListener('click', () => {
    clearMusicFile();
    if (pv.style.display !== 'none' && !pvVideo.paused) { Music.stop(); if (musicPick !== 'off') Music.start(musicPick, 'pv' + Date.now()); }
  }));
  X.reset = () => { clearMusicFile(); showPreview(null); };

  // ---------- Camera ----------
  const cam = document.createElement('div');
  cam.className = 'cam';
  cam.innerHTML = '<video id="camV" playsinline muted autoplay></video><div class="cam-top"><button id="camClose" aria-label="Close">✕</button><button id="camSound" class="pill" type="button">♪ Add sound</button><span style="width:44px"></span></div><div class="cam-side"><button id="camFlip" aria-label="Flip camera">⟲</button><button id="camFlash" aria-label="Flash">⚡</button><button id="camTimer" aria-label="Timer">⏱</button></div><div class="cam-count" id="camCount"></div><div class="cam-mode"><button data-cm="60" class="on">60s</button><button data-cm="15">15s</button><button data-cm="photo">PHOTO</button></div><div class="cam-bar"><span id="camT"></span><button id="camShot" aria-label="Capture"></button></div><div class="cam-res" id="camRes"><img alt="Your photo"><button class="primary" id="camAvatar">Use as profile photo</button><button class="secondary" id="camSave">Save to phone</button><button class="secondary" id="camRetake">Retake</button></div>';
  $('.app').append(cam);
  const camV = $('#camV'), shot = $('#camShot'), timerEl = $('#camT');
  let stream = null, facing = 'user', mode = 'video', rec = null, chunks = [], tick = null, secs = 0, photoBlob = null;
  let MAXS = 60, torchOn = false, delay = 0, cd = null;

  async function startStream() {
    stopStream();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: mode === 'video' });
      camV.srcObject = stream; camV.classList.toggle('mirror', facing === 'user'); torchOn = false; $('#camFlash').classList.remove('on');
    } catch (e) { closeCam(); toast('Allow camera and microphone access in your browser'); }
  }
  function stopStream() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
  function setMode(m) {
    if (rec) return;
    const k = m === 'video' ? '60' : m;
    mode = k === 'photo' ? 'photo' : 'video'; if (mode === 'video') MAXS = +k;
    $$('.cam-mode button').forEach(b => b.classList.toggle('on', b.dataset.cm === k));
    shot.className = mode === 'photo' ? 'photo' : ''; timerEl.textContent = '';
    startStream();
  }
  function paintSound() { $('#camSound').textContent = X.musicFile ? '♫ ' + X.musicFile.name.replace(/\.[^.]+$/, '').slice(0, 18) : '♪ Add sound'; }
  function countdown(n, go) {
    const el = $('#camCount'); el.style.display = 'flex'; el.textContent = n;
    cd = setInterval(() => { n--; if (n <= 0) { clearInterval(cd); cd = null; el.style.display = 'none'; go(); } else el.textContent = n; }, 1000);
  }
  function openCam(m) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined' && m === 'video') {
      const f = document.createElement('input'); f.type = 'file'; f.accept = m === 'video' ? 'video/*' : 'image/*'; f.setAttribute('capture', 'environment');
      f.onchange = () => { const x = f.files[0]; if (!x) return; if (m === 'video') useVideo(x); else usePhoto(x); };
      f.click(); return;
    }
    cam.classList.add('show'); $('#camRes').classList.remove('show'); paintSound(); setMode(m);
  }
  function closeCam() {
    if (rec) { try { rec.onstop = null; rec.stop(); } catch (e) {} rec = null; }
    clearInterval(tick); if (cd) { clearInterval(cd); cd = null; $('#camCount').style.display = 'none'; } stopStream(); cam.classList.remove('show'); shot.classList.remove('rec'); timerEl.textContent = '';
  }
  function useVideo(file) {
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    if (X.closeStudio) X.closeStudio();
    navigate('upload'); showPreview(file); toast('Video ready. Add a caption and publish.');
  }
  function usePhoto(blob) {
    photoBlob = blob; $('#camRes img').src = URL.createObjectURL(blob); $('#camRes').classList.add('show');
    cam.classList.add('show');
  }
  function stopRec() { if (rec && rec.state !== 'inactive') rec.stop(); }
  function startRec() {
    chunks = []; secs = 0;
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mt = types.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    try { rec = new MediaRecorder(stream, mt ? { mimeType: mt, videoBitsPerSecond: 2500000 } : undefined); } catch (e) { toast('Recording is not supported here'); return; }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearInterval(tick); shot.classList.remove('rec');
      const type = (rec && rec.mimeType) || mt || 'video/webm', ext = /mp4/.test(type) ? 'mp4' : 'webm';
      const file = new File(chunks, 'cin-' + Date.now() + '.' + ext, { type: type.split(';')[0] });
      rec = null; closeCam();
      if (file.size > 100 * 1024 * 1024) { toast('That recording is too big (100 MB max)'); return; }
      useVideo(file);
    };
    rec.start(1000); shot.classList.add('rec');
    tick = setInterval(() => { secs++; timerEl.textContent = '● ' + String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0'); if (secs >= MAXS) stopRec(); }, 1000);
  }
  function takePhoto() {
    const c = document.createElement('canvas'); c.width = camV.videoWidth || 720; c.height = camV.videoHeight || 1280;
    const g = c.getContext('2d');
    if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(camV, 0, 0, c.width, c.height);
    c.toBlob(b => { if (b) { stopStream(); usePhoto(b); } }, 'image/jpeg', .9);
  }
  shot.onclick = () => {
    if (cd) { clearInterval(cd); cd = null; $('#camCount').style.display = 'none'; return; }
    const run = () => mode === 'video' ? (rec ? stopRec() : startRec()) : takePhoto();
    if (delay && !rec) countdown(delay, run); else run();
  };
  $('#camFlash').onclick = () => {
    const t = stream && stream.getVideoTracks()[0];
    if (!t || !t.applyConstraints) { toast('Flash is not available here'); return; }
    t.applyConstraints({ advanced: [{ torch: !torchOn }] }).then(() => { torchOn = !torchOn; $('#camFlash').classList.toggle('on', torchOn); }).catch(() => toast('Flash works on the back camera only'));
  };
  $('#camTimer').onclick = () => { delay = delay === 0 ? 3 : delay === 3 ? 10 : 0; const b = $('#camTimer'); b.classList.toggle('on', !!delay); b.textContent = delay ? delay + 's' : '⏱'; toast(delay ? 'Timer: ' + delay + ' seconds' : 'Timer off'); };
  $('#camSound').onclick = () => { if (rec) return; mFile.click(); };
  mFile.addEventListener('change', paintSound);
  $('#camClose').onclick = closeCam;
  $('#camFlip').onclick = () => { if (rec) return; facing = facing === 'user' ? 'environment' : 'user'; startStream(); };
  $$('.cam-mode button').forEach(b => b.onclick = () => setMode(b.dataset.cm));
  $('#camRetake').onclick = () => { $('#camRes').classList.remove('show'); startStream(); };
  $('#camSave').onclick = () => {
    if (!photoBlob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(photoBlob); a.download = 'cin-photo-' + Date.now() + '.jpg';
    document.body.append(a); a.click(); a.remove(); toast('Photo saved to your phone');
  };
  X.paintAvatar = url => { const p = $('#profileInitial'); p.textContent = ''; p.style.background = 'url("' + String(url).replace(/"/g, '') + '") center/cover'; };
  $('#camAvatar').onclick = async () => {
    if (!state.account) { closeCam(); gate(null); return; }
    if (!window.CIN || !CIN.configured) { toast('Profile photos need the cloud backend'); return; }
    const btn = $('#camAvatar'); btn.disabled = true; btn.textContent = 'Uploading...';
    try { const url = await CIN.setAvatar(new File([photoBlob], 'avatar.jpg', { type: 'image/jpeg' })); X.paintAvatar(url); closeCam(); navigate('profile'); toast('Profile photo updated'); }
    catch (e) { toast('Could not upload photo'); }
    finally { btn.disabled = false; btn.textContent = 'Use as profile photo'; }
  };
  $('#xRec').onclick = () => openCam('video');
  $('#xPhoto').onclick = () => openCam('photo');

  // ============ Studio: the full-screen Create hub opened by the + button ============
  const sc = document.createElement('style');
  sc.textContent = `
.cam-top{align-items:center}.cam-top .pill{width:auto;height:40px;border-radius:22px;padding:0 16px;font-size:14px;font-weight:800;max-width:60%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cam-side{position:absolute;right:12px;top:74px;z-index:2;display:flex;flex-direction:column;gap:12px}.cam-side button{width:44px;height:44px;border-radius:50%;background:#0008;color:#fff;font-size:19px;font-weight:800}.cam-side button.on{background:var(--accent);color:#10140b}
.cam-count{position:absolute;inset:0;z-index:2;display:none;align-items:center;justify-content:center;font-size:120px;font-weight:900;color:#fff;text-shadow:0 4px 30px #000;pointer-events:none}
.toast{z-index:60}
.studio{position:absolute;inset:0;z-index:25;background:#050609;display:none;flex-direction:column}.studio.show{display:flex}
.st-x{position:absolute;top:14px;left:14px;z-index:3;width:42px;height:42px;border-radius:50%;background:#ffffff14;font-size:20px;color:#fff}
.st-pane{display:none;flex:1;overflow:auto;padding:14px 14px 10px}.st-pane.show{display:block}
.st-pane h2{margin:0 0 8px;font-size:21px;line-height:42px;text-align:center;letter-spacing:1px}
.st-sub{text-align:center;color:var(--muted);font-size:12px;margin-bottom:12px}
.st-seg{display:flex;gap:8px;margin-bottom:10px}.st-seg button{background:#161922;color:#c5c8d3;border-radius:20px;padding:7px 16px;font-size:13px;font-weight:700}.st-seg button.on{background:#fff;color:#000}
.st-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
.st-tile{position:relative;aspect-ratio:3/4;background:#161922;overflow:hidden;padding:0;border-radius:4px;color:#fff;display:block}.st-tile img,.st-tile video{width:100%;height:100%;object-fit:cover;display:block}.st-tile.on{outline:3px solid var(--accent);outline-offset:-3px}.st-tile i{position:absolute;left:6px;bottom:5px;font-size:11px;font-style:normal;text-shadow:0 1px 4px #000}
.st-tile.st-b{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:800}.st-tile.st-b span{font-size:30px}
.st-hint{color:var(--muted);font-size:12px;line-height:1.5;margin:12px 2px}
.st-act{display:none;position:sticky;bottom:0;padding-top:12px;background:linear-gradient(transparent,#050609 28%)}.st-act.show{display:block}.st-act .primary{margin:0 0 8px}
.st-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 4px}.st-tools button{background:#161922;border-radius:16px;padding:14px 2px;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#fff}.st-tools span{font-size:24px;line-height:1}
.st-new{width:100%;margin:14px 0;padding:26px;border-radius:20px;background:linear-gradient(135deg,#f6ffe9,#e4fbff);color:#10140b;font-weight:900;font-size:18px;display:flex;align-items:center;justify-content:center;gap:10px}.st-new b{width:30px;height:30px;border-radius:50%;background:#10140b;color:#fff;display:grid;place-items:center;font-size:20px}
.st-pane h3{font-size:14px;margin:18px 0 10px;color:#dfe1e8}
.st-live{text-align:center;padding-top:30px}.st-live .ico{font-size:54px}.st-live p{color:var(--muted);font-size:13px;line-height:1.5;margin:6px 10px 18px}.st-live input{width:100%;background:#161922;border:1px solid var(--line);border-radius:14px;padding:14px;color:#fff;outline:0}.st-golive{background:#ff2d55;color:#fff;font-weight:900;border-radius:30px;width:100%;padding:15px;font-size:16px;margin-top:14px}
.st-tabs{display:flex;justify-content:center;gap:34px;padding:14px 0 calc(14px + env(safe-area-inset-bottom));background:#000}.st-tabs button{background:none;color:#868b99;font-weight:800;letter-spacing:1px;font-size:15px;padding:2px 2px 5px;border-bottom:2px solid transparent}.st-tabs button.on{color:#fff;border-color:var(--accent)}
.st-text{position:absolute;inset:0;z-index:4;background:#08090d;display:none;overflow:auto;padding:14px}.st-text.show{display:block}
.st-thead{display:flex;align-items:center;justify-content:space-between;height:42px}.st-thead button{width:42px;height:42px;border-radius:50%;background:#ffffff14;color:#fff;font-size:20px}.st-thead span{width:42px}
#stCanvas{display:block;width:100%;max-width:280px;aspect-ratio:4/5;margin:12px auto;border-radius:16px}
.st-text textarea{width:100%;min-height:76px;background:#161922;border:1px solid var(--line);border-radius:12px;padding:12px;color:#fff;outline:0;resize:none}
.st-sw{display:flex;gap:10px;margin:12px 0}.st-sw button{width:34px;height:34px;border-radius:50%;border:2px solid transparent}.st-sw button.on{border-color:#fff}
`;
  document.head.append(sc);

  const st = document.createElement('div');
  st.className = 'studio'; st.id = 'studio';
  st.innerHTML = `
<button class="st-x" id="stX" aria-label="Close">✕</button>
<div class="st-pane show" id="stPost"><h2>New post</h2>
  <div class="st-seg" id="stSeg"><button class="on" data-f="all">All</button><button data-f="video">Videos</button><button data-f="photo">Photos</button></div>
  <div class="st-grid" id="stGrid"></div>
  <p class="st-hint">A website cannot browse your whole gallery, so tap <b>Gallery</b> and choose the videos or photos you want. They then show up here.</p>
  <div class="st-act" id="stAct"></div></div>
<div class="st-pane" id="stCreate"><h2>CREATE</h2>
  <div class="st-tools"><button data-t="rec"><span>🎥</span>Record</button><button data-t="photo"><span>📷</span>Photo</button><button data-t="text"><span>Aa</span>Text image</button><button data-t="sound"><span>♪</span>Add sound</button></div>
  <button class="st-new" id="stNew"><b>+</b> New video</button>
  <h3>Auto music</h3><div class="opts" id="stMood"><button data-m="off">Off</button><button data-m="chill">Chill</button><button data-m="upbeat">Upbeat</button><button data-m="inspire">Inspire</button></div>
  <p class="st-hint">Each video gets its own tune. Pick a mood, or add your own song with <b>Add sound</b>, then record or choose a video.</p></div>
<div class="st-pane" id="stLive"><div class="st-live"><div class="ico">📡</div><h2>Go LIVE</h2><p>Live streaming is coming soon. It needs a streaming service connected to CIN, so it is not switched on yet.</p><input id="stLiveTitle" maxlength="60" placeholder="Add a title"><button class="st-golive" id="stGoLive">Go LIVE</button></div></div>
<div class="st-tabs"><button data-st="post" class="on">POST</button><button data-st="create">CREATE</button><button data-st="live">LIVE</button></div>
<div class="st-text" id="stText"><div class="st-thead"><button id="stTBack" aria-label="Back">←</button><b>Text image</b><span></span></div>
  <canvas id="stCanvas" width="1080" height="1350"></canvas>
  <textarea id="stTxt" maxlength="220" placeholder="Type your words..."></textarea>
  <div class="st-sw" id="stSw"></div>
  <div class="opts" id="stSize"><button data-s="S">Small</button><button data-s="M" class="on">Medium</button><button data-s="L">Large</button></div>
  <div class="row"><button class="secondary" id="stTSave">Save to phone</button><button class="primary" id="stTAvatar">Use as profile photo</button></div></div>
<input type="file" id="stGallery" accept="video/*,image/*" multiple hidden>`;
  $('.app').append(st);

  let items = [], sel = -1, filter = 'all';
  const gal = $('#stGallery');
  async function shrink(blob, max) {
    const bm = await createImageBitmap(blob), r = Math.min(1, (max || 1080) / Math.max(bm.width, bm.height));
    const c = document.createElement('canvas'); c.width = Math.round(bm.width * r); c.height = Math.round(bm.height * r);
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', .85));
  }
  async function avatarFrom(blob, btn) {
    if (!window.CIN || !CIN.configured) { toast('Profile photos need the cloud backend'); return; }
    const label = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }
    try {
      const small = await shrink(blob, 600);
      const url = await CIN.setAvatar(new File([small], 'avatar.jpg', { type: 'image/jpeg' }));
      X.paintAvatar(url); closeStudio(); navigate('profile'); toast('Profile photo updated');
    } catch (e) { toast('Could not upload photo'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }
  function renderGrid() {
    const g = $('#stGrid'); g.innerHTML = '';
    const mk = (icon, label, fn) => { const b = document.createElement('button'); b.className = 'st-tile st-b'; b.innerHTML = '<span></span>'; b.firstChild.textContent = icon; b.append(label); b.onclick = fn; return b; };
    g.append(mk('📷', 'Camera', () => X.openCam('video')), mk('🖼', 'Gallery', () => gal.click()));
    items.forEach((it, i) => {
      if (filter !== 'all' && it.kind !== filter) return;
      const t = document.createElement('button'); t.className = 'st-tile' + (i === sel ? ' on' : '');
      const m = document.createElement(it.kind === 'video' ? 'video' : 'img');
      if (it.kind === 'video') { m.muted = true; m.preload = 'metadata'; m.setAttribute('playsinline', ''); m.src = it.url + '#t=0.1'; } else m.src = it.url;
      t.append(m);
      if (it.kind === 'video') { const d = document.createElement('i'); d.textContent = '▶'; t.append(d); }
      t.onclick = () => { sel = i; renderGrid(); renderAct(); };
      g.append(t);
    });
  }
  function renderAct() {
    const a = $('#stAct'); a.innerHTML = ''; a.classList.toggle('show', sel >= 0);
    if (sel < 0) return;
    const it = items[sel], b = document.createElement('button'); b.className = 'primary';
    if (it.kind === 'video') {
      b.textContent = 'Next';
      b.onclick = () => {
        if (it.file.size > 100 * 1024 * 1024) { toast('Choose a video under 100 MB'); return; }
        const dt = new DataTransfer(); dt.items.add(it.file); input.files = dt.files;
        closeStudio(); navigate('upload'); showPreview(it.file);
      };
    } else { b.textContent = 'Use as profile photo'; b.onclick = () => avatarFrom(it.file, b); }
    a.append(b);
  }
  gal.addEventListener('change', e => {
    const fs = [...e.target.files]; if (!fs.length) return;
    items.forEach(i => URL.revokeObjectURL(i.url));
    items = fs.map(f => ({ file: f, url: URL.createObjectURL(f), kind: /^video\//.test(f.type) || /\.(mp4|webm|mov|3gp|mkv)$/i.test(f.name) ? 'video' : 'photo' }));
    sel = items.length === 1 ? 0 : -1; filter = 'all';
    $$('#stSeg button').forEach(b => b.classList.toggle('on', b.dataset.f === 'all'));
    renderGrid(); renderAct(); e.target.value = '';
  });
  $$('#stSeg button').forEach(b => b.onclick = () => { filter = b.dataset.f; $$('#stSeg button').forEach(x => x.classList.toggle('on', x === b)); renderGrid(); });

  function paintMood() { $$('#stMood [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === musicPick)); }
  $$('#stMood [data-m]').forEach(b => b.onclick = () => { const real = $('#musicOpts [data-m="' + b.dataset.m + '"]'); if (real) real.click(); paintMood(); });
  $$('.st-tools button').forEach(b => b.onclick = () => {
    const t = b.dataset.t;
    if (t === 'rec') X.openCam('video'); else if (t === 'photo') X.openCam('photo');
    else if (t === 'text') { $('#stText').classList.add('show'); drawText(); }
    else if (t === 'sound') mFile.click();
  });
  $('#stNew').onclick = () => X.openCam('video');
  mFile.addEventListener('change', () => { if (st.classList.contains('show') && mFile.files[0]) { setTab('post'); toast('Music added. Now pick or record a video.'); } });
  $('#stGoLive').onclick = () => toast('LIVE is coming soon');

  // text-to-image maker
  const BG = [['#1b1034', '#7d69ff', '#ffffff'], ['#ff4f91', '#ffd36b', '#1a0f12'], ['#18c8c0', '#b8ff4a', '#0b1a0f'], ['#0f172a', '#334155', '#ffffff'], ['#f97316', '#ef4444', '#ffffff'], ['#f8fafc', '#e2e8f0', '#0f172a']];
  let bgI = 0, tsize = 'M';
  BG.forEach((c, i) => { const b = document.createElement('button'); b.style.background = 'linear-gradient(135deg,' + c[0] + ',' + c[1] + ')'; if (!i) b.className = 'on'; b.onclick = () => { bgI = i; $$('#stSw button').forEach(x => x.classList.toggle('on', x === b)); drawText(); }; $('#stSw').append(b); });
  $$('#stSize button').forEach(b => b.onclick = () => { tsize = b.dataset.s; $$('#stSize button').forEach(x => x.classList.toggle('on', x === b)); drawText(); });
  $('#stTxt').addEventListener('input', drawText);
  function drawText() {
    const c = $('#stCanvas'), g = c.getContext('2d'), bg = BG[bgI];
    const gr = g.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]);
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    const px = { S: 64, M: 92, L: 128 }[tsize];
    g.fillStyle = bg[2]; g.font = '800 ' + px + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const maxW = c.width - 160, lines = []; let cur = '';
    ($('#stTxt').value.trim() || 'Your words here').split(/\s+/).forEach(w => { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    lines.push(cur);
    const lh = px * 1.25, y0 = c.height / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => g.fillText(l, c.width / 2, y0 + i * lh));
    g.font = '700 34px system-ui, sans-serif'; g.globalAlpha = .6; g.fillText('CIN', c.width / 2, c.height - 70); g.globalAlpha = 1;
  }
  const canvasBlob = () => new Promise(res => $('#stCanvas').toBlob(res, 'image/jpeg', .92));
  $('#stTBack').onclick = () => $('#stText').classList.remove('show');
  $('#stTSave').onclick = async () => { const b = await canvasBlob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'cin-text-' + Date.now() + '.jpg'; document.body.append(a); a.click(); a.remove(); toast('Image saved to your phone'); };
  $('#stTAvatar').onclick = async () => { if (!state.account) { gate(null); return; } avatarFrom(await canvasBlob(), $('#stTAvatar')); };

  function setTab(t) {
    $$('.st-tabs button').forEach(b => b.classList.toggle('on', b.dataset.st === t));
    ['post', 'create', 'live'].forEach(k => $('#st' + k[0].toUpperCase() + k.slice(1)).classList.toggle('show', k === t));
    if (t === 'create') paintMood();
  }
  $$('.st-tabs button').forEach(b => b.onclick = () => setTab(b.dataset.st));
  function openStudio() { st.classList.add('show'); setTab('post'); renderGrid(); renderAct(); }
  function closeStudio() { st.classList.remove('show'); $('#stText').classList.remove('show'); }
  $('#stX').onclick = closeStudio;
  X.openCam = openCam; X.closeStudio = closeStudio; X.openStudio = openStudio;

  // The + button opens the studio instead of going straight to a screen
  $('.create-nav').addEventListener('click', e => {
    e.stopImmediatePropagation(); e.preventDefault();
    if (!state.account) { gate(openStudio); return; }
    openStudio();
  }, true);
})();
