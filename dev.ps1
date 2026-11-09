# Starts Postgres, Redis, the API, the Stockfish worker, and the website.
# From the repo folder:  powershell -ExecutionPolicy Bypass -File .\dev.ps1
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env. Set STOCKFISH_PATH in that file, then run dev.ps1 again."
    exit 1
}

$python = Join-Path $Root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Python env is missing. In the backend folder run:"
    Write-Host "  python -m venv .venv"
    Write-Host "  .\.venv\Scripts\python.exe -m pip install -e ."
    exit 1
}

Write-Host "Starting Postgres and Redis..."
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker did not start. Open Docker Desktop, wait until it is running, then try again."
    exit $LASTEXITCODE
}

Write-Host "Applying database migrations..."
Push-Location (Join-Path $Root "backend")
& $python -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location

$backend = Join-Path $Root "backend"
$frontend = Join-Path $Root "frontend"

function Start-Once($match, $file, $workdir, $argList) {
    $running = Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and $_.CommandLine -match $match
    }
    if ($running) {
        Write-Host "Already running, left it alone: $match"
        return
    }
    Start-Process -FilePath $file -WorkingDirectory $workdir -ArgumentList $argList
}

Start-Once "uvicorn app.main:create_app" $python $backend @(
    "-m", "uvicorn", "app.main:create_app",
    "--factory", "--reload", "--host", "127.0.0.1", "--port", "8000"
)
Start-Once "celery -A app.worker.celery_app" $python $backend @(
    "-m", "celery", "-A", "app.worker.celery_app",
    "worker", "--loglevel=info", "-Q", "ingestion,analysis", "--pool=solo"
)
Start-Once "next dev" "npm.cmd" $frontend @("run", "dev")

Write-Host ""
Write-Host "API   http://127.0.0.1:8000/docs"
Write-Host "Site  http://localhost:3000"
Write-Host "Three windows opened: API, worker, website. Close those windows to stop them."
Write-Host "Postgres and Redis keep running. Stop them with: docker compose stop"
