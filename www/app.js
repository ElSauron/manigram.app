const proxy = 'https://api.allorigins.win/raw?url=';
const profileEndpoint = username => `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
const publicAccounts = ['natgeo', 'nasa', 'nike', 'adobe', 'behance'];
const state = { profile: null, posts: [], requestId: 0 };

const feedElement = document.querySelector('#feed');
const storiesElement = document.querySelector('#stories');
const exploreGrid = document.querySelector('#explore-grid');
const reelsList = document.querySelector('#reels-list');
const profileDetails = document.querySelector('#profile-details');
const searchInput = document.querySelector('#profile-search');
const searchStatus = document.querySelector('#search-status');
const searchSpinner = document.querySelector('#search-spinner');
const globalStatus = document.querySelector('#global-status');
const modal = document.querySelector('#caption-modal');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function cleanUsername(value) {
  return value.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30);
}

function setSearchStatus(message, isError = false, isLoading = false) {
  searchStatus.textContent = message;
  searchStatus.className = isError ? 'text-[#ff007f]' : 'text-white/50';
  searchSpinner.classList.toggle('hidden', !isLoading);
}

function showGlobalStatus(message) {
  globalStatus.textContent = message;
  window.setTimeout(() => { globalStatus.textContent = ''; }, 5000);
}

function emptyState(title, description) {
  return `<div class="px-5 py-16 text-center"><p class="font-serif text-2xl text-white/80">${escapeHtml(title)}</p><p class="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/45">${escapeHtml(description)}</p></div>`;
}

function normalizeProfile(payload, requestedUsername) {
  const user = payload?.data?.user || payload?.graphql?.user || payload?.user || payload;
  if (!user?.username && !user?.profile_pic_url_hd && !user?.profile_pic_url) return null;
  const edges = user.edge_owner_to_timeline_media?.edges || user.edge_web_media?.edges || user.medias?.nodes || [];
  const storyEdges = user.edge_story_media?.edges || user.story?.items || [];
  const posts = edges.map(edge => {
    const post = edge.node || edge;
    const video = post.video_versions?.[0]?.url || post.video_url || '';
    return {
      id: post.id || post.pk || post.shortcode || post.display_url,
      user: user.username || requestedUsername,
      name: user.full_name || user.username || requestedUsername,
      avatar: user.profile_pic_url_hd || user.profile_pic_url || '',
      image: post.display_url || post.thumbnail_src || post.image_versions2?.candidates?.[0]?.url || video,
      video,
      likes: Number(post.edge_liked_by?.count || post.edge_media_preview_like?.count || 0).toLocaleString('tr-TR'),
      caption: post.edge_media_to_caption?.edges?.[0]?.node?.text || post.caption?.text || post.caption || '',
      timestamp: Number(post.taken_at_timestamp || post.taken_at || post.date || 0),
      url: post.shortcode ? `https://www.instagram.com/p/${post.shortcode}/` : 'https://www.instagram.com/'
    };
  }).filter(post => post.image);
  return {
    username: user.username || requestedUsername,
    name: user.full_name || user.username || requestedUsername,
    bio: user.biography || '',
    avatar: user.profile_pic_url_hd || user.profile_pic_url || '',
    postsCount: user.edge_owner_to_timeline_media?.count ?? user.media_count ?? posts.length,
    followers: user.edge_followed_by?.count ?? user.follower_count ?? 0,
    following: user.edge_follow?.count ?? user.following_count ?? 0,
    isPrivate: Boolean(user.is_private),
    posts,
    stories: storyEdges.map(edge => {
      const story = edge.node || edge;
      return story.display_url || story.thumbnail_src || story.image_versions2?.candidates?.[0]?.url || '';
    }).filter(Boolean)
  };
}

async function fetchProfile(username, requestId) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const response = await fetch(`${proxy}${encodeURIComponent(profileEndpoint(username))}`, { signal: controller.signal });
  window.clearTimeout(timeout);
  if (!response.ok) throw new Error('istek');
  const profile = normalizeProfile(await response.json(), username);
  if (!profile || requestId !== state.requestId) throw new Error('bulunamadı');
  return profile;
}

async function fetchPublicAccount(username) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const response = await fetch(`${proxy}${encodeURIComponent(profileEndpoint(username))}`, { signal: controller.signal });
  window.clearTimeout(timeout);
  if (!response.ok) throw new Error('istek');
  const profile = normalizeProfile(await response.json(), username);
  if (!profile || profile.isPrivate) throw new Error('gizli');
  return profile;
}

