(() => {
      const filterButtons = Array.from(document.querySelectorAll(".ranking-filter"));
      const sections = Array.from(document.querySelectorAll("#ranking-grid > section[data-ranking]"));
      const searchInput = document.getElementById("ranking-search");
      const clearButton = document.getElementById("clear-ranking-search");
      const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      let activeFilter = "all";

      document.querySelectorAll("#ranking-grid table").forEach((table) => {
        window.LibardoTableSorting.bind(table);
      });

      const render = () => {
        const query = normalize(searchInput.value.trim());
        let visibleRows = 0;
        sections.forEach((section) => {
          const categoryMatches = activeFilter === "all" || section.dataset.ranking === activeFilter;
          let sectionRows = 0;
          section.querySelectorAll("tbody tr").forEach((row) => {
            const matches = !query || normalize(row.textContent).includes(query);
            row.hidden = !matches;
            if (matches) sectionRows += 1;
          });
          section.hidden = !categoryMatches || sectionRows === 0;
          visibleRows += !section.hidden ? sectionRows : 0;
        });
        filterButtons.forEach((button) => {
          const active = button.dataset.rankingFilter === activeFilter;
          button.setAttribute("aria-pressed", String(active));
          button.classList.toggle("bg-white", active);
          button.classList.toggle("text-primary", active);
          button.classList.toggle("font-bold", active);
          button.classList.toggle("shadow-sm", active);
          button.classList.toggle("text-light-on-surface-variant", !active);
        });
        let emptyState = document.getElementById("ranking-empty-state");
        if (!emptyState) {
          emptyState = document.createElement("p");
          emptyState.id = "ranking-empty-state";
          emptyState.className = "col-span-full rounded-lg border border-light-outline bg-white p-8 text-center text-sm text-light-on-surface-variant";
          emptyState.setAttribute("role", "status");
          emptyState.textContent = "Nenhum motorista encontrado para os filtros selecionados.";
          document.getElementById("ranking-grid").append(emptyState);
        }
        emptyState.hidden = visibleRows > 0;
      };

      filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
          activeFilter = button.dataset.rankingFilter;
          render();
        });
      });
      searchInput.addEventListener("input", render);
      clearButton.addEventListener("click", () => {
        searchInput.value = "";
        activeFilter = "all";
        render();
        searchInput.focus();
      });
      document.getElementById("print-dashboard").addEventListener("click", () => window.print());
      document.getElementById("export-rankings").addEventListener("click", () => {
        const rows = [["Ranking", "Posição", "Motorista", "Detalhes"]];
        sections.filter((section) => !section.hidden).forEach((section) => {
          const title = section.querySelector("h2").textContent.trim().replace(/\s+/g, " ");
          const headers = Array.from(section.querySelectorAll("thead th"), (cell) => cell.textContent.trim());
          section.querySelectorAll("tbody tr:not([hidden])").forEach((row) => {
            const values = Array.from(row.cells, (cell) => cell.textContent.trim().replace(/\s+/g, " "));
            const details = headers.slice(2).map((header, index) => `${header}: ${values[index + 2]}`).join(" | ");
            rows.push([title, values[0], values[1], details]);
          });
        });
        const csvCell = (value) => `"${value.replace(/"/g, '""')}"`;
        const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "libardo-rankings-telemetria.csv";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      render();
    })();