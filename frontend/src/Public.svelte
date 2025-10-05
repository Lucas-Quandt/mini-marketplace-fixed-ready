<script>
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';

  // ========== CONFIG ==========
  const API = import.meta.env.VITE_API || "http://localhost:4000";

  // ========== HELPERS ==========
  const DIAS = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];
  const pad = (n) => String(n).padStart(2,'0');
  const absolutize = (u) => {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('/')) return `${API}${u}`;
    return `${API}/${u}`;
  };
  const isHHMM = (v) => typeof v === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(v);
  const fmtHM  = (v) => {
    if (v == null) return '';
    if (isHHMM(v)) return v.slice(0,5);
    const d = new Date(v);
    return isNaN(d) ? String(v) : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fmtDateDMY = (v) => {
    const d = (v instanceof Date) ? v : new Date(v);
    return isNaN(d) ? '' : `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;
  };
  export function prettyDispon(a) {
    const startRaw = (a?.startTime ?? a?.start);
    const endRaw   = (a?.endTime   ?? a?.end);
    const weekly = !!a?.weekly || (a?.dayOfWeek ?? a?.weekday ?? a?.dow) != null;
    if (weekly) {
      const dow = Number(a?.dayOfWeek ?? a?.weekday ?? a?.dow ?? new Date(startRaw).getDay());
      const name = (Number.isInteger(dow) && dow >= 0 && dow <= 6) ? DIAS[dow] : '';
      return `${name} ${fmtHM(startRaw)} até ${fmtHM(endRaw)}`;
    }
    return `${fmtDateDMY(startRaw)} ${fmtHM(startRaw)} até ${fmtHM(endRaw)}`;
  }

  function saveToken(t) { token = t; localStorage.setItem('token', t); }
  function loadToken() { return localStorage.getItem('token') || ''; }
  function saveUser(u) { user = u; try { localStorage.setItem('user', JSON.stringify(u)); } catch {} }
  function loadUser() { try { return JSON.parse(localStorage.getItem('user')||'null'); } catch { return null; } }

  // ========== STATE ==========
  let page = 'public'; // 'public' | 'provider' | 'login' | 'register'
  let token = loadToken();
  let user = null; // {id, name, role, photoUrl, email}
  const _cachedUser = loadUser();
  if (_cachedUser) { user = _cachedUser; }
  let services = [];
  let serviceTypes = [];

  // Provider lists
  let myServices = [];
  let loadingMyServices = false;

  // toggler para garantir que o usuário pode "clicar para ver a lista"
  let showAvail = true;
  // ====== Agendamento (mínimo e isolado) ======
  let scheduleDialog;
  let selectedDate = '';
  let selectedTime = '';
  let _serviceToHire = null;
  let _variationToHire = null;

  function openScheduleDialog(service) {
    _serviceToHire = service || null;
    _variationToHire = (service?.variations && service.variations[0]?.id) ? service.variations[0].id : null;
    selectedDate = '';
    selectedTime = '';
    if (scheduleDialog?.showModal) scheduleDialog.showModal();
  }
  function closeScheduleDialog() {
    if (scheduleDialog?.close) scheduleDialog.close();
  }

  // Verificação de conflito (best-effort, não quebra se backend não tiver endpoint)
  async function checkConflict(serviceId, isoDateTime) {
    const endpoints = [
      `${API}/contracts/check?serviceId=${serviceId}&datetime=${encodeURIComponent(isoDateTime)}`,
      `${API}/contracts?serviceId=${serviceId}&datetime=${encodeURIComponent(isoDateTime)}`
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
        if (res.status === 409) return true; // conflito explícito
        if (!res.ok) continue;
        const txt = await res.text();
        let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
        if (data?.conflict === true || data?.exists === true) return true;
        if (Array.isArray(data) && data.length > 0) return true;
        if (data?.count > 0) return true;
      } catch {}
    }
    return false;
  }

  // Confirmação do agendamento
  async function confirmSchedule() {
    if (!selectedDate || !selectedTime) {
      alert('Por favor, selecione um dia e um horário.');
      return;
    }
    if (!_serviceToHire) {
      alert('Serviço inválido.');
      return;
    }
    if (!user) {
      alert('Faça login para contratar.');
      return;
    }
    const iso = `${selectedDate}T${selectedTime}`;
    try {
      const variationId = _variationToHire || (_serviceToHire?.variations && _serviceToHire.variations[0]?.id);
      if (!variationId) {
        alert('Não foi possível identificar a variação do serviço.');
        return;
      }
      // Best-effort para backend que tenha verificador específico
      try {
        const hasConflict = await checkConflict(_serviceToHire.id, iso);
        if (hasConflict) {
          alert('Esse dia e horário outro cliente já escolheu.');
          return;
        }
      } catch {}
      // Chamada definitiva ao backend
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${API}/bookings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ clientId: user.id, variationId, startTime: iso })
      });
      if (resp.status === 409) {
        alert('Esse dia e horário outro cliente já escolheu.');
        return;
      }
      if (!resp.ok) {
        const t = await resp.text(); let b=null; try{ b = t?JSON.parse(t):null }catch{}
        throw new Error(b?.error || 'Erro ao contratar');
      }
      alert('✅ Serviço contratado');
      selectedDate = ''; selectedTime = ''; _serviceToHire = null; _variationToHire = null;
      closeScheduleDialog();
    } catch (e) {
      alert('❌ ' + (e?.message || String(e)));
    }
  }

  // Login/Register forms
  let login = { email:'', password:'' };
  let reg = { name:'', email:'', password:'', role:'PROVIDER', phone:'', city:'', state:'', bio:'' };

  // Provider profile/photo
  let uploadingPhoto = false;

  // Provider -> Agenda de serviços contratados
  let bookings = [];
  let loadingBookings = false;
  async function loadBookings() {
    if (!user?.id) return;
    loadingBookings = true;
    try {
      bookings = await api(`/providers/${user.id}/bookings`);
    } catch (e) {
      bookings = [];
    } finally {
      loadingBookings = false;
    }
  }

  // Provider -> Create Service form
  let sForm = {
    serviceTypeId: '',
    name: '',
    description: '',
    photosText: '',
    variations: [{ name:'Padrão', price:'0', durationMinutes:'30' }]
  };
  function ensurePhotosFromProfile() {
    if (user?.photoUrl && !sForm.photosText?.trim()) {
      sForm.photosText = absolutize(user.photoUrl);
    }
  }

  // Provider -> Availabilities
  let avail = {
    mode: 'date', // 'date' | 'weekly'
    date: '',     // YYYY-MM-DD
    dayOfWeek: '1', // 0..6
    startTime: '09:00',
    endTime: '10:00'
  };
  let myAvail = [];
  let loadingAvail = false;

    // ========== API ==========
  async function api(path, opts={}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...opts, headers });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) throw { status: res.status, body };
    return body;
  }

  // Busca serviço atualizado (tenta endpoint direto e cai no /services)
  async function getLatestService(serviceId) {
    try {
      return await api(`/services/${serviceId}`);
    } catch (_) {
      try {
        const all = await api('/services');
        return (Array.isArray(all) ? all.find(s => s.id === serviceId) : null) || null;
      } catch { return null; }
    }
  }

  async function loadServices() {
    try { services = await api('/services'); } catch (e) { console.warn(e); }
  }
  async function loadServiceTypes() {
    try { serviceTypes = await api('/service-types'); } catch (e) { console.warn(e); }
  }
  async function loadMyServices() {
    if (!user?.id) return;
    loadingMyServices = true;
    try { myServices = await api(`/providers/${user.id}/services`); }
    catch (e) { console.warn(e); myServices = []; }
    finally { loadingMyServices = false; }
  }
  async function doLogin() {
    try {
      const out = await api('/auth/login', { method:'POST', body: JSON.stringify(login) });
      user = out.user; saveToken(out.token); saveUser(out.user);
      page = (user.role === 'PROVIDER') ? 'provider' : 'public';
      ensurePhotosFromProfile();
      await loadMyAvail();
      await loadMyServices();
    } catch (e) { alert(e?.body?.error || 'Erro ao logar'); }
  }
  async function doRegister() {
    try {
      const out = await api('/auth/register', { method:'POST', body: JSON.stringify(reg) });
      user = out.user; saveToken(out.token); saveUser(out.user);
      page = (user.role === 'PROVIDER') ? 'provider' : 'public';
    } catch (e) { alert(e?.body?.error || 'Erro ao registrar'); }
  }
  function logout() { user = null; token=''; localStorage.removeItem('token'); localStorage.removeItem('user'); page='public'; }

  // Foto perfil
  async function onPickPhoto(ev) {
    const file = ev?.target?.files?.[0];
    if (!file || !user?.id) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        uploadingPhoto = true;
        const base64 = reader.result;
        const r = await api(`/providers/${user.id}/photo`, { method:'POST', body: JSON.stringify({ imageBase64: base64 }) });
        user.photoUrl = r.photoUrl;
        ensurePhotosFromProfile();
        await loadServices();
        await loadMyServices();
      } catch (e) { alert(e?.body?.error || 'Erro ao enviar foto'); }
      finally { uploadingPhoto = false; }
    };
    reader.readAsDataURL(file);
  }

  function parsePhotos(text) {
    if (!text) return [];
    return text.split(',').map(s => s.trim()).filter(Boolean);
  }
  async function createService() {
    try {
      let photos = parsePhotos(sForm.photosText);
      if ((!photos || !photos.length) && user?.photoUrl) photos = [absolutize(user.photoUrl)];
      const body = {
        serviceTypeId: Number(sForm.serviceTypeId),
        name: sForm.name,
        description: sForm.description,
        photos,
        variations: sForm.variations.map(v => ({
          name: v.name, price: Number(v.price || 0), durationMinutes: parseInt(v.durationMinutes || 0)
        }))
      };
      await api(`/providers/${user.id}/services`, { method:'POST', body: JSON.stringify(body) });
      alert('Serviço criado!');
      sForm = { serviceTypeId:'', name:'', description:'', photosText:'', variations:[{ name:'Padrão', price:'0', durationMinutes:'30' }] };
      await loadServices();
      await loadMyServices();
      await loadMyAvail();
      ensurePhotosFromProfile();
    } catch (e) { alert(e?.body?.error || 'Erro ao criar serviço'); }
  }

  async function addAvailability() {
    try {
      const payload = { startTime: avail.startTime, endTime: avail.endTime };
      if (avail.mode === 'date') payload.date = avail.date;
      else payload.dayOfWeek = Number(avail.dayOfWeek);
      await api(`/providers/${user.id}/availability`, { method:'POST', body: JSON.stringify(payload) });
      await loadMyAvail();
    } catch (e) {
      alert((e?.body && e.body.error) ? e.body.error : 'Erro ao criar disponibilidade');
    }
  }
  async function loadMyAvail() {
    if (!user?.id) return;
    loadingAvail = true;
    try { myAvail = await api(`/providers/${user.id}/availability`); }
    catch (e) { console.error(e); myAvail = []; }
    finally { loadingAvail = false; }
  }
  async function deleteAvail(a) {
    if (!confirm('Remover este horário?')) return;
    try { await api(`/providers/${user.id}/availability/${a.id}`, { method: 'DELETE' }); await loadMyAvail(); }
    catch (e) { alert(e?.body?.error || 'Erro ao remover'); }
  }

  function goPublic() { page='public'; loadServices(); }
  function goProvider() { page='provider'; if (user?.role==='PROVIDER') { loadMyAvail(); loadMyServices(); loadBookings(); } }

  
  async function deleteServiceItem(svc) {
    if (!svc?.id || !user?.id) return;
    await deleteServiceById(svc.id);
  }

  onMount(async () => {
    await loadServiceTypes();
    await loadServices();
  });

  let expandedCard = null;

  function toggleExpand(id, providerId) { const opening = expandedCard !== id; expandedCard = (expandedCard === id) ? null : id; if (opening && providerId) loadAvailability(providerId); }

  async function contratar(service) {
    if (!user) { alert('Faça login para contratar.'); return; }
    openScheduleDialog(service);
  }

  // cache de disponibilidade por prestador (mínimo e isolado)
  let availabilityByProvider = {};

  async function loadAvailability(providerId) {
    if (!providerId) return;
    if (availabilityByProvider[providerId] !== undefined) return; // já carregado (ou vazio)
    try {
      const resp = await fetch(`${API}/providers/${providerId}/availability`);
      if (!resp.ok) throw new Error('falha disponibilidade');
      const rows = await resp.json();
      availabilityByProvider = { ...availabilityByProvider, [providerId]: rows };
    } catch (e) {
      console.error('availability error', e);
      availabilityByProvider = { ...availabilityByProvider, [providerId]: [] };
    }
  }

  // Excluir serviço por ID (usado também na Agenda)
  async function deleteServiceById(serviceId) {
    if (!serviceId) return;
    if (!user?.role || user.role !== 'PROVIDER') { alert('Faça login como prestador.'); return; }

    const doDelete = async (force=false) => {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const url = `${API}/providers/${user.id}/services/${serviceId}` + (force ? '?force=true' : '');
      const resp = await fetch(url, { method: 'DELETE', headers });
      const text = await resp.text();
      let body = null; try { body = text ? JSON.parse(text) : null; } catch {}
      return { ok: resp.ok, status: resp.status, message: body?.error || body?.message || text };
    };

    // 1ª confirmação (normal)
    if (!confirm('Excluir este serviço? Essa ação não pode ser desfeita.')) return;

    let r = await doDelete(false);

    // Se existir contratação ativa, backend retorna 409 — oferecer exclusão forçada
    if (!r.ok && r.status === 409) {
      const yes = confirm('Este serviço possui contratações ativas. Deseja excluir o serviço e TODAS as contratações vinculadas?');
      if (!yes) return;
      r = await doDelete(true);
    }

    if (!r.ok) {
      alert('Não foi possível excluir o serviço: ' + (r.message || 'Erro desconhecido'));
      return;
    }

    // Atualiza listas
    if (typeof loadMyServices === 'function') await loadMyServices();
    if (typeof loadBookings === 'function') await loadBookings();
    alert('Serviço excluído com sucesso.');
  }

  // Cancelar contratação (agenda do prestador): tenta múltiplos endpoints
  async function cancelBooking(bookingId) {
    if (!bookingId) return;
    if (!confirm('Cancelar esta contratação?')) return;
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const endpoints = [
      { method: 'DELETE', path: `/bookings/${bookingId}` },
      { method: 'PATCH',  path: `/bookings/${bookingId}`, body: { status: 'CANCELLED' } },
      { method: 'POST',   path: `/bookings/${bookingId}/cancel` },
    ];
    let lastErr = null;
    for (const ep of endpoints) {
      try {
        const res = await fetch(`${API}${ep.path}`, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: ep.body ? JSON.stringify(ep.body) : undefined
        });
        if (res.ok) {
          await loadBookings();
          alert('Contratação cancelada.');
          return;
        }
        const t = await res.text(); let b=null; try{ b = t?JSON.parse(t):null }catch{}
        lastErr = b?.error || b?.message || t || `HTTP ${res.status}`;
      } catch (e) {
        lastErr = e?.message || String(e);
      }
    }
    alert('Não foi possível cancelar: ' + (lastErr || 'Erro desconhecido'));
  }
</script>

<style>
  :root { --gap: 12px; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; }
  header { display:flex; gap:var(--gap); align-items:center; padding:12px; border-bottom:1px solid #eee; }
  header .spacer { flex:1; }
  button { cursor:pointer; padding:8px 12px; border:1px solid #ddd; border-radius:8px; background:#fff; color:#111; }
  button.primary { background:#111; color:#fff; border-color:#111; }
  main { max-width: 1000px; margin: 16px auto; padding: 0 12px; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:16px; }
  .card { border:1px solid #eee; border-radius:12px; padding:12px; background:#fff; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .muted { color:#666; font-size: .9rem; }
  .row { display:flex; gap:12px; align-items:center; }
  img.cover { width:100%; height:160px; object-fit:cover; border-radius:10px; background:#f5f5f5; }
  img.avatar { width:36px; height:36px; border-radius:50%; object-fit:cover; background:#eee; }
  fieldset { border:1px solid #eee; border-radius:12px; padding:12px; }
  legend { padding:0 6px; color:#444; }
  label { font-size:.9rem; color:#333; margin-top:8px; display:block; }
  input, select, textarea { width:100%; padding:8px; border:1px solid #ddd; border-radius:8px; }
  .spaced { margin-top:14px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid #ddd; font-size:.8rem; }
  .card.expanded { box-shadow: 0 0 12px rgba(52,152,219,0.6); border: 2px solid #3498db; transform: scale(1.02); transition: all 0.3s ease; }
  .var-row label.small{font-size:12px;color:#666;}
</style>

<header>
  <button on:click={goPublic}>Página principal</button>
  <button on:click={goProvider}>Painel do Prestador</button>
  <div class="spacer"></div>
  {#if user}
    <div class="row">
      {#if user.photoUrl}
        <img class="avatar" alt="foto" src={absolutize(user.photoUrl)} />
      {/if}
      <span>{user.name}</span>
      <button on:click={logout}>Sair</button>
    </div>
  {:else}
    <button on:click={() => page='login'}>Entrar</button>
    <button on:click={() => page='register'}>Criar conta</button>
  {/if}
</header>


<header class="hero">
  <h1 style="font-size: 3rem; text-align: center; margin-top: 1rem; color: #2c3e50;">
    🚀 Mini Market Place
  </h1>
  <h2 style="font-size: 1.5rem; text-align: center; margin-bottom: 2rem; color: #555;">
    Atras de serviços? Aqui é o lugar ✨
  </h2>
</header>

<main>
  {#if page === 'public'}
    <h2>Serviços</h2>
    <div class="grid">
      {#each services as s}
        <div class="card {expandedCard === s.id ? 'expanded' : ''}" on:click={() => toggleExpand(s.id, s.provider?.id)} style="cursor:pointer;">
          {#if (s.provider?.photoUrl)}
            <img class="cover" alt="foto prestador" src={absolutize(s.provider.photoUrl)} />
          {:else if (s.photos && s.photos.length)}
            <img class="cover" alt="foto serviço" src={absolutize(s.photos[0])} />
          {:else}
            <div class="cover" style="display:flex;align-items:center;justify-content:center;color:#999">Sem imagem</div>
          {/if}

          <h3 style="margin:8px 0 4px">{s.name}</h3>
          <div class="muted">{s.type?.name}</div>

          {#if s.provider}
          <div class="row" style="margin-top:8px">
            {#if s.provider.photoUrl}
              <img class="avatar" alt="avatar" src={absolutize(s.provider.photoUrl)} />
            {/if}
            <div>
              <div class="muted">Prestador</div>
              <div><strong>{s.provider.name}</strong></div>
            </div>
          </div>
          {/if}

          {#if s.description}
            <p class="muted" style="margin-top:8px">{s.description}</p>
          {/if}
          {#if s.variations?.length}
            <div class="spaced">
              <span class="badge">{s.variations[0].name} — R$ {Number(s.variations[0].price).toFixed(2)}</span>
            </div>
          {/if}
          {#if expandedCard === s.id}
            <div class="extra-info" transition:slide style="margin-top: 0.75rem; background: #f9f9f9; padding: 0.75rem; border-radius: 8px;">
              <div>
                <strong>Horários disponíveis:</strong>
                {#if s.provider}
                  {#if availabilityByProvider[s.provider.id] === undefined}
                    <p class="muted" style="margin:4px 0">Carregando horários...</p>
                  {:else if availabilityByProvider[s.provider.id].length > 0}
                    <ul style="margin:6px 0 0 16px; padding:0;">
                      {#each availabilityByProvider[s.provider.id] as av}
                        <li>{prettyDispon(av)}</li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="muted" style="margin:4px 0">Nenhum horário cadastrado</p>
                  {/if}
                {:else}
                  <p class="muted" style="margin:4px 0">Prestador não informado</p>
                {/if}
              </div>
              <button on:click|stopPropagation={() => contratar(s)} style="margin-top: 0.5rem; background:#3498db; color:#fff; padding:0.5rem 1rem; border:none; border-radius:6px;">Contratar</button>
            </div>
          {/if}
    
        </div>
      {/each}
    </div>
  {/if}

  {#if page === 'login'}
    <h2>Entrar</h2>
    <div class="card">
      <label>Email</label>
      <input bind:value={login.email} type="email" placeholder="voce@email.com" />
      <label>Senha</label>
      <input bind:value={login.password} type="password" placeholder="••••••••" />
      <div class="spaced">
        <button class="primary" on:click={doLogin}>Entrar</button>
        <button on:click={() => page='register'}>Criar conta</button>
      </div>
    </div>
  {/if}

  {#if page === 'register'}
    <h2>Criar conta</h2>
    <div class="card">
      <label>Nome</label><input bind:value={reg.name} />
      <label>Email</label><input bind:value={reg.email} type="email" />
      <label>Senha</label><input bind:value={reg.password} type="password" />
      <label>Tipo</label>
      <select bind:value={reg.role}>
        <option value="PROVIDER">Prestador</option>
        <option value="CLIENT">Cliente</option>
      </select>
      <label>Telefone</label><input bind:value={reg.phone} />
      <label>Cidade</label><input bind:value={reg.city} />
      <label>Estado</label><input bind:value={reg.state} />
      <label>Bio</label><textarea rows="3" bind:value={reg.bio}></textarea>
      <div class="spaced">
        <button class="primary" on:click={doRegister}>Criar</button>
        <button on:click={() => page='login'}>Já tenho conta</button>
      </div>
    </div>
  {/if}

  {#if page === 'provider'}
    {#if !user || user.role !== 'PROVIDER'}
      <div class="card">Faça login como prestador para acessar o painel.</div>
    {:else}
      <h2>Painel do Prestador</h2>

      <!-- Agenda (serviços contratados) -->
      <fieldset style="margin-bottom:16px">
        <legend>Agenda (serviços contratados)</legend>
        {#if loadingBookings}
          <div class="muted">Carregando...</div>
        {:else if bookings.length === 0}
          <div class="muted">Nenhuma contratação registrada.</div>
        {:else}
          <div class="table-like" style="width:100%; overflow:auto">
            <div class="row" style="font-weight:600; border-bottom:1px solid #eee; padding:6px 0">
              <div style="flex:1">Data</div>
              <div style="flex:1">Horário</div>
              <div style="flex:2">Serviço / Variação</div>
              <div style="flex:2">Cliente</div>
              <div style="flex:1">Status</div>
            </div>
            {#each bookings as b}
              <div class="row" style="border-bottom:1px dashed #f0f0f0; padding:6px 0">
                <div style="flex:1">{fmtDateDMY(b.startTime)}</div>
                <div style="flex:1">{fmtHM(b.startTime)} - {fmtHM(b.endTime)}</div>
                <div style="flex:2">
                  {#if b.service?.name}{b.service.name}{/if}
                  {#if b.serviceVariation?.name} — {b.serviceVariation.name}{/if}
                </div>
                <div style="flex:2">{b.client?.name || 'Cliente'}</div>
                <div style="flex:1">{b.status}</div>
                <div style="flex:1;display:flex;justify-content:flex-end">
                  {#if b.id}
  <button on:click={() => cancelBooking(b.id)}>Cancelar contratação</button>
{/if}
</div>
              </div>
            {/each}
          </div>
        {/if}
        <div class="row" style="justify-content:flex-end; margin-top:8px">
          <button on:click={loadBookings}>Atualizar agenda</button>
        </div>
      </fieldset>

      <!-- Perfil / foto -->
      <fieldset style="margin-bottom:16px">
        <legend>Meu Perfil</legend>
        <div class="row">
          {#if user.photoUrl}
            <img class="avatar" alt="foto" src={absolutize(user.photoUrl)} />
          {/if}
          <div>
            <div><strong>{user.name}</strong></div>
            <div class="muted">{user.email}</div>
          </div>
        </div>
        <div class="spaced">
          <input type="file" accept="image/*" on:change={onPickPhoto} />
          {#if uploadingPhoto}<div class="muted">Enviando foto…</div>{/if}
        </div>
      </fieldset>

      <!-- Cadastro de Serviço -->
      <fieldset style="margin-bottom:16px">
        <legend>Novo Serviço</legend>
        <label>Tipo</label>
        <select bind:value={sForm.serviceTypeId}>
          <option value="" disabled>Selecione...</option>
          {#each serviceTypes as st}
            <option value={st.id}>{st.name}</option>
          {/each}
        </select>
        <label>Nome</label><input bind:value={sForm.name} placeholder="Ex.: Manicure" />
        <label>Descrição</label><textarea rows="3" bind:value={sForm.description} placeholder="Descreva seu serviço"></textarea>

        <!-- Campo de fotos escondido; auto-preenchido com a foto do perfil -->
        <input bind:value={sForm.photosText} hidden />

        <div class="card" style="margin-top:.75rem">
          <div class="small muted"><strong>Variações</strong></div>
          {#each sForm.variations as v, i}
            <div
  class="row var-row"
  style="
    margin-top:6px;
    display:grid;
    grid-template-columns: 1fr auto 120px auto 140px auto; /* uma única linha */
    align-items:center;
    column-gap:8px;
  "
>
  <input style="width:100%" bind:value={v.name} placeholder="Nome" />

  <span class="muted" style="justify-self:end;">R$</span>
  <input style="width:120px" bind:value={v.price} type="number" step="0.01" placeholder="Preço" />

  <span class="muted" style="justify-self:end;">Min.</span>
  <input style="width:140px" bind:value={v.durationMinutes} type="number" step="5" placeholder="Duração (min)" />

  <button on:click={() => sForm.variations = sForm.variations.filter((_,j)=>j!==i)}>Remover</button>
</div>

          {/each}
          <div class="spaced">
            <button on:click={() => sForm.variations = [...sForm.variations, { name:'', price:'0', durationMinutes:'30' }]}>+ Variação</button>
          </div>
        </div>

        <div class="spaced">
          <button class="primary" on:click={createService}>Salvar serviço</button>
        </div>
      </fieldset>

      <!-- Meus Serviços (lista) -->
      <fieldset style="margin-bottom:16px">
        <legend>Meus Serviços</legend>
        {#if loadingMyServices}
          <div class="muted">Carregando...</div>
        {:else if myServices.length === 0}
          <div class="muted">Você ainda não cadastrou serviços.</div>
        {:else}
          <div class="grid">
            {#each myServices as s}
              <div class="card">
                {#if user?.photoUrl}
                  <img class="cover" alt="foto prestador" src={absolutize(user.photoUrl)} />
                {:else if (s.photos && s.photos.length)}
                  <img class="cover" alt="foto serviço" src={absolutize(s.photos[0])} />
                {:else}
                  <div class="cover" style="display:flex;align-items:center;justify-content:center;color:#999">Sem imagem</div>
                {/if}
                <h3 style="margin:8px 0 4px">{s.name}</h3>
                {#if s.description}<div class="muted">{s.description}</div>{/if}
                {#if s.variations?.length}
                  <div class="spaced">
                    <span class="badge">{s.variations[0].name} — R$ {Number(s.variations[0].price).toFixed(2)}</span>
                  </div>
                {/if}
                <div class="spaced" style="display:flex;justify-content:flex-end">
                  <button on:click={() => deleteServiceItem(s)}>Excluir serviço</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </fieldset>

      <!-- Agenda do prestador -->
      <fieldset style="margin-bottom:16px">
        <legend>Agenda do Prestador</legend>

        <div class="row">
          <label style="display:flex; align-items:center; gap:6px">
            <input type="radio" name="mode" value="date" bind:group={avail.mode} />
            Data específica
          </label>
          <label style="display:flex; align-items:center; gap:6px">
            <input type="radio" name="mode" value="weekly" bind:group={avail.mode} />
            Semanal (dia fixo)
          </label>
        </div>

        {#if avail.mode === 'date'}
          <div class="row spaced">
            <div style="flex:1">
              <label>Data</label>
              <input type="date" bind:value={avail.date} />
            </div>
            <div>
              <label>Início</label>
              <input type="time" bind:value={avail.startTime} />
            </div>
            <div>
              <label>Fim</label>
              <input type="time" bind:value={avail.endTime} />
            </div>
          </div>
        {:else}
          <div class="row spaced">
            <div style="flex:1">
              <label>Dia da semana</label>
              <select bind:value={avail.dayOfWeek}>
                {#each DIAS as d, i}
                  <option value={i}>{d}</option>
                {/each}
              </select>
            </div>
            <div>
              <label>Início</label>
              <input type="time" bind:value={avail.startTime} />
            </div>
            <div>
              <label>Fim</label>
              <input type="time" bind:value={avail.endTime} />
            </div>
          </div>
        {/if}

        <div class="row spaced">
          <button class="primary" on:click={addAvailability}>Criar disponibilidade</button>
          <button on:click={() => { showAvail = true; loadMyAvail(); }}>Ver/Recarregar disponibilidades</button>
          <button on:click={loadMyServices}>Recarregar meus serviços</button>
        </div>
      </fieldset>

      <!-- Minhas disponibilidades -->
      {#if showAvail}
      <fieldset>
        <legend>Minhas disponibilidades</legend>
        {#if loadingAvail}
          <div class="muted">Carregando...</div>
        {:else if myAvail.length === 0}
          <div class="muted">Nenhum horário cadastrado.</div>
        {:else}
          {#each myAvail as a}
            <div class="row" style="justify-content:space-between; padding:8px 0; border-bottom:1px dashed #eee">
              <div>— {prettyDispon(a)}</div>
              <button on:click={() => deleteAvail(a)}>Excluir</button>
            </div>
          {/each}
        {/if}
      </fieldset>
      {/if}
    {/if}
  {/if}

  <!-- Diálogo de agendamento: dia e horário -->
  <dialog bind:this={scheduleDialog} style="padding:0;border:none;border-radius:12px;max-width:420px;width:92%;">
    <form method="dialog" style="padding:16px 16px 0">
      <h3 style="margin:0 0 8px; color:#2c3e50;">Selecionar dia e horário</h3>
      <div class="row" style="gap:8px">
        <div style="flex:1">
          <label for="ag-data">Dia</label>
          <input id="ag-data" type="date" bind:value={selectedDate} />
        </div>
        <div style="flex:1">
          <label for="ag-hora">Horário</label>
          <input id="ag-hora" type="time" bind:value={selectedTime} />
        </div>
      </div>
      <div class="row" style="justify-content:flex-end; gap:8px; margin-top:16px; border-top:1px solid #eee; padding:12px 0 16px">
        <button type="button" on:click={closeScheduleDialog}>Cancelar</button>
        <button type="button" class="primary" on:click={confirmSchedule}>Confirmar</button>
      </div>
    </form>
  </dialog>
</main>