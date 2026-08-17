const scene = document.getElementById('scene');
const spatialItems = []; 
const ballItems = []; 

// === 音效設定 ===
const hoverSound = new Audio('./music/bubble01.mp3');
const clickSound = new Audio('./music/bubble02.mp3');
hoverSound.volume = 0.24;
clickSound.volume = 0.5;

function playHoverSound() {
    hoverSound.currentTime = 0;
    hoverSound.play().catch(e => console.log('音效播放被瀏覽器阻擋或未互動', e));
}

function playClickSound() {
    clickSound.currentTime = 0;
    clickSound.play().catch(e => console.log('音效播放被瀏覽器阻擋', e));
} 

// === 動態建立作品背景遮罩層 ===
let bgOverlay = document.getElementById('dynamic-bg-overlay');
if (!bgOverlay) {
    bgOverlay = document.createElement('div');
    bgOverlay.id = 'dynamic-bg-overlay';
    bgOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-size: cover; background-position: center; pointer-events: none; z-index: 1; opacity: 0; transition: opacity 0.5s ease;';
    document.body.prepend(bgOverlay);
}
let bgOverlayTimeout = null;

function showBgOverlay(itemData) {
    if (!bgOverlay || !itemData) return;
    clearTimeout(bgOverlayTimeout);
    const bgImg = (itemData.photos && itemData.photos.length > 0) ? itemData.photos[0] : itemData.cover;
    if (bgImg) {
        bgOverlay.style.backgroundImage = `url('${bgImg}')`;
        void bgOverlay.offsetWidth;
        bgOverlay.style.opacity = '0.3';
    }
}

function hideBgOverlay() {
    if (!bgOverlay) return;
    bgOverlay.style.opacity = '0';
    clearTimeout(bgOverlayTimeout);
    bgOverlayTimeout = setTimeout(() => {
        if (bgOverlay.style.opacity === '0') {
            bgOverlay.style.backgroundImage = 'none';
        }
    }, 500);
} 

// === 動態資料（從 gallery-data.json 載入）===
let allGalleryData = [];   // 全部作品
let totalItems = 0;
const itemsPerPage = 25;
let currentPage = 0;

const numClouds = 10;
const sphereRadius = 900; 
const focalLength = 1600; 
const minDistance = 320; 

let rotX = 0, rotY = 0; 
let targetRotX = 0, targetRotY = 0;
let vRotX = 0, vRotY = 0; 

// === 待機自動緩速旋轉 ===
let idleTimer = null;
let isIdle = false;
let currentAutoRotateSpeed = { x: 0, y: 0 };
let targetAutoRotateSpeed = { x: 0, y: 0 };

function stopIdle() {
    clearTimeout(idleTimer);
    idleTimer = null;
    isIdle = false;
    targetAutoRotateSpeed = { x: 0, y: 0 };
}

function startIdleTimer() {
    stopIdle();
    if (focusedItem || isLaunching || isTransitioning) return;
    const detailView = document.getElementById('detail-view');
    if (detailView && detailView.classList.contains('show')) return;

    idleTimer = setTimeout(() => {
        if (focusedItem || isLaunching || isTransitioning) return;
        isIdle = true;
        targetAutoRotateSpeed = {
            x: (Math.random() - 0.5) * 0.001,
            y: (Math.random() - 0.5) * 0.001
        };
    }, 5000);
} 

let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;
let pointerDownX = 0, pointerDownY = 0; 

let focusedItem = null;
let isFocusing = false; 
let isSettled = false;  
let isTransitioning = false;
let isRingMode = false;
let isLaunching = false;
let animationFrameId = null;

function generateValidPosition(avoidItems = spatialItems) {
    let attempts = 0;
    while (attempts < 200) { 
        const radius = 300 + Math.random() * (sphereRadius - 300); 
        const theta = Math.random() * Math.PI * 2; 
        const phi = Math.acos((Math.random() * 2) - 1); 
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        let isTooClose = false;
        for (let item of avoidItems) {
            const dist = Math.hypot(item.baseX - x, item.baseY - y, item.baseZ - z);
            if (dist < minDistance) { isTooClose = true; break; }
        }
        if (!isTooClose) return { x, y, z };
        attempts++;
    }
    return { x: 0, y: 0, z: 0 }; 
}

function createBallNode(itemData) {
    const wrapper = document.createElement('div');
    wrapper.className = 'item-wrapper';
    const el = document.createElement('div');
    el.className = 'crystal-ball';
    // 有封面用封面，否則顯示純色佔位
    if (itemData && itemData.cover) {
        el.style.backgroundImage = `url('${itemData.cover}')`;
    } else {
        el.style.background = 'linear-gradient(135deg,#a1c4fd,#c2e9fb)';
    }

    const info = document.createElement('div');
    info.className = 'info-container';
    info.innerHTML = `<div class="info-en">${itemData ? itemData.id : ''}</div><div class="info-zh">${itemData ? itemData.name : ''}</div>`;
    el.appendChild(info);
    wrapper.appendChild(el);
    return { wrapper, el };
}

function attachBallEvents(ballObj) {
    ballObj.el.addEventListener('mouseenter', () => {
        if (isLaunching || !ballObj.data) return;
        if (focusedItem === ballObj) return;
        playHoverSound();
    });

    ballObj.el.addEventListener('click', (e) => {
        if (isLaunching || !ballObj.data) return;
        if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 5) return; 
        
        if (focusedItem === ballObj && isSettled) {
            launchTransitionToDetail(ballObj.data);
            return;
        }
        
        if (focusedItem === ballObj) return; 
        triggerFocus(ballObj);
        e.stopPropagation(); 
    });
}

