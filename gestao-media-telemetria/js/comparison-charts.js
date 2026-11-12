import * as React from "react";
import { createRoot } from "react-dom/client";
import Chart from "chart.js/auto";

(() => {
  const { createElement: h, useEffect, useRef } = React;
  const root = createRoot(document.getElementById("comparison-charts-root"));
  const colors = ["#64748b", "#0f766e", "#2563eb", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

  const numberFormat = (value, digits = 2) => new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

  const moneyFormat = (value) => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

  const formatMetric = (metric, value) => {
    if (!Number.isFinite(value)) return "—";
    if (metric.currency) return `${moneyFormat(value)}${metric.unitSuffix ? ` ${metric.unitSuffix}` : ""}`;
    return `${numberFormat(value, metric.digits)}${metric.unit ? ` ${metric.unit}` : ""}`;
  };

  const deltaLabel = (metric, previous, current) => {
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return "Sem comparação";
    const difference = current - previous;
    const value = formatMetric(metric, Math.abs(difference));
    const signedValue = difference > 0 ? `+${value}` : difference < 0 ? `-${value}` : value;
    const percent = previous === 0 ? null : difference / Math.abs(previous) * 100;
    const percentLabel = percent == null ? "" : ` (${percent > 0 ? "+" : ""}${numberFormat(percent, 1)}%)`;
    return `${signedValue}${percentLabel}`;
  };

  const chartCard = (metric, canvasRef) => h("article", {
    key: metric.key,
    className: "flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
  },
  h("div", { className: "mb-3" },
    h("h4", { className: "font-semibold text-slate-800" }, metric.label),
    h("p", { className: "mt-1 text-xs text-slate-500" }, metric.unitLabel)),
  h("div", { className: "relative h-64 min-w-0" },
    h("canvas", { ref: canvasRef, role: "img", "aria-label": `Comparativo de ${metric.label} entre os meses selecionados` })));

  const ComparisonCharts = ({ comparison }) => {
    const [showAllPeriods, setShowAllPeriods] = React.useState(false);
    const refs = {
      average: useRef(null),
      cost: useRef(null),
      km: useRef(null),
      liters: useRef(null),
    };

    useEffect(() => {
      if (!comparison) return undefined;
      const definitions = [
        { key: "average", label: "Média real total", unitLabel: "km/l", unit: "km/l", digits: 2 },
        { key: "cost", label: "Custo total do KM rodado", unitLabel: "Reais por quilômetro", currency: true, unitSuffix: "/ km", digits: 2 },
        { key: "km", label: "KM rodado total", unitLabel: "quilômetros", unit: "km", digits: 0 },
        { key: "liters", label: "Litragem total", unitLabel: "litros", unit: "L", digits: 2 },
      ];
      const charts = definitions.map((metric) => {
        const canvas = refs[metric.key].current;
        const previous = comparison.previous[metric.key];
        const current = comparison.current[metric.key];
        const periods = showAllPeriods
          ? comparison.allPeriods.filter((period) => Number.isFinite(period.metrics[metric.key]))
          : null;
        if (!canvas || (!periods && (!Number.isFinite(previous) || !Number.isFinite(current)))) return null;
        const datasets = periods
          ? periods.map((period, index) => ({
            label: period.name,
            data: [period.metrics[metric.key]],
            backgroundColor: colors[index % colors.length],
            borderColor: colors[index % colors.length],
            borderRadius: 6,
            maxBarThickness: 54,
          }))
          : [
            {
              label: comparison.previousName,
              data: [previous],
              backgroundColor: colors[0],
              borderColor: colors[0],
              borderRadius: 6,
              maxBarThickness: 54,
            },
            {
              label: comparison.currentName,
              data: [current],
              backgroundColor: colors[1],
              borderColor: colors[1],
              borderRadius: 6,
              maxBarThickness: 54,
            },
          ];
        return new Chart(canvas, {
          type: "bar",
          data: {
            labels: [metric.label],
            datasets,
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: metric.key === "km" || metric.key === "liters" ? "y" : "x",
            interaction: { intersect: false, mode: "index" },
            plugins: {
              legend: {
                position: "bottom",
                labels: { usePointStyle: true, pointStyle: "rectRounded", padding: 18 },
              },
              tooltip: {
                callbacks: {
                  label: (context) => `${context.dataset.label}: ${formatMetric(metric, context.parsed[metric.key === "km" || metric.key === "liters" ? "x" : "y"])}`,
                  afterBody: (items) => {
                    if (showAllPeriods) {
                      const periodIndex = items[0]?.datasetIndex ?? 0;
                      if (periodIndex === 0) return "Sem mês anterior para comparar";
                      const prior = periods[periodIndex - 1].metrics[metric.key];
                      const value = periods[periodIndex].metrics[metric.key];
                      const difference = value - prior;
                      const arrow = difference > 0 ? "↑" : difference < 0 ? "↓" : "→";
                      return `Variação vs. ${periods[periodIndex - 1].name}: ${arrow} ${deltaLabel(metric, prior, value)}`;
                    }
                    const difference = current - previous;
                    const arrow = difference > 0 ? "↑" : difference < 0 ? "↓" : "→";
                    return `Variação: ${arrow} ${deltaLabel(metric, previous, current)}`;
                  },
                },
              },
            },
            scales: {
              [metric.key === "km" || metric.key === "liters" ? "x" : "y"]: {
                beginAtZero: true,
                grid: { color: "#e2e8f0" },
                ticks: {
                  callback: (value) => numberFormat(Number(value), metric.digits),
                },
              },
              [metric.key === "km" || metric.key === "liters" ? "y" : "x"]: {
                grid: { display: false },
              },
            },
          },
        });
      });
      return () => charts.forEach((chart) => chart?.destroy());
    }, [comparison, showAllPeriods]);

    if (!comparison) {
      return h("div", { className: "rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center" },
        h("p", { className: "font-semibold text-slate-700" }, "Selecione dois históricos e clique em Comparar."),
        h("p", { className: "mt-1 text-sm text-slate-500" }, "Os indicadores e gráficos serão atualizados com os dados dos meses selecionados."));
    }

    const kpis = [
      { key: "diesel", label: "Diesel médio frota", unitSuffix: "/ L", currency: true, digits: 2, lowerIsBetter: true },
      { key: "average", label: "Média real total", unit: "km/l", digits: 2 },
      { key: "cost", label: "Custo total do KM rodado", unitSuffix: "/ km", currency: true, digits: 2, lowerIsBetter: true },
      { key: "value", label: "Valor total", currency: true, digits: 2 },
    ];

    const viewButton = (label, selected, onClick) => h("button", {
      type: "button",
      "aria-pressed": selected,
      onClick,
      className: `rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
        selected ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
      }`,
    }, label);

    return h("div", { className: "flex flex-col gap-6" },
      h("div", { className: "flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between" },
        h("div", null,
          h("p", { className: "text-sm font-semibold text-slate-800" }, "Períodos dos gráficos"),
          h("p", { className: "mt-1 text-xs text-slate-500" }, "Escolha entre a comparação atual ou todos os históricos salvos.")),
        h("div", { className: "inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" },
          viewButton("Períodos selecionados", !showAllPeriods, () => setShowAllPeriods(false)),
          viewButton(`Todos os meses (${comparison.allPeriods.length})`, showAllPeriods, () => setShowAllPeriods(true)))),
      h("section", { "aria-label": "Indicadores chave", className: "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" },
        ...kpis.map((metric) => {
          const previous = comparison.previous[metric.key];
          const current = comparison.current[metric.key];
          const difference = Number.isFinite(previous) && Number.isFinite(current) ? current - previous : null;
          const improved = difference != null && (metric.lowerIsBetter ? difference < 0 : difference > 0);
          const color = difference == null || difference === 0
            ? "text-slate-500"
            : improved ? "text-emerald-700" : "text-rose-700";
          return h("article", {
            key: metric.key,
            className: "flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
          },
          h("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500" }, metric.label),
          h("p", { className: "mt-3 font-mono text-2xl font-bold text-slate-900" }, formatMetric(metric, current)),
          h("p", { className: "mt-1 text-xs text-slate-500" }, `${comparison.previousName}: ${formatMetric(metric, previous)} · ${comparison.currentName}: ${formatMetric(metric, current)}`),
          h("p", { className: `mt-3 text-sm font-semibold ${color}` }, deltaLabel(metric, previous, current)));
        })),
      h("section", { className: "flex flex-col gap-3" },
        h("div", null,
          h("h3", { className: "font-headline text-xl font-bold text-slate-900" }, "Eficiência técnica vs. custo unitário"),
          h("p", { className: "mt-1 text-sm text-slate-500" }, showAllPeriods
            ? "Colunas agrupadas por mês, com escala própria para cada indicador."
            : "Colunas agrupadas com escala própria para cada indicador.")),
        h("div", { className: "grid grid-cols-1 gap-4 lg:grid-cols-2" },
            chartCard({ key: "average", label: "Média real total", unitLabel: "Quilômetros por litro", unit: "km/l", digits: 2 }, refs.average),
            chartCard({ key: "cost", label: "Custo total do KM rodado", unitLabel: "Reais por quilômetro", unit: "R$/km", digits: 2 }, refs.cost))),
      h("section", { className: "flex flex-col gap-3" },
        h("div", null,
          h("h3", { className: "font-headline text-xl font-bold text-slate-900" }, "Escala operacional"),
          h("p", { className: "mt-1 text-sm text-slate-500" }, showAllPeriods
            ? "Barras horizontais com os volumes totais de cada mês."
            : "Barras horizontais com os volumes totais em cada período.")),
        h("div", { className: "grid grid-cols-1 gap-4 lg:grid-cols-2" },
            chartCard({ key: "km", label: "KM rodado total", unitLabel: "Quilômetros", unit: "km", digits: 0 }, refs.km),
            chartCard({ key: "liters", label: "Litragem total", unitLabel: "Litros", unit: "L", digits: 2 }, refs.liters))));
  };

  let latestComparison = null;
  root.render(h(ComparisonCharts, { comparison: latestComparison }));
  window.addEventListener("comparison-charts-visible", () => {
    Object.values({
      average: document.querySelector("#comparison-charts-root canvas[aria-label*='Média real total']"),
      cost: document.querySelector("#comparison-charts-root canvas[aria-label*='Custo total do KM rodado']"),
      km: document.querySelector("#comparison-charts-root canvas[aria-label*='KM rodado total']"),
      liters: document.querySelector("#comparison-charts-root canvas[aria-label*='Litragem total']"),
    }).forEach((canvas) => {
      if (canvas) Chart.getChart(canvas)?.resize();
    });
  });
  window.renderComparisonCharts = (comparison) => {
    latestComparison = comparison;
    root.render(h(ComparisonCharts, { comparison }));
  };
})();