async function loadInitialFeed() {
  setSearchStatus('Herkese açık akış hazırlanıyor...', false, true);
  const results = await Promise.allSettled(publicAccounts.map(fetchPublicAccount));
  const profiles = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  const posts = profiles.flatMap(profile => profile.posts).sort((first, second) => second.timestamp - first.timestamp);
  if (!posts.length) {
    renderStories(); renderFeed([]); renderExplore([]); renderReels([]); renderProfile();
    setSearchStatus('Canlı akış şu anda alınamadı. Keşfet sekmesinden bir kullanıcı adı arayın.', true, false);
    showGlobalStatus('Canlı herkese açık kaynaklara şu anda ulaşılamıyor.');
    return;
  }
  state.posts = posts; state.profile = profiles[0];
  renderStories({ stories: profiles.flatMap(profile => profile.stories), username: 'Manigram' });
  renderFeed(posts); renderExplore(posts); renderReels(posts); renderProfile(profiles[0]);
  setSearchStatus(`${profiles.length} herkese açık hesaptan canlı içerik gösteriliyor.`, false, false);
}

function renderStories(profile = null) {
  if (!profile) {
    storiesElement.innerHTML = '<p class="py-2 text-xs text-white/45">Hikâyeler, herkese açık profil aradıktan sonra burada görünür.</p>';
    return;
  }
  if (!profile.stories.length) {
    storiesElement.innerHTML = '<p class="py-2 text-xs text-white/45">Bu uç nokta için herkese açık hikâye verisi sunulmadı.</p>';
    return;
  }
  storiesElement.innerHTML = profile.stories.map((image, index) => `<button type="button" class="flex w-16 shrink-0 flex-col items-center gap-1.5 text-[10px] text-white/60" data-story-index="${index}"><span class="rounded-full bg-gradient-to-tr from-[#ff007f] to-[#e1306c] p-[2px]"><img class="h-14 w-14 rounded-full border-2 border-black object-cover" src="${escapeHtml(image)}" alt="@${escapeHtml(profile.username)} hikâye önizlemesi"></span><span class="w-full truncate">@${escapeHtml(profile.username)}</span></button>`).join('');
  storiesElement.querySelectorAll('[data-story-index]').forEach(button => button.addEventListener('click', () => showGlobalStatus('Hikâye önizlemesi herkese açık veriden yüklendi.')));
}

function postCard(post, index) {
  return `<article class="feed-card" style="animation-delay:${Math.min(index * 50, 240)}ms"><header class="flex items-center gap-3 px-4 py-3"><img class="h-9 w-9 rounded-full object-cover" src="${escapeHtml(post.avatar)}" alt="@${escapeHtml(post.user)} profil fotoğrafı"><div class="min-w-0"><p class="truncate text-sm font-bold">@${escapeHtml(post.user)}</p><p class="truncate text-xs text-white/45">${escapeHtml(post.name)}</p></div><span class="ml-auto text-white/45">•••</span></header><button class="post-open block w-full text-left" type="button" data-user="@${escapeHtml(post.user)}" data-caption="${escapeHtml(post.caption)}" data-url="${escapeHtml(post.url)}"><img class="post-media w-full" src="${escapeHtml(post.image)}" alt="@${escapeHtml(post.user)} herkese açık gönderisi" loading="lazy"></button><div class="px-4 pb-5 pt-3"><div class="flex items-center gap-5 text-white/90"><button class="like-button" type="button" aria-label="Gönderiyi beğen">♡</button><button type="button" aria-label="Yorumları görüntüle">◯</button><button type="button" aria-label="Gönderiyi paylaş">⌁</button><button class="ml-auto" type="button" aria-label="Gönderiyi kaydet">▢</button></div><p class="mt-2 text-xs font-bold">${escapeHtml(post.likes)} beğenme</p><p class="mt-2 text-sm leading-6"><strong>@${escapeHtml(post.user)}</strong> ${escapeHtml(post.caption)}</p></div></article>`;
}

function bindPostActions() {
  feedElement.querySelectorAll('.post-open').forEach(button => button.addEventListener('click', () => openCaption(button.dataset)));
  feedElement.querySelectorAll('.like-button').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); button.classList.toggle('text-[#ff007f]'); button.textContent = button.classList.contains('text-[#ff007f]') ? '♥' : '♡'; }));
}

function renderFeed(posts) {
  feedElement.innerHTML = posts.length ? posts.map(postCard).join('') : emptyState('Gönderi bulunamadı', 'Bu herkese açık profilden görüntülenebilir medya alınamadı.');
  bindPostActions();
}

function renderExplore(posts) {
  exploreGrid.innerHTML = posts.length ? posts.map(post => `<button class="explore-tile" type="button" data-user="@${escapeHtml(post.user)}" data-caption="${escapeHtml(post.caption)}" data-url="${escapeHtml(post.url)}"><img class="h-full w-full object-cover" src="${escapeHtml(post.image)}" alt="@${escapeHtml(post.user)} keşfet gönderisi" loading="lazy"></button>`).join('') : emptyState('Keşfet boş', 'Gerçek medya görmek için herkese açık bir kullanıcı adı arayın.');
  exploreGrid.querySelectorAll('.explore-tile').forEach(button => button.addEventListener('click', () => openCaption(button.dataset)));
}

