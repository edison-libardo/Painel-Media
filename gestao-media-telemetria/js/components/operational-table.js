(() => {
      const tableBody = document.querySelector("tbody");
      let allRows = Array.from(tableBody.querySelectorAll("tr"));
      const searchInput = document.getElementById("driver-search");
      const vehicleFilter = document.getElementById("vehicle-filter");
      const averageFilter = document.getElementById("average-filter");
      const pageSizeSelect = document.getElementById("page-size");
      const scoreInput = document.getElementById("minimum-score");
      const awardedOnly = document.getElementById("awarded-only");
      const countLabel = document.getElementById("record-count");
      const paginationSummary = document.getElementById("pagination-summary");
      const paginationControls = document.getElementById("pagination-controls");
      const advancedButton = document.getElementById("advanced-filter-button");
      const advancedPanel = document.getElementById("advanced-filters");
      let currentPage = 1;
      const expandedGroups = new Set();
      const realAverageColumnIndex = 7;
      const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const numericValue = (value) => value == null || value === "" || !Number.isFinite(Number(value))
        ? null
        : Number(value);
      const sumValues = (records, field) => {
        const values = records.map((record) => numericValue(record[field])).filter((value) => value != null);
        return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
      };
      const averageValues = (records, field) => {
        const values = records.map((record) => numericValue(record[field])).filter((value) => value != null);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      };
      const formatNumber = (value, digits = 2) => value == null
        ? "-"
        : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
      const formatCurrency = (value) => value == null
        ? "-"
        : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
      const formatPercentage = (value) => value == null ? "-" : `${formatNumber(value * 100, 1)}%`;
      const uniqueValues = (records, field) => [...new Set(records
        .map((record) => String(record[field] ?? "").trim())
        .filter(Boolean))];
      const summarizeRecords = (rows) => {
        const records = rows.map((row) => row._record).filter(Boolean);
        const summary = { ...records[0] };
        const plateCount = new Set(records
          .map((record) => normalize(String(record.plate ?? "").replace(/[-\s]/g, "")))
          .filter(Boolean)).size;
        const totalLiters = sumValues(records, "liters");
        const totalValue = sumValues(records, "total");
        const totalKm = sumValues(records, "km");
        const validFactoryRecords = records.filter((record) =>
          numericValue(record.km) > 0 && numericValue(record.factory) > 0);
        const factoryKm = sumValues(validFactoryRecords, "km");
        const expectedLiters = validFactoryRecords.reduce((sum, record) => sum + record.km / record.factory, 0);

        summary.plate = `${plateCount} ${plateCount === 1 ? "placa" : "placas"}`;
        const vehicleTypes = uniqueValues(records, "vehicleType");
        summary.vehicleType = vehicleTypes.length > 1 ? "Varios tipos" : vehicleTypes[0] ?? null;
        summary.liters = totalLiters;
        summary.total = totalValue;
        summary.km = totalKm;
        summary.factory = expectedLiters > 0 ? factoryKm / expectedLiters : null;
        summary.real = totalLiters > 0 && totalKm != null ? totalKm / totalLiters : null;
        summary.savingsLiters = sumValues(records, "savingsLiters");
        summary.savingsMoney = sumValues(records, "savingsMoney");
        summary.unitPrice = totalLiters > 0 && totalValue != null ? totalValue / totalLiters : null;
        summary.costPerKm = totalKm > 0 && totalValue != null ? totalValue / totalKm : null;
        summary.score = averageValues(records, "score");
        summary.award = sumValues(records, "award");
        ["fxGreen", "fxGreenNote", "embalo", "embaloNote", "parkedOn", "parkedOnNote",
          "aboveGreen", "aboveGreenNote", "speedPeaksNote"].forEach((field) => {
          summary[field] = averageValues(records, field);
        });
        summary.speedPeaks = sumValues(records, "speedPeaks");
        const vehicleGroups = uniqueValues(records, "vehicleGroup");
        summary.vehicleGroup = vehicleGroups.length > 1 ? "Variados" : vehicleGroups[0] ?? null;
        summary.prizeTotal = sumValues(records, "prizeTotal");
        const driverIds = uniqueValues(records, "driverId");
        summary.driverId = driverIds.length > 1 ? "Varios" : records[0].driverId;
        const clients = uniqueValues(records, "client");
        summary.client = clients.length > 1 ? "Varios clientes" : records[0].client;
        return { record: summary, plateCount };
      };
      const summaryValues = (record) => [
        null,
        record.plate,
        record.vehicleType,
        record.liters == null ? "-" : `${formatNumber(record.liters, record.truckpagPdf ? 3 : 2)} L`,
        formatCurrency(record.total),
        record.km == null ? "-" : `${formatNumber(record.km, 0)} km`,
        record.factory == null ? "-" : `${formatNumber(record.factory, record.truckpagPdf ? 3 : 2)} km/l`,
        record.real == null ? "-" : `${formatNumber(record.real, record.truckpagPdf ? 3 : 2)} km/l`,
        record.savingsLiters == null ? "-" : `${record.savingsLiters > 0 ? "+" : ""}${formatNumber(record.savingsLiters, record.truckpagPdf ? 3 : 2)} L`,
        formatCurrency(record.savingsMoney),
        formatCurrency(record.unitPrice),
        record.costPerKm == null ? "-" : `${formatCurrency(record.costPerKm)} / km`,
        formatNumber(record.score, 1),
        formatCurrency(record.award),
        formatPercentage(record.fxGreen),
        formatNumber(record.fxGreenNote, 1),
        formatPercentage(record.embalo),
        formatNumber(record.embaloNote, 1),
        formatPercentage(record.parkedOn),
        formatNumber(record.parkedOnNote, 1),
        formatPercentage(record.aboveGreen),
        formatNumber(record.aboveGreenNote, 1),
        formatNumber(record.speedPeaks, 0),
        formatNumber(record.speedPeaksNote, 1),
        record.vehicleGroup || "-",
        formatCurrency(record.prizeTotal),
      ];
      const createGroupRow = (group) => {
        const { record, plateCount } = summarizeRecords(group.rows);
        const row = group.rows[0].cloneNode(true);
        row.hidden = false;
        row.className = "driver-group-summary bg-slate-100 font-semibold hover:bg-slate-200";
        row.dataset.groupKey = group.key;
        row._groupRecords = group.rows;
        row._record = record;
        ["recordIndex", "fuelIndex", "telemetryIndex"].forEach((key) => { delete row.dataset[key]; });
        Array.from(row.cells).forEach((cell) => {
          ["editableField", "editValue", "editKind"].forEach((key) => { delete cell.dataset[key]; });
          cell.removeAttribute("tabindex");
          cell.removeAttribute("title");
          cell.removeAttribute("aria-label");
        });

        const driverCell = row.cells[0];
        driverCell.replaceChildren();
        const driverWrap = document.createElement("div");
        driverWrap.className = "flex items-center gap-2.5";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.dataset.groupToggle = group.key;
        toggle.setAttribute("aria-expanded", String(expandedGroups.has(group.key)));
        toggle.setAttribute("aria-label", `${expandedGroups.has(group.key) ? "Recolher" : "Expandir"} detalhes de ${plateCount} ${plateCount === 1 ? "placa" : "placas"} de ${group.rows[0].dataset.driver}`);
        toggle.className = "w-7 h-7 shrink-0 rounded border border-slate-300 bg-white text-lg leading-none text-primary hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
        toggle.textContent = expandedGroups.has(group.key) ? "-" : "+";
        const nameWrap = document.createElement("div");
        const name = document.createElement("span");
        name.className = "block leading-snug";
        name.textContent = group.rows[0].dataset.driver;
        const detail = document.createElement("span");
        detail.className = "block text-[11px] font-normal text-slate-500";
        detail.textContent = `${plateCount} ${plateCount === 1 ? "placa" : "placas"} · ${group.rows.length} registros`;
        nameWrap.append(name, detail);
        driverWrap.append(toggle, nameWrap);
        driverCell.append(driverWrap);
        driverCell.dataset.sortValue = group.rows[0].dataset.driver;
        if (record.driverId) {
          const id = document.createElement("span");
          id.className = "block text-[11px] font-normal text-slate-500";
          id.textContent = `CPF/Matrícula: ${record.driverId}`;
          nameWrap.append(id);
        }
        if (record.client) {
          const client = document.createElement("span");
          client.className = "block text-[11px] font-normal text-slate-500";
          client.textContent = `Cliente: ${record.client}`;
          nameWrap.append(client);
        }
        summaryValues(record).slice(1).forEach((value, index) => {
          const cell = row.cells[index + 1];
          cell.textContent = value == null || value === "" ? "-" : String(value);
          if (index + 1 === 7 && record.real != null && record.factory != null) {
            cell.classList.remove("bg-emerald-100/70", "bg-rose-100/70");
            cell.classList.add(record.real >= record.factory ? "bg-emerald-100/70" : "bg-rose-100/70");
          }
          if ([8, 9].includes(index + 1)) {
            const rawValue = index + 1 === 8 ? record.savingsLiters : record.savingsMoney;
            cell.classList.remove("bg-emerald-100/70", "bg-rose-100/70");
            if (rawValue != null && rawValue !== 0) {
              cell.classList.add(rawValue < 0 ? "bg-rose-100/70" : "bg-emerald-100/70");
            }
          }
        });
        return row;
      };
      const numberFromCell = (cell) => {
        const numericText = cell.textContent.replace(/[^\d.,+-]/g, "");
        const match = numericText.match(/^[+-]?\d[\d.,]*$/);
        if (!match) return Number.NaN;
        let value = match[0];
        const comma = value.lastIndexOf(",");
        const dot = value.lastIndexOf(".");
        if (comma >= 0 && dot >= 0) {
          value = comma > dot
            ? value.replace(/\./g, "").replace(",", ".")
            : value.replace(/,/g, "");
        } else if (comma >= 0) {
          value = value.replace(/\./g, "").replace(",", ".");
        } else if (dot >= 0) {
          const dotCount = (value.match(/\./g) || []).length;
          const decimalDigits = value.length - dot - 1;
          if (dotCount > 1 || decimalDigits === 3) value = value.replace(/\./g, "");
        }
        return Number(value);
      };
      const rowCells = (row) => Array.from(row.cells);
      const filterRows = () => {
        const query = normalize(searchInput.value.trim());
        const vehicle = vehicleFilter.value;
        const average = averageFilter.value;
        const minimumScore = scoreInput.value === "" ? Number.NEGATIVE_INFINITY : Number(scoreInput.value.replace(",", "."));
        return allRows.filter((row) => {
          const cells = rowCells(row);
          const matchesQuery = !query || normalize(`${row.dataset.driver} ${cells[1].textContent}`).includes(query);
          const vehicleName = cells[2].textContent.trim();
          const matchesVehicle = !vehicle || vehicleName === vehicle;
          const factoryAverage = numberFromCell(cells[6]);
          const realAverage = numberFromCell(cells[7]);
          const matchesAverage = !average || (average === "acima" ? realAverage > factoryAverage : realAverage < factoryAverage);
          const score = numberFromCell(cells[12]);
          const matchesScore = scoreInput.value === "" || (Number.isFinite(score) && score >= minimumScore);
          const hasAward = numberFromCell(cells[13]) > 0;
          return matchesQuery && matchesVehicle && matchesAverage && matchesScore && (!awardedOnly.checked || hasAward);
        });
      };
      const renderPagination = (pageCount) => {
        paginationControls.replaceChildren();
        const addButton = (label, page, disabled, active) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          button.disabled = disabled;
          button.setAttribute("aria-label", /^\d+$/.test(label) ? `Página ${label}` : label);
          if (active) button.setAttribute("aria-current", "page");
          button.className = active
            ? "px-3 py-1.5 rounded bg-primary text-white font-bold"
            : "px-2.5 py-1.5 rounded border border-light-outline bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40";
          button.addEventListener("click", () => {
            currentPage = page;
            render();
          });
          paginationControls.append(button);
        };
        addButton("Anterior", Math.max(1, currentPage - 1), currentPage === 1, false);
        for (let page = 1; page <= pageCount; page += 1) {
          addButton(String(page), page, false, page === currentPage);
        }
        addButton("Próxima", Math.min(pageCount, currentPage + 1), currentPage === pageCount, false);
      };
      const render = () => {
        const filteredRows = filterRows();
        const groups = new Map();
        filteredRows.forEach((row) => {
          const driverKey = normalize(row.dataset.driver.trim());
          if (!driverKey) return;
          const matches = groups.get(driverKey) || [];
          matches.push(row);
          groups.set(driverKey, matches);
        });
        allRows.forEach((row) => {
          delete row.cells[realAverageColumnIndex].dataset.sortValue;
        });
        groups.forEach((rows) => {
          if (rows.length < 2) return;
          const realAverage = summarizeRecords(rows).record.real;
          const sortValue = realAverage == null ? "-" : String(realAverage);
          rows.forEach((row) => {
            row.cells[realAverageColumnIndex].dataset.sortValue = sortValue;
          });
        });
        const displayRows = [];
        const handledGroups = new Set();
        filteredRows.forEach((row) => {
          const driverKey = normalize(row.dataset.driver.trim());
          const matches = driverKey ? groups.get(driverKey) : null;
          if (matches && matches.length > 1) {
            if (!handledGroups.has(driverKey)) {
              handledGroups.add(driverKey);
              displayRows.push({ key: driverKey, rows: matches });
            }
          } else {
            displayRows.push(row);
          }
        });
        const pageSize = Number(pageSizeSelect.value);
        const pageCount = Math.max(1, Math.ceil(displayRows.length / pageSize));
        currentPage = Math.min(currentPage, pageCount);
        const start = (currentPage - 1) * pageSize;
        const visibleRows = displayRows.slice(start, start + pageSize);
        tableBody.querySelectorAll("tr.driver-group-detail").forEach((row) => {
          row.classList.remove("driver-group-detail");
          delete row.dataset.groupDetail;
        });
        const pageFragment = document.createDocumentFragment();
        visibleRows.forEach((item) => {
          if (Array.isArray(item.rows)) {
            pageFragment.append(createGroupRow(item));
            if (expandedGroups.has(item.key)) {
              item.rows.forEach((row) => {
                row.hidden = false;
                row.classList.add("driver-group-detail");
                row.dataset.groupDetail = item.key;
                pageFragment.append(row);
              });
            }
          } else {
            item.hidden = false;
            pageFragment.append(item);
          }
        });
        tableBody.replaceChildren(pageFragment);
        countLabel.textContent = `Exibindo ${displayRows.length ? start + 1 : 0}-${Math.min(start + pageSize, displayRows.length)} de ${displayRows.length} ${displayRows.length === 1 ? "linha" : "linhas"} (${filteredRows.length} ${filteredRows.length === 1 ? "registro" : "registros"})`;
        paginationSummary.innerHTML = `Página <strong class="text-primary font-bold">${currentPage}</strong> de <strong class="text-primary font-bold">${pageCount}</strong> (${displayRows.length} ${displayRows.length === 1 ? "linha" : "linhas"} · ${filteredRows.length} de ${allRows.length} registros)`;
        renderPagination(pageCount);
        window.dispatchEvent(new CustomEvent("libardo-table-filtered", {
          detail: {
            recordIndices: filteredRows.map((row) => Number(row.dataset.recordIndex)),
          },
        }));
      };

      tableBody.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-group-toggle]");
        if (!toggle) return;
        const { groupToggle: key } = toggle.dataset;
        if (expandedGroups.has(key)) expandedGroups.delete(key);
        else expandedGroups.add(key);
        render();
      });

      [searchInput, vehicleFilter, averageFilter, pageSizeSelect, scoreInput, awardedOnly].forEach((control) => {
        control.addEventListener("input", () => { currentPage = 1; render(); });
        control.addEventListener("change", () => { currentPage = 1; render(); });
      });
      window.addEventListener("libardo-data-updated", () => {
        allRows = Array.from(tableBody.querySelectorAll("tr"));
        expandedGroups.clear();
        currentPage = 1;
        render();
      });
      advancedButton.addEventListener("click", () => {
        advancedPanel.hidden = !advancedPanel.hidden;
        advancedButton.setAttribute("aria-expanded", String(!advancedPanel.hidden));
      });
      document.addEventListener("click", (event) => {
        if (!advancedPanel.hidden && !advancedPanel.parentElement.contains(event.target)) {
          advancedPanel.hidden = true;
          advancedButton.setAttribute("aria-expanded", "false");
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !advancedPanel.hidden) {
          advancedPanel.hidden = true;
          advancedButton.setAttribute("aria-expanded", "false");
          advancedButton.focus();
        }
      });
      document.getElementById("refresh-button").addEventListener("click", () => {
        searchInput.value = "";
        vehicleFilter.value = "";
        averageFilter.value = "";
        scoreInput.value = "";
        awardedOnly.checked = false;
        currentPage = 1;
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
        const time = document.getElementById("updated-at");
        time.dateTime = now.toISOString();
        time.textContent = formatter.format(now);
        render();
      });
      document.getElementById("export-button").addEventListener("click", () => {
        const headers = Array.from(document.querySelectorAll("thead th"), (header) => header.textContent.trim());
        const rows = filterRows().map((row) => rowCells(row).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()));
        const csvCell = (value) => `"${value.replace(/"/g, '""')}"`;
        const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "libardo-amostragem-operacional.csv";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      window.LibardoTableSorting.bind(document.querySelector("main table"), (sortedRows) => {
        allRows = sortedRows;
        currentPage = 1;
        render();
      }, () => allRows);
      render();
    })();