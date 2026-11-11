import { auth, db } from "./firebase-client.js";
import { getCurrentRole } from "./auth-service.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  runTransaction,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const DASHBOARD_KEY = "libardo-logistics-dashboard-v1";
const HISTORY_KEY = "libardo-logistics-monthly-history-v1";
const dashboardRef = collection(db, "sharedDashboard");
const historyRef = collection(db, "sharedHistory");
const syncRef = doc(db, "sharedMeta", "version");
const MAX_CHUNK_BYTES = 400_000;
const textEncoder = new TextEncoder();
let baseRevision = 0;

const dispatchStorageStatus = (message, isError = false) => {
  window.dispatchEvent(new CustomEvent("libardo-storage-status", {
    detail: { message, isError },
  }));
};

const updateLocalCache = (key, value) => {
  const serialized = JSON.stringify(value);
  localStorage.setItem(key, serialized);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: serialized }));
};

const snapshotHistory = (snapshot) => snapshot.docs
  .map((item) => item.data().record)
  .filter(Boolean)
  .sort((left, right) => new Date(right.savedAt) - new Date(left.savedAt));

const snapshotDashboard = (snapshot) => {
  const documents = snapshot.docs.map((item) => item.data());
  const metadata = documents.find((item) => item.type === "metadata")?.value || {};
  const records = (type) => documents
    .filter((item) => item.type === type)
    .sort((left, right) => left.index - right.index)
    .flatMap((item) => item.records);
  return {
    ...metadata,
    fuel: records("fuel"),
    telemetry: records("telemetry"),
  };
};

const splitRecords = (records) => {
  const chunks = [];
  let chunk = [];
  let bytes = 2;
  for (const record of records) {
    const recordBytes = textEncoder.encode(JSON.stringify(record)).length + 1;
    if (recordBytes + 2 > MAX_CHUNK_BYTES) {
      throw new Error("Um registro individual excede o limite aceito para sincronização.");
    }
    if (chunk.length && bytes + recordBytes > MAX_CHUNK_BYTES) {
      chunks.push(chunk);
      chunk = [];
      bytes = 2;
    }
    chunk.push(record);
    bytes += recordBytes;
  }
  if (chunk.length || !chunks.length) chunks.push(chunk);
  return chunks;
};

const saveDashboard = async (value, metadata) => {
  if (!value || !Array.isArray(value.fuel) || !Array.isArray(value.telemetry)) {
    throw new Error("Os dados do painel est\u00e3o em formato inv\u00e1lido.");
  }
  const existing = await getDocs(dashboardRef);
  const { fuel, telemetry, ...valueMetadata } = value;
  const documents = [
    { id: "metadata", type: "metadata", value: valueMetadata },
    ...splitRecords(fuel).map((records, index) => ({ id: `fuel-${index}`, type: "fuel", index, records })),
    ...splitRecords(telemetry).map((records, index) => ({ id: `telemetry-${index}`, type: "telemetry", index, records })),
  ];
  const documentIds = new Set(documents.map(({ id }) => id));
  const staleDocuments = existing.docs.filter((item) => !documentIds.has(item.id));
  if (documents.length + staleDocuments.length > 500) {
    throw new Error("O painel contém dados demais para uma única sincronização.");
  }

  const batch = writeBatch(db);
  staleDocuments.forEach((item) => batch.delete(item.ref));
  documents.forEach(({ id, ...document }) => {
    batch.set(doc(dashboardRef, id), { ...document, ...metadata });
  });
  await batch.commit();
};

export const initializeSharedStorage = async () => {
  const [dashboardSnapshot, historySnapshot, syncSnapshot] = await Promise.all([
    getDocs(dashboardRef),
    getDocs(historyRef),
    getDoc(syncRef),
  ]);
  const revision = syncSnapshot.exists() ? syncSnapshot.data().revision || 0 : 0;
  if (revision < baseRevision) return;
  baseRevision = revision;
  updateLocalCache(DASHBOARD_KEY, dashboardSnapshot.size
    ? snapshotDashboard(dashboardSnapshot)
    : { version: 1, fuel: [], telemetry: [] });
  updateLocalCache(HISTORY_KEY, snapshotHistory(historySnapshot));

  onSnapshot(dashboardRef, (snapshot) => {
    updateLocalCache(DASHBOARD_KEY, snapshot.size
      ? snapshotDashboard(snapshot)
      : { version: 1, fuel: [], telemetry: [] });
  }, (error) => dispatchStorageStatus(`Falha ao sincronizar o painel: ${error.message}`, true));

  onSnapshot(historyRef, (snapshot) => {
    updateLocalCache(HISTORY_KEY, snapshotHistory(snapshot));
  }, (error) => dispatchStorageStatus(`Falha ao sincronizar os históricos: ${error.message}`, true));

  onSnapshot(syncRef, (snapshot) => {
    const revision = snapshot.exists() ? snapshot.data().revision || 0 : 0;
    if (revision > baseRevision) {
      refreshSharedCache().catch((error) => {
        dispatchStorageStatus(`Falha ao atualizar os dados compartilhados: ${error.message}`, true);
      });
    }
  }, (error) => dispatchStorageStatus(`Falha ao sincronizar a versão dos dados: ${error.message}`, true));
};

