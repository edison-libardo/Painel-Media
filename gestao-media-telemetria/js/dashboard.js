import {
  STORAGE_KEY,
  currencyFormat,
  downloadStateBackup,
  getVehicleType,
  mergeData,
  numberFormat,
  parseDataset,
  readBackupFile,
  readRows,
  readState,
  saveRecordEdit,
  saveState,
  text,
} from "./services/data-service.js";
import {
  getHistoryRecords,
  getHistoryRecord,
  saveHistoryRecord,
  updateHistoryRecordData,
} from "./services/history-service.js";
(() => {
  const showError = (message) => {
    const status = document.getElementById("import-status");
    if (status) {
      status.textContent = message;
      status.className = "mt-3 text-sm text-rose-700";
      status.hidden = false;
    } else {
      window.alert(message);
    }
  };
  const backupStatus = document.getElementById("autosave-status");
  window.addEventListener("libardo-backup-status", (event) => {
    if (!backupStatus) return;
    backupStatus.textContent = event.detail.message;
    backupStatus.className = `text-xs ${event.detail.isError ? "text-rose-300" : "text-emerald-300"}`;
  });
  window.addEventListener("libardo-storage-status", (event) => {
    if (!backupStatus) return;
    backupStatus.textContent = event.detail.message;
    backupStatus.className = `text-xs ${event.detail.isError ? "text-rose-300" : "text-emerald-300"}`;
  });

  const historyId = new URLSearchParams(window.location.search).get("historico");
  const historyEditMode = new URLSearchParams(window.location.search).get("editar") === "1"
    && document.body.dataset.userRole === "adm";
  let historicalRecord = null;
  let historyDraft = null;
  let historyLoadError = "";
  let sampleRecords = [];
  if (historyId) {
    try {
      historicalRecord = getHistoryRecord(historyId);
      if (!historicalRecord) historyLoadError = "O histórico solicitado não foi encontrado.";
    } catch (error) {
      historyLoadError = error instanceof Error ? `Não foi possível abrir o histórico: ${error.message}` : "Não foi possível abrir o histórico.";
    }
    if (historicalRecord && historyEditMode) {
      historyDraft = JSON.parse(JSON.stringify(historicalRecord.data));
    }
    document.body.classList.add("historical-view");
    const main = document.querySelector("main");
    if (main) {
      const notice = document.createElement("section");
      notice.className = `rounded-lg border p-4 ${historyLoadError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-sky-200 bg-sky-50 text-sky-900"}`;
      notice.setAttribute("role", historyLoadError ? "alert" : "status");
      if (historicalRecord) {
        const title = document.createElement("p");
        title.className = "font-semibold";
        title.textContent = `${historyEditMode ? "Edição" : "Visualização"} histórica: ${historicalRecord.name}`;
        const description = document.createElement("p");
        description.className = "mt-1 text-sm";
        description.textContent = historyEditMode
          ? "Edite as células da tabela e salve as alterações no arquivo histórico. A base operacional não será alterada."
          : "Modo somente leitura. Os dados atuais do painel não foram alterados.";
        const link = document.createElement("a");
        link.href = "historico.html";
        link.className = "mt-2 inline-flex text-sm font-semibold underline";
        link.textContent = "Voltar à lista de históricos";
        notice.append(title, description);
        if (historyEditMode) {
          const saveChanges = document.createElement("button");
          saveChanges.type = "button";
          saveChanges.className = "mt-3 mr-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800";
          saveChanges.textContent = "Salvar alterações";
          saveChanges.addEventListener("click", () => {
            try {
              historicalRecord = updateHistoryRecordData(historyId, historyDraft);
              historyDraft = historicalRecord.data;
              render(historyDraft);
              saveChanges.textContent = "Alterações salvas";
              window.setTimeout(() => {
                saveChanges.textContent = "Salvar alterações";
              }, 1800);
            } catch (error) {
              showError(error instanceof Error ? error.message : "Não foi possível salvar as alterações.");
            }
          });
          notice.append(saveChanges);
        }
        notice.append(link);
        document.querySelectorAll('nav[aria-label="Navegação principal"] a[href="index.html"], nav[aria-label="Navegação principal"] a[href="rankings.html"]')
          .forEach((anchor) => {
            const page = anchor.getAttribute("href");
            const query = new URLSearchParams({ historico: historyId });
            if (historyEditMode) query.set("editar", "1");
            anchor.href = `${page}?${query}`;
          });
      } else {
        notice.textContent = historyLoadError;
      }
      main.prepend(notice);
    }
    ["open-import", "reset-dashboard", "save-history", "backup-now", "restore-backup", "restore-backup-file", "autosave-status"].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.hidden = true;
    });
  }

  const setKpi = (labelText, value, detail, colorClass) => {
    const label = Array.from(document.querySelectorAll("main p")).find((item) => item.textContent.trim() === labelText);
    if (!label) return;
    const card = label.parentElement;
    const valueElement = card.querySelector("p.font-headline");
    if (valueElement) {
      valueElement.textContent = value;
      if (colorClass) {
        valueElement.classList.remove("text-success", "text-rose-600", "text-light-on-surface-variant");
        valueElement.classList.add(colorClass);
      }
    }
    const detailElement = card.querySelector("p.text-xs");
    if (detailElement && detail !== undefined) detailElement.textContent = detail;
  };

  const setSummaryCard = (labelText, value, detail) => {
    const label = Array.from(document.querySelectorAll("main p")).find((item) => item.textContent.trim() === labelText);
    if (!label) return;
    const card = label.parentElement;
    const valueElement = card.querySelector("p.font-headline");
    if (valueElement) valueElement.textContent = value;
    const detailElement = card.querySelector("p.text-xs");
    if (detailElement && detail !== undefined) detailElement.textContent = detail;
  };

  const tableCell = (value, className = "py-2 px-3") => {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = text(value);
    return cell;
  };
  const editableValue = (value, rawValue, field, label, kind = "number") => ({
    value,
    rawValue: rawValue ?? "",
    field,
    label,
    kind,
  });
  const percentageFormat = (value) => value == null
    ? "—"
    : `${numberFormat(value * 100, 1)}%`;
  const excludedRankingDrivers = new Set(["RAFAEL MARCOS DE SOUZA"]);
  const normalizeRankingDriver = (value) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/(?:^|[\s-])PX\s*$/i, "")
    .replace(/[^A-Z0-9]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const updateRankingCards = (records) => {
    const rankingRecords = records.filter((record) =>
      !excludedRankingDrivers.has(normalizeRankingDriver(record.driver)));
    const fuelRanks = rankingRecords.filter((record) =>
      record.factory > 0 && record.real != null && record.deviation != null);
    const best = fuelRanks.filter((record) => record.deviation > 0).sort((a, b) => b.deviation - a.deviation)[0];
    const worst = fuelRanks.filter((record) => record.deviation < 0).sort((a, b) => a.deviation - b.deviation)[0];
    const telematics = rankingRecords.filter((record) => Number.isFinite(record.score));
    const leader = [...telematics].sort((a, b) => b.score - a.score)[0];
    const scoreMaximum = Math.max(...telematics.map((record) => record.score));
    const scoreCeiling = scoreMaximum > 10 ? 100 : 10;
    const criticalThreshold = scoreCeiling * 0.6;
    const criticalRecords = telematics.filter((record) => record.score <= criticalThreshold);
    const critical = criticalRecords.sort((a, b) => a.score - b.score)[0];
    const driverScores = new Map();
    telematics.forEach((record) => {
      const driverKey = normalizeRankingDriver(record.driver);
      if (!driverKey) return;
      const normalizedScore = record.score * 100 / scoreCeiling;
      if (normalizedScore < 0 || normalizedScore > 100) return;
      const scores = driverScores.get(driverKey) || [];
      scores.push(normalizedScore);
      driverScores.set(driverKey, scores);
    });
    const normalizedDriverScores = [...driverScores.values()]
      .map((scores) => scores.reduce((sum, score) => sum + score, 0) / scores.length);
    const scoreBands = [
      { key: "90", minimum: 90, maximum: 100 },
      { key: "80", minimum: 80, maximum: 90 },
      { key: "70", minimum: 70, maximum: 80 },
      { key: "60", minimum: 60, maximum: 70 },
      { key: "0", minimum: 0, maximum: 60 },
    ];
    scoreBands.forEach(({ key, minimum, maximum }, index) => {
      const count = normalizedDriverScores.filter((score) =>
        score >= minimum && (index === 0 ? score <= maximum : score < maximum)).length;
      const card = document.querySelector(`[data-score-band="${key}"]`);
      const countElement = card?.querySelector("[data-score-band-count]");
      const percentElement = card?.querySelector("[data-score-band-percent]");
      if (countElement) countElement.textContent = `${count} ${count === 1 ? "motorista" : "motoristas"}`;
      if (percentElement) {
        const percentage = normalizedDriverScores.length
          ? count / normalizedDriverScores.length * 100
          : null;
        percentElement.textContent = percentage == null
          ? "— do total avaliado"
          : `${numberFormat(percentage, 1)}% do total avaliado`;
      }
    });
    setSummaryCard("Melhor Desempenho Média", best ? `+${numberFormat(best.deviation, 1)}% Superávit` : "—", best ? `${text(best.driver)} (${text(best.plate)})` : "Sem dados de consumo");
    setSummaryCard("Maior Desvio de Fábrica", worst ? `${numberFormat(worst.deviation, 1)}% Déficit` : "—", worst ? `${text(worst.driver)} (${text(worst.plate)})` : "Sem dados de consumo");
    setSummaryCard("Líder Geral Telemetria", leader ? `Nota ${numberFormat(leader.score, 1)} / ${scoreCeiling}` : "—", leader ? `${text(leader.driver)} (${text(leader.plate)})` : "Sem dados de telemetria");
    setSummaryCard(
      "Alerta Crítico Telemetria",
      critical ? `Nota ${numberFormat(critical.score, 1)} / ${scoreCeiling}` : "Nenhum alerta",
      critical
        ? `${criticalRecords.length} ${criticalRecords.length === 1 ? "condutor" : "condutores"} com nota ${numberFormat(criticalThreshold, 1)} ou menor; pior: ${text(critical.driver)} (${text(critical.plate)})`
        : `Nenhum condutor com nota ${numberFormat(criticalThreshold, 1)} ou menor`,
    );

    const sections = Array.from(document.querySelectorAll("#ranking-grid > section[data-ranking]"));
    const surplus = [...fuelRanks]
      .filter((record) => record.real > record.factory)
      .sort((a, b) => (b.real / b.factory) - (a.real / a.factory))
      .slice(0, 10);
    const deficit = [...fuelRanks].filter((record) => record.deviation < 0).sort((a, b) => a.deviation - b.deviation).slice(0, 10);
    const bestTelemetry = [...telematics].sort((a, b) => b.score - a.score).slice(0, 10);
    const worstTelemetry = [...telematics].sort((a, b) => a.score - b.score).slice(0, 10);
    [surplus, deficit, bestTelemetry, worstTelemetry].forEach((list, index) => {
      const body = sections[index]?.querySelector("tbody");
      if (!body) return;
      body.replaceChildren();
      list.forEach((record, position) => {
        const row = document.createElement("tr");
        row.className = "hover:bg-light-surface-variant/70 transition-colors";
        const cells = index < 2
          ? [
            `#${position + 1}`,
            text(record.driver),
            `${text(record.plate)}${getVehicleType(record) ? ` (${getVehicleType(record)})` : ""}`,
            numberFormat(record.factory, record.truckpagPdf ? 3 : 2),
            numberFormat(record.real, record.truckpagPdf ? 3 : 2),
            `${record.deviation > 0 ? "+" : ""}${numberFormat(record.deviation, 1)}%`,
            currencyFormat(record.savingsMoney),
          ]
          : [
            `#${position + 1}`,
            text(record.driver),
            `${text(record.plate)}${getVehicleType(record) ? ` (${getVehicleType(record)})` : ""}`,
            numberFormat(record.score, 1),
            record.award != null ? currencyFormat(record.award) : "—",
          ];
        cells.forEach((value, cellIndex) => {
          const align = cellIndex === 0 ? "text-center" : index < 2 && cellIndex > 2 ? "text-right" : "";
          row.append(tableCell(value, `py-2 px-3 ${align}`));
        });
        body.append(row);
      });
    });
    const search = document.getElementById("ranking-search");
    if (search) search.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const updateSampleTable = (records) => {
    if (document.body.dataset.page !== "sample") return;
    const body = document.querySelector("main table tbody");
    if (!body) return;
    body.replaceChildren();
    records.forEach((record, recordIndex) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-light-surface-variant/70 transition-colors";
      row.dataset.recordIndex = String(recordIndex);
      row.dataset.driver = record.driver || "";
      row.dataset.fuelIndex = record._sourceFuelIndex ?? "";
      row.dataset.telemetryIndex = record._sourceTelemetryIndex ?? "";
      row._record = record;
      const driverCell = document.createElement("td");
      driverCell.className = "py-3 px-4 font-semibold text-primary sticky left-0 z-10 bg-white";
      driverCell.dataset.sortValue = record.driver || "";
      if (historyEditMode) {
        driverCell.dataset.editableField = "driver";
        driverCell.dataset.editValue = record.driver ?? "";
        driverCell.dataset.editKind = "text";
      }
      const driverWrap = document.createElement("div");
      driverWrap.className = "flex items-center gap-2.5";
      const initials = document.createElement("span");
      initials.className = "w-7 h-7 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center";
      initials.textContent = (record.driver || "—").split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
      const nameWrap = document.createElement("div");
      const name = document.createElement("span");
      name.className = "block leading-snug";
      name.textContent = text(record.driver);
      nameWrap.append(name);
      if (record.driverId) {
        const id = document.createElement("span");
        id.className = "text-[11px] text-gray-500 font-normal";
        id.textContent = `CPF/Matrícula: ${record.driverId}`;
        nameWrap.append(id);
      }
      if (record.client) {
        const client = document.createElement("span");
        client.className = "block text-[11px] text-gray-500 font-normal";
        client.textContent = `Cliente: ${record.client}`;
        nameWrap.append(client);
      }
      driverWrap.append(initials, nameWrap);
      driverCell.append(driverWrap);
      if (historyEditMode) {
        driverCell.title = "Clique para editar Motorista";
        driverCell.setAttribute("aria-label", `Motorista: ${record.driver || "—"}. Clique para editar.`);
        driverCell.classList.add("cursor-pointer", "hover:bg-amber-50", "focus-visible:outline", "focus-visible:outline-2", "focus-visible:outline-accent");
        driverCell.tabIndex = 0;
      }
      row.append(driverCell);
      const values = [
        editableValue(text(record.plate), record.plate, "plate", "Placa", "text"),
        editableValue(text(record.vehicleType ?? getVehicleType(record)), record.vehicleType ?? getVehicleType(record), "vehicle", "Tipo de veículo", "select"),
        editableValue(record.liters == null ? "—" : `${numberFormat(record.liters, record.truckpagPdf ? 3 : 2)} L`, record.liters, "liters", "Litragem"),
        editableValue(currencyFormat(record.total), record.total, "total", "Valor total"),
        editableValue(record.km == null ? "—" : `${numberFormat(record.km, 0)} km`, record.km, "km", "KM rodado"),
        editableValue(record.factory == null ? "—" : `${numberFormat(record.factory, record.truckpagPdf ? 3 : 2)} km/l`, record.factory, "factory", "Média fábrica"),
        {
          ...editableValue(record.real == null ? "—" : `${numberFormat(record.real, record.truckpagPdf ? 3 : 2)} km/l`, record.real, "real", "Média real"),
          backgroundClass: record.real == null || record.factory == null
            ? ""
            : record.real >= record.factory ? "bg-emerald-100/70" : "bg-rose-100/70",
        },
        {
          ...editableValue(record.savingsLiters == null ? "—" : `${record.savingsLiters > 0 ? "+" : ""}${numberFormat(record.savingsLiters, record.truckpagPdf ? 3 : 2)} L`, record.savingsLiters, "savingsLiters", "Economia em litros"),
          backgroundClass: record.savingsLiters == null || record.savingsLiters === 0
            ? ""
            : record.savingsLiters < 0 ? "bg-rose-100/70" : "bg-emerald-100/70",
        },
        {
          ...editableValue(currencyFormat(record.savingsMoney), record.savingsMoney, "savingsMoney", "Economia em reais"),
          backgroundClass: record.savingsMoney == null || record.savingsMoney === 0
            ? ""
            : record.savingsMoney < 0 ? "bg-rose-100/70" : "bg-emerald-100/70",
        },
        editableValue(currencyFormat(record.unitPrice), record.unitPrice, "unitPrice", "Valor médio do diesel"),
        editableValue(record.costPerKm == null ? "—" : `${currencyFormat(record.costPerKm)} / km`, record.costPerKm, "costPerKm", "Custo por quilômetro"),
        editableValue(numberFormat(record.score, 1), record.score, "score", "Nota telemetria"),
        editableValue(currencyFormat(record.award), record.award, "award", "Valor prêmio obtido"),
        editableValue(percentageFormat(record.fxGreen), record.fxGreen, "fxGreen", "Fx verde"),
        editableValue(numberFormat(record.fxGreenNote, 1), record.fxGreenNote, "fxGreenNote", "Nota fx"),
        editableValue(percentageFormat(record.embalo), record.embalo, "embalo", "Embalo"),
        editableValue(numberFormat(record.embaloNote, 1), record.embaloNote, "embaloNote", "Nota embalo"),
        editableValue(percentageFormat(record.parkedOn), record.parkedOn, "parkedOn", "P. ligado"),
        editableValue(numberFormat(record.parkedOnNote, 1), record.parkedOnNote, "parkedOnNote", "Nota op. ligado"),
        editableValue(percentageFormat(record.aboveGreen), record.aboveGreen, "aboveGreen", "A. verde"),
        editableValue(numberFormat(record.aboveGreenNote, 1), record.aboveGreenNote, "aboveGreenNote", "Nota a. verde"),
        editableValue(numberFormat(record.speedPeaks, 0), record.speedPeaks, "speedPeaks", "Picos"),
        editableValue(numberFormat(record.speedPeaksNote, 1), record.speedPeaksNote, "speedPeaksNote", "Nota picos"),
        editableValue(text(record.vehicleGroup), record.vehicleGroup, "vehicleGroup", "Tipo conjunto", "text"),
        editableValue(currencyFormat(record.prizeTotal), record.prizeTotal, "prizeTotal", "Prêmio total"),
      ];
      values.forEach((entry, index) => {
        const value = typeof entry === "object" ? entry.value : entry;
        const alignment = index >= 2 && index !== 11 ? "text-right" : index === 11 ? "text-center" : "";
        const cell = tableCell(value, `py-3 px-3.5 font-code tabular-nums ${alignment}`);
        if (typeof entry === "object") {
          if (entry.backgroundClass) cell.classList.add(...entry.backgroundClass.split(" "));
          const editableInCurrentMode = historyEditMode
            || (!historyId && ["plate", "vehicle", "km", "real", "score", "award"].includes(entry.field));
          if (entry.field && editableInCurrentMode) {
            cell.dataset.editableField = entry.field;
            cell.dataset.editValue = String(entry.rawValue);
            cell.dataset.editKind = entry.kind || "number";
            cell.title = `Clique para editar ${entry.label}`;
            cell.setAttribute("aria-label", `${entry.label}: ${value}. Clique para editar.`);
            cell.classList.add("cursor-pointer", "hover:bg-amber-50", "focus-visible:outline", "focus-visible:outline-2", "focus-visible:outline-accent");
            cell.tabIndex = 0;
          }
        }
        row.append(cell);
      });
      body.append(row);
    });
    const count = document.getElementById("record-count");
    if (count) count.textContent = `Exibindo ${records.length} de ${records.length} ${records.length === 1 ? "registro" : "registros"}`;
    const vehicleFilter = document.getElementById("vehicle-filter");
    if (vehicleFilter) {
      const selectedType = vehicleFilter.value;
      vehicleFilter.replaceChildren(new Option("Todos os Tipos de Veículo", ""));
      ["ACELLO", "TRUCK", "BITRUCK", "CARRETA"].forEach((type) => {
        vehicleFilter.add(new Option(type, type));
      });
      vehicleFilter.value = selectedType;
    }
  };

  const updateSampleKpis = (records) => {
    if (!records.length) {
      setKpi("Diesel Médio Frota", "—");
      setKpi("Economia Gerada", "—", undefined, "text-light-on-surface-variant");
      setKpi("Premiação Acumulada", "—");
      setKpi("KM Rodado Total", "—");
      setKpi("Média Real Total", "—");
      setKpi("Litragem Total", "—");
      setKpi("Valor Total R$", "—");
      setKpi("Custo Total do KM Rodado", "—");
      return;
    }
    const fuelRecords = records.filter((record) => record.liters > 0 && record.total != null);
    const liters = records.reduce((sum, record) => sum + (record.liters > 0 ? record.liters : 0), 0);
    const total = fuelRecords.reduce((sum, record) => sum + record.total, 0);
    const totalValueRecords = records.filter((record) => record.total != null);
    const totalValue = totalValueRecords.reduce((sum, record) => sum + record.total, 0);
    const totalKm = records.reduce((sum, record) => sum + (record.km > 0 ? record.km : 0), 0);
    const realAverageRecords = records.filter((record) => record.km > 0 && record.liters > 0);
    const realAverageKm = realAverageRecords.reduce((sum, record) => sum + record.km, 0);
    const realAverageLiters = realAverageRecords.reduce((sum, record) => sum + record.liters, 0);
    const realAverage = realAverageLiters ? realAverageKm / realAverageLiters : null;
    const costRecords = records.filter((record) => record.km > 0 && record.total != null);
    const costTotal = costRecords.reduce((sum, record) => sum + record.total, 0);
    const costKm = costRecords.reduce((sum, record) => sum + record.km, 0);
    const savings = records.reduce((sum, record) => sum + (record.savingsMoney || 0), 0);
    setKpi("Diesel Médio Frota", liters ? `${currencyFormat(total / liters)} / L` : "—");
    setKpi("KM Rodado Total", totalKm ? `${numberFormat(totalKm, 0)} km` : "—");
    setKpi("Média Real Total", realAverage == null ? "—" : `${numberFormat(realAverage, 2)} km/l`);
    setKpi("Litragem Total", liters ? `${numberFormat(liters, 2)} L` : "—");
    setKpi("Valor Total R$", totalValueRecords.length ? currencyFormat(totalValue) : "—");
    setKpi("Custo Total do KM Rodado", costKm ? `${currencyFormat(costTotal / costKm)} / km` : "—");
    const hasSavings = records.some((record) => record.savingsMoney != null);
    setKpi(
      "Economia Gerada",
      hasSavings ? currencyFormat(savings) : "—",
      undefined,
      hasSavings ? savings < 0 ? "text-rose-600" : "text-success" : "text-light-on-surface-variant",
    );
    const awards = records.filter((record) => (record.awardForTotal ?? record.award) != null);
    const award = awards.reduce((sum, record) => sum + (record.awardForTotal ?? record.award), 0);
    setKpi("Premiação Acumulada", awards.length ? currencyFormat(award) : "—");
  };

  const updateFleetCount = (records) => {
    const countElement = document.querySelector("[data-fleet-count]");
    if (!countElement) return;
    const plates = new Set(records
      .filter((record) => record.plate && getVehicleType(record))
      .map((record) => String(record.plate).replace(/[-\s]/g, "").toUpperCase())
      .filter(Boolean));
    countElement.textContent = `Frota: ${new Intl.NumberFormat("pt-BR").format(plates.size)} Veículos`;
  };

  const render = (state) => {
    const records = mergeData(state);
    sampleRecords = records;
    updateRankingCards(records);
    updateSampleTable(records);
    updateSampleKpis(records);
    updateFleetCount(records);
    window.dispatchEvent(new Event("libardo-data-updated"));
  };

  window.addEventListener("libardo-table-filtered", (event) => {
    try {
      const recordIndices = event.detail?.recordIndices;
      if (!Array.isArray(recordIndices)) throw new Error("A lista de registros filtrados não foi informada.");
      updateSampleKpis(recordIndices.map((index) => sampleRecords[index]).filter(Boolean));
    } catch (error) {
      showError(error instanceof Error ? `Não foi possível atualizar os indicadores pelos filtros: ${error.message}` : "Não foi possível atualizar os indicadores pelos filtros.");
    }
  });

  const editSampleCell = (cell) => {
    if (document.body.dataset.userRole !== "adm") return;
    if (historyId && !historyEditMode) return;
    const field = cell.dataset.editableField;
    if (!field || cell.querySelector("input, select")) return;
    const row = cell.parentElement;
    if (!row) return;
    const originalText = cell.textContent.trim();
    const kind = cell.dataset.editKind || (field === "vehicle" ? "select" : "number");
    const input = document.createElement(kind === "select" ? "select" : "input");
    input.className = "w-full min-w-20 rounded border border-accent bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-accent/30";
    if (input instanceof HTMLSelectElement) {
      [["", "—"], ["ACELLO", "ACELLO"], ["TRUCK", "TRUCK"], ["BITRUCK", "BITRUCK"], ["CARRETA", "CARRETA"]]
        .forEach(([value, label]) => input.add(new Option(label, value)));
      input.value = cell.dataset.editValue || (originalText === "—" ? "" : originalText);
    } else {
      input.type = "text";
      input.inputMode = kind === "text" || field === "plate" ? "text" : "decimal";
      input.value = cell.dataset.editValue || "";
    }
    cell.replaceChildren(input);
    input.focus();
    if (input instanceof HTMLInputElement) input.select();
    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      if (!commit) {
        if (historyId) render(historyDraft);
        else cell.textContent = originalText;
        return;
      }
      try {
        if (historyId) {
          let value = input.value.trim();
          if (kind !== "text" && kind !== "select" && value !== "") {
            let normalizedValue = value.replace(/[^\d,.-]/g, "");
            const comma = normalizedValue.lastIndexOf(",");
            const dot = normalizedValue.lastIndexOf(".");
            if (comma >= 0 && dot >= 0) {
              normalizedValue = comma > dot
                ? normalizedValue.replace(/\./g, "").replace(",", ".")
                : normalizedValue.replace(/,/g, "");
            } else if (comma >= 0) {
              normalizedValue = normalizedValue.replace(/\./g, "").replace(",", ".");
            } else if (dot >= 0 && (normalizedValue.match(/\./g) || []).length > 1) {
              normalizedValue = normalizedValue.replace(/\./g, "");
            }
            value = Number(normalizedValue);
            if (!Number.isFinite(value)) throw new Error("Informe um valor numérico válido.");
          } else if (kind !== "text" && kind !== "select") {
            value = null;
          }
          const fuelIndex = row.dataset.fuelIndex === "" ? -1 : Number(row.dataset.fuelIndex);
          const telemetryIndex = row.dataset.telemetryIndex === "" ? -1 : Number(row.dataset.telemetryIndex);
          if (!Array.isArray(historyDraft.sampleOverrides)) historyDraft.sampleOverrides = [];
          let override = historyDraft.sampleOverrides.find((item) =>
            item.fuelIndex === fuelIndex && item.telemetryIndex === telemetryIndex);
          if (!override) {
            override = { fuelIndex, telemetryIndex, values: {} };
            historyDraft.sampleOverrides.push(override);
          }
          override.values[field === "vehicle" ? "vehicleType" : field] = value;
          const displayValue = value == null || value === "" ? "—" : String(value);
          if (field === "driver") {
            const name = cell.querySelector(".leading-snug");
            if (name) name.textContent = displayValue;
            else cell.textContent = displayValue;
            row.dataset.driver = value || "";
            cell.dataset.sortValue = value || "";
          } else {
            cell.textContent = displayValue;
          }
          cell.dataset.editValue = value == null ? "" : String(value);
          cell.setAttribute("aria-label", `${cell.title.replace("Clique para editar ", "")}: ${displayValue}. Clique para editar.`);
          return;
        }
        const state = readState() || { version: 1, fuel: [], telemetry: [] };
        const record = {
          _sourceFuelIndex: row.dataset.fuelIndex === "" ? null : Number(row.dataset.fuelIndex),
          _sourceTelemetryIndex: row.dataset.telemetryIndex === "" ? null : Number(row.dataset.telemetryIndex),
        };
        saveRecordEdit(state, record, field, input.value);
        render(state);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Não foi possível salvar a edição.");
        cell.textContent = originalText;
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    if (input instanceof HTMLSelectElement) input.addEventListener("change", () => finish(true));
    input.addEventListener("blur", () => finish(true));
  };

  document.querySelector("main table tbody")?.addEventListener("click", (event) => {
    const cell = event.target instanceof Element ? event.target.closest("td[data-editable-field]") : null;
    if (cell) editSampleCell(cell);
  });
  document.querySelector("main table tbody")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const cell = event.target instanceof HTMLTableCellElement && event.target.dataset.editableField ? event.target : null;
    if (!cell) return;
    event.preventDefault();
    editSampleCell(cell);
  });

  const createImportDialog = () => {
    const dialog = document.createElement("dialog");
    dialog.id = "import-dialog";
    dialog.className = "w-[min(94vw,560px)] rounded-xl border border-light-outline p-0 shadow-2xl backdrop:bg-slate-950/50";
    dialog.innerHTML = `
      <form id="import-form" class="p-6" novalidate>
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-accent">Importação operacional</p>
            <h2 class="mt-1 text-xl font-bold text-primary">Atualizar dados da frota</h2>
            <p class="mt-1 text-sm text-slate-600">Importe CSV/Excel nas duas fontes ou um PDF Truckpag em consumo. Uma importação parcial mantém os dados da outra fonte.</p>
          </div>
          <button type="button" id="close-import" aria-label="Fechar" class="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <label class="mt-5 block text-sm font-semibold text-slate-800" for="telemetry-file">1. Planilha de telemetria</label>
        <p class="mt-1 text-xs text-slate-500">CSV/Excel: Fx verde, embalo, p. ligado, a. verde, picos, notas, nota geral, conjunto e prêmio.</p>
        <input id="telemetry-file" type="file" accept=".csv,.txt,.xls,.xlsx" class="mt-2 block w-full rounded-md border border-light-outline bg-white p-2 text-sm">
        <label class="mt-4 block text-sm font-semibold text-slate-800" for="fuel-file">2. Planilha de consumo e vinculação</label>
        <p class="mt-1 text-xs text-slate-500">CSV/Excel, PDF Truckpag ou JSON processado pelo script Python.</p>
        <input id="fuel-file" type="file" accept=".csv,.txt,.xls,.xlsx,.pdf,.json,application/pdf,application/json" class="mt-2 block w-full rounded-md border border-light-outline bg-white p-2 text-sm">
        <p id="import-status" class="mt-3 text-sm" role="status" aria-live="polite" hidden></p>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" id="cancel-import" class="rounded-md border border-light-outline px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="submit" class="import-submit-button rounded-md px-4 py-2 text-sm font-semibold text-white">Importar dados</button>
        </div>
      </form>`;
    document.body.append(dialog);
    const close = () => dialog.close();
    document.getElementById("close-import").addEventListener("click", close);
    document.getElementById("cancel-import").addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    document.getElementById("import-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = document.getElementById("import-status");
      const telemetryFile = document.getElementById("telemetry-file").files[0];
      const fuelFile = document.getElementById("fuel-file").files[0];
      if (!telemetryFile && !fuelFile) {
        showError("Selecione ao menos um arquivo para importar.");
        return;
      }
      if (telemetryFile?.name.toLowerCase().endsWith(".pdf")) {
        showError("O PDF Truckpag deve ser selecionado em Consumo e Vinculação. A fonte de telemetria aceita CSV ou Excel.");
        return;
      }
      const submit = dialog.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Processando…";
      try {
        const current = readState() || { version: 1, fuel: [], telemetry: [] };
        const [telemetryRows, fuelData] = await Promise.all([
          telemetryFile ? readRows(telemetryFile) : null,
          fuelFile ? readRows(fuelFile) : null,
        ]);
        if (telemetryRows) current.telemetry = parseDataset(telemetryRows, "telemetry");
        if (fuelData) {
          current.fuel = fuelData.format === "truckpag-pdf"
            ? fuelData.records
            : parseDataset(fuelData, "fuel");
        }
        current.version = 1;
        current.importedAt = new Date().toISOString();
        saveState(current);
        render(current);
        const fuelLabel = current.fuel.length === 1 ? "registro" : "registros";
        const telemetryLabel = current.telemetry.length === 1 ? "registro" : "registros";
        status.textContent = `Importação concluída: ${current.fuel.length} ${fuelLabel} de consumo e ${current.telemetry.length} ${telemetryLabel} de telemetria.`;
        status.className = "mt-3 text-sm text-emerald-700";
        status.hidden = false;
        window.setTimeout(() => dialog.close(), 1100);
      } catch (error) {
        showError(error instanceof Error ? error.message : "Não foi possível importar os arquivos.");
      } finally {
        submit.disabled = false;
        submit.textContent = "Importar dados";
      }
    });
    return dialog;
  };

  const dialog = createImportDialog();
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    if (historyId) return;
    try {
      render(event.newValue ? JSON.parse(event.newValue) : { version: 1, fuel: [], telemetry: [] });
    } catch (error) {
      showError(error instanceof Error ? `Não foi possível sincronizar os dados: ${error.message}` : "Não foi possível sincronizar os dados.");
    }
  });
  if (!historyId) {
    document.getElementById("open-import")?.addEventListener("click", () => dialog.showModal());
    document.getElementById("backup-now")?.addEventListener("click", () => {
      try {
        const state = readState();
        if (!state) throw new Error("Ainda não há dados salvos para exportar.");
        downloadStateBackup(state);
      } catch (error) {
        const status = document.getElementById("autosave-status");
        if (status) {
          status.textContent = error instanceof Error ? error.message : "Não foi possível baixar o backup.";
          status.className = "text-xs text-rose-300";
        }
      }
    });
    const restoreButton = document.getElementById("restore-backup");
    const restoreInput = document.getElementById("restore-backup-file");
    restoreButton?.addEventListener("click", () => restoreInput?.click());
    restoreInput?.addEventListener("change", async () => {
      const file = restoreInput.files?.[0];
      if (!file) return;
      try {
        const restoredState = await readBackupFile(file);
        saveState(restoredState);
        render(restoredState);
        const status = document.getElementById("autosave-status");
        if (status) {
          status.textContent = "Backup restaurado e salvo neste navegador.";
          status.className = "text-xs text-emerald-300";
        }
      } catch (error) {
        const status = document.getElementById("autosave-status");
        if (status) {
          status.textContent = error instanceof Error ? error.message : "Não foi possível restaurar o backup.";
          status.className = "text-xs text-rose-300";
        }
      } finally {
        restoreInput.value = "";
      }
    });
    document.getElementById("save-history")?.addEventListener("click", () => {
      try {
        const state = readState();
        if (!state) throw new Error("Não há dados carregados para salvar.");
        const importedAt = state.importedAt ? new Date(state.importedAt) : new Date();
        const date = Number.isNaN(importedAt.getTime()) ? new Date() : importedAt;
        const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
        const suggestedName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        const record = saveHistoryRecord(suggestedName, state);
        window.alert(`Histórico "${record.name}" salvo. Você pode consultá-lo na página Histórico.`);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Não foi possível salvar o histórico.");
      }
    });
    document.getElementById("reset-dashboard")?.addEventListener("click", () => {
      try {
        const emptyState = { version: 1, fuel: [], telemetry: [], resetAt: new Date().toISOString() };
        saveState(emptyState);
        render(emptyState);
        const search = document.getElementById("driver-search");
        if (search) search.value = "";
        ["vehicle-filter", "average-filter", "minimum-score"].forEach((id) => {
          const control = document.getElementById(id);
          if (control) control.value = "";
        });
        const awarded = document.getElementById("awarded-only");
        if (awarded) awarded.checked = false;
        document.querySelectorAll("#vehicle-filter option[data-imported='true']").forEach((option) => option.remove());
        const rankingSearch = document.getElementById("ranking-search");
        if (rankingSearch) {
          rankingSearch.value = "";
          rankingSearch.dispatchEvent(new Event("input", { bubbles: true }));
        }
        document.querySelector('[data-ranking-filter="all"]')?.click();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Não foi possível limpar os dados.");
      }
    });
  }

  try {
    if (historicalRecord) {
      render(historyDraft || historicalRecord.data);
    } else if (historyId) {
      showError(historyLoadError);
    } else {
      const saved = readState();
      if (saved && saved.version === 1) {
        render(saved);
      } else {
        const emptyState = { version: 1, fuel: [], telemetry: [] };
        render(emptyState);
      }
    }
  } catch (error) {
    showError(error instanceof Error ? `Não foi possível recuperar os dados salvos: ${error.message}` : "Não foi possível recuperar os dados salvos.");
  }
})();
