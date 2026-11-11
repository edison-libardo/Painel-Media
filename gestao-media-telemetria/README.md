# Gestão Média e Telemetria

Painel web para consolidar indicadores de consumo de combustível e telemetria de frotas. Os arquivos são processados localmente. Os dados ficam no navegador e também em arquivos JSON na pasta `data` compartilhada. Em cada computador, abra o painel pelo atalho `Abrir Painel.bat` localizado nesta mesma pasta de rede; assim, as alterações e os históricos ficam disponíveis para os outros computadores. É necessário ter permissão de gravação nessa pasta.

Na primeira abertura após esta atualização, execute o atalho primeiro no computador que já possui os dados e históricos corretos. Os dados locais não vazios serão copiados para a pasta compartilhada; depois disso, essa pasta passa a ser a fonte usada pelos demais computadores.

As alterações são salvas automaticamente no armazenamento deste navegador. O painel não baixa backups automaticamente; use o botão **Backup** para baixar uma cópia JSON quando desejar, ou **Restaurar** para carregar uma cópia existente. O backup contém os dados processados do painel, não uma cópia dos arquivos de origem.

## Funcionalidades

- A tabela **Detalhes Motorista** mantem o cabecalho visivel enquanto a pagina e rolada.
- Importação de CSV, Excel (`.xlsx`/`.xls`) e relatórios PDF da Truckpag.
- Cruzamento de consumo e telemetria por motorista, matrícula/CPF ou placa.
- Alertas de telemetria detectam notas críticas iguais ou inferiores a 60/100 (ou 6/10 quando a planilha usa escala de 0 a 10) e informam quantos condutores estão nessa faixa.
- A página de rankings apresenta quantidade e percentual de motoristas por faixa de nota: 90–100, 80–89, 70–79, 60–69 e 00–59. As faixas não se sobrepõem, as notas 0–10 são convertidas para 0–100 e o percentual considera motoristas únicos com nota válida.
- Indicadores, rankings de desempenho e amostragem operacional detalhada.
- Na página **Comparativo**, a aba **Detalhes Motorista** compara, pelo nome do motorista, KM rodado, litragem, média real, valor total e economia gerada entre os dois históricos selecionados.
- A aba **Gráficos** do comparativo exibe KPIs e gráficos interativos de eficiência, custo e escala operacional para os períodos selecionados.
- Na aba **Gráficos**, alterne entre os dois períodos comparados e todos os históricos salvos; os tooltips da visão mensal informam a variação em relação ao mês anterior.
- KPIs de KM total, média real total (KM total dividido pela litragem dos registros válidos), litragem total, valor total da coluna de abastecimento e custo médio ponderado por KM rodado.
- Os KPIs de KM rodado total e litragem total incluem todos os motoristas; NILSON ROGERIO RIBEIRO, RAFAEL MARCOS DE SOUZA e LETICIA DA SILVA não são mais excluídos desses totais.
- Busca por motorista/placa e demais filtros atualizam os KPIs conforme os registros filtrados; as colunas das tabelas podem ser ordenadas por valor numérico ou alfabeticamente ao clicar no cabeçalho, além de paginação, exportação CSV e impressão.
- A paginação permite exibir 5, 10, 20 ou 50 registros por página; o seletor não exibe seta decorativa.
- Clique no cabeçalho **Economia (R$)** para alternar maior→menor e menor→maior; valores negativos são ordenados pelo sinal e magnitude monetária.
- Edição direta de placa, tipo de veículo, média real, KM rodado, nota de telemetria e prêmio obtido; alterações são salvas no navegador e recalculam os indicadores.
- Na tabela de amostragem, a célula **Média Real** recebe fundo verde fraco quando é igual ou superior à **Média Fábrica**, e vermelho fraco quando é inferior.
- Nas colunas **Economia (L)** e **Economia (R$)**, valores negativos recebem fundo vermelho fraco e positivos recebem fundo verde fraco; valores zero ou ausentes ficam sem destaque.
- As tabelas Top 10 de telemetria não exibem as colunas **Fx verde** e **Embalo**.
- O indicador de frota conta placas únicas com tipo de veículo informado; placas repetidas são contabilizadas uma única vez.
- Na tabela de amostragem, registros de um mesmo motorista são agrupados automaticamente em uma linha total; use **+** para expandir e consultar os dados de cada placa. Litros, valores, KM, economias e prêmios são somados; médias de consumo são recalculadas pelos totais de KM/litros e os indicadores de telemetria são apresentados como médias das placas. O agrupamento afeta apenas a exibição: os registros importados permanecem separados para edição e filtragem.
- RAFAEL MARCOS DE SOUZA é excluído dos rankings e dos indicadores e classificações do comparativo; seus registros permanecem disponíveis na amostragem e nos históricos.
- Ação de reset para apagar os dados importados do painel.
- Salvamento automático no navegador, sem downloads de backup após alterações; há opção para baixar um backup JSON manualmente ou restaurar um arquivo existente.
- A página **Histórico** permite salvar snapshots mensais locais, renomeá-los, visualizá-los e editar todas as colunas de um snapshot. As alterações são salvas no próprio histórico sem modificar os dados atuais do painel.
- A página **Comparativo** compara dois históricos salvos com cartões de KPI por métrica, mostrando o período de referência, o anterior e a variação absoluta; inclui rankings Top 10 responsivos vinculados aos mesmos motoristas do período anterior e distribuição das cinco faixas de notas de telemetria com barras proporcionais.

