from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path
from typing import Iterable, Sequence

import pdfplumber


FIELD_ALIASES = {
    "client": ("cliente",),
    "driver": ("motorista", "condutor"),
    "plate": ("placa",),
    "vehicle": ("descricao",),
    "liters": ("litragem", "litros", "volume"),
    "total": ("valortotal",),
    "km": ("kmsrodados", "kmsrodado", "quilometragem"),
    "factory": ("mediafab", "mediafabrica"),
    "real": ("mediareal",),
    "savings_liters": ("economial", "economiaemlitros"),
    "savings_money": ("economiar", "economiaemreais"),
    "transactions": ("ntransacoes", "transacoes"),
}
PLATE_PATTERN = re.compile(r"^[A-Z]{3}[- ]?\d[A-Z0-9]\d{2}$", re.IGNORECASE)
EXCLUDED_PLATES = frozenset(
    {"SFI4F04", "SXV3D91", "FZJ3C73", "RAH0I63", "QJW8426", "TPN2E04", "EMP0000"}
)


def normalize_header(value: object) -> str:
    decomposed = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(character for character in decomposed if character.isalnum()).casefold()


def clean_cell(value: object) -> str:
    return " ".join(str(value or "").split())


def parse_brazilian_number(value: object, field: str) -> float | int | None:
    text = clean_cell(value)
    if not text:
        return None

    negative = text.startswith("(") and text.endswith(")")
    text = re.sub(r"[^0-9,.\-]", "", text)
    if not text:
        return None

    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    elif field in {"km", "transactions", "total", "savings_money", "savings_liters", "liters"}:
        if re.fullmatch(r"-?\d{1,3}(?:\.\d{3})+", text):
            text = text.replace(".", "")

    number = float(text)
    if negative:
        number = -abs(number)
    if field in {"km", "transactions"} and number.is_integer():
        return int(number)
    return number


def find_columns(header_row: Sequence[object]) -> dict[str, int]:
    normalized = [normalize_header(cell) for cell in header_row]
    columns: dict[str, int] = {}

    def match_fields(value: str, index: int) -> None:
        for field, aliases in FIELD_ALIASES.items():
            if field in columns:
                continue
            if any(
                value == alias or (len(alias) >= 5 and value.startswith(alias))
                for alias in aliases
            ):
                columns[field] = index

    for index, cell in enumerate(normalized):
        if cell:
            match_fields(cell, index)

    for start, cell in enumerate(normalized):
        if not cell:
            continue
        combined = cell
        for end in range(start + 1, min(len(normalized), start + 3)):
            if not normalized[end]:
                break
            combined += normalized[end]
            match_fields(combined, start)

    return columns


def _value(row: Sequence[object], columns: dict[str, int], field: str) -> str:
    index = columns.get(field)
    return clean_cell(row[index]) if index is not None and index < len(row) else ""


def parse_report_tables(
    pages: Iterable[Iterable[Sequence[object]]],
) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    current_driver = ""
    current_client = ""

    for page_tables in pages:
        for table in page_tables:
            columns: dict[str, int] = {}
            mode = ""

            for row in table:
                candidate = find_columns(row)
                if "client" in candidate and "driver" in candidate:
                    columns = candidate
                    mode = "driver"
                    continue
                if (
                    "plate" in candidate
                    and {"liters", "total", "km", "factory", "real"}.issubset(candidate)
                ):
                    columns = candidate
                    mode = "vehicle"
                    continue

                if mode == "driver":
                    driver = _value(row, columns, "driver")
                    client = _value(row, columns, "client")
                    if driver:
                        current_driver = driver
                    if client:
                        current_client = client
                    continue

                if mode != "vehicle":
                    continue

                plate = _value(row, columns, "plate")
                if not PLATE_PATTERN.fullmatch(plate):
                    continue
                normalized_plate = re.sub(r"[- ]", "", plate).upper()
                if normalized_plate in EXCLUDED_PLATES:
                    continue
                if not current_driver:
                    raise ValueError(f"A placa {plate} não pôde ser vinculada a um motorista.")

                record: dict[str, object] = {
                    "plate": normalized_plate,
                    "driver": current_driver,
                    "driverId": "",
                    "vehicle": _value(row, columns, "vehicle"),
                    "liters": parse_brazilian_number(_value(row, columns, "liters"), "liters"),
                    "total": parse_brazilian_number(_value(row, columns, "total"), "total"),
                    "km": parse_brazilian_number(_value(row, columns, "km"), "km"),
                    "factory": parse_brazilian_number(_value(row, columns, "factory"), "factory"),
                    "real": parse_brazilian_number(_value(row, columns, "real"), "real"),
                    "truckpagSavingsLiters": parse_brazilian_number(
                        _value(row, columns, "savings_liters"), "savings_liters"
                    ),
                    "truckpagSavingsMoney": parse_brazilian_number(
                        _value(row, columns, "savings_money"), "savings_money"
                    ),
                    "transactions": parse_brazilian_number(
                        _value(row, columns, "transactions"), "transactions"
                    ),
                    "client": current_client,
                    "truckpagPdf": True,
                }
                records.append(record)

    if not records:
        raise ValueError(
            "Nenhuma linha de veículo foi encontrada. Confira se o PDF contém as colunas "
            "Placa, Litragem, Valor Total, KMs Rodados, Média Fab. e Média Real."
        )
    return records


def extract_truckpag_pdf(pdf_path: Path) -> list[dict[str, object]]:
    with pdfplumber.open(pdf_path) as pdf:
        pages = [page.extract_tables() or [] for page in pdf.pages]
    return parse_report_tables(pages)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extrai os dados do relatório Médio por Motorista Truckpag para JSON do painel."
    )
    parser.add_argument("pdf", type=Path, help="Caminho do relatório PDF da Truckpag.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Arquivo JSON de saída (padrão: mesmo nome do PDF com extensão .json).",
    )
    args = parser.parse_args()

    if not args.pdf.is_file():
        parser.error(f"Arquivo PDF não encontrado: {args.pdf}")

    records = extract_truckpag_pdf(args.pdf)
    output = args.output or args.pdf.with_suffix(".json")
    payload = {"format": "truckpag-pdf", "records": records}
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(records)} veículos exportados para {output}")


if __name__ == "__main__":
    main()
