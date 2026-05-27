@echo off
echo ----------------------------------------------------
echo Checking for orphaned CoEDM backend python processes...
echo ----------------------------------------------------

powershell -NoProfile -Command "$procs = Get-CimInstance Win32_Process -Filter \"Name='python.exe'\"; $found = $false; foreach ($p in $procs) { if ($p.CommandLine -match 'CoEDM' -or $p.CommandLine -match 'uvicorn' -or $p.CommandLine -match 'saftey.py' -or $p.CommandLine -match 'start.py') { Write-Host 'Killing PID:' $p.ProcessId '- Command:' $p.CommandLine.Substring(0, [math]::Min(80, $p.CommandLine.Length))'...'; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; $found = $true } }; if (-not $found) { Write-Host 'No orphaned processes found! You are good to go.' -ForegroundColor Green } else { Write-Host 'Done. All cleared!' -ForegroundColor Green }"

echo.
pause
