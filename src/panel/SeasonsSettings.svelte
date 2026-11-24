{#if addon?.id === pluginId}
  {#each SECTIONS as section (section.id)}
    <div class="card mb-3">
      <div class="card-header">
        <i class="fa-solid {section.icon} me-2"></i>{$_(`settings.sections.${section.id}`)}
      </div>
      <div class="card-body">
        {#each section.fields as field (field.key)}
          {#if !field.showIf || field.showIf(config)}
            <div class="row mb-3">
              <label class="col-md-6 col-form-label" for="seasons-{field.key}">
                <span class="d-block">{$_(`settings.fields.${field.key}.title`)}</span>
                <small class="text-body-secondary">{$_(`settings.fields.${field.key}.desc`)}</small>
              </label>
              <div class="col-md-6 d-flex align-items-center">
                {#if field.type === 'switch'}
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" id="seasons-{field.key}" bind:checked={config[field.key]} />
                  </div>
                {:else if field.type === 'select'}
                  <select class="form-select" id="seasons-{field.key}" bind:value={config[field.key]}>
                    {#each field.options as option (option)}
                      <option value={option}>{$_(`settings.options.${field.key}.${option}`)}</option>
                    {/each}
                  </select>
                {:else if field.type === 'range'}
                  <div class="d-flex align-items-center gap-3 w-100">
                    <input
                      class="form-range flex-grow-1"
                      type="range"
                      id="seasons-{field.key}"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      bind:value={config[field.key]} />
                    <span class="badge text-bg-primary">×{formatMultiplier(config[field.key], field.step < 0.1 ? 2 : 1, $currentLanguage)}</span>
                  </div>
                {:else if field.type === 'number'}
                  <input class="form-control" type="number" id="seasons-{field.key}" min={field.min} max={field.max} bind:value={config[field.key]} />
                {:else if field.type === 'date'}
                  <input class="form-control" type="text" id="seasons-{field.key}" placeholder={$_('settings.date-placeholder')} maxlength="5" bind:value={config[field.key]} />
                {:else if field.type === 'text'}
                  <input class="form-control font-monospace" type="text" id="seasons-{field.key}" maxlength="500" placeholder={field.placeholder ?? ''} bind:value={config[field.key]} />
                {:else if field.type === 'textarea'}
                  <textarea class="form-control font-monospace" id="seasons-{field.key}" rows="3" maxlength="2000" placeholder={field.placeholder ?? ''} bind:value={config[field.key]}></textarea>
                {:else if field.type === 'pool'}
                  <div class="d-flex flex-wrap gap-2">
                    {#each WEATHERS as weather (weather)}
                      <input
                        type="checkbox"
                        class="btn-check"
                        id="seasons-pool-{weather}"
                        checked={config.randomPool.includes(weather)}
                        onchange={(e) => togglePool(weather, e.currentTarget.checked)} />
                      <label class="btn btn-sm btn-outline-primary" for="seasons-pool-{weather}">
                        {$_(`settings.options.weather.${weather}`)}
                      </label>
                    {/each}
                  </div>
                {:else if field.type === 'city'}
                  <div class="w-100">
                    {#if config.city}
                      <div class="d-flex align-items-center gap-2 mb-2">
                        <span class="badge text-bg-primary">
                          <i class="fa-solid fa-location-dot me-1"></i>{cityLabel(config.city)}
                        </span>
                        <button type="button" class="btn btn-sm btn-link" onclick={() => (config.city = null)}>
                          {$_('settings.city.remove')}
                        </button>
                      </div>
                    {/if}
                    <form class="input-group" onsubmit={searchCities}>
                      <input class="form-control" type="search" id="seasons-{field.key}" placeholder={$_('settings.city.placeholder')} bind:value={cityQuery} />
                      <button class="btn btn-outline-primary" type="submit" disabled={searching || cityQuery.trim().length < 2}>
                        {#if searching}<span class="spinner-border spinner-border-sm"></span>{:else}{$_('settings.city.search')}{/if}
                      </button>
                    </form>
                    {#if cityResults.length}
                      <div class="list-group mt-2">
                        {#each cityResults as city, i (i)}
                          <button type="button" class="list-group-item list-group-item-action fw-normal" onclick={() => pickCity(city)}>
                            <span class="text-body">{city.name}</span>
                            <small class="text-body-secondary ms-1">{[city.admin, city.country].filter(Boolean).join(', ')}</small>
                          </button>
                        {/each}
                      </div>
                    {:else if searched}
                      <small class="text-body-secondary d-block mt-2">{$_('settings.city.none')}</small>
                    {/if}
                    <small class="text-body-secondary d-block mt-2">{$_('settings.city.credit')}</small>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/each}

  <div class="d-flex justify-content-end gap-2 mb-3">
    <button type="button" class="btn btn-link" disabled={!hasChanges || saving} onclick={reset}>
      {$_('generic.undo')}
    </button>
    <button type="button" class="btn btn-primary" disabled={!hasChanges || saving} onclick={save}>
      {#if saving}<span class="spinner-border spinner-border-sm me-2"></span>{/if}
      {$_('generic.save')}
    </button>
  </div>
{/if}

<script>
  import { api } from '@panomc/sdk/plugin-api';
  import { currentLanguage } from '@panomc/sdk/utils/language';
  import { _, showSuccessToast, showErrorToast } from '../main.js';
  import { DEFAULTS, WEATHERS, WINDS, normalize } from '../theme/seasons/config.js';

  const pluginId = 'pano-plugin-seasons';

  let { addon } = $props();

  /** The range badge in the panel's number format (1,5 in tr / ru). */
  function formatMultiplier(value, digits, language) {
    try {
      return new Intl.NumberFormat(language?.code ?? 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value));
    } catch {
      return Number(value).toFixed(digits);
    }
  }

  /** @type {any} */
  let config = $state(normalize(addon?.config ?? DEFAULTS));
  let initial = $state(JSON.stringify(normalize(addon?.config ?? DEFAULTS)));
  let hasChanges = $derived(JSON.stringify(config) !== initial);
  let saving = $state(false);

  let cityQuery = $state('');
  /** @type {any[]} */
  let cityResults = $state([]);
  let searching = $state(false);
  let searched = $state(false);


  const SECTIONS = [
    {
      id: 'general',
      icon: 'fa-power-off',
      fields: [
        { key: 'enabled', type: 'switch' },
        { key: 'schedule', type: 'select', options: ['ALWAYS', 'WINTER', 'DATES'] },
        { key: 'startDate', type: 'date', showIf: (c) => c.schedule === 'DATES' },
        { key: 'endDate', type: 'date', showIf: (c) => c.schedule === 'DATES' },
        { key: 'excludedPaths', type: 'textarea', placeholder: '/store/checkout\n/panel/addons*' },
      ],
    },
    {
      id: 'weather',
      icon: 'fa-cloud-sun-rain',
      fields: [
        { key: 'source', type: 'select', options: ['MANUAL', 'OUTSIDE', 'RANDOM', 'SEASON'] },
        { key: 'weather', type: 'select', options: WEATHERS, showIf: (c) => c.source === 'MANUAL' },
        { key: 'randomPool', type: 'pool', showIf: (c) => c.source === 'RANDOM' },
        { key: 'city', type: 'city', showIf: (c) => c.source === 'OUTSIDE' || c.source === 'SEASON' },
        { key: 'heavySnow', type: 'switch', showIf: (c) => c.source !== 'OUTSIDE' },
        { key: 'lightning', type: 'switch', showIf: (c) => c.source !== 'OUTSIDE' },
        { key: 'wind', type: 'select', options: WINDS },
        { key: 'density', type: 'range', min: 0.2, max: 3, step: 0.1 },
        { key: 'speed', type: 'range', min: 0.3, max: 2, step: 0.1 },
      ],
    },
    {
      id: 'snow',
      icon: 'fa-snowflake',
      fields: [
        { key: 'settle', type: 'switch' },
        { key: 'groundSnow', type: 'switch' },
        { key: 'pileSpeed', type: 'range', min: 0.2, max: 3, step: 0.1, showIf: (c) => c.settle || c.groundSnow },
        { key: 'surfaces', type: 'text', placeholder: '.my-box, #news', showIf: (c) => c.settle },
        { key: 'excludeSurfaces', type: 'text', placeholder: '.no-snow', showIf: (c) => c.settle },
      ],
    },
    {
      id: 'play',
      icon: 'fa-snowman',
      fields: [
        { key: 'snowballs', type: 'switch' },
        { key: 'snowmen', type: 'switch', showIf: (c) => c.snowballs },
        { key: 'dressUp', type: 'switch', showIf: (c) => c.snowballs && c.snowmen },
        { key: 'trees', type: 'switch' },
        { key: 'decorations', type: 'switch' },
        { key: 'maxPlaced', type: 'number', min: 1, max: 200, showIf: (c) => c.trees || c.decorations },
      ],
    },
    {
      id: 'visitors',
      icon: 'fa-sleigh',
      fields: [
        { key: 'visitors', type: 'switch' },
        { key: 'santa', type: 'switch', showIf: (c) => c.visitors },
        { key: 'snowmenFight', type: 'switch', showIf: (c) => c.visitors },
        { key: 'yeti', type: 'switch', showIf: (c) => c.visitors },
        { key: 'plough', type: 'switch', showIf: (c) => c.visitors },
        { key: 'oftenVisits', type: 'switch', showIf: (c) => c.visitors },
      ],
    },
    {
      id: 'look',
      icon: 'fa-palette',
      fields: [
        { key: 'layer', type: 'select', options: ['FRONT', 'BEHIND'] },
        { key: 'wallpaper', type: 'switch' },
        { key: 'wallpaperDayNight', type: 'switch', showIf: (c) => c.wallpaper },
        { key: 'panel', type: 'switch' },
        { key: 'panelAmount', type: 'range', min: 0.1, max: 1, step: 0.05, showIf: (c) => c.panel },
        { key: 'mobile', type: 'switch' },
        { key: 'reducedMotion', type: 'switch' },
        { key: 'visitorControls', type: 'switch' },
      ],
    },
  ];

  function cityLabel(city) {
    return [city.name, city.admin, city.country].filter(Boolean).join(', ');
  }

  function togglePool(weather, on) {
    const set = new Set(config.randomPool);
    if (on) set.add(weather);
    else if (set.size > 1) set.delete(weather);
    config.randomPool = WEATHERS.filter((w) => set.has(w));
  }

  async function searchCities(e) {
    e.preventDefault();
    const q = cityQuery.trim();
    if (q.length < 2 || searching) return;
    searching = true;
    try {
      const lang = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
      const res = await api.panel.get({ path: `/cities?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}` });
      cityResults = res?.items ?? [];
    } catch {
      cityResults = [];
    } finally {
      searching = false;
      searched = true;
    }
  }

  function pickCity(city) {
    config.city = city;
    cityResults = [];
    searched = false;
    cityQuery = '';
  }

  function reset() {
    config = normalize(JSON.parse(initial));
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      const body = normalize($state.snapshot(config));
      const saved = await api.panel.put({ path: '/config', body });
      config = normalize(saved?.enabled === undefined ? body : saved);
      initial = JSON.stringify(config);
      if (addon) addon.config = $state.snapshot(config);
      await showSuccessToast(`plugins.${pluginId}.toasts.save-success`);
    } catch (e) {
      console.error(`[${pluginId}] Failed to save settings`, e);
      await showErrorToast(`plugins.${pluginId}.toasts.save-error`);
    } finally {
      saving = false;
    }
  }
</script>
