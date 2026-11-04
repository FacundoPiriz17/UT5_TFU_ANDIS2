param([Parameter(Mandatory = $true)][string]$Version, [ValidateSet("catalogo", "comercial")][string]$Service = "catalogo")
$ErrorActionPreference = "Stop"
$python = if ($env:PYTHON) { $env:PYTHON } elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" } elseif (Get-Command py -ErrorAction SilentlyContinue) { "py" } else { throw "Instale Python 3.10+ o defina PYTHON con la ruta del ejecutable." }
& $python "$PSScriptRoot/manage.py" deploy $Version --service $Service
exit $LASTEXITCODE
