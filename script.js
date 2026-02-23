/**
 * BARI - script.js
 * 自己共感アルゴリズム + セルフリプライ機能
 */
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
  
    submitButton.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) return;
  
      let jokes = JSON.parse(localStorage.getItem('jokes') || '[]');
      // 返信用配列 "replies" を追加
      jokes.push({ id: Date.now(), text: text, date: Date.now(), likes: 0, replies: [] });
      
      try {
        localStorage.setItem('jokes', JSON.stringify(jokes));
        input.value = '';
        adjustHeight(input);
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
      } catch (e) { 
        alert("容量オーバーです"); 
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
  
    function prepareJokes(filter = '') {
      let jokes = JSON.parse(localStorage.getItem('jokes') || '[]');
      if (filter) jokes = jokes.filter(j => j.text.toLowerCase().includes(filter.toLowerCase()));
      
      const now = Date.now();
      const pool = jokes.map(j => {
        const daysSince = (now - j.date) / (1000 * 60 * 60 * 24);
        
        // 【スコア修正】返信がある投稿は、対話が発生しているため重みを1.5倍にする
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
    }
  
    function loadMore(isInitial = false) {
      if (isLoading || (displayIndex >= mixedJokes.length && !isInitial)) return;
      isLoading = true;
      if (!isInitial) { loader.style.display = 'block'; loader.textContent = "記憶を深掘り中..."; }
  
      const executeLoad = () => {
        const nextItems = mixedJokes.slice(displayIndex, displayIndex + 10);
        nextItems.forEach(j => {
          const li = document.createElement('li');
          li.setAttribute('data-id', j.id);
          
          // 投稿内容 + 返信リスト + 返信フォーム
          li.innerHTML = `
            <div class="mainContent">
              <span>${j.text.replace(/\n/g, '<br>')}</span>
              <div class="btnWrap">
                <div class="left"><span>${formatDate(j.date)}</span></div>
                <div class="right">
                  <button class="replyBtn">💬 ${j.replies ? j.replies.length : 0}</button>
                  <button class="likeBtn">👿 ${j.likes || 0}</button>
                  <button class="delBtn">削除</button>
                </div>
              </div>
            </div>
            <div class="replySection" style="display:none; width:100%; margin-top:15px; border-left: 2px solid #444; padding-left: 15px;">
              <div class="replyList"></div>
              <div class="replyInputArea" style="margin-top:10px; display:flex; gap:5px;">
                <textarea class="replyTextarea" placeholder="今の自分から返信..." style="flex:1; min-height:40px; font-size:14px; background:rgba(255,255,255,0.05); color:#fff; border:1px solid #333; border-radius:4px; padding:5px;"></textarea>
                <button class="replySubmit" style="padding:0 10px; font-size:12px; border-radius:4px;">放つ</button>
              </div>
            </div>
          `;

          const replySection = li.querySelector('.replySection');
          const replyList = li.querySelector('.replyList');
          const replyBtn = li.querySelector('.replyBtn');
          const replySubmit = li.querySelector('.replySubmit');
          const replyTextarea = li.querySelector('.replyTextarea');

          // 返信一覧の描画
          const renderReplies = (replies) => {
            replyList.innerHTML = '';
            (replies || []).forEach(r => {
              const div = document.createElement('div');
              div.style.marginBottom = "8px";
              div.style.fontSize = "14px";
              div.style.color = "#ccc";
              div.innerHTML = `<small style="color:#555;">${formatDate(r.date)}</small><br>${r.text.replace(/\n/g, '<br>')}`;
              replyList.appendChild(div);
            });
          };
          renderReplies(j.replies);

          // 返信エリアのトグル
          replyBtn.addEventListener('click', () => {
            replySection.style.display = replySection.style.display === 'none' ? 'block' : 'none';
          });

          // 返信実行
          replySubmit.addEventListener('click', () => {
            const rText = replyTextarea.value.trim();
            if (!rText) return;

            let all = JSON.parse(localStorage.getItem('jokes') || '[]');
            const target = all.find(item => item.id === j.id);
            if (target) {
              if (!target.replies) target.replies = [];
              const newReply = { text: rText, date: Date.now() };
              target.replies.push(newReply);
              localStorage.setItem('jokes', JSON.stringify(all));
              
              renderReplies(target.replies);
              replyTextarea.value = '';
              replyBtn.textContent = `💬 ${target.replies.length}`;
            }
          });

          // いいね・削除は以前と同じ
          const lBtn = li.querySelector('.likeBtn');
          lBtn.addEventListener('click', () => {
            let all = JSON.parse(localStorage.getItem('jokes') || '[]');
            const t = all.find(item => item.id === j.id);
            if (t) {
              t.likes = (t.likes || 0) + 1;
              localStorage.setItem('jokes', JSON.stringify(all));
              lBtn.textContent = `👿 ${t.likes}`;
              createHeart(lBtn);
            }
          });

          li.querySelector('.delBtn').addEventListener('click', () => {
            if (!confirm("この記憶を消去しますか？")) return;
            let all = JSON.parse(localStorage.getItem('jokes') || '[]');
            localStorage.setItem('jokes', JSON.stringify(all.filter(i => i.id !== j.id)));
            mixedJokes = mixedJokes.filter(item => item.id !== j.id);
            li.remove();
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
  
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        jokeList.innerHTML = ''; displayIndex = 0;
        prepareJokes(searchInput.value); loadMore(true);
      }
    });
  
    window.addEventListener('scroll', () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) loadMore();
      const curr = window.scrollY;
      topBar.style.transform = (curr === 0 || curr < lastScrollY) ? 'translateY(0)' : 'translateY(-100%)';
      lastScrollY = curr;
    });
  
    prepareJokes();
    setTimeout(() => loadMore(true), 500);
}