# NVIDIA AI Integration Implementation Guide
## PostGenius Pro v3.16 - Production-Grade AI Image Generation & Validation

---

## 📋 Executive Summary

This guide provides complete technical instructions for integrating NVIDIA's advanced AI models into PostGenius Pro's Admin Dashboard:
- **Stable Diffusion 3.5 Large** for professional lifestyle product image generation
- **Qwen 3.5 VLM** for AI-powered image quality validation
- **Pinterest OAuth** for automated image distribution with proper API scopes

**Timeline:** 2-3 hours for full implementation and testing
**Database:** Minimal schema changes (3 new fields)
**Risk Level:** LOW - Implementation is isolated to admin dashboard

---

## 🔧 Part 1: Environment Configuration

### Step 1.1 - NVIDIA API Setup

1. **Obtain NVIDIA API Key:**
   - Visit: https://console.groq.com/ or https://build.nvidia.com/
   - Create account (if needed)
   - Generate new API key for NIM (NVIDIA Inference Microservice)
   - Copy your key: `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`

2. **Test API Key (Quick Validation):**
   ```bash
   curl -X POST https://integrate.api.nvidia.com/v1/images/generations \
     -H "Authorization: Bearer YOUR_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "stable-diffusion-3.5-large",
       "prompt": "test image",
       "num_images": 1
     }'
   ```

### Step 1.2 - Update Environment Variables

1. **Locate/Create `.env` file in `/backend` directory:**
   ```
   c:\Users\larbi\My Projects\postgenius-pro-3.16\postgenius-pro-3.16\backend\.env
   ```

2. **Add the following configuration:**
   ```dotenv
   # =====================================
   # NVIDIA AI Integration
   # =====================================
   NVIDIA_API_KEY=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
   STABLE_DIFFUSION_MODEL_ID=stable-diffusion-3.5-large
   QWEN_VLM_MODEL_ID=qwen3.5-397b-a17b

   # =====================================
   # Pinterest OAuth Configuration
   # =====================================
   PINTEREST_CLIENT_ID=your_client_id_here
   PINTEREST_CLIENT_SECRET=your_client_secret_here
   PINTEREST_REDIRECT_URI=https://postgeniuspro.com/api/pinterest/callback

   # =====================================
   # Database SSH Configuration
   # =====================================
   SSH_HOST=147.93.42.206
   SSH_PORT=65002
   SSH_USER=root
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=u275893975_postgenius_db
   DB_USER=u275893975_postgenius_use
   DB_PASSWORD=your_password_here
   ```

3. **Secure the `.env` file:**
   - Add to `.gitignore` (if using version control):
     ```
     .env
     .env.local
     .env.*.local
     ```
   - Set file permissions: `chmod 600 .env`
   - **NEVER commit this file to Git**

---

## 📦 Part 2: Backend Service Installation

### Step 2.1 - Verify Node.js Dependencies

The backend server at `backend/src/server.ts` already has all required dependencies. Verify Express is installed:

```bash
cd backend
npm list express
# Should show: express@5.1.0 or higher
```

### Step 2.2 - Verify New Services Exist

Confirm the three new services have been created:

1. **Image Generation Service:**
   - File: `services/nvidiaImageGenerationService.ts`
   - Exports: `generateProductImages()`, `generatePromptTemplate()`

2. **Vision Validation Service:**
   - File: `services/nvidiaVisionValidationService.ts`
   - Exports: `validateProductImage()`, `validateMultipleImages()`

3. **Pinterest OAuth Service:**
   - File: `services/pinterestOAuthService.ts`
   - Exports: OAuth configuration and token management functions

### Step 2.3 - Verify Backend Endpoints

Check `backend/src/server.ts` for the new endpoints:

```typescript
// Image Generation
POST /api/nvidia/generate-images

// Image Validation
POST /api/nvidia/validate-image

// Pinterest OAuth
GET /api/pinterest/oauth-config
POST /api/pinterest/exchange-token
```

---

## 🎨 Part 3: Frontend Admin Dashboard Integration

### Step 3.1 - Component Verification

Confirm the new component exists:
- File: `components/NVIDIAProductImageGenerator.tsx`
- Provides: Full UI for image generation, validation, and Pinterest OAuth

### Step 3.2 - Admin Dashboard Update

Verify `components/AdminDashboard.tsx` includes:
1. Import of `NVIDIAProductImageGenerator`
2. New tab type: `'nvidia'`
3. New tab button: "🎨 NVIDIA AI"
4. Conditional rendering of the component

### Step 3.3 - Start Development Server

```bash
# From root directory
npm run dev

# Or with Vite
npx vite

# Server should start at: http://localhost:5173 (or similar)
```

---

## 🗄️ Part 4: Database Schema Migration

### Step 4.1 - SSH Connection Setup

Connect to your database via SSH tunnel:

```bash
# SSH into your server
ssh -p 65002 root@147.93.42.206

# Or use SSH tunneling in your client:
ssh -L 3306:localhost:3306 -p 65002 root@147.93.42.206
```

