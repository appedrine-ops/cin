// CIN extras: Create hub (+), pro camera (filters, zoom, flash, timer, grid, pause/resume), video preview, music.
(function () {
  const X = window.CINX = { musicFile: null };
  const ic = (n, s) => CI.svg(n, s || 22);
  const CANVAS_FILTER = (() => { try { return 'filter' in CanvasRenderingContext2D.prototype; } catch (e) { return false; } })();
  const FILTERS = [
    ['Normal', 'none'], ['Vivid', 'saturate(1.55) contrast(1.1)'], ['Warm', 'sepia(.3) saturate(1.3) hue-rotate(-10deg)'],
    ['Cool', 'saturate(1.1) hue-rotate(15deg) brightness(1.05)'], ['Mono', 'grayscale(1) contrast(1.1)'],
    ['Fade', 'contrast(.88) brightness(1.1) saturate(.8)'], ['Drama', 'contrast(1.35) saturate(1.2) brightness(.95)']
  ];
  const fmt = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');

  const css = document.createElement('style');
  css.textContent = `
.xrow{display:flex;gap:10px;margin:14px 0}.xrow button{flex:1;display:flex;align-items:center;justify-content:center;gap:8px}
.pv{margin:14px 0}.pv video{width:100%;max-height:46vh;border-radius:16px;background:#000;display:block}.pv .prow{display:flex;gap:8px;margin-top:8px}.pv .prow button{flex:1;display:flex;align-items:center;justify-content:center;gap:7px}
.mrow{margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mrow .secondary{display:flex;align-items:center;gap:8px}
.mname{display:none;align-items:center;gap:6px;background:var(--panel2);border:1px solid var(--line);border-radius:20px;padding:6px 6px 6px 12px;font-size:12px;font-weight:700;color:var(--accent);max-width:100%}.mname span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}.mname button{background:#ffffff1a;border-radius:50%;width:22px;height:22px;display:grid;place-items:center;color:#fff}
.tagchips{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.tagchips button{background:var(--panel2);color:#d8dbe4;border-radius:18px;padding:6px 11px;font-size:12px;font-weight:700}
.cnt{display:block;text-align:right;color:var(--muted);font-size:11px;margin-top:4px}

/* camera */
.cam{position:absolute;inset:0;z-index:40;background:#000;display:none;overflow:hidden}.cam.show{display:block}
.cam>video{width:100%;height:100%;object-fit:cover}.cam>video.mirror{transform:scaleX(-1)}
.cam-grid{position:absolute;inset:0;pointer-events:none;display:none;background:linear-gradient(to right,transparent calc(33.33% - .5px),#fff6 calc(33.33% - .5px),#fff6 calc(33.33% + .5px),transparent calc(33.33% + .5px),transparent calc(66.66% - .5px),#fff6 calc(66.66% - .5px),#fff6 calc(66.66% + .5px),transparent calc(66.66% + .5px)),linear-gradient(to bottom,transparent calc(33.33% - .5px),#fff6 calc(33.33% - .5px),#fff6 calc(33.33% + .5px),transparent calc(33.33% + .5px),transparent calc(66.66% - .5px),#fff6 calc(66.66% - .5px),#fff6 calc(66.66% + .5px),transparent calc(66.66% + .5px))}.cam-grid.on{display:block}
.cam-prog{position:absolute;top:8px;left:12px;right:12px;height:3px;border-radius:2px;background:#ffffff40;z-index:3}.cam-prog i{display:block;height:100%;width:0;border-radius:2px;background:var(--accent)}
.cam-top{position:absolute;top:20px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;z-index:3}.cam-top .cb{width:44px;height:44px;border-radius:50%;background:#0008;color:#fff;display:grid;place-items:center}.cam-top .sp{width:44px}
.pill{height:40px;border-radius:22px;padding:0 16px;font-size:14px;font-weight:800;background:#0008;color:#fff;display:flex;align-items:center;gap:7px;max-width:60%}.pill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cam-side{position:absolute;right:10px;top:78px;z-index:3;display:flex;flex-direction:column;gap:10px}
.cs{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;color:#fff;text-shadow:0 1px 6px #000;width:52px}.cs .ci{width:44px;height:44px;border-radius:50%;background:#0007;display:grid;place-items:center}.cs small{font-size:10px;font-weight:700}.cs.on .ci{background:var(--accent);color:#10140b}
.cam-count{position:absolute;inset:0;z-index:3;display:none;align-items:center;justify-content:center;font-size:120px;font-weight:900;color:#fff;text-shadow:0 4px 30px #000;pointer-events:none}
.cam-filters{position:absolute;left:0;right:0;bottom:214px;z-index:3;display:none;gap:10px;overflow-x:auto;padding:6px 14px;scrollbar-width:none}.cam-filters.on{display:flex}.cam-filters::-webkit-scrollbar{display:none}
.cf{flex:none;display:flex;flex-direction:column;align-items:center;gap:5px;background:none;color:#fff;font-size:11px;font-weight:700;text-shadow:0 1px 5px #000}.cf i{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#ff9a56,#ffd36b 35%,#4ecdc4 65%,#5b7cfa);border:2px solid transparent}.cf.on i{border-color:#fff}
.cam-mode{position:absolute;bottom:150px;left:0;right:0;display:flex;justify-content:center;gap:22px;z-index:3}
.cam-mode button{background:none;color:#ffffffb3;font-weight:800;font-size:15px;padding:6px 4px;border-bottom:2px solid transparent;text-shadow:0 1px 5px #000}.cam-mode button.on{color:#fff;border-color:#fff}
.cam-bar{position:absolute;bottom:26px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:3}
#camT{color:#fff;font-weight:800;font-size:13px;min-height:34px;text-align:center;text-shadow:0 1px 6px #000;line-height:1.3}#camT em{display:block;font-style:normal;font-weight:600;font-size:11px;opacity:.85}.rd{display:inline-block;width:9px;height:9px;border-radius:50%;background:#ff2d55;margin-right:7px;animation:blink 1s infinite}.rd.off{animation:none;opacity:.5}@keyframes blink{50%{opacity:.25}}
.cam-row{display:flex;align-items:center;justify-content:center;gap:30px}.cbtn{width:52px;height:52px;border-radius:50%;background:#0008;color:#fff;display:grid;place-items:center}.cbtn.done{background:var(--accent);color:#10140b;display:none}
.shotwrap{position:relative;width:88px;height:88px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--accent) calc(var(--p,0)*1%),#ffffff66 0)}.shotwrap:before{content:"";position:absolute;inset:5px;border-radius:50%;background:#000c}
#camShot{position:relative;z-index:1;width:66px;height:66px;border-radius:50%;background:#ff2d55;transition:.18s}#camShot.photo{background:#fff}#camShot.rec{width:30px;height:30px;border-radius:9px}#camShot.paused{width:50px;height:50px}
.cam-res{position:absolute;inset:0;z-index:5;background:#000e;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px}.cam-res.show{display:flex}.cam-res img{max-width:100%;max-height:58vh;border-radius:16px}.cam-res button{width:100%;max-width:320px}
.toast{z-index:60}

/* studio */
.studio{position:absolute;inset:0;z-index:25;background:#050609;display:none;flex-direction:column}.studio.show{display:flex}
.st-x{position:absolute;top:14px;left:14px;z-index:3;width:42px;height:42px;border-radius:50%;background:#ffffff14;color:#fff;display:grid;place-items:center}
.st-pane{display:none;flex:1;overflow:auto;padding:14px 14px 10px}.st-pane.show{display:block}
.st-pane h2{margin:0 0 8px;font-size:21px;line-height:42px;text-align:center;letter-spacing:1px}
.st-seg{display:flex;gap:8px;margin-bottom:10px}.st-seg button{background:#161922;color:#c5c8d3;border-radius:20px;padding:7px 16px;font-size:13px;font-weight:700}.st-seg button.on{background:#fff;color:#000}
.st-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
.st-tile{position:relative;aspect-ratio:3/4;background:#161922;overflow:hidden;padding:0;border-radius:4px;color:#fff;display:block}.st-tile img,.st-tile video{width:100%;height:100%;object-fit:cover;display:block}.st-tile.on{outline:3px solid var(--accent);outline-offset:-3px}.st-tile i{position:absolute;right:6px;bottom:5px;font-size:11px;font-style:normal;font-weight:800;text-shadow:0 1px 4px #000}
.st-tile.st-b{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:800}
.st-hint{color:var(--muted);font-size:12px;line-height:1.5;margin:12px 2px}
.st-act{display:none;position:sticky;bottom:0;padding-top:12px;background:linear-gradient(transparent,#050609 28%)}.st-act.show{display:block}.st-act .primary{margin:0 0 8px}
.st-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 4px}.st-tools button{background:#161922;border-radius:16px;padding:12px 2px;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#fff}
.ti{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,var(--c1),var(--c2));color:#10140b}
.st-new{width:100%;margin:14px 0;padding:26px;border-radius:20px;background:linear-gradient(135deg,#f6ffe9,#e4fbff);color:#10140b;font-weight:900;font-size:18px;display:flex;align-items:center;justify-content:center;gap:10px}.st-new b{width:30px;height:30px;border-radius:50%;background:#10140b;color:#fff;display:grid;place-items:center}
.st-pane h3{font-size:14px;margin:18px 0 10px;color:#dfe1e8}
.st-live{text-align:center;padding-top:30px}.st-live .ico-big{width:92px;height:92px;border-radius:50%;margin:0 auto;display:grid;place-items:center;background:linear-gradient(135deg,#ff2d55,#ff7a45);color:#fff}.st-live p{color:var(--muted);font-size:13px;line-height:1.5;margin:6px 10px 18px}.st-live input{width:100%;background:#161922;border:1px solid var(--line);border-radius:14px;padding:14px;color:#fff;outline:0}.st-golive{background:#ff2d55;color:#fff;font-weight:900;border-radius:30px;width:100%;padding:15px;font-size:16px;margin-top:14px}
.st-tabs{display:flex;justify-content:center;gap:34px;padding:14px 0 calc(14px + env(safe-area-inset-bottom));background:#000}.st-tabs button{background:none;color:#868b99;font-weight:800;letter-spacing:1px;font-size:15px;padding:2px 2px 5px;border-bottom:2px solid transparent}.st-tabs button.on{color:#fff;border-color:var(--accent)}
.st-text{position:absolute;inset:0;z-index:4;background:#08090d;display:none;overflow:auto;padding:14px}.st-text.show{display:block}
.st-thead{display:flex;align-items:center;justify-content:space-between;height:42px}.st-thead button{width:42px;height:42px;border-radius:50%;background:#ffffff14;color:#fff;display:grid;place-items:center}.st-thead span{width:42px}
#stCanvas{display:block;width:100%;max-width:280px;aspect-ratio:4/5;margin:12px auto;border-radius:16px}
.st-text textarea{width:100%;min-height:76px;background:#161922;border:1px solid var(--line);border-radius:12px;padding:12px;color:#fff;outline:0;resize:none}
.st-sw{display:flex;gap:10px;margin:12px 0}.st-sw button{width:34px;height:34px;border-radius:50%;border:2px solid transparent}.st-sw button.on{border-color:#fff}
.st-text .opts{margin-bottom:8px}.st-text .row button{display:flex;align-items:center;justify-content:center;gap:7px}
`;
  document.head.append(css);

  // ======================= Create screen: preview, music, tags =======================
  const input = $('#videoFile'), box = $('#upload .uploadbox');

  const row = document.createElement('div');
  row.className = 'xrow';
  row.innerHTML = '<button class="secondary" id="xRec" type="button">' + ic('video', 20) + 'Record video</button><button class="secondary" id="xPhoto" type="button">' + ic('camera', 20) + 'Take photo</button>';
  box.after(row);

  const pv = document.createElement('div');
  pv.className = 'pv'; pv.style.display = 'none';
  pv.innerHTML = '<video playsinline controls loop></video><div class="prow"><button class="secondary" type="button" id="pvSave">' + ic('save', 18) + 'Save to phone</button><button class="secondary" type="button" id="pvDel">' + ic('trash', 18) + 'Remove</button></div>';
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
  $('#pvDel').onclick = () => { input.value = ''; showPreview(null); };
  $('#pvSave').onclick = () => {
    const f = input.files[0]; if (!f) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name || ('cin-video-' + Date.now() + '.mp4');
    document.body.append(a); a.click(); a.remove(); toast('Video saved to your phone');
  };

  // music from phone
  const mBox = $('#musicPreview').parentElement;
  const mrow = document.createElement('div');
  mrow.className = 'mrow';
  mrow.innerHTML = '<button class="secondary" type="button" id="xMusicPick">' + ic('music', 18) + 'Choose music from your phone</button><span class="mname" id="xMusicName"></span><input type="file" id="xMusicFile" accept="audio/*" hidden>';
  mBox.append(mrow);
  const mFile = $('#xMusicFile'), mName = $('#xMusicName');
  $('#xMusicPick').onclick = () => mFile.click();
  function paintMusicChip() {
    if (!X.musicFile) { mName.style.display = 'none'; mName.innerHTML = ''; return; }
    mName.innerHTML = ic('music', 14) + '<span></span><button type="button" aria-label="Remove music">' + ic('close', 12) + '</button>';
    mName.querySelector('span').textContent = X.musicFile.name.replace(/\.[^.]+$/, '');
    mName.querySelector('button').onclick = () => { clearMusicFile(); toast('Music removed'); };
    mName.style.display = 'inline-flex';
  }
  function clearMusicFile() { X.musicFile = null; au.pause(); au.removeAttribute('src'); mFile.value = ''; paintMusicChip(); }
  mFile.addEventListener('change', () => {
    const f = mFile.files[0]; if (!f) return;
    if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(f.name)) { toast('Please choose an audio file'); mFile.value = ''; return; }
    if (f.size > 15 * 1024 * 1024) { toast('Choose music under 15 MB'); mFile.value = ''; return; }
    X.musicFile = f; au.src = URL.createObjectURL(f);
    musicPick = 'off'; paintMusic(); setPreview(false); paintMusicChip();
    if (!pvVideo.paused) playMusicWithVideo();
    toast('Your music is added');
  });
  $$('#musicOpts [data-m]').forEach(b => b.addEventListener('click', () => {
    clearMusicFile();
    if (pv.style.display !== 'none' && !pvVideo.paused) { Music.stop(); if (musicPick !== 'off') Music.start(musicPick, 'pv' + Date.now()); }
  }));

  // caption counter + tag suggestions
  const capEl = $('#captionInput'), cnt = document.createElement('small');
  cnt.className = 'cnt'; capEl.after(cnt);
  const updCnt = () => { cnt.textContent = capEl.value.length + '/150'; };
  capEl.addEventListener('input', updCnt); updCnt();
  const tagEl = $('#tagInput'), chips = document.createElement('div');
  chips.className = 'tagchips';
  ['CIN', 'STEM', 'Tech', 'Education', 'Dance', 'Comedy', 'Music', 'Lifestyle'].forEach(t => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '#' + t;
    b.onclick = () => { const cur = tagEl.value.trim(); if (cur.toLowerCase().split(/\s+/).includes('#' + t.toLowerCase())) return; tagEl.value = (cur ? cur + ' ' : '') + '#' + t; };
    chips.append(b);
  });
  tagEl.after(chips);

  X.clearFile = clearMusicFile; X.mFile = mFile;
  X.reset = () => { clearMusicFile(); showPreview(null); setTimeout(updCnt, 0); };

  // ======================= Camera =======================
  const side = (id, icon, label) => '<button id="' + id + '" class="cs" type="button"><span class="ci">' + ic(icon, 22) + '</span><small>' + label + '</small></button>';
  const cam = document.createElement('div');
  cam.className = 'cam';
  cam.innerHTML =
    '<video id="camV" playsinline muted autoplay></video><div class="cam-grid" id="camGrid"></div>' +
    '<div class="cam-prog"><i id="camProg"></i></div>' +
    '<div class="cam-top"><button class="cb" id="camClose" aria-label="Close">' + ic('close', 22) + '</button><button id="camSound" class="pill" type="button"></button><span class="sp"></span></div>' +
    '<div class="cam-side">' + side('camFlip', 'flip', 'Flip') + side('camFlash', 'flash', 'Flash') + side('camTimer', 'timer', 'Timer') + side('camFilterBtn', 'filters', 'Filters') + side('camGridBtn', 'grid', 'Grid') + side('camZoom', 'zoom', '1x') + '</div>' +
    '<div class="cam-count" id="camCount"></div><div class="cam-filters" id="camFilters"></div>' +
    '<div class="cam-mode"><button data-cm="180">3m</button><button data-cm="60" class="on">60s</button><button data-cm="15">15s</button><button data-cm="photo">PHOTO</button></div>' +
    '<div class="cam-bar"><div id="camT"></div><div class="cam-row"><button class="cbtn" id="camLeft" type="button"></button><div class="shotwrap" id="shotWrap"><button id="camShot" aria-label="Capture" type="button"></button></div><button class="cbtn done" id="camDone" type="button" aria-label="Finish">' + ic('check', 26) + '</button></div></div>' +
    '<div class="cam-res" id="camRes"><img alt="Your photo"><button class="primary" id="camAvatar">Use as profile photo</button><button class="secondary" id="camSave">Save to phone</button><button class="secondary" id="camRetake">Retake</button></div>' +
    '<input type="file" id="camGal" accept="video/*,image/*" hidden>';
  $('.app').append(cam);

  const camV = $('#camV'), shot = $('#camShot'), timerEl = $('#camT');
  let stream = null, facing = 'user', mode = 'video', rec = null, chunks = [], tick = null, secs = 0, photoBlob = null;
  let MAXS = 60, torchOn = false, delay = 0, cd = null, curFilter = 0, discardRec = false, drawRaf = 0, zoomCaps = null, zoomVal = 1, zTick = 0;

  // filters panel
  FILTERS.forEach(([name, f], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cf' + (i === 0 ? ' on' : '');
    b.innerHTML = '<i></i><span></span>'; b.querySelector('i').style.filter = f; b.querySelector('span').textContent = name;
    b.onclick = () => { if (rec) return; curFilter = i; camV.style.filter = f === 'none' ? '' : f; $$('#camFilters .cf').forEach(x => x.classList.toggle('on', x === b)); $('#camFilterBtn').classList.toggle('on', i > 0); };
    $('#camFilters').append(b);
  });
  if (!CANVAS_FILTER) $('#camFilterBtn').style.display = 'none';

  function paintSound() {
    const t = X.musicFile ? X.musicFile.name.replace(/\.[^.]+$/, '').slice(0, 18) : 'Add sound';
    $('#camSound').innerHTML = ic('music', 16) + '<span></span>'; $('#camSound').querySelector('span').textContent = t;
  }
  function paintShot() {
    const on = !!rec, paused = on && rec.state === 'paused', pct = on ? Math.min(100, secs / MAXS * 100) : 0;
    shot.className = on ? (paused ? 'paused' : 'rec') : (mode === 'photo' ? 'photo' : '');
    $('#shotWrap').style.setProperty('--p', pct);
    $('#camProg').style.width = pct + '%';
    $('#camDone').style.display = on ? 'grid' : 'none';
    $('#camLeft').innerHTML = on ? ic('trash', 22) : ic('image', 22);
    $('#camLeft').setAttribute('aria-label', on ? 'Discard' : 'Upload from gallery');
    $('.cam-mode').style.visibility = on ? 'hidden' : 'visible';
    $('#camFilters').classList.toggle('on', $('#camFilters').classList.contains('on') && !on);
    timerEl.innerHTML = on ? '<i class="rd' + (paused ? ' off' : '') + '"></i>' + fmt(secs) + ' / ' + fmt(MAXS) + '<em>' + (paused ? 'Paused. Tap to resume' : 'Tap to pause') + '</em>' : '';
  }

  async function startStream() {
    stopStream();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: mode === 'video' });
      camV.srcObject = stream; camV.classList.toggle('mirror', facing === 'user');
      camV.style.filter = FILTERS[curFilter][1] === 'none' ? '' : FILTERS[curFilter][1];
      torchOn = false; $('#camFlash').classList.remove('on');
      const vt = stream.getVideoTracks()[0], caps = vt && vt.getCapabilities ? vt.getCapabilities() : {};
      zoomCaps = caps.zoom || null;
      $('#camZoom').style.display = zoomCaps ? '' : 'none';
      zoomVal = zoomCaps ? ((vt.getSettings && vt.getSettings().zoom) || zoomCaps.min) : 1;
      $('#camZoom small').textContent = zoomVal.toFixed(1).replace('.0', '') + 'x';
    } catch (e) { closeCam(); toast('Allow camera and microphone access in your browser'); }
  }
  function stopStream() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
  function setMode(m) {
    if (rec) return;
    const k = m === 'video' ? '60' : m;
    mode = k === 'photo' ? 'photo' : 'video'; if (mode === 'video') MAXS = +k;
    $$('.cam-mode button').forEach(b => b.classList.toggle('on', b.dataset.cm === k));
    paintShot(); startStream();
  }
  function countdown(n, go) {
    const el = $('#camCount'); el.style.display = 'flex'; el.textContent = n;
    cd = setInterval(() => { n--; if (n <= 0) { clearInterval(cd); cd = null; el.style.display = 'none'; go(); } else el.textContent = n; }, 1000);
  }
  function openCam(m) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || (typeof MediaRecorder === 'undefined' && m === 'video')) {
      const f = document.createElement('input'); f.type = 'file'; f.accept = m === 'video' ? 'video/*' : 'image/*'; f.setAttribute('capture', 'environment');
      f.onchange = () => { const x = f.files[0]; if (!x) return; if (m === 'video') useVideo(x); else usePhoto(x); };
      f.click(); return;
    }
    cam.classList.add('show'); $('#camRes').classList.remove('show'); paintSound(); setMode(m);
  }
  function closeCam() {
    if (rec) { try { rec.onstop = null; rec.stop(); } catch (e) {} rec = null; }
    clearInterval(tick); stopDraw();
    if (cd) { clearInterval(cd); cd = null; $('#camCount').style.display = 'none'; }
    stopStream(); cam.classList.remove('show'); secs = 0; paintShot();
  }
  function useVideo(file, src) {
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    if (X.closeStudio) X.closeStudio();
    if (X.openEditor) X.openEditor(file, src || 'studio');
    else { navigate('upload'); showPreview(file); }
  }
  function usePhoto(blob) {
    photoBlob = blob; $('#camRes img').src = URL.createObjectURL(blob); $('#camRes').classList.add('show'); cam.classList.add('show');
  }

  // recording (with optional live filter through a canvas)
  function stopDraw() { if (drawRaf) cancelAnimationFrame(drawRaf); drawRaf = 0; }
  function sourceStream() {
    const f = FILTERS[curFilter][1];
    if (f === 'none' || !CANVAS_FILTER || !camV.videoWidth) return stream;
    const c = document.createElement('canvas'); c.width = camV.videoWidth; c.height = camV.videoHeight;
    const g = c.getContext('2d');
    const draw = () => { g.filter = f; g.drawImage(camV, 0, 0, c.width, c.height); drawRaf = requestAnimationFrame(draw); };
    draw();
    const out = c.captureStream(30);
    stream.getAudioTracks().forEach(t => out.addTrack(t));
    return out;
  }
  function stopRec() { if (rec && rec.state !== 'inactive') rec.stop(); }
  function startRec() {
    chunks = []; secs = 0; discardRec = false;
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mt = types.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    try { rec = new MediaRecorder(sourceStream(), mt ? { mimeType: mt, videoBitsPerSecond: 2500000 } : undefined); } catch (e) { stopDraw(); rec = null; toast('Recording is not supported here'); return; }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearInterval(tick); stopDraw();
      const type = (rec && rec.mimeType) || mt || 'video/webm', ext = /mp4/.test(type) ? 'mp4' : 'webm';
      const file = new File(chunks, 'cin-' + Date.now() + '.' + ext, { type: type.split(';')[0] });
      const dropped = discardRec; rec = null; secs = 0; paintShot();
      if (dropped) return;
      closeCam();
      if (file.size > 100 * 1024 * 1024) { toast('That recording is too big (100 MB max)'); return; }
      useVideo(file, 'cam');
    };
    rec.start(1000);
    tick = setInterval(() => { if (rec && rec.state === 'recording') { secs++; paintShot(); if (secs >= MAXS) stopRec(); } }, 1000);
    paintShot();
  }
  function takePhoto() {
    const c = document.createElement('canvas'); c.width = camV.videoWidth || 720; c.height = camV.videoHeight || 1280;
    const g = c.getContext('2d');
    if (CANVAS_FILTER) g.filter = FILTERS[curFilter][1];
    if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(camV, 0, 0, c.width, c.height);
    c.toBlob(b => { if (b) { stopStream(); usePhoto(b); } }, 'image/jpeg', .9);
  }

  shot.onclick = () => {
    if (cd) { clearInterval(cd); cd = null; $('#camCount').style.display = 'none'; return; }
    if (mode === 'photo') { delay ? countdown(delay, takePhoto) : takePhoto(); return; }
    if (!rec) { delay ? countdown(delay, startRec) : startRec(); return; }
    if (rec.state === 'recording') rec.pause(); else if (rec.state === 'paused') rec.resume();
    paintShot();
  };
  $('#camDone').onclick = stopRec;
  $('#camLeft').onclick = () => {
    if (rec) { if (confirm('Discard this recording?')) { discardRec = true; stopRec(); } return; }
    $('#camGal').click();
  };
  $('#camGal').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (/^video\//.test(f.type) || /\.(mp4|webm|mov|3gp|mkv)$/i.test(f.name)) {
      if (f.size > 100 * 1024 * 1024) { toast('Choose a video under 100 MB'); return; }
      closeCam(); useVideo(f);
    } else { stopStream(); usePhoto(f); }
  });
  $('#camClose').onclick = () => { if (rec && !confirm('Discard this recording?')) return; closeCam(); };
  $('#camFlip').onclick = () => { if (rec) return; facing = facing === 'user' ? 'environment' : 'user'; startStream(); };
  $$('.cam-mode button').forEach(b => b.onclick = () => setMode(b.dataset.cm));
  $('#camFlash').onclick = () => {
    const t = stream && stream.getVideoTracks()[0];
    if (!t || !t.applyConstraints) { toast('Flash is not available here'); return; }
    t.applyConstraints({ advanced: [{ torch: !torchOn }] }).then(() => { torchOn = !torchOn; $('#camFlash').classList.toggle('on', torchOn); }).catch(() => toast('Flash works on the back camera only'));
  };
  $('#camTimer').onclick = () => {
    delay = delay === 0 ? 3 : delay === 3 ? 10 : 0;
    const b = $('#camTimer'); b.classList.toggle('on', !!delay); b.querySelector('small').textContent = delay ? delay + 's' : 'Timer';
    toast(delay ? 'Timer: ' + delay + ' seconds' : 'Timer off');
  };
  $('#camFilterBtn').onclick = () => { if (!rec) $('#camFilters').classList.toggle('on'); };
  $('#camGridBtn').onclick = () => { const on = $('#camGrid').classList.toggle('on'); $('#camGridBtn').classList.toggle('on', on); };
  $('#camSound').onclick = () => { if (!rec) mFile.click(); };
  mFile.addEventListener('change', paintSound);

  // zoom: button cycles 1x/2x/3x, two-finger pinch for fine control
  function setZoom(z) {
    if (!zoomCaps) return;
    z = Math.max(zoomCaps.min, Math.min(zoomCaps.max, z)); zoomVal = z;
    $('#camZoom small').textContent = z.toFixed(1).replace('.0', '') + 'x';
    const now = Date.now(); if (now - zTick < 60) return; zTick = now;
    const t = stream && stream.getVideoTracks()[0]; if (t) t.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {});
  }
  $('#camZoom').onclick = () => { if (!zoomCaps) return; const base = zoomCaps.min; setZoom(zoomVal < base * 1.5 ? base * 2 : zoomVal < base * 2.5 ? base * 3 : base); };
  let pz = null; const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  cam.addEventListener('touchstart', e => { if (e.touches.length === 2 && zoomCaps) pz = { d: dist(e.touches), z: zoomVal }; }, { passive: true });
  cam.addEventListener('touchmove', e => { if (pz && e.touches.length === 2) setZoom(pz.z * dist(e.touches) / pz.d); }, { passive: true });
  cam.addEventListener('touchend', () => { pz = null; }, { passive: true });

  // photo result actions
  $('#camRetake').onclick = () => { $('#camRes').classList.remove('show'); startStream(); };
  $('#camSave').onclick = () => {
    if (!photoBlob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(photoBlob); a.download = 'cin-photo-' + Date.now() + '.jpg';
    document.body.append(a); a.click(); a.remove(); toast('Photo saved to your phone');
  };
  X.paintAvatar = url => { const p = $('#profileInitial'); p.textContent = ''; p.style.background = 'url("' + String(url).replace(/"/g, '') + '") center/cover'; };
  async function shrink(blob, max) {
    const bm = await createImageBitmap(blob), r = Math.min(1, (max || 1080) / Math.max(bm.width, bm.height));
    const c = document.createElement('canvas'); c.width = Math.round(bm.width * r); c.height = Math.round(bm.height * r);
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', .85));
  }
  async function avatarFrom(blob, btn) {
    if (!state.account) { closeCam(); if (X.closeStudio) X.closeStudio(); gate(null); return; }
    if (!window.CIN || !CIN.configured) { toast('Profile photos need the cloud backend'); return; }
    const label = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }
    try {
      const small = await shrink(blob, 600);
      const url = await CIN.setAvatar(new File([small], 'avatar.jpg', { type: 'image/jpeg' }));
      X.paintAvatar(url); closeCam(); if (X.closeStudio) X.closeStudio(); navigate('profile'); toast('Profile photo updated');
    } catch (e) { toast('Could not upload photo'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }
  $('#camAvatar').onclick = () => avatarFrom(photoBlob, $('#camAvatar'));
  $('#xRec').onclick = () => openCam('video');
  $('#xPhoto').onclick = () => openCam('photo');

  // ======================= Studio: the full-screen hub opened by + =======================
  const st = document.createElement('div');
  st.className = 'studio'; st.id = 'studio';
  const tool = (t, icon, label, c1, c2) => '<button data-t="' + t + '" type="button"><span class="ti" style="--c1:' + c1 + ';--c2:' + c2 + '">' + ic(icon, 24) + '</span>' + label + '</button>';
  st.innerHTML =
    '<button class="st-x" id="stX" aria-label="Close">' + ic('close', 22) + '</button>' +
    '<div class="st-pane show" id="stPost"><h2>New post</h2>' +
    '<div class="st-seg" id="stSeg"><button class="on" data-f="all">All</button><button data-f="video">Videos</button><button data-f="photo">Photos</button></div>' +
    '<div class="st-grid" id="stGrid"></div>' +
    '<p class="st-hint">A website cannot browse your whole gallery, so tap <b>Gallery</b> and choose the videos or photos you want. They then show up here.</p>' +
    '<div class="st-act" id="stAct"></div></div>' +
    '<div class="st-pane" id="stCreate"><h2>CREATE</h2><div class="st-tools">' +
    tool('rec', 'video', 'Record', '#ff8fb3', '#ff4f91') + tool('photo', 'camera', 'Photo', '#ffd36b', '#ff9a56') + tool('text', 'text', 'Text image', '#8fe9e3', '#18c8c0') + tool('sound', 'music', 'Add sound', '#c9b8ff', '#7d69ff') +
    '</div><button class="st-new" id="stNew" type="button"><b>' + ic('plus', 18) + '</b>New video</button>' +
    '<h3>Auto music</h3><div class="opts" id="stMood"><button data-m="off">Off</button><button data-m="chill">Chill</button><button data-m="upbeat">Upbeat</button><button data-m="inspire">Inspire</button></div>' +
    '<p class="st-hint">Each video gets its own tune. Pick a mood, or add your own song with <b>Add sound</b>, then record or choose a video.</p></div>' +
    '<div class="st-pane" id="stLive"><div class="st-live"><div class="ico-big">' + ic('live', 44) + '</div><h2>Go LIVE</h2><p>Live streaming is coming soon. It needs a streaming service connected to CIN, so it is not switched on yet.</p><input id="stLiveTitle" maxlength="60" placeholder="Add a title"><button class="st-golive" id="stGoLive" type="button">Go LIVE</button></div></div>' +
    '<div class="st-tabs"><button data-st="post" class="on">POST</button><button data-st="create">CREATE</button><button data-st="live">LIVE</button></div>' +
    '<div class="st-text" id="stText"><div class="st-thead"><button id="stTBack" aria-label="Back">' + ic('back', 22) + '</button><b>Text image</b><span></span></div>' +
    '<canvas id="stCanvas" width="1080" height="1350"></canvas><textarea id="stTxt" maxlength="220" placeholder="Type your words..."></textarea>' +
    '<div class="st-sw" id="stSw"></div><div class="opts" id="stFont"><button data-f="Modern" class="on">Modern</button><button data-f="Serif">Serif</button><button data-f="Mono">Mono</button></div>' +
    '<div class="opts" id="stSize"><button data-s="S">Small</button><button data-s="M" class="on">Medium</button><button data-s="L">Large</button></div>' +
    '<div class="row"><button class="secondary" id="stTSave" type="button">' + ic('save', 18) + 'Save to phone</button><button class="primary" id="stTAvatar" type="button">Use as profile photo</button></div></div>' +
    '<input type="file" id="stGallery" accept="video/*,image/*" multiple hidden>';
  $('.app').append(st);

  let items = [], sel = -1, filter = 'all';
  const gal = $('#stGallery');
  function renderGrid() {
    const g = $('#stGrid'); g.innerHTML = '';
    const mk = (icon, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'st-tile st-b'; b.innerHTML = ic(icon, 30); b.append(label); b.onclick = fn; return b; };
    g.append(mk('camera', 'Camera', () => openCam('video')), mk('image', 'Gallery', () => gal.click()));
    items.forEach((it, i) => {
      if (filter !== 'all' && it.kind !== filter) return;
      const t = document.createElement('button'); t.type = 'button'; t.className = 'st-tile' + (i === sel ? ' on' : '');
      const m = document.createElement(it.kind === 'video' ? 'video' : 'img');
      if (it.kind === 'video') {
        m.muted = true; m.preload = 'metadata'; m.setAttribute('playsinline', ''); m.src = it.url + '#t=0.1';
        const d = document.createElement('i'); t.append(m, d);
        m.addEventListener('loadedmetadata', () => { if (isFinite(m.duration)) d.textContent = fmt(Math.round(m.duration)); });
      } else { m.src = it.url; t.append(m); }
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
        useVideo(it.file, 'studio');
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
    if (t === 'rec') openCam('video'); else if (t === 'photo') openCam('photo');
    else if (t === 'text') { $('#stText').classList.add('show'); drawText(); }
    else if (t === 'sound') mFile.click();
  });
  $('#stNew').onclick = () => openCam('video');
  mFile.addEventListener('change', () => { if (st.classList.contains('show') && mFile.files[0]) { setTab('post'); toast('Music added. Now pick or record a video.'); } });
  $('#stGoLive').onclick = () => toast('LIVE is coming soon');

  // text-to-image maker
  const BG = [['#1b1034', '#7d69ff', '#ffffff'], ['#ff4f91', '#ffd36b', '#1a0f12'], ['#18c8c0', '#b8ff4a', '#0b1a0f'], ['#0f172a', '#334155', '#ffffff'], ['#f97316', '#ef4444', '#ffffff'], ['#f8fafc', '#e2e8f0', '#0f172a']];
  const FONTS = { Modern: 'system-ui, sans-serif', Serif: 'Georgia, serif', Mono: 'ui-monospace, Menlo, monospace' };
  let bgI = 0, tsize = 'M', tfont = 'Modern';
  BG.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.style.background = 'linear-gradient(135deg,' + c[0] + ',' + c[1] + ')'; if (!i) b.className = 'on'; b.onclick = () => { bgI = i; $$('#stSw button').forEach(x => x.classList.toggle('on', x === b)); drawText(); }; $('#stSw').append(b); });
  $$('#stSize button').forEach(b => b.onclick = () => { tsize = b.dataset.s; $$('#stSize button').forEach(x => x.classList.toggle('on', x === b)); drawText(); });
  $$('#stFont button').forEach(b => b.onclick = () => { tfont = b.dataset.f; $$('#stFont button').forEach(x => x.classList.toggle('on', x === b)); drawText(); });
  $('#stTxt').addEventListener('input', drawText);
  function drawText() {
    const c = $('#stCanvas'), g = c.getContext('2d'), bg = BG[bgI];
    const gr = g.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]);
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    const px = { S: 64, M: 92, L: 128 }[tsize];
    g.fillStyle = bg[2]; g.font = '800 ' + px + 'px ' + FONTS[tfont]; g.textAlign = 'center'; g.textBaseline = 'middle';
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
  $('#stTAvatar').onclick = async () => avatarFrom(await canvasBlob(), $('#stTAvatar'));

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
