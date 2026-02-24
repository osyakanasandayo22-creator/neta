/**
 * BARI - script.js
 * 自己共感アルゴリズム + セルフリプライ機能 (Firebase Firestore版)
 */

// Firebase SDK のインポート (CDN経由)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    updateDoc, 
    doc, 
    deleteDoc, 
    arrayUnion, 
    increment 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- Firebase 設定 ---
// TODO: Firebase コンソールで取得したご自身のプロジェクト設定に書き換えてください [1]
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCtI2PRlZ9pN_ZB7aD60iKQvVEraQGSf6o",
  authDomain: "bari-11449.firebaseapp.com",
  projectId: "bari-11449",
  storageBucket: "bari-11449.firebasestorage.app",
  messagingSenderId: "875722454310",
  appId: "1:875722454310:web:22ad7e5dbe27d70d5cbde7",
  measurementId: "G-98KQQ913QV"
};

// Firebase の初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('jokeInput')) initIndexPage();
    if (document.getElementById('jokeList')) initPastPage();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').catch(err => console.log(err));
        });
    }
});

// ==========================================
// index.html 用：投稿管理
// ==========================================
function initIndexPage() {
    const input = document.getElementById('jokeInput');
    const submitButton = document.getElementById('submitButton');
    const pastButton = document.getElementById('pastButton');
    const toast = document.getElementById('toast');

    function adjustHeight(el) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }

    input.addEventListener('input', () => adjustHeight(input));

    // Firebase への新規投稿 [1]
    submitButton.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) return;

        try {
            // Firestore の "jokes" コレクションにデータを追加
            await addDoc(collection(db, "jokes"), {
                text: text,
                date: Date.now(),
                likes: 0,
                replies: [] // 返信用配列 [1]
            });

            input.value = '';
            adjustHeight(input);
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        } catch (e) {
            console.error("Error adding document: ", e);
            alert("投稿に失敗しました。設定を確認してください。");
        }
    });

    pastButton.addEventListener('click', () => { window.location.href = 'past.html'; });
}

