# NVIDIA AI Integration - Complete Technical Architecture

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PostGenius Pro v3.16                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Frontend (React/TypeScript)                     │  │
│  │  ┌──────────────────────────────────────────────────────────────┐   │  │
│  │  │          AdminDashboard.tsx                                  │   │  │
│  │  │  ┌──────────────┬─────────────┬──────────────────────────┐  │   │  │
│  │  │  │  Articles    │  Licenses   │  🎨 NVIDIA AI (NEW)     │  │   │  │
│  │  │  │  Management  │  Generator  │  ┌────────────────────┐ │  │   │  │
│  │  │  │              │             │  │ Image Generation   │ │  │   │  │
│  │  │  │              │             │  │ Vision Validation  │ │  │   │  │
│  │  │  │              │             │  │ Pinterest OAuth    │ │  │   │  │
│  │  │  └──────────────┴─────────────┴──────────────────────────┘  │   │  │
│  │  │                                                              │   │  │
│  │  │   Component: NVIDIAProductImageGenerator.tsx (NEW)          │   │  │
│  │  │                                                              │   │  │
│  │  └──────────────────────────────────────────────────────────────┘   │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    ↓ HTTP Calls ↓                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │              Backend API (Node.js/Express)                           │  │
│  │  ┌──────────────────────────────────────────────────────────────┐   │  │
│  │  │                  server.ts (NEW ENDPOINTS)                   │   │  │
│  │  │  ┌────────────────────────────────────────────────────────┐  │   │  │
│  │  │  │ POST /api/nvidia/generate-images ───┐                 │  │   │  │
│  │  │  │ POST /api/nvidia/validate-image ────├─ Services → API │  │   │  │
│  │  │  │ GET  /api/pinterest/oauth-config ───┤                 │  │   │  │
│  │  │  │ POST /api/pinterest/exchange-token └─┘                 │  │   │  │
│  │  │  │                                                        │  │   │  │
│  │  │  └────────────────────────────────────────────────────────┘  │   │  │
│  │  │                                                              │   │  │
│  │  │  ┌────────────────────────────────────────────────────────┐  │   │  │
│  │  │  │  Services Layer (NEW)                                 │  │   │  │
│  │  │  │  ┌──────────────────────────────────────────────────┐ │   │  │
│  │  │  │  │ nvidiaImageGenerationService.ts (NEW)            │ │   │  │
│  │  │  │  │ • generateProductImages()                        │ │   │  │
│  │  │  │  │ • buildProductPrompt()                           │ │   │  │
│  │  │  │  └──────────────────────────────────────────────────┘ │   │  │
│  │  │  │  ┌──────────────────────────────────────────────────┐ │   │  │
│  │  │  │  │ nvidiaVisionValidationService.ts (NEW)           │ │   │  │
│  │  │  │  │ • validateProductImage()                         │ │   │  │
│  │  │  │  │ • validateMultipleImages()                       │ │   │  │
│  │  │  │  └──────────────────────────────────────────────────┘ │   │  │
│  │  │  │  ┌──────────────────────────────────────────────────┐ │   │  │
│  │  │  │  │ pinterestOAuthService.ts (NEW)                   │ │   │  │
│  │  │  │  │ • generateAuthorizationUrl()                     │ │   │  │
│  │  │  │  │ • exchangeCodeForToken()                         │ │   │  │
│  │  │  │  │ • refreshAccessToken()                           │ │   │  │
│  │  │  │  └──────────────────────────────────────────────────┘ │   │  │
│  │  │  │                                                        │  │   │  │
│  │  │  └────────────────────────────────────────────────────────┘  │   │  │
│  │  │                           ↓                                   │   │  │
│  │  │                    HTTP Requests to                          │   │  │
│  │  │                    External APIs                             │   │  │
│  │  │                                                              │   │  │
│  │  └──────────────────────────────────────────────────────────────┘   │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│     ↓                           ↓                            ↓              │
├─────────────────────────────────────────────────────────────────────────────┤
│  External Services Integration                                              │
│                                                                               │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  NVIDIA NIM API      │  │  NVIDIA NIM API      │  │  Pinterest API   │  │
│  │  (Stable Diffusion)  │  │  (Qwen VLM)          │  │  (OAuth + Pins)  │  │
│  │  ─────────────────   │  │  ──────────────────  │  │  ────────────────│  │
│  │                      │  │                      │  │                  │  │
│  │ Model:               │  │ Model:               │  │ Auth Endpoint:   │  │
│  │ stable-diffusion-    │  │ qwen3.5-397b-a17b    │  │ oauth/token      │  │
│  │ 3.5-large            │  │                      │  │                  │  │
│  │                      │  │ Purpose:             │  │ Scopes:          │  │
│  │ Purpose:             │  │ Validate image       │  │ • pins:write     │  │
│  │ Generate 3           │  │ quality              │  │ • boards:write   │  │
│  │ lifestyle            │  │                      │  │ • user_accounts  │  │
│  │ images               │  │ Checks:              │  │   :read          │  │
│  │                      │  │ • Product match      │  │                  │  │
│  │ Input:               │  │ • Visual quality     │  │ Response:        │  │
│  │ Text prompt          │  │ • Professional level │  │ Access token     │  │
│  │                      │  │ • Defects            │  │ Refresh token    │  │
│  │ Output:              │  │                      │  │                  │  │
│  │ 3 base64 images      │  │ Input:               │  │                  │  │
│  │                      │  │ Base64 image         │  │ Usage:           │  │
│  │                      │  │                      │  │ Auto-publish     │  │
│  │                      │  │ Output:              │  │ images to        │  │
│  │                      │  │ Validation result    │  │ Pinterest        │  │
│  │                      │  │ with score           │  │                  │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘  │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Database Layer                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  u275893975_postgenius_db                                           │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │  Table: posts                                               │   │   │
│  │  │  ┌────────────────────────────────────────────────────────┐ │   │   │
│  │  │  │  Original Columns:                                     │ │   │   │
│  │  │  │  • id (PK)                                             │ │   │   │
│  │  │  │  • post_title                                          │ │   │   │
│  │  │  │  • post_content                                        │ │   │   │
│  │  │  │  • created_at                                          │ │   │   │
│  │  │  │  • ...                                                 │ │   │   │
│  │  │  ├────────────────────────────────────────────────────────┤ │   │   │
│  │  │  │  NEW Columns (for NVIDIA Integration):                 │ │   │   │
│  │  │  │  • ai_lifestyle_images (JSON)                          │ │   │   │
│  │  │  │    └─ Stores URLs/base64 of 3 generated images        │ │   │   │
│  │  │  │  • vlm_check_status (BOOLEAN)                          │ │   │   │
│  │  │  │    └─ TRUE if passed Qwen VLM validation             │ │   │   │
│  │  │  │  • generation_prompt (TEXT)                            │ │   │   │
│  │  │  │    └─ Exact prompt used for generation                │ │   │   │
│  │  │  │  • ai_generated_at (TIMESTAMP)                         │ │   │   │
│  │  │  │    └─ When images were generated                       │ │   │   │
│  │  │  │  • idx_vlm_status (INDEX)                              │ │   │   │
│  │  │  │    └─ For fast queries on validated images            │ │   │   │
│  │  │  └────────────────────────────────────────────────────────┘ │   │   │
│  │  │                                                              │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                       │   │
│  │  SSH Access: 147.93.42.206:65002                                    │   │
│  │  User: root                                                         │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

