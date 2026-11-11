param(
    [switch]$Server,
    [int]$Port = 52317
)

$ErrorActionPreference = "Stop"
$appDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$rootPrefix = $appDirectory.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$sharedStorageFiles = @{
    dashboard = Join-Path $appDirectory "data\shared-dashboard.json"
    history = Join-Path $appDirectory "data\shared-history.json"
}
$sharedStorageLockPath = Join-Path $appDirectory "data\shared-storage.lock"
$mimeTypes = @{
    ".css" = "text/css; charset=utf-8"
    ".html" = "text/html; charset=utf-8"
    ".ico" = "image/x-icon"
    ".jpg" = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".js" = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".pdf" = "application/pdf"
    ".png" = "image/png"
    ".svg" = "image/svg+xml"
    ".txt" = "text/plain; charset=utf-8"
    ".woff" = "font/woff"
    ".woff2" = "font/woff2"
}

function Invoke-SharedStorageRequest {
    param(
        [string]$Key,
        [string]$Method,
        [string]$RequestBody
    )

    $storagePath = $sharedStorageFiles[$Key]
    if ($Method -eq "GET") {
        if (-not (Test-Path -LiteralPath $storagePath -PathType Leaf)) {
            return "null"
        }
        return [System.IO.File]::ReadAllText($storagePath, [System.Text.Encoding]::UTF8)
    }

    $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RequestBody))
    $value = ConvertFrom-Json -InputObject $json -ErrorAction Stop
    $invalidDashboard = $Key -eq "dashboard" -and (
        $value.version -ne 1 -or $value.fuel -isnot [array] -or $value.telemetry -isnot [array]
    )
    $invalidHistory = $Key -eq "history" -and -not $json.TrimStart().StartsWith("[")
    if ($invalidDashboard -or $invalidHistory) {
        throw "Os dados enviados para o armazenamento compartilhado estao invalidos."
    }

    $lockStream = $null
    $lockDeadline = [DateTime]::UtcNow.AddSeconds(10)
    while ($null -eq $lockStream -and [DateTime]::UtcNow -lt $lockDeadline) {
        try {
            $lockStream = [System.IO.File]::Open(
                $sharedStorageLockPath,
                [System.IO.FileMode]::OpenOrCreate,
                [System.IO.FileAccess]::ReadWrite,
                [System.IO.FileShare]::None
            )
        } catch [System.IO.IOException] {
            Start-Sleep -Milliseconds 100
        }
    }
    if ($null -eq $lockStream) {
        throw "O armazenamento compartilhado esta ocupado. Tente salvar novamente."
    }

    $temporaryPath = "$storagePath.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [System.IO.File]::WriteAllText($temporaryPath, $json, [System.Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryPath -Destination $storagePath -Force | Out-Null
    } finally {
        if ([System.IO.File]::Exists($temporaryPath)) {
            [System.IO.File]::Delete($temporaryPath)
        }
        $lockStream.Dispose()
    }
    return '{"saved":true}'
}

