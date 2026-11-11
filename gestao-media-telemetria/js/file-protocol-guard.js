if (window.location.protocol === "file:") {
  window.addEventListener("DOMContentLoaded", () => {
    const main = document.createElement("main");
    main.style.cssText = "max-width:640px;margin:12vh auto;padding:24px;font:16px/1.6 Arial,sans-serif;color:#172033";

    const heading = document.createElement("h1");
    heading.textContent = "Abra o painel pelo iniciador";
    const explanation = document.createElement("p");
    explanation.textContent = "O navegador bloqueia as funções do painel quando uma página é aberta diretamente como arquivo local.";
    const instruction = document.createElement("p");
    instruction.append("Execute ");
    const launcher = document.createElement("strong");
    launcher.textContent = "Abrir Painel.bat";
    instruction.append(launcher, " na pasta Projeto_media. Ele inicia o servidor local e abre o painel.");

    main.append(heading, explanation, instruction);
    document.body.replaceChildren(main);
  }, { once: true });
}