### 1. Image Generation Flow

```
User Input (Admin Dashboard)
         ↓
[Product Name: "Wireless Headphones"]
[Description: "High-quality noise-canceling Bluetooth..."]
[Context: "in office environment"]
         ↓
Component: NVIDIAProductImageGenerator
         ↓
HTTP POST /api/nvidia/generate-images
         ↓
Express Handler: app.post('/api/nvidia/generate-images')
         ↓
Service: generateProductImages()
         ↓
┌─────────────────────────────────────────────────┐
│ Build Prompt:                                   │
│ "Professional lifestyle photography of         │
│  Wireless Headphones, in office environment,   │
│  cinematic lighting, professional product      │
│  photography, 8k resolution, ..."              │
└─────────────────────────────────────────────────┘
         ↓
HTTP POST to NVIDIA NIM API
https://integrate.api.nvidia.com/v1/images/generations
         ↓
Request Body:
{
  "model": "stable-diffusion-3.5-large",
  "prompt": "...",
  "num_images": 3,
  "image_size": "1024x1024",
  "steps": 30,
  "guidance_scale": 7.5
}
         ↓
NVIDIA API Processing (30-60 seconds)
         ↓
Response: 3 Generated Images (base64 encoded)
         ↓
Return to Component
         ↓
Display in Gallery with Validation Button
```

### 2. Image Validation Flow