if (-not $Server) {
    $url = "http://127.0.0.1:$Port/index.html"
    $panelAtPort = $false
    $existingPanel = $false
    try {
        $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing
        $panelAtPort = $response.StatusCode -eq 200 `
            -and $response.Content.Contains("Libardo Transportes") `
            -and $response.Content.Contains("Telemetria")
        if ($panelAtPort) {
            $storageResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/storage/dashboard" -TimeoutSec 2 -UseBasicParsing
            $existingPanel = $storageResponse.StatusCode -eq 200
        }
    } catch {
        if (-not $panelAtPort) {
            $existingPanel = $false
        }
    }

    if ($existingPanel) {
        Start-Process $url
        Write-Host "Painel reaberto em $url. Os dados salvos neste navegador foram preservados."
        exit 0
    }

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($listener) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        $isPanelServer = $process `
            -and $process.CommandLine.Contains($PSCommandPath) `
            -and $process.CommandLine.Contains("-Server") `
            -and $process.CommandLine.Contains("-Port $Port")
        if (-not $isPanelServer) {
            throw "A porta $Port esta sendo usada por um processo que nao e o servidor do painel. Feche-o ou escolha outra porta."
        }

        Stop-Process -Id $listener.OwningProcess
        $stopDeadline = [DateTime]::UtcNow.AddSeconds(5)
        do {
            Start-Sleep -Milliseconds 100
            $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
                Select-Object -First 1
        } while ($listener -and [DateTime]::UtcNow -lt $stopDeadline)
        if ($listener) {
            throw "O servidor anterior do painel nao liberou a porta $Port."
        }
    }

    $scriptPath = "`"$PSCommandPath`""
    $arguments = @(
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        $scriptPath,
        "-Server",
        "-Port",
        "$Port"
    )
    $serverProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WorkingDirectory $env:SystemRoot -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($serverProcess.HasExited) {
            throw "O servidor local encerrou antes de iniciar (código $($serverProcess.ExitCode))."
        }
        try {
            $response = Invoke-WebRequest -Uri $url -TimeoutSec 1 -UseBasicParsing
            if ($response.StatusCode -eq 200 `
                -and $response.Content.Contains("Libardo Transportes") `
                -and $response.Content.Contains("Telemetria")) {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $ready) {
        Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
        throw "O servidor local não respondeu dentro do tempo esperado."
    }
    try {
        Start-Process $url
    } catch {
        Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
        throw "Não foi possível abrir o navegador: $($_.Exception.Message)"
    }
    Write-Host "Painel aberto em $url"
    exit 0
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
try {
    while ($listener.Server.IsBound) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout = 5000
            $stream.WriteTimeout = 5000
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            $contentLength = 0
            while (($line = $reader.ReadLine()) -and $line.Length -gt 0) {
                if ($line -match "^Content-Length:\s*(\d+)\s*$") {
                    $contentLength = [int]$Matches[1]
                }
            }

            $statusCode = 200
            $statusText = "OK"
            $body = [byte[]]@()
            $contentType = "text/plain; charset=utf-8"
            $method = "GET"
            $requestBody = ""
            $match = [regex]::Match($requestLine, "^(GET|HEAD|PUT)\s+(\S+)\s+HTTP/\d(?:\.\d)?$")
            if (-not $match.Success) {
                $statusCode = 400
                $statusText = "Bad Request"
                $body = [System.Text.Encoding]::UTF8.GetBytes("Solicitacao HTTP invalida.")
            } else {
                $method = $match.Groups[1].Value
                try {
                    $requestPath = [System.Uri]::UnescapeDataString(($match.Groups[2].Value -split "\?", 2)[0])
                    $storageMatch = [regex]::Match($requestPath, "^/api/storage/(dashboard|history)$")
                    if ($storageMatch.Success) {
                        if ($method -eq "PUT") {
                            $bodyCharacters = [char[]]::new($contentLength)
                            $charactersRead = 0
                            while ($charactersRead -lt $contentLength) {
                                $read = $reader.Read($bodyCharacters, $charactersRead, $contentLength - $charactersRead)
                                if ($read -le 0) {
                                    throw "O conteudo recebido para o armazenamento compartilhado esta incompleto."
                                }
                                $charactersRead += $read
                            }
                            $requestBody = [string]::new($bodyCharacters)
                        }
                        try {
                            $responseText = Invoke-SharedStorageRequest `
                                -Key $storageMatch.Groups[1].Value `
                                -Method $method `
                                -RequestBody $requestBody
                            $body = [System.Text.Encoding]::UTF8.GetBytes($responseText)
                            $contentType = "application/json; charset=utf-8"
                        } catch {
                            $statusCode = 500
                            $statusText = "Internal Server Error"
                            $body = [System.Text.Encoding]::UTF8.GetBytes($_.Exception.Message)
                        }
                    } else {
                        if ($method -eq "PUT") {
                            $statusCode = 405
                            $statusText = "Method Not Allowed"
                            $body = [System.Text.Encoding]::UTF8.GetBytes("Metodo HTTP nao permitido.")
                        } else {
                            $relativePath = $requestPath.TrimStart("/") -replace "/", [System.IO.Path]::DirectorySeparatorChar
                            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                                $relativePath = "index.html"
                            }
                            $filePath = [System.IO.Path]::GetFullPath((Join-Path $appDirectory $relativePath))
                            if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                                throw "Caminho fora da pasta do painel."
                            }
                            if (Test-Path -LiteralPath $filePath -PathType Container) {
                                $filePath = Join-Path $filePath "index.html"
                            }
                            if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                                $statusCode = 404
                                $statusText = "Not Found"
                                $body = [System.Text.Encoding]::UTF8.GetBytes("Arquivo nao encontrado.")
                            } else {
                                $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
                                if ($mimeTypes.ContainsKey($extension)) {
                                    $contentType = $mimeTypes[$extension]
                                } else {
                                    $contentType = "application/octet-stream"
                                }
                                if ($method -eq "GET") {
                                    $body = [System.IO.File]::ReadAllBytes($filePath)
                                }
                            }
                        }
                    }
                } catch {
                    $statusCode = 400
                    $statusText = "Bad Request"
                    $body = [System.Text.Encoding]::UTF8.GetBytes("Caminho de arquivo invalido.")
                }
            }

            $headers = "HTTP/1.1 $statusCode $statusText`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne "HEAD" -and $body.Length -gt 0) {
                $stream.Write($body, 0, $body.Length)
            }
            $stream.Flush()
            $reader.Dispose()
            $stream.Dispose()
        } catch {
            Write-Host "Falha ao atender uma solicitacao local: $($_.Exception.Message)"
        } finally {
            $client.Dispose()
        }
    }
} finally {
    $listener.Stop()
}
