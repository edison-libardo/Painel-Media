import {
  getHistoryRecords,
  renameHistoryRecord,
} from "./services/history-service.js";
import { isAdmin } from "./services/auth-service.js";

(() => {
  const list = document.getElementById("history-list");
  const status = document.getElementById("history-status");
  const dialog = document.getElementById("rename-dialog");
  const form = document.getElementById("rename-form");
  const nameInput = document.getElementById("history-name");
  const errorElement = document.getElementById("rename-error");
  let renamingId = null;
  let sharedStorageError = null;

  const showError = (message) => {
    status.textContent = message;
    status.className = "text-sm text-rose-700";
    status.hidden = false;
  };
  window.addEventListener("libardo-storage-status", (event) => {
    if (event.detail.isError) {
      sharedStorageError = event.detail.message;
      showError(sharedStorageError);
    }
  });

  const render = () => {
    try {
      const records = getHistoryRecords();
      list.replaceChildren();
      status.hidden = true;
      if (!records.length) {
        const empty = document.createElement("div");
        empty.className = "rounded-xl border border-dashed border-light-outline bg-white p-8 text-center";
        const title = document.createElement("h2");
        title.className = "font-semibold text-primary";
        title.textContent = "Nenhum histórico salvo";
        const description = document.createElement("p");
        description.className = "mt-2 text-sm text-light-on-surface-variant";
        description.textContent = "No painel, use “Salvar Histórico” para guardar os dados do mês atual.";
        empty.append(title, description);
        list.append(empty);
        return;
      }

      records.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).forEach((record) => {
        const item = document.createElement("article");
        item.className = "flex flex-col gap-4 rounded-xl border border-light-outline bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between";

        const details = document.createElement("div");
        details.className = "min-w-0";
        const title = document.createElement("h2");
        title.className = "truncate font-headline text-lg font-bold text-primary";
        title.textContent = record.name;
        const metadata = document.createElement("p");
        metadata.className = "mt-1 text-xs text-light-on-surface-variant";
        const savedAt = new Date(record.savedAt);
        const dateText = Number.isNaN(savedAt.getTime())
          ? "Data não disponível"
          : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(savedAt);
        const fuelCount = Array.isArray(record.data?.fuel) ? record.data.fuel.length : 0;
        const telemetryCount = Array.isArray(record.data?.telemetry) ? record.data.telemetry.length : 0;
        metadata.textContent = `Salvo em ${dateText} • ${fuelCount} registros de consumo • ${telemetryCount} registros de telemetria`;
        details.append(title, metadata);

        const actions = document.createElement("div");
        actions.className = "flex shrink-0 flex-wrap items-center gap-2";
        const open = document.createElement("a");
        open.className = "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700";
        open.href = `index.html?historico=${encodeURIComponent(record.id)}`;
        open.innerHTML = '<span class="material-symbols-outlined text-sm">visibility</span><span>Visualizar</span>';
        actions.append(open);
        if (isAdmin()) {
          const edit = document.createElement("a");
          edit.className = "inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700";
          edit.href = `index.html?historico=${encodeURIComponent(record.id)}&editar=1`;
          edit.innerHTML = '<span class="material-symbols-outlined text-sm">edit</span><span>Editar</span>';
          const rename = document.createElement("button");
          rename.type = "button";
          rename.className = "inline-flex items-center gap-1.5 rounded-md border border-light-outline px-3 py-2 text-xs font-semibold text-primary hover:bg-light-surface-variant";
          rename.innerHTML = '<span class="material-symbols-outlined text-sm">edit</span><span>Renomear</span>';
          rename.addEventListener("click", () => {
            renamingId = record.id;
            nameInput.value = record.name;
            errorElement.hidden = true;
            dialog.showModal();
            nameInput.focus();
            nameInput.select();
          });
          actions.append(edit, rename);
        }
        item.append(details, actions);
        list.append(item);
      });
    } catch (error) {
      showError(error instanceof Error ? `Não foi possível carregar o histórico: ${error.message}` : "Não foi possível carregar o histórico.");
    }
  };

  document.getElementById("cancel-rename").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await renameHistoryRecord(renamingId, nameInput.value);
      dialog.close();
      renamingId = null;
      render();
    } catch (error) {
      errorElement.textContent = error instanceof Error ? error.message : "Não foi possível renomear o histórico.";
      errorElement.hidden = false;
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "libardo-logistics-monthly-history-v1") render();
  });

  render();
  if (sharedStorageError) showError(sharedStorageError);
})();
