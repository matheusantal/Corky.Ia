@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Configurar Financas Pluggy

echo ==========================================
echo   CONFIGURACAO - FINANCAS PLUGGY
echo ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado.
  echo Instale a versao LTS em https://nodejs.org/ e rode este BAT novamente.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERRO: npm nao encontrado. Reinstale o Node.js LTS.
  pause
  exit /b 1
)

if not exist ".env.example" (
  echo ERRO: .env.example nao encontrado. Execute este BAT na pasta do projeto.
  pause
  exit /b 1
)

echo.
echo Preencha os dados abaixo. As chaves serao gravadas em .env.local.
echo Nao compartilhe esse arquivo e nao o envie ao GitHub.
echo.

set /p "CLIENT_ID=Pluggy Client ID: "
set /p "CLIENT_SECRET=Pluggy Client Secret: "
set /p "SUPABASE_URL=Supabase Project URL (https://....supabase.co): "
set /p "SUPABASE_ANON=Supabase anon/public key: "
set /p "SUPABASE_SERVICE=Supabase service_role key (somente servidor): "
echo.
set /p "APP_URL=URL publica HTTPS do app (Vercel ou tunnel; deixe vazio se ainda nao tiver): "
set /p "SANDBOX=Mostrar conectores Sandbox? Digite true ou false [false]: "
if "%SANDBOX%"=="" set "SANDBOX=false"

for /f "delims=" %%S in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set "WEBHOOK_SECRET=%%S"
for /f "delims=" %%S in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set "CRON_SECRET=%%S"

(
 echo # Gerado por configurar.bat - mantenha este arquivo privado
 echo CLIENT_ID=%CLIENT_ID%
 echo CLIENT_SECRET=%CLIENT_SECRET%
 echo NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%
 echo NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_ANON%
 echo SUPABASE_SERVICE_ROLE_KEY=%SUPABASE_SERVICE%
 echo NEXT_PUBLIC_APP_URL=%APP_URL%
 echo PLUGGY_WEBHOOK_SECRET=%WEBHOOK_SECRET%
 echo CRON_SECRET=%CRON_SECRET%
 echo NEXT_PUBLIC_PLUGGY_INCLUDE_SANDBOX=%SANDBOX%
) > ".env.local"

if errorlevel 1 (
  echo ERRO ao gravar .env.local.
  pause
  exit /b 1
)

echo.
echo Instalando dependencias do projeto...
call npm install
if errorlevel 1 (
  echo.
  echo ERRO ao instalar dependencias. Confira sua conexao e a instalacao do Node.js.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo Configuracao concluida.
echo Arquivo criado: .env.local
echo ==========================================
if "%APP_URL%"=="" (
  echo.
  echo ATENCAO: voce ainda nao informou a URL publica HTTPS.
  echo Para a Pluggy, depois do deploy use:
  echo https://SEU-DOMINIO/api/webhooks/pluggy
)
echo.
echo Rode iniciar.bat para abrir o aplicativo.
pause
