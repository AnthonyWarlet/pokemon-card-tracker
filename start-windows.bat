@echo off
chcp 65001 >nul
title Pokemon Card Tracker
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] Node.js n'est pas installe.
  echo      Telecharge la version "LTS" sur https://nodejs.org puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo  Premiere utilisation : installation des composants, patiente 1-2 min...
  call npm install
  if errorlevel 1 (
    echo  [!] L'installation a echoue. Verifie ta connexion internet et reessaie.
    pause
    exit /b 1
  )
)

echo  Demarrage... la page va s'ouvrir dans ton navigateur.
start "" http://localhost:3000
npm start
pause
