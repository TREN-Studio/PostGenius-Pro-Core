# HuggingFace Image Service Starter (PowerShell)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " HuggingFace Image Service Starter" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Python is installed" -ForegroundColor Green
        Write-Host "     $pythonVersion" -ForegroundColor Gray
        Write-Host ""
    } else {
        throw "Python not found"
    }
} catch {
    Write-Host "[ERROR] Python is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Python 3.11 or 3.12 from:" -ForegroundColor Yellow
    Write-Host "https://www.python.org/downloads/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Make sure to check 'Add Python to PATH' during installation" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Change to backend directory if needed
if (-not (Test-Path "image_service.py")) {
    Write-Host "[INFO] Changing to backend directory..." -ForegroundColor Yellow
    Set-Location backend
}

# Check if dependencies are installed
Write-Host "[INFO] Checking dependencies..." -ForegroundColor Yellow
try {
    pip show flask | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Dependencies already installed" -ForegroundColor Green
    } else {
        throw "Dependencies not installed"
    }
} catch {
    Write-Host "[WARN] Dependencies not installed. Installing now..." -ForegroundColor Yellow
    Write-Host ""
    
    pip install -r requirements.txt
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[OK] Dependencies installed successfully" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Starting HuggingFace Image Service" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend will be available at:" -ForegroundColor Green
Write-Host "http://localhost:5000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start the service
python image_service.py
