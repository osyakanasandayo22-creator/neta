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
let allJokes = [];

// ==========================================
// サイト内ダイアログ（alert/confirmの置き換え）
// ==========================================
let _uiDialogChain = Promise.resolve();

function _enqueueUiDialog(run) {
    const next = _uiDialogChain.then(run, run);
    _uiDialogChain = next.then(() => undefined, () => undefined);
    return next;
}

function _ensureUiModalElements() {
    const modal = document.getElementById('uiModal');
    const titleEl = document.getElementById('uiModalTitle');
    const msgEl = document.getElementById('uiModalMessage');
    const okBtn = document.getElementById('uiModalOk');
    const cancelBtn = document.getElementById('uiModalCancel');
    const backdrop = modal?.querySelector('.ui-modal-backdrop');

    if (!modal || !titleEl || !msgEl || !okBtn || !cancelBtn || !backdrop) {
        throw new Error("uiModal elements not found. Check index.html.");
    }

    return { modal, titleEl, msgEl, okBtn, cancelBtn, backdrop };
}

function uiAlert(message, options = {}) {
    return _enqueueUiDialog(() => {
        const { modal, titleEl, msgEl, okBtn, cancelBtn, backdrop } = _ensureUiModalElements();
        const {
            title = '',
            okText = 'OK'
        } = options;

        return new Promise((resolve) => {
            const prevFocus = document.activeElement;

            titleEl.textContent = title;
            titleEl.style.display = title ? 'block' : 'none';
            msgEl.textContent = message ?? '';

            okBtn.textContent = okText;
            okBtn.classList.remove('ui-modal-btn-danger');
            okBtn.classList.add('ui-modal-btn-primary');

            cancelBtn.style.display = 'none';

            const close = () => {
                modal.classList.remove('open');
                modal.setAttribute('aria-hidden', 'true');
                window.removeEventListener('keydown', onKeyDown, true);
                backdrop.removeEventListener('click', onBackdrop);
                okBtn.removeEventListener('click', onOk);
                if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
                resolve();
            };

            const onOk = () => close();
            const onBackdrop = () => close();
            const onKeyDown = (e) => {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    close();
                }
            };

            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
            window.addEventListener('keydown', onKeyDown, true);
            backdrop.addEventListener('click', onBackdrop);
            okBtn.addEventListener('click', onOk);

            requestAnimationFrame(() => okBtn.focus());
        });
    });
}