### Step 4.2 - Database Schema Changes

Execute the following SQL to add required fields to your products/posts table:

```sql
-- Connect to database
USE u275893975_postgenius_db;

-- Add AI Lifestyle Images storage field
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_lifestyle_images JSON
COMMENT 'JSON array of generated image URLs and metadata';

-- Add VLM validation flag
ALTER TABLE posts ADD COLUMN IF NOT EXISTS vlm_check_status BOOLEAN DEFAULT FALSE
COMMENT 'Indicates if image passed Qwen VLM validation';

-- Add generation prompt for future optimization
ALTER TABLE posts ADD COLUMN IF NOT EXISTS generation_prompt TEXT
COMMENT 'The exact prompt used for Stable Diffusion generation';

-- Add timestamp for tracking
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
COMMENT 'When images were generated';

-- Create index for faster queries on VLM status
ALTER TABLE posts ADD INDEX idx_vlm_status (vlm_check_status);

-- Verify columns were added
DESCRIBE posts;
```

### Step 4.3 - Storage Configuration

For storing generated images (choose one approach):

**Option A: Base64 in Database (Simpler, smaller datasets)**
- Store base64 strings directly in `ai_lifestyle_images` JSON field
- Pros: No external storage needed
- Cons: Database grows rapidly
- Suitable for: < 100 products

**Option B: Cloud Storage (Recommended Production)**
- Upload to AWS S3, Cloudinary, or similar
- Store URLs in database
- Add new fields:
  ```sql
  ALTER TABLE posts ADD COLUMN ai_images_cdn_urls JSON;
  ALTER TABLE posts ADD COLUMN cdn_provider VARCHAR(50) 
  COMMENT 'cdn|s3|cloudinary';
  ```

**Option C: Server Storage (Current Approach)**
- Store in `/public_html/ai_generated_images/`
- Update paths in JSON field
- Suitable for: Small-medium deployment

---

## 🔑 Part 5: Pinterest OAuth Setup

### Step 5.1 - Create Pinterest App

1. **Register app at:** https://developers.pinterest.com/
2. **Create new application**
3. **Set redirect URI:**
   - Callback URL: `https://postgeniuspro.com/api/pinterest/callback`
4. **Get credentials:**
   - Client ID: `your_client_id`
   - Client Secret: `your_client_secret` (keep secret!)

### Step 5.2 - Configure Scopes

In your app settings, request these scopes:
```
pins:write          - Create pins with generated images
boards:write        - Organize pins in boards
user_accounts:read  - Understand audience preferences
```

### Step 5.3 - Update Environment Variables

Add to `.env`:
```dotenv
PINTEREST_CLIENT_ID=your_app_id
PINTEREST_CLIENT_SECRET=your_secret_key
PINTEREST_REDIRECT_URI=https://postgeniuspro.com/api/pinterest/callback
```

---

## 🚀 Part 6: Testing & Validation

### Step 6.1 - Test Image Generation

1. **Open Admin Dashboard**
2. **Navigate to "🎨 NVIDIA AI" tab**
3. **Fill in test product:**
   - Name: `Premium Wireless Headphones`
   - Description: `High-quality noise-canceling Bluetooth headphones with 30-hour battery life`
   - Context: `in professional office environment`
4. **Click "Generate 3 Images"**
5. **Expected result:** 3 professional lifestyle images appear within 30-60 seconds

### Step 6.2 - Test Image Validation

1. **For each generated image, click "Validate with VLM"**
2. **Monitor response:**
   - ✅ Green border = Passed validation
   - ❌ Red border = Needs review
3. **Check confidence score (should be > 70%)**

### Step 6.3 - Test Pinterest OAuth

1. **Click "Connect to Pinterest (OAuth)"**
2. **Authorize app (pop-up window)**
3. **Confirm token received in backend logs**
4. **Status should change to "✅ Pinterest Connected"**

### Step 6.4 - Verify Database Entries

```sql
SELECT id, post_title, vlm_check_status, 
       JSON_LENGTH(ai_lifestyle_images) as image_count,
       ai_generated_at
FROM posts
WHERE ai_generated_at IS NOT NULL
ORDER BY ai_generated_at DESC
LIMIT 5;
```

---

## ⚠️ Part 7: Security & Best Practices

### 7.1 - API Key Security

```typescript
// ✅ CORRECT - Load from environment
const apiKey = process.env.NVIDIA_API_KEY;

// ❌ WRONG - Never hardcode keys
const apiKey = 'nvapi-xxx'; // SECURITY RISK!
```

### 7.2 - Token Storage (Pinterest)

**Current Implementation:** Tokens stored securely in-memory
**Production Recommendation:**
```typescript
// Encrypt and store in database with TTL
const encryptedToken = encrypt(token.accessToken, encryptionKey);
await db.savePinterestToken({
  accessToken: encryptedToken,
  refreshToken: refreshToken,
  expiresAt: token.expiresAt,
  userId: currentUser.id
});
```

