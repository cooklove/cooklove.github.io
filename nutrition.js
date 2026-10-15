/* Energy estimates, source disclosure and explicit incomplete-data state. */
(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => new Intl.NumberFormat('it-IT', {maximumFractionDigits:0}).format(value);
  function render(recipe) {
    const n = recipe.nutrition || {};
    const known = n.status === 'estimated' && Number.isFinite(n.total_kcal) && Number.isFinite(n.per_serving_kcal);
    const summary = known ? `<p><strong>≈ ${number(n.per_serving_kcal)} kcal per persona</strong><br>≈ ${number(n.total_kcal)} kcal per ${esc(recipe.servings ?? recipe.base_servings)} persone</p>` : '<p>Calorie non ancora stimabili per questa preparazione.</p>';
    const missing = (n.missing || []).length ? `<ul>${n.missing.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>` : '';
    const ingredients = known && n.ingredients?.length ? `<details><summary>Come è calcolata la stima</summary><p class="tiny">Riferimenti per la ricetta base da ${esc(recipe.base_servings)} persone. Le calorie per persona rimangono uguali quando cambi soltanto il numero delle porzioni.</p><ul>${n.ingredients.map(i=>`<li><strong>${esc(i.ingredient)}</strong>: ${number(i.edible_grams)} g, ${number(i.kcal)} kcal nella ricetta base.<br><small>${esc(i.reference_food)} · ${esc(i.reference_code || `FDC ${i.fdc_id}`)}${i.approximation?' · alimento equivalente indicativo':''}. ${esc(i.conversion)} ${esc(i.note)}</small></li>`).join('')}</ul>${n.excluded?.length?`<p class="tiny">Apporto non conteggiato: ${esc(n.excluded.join('; '))}.</p>`:''}<p><a href="https://fdc.nal.usda.gov/download-datasets/" target="_blank" rel="noopener noreferrer">Fonte: USDA FoodData Central — SR Legacy 2018</a> · <a href="https://doi.org/10.57745/RDMHWY" target="_blank" rel="noopener noreferrer">Anses — Ciqual 2025 (Etalab 2.0)</a></p></details>` : '';
    return `<section class="panel nutrition"><h3>Calorie stimate</h3>${summary}<p class="tiny">${esc(n.method || 'Dati nutrizionali non disponibili.')}</p>${missing}${ingredients}</section>`;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {render};
  else root.CookNutrition = {render};
})(typeof window === 'undefined' ? globalThis : window);
