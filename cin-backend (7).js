// CIN backend layer (Firebase Auth + Firestore + Storage).
// Include in index.html with <script type="module" src="cin-backend.js"></script>
// and fill in firebaseConfig from Firebase Console > Project settings > Your apps > Web.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged }
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
const CLD = { cloudName: "YOUR_CLOUD_NAME", preset: "YOUR_UPLOAD_PRESET" };
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
  async signUp({ email, password, name, handle }) {
    handle = clean(handle);
    if (handle.length < 3) throw new Error("Username must be at least 3 characters");
    if ((await getDoc(doc(db, "handles", handle))).exists()) throw new Error("That username is taken");
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    const b = writeBatch(db);
    b.set(doc(db, "handles", handle), { uid: user.uid });
    b.set(doc(db, "users", user.uid), { name: name.trim().slice(0, 30), handle, bio: "", photoURL: "", private: false,
      followersCount: 0, followingCount: 0, postsCount: 0, createdAt: serverTimestamp() });
    await b.commit();
    return user;
  },
  signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
  signOut: () => fbSignOut(auth),
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
      music, musicURL, musicName, musicLink, videoVol: clamp(videoVol), musicVol: clamp(musicVol), type: photo ? "photo" : "video", photoURL: photo ? up.secure_url : "", videoPath: up.public_id, videoURL: photo ? "" : up.secure_url, likesCount: 0, commentsCount: 0, createdAt: serverTimestamp() });
    b.update(doc(db, "users", uid), { postsCount: increment(1) });
    await b.commit();
    return vref.id;
  },
  async publishPhoto(file, opts, onProgress) { return CIN.publishVideo(file, { ...(opts || {}), kind: "photo" }, onProgress); },
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
    const s = await getDocs(query(collection(db, "videos"), where("uid", "==", uid), orderBy("createdAt", "desc")));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
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
  report: (videoId, reason) => addDoc(collection(db, "reports"), { videoId, reason, reporterUid: me(), createdAt: serverTimestamp() })
};

CIN.configured = !firebaseConfig.apiKey.startsWith("YOUR_"); // false until you paste your Firebase config
window.CIN = CIN; // so the existing inline script in index.html can call CIN.* functions