function uiConfirm(message, options = {}) {
    return _enqueueUiDialog(() => {
        const { modal, titleEl, msgEl, okBtn, cancelBtn, backdrop } = _ensureUiModalElements();
        const {
            title = '',
            okText = 'はい',
            cancelText = 'いいえ',
            danger = false
        } = options;

        return new Promise((resolve) => {
            const prevFocus = document.activeElement;

            titleEl.textContent = title;
            titleEl.style.display = title ? 'block' : 'none';
            msgEl.textContent = message ?? '';

            okBtn.textContent = okText;
            okBtn.classList.add('ui-modal-btn-primary');
            okBtn.classList.toggle('ui-modal-btn-danger', Boolean(danger));

            cancelBtn.textContent = cancelText;
            cancelBtn.style.display = 'inline-flex';

            const close = (result) => {
                modal.classList.remove('open');
                modal.setAttribute('aria-hidden', 'true');
                window.removeEventListener('keydown', onKeyDown, true);
                backdrop.removeEventListener('click', onBackdrop);
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
                resolve(Boolean(result));
            };

            const onOk = () => close(true);
            const onCancel = () => close(false);
            const onBackdrop = () => close(false);
            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    close(false);
                    return;
                }
                if (e.key === 'Enter') {
                    // Enterで誤爆しないよう、明示的にOK扱いにする
                    e.preventDefault();
                    close(true);
                }
            };

            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
            window.addEventListener('keydown', onKeyDown, true);
            backdrop.addEventListener('click', onBackdrop);
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);

            requestAnimationFrame(() => cancelBtn.focus());
        });
    });
}

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

    // 文字選択制御（投稿フォームと検索フォーム以外は選択不可）
    const style = document.createElement('style');
    style.textContent = `
      body {
        -webkit-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      #jokeInput,
      #searchInput,
      .replyTextarea {
        -webkit-user-select: text;
        -ms-user-select: text;
        user-select: text;
      }

      #jokeInput {
        resize: none;
        max-height: 40vh;
        overflow-y: auto;
      }
      /* 100字を超えたときの全体カラー変更 */
      #jokeInput.over-limit {
        color: #7fa7ff;
      }
      #submitButton.locked {
        opacity: 0.5;
        cursor: not-allowed;
      }
      /* 投稿の日付表示を小さく＆色を薄く */
      .btnWrap .left .post-date {
        font-size: 11px;
        color: #888888;
      }
    `;
    document.head.appendChild(style);

    // script.js の DOMContentLoaded 内に追加
    const logo = document.querySelector('.topBar .logoText');
    if (logo) {
        logo.addEventListener('click', () => {
            // 現在のURLにハッシュ（#my-postsなど）が含まれているか判定
            if (window.location.hash) {
                // 【別画面にいる場合】ハッシュを消してホームのURLへ遷移（＝ホームに戻る）
                window.location.href = window.location.pathname;
            } else {
                // 【既にホームにいる場合】ページをリロードして最新状態にする
                location.reload();
            }
        });
    }

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
                        await uiAlert("ポップアップがブロックされました。ブラウザの設定で許可してください。", { title: "ログインできませんでした" });
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

    // 100文字制限 ＋ 残り文字数のメッセージ要素を用意
    let limitMessage = document.getElementById('jokeLimitMessage');
    if (!limitMessage) {
        limitMessage = document.createElement('div');
        limitMessage.id = 'jokeLimitMessage';
        limitMessage.textContent = ''; // 初期は非表示扱い
        limitMessage.style.fontSize = '12px';
        limitMessage.style.color = '#ff7676';
        limitMessage.style.marginTop = '4px';
        limitMessage.style.display = 'none';
        // ボタンの直前あたりに挿入
        if (submitButton.parentElement) {
            submitButton.parentElement.insertBefore(limitMessage, submitButton);
        }
    }

    function updateInputState() {
        const text = input.value || '';
        const len = text.length;

        if (len > 100) {
            input.classList.add('over-limit');
            submitButton.disabled = true;
            submitButton.classList.add('locked');
            if (limitMessage) {
                const over = len - 100;
                limitMessage.textContent = `言葉は100文字以内にしてください。（あと-${over}文字）`;
                limitMessage.style.color = '#ff7676';
                limitMessage.style.display = 'block';
            }
        } else {
            input.classList.remove('over-limit');
            submitButton.disabled = false;
            submitButton.classList.remove('locked');
            if (limitMessage) {
                if (len >= 90) {
                    const rest = 100 - len;
                    limitMessage.textContent = `あと${rest}文字`;
                    limitMessage.style.color = '#cccccc';
                    limitMessage.style.display = 'block';
                } else {
                    limitMessage.textContent = '';
                    limitMessage.style.display = 'none';
                }
            }
        }
    }

    function adjustHeight(el) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }

    input.addEventListener('input', () => {
        adjustHeight(input);
        updateInputState();
    });

    // 初期状態の反映
    updateInputState();

    submitButton.addEventListener('click', async () => {
        if (!currentUser) {
            await uiAlert("ログインが必要です。", { title: "操作できません" });
            return;
        }
        const text = input.value.trim();
        if (text.length > 100) return; // 念のためガード
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
    const notificationsBtn = document.getElementById('notificationsBtn');

    if (!jokeList) return;

    let displayIndex = 0;
    let isLoading = false;
    let lastScrollY = window.scrollY;
    // 現在の表示モードを管理（タイムライン / 自分の投稿 / 検索結果 / 通知 など）
    // 'timeline' | 'myPosts' | 'search' | 'notifications' | 'singlePost'
    let currentView = 'timeline';

    function formatDate(value) {
        const d = new Date(value);
        return isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function trimText(text, maxLen = 20) {
        const oneLine = (text || "").replace(/\s+/g, ' ');
        return oneLine.length > maxLen ? oneLine.slice(0, maxLen) + '…' : oneLine;
    }

    const HASHTAG_RE = (() => {
        // Unicode対応（対応していない環境向けにフォールバック）
        try {
            return /#[\p{L}\p{N}_]+/gu;
        } catch {
            return /#[A-Za-z0-9_一-龠ぁ-んァ-ヶー]+/g;
        }
    })();

    // URL検出用（簡易版）
    const URL_RE = /https?:\/\/[^\s]+/g;

    // URL または #ハッシュタグ を一括で見つける正規表現
    const TOKEN_RE = (() => {
        try {
            return /(https?:\/\/[^\s]+|#[\p{L}\p{N}_]+)/gu;
        } catch {
            return /(https?:\/\/[^\s]+|#[A-Za-z0-9_一-龠ぁ-んァ-ヶー]+)/g;
        }
    })();

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (ch) => {
            switch (ch) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return ch;
            }
        });
    }

    function renderTextWithHashtags(text) {
        const raw = String(text ?? '');
        let result = '';
        let lastIndex = 0;

        // URLまたはハッシュタグを順番に処理しながらHTMLを組み立てる
        let match;
        while ((match = TOKEN_RE.exec(raw)) !== null) {
            const index = match.index;
            const token = match[0];

            // トークン前の通常テキスト部分
            const plain = raw.slice(lastIndex, index);
            if (plain) {
                result += escapeHtml(plain).replace(/\n/g, '<br>');
            }

            // トークン部分（URLかハッシュタグ）
            if (URL_RE.test(token)) {
                // URL → クリックで外部へ飛べるリンク、文字色は # と同じように .hashtag クラスを流用
                const safeUrl = escapeHtml(token);
                result += `<a href="${safeUrl}" class="hashtag url-link" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
            } else {
                // ハッシュタグ
                const q = encodeURIComponent(token);
                const safeTag = escapeHtml(token);
                result += `<a href="#" class="hashtag" data-query="${q}">${safeTag}</a>`;
            }

            lastIndex = index + token.length;
        }

        // 最後のトークン以降の残りテキスト
        const rest = raw.slice(lastIndex);
        if (rest) {
            result += escapeHtml(rest).replace(/\n/g, '<br>');
        }

        return result;
    }

    async function runSearch(filter) {
        jokeList.innerHTML = '';
        displayIndex = 0;
        currentView = 'search';
        if (searchInput) searchInput.value = filter ?? '';
        await prepareJokes(filter ?? '');
        loadMore(true);
    }

    // #タグクリックで検索（動的生成なので委譲）
    jokeList.addEventListener('click', (e) => {
        const target = e.target instanceof Element ? e.target.closest('.hashtag') : null;
        if (!target) return;

        e.preventDefault();
        e.stopPropagation();

        const q = target.getAttribute('data-query') || '';
        const decoded = q ? decodeURIComponent(q) : '';
        if (!decoded) return;

        if (userMenu) userMenu.classList.remove('open');
        document.querySelectorAll('.post-dropdown.open').forEach(d => d.classList.remove('open'));

        runSearch(decoded);
    });

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
        currentView = 'myPosts';
        
        // 4. 再描画
        if (loader) loader.textContent = "自分の言葉を表示中...";
        loadMore(true);
    });

    // 通知ボタン：自分の投稿のうち、評価（拍手/呪い）が付いたものを最新順で表示
    notificationsBtn?.addEventListener('click', async () => {
        if (!currentUser) return;

        userMenu.classList.remove('open');
        currentView = 'notifications';

        // まだ全ジョークを読み込んでいない場合は取得
        if (!allJokes.length) {
            await prepareJokes();
        }

        // 自分の投稿で、拍手または呪いが1件以上ついているものだけ
        const myRated = allJokes
            .filter(j => j.uid === currentUser.uid && ((j.likes || 0) > 0 || (j.dislikes || 0) > 0))
            .map(j => ({
                ...j,
                lastRatedAt: j.lastRatedAt || j.date || 0
            }))
            .sort((a, b) => b.lastRatedAt - a.lastRatedAt);

        jokeList.innerHTML = '';
        displayIndex = 0;
        if (loader) {
            loader.style.display = 'block';
            loader.textContent = myRated.length ? "あなたへの評価を表示中..." : "まだ評価された言葉はありません。";
        }

        myRated.forEach(j => {
            const li = document.createElement('li');
            li.classList.add('notification-item');

            const likes = j.likes || 0;
            const dislikes = j.dislikes || 0;

            li.innerHTML = `
                <div class="notification-main">
                    <div class="notification-text">
                        あなたの「${trimText(j.text, 24)}」に
                        <span class="notif-like">${likes}件の拍手</span>、
                        <span class="notif-dislike">${dislikes}件の呪い</span>
                        がつきました。
                    </div>
                    <div class="notification-date">${formatDate(j.lastRatedAt)}</div>
                </div>
            `;

            // 通知クリックで、その投稿だけをタイムライン部に表示
            li.addEventListener('click', () => {
                jokeList.innerHTML = '';
                displayIndex = 0;
                if (loader) {
                    loader.style.display = 'none';
                }
                // 通知から単一投稿ビューに遷移
                currentView = 'singlePost';
                mixedJokes = [j];
                loadMore(true);
            });

            jokeList.appendChild(li);
        });
    });

    async function prepareJokes(filter = '') {
        try {
            const querySnapshot = await getDocs(collection(db, "jokes"));
            let jokes = [];
            querySnapshot.forEach((doc) => {
                jokes.push({ id: doc.id, ...doc.data() });
            });
            allJokes = jokes;

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
            loader.textContent = "ロード中...";
        }

        const executeLoad = () => {
            const nextItems = mixedJokes.slice(displayIndex, displayIndex + 10);

            nextItems.forEach(j => {
                const li = document.createElement('li');
                li.setAttribute('data-id', j.id);

                if ((j.likes || 0) > (j.dislikes || 0)) {
                    li.classList.add('white-post');
                }

// loadMore 関数内の nextItems.forEach ループ内
const isOwner = currentUser && j.uid === currentUser.uid;

// メニュー項目の生成
// 自分の投稿には「通報」は表示せず、他人の投稿だけに表示する
let menuItemsHtml = '';
if (!isOwner) {
    menuItemsHtml += `<div class="post-dropdown-item report-btn">通報</div>`;
}
if (isOwner) {
    menuItemsHtml += `<div class="post-dropdown-item del-item delBtn">削除</div>`;
}

// loadMore 関数内の nextItems.forEach ループ内
const isLiked = currentUser && j.likedBy && j.likedBy.includes(currentUser.uid);
const isDisliked = currentUser && j.dislikedBy && j.dislikedBy.includes(currentUser.uid);

li.innerHTML = `
  <span>${renderTextWithHashtags(j.text)}</span>
  <div class="btnWrap">
    <div class="left">
      <span class="post-date">${formatDate(j.date)}</span>
    </div>
    <div class="right">
      <button class="replyBtn">💬 ${j.replies ? j.replies.length : 0}</button>
      
      <!-- 高評価ボタン: activeクラスを動的に付与 -->
      <button class="likeBtn ${isLiked ? 'active' : ''}">
        <span class="icon"></span>
        <span class="count">${j.likes || 0}</span>
      </button>

      <!-- 低評価ボタン: activeクラスを動的に付与 -->
      <button class="dislikeBtn ${isDisliked ? 'active' : ''}">
        <span class="icon"></span>
        <span class="count">${j.dislikes || 0}</span>
      </button>

      <div class="post-menu-container">
        <button class="post-menu-btn">⋮</button>
        <div class="post-dropdown">${menuItemsHtml}</div>
      </div>
    </div>
  </div>
    <!-- 返信セクション（これがないと li.querySelector('.replySection') でエラーになります） -->
    <div class="replySection" style="display:none;">
        <div class="replyList"></div>
        <textarea class="replyTextarea" placeholder="投稿への返信..."></textarea>
        <button class="replySubmit">送信</button>
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
                        div.innerHTML = `<div style="font-size:11px; color:#555;">${formatDate(r.date)}</div><div style="font-size:14px; color:#ccc;">${renderTextWithHashtags(r.text)}</div>`;
                        replyList.appendChild(div);
                    });
                };
                renderReplies(j.replies);

                replyBtn.addEventListener('click', () => {
                    replySection.style.display = replySection.style.display === 'none' ? 'block' : 'none';
                });

                replySubmit.addEventListener('click', async () => {
                    if (!currentUser) {
                        await uiAlert("ログインが必要です。", { title: "操作できません" });
                        return;
                    }
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

// 高評価ボタンのイベント処理 [1, 3]
li.querySelector('.likeBtn').addEventListener('click', async (e) => {
    if (!currentUser) {
        await uiAlert("ログインが必要です。", { title: "操作できません" });
        return;
    }
    const btn = e.currentTarget;
    const jokeRef = doc(db, "jokes", j.id);
    const dislikeBtn = li.querySelector('.dislikeBtn'); // 低評価ボタンを取得

    if (j.likedBy && j.likedBy.includes(currentUser.uid)) {
        // すでに高評価済みの場合は解除
        await updateDoc(jokeRef, { likedBy: arrayRemove(currentUser.uid), likes: increment(-1) });
        j.likes--;
        j.likedBy = j.likedBy.filter(id => id !== currentUser.uid);
        btn.classList.remove('active');
    } else {
        // 【追加】もし低評価を既にしていたら解除する
        if (j.dislikedBy && j.dislikedBy.includes(currentUser.uid)) {
            await updateDoc(jokeRef, { dislikedBy: arrayRemove(currentUser.uid), dislikes: increment(-1) });
            j.dislikes--;
            j.dislikedBy = j.dislikedBy.filter(id => id !== currentUser.uid);
            dislikeBtn.classList.remove('active');
            dislikeBtn.querySelector('.count').textContent = j.dislikes;
        }

        // 新たに高評価をつける
        await updateDoc(jokeRef, { likedBy: arrayUnion(currentUser.uid), likes: increment(1), lastRatedAt: Date.now() });
        j.likes = (j.likes || 0) + 1;
        if (!j.likedBy) j.likedBy = [];
        j.likedBy.push(currentUser.uid);
        playClapFx(btn);
        btn.classList.add('active');
    }

    btn.querySelector('.count').textContent = j.likes;
    updatePostStyle(li, j.likes, (j.dislikes || 0));
});
  

// 低評価ボタンのイベント処理 [2, 3, 6]
li.querySelector('.dislikeBtn').addEventListener('click', async (e) => {
    if (!currentUser) {
        await uiAlert("ログインが必要です。", { title: "操作できません" });
        return;
    }
    const btn = e.currentTarget;
    const jokeRef = doc(db, "jokes", j.id);
    const likeBtn = li.querySelector('.likeBtn'); // 高評価ボタンを取得

    if (j.dislikedBy && j.dislikedBy.includes(currentUser.uid)) {
        // すでに低評価済みの場合は解除
        await updateDoc(jokeRef, { dislikedBy: arrayRemove(currentUser.uid), dislikes: increment(-1) });
        j.dislikes--;
        j.dislikedBy = j.dislikedBy.filter(id => id !== currentUser.uid);
        btn.classList.remove('active');
    } else {
        // 【追加】もし高評価を既にしていたら解除する
        if (j.likedBy && j.likedBy.includes(currentUser.uid)) {
            await updateDoc(jokeRef, { likedBy: arrayRemove(currentUser.uid), likes: increment(-1) });
            j.likes--;
            j.likedBy = j.likedBy.filter(id => id !== currentUser.uid);
            likeBtn.classList.remove('active');
            likeBtn.querySelector('.count').textContent = j.likes;
        }

        // 新たに低評価をつける
        await updateDoc(jokeRef, { dislikedBy: arrayUnion(currentUser.uid), dislikes: increment(1), lastRatedAt: Date.now() });
        j.dislikes = (j.dislikes || 0) + 1;
        if (!j.dislikedBy) j.dislikedBy = [];
        j.dislikedBy.push(currentUser.uid);
        playNailFx(btn);
        btn.classList.add('active');
    }

    btn.querySelector('.count').textContent = j.dislikes;
    updatePostStyle(li, (j.likes || 0), j.dislikes);
});
// --- メニューの開閉ロジック ---
const menuBtn = li.querySelector('.post-menu-btn');
const dropdown = li.querySelector('.post-dropdown');

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 他のクリックイベントへの干渉防止
    // 他の開いているメニューを閉じる処理（任意）
    document.querySelectorAll('.post-dropdown.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
    });
    dropdown.classList.toggle('open');
});

// 画面のどこかをクリックしたらメニューを閉じる
window.addEventListener('click', () => {
    dropdown.classList.remove('open');
});

// --- 通報ボタンの処理（他人の投稿にのみ存在） ---
const reportBtn = li.querySelector('.report-btn');
if (reportBtn) {
    reportBtn.addEventListener('click', async () => {
        dropdown.classList.remove('open');
        if (!currentUser) {
            await uiAlert("通報するにはログインが必要です。", { title: "操作できません" });
            return;
        }

        const ok = await uiConfirm("この言葉を通報しますか？", {
            title: "通報の確認",
            okText: "通報する",
            cancelText: "やめる"
        });
        if (!ok) return;

        try {
            const reportsRef = collection(db, "reports");
            const snap = await getDocs(query(reportsRef, where("jokeId", "==", j.id)));
            const already = snap.docs.some(d => d.data()?.reportedBy === currentUser.uid);
            if (already) {
                await uiAlert("この言葉はすでに通報済みです。", { title: "通報" });
                return;
            }

            await addDoc(reportsRef, {
                jokeId: j.id,
                jokeText: j.text || "",
                jokeUid: j.uid || null,
                reportedBy: currentUser.uid,
                reportedAt: Date.now()
            });

            await uiAlert("通報しました。運営が確認いたします。", { title: "通報" });
        } catch (e) {
            console.error("通報エラー:", e);
            await uiAlert("通報に失敗しました。時間をおいてもう一度お試しください。", { title: "通報" });
        }
    });
}

// --- 削除ボタンの処理 (所有者の場合のみ) ---
if (isOwner) {
    li.querySelector('.delBtn').addEventListener('click', async () => {
        const ok = await uiConfirm("この言葉を消去しますか？", {
            title: "削除の確認",
            okText: "消去する",
            cancelText: "やめる",
            danger: true
        });
        if (!ok) return;
        try {
            await deleteDoc(doc(db, "jokes", j.id));
            li.remove();
            await uiAlert("消去しました。", { title: "削除" });
        } catch (error) {
            console.error("削除エラー:", error);
            await uiAlert("消去に失敗しました。時間をおいてもう一度お試しください。", { title: "削除" });
        }
    });
}

                jokeList.appendChild(li);
            });

            displayIndex += 10;
            loader.style.display = (displayIndex >= mixedJokes.length) ? 'block' : 'none';
            if (displayIndex >= mixedJokes.length) loader.textContent = "これ以上、言葉はありません";
            isLoading = false;
        };

        isInitial ? executeLoad() : setTimeout(executeLoad, 500);
    }

    searchInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            await runSearch(searchInput.value);
        }
    });

    window.addEventListener('scroll', () => {
        const atBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
        const canLoadMore =
            currentView === 'timeline' ||
            currentView === 'search' ||
            currentView === 'myPosts';

        if (canLoadMore && atBottom) {
            loadMore();
        }

        // スクロールしたら開いているメニューを閉じる（スマホ対応）
        if (userMenu) userMenu.classList.remove('open');
        document.querySelectorAll('.post-dropdown.open').forEach(d => d.classList.remove('open'));

        const curr = window.scrollY;
        topBar.style.transform = (curr === 0 || curr < lastScrollY) ? 'translateY(0)' : 'translateY(-100%)';
        lastScrollY = curr;
    });

    prepareJokes().then(() => loadMore(true));
}

