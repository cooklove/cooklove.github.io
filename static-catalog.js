/* Public catalog only. This file is included by the GitHub Pages exporter. */
(function (root) {
  'use strict';
  // Decimal arithmetic matches the API's ROUND_HALF_UP, including tiny quantities.
  function roundedRatio(quantity, servings, base, places = null) {
    const [mantissa, exponent = '0'] = String(quantity).toLowerCase().split('e');
    const decimals = (mantissa.split('.')[1] || '').length - Number(exponent);
    let numerator = BigInt(mantissa.replace('.', '')) * BigInt(servings);
    let denominator = BigInt(base);
    if (decimals >= 0) denominator *= 10n ** BigInt(decimals);
    else numerator *= 10n ** BigInt(-decimals);
    const precision = places === null ? (numerator < denominator ? 100n : 10n) : 10n ** BigInt(places);
    const scaled = numerator * precision;
    const rounded = scaled / denominator + (scaled % denominator * 2n >= denominator ? 1n : 0n);
    return Number(rounded) / Number(precision);
  }
  function scale(recipe, servings) {
    if (!Number.isInteger(servings) || servings < 1 || servings > 24) throw new Error('Porzioni: intero tra 1 e 24');
    const result = JSON.parse(JSON.stringify(recipe));
    for (const item of result.ingredients) {
      if (item.quantity !== null && item.scalable) item.quantity = roundedRatio(item.quantity, servings, recipe.base_servings);
    }
    result.servings = servings;
    if (result.nutrition && Number.isFinite(result.nutrition.total_kcal)) {
      const total = recipe.nutrition.total_kcal;
      result.nutrition.total_kcal = roundedRatio(total, servings, recipe.base_servings, 1);
      result.nutrition.per_serving_kcal = roundedRatio(total, 1, recipe.base_servings, 1);
    }
    return result;
  }
  function filter(recipes, params) {
    const query = (params.get('q') || '').toLocaleLowerCase('it-IT');
    return recipes.filter(r => ['region', 'category'].every(key => !params.get(key) || r[key] === params.get(key)) &&
      [r.title, r.region, r.category, ...r.ingredients.map(i => i.name)].join(' ').toLocaleLowerCase('it-IT').includes(query));
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = {scale, filter}; return; }
  const base = new URL('./', document.baseURI);
  let pending;
  const catalog = () => pending || (pending = fetch(new URL('catalog.json', base), {cache: 'no-cache', signal: AbortSignal.timeout(15000)})
    .then(response => { if (!response.ok) throw new Error('Catalogo non disponibile'); return response.json(); })
    .catch(error => { pending = null; throw error; }));
  root.CookStatic = {
    href: path => new URL(path.replace(/^\//, ''), base).href,
    recipeURL: slug => { const url = new URL(base); url.searchParams.set('ricetta', slug); return url.href; },
    slug: new URLSearchParams(location.search).get('ricetta'),
    async request(path) {
      const url = new URL(path, base), recipes = await catalog();
      if (url.pathname === '/api/taxonomy') return {regions: [...new Set(recipes.map(r => r.region))].sort(), categories: [...new Set(recipes.map(r => r.category))].sort()};
      if (url.pathname === '/api/recipes') return filter(recipes, url.searchParams);
      if (url.pathname.startsWith('/api/recipes/')) {
        const recipe = recipes.find(r => r.slug === decodeURIComponent(url.pathname.slice('/api/recipes/'.length)));
        if (!recipe) throw new Error('Ricetta non disponibile');
        return scale(recipe, url.searchParams.has('servings') ? Number(url.searchParams.get('servings')) : recipe.base_servings);
      }
      throw new Error('Funzione in preparazione');
    },
    refresh() { pending = null; }
  };
})(typeof window === 'undefined' ? globalThis : window);
