# install_vimax.ps1 - one-shot ViMax installer for the Huanying director
# lane (α′ F12). Clones ViMax at the pinned commit into HY_VIMAX_HOME,
# builds an isolated venv, installs the lean dependency subset proven
# sufficient for plan/portraits (NOT the full torch/faiss stack - those
# are only for ViMax's novel2video planning, which Huanying doesn't use),
# then prints the env-var line to set.
#
# Usage:
#   pwsh -File tools/install_vimax.ps1 [-VimaxHome D:\Aic\ViMax] [-Python python]
#
# After it finishes, set HY_VIMAX_HOME and restart the Huanying server;
# GET /api/v2/vimax/status should report configured:true.

param(
    [string]$VimaxHome = "D:\Aic\ViMax",
    [string]$Python = "python",
    [string]$Commit = "df8b206013876c63566a5095ec159e86494f60e0",
    [string]$Repo = "https://github.com/HKUDS/ViMax.git"
)

$ErrorActionPreference = "Stop"

# Upfront python check: a clean Win11 'python' is often the Store stub
# (opens the Store, then `-m venv` fails cryptically). Fail loud + early.
try {
    $pyVersion = & $Python --version 2>&1
    if ($LASTEXITCODE -ne 0 -or "$pyVersion" -notmatch "Python 3\.(1[0-9]|[2-9][0-9])") {
        throw "Need Python 3.10+. '$Python --version' returned: $pyVersion. Install Python 3.12 and pass -Python <path> if 'python' is the Windows Store stub."
    }
    Write-Host "[install_vimax] using $pyVersion"
} catch {
    Write-Error $_; exit 1
}

# Lean subset (γ-verified for plan/portraits; the runner imports ViMax's
# agents/pipelines/interfaces/tools which transitively need these).
$Deps = @(
    "langchain>=0.3.26", "langchain-openai>=0.3.27", "langchain-community>=0.3.27",
    "openai>=1.95.0", "pydantic", "pyyaml>=6.0.2", "pillow>=11.3.0",
    "aiohttp>=3.12.14", "tenacity>=9.1.2", "requests>=2.32.4", "chardet>=5.2.0",
    "opencv-python-headless", "numpy", "moviepy>=2.2.1", "scenedetect", "google-genai>=1.47.0"
)

Write-Host "[install_vimax] target: $VimaxHome  (commit $($Commit.Substring(0,8)))"

# 1. Clone or update + pin the commit.
if (-not (Test-Path (Join-Path $VimaxHome ".git"))) {
    Write-Host "[install_vimax] cloning $Repo ..."
    git clone $Repo $VimaxHome
}
Push-Location $VimaxHome
try {
    git fetch --depth 1 origin $Commit 2>$null
    git checkout $Commit
    Write-Host "[install_vimax] checked out $($Commit.Substring(0,8))"

    # 2. venv + lean deps.
    $venvPython = Join-Path $VimaxHome ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Host "[install_vimax] creating venv ..."
        & $Python -m venv .venv
    }
    Write-Host "[install_vimax] installing lean deps ..."
    & $venvPython -m pip install --upgrade pip --quiet
    & $venvPython -m pip install --quiet @Deps

    # 3. Smoke: the runner's imports must resolve in the venv.
    Write-Host "[install_vimax] verifying ViMax imports ..."
    $env:PYTHONUTF8 = "1"
    & $venvPython -c "import sys; sys.path.insert(0, r'$VimaxHome'); from pipelines.script2video_pipeline import Script2VideoPipeline; from agents import Screenwriter, CharacterExtractor; print('[install_vimax] ViMax imports OK')"
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "[install_vimax] DONE. Now set the env var and restart the Huanying server:"
Write-Host "    setx HY_VIMAX_HOME `"$VimaxHome`""
Write-Host "  (or add it to the launch config). Then GET /api/v2/vimax/status -> configured:true."