function initScene(pageData) {
    const totalToCreate = itemsPerPage;
    for (let i = 0; i < totalToCreate; i++) {
        const item = pageData[i] || null;
        const { wrapper, el } = createBallNode(item || { id: '', name: '', cover: null });
        if (!item) {
            wrapper.style.display = 'none';
        }
        scene.appendChild(wrapper);

        const pos = generateValidPosition();
        const ballObj = { 
            wrapper, el, type: 'ball', data: item,
            baseX: pos.x, baseY: pos.y, baseZ: pos.z,
            origBaseX: pos.x, origBaseY: pos.y, origBaseZ: pos.z,
            animScale: 1, animOpacity: 1, 
            extraOffsetY: 0, vy: 0, accel: 0, launchDelay: 0,
            stretch: 1, currentBlur: 0
        };
        spatialItems.push(ballObj);
        ballItems.push(ballObj);

        attachBallEvents(ballObj);
    }

    for (let i = 0; i < numClouds; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'item-wrapper';
        const cloud = document.createElement('div');
        cloud.className = 'cloud';
        cloud.style.transform = `scaleX(${0.8 + Math.random() * 0.6}) scaleY(${0.6 + Math.random() * 0.4})`;
        wrapper.appendChild(cloud);
        scene.appendChild(wrapper);

        const pos = generateValidPosition();
        const cloudObj = { 
            wrapper, el: cloud, type: 'cloud', 
            baseX: pos.x, baseY: pos.y, baseZ: pos.z, 
            baseOpacity: 0.7 + Math.random() * 0.3, 
            extraOffsetY: 0, vy: 0, accel: 0, launchDelay: 0,
            stretch: 1, currentBlur: 0
        };
        spatialItems.push(cloudObj);
    }
    updatePaginationButtons();
}

function launchTransitionToDetail(itemData) {
    stopIdle();
    isLaunching = true;
    document.getElementById('control-bar').style.opacity = '0';
    document.getElementById('control-bar').style.pointerEvents = 'none';
    hideBgOverlay();
    
    const focusPanel = document.getElementById('focus-panel');
    const logo = document.getElementById('logo');
    
    focusPanel.style.transition = 'transform 0.24s cubic-bezier(0.25, 1, 0.5, 1)';
    focusPanel.style.transform = 'translate(-50%, -44%) scale(0.98)';
    
    logo.style.transition = 'transform 0.24s cubic-bezier(0.25, 1, 0.5, 1)';
    logo.style.transform = 'translate(-50%, -92%)';
    
    spatialItems.forEach(item => {
        item.wrapper.style.transition = 'transform 0.24s cubic-bezier(0.25, 1, 0.5, 1)';
        item.extraOffsetY = 35 + (Math.random() * 15);
    });

    setTimeout(() => {
        const curtain = document.getElementById('liquid-curtain');
        curtain.style.transform = 'translateY(-100%)';

        spatialItems.forEach(item => {
            item.wrapper.style.transition = 'none';
            item.launchDelay = Math.random() * 100;
            item.vy = -(8 + Math.random() * 10);
            item.accel = -(1.0 + Math.random() * 1.2);
        });

        focusPanel.style.transition = 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s';
        focusPanel.style.transform = 'translate(-50%, -320%) scale(0.9, 1.05)';
        focusPanel.style.opacity = '0';

        logo.style.transition = 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s';
        logo.style.transform = 'translate(-50%, -380%)';
        logo.style.opacity = '0';

        setTimeout(() => {
            cancelAnimationFrame(animationFrameId);
            scene.style.display = 'none';
            history.pushState({ no: itemData.code }, '', `?no=${itemData.code}`);
            showDetailView(itemData);
        }, 950);
    }, 260);
}

let currentUser = { id: 'test_user', name: '測試者', avatar: 'polakumalogo.svg' };
let currentWork = null;
let currentLikesMap = {};
let currentCommentsMap = {};

// === 資料庫串接介面 (預留未來直接替換 Supabase / Firebase) ===
async function fetchComments(workId) {
    console.log('[API] 正在獲取作品留言清單:', workId);
    return currentCommentsMap[workId] || [];
}

async function fetchWorkStats(workId) {
    console.log('[API] 延遲載入作品數據 (Likes & Comments):', workId);
    const comments = await fetchComments(workId);
    const likesStatus = currentLikesMap[workId] || { count: 0, liked: false };
    return {
        likes: likesStatus.count || 0,
        comments: comments.length || 0
    };
}

async function submitComment(workId, text) {
    console.log('[API] 正在發布留言:', { workId, user: currentUser, text });
    if (!currentUser) throw new Error('請先登入');
    const newComment = {
        id: Date.now().toString(),
        userId: currentUser.id || 'test_user',
        author: currentUser.name || '測試者',
        avatar: currentUser.avatar || 'polakumalogo.svg',
        time: '剛剛',
        text: text
    };
    if (!currentCommentsMap[workId]) currentCommentsMap[workId] = [];
    currentCommentsMap[workId].unshift(newComment);
    return newComment;
}

async function deleteComment(workId, commentId) {
    console.log('[API] 正在刪除留言:', { workId, commentId });
    if (currentCommentsMap[workId]) {
        currentCommentsMap[workId] = currentCommentsMap[workId].filter(c => c.id !== commentId);
    }
    return true;
}

window.handleDeleteComment = async function(workId, commentId) {
    try {
        await deleteComment(workId, commentId);
        await renderComments(workId);
        showToast('🗑️ 留言已刪除');
        playClickSound();
    } catch (e) {
        showToast(e.message || '刪除失敗');
    }
};

async function toggleLike(workId) {
    console.log('[API] 切換愛心喜歡狀態:', { workId, user: currentUser });
    if (!currentLikesMap[workId]) {
        currentLikesMap[workId] = { count: 0, liked: false };
    }
    const status = currentLikesMap[workId];
    status.liked = !status.liked;
    status.count += status.liked ? 1 : -1;
    if (status.count < 0) status.count = 0;
    return status;
}

