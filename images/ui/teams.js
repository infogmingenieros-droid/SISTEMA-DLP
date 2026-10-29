/* =========================================================
   GRUPOS DE TRABAJO
   - Administrador general: crea equipos, asigna jefe y subordinados.
   - Jefe: ve (solo lectura) su equipo; el resto del panel ya llega
     filtrado por el backend y por RLS de Supabase.
   ========================================================= */
(function(){
  'use strict';

  let dvTeamsScope = null;      // respuesta de /me/scope
  let dvTeamsCache = [];        // equipos visibles
  let dvTeamsLoading = false;
  let dvTeamsLoaded = false;    // ya se intentó una primera carga para esta sesión
  let dvTeamsOwner = '';        // usuario dueño de los datos en memoria
  let dvTeamsSeq = 0;           // descarta respuestas de recargas anteriores
  let dvTeamEditing = null;     // equipo abierto en el editor

  const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? ''));
  const isGlobal = () => !!dvTeamsScope?.admin_global;
  const isJefe = () => String(window.currentRole || (typeof currentRole !== 'undefined' ? currentRole : '')).toLowerCase() === 'jefe';
  const usersCache = () => (Array.isArray(window.dvAdminUsersCache) ? window.dvAdminUsersCache : []);

  async function api(path, options = {}){
    const headers = await authHeaders(true);
    const res = await fetch(`${API_URL}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(dvHttpErrorMessage(res, data, 'No se pudo completar la operación de equipos.'));
    return data;
  }

  function ensureStyles(){
    if(document.getElementById('dvTeamsStyles')) return;
    const style = document.createElement('style');
    style.id = 'dvTeamsStyles';
    style.textContent = `
      .dv-team-scoped [onclick^="openCreateUserModal"],
      .dv-team-scoped .danger-btn[onclick^="deleteAdminUser"]{display:none!important}
      .dv-teams-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));padding:16px}
      .dv-team-card{border:1px solid var(--gm-line,#e3e8ea);border-radius:12px;padding:14px}
      .dv-team-card h4{font-weight:800;font-size:14px;margin:0 0 2px}
      .dv-team-meta{font-size:11px;opacity:.7}
      .dv-team-members{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      .dv-team-chip{font-size:11px;padding:3px 8px;border-radius:999px;background:rgba(37,99,235,.1);color:#1d4ed8}
      .dv-team-actions{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}
      .dv-team-badge{display:inline-block;margin-left:6px;font-size:10px;padding:1px 7px;border-radius:999px;background:rgba(16,185,129,.12);color:#047857;text-transform:none;letter-spacing:0}
      .dv-team-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px}
      .dv-team-overlay.dv-hidden{display:none!important}
      .dv-team-modal{width:min(100%,560px);max-height:90vh;overflow:auto;padding:20px}
      .dv-team-modal h3{font-size:18px;font-weight:800;margin-bottom:12px}
      .dv-team-field{margin-bottom:12px}
      .dv-team-list{max-height:280px;overflow:auto;border:1px solid var(--gm-line,#e3e8ea);border-radius:10px;padding:6px}
      .dv-team-list label{display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:13px;cursor:pointer;border-radius:8px}
      .dv-team-list label:hover{background:rgba(37,99,235,.06)}
      .dv-team-list small{opacity:.6;margin-left:auto;font-size:11px}
      .dv-team-error{color:#dc2626;font-size:12px;min-height:16px;margin-top:6px}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    const view = document.getElementById('view-usuarios');
    if(!view) return null;
    let panel = document.getElementById('dvTeamsPanel');
    if(panel) return panel;
    panel = document.createElement('div');
    panel.id = 'dvTeamsPanel';
    panel.className = 'dashboard-card overflow-hidden';
    // Justo antes de la tabla de usuarios.
    const tableCard = document.getElementById('adminUsersBody')?.closest('.dashboard-card');
    if(tableCard && tableCard.parentNode) tableCard.parentNode.insertBefore(panel, tableCard);
    else view.appendChild(panel);
    return panel;
  }

  function renderPanel(){
    const panel = ensurePanel();
    if(!panel) return;
    document.body.classList.toggle('dv-team-scoped', !!dvTeamsScope && !isGlobal());

    if(!dvTeamsScope){ panel.__dvTeamsHtml = ''; panel.innerHTML = ''; return; }

    const head = isGlobal()
      ? `<div class="section-head"><div><h3>Equipos de trabajo</h3><p>Cada jefe solo ve la actividad de los subordinados de su equipo. ${dvTeamsScope.equipos_activos ? '' : '<b>Mientras no exista ningún equipo, todos los jefes ven a todos.</b>'}</p></div><button type="button" class="primary-btn" data-dv-team-new><i class="fa-solid fa-people-group"></i>Nuevo equipo</button></div>`
      : `<div class="section-head"><div><h3>Mi equipo de trabajo</h3><p>Solo ves la actividad de los integrantes de tu equipo. Los cambios de equipo los realiza el administrador general.</p></div></div>`;

    let body;
    if(dvTeamsLoading) body = '<div class="p-6 text-center text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando equipos...</div>';
    else if(!dvTeamsCache.length) body = `<div class="p-6 text-center text-xs text-slate-400">${isGlobal() ? 'Aún no hay equipos. Crea el primero con “Nuevo equipo”.' : 'Todavía no tienes un equipo asignado.'}</div>`;
    else body = `<div class="dv-teams-grid">${dvTeamsCache.map(t => `
      <div class="dv-team-card">
        <h4><i class="fa-solid fa-people-group mr-1 text-blue-600"></i>${esc(t.nombre)}</h4>
        <div class="dv-team-meta">Jefe: <b>${esc(t.jefe_nombre || 'Sin jefe')}</b>${t.jefe_email ? ` · ${esc(t.jefe_email)}` : ''}</div>
        <div class="dv-team-members">${t.miembros.length ? t.miembros.map(m => `<span class="dv-team-chip" title="${esc(m.email)}">${esc(m.nombre)}</span>`).join('') : '<span class="dv-team-meta">Sin subordinados</span>'}</div>
        ${isGlobal() ? `<div class="dv-team-actions">
          <button type="button" class="secondary-btn" data-dv-team-edit="${esc(t.id)}"><i class="fa-solid fa-user-pen"></i>Editar</button>
          <button type="button" class="danger-btn" data-dv-team-delete="${esc(t.id)}"><i class="fa-solid fa-trash"></i>Eliminar</button>
        </div>` : ''}
      </div>`).join('')}</div>`;

    // Si la recarga trae lo mismo, no se toca el DOM.
    const html = head + body;
    if(panel.__dvTeamsHtml === html) return;
    panel.__dvTeamsHtml = html;
    panel.innerHTML = html;
    panel.querySelector('[data-dv-team-new]')?.addEventListener('click', () => openEditor(null));
    panel.querySelectorAll('[data-dv-team-edit]').forEach(b => b.addEventListener('click', () => openEditor(dvTeamsCache.find(t => t.id === b.dataset.dvTeamEdit))));
    panel.querySelectorAll('[data-dv-team-delete]').forEach(b => b.addEventListener('click', () => deleteTeam(b.dataset.dvTeamDelete)));
  }

  async function loadTeams(){
    if(!isJefe()) return;
    ensureStyles();
    // Otro usuario en el mismo navegador: no reutilizar los equipos del anterior.
    const owner = String((typeof currentUser !== 'undefined' && currentUser?.id) || (typeof currentUserEmail !== 'undefined' ? currentUserEmail : ''));
    if(owner !== dvTeamsOwner){
      dvTeamsOwner = owner;
      dvTeamsScope = null; dvTeamsCache = []; dvTeamsLoaded = false;
    }
    const seq = ++dvTeamsSeq;
    // Solo la primera carga muestra "Cargando equipos...". Cada evento Realtime
    // vuelve a llamar a loadAdminUsers(); si las recargas también pusieran el
    // aviso, el panel parpadearía. Los equipos siguen visibles hasta tener los nuevos.
    if(!dvTeamsLoaded){ dvTeamsLoading = true; renderPanel(); }
    let scope = dvTeamsScope, teams = dvTeamsCache;
    try{
      scope = await api('/me/scope');
      try{
        const data = await api('/admin/teams');
        teams = Array.isArray(data.equipos) ? data.equipos : [];
      }catch(err){
        // Migración SQL aún no aplicada: el panel lo indica sin romper la vista.
        // En una recarga, un fallo temporal conserva los equipos ya mostrados.
        if(!dvTeamsLoaded) teams = [];
        if(scope?.admin_global) console.warn('[EQUIPOS]', err?.message);
      }
    }catch(err){
      console.error('[EQUIPOS] alcance', err);
      if(!dvTeamsLoaded) scope = null;
    }
    // Llegó una recarga más nueva (o cambió el usuario): esta respuesta ya no vale.
    if(seq !== dvTeamsSeq) return;
    dvTeamsScope = scope; dvTeamsCache = teams;
    dvTeamsLoading = false; dvTeamsLoaded = true;
    renderPanel();
  }
  window.dvLoadTeams = loadTeams;

  function ensureModal(){
    let overlay = document.getElementById('dvTeamOverlay');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'dvTeamOverlay';
    overlay.className = 'dv-team-overlay dv-hidden';
    overlay.innerHTML = `
      <div class="dashboard-card dv-team-modal" role="dialog" aria-modal="true" aria-labelledby="dvTeamModalTitle">
        <h3 id="dvTeamModalTitle">Equipo de trabajo</h3>
        <div class="dv-team-field"><label class="field-label" for="dvTeamName">Nombre del equipo</label><input id="dvTeamName" class="input-modern w-full" maxlength="80" placeholder="Ej.: Equipo de Luis"></div>
        <div class="dv-team-field"><label class="field-label" for="dvTeamBoss">Jefe responsable</label><select id="dvTeamBoss" class="input-modern w-full"></select></div>
        <div class="dv-team-field"><label class="field-label">Subordinados del equipo</label><input id="dvTeamMemberSearch" class="input-modern w-full mb-2" placeholder="Buscar subordinado..."><div id="dvTeamMembers" class="dv-team-list"></div></div>
        <div id="dvTeamError" class="dv-team-error"></div>
        <div class="flex justify-end gap-2 mt-3"><button type="button" class="secondary-btn" data-dv-team-cancel>Cancelar</button><button type="button" class="primary-btn" data-dv-team-save><i class="fa-solid fa-floppy-disk"></i>Guardar</button></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if(e.target === overlay) closeEditor(); });
    overlay.querySelector('[data-dv-team-cancel]').addEventListener('click', closeEditor);
    overlay.querySelector('[data-dv-team-save]').addEventListener('click', saveEditor);
    overlay.querySelector('#dvTeamMemberSearch').addEventListener('input', renderMemberList);
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && !overlay.classList.contains('dv-hidden')) closeEditor(); });
    return overlay;
  }

  let dvTeamSelected = new Set();

  function renderMemberList(){
    const box = document.getElementById('dvTeamMembers');
    if(!box) return;
    const q = String(document.getElementById('dvTeamMemberSearch')?.value || '').trim().toLowerCase();
    const equipoPorUsuario = new Map();
    dvTeamsCache.forEach(t => t.miembros.forEach(m => equipoPorUsuario.set(m.id, t)));
    const subs = usersCache().filter(u => String(u.rol).toLowerCase() !== 'jefe' && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)));
    if(!subs.length){ box.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">No hay subordinados.</div>'; return; }
    box.innerHTML = subs.map(u => {
      const otro = equipoPorUsuario.get(u.id);
      const nota = otro && otro.id !== dvTeamEditing?.id ? `En ${esc(otro.nombre)} (se moverá)` : '';
      return `<label><input type="checkbox" value="${esc(u.id)}" ${dvTeamSelected.has(u.id) ? 'checked' : ''}><span>${esc(u.name)} <span class="dv-team-meta">${esc(u.email)}</span></span><small>${nota}</small></label>`;
    }).join('');
    box.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
      if(cb.checked) dvTeamSelected.add(cb.value); else dvTeamSelected.delete(cb.value);
    }));
  }

  function openEditor(team){
    if(!isGlobal()) return;
    const overlay = ensureModal();
    dvTeamEditing = team || null;
    dvTeamSelected = new Set((team?.miembros || []).map(m => m.id));
    overlay.querySelector('#dvTeamModalTitle').textContent = team ? `Editar ${team.nombre}` : 'Nuevo equipo de trabajo';
    overlay.querySelector('#dvTeamName').value = team?.nombre || '';
    overlay.querySelector('#dvTeamMemberSearch').value = '';
    overlay.querySelector('#dvTeamError').textContent = '';
    const jefes = usersCache().filter(u => String(u.rol).toLowerCase() === 'jefe');
    overlay.querySelector('#dvTeamBoss').innerHTML = '<option value="">Selecciona un jefe...</option>' +
      jefes.map(u => `<option value="${esc(u.id)}" ${team?.jefe_id === u.id ? 'selected' : ''}>${esc(u.name)} · ${esc(u.email)}</option>`).join('');
    renderMemberList();
    overlay.classList.remove('dv-hidden');
    overlay.querySelector('#dvTeamName').focus();
  }

  function closeEditor(){
    document.getElementById('dvTeamOverlay')?.classList.add('dv-hidden');
    dvTeamEditing = null;
  }

  async function saveEditor(){
    const overlay = ensureModal();
    const errorBox = overlay.querySelector('#dvTeamError');
    const btn = overlay.querySelector('[data-dv-team-save]');
    const nombre = overlay.querySelector('#dvTeamName').value.trim();
    const jefeId = overlay.querySelector('#dvTeamBoss').value;
    if(!nombre){ errorBox.textContent = 'Escribe el nombre del equipo.'; return; }
    if(!jefeId){ errorBox.textContent = 'Selecciona el jefe responsable.'; return; }
    btn.disabled = true; errorBox.textContent = '';
    try{
      let teamId = dvTeamEditing?.id;
      if(teamId){
        await api(`/admin/teams/${encodeURIComponent(teamId)}`, { method:'PUT', body: JSON.stringify({ nombre, jefe_id: jefeId }) });
      }else{
        const creado = await api('/admin/teams', { method:'POST', body: JSON.stringify({ nombre, jefe_id: jefeId }) });
        teamId = creado?.equipo?.id;
      }
      if(teamId){
        await api(`/admin/teams/${encodeURIComponent(teamId)}/members`, { method:'PUT', body: JSON.stringify({ user_ids: [...dvTeamSelected] }) });
      }
      closeEditor();
      await refreshAll();
    }catch(err){
      errorBox.textContent = err?.message || 'No se pudo guardar el equipo.';
    }finally{
      btn.disabled = false;
    }
  }

  async function deleteTeam(teamId){
    const team = dvTeamsCache.find(t => t.id === teamId);
    if(!team || !isGlobal()) return;
    if(!window.confirm(`¿Eliminar el equipo "${team.nombre}"? Sus integrantes quedarán sin equipo.`)) return;
    try{
      await api(`/admin/teams/${encodeURIComponent(teamId)}`, { method:'DELETE' });
      await refreshAll();
    }catch(err){
      if(typeof dvShowMessageModal === 'function') dvShowMessageModal({ type:'error', title:'No se pudo eliminar', message: err?.message || 'Error desconocido' });
      else alert(err?.message);
    }
  }

  async function refreshAll(){
    if(typeof window.loadAdminUsers === 'function') await window.loadAdminUsers();
    else await loadTeams();
  }

  // Se engancha a la carga de usuarios existente: cada vez que se abre o
  // actualiza la vista Usuarios, también se recargan los equipos.
  function hook(){
    const original = window.loadAdminUsers;
    if(typeof original !== 'function' || original.__dvTeamsHooked) return false;
    const wrapped = async function(...args){
      const result = await original.apply(this, args);
      await loadTeams();
      return result;
    };
    wrapped.__dvTeamsHooked = true;
    window.loadAdminUsers = wrapped;
    try{ loadAdminUsers = wrapped; }catch(_){ }
    return true;
  }

  if(!hook()){
    document.addEventListener('DOMContentLoaded', hook);
  }
})();
