@echo off
setlocal
cd /d "%~dp0"
title Iniciar Financas Pluggy

echo ==========================================
echo   INICIAR - FINANCAS PLUGGY
echo ==========================================
if not exist ".env.local" (
  echo ERRO: .env.local nao existe.
  echo Execute configurar.bat primeiro.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Dependencias nao encontradas. Instalando...
  call npm install
  if errorlevel 1 (
    echo ERRO ao instalar dependencias.
    pause
    exit /b 1
  )
)
echo.
echo Aplicativo iniciando. Abra http://localhost:3000 no navegador.
echo Para parar, pressione Ctrl+C nesta janela.
echo.
call npm run dev
pause
