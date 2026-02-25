import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
    arrayUnion, arrayRemove, increment, query, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Firebase 設定 ---
const firebaseConfig = {
    apiKey: "AIzaSyCtI2PRlZ9pN_ZB7aD60iKQvVEraQGSf6o",
    authDomain: "bari-11449.firebaseapp.com",
    projectId: "bari-11449",
    storageBucket: "bari-11449.firebasestorage.app",
    messagingSenderId: "875722454310",
    appId: "1:875722454310:web:22ad7e5dbe27d70d5cbde7",
    measurementId: "G-98KQQ913QV"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let mixedJokes = []; 

// ==========================================
// ログイン状態の監視
// ==========================================
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const loginBtn = document.getElementById('loginBtn');
    const userMenu = document.getElementById('userMenu');
    
    if (loginBtn) {
        if (user) {
            loginBtn.textContent = `👤 ${user.displayName || 'Menu'}`;
        } else {
            loginBtn.textContent = "Login";
            if (userMenu) userMenu.classList.remove('open');
        }
    }
});

// ==========================================
// 初期化・イベント登録
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initIndexPage();
    initPastPage();

    const loginBtn = document.getElementById('loginBtn');
    const userMenu = document.getElementById('userMenu');

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            if (currentUser) {
                userMenu.classList.toggle('open');
            } else {
                try {
                    await signInWithPopup(auth, provider);
                } catch (err) {
                    console.error("Login error:", err);
                    if (err.code === 'auth/popup-blocked') {
                        alert("ポップアップがブロックされました。ブラウザの設定で許可してください。");
                    }
                }
            }
        });
    }

    // ログアウト処理
    document.getElementById('menuLogoutBtn')?.addEventListener('click', async () => {
        try {
            await signOut(auth);
            location.reload();
        } catch (err) {
            console.error(err);
        }
    });

    window.addEventListener('click', (e) => {
        if (userMenu && !userMenu.contains(e.target) && e.target !== loginBtn) {
            userMenu.classList.remove('open');
        }
    });

    const fab = document.getElementById('fab');
    const overlay = document.getElementById('postOverlay');
    const closeBtn = document.getElementById('closeOverlay');

    if (fab && overlay && closeBtn) {
        fab.addEventListener('click', () => {
            fab.style.transform = 'scale(0.8)';
            setTimeout(() => {
                overlay.classList.add('open');
                const input = document.getElementById('jokeInput');
                if (input) input.focus();
                fab.style.transform = '';
            }, 100);
        });
        closeBtn.addEventListener('click', () => {
            overlay.classList.remove('open');
        });
    }
});

// ==========================================
// 投稿管理
// ==========================================
function initIndexPage() {
    const input = document.getElementById('jokeInput');
    const submitButton = document.getElementById('submitButton');
    const toast = document.getElementById('toast');
    const overlay = document.getElementById('postOverlay');

    if (!input || !submitButton) return;

    function adjustHeight(el) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }

    input.addEventListener('input', () => adjustHeight(input));

    submitButton.addEventListener('click', async () => {
        if (!currentUser) return alert("ログインが必要です。");
        const text = input.value.trim();
        if (!text) return;

        try {
            await addDoc(collection(db, "jokes"), {
                text: text,
                date: Date.now(),
                uid: currentUser.uid,
                likes: 0,
                likedBy: [],
                dislikes: 0,
                dislikedBy: [],
                replies: []
            });

            input.value = '';
            adjustHeight(input);
            if (overlay) overlay.classList.remove('open');
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                location.reload();
            }, 1500);

        } catch (e) {
            console.error("Error adding document: ", e);
        }
    });
}

