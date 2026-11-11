import { restoreSharedValue, saveSharedValue } from "./shared-storage.js";
import { getCurrentRole } from "./auth-service.js";

export const STORAGE_KEY = "libardo-logistics-dashboard-v1";
const BACKUP_FORMAT = "libardo-logistics-backup";
const excludedTruckpagPlates = new Set([
  "SFI4F04",
  "SXV3D91",
  "FZJ3C73",
  "RAH0I63",
  "QJW8426",
  "TPN2E04",
  "EMP0000",
]);
const isExcludedPlate = (plate) => excludedTruckpagPlates.has(String(plate ?? "").replace(/[-\s]/g, "").toUpperCase());
const aliases = {
  plate: ["placa", "placaveiculo", "placadoveiculo", "veiculo", "vehicle", "licenseplate"],
  driver: ["motorista", "nomemotorista", "nomedomotorista", "condutor", "nomecondutor", "nomedocondutor", "driver", "nome"],
  driverId: ["cpf", "cpfdomotorista", "cpfdocondutor", "matricula", "cpfmatricula", "matriculacpf", "cpfoumatricula", "matriculamotorista", "idmotorista", "codmotorista", "codigomotorista", "registro"],
  vehicle: ["tipoveiculo", "tipodeveiculo", "modeloveiculo", "tipofrota", "categoria", "tipo"],
  liters: ["litragem", "litros", "litrosabastecidos", "litrosconsumidos", "quantidadedelitros", "volumelitros", "volumeabastecido", "abastecimento"],
  total: ["valortotal", "totalabastecimento", "valorabastecimento", "valorabastecido", "valor", "total"],
  km: ["kmrodado", "kmpercorrido", "kmpercorrida", "quilometragem", "quilometrosrodados", "distancia", "km"],
  factory: ["mediafabrica", "mediadefabrica", "consumofabrica", "consumodefabrica", "mediakmlfabrica", "mediaideal", "kmllfabrica", "kmlfabrica"],
  real: ["mediareal", "consumoreal", "mediakmlreal", "kmllreal", "kmlreal"],
  score: ["notageral", "notafinal", "notafinaltelemetria", "notatelemetria", "score", "pontuacao", "nota"],
  status: ["status", "situacao", "classificacao"],
  brakes: ["freadasbruscas", "frenagensbruscas", "freadas", "frenagens"],
  idle: ["marchalenta", "tempomarchalenta", "ociosidade", "idle"],
  fxGreen: ["fxverde", "faixaverdeeconomica", "faixaverde"],
  fxGreenNote: ["notafxverde", "notafx", "notafaixaverde"],
  embalo: ["embalo", "inercia", "aproveitamentoembalo"],
  embaloNote: ["notaembalo"],
  parkedOn: ["pligado", "paradoligado", "operacaoligado"],
  parkedOnNote: ["notaopligado", "notapligado", "notaparadoligado"],
  aboveGreen: ["averde", "acimadoverde", "acimafaixaverde"],
  aboveGreenNote: ["notaaverde", "notacimadoverde", "notaacimadoverde"],
  speedPeaks: ["picos", "picosexcesso", "picosexcessovelocidade"],
  speedPeaksNote: ["notapicos", "notapico"],
  vehicleGroup: ["tipoconjunto", "conjunto"],
  prizeTotal: ["premio", "premiototal", "valorpremiototal", "premioreferencia"],
  award: ["valorpremio", "premioobtido", "premiacao", "bonificacao"],
};
const fields = Object.keys(aliases);
const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");
const normalizeKey = (value) => normalize(value);
const normalizeDriverKey = (value) => normalize(String(value ?? "").replace(/(?:^|[\s-])PX\s*$/i, ""));
const hasPrizeExclusionMarker = (driver) => /\bPX\b/i.test(String(driver ?? ""));
const editDistanceAtMostOne = (left, right) => {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
    } else {
      differences += 1;
      if (differences > 1) return false;
      if (left.length > right.length) leftIndex += 1;
      else if (right.length > left.length) rightIndex += 1;
      else {
        leftIndex += 1;
        rightIndex += 1;
      }
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) differences += 1;
  return differences === 1;
};
const vehicleTypes = new Map([
  ["acello", "ACELLO"],
  ["truck", "TRUCK"],
  ["bitruck", "BITRUCK"],
  ["carreta", "CARRETA"],
]);
export const getVehicleType = (record) => {
  for (const value of [record?.vehicleGroup, record?.vehicle]) {
    const type = vehicleTypes.get(normalize(value));
    if (type) return type;
  }
  return "";
};
const numericFields = new Set([
  "liters", "total", "km", "factory", "real", "score", "brakes", "idle", "award",
  "fxGreen", "fxGreenNote", "embalo", "embaloNote", "parkedOn", "parkedOnNote",
  "aboveGreen", "aboveGreenNote", "speedPeaks", "speedPeaksNote", "prizeTotal",
]);
const fractionalFields = new Set(["fxGreen", "embalo", "parkedOn", "aboveGreen"]);
const numeric = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!text) return null;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (comma >= 0) {
    const decimalDigits = text.length - comma - 1;
    text = decimalDigits > 0 && decimalDigits <= 2
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/[,.]/g, "");
  } else if (dot >= 0) {
    const decimalDigits = text.length - dot - 1;
    if ((text.match(/\./g) || []).length > 1 || decimalDigits > 2) text = text.replace(/\./g, "");
  }
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
};
const fractionNumeric = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value ?? "").trim();
  if (!text) return null;
  const isPercent = text.includes("%");
  text = text.replace(/[^\d,.-]/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else {
    text = text.replace(",", ".");
  }
  const result = Number(text);
  return Number.isFinite(result) ? result / (isPercent ? 100 : 1) : null;
};
export const numberFormat = (value, digits = 2) => value == null
  ? "—"
  : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
