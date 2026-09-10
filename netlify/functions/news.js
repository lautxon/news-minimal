// netlify/functions/news.js

const SOURCES = [
  { id: 'pagina12', name: 'Página/12', url: 'https://www.pagina12.com.ar/rss/portada', defaultCategory: 'politica' },
  { id: 'infobae', name: 'Infobae', url: 'https://www.infobae.com/arc/outboundfeeds/rss/', defaultCategory: 'politica' },
  { id: 'bbc', name: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml', defaultCategory: 'internacional' },
  { id: 'elpais', name: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/portada', defaultCategory: 'internacional' },
  { id: 'nytimes', name: 'NY Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', defaultCategory: 'internacional' },
  { id: 'wired', name: 'Wired', url: 'https://www.wired.com/feed/rss', defaultCategory: 'tecnologia' },
  { id: 'sciencedaily', name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', defaultCategory: 'ciencia' }
];

const CATEGORY_KEYWORDS = {
  politica: ['congreso', 'senado', 'diputado', 'presidente', 'eleccion', 'gobierno', 'ley', 'ministro', 'política', 'legislatura', 'cámara', 'candidato'],
  economia: ['mercado', 'dólar', 'inflación', 'peso', 'banco', 'economía', 'bolsa', 'fmi', 'deuda', 'acciones', 'bcra', 'tarifas', 'impuesto', 'afip'],
  ciencia: ['científic', 'estudio', 'investigación', 'descubrimiento', 'universidad', 'nasa', 'genoma', 'célula', 'salud', 'medicina', 'vacuna', 'virus', 'espacio'],
  tecnologia: ['ia', 'inteligencia artificial', 'app', 'software', 'tecnología', 'google', 'apple', 'chatgpt', 'celular', 'smartphone', 'redes', 'internet', 'datos'],
  cultura: ['arte', 'museo', 'libro', 'cultura', 'literatura', 'teatro', 'música', 'exposición', 'artista', 'escritor', 'poeta', 'novela', 'cuento', 'danza', 'concierto', 'banda', 'cantante', 'álbum'],
  cine: ['película', 'cine', 'estreno', 'festival', 'director', 'actor', 'actriz', 'oscar', 'serie', 'netflix', 'disney', 'streaming', 'film', 'trailer', 'hollywood', 'taquilla', 'producción']
};

function detectCategory(title, defaultCat) {
  const lower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return defaultCat;
}

function parseRSS(xmlText, source) {
  const articles = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  let count = 0;
  
  while ((match = itemRegex.exec(xmlText)) !== null && count < 50) {
    const item = match[1];
    
    const getTag = (tag) => {
      const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const m = item.match(regex);
      if (!m) return '';
      return m[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '');
    };

    const title = getTag('title') || 'Sin título';
    const description = getTag('description') || '';
    const link = getTag('link') || '#';
    const pubDate = getTag('pubDate') || new Date().toISOString();
    
    const mediaMatch = item.match(/<media:content[^>]+url="([^"]+)"/i) || item.match(/<enclosure[^>]+url="([^"]+)"/i);
    const image = mediaMatch ? mediaMatch[1] : null;

    articles.push({
      id: `${source.id}-${count}-${Date.now()}`,
      title,
      excerpt: description.slice(0, 180) + (description.length > 180 ? '…' : ''),
      url: link,
      source: source.id,
      sourceName: source.name,
      category: detectCategory(title, source.defaultCategory),
      publishedAt: new Date(pubDate).toISOString(),
      image
    });
    count++;
  }
  return articles;
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { 
      headers: { 'User-Agent': 'NewsMinimalPWA/1.0', 'Accept': 'application/rss+xml' },
      signal: controller.signal 
    });
    clearTimeout(timer);
    return res.ok ? await res.text() : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ✅ Handler principal de Netlify
exports.handler = async (event) => {
  const category = event.queryStringParameters?.category || 'all';
  const source = event.queryStringParameters?.source || 'all';
  
  try {
    const sourcesToFetch = SOURCES.filter(s => source === 'all' || s.id === source);
    
    const results = await Promise.all(
      sourcesToFetch.map(async (src) => {
        const xml = await fetchWithTimeout(src.url);
        if (!xml) return [];
        try { return parseRSS(xml, src); } 
        catch { return []; }
      })
    );
    
    let allArticles = results.flat();
    
    if (category !== 'all') {
      allArticles = allArticles.filter(a => a.category === category);
    }
    
    allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        count: allArticles.length,
        articles: allArticles
      })
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Error interno', details: error.message })
    };
  }
};
