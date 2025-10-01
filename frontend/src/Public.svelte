<script>
  import { onMount } from "svelte";

  // Base da API
  const API =
    (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ||
    "http://localhost:4000";

  // Estado
  let loading = true;
  let error = "";
  let types = [];
  let services = [];
  let providerNames = {};

  // Filtros
  let q = "";
  let typeFilter = "";

  // ---- Utils ----
  function parsePhotos(p) {
    if (!p) return [];
    if (Array.isArray(p)) return p;
    if (typeof p === "string") {
      try {
        const arr = JSON.parse(p);
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
      } catch {
        return p.split(",").map(s => s.trim()).filter(Boolean);
      }
    }
    return [];
  }

  function asArrayMaybe(resp) {
    if (Array.isArray(resp)) return resp;
    if (Array.isArray(resp?.items)) return resp.items;
    if (Array.isArray(resp?.data)) return resp.data;
    if (Array.isArray(resp?.hits?.hits)) {
      return resp.hits.hits
        .map(h => h._source || h.source || null)
        .filter(Boolean);
    }
    return null;
  }

  async function loadTypes() {
    try {
      const r = await fetch(`${API}/service-types`);
      if (r.ok) types = await r.json();
    } catch {}
  }

  async function fetchProviderNameOnce(id) {
    if (!id || providerNames[id]) return;
    const tryUrls = [
      `${API}/providers/${id}`,
      `${API}/users/${id}`,
      `${API}/api/providers/${id}`,
      `${API}/v1/providers/${id}`
    ];
    for (const url of tryUrls) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const txt = await r.text();
        let data; try { data = JSON.parse(txt); } catch { data = {}; }
        const name = data.name || data.fullName || data.displayName || data.email;
        if (name) { providerNames[id] = name; return; }
      } catch {}
    }
    providerNames[id] = `Prestador #${id}`;
  }

  async function loadServices() {
    loading = true; error = ""; services = [];
    const attempts = [
      `${API}/services?public=1`,
      `${API}/services`,
      `${API}/api/services`,
      `${API}/v1/services`,
      `${API}/search?q=`,
      `${API}/search?q=*`,
      `${API}/search?query=`,
    ];

    for (const url of attempts) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const txt = await r.text();
        let data; try { data = JSON.parse(txt); } catch { continue; }
        const arr = asArrayMaybe(data);
        if (!arr) continue;

        const normalized = arr.map(s => {
          const photos = parsePhotos(s.photos);
          const variations = Array.isArray(s.variations) ? s.variations : [];
          const providerId = s.providerId || s.provider_id || s.provider?.id || s.userId || s.user?.id;
          return {
            id: s.id,
            name: s.name || "(sem nome)",
            description: s.description || "",
            photos,
            variations,
            serviceTypeId: s.serviceTypeId || s.typeId || s.type?.id || null,
            providerId,
          };
        });

        services = normalized;

        const uniqueProviderIds = [...new Set(services.map(s => s.providerId).filter(Boolean))];
        uniqueProviderIds.forEach(id => fetchProviderNameOnce(id));
        loading = false;
        return;
      } catch {}
    }

    loading = false;
    error = "Não foi possível carregar os serviços (tente novamente mais tarde).";
  }

  function filteredServices() {
    let list = services;
    if (typeFilter) {
      const tid = Number(typeFilter);
      list = list.filter(s => Number(s.serviceTypeId) === tid);
    }
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter(s =>
        (s.name || "").toLowerCase().includes(term) ||
        (s.description || "").toLowerCase().includes(term) ||
        (s.variations || []).some(v => (v.name || "").toLowerCase().includes(term))
      );
    }
    return list;
  }

  onMount(async () => {
    await Promise.all([loadTypes(), loadServices()]);
  });
</script>

<style>
  :root { color-scheme: light dark; }
  .wrap { max-width: 1000px; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Arial; }
  h1 { margin: 0 0 .5rem; }
  .muted { opacity: .75; }
  .toolbar { display: grid; gap: .5rem; grid-template-columns: 1fr 220px 160px; margin: 1rem 0; }
  .toolbar input, .toolbar select { padding: .6rem .7rem; border-radius: .6rem; border: 1px solid #8884; background: inherit; }
  .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .card { border: 1px solid #8884; border-radius: .8rem; overflow: hidden; display: flex; flex-direction: column; }
  .thumb { width: 100%; height: 160px; object-fit: cover; background: #0001; }
  .content { padding: .8rem; display: grid; gap: .4rem; }
  .line { font-size: .92rem; }
  .chipz { display: flex; flex-wrap: wrap; gap: .25rem; }
  .chip { border: 1px solid #8884; border-radius: 999px; padding: .1rem .5rem; font-size: .78rem; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: .75rem; margin-bottom: .5rem; }
  .btn { border: 1px solid #6665; border-radius: .6rem; padding: .5rem .7rem; background: inherit; cursor: pointer; text-decoration: none; color: inherit; }
  .empty { border: 1px dashed #8886; border-radius: .8rem; padding: 1rem; text-align: center; }
</style>

<div class="wrap">
  <div class="topbar">
    <div>
      <h1>Mini-Marketplace</h1>
      <div class="muted">Descubra serviços e prestadores — não precisa fazer login.</div>
    </div>
    <a class="btn" href="#/prestador" title="Ir para o painel do prestador">Painel do Prestador</a>
  </div>

  <div class="toolbar">
    <input placeholder="Buscar por nome, descrição ou variação…" bind:value={q} />
    <select bind:value={typeFilter}>
      <option value="">Todos os tipos</option>
      {#each types as t}
        <option value={t.id}>{t.name}</option>
      {/each}
    </select>
    <button class="btn" on:click={loadServices} aria-busy={loading}>Atualizar</button>
  </div>

  {#if loading}
    <div class="empty">Carregando serviços…</div>
  {:else if error}
    <div class="empty">{error}</div>
  {:else}
    {#if filteredServices().length === 0}
      <div class="empty">Nenhum serviço encontrado com os filtros atuais.</div>
    {:else}
      <div class="grid">
        {#each filteredServices() as s}
          <div class="card">
            {#if s.photos.length}
              <img class="thumb" src={s.photos[0]} alt={"Foto de " + s.name} loading="lazy" />
            {:else}
              <div class="thumb"></div>
            {/if}
            <div class="content">
              <div class="line"><strong>{s.name}</strong></div>
              {#if s.description}<div class="line muted">{s.description}</div>{/if}
              <div class="line muted">
                {#if s.providerId}
                  Prestador: {providerNames[s.providerId] || `#${s.providerId}`}
                {:else}
                  Prestador: —
                {/if}
              </div>
              {#if s.variations?.length}
                <div class="chipz">
                  {#each s.variations.slice(0,4) as v}
                    <span class="chip">{v.name} — R$ {v.price} · {v.durationMinutes} min</span>
                  {/each}
                  {#if s.variations.length > 4}
                    <span class="chip">+{s.variations.length - 4}</span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
