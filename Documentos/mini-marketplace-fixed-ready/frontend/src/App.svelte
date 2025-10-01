<script>
  import { onMount } from "svelte";

  // Base da API
  const API =
    (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ||
    "http://localhost:4000";

  // -------------------- Utils --------------------
  function dayName(n) {
    const map = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
    const i = Number(n);
    return (i>=0 && i<=6) ? map[i] : String(n);
  }
  function authHeaderMaybe(){
    return authState.token ? { Authorization: `Bearer ${authState.token}` } : {};
  }
  function providerIdFromAuth() {
    const u = authState.user;
    if (!u) return "";
    if (typeof u.id !== "undefined") return String(u.id);
    if (u.user && typeof u.user.id !== "undefined") return String(u.user.id);
    return "";
  }
  function extractTokenAndUser(data) {
    const token = data?.token || data?.accessToken || data?.jwt || data?.data?.token || data?.data?.accessToken || "";
    const user =
      data?.user ||
      data?.data?.user ||
      (typeof data?.id !== "undefined" ? { id: data.id } : null) ||
      null;
    return { token, user };
  }
  function photosArrFromText(txt){ return txt.split(",").map(s => s.trim()).filter(Boolean); }

  // -------------- Tipos de Serviço --------------
  let serviceTypes = [];
  let serviceTypesLoading = false;
  let serviceTypesErr = "";

  // -------------- Cadastro de Prestador --------------
  let reg = { name: "", email: "", password: "", role: "provider" };
  let registerResult = null;

  async function registerProvider() {
    registerResult = null;

    const urls = [
      `${API}/auth/register`,
      `${API}/register`,
      `${API}/api/auth/register`,
      `${API}/v1/auth/register`,
    ];

    const bodies = [
      { name: reg.name, email: reg.email, password: reg.password, role: reg.role || "provider" },
      { name: reg.name, email: reg.email, password: reg.password, role: "prestador" },
      { name: reg.name, email: reg.email, password: reg.password, role: "PROVIDER" },
      { name: reg.name, email: reg.email, password: reg.password }, // sem role
    ];

    const attempts = [];
    for (const url of urls) {
      for (const body of bodies) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const txt = await res.text();
          let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

          attempts.push({ url, status: res.status, ok: res.ok, bodySent: body, bodySnippet: txt.slice(0, 200) });

          if (res.ok) {
            registerResult = { ok: true, status: res.status, data, attempts };
            return;
          }

          const msg = (data?.error || txt || "").toString().toLowerCase();
          if (res.status === 400 && msg.includes("role")) continue;
        } catch (e) {
          attempts.push({ url, error: String(e) });
        }
      }
    }
    registerResult = { ok: false, status: 400, data: { error: "Não foi possível registrar" }, attempts };
  }

  // -------------- Login/Sessão --------------
  let auth = { email: "", password: "" };
  let authState = { token: "", user: null };
  let loginResult = null;

  onMount(() => {
    try { const saved = localStorage.getItem("mm_auth"); if (saved) authState = JSON.parse(saved) || authState; } catch {}
  });
  function saveAuth(){ localStorage.setItem("mm_auth", JSON.stringify(authState)); }
  function logout(){ authState = { token:"", user:null }; saveAuth(); }

  async function login() {
    loginResult = null;
    const payload = { email: auth.email, password: auth.password };
    const routes = [
      `${API}/auth/login`,
      `${API}/login`,
      `${API}/sessions`,
      `${API}/session`,
      `${API}/api/auth/login`,
      `${API}/v1/auth/login`,
    ];
    const attempts = [];
    for (const url of routes) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const txt = await res.text();
        let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
        attempts.push({ url, status: res.status, ok: res.ok, bodySnippet: txt.slice(0, 200) });
        if (res.ok) {
          const { token, user } = extractTokenAndUser(data);
          authState.token = token || "";
          authState.user = user || null;
          saveAuth();
          loginResult = { ok: true, status: res.status, data, attempts };
          const pid = providerIdFromAuth();
          if (pid) {
            sForm.providerIdManual = pid;
            aForm.providerIdManual = pid;
          }
          return;
        }
      } catch (e) {
        attempts.push({ url, error: String(e) });
      }
    }
    loginResult = { ok:false, error:"Falhou em todas as rotas de login testadas.", attempts };
  }

  // -------------- Cadastro de Serviço --------------
  let sForm = {
    providerIdManual: "",
    serviceTypeId: "",
    name: "",
    description: "",
    photosText: "",
    variations: [{ name: "", price: "", durationMinutes: "" }]
  };
  let createServiceResult = null;

  function normalizedVariations(fromList) {
    const list = fromList || sForm.variations;
    return list
      .map(v => ({
        name: (v.name || "").trim(),
        price: v.price === "" ? null : Number(v.price),
        durationMinutes: v.durationMinutes === "" ? null : parseInt(v.durationMinutes, 10)
      }))
      .filter(v => v.name && Number.isFinite(v.price) && Number.isInteger(v.durationMinutes));
  }
  function addVariation(){ sForm.variations = [...sForm.variations, { name:"", price:"", durationMinutes:"" }]; }
  function removeVariation(i){ sForm.variations = sForm.variations.filter((_,idx)=>idx!==i); }

  async function createService() {
    createServiceResult = null;

    const idFromLogin = providerIdFromAuth();
    const effectiveProviderId = idFromLogin || (sForm.providerIdManual || "").trim();

    if (!effectiveProviderId) { createServiceResult = { ok:false, error:"Faça login (recomendado) ou informe o Provider ID." }; return; }
    if (idFromLogin && sForm.providerIdManual && sForm.providerIdManual !== idFromLogin) {
      createServiceResult = { ok:false, error:`Você está logado como ID ${idFromLogin}, mas informou Provider ID ${sForm.providerIdManual}. A API só permite criar para o próprio ID.` };
      return;
    }
    if (!sForm.serviceTypeId) { createServiceResult = { ok:false, error:"Selecione o Tipo de Serviço." }; return; }
    const variations = normalizedVariations();
    if (!variations.length) { createServiceResult = { ok:false, error:"Adicione ao menos 1 variação válida." }; return; }

    const payload = {
      serviceTypeId: Number(sForm.serviceTypeId),
      name: sForm.name.trim(),
      description: sForm.description.trim(),
      photos: photosArrFromText(sForm.photosText),
      variations
    };

    try {
      const url = `${API}/providers/${effectiveProviderId}/services`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaderMaybe() },
        body: JSON.stringify(payload)
      });
      const txt = await res.text();
      let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      if (res.ok) {
        createServiceResult = { ok:true, status: res.status, data, tried: [{url, status:res.status, ok:true}] };
      } else {
        createServiceResult = { ok:false, error: data?.error || `HTTP ${res.status}`, tried: [{url, status:res.status, bodySnippet:txt.slice(0,200)}] };
      }
    } catch (e) {
      createServiceResult = { ok:false, error:String(e) };
    }
  }

  // -------------- Meus Serviços (listar/editar/excluir) --------------
  let myServices = null;
  let myServicesErr = "";
  let myLog = [];

  async function loadMyServices() {
    myServices = null; myServicesErr = ""; myLog = [];
    const pid = providerIdFromAuth() || (sForm.providerIdManual || "").trim();
    if (!pid) { myServicesErr = "Faça login ou informe o Provider ID."; return; }

    const url = `${API}/providers/${pid}/services`;
    try {
      const res = await fetch(url, { headers: { ...authHeaderMaybe() } });
      const txt = await res.text();
      let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      myLog.push({ url, status: res.status, ok: res.ok, bodySnippet: txt.slice(0,200) });
      if (res.ok && Array.isArray(data)) { myServices = data; return; }
      if (res.ok && Array.isArray(data?.items)) { myServices = data.items; return; }
      if (res.ok && Array.isArray(data?.data)) { myServices = data.data; return; }
      myServicesErr = `Falha: HTTP ${res.status}`;
    } catch (e) {
      myServicesErr = String(e);
    }
  }

  function ensureEditPropsOnService(s){
    if (!s._edit) {
      s._edit = {
        serviceTypeId: s.serviceTypeId || "",
        name: s.name || "",
        description: s.description || "",
        photosText: (Array.isArray(s.photos) ? s.photos : []).join(", "),
        variations: (s.variations?.length ? s.variations : [{ name:"", price:"", durationMinutes:"" }]).map(v => ({
          name: v.name || "",
          price: v.price ?? "",
          durationMinutes: v.durationMinutes ?? ""
        }))
      };
      myServices = [...myServices];
    }
  }
  function addEditVariation(s){
    s._edit.variations = [...s._edit.variations, { name:"", price:"", durationMinutes:"" }];
    myServices = [...myServices];
  }
  function removeEditVariation(s, idx){
    s._edit.variations = s._edit.variations.filter((_,i)=>i!==idx);
    myServices = [...myServices];
  }

  // helper: remove campos undefined e "" (strings vazias) do payload
  function prune(obj) {
    const out = {};
    for (const k in obj) {
      const v = obj[k];
      if (v === undefined) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      out[k] = v;
    }
    return out;
  }

  async function saveServiceEdit(s){
    const pid = providerIdFromAuth() || (sForm.providerIdManual || "").trim();
    if (!pid) { alert("Faça login ou informe o Provider ID."); return; }

    const sid = s.id || s.serviceId || s._id;
    if (!sid) { alert("ID do serviço não encontrado."); return; }

    // Base payload
    const basePayload = prune({
      serviceTypeId: Number(s._edit.serviceTypeId || s.serviceTypeId || 0) || undefined,
      name: (s._edit.name || "").trim(),
      description: (s._edit.description || "").trim(),
      photos: photosArrFromText(s._edit.photosText || ""),
      variations: normalizedVariations(s._edit.variations)
    });

    // Alternativas de payload
    const payloadVariants = [
      basePayload,
      // sem variations (alguns backends rejeitam atualizar variações junto):
      prune({ ...basePayload, variations: undefined }),
      // alias de campo do tipo (caso backend use outro nome)
      prune({ ...basePayload, typeId: basePayload.serviceTypeId, serviceTypeId: undefined }),
      // wrapper
      { service: basePayload },
      // incluir providerId
      prune({ ...basePayload, providerId: Number(pid) }),
    ];

    const urls = [
      `${API}/providers/${pid}/services/${sid}`,
      `${API}/services/${sid}`,
      `${API}/api/providers/${pid}/services/${sid}`,
      `${API}/v1/providers/${pid}/services/${sid}`,
    ];

    const methods = ["PUT", "PATCH"];

    for (const method of methods) {
      for (const url of urls) {
        for (const body of payloadVariants) {
          try {
            const res = await fetch(url, {
              method,
              headers: { "Content-Type": "application/json", ...authHeaderMaybe() },
              body: JSON.stringify(body),
            });
            if (res.ok) {
              await loadMyServices();
              return;
            }
          } catch {}
        }
      }
    }
    alert("Falha ao salvar alterações do serviço.");
  }

  async function deleteService(s){
    const ok = confirm("Excluir este serviço?");
    if (!ok) return;
    const pid = providerIdFromAuth() || (sForm.providerIdManual || "").trim();
    if (!pid) return;

    const sid = s.id || s.serviceId || s._id;
    if (!sid) return;

    const urls = [
      `${API}/providers/${pid}/services/${sid}`,
      `${API}/services/${sid}`,
      `${API}/api/providers/${pid}/services/${sid}`,
      `${API}/v1/providers/${pid}/services/${sid}`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "DELETE",
          headers: { ...authHeaderMaybe() },
        });
        if (res.ok || res.status === 204) {
          await loadMyServices();
          return;
        }
      } catch {}
    }
    alert("Falha ao excluir serviço.");
  }

  // -------------- Agenda (Disponibilidades) --------------
  let aForm = {
    providerIdManual: "",
    mode: "weekly", // 'weekly' | 'date'
    dayOfWeek: "",  // 0..6
    date: "",       // YYYY-MM-DD
    start: "",      // HH:MM
    end: ""         // HH:MM
  };
  let createAvailResult = null;

  function buildAvailabilityPayloadsFromForm() {
    const list = [];
    if (aForm.mode === "weekly") {
      const wd = Number(aForm.dayOfWeek);
      list.push({ dayOfWeek: wd, startTime: aForm.start, endTime: aForm.end });
      list.push({ weekday: wd, start: aForm.start, end: aForm.end });
    } else {
      list.push({ date: aForm.date, startTime: aForm.start, endTime: aForm.end });
      list.push({ date: aForm.date, start: aForm.start, end: aForm.end });
    }
    return list;
  }

  async function createAvailability() {
    createAvailResult = null;
    const idFromLogin = providerIdFromAuth();
    const effectiveProviderId = idFromLogin || (aForm.providerIdManual || "").trim();
    if (!effectiveProviderId) { createAvailResult = { ok:false, error:"Faça login (recomendado) ou informe o Provider ID." }; return; }
    if (idFromLogin && aForm.providerIdManual && aForm.providerIdManual !== idFromLogin) {
      createAvailResult = { ok:false, error:`Você está logado como ID ${idFromLogin}, mas digitou Provider ID ${aForm.providerIdManual}.` };
      return;
    }
    if (aForm.mode === "weekly" && aForm.dayOfWeek === "") { createAvailResult = { ok:false, error:"Selecione o dia da semana." }; return; }
    if (aForm.mode === "date" && !aForm.date) { createAvailResult = { ok:false, error:"Informe a data (YYYY-MM-DD)." }; return; }
    if (!aForm.start || !aForm.end) { createAvailResult = { ok:false, error:"Informe início e fim (HH:MM)." }; return; }

    const candidateBodies = buildAvailabilityPayloadsFromForm();
    const pid = effectiveProviderId;
    const endpoints = [
      `${API}/providers/${pid}/availability`,
      `${API}/api/providers/${pid}/availability`,
      `${API}/v1/providers/${pid}/availability`,
    ];

    const attempts = [];
    for (const url of endpoints) {
      for (const body of candidateBodies) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaderMaybe() },
            body: JSON.stringify(body),
          });
          const txt = await res.text();
          let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
          attempts.push({ url, status: res.status, ok: res.ok, bodySent: body, bodySnippet: txt.slice(0,200) });
          if (res.ok) {
            createAvailResult = { ok:true, status: res.status, data, attempts };
            return;
          }
        } catch (e) {
          attempts.push({ url, error: String(e), bodySent: body });
        }
      }
    }
    createAvailResult = { ok:false, error:"Falhou em todas as rotas testadas.", attempts };
  }

  // Listagem/edição/exclusão de disponibilidades
  let myAvail = null;
  let myAvailErr = "";
  let myAvailLog = [];

  async function loadMyAvailabilities() {
    myAvail = null; myAvailErr = ""; myAvailLog = [];
    const pid = providerIdFromAuth() || (aForm.providerIdManual || "").trim();
    if (!pid) { myAvailErr = "Faça login ou informe o Provider ID."; return; }

    const tryUrls = [
      `${API}/providers/${pid}/availabilities`,
      `${API}/api/providers/${pid}/availabilities`,
      `${API}/v1/providers/${pid}/availabilities`,
    ];

    for (const url of tryUrls) {
      try {
        const res = await fetch(url, { headers: { ...authHeaderMaybe() } });
        const txt = await res.text();
        let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
        myAvailLog.push({ url, status: res.status, ok: res.ok, bodySnippet: txt.slice(0,200) });
        if (res.ok) {
          if (Array.isArray(data)) { myAvail = data; return; }
          if (Array.isArray(data?.items)) { myAvail = data.items; return; }
          if (Array.isArray(data?.data)) { myAvail = data.data; return; }
        }
      } catch (e) {
        myAvailLog.push({ url, error: String(e) });
      }
    }
    myAvailErr = "Falhou em todas as rotas testadas.";
  }

  function ensureEditPropsOnAvail(a){
    if (!a._edit) {
      a._edit = {
        dayOfWeek: (typeof a.dayOfWeek !== "undefined" && a.dayOfWeek !== null) ? a.dayOfWeek : "",
        date: a.date || "",
        start: a.startTime || a.start || "",
        end:   a.endTime   || a.end   || ""
      };
      myAvail = [...myAvail];
    }
  }

  async function saveAvailEdit(a){
    const pid = providerIdFromAuth() || (aForm.providerIdManual || "").trim();
    if (!pid) return;
    const aid = a.id || a.availabilityId || a._id;
    if (!aid) return;

    const isWeekly = a._edit.dayOfWeek !== "" && a._edit.dayOfWeek !== null && typeof a._edit.dayOfWeek !== "undefined";

    const bodies = isWeekly
      ? [
          { dayOfWeek: Number(a._edit.dayOfWeek), startTime: a._edit.start, endTime: a._edit.end },
          { weekday: Number(a._edit.dayOfWeek), start: a._edit.start, end: a._edit.end },
        ]
      : [
          { date: a._edit.date, startTime: a._edit.start, endTime: a._edit.end },
          { date: a._edit.date, start: a._edit.start, end: a._edit.end },
        ];

    const urls = [
      `${API}/providers/${pid}/availability/${aid}`,
      `${API}/api/providers/${pid}/availability/${aid}`,
      `${API}/v1/providers/${pid}/availability/${aid}`,
    ];

    for (const url of urls) {
      for (const body of bodies) {
        try {
          const res = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaderMaybe() },
            body: JSON.stringify(body),
          });
          if (res.ok) {
            await loadMyAvailabilities();
            return;
          }
        } catch {}
      }
    }
    alert("Falha ao salvar disponibilidade.");
  }

  async function deleteAvail(a){
    const ok = confirm("Excluir esta disponibilidade?");
    if (!ok) return;
    const pid = providerIdFromAuth() || (aForm.providerIdManual || "").trim();
    if (!pid) return;
    const aid = a.id || a.availabilityId || a._id;
    if (!aid) return;

    const urls = [
      `${API}/providers/${pid}/availability/${aid}`,
      `${API}/api/providers/${pid}/availability/${aid}`,
      `${API}/v1/providers/${pid}/availability/${aid}`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "DELETE",
          headers: { ...authHeaderMaybe() },
        });
        if (res.ok || res.status === 204) {
          await loadMyAvailabilities();
          return;
        }
      } catch {}
    }
    alert("Falha ao excluir disponibilidade.");
  }

  // -------------- Carregar tipos --------------
  onMount(async () => {
    serviceTypesLoading = true; serviceTypesErr = "";
    try {
      const res = await fetch(`${API}/service-types`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      serviceTypes = await res.json();
    } catch (e) { serviceTypesErr = String(e); }
    finally { serviceTypesLoading = false; }
  });

  // -------------- Foto do Prestador (upload) --------------
  let fileInputEl;
  let photoUpload = { busy: false, error: "", url: "" };

  function pickPhoto(){ if (fileInputEl) fileInputEl.click(); }

  async function onPhotoChange(e){
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      photoUpload = { busy: true, error: "", url: "" };
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });

      const pid = providerIdFromAuth();
      if (!pid) { photoUpload = { busy:false, error:'Faça login como Prestador.', url:'' }; return; }

      const url = `${API}/providers/${pid}/photo`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaderMaybe() },
        body: JSON.stringify({ imageBase64: base64 })
      });
      const txt = await res.text();
      let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      if (!res.ok) {
        photoUpload = { busy:false, error: data?.error || `Falha HTTP ${res.status}`, url: '' };
        return;
      }
      const rel = data.photoUrl || data.url || '';
      const full = rel && rel.startsWith('http') ? rel : `${API}${rel}`;
      if (authState.user) { authState.user.photoUrl = rel; saveAuth(); }
      photoUpload = { busy:false, error:'', url: full };
    } catch (e) {
      photoUpload = { busy:false, error: String(e.message || e), url:'' };
    } finally { if (fileInputEl) fileInputEl.value = ''; }
  }

