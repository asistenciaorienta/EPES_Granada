
    let currentEntidadId = '';
    let currentPersonalEntidadId = '';
    let currentPersonalEntidadNombre = '';
    /* =========================
       CONFIG: pon aquí tu API
       ========================= */
    // Ejemplo: 'https://script.google.com/macros/s/AKfycb.../exec'
    const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbz4dyvWLx7hzZdyG1GpB6YGljVWYNTZ47sEsfKg2-w2HluipAyPDfaPb5wbkfhRHOMFHg/exec';
    // ✅ Base específica para JSONP (evita 302)
    const API_BASE_URL_JSONP = API_BASE_URL.replace(
      'https://script.google.com/macros/s/',
      'https://script.googleusercontent.com/macros/s/'
    );
    /* =========================
       Estado de sesión
       ========================= */
    const storage = {
      get token(){ return sessionStorage.getItem('epes_token') || ''; },
      set token(v){ v ? sessionStorage.setItem('epes_token', v) : sessionStorage.removeItem('epes_token'); },
      get user(){ try { return JSON.parse(sessionStorage.getItem('epes_user')||'null'); } catch { return null; } },
      set user(v){ v ? sessionStorage.setItem('epes_user', JSON.stringify(v)) : sessionStorage.removeItem('epes_user'); },
    };

    function isLoggedIn(){ return !!storage.token && !!storage.user; }
    function userPerfil(){ return (storage.user && storage.user.perfil) ? storage.user.perfil : ''; }
    function isAdmin(){ return userPerfil() === 'ADMIN'; }

    function updateSessionUI(){
      const st = document.getElementById('sessionText');
      if (!st) return;

      if (isLoggedIn()){
        st.textContent = `Sesión: ${storage.user?.correo || ''} (${storage.user?.perfil || ''})`;
      } else {
        st.textContent = 'Sin sesión';
      }

      // Mostrar/ocultar opciones ADMIN
      const miAltaPersonal = document.getElementById('miAltaPersonal');
      const cardAltaPersonal = document.getElementById('cardAltaPersonal');
      if (miAltaPersonal) {
        if (isAdmin()) {
          miAltaPersonal.classList.remove('disabled');
          miAltaPersonal.style.display = '';
        } else {
          miAltaPersonal.style.display = 'none';
        }
      }
      if (cardAltaPersonal) {
        cardAltaPersonal.style.display = isAdmin() ? '' : 'none';
      }
    }

    /* =========================
       API helper
       ========================= */
    async function apiFetch(path, { method='GET', query={}, body=null, auth=true } = {}){
      const base = API_BASE_URL;
      if (!base || base.includes('PEGA_AQUI')) {
        throw new Error('Configura API_BASE_URL con la URL de tu Web App (Apps Script).');
      }
    
      const url = new URL(base);
      url.searchParams.set('path', path);
    
      // query extra
      Object.entries(query || {}).forEach(([k,v]) => url.searchParams.set(k, String(v)));
    
      // auth por querystring (EVITA preflight)
      if (auth && storage.token) url.searchParams.set('t', storage.token);
    
      const options = { method };
    
      // Para evitar preflight: NO mandamos Authorization y NO usamos application/json
      if (method !== 'GET') {
        options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        options.body = body ? JSON.stringify(body) : '';
      }
    
      const res = await fetch(url.toString(), options);
    
      // Apps Script siempre devuelve 200 en muchos casos; miramos el JSON ok/error
      const data = await res.json().catch(() => ({}));
      if (!data || data.ok !== true) {
        const msg = data?.error || 'Error de API';
        if (/sesión caducada|no autorizado|invalid|unauthorized/i.test(msg)) {
          clearSession();
          routeTo('#/login');
        }
        throw new Error(msg);
      }
      return data;
    }

    function apiJsonp(path, query = {}, timeoutMs = 12000){
      return new Promise((resolve, reject) => {
        const cbName = '__epes_cb_' + Math.random().toString(36).slice(2);
        const url = new URL(API_BASE_URL_JSONP);
        url.searchParams.set('path', path);
    
        Object.entries(query || {}).forEach(([k,v]) => url.searchParams.set(k, String(v)));
    
        if (storage.token) url.searchParams.set('t', storage.token);
        url.searchParams.set('callback', cbName);
        url.searchParams.set('_', Date.now()); // anti-caché
    
        console.log('[JSONP] url =>', url.toString());
    
        const script = document.createElement('script');
        let timer = null;
        let finished = false;
    
        window[cbName] = (data) => {
          finished = true;
          cleanup();
          resolve(data);
        };
    
        function cleanup(){
          if (timer) clearTimeout(timer);
          try { delete window[cbName]; } catch {}
          if (script.parentNode) script.parentNode.removeChild(script);
        }
    
        // si carga pero no ejecuta callback, lo verás aquí
        script.onload = () => {
          setTimeout(() => {
            if (!finished) {
              cleanup();
              reject(new Error('JSONP cargó, pero no ejecutó callback (probable respuesta no-JS / no-jsonp / deploy antiguo)'));
            }
          }, 50);
        };
    
        script.onerror = () => {
          cleanup();
          reject(new Error('Error cargando JSONP (script.onerror)'));
        };
    
        timer = setTimeout(() => {
          cleanup();
          reject(new Error('Timeout JSONP'));
        }, timeoutMs);
    
        script.src = url.toString();
        document.head.appendChild(script);
      });
    }
    /* =========================
       Auth
       ========================= */
    async function login(correo, clave){
      const data = await apiFetch('auth/login', {
        method: 'POST',
        auth: false,
        body: { correo, clave }
      });
      storage.token = data.token;
      storage.user = data.user;
      updateSessionUI();
    }

    async function logout(){
      try{
        if (storage.token) {
          // opcional: si implementas /auth/logout en Apps Script
          await apiFetch('auth/logout', { method:'POST', body:{} });
        }
      } catch(e){
        // aunque falle, limpiamos local
      }
      clearSession();
      closeModal('modalProfile');
      toast('Sesión cerrada');
      routeTo('#/login');
    }

    function clearSession(){
      storage.token = '';
      storage.user = null;
      updateSessionUI();
    }

    /* =========================
       Router (hash)
       ========================= */
    const routes = {
      '#/login': {
        view: 'login', badge: 'Acceso', title: 'Login',
        h1: 'Acceso', p: 'Introduce tus credenciales para acceder a la aplicación.',
        public: true
      },
      '#/': {
        view: 'home', badge: 'Inicio', title: 'Menú',
        h1: 'Panel principal',
        p: 'Acceso rápido a la creación de convenios y prácticas, y al buscador general.',
      },
      '#/convenio': {
        view: 'convenio', badge: 'Convenio', title: 'Alta de convenio',
        h1: 'Convenios', p: 'Crea y gestiona convenios con entidades, empresas y centros de trabajo.',
      },
      '#/practica': {
        view: 'practica', badge: 'Práctica', title: 'Alta de práctica',
        h1: 'Prácticas', p: 'Crea prácticas vinculadas a convenios y centros. Controla anexos, fechas y estados.',
      },
      '#/buscador': {
        view: 'buscador', badge: 'Buscador', title: 'Búsqueda unificada',
        h1: 'Buscador', p: 'Localiza y filtra información en todas las tablas principales.',
      },
      '#/config': {
        view: 'config', badge: 'Config', title: 'Configuración',
        h1: 'Configuración', p: 'Altas y mantenimiento de catálogos.',
      },
      '#/config/personal': {
        view: 'config-personal', badge: 'Config', title: 'Alta personal SAE',
        h1: 'Personal SAE', p: 'Gestión de usuarios y permisos (solo ADMIN).',
        guard: () => isAdmin()
      },
      '#/config/entidades': {
        view: 'config-entidades', badge: 'Config', title: 'Alta entidades',
        h1: 'Entidades', p: 'Registro de entidades y su personal técnico.',
      },
      '#/config/convocatorias': {
        view: 'config-convocatorias', badge: 'Config', title: 'Alta convocatorias',
        h1: 'Convocatorias', p: 'Creación y mantenimiento de convocatorias.',
      },
    };

    function routeTo(hash){
      window.location.hash = hash;
      closeSettingsMenu();
    }

    function setActiveView(viewName){
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const el = document.getElementById('view-' + viewName);
      if (el) el.classList.add('active');
    }

    function renderRouteActions(hash){
      const actions = document.getElementById('routeActions');
      if (!actions) return;

      // En login, no mostrar acciones
      if (hash === '#/login') { actions.innerHTML = ''; return; }

      if (hash === '#/'){
        actions.innerHTML = `
          <button class="btn primary" type="button" onclick="routeTo('#/convenio')">+ Convenio</button>
          <button class="btn primary" type="button" onclick="routeTo('#/practica')">+ Práctica</button>
          <button class="btn" type="button" onclick="routeTo('#/buscador')">Buscador</button>
        `;
      } else {
        actions.innerHTML = `
          <button class="btn" type="button" onclick="routeTo('#/')">Inicio</button>
          <button class="btn" type="button" onclick="routeTo('#/buscador')">Buscador</button>
          <button class="btn primary" type="button" onclick="routeTo('#/convenio')">+ Convenio</button>
          <button class="btn primary" type="button" onclick="routeTo('#/practica')">+ Práctica</button>
        `;
      }
    }

    function applyRoute(){
      const hash = window.location.hash || (isLoggedIn() ? '#/' : '#/login');
      const r = routes[hash] || (isLoggedIn() ? routes['#/'] : routes['#/login']);

      // Guard de sesión
      if (!r.public && !isLoggedIn()){
        window.location.hash = '#/login';
        return;
      }

      // Guard de rol
      if (r.guard && !r.guard()){
        toast('Permisos insuficientes');
        window.location.hash = '#/';
        return;
      }

      setActiveView(r.view);

      document.getElementById('routeBadge').textContent = r.badge;
      document.getElementById('routeTitle').textContent = r.title;
      document.getElementById('pageH1').textContent = r.h1;
      document.getElementById('pageP').textContent = r.p;

      renderRouteActions(hash);
    }

    window.addEventListener('hashchange', applyRoute);
    window.addEventListener('DOMContentLoaded', () => {
      wireUI();
      updateSessionUI();
      applyRoute();
    });

    /* =========================
       Dropdown config + modales
       ========================= */
    function wireUI(){
      const btnSettings = document.getElementById('btnSettings');
      const menu = document.getElementById('settingsMenu');

      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
      });

      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== btnSettings) closeSettingsMenu();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeSettingsMenu();
          closeModal('modalProfile');
          closeModal('modalStats');
        }
      });

      document.getElementById('btnUser').addEventListener('click', () => {
        if (!isLoggedIn()) { routeTo('#/login'); return; }
        fillProfileModal();
        openModal('modalProfile');
      });

      document.getElementById('btnStats').addEventListener('click', () => {
        if (!isLoggedIn()) { routeTo('#/login'); return; }
        openModal('modalStats');
      });

      // Login form
      const lf = document.getElementById('loginForm');
      lf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const correo = document.getElementById('loginCorreo').value.trim();
        const clave = document.getElementById('loginClave').value;
        const err = document.getElementById('loginError');
        const btn = document.getElementById('loginBtn');

        err.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Entrando…';

        try{
          await login(correo, clave);
          toast('Bienvenido/a');
          routeTo('#/');
        } catch(ex){
          err.textContent = ex.message || 'No se pudo iniciar sesión';
          err.style.display = 'block';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Entrar';
        }
      });
      wirePersonalSAE();
      wireEntidades();
      wireChangePassword();
      wireTecnicos();
      wireEditEntidad();
      wireEditTecnico();
      wireContactos();
      wireContactoTipoHint();
      wireEditPersona();
    }

    function wireChangePassword(){
      const form = document.getElementById('formChangePass');
      if (!form) return;
    
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = document.getElementById('changePassError');
        const btn = document.getElementById('btnChangePass');
    
        err.style.display = 'none';
        btn.disabled = true;
    
        try{
          const actual = document.getElementById('cp_actual').value;
          const nueva  = document.getElementById('cp_nueva').value;
          const nueva2 = document.getElementById('cp_nueva2').value;
    
          if (nueva !== nueva2) throw new Error('La nueva clave no coincide con la confirmación');
          if (nueva.length < 8) throw new Error('La nueva clave debe tener al menos 8 caracteres');
    
          await apiFetch('auth/change_password', {
            method: 'POST',
            body: { clave_actual: actual, nueva_clave: nueva }
          });
    
          toast('Contraseña actualizada');
          form.reset();
    
          // Opcional (seguridad): forzar re-login
          await logout();
    
        } catch(ex){
          err.textContent = ex.message || 'No se pudo cambiar la contraseña';
          err.style.display = 'block';
        } finally {
          btn.disabled = false;
        }
      });
    }  

    function fillProfileModal(){
      document.getElementById('profCorreo').textContent = storage.user?.correo || '';
      document.getElementById('profPerfil').textContent = storage.user?.perfil || '';
      document.getElementById('profNombre').textContent = storage.user?.nombre || '';
      const u = document.getElementById('cp_user');
      if (u) u.value = storage.user?.correo || '';
    }

    function closeSettingsMenu(){
      document.getElementById('settingsMenu').classList.remove('open');
    }

    function openModal(id){
      const b = document.getElementById(id);
      b.classList.add('open');
      b.setAttribute('aria-hidden','false');

      const focusable = b.querySelector('input,select,button');
      if (focusable) focusable.focus();

      b.addEventListener('click', onBackdropClick);
      function onBackdropClick(e){
        if (e.target === b){
          closeModal(id);
          b.removeEventListener('click', onBackdropClick);
        }
      }
    }

    function closeModal(id){
      const b = document.getElementById(id);
      b.classList.remove('open');
      b.setAttribute('aria-hidden','true');
    }

    /* =========================
       Toast
       ========================= */
    let toastTimer = null;
    function toast(msg){
      let t = document.getElementById('toast');
      if (!t){
        t = document.createElement('div');
        t.id = 'toast';
        t.style.position = 'fixed';
        t.style.left = '50%';
        t.style.bottom = '22px';
        t.style.transform = 'translateX(-50%)';
        t.style.padding = '10px 12px';
        t.style.borderRadius = '14px';
        t.style.border = '1px solid rgba(162,185,209,.45)';
        t.style.background = 'rgba(255,255,255,.96)';
        t.style.boxShadow = '0 14px 34px rgba(31,80,120,.18)';
        t.style.zIndex = '300';
        t.style.fontWeight = '800';
        t.style.color = 'rgba(31,80,120,.95)';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 1800);
    }
    function wirePersonalSAE(){
      const formCreate = document.getElementById('formCreateUser');
      const formReset  = document.getElementById('formResetPass');
      if (!formCreate || !formReset) return;
    
      formCreate.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = document.getElementById('createUserError');
        const btn = document.getElementById('btnCreateUser');
        err.style.display = 'none';
        btn.disabled = true;
      
        try{
          const payload = {
            nombre_y_apellidos: document.getElementById('u_nombre').value.trim(),
            correo_corp: document.getElementById('u_correo').value.trim(),
            perfil: document.getElementById('u_perfil').value,
            clave_plana: document.getElementById('u_clave').value,
            verificado: document.getElementById('u_verif').value === 'true'
          };
      
          // 👇 AQUÍ VA EL CAMBIO
          const res = await apiFetch('admin/create_user', {
            method:'POST',
            body: payload
          });
      
          toast('Usuario creado: ' + (res.id_personal_sae || 'OK'));
      
          formCreate.reset();
          document.getElementById('u_perfil').value = 'CONSULTA';
          document.getElementById('u_verif').value = 'true';
      
          await loadUsers();
      
        } catch(ex){
          err.textContent = ex.message || 'No se pudo crear el usuario';
          err.style.display = 'block';
        } finally {
          btn.disabled = false;
        }
      });
    
      formReset.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = document.getElementById('resetPassError');
        const btn = document.getElementById('btnResetPass');
        err.style.display = 'none';
        btn.disabled = true;
    
        try{
          const payload = {
            correo_corp: document.getElementById('r_correo').value.trim(),
            nueva_clave_plana: document.getElementById('r_clave').value,
            renovar_salt: document.getElementById('r_salt').value === 'true'
          };
    
          await apiFetch('admin/set_password', { method:'POST', body: payload });
          toast('Contraseña reseteada');
          formReset.reset();
          document.getElementById('r_salt').value = 'true';
        } catch(ex){
          err.textContent = ex.message || 'No se pudo resetear la contraseña';
          err.style.display = 'block';
        } finally {
          btn.disabled = false;
        }
      });
    }
    function canEdit(){
      const p = userPerfil();
      return p === 'ADMIN' || p === 'GESTOR_EDITA' || p === 'GESTOR_BORRA';
    }
    function canDelete(){
      const p = userPerfil();
      return p === 'ADMIN' || p === 'GESTOR_BORRA';
    }
    
    function wireEntidades(){
      const form = document.getElementById('formCreateEntidad');
      if (!form) return;
    
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = document.getElementById('createEntidadError');
        const btn = document.getElementById('btnCreateEntidad');
        err.style.display = 'none';
        btn.disabled = true;
    
        try{
          const payload = {
            nombre: document.getElementById('e_nombre').value.trim(),
            cif: document.getElementById('e_cif').value.trim(),
            dir3: document.getElementById('e_dir3').value.trim(),
            'dirección': document.getElementById('e_direccion').value.trim(),
            poliza_general_accidentes: document.getElementById('e_pol_acc').checked,
            poliza_rc: document.getElementById('e_pol_rc').checked,
            representacion_legal: document.getElementById('e_rep').checked,
            ficha_tecnica: document.getElementById('e_ficha').checked
          };
    
          const res = await apiFetch('entidades/create', { method:'POST', body: payload });
          toast('Entidad creada: ' + (res.id_entidad || 'OK'));
          form.reset();
          await loadEntidades();
    
        } catch(ex){
          err.textContent = ex.message || 'No se pudo crear la entidad';
          err.style.display = 'block';
        } finally {
          btn.disabled = false;
        }
      });
    }
    
    async function loadEntidades(){
      const tbody = document.getElementById('entTbody');
      if (!tbody) return;
    
      tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--muted)">Cargando…</td></tr>`;
    
      try{
        const data = await apiJsonp('list', { table: 'Entidades' });
    
        const rows = (data.rows || []).map(r => ({
          id: r.id_entidad ?? '',
          nombre: r.nombre ?? '',
          cif: r.cif ?? '',
          dir3: r.dir3 ?? ''
        }));
    
        if (!rows.length){
          tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--muted)">Sin registros.</td></tr>`;
          return;
        }
    
        tbody.innerHTML = rows.map(e => `
          <tr>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(e.id)}</td>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(e.nombre)}</td>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(e.cif)}</td>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(e.dir3)}</td>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25);white-space:nowrap">
              ${canEdit() ? `<button class="btn" type="button" onclick="openEditEntidad('${escapeHtml(e.id)}')">Editar</button>` : ''}
              ${canDelete() ? `<button class="btn danger" type="button" onclick="deleteEntidad('${escapeHtml(e.id)}')">Borrar</button>` : ''}
            </td>
          </tr>
        `).join('');
    
      } catch(ex){
        tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--danger)">Error: ${escapeHtml(ex.message||'No se pudo cargar')}</td></tr>`;
      }
    }
    
    async function editEntidadPrompt(id_entidad){
      if (!canEdit()) return toast('Permisos insuficientes');
    
      const nuevoNombre = prompt('Nuevo nombre para ' + id_entidad + ':');
      if (nuevoNombre === null) return;
    
      const patch = { nombre: nuevoNombre.trim() };
      if (!patch.nombre) return toast('Nombre vacío');
    
      await apiFetch('update', {
        method:'POST',
        body: { table:'Entidades', id_field:'id_entidad', id:id_entidad, patch }
      });
    
      toast('Entidad actualizada');
      await loadEntidades();
    }
    
    async function deleteEntidad(id_entidad){
      if (!canDelete()) return toast('Permisos insuficientes');
      if (!confirm('¿Borrar entidad ' + id_entidad + '?')) return;
    
      await apiFetch('delete', {
        method:'POST',
        body: { table:'Entidades', id_field:'id_entidad', id:id_entidad }
      });
    
      toast('Entidad borrada');
      await loadEntidades();
    }
    
    async function loadUsers(){
      const tbody = document.getElementById('usersTbody');
      if (!tbody) return;
    
      tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--muted)">Cargando…</td></tr>`;
    
      try{
        // ✅ JSONP evita CORS
        const data = await apiJsonp('list', { table: 'Personal_Departamento' });
    
        const rows = (data.rows || []).map(r => ({
          id: r.id_personal_sae ?? '',
          nombre: r.nombre_y_apellidos ?? '',
          correo: r.correo_corp ?? '',
          perfil: r.perfil ?? '',
          verificado: String(r.verificado ?? '')
        }));
    
        if (!rows.length){
          tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--muted)">Sin registros.</td></tr>`;
          return;
        }
    
        tbody.innerHTML = rows.map(u => `
          <tr>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(u.id)}</td>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(u.nombre)}</td>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(u.correo)}</td>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)"><strong>${escapeHtml(u.perfil)}</strong></td>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(u.verificado)}</td>
          </tr>
        `).join('');
    
      } catch(ex){
        tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--danger)">Error: ${escapeHtml(ex.message||'No se pudo cargar')}</td></tr>`;
      }
    }
    
    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }
    function openTecnicoModal(id_entidad, nombre_entidad){
      if (!canEdit()) return toast('Permisos insuficientes');
    
      currentEntidadId = String(id_entidad || '').trim();
    
      document.getElementById('tecEntidadLabel').textContent =
        `${nombre_entidad} (${currentEntidadId})`;
    
      const err = document.getElementById('addTecnicoError');
      if (err) err.style.display = 'none';
    
      // Resetea el formulario (pero ya no dependemos de un hidden)
      const f = document.getElementById('formAddTecnico');
      if (f) f.reset();
    
      openModal('modalTecnico');
    }
    
    function wireTecnicos(){
      const form = document.getElementById('formAddTecnico');
      if (!form) return;
    
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = document.getElementById('addTecnicoError');
        const btn = document.getElementById('btnAddTecnico');
        err.style.display = 'none';
        btn.disabled = true;
    
        try{
          const payload = {
            id_entidad: currentEntidadId,
            nombre_y_apellidos: document.getElementById('tec_nombre').value.trim(),
            email: document.getElementById('tec_email').value.trim(),
            telefono: document.getElementById('tec_tel').value.trim(),
            activo: document.getElementById('tec_activo').checked
          };
    
          const res = await apiFetch('entidades/add_tecnico', { method:'POST', body: payload });
    
          toast('Técnico añadido: ' + (res.id_personal_entidad || 'OK'));
          closeModal('modalTecnico');
    
          // refresca lista (para que el usuario vea que “ficha_tecnica” ya no aplica, si luego la mostramos)
          await loadEntidades();
          if (!payload.id_entidad) throw new Error('No hay entidad seleccionada');
        } catch(ex){
          err.textContent = ex.message || 'No se pudo añadir el técnico';
          err.style.display = 'block';
        } finally {
          btn.disabled = false;
        }
      });
    }    
    async function openEditEntidad(id_entidad){
    
      const data = await apiJsonp('entidades/get',{id_entidad});
      const e = data.entidad;
    
      document.getElementById('ee_id').value = e.id_entidad;
      document.getElementById('ee_nombre').value = e.nombre;
      document.getElementById('ee_cif').value = e.cif;
      document.getElementById('ee_dir3').value = e.dir3;
      document.getElementById('ee_direccion').value = e['dirección'];
    
      document.getElementById('ee_pol_acc').checked = e.poliza_general_accidentes;
      document.getElementById('ee_pol_rc').checked = e.poliza_rc;
      document.getElementById('ee_rep').checked = e.representacion_legal;
      document.getElementById('ee_ficha').checked = e.ficha_tecnica;
    
      await loadExpedientes(id_entidad);
      await loadPersonal(id_entidad);
    
      openModal('modalEditEntidad');
    
    }

    function wireEditEntidad(){
      const form = document.getElementById('formEditEntidad');
      if (!form) return;
    
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const err = document.getElementById('editEntidadError');
        const btn = document.getElementById('btnSaveEntidad');
        err.style.display = 'none';
        btn.disabled = true;
    
        try{
          const id_entidad = document.getElementById('ee_id').value.trim();
    
          const patch = {
            nombre: document.getElementById('ee_nombre').value.trim(),
            cif: document.getElementById('ee_cif').value.trim(),
            dir3: document.getElementById('ee_dir3').value.trim(),
            'dirección': document.getElementById('ee_direccion').value.trim(),
            poliza_general_accidentes: document.getElementById('ee_pol_acc').checked,
            poliza_rc: document.getElementById('ee_pol_rc').checked,
            representacion_legal: document.getElementById('ee_rep').checked,
            ficha_tecnica: document.getElementById('ee_ficha').checked
          };
    
          await apiFetch('entidades/update', {
            method: 'POST',
            body: { id_entidad, patch }
          });
    
          toast('Entidad actualizada');
          await loadEntidades();
    
        } catch(ex){
          err.textContent = ex.message || 'No se pudo actualizar la entidad';
          err.style.display = 'block';
        } finally {
          btn.disabled = false;
        }
      });
    }