export const currencyFormat = (value) => value == null
  ? "—"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export const text = (value) => value == null || value === "" ? "—" : String(value);
const withoutExcludedPlates = (records) => (Array.isArray(records) ? records : [])
  .filter((record) => !isExcludedPlate(record.plate));
export const readState = () => {
  const sharedState = restoreSharedValue(STORAGE_KEY);
  if (sharedState == null) return null;
  const state = sharedState;
  const originalFuel = Array.isArray(state.fuel) ? state.fuel : [];
  const originalTelemetry = Array.isArray(state.telemetry) ? state.telemetry : [];
  const fuel = withoutExcludedPlates(originalFuel);
  const telemetry = withoutExcludedPlates(originalTelemetry);
  if (fuel.length !== originalFuel.length || telemetry.length !== originalTelemetry.length) {
    const normalizedState = { ...state, fuel, telemetry };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));
    saveSharedValue(STORAGE_KEY, normalizedState);
  }
  return { ...state, fuel, telemetry };
};
const dispatchBackupStatus = (message, isError = false) => {
  window.dispatchEvent(new CustomEvent("libardo-backup-status", {
    detail: { message, isError },
  }));
};
export const downloadStateBackup = (state) => {
  const backup = {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    state: {
      ...state,
      fuel: withoutExcludedPlates(state.fuel),
      telemetry: withoutExcludedPlates(state.telemetry),
    },
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `libardo-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  dispatchBackupStatus("Cópia de segurança baixada para o computador.");
};
export const readBackupFile = async (file) => {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (error) {
    throw new Error(`O arquivo de backup não contém JSON válido: ${error.message}`);
  }
  const state = backup?.state;
  if (backup?.format !== BACKUP_FORMAT || backup.version !== 1
    || state?.version !== 1 || !Array.isArray(state.fuel) || !Array.isArray(state.telemetry)
    || [...state.fuel, ...state.telemetry].some((record) =>
      !record || typeof record !== "object" || Array.isArray(record))) {
    throw new Error("O arquivo selecionado não é um backup válido do painel Libardo.");
  }
  return {
    ...state,
    fuel: withoutExcludedPlates(state.fuel),
    telemetry: withoutExcludedPlates(state.telemetry),
  };
};
export const saveState = (state) => {
  if (getCurrentRole() !== "adm") throw new Error("Somente administradores podem alterar os dados do painel.");
  const normalizedState = {
    ...state,
    fuel: withoutExcludedPlates(state.fuel),
    telemetry: withoutExcludedPlates(state.telemetry),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));
  saveSharedValue(STORAGE_KEY, normalizedState);
};
export const saveRecordEdit = (state, record, field, rawValue) => {
  const fieldMap = {
    plate: "plate",
    vehicle: "vehicleGroup",
    real: "real",
    km: "km",
    score: "score",
    award: "award",
  };
  const targetField = fieldMap[field];
  if (!targetField) throw new Error("Este campo não pode ser editado.");
  const fuelIndex = record._sourceFuelIndex;
  const telemetryIndex = record._sourceTelemetryIndex;
  const fuelRecord = Number.isInteger(fuelIndex) ? state.fuel[fuelIndex] : null;
  const telemetryRecord = Number.isInteger(telemetryIndex) ? state.telemetry[telemetryIndex] : null;
  if (!fuelRecord && !telemetryRecord) throw new Error("Não foi possível localizar a origem deste registro para salvar a edição.");
  const truckpagPdfImported = state.fuel.some((item) => item.truckpagPdf);
  if (field === "km" && truckpagPdfImported && !fuelRecord?.truckpagPdf) {
    throw new Error("O KM deste registro só pode ser obtido do relatório PDF Truckpag.");
  }

  let value;
  if (field === "plate") {
    value = String(rawValue ?? "").trim().toUpperCase();
    if (value && !/^[A-Z0-9-]{5,10}$/.test(value)) throw new Error("Informe uma placa válida (5 a 10 letras, números ou hífen).");
  } else if (field === "vehicle") {
    const types = ["ACELLO", "TRUCK", "BITRUCK", "CARRETA"];
    value = String(rawValue ?? "").trim().toUpperCase();
    if (value && !types.includes(value)) throw new Error("Selecione um tipo de veículo válido.");
  } else {
    let textValue = String(rawValue ?? "").trim().replace(/[^\d,.-]/g, "");
    const comma = textValue.lastIndexOf(",");
    const dot = textValue.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      textValue = comma > dot
        ? textValue.replace(/\./g, "").replace(",", ".")
        : textValue.replace(/,/g, "");
    } else if (comma >= 0) {
      textValue = textValue.replace(/\./g, "").replace(",", ".");
    } else if (dot >= 0 && (textValue.match(/\./g) || []).length > 1) {
      textValue = textValue.replace(/\./g, "");
    } else if (dot >= 0 && field === "award" && textValue.length - dot - 1 === 3) {
      textValue = textValue.replace(".", "");
    }
    value = textValue ? Number(textValue) : null;
    if (!Number.isFinite(value)) value = null;
    if (rawValue !== "" && value == null) throw new Error("Informe um valor numérico válido.");
    if (field === "score" && value != null && (value < 0 || value > 100)) throw new Error("A nota telemétrica deve estar entre 0 e 100.");
    if (field !== "score" && value != null && value < 0) throw new Error("O valor não pode ser negativo.");
  }

  if (field === "plate") {
    if (fuelRecord) fuelRecord.plate = value;
    if (telemetryRecord) telemetryRecord.plate = value;
  } else if (field === "vehicle") {
    if (telemetryRecord) telemetryRecord.vehicleGroup = value;
    if (fuelRecord) {
      fuelRecord.vehicleGroup = value;
      fuelRecord.vehicle = value;
    }
  } else {
    if (fuelRecord) fuelRecord[targetField] = value;
    if (telemetryRecord && !(field === "km" && truckpagPdfImported)) telemetryRecord[targetField] = value;
    if (field === "award") {
      if (fuelRecord) fuelRecord.awardForTotal = value;
      if (telemetryRecord) telemetryRecord.awardForTotal = value;
    }
  }
  saveState(state);
  return state;
};

const parseCsv = (source, delimiter) => {
  const input = source.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (rows.length < 2) throw new Error("O arquivo não contém cabeçalho e linhas de dados.");
  return rows;
};

const delimiterScore = (rows) => {
  const sample = rows.slice(0, 30).filter((row) => row.some((value) => value.trim() !== ""));
  const widths = sample.map((row) => row.length).filter((width) => width > 1);
  if (!widths.length) return 0;
  const counts = new Map();
  widths.forEach((width) => counts.set(width, (counts.get(width) || 0) + 1));
  const [columns, consistentRows] = [...counts.entries()].sort((left, right) =>
    right[1] - left[1] || right[0] - left[0])[0];
  return consistentRows * 100 + columns;
};

const decodeCsv = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
};

const readCsvRows = async (file) => {
  const source = await decodeCsv(file);
  const candidates = [";", ",", "\t", "|"].map((delimiter) => {
    try {
      const rows = parseCsv(source, delimiter);
      return { rows, score: delimiterScore(rows) };
    } catch {
      return { rows: [], score: 0 };
    }
  }).sort((left, right) => right.score - left.score);
  if (!candidates[0].rows.length || candidates[0].score === 0) {
    throw new Error("Não foi possível identificar as colunas do CSV. Verifique se o arquivo possui cabeçalho e separador válido.");
  }
  return candidates[0].rows;
};

const loadPdfLibrary = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) {
    resolve(window.pdfjsLib);
    return;
  }
  const existing = document.querySelector('script[data-pdfjs-loader="true"]');
  const script = existing || document.createElement("script");
  if (!existing) {
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.dataset.pdfjsLoader = "true";
    script.onload = () => resolve(window.pdfjsLib);
    script.onerror = () => reject(new Error("Não foi possível carregar o leitor de PDF. Verifique a conexão e tente novamente."));
    document.head.append(script);
  } else {
    script.addEventListener("load", () => resolve(window.pdfjsLib), { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar o leitor de PDF. Verifique a conexão e tente novamente.")), { once: true });
  }
});

const groupPdfLines = (items) => {
  const sorted = items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width || 0 }))
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const lines = [];
  sorted.forEach((item) => {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
    line.y = line.items.reduce((sum, entry) => sum + entry.y, 0) / line.items.length;
  });
  return lines.map((line) => {
    line.items.sort((left, right) => left.x - right.x);
    let output = "";
    let previousEnd = null;
    line.items.forEach((item) => {
      if (previousEnd != null && item.x - previousEnd > 1.5 && !output.endsWith(" ")) output += " ";
      output += item.text;
      previousEnd = item.x + item.width;
    });
    return { ...line, text: output.trim() };
  }).sort((left, right) => right.y - left.y);
};

const truckpagNumber = (value, field) => {
  let textValue = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!textValue) return null;
  if (field === "km") {
    textValue = textValue.replace(/[.,](?=\d{3}(?:\D|$))/g, "");
    return numeric(textValue);
  }
  const comma = textValue.lastIndexOf(",");
  if (comma >= 0) {
    textValue = textValue.replace(/\./g, "").replace(",", ".");
  } else if ((textValue.match(/\./g) || []).length > 1) {
    const lastDot = textValue.lastIndexOf(".");
    textValue = textValue.slice(0, lastDot).replace(/\./g, "") + textValue.slice(lastDot);
  }
  const result = Number(textValue);
  return Number.isFinite(result) ? result : null;
};

const truckpagHeaderAliases = {
  client: ["cliente"],
  plate: ["placa", "placaveiculo"],
  vehicle: ["descricao"],
  driver: ["motorista", "condutor"],
  liters: ["litros", "litragem", "litrosconsumidos"],
  total: ["valortotal", "valor"],
  km: ["kmsrodados", "kmsrodado", "kmrodado", "quilometragem"],
  factory: ["mediafab", "mediafabrica", "fab"],
  real: ["mediareal"],
  savingsLiters: ["economial", "economiaemlitros"],
  savingsMoney: ["economiar", "economiaemreais"],
};
const truckpagHeaderMatches = (textValue, field) => {
  const normalized = normalize(textValue);
  return truckpagHeaderAliases[field].some((alias) =>
    normalized === alias || (alias.length >= 5 && normalized.startsWith(alias)));
};

const findTruckpagColumns = (line) => {
  const items = line.items;
  const columns = [];
  for (let start = 0; start < items.length; start += 1) {
    let combined = "";
    for (let end = start; end < Math.min(items.length, start + 4); end += 1) {
      if (end > start) {
        const gap = items[end].x - (items[end - 1].x + items[end - 1].width);
        if (gap > 90) break;
        combined += " ";
      }
      combined += items[end].text;
      Object.keys(truckpagHeaderAliases).forEach((field) => {
        if (truckpagHeaderMatches(combined, field) && !columns.some((column) => column.field === field)) {
          const first = items[start];
          const last = items[end];
          columns.push({
            field,
            x: (first.x + last.x + last.width) / 2,
          });
        }
      });
    }
  }
  return columns;
};

const findWrappedTruckpagColumns = (lines) => {
  const columns = lines.flatMap(findTruckpagColumns);
  for (let firstLine = 0; firstLine < lines.length; firstLine += 1) {
    for (let secondLine = firstLine + 1; secondLine < lines.length; secondLine += 1) {
      if (Math.abs(lines[firstLine].y - lines[secondLine].y) > 30) continue;
      lines[firstLine].items.forEach((first) => {
        lines[secondLine].items.forEach((second) => {
          const firstCenter = first.x + first.width / 2;
          const secondCenter = second.x + second.width / 2;
          if (Math.abs(firstCenter - secondCenter) > Math.max(24, Math.min(first.width, second.width))) return;
          [first.text + second.text, second.text + first.text].forEach((joined) => {
            Object.keys(truckpagHeaderAliases).forEach((field) => {
              if (!truckpagHeaderMatches(joined, field)) return;
              columns.push({ field, x: (firstCenter + secondCenter) / 2 });
            });
          });
        });
      });
    }
  }
  return columns;
};

const extractTruckpagRowNumbers = (rowText, plate) => {
  const withoutPlate = rowText.replace(new RegExp(plate.replace(/[- ]/g, "[- ]?"), "i"), " ");
  const numberPattern = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[,.]\d+)?/g;
  const values = [];
  let match;
  while ((match = numberPattern.exec(withoutPlate))) {
    values.push(match[0]);
  }
  return values.length > 7 ? values.slice(-7) : values;
};

const parseTruckpagPdf = async (file) => {
  const library = await loadPdfLibrary();
  if (!library) throw new Error("O leitor de PDF não foi disponibilizado.");
  library.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf = await library.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines = groupPdfLines(content.items);
    pages.push(pageLines);
  }
  if (!pages.some((pageLines) => pageLines.length)) {
    throw new Error("O PDF não contém texto selecionável. Relatórios digitalizados como imagem precisam de OCR.");
  }

  const headerFields = new Set(["plate", "liters", "total", "km", "factory", "real"]);
  const vehicleHeaders = pages.map((pageLines) => {
    const headers = [];
    pageLines.forEach((line) => {
      const lineColumns = findTruckpagColumns(line);
      if (!lineColumns.some((column) => column.field === "plate")) return;
      const nearbyLines = pageLines.filter((candidate) => Math.abs(candidate.y - line.y) <= 16);
      const columnsByField = new Map();
      findWrappedTruckpagColumns(nearbyLines).forEach((column) => {
        if (!columnsByField.has(column.field)) columnsByField.set(column.field, column);
      });
      if ([...headerFields].every((field) => columnsByField.has(field))) {
        const columns = [...columnsByField.values()];
        headers.push({ y: line.y, columns: columns.sort((left, right) => left.x - right.x) });
      }
    });
    return headers.sort((left, right) => right.y - left.y);
  });
  if (!vehicleHeaders.some((headers) => headers.length)) {
    const excerpt = pages.flat().slice(0, 12).map((line) => line.text).filter(Boolean).join(" | ").slice(0, 400);
    throw new Error(`Não encontrei o cabeçalho da tabela do relatório Truckpag. Esperava colunas como Placa, Litros, KMs Rodados, Média Fab. e Média Real.${excerpt ? ` Texto lido do PDF: ${excerpt}` : ""}`);
  }

  const platePattern = /\b[A-Z]{3}[- ]?\d[A-Z0-9]\d{2}\b/i;
  const records = [];
  let currentDriver = "";
  let currentClient = "";
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageLines = pages[pageIndex];
    const headers = vehicleHeaders[pageIndex];
    const summaryHeaders = pageLines.filter((line) => {
      const fields = new Set(findTruckpagColumns(line).map((column) => column.field));
      return fields.has("client") && fields.has("driver");
    }).map((line) => {
      const nearbyLines = pageLines.filter((candidate) => Math.abs(candidate.y - line.y) <= 16);
      const columnsByField = new Map();
      findWrappedTruckpagColumns(nearbyLines).forEach((column) => {
        if (!columnsByField.has(column.field)) columnsByField.set(column.field, column);
      });
      const driverColumn = columnsByField.get("driver");
      const clientColumn = columnsByField.get("client");
      const litersColumn = columnsByField.get("liters");
      const firstVehicleHeader = headers.find((header) => header.y < line.y);
      if (!driverColumn || !clientColumn || !litersColumn) return null;
      const nextSummaryHeader = pageLines
        .filter((candidate) => {
          if (candidate.y >= line.y - 2) return false;
          const fields = new Set(findTruckpagColumns(candidate).map((column) => column.field));
          return fields.has("client") && fields.has("driver");
        })
        .sort((left, right) => right.y - left.y)[0];
      const contextBoundary = firstVehicleHeader?.y ?? nextSummaryHeader?.y ?? Number.NEGATIVE_INFINITY;
      const contextLines = pageLines.filter(
        (candidate) => candidate.y < line.y - 2 && candidate.y > contextBoundary + 2,
      );

      const driverLeft = (clientColumn.x + driverColumn.x) / 2;
      const driverRight = (driverColumn.x + litersColumn.x) / 2;
      const contextItems = contextLines
        .flatMap((candidate) => candidate.items)
        .filter((item) => item.x + item.width / 2 >= driverLeft && item.x + item.width / 2 < driverRight)
        .sort((left, right) => right.y - left.y || left.x - right.x);
      const driver = contextItems.map((item) => item.text.trim()).filter(Boolean).join(" ").trim();
      if (!driver) return null;

      const clientLeft = clientColumn.x - (driverColumn.x - clientColumn.x) / 2;
      const clientRight = driverLeft;
      const clientItems = contextLines
        .flatMap((candidate) => candidate.items)
        .filter((item) => item.x + item.width / 2 >= clientLeft && item.x + item.width / 2 < clientRight)
        .sort((left, right) => right.y - left.y || left.x - right.x);
      const client = clientItems.map((item) => item.text.trim()).filter(Boolean).join(" ").trim();
      const nameStartY = Math.max(...contextItems.map((item) => item.y));
      return { driver, client, nameStartY };
    }).filter(Boolean).sort((left, right) => right.nameStartY - left.nameStartY);

    let summaryIndex = 0;
    for (const line of [...pageLines].sort((left, right) => right.y - left.y)) {
      while (summaryIndex < summaryHeaders.length && line.y <= summaryHeaders[summaryIndex].nameStartY) {
        currentDriver = summaryHeaders[summaryIndex].driver;
        if (summaryHeaders[summaryIndex].client) currentClient = summaryHeaders[summaryIndex].client;
        summaryIndex += 1;
      }

      const plateMatch = line.text.match(platePattern);
      if (!plateMatch) continue;

      const header = headers
        .filter((candidate) => candidate.y > line.y)
        .sort((left, right) => left.y - right.y)[0];
      if (!header) continue;
      const columns = header.columns;
      const positionalColumnsUsable = new Set(columns.map((column) => Math.round(column.x))).size >= 6;
      const rowCells = new Map(columns.map((column) => [column.field, []]));
      const vehicleColumn = columns.find((column) => column.field === "vehicle");
      const plateColumn = columns.find((column) => column.field === "plate");
      const litersColumn = columns.find((column) => column.field === "liters");
      const vehicleText = vehicleColumn && plateColumn && litersColumn
        ? pageLines
          .filter((candidate) => Math.abs(candidate.y - line.y) <= 8)
          .flatMap((candidate) => candidate.items)
          .filter((item) => {
            const center = item.x + item.width / 2;
            return center >= (plateColumn.x + vehicleColumn.x) / 2
              && center < (vehicleColumn.x + litersColumn.x) / 2;
          })
          .sort((left, right) => right.y - left.y || left.x - right.x)
          .map((item) => item.text.trim())
          .filter(Boolean)
          .join(" ")
          .trim()
        : "";
      line.items.forEach((item) => {
        const center = item.x + item.width / 2;
        let closest = columns[0];
        let distance = Number.POSITIVE_INFINITY;
        columns.forEach((column) => {
          const currentDistance = Math.abs(center - column.x);
          if (currentDistance < distance) {
            closest = column;
            distance = currentDistance;
          }
        });
        if (closest) rowCells.get(closest.field)?.push(item.text);
      });
      const value = (field) => (rowCells.get(field) || []).join(" ").trim();
      const numericValues = extractTruckpagRowNumbers(line.text, plateMatch[0]);
      const orderedFields = ["liters", "total", "km", "factory", "real", "savingsLiters", "savingsMoney"];
      const fallbackValues = Object.fromEntries(orderedFields.map((field, valueIndex) => [
        field,
        numericValues[valueIndex] || "",
      ]));
      const fieldValue = (field) => {
        const mapped = value(field);
        if (!positionalColumnsUsable) return fallbackValues[field] || "";
        return mapped || fallbackValues[field] || "";
      };
      const rowDriver = value("driver");
      const driver = rowDriver && !/^[-–—]$/.test(rowDriver)
        ? rowDriver.replace(/^(?:motorista|condutor)\s*[:\-]\s*/i, "").trim()
        : currentDriver;
      const record = {
        plate: plateMatch[0].replace(/[ -]/g, "").toUpperCase(),
        driver,
        driverId: "",
        vehicle: vehicleText,
        liters: truckpagNumber(fieldValue("liters"), "liters"),
        total: truckpagNumber(fieldValue("total"), "total"),
        km: truckpagNumber(fieldValue("km"), "km"),
        factory: truckpagNumber(fieldValue("factory"), "factory"),
        real: truckpagNumber(fieldValue("real"), "real"),
        score: null,
        status: "",
        brakes: null,
        idle: null,
        award: null,
        truckpagSavingsLiters: truckpagNumber(fieldValue("savingsLiters"), "savingsLiters"),
        truckpagSavingsMoney: truckpagNumber(fieldValue("savingsMoney"), "savingsMoney"),
        client: currentClient,
        truckpagPdf: true,
      };
      if (isExcludedPlate(record.plate)) {
        continue;
      }
      if (record.liters == null && record.total == null && record.km == null) {
        continue;
      }
      records.push(record);
  }
  }
  if (!records.length) {
    throw new Error("Encontrei a tabela do relatório, mas não consegui extrair linhas de veículos. Confirme se o PDF contém texto selecionável e dados alinhados às colunas.");
  }
  return records;
};

const loadSpreadsheetLibrary = () => new Promise((resolve, reject) => {
  if (window.XLSX) {
    resolve(window.XLSX);
    return;
  }
  const existing = document.querySelector('script[data-xlsx-loader="true"]');
  const script = existing || document.createElement("script");
  if (!existing) {
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.dataset.xlsxLoader = "true";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Não foi possível carregar o leitor de Excel. Tente novamente ou use um arquivo CSV."));
    document.head.append(script);
  } else {
    script.addEventListener("load", () => resolve(window.XLSX), { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar o leitor de Excel. Tente novamente ou use um arquivo CSV.")), { once: true });
  }
});

export const readRows = async (file) => {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "pdf") return { format: "truckpag-pdf", records: await parseTruckpagPdf(file) };
  if (extension === "json") {
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch (error) {
      throw new Error(`O JSON exportado pelo parser Truckpag não pôde ser lido: ${error.message}`);
    }
    if (payload?.format !== "truckpag-pdf" || !Array.isArray(payload.records) || payload.records.length === 0) {
      throw new Error("O JSON não contém registros Truckpag. Gere-o com scripts/truckpag_pdf.py.");
    }
    const invalidRecord = payload.records.find((record) =>
      !record || typeof record.plate !== "string" || !record.plate
      || typeof record.driver !== "string" || !record.driver
      || ["liters", "total", "km", "factory", "real"].some((field) =>
        typeof record[field] !== "number" || !Number.isFinite(record[field])));
    if (invalidRecord) {
      throw new Error("O JSON contém um veículo sem motorista ou com métricas inválidas.");
    }
    return payload;
  }
  if (extension === "csv" || extension === "txt") return readCsvRows(file);
  if (!["xlsx", "xls"].includes(extension)) throw new Error(`Formato não suportado: ${file.name}`);
  const library = await loadSpreadsheetLibrary();
  if (!library) throw new Error("A biblioteca de leitura de Excel não foi disponibilizada.");
  const workbook = library.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = library.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const populated = rows.filter((row) => row.some((value) => String(value).trim() !== ""));
  if (populated.length < 2) throw new Error(`A primeira aba de ${file.name} não contém dados.`);
  return populated;
};

export const parseDataset = (rows, kind) => {
  const findColumns = (headerRow) => {
    const headers = headerRow.map((header) => normalize(header));
    const columns = {};
    fields.forEach((field) => {
      columns[field] = headers.findIndex((header) =>
        aliases[field].some((alias) => header === alias || (alias.length >= 7 && header.startsWith(alias))));
    });
    return columns;
  };
  const keyFields = ["plate", "driverId", "driver"];
  const requiredMetrics = kind === "fuel"
    ? ["liters", "total", "km", "factory", "real"]
    : ["score"];
  let headerIndex = -1;
  let columns = {};
  for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
    const candidate = findColumns(rows[index]);
    const hasKey = keyFields.some((field) => candidate[field] >= 0);
    const hasMetric = requiredMetrics.some((field) => candidate[field] >= 0);
    if (hasKey && hasMetric) {
      headerIndex = index;
      columns = candidate;
      break;
    }
  }
  if (headerIndex < 0) {
    const headers = rows.slice(0, 10).map((row) => row.map((cell) => String(cell).trim()).filter(Boolean).join(" | ")).filter(Boolean);
    const preview = headers.length ? ` Cabeçalhos encontrados: ${headers.join(" / ")}.` : "";
    throw new Error(`Não identifiquei os cabeçalhos de ${kind === "fuel" ? "consumo" : "telemetria"}. Confira se a planilha contém uma coluna de Placa, CPF/Matrícula ou Motorista e as métricas correspondentes.${preview}`);
  }
  const records = rows.slice(headerIndex + 1).map((row) => {
    const record = {};
    fields.forEach((field) => {
      const index = columns[field];
      const value = index < 0 ? "" : row[index];
      record[field] = numericFields.has(field)
        ? fractionalFields.has(field) ? fractionNumeric(value) : numeric(value)
        : String(value ?? "").trim();
    });
    if (kind === "telemetry") {
      record.awardForTotal = record.award;
      if (hasPrizeExclusionMarker(record.driver)) record.award = null;
    }
    return record;
  }).filter((record) => record.plate || record.driverId || record.driver);
  if (!records.length) throw new Error("Os cabeçalhos foram identificados, mas não há registros com placa, CPF/Matrícula ou motorista.");
  if (kind !== "telemetry") return records;

  const telemetryRecords = [];
  const indexesByIdentity = new Map();
  const prizeExcludedIndexes = new Set();
  records.forEach((record) => {
    const driverKey = normalizeDriverKey(record.driver);
    const driverIdKey = normalizeKey(record.driverId);
    const plateKey = normalizeKey(record.plate);
    const identityKeys = [
      driverKey && `driver:${driverKey}`,
      driverIdKey && `id:${driverIdKey}`,
      plateKey && `plate:${plateKey}`,
    ].filter(Boolean);
    const existingIndex = identityKeys
      .map((key) => indexesByIdentity.get(key))
      .find((index) => index !== undefined);
    const index = existingIndex ?? telemetryRecords.length;

    if (existingIndex === undefined) {
      telemetryRecords.push(record);
    } else {
      const existing = telemetryRecords[index];
      fields.forEach((field) => {
        if ((existing[field] == null || existing[field] === "")
          && record[field] != null && record[field] !== "") {
          existing[field] = record[field];
        }
      });
    }

    identityKeys.forEach((key) => indexesByIdentity.set(key, index));
    if (hasPrizeExclusionMarker(record.driver)) prizeExcludedIndexes.add(index);
    if (prizeExcludedIndexes.has(index)) telemetryRecords[index].award = null;
  });
  return telemetryRecords;
};

export const mergeData = (state) => {
  const records = [];
  const plateIndex = new Map();
  const driverIndex = new Map();
  const mergedIndexes = new Set();
  const driverKeys = new Set();
  const truckpagPdfImported = state.fuel.some((record) => record.truckpagPdf);
  const scoreCeiling = state.telemetry.some((record) => record.score > 10) ? 100 : 10;
  const criticalScoreThreshold = scoreCeiling * 0.6;
  const attentionScoreThreshold = scoreCeiling * 0.8;
  state.fuel.forEach((record, fuelIndex) => {
    if (isExcludedPlate(record.plate)) return;
    const index = records.length;
    records.push({ ...record, _sourceFuelIndex: fuelIndex, _sourceTelemetryIndex: null });
    if (record.plate) plateIndex.set(normalizeKey(record.plate), index);
    [record.driverId && normalizeKey(record.driverId), record.driver && normalizeDriverKey(record.driver)]
      .filter(Boolean)
      .forEach((normalized) => {
        const matches = driverIndex.get(normalized) || [];
        matches.push(index);
        driverIndex.set(normalized, matches);
      });
    if (record.driver) {
      const normalized = normalizeDriverKey(record.driver);
      driverKeys.add(normalized);
    }
  });
  state.telemetry.forEach((telemetry, telemetryIndex) => {
    if (isExcludedPlate(telemetry.plate)) return;
    let match;
    const driverMatches = [telemetry.driverId && normalizeKey(telemetry.driverId), telemetry.driver && normalizeDriverKey(telemetry.driver)]
      .filter(Boolean)
      .map((key) => driverIndex.get(key) || [])
      .find((matches) => matches.length) || [];
    let matchedDriverRows = driverMatches;
    if (!matchedDriverRows.length && telemetry.driver) {
      const telemetryKey = normalizeDriverKey(telemetry.driver);
      const nearMatches = [...driverKeys].filter((key) =>
        key.length >= 12 && editDistanceAtMostOne(telemetryKey, key));
      if (nearMatches.length === 1) matchedDriverRows = driverIndex.get(nearMatches[0]) || [];
    }
    if (matchedDriverRows.length && telemetry.plate) {
      const plateMatch = plateIndex.get(normalizeKey(telemetry.plate));
      if (plateMatch !== undefined && matchedDriverRows.includes(plateMatch)) match = plateMatch;
    }
    if (match === undefined && matchedDriverRows.length) {
      match = matchedDriverRows.find((index) => !mergedIndexes.has(index)) ?? matchedDriverRows[0];
    }
    if (match === undefined && telemetry.plate) match = plateIndex.get(normalizeKey(telemetry.plate));
    if (match !== undefined) {
      const merged = { ...records[match] };
      fields.forEach((field) => {
        if (field === "km" && truckpagPdfImported) return;
        if (telemetry[field] !== "" && telemetry[field] != null) merged[field] = telemetry[field];
      });
      if (telemetry.awardForTotal != null) merged.awardForTotal = telemetry.awardForTotal;
      if (hasPrizeExclusionMarker(telemetry.driver)) merged.award = null;
      merged._sourceTelemetryIndex = telemetryIndex;
      records[match] = merged;
      mergedIndexes.add(match);
    } else {
      records.push({
        ...telemetry,
        ...(truckpagPdfImported ? { km: null } : {}),
        _sourceFuelIndex: null,
        _sourceTelemetryIndex: telemetryIndex,
      });
    }
  });
  const overridesBySource = new Map(
    (Array.isArray(state.sampleOverrides) ? state.sampleOverrides : [])
      .filter((override) =>
        override
        && Number.isInteger(override.fuelIndex)
        && Number.isInteger(override.telemetryIndex)
        && override.values
        && typeof override.values === "object")
      .map((override) => [`${override.fuelIndex}:${override.telemetryIndex}`, override.values]),
  );
  return records.map((record) => {
    const real = record.real ?? (record.km > 0 && record.liters > 0 ? record.km / record.liters : null);
    const calculatedSavingsLiters = record.km > 0 && record.factory > 0 && record.liters != null
      ? record.km / record.factory - record.liters
      : null;
    const unitPrice = record.liters > 0 && record.total != null ? record.total / record.liters : null;
    const savingsLiters = record.truckpagSavingsLiters ?? calculatedSavingsLiters;
    const savingsMoney = record.truckpagSavingsMoney ?? (savingsLiters != null && unitPrice != null ? savingsLiters * unitPrice : null);
    const deviation = real != null && record.factory > 0 ? (real / record.factory - 1) * 100 : null;
    const mergedRecord = {
      ...record,
      _sourceFuelIndex: record._sourceFuelIndex ?? null,
      _sourceTelemetryIndex: record._sourceTelemetryIndex ?? null,
      real,
      savingsLiters,
      savingsMoney,
      unitPrice,
      costPerKm: record.km > 0 && record.total != null ? record.total / record.km : null,
      deviation,
      status: record.status || (record.score == null
        ? ""
        : record.score <= criticalScoreThreshold
          ? "Crítico"
          : record.score < attentionScoreThreshold ? "Atenção" : "Adequado"),
    };
    const sourceKey = `${mergedRecord._sourceFuelIndex ?? -1}:${mergedRecord._sourceTelemetryIndex ?? -1}`;
    const overrides = overridesBySource.get(sourceKey);
    return overrides ? { ...mergedRecord, ...overrides } : mergedRecord;
  });
};