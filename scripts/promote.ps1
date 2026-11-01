param([Parameter(Mandatory = $true)][ValidateSet("blue", "green")][string]$Slot)
$ErrorActionPreference = "Stop"
$python = if ($env:PYTHON) { $env:PYTHON } elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" } elseif (Get-Command py -ErrorAction SilentlyContinue) { "py" } else { throw "Instale Python 3.10+ o defina PYTHON." }
& $python "$PSScriptRoot/manage.py" promote $Slot
exit $LASTEXITCODE