## Estrutura

```text
gestao-media-telemetria/
├── assets/
│   ├── images/
│   └── icons/
├── css/
│   ├── variables.css
│   ├── global.css
│   └── dashboard.css
├── js/
│   ├── components/
│   │   ├── operational-table.js
│   │   └── rankings.js
│   ├── services/
│   │   ├── data-service.js
│   │   ├── history-service.js
│   │   └── shared-storage.js
│   ├── file-protocol-guard.js
│   ├── dashboard.js
│   ├── history.js
│   ├── comparison.js
│   └── tailwind-config.js
├── scripts/
│   ├── open_panel.ps1
│   └── truckpag_pdf.py
├── tests/
│   └── test_truckpag_pdf.py
├── data/
├── index.html
├── rankings.html
├── historico.html
├── comparativo.html
├── requirements.txt
├── .gitignore
└── README.md
```

## Executar localmente

Como o painel usa módulos JavaScript, abra-o por um servidor HTTP local, não diretamente via `file://`.

1. Para abrir pelo ícone do Windows, execute `Abrir Painel.bat` na pasta do projeto (ou crie um atalho para esse arquivo). O iniciador funciona também em pastas de rede UNC, não requer Python e fecha a janela do CMD após abrir o painel.
2. Alternativamente, abra esta pasta no VS Code e inicie o **Live Server**; ou, com Python instalado, execute no terminal:

   ```powershell
   py -m http.server 8000
   ```

3. Com o servidor manual, acesse `http://localhost:8000` no navegador. As telas de rankings, histórico e comparativo ficam em `http://localhost:8000/rankings.html`, `http://localhost:8000/historico.html` e `http://localhost:8000/comparativo.html`.

Não abra os arquivos HTML diretamente por `file://`: o navegador bloqueia os módulos JavaScript nesse modo. O arquivo `Abrir Painel.bat` usa PowerShell para iniciar um servidor HTTP local oculto em uma porta disponível e abrir o painel.

Tailwind CSS, fontes, PDF.js e a biblioteca de leitura Excel são carregados de CDNs. É necessária conexão com a internet para carregar esses recursos. Os arquivos importados não são enviados a um servidor; permanecem no navegador utilizado.

## Importação

Na tela de amostragem, use **Import** para selecionar o relatório de consumo e, se disponível, a planilha de telemetria. O relatório Truckpag deve conter texto selecionável; PDFs digitalizados como imagem precisam de OCR antes da importação. O botão **Reset** limpa os dados salvos localmente e restaura os indicadores e tabelas.