// ==========================================
// 閲覧・表示ロジック
// ==========================================
function initPastPage() {
    const jokeList = document.getElementById('jokeList');
    const loader = document.getElementById('loader');
    const searchInput = document.getElementById('searchInput');
    const topBar = document.querySelector('.topBar');
    const userMenu = document.getElementById('userMenu');

    if (!jokeList) return;

    let displayIndex = 0;
    let isLoading = false;
    let lastScrollY = window.scrollY;

    function formatDate(value) {
        const d = new Date(value);
        return isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    // 自分の投稿ボタンのイベント（ここに追加）
    document.getElementById('myPostsBtn')?.addEventListener('click', () => {
        if (!currentUser) return;
        
        // 1. メニューを閉じる
        userMenu.classList.remove('open');
        
        // 2. 自分の投稿だけを抽出し、日付の降順（最新順）にソート
        mixedJokes = mixedJokes
            .filter(j => j.uid === currentUser.uid)
            .sort((a, b) => b.date - a.date);
        
        // 3. 表示をリセット
        jokeList.innerHTML = '';
        displayIndex = 0;
        
        // 4. 再描画
        if (loader) loader.textContent = "自分の記憶を表示中...";
        loadMore(true);
    });

    async function prepareJokes(filter = '') {
        try {
            const querySnapshot = await getDocs(collection(db, "jokes"));
            let jokes = [];
            querySnapshot.forEach((doc) => {
                jokes.push({ id: doc.id, ...doc.data() });
            });

            if (filter) jokes = jokes.filter(j => j.text.toLowerCase().includes(filter.toLowerCase()));

            const now = Date.now();
            const pool = jokes.map(j => {
                const daysSince = (now - j.date) / (1000 * 60 * 60 * 24);
                let replyBonus = (j.replies && j.replies.length > 0) ? 1.5 : 1.0;
                let weight = Math.sqrt((j.likes || 0) + 1) * Math.sqrt(daysSince + 1) * replyBonus;
                if (j.text.length > 30) weight *= 1.3;
                return { ...j, weight: weight };
            });

            mixedJokes = [];
            const tempPool = [...pool];
            while (tempPool.length > 0) {
                const totalWeight = tempPool.reduce((sum, j) => sum + j.weight, 0);
                let r = Math.random() * totalWeight;
                for (let i = 0; i < tempPool.length; i++) {
                    r -= tempPool[i].weight;
                    if (r <= 0) {
                        mixedJokes.push(tempPool[i]);
                        tempPool.splice(i, 1);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error("Error loading documents: ", e);
        }
    }

    function loadMore(isInitial = false) {
        if (isLoading || (displayIndex >= mixedJokes.length && !isInitial)) return;
        isLoading = true;

        if (!isInitial) {
            loader.style.display = 'block';
            loader.textContent = "記憶を深掘り中...";
        }

        const executeLoad = () => {
            const nextItems = mixedJokes.slice(displayIndex, displayIndex + 10);

            nextItems.forEach(j => {
                const li = document.createElement('li');
                li.setAttribute('data-id', j.id);

                if ((j.likes || 0) > (j.dislikes || 0)) {
                    li.classList.add('white-post');
                }

                const isOwner = currentUser && j.uid === currentUser.uid;
                const deleteBtnHtml = isOwner ? `<button class="delBtn">削除</button>` : '';

                li.innerHTML = `
                    <span>${j.text.replace(/\n/g, '<br>')}</span>
                    <div class="btnWrap">
                        <div class="left"><span>${formatDate(j.date)}</span></div>
                        <div class="right">
                            <button class="replyBtn">💬 ${j.replies ? j.replies.length : 0}</button>
                            <button class="likeBtn">👏 ${j.likes || 0}</button>
                            <button class="dislikeBtn">👎 ${j.dislikes || 0}</button>
                            ${deleteBtnHtml}
                        </div>
                    </div>
                    <div class="replySection" style="display:none;">
                        <div class="replyList"></div>
                        <textarea class="replyTextarea" placeholder="返信を記す..."></textarea>
                        <button class="replySubmit">放つ</button>
                    </div>
                `;

                const replySection = li.querySelector('.replySection');
                const replyList = li.querySelector('.replyList');
                const replyBtn = li.querySelector('.replyBtn');
                const replySubmit = li.querySelector('.replySubmit');
                const replyTextarea = li.querySelector('.replyTextarea');

                const renderReplies = (replies) => {
                    replyList.innerHTML = '';
                    (replies || []).forEach((r) => {
                        const div = document.createElement('div');
                        div.innerHTML = `<div style="font-size:11px; color:#555;">${formatDate(r.date)}</div><div style="font-size:14px; color:#ccc;">${r.text.replace(/\n/g, '<br>')}</div>`;
                        replyList.appendChild(div);
                    });
                };
                renderReplies(j.replies);

                replyBtn.addEventListener('click', () => {
                    replySection.style.display = replySection.style.display === 'none' ? 'block' : 'none';
                });

                replySubmit.addEventListener('click', async () => {
                    if (!currentUser) return alert("ログインが必要です。");
                    const rText = replyTextarea.value.trim();
                    if (!rText) return;
                    const newReply = { id: Date.now().toString(), text: rText, date: Date.now(), uid: currentUser.uid };
                    await updateDoc(doc(db, "jokes", j.id), { replies: arrayUnion(newReply) });
                    if (!j.replies) j.replies = [];
                    j.replies.push(newReply);
                    renderReplies(j.replies);
                    replyTextarea.value = '';
                    replyBtn.textContent = `💬 ${j.replies.length}`;
                });

                li.querySelector('.likeBtn').addEventListener('click', async (e) => {
                    if (!currentUser) return alert("ログインが必要です。");
                    const jokeRef = doc(db, "jokes", j.id);
                    if (j.likedBy && j.likedBy.includes(currentUser.uid)) {
                        await updateDoc(jokeRef, { likedBy: arrayRemove(currentUser.uid), likes: increment(-1) });
                        j.likes--;
                        j.likedBy = j.likedBy.filter(id => id !== currentUser.uid);
                    } else {
                        await updateDoc(jokeRef, { likedBy: arrayUnion(currentUser.uid), likes: increment(1) });
                        j.likes = (j.likes || 0) + 1;
                        if (!j.likedBy) j.likedBy = [];
                        j.likedBy.push(currentUser.uid);
                        createHeart(e.target);
                    }
                    e.target.textContent = `👏 ${j.likes}`;
                    updatePostStyle(li, j.likes, (j.dislikes || 0));
                });

                li.querySelector('.dislikeBtn').addEventListener('click', async (e) => {
                    if (!currentUser) return alert("ログインが必要です。");
                    const jokeRef = doc(db, "jokes", j.id);
                    if (j.dislikedBy && j.dislikedBy.includes(currentUser.uid)) {
                        await updateDoc(jokeRef, { dislikedBy: arrayRemove(currentUser.uid), dislikes: increment(-1) });
                        j.dislikes--;
                        j.dislikedBy = j.dislikedBy.filter(id => id !== currentUser.uid);
                    } else {
                        await updateDoc(jokeRef, { dislikedBy: arrayUnion(currentUser.uid), dislikes: increment(1) });
                        j.dislikes = (j.dislikes || 0) + 1;
                        if (!j.dislikedBy) j.dislikedBy = [];
                        j.dislikedBy.push(currentUser.uid);
                    }
                    e.target.textContent = `👎 ${j.dislikes}`;
                    updatePostStyle(li, (j.likes || 0), j.dislikes);
                });

                if (isOwner) {
                    li.querySelector('.delBtn').addEventListener('click', async () => {
                        if (!confirm("この記憶を消去しますか？")) return;
                        await deleteDoc(doc(db, "jokes", j.id));
                        li.remove();
                    });
                }

                jokeList.appendChild(li);
            });

            displayIndex += 10;
            loader.style.display = (displayIndex >= mixedJokes.length) ? 'block' : 'none';
            if (displayIndex >= mixedJokes.length) loader.textContent = "これ以上、記憶はありません";
            isLoading = false;
        };

        isInitial ? executeLoad() : setTimeout(executeLoad, 500);
    }

    searchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            jokeList.innerHTML = ''; displayIndex = 0;
            await prepareJokes(searchInput.value); loadMore(true);
        }
    });

    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) loadMore();
        const curr = window.scrollY;
        topBar.style.transform = (curr === 0 || curr < lastScrollY) ? 'translateY(0)' : 'translateY(-100%)';
        lastScrollY = curr;
    });

    prepareJokes().then(() => loadMore(true));
}

// ==========================================
// 補助関数
// ==========================================
function createHeart(btn) {
    const h = document.createElement('span');
    h.className = 'heart'; h.textContent = '👏';
    const r = btn.getBoundingClientRect();
    h.style.left = (r.left + r.width / 2 + window.scrollX - 10) + 'px';
    h.style.top = (r.top + window.scrollY - 20) + 'px';
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 1000);
}

function updatePostStyle(li, likes, dislikes) {
    if (likes > dislikes) {
        li.classList.add('white-post');
    } else {
        li.classList.remove('white-post');
    }
}