function renderReels(posts) {
  const reels = posts.filter(post => post.video);
  reelsList.innerHTML = reels.length ? reels.map(post => `<article class="reel-card relative mb-3 overflow-hidden rounded-xl bg-[#111]"><video class="h-full min-h-[calc(100svh-160px)] w-full object-cover" src="${escapeHtml(post.video)}" poster="${escapeHtml(post.image)}" controls muted playsinline loop preload="metadata"></video><div class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-20"><p class="text-sm font-bold">@${escapeHtml(post.user)}</p><p class="mt-1 text-sm text-white/75">${escapeHtml(post.caption)}</p></div></article>`).join('') : emptyState('Reels bulunamadı', 'Aradığınız herkese açık profilde oynatılabilir kısa video yok.');
}

function renderProfile(profile) {
  profileDetails.innerHTML = profile ? `<div class="border-b border-white/10 pb-7"><div class="flex items-center gap-5"><img class="h-24 w-24 rounded-full border-2 border-[#ff007f] object-cover shadow-[0_0_22px_rgb(255_0_127_/_0.35)]" src="${escapeHtml(profile.avatar)}" alt="@${escapeHtml(profile.username)} profil fotoğrafı"><div><h1 class="text-xl font-bold">@${escapeHtml(profile.username)}</h1><p class="mt-1 text-sm text-white/60">${escapeHtml(profile.name)}</p></div></div><p class="mt-5 whitespace-pre-wrap text-sm leading-6 text-white/70">${escapeHtml(profile.bio) || 'Bu profil biyografi paylaşmadı.'}</p><dl class="mt-6 flex gap-7 text-sm"><div><dt class="text-white/45">Gönderi</dt><dd class="mt-1 font-bold">${Number(profile.postsCount).toLocaleString('tr-TR')}</dd></div><div><dt class="text-white/45">Takipçi</dt><dd class="mt-1 font-bold">${Number(profile.followers).toLocaleString('tr-TR')}</dd></div><div><dt class="text-white/45">Takip</dt><dd class="mt-1 font-bold">${Number(profile.following).toLocaleString('tr-TR')}</dd></div></dl></div>` : emptyState('Profil bilgisi yok', 'Profil sekmesinde ayrıntıları görmek için Keşfet sekmesinden arama yapın.');
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('is-active', screen.id === screenId));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('is-active', item.dataset.screen === screenId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openCaption(data) {
  document.querySelector('#caption-author').textContent = data.user;
  document.querySelector('#caption-copy').textContent = data.caption || 'Bu gönderide açıklama yok.';
  document.querySelector('#caption-link').href = data.url;
  modal.classList.remove('hidden'); modal.classList.add('flex'); document.querySelector('#caption-close').focus();
}
function closeCaption() { modal.classList.add('hidden'); modal.classList.remove('flex'); }

async function searchPublicProfile(event) {
  event?.preventDefault();
  const username = cleanUsername(searchInput.value || document.querySelector('#top-search').value);
  if (!username) { setSearchStatus('Bir kullanıcı adı girin.', true, false); showScreen('explore-screen'); return; }
  document.querySelector('#top-search').value = username;
  searchInput.value = username;
  const requestId = ++state.requestId;
  setSearchStatus(`@${username} aranıyor...`, false, true);
  try {
    const profile = await fetchProfile(username, requestId);
    if (profile.isPrivate) throw new Error('gizli');
    state.profile = profile; state.posts = profile.posts;
    renderStories(profile); renderFeed(state.posts); renderExplore(state.posts); renderReels(state.posts); renderProfile(profile); setSearchStatus(`@${profile.username} için gerçek herkese açık içerikler gösteriliyor.`); showScreen('feed-screen');
  } catch (error) {
    if (requestId !== state.requestId) return;
    const message = error.message === 'gizli' ? 'Bu profil gizli. Yalnızca herkese açık profiller görüntülenebilir.' : 'Profil alınamadı. Kullanıcı adını ve bağlantınızı kontrol edip tekrar deneyin.';
    state.profile = null; state.posts = []; renderStories(); renderFeed([]); renderExplore([]); renderReels([]); renderProfile(); setSearchStatus(message, true, false); showScreen('explore-screen');
  }
}

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => showScreen(item.dataset.screen)));
document.querySelector('#header-search').addEventListener('click', () => { showScreen('explore-screen'); searchInput.focus(); });
document.querySelector('#top-search-form').addEventListener('submit', searchPublicProfile);
document.querySelector('#explore-search-form').addEventListener('submit', searchPublicProfile);
document.querySelector('#header-activity').addEventListener('click', () => showGlobalStatus('Manigram hesapsız çalışır ve giriş bilgilerinizi saklamaz.'));
document.querySelector('#caption-close').addEventListener('click', closeCaption);
modal.addEventListener('click', event => { if (event.target === modal) closeCaption(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCaption(); });

renderStories(); renderExplore([]); renderReels([]); renderProfile();
loadInitialFeed();