Registros das placas `SFI4F04`, `SXV3D91`, `FZJ3C73`, `RAH0I63`, `QJW8426`, `TPN2E04` e `EMP0000` são excluídos da importação Truckpag e da consolidação, mesmo que existam dados correspondentes na telemetria.

Na planilha de premiação/telemetria, motoristas cujo nome contenha `PX` como palavra isolada não recebem valor em **Prêmio obtido**; o campo fica em branco no painel.

Na importação de telemetria, linhas repetidas do mesmo motorista são consolidadas em um único registro. Valores preenchidos, como nota e prêmio obtido, são mantidos mesmo quando outra linha do motorista está vazia, evitando duplicar os dados no painel.

O indicador **Premiação Acumulada** considera os valores brutos da coluna **Valor Prêmio** da planilha, inclusive os de nomes com `PX`; esses valores permanecem ocultos na coluna individual **Valor Prêmio Obtido** para respeitar a regra de exibição.

Critério informado para elegibilidade à bonificação de telemetria: nota igual ou superior a 70 e mais de 1.000 km rodados. Metas de KM por tipo de veículo: Carreta 12.000 km, Bitruck 12.000 km, Truck 8.000 km e Acello 2.000 km.

O cruzamento remove o marcador final `PX` do nome e aceita uma diferença de um caractere somente quando há um único nome candidato. Quando um relatório PDF Truckpag está importado, o KM do PDF prevalece sobre o KM da planilha de premiação; registros sem correspondência no PDF ficam sem KM, e edições de KM são gravadas somente no registro Truckpag. Sem PDF importado, mantém-se o comportamento anterior. Registros de consumo em placas distintas continuam separados, mesmo quando pertencem ao mesmo motorista.

O campo **Tipo Veículo** é lido de **tipo conjunto** na planilha de premiação e exibe somente `ACELLO`, `TRUCK`, `BITRUCK` ou `CARRETA`; valores fora dessas categorias ficam em branco.

### Parser Python para relatórios Truckpag

O parser usa as tabelas do PDF (`pdfplumber`) para localizar cabeçalhos e associar cada linha de placa ao motorista, inclusive quando o bloco do motorista começa em uma página anterior. Para preparar o JSON aceito pelo painel:

```powershell
py -m pip install -r requirements.txt
py scripts\truckpag_pdf.py C:\caminho\relatorio_media.pdf -o data\truckpag.json
```

No painel, importe `data\truckpag.json` como arquivo de **Consumo e Vinculação**. O PDF também pode ser importado diretamente pelo navegador. Para executar os testes do parser:

```powershell
py -m unittest discover -s tests -t .
```

## Firebase and Netlify deployment

The web app uses Firebase Authentication (email/password) and Cloud Firestore. The Firebase web configuration lives in `js/firebase-config.js`; its API key is intended for browser use and is not an administrative credential.

1. Enable Email/Password in Firebase Authentication and create a Firestore database in production mode. Publish `firestore.rules` before inviting users.
2. Create the first user in Firebase Authentication. In Firestore, create `users/{uid}` with `email` and `role: "adm"` so that this first account can access the panel.
3. Create a dedicated Google Cloud service account for the Netlify function. Grant only Firebase Authentication Admin and Cloud Datastore User permissions. Store its JSON key as the Netlify environment variable `FIREBASE_SERVICE_ACCOUNT`; never commit or send the key.
4. Deploy the project root through a private Git repository. The `netlify.toml` blocks direct public access to `/data/*` and the function source directory.
5. Add the deployed Netlify hostname and the custom domain to Firebase Authentication's authorized domains.
6. Sign in as the initial administrator, open **Migrar dados**, and select `data/shared-dashboard.json` and `data/shared-history.json` from the project folder. This replaces the online dashboard and history.

Only administrators can create accounts through **Gerenciar acessos**. Consultants can read dashboard and ranking data, compare periods, and view saved history; Firestore rules deny their writes. Admin writes use a shared Firestore revision lock to reject overlapping edits and refresh the latest shared data when a conflict is detected. Publish the included rules, including access to `sharedMeta/version`, for this protection to work.