async function loadTecnicosEntidad(id_entidad){
  const tbody = document.getElementById('tecnicosEntidadTbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="padding:10px;color:var(--muted)">Cargando…</td></tr>`;

  try{
    const data = await apiJsonp('tecnicos/list_by_entidad', { id_entidad });
    const rows = data.rows || [];

    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="6" style="padding:10px;color:var(--muted)">Sin personal técnico.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(t => `
      <tr>
        <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(t.id_personal_entidad || '')}</td>
        <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(t.nombre_y_apellidos || '')}</td>
        <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(t.email || '')}</td>
        <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(t.telefono || '')}</td>
        <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${(String(t.activo).toLowerCase() === 'true' || t.activo === true) ? 'Sí' : 'No'}</td>
        <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">
          ${canEdit() ? `<button class="btn" type="button" onclick="openEditTecnico('${escapeHtml(t.id_personal_entidad || '')}', '${escapeHtml(t.nombre_y_apellidos || '')}', '${escapeHtml(t.email || '')}', '${escapeHtml(t.telefono || '')}', '${String(t.activo)}')">Editar</button>` : ''}
        </td>
      </tr>
    `).join('');

  } catch(ex){
    tbody.innerHTML = `<tr><td colspan="6" style="padding:10px;color:var(--danger)">Error: ${escapeHtml(ex.message || 'No se pudo cargar')}</td></tr>`;
  }
}
function openEditTecnico(id, nombre, email, telefono, activo){
  document.getElementById('et_id').value = id || '';
  document.getElementById('et_nombre').value = nombre || '';
  document.getElementById('et_email').value = email || '';
  document.getElementById('et_tel').value = telefono || '';
  document.getElementById('et_activo').checked = String(activo).toLowerCase() === 'true';

  document.getElementById('editTecnicoError').style.display = 'none';
  openModal('modalEditTecnico');
}

function wireEditTecnico(){
  const form = document.getElementById('formEditTecnico');
  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = document.getElementById('editTecnicoError');
    const btn = document.getElementById('btnSaveTecnico');
    err.style.display = 'none';
    btn.disabled = true;

    try{
      const id_personal_entidad = document.getElementById('et_id').value.trim();

      const patch = {
        nombre_y_apellidos: document.getElementById('et_nombre').value.trim(),
        email: document.getElementById('et_email').value.trim(),
        telefono: document.getElementById('et_tel').value.trim(),
        activo: document.getElementById('et_activo').checked
      };

      await apiFetch('tecnicos/update', {
        method: 'POST',
        body: { id_personal_entidad, patch }
      });

      closeModal('modalEditTecnico');
      toast('Personal técnico actualizado');

      const id_entidad = document.getElementById('ee_id').value.trim();
      if (id_entidad) await loadTecnicosEntidad(id_entidad);

    } catch(ex){
      err.textContent = ex.message || 'No se pudo actualizar el técnico';
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  });
}    
   function switchEntidadTab(tabId, btn){
      document.querySelectorAll('#modalEditEntidad .tab-panel')
        .forEach(p => p.classList.remove('active'));
    
      document.querySelectorAll('#modalEditEntidad .tab-btn')
        .forEach(b => b.classList.remove('active'));
    
      document.getElementById(tabId).classList.add('active');
      btn.classList.add('active');
    }
    document.addEventListener("click", function(e){
    
      if(!e.target.classList.contains("tab")) return;
    
      const tab = e.target.dataset.tab;
    
      document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
      e.target.classList.add("active");
    
      document.querySelectorAll(".tab-content").forEach(c=>c.classList.remove("active"));
      document.getElementById(tab).classList.add("active");
    
    });

    async function loadExpedientes(id_entidad){
    
      const tbody = document.getElementById("expedientesTbody");
    
      const data = await apiJsonp("expedientes/list_by_entidad",{id_entidad});
    
      tbody.innerHTML = data.rows.map(r=>`
        <tr>
          <td>${escapeHtml(r.expediente)}</td>
          <td>${escapeHtml(r.id_convocatoria)}</td>
          <td>
            <button class="btn danger" onclick="deleteExpediente('${r.expediente}')">
              borrar
            </button>
          </td>
        </tr>
      `).join("");
    
    }    
    async function createExpediente(){
    
      const id_entidad = document.getElementById("ee_id").value;
    
      const expediente = document.getElementById("ex_expediente").value.trim();
      const id_convocatoria = document.getElementById("ex_convocatoria").value;
    
      await apiFetch("expedientes/create",{
        method:"POST",
        body:{
          expediente,
          id_entidad,
          id_convocatoria
        }
      });
    
      document.getElementById("ex_expediente").value="";
    
      await loadExpedientes(id_entidad);
    
    }   
    async function createPersona(){
    
      const id_entidad = document.getElementById("ee_id").value;
    
      const nombre = document.getElementById("per_nombre").value.trim();
      const rol = document.getElementById("per_rol").value;
    
      await apiFetch("personal/create",{
        method:"POST",
        body:{
          id_entidad,
          nombre_y_apellidos:nombre,
          rol
        }
      });
    
      document.getElementById("per_nombre").value="";
    
      await loadPersonal(id_entidad);
    
    }    
    async function loadPersonal(id_entidad){
      const tbody = document.getElementById("personalTbody");
      if (!tbody) return;
    
      tbody.innerHTML = `<tr><td colspan="4" style="padding:10px;color:var(--muted)">Cargando…</td></tr>`;
    
      try{
        const data = await apiJsonp("personal/list_by_entidad",{id_entidad});
        const rows = data.rows || [];
    
        if (!rows.length){
          tbody.innerHTML = `<tr><td colspan="4" style="padding:10px;color:var(--muted)">Sin personal.</td></tr>`;
          return;
        }
    
        tbody.innerHTML = rows.map(p=>`
          <tr>
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">
              ${escapeHtml(p.nombre_y_apellidos || '')}
            </td>
    
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">
              ${escapeHtml(p.rol || '')}
            </td>
    
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">
              ${(String(p.activo).toLowerCase() === 'true' || p.activo === true) ? 'Sí' : 'No'}
            </td>
    
            <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25);white-space:nowrap">
              ${canEdit() ? `
                <button class="btn" type="button"
                  onclick="openEditPersona('${escapeHtml(p.id_personal_entidad || '')}', '${escapeHtml(p.nombre_y_apellidos || '')}', '${escapeHtml(p.rol || '')}', '${String(p.activo)}')">
                  Editar
                </button>
              ` : ''}
    
              <button class="btn" type="button"
                onclick="openPersona('${escapeHtml(p.id_personal_entidad || '')}', '${escapeHtml(p.nombre_y_apellidos || '')}')">
                contactos
              </button>
            </td>
          </tr>
        `).join("");
    
      } catch(ex){
        tbody.innerHTML = `<tr><td colspan="4" style="padding:10px;color:var(--danger)">Error: ${escapeHtml(ex.message || 'No se pudo cargar')}</td></tr>`;
      }
    }
    async function openPersona(id_personal_entidad, nombre_persona){
      currentPersonalEntidadId = String(id_personal_entidad || '').trim();
      currentPersonalEntidadNombre = String(nombre_persona || '').trim();
    
      document.getElementById('co_id_personal_entidad').value = currentPersonalEntidadId;
      document.getElementById('contactosPersonaLabel').textContent =
        `${currentPersonalEntidadNombre} (${currentPersonalEntidadId})`;
    
      const err = document.getElementById('addContactoError');
      if (err) err.style.display = 'none';
    
      const form = document.getElementById('formAddContacto');
      if (form) {
        form.reset();
      }
    
      await loadContactos(currentPersonalEntidadId);
      openModal('modalContactos');
    }    
    async function loadContactos(id_personal_entidad){
      const tbody = document.getElementById('contactosTbody');
      if (!tbody) return;
    
      tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--muted)">Cargando…</td></tr>`;
    
      try{
        const data = await apiJsonp('contactos/list_by_personal', { id_personal_entidad });
        const rows = data.rows || [];
    
        if (!rows.length){
          tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--muted)">Sin contactos.</td></tr>`;
          return;
        }
    
        tbody.innerHTML = rows.map(c => {
          const principal = (String(c.principal).toLowerCase() === 'true' || c.principal === true);
    
          return `
            <tr>
              <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(c.tipo || '')}</td>
              <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(c.valor || '')}</td>
              <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${principal ? 'Sí' : 'No'}</td>
              <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(c.observaciones || '')}</td>
              <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25);white-space:nowrap">
                <button class="btn" type="button"
                  onclick="setContactoPrincipal('${escapeHtml(c.id_contacto || '')}')">
                  Principal
                </button>
                <button class="btn danger" type="button"
                  onclick="deleteContacto('${escapeHtml(c.id_contacto || '')}')">
                  Borrar
                </button>
              </td>
            </tr>
          `;
        }).join('');
    
      } catch(ex){
        tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--danger)">Error: ${escapeHtml(ex.message || 'No se pudo cargar')}</td></tr>`;
      }
    }    
