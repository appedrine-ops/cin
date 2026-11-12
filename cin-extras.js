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
  cam.innerHTML = '<video id="camV" playsinline muted autoplay></video><div class="cam-top"><button id="camClose" aria-label="Close">✕</button><button id="camFlip" aria-label="Flip camera">⟲</button></div><div class="cam-mode"><button data-cm="video" class="on">Video</button><button data-cm="photo">Photo</button></div><div class="cam-bar"><span id="camT"></span><button id="camShot" aria-label="Capture"></button></div><div class="cam-res" id="camRes"><img alt="Your photo"><button class="primary" id="camAvatar">Use as profile photo</button><button class="secondary" id="camSave">Save to phone</button><button class="secondary" id="camRetake">Retake</button></div>';
  $('.app').append(cam);
  const camV = $('#camV'), shot = $('#camShot'), timerEl = $('#camT');
  let stream = null, facing = 'user', mode = 'video', rec = null, chunks = [], tick = null, secs = 0, photoBlob = null;
  const MAXS = 60;

  async function startStream() {
    stopStream();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: mode === 'video' });
      camV.srcObject = stream; camV.classList.toggle('mirror', facing === 'user');
    } catch (e) { closeCam(); toast('Allow camera and microphone access in your browser'); }
  }
  function stopStream() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
  function setMode(m) {
    if (rec) return; mode = m;
    $$('.cam-mode button').forEach(b => b.classList.toggle('on', b.dataset.cm === m));
    shot.className = m === 'photo' ? 'photo' : ''; timerEl.textContent = '';
    startStream();
  }
  function openCam(m) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined' && m === 'video') {
      const f = document.createElement('input'); f.type = 'file'; f.accept = m === 'video' ? 'video/*' : 'image/*'; f.setAttribute('capture', 'environment');
      f.onchange = () => { const x = f.files[0]; if (!x) return; if (m === 'video') useVideo(x); else usePhoto(x); };
      f.click(); return;
    }
    cam.classList.add('show'); $('#camRes').classList.remove('show'); setMode(m);
  }
  function closeCam() {
    if (rec) { try { rec.onstop = null; rec.stop(); } catch (e) {} rec = null; }
    clearInterval(tick); stopStream(); cam.classList.remove('show'); shot.classList.remove('rec'); timerEl.textContent = '';
  }
  function useVideo(file) {
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
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
  shot.onclick = () => {
    if (mode === 'video') { rec ? stopRec() : startRec(); return; }
    const c = document.createElement('canvas'); c.width = camV.videoWidth || 720; c.height = camV.videoHeight || 1280;
    const g = c.getContext('2d');
    if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(camV, 0, 0, c.width, c.height);
    c.toBlob(b => { if (b) { stopStream(); usePhoto(b); } }, 'image/jpeg', .9);
  };
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
})();
