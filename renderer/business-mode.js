(() => {
  const api = window.weekcal;
  let extra = { desktopMode: true, lockWidget: false, theme: 'dark' };
  let resizeTimer = null;
  let observer = null;

  const $ = id => document.getElementById(id);

  function effectiveTheme() {
    if (extra.theme !== 'system') return extra.theme || 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme() {
    document.documentElement.dataset.theme = effectiveTheme();
  }

  function addBusinessControls() {
    const panel = $('settingsPanel');
    if (!panel || $('businessAppearanceSection')) return;
    const sections = panel.querySelectorAll('.setting-section');
    const first = sections[0];

    const appearance = document.createElement('div');
    appearance.id = 'businessAppearanceSection';
    appearance.className = 'setting-section business-extra';
    appearance.innerHTML = `
      <h3>Apariencia Business</h3>
      <label class="setting-row"><span>Tema</span>
        <select id="businessTheme"><option value="dark">Oscuro</option><option value="light">Claro</option><option value="system">Sistema</option></select>
      </label>
      <div class="business-note">Las horas se comprimen o expanden automáticamente para que todo el rango seleccionado permanezca visible.</div>`;

    const windows = document.createElement('div');
    windows.id = 'businessDesktopSection';
    windows.className = 'setting-section business-extra';
    windows.innerHTML = `
      <h3>Widget de escritorio</h3>
      <label class="toggle-row"><span>Fijar al escritorio</span><input id="businessDesktop" type="checkbox" /></label>
      <label class="toggle-row"><span>Bloquear posición y tamaño</span><input id="businessLock" type="checkbox" /></label>
      <div id="businessDesktopNote" class="business-note"></div>`;

    panel.insertBefore(appearance, first || null);
    panel.insertBefore(windows, first || null);

    $('businessTheme').value = extra.theme || 'dark';
    $('businessDesktop').checked = Boolean(extra.desktopMode);
    $('businessLock').checked = Boolean(extra.lockWidget);

    $('businessTheme').onchange = async e => {
      extra = await api.setTheme(e.target.value);
      applyTheme();
    };
    $('businessDesktop').onchange = async e => {
      const response = await api.setDesktopMode(e.target.checked);
      extra = response.settings;
      syncBusinessControls();
      showToast(response.result?.ok === false ? `No se pudo fijar: ${response.result.error}` : (e.target.checked ? 'Widget fijado al escritorio' : 'Modo ventana activado'));
    };
    $('businessLock').onchange = async e => {
      extra = await api.setLock(e.target.checked);
      syncBusinessControls();
      showToast(e.target.checked ? 'Posición y tamaño bloqueados' : 'Widget desbloqueado');
    };
    syncBusinessControls();
  }

  function syncBusinessControls() {
    const theme = $('businessTheme');
    const desktop = $('businessDesktop');
    const lock = $('businessLock');
    if (theme) theme.value = extra.theme || 'dark';
    if (desktop) desktop.checked = Boolean(extra.desktopMode);
    if (lock) lock.checked = Boolean(extra.lockWidget);
    const note = $('businessDesktopNote');
    if (note) note.textContent = extra.desktopMode
      ? 'Queda en la capa del escritorio, detrás de tus programas. Puedes redimensionarlo mientras no esté bloqueado.'
      : 'Se comporta como una ventana normal sin aparecer en la barra de tareas.';

    const pinToggle = $('pinToggle');
    const pinBtn = $('pinBtn');
    if (pinToggle) pinToggle.disabled = Boolean(extra.desktopMode);
    if (pinBtn) pinBtn.disabled = Boolean(extra.desktopMode);
  }

  function showToast(message) {
    const t = $('toast');
    if (!t) return;
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(t._businessTimer);
    t._businessTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function markWeekends(grid) {
    const head = grid.querySelector('.grid-head');
    const area = grid.querySelector('.time-area');
    if (!head || !area) return;
    const heads = [...head.querySelectorAll('.day-head')];
    const cols = [...area.querySelectorAll('.day-col')];
    if (heads.length === 7) {
      heads.slice(-2).forEach(el => el.classList.add('weekend'));
      cols.slice(-2).forEach(el => el.classList.add('weekend'));
    }
  }

  function scalePx(el, prop, factor, minimum = 0) {
    const key = `businessBase${prop[0].toUpperCase()}${prop.slice(1)}`;
    if (!el.dataset[key]) {
      const value = parseFloat(el.style[prop]);
      if (Number.isFinite(value)) el.dataset[key] = String(value);
    }
    const base = parseFloat(el.dataset[key]);
    if (Number.isFinite(base)) el.style[prop] = `${Math.max(minimum, base * factor)}px`;
  }

  function fitHours() {
    const grid = $('weekGrid');
    if (!grid) return;
    const head = grid.querySelector('.grid-head');
    const all = grid.querySelector('.all-day-row');
    const area = grid.querySelector('.time-area');
    if (!head || !all || !area) return;

    markWeekends(grid);
    const baseHeight = parseFloat(area.dataset.businessBaseHeight || area.style.height);
    if (!Number.isFinite(baseHeight) || baseHeight <= 0) return;
    area.dataset.businessBaseHeight = String(baseHeight);

    const available = Math.max(190, grid.clientHeight - head.offsetHeight - all.offsetHeight);
    const factor = available / baseHeight;
    area.style.height = `${available}px`;

    area.querySelectorAll('.time-label,.hour-line,.half-line,.event,.now-line').forEach(el => {
      scalePx(el, 'top', factor, 0);
      if (el.classList.contains('event')) {
        scalePx(el, 'height', factor, 16);
        const h = parseFloat(el.style.height) || 0;
        el.classList.toggle('business-tiny', h < 25);
        el.classList.toggle('business-compact', h < 40);
      }
    });
  }

  function scheduleFit() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitHours, 40);
  }

  async function init() {
    try { extra = await api.getExtraSettings(); } catch {}
    applyTheme();
    addBusinessControls();

    const grid = $('weekGrid');
    if (grid) {
      observer = new MutationObserver(scheduleFit);
      observer.observe(grid, { childList: true, subtree: true });
    }
    window.addEventListener('resize', scheduleFit);
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (extra.theme === 'system') applyTheme();
    });
    setTimeout(fitHours, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
