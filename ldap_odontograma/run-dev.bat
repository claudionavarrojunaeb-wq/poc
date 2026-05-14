@echo off
chcp 65001 >nul
REM Cambia al directorio del script y arranca los servicios con concurrently
cd /d %~dp0
echo Iniciando servicios con concurrently (npm run dev)...
call npm run start
