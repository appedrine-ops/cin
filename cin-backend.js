// CIN backend layer (Firebase Auth + Firestore + Storage).
// Include in index.html with <script type="module" src="cin-backend.js"></script>
// and fill in firebaseConfig from Firebase Console > Project settings > Your apps > Web.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged, sendEmailVerification, EmailAuthProvider, reauthenticateWithCredential, deleteUser }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, collection, query, where, orderBy, limit,
  getDocs, writeBatch, increment, serverTimestamp, onSnapshot, startAfter }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9mjYLfzX7DdMqnD0pDiph_KQJOVr6MUE",
  authDomain: "cin-app-3fdb3.firebaseapp.com",
  projectId: "cin-app-3fdb3",
  storageBucket: "cin-app-3fdb3.firebasestorage.app",
  messagingSenderId: "212742562208",
  appId: "1:212742562208:web:b95e0f48bdc8ceff5584c5"
};

// Free file hosting (no card needed): Cloudinary. Fill in from cloudinary.com > Dashboard.
const CLD = (window.CIN_CONFIG && window.CIN_CONFIG.cloudinary) || { cloudName: "YOUR_CLOUD_NAME", preset: "YOUR_UPLOAD_PRESET" };
// Shrink big phone photos before upload (max 1600px, JPEG) so they post fast on mobile data.
async function shrinkImage(file) {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch (e) { return file; }
}
function cldUpload(file, kind, onProgress) {
  return new Promise((resolve, reject) => {
    if (CLD.cloudName.startsWith("YOUR_") || CLD.preset.startsWith("YOUR_")) return reject(new Error("Add your Cloudinary details first"));
    const fd = new FormData(); fd.append("file", file); fd.append("upload_preset", CLD.preset);
    const x = new XMLHttpRequest();
    x.open("POST", `https://api.cloudinary.com/v1_1/${CLD.cloudName}/${kind === "image" ? "image" : "video"}/upload`);
    x.upload.onprogress = e => { if (onProgress && e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    x.onload = () => { try { const j = JSON.parse(x.responseText); if (x.status < 300 && j.secure_url) resolve(j); else reject(new Error((j.error && j.error.message) || "Upload failed")); } catch (e) { reject(new Error("Upload failed")); } };
    x.onerror = () => reject(new Error("Network error"));
    x.send(fd);
  });
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app);
const clean = h => String(h).toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_.]/g, "").slice(0, 20);
const me = () => { if (!auth.currentUser) throw new Error("Please join CIN first"); return auth.currentUser.uid; };

