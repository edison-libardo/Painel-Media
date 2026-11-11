import { restoreSharedValue, saveSharedValue } from "./shared-storage.js";
import { getCurrentRole } from "./auth-service.js";

export const HISTORY_STORAGE_KEY = "libardo-logistics-monthly-history-v1";

const readHistory = () => {
  const history = restoreSharedValue(HISTORY_STORAGE_KEY);
  if (history == null) return [];
  if (!Array.isArray(history)) throw new Error("O histórico salvo está em formato inválido.");
  if (history.some((record) =>
    !record
    || typeof record.id !== "string"
    || typeof record.name !== "string"
    || !record.data
    || !Array.isArray(record.data.fuel)
    || !Array.isArray(record.data.telemetry))) {
    throw new Error("Um ou mais arquivos do histórico estão inválidos.");
  }
  return history;
};

const writeHistory = (history) => {
  if (getCurrentRole() !== "adm") throw new Error("Somente administradores podem alterar os históricos.");
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  return saveSharedValue(HISTORY_STORAGE_KEY, history);
};

export const getHistoryRecords = () => readHistory();

export const getHistoryRecord = (id) => readHistory().find((record) => record.id === id) || null;

export const saveHistoryRecord = (name, state) => {
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) throw new Error("Informe um nome para o histórico.");
  if (!state || !Array.isArray(state.fuel) || !Array.isArray(state.telemetry)) {
    throw new Error("Não há dados válidos do painel para salvar.");
  }
  if (!state.fuel.length && !state.telemetry.length) {
    throw new Error("Importe os dados do mês antes de salvar o histórico.");
  }
  const history = readHistory();
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: normalizedName,
    savedAt: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(state)),
  };
  history.unshift(record);
  writeHistory(history);
  return record;
};

export const renameHistoryRecord = (id, name) => {
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) throw new Error("O nome do histórico não pode ficar vazio.");
  const history = readHistory();
  const record = history.find((item) => item.id === id);
  if (!record) throw new Error("O histórico selecionado não foi encontrado.");
  record.name = normalizedName;
  writeHistory(history);
  return record;
};

export const updateHistoryRecordData = (id, state) => {
  if (!state || !Array.isArray(state.fuel) || !Array.isArray(state.telemetry)) {
    throw new Error("Dados inválidos para salvar no histórico.");
  }
  const history = readHistory();
  const record = history.find((item) => item.id === id);
  if (!record) throw new Error("O histórico selecionado não foi encontrado.");
  record.data = JSON.parse(JSON.stringify(state));
  record.updatedAt = new Date().toISOString();
  writeHistory(history);
  return record;
};