```
User Clicks: "Validate with VLM"
         ↓
Component: validateImage(index)
         ↓
HTTP POST /api/nvidia/validate-image
         ↓
{
  "imageBase64": "iVBORw0KGgo...",
  "productName": "Wireless Headphones",
  "productDescription": "..."
}
         ↓
Express Handler: app.post('/api/nvidia/validate-image')
         ↓
Service: validateProductImage()
         ↓
Build Vision Prompt:
"Analyze this product image...
Evaluate:
1. Does image show product relevant to 'Wireless Headphones'?
2. Is image professionally shot?
3. Visible defects?
4. Appropriate background?
5. E-commerce suitable?

Respond in JSON..."
         ↓
HTTP POST to NVIDIA NIM API
https://integrate.api.nvidia.com/v1/chat/completions
         ↓
Request Body:
{
  "model": "qwen3.5-397b-a17b",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "image_url": {
            "url": "data:image/png;base64,..."
          }
        },
        {
          "type": "text",
          "text": "Vision assessment prompt..."
        }
      ]
    }
  ]
}
         ↓
Qwen VLM Analysis (10-15 seconds)
         ↓
Response JSON:
{
  "matchesProduct": true,
  "visualQuality": "excellent",
  "professionalLevel": "high",
  "defects": [],
  "overallScore": 92
}
         ↓
Parse & Evaluate:
if (matchesProduct && quality="excellent/good" && 
    professionalLevel="high/medium" && defects=empty)
  → isValid = true ✅
else
  → isValid = false ❌
         ↓
Update Component State
         ↓
Display Result:
├─ Valid: 🟢 Green border, show score (92%)
└─ Invalid: 🔴 Red border, show defects
         ↓
Save to Database (optional):
UPDATE posts SET
  ai_lifestyle_images = JSON_ARRAY(...),
  vlm_check_status = TRUE,
  generation_prompt = '...'
WHERE id = product_id
```

### 3. Pinterest OAuth Flow

```
User Clicks: "Connect to Pinterest (OAuth)"
         ↓
Component: handlePinterestAuth()
         ↓
HTTP GET /api/pinterest/oauth-config
         ↓
Response:
{
  "authUrl": "https://api.pinterest.com/oauth/?...",
  "clientId": "...",
  "redirectUri": "...",
  "requiredScopes": ["pins:write", "boards:write", "user_accounts:read"]
}
         ↓
Open OAuth Authorization Window
┌──────────────────────────────────────────┐
│  Pinterest OAuth Authorization           │
│                                          │
│  "PostGenius Pro wants access to:"      │
│  ☐ Create & edit pins (pins:write)      │
│  ☐ Manage boards (boards:write)         │
│  ☐ View account (user_accounts:read)   │
│                                          │
│          [Authorize App]  [Deny]        │
└──────────────────────────────────────────┘
         ↓
User Clicks "Authorize"
         ↓
Pinterest Redirects to:
https://postgeniuspro.com/api/pinterest/callback?code=AUTH_CODE&state=...
         ↓
Component extracts authorization code
         ↓
HTTP POST /api/pinterest/exchange-token
{
  "code": "AUTH_CODE"
}
         ↓
Handler exchanges code for token:
POST https://api.pinterest.com/oauth/token
{
  "grant_type": "authorization_code",
  "code": "AUTH_CODE",
  "client_id": "...",
  "client_secret": "...",
  "redirect_uri": "..."
}
         ↓
Response:
{
  "access_token": "pi_...",
  "refresh_token": "ri_...",
  "expires_in": 7776000
}
         ↓
Store Token Securely in Database:
INSERT INTO pinterest_tokens SET
  user_id = current_user,
  access_token = ENCRYPT(token),
  refresh_token = ENCRYPT(refresh),
  expires_at = NOW() + INTERVAL 90 DAY
         ↓
Component displays:
✅ Pinterest Connected
Status changed to "authorized"
         ↓
Ready for Auto-Publishing!
```

---

## Component Hierarchy

```
App
├── Router
│   ├── LandingPage
│   ├── BlogPage
│   ├── AdminPage
│   │   └── AdminDashboard (UPDATED)
│   │       ├── ArticleRow (existing)
│   │       ├── ArticleList (existing)
│   │       ├── LicenseManager (existing)
│   │       └── NVIDIAProductImageGenerator (NEW)
│   │           ├── GenerationForm
│   │           ├── ImageGallery
│   │           │   └── ImageCard (with validation UI)
│   │           └── PinterestOAuthSection
│   └── ...
└── ...
```

---

## Microservices Integration Map

```
frontend             backend              external APIs
(React)           (Node.js/Express)

Admin      ──→  /api/nvidia/      ──→  NVIDIA NIM
Dashboard        generate-images        (Image Gen)


           ──→  /api/nvidia/      ──→  NVIDIA NIM
               validate-image          (Vision VLM)


           ──→  /api/pinterest/   ──→  Pinterest
               oauth-config            Auth


           ──→  /api/pinterest/   ──→  Pinterest
               exchange-token          API


Database
(u275893975_postgenius_db)
    ↑
    └─── Store generated images
         Store validation status
         Store generation prompts
         Track generation timestamps
```

