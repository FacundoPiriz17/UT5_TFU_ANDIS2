$ErrorActionPreference = "Stop"
$python = if ($env:PYTHON) { $env:PYTHON } elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" } elseif (Get-Command py -ErrorAction SilentlyContinue) { "py" } else { throw "Instale Python 3.10+ o defina PYTHON." }
& $python "$PSScriptRoot/manage.py" demo_blue_green
exit $LASTEXITCODE