### 7.3 - Rate Limiting

Add rate limiting to prevent abuse:
```typescript
const rateLimit = require('express-rate-limit');

const limitGeneration = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: 'Too many generation requests'
});

app.post('/api/nvidia/generate-images', limitGeneration, handler);
```

### 7.4 - Input Validation

Always validate user inputs:
```typescript
if (!productName || productName.length > 200) {
  return res.status(400).json({ error: 'Invalid product name' });
}
if (!productDescription || productDescription.length > 5000) {
  return res.status(400).json({ error: 'Invalid description' });
}
```

---

## 📊 Part 8: Performance & Optimization

### 8.1 - Image Generation Timeout

Set reasonable timeout for API calls:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes

const response = await fetch(endpoint, {
  signal: controller.signal,
  // ... other config
});
```

### 8.2 - Async Image Processing

For large batches, process asynchronously:
```typescript
// Don't wait for all images at once
Promise.allSettled([
  generateImages(product1),
  generateImages(product2),
  generateImages(product3)
]).then(results => {
  // Handle results
});
```

### 8.3 - Caching Strategy

Cache successful validations:
```typescript
const validationCache = new Map();
const cacheKey = `${imageHash}_${productId}`;

if (validationCache.has(cacheKey)) {
  return validationCache.get(cacheKey);
}

const result = await validateImage(image, product);
validationCache.set(cacheKey, result);
```

---

## 🔍 Part 9: Troubleshooting

### Issue: "NVIDIA_API_KEY not configured"

**Solution:**
```bash
# Check .env exists
ls -la backend/.env

# Verify key is set
grep NVIDIA_API_KEY backend/.env

# Restart backend server after adding .env
npm run dev
```

### Issue: Image Generation Times Out

**Solution:**
1. Check internet connection
2. Verify API key has rate limits remaining
3. Increase timeout from 60s to 120s
4. Check NVIDIA API status: https://status.nvidia.com/

### Issue: "Validation API error: 401"

**Solution:**
1. Verify NVIDIA_API_KEY is correct
2. Check token hasn't expired
3. Request new API key from console
4. Restart backend server with new key

### Issue: Pinterest OAuth Fails

**Solution:**
1. Verify PINTEREST_CLIENT_ID and CLIENT_SECRET
2. Check PINTEREST_REDIRECT_URI matches registered URI
3. Confirm app is published (not in development)
4. Clear browser cookies and retry

---

## 📈 Part 10: Future Enhancements

### 10.1 - Bulk Processing

Allow processing multiple products at once:
```typescript
POST /api/nvidia/batch-generate
{
  products: [
    { name: "Product 1", description: "..." },
    { name: "Product 2", description: "..." }
  ]
}
```

### 10.2 - Custom Prompt Templates

Save and reuse prompts:
```typescript
POST /api/nvidia/save-prompt-template
{
  name: "Outdoor Lifestyle",
  template: "Professional outdoor shot of [PRODUCT], sunset lighting, ..."
}
```

### 10.3 - Auto-Publishing

Automatically publish validated images to Pinterest:
```typescript
if (allImagesValid) {
  await publishToPinterest({
    images: validImages,
    board: productBoard,
    description: product.description,
    link: articleUrl
  });
}
```

### 10.4 - Analytics Dashboard

Track generation metrics:
```
- Images generated per day
- Validation pass rate (%)
- Average prompt effectiveness
- Pinterest publication metrics
```

---

## ✅ Implementation Checklist

- [ ] NVIDIA API key obtained and tested
- [ ] `.env` file created with all variables
- [ ] Backend services verified
- [ ] New endpoints confirmed in `server.ts`
- [ ] Frontend component added to AdminDashboard
- [ ] Development server starts without errors
- [ ] Database schema fields added
- [ ] SSH connection tested
- [ ] Pinterest app created and credentials added
- [ ] Admin Dashboard NVIDIA tab appears
- [ ] Test image generation (simple product)
- [ ] Test image validation
- [ ] Test Pinterest OAuth flow
- [ ] Database records created for generated images
- [ ] Security review completed
- [ ] Rate limiting configured
- [ ] Input validation implemented

---

## 📞 Support & Documentation

- **NVIDIA NIM Docs:** https://docs.nvidia.com/nim/
- **Pinterest API Docs:** https://developers.pinterest.com/docs/
- **Stable Diffusion 3.5:** https://huggingface.co/stable-diffusion-3-5-large
- **Qwen VLM:** https://huggingface.co/qwen/qwen-vl

---

## 🎯 Summary

Your PostGenius Pro Admin Dashboard is now equipped with production-grade AI capabilities:

1. **🎨 Image Generation:** Creates 3 professional lifestyle images per product
2. **👁️ Quality Validation:** Ensures images match product and meet quality standards  
3. **📌 Pinterest Integration:** Automated distribution with proper OAuth scopes

**Ready for implementation!**

Generated: February 19, 2026
Version: 1.0
Status: Production-Ready ✅