function updateAuthUI() {
    const authGuest = document.getElementById('auth-guest');
    const authUser = document.getElementById('auth-user');
    const authAvatar = document.getElementById('auth-avatar-img');
    const authName = document.getElementById('auth-username-label');
    const commentAuthInput = document.getElementById('comment-auth-input');
    const commentGuestPrompt = document.getElementById('comment-guest-prompt');
    const commentUserAvatar = document.getElementById('comment-user-avatar');
    const commentUserName = document.getElementById('comment-user-name');

    if (currentUser) {
        if (authGuest) authGuest.style.display = 'none';
        if (authUser) authUser.style.display = 'flex';
        if (authAvatar) authAvatar.src = currentUser.avatar || 'polakumalogo.svg';
        if (authName) authName.innerText = currentUser.name || '使用者';

        if (commentAuthInput) commentAuthInput.style.display = 'flex';
        if (commentGuestPrompt) commentGuestPrompt.style.display = 'none';
        if (commentUserAvatar) commentUserAvatar.src = currentUser.avatar || 'polakumalogo.svg';
        if (commentUserName) commentUserName.innerText = currentUser.name || '使用者';
    } else {
        if (authGuest) authGuest.style.display = 'block';
        if (authUser) authUser.style.display = 'none';

        if (commentAuthInput) commentAuthInput.style.display = 'none';
        if (commentGuestPrompt) commentGuestPrompt.style.display = 'block';
    }
}

async function renderComments(workId) {
    const listEl = document.getElementById('comment-list');
    const commentsCountEl = document.getElementById('detail-comments-count');
    if (!listEl) return;
    listEl.innerHTML = '<div class="comment-empty">載入留言中...</div>';
    const comments = await fetchComments(workId);
    
    if (commentsCountEl) commentsCountEl.innerText = comments.length;

    if (comments.length === 0) {
        listEl.innerHTML = '<div class="comment-empty" id="comment-empty">目前尚無留言，成為第一個留下想法的人吧！</div>';
        return;
    }

    listEl.innerHTML = comments.map(c => {
        const isMine = currentUser && (c.userId === currentUser.id || c.author === currentUser.name);
        const avatarHtml = (c.avatar && (c.avatar.startsWith('http') || c.avatar.includes('.'))) 
            ? `<img src="${c.avatar}" style="width:100%;height:100%;border-radius:50%">` 
            : (c.avatar || '🐻');
        const deleteBtnHtml = isMine 
            ? `<button class="comment-delete-btn" onclick="handleDeleteComment('${workId}', '${c.id}')" title="刪除此留言">刪除</button>` 
            : '';

        return `
            <div class="comment-item">
                <div class="comment-avatar">${avatarHtml}</div>
                <div class="comment-content">
                    <div class="comment-meta">
                        <span class="comment-author">${c.author}</span>
                        <div class="comment-meta-right">
                            <span class="comment-time">${c.time}</span>
                            ${deleteBtnHtml}
                        </div>
                    </div>
                    <div class="comment-text">${c.text}</div>
                </div>
            </div>
        `;
    }).join('');
}

function showDetailView(itemData, isDirect = false) {
    currentWork = itemData;
    const detailView = document.getElementById('detail-view');
    const detailId = document.getElementById('detail-id');
    const detailName = document.getElementById('detail-name');
    const detailCover = document.getElementById('detail-cover-img');
    const gallery = document.getElementById('gallery-container');
    const likesCountEl = document.getElementById('detail-likes-count');
    const fabLike = document.getElementById('fab-like');
    const commentModalTitle = document.getElementById('comment-modal-title');
    
    const workKey = itemData.code || itemData.id || 'default';

    if (detailId) detailId.innerText = itemData.id || '';
    if (detailName) detailName.innerText = itemData.name || '';
    if (detailCover) {
        detailCover.src = itemData.cover || '';
        detailCover.alt = itemData.name || 'Cover';
    }
    if (commentModalTitle) {
        commentModalTitle.innerText = `${itemData.id} ${itemData.name} 留言板`;
    }

    // 取得/更新愛心狀態
    const likeStatus = currentLikesMap[workKey] || { count: 0, liked: false };
    if (likesCountEl) likesCountEl.innerText = likeStatus.count;
    if (fabLike) {
        if (likeStatus.liked) fabLike.classList.add('liked');
        else fabLike.classList.remove('liked');
    }

    // 動態生成無縫相片牆：優先使用 photos 陣列，若為空則 fallback 到封面
    const photoList = (itemData.photos && itemData.photos.length > 0)
        ? itemData.photos
        : (itemData.cover ? [itemData.cover] : []);

    gallery.innerHTML = photoList
        .map(src => `<img class="seamless-img" src="${src}" loading="lazy" alt="" onclick="openLightbox('${src}')">`)
        .join('');

    renderComments(workKey);
    updateAuthUI();

    // 更新 URL 深層連結參數
    const cleanCode = itemData.code || (itemData.id || '').replace(/\D/g, '');
    const newUrl = `${window.location.pathname}?work=${cleanCode}`;
    if (!isDirect) {
        history.pushState({ work: cleanCode }, '', newUrl);
    }

    detailView.classList.add('show');
}

function exitDetailView() {
    currentWork = null;
    const detailView = document.getElementById('detail-view');
    detailView.classList.remove('show');
    closeLightbox();
    closeCommentModal();
    
    history.pushState(null, '', window.location.pathname);
    
    const curtain = document.getElementById('liquid-curtain');
    curtain.style.transform = 'translateY(0)';
    
    setTimeout(() => {
        scene.style.display = 'block';
        isLaunching = false;
        fastReset();
        
        spatialItems.forEach(item => {
            item.wrapper.style.transition = 'none';
            item.extraOffsetY = 0;
            item.vy = 0;
            item.accel = 0;
            item.launchDelay = 0;
            item.stretch = 1;
            item.currentBlur = 0;
            item.animOpacity = 1;
            item.el.style.filter = '';
        });
        
        const focusPanel = document.getElementById('focus-panel');
        const logo = document.getElementById('logo');
        
        focusPanel.style.transition = '';
        focusPanel.style.transform = '';
        focusPanel.style.opacity = '';
        
        logo.style.transition = '';
        logo.style.transform = '';
        logo.style.opacity = '';

        document.getElementById('control-bar').style.opacity = '1';
        document.getElementById('control-bar').style.pointerEvents = 'auto';

        render();
        startIdleTimer();
    }, 600);
}

