import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, doc, deleteDoc, arrayUnion, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

document.addEventListener('DOMContentLoaded', () => {
  // 両方の初期化を実行
  initIndexPage();
  initPastPage();

  // --- オーバーレイ制御ロジック (統合のための新規追加) ---
  const fab = document.getElementById('fab');
  const overlay = document.getElementById('postOverlay');
  const closeBtn = document.getElementById('closeOverlay');

  if (fab && overlay && closeBtn) {
    fab.addEventListener('click', () => {
      // ボタン自体の演出：一瞬小さくする
      fab.style.transform = 'scale(0.8)';
      
      setTimeout(() => {
        overlay.classList.add('open');
        document.getElementById('jokeInput').focus();
        fab.style.transform = ''; // スタイルを戻す
      }, 100);
    });
    
    // 閉じるボタンの演出も強化
    closeBtn.addEventListener('click', () => {
      overlay.classList.remove('open');
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(err => console.log(err));
    });
  }
});

// ==========================================
// 投稿管理 (旧 index.html の全機能)
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
    const text = input.value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, "jokes"), {
        text: text,
        date: Date.now(),
        likes: 0,
        replies: []
      });
      input.value = '';
      adjustHeight(input);
      
      // 統合用：投稿後にオーバーレイを閉じる
      if (overlay) overlay.classList.remove('open');
      
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        location.reload(); // タイムライン更新のためリロード
      }, 1500);
    } catch (e) {
      console.error("Error adding document: ", e);
      alert("投稿に失敗しました。");
    }
  });
}

// ==========================================
// 閲覧・アルゴリズム・返信 (旧 past.html の全機能)
// ==========================================
function initPastPage() {
  const jokeList = document.getElementById('jokeList');
  const loader = document.getElementById('loader');
  const searchInput = document.getElementById('searchInput');
  const topBar = document.querySelector('.topBar');
  if (!jokeList) return;

  let displayIndex = 0;
  let mixedJokes = [];
  let isLoading = false;
  let lastScrollY = window.scrollY;

  function formatDate(value) {
    const d = new Date(value);
    return isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // --- 自己共感アルゴリズム [1, 2] ---
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
        // HTML構造の維持 [3, 4]
        li.innerHTML = `
          <span>${j.text.replace(/\n/g, '<br>')}</span>
          <div class="btnWrap">
            <div class="left"><span>${formatDate(j.date)}</span></div>
            <div class="right">
              <button class="replyBtn">💬 ${j.replies ? j.replies.length : 0}</button>
              <button class="likeBtn">👿 ${j.likes || 0}</button>
              <button class="delBtn">削除</button>
            </div>
          </div>
          <div class="replySection" style="display:none;">
            <div class="replyList"></div>
            <div class="replyInputArea">
              <textarea class="replyTextarea" placeholder="自分自身に返信..."></textarea>
              <button class="replySubmit">放つ</button>
            </div>
          </div>
        `;

        const replySection = li.querySelector('.replySection');
        const replyList = li.querySelector('.replyList');
        const replyBtn = li.querySelector('.replyBtn');
        const replySubmit = li.querySelector('.replySubmit');
        const replyTextarea = li.querySelector('.replyTextarea');

        // --- 返信描画ロジック [4, 5] ---
        const renderReplies = (replies) => {
          replyList.innerHTML = '';
          (replies || []).forEach((r) => {
            const div = document.createElement('div');
            div.innerHTML = `
              <small>${formatDate(r.date)}</small>
              <p>${r.text.replace(/\n/g, '<br>')}</p>
              <div class="replyActions">
                <button class="replyLikeBtn">👿 ${r.likes || 0}</button>
                <button class="replyDelBtn">削除</button>
              </div>
            `;
            
            div.querySelector('.replyLikeBtn').addEventListener('click', async (e) => {
              r.likes = (r.likes || 0) + 1;
              await updateDoc(doc(db, "jokes", j.id), { replies: j.replies });
              e.target.textContent = `👿 ${r.likes}`;
              createHeart(e.target);
            });

            div.querySelector('.replyDelBtn').addEventListener('click', async () => {
              if (!confirm("この返信を消去しますか？")) return;
              j.replies = j.replies.filter(reply => reply.id !== r.id);
              await updateDoc(doc(db, "jokes", j.id), { replies: j.replies });
              renderReplies(j.replies);
              replyBtn.textContent = `💬 ${j.replies.length}`;
            });
            replyList.appendChild(div);
          });
        };

        renderReplies(j.replies);

        replyBtn.addEventListener('click', () => {
          replySection.style.display = replySection.style.display === 'none' ? 'block' : 'none';
        });

        replySubmit.addEventListener('click', async () => {
          const rText = replyTextarea.value.trim();
          if (!rText) return;
          const newReply = { id: Date.now().toString(), text: rText, date: Date.now(), likes: 0 };
          await updateDoc(doc(db, "jokes", j.id), { replies: arrayUnion(newReply) });
          if (!j.replies) j.replies = [];
          j.replies.push(newReply);
          renderReplies(j.replies);
          replyTextarea.value = '';
          replyBtn.textContent = `💬 ${j.replies.length}`;
        });

        li.querySelector('.likeBtn').addEventListener('click', async (e) => {
          await updateDoc(doc(db, "jokes", j.id), { likes: increment(1) });
          j.likes = (j.likes || 0) + 1;
          e.target.textContent = `👿 ${j.likes}`;
          createHeart(e.target);
        });

        li.querySelector('.delBtn').addEventListener('click', async () => {
          if (!confirm("この記憶を消去しますか？")) return;
          await deleteDoc(doc(db, "jokes", j.id));
          li.remove();
        });

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

function createHeart(btn) {
  const h = document.createElement('span');
  h.className = 'heart'; h.textContent = '🖤';
  const r = btn.getBoundingClientRect();
  h.style.left = (r.left + r.width / 2 + window.scrollX - 10) + 'px';
  h.style.top = (r.top + window.scrollY - 20) + 'px';
  document.body.appendChild(h);
  setTimeout(() => h.remove(), 1000);
}