// ==========================================
// 補助関数
// ==========================================
function playClapFx(btn) {
    pulseTempClass(btn, 'fx-clap', 340);
    spawnClapSparks(btn);
}

function playNailFx(btn) {
    pulseTempClass(btn, 'fx-nail', 300);
    spawnNailHit(btn);
}

function pulseTempClass(el, className, durationMs) {
    if (!el) return;
    el.classList.remove(className);
    // reflow to restart animation
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), durationMs);
}

function getFxAnchor(btn) {
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2 + window.scrollX;
    const y = r.top + r.height / 2 + window.scrollY;
    return { x, y };
}

function spawnClapSparks(btn) {
    const { x, y } = getFxAnchor(btn);
    const color = getComputedStyle(btn).color || '#ff2d55';

    const fx = document.createElement('span');
    fx.className = 'rate-fx rate-fx--clap';
    fx.style.left = `${x}px`;
    fx.style.top = `${y}px`;
    fx.style.setProperty('--fx-color', color);

    const angles = [-70, -35, 0, 35, 70, 110];
    angles.forEach((a) => {
        const s = document.createElement('span');
        s.className = 'rate-fx__spark';
        s.style.setProperty('--rot', `${a}deg`);
        s.style.setProperty('--dx', `${Math.cos((a * Math.PI) / 180) * 18}px`);
        s.style.setProperty('--dy', `${Math.sin((a * Math.PI) / 180) * 18}px`);
        fx.appendChild(s);
    });

    const pop = document.createElement('span');
    pop.className = 'rate-fx__pop';
    fx.appendChild(pop);

    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 520);
}

function spawnNailHit(btn) {
    const { x, y } = getFxAnchor(btn);
    const color = getComputedStyle(btn).color || '#b0b0b0';

    const fx = document.createElement('span');
    fx.className = 'rate-fx rate-fx--nail';
    fx.style.left = `${x}px`;
    fx.style.top = `${y}px`;
    fx.style.setProperty('--fx-color', color);

    const ring = document.createElement('span');
    ring.className = 'rate-fx__ring';
    fx.appendChild(ring);

    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 520);
}

function updatePostStyle(li, likes, dislikes) {
    if (likes > dislikes) {
        li.classList.add('white-post');
    } else {
        li.classList.remove('white-post');
    }
}