const focusPanelEl = document.getElementById('focus-panel');
if (focusPanelEl) {
    focusPanelEl.addEventListener('click', (e) => {
        if (isLaunching) return;
        if (focusedItem && isSettled) {
            launchTransitionToDetail(focusedItem.data);
            e.stopPropagation();
        }
    });
}

function updatePaginationButtons() {
    const maxPage = Math.max(0, Math.ceil(totalItems / itemsPerPage) - 1);
    document.getElementById('btn-prev').style.display = currentPage > 0 ? 'flex' : 'none';
    document.getElementById('btn-next').style.display = currentPage < maxPage ? 'flex' : 'none';
}

function getCurrentPageData() {
    if (totalItems <= itemsPerPage) {
        return allGalleryData.slice(0, totalItems);
    }
    const maxPage = Math.max(0, Math.ceil(totalItems / itemsPerPage) - 1);
    currentPage = Math.max(0, Math.min(currentPage, maxPage));
    let start = currentPage * itemsPerPage;
    if (start + itemsPerPage > totalItems) {
        start = Math.max(0, totalItems - itemsPerPage);
    }
    return allGalleryData.slice(start, start + itemsPerPage);
}

function transitionPage(newData) {
    if (isTransitioning || isLaunching) return;
    isTransitioning = true;
    fastReset(); 
    vRotY = 0.25; 
    
    let start = performance.now();
    function animateOut(time) {
        let progress = (time - start) / 400; 
        if(progress > 1) progress = 1;
        let easeIn = progress * progress;
        
        ballItems.forEach(item => {
            if (item.data) {
                item.animScale = 1 + (easeIn * 2); 
                item.animOpacity = 1 - progress;
            }
        });
        
        if(progress < 1) requestAnimationFrame(animateOut);
        else {
            ballItems.forEach((item, i) => {
                if (i < newData.length && newData[i]) {
                    const d = newData[i];
                    item.data = d;
                    item.wrapper.style.display = '';
                    if (d.cover) {
                        item.el.style.backgroundImage = `url('${d.cover}')`;
                    } else {
                        item.el.style.background = 'linear-gradient(135deg,#a1c4fd,#c2e9fb)';
                    }
                    const enEl = item.el.querySelector('.info-en');
                    const zhEl = item.el.querySelector('.info-zh');
                    if (enEl) enEl.innerText = d.id || '';
                    if (zhEl) zhEl.innerText = d.name || '';
                    
                    const pos = generateValidPosition();
                    item.origBaseX = pos.x; item.origBaseY = pos.y; item.origBaseZ = pos.z;
                    
                    if (isRingMode) {
                        const angle = (i / Math.max(1, newData.length)) * Math.PI * 2;
                        item.targetBaseX = 600 * Math.sin(angle);
                        item.targetBaseY = -150 * Math.cos(angle); 
                        item.targetBaseZ = 600 * Math.cos(angle);
                    } else {
                        item.targetBaseX = pos.x; item.targetBaseY = pos.y; item.targetBaseZ = pos.z;
                    }
                    item.baseX = item.targetBaseX; item.baseY = item.targetBaseY; item.baseZ = item.targetBaseZ;
                } else {
                    item.data = null;
                    item.wrapper.style.display = 'none';
                    item.animOpacity = 0;
                }
            });
            
            let startIn = performance.now();
            function animateIn(time2) {
                let progress2 = (time2 - startIn) / 400;
                if(progress2 > 1) progress2 = 1;
                let easeOut = 1 - Math.pow(1 - progress2, 3);
                
                ballItems.forEach((item, i) => {
                    if (i < newData.length && item.data) {
                        item.animScale = 3 - (easeOut * 2);
                        item.animOpacity = progress2;
                    }
                });
                if(progress2 < 1) requestAnimationFrame(animateIn);
                else {
                    isTransitioning = false;
                    updatePaginationButtons();
                    startIdleTimer();
                }
            }
            requestAnimationFrame(animateIn);
        }
    }
    requestAnimationFrame(animateOut);
}

document.getElementById('btn-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    if (isTransitioning || isLaunching) return;
    if (currentPage > 0) {
        currentPage--;
        transitionPage(getCurrentPageData());
    }
});

document.getElementById('btn-next').addEventListener('click', (e) => {
    e.stopPropagation();
    if (isTransitioning || isLaunching) return;
    const maxPage = Math.max(0, Math.ceil(totalItems / itemsPerPage) - 1);
    if (currentPage < maxPage) {
        currentPage++;
        transitionPage(getCurrentPageData());
    }
});

document.getElementById('btn-rand-page').addEventListener('click', (e) => {
    e.stopPropagation();
    if (isTransitioning || isLaunching || allGalleryData.length === 0) return;
    const shuffled = [...allGalleryData].sort(() => 0.5 - Math.random());
    transitionPage(shuffled.slice(0, Math.min(allGalleryData.length, itemsPerPage)));
});

document.getElementById('btn-ring').addEventListener('click', (e) => {
    e.stopPropagation();
    if (isTransitioning || isLaunching) return;
    fastReset();
    
    isRingMode = !isRingMode;
    const btn = document.getElementById('btn-ring');
    if(isRingMode) btn.classList.add('active');
    else btn.classList.remove('active');
    
    const activeCount = ballItems.filter(b => b.data !== null).length;
    ballItems.forEach((item, i) => {
        if (!item.data) return;
        if (isRingMode) {
            const angle = (i / Math.max(1, activeCount)) * Math.PI * 2;
            item.targetBaseX = 600 * Math.sin(angle);
            item.targetBaseY = -150 * Math.cos(angle); 
            item.targetBaseZ = 600 * Math.cos(angle);
        } else {
            item.targetBaseX = item.origBaseX;
            item.targetBaseY = item.origBaseY;
            item.targetBaseZ = item.origBaseZ;
        }
    });
    if (isRingMode) targetRotX = 0.15; 
});