async function loadContactos(id_personal_entidad){
  const tbody = document.getElementById('contactosTbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--muted)">Cargando…</td></tr>`;

  try{
    const data = await apiJsonp('contactos/list_by_personal', { id_personal_entidad });
    const rows = data.rows || [];

    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--muted)">Sin contactos.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(c => {
      const principal = (String(c.principal).toLowerCase() === 'true' || c.principal === true);

      return `
        <tr>
          <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(c.tipo || '')}</td>
          <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(c.valor || '')}</td>
          <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${principal ? 'Sí' : 'No'}</td>
          <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25)">${escapeHtml(c.observaciones || '')}</td>
          <td style="padding:10px;border-top:1px solid rgba(162,185,209,.25);white-space:nowrap">
            <button class="btn" type="button"
              onclick="setContactoPrincipal('${escapeHtml(c.id_contacto || '')}')">
              Principal
            </button>
            <button class="btn danger" type="button"
              onclick="deleteContacto('${escapeHtml(c.id_contacto || '')}')">
              Borrar
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch(ex){
    tbody.innerHTML = `<tr><td colspan="5" style="padding:10px;color:var(--danger)">Error: ${escapeHtml(ex.message || 'No se pudo cargar')}</td></tr>`;
  }
}
async function reloadCurrentContactos(){
  if (!currentPersonalEntidadId) return;
  await loadContactos(currentPersonalEntidadId);
}
function wireContactos(){
  const form = document.getElementById('formAddContacto');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const err = document.getElementById('addContactoError');
    const btn = document.getElementById('btnAddContacto');
    err.style.display = 'none';
    btn.disabled = true;

    try{
      const payload = {
        id_personal_entidad: document.getElementById('co_id_personal_entidad').value.trim(),
        tipo: document.getElementById('co_tipo').value,
        valor: document.getElementById('co_valor').value.trim(),
        principal: document.getElementById('co_principal').checked,
        observaciones: document.getElementById('co_obs').value.trim()
      };

      if (!payload.id_personal_entidad) throw new Error('No hay persona seleccionada');

      await apiFetch('contactos/create', {
        method: 'POST',
        body: payload
      });

      toast('Contacto añadido');
      form.reset();
      await loadContactos(payload.id_personal_entidad);

    } catch(ex){
      err.textContent = ex.message || 'No se pudo añadir el contacto';
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  });
}
    async function setContactoPrincipal(id_contacto){
  if (!canEdit()) return toast('Permisos insuficientes');

  try{
    await apiFetch('contactos/update', {
      method: 'POST',
      body: {
        id_contacto,
        patch: { principal: true }
      }
    });

    toast('Contacto principal actualizado');
    await reloadCurrentContactos();

  } catch(ex){
    toast(ex.message || 'No se pudo actualizar el contacto');
  }
}
async function deleteContacto(id_contacto){
  if (!canDelete()) return toast('Permisos insuficientes');
  if (!confirm('¿Borrar este contacto?')) return;

  try{
    await apiFetch('contactos/delete', {
      method: 'POST',
      body: { id_contacto }
    });

    toast('Contacto borrado');
    await reloadCurrentContactos();

  } catch(ex){
    toast(ex.message || 'No se pudo borrar el contacto');
  }
}
function wireContactoTipoHint(){
  const tipo = document.getElementById('co_tipo');
  const valor = document.getElementById('co_valor');
  if (!tipo || !valor) return;

  const refresh = () => {
    valor.placeholder = tipo.value === 'EMAIL'
      ? 'correo@dominio.es'
      : '600123123';
  };

  tipo.addEventListener('change', refresh);
  refresh();
}
function openEditPersona(id, nombre, rol, activo){
  document.getElementById('ep_id').value = id || '';
  document.getElementById('ep_nombre').value = nombre || '';
  document.getElementById('ep_rol').value = rol || 'TECNICO';
  document.getElementById('ep_activo').checked = String(activo).toLowerCase() === 'true';

  const err = document.getElementById('editPersonaError');
  if (err) err.style.display = 'none';

  openModal('modalEditPersona');
}
function wireEditPersona(){
  const form = document.getElementById('formEditPersona');
  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const err = document.getElementById('editPersonaError');
    const btn = document.getElementById('btnSavePersona');
    err.style.display = 'none';
    btn.disabled = true;

    try{
      const id_personal_entidad = document.getElementById('ep_id').value.trim();

      const patch = {
        nombre_y_apellidos: document.getElementById('ep_nombre').value.trim(),
        rol: document.getElementById('ep_rol').value,
        activo: document.getElementById('ep_activo').checked
      };

      await apiFetch('personal/update', {
        method: 'POST',
        body: { id_personal_entidad, patch }
      });

      closeModal('modalEditPersona');
      toast('Persona actualizada');

      const id_entidad = document.getElementById('ee_id').value.trim();
      if (id_entidad) await loadPersonal(id_entidad);

    } catch(ex){
      err.textContent = ex.message || 'No se pudo actualizar la persona';
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  });
}