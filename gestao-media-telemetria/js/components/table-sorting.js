(() => {
  const textFromCell = (cell) => cell.dataset.sortValue ?? cell.textContent.trim();

  const numberFromCell = (cell) => {
    let value = textFromCell(cell).replace(/\u00a0/g, " ").replace(/−/g, "-");
    value = value
      .replace(/^#\s*/, "")
      .replace(/^([+-]?)\s*R\$\s*/i, "$1")
      .replace(/\s*(?:km\/l|\/\s*km|km|l|%)\s*$/i, "")
      .replace(/\s/g, "");
    if (!/^[+-]?\d[\d.,]*$/.test(value)) return null;

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

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const isEmptyValue = (value) => !value || value === "—" || value === "-";
  const isNumericColumn = (rows, index) => {
    const values = rows.map((row) => textFromCell(row.cells[index])).filter((value) => !isEmptyValue(value));
    return values.length > 0 && rows.every((row) => {
      const value = textFromCell(row.cells[index]);
      return isEmptyValue(value) || numberFromCell(row.cells[index]) !== null;
    });
  };

  const sortRows = (rows, index, direction, numeric) => rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const leftCell = left.row.cells[index];
      const rightCell = right.row.cells[index];
      const leftText = textFromCell(leftCell);
      const rightText = textFromCell(rightCell);
      const leftEmpty = isEmptyValue(leftText);
      const rightEmpty = isEmptyValue(rightText);
      if (leftEmpty || rightEmpty) {
        if (leftEmpty && rightEmpty) return left.originalIndex - right.originalIndex;
        return leftEmpty ? 1 : -1;
      }

      const comparison = numeric
        ? numberFromCell(leftCell) - numberFromCell(rightCell)
        : leftText.localeCompare(rightText, "pt-BR", { sensitivity: "base", numeric: true });
      return comparison ? comparison * direction : left.originalIndex - right.originalIndex;
    })
    .map(({ row }) => row);

  const bind = (
    table,
    onSort = (rows) => table.tBodies[0].append(...rows),
    getRows = () => Array.from(table.tBodies[0].rows),
  ) => {
    let sortedColumn = -1;
    let direction = 1;

    Array.from(table.tHead.rows[0].cells).forEach((header, index) => {
      header.tabIndex = 0;
      header.setAttribute("aria-sort", "none");
      header.title = "Clique para ordenar";
      header.classList.add("cursor-pointer", "select-none");

      const sort = () => {
        const rows = getRows();
        const numeric = isNumericColumn(rows, index);
        direction = sortedColumn === index ? -direction : numeric ? -1 : 1;
        sortedColumn = index;
        const sortedRows = sortRows(rows, index, direction, numeric);

        Array.from(table.tHead.rows[0].cells).forEach((cell) => cell.setAttribute("aria-sort", "none"));
        header.setAttribute("aria-sort", direction === 1 ? "ascending" : "descending");
        header.title = numeric
          ? `Ordenar por valor ${direction === 1 ? "crescente" : "decrescente"}`
          : `Ordenar em ordem ${direction === 1 ? "alfabética" : "alfabética inversa"}`;
        onSort(sortedRows);
      };

      header.addEventListener("click", sort);
      header.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          sort();
        }
      });
    });
  };

  window.LibardoTableSorting = { bind };
})();
