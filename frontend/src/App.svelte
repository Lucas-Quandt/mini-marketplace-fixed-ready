<script>
  import { onMount } from 'svelte';

  const API = import.meta.env.VITE_API || "http://localhost:4000";

  let user = null;

  onMount(() => {
    // Aqui deve permanecer a lógica de autenticação/cadastro do prestador
  });
</script>

<main>
  <h1>Painel do Prestador</h1>
  <p>Aqui você pode cadastrar ou logar como prestador de serviços.</p>
  <!-- Mantém apenas a parte de login/cadastro/gestão -->
</main>