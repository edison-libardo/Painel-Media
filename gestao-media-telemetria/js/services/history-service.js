import { restoreSharedValue, saveSharedValue } from "./shared-storage.js";
import { getCurrentRole } from "./auth-service.js";

export const HISTORY_STORAGE_KEY = "libardo-logistics-monthly-history-v1";
export const ACTIVE_HISTORY_ID_KEY = "libardo-logistics-active-history-v1";
export const ACTIVE_HISTORY_EDIT_KEY = "libardo-logistics-active-history-edit-v1";
export const ACTIVE_HISTORY_DRAFT_PREFIX = "libardo-logistics-history-draft-v1:";

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

const writeHistory = async (history) => {
  if (getCurrentRole() !== "adm") throw new Error("Somente administradores podem alterar os históricos.");
  const saved = await saveSharedValue(HISTORY_STORAGE_KEY, history);
  if (!saved) throw new Error("Falha ao sincronizar o hist\u00f3rico com o Firebase.");
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
};

export const getHistoryRecords = () => readHistory();

export const getHistoryRecord = (id) => readHistory().find((record) => record.id === id) || null;

export const saveHistoryRecord = async (name, state) => {
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
  await writeHistory(history);
  return record;
};

export const renameHistoryRecord = async (id, name) => {
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) throw new Error("O nome do histórico não pode ficar vazio.");
  const history = readHistory();
  const record = history.find((item) => item.id === id);
  if (!record) throw new Error("O histórico selecionado não foi encontrado.");
  record.name = normalizedName;
  await writeHistory(history);
  return record;
};

export const deleteHistoryRecord = async (id) => {
  const history = readHistory();
  const record = history.find((item) => item.id === id);
  if (!record) throw new Error("O hist\u00f3rico selecionado n\u00e3o foi encontrado.");
  await writeHistory(history.filter((item) => item.id !== id));
  return record;
};

export const updateHistoryRecordData = async (id, state) => {
  if (!state || !Array.isArray(state.fuel) || !Array.isArray(state.telemetry)) {
    throw new Error("Dados inválidos para salvar no histórico.");
  }
  const history = readHistory();
  const record = history.find((item) => item.id === id);
  if (!record) throw new Error("O histórico selecionado não foi encontrado.");
  record.data = JSON.parse(JSON.stringify(state));
  record.updatedAt = new Date().toISOString();
  await writeHistory(history);
  return record;
};
