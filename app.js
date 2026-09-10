/**
 * News Minimal PWA - Lógica Frontend
 * Consume el Cloudflare Worker y renderiza las noticias.
 */

// ⚠️ REEMPLAZA con la URL real de tu Worker de Netlify
const WORKER_URL = 'https://minimal-news.netlify.app/.netlify/functions/news';

const state = {
  category: 'all',
  source: 'all',
  articles: [],
  loading: false,
  offline: !navigator.onLine
};

const DOM = {
  container: document.getElementById('news-container'),
  sourceSelect: document.getElementById('source-select'),
  installBtn: document.getElementById('install-btn'),
  offlineStatus: document.getElementById('offline-status'),
  tabs: document.querySelectorAll('[role="tab"]')
};

// === FETCH REAL AL WORKER ===
async function fetchNews({ category = 'all', source = 'all' } = {}) {
  state.loading = true;
  renderSkeleton();

  const params = new URLSearchParams({ category, source });

  try {
    // 1. Hacemos la petición a Netlify
    const response = await fetch(`${WORKER_URL}?${params}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // 2. ✅ ESTA ERA LA LÍNEA QUE FALTABA: Convertimos la respuesta a JSON
    const data = await response.json();

    // 3. Guardamos en caché local por si se va el internet
    if (data.articles && data.articles.length > 0) {
      localStorage.setItem('news_cache', JSON.stringify({
        articles: data.articles,
        timestamp: Date.now()
      }));
    }

    // 4. Actualizamos el estado y renderizamos
    state.articles = data.articles || [];
    state.loading = false;
    renderArticles();

  } catch (error) {
    console.error('Fetch error:', error);
    state.loading = false;
    
    // 5. Fallback: Si falla la red, intentamos mostrar lo último guardado
    const cached = localStorage.getItem('news_cache');
    if (cached) {
      const parsedCache = JSON.parse(cached);
      let filtered = [...parsedCache.articles];
      
      if (category !== 'all') filtered = filtered.filter(a => a.category === category);
      if (source !== 'all') filtered = filtered.filter(a => a.source === source);
      
      state.articles = filtered;
      renderArticles(true); // true indica que es modo offline
    } else {
      renderError('No se pudieron cargar las noticias. Verificá tu conexión.');
    }
  }
}
// === RENDERIZADO ===
function renderSkeleton() {
  const skeletons = Array(4).fill('').map(() => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line title"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  `).join('');
  DOM.container.innerHTML = skeletons;
}

function renderError(message) {
  DOM.container.innerHTML = `<p class="empty-state" role="alert">⚠️ ${message}</p>`;
}

function renderArticles(fromCache = false) {
  if (state.articles.length === 0) {
    DOM.container.innerHTML = `
      <p class="empty-state">
        ${fromCache ? '📡 Sin conexión. Mostrando últimas noticias guardadas.' : 'No hay noticias para los filtros seleccionados.'}
      </p>`;
    return;
  }

  const cacheBadge = fromCache 
    ? '<p class="empty-state" style="padding: 12px 0; margin-bottom: 8px;">📡 Modo offline · Noticias guardadas</p>' 
    : '';

  DOM.container.innerHTML = cacheBadge + state.articles.map(article => `
    <article class="news-card" itemscope itemtype="https://schema.org/NewsArticle">
      <p class="news-card__source">${escapeHtml(article.sourceName || article.source)}</p>
      <h2 class="news-card__title">
        <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" data-external="true">
          <span itemprop="headline">${escapeHtml(article.title)}</span>
        </a>
      </h2>
      <p class="news-card__excerpt" itemprop="description">${escapeHtml(article.excerpt)}</p>
      <div class="news-card__meta">
        <time datetime="${article.publishedAt}" itemprop="datePublished">
          ${formatDate(article.publishedAt)}
        </time>
        <span class="news-card__category">${formatCategory(article.category)}</span>
      </div>
    </article>
  `).join('');
}

// === UTILIDADES ===
function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diff = (now - date) / 1000;
    
    if (diff < 3600) return `Hace ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff/3600)} h`;
    if (diff < 172800) return 'Ayer';
    
    return date.toLocaleDateString('es-AR', { 
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}

function formatCategory(key) {
  const cats = {
    politica: 'Política', economia: 'Economía', ciencia: 'Ciencia',
    tecnologia: 'Tecnología', cultura: 'Cultura', cine: 'Cine',
    internacional: 'Internacional'
  };
  return cats[key] || key;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// === EVENT LISTENERS ===
DOM.tabs.forEach(tab => {
  tab.addEventListener('click', (e) => {
    DOM.tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
    e.currentTarget.setAttribute('aria-selected', 'true');
    state.category = e.currentTarget.dataset.category;
    fetchNews({ category: state.category, source: state.source });
  });
});

DOM.sourceSelect.addEventListener('change', (e) => {
  state.source = e.target.value;
  fetchNews({ category: state.category, source: state.source });
});

window.addEventListener('online', () => {
  state.offline = false;
  DOM.offlineStatus.textContent = '🟢 Conectado';
  DOM.offlineStatus.style.color = '';
  fetchNews({ category: state.category, source: state.source });
});

window.addEventListener('offline', () => {
  state.offline = true;
  DOM.offlineStatus.textContent = '🔴 Offline';
  DOM.offlineStatus.style.color = '#ff6b6b';
  renderArticles(true);
});

// PWA Install
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  DOM.installBtn.hidden = false;
});

DOM.installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    DOM.installBtn.hidden = true;
  }
});

// === INICIALIZACIÓN ===
document.addEventListener('DOMContentLoaded', () => {
  fetchNews();
  DOM.offlineStatus.textContent = state.offline ? '🔴 Offline' : '🟢 Conectado';
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW error:', err));
  }
});