document.getElementById('btn-bubble').addEventListener('click', (e) => {
    e.stopPropagation();
    if(isTransitioning || isLaunching || allGalleryData.length === 0) return;
    fastReset();
    
    const randItem = allGalleryData[Math.floor(Math.random() * allGalleryData.length)];
    const { wrapper, el } = createBallNode(randItem);
    scene.appendChild(wrapper);

    const bubbleObj = { 
        wrapper, el, type: 'ball', isTemp: true, data: randItem,
        animScale: 1, animOpacity: 1, extraOffsetY: 0, vy: 0, accel: 0, launchDelay: 0,
        stretch: 1, currentBlur: 0
    };
    
    attachBallEvents(bubbleObj);
    
    bubbleObj.baseX = sphereRadius * Math.sin(rotY) * Math.cos(rotX);
    bubbleObj.baseY = -sphereRadius * Math.sin(rotX);
    bubbleObj.baseZ = sphereRadius * Math.cos(rotY) * Math.cos(rotX);
    
    spatialItems.push(bubbleObj);
    triggerFocus(bubbleObj);
});

// === 作品列表選擇面板邏輯 ===
const listModal = document.getElementById('list-modal');
const btnList = document.getElementById('btn-list');
const btnCloseList = document.getElementById('list-modal-close');
const backdropList = document.getElementById('list-modal-backdrop');

function renderGalleryList() {
    const container = document.getElementById('list-items-container');
    const countEl = document.getElementById('list-modal-count');
    if (!container) return;
    if (countEl) countEl.innerText = `(${allGalleryData.length})`;
    
    container.innerHTML = allGalleryData.map((item) => `
        <div class="list-item-row" data-code="${item.code || ''}">
            <div class="list-item-thumb" style="${item.cover ? `background-image: url('${item.cover}')` : 'background: linear-gradient(135deg,#a1c4fd,#c2e9fb)'}"></div>
            <div class="list-item-info">
                <div class="list-item-id">${item.id}</div>
                <div class="list-item-name">${item.name}</div>
            </div>
            <div class="list-item-arrow">➔</div>
        </div>
    `).join('');

    container.querySelectorAll('.list-item-row').forEach((row, index) => {
        row.addEventListener('mouseenter', () => playHoverSound());
        row.addEventListener('click', () => {
            closeListModal();
            selectItemFromList(allGalleryData[index]);
        });
    });
}

function selectItemFromList(itemData) {
    if (!itemData) return;
    fastReset();
    
    const existing = ballItems.find(b => b.data && b.data.id === itemData.id);
    if (existing) {
        triggerFocus(existing);
    } else {
        const { wrapper, el } = createBallNode(itemData);
        scene.appendChild(wrapper);
        const bubbleObj = { 
            wrapper, el, type: 'ball', isTemp: true, data: itemData,
            animScale: 1, animOpacity: 1, extraOffsetY: 0, vy: 0, accel: 0, launchDelay: 0,
            stretch: 1, currentBlur: 0
        };
        attachBallEvents(bubbleObj);
        bubbleObj.baseX = sphereRadius * Math.sin(rotY) * Math.cos(rotX);
        bubbleObj.baseY = -sphereRadius * Math.sin(rotX);
        bubbleObj.baseZ = sphereRadius * Math.cos(rotY) * Math.cos(rotX);
        spatialItems.push(bubbleObj);
        triggerFocus(bubbleObj);
    }
}

function openListModal() {
    if (isLaunching) return;
    stopIdle();
    renderGalleryList();
    if (listModal) listModal.classList.add('show');
}

function closeListModal() {
    if (listModal) listModal.classList.remove('show');
    startIdleTimer();
}

if (btnList) {
    btnList.addEventListener('click', (e) => {
        e.stopPropagation();
        if (listModal && listModal.classList.contains('show')) closeListModal();
        else openListModal();
    });
}
if (btnCloseList) btnCloseList.addEventListener('click', closeListModal);
if (backdropList) backdropList.addEventListener('click', closeListModal);

// 為底部控制列所有按鈕綁定懸停音效
document.querySelectorAll('.ctrl-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
        playHoverSound();
    });
});

// === Toast 輕提示 ===
function showToast(msg) {
    let toast = document.getElementById('gallery-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'gallery-toast';
        toast.className = 'gallery-toast';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2200);
}

// === 全螢幕圖片燈箱 (Lightbox) ===
function openLightbox(src) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    if (!modal || !img) return;
    img.src = src;
    modal.classList.add('show');
    playClickSound();
}
window.openLightbox = openLightbox;

function closeLightbox() {
    const modal = document.getElementById('lightbox-modal');
    if (modal) modal.classList.remove('show');
}
window.closeLightbox = closeLightbox;

const btnLightboxClose = document.getElementById('lightbox-close-btn');
const backdropLightbox = document.getElementById('lightbox-backdrop');
if (btnLightboxClose) btnLightboxClose.addEventListener('click', closeLightbox);
if (backdropLightbox) backdropLightbox.addEventListener('click', closeLightbox);

// === 留言板彈出視窗 (Comment Modal) ===
const commentModal = document.getElementById('comment-modal');
const btnFabComment = document.getElementById('fab-comment');
const btnCloseComment = document.getElementById('comment-modal-close');
const backdropComment = document.getElementById('comment-modal-backdrop');
const commentSubmitBtn = document.getElementById('comment-submit-btn');
const commentInputText = document.getElementById('comment-input-text');
const commentList = document.getElementById('comment-list');

function openCommentModal() {
    if (commentModal) commentModal.classList.add('show');
    playClickSound();
}

function closeCommentModal() {
    if (commentModal) commentModal.classList.remove('show');
}

if (btnFabComment) btnFabComment.addEventListener('click', openCommentModal);
if (btnCloseComment) btnCloseComment.addEventListener('click', closeCommentModal);
if (backdropComment) backdropComment.addEventListener('click', closeCommentModal);

if (commentSubmitBtn && commentInputText) {
    commentSubmitBtn.addEventListener('click', async () => {
        const text = commentInputText.value.trim();
        if (!text) return;
        if (!currentWork) return;
        const workKey = currentWork.code || currentWork.id || 'default';
        try {
            await submitComment(workKey, text);
            commentInputText.value = '';
            renderComments(workKey);
            showToast('💬 留言發表成功！');
        } catch (e) {
            showToast(e.message || '留言失敗');
        }
    });
    commentInputText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commentSubmitBtn.click();
    });
}