export const loadSharedValue = (key) => {
  const stored = localStorage.getItem(key);
  return stored === null ? null : JSON.parse(stored);
};

export const restoreSharedValue = (key) => loadSharedValue(key);

export const saveSharedValue = (key, value) => {
  if (getCurrentRole() !== "adm") {
    dispatchStorageStatus("Somente administradores podem alterar dados.", true);
    return Promise.resolve(false);
  }

  const metadata = {
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
  };
  const save = key === DASHBOARD_KEY
    ? () => saveDashboard(value, metadata)
    : key === HISTORY_KEY && Array.isArray(value)
      ? () => saveHistory(value, metadata)
      : () => Promise.reject(new Error("Chave de armazenamento compartilhado desconhecida."));

  return withWriteLock(save).then(() => {
    dispatchStorageStatus("Altera\u00e7\u00f5es sincronizadas com o Firebase.");
    return true;
  }).catch((error) => {
    dispatchStorageStatus(`N\u00e3o foi poss\u00edvel sincronizar os dados: ${error.message}`, true);
    return false;
  });
};

const saveHistory = async (records, metadata) => {
  const existing = await getDocs(historyRef);
  const recordIds = new Set(records.map((record) => record.id));
  const batch = writeBatch(db);
  existing.docs.forEach((item) => {
    if (!recordIds.has(item.id)) batch.delete(item.ref);
  });
  records.forEach((record) => {
    batch.set(doc(historyRef, record.id), { record, ...metadata });
  });
  await batch.commit();
};

const refreshSharedCache = async () => {
  const [dashboardSnapshot, historySnapshot, syncSnapshot] = await Promise.all([
    getDocs(dashboardRef),
    getDocs(historyRef),
    getDoc(syncRef),
  ]);
  baseRevision = syncSnapshot.exists() ? syncSnapshot.data().revision || 0 : 0;
  updateLocalCache(DASHBOARD_KEY, dashboardSnapshot.size
    ? snapshotDashboard(dashboardSnapshot)
    : { version: 1, fuel: [], telemetry: [] });
  updateLocalCache(HISTORY_KEY, snapshotHistory(historySnapshot));
};

let pendingWrite = Promise.resolve();

const runWithWriteLock = async (operation) => {
  const uid = auth.currentUser.uid;
  const expectedRevision = baseRevision;
  let acquired = false;
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(syncRef);
      const state = snapshot.exists() ? snapshot.data() : {};
      const revision = state.revision || 0;
      if (revision !== expectedRevision) throw new Error("CONCURRENT_WRITE");
      if (state.lockOwner && state.lockUntil?.toMillis() > Date.now()) {
        throw new Error("WRITE_LOCKED");
      }
      transaction.set(syncRef, {
        revision,
        lockOwner: uid,
        lockUntil: Timestamp.fromMillis(Date.now() + 120_000),
      });
    });
    acquired = true;
    await operation();
    const revision = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(syncRef);
      const state = snapshot.exists() ? snapshot.data() : {};
      if (state.lockOwner !== uid) throw new Error("WRITE_LOCK_LOST");
      const nextRevision = (state.revision || 0) + 1;
      transaction.set(syncRef, {
        revision: nextRevision,
        lockOwner: null,
        lockUntil: null,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      return nextRevision;
    });
    baseRevision = revision;
  } catch (error) {
    if (acquired) {
      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(syncRef);
          if (snapshot.exists() && snapshot.data().lockOwner === uid) {
            transaction.set(syncRef, {
              ...snapshot.data(),
              lockOwner: null,
              lockUntil: null,
            });
          }
        });
      } catch (releaseError) {
        dispatchStorageStatus(`N\u00e3o foi poss\u00edvel liberar o bloqueio de grava\u00e7\u00e3o: ${releaseError.message}`, true);
      }
    }

    if (error instanceof Error && error.message === "CONCURRENT_WRITE") {
      await refreshSharedCache();
      throw new Error("Outro administrador alterou os dados. A vers\u00e3o mais recente foi carregada; revise e tente novamente.");
    }
    if (error instanceof Error && error.message === "WRITE_LOCKED") {
      throw new Error("Outro administrador est\u00e1 salvando altera\u00e7\u00f5es. Aguarde e tente novamente.");
    }
    throw error;
  }
};

const withWriteLock = (operation) => {
  const queuedWrite = pendingWrite.then(() => runWithWriteLock(operation));
  pendingWrite = queuedWrite.catch(() => {});
  return queuedWrite;
};

export const importSharedData = async (dashboard, history) => {
  if (getCurrentRole() !== "adm") throw new Error("Somente administradores podem importar os dados iniciais.");
  if (!dashboard || !Array.isArray(dashboard.fuel) || !Array.isArray(dashboard.telemetry)) {
    throw new Error("O arquivo do painel está inválido.");
  }
  if (!Array.isArray(history) || history.some((record) =>
    !record || typeof record.id !== "string" || !record.data
    || !Array.isArray(record.data.fuel) || !Array.isArray(record.data.telemetry))) {
    throw new Error("O arquivo de históricos está inválido.");
  }
  await withWriteLock(async () => Promise.all([
    saveDashboard(dashboard, {
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    }),
    saveHistory(history, {
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    }),
  ]));
  updateLocalCache(DASHBOARD_KEY, dashboard);
  updateLocalCache(HISTORY_KEY, history);
};
