if (window.location.protocol === "file:") {
  window.addEventListener("DOMContentLoaded", () => {
    const main = document.createElement("main");
    main.style.cssText = "max-width:640px;margin:12vh auto;padding:24px;font:16px/1.6 Arial,sans-serif;color:#172033";

    const heading = document.createElement("h1");
    heading.textContent = "Abra o painel por HTTP";
    const explanation = document.createElement("p");
    explanation.textContent = "O navegador bloqueia os módulos JavaScript quando uma página é aberta diretamente como arquivo local.";
    const instruction = document.createElement("p");
    instruction.textContent = "Para desenvolvimento local, inicie py -m http.server 8000 na pasta gestao-media-telemetria e acesse http://localhost:8000. Em produção, use a URL publicada no Netlify.";

    main.append(heading, explanation, instruction);
    document.body.replaceChildren(main);
  }, { once: true });
}