// === 底部 FAB 控制列按鈕互動 ===
const fabBack = document.getElementById('fab-back');
if (fabBack) fabBack.addEventListener('click', exitDetailView);

const fabShare = document.getElementById('fab-share');
if (fabShare) {
    fabShare.addEventListener('click', () => {
        const currentWorkId = currentWork ? (currentWork.code || (currentWork.id || '').replace(/\D/g, '')) : '';
        const shareUrl = currentWorkId 
            ? `${window.location.origin}${window.location.pathname}?work=${currentWorkId}`
            : window.location.href;

        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast('🔗 作品專屬連結已複製！');
            }).catch(() => {
                showToast('🔗 連結：' + shareUrl);
            });
        } else {
            showToast('🔗 連結：' + shareUrl);
        }
        playClickSound();
    });
}

const fabLike = document.getElementById('fab-like');
const likesCountEl = document.getElementById('detail-likes-count');
if (fabLike) {
    fabLike.addEventListener('click', async () => {
        if (!currentWork) return;
        const workKey = currentWork.code || currentWork.id || 'default';
        const res = await toggleLike(workKey);
        if (likesCountEl) likesCountEl.innerText = res.count;
        if (res.liked) {
            fabLike.classList.add('liked');
            showToast('❤️ 已加入喜愛清單！');
        } else {
            fabLike.classList.remove('liked');
            showToast('🤍 已取消喜愛');
        }
        playClickSound();
    });
}

// === 登入 / 登出事件綁定 ===
const btnAuthLogin = document.getElementById('btn-auth-login');
const btnCommentLogin = document.getElementById('btn-comment-login');
const btnAuthLogout = document.getElementById('btn-auth-logout');

function handleLogin() {
    currentUser = {
        name: 'Pola 旅人',
        avatar: 'polakumalogo.svg'
    };
    updateAuthUI();
    showToast('✨ 登入成功！歡迎回來 PolaKuma');
    playClickSound();
}

function handleLogout() {
    currentUser = null;
    updateAuthUI();
    showToast('已安全登出');
    playClickSound();
}

if (btnAuthLogin) btnAuthLogin.addEventListener('click', handleLogin);
if (btnCommentLogin) btnCommentLogin.addEventListener('click', handleLogin);
if (btnAuthLogout) btnAuthLogout.addEventListener('click', handleLogout);

// 為所有 FAB 按鈕與燈箱按鈕綁定懸停音效
document.querySelectorAll('.fab-btn, .auth-btn, .lightbox-close-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
        playHoverSound();
    });
});

function getShortestAngle(current, target) {
    let diff = (target - current) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff;
}

function fastReset() {
    if (isLaunching) return;
    document.querySelectorAll('.breakout-particle-item, .particle-explosion-item').forEach(el => el.remove());
    if (focusedItem) {
        const badge = focusedItem.el.querySelector('.ball-stats-badge');
        if (badge) badge.remove();
        focusedItem.wrapper.classList.remove('settled', 'focus-moving');
        if (focusedItem.isTemp) {
            focusedItem.wrapper.remove();
            spatialItems.splice(spatialItems.indexOf(focusedItem), 1);
        }
        focusedItem = null;
    }
    document.body.classList.remove('card-active');
    if (listModal && listModal.classList.contains('show')) listModal.classList.remove('show');
    isSettled = false;
    hideBgOverlay();
    startIdleTimer();
}

// === 點開泡泡時的優雅飄浮放大淡化特效 (Float, Scale & Fade Animation) ===
function triggerParticleExplosion(ballObj, stats = { likes: 0, comments: 0 }) {
    if (!ballObj || !ballObj.el) return;

    const likesCount = Number(stats.likes) || 0;
    const commentsCount = Number(stats.comments) || 0;

    // 若愛心與留言皆為 0，則不觸發任何特效
    if (likesCount <= 0 && commentsCount <= 0) return;

    // 取得卡片左下角數據標籤（若存在）或卡片本體的螢幕絕對座標
    const badgeEl = ballObj.el.querySelector('.ball-stats-badge');
    const badgeRect = badgeEl 
        ? badgeEl.getBoundingClientRect() 
        : ballObj.el.getBoundingClientRect();

    const startX = badgeEl ? (badgeRect.left + 10) : (badgeRect.left + 25);
    const startY = badgeEl ? (badgeRect.top + badgeRect.height / 2) : (badgeRect.bottom - 25);

    const items = [];

    // 僅在 likes > 0 時生成 ❤️ 特效
    if (likesCount > 0) {
        const heartSize = Math.min(80, Math.max(24, 24 + (likesCount * 1.5)));
        const dX = -(45 + Math.random() * 55); // 向左外側漂移 -45px ~ -100px
        const dY = -(40 + Math.random() * 60); // 向上/偏下漂移 -40px ~ -100px

        items.push({
            emoji: '❤️',
            size: heartSize,
            offsetX: -8,
            delay: 0,
            dX: dX,
            dY: dY,
            finalScale: 1.8 + Math.random() * 0.3,
            rotate: (Math.random() - 0.5) * 35 // -17.5deg ~ +17.5deg 柔和微旋轉
        });
    }

    // 僅在 comments > 0 時生成 💬 特效
    if (commentsCount > 0) {
        const commentSize = Math.min(80, Math.max(24, 24 + (commentsCount * 2.5)));
        const dX = -(35 + Math.random() * 55);
        const dY = -(55 + Math.random() * 55);

        items.push({
            emoji: '💬',
            size: commentSize,
            offsetX: 20,
            delay: 100,
            dX: dX,
            dY: dY,
            finalScale: 1.8 + Math.random() * 0.3,
            rotate: (Math.random() - 0.5) * 35
        });
    }

    items.forEach(item => {
        setTimeout(() => {
            if (!focusedItem || focusedItem !== ballObj) return;

            const particle = document.createElement('div');
            particle.className = 'breakout-particle-item';
            particle.innerText = item.emoji;
            particle.style.cssText = `
                position: fixed;
                left: ${startX + item.offsetX}px;
                top: ${startY}px;
                font-size: ${item.size}px;
                line-height: 1;
                pointer-events: none;
                z-index: 100000;
                user-select: none;
                filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.35));
                will-change: transform, opacity;
            `;
            document.body.appendChild(particle);

            const duration = 1600 + Math.random() * 300; // 1.6s ~ 1.9s 柔和飄浮

            const animation = particle.animate([
                { 
                    transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', 
                    opacity: 1 
                },
                { 
                    transform: `translate(calc(-50% + ${item.dX * 0.3}px), calc(-50% + ${item.dY * 0.3}px)) scale(1.3) rotate(${item.rotate * 0.3}deg)`, 
                    opacity: 0.9, 
                    offset: 0.3 
                },
                { 
                    transform: `translate(calc(-50% + ${item.dX * 0.75}px), calc(-50% + ${item.dY * 0.75}px)) scale(1.6) rotate(${item.rotate * 0.75}deg)`, 
                    opacity: 0.5, 
                    offset: 0.7 
                },
                { 
                    transform: `translate(calc(-50% + ${item.dX}px), calc(-50% + ${item.dY}px)) scale(${item.finalScale}) rotate(${item.rotate}deg)`, 
                    opacity: 0 
                }
            ], {
                duration: duration,
                easing: 'cubic-bezier(0.16, 1, 0.3, 1)', // ease-out 柔和減速
                fill: 'forwards'
            });

            animation.onfinish = () => {
                particle.remove();
            };
        }, item.delay);
    });
}

