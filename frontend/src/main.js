import Public from "./Public.svelte";
import App from "./App.svelte";

const target = document.getElementById("app");

let app; // referência atual

function mount() {
  const hash = (location.hash || "").toLowerCase();
  const Component = (hash.includes("prestador") || hash.includes("admin"))
    ? App       // seu painel do prestador atual
    : Public;   // página pública (padrão)

  // desmonta anterior
  if (app && app.$destroy) app.$destroy();
  target.innerHTML = "";

  app = new Component({ target });
}

window.addEventListener("hashchange", mount);
mount();
