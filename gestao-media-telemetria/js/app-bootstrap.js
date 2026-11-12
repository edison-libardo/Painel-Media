import { requireUser, logout } from "./services/auth-service.js";
import { initializeSharedStorage } from "./services/shared-storage.js";
import {
  ACTIVE_HISTORY_DRAFT_PREFIX,
  ACTIVE_HISTORY_EDIT_KEY,
  ACTIVE_HISTORY_ID_KEY,
} from "./services/history-service.js";

const pageScripts = {
  "index.html": () => import("./dashboard.js"),
  "rankings.html": () => import("./dashboard.js"),
  "historico.html": () => import("./history.js"),
  "comparativo.html": () => import("./comparison.js"),
  "admin-users.html": () => import("./admin-users.js"),
  "migrar-dados.html": () => import("./migrate-data.js"),
};

try {
  const access = await requireUser();
  if (access) {
    const route = window.location.pathname.split("/").filter(Boolean).pop() || "index";
    const pageName = route.endsWith(".html") ? route : `${route}.html`;
    if (access.role !== "adm" && ["admin-users.html", "migrar-dados.html"].includes(pageName)) {
      window.location.replace("index.html");
    } else {
      const storageScope = {
        dashboard: ["index.html", "rankings.html"].includes(pageName),
        history: ["index.html", "rankings.html", "historico.html", "comparativo.html"].includes(pageName),
      };
      if (pageScripts[pageName] && pageName !== "admin-users.html") {
        await initializeSharedStorage(storageScope);
      }
      document.body.dataset.userRole = access.role;

      if (access.role !== "adm") {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has("editar")) {
          currentUrl.searchParams.delete("editar");
          window.history.replaceState(null, "", currentUrl);
        }
        ["open-import", "reset-dashboard", "save-history", "backup-now", "restore-backup", "restore-backup-file", "export-button"]
          .forEach((id) => {
            const element = document.getElementById(id);
            if (element) element.hidden = true;
          });
      }

      const navigation = document.querySelector('nav[aria-label="Navega\u00e7\u00e3o principal"]');
      if (navigation && access.role === "adm") {
        [
          ["admin-users.html", "Gerenciar acessos"],
          ["migrar-dados.html", "Migrar dados"],
        ].forEach(([href, label]) => {
          const link = document.createElement("a");
          link.href = href;
          link.className = "px-3 py-1.5 rounded-md text-gray-300 hover:text-white hover:bg-secondary/40 font-medium";
          link.textContent = label;
          navigation.append(link);
        });
      }

      const header = document.querySelector("body > header > div");
      if (header) {
        const account = document.createElement("div");
        account.className = "flex items-center gap-2 text-xs";
        const identity = document.createElement("span");
        identity.className = "text-white";
        identity.textContent = `${access.user.email} (${access.role})`;
        const signOut = document.createElement("button");
        signOut.type = "button";
        signOut.className = "rounded border border-white/30 px-2 py-1 text-white hover:bg-white/10";
        signOut.textContent = "Sair";
        signOut.addEventListener("click", async () => {
          try {
            const activeHistoryId = sessionStorage.getItem(ACTIVE_HISTORY_ID_KEY);
            if (activeHistoryId) {
              sessionStorage.removeItem(`${ACTIVE_HISTORY_DRAFT_PREFIX}${activeHistoryId}`);
            }
            sessionStorage.removeItem(ACTIVE_HISTORY_ID_KEY);
            sessionStorage.removeItem(ACTIVE_HISTORY_EDIT_KEY);
            await logout();
            window.location.replace("login.html");
          } catch (error) {
            window.alert(`N\u00e3o foi poss\u00edvel encerrar a sess\u00e3o: ${error.message}`);
          }
        });
        account.append(identity, signOut);
        header.append(account);
      }

      const loadPage = pageScripts[pageName];
      if (!loadPage) {
        window.location.replace("index.html");
      } else {
        await loadPage();
      }
    }
  }
} catch (error) {
  console.error("Painel authentication/bootstrap failed:", error);
  const main = document.querySelector("main") || document.body;
  const message = document.createElement("p");
  message.className = "m-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800";
  message.setAttribute("role", "alert");
  message.textContent = `N\u00e3o foi poss\u00edvel carregar o painel: ${error instanceof Error ? error.message : "erro inesperado"}`;
  main.prepend(message);
}