// ==========================================
// past.html 用：アルゴリズム & 返信
// ==========================================
function initPastPage() {
    const jokeList = document.getElementById('jokeList');
    const loader = document.getElementById('loader');
    const searchInput = document.getElementById('searchInput');
    const topBar = document.querySelector('.topBar');

    let displayIndex = 0;
    let mixedJokes = [];
    let isLoading = false;
    let lastScrollY = window.scrollY;

    function formatDate(value) {
        const d = new Date(value);
        return isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    // Firebase からデータを取得し、アルゴリズムを適用 [2, 3]
    async function prepareJokes(filter = '') {
        try {
            const querySnapshot = await getDocs(collection(db, "jokes"));
            let jokes = [];
            querySnapshot.forEach((doc) => {
                // ドキュメントIDを保持して配列に格納
                jokes.push({ id: doc.id, ...doc.data() });
            });

            if (filter) jokes = jokes.filter(j => j.text.toLowerCase().includes(filter.toLowerCase()));

            const now = Date.now();
            const pool = jokes.map(j => {
                const daysSince = (now - j.date) / (1000 * 60 * 60 * 24);
                // 返信がある投稿は重みを1.5倍にする [2]
                let replyBonus = (j.replies && j.replies.length > 0) ? 1.5 : 1.0;
                let weight = Math.sqrt((j.likes || 0) + 1) * Math.sqrt(daysSince + 1) * replyBonus;
                if (j.text.length > 30) weight *= 1.3; // [3]
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

                // HTML構造の維持 [4-7]
                li.innerHTML = `
                    <span>${j.text.replace(/\n/g, '<br>')}</span>
                    <div class="btnWrap">
                        <div class="left">
                            <span>${formatDate(j.date)}</span>
                        </div>
                        <div class="right">
                            <button class="replyBtn">💬 ${j.replies ? j.replies.length : 0}</button>
                            <button class="likeBtn">👿 ${j.likes || 0}</button>
                            <button class="delBtn">削除</button>
                        </div>
                    </div>
                    <div class="replySection" style="display:none;">
                        <div class="replyList"></div>
                        <div class="replyInputArea">
                            <textarea class="replyTextarea" placeholder="自分に応える..."></textarea>
                            <button class="replySubmit">放つ</button>
                        </div>
                    </div>
                `;

                const replySection = li.querySelector('.replySection');
                const replyList = li.querySelector('.replyList');
                const replyBtn = li.querySelector('.replyBtn');
                const replySubmit = li.querySelector('.replySubmit');
                const replyTextarea = li.querySelector('.replyTextarea');

                // 返信一覧の描画 [5]
                const renderReplies = (replies) => {
                    replyList.innerHTML = '';
                    (replies || []).forEach(r => {
                        const div = document.createElement('div');
                        div.style.marginBottom = "8px";
                        div.style.fontSize = "14px";
                        div.style.color = "#ccc";
                        div.innerHTML = `<small style="display:block; color:#666;">${formatDate(r.date)}</small>
                                         <div>${r.text.replace(/\n/g, '<br>')}</div>`;
                        replyList.appendChild(div);
                    });
                };

                renderReplies(j.replies);

                // 返信エリアのトグル [8]
                replyBtn.addEventListener('click', () => {
                    replySection.style.display = replySection.style.display === 'none' ? 'block' : 'none';
                });

                // 返信実行 (Firebase) [8-10]
                replySubmit.addEventListener('click', async () => {
                    const rText = replyTextarea.value.trim();
                    if (!rText) return;

                    try {
                        const jokeRef = doc(db, "jokes", j.id);
                        const newReply = { text: rText, date: Date.now() };

                        // Firestoreの配列フィールドを更新
                        await updateDoc(jokeRef, {
                            replies: arrayUnion(newReply)
                        });

                        if (!j.replies) j.replies = [];
                        j.replies.push(newReply);
                        renderReplies(j.replies);

                        replyTextarea.value = '';
                        replyBtn.textContent = `💬 ${j.replies.length}`;
                    } catch (e) {
                        console.error("Error updating replies: ", e);
                    }
                });

                // いいね実行 (Firebase) [9, 11]
                const lBtn = li.querySelector('.likeBtn');
                lBtn.addEventListener('click', async () => {
                    try {
                        const jokeRef = doc(db, "jokes", j.id);
                        await updateDoc(jokeRef, {
                            likes: increment(1)
                        });

                        j.likes = (j.likes || 0) + 1;
                        lBtn.textContent = `👿 ${j.likes}`;
                        createHeart(lBtn);
                    } catch (e) {
                        console.error("Error updating likes: ", e);
                    }
                });

                // 削除実行 (Firebase) [11]
                li.querySelector('.delBtn').addEventListener('click', async () => {
                    if (!confirm("この記憶を消去しますか？")) return;
                    try {
                        await deleteDoc(doc(db, "jokes", j.id));
                        mixedJokes = mixedJokes.filter(item => item.id !== j.id);
                        li.remove();
                    } catch (e) {
                        console.error("Error deleting document: ", e);
                    }
                });

                jokeList.appendChild(li);
            });

            displayIndex += 10;
            loader.style.display = (displayIndex >= mixedJokes.length) ? 'block' : 'none';
            if (displayIndex >= mixedJokes.length) loader.textContent = "これ以上、記憶はありません";
            isLoading = false;
        };

        isInitial ? executeLoad() : setTimeout(executeLoad, 800);
    }

    function createHeart(btn) {
        const h = document.createElement('span');
        h.className = 'heart'; h.textContent = '🖤';
        const r = btn.getBoundingClientRect();
        h.style.left = (r.left + r.width / 2 + window.scrollX - 10) + 'px';
        h.style.top = (r.top + window.scrollY - 20) + 'px';
        document.body.appendChild(h);
        setTimeout(() => h.remove(), 1000);
    }

    // 検索機能 [12]
    searchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            jokeList.innerHTML = ''; 
            displayIndex = 0;
            await prepareJokes(searchInput.value); 
            loadMore(true);
        }
    });

    // スクロール制御 [12]
    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) loadMore();
        const curr = window.scrollY;
        topBar.style.transform = (curr === 0 || curr < lastScrollY) ? 'translateY(0)' : 'translateY(-100%)';
        lastScrollY = curr;
    });

    // 初期化実行
    prepareJokes().then(() => {
        setTimeout(() => loadMore(true), 500);
    });
}