---

## Environment Variables Mapping

```
.env (Backend)
│
├── NVIDIA Integration
│   ├── NVIDIA_API_KEY ──→ Authenticate to NVIDIA NIM API
│   ├── STABLE_DIFFUSION_MODEL_ID ──→ Model selection (fixed)
│   └── QWEN_VLM_MODEL_ID ──→ Model selection (fixed)
│
├── Pinterest OAuth
│   ├── PINTEREST_CLIENT_ID ──→ OAuth client identifier
│   ├── PINTEREST_CLIENT_SECRET ──→ OAuth secret (secure)
│   └── PINTEREST_REDIRECT_URI ──→ OAuth callback URL
│
├── Database (SSH)
│   ├── SSH_HOST ──→ 147.93.42.206
│   ├── SSH_PORT ──→ 65002
│   ├── SSH_USER ──→ root
│   ├── DB_HOST ──→ localhost (via SSH tunnel)
│   ├── DB_PORT ──→ 3306
│   ├── DB_NAME ──→ u275893975_postgenius_db
│   ├── DB_USER ──→ u275893975_postgenius_use
│   └── DB_PASSWORD ──→ (from your records)
│
└── Legacy (existing)
    ├── HF_TOKEN ──→ HuggingFace token
    ├── FLASK_ENV ──→ development
    └── PYTHON_PORT ──→ 5000
```

---

## Request/Response Cycle Example

### Complete User Workflow

```
1. USER OPENS ADMIN DASHBOARD
   ↓
2. CLICKS "🎨 NVIDIA AI" TAB
   ↓
3. FILLS FORM:
   - Product: "Premium Soundbar"
   - Description: "Dolby Atmos 5.1 surround sound system"
   - Context: "in living room"
   ↓
4. CLICKS "Generate 3 Images"
   ↓
5. FRONTEND CALLS: POST /api/nvidia/generate-images
   {
     "productName": "Premium Soundbar",
     "productDescription": "Dolby Atmos 5.1 surround sound system",
     "usageContext": "in living room"
   }
   ↓
6. BACKEND PROCESSES:
   - Builds prompt
   - Calls NVIDIA Stable Diffusion
   - Waits 30-60 seconds
   - Returns 3 base64 images
   ↓
7. FRONTEND DISPLAYS:
   [Image 1] [Image 2] [Image 3]
   [Validate] [Validate] [Validate]
   ↓
8. USER CLICKS "VALIDATE WITH VLM" ON IMAGE 1
   ↓
9. FRONTEND CALLS: POST /api/nvidia/validate-image
   {
     "imageBase64": "iVBORw0KGgo...",
     "productName": "Premium Soundbar",
     "productDescription": "..."
   }
   ↓
10. BACKEND PROCESSES:
    - Calls NVIDIA Qwen VLM
    - Analyzes image
    - Returns quality score
    ↓
11. FRONTEND DISPLAYS:
    Image 1: ✅ Valid (92%) - Green border
    ↓
12. USER CLICKS "CONNECT TO PINTEREST (OAUTH)"
    ↓
13. FRONTEND CALLS: GET /api/pinterest/oauth-config
    ↓
14. BACKEND RETURNS: Auth URL
    ↓
15. FRONTEND: Opens Pinterest OAuth window
    ↓
16. USER: Clicks "Authorize App" in Pinterest
    ↓
17. PINTEREST: Redirects with authorization code
    ↓
18. FRONTEND: Extracts code, calls POST /api/pinterest/exchange-token
    {
      "code": "AUTH_CODE"
    }
    ↓
19. BACKEND: Exchanges code for access token
    ↓
20. BACKEND: Returns success, stores token in database
    ↓
21. FRONTEND: Displays "✅ Pinterest Connected"
    ↓
22. READY FOR AUTO-PUBLISHING!
```

---

## Summary

✅ **Frontend:** React component with form, image gallery, OAuth integration
✅ **Backend:** Express API with 4 new endpoints
✅ **Services:** 3 new wrapper services for NVIDIA and Pinterest APIs
✅ **Database:** 4 new columns for image storage and tracking
✅ **External:** Integration with NVIDIA NIM and Pinterest APIs
✅ **Security:** Environment variables for all secrets

**Total Development Time:** 2-3 hours
**Testing Time:** 30 minutes
**Deployment:** Same as existing application

Ready for production! 🚀
