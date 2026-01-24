@echo off
cd /d C:\Users\Public\CRM
pm2 resurrect
if errorlevel 1 (
    pm2 start server.js --name "crm-server"
)
