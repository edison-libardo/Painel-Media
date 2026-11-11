import { currencyFormat, getVehicleType, mergeData, numberFormat, text } from "./services/data-service.js";
import { getHistoryRecords, HISTORY_STORAGE_KEY } from "./services/history-service.js";

(() => {
  const firstSelect = document.getElementById("comparison-first");
  const secondSelect = document.getElementById("comparison-second");
  const compareButton = document.getElementById("compare-button");
  const status = document.getElementById("comparison-status");
  const results = document.getElementById("comparison-results");
  const summaryColumns = document.getElementById("summary-columns");
  const scoreBandBody = document.getElementById("score-band-comparison");
  const overviewTab = document.getElementById("comparison-overview-tab");
  const driverDetailsTab = document.getElementById("driver-details-tab");
  const chartsTab = document.getElementById("comparison-charts-tab");
  const overviewPanel = document.getElementById("comparison-overview-panel");
  const driverDetailsPanel = document.getElementById("driver-details-panel");
  const chartsPanel = document.getElementById("comparison-charts-panel");
  const driverDetailsSearch = document.getElementById("driver-details-search");
  const driverDetailsBody = document.getElementById("driver-details-body");
  const driverDetailsCount = document.getElementById("driver-details-count");
  const driverDetailsTableWrap = document.getElementById("driver-details-table-scroll");
  const driverDetailsTable = driverDetailsTableWrap?.querySelector("table");
  let historyRecords = [];
  let driverDetailsRows = [];
  let sharedStorageError = null;
  let syncDriverDetailsStickyHeader = () => {};

  if (driverDetailsTableWrap && driverDetailsTable) {
    const driverDetailsStickyHeader = document.createElement("div");
    const stickyTable = driverDetailsTable.cloneNode(false);
    const sourceCells = driverDetailsTable.querySelectorAll("thead th");
    const stickyHead = driverDetailsTable.querySelector("thead").cloneNode(true);
    stickyHead.setAttribute("aria-hidden", "true");
    stickyTable.append(stickyHead);
    driverDetailsStickyHeader.append(stickyTable);
    driverDetailsStickyHeader.setAttribute("aria-hidden", "true");
    Object.assign(driverDetailsStickyHeader.style, {
      display: "none",
      position: "fixed",
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: "30",
    });
    document.body.append(driverDetailsStickyHeader);

    syncDriverDetailsStickyHeader = () => {
      const wrapperRect = driverDetailsTableWrap.getBoundingClientRect();
      const tableRect = driverDetailsTable.getBoundingClientRect();
      const headerRect = driverDetailsTable.querySelector("thead").getBoundingClientRect();
      const navigationHeight = document.querySelector("body > header")?.getBoundingClientRect().height ?? 0;
      const isVisible = !driverDetailsPanel.hidden
        && wrapperRect.width > 0
        && wrapperRect.top < navigationHeight
        && wrapperRect.bottom > navigationHeight + headerRect.height;

      if (!isVisible) {
        driverDetailsStickyHeader.style.display = "none";
        return;
      }

      Object.assign(driverDetailsStickyHeader.style, {
        display: "block",
        top: `${navigationHeight}px`,
        left: `${wrapperRect.left}px`,
        width: `${wrapperRect.width}px`,
        height: `${headerRect.height}px`,
      });
      stickyTable.style.width = `${tableRect.width}px`;
      stickyTable.style.transform = `translateX(-${driverDetailsTableWrap.scrollLeft}px)`;
      const cellWidths = Array.from(sourceCells, (cell) => cell.getBoundingClientRect().width);
      stickyHead.querySelectorAll("th").forEach((cell, index) => {
        cell.style.width = `${cellWidths[index]}px`;
      });
      const firstHeaderCell = stickyHead.querySelector("th");
      firstHeaderCell.classList.remove("sticky", "left-0", "z-10");
      Object.assign(firstHeaderCell.style, {
        position: "relative",
        left: `${driverDetailsTableWrap.scrollLeft}px`,
        zIndex: "1",
      });
    };

    window.addEventListener("scroll", syncDriverDetailsStickyHeader, { passive: true });
    window.addEventListener("resize", syncDriverDetailsStickyHeader);
    driverDetailsTableWrap.addEventListener("scroll", syncDriverDetailsStickyHeader, { passive: true });
  }

  const normalizedName = (value) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/(?:^|[\s-])PX\s*$/i, "")
    .replace(/[^A-Z0-9]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const excludedComparisonDrivers = new Set(["RAFAEL MARCOS DE SOUZA"]);
  const normalizedId = (value) => String(value ?? "").replace(/\D/g, "");
  const normalizedPlate = (value) => String(value ?? "").replace(/[-\s]/g, "").toUpperCase();
  const recordDate = (record) => {
    const period = new Date(record.data.importedAt || record.savedAt);
    return Number.isNaN(period.getTime()) ? new Date(0) : period;
  };
  const recordOrder = (first, second) =>
    recordDate(first) - recordDate(second) || new Date(first.savedAt) - new Date(second.savedAt);
  const dateLabel = (record) => {
    const date = recordDate(record);
    return date.getTime() === 0
      ? "Período não informado"
      : new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  };
  const scoreCeiling = (records) => records.some((record) => Number.isFinite(record.score) && record.score > 10) ? 100 : 10;
  const displayNumber = (value, digits = 2, suffix = "") => Number.isFinite(value)
    ? `${numberFormat(value, digits)}${suffix}`
    : "—";

  const setActiveTab = (activeTab, focus = false) => {
    const tabs = [
      [overviewTab, overviewPanel],
      [driverDetailsTab, driverDetailsPanel],
      [chartsTab, chartsPanel],
    ];
    tabs.forEach(([tab, panel]) => {
      const selected = tab === activeTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.className = selected
        ? "rounded-t-md border-b-2 border-primary px-4 py-2 text-sm font-semibold text-primary"
        : "rounded-t-md border-b-2 border-transparent px-4 py-2 text-sm font-semibold text-slate-500 hover:text-primary";
      panel.hidden = !selected;
    });
    if (activeTab === driverDetailsTab) syncDriverDetailsStickyHeader();
    if (focus) activeTab.focus();
    if (activeTab === chartsTab) window.dispatchEvent(new Event("comparison-charts-visible"));
  };

  [overviewTab, driverDetailsTab, chartsTab].forEach((tab, index, tabs) => {
    tab.addEventListener("click", () => setActiveTab(tab));
    tab.addEventListener("keydown", (event) => {
      const currentIndex = tabs.indexOf(event.currentTarget);
      const nextIndex = event.key === "ArrowRight"
        ? (currentIndex + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (currentIndex + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
      if (nextIndex < 0) return;
      event.preventDefault();
      setActiveTab(tabs[nextIndex], true);
    });
  });

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.className = `text-sm ${isError ? "text-rose-700" : "text-light-on-surface-variant"}`;
    status.hidden = !message;
  };

  const fillSelectors = () => {
    try {
      const selectedFirst = firstSelect.value;
      const selectedSecond = secondSelect.value;
      historyRecords = getHistoryRecords().sort((a, b) =>
        recordOrder(a, b));
      [firstSelect, secondSelect].forEach((select) => {
        select.replaceChildren(new Option("Selecione um histórico", ""));
        historyRecords.forEach((record) => {
          const option = new Option(record.name, record.id);
          select.add(option);
        });
      });
      firstSelect.value = historyRecords.some((record) => record.id === selectedFirst) ? selectedFirst : "";
      secondSelect.value = historyRecords.some((record) => record.id === selectedSecond) ? selectedSecond : "";
      compareButton.disabled = historyRecords.length < 2;
      compareButton.classList.toggle("opacity-50", compareButton.disabled);
      compareButton.classList.toggle("cursor-not-allowed", compareButton.disabled);
      if (historyRecords.length < 2) {
        results.hidden = true;
        setStatus("Salve pelo menos dois históricos para comparar.");
      } else {
        setStatus("");
      }
    } catch (error) {
      results.hidden = true;
      compareButton.disabled = true;
      setStatus(error instanceof Error ? `Não foi possível carregar os históricos: ${error.message}` : "Não foi possível carregar os históricos.", true);
    }
  };

  const summaryFor = (records) => {
    const fuelRecords = records.filter((record) => record.liters > 0 && record.total != null);
    const liters = records.reduce((sum, record) => sum + (record.liters > 0 ? record.liters : 0), 0);
    const fuelValue = fuelRecords.reduce((sum, record) => sum + record.total, 0);
    const totalValueRecords = records.filter((record) => record.total != null);
    const totalValue = totalValueRecords.reduce((sum, record) => sum + record.total, 0);
    const totalKm = records.reduce((sum, record) => sum + (record.km > 0 ? record.km : 0), 0);
    const averageRecords = records.filter((record) => record.km > 0 && record.liters > 0);
    const averageKm = averageRecords.reduce((sum, record) => sum + record.km, 0);
    const averageLiters = averageRecords.reduce((sum, record) => sum + record.liters, 0);
    const costRecords = records.filter((record) => record.km > 0 && record.total != null);
    const costValue = costRecords.reduce((sum, record) => sum + record.total, 0);
    const costKm = costRecords.reduce((sum, record) => sum + record.km, 0);
    const savingsRecords = records.filter((record) => record.savingsMoney != null);
    const awardRecords = records.filter((record) => (record.awardForTotal ?? record.award) != null);
    const dieselAverage = liters && fuelRecords.length ? fuelValue / liters : null;
    const savings = savingsRecords.length
      ? savingsRecords.reduce((sum, record) => sum + record.savingsMoney, 0)
      : null;
    const award = awardRecords.length
      ? awardRecords.reduce((sum, record) => sum + (record.awardForTotal ?? record.award), 0)
      : null;
    const average = averageLiters ? averageKm / averageLiters : null;
    const costPerKm = costKm ? costValue / costKm : null;
    return [
      { key: "diesel", label: "Diesel médio frota", value: dieselAverage == null ? "—" : `${currencyFormat(dieselAverage)} / L`, comparisonValue: dieselAverage },
      { key: "award", label: "Premiação acumulada", value: award == null ? "—" : currencyFormat(award), comparisonValue: award },
      { key: "average", label: "Média real total", value: average == null ? "—" : `${numberFormat(average, 2)} km/l`, comparisonValue: average },
      { key: "value", label: "Valor total", value: totalValueRecords.length ? currencyFormat(totalValue) : "—", comparisonValue: totalValueRecords.length ? totalValue : null },
      { key: "savings", label: "Economia gerada", value: savings == null ? "—" : currencyFormat(savings), comparisonValue: savings },
      { key: "km", label: "KM rodado total", value: totalKm ? `${numberFormat(totalKm, 0)} km` : "—", comparisonValue: totalKm || null },
      { key: "liters", label: "Litragem total", value: liters ? `${numberFormat(liters, 2)} L` : "—", comparisonValue: liters || null },
      { key: "cost", label: "Custo total do KM rodado", value: costPerKm == null ? "—" : `${currencyFormat(costPerKm)} / km`, comparisonValue: costPerKm },
    ];
  };

  const comparisonIndicator = (key, previous, current) => {
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
    const difference = current - previous;
    const green = key === "savings"
      ? current < 0
        ? Math.abs(current) < Math.abs(previous)
        : current > 0 && Math.abs(current) > Math.abs(previous)
      : key === "award"
        ? difference > 0
      : key === "diesel" || key === "liters" || key === "value" || key === "cost"
        ? current < previous
        : current > previous;
    const neutral = difference === 0;
    const label = neutral ? "sem variação" : green ? "evolução favorável" : "evolução desfavorável";
    return { difference, green, neutral, direction: difference > 0 ? "up" : "down", label };
  };

  const makeAwardIcon = () => {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("viewBox", "0 0 40 28");
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", "Duas moedas douradas com cifrão verde");
    icon.classList.add("h-7", "w-10", "shrink-0");
    const coins = [
      { x: 12, y: 14, radius: 10 },
      { x: 28, y: 14, radius: 10 },
    ];
    coins.forEach(({ x, y, radius }) => {
      const coin = document.createElementNS(namespace, "circle");
      coin.setAttribute("cx", String(x));
      coin.setAttribute("cy", String(y));
      coin.setAttribute("r", String(radius));
      coin.setAttribute("fill", "#facc15");
      coin.setAttribute("stroke", "#ca8a04");
      coin.setAttribute("stroke-width", "2");
      icon.append(coin);
    });
    coins.forEach(({ x, y }) => {
      const dollar = document.createElementNS(namespace, "text");
      dollar.setAttribute("x", String(x));
      dollar.setAttribute("y", String(y + 5));
      dollar.setAttribute("text-anchor", "middle");
      dollar.setAttribute("font-size", "16");
      dollar.setAttribute("font-weight", "700");
      dollar.setAttribute("fill", "#15803d");
      dollar.textContent = "$";
      icon.append(dollar);
    });
    return icon;
  };

  const formatMetricDelta = (key, difference) => {
    if (key === "diesel") return `${difference > 0 ? "+" : ""}${currencyFormat(difference)} / L`;
    if (key === "award" || key === "savings" || key === "value") {
      return `${difference > 0 ? "+" : ""}${currencyFormat(difference)}`;
    }
    if (key === "km") return signedNumber(difference, 0, " km");
    if (key === "average") return signedNumber(difference, 2, " km/l");
    if (key === "liters") return signedNumber(difference, 2, " L");
    return `${difference > 0 ? "+" : ""}${currencyFormat(difference)} / km`;
  };

  const renderSummary = (older, newer, olderRecords, newerRecords) => {
    summaryColumns.replaceChildren();
    const olderValues = summaryFor(olderRecords);
    const newerValues = summaryFor(newerRecords);
    document.getElementById("summary-period-label").textContent =
      `Mês anterior: ${older.name} · Referência atual: ${newer.name}`;
    olderValues.forEach((previous, index) => {
      const current = newerValues[index];
      const indicator = comparisonIndicator(previous.key, previous.comparisonValue, current.comparisonValue);
      const card = document.createElement("article");
      card.className = "flex min-w-0 flex-col rounded-xl border border-light-outline bg-white p-4 shadow-sm transition-shadow hover:shadow-md";
      card.dataset.comparisonMetric = previous.key;

      const header = document.createElement("div");
      header.className = "flex min-h-10 items-center gap-2";
      const iconWrap = document.createElement("span");
      iconWrap.className = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-light-surface text-slate-600";
      const metricIcons = {
        diesel: "fuel",
        award: "award",
        average: "gauge",
        value: "value",
        savings: "savings",
        km: "truck",
        liters: "fuel",
        cost: "gauge",
      };
      iconWrap.append(metricIcons[previous.key] === "award"
        ? makeAwardIcon()
        : iconFor(metricIcons[previous.key], "h-5 w-5"));

      const heading = document.createElement("h3");
      heading.className = "text-sm font-semibold leading-5 text-slate-800";
      heading.textContent = previous.label;
      header.append(iconWrap, heading);

      const currentPanel = document.createElement("div");
      currentPanel.className = "mt-4 rounded-lg bg-light-surface p-3";
      const currentCaption = document.createElement("p");
      currentCaption.className = "text-[10px] font-semibold uppercase tracking-wide text-light-on-surface-variant";
      currentCaption.textContent = `Referência · ${newer.name}`;
      const currentValue = document.createElement("p");
      currentValue.className = "mt-1 break-words font-code text-lg font-bold text-primary";
      currentValue.textContent = current.value;
      currentPanel.append(currentCaption, currentValue);

      const previousLine = document.createElement("p");
      previousLine.className = "mt-3 break-words text-xs text-light-on-surface-variant";
      const previousLabel = document.createElement("span");
      previousLabel.className = "font-semibold text-slate-600";
      previousLabel.textContent = `Ant. · ${older.name}: `;
      previousLine.append(previousLabel, document.createTextNode(previous.value));

      const variation = document.createElement("div");
      variation.className = "mt-auto flex items-center justify-between gap-2 pt-4";
      const variationLabel = document.createElement("span");
      variationLabel.className = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
      variationLabel.textContent = "Variação";
      const badge = document.createElement("span");
      if (!indicator) {
        badge.className = "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500";
        badge.textContent = "Sem comparação";
      } else {
        const tone = indicator.neutral
          ? "border-slate-200 bg-slate-50 text-slate-600"
          : indicator.green
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700";
        badge.className = `inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`;
        badge.setAttribute("aria-label", `${indicator.label}: ${formatMetricDelta(previous.key, indicator.difference)}`);
        if (!indicator.neutral) badge.append(iconFor(indicator.direction, "h-3.5 w-3.5 shrink-0"));
        const delta = document.createElement("span");
        delta.className = "truncate";
        delta.textContent = indicator.neutral ? "Sem variação" : formatMetricDelta(previous.key, indicator.difference);
        badge.append(delta);
      }
      variation.append(variationLabel, badge);
      card.append(header, currentPanel, previousLine, variation);
      summaryColumns.append(card);
    });
  };

  const findPreviousRecord = (reference, previousRecords) => {
    const referenceId = normalizedId(reference.driverId);
    const referenceName = normalizedName(reference.driver);
    const matches = previousRecords.filter((record) => {
      const sameId = referenceId && normalizedId(record.driverId) === referenceId;
      const sameName = referenceName && normalizedName(record.driver) === referenceName;
      return sameId || sameName;
    });
    const plate = normalizedPlate(reference.plate);
    return matches.find((record) => plate && normalizedPlate(record.plate) === plate) || matches[0] || null;
  };

  const signedNumber = (value, digits, suffix) => {
    if (!Number.isFinite(value)) return "—";
    return `${value > 0 ? "+" : ""}${numberFormat(value, digits)}${suffix}`;
  };

  const aggregateDrivers = (records) => {
    const drivers = new Map();
    records.forEach((record) => {
      const key = normalizedName(record.driver);
      if (!key) return;
      let driver = drivers.get(key);
      if (!driver) {
        driver = {
          name: String(record.driver).replace(/[\s-]*PX\s*$/i, "").trim(),
          km: 0,
          hasKm: false,
          liters: 0,
          hasLiters: false,
          averageKm: 0,
          averageLiters: 0,
          total: 0,
          hasTotal: false,
          savings: 0,
          hasSavings: false,
        };
        drivers.set(key, driver);
      }
      if (Number.isFinite(record.km) && record.km > 0) {
        driver.km += record.km;
        driver.hasKm = true;
      }
      if (Number.isFinite(record.liters) && record.liters > 0) {
        driver.liters += record.liters;
        driver.hasLiters = true;
      }
      if (Number.isFinite(record.km) && record.km > 0
        && Number.isFinite(record.liters) && record.liters > 0) {
        driver.averageKm += record.km;
        driver.averageLiters += record.liters;
      }
      if (Number.isFinite(record.total)) {
        driver.total += record.total;
        driver.hasTotal = true;
      }
      if (Number.isFinite(record.savingsMoney)) {
        driver.savings += record.savingsMoney;
        driver.hasSavings = true;
      }
    });
    drivers.forEach((driver) => {
      driver.km = driver.hasKm ? driver.km : null;
      driver.liters = driver.hasLiters ? driver.liters : null;
      driver.average = driver.averageLiters > 0 ? driver.averageKm / driver.averageLiters : null;
      driver.total = driver.hasTotal ? driver.total : null;
      driver.savings = driver.hasSavings ? driver.savings : null;
    });
    return drivers;
  };

  const driverMetrics = [
    { key: "km", digits: 0, suffix: " km" },
    { key: "liters", digits: 2, suffix: " L" },
    { key: "average", digits: 2, suffix: " km/l" },
    { key: "total", currency: true },
    { key: "savings", currency: true },
  ];

  const formatDriverMetric = (metric, value) => metric.currency
    ? currencyFormat(value)
    : displayNumber(value, metric.digits, metric.suffix);

  const formatDriverDelta = (metric, difference) => metric.currency
    ? difference > 0 ? `+${currencyFormat(difference)}` : currencyFormat(difference)
    : signedNumber(difference, metric.digits, metric.suffix);

  const renderDriverDetailsRows = () => {
    const query = normalizedName(driverDetailsSearch.value);
    const visibleRows = driverDetailsRows.filter((row) =>
      !query || normalizedName(row.name).includes(query));
    driverDetailsBody.replaceChildren();
    driverDetailsCount.textContent = `${visibleRows.length} de ${driverDetailsRows.length} motoristas`;

    if (!visibleRows.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.className = "px-4 py-6 text-center text-sm text-slate-500";
      cell.colSpan = 16;
      cell.textContent = driverDetailsRows.length
        ? "Nenhum motorista encontrado."
        : "N\u00e3o h\u00e1 motoristas com nome nos hist\u00f3ricos selecionados.";
      row.append(cell);
      driverDetailsBody.append(row);
      return;
    }

    visibleRows.forEach((driver) => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.className = "sticky left-0 border-r border-light-outline bg-white px-4 py-3 font-semibold text-slate-800";
      name.textContent = driver.name;
      row.append(name);

      driverMetrics.forEach((metric) => {
        const previous = driver.previous?.[metric.key] ?? null;
        const current = driver.current?.[metric.key] ?? null;
        [previous, current].forEach((value) => {
          const cell = document.createElement("td");
          cell.className = "whitespace-nowrap px-3 py-3 text-right font-code text-xs text-slate-700";
          cell.textContent = formatDriverMetric(metric, value);
          row.append(cell);
        });
        const delta = document.createElement("td");
        const difference = Number.isFinite(previous) && Number.isFinite(current)
          ? current - previous
          : null;
        const deltaTone = difference != null && difference < 0
          ? metric.key === "liters" ? "text-emerald-700" : "text-rose-700"
          : difference != null && difference > 0 && metric.key === "average"
            ? "text-emerald-700"
            : "text-slate-700";
        delta.className = `whitespace-nowrap border-r border-light-outline px-3 py-3 text-right font-code text-xs ${deltaTone}`;
        if (metric.key === "savings") delta.classList.remove("border-r");
        delta.textContent = difference == null ? "—" : formatDriverDelta(metric, difference);
        row.append(delta);
      });
      driverDetailsBody.append(row);
    });
  };

  const renderDriverDetails = (older, newer, olderRecords, newerRecords) => {
    const previousDrivers = aggregateDrivers(olderRecords);
    const currentDrivers = aggregateDrivers(newerRecords);
    const driverKeys = new Set([...previousDrivers.keys(), ...currentDrivers.keys()]);
    driverDetailsRows = [...driverKeys].map((key) => ({
      name: currentDrivers.get(key)?.name || previousDrivers.get(key).name,
      previous: previousDrivers.get(key),
      current: currentDrivers.get(key),
    })).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    document.getElementById("driver-details-period-label").textContent =
      `M\u00eas anterior: ${older.name} \u00b7 Refer\u00eancia atual: ${newer.name}`;
    renderDriverDetailsRows();
  };

  driverDetailsSearch.addEventListener("input", renderDriverDetailsRows);

  const iconFor = (name, className = "h-4 w-4") => {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.8");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    icon.classList.add(...className.split(" "));
    const shapes = {
      fuel: [
        ["path", { d: "M3 22V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v17" }],
        ["path", { d: "M3 10h14M7 6h6M3 22h14" }],
      ],
      truck: [
        ["path", { d: "M10 17h4V5a1 1 0 0 0-1-1H3v13h2" }],
        ["path", { d: "M14 9h4l3 3v5h-3" }],
        ["circle", { cx: "7.5", cy: "17.5", r: "2.5" }],
        ["circle", { cx: "17.5", cy: "17.5", r: "2.5" }],
      ],
      gauge: [
        ["path", { d: "M12 14 16 10" }],
        ["path", { d: "M3.34 19a10 10 0 1 1 17.32 0" }],
        ["path", { d: "M12 14v.01" }],
      ],
      value: [
        ["path", { d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" }],
        ["path", { d: "M12 2v20" }],
      ],
      savings: [
        ["path", { d: "m22 7-8.5 8.5-5-5L2 17" }],
        ["path", { d: "M16 7h6v6" }],
      ],
      up: [
        ["path", { d: "m22 7-8.5 8.5-5-5L2 17" }],
        ["path", { d: "M16 7h6v6" }],
      ],
      down: [
        ["path", { d: "m22 17-8.5-8.5-5 5L2 7" }],
        ["path", { d: "M16 17h6v-6" }],
      ],
    };
    shapes[name].forEach(([tag, attributes]) => {
      const shape = document.createElementNS(namespace, tag);
      Object.entries(attributes).forEach(([key, value]) => shape.setAttribute(key, value));
      icon.append(shape);
    });
    return icon;
  };

  const buildPeriodValue = (label, value, detail, tone) => {
    const panel = document.createElement("div");
    panel.className = "min-w-0 rounded-lg border border-slate-200 bg-white p-3";
    const caption = document.createElement("p");
    caption.className = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
    caption.textContent = label;
    const amount = document.createElement("p");
    amount.className = `mt-1 truncate font-code text-sm font-bold ${tone}`;
    amount.textContent = value;
    const note = document.createElement("p");
    note.className = "mt-1 min-h-8 text-[11px] leading-4 text-slate-500";
    if (typeof detail === "string") {
      const economyDetail = detail.match(/^(.*Economia)(\s+(?:-)?R\$\s.*)$/);
      if (economyDetail) {
        note.append(document.createTextNode(economyDetail[1]));
        const savings = document.createElement("span");
        savings.className = "whitespace-nowrap";
        savings.textContent = economyDetail[2];
        note.append(savings);
      } else {
        note.textContent = detail;
      }
    } else {
      note.append(document.createTextNode(detail.prefix));
      const savings = document.createElement("span");
      savings.className = "whitespace-nowrap";
      savings.textContent = ` ${detail.savings}`;
      note.append(savings);
    }
    panel.append(caption, amount, note);
    return panel;
  };

  const scoreTone = (value) => {
    if (value >= 90) return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (value < 60) return "border-rose-200 bg-rose-50 text-rose-700";
    if (value < 70) return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
  };

  const renderRanking = (selector, references, olderRecords, type, olderCeiling, newerCeiling, olderName, newerName) => {
    const grid = document.querySelector(`[data-comparison-ranking="${selector}"]`);
    grid.replaceChildren();
    references.forEach((record, index) => {
      const previous = findPreviousRecord(record, olderRecords);
      const isFuel = type === "fuel";
      const currentValue = isFuel ? record.real : record.score * 100 / newerCeiling;
      const previousValue = previous
        ? isFuel ? previous.real : previous.score * 100 / olderCeiling
        : null;
      const difference = Number.isFinite(currentValue) && Number.isFinite(previousValue)
        ? currentValue - previousValue
        : null;
      const sectionTone = selector === "best-fuel" ? "emerald" : selector === "worst-fuel" ? "rose" : null;
      const currentScore = !isFuel ? currentValue : null;
      const tone = isFuel
        ? sectionTone
        : currentScore >= 90 ? "emerald" : currentScore < 60 ? "rose" : currentScore < 70 ? "amber" : "slate";
      const toneClasses = {
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        rose: "border-rose-200 bg-rose-50 text-rose-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
        slate: "border-slate-200 bg-slate-50 text-slate-700",
      }[tone];
      const isImproving = difference != null && difference > 0;
      const card = document.createElement("article");
      card.className = "min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md";
      const driver = document.createElement("div");
      driver.className = "flex min-w-0 items-start gap-2";
      const rank = document.createElement("span");
      rank.className = `flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${toneClasses}`;
      rank.textContent = String(index + 1);
      const identity = document.createElement("div");
      identity.className = "min-w-0 flex-1";
      const name = document.createElement("span");
      name.className = "block break-words text-sm font-semibold text-slate-900";
      name.textContent = text(record.driver || "Motorista sem nome");
      const vehicle = document.createElement("span");
      vehicle.className = "mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500";
      vehicle.append(iconFor("truck", "h-3.5 w-3.5 shrink-0"));
      const vehicleLabel = document.createElement("span");
      vehicleLabel.textContent = `${text(record.plate || "Sem placa")}${getVehicleType(record) ? ` • ${getVehicleType(record)}` : ""}`;
      vehicle.append(vehicleLabel);
      identity.append(name, vehicle);
      const categoryIcon = document.createElement("span");
      categoryIcon.className = `mt-0.5 shrink-0 ${tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "text-slate-500"}`;
      categoryIcon.append(iconFor(isFuel ? "fuel" : "gauge", "h-4 w-4"));
      driver.append(rank, identity, categoryIcon);

      const metricGrid = document.createElement("div");
      metricGrid.className = "mt-3 grid grid-cols-2 gap-2";
      const periodDetail = (entry) => {
        if (!entry) return "Sem registro no mês anterior";
        if (isFuel && entry.real == null) return "Sem média válida";
        if (!isFuel && !Number.isFinite(entry.score)) return "Sem nota válida";
        if (isFuel) {
          return `Desvio ${displayNumber(entry.deviation, 1, "%")} • Economia ${currencyFormat(entry.savingsMoney)}`;
        }
        return "Pontuação normalizada de 0 a 100";
      };
      const formatMetric = (entry, ceiling) => {
        if (!entry) return "—";
        if (isFuel) return Number.isFinite(entry.real) ? displayNumber(entry.real, entry.truckpagPdf ? 3 : 2, " km/l") : "—";
        return Number.isFinite(entry.score) ? displayNumber(entry.score * 100 / ceiling, 1, " / 100") : "—";
      };
      const metricTone = (entry, ceiling) => {
        if (!entry || !Number.isFinite(isFuel ? entry.real : entry.score)) return "text-slate-400";
        return isFuel ? "text-slate-800" : scoreTone(entry.score * 100 / ceiling).split(" ").at(-1);
      };
      metricGrid.append(
        buildPeriodValue(
          `Mês anterior · ${olderName}`,
          formatMetric(previous, olderCeiling),
          periodDetail(previous),
          metricTone(previous, olderCeiling),
        ),
        buildPeriodValue(
          `Referência · ${newerName}`,
          formatMetric(record, newerCeiling),
          periodDetail(record),
          metricTone(record, newerCeiling),
        ),
      );

      const footer = document.createElement("div");
      footer.className = "mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2";
      const variationLabel = document.createElement("span");
      variationLabel.className = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
      variationLabel.textContent = "Variação";
      const variation = document.createElement("span");
      if (difference == null) {
        variation.className = "rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500";
        variation.textContent = "Sem comparação";
      } else {
        variation.className = `inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${
          isImproving ? "border-emerald-200 bg-emerald-50 text-emerald-700" : difference < 0
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`;
        if (difference !== 0) variation.append(iconFor(isImproving ? "up" : "down", "h-3.5 w-3.5"));
        variation.append(document.createTextNode(
          difference === 0 ? "Sem variação" : signedNumber(difference, isFuel ? 2 : 1, isFuel ? " km/l" : " pts"),
        ));
      }
      footer.append(variationLabel, variation);
      card.append(driver, metricGrid, footer);
      grid.append(card);
    });
    if (!references.length) {
      const empty = document.createElement("p");
      empty.className = "col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500";
      empty.textContent = "Sem dados suficientes neste histórico.";
      grid.append(empty);
    }
  };

  const scoreDistribution = (records) => {
    const ceiling = scoreCeiling(records);
    const byDriver = new Map();
    records.filter((record) => Number.isFinite(record.score)).forEach((record) => {
      const key = normalizedName(record.driver) || normalizedId(record.driverId);
      const score = record.score * 100 / ceiling;
      if (!key || score < 0 || score > 100) return;
      const scores = byDriver.get(key) || [];
      scores.push(score);
      byDriver.set(key, scores);
    });
    const driverScores = [...byDriver.values()].map((scores) =>
      scores.reduce((sum, score) => sum + score, 0) / scores.length);
    const bands = [
      { label: "90–100", minimum: 90, maximum: 100 },
      { label: "80–89", minimum: 80, maximum: 90 },
      { label: "70–79", minimum: 70, maximum: 80 },
      { label: "60–69", minimum: 60, maximum: 70 },
      { label: "00–59", minimum: 0, maximum: 60 },
    ];
    return {
      ceiling,
      total: driverScores.length,
      bands: bands.map((band, index) => {
        const count = driverScores.filter((score) =>
          score >= band.minimum && (index === 0 ? score <= band.maximum : score < band.maximum)).length;
        return { ...band, count, percentage: driverScores.length ? count / driverScores.length * 100 : null };
      }),
    };
  };

  const distributionCell = (band, percentage, fillClass, periodName) => {
    const cell = document.createElement("td");
    cell.className = "px-4 py-3 align-top";
    const summary = document.createElement("div");
    summary.className = "flex items-baseline justify-between gap-2";
    const count = document.createElement("span");
    count.className = "font-semibold text-slate-800";
    count.textContent = `${band.count} motoristas`;
    const percent = document.createElement("span");
    percent.className = "font-code text-xs text-slate-600";
    percent.textContent = percentage == null ? "—" : `${numberFormat(percentage, 1)}%`;
    summary.append(count, percent);
    const track = document.createElement("div");
    track.className = "mt-2 h-2 overflow-hidden rounded-full bg-slate-100";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${periodName}, notas ${band.label}`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(percentage ?? 0));
    const fill = document.createElement("div");
    fill.className = `h-full rounded-full transition-all ${fillClass}`;
    fill.style.width = `${Math.max(0, Math.min(100, percentage ?? 0))}%`;
    track.append(fill);
    cell.append(summary, track);
    return cell;
  };

  const renderScoreBands = (older, newer, olderRecords, newerRecords) => {
    const olderDistribution = scoreDistribution(olderRecords);
    const newerDistribution = scoreDistribution(newerRecords);
    document.getElementById("score-left-heading").textContent = `${older.name} (${olderDistribution.total})`;
    document.getElementById("score-right-heading").textContent = `${newer.name} (${newerDistribution.total})`;
    scoreBandBody.replaceChildren();
    olderDistribution.bands.forEach((band, index) => {
      const newerBand = newerDistribution.bands[index];
      const row = document.createElement("tr");
      const tone = index === 0
        ? { badge: "border-emerald-200 bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" }
        : index === 4
          ? { badge: "border-rose-200 bg-rose-50 text-rose-700", bar: "bg-rose-500" }
          : index === 3
            ? { badge: "border-amber-200 bg-amber-50 text-amber-700", bar: "bg-amber-500" }
            : { badge: "border-slate-200 bg-slate-50 text-slate-700", bar: "bg-slate-500" };
      const bandCell = document.createElement("td");
      bandCell.className = "px-4 py-3";
      const badge = document.createElement("span");
      badge.className = `inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.badge}`;
      badge.textContent = `Notas ${band.label}`;
      bandCell.append(badge);
      const countVariation = newerBand.count - band.count;
      const percentageVariation = band.percentage == null || newerBand.percentage == null
        ? null
        : newerBand.percentage - band.percentage;
      const variationCell = document.createElement("td");
      variationCell.className = "px-4 py-3";
      const variation = document.createElement("span");
      const countImproved = index === 0 ? countVariation > 0 : index === 4 ? countVariation < 0 : false;
      variation.className = `inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        countImproved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : countVariation === 0
          ? "border-slate-200 bg-slate-50 text-slate-600"
          : index === 0 || index === 4 ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`;
      variation.textContent = signedNumber(countVariation, 0, " motoristas");
      variationCell.append(variation);
      const percentageCell = document.createElement("td");
      percentageCell.className = "px-4 py-3 font-code text-xs text-slate-600";
      percentageCell.textContent = percentageVariation == null ? "—" : signedNumber(percentageVariation, 1, " p.p.");
      row.append(
        bandCell,
        distributionCell(band, band.percentage, tone.bar, older.name),
        distributionCell(newerBand, newerBand.percentage, tone.bar, newer.name),
        variationCell,
        percentageCell,
      );
      scoreBandBody.append(row);
    });
  };

  const compare = () => {
    const first = historyRecords.find((record) => record.id === firstSelect.value);
    const second = historyRecords.find((record) => record.id === secondSelect.value);
    if (!first || !second) {
      results.hidden = true;
      setStatus("Selecione dois históricos para iniciar a comparação.", true);
      return;
    }
    if (first.id === second.id) {
      results.hidden = true;
      setStatus("Selecione dois históricos diferentes.", true);
      return;
    }

    try {
      const [older, newer] = recordOrder(first, second) <= 0 ? [first, second] : [second, first];
      const olderRecords = mergeData(older.data)
        .filter((record) => !excludedComparisonDrivers.has(normalizedName(record.driver)));
      const newerRecords = mergeData(newer.data)
        .filter((record) => !excludedComparisonDrivers.has(normalizedName(record.driver)));
      const olderCeiling = scoreCeiling(olderRecords);
      const newerCeiling = scoreCeiling(newerRecords);
      renderSummary(older, newer, olderRecords, newerRecords);
      renderDriverDetails(older, newer, olderRecords, newerRecords);
      const chartMetrics = (records) => Object.fromEntries(
        summaryFor(records).map((metric) => [metric.key, metric.comparisonValue]),
      );
      const allPeriods = historyRecords.map((record) => ({
        name: record.name,
        metrics: chartMetrics(mergeData(record.data)
          .filter((entry) => !excludedComparisonDrivers.has(normalizedName(entry.driver)))),
      }));
      window.renderComparisonCharts({
        previousName: older.name,
        currentName: newer.name,
        previous: chartMetrics(olderRecords),
        current: chartMetrics(newerRecords),
        allPeriods,
      });

      const fuelRanks = (records) => records.filter((record) =>
        record.factory > 0 && record.real != null && record.deviation != null);
      const validFuel = fuelRanks(newerRecords);
      const bestFuel = validFuel.filter((record) => record.real > record.factory)
        .sort((a, b) => (b.real / b.factory) - (a.real / a.factory)).slice(0, 10);
      const worstFuel = validFuel.filter((record) => record.deviation < 0)
        .sort((a, b) => a.deviation - b.deviation).slice(0, 10);
      const telemetry = newerRecords.filter((record) => Number.isFinite(record.score));
      const bestTelemetry = [...telemetry].sort((a, b) => b.score - a.score).slice(0, 10);
      const worstTelemetry = [...telemetry].sort((a, b) => a.score - b.score).slice(0, 10);

      document.getElementById("ranking-reference-label").textContent =
        `Referência: ${newer.name}. Para cada motorista destes rankings, os valores do período anterior são buscados pelo CPF/matrícula ou nome, priorizando a mesma placa.`;
      renderRanking("best-fuel", bestFuel, olderRecords, "fuel", olderCeiling, newerCeiling, older.name, newer.name);
      renderRanking("worst-fuel", worstFuel, olderRecords, "fuel", olderCeiling, newerCeiling, older.name, newer.name);
      renderRanking("best-telemetry", bestTelemetry, olderRecords, "telemetry", olderCeiling, newerCeiling, older.name, newer.name);
      renderRanking("worst-telemetry", worstTelemetry, olderRecords, "telemetry", olderCeiling, newerCeiling, older.name, newer.name);
      renderScoreBands(older, newer, olderRecords, newerRecords);
      results.hidden = false;
      setStatus("");
    } catch (error) {
      results.hidden = true;
      setStatus(error instanceof Error ? `Não foi possível comparar os históricos: ${error.message}` : "Não foi possível comparar os históricos.", true);
    }
  };

  compareButton.addEventListener("click", compare);
  [firstSelect, secondSelect].forEach((select) => select.addEventListener("change", () => {
    results.hidden = true;
    setStatus("");
  }));
  window.addEventListener("storage", (event) => {
    if (event.key === HISTORY_STORAGE_KEY) fillSelectors();
  });
  window.addEventListener("libardo-storage-status", (event) => {
    if (!event.detail.isError) return;
    sharedStorageError = event.detail.message;
    setStatus(sharedStorageError, true);
  });
  fillSelectors();
  if (sharedStorageError) setStatus(sharedStorageError, true);
})();
