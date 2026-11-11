import { importSharedData } from "./services/shared-storage.js";

const form = document.getElementById("migration-form");
const status = document.getElementById("migration-status");
const submit = document.getElementById("migration-submit");

const readJsonFile = async (input) => {
  const file = input.files[0];
  if (!file) throw new Error("Selecione os dois arquivos JSON.");
  return JSON.parse(await file.text());
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  submit.textContent = "Migrando...";
  status.hidden = true;
  try {
    const [dashboard, history] = await Promise.all([
      readJsonFile(document.getElementById("migration-dashboard")),
      readJsonFile(document.getElementById("migration-history")),
    ]);
    await importSharedData(dashboard, history);
    status.textContent = `Migração concluída: ${dashboard.fuel.length} registros de consumo, ${dashboard.telemetry.length} registros de telemetria e ${history.length} históricos.`;
    status.className = "text-sm text-emerald-700";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Não foi possível migrar os dados.";
    status.className = "text-sm text-rose-700";
  } finally {
    status.hidden = false;
    submit.disabled = false;
    submit.textContent = "Migrar dados";
  }
});