</script>

<style>
  :root { color-scheme: light dark; }
  .wrap { max-width: 980px; margin: 2rem auto; padding: 1rem; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Arial; }
  .grid { display: grid; gap: 1rem; }
  .two { grid-template-columns: 1fr 1fr; }
  fieldset { border: 1px solid #8884; padding: 1rem; border-radius: .75rem; }
  legend { padding: 0 .5rem; opacity: .85; font-weight: 600; }
  label { display:block; font-size:.9rem; margin:.5rem 0 .25rem; opacity:.9; }
  input,select,textarea,button { width:100%; padding:.6rem .7rem; border-radius:.6rem; border:1px solid #8884; background:inherit; }
  button{ cursor:pointer; border:1px solid #6665; }
  .small{ font-size:.85rem; }
  .muted{ opacity:.75; }
  .ok{ background:#0a0a; border:1px solid #0a04; padding:.6rem .75rem; border-radius:.6rem; overflow:auto }
  .err{ background:#a004; border:1px solid #a004; padding:.6rem .75rem; border-radius:.6rem; white-space:pre-wrap; overflow:auto }
  .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size:.9rem; }
  .card{ border:1px solid #8884; border-radius:.75rem; padding:.75rem; }
  .row { display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap:.5rem; align-items:end; }
  .list { display:grid; gap:.5rem; }
  .svc { border:1px solid #8884; border-radius:.6rem; padding:.6rem; }
  .svc h4{ margin:.1rem 0 .3rem; }
  .chips { display:flex; flex-wrap:wrap; gap:.25rem; }
  .chip { border:1px solid #8884; border-radius:999px; padding:.15rem .5rem; font-size:.8rem; background:inherit; }
  .sectionTitle { margin:.25rem 0 .25rem; font-weight:600; }
</style>

<div class="wrap">
  <h1>Mini-Marketplace – Painel do Prestador</h1>
  <p class="small muted">API base: <span class="mono">{API}</span></p>

  <!-- Sessão -->
  <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:.75rem;">
    <div class="small">
      {#if authState.user}
        Logado como: <strong>{authState.user.name || authState.user.email || 'Prestador'}</strong>
        — ID: <span class="mono">{providerIdFromAuth() || '—'}</span>
      {:else}
        Não logado
      {/if}
    </div>
    {#if authState.user}<button on:click={logout}>Sair</button>{/if}
  </div>

  <!-- Login & Cadastro -->
  <div class="grid two" style="margin-top:1rem;">
    <fieldset>
      <legend>Login</legend>
      <label>E-mail</label><input type="email" bind:value={auth.email} placeholder="voce@exemplo.com" />
      <label>Senha</label><input type="password" bind:value={auth.password} placeholder="••••••" />
      <button on:click={login} style="margin-top:.75rem">Entrar</button>
      {#if loginResult}
        <div class={loginResult.ok?'ok':'err'} style="margin-top:.75rem">
          {#if loginResult.ok}Login OK (status {loginResult.status}){:else}{loginResult.error}{/if}
          <details style="margin-top:.5rem"><summary class="small">Ver detalhes</summary>
            <pre class="mono">{JSON.stringify(loginResult, null, 2)}</pre>
          </details>
        </div>
      {/if}
    </fieldset>

    <fieldset>
      <legend>Cadastro de Prestador</legend>
      <label>Nome</label><input bind:value={reg.name} />
      <label>E-mail</label><input type="email" bind:value={reg.email} />
      <label>Senha</label><input type="password" bind:value={reg.password} />
      <input type="hidden" value={reg.role} />
      <button on:click={registerProvider} style="margin-top:.75rem">Criar Prestador</button>
      {#if registerResult}
        <div class={registerResult.ok?'ok':'err'} style="margin-top:.75rem">
          <pre class="mono">{JSON.stringify(registerResult, null, 2)}</pre>
        </div>
      {/if}
    </fieldset>
  </div>

  
  {#if authState.user}
  <fieldset style="margin-top:1rem;">
    <legend>Foto do Prestador</legend>
    <div class="grid two">
      <div>
        {#if authState.user?.photoUrl || photoUpload.url}
          <img alt="Foto do prestador"
               src={(authState.user?.photoUrl?.startsWith('http') ? authState.user.photoUrl : (authState.user?.photoUrl ? API + authState.user.photoUrl : photoUpload.url))}
               style="max-width:220px; border-radius:.75rem; border:1px solid #8884;"/>
          <div class="small muted" style="margin-top:.5rem">URL: <span class="mono">{(authState.user?.photoUrl && !authState.user.photoUrl.startsWith('http')) ? API + authState.user.photoUrl : (authState.user?.photoUrl || photoUpload.url)}</span></div>
        {:else}
          <div class="small muted">Nenhuma foto enviada ainda.</div>
        {/if}
      </div>
      <div>
        <input type="file" accept="image/*" bind:this={fileInputEl} on:change={onPhotoChange} style="display:none"/>
        <button on:click={pickPhoto} disabled={photoUpload.busy}>{photoUpload.busy ? 'Enviando...' : 'Colocar Foto no Perfil'}</button>
        {#if photoUpload.error}<div class="err" style="margin-top:.75rem">{photoUpload.error}</div>{/if}
        {#if photoUpload.url && !photoUpload.error}
          <div class="ok" style="margin-top:.75rem">
            Foto enviada com sucesso. <a href={photoUpload.url} target="_blank" rel="noreferrer">Abrir imagem</a>
          </div>
        {/if}
      </div>
    </div>
  </fieldset>
  {/if}

<!-- Cadastro de Serviço -->
  <fieldset style="margin-top:1rem;">
    <legend>Cadastro de Serviço</legend>

    {#if authState.user}
      <div class="small muted">O serviço será criado para o seu ID: <span class="mono">{providerIdFromAuth()}</span>.</div>
    {:else}
      <label>Provider ID (se não estiver logado)</label>
      <input bind:value={sForm.providerIdManual} placeholder="ex.: 1" />
    {/if}

    {#if authState.user && sForm.providerIdManual && sForm.providerIdManual !== providerIdFromAuth()}
      <div class="err" style="margin-top:.5rem">Você está logado como ID {providerIdFromAuth()}, mas digitou {sForm.providerIdManual}. A API só permite criar para o próprio ID.</div>
    {/if}

    <label style="margin-top:.5rem">Tipo de Serviço</label>
    {#if serviceTypesLoading}
      <div class="small muted">Carregando tipos...</div>
    {:else if serviceTypesErr}
      <div class="err small">Falha ao carregar tipos: {serviceTypesErr}</div>
    {:else}
      <select bind:value={sForm.serviceTypeId}>
        <option value="">Selecione...</option>
        {#each serviceTypes as t}<option value={t.id}>{t.name}</option>{/each}
      </select>
    {/if}

    <label>Nome</label><input bind:value={sForm.name} placeholder="Ex.: Manicure" />
    <label>Descrição</label><textarea rows="3" bind:value={sForm.description} placeholder="Profissional com 20 anos de experiência."></textarea>
    <label>Fotos (URLs separadas por vírgula)</label><input bind:value={sForm.photosText} placeholder="https://a.jpg, https://b.jpg" />

    <div class="card" style="margin-top:.75rem">
      <div class="small muted"><strong>Variações</strong></div>
      {#each sForm.variations as v, i}
        <div class="row">
          <div><label>Nome</label><input bind:value={v.name} placeholder="Mãos" /></div>
          <div><label>Preço (R$)</label><input type="number" min="0" step="0.01" bind:value={v.price} placeholder="25.50" /></div>
          <div><label>Duração (min)</label><input type="number" min="1" step="1" bind:value={v.durationMinutes} placeholder="30" /></div>
          <div><button on:click={() => removeVariation(i)} title="Remover">−</button></div>
        </div>
      {/each}
      <button on:click={addVariation} style="margin-top:.5rem">+ Adicionar variação</button>
    </div>

    <button on:click={createService} style="margin-top:.75rem">Criar Serviço</button>

    {#if createServiceResult}
      <div class={createServiceResult.ok?'ok':'err'} style="margin-top:.75rem">
        {#if createServiceResult.ok}
          <pre class="mono">{JSON.stringify(createServiceResult, null, 2)}</pre>
        {:else}
          {createServiceResult.error}
          {#if createServiceResult.tried}
            <details style="margin-top:.5rem"><summary class="small">Detalhes</summary>
              <pre class="mono">{JSON.stringify(createServiceResult.tried, null, 2)}</pre>
            </details>
          {/if}
        {/if}
      </div>
    {/if}
  </fieldset>

  <!-- Meus Serviços -->
  <fieldset style="margin-top:1rem;">
    <legend>Meus Serviços</legend>
    <div class="small muted">Lista os serviços do ID do login (ou do ID manual se não estiver logado).</div>
    <button on:click={loadMyServices} style="margin-top:.5rem">Carregar</button>

    {#if myServicesErr}<div class="err" style="margin-top:.75rem">{myServicesErr}</div>{/if}

    {#if myServices}
      {#if myServices.length === 0}
        <div class="card small" style="margin-top:.75rem">Nenhum serviço encontrado.</div>
      {:else}
        <div class="list" style="margin-top:.75rem">
          {#each myServices as s}
            <div class="svc">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:.5rem;">
                <div>
                  <h4>{s.name || '(sem nome)'}</h4>
                  {#if s.description}<div class="small muted">{s.description}</div>{/if}
                </div>
                <div class="chips">
                  {#if !s._edit}
                    <button class="chip" on:click={() => { ensureEditPropsOnService(s); }}>Editar</button>
                    <button class="chip" on:click={() => deleteService(s)}>Excluir</button>
                  {:else}
                    <button class="chip" on:click={() => { s._edit = null; myServices = [...myServices]; }}>Cancelar</button>
                    <button class="chip" on:click={() => saveServiceEdit(s)}>Salvar alterações</button>
                  {/if}
                </div>
              </div>

              {#if Array.isArray(s.photos) && s.photos.length}
                <div class="small muted" style="margin-top:.25rem;">Fotos: {s.photos.join(", ")}</div>
              {/if}

              {#if Array.isArray(s.variations) && s.variations.length}
                <div class="sectionTitle">Variações</div>
                <ul class="small" style="margin:.25rem 0 0 .9rem;">
                  {#each s.variations as v}
                    <li>{v.name} — R$ {v.price} — {v.durationMinutes} min</li>
                  {/each}
                </ul>
              {/if}

              <details style="margin-top:.5rem"><summary class="small">JSON</summary>
                <pre class="mono">{JSON.stringify(s, null, 2)}</pre>
              </details>

              {#if s._edit}
                <div class="card" style="margin-top:.75rem;">
                  <div class="grid two">
                    <div>
                      <label>Tipo de Serviço</label>
                      <select bind:value={s._edit.serviceTypeId}>
                        <option value="">(manter)</option>
                        {#each serviceTypes as t}<option value={t.id}>{t.name}</option>{/each}
                      </select>
                    </div>
                    <div>
                      <label>Nome</label>
                      <input bind:value={s._edit.name} />
                    </div>
                  </div>
                  <label>Descrição</label>
                  <textarea rows="3" bind:value={s._edit.description}></textarea>
                  <label>Fotos (URLs separadas por vírgula)</label>
                  <input bind:value={s._edit.photosText} />

                  <div class="card" style="margin-top:.75rem">
                    <div class="small muted"><strong>Variações</strong></div>
                    {#each s._edit.variations as v, i}
                      <div class="row">
                        <div><label>Nome</label><input bind:value={v.name} /></div>
                        <div><label>Preço (R$)</label><input type="number" min="0" step="0.01" bind:value={v.price} /></div>
                        <div><label>Duração (min)</label><input type="number" min="1" step="1" bind:value={v.durationMinutes} /></div>
                        <div><button on:click={() => removeEditVariation(s,i)} title="Remover">−</button></div>
                      </div>
                    {/each}
                    <button on:click={() => addEditVariation(s)} style="margin-top:.5rem">+ Adicionar variação</button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </fieldset>

  <!-- Agenda do Prestador -->
  <fieldset style="margin-top:1rem;">
    <legend>Agenda do Prestador (Disponibilidades)</legend>

    {#if authState.user}
      <div class="small muted">A disponibilidade será criada para o seu ID: <span class="mono">{providerIdFromAuth()}</span>.</div>
    {:else}
      <label>Provider ID (se não estiver logado)</label>
      <input bind:value={aForm.providerIdManual} placeholder="ex.: 1" />
    {/if}

    {#if authState.user && aForm.providerIdManual && aForm.providerIdManual !== providerIdFromAuth()}
      <div class="err" style="margin-top:.5rem">Você está logado como ID {providerIdFromAuth()}, mas digitou {aForm.providerIdManual}. A API só permite criar para o próprio ID.</div>
    {/if}

    <div class="chips" style="margin-top:.5rem">
      <div class="chip">Modo:</div>
      <button on:click={() => aForm.mode = "weekly"} class="chip" aria-pressed={aForm.mode==="weekly"}>Semanal</button>
      <button on:click={() => aForm.mode = "date"} class="chip" aria-pressed={aForm.mode==="date"}>Data específica</button>
    </div>

    {#if aForm.mode === "weekly"}
      <label style="margin-top:.5rem">Dia da semana</label>
      <select bind:value={aForm.dayOfWeek}>
        <option value="">Selecione...</option>
        <option value="0">Domingo</option>
        <option value="1">Segunda</option>
        <option value="2">Terça</option>
        <option value="3">Quarta</option>
        <option value="4">Quinta</option>
        <option value="5">Sexta</option>
        <option value="6">Sábado</option>
      </select>
    {:else}
      <label style="margin-top:.5rem">Data</label>
      <input type="date" bind:value={aForm.date} />
    {/if}

    <div class="grid two">
      <div>
        <label>Início</label>
        <input type="time" bind:value={aForm.start} />
      </div>
      <div>
        <label>Fim</label>
        <input type="time" bind:value={aForm.end} />
      </div>
    </div>

    <button on:click={createAvailability} style="margin-top:.75rem">Criar disponibilidade</button>

    {#if createAvailResult}
      <div class={createAvailResult.ok?'ok':'err'} style="margin-top:.75rem">
        {#if createAvailResult.ok}
          <pre class="mono">{JSON.stringify(createAvailResult, null, 2)}</pre>
        {:else}
          {createAvailResult.error}
          {#if createAvailResult.attempts}
            <details style="margin-top:.5rem"><summary class="small">Log de tentativas</summary>
              <pre class="mono">{JSON.stringify(createAvailResult.attempts, null, 2)}</pre>
            </details>
          {/if}
        {/if}
      </div>
    {/if}
  </fieldset>

  <!-- Minhas Disponibilidades -->
  <fieldset style="margin-top:1rem;">
    <legend>Minhas Disponibilidades</legend>
    <div class="small muted">Lista as disponibilidades do ID do login (ou do ID manual se não estiver logado).</div>
    <button on:click={loadMyAvailabilities} style="margin-top:.5rem">Carregar</button>

    {#if myAvailErr}<div class="err" style="margin-top:.75rem">{myAvailErr}</div>{/if}

    {#if myAvail}
      {#if myAvail.length === 0}
        <div class="card small" style="margin-top:.75rem">Nenhuma disponibilidade cadastrada.</div>
      {:else}
        <div class="list" style="margin-top:.75rem">
          {#each myAvail as a}
            <div class="svc">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:.5rem;">
                <div class="small">
                  {#if typeof a.dayOfWeek !== "undefined" && a.dayOfWeek !== null}
                    <strong>{dayName(a.dayOfWeek)}</strong>
                  {/if}
                  {#if a.date}
                    <strong>{a.date}</strong>
                  {/if}
                  {#if a.startTime || a.start}
                    — {a.startTime || a.start} às {a.endTime || a.end}
                  {/if}
                </div>
                <div class="chips">
                  {#if !a._edit}
                    <button class="chip" on:click={() => { ensureEditPropsOnAvail(a); }}>Editar</button>
                    <button class="chip" on:click={() => deleteAvail(a)}>Excluir</button>
                  {:else}
                    <button class="chip" on:click={() => { a._edit = null; myAvail = [...myAvail]; }}>Cancelar</button>
                    <button class="chip" on:click={() => saveAvailEdit(a)}>Salvar</button>
                  {/if}
                </div>
              </div>

              <details style="margin-top:.5rem"><summary class="small">JSON</summary>
                <pre class="mono">{JSON.stringify(a, null, 2)}</pre>
              </details>

              {#if a._edit}
                <div class="card" style="margin-top:.75rem;">
                  <div class="grid two">
                    <div>
                      <label>Dia da semana (deixe vazio se for por data)</label>
                      <select bind:value={a._edit.dayOfWeek}>
                        <option value="">(vazio)</option>
                        <option value="0">Domingo</option>
                        <option value="1">Segunda</option>
                        <option value="2">Terça</option>
                        <option value="3">Quarta</option>
                        <option value="4">Quinta</option>
                        <option value="5">Sexta</option>
                        <option value="6">Sábado</option>
                      </select>
                    </div>
                    <div>
                      <label>Data (YYYY-MM-DD) — use se não for semanal</label>
                      <input type="date" bind:value={a._edit.date} />
                    </div>
                  </div>
                  <div class="grid two" style="margin-top:.5rem;">
                    <div>
                      <label>Início</label>
                      <input type="time" bind:value={a._edit.start} />
                    </div>
                    <div>
                      <label>Fim</label>
                      <input type="time" bind:value={a._edit.end} />
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      <details style="margin-top:.75rem"><summary class="small">Log de requisição</summary>
        <pre class="mono">{JSON.stringify(myAvailLog, null, 2)}</pre>
      </details>
    {/if}
  </fieldset>
</div>