export const CIN = {
  auth, db,
  onUser: cb => onAuthStateChanged(auth, cb),

  // ---------- Accounts ----------
  async signUp({ email, password, name, handle, interests = [] }) {
    handle = clean(handle);
    if (handle.length < 3) throw new Error("Username must be at least 3 characters");
    if ((await getDoc(doc(db, "handles", handle))).exists()) throw new Error("That username is taken");
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    const b = writeBatch(db);
    b.set(doc(db, "handles", handle), { uid: user.uid });
    b.set(doc(db, "users", user.uid), { name: name.trim().slice(0, 30), handle, bio: "", photoURL: "", private: false, interests: (interests || []).slice(0, 8).map(x => String(x).slice(0, 20)),
      followersCount: 0, followingCount: 0, postsCount: 0, createdAt: serverTimestamp() });
    await b.commit();
    return user;
  },
  signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
  signOut: () => fbSignOut(auth),
  // Member deletes their OWN account: confirm password, remove posts, username, profile, then the login itself
  async deleteMyAccount(password) {
    const u = auth.currentUser; if (!u) throw new Error("Not signed in");
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    const uid = u.uid, p = await CIN.getProfile(uid);
    const vs = await getDocs(query(collection(db, "videos"), where("uid", "==", uid), limit(400)));
    for (const d of vs.docs) await deleteDoc(d.ref);
    if (p && p.handle) { try { await deleteDoc(doc(db, "handles", p.handle)); } catch (e) {} }
    await deleteDoc(doc(db, "users", uid));
    await deleteUser(u);
  },
  async getProfile(uid) { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? { id: uid, ...s.data() } : null; },
  updateProfile: (data) => updateDoc(doc(db, "users", me()), data), // name, bio, photoURL, private

  async setAvatar(file) {
    const uid = me(), up = await cldUpload(file, "image");
    await updateDoc(doc(db, "users", uid), { photoURL: up.secure_url });
    return up.secure_url;
  },

  // ---------- Videos ----------
  // onProgress(0..100) is optional. Returns the new video id.
  async publishVideo(file, { caption = "", tags = [], music = "off", musicFile = null, musicTrack = null, videoVol = 1, musicVol = 0.7, kind = "video" } = {}, onProgress) {
    const uid = me(), profile = await CIN.getProfile(uid), photo = kind === "photo";
    if (photo) file = await shrinkImage(file);
    const up = await cldUpload(file, photo ? "image" : "video", onProgress);
    let musicURL = "", musicName = "";
    if (musicFile) {
      const mu = await cldUpload(musicFile, "video");
      musicURL = mu.secure_url; musicName = musicFile.name.replace(/\.[^.]+$/, "").slice(0, 40);
    }
    let musicLink = "";
    if (musicTrack && musicTrack.url) { musicURL = musicTrack.url; musicName = (musicTrack.name + " — " + musicTrack.artist).slice(0, 80); musicLink = musicTrack.link || ""; }
    const clamp = n => Math.max(0, Math.min(1, Number(n) || 0));
    const vref = doc(collection(db, "videos"));
    const b = writeBatch(db);
    b.set(vref, { uid, handle: profile.handle, caption: caption.slice(0, 150),
      tags: tags.map(t => t.toLowerCase().replace(/[^a-z0-9_]/g, "")).filter(Boolean).slice(0, 10),
      music, musicURL, musicName, musicLink, videoVol: clamp(videoVol), musicVol: clamp(musicVol), privacy: "everyone", allowComments: true, allowSave: true, type: photo ? "photo" : "video", photoURL: photo ? up.secure_url : "", videoPath: up.public_id, videoURL: photo ? "" : up.secure_url, likesCount: 0, commentsCount: 0, createdAt: serverTimestamp() });
    b.update(doc(db, "users", uid), { postsCount: increment(1) });
    await b.commit();
    return vref.id;
  },
  // real time: the 3 newest posts, pushed to the phone the moment someone uploads
  watchNewest: cb => onSnapshot(query(collection(db, "videos"), orderBy("createdAt", "desc"), limit(3)), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}),
  // ---------- LIVE (video goes phone-to-phone with WebRTC; Firestore only carries the handshake and chat) ----------
  live: {
    async start(title) {
      const uid = me(), p = await CIN.getProfile(uid), ref = doc(collection(db, "lives"));
      await setDoc(ref, { uid, handle: p.handle, title: String(title || "").slice(0, 80) || "Live on CIN", status: "live", viewers: 0, lastBeat: serverTimestamp(), createdAt: serverTimestamp() });
      return ref.id;
    },
    beat: (id, viewers) => updateDoc(doc(db, "lives", id), { lastBeat: serverTimestamp(), viewers }),
    end: id => updateDoc(doc(db, "lives", id), { status: "ended" }),
    watchAll: cb => onSnapshot(query(collection(db, "lives"), where("status", "==", "live")), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))),
    watchOne: (id, cb) => onSnapshot(doc(db, "lives", id), s => cb(s.exists() ? { id, ...s.data() } : null)),
    // host: new or changed viewer handshakes
    watchPeers: (id, cb) => onSnapshot(collection(db, "lives", id, "peers"), s => s.docChanges().forEach(c => cb(c.type, c.doc.id, c.doc.data()))),
    async sendOffer(id, offer) { const p = await CIN.getProfile(me()); return setDoc(doc(db, "lives", id, "peers", me()), { uid: me(), handle: p.handle, offer, createdAt: serverTimestamp() }); },
    sendAnswer: (id, peerId, answer) => updateDoc(doc(db, "lives", id, "peers", peerId), { answer }),
    watchPeer: (id, cb) => onSnapshot(doc(db, "lives", id, "peers", me()), s => cb(s.exists() ? s.data() : null)),
    dropPeer: id => deleteDoc(doc(db, "lives", id, "peers", me())).catch(() => {}),
    watchChat: (id, cb) => onSnapshot(query(collection(db, "lives", id, "chat"), orderBy("createdAt", "desc"), limit(40)), s => cb(s.docs.map(d => d.data()).reverse())),
    async sendChat(id, text) { const p = await CIN.getProfile(me()); return addDoc(collection(db, "lives", id, "chat"), { uid: me(), handle: p.handle, text: String(text).slice(0, 200), createdAt: serverTimestamp() }); }
  },
  async publishPhoto(file, opts, onProgress) { return CIN.publishVideo(file, { ...(opts || {}), kind: "photo" }, onProgress); },
  // owner-only post settings: privacy ("everyone" | "friends" | "only_me"), allowComments, allowSave, caption
  async updatePost(id, f) {
    const o = {};
    if (f.privacy && ["everyone", "friends", "only_me"].includes(f.privacy)) o.privacy = f.privacy;
    if (typeof f.allowComments === "boolean") o.allowComments = f.allowComments;
    if (typeof f.allowSave === "boolean") o.allowSave = f.allowSave;
    if (typeof f.caption === "string") o.caption = f.caption.slice(0, 150);
    await updateDoc(doc(db, "videos", id), o);
  },
  // friends = we follow each other
  async isFriend(ownerUid) {
    const a = await getDoc(doc(db, "users", me(), "following", ownerUid)), b = await getDoc(doc(db, "users", ownerUid, "following", me()));
    return a.exists() && b.exists();
  },
  async deleteVideo(id, path) {
    await deleteDoc(doc(db, "videos", id));
    await updateDoc(doc(db, "users", me()), { postsCount: increment(-1) });
  },
  // Pagination: pass the last returned `_snap` as `after`.
  async getFeed({ mode = "for-you", tag = null, uids = null, after = null, size = 10 } = {}) {
    let q;
    if (mode === "following") {
      if (!uids || !uids.length) return [];
      q = query(collection(db, "videos"), where("uid", "in", uids.slice(0, 30)), orderBy("createdAt", "desc"), limit(size));
    } else if (mode === "stem") {
      q = query(collection(db, "videos"), where("tags", "array-contains-any", ["stem","education","technology","science","math"]), limit(size));
    } else if (tag) {
      q = query(collection(db, "videos"), where("tags", "array-contains", tag.toLowerCase()), orderBy("createdAt", "desc"), limit(size));
    } else q = query(collection(db, "videos"), orderBy("createdAt", "desc"), limit(size));
    if (after) q = query(q, startAfter(after));
    return (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data(), _snap: d }));
  },
  async getUserVideos(uid) {
    // no orderBy here: sorting on this device means no extra Firestore index is needed
    const s = await getDocs(query(collection(db, "videos"), where("uid", "==", uid)));
    const t = x => (x.createdAt && x.createdAt.seconds) || 9e12;
    return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => t(b) - t(a));
  },

  // ---------- Likes ----------
  async hasLiked(vid) { return (await getDoc(doc(db, "videos", vid, "likes", me()))).exists(); },
  async toggleLike(vid) {
    const uid = me(), lref = doc(db, "videos", vid, "likes", uid), vref = doc(db, "videos", vid);
    const liked = (await getDoc(lref)).exists(), b = writeBatch(db);
    if (liked) { b.delete(lref); b.update(vref, { likesCount: increment(-1) }); }
    else { b.set(lref, { createdAt: serverTimestamp() }); b.update(vref, { likesCount: increment(1) }); }
    await b.commit();
    return !liked;
  },

  // ---------- Comments ----------
  async addComment(vid, text) {
    const uid = me(), p = await CIN.getProfile(uid), b = writeBatch(db);
    b.set(doc(collection(db, "videos", vid, "comments")), { uid, handle: p.handle, text: text.slice(0, 300), createdAt: serverTimestamp() });
    b.update(doc(db, "videos", vid), { commentsCount: increment(1) });
    await b.commit();
  },
  watchComments(vid, cb) {
    return onSnapshot(query(collection(db, "videos", vid, "comments"), orderBy("createdAt", "asc"), limit(100)),
      s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  },

  // ---------- Follows ----------
  async findByHandle(handle) { const h = await getDoc(doc(db, "handles", String(handle).toLowerCase())); return h.exists() ? CIN.getProfile(h.data().uid) : null; },
  async getFollowingIds(uid = me()) { return (await getDocs(collection(db, "users", uid, "following"))).docs.map(d => d.id); },
  async toggleFollow(targetUid) {
    const uid = me(), fref = doc(db, "users", uid, "following", targetUid), rref = doc(db, "users", targetUid, "followers", uid);
    const on = (await getDoc(fref)).exists(), b = writeBatch(db);
    if (on) { b.delete(fref); b.delete(rref); }
    else { b.set(fref, { createdAt: serverTimestamp() }); b.set(rref, { createdAt: serverTimestamp() }); }
    b.update(doc(db, "users", uid), { followingCount: increment(on ? -1 : 1) });
    b.update(doc(db, "users", targetUid), { followersCount: increment(on ? -1 : 1) });
    await b.commit();
    return !on;
  },
  // ---------- verification (only an admin can give or remove the blue tick) ----------
  async isAdmin() { try { const s = await getDoc(doc(db, "admins", me())); return s.exists(); } catch (e) { return false; } },
  // tiers: "" (none) | "blue" (confirmed member) | "red" (leaders, politicians, businesses) | "green" (heads of state, royalty)
  // every tick given or removed is written to an admin-only log that nobody can edit or delete
  async setTier(uid, tier, meta = {}) {
    const adm = await CIN.getProfile(me()), b = writeBatch(db);
    b.update(doc(db, "users", uid), { tier: tier || "", verified: !!tier });
    b.set(doc(collection(db, "verifyLog")), { uid, handle: meta.handle || "", action: tier ? "give" : "remove", tier: tier || "", note: String(meta.note || "").slice(0, 200), by: me(), byHandle: adm.handle, at: serverTimestamp() });
    await b.commit();
  },
  async listLog() { const s = await getDocs(query(collection(db, "verifyLog"), orderBy("at", "desc"), limit(40))); return s.docs.map(d => d.data()); },

  // ---- applications: a member asks, only an admin decides ----
  async applyVerify({ wanted, reason, link }) {
    const uid = me(), p = await CIN.getProfile(uid);
    await setDoc(doc(db, "verifyRequests", uid), { uid, handle: p.handle, name: p.name, wanted: ["blue", "red", "green", "purple"].includes(wanted) ? wanted : "blue", reason: String(reason).slice(0, 300), link: String(link || "").slice(0, 200), status: "pending", createdAt: serverTimestamp() });
  },
  async myRequest() { const s = await getDoc(doc(db, "verifyRequests", me())); return s.exists() ? s.data() : null; },
  async pendingRequests() { const s = await getDocs(query(collection(db, "verifyRequests"), where("status", "==", "pending"), limit(50))); return s.docs.map(d => ({ id: d.id, ...d.data() })); },
  // tier = "blue" | "red" | "green" to approve, or "" to reject
  async decideRequest(uid, tier, meta = {}) {
    const adm = await CIN.getProfile(me()), b = writeBatch(db);
    if (tier) b.update(doc(db, "users", uid), { tier, verified: true });
    b.set(doc(collection(db, "verifyLog")), { uid, handle: meta.handle || "", action: tier ? "approve" : "reject", tier: tier || "", note: String(meta.note || "").slice(0, 200), by: me(), byHandle: adm.handle, at: serverTimestamp() });
    b.update(doc(db, "verifyRequests", uid), { status: tier ? "approved" : "rejected" });
    await b.commit();
  },
  async listVerified() { const s = await getDocs(query(collection(db, "users"), where("verified", "==", true), limit(50))); return s.docs.map(d => ({ id: d.id, ...d.data() })); },
  async searchUsers(prefix) {
    const p = clean(prefix);
    if (!p) return [];
    const s = await getDocs(query(collection(db, "users"), where("handle", ">=", p), where("handle", "<=", p + "\uf8ff"), limit(20)));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ---------- Circles ----------
  watchCircle(cid, cb) {
    return onSnapshot(query(collection(db, "circles", cid, "messages"), orderBy("createdAt", "desc"), limit(50)),
      s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).reverse()));
  },
  async sendCircleMessage(cid, text) {
    const uid = me(), p = await CIN.getProfile(uid);
    await addDoc(collection(db, "circles", cid, "messages"), { uid, handle: p.handle, text: text.slice(0, 300), createdAt: serverTimestamp() });
  },

  // ---------- Collabs ----------
  async inviteCollab(handle, note) {
    const h = await getDoc(doc(db, "handles", clean(handle)));
    if (!h.exists()) throw new Error("No creator with that username");
    const p = await CIN.getProfile(me());
    await addDoc(collection(db, "collabs"), { fromUid: me(), fromHandle: p.handle, toUid: h.data().uid, note: (note || "Let's collab!").slice(0, 200), status: "pending", createdAt: serverTimestamp() });
  },
  watchCollabs(cb) {
    return onSnapshot(query(collection(db, "collabs"), where("toUid", "==", me()), orderBy("createdAt", "desc")),
      s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  },
  respondCollab: (id, status) => updateDoc(doc(db, "collabs", id), { status }), // 'accepted' | 'declined'

  // ---------- Reports ----------
  report: (videoId, reason) => addDoc(collection(db, "reports"), { videoId, reason: String(reason).slice(0, 80), reporterUid: me(), createdAt: serverTimestamp() }),

  // ---------- Feedback (anyone signed in sends, only admins read) ----------
  sendFeedback: async (kind, text) => { const p = await CIN.getProfile(me()); return addDoc(collection(db, "feedback"), { uid: me(), handle: (p && p.handle) || "", kind, text: String(text).slice(0, 600), createdAt: serverTimestamp() }); },

  // ---------- Admin moderation ----------
  async listReports() { const s = await getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(40))); return s.docs.map(d => ({ id: d.id, ...d.data() })); },
  async listFeedback() { const s = await getDocs(query(collection(db, "feedback"), orderBy("createdAt", "desc"), limit(40))); return s.docs.map(d => ({ id: d.id, ...d.data() })); },
  async getVideoDoc(id) { const d = await getDoc(doc(db, "videos", id)); return d.exists() ? { id: d.id, ...d.data() } : null; },
  closeReport: (id) => deleteDoc(doc(db, "reports", id)),
  closeFeedback: (id) => deleteDoc(doc(db, "feedback", id)),
  removeVideoAsAdmin: (id) => deleteDoc(doc(db, "videos", id))
};

CIN.configured = !firebaseConfig.apiKey.startsWith("YOUR_"); // false until you paste your Firebase config
window.CIN = CIN; // so the existing inline script in index.html can call CIN.* functions