function triggerFocus(item) {
    stopIdle();
    fastReset();
    focusedItem = item;
    focusedItem.wrapper.classList.add('focus-moving');
    isFocusing = true;
    vRotX = 0; vRotY = 0; 

    let targetY = Math.atan2(item.baseX, item.baseZ) + Math.PI;
    let hyp = Math.hypot(item.baseX, item.baseZ);
    let targetX = Math.atan2(-item.baseY, hyp);

    targetRotY = getShortestAngle(rotY, targetY);
    targetRotX = getShortestAngle(rotX, targetX);

    if (item.data) {
        showBgOverlay(item.data);
    }
}

function render() {
    spatialItems.forEach(item => {
        if (item.targetBaseX !== undefined && !item.isTemp) {
            item.baseX += (item.targetBaseX - item.baseX) * 0.05;
            item.baseY += (item.targetBaseY - item.baseY) * 0.05;
            item.baseZ += (item.targetBaseZ - item.baseZ) * 0.05;
        }

        if (isLaunching && item.vy !== 0) {
            if (item.launchDelay > 0) {
                item.launchDelay -= 16;
            } else {
                item.vy += item.accel;
                item.extraOffsetY += item.vy;
                
                let targetStretch = Math.min(1.15, 1 + Math.abs(item.vy) * 0.004);
                item.stretch += (targetStretch - item.stretch) * 0.1;
                item.animOpacity = Math.max(0, 1 - (Math.abs(item.extraOffsetY) / 1500));
            }
        } else {
            item.stretch += (1 - item.stretch) * 0.1;
        }
    });

    currentAutoRotateSpeed.x += (targetAutoRotateSpeed.x - currentAutoRotateSpeed.x) * 0.02;
    currentAutoRotateSpeed.y += (targetAutoRotateSpeed.y - currentAutoRotateSpeed.y) * 0.02;

    if (isFocusing) {
        rotX += (targetRotX - rotX) * 0.08;
        rotY += (targetRotY - rotY) * 0.08;
        
        if (Math.abs(targetRotX - rotX) < 0.005 && Math.abs(targetRotY - rotY) < 0.005) {
            rotX = targetRotX; rotY = targetRotY;
            isFocusing = false; 
            
            if (focusedItem && !isSettled) {
                isSettled = true;
                const currentFocused = focusedItem;
                const dist = Math.hypot(currentFocused.baseX, currentFocused.baseY, currentFocused.baseZ);
                const settledPScale = focalLength / (focalLength - dist);
                
                const targetCSSScale = 300 / (250 * settledPScale);
                currentFocused.el.style.setProperty('--target-scale', targetCSSScale);
                
                currentFocused.wrapper.classList.remove('focus-moving');
                currentFocused.wrapper.classList.add('settled'); 
                currentFocused.wrapper.style.zIndex = 2000; 
                document.body.classList.add('card-active');
                playClickSound();

                // 延遲載入 (Lazy Loading) 該作品的愛心與留言數量，並動態掛載標籤與特效
                const workData = currentFocused.data;
                const workKey = workData ? (workData.code || workData.id || 'default') : 'default';

                fetchWorkStats(workKey).then(stats => {
                    if (focusedItem !== currentFocused) return;

                    // 條件顯示：若為 0 則隱藏對應圖示；若兩者皆為 0 則不顯示數據標籤
                    let badgeItems = [];
                    if (stats.likes > 0) {
                        badgeItems.push(`<span class="ball-stat-item">❤️ <span class="ball-stat-likes">${stats.likes}</span></span>`);
                    }
                    if (stats.comments > 0) {
                        badgeItems.push(`<span class="ball-stat-item">💬 <span class="ball-stat-comments">${stats.comments}</span></span>`);
                    }

                    let badgeEl = currentFocused.el.querySelector('.ball-stats-badge');
                    if (badgeItems.length > 0) {
                        if (!badgeEl) {
                            badgeEl = document.createElement('div');
                            badgeEl.className = 'ball-stats-badge';
                            currentFocused.el.appendChild(badgeEl);
                        }
                        badgeEl.innerHTML = badgeItems.join('');
                        badgeEl.style.opacity = '1';
                        badgeEl.style.transform = 'translateY(0)';
                    } else if (badgeEl) {
                        badgeEl.remove();
                    }

                    // 帶入最新數據觸發單一符號跳躍物理特效 (若為 0 則內部直接防呆不生成)
                    triggerParticleExplosion(currentFocused, stats);
                }).catch(err => {
                    console.warn('載入作品數據失敗：', err);
                });
            }
        }
    } else if (!isLaunching) {
        rotX += vRotX + currentAutoRotateSpeed.x;
        rotY += vRotY + currentAutoRotateSpeed.y;
        vRotX *= 0.92;
        vRotY *= 0.92;
    }

    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

    spatialItems.forEach(item => {
        if (item.type === 'ball' && !item.data) return;
        let x1 = item.baseX * cosY - item.baseZ * sinY;
        let z1 = item.baseZ * cosY + item.baseX * sinY;
        let y2 = item.baseY * cosX - z1 * sinX;
        let z2 = z1 * cosX + item.baseY * sinX;

        let perspectiveScale = (focalLength / (focalLength + z2)) * (item.animScale !== undefined ? item.animScale : 1);
        let currentY = (y2 * perspectiveScale) + (item.extraOffsetY || 0);
        
        let scaleX = perspectiveScale * (2 - item.stretch);
        let scaleY = perspectiveScale * item.stretch;
        item.wrapper.style.transform = `translate3d(${x1 * perspectiveScale}px, ${currentY}px, 0) scale(${scaleX}, ${scaleY})`;
        
        const isThisFocused = (item === focusedItem);
        if (!isThisFocused && !isLaunching) item.wrapper.style.zIndex = Math.floor(1000 - z2);
        
        let opacity = 1; let baseBlur = 0;
        if (z2 > 0) {
            opacity = Math.max(0.1, 1 - (z2 / sphereRadius));
            baseBlur = z2 / 120;
        }
        if (isThisFocused && item.type === 'ball') { baseBlur = 0; opacity = 1; }

        let targetMotionBlur = (isLaunching && item.vy !== 0 && item.launchDelay <= 0) ? Math.min(8, Math.abs(item.vy) * 0.2) : 0;
        item.currentBlur += (targetMotionBlur - item.currentBlur) * 0.15;

        if (item.type === 'ball') {
            item.el.style.filter = `blur(${baseBlur + item.currentBlur}px)`;
            item.el.style.opacity = opacity * (item.animOpacity !== undefined ? item.animOpacity : 1);
        } else if (item.type === 'cloud') {
            let screenCenterDist = Math.hypot(x1, y2);
            let centerFade = Math.min(1, screenCenterDist / 350);
            item.wrapper.style.opacity = opacity * item.baseOpacity * centerFade * (item.animOpacity !== undefined ? item.animOpacity : 1); 
            item.el.style.filter = `blur(${15 + baseBlur + item.currentBlur}px)`; 
        }
    });
    animationFrameId = requestAnimationFrame(render);
}

