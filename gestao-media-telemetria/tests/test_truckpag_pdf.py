import unittest

from scripts.truckpag_pdf import parse_brazilian_number, parse_report_tables


class TruckpagPdfParserTests(unittest.TestCase):
    def test_brazilian_numbers_are_normalized(self) -> None:
        self.assertEqual(parse_brazilian_number("900,011", "liters"), 900.011)
        self.assertEqual(parse_brazilian_number("R$ 5.951,23", "total"), 5951.23)
        self.assertEqual(parse_brazilian_number("2.072", "km"), 2072)
        self.assertEqual(parse_brazilian_number("2,900", "factory"), 2.9)
        self.assertEqual(parse_brazilian_number("R$ -1.226,71", "savings_money"), -1226.71)

    def test_reordered_headers_and_driver_context_across_pages(self) -> None:
        summary_header = ["Cliente", "Motorista", "Litragem", "Valor Total"]
        summary = ["Transportes Exemplo", "Achel Aslen do Nascimento", "900,011", "R$ 5.951,23"]
        vehicle_header = [
            "Média Real",
            "Placa",
            "Economia (R$)",
            "KMs\nRodados",
            "Litragem",
            "Valor Total",
            "Média Fab.",
            "Economia (l)",
            "Descricao",
            "Nº\nTransações",
        ]
        vehicle = [
            "R$ 2,300",
            "RLN1G68",
            "R$ -1.226,71",
            "2.072",
            "900,011",
            "R$ 5.951,23",
            "2,900",
            "-185,528",
            "SCANIA G 410",
            "2",
        ]

        pages = [
            [[summary_header, summary, vehicle_header, vehicle]],
            [[vehicle_header, vehicle]],
        ]

        records = parse_report_tables(pages)
        self.assertEqual([record["plate"] for record in records], ["RLN1G68", "RLN1G68"])
        self.assertEqual(records[0]["driver"], "Achel Aslen do Nascimento")
        self.assertEqual(records[1]["driver"], "Achel Aslen do Nascimento")
        self.assertEqual(records[0]["vehicle"], "SCANIA G 410")
        self.assertEqual(records[0]["liters"], 900.011)
        self.assertEqual(records[0]["total"], 5951.23)
        self.assertEqual(records[0]["km"], 2072)
        self.assertEqual(records[0]["factory"], 2.9)
        self.assertEqual(records[0]["real"], 2.3)
        self.assertEqual(records[0]["truckpagSavingsLiters"], -185.528)
        self.assertEqual(records[0]["truckpagSavingsMoney"], -1226.71)

    def test_vehicle_without_driver_context_fails_explicitly(self) -> None:
        table = [
            ["Placa", "Descricao", "Litragem", "Valor Total", "KMs Rodados", "Média Fab.", "Média Real"],
            ["RLN1G68", "SCANIA", "900,011", "R$ 5.951,23", "2.072", "2,900", "2,300"],
        ]
        with self.assertRaisesRegex(ValueError, "não pôde ser vinculada"):
            parse_report_tables([[table]])

    def test_excluded_plates_are_omitted_from_consumption_records(self) -> None:
        excluded_plates = ["SFI4F04", "SXV-3D91", "FZJ3C73", "RAH0I63", "QJW8426", "TPN2E04", "EMP0000"]
        table = [
            ["Cliente", "Motorista"],
            ["Transportes Exemplo", "Motorista Teste"],
            ["Placa", "Descricao", "Litragem", "Valor Total", "KMs Rodados", "Média Fab.", "Média Real"],
            *[
                [plate, "CAMINHAO", "100", "R$ 500,00", "1.000", "2,900", "3,000"]
                for plate in excluded_plates
            ],
            ["RLN1G68", "SCANIA", "900,011", "R$ 5.951,23", "2.072", "2,900", "2,300"],
        ]

        records = parse_report_tables([[table]])

        self.assertEqual([record["plate"] for record in records], ["RLN1G68"])


if __name__ == "__main__":
    unittest.main()
