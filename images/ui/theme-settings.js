/* =========================================================
   DATAVAULT DLP · CONFIGURACIÓN DE APARIENCIA
   Tema claro / oscuro / sistema, densidad de tablas,
   reducir animaciones y menú contraído al iniciar.
   Solo cambia atributos visuales en <html> y <body>;
   no toca la lógica de archivos, solicitudes ni sesión.
   Las preferencias se guardan en este navegador.
   ========================================================= */
(() => {
  const KEYS = {
    theme: 'dv-ui-theme',
    density: 'dv-ui-density',
    reduceMotion: 'dv-ui-reduce-motion',
    collapsed: 'dv-ui-sidebar-collapsed'
  };
  const root = document.documentElement;
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function read(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* almacenamiento bloqueado: solo esta sesión */ }
  }

  // ---------- Tema ----------
  function resolveTheme(choice) {
    if (choice === 'system') return systemDark && systemDark.matches ? 'dark' : 'light';
    return choice === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(choice) {
    const resolved = resolveTheme(choice);
    // Sin animación: el cambio de tema se usa a menudo y debe sentirse inmediato.
    root.setAttribute('data-theme', resolved);
    document.querySelectorAll('[data-theme-choice]').forEach(card => {
      card.setAttribute('aria-checked', String(card.dataset.themeChoice === choice));
    });
    const quick = document.getElementById('dvThemeQuick');
    if (quick) {
      const label = resolved === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
      quick.setAttribute('aria-label', label);
      quick.title = label;
    }
  }
  function setTheme(choice) {
    write(KEYS.theme, choice);
    applyTheme(choice);
  }
  if (systemDark) {
    const onSystemChange = () => { if (read(KEYS.theme, 'light') === 'system') applyTheme('system'); };
    if (systemDark.addEventListener) systemDark.addEventListener('change', onSystemChange);
    else if (systemDark.addListener) systemDark.addListener(onSystemChange);
  }

  // ---------- Pantalla ----------
  function applyDensity(value) {
    root.setAttribute('data-density', value);
    document.querySelectorAll('[data-density-choice]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.densityChoice === value));
    });
  }
  function applyReduceMotion(on) {
    if (on) root.setAttribute('data-reduce-motion', 'true');
    else root.removeAttribute('data-reduce-motion');
    setSwitch('reduce-motion', on);
  }
  function setSwitch(name, on) {
    const el = document.querySelector(`.dv-switch[data-setting="${name}"]`);
    if (el) el.setAttribute('aria-checked', String(on));
  }

  // ---------- Vista Configuración ----------
  // No pasa por showView: activa su propia sección y deja intacta la navegación existente.
  window.dvOpenSettings = function () {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-configuracion')?.classList.add('active');
    document.querySelectorAll('#sidebar .nav-item').forEach(el => {
      const mine = el.id === 'navConfigDirect';
      el.classList.toggle('active', mine);
      if (mine) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    if (typeof window.closeMobileSidebar === 'function') window.closeMobileSidebar();
    window.scrollTo(0, 0);
  };

  function bind() {
    applyTheme(read(KEYS.theme, 'light'));
    applyDensity(read(KEYS.density, 'normal'));
    applyReduceMotion(read(KEYS.reduceMotion, 'false') === 'true');
    const startCollapsed = read(KEYS.collapsed, 'false') === 'true';
    setSwitch('sidebar-collapsed', startCollapsed);
    if (startCollapsed && window.innerWidth > 900) {
      document.body.classList.add('dv-sidebar-collapsed');
      document.querySelector('.dv-menu-toggle')?.setAttribute('aria-expanded', 'false');
    }

    document.querySelectorAll('[data-theme-choice]').forEach(card => {
      card.addEventListener('click', () => setTheme(card.dataset.themeChoice));
    });
    // Flechas dentro del grupo de temas (patrón de radio accesible)
    document.querySelector('.dv-theme-grid')?.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const cards = [...document.querySelectorAll('[data-theme-choice]')];
      const current = cards.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const next = cards[(current + step + cards.length) % cards.length];
      next.focus();
      setTheme(next.dataset.themeChoice);
    });

    document.getElementById('dvThemeQuick')?.addEventListener('click', () => {
      setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    document.querySelectorAll('[data-density-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        write(KEYS.density, btn.dataset.densityChoice);
        applyDensity(btn.dataset.densityChoice);
      });
    });

    document.querySelector('.dv-switch[data-setting="reduce-motion"]')?.addEventListener('click', event => {
      const on = event.currentTarget.getAttribute('aria-checked') !== 'true';
      write(KEYS.reduceMotion, String(on));
      applyReduceMotion(on);
    });
    document.querySelector('.dv-switch[data-setting="sidebar-collapsed"]')?.addEventListener('click', event => {
      const on = event.currentTarget.getAttribute('aria-checked') !== 'true';
      write(KEYS.collapsed, String(on));
      setSwitch('sidebar-collapsed', on);
    });

    // Al navegar a otra sección, Configuración deja de marcarse como activa.
    document.querySelectorAll('#sidebar .nav-item:not(#navConfigDirect)').forEach(el => {
      el.addEventListener('click', () => {
        const mine = document.getElementById('navConfigDirect');
        mine?.classList.remove('active');
        mine?.removeAttribute('aria-current');
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