scene.addEventListener('pointerdown', (e) => {
    stopIdle();
    if (isLaunching || e.target.closest('.ctrl-btn')) return;
    pointerDownX = e.clientX; pointerDownY = e.clientY;
    if (e.target === scene || e.target.id === 'logo') fastReset();
    isDragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
    if (!isDragging || isLaunching) return;
    stopIdle();
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;

    vRotY = dx * 0.005;
    vRotX = -dy * 0.005;

    lastMouseX = e.clientX; lastMouseY = e.clientY;
    if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 5) {
        fastReset(); isFocusing = false; 
    }
});

window.addEventListener('pointerup', () => { 
    isDragging = false; 
    startIdleTimer();
});

// ============================================================
// 啟動：先 fetch gallery-data.json，再初始化場景
// ============================================================
async function bootstrap() {
    try {
        const res = await fetch('./gallery-data.json?t=' + Date.now());
        if (res.ok) {
            const data = await res.json();
            allGalleryData = Array.isArray(data) ? data : [];
        } else {
            console.warn('gallery-data.json 不存在，使用空資料集');
            allGalleryData = [];
        }
    } catch (e) {
        console.warn('無法載入 gallery-data.json：', e.message);
        allGalleryData = [];
    }

    // 反向排序：依編號數字由大到小（最新作品優先在 Page 0）
    allGalleryData.sort((a, b) => {
        const numA = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
        if (numB !== numA) return numB - numA;
        return (b.code || '').localeCompare(a.code || '', undefined, { numeric: true });
    });

    totalItems = allGalleryData.length;
    currentPage = 0;
    const pageData = getCurrentPageData();
    initScene(pageData);
    render();

    // 檢查深層連結 (Deep Linking)
    const urlParams = new URLSearchParams(window.location.search);
    const targetWork = urlParams.get('work') || urlParams.get('no');
    if (targetWork) {
        const cleanTarget = targetWork.trim().toLowerCase();
        const targetNum = targetWork.replace(/\D/g, '');
        const foundItem = allGalleryData.find(item => {
            const itemCode = (item.code || '').toLowerCase();
            const itemId = (item.id || '').toLowerCase();
            const itemNum = (item.id || '').replace(/\D/g, '');
            return itemCode === cleanTarget || itemId === cleanTarget || (targetNum && itemNum === targetNum);
        });

        if (foundItem) {
            scene.style.display = 'none';
            document.getElementById('control-bar').style.opacity = '0';
            document.getElementById('control-bar').style.pointerEvents = 'none';
            showDetailView(foundItem, true);
            return;
        }
    }

    updateAuthUI();
    startIdleTimer();
}

// === R18 年齡驗證邏輯 (Age Gate) ===
function initAgeGate(onVerified) {
    const overlay = document.getElementById('age-gate-overlay');
    const btnConfirm = document.getElementById('btn-age-confirm');
    const btnCancel = document.getElementById('btn-age-cancel');

    const isVerified = localStorage.getItem('polakuma_age_verified') === 'true';

    if (isVerified) {
        if (overlay) overlay.remove();
        if (typeof onVerified === 'function') onVerified();
        return;
    }

    if (overlay) {
        overlay.style.display = 'flex';
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            localStorage.setItem('polakuma_age_verified', 'true');
            if (overlay) {
                overlay.classList.add('hide');
                setTimeout(() => overlay.remove(), 400);
            }
            playClickSound();
            if (typeof onVerified === 'function') onVerified();
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            window.location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        });
    }
}

initAgeGate(bootstrap);