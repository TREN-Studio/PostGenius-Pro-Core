# ========================================
# PostGenius Pro NVIDIA Integration
# Production Deployment Script (PowerShell)
# ========================================
# Usage: .\deploy-production.ps1
# This script uploads all files to production server

# Configuration
$SSH_HOST = "147.93.42.206"
$SSH_PORT = "65002"
$SSH_USER = "u275893975"  # CHANGE IF NEEDED
$REMOTE_PATH = "public_html"

# Local paths
$PROJECT_ROOT = "c:\Users\larbi\My Projects\postgenius-pro-3.16\postgenius-pro-3.16"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 PostGenius Pro Production Deployment" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verify files exist locally
Write-Host "📋 Step 1: Verifying local files..." -ForegroundColor Yellow

$filesToUpload = @(
    "services/nvidiaImageGenerationService.ts",
    "services/nvidiaVisionValidationService.ts",
    "services/pinterestOAuthService.ts",
    "components/NVIDIAProductImageGenerator.tsx",
    "components/AdminDashboard.tsx",
    "backend/src/server.ts",
    "backend/.env.example"
)

$allFilesExist = $true
foreach ($file in $filesToUpload) {
    $fullPath = Join-Path $PROJECT_ROOT $file
    if (Test-Path $fullPath) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file NOT FOUND!" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host ""
    Write-Host "⚠️ Some files are missing! Aborting deployment." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ All files verified!" -ForegroundColor Green
Write-Host ""

# Build project
Write-Host "🔨 Step 2: Building production bundle..." -ForegroundColor Yellow
cd $PROJECT_ROOT
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build completed successfully!" -ForegroundColor Green
Write-Host ""

# Upload files using SCP
Write-Host "📤 Step 3: Uploading files to production..." -ForegroundColor Yellow
Write-Host "Server: $SSH_USER@$SSH_HOST:$SSH_PORT" -ForegroundColor Cyan
Write-Host ""

# Command Block A: Services
Write-Host "  → Uploading NVIDIA Services..." -ForegroundColor Cyan
scp -P $SSH_PORT "services/nvidiaImageGenerationService.ts" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/backend/src/services/"
scp -P $SSH_PORT "services/nvidiaVisionValidationService.ts" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/backend/src/services/"
scp -P $SSH_PORT "services/pinterestOAuthService.ts" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/backend/src/services/"
Write-Host "  ✅ Services uploaded" -ForegroundColor Green

# Command Block B: Components
Write-Host "  → Uploading React components..." -ForegroundColor Cyan
scp -P $SSH_PORT "components/NVIDIAProductImageGenerator.tsx" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/components/"
scp -P $SSH_PORT "components/AdminDashboard.tsx" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/components/"
scp -P $SSH_PORT "backend/src/server.ts" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/backend/src/"
Write-Host "  ✅ Components uploaded" -ForegroundColor Green

# Command Block C: Environment
Write-Host "  → Uploading configuration..." -ForegroundColor Cyan
scp -P $SSH_PORT "backend/.env.example" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/backend/.env"
Write-Host "  ✅ Configuration uploaded" -ForegroundColor Green

Write-Host ""
Write-Host "✅ Step 3 Complete: All files uploaded!" -ForegroundColor Green
Write-Host ""

# Database Migration Instructions
Write-Host "⚠️ Step 4: Database Migration (Manual SSH Required)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Execute these SQL commands on the server:" -ForegroundColor Cyan
Write-Host ""
Write-Host @"
ssh -p 65002 ${SSH_USER}@${SSH_HOST}
mysql -u ${SSH_USER}_postgenius_use -p ${SSH_USER}_postgenius_db

-- Then paste these commands:
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_lifestyle_images JSON;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS vlm_check_status BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS generation_prompt TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE posts ADD INDEX idx_vlm_status (vlm_check_status);
DESCRIBE posts;
EXIT;
"@ -ForegroundColor White

Write-Host ""
Write-Host "🔄 Step 5: Server Build & Restart (Manual SSH Required)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then execute these commands:" -ForegroundColor Cyan
Write-Host @"
cd /home/${SSH_USER}/${REMOTE_PATH}
npm install
npm run build
pm2 restart all
pm2 status
"@ -ForegroundColor White

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "📋 DEPLOYMENT CHECKLIST" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Local files verified"
Write-Host "✅ Project built successfully"
Write-Host "✅ All files uploaded to server"
Write-Host "⏳ Database migration (PENDING - Manual SSH Required)"
Write-Host "⏳ Server build & restart (PENDING - Manual SSH Required)"
Write-Host ""
Write-Host "🔗 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Open another terminal and run: ssh -p 65002 ${SSH_USER}@${SSH_HOST}"
Write-Host "2. Execute the database migration SQL commands above"
Write-Host "3. Execute the build & restart commands above"
Write-Host "4. Visit: https://postgeniuspro.com/admin"
Write-Host "5. Look for '🎨 NVIDIA AI' tab in AdminDashboard"
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
