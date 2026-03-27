# 🔧 Post Genius Pro - Developer Task Brief
## برومبت شامل للمبرمج - إصلاح 3 مشاكل حرجة

---

## 🚫⛔ تحذير حرج - اقرأ هذا أولاً قبل أي شيء ⛔🚫

### المنصة تعمل - لا تُعِد بناء أي شيء!

> **هذه منصة إنتاجية (Production) تعمل حالياً وتخدم مستخدمين حقيقيين.**  
> المطلوب هو **إصلاح مشاكل محددة + إضافة ميزات جديدة فقط**.  
> **ممنوع منعاً باتاً:**

- ❌ **لا تغيّر بنية قاعدة البيانات (Database Schema)** الموجودة - أضف جداول/أعمدة جديدة فقط إذا لزم الأمر
- ❌ **لا تغيّر هيكل الملفات أو المجلدات** القائم
- ❌ **لا تحذف أو تعيد كتابة** أي كود موجود يعمل بشكل صحيح
- ❌ **لا تغيّر واجهة المستخدم (UI/UX)** الحالية - أضف عناصر جديدة فقط
- ❌ **لا تغيّر نظام المصادقة (Authentication)** أو صلاحيات المستخدمين
- ❌ **لا تغيّر نظام الـ Routing** القائم
- ❌ **لا تحدّث المكتبات (Dependencies)** بدون إذن مسبق
- ❌ **لا تغيّر إعدادات السيرفر أو الاستضافة** بدون إذن
- ❌ **لا تمس** أي ميزة تعمل حالياً بشكل صحيح

### القواعد الذهبية:

1. **افهم أولاً** → ادرس الكود الموجود بالكامل قبل أي تعديل
2. **Backup أولاً** → اعمل نسخة احتياطية كاملة (كود + قاعدة بيانات) قبل أي تغيير
3. **أضف ولا تستبدل** → الكود الجديد يُضاف بجانب الكود القديم، لا يحل محله
4. **اختبر كل شيء** → بعد كل تعديل، تأكد أن كل الميزات القديمة لا زالت تعمل
5. **وثّق كل تغيير** → اكتب تعليقات واضحة على كل سطر تضيفه أو تعدّله
6. **Git Branch** → اعمل على branch منفصل وليس على main/master مباشرة
7. **اختبر في Staging أولاً** → لا تنشر على Production قبل اختبار كامل

### منهجية العمل المطلوبة:

```
الخطوة 1: اقرأ وافهم الكود الموجود بالكامل
الخطوة 2: حدد بالضبط الملفات التي ستعدّل عليها
الخطوة 3: اعمل backup كامل
الخطوة 4: أنشئ Git branch جديد (مثال: fix/amazon-api-fallback)
الخطوة 5: نفّذ التعديلات المطلوبة فقط
الخطوة 6: اختبر الميزات الجديدة + تأكد أن القديمة لا زالت تعمل
الخطوة 7: أرسل Pull Request مع شرح كامل للتغييرات
الخطوة 8: انتظر الموافقة قبل النشر على Production
```

---

## 📋 نظرة عامة على المشروع

**الموقع:** https://postgeniuspro.com  
**الصفحة المتأثرة:** /generator  
**الحالة:** المنصة تعمل بشكل عام، لكن توجد 3 مشاكل محددة تحتاج إصلاح. باقي الميزات تعمل بشكل سليم ويجب أن تبقى كما هي.

---

## 🚨 المشكلة #1: خطأ Amazon PAAPI - AssociateNotEligible

### الخطأ:
```
Amazon API Error (AssociateNotEligible): Your account does not currently meet the eligibility requirements to access the Product Advertising API.
```

### السبب الجذري:
أمازون غيّرت شروط PAAPI في نوفمبر 2025:
- **القاعدة القديمة:** مبيعة واحدة في 30 يوم تكفي
- **القاعدة الجديدة:** يجب **10 مبيعات مشحونة في آخر 30 يوم** للحفاظ على وصول API
- بالإضافة لذلك، أمازون تنتقل من **PA-API 5.0** إلى **Creators API** الجديد (الموعد النهائي كان 31 يناير 2026)

### المطلوب من المبرمج:

#### 1. نظام Fallback متعدد المستويات لبيانات أمازون:
```
المستوى 1: Amazon PA-API 5.0 (الحالي)
المستوى 2: Amazon Creators API (الجديد - OAuth 2.0)
المستوى 3: Amazon Affiliate Link Builder (بدون API)
المستوى 4: Web Scraping مع Cache (كحل أخير)
```

#### 2. إضافة دعم Amazon Creators API:
- الـ Creators API يستخدم **OAuth 2.0 tokens** وليس AWS keys
- يجب إنشاء credentials جديدة من Associates Central → قسم Creators API
- إضافة حقول جديدة في صفحة الإعدادات:
  - `Creators API Client ID`
  - `Creators API Client Secret`
  - `OAuth Redirect URI`

#### 3. نظام التنقل التلقائي بين المفاتيح:
```javascript
// Pseudocode للمنطق المطلوب:
async function getAmazonProductData(asin) {
  // محاولة 1: PA-API 5.0 مع المفاتيح الحالية
  try {
    const result = await callPAAPI5(asin, currentKeys);
    if (result.error === 'AssociateNotEligible' || result.error === 'TooManyRequests') {
      throw new Error(result.error);
    }
    return result;
  } catch (e) {
    console.log('PA-API 5.0 failed, trying Creators API...');
  }

  // محاولة 2: Creators API الجديد
  try {
    const result = await callCreatorsAPI(asin, creatorsCredentials);
    return result;
  } catch (e) {
    console.log('Creators API failed, trying fallback...');
  }

  // محاولة 3: بناء رابط أفلييت مباشر + بيانات من cache
  try {
    const cachedData = await getCachedProduct(asin);
    if (cachedData && !isExpired(cachedData)) {
      return cachedData;
    }
  } catch (e) {
    console.log('Cache miss');
  }

  // محاولة 4: إرجاع رابط أفلييت أساسي بدون بيانات تفصيلية
  return {
    title: `Amazon Product (${asin})`,
    url: `https://www.amazon.com/dp/${asin}?tag=${associateTag}`,
    fallback: true
  };
}
```

#### 4. تحديث صفحة إعدادات Amazon Associates:
- إضافة حقل **API Mode** مع خيارات: `PA-API 5.0` / `Creators API` / `Auto (Fallback)`
- إضافة زر **Test Connection** لكل نوع API
- إضافة مؤشر حالة الاتصال (أخضر/أحمر)
- عرض رسالة واضحة عند فشل الاتصال مع شرح السبب والحل

#### 5. نظام Cache ذكي:
- Cache بيانات المنتجات لمدة 24 ساعة
- إذا فشل API، استخدم بيانات Cache القديمة مع تنبيه
- تخزين: العنوان، السعر، الصورة، التقييم، رابط الأفلييت

---

## 🚨 المشكلة #2: فشل إنشاء الصور + التنقل بين مفاتيح API

### الخطأ:
```
⚠️ Unable to Generate
Could not verify product content. Could not read content from the URL. 
The website might block automated access.
```

### السبب:
النظام يحاول جلب محتوى من URL خارجي (مثل صفحة منتج أمازون) لإنشاء محتوى، لكن الموقع يحجب الوصول الآلي (bot protection).

### المطلوب من المبرمج:

#### 1. إصلاح نظام جلب المحتوى من URLs:
```javascript
// إضافة Headers مناسبة لتجاوز حجب الروبوتات
const fetchOptions = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0'
  },
  timeout: 15000,
  // إضافة retry logic
  retries: 3,
  retryDelay: 2000
};
```

#### 2. نظام Proxy/Fallback لجلب المحتوى:
```
المستوى 1: جلب مباشر مع Headers مناسبة
المستوى 2: استخدام Proxy service
المستوى 3: استخدام Headless Browser (Puppeteer/Playwright)
المستوى 4: استخراج البيانات من Amazon API مباشرة (بدون URL scraping)
```

#### 3. نظام التنقل بين مفاتيح إنشاء الصور (Image Generation API Keys):
```javascript
// دعم مفاتيح متعددة مع تنقل تلقائي
const imageAPIKeys = [
  { provider: 'openai', key: 'sk-xxx1', priority: 1, active: true },
  { provider: 'openai', key: 'sk-xxx2', priority: 2, active: true },
  { provider: 'stability', key: 'sk-yyy', priority: 3, active: true },
];

async function generateImage(prompt) {
  // ترتيب المفاتيح حسب الأولوية
  const sortedKeys = imageAPIKeys
    .filter(k => k.active)
    .sort((a, b) => a.priority - b.priority);

  for (const keyConfig of sortedKeys) {
    try {
      const result = await callImageAPI(keyConfig.provider, keyConfig.key, prompt);
      return result;
    } catch (error) {
      console.log(`Key ${keyConfig.key.slice(-4)} failed: ${error.message}`);
      
      // إذا كان الخطأ بسبب rate limit أو مفتاح منتهي
      if (error.status === 429 || error.status === 401) {
        keyConfig.active = false; // تعطيل مؤقت
        setTimeout(() => { keyConfig.active = true; }, 60000); // إعادة تفعيل بعد دقيقة
        continue; // انتقل للمفتاح التالي
      }
    }
  }
  
  throw new Error('All image generation keys exhausted');
}
```

#### 4. إضافة واجهة إدارة مفاتيح الصور في الإعدادات:
- قائمة المفاتيح مع إمكانية إضافة/حذف/ترتيب
- مؤشر حالة كل مفتاح (نشط/منتهي/محدود)
- عرض الاستهلاك لكل مفتاح
- زر اختبار لكل مفتاح

---

## 🚨 المشكلة #3: إضافة زر "إعادة إنشاء الصور" (Regenerate)

### المطلوب:

#### 1. زر Regenerate في كل مكان يوجد فيه صور:

**صور المنتجات (Amazon Product Comparison):**
```html
<!-- إضافة زر regenerate لكل صورة منتج -->
<div class="product-card">
  <div class="product-image-container">
    <img src="..." alt="product" />
    <button class="regenerate-btn" 
            onclick="regenerateImage('product', productId)"
            title="إعادة إنشاء الصورة">
      🔄 Regenerate
    </button>
  </div>
  <h3>Product Name</h3>
  <span class="price">$XX.XX</span>
  <a href="..." class="view-on-amazon">View on Amazon</a>
</div>
```

**صور المقالة (Article/Blog Images):**
```html
<!-- إضافة زر regenerate لصور المقالة -->
<div class="article-image-container">
  <img src="..." alt="article image" />
  <button class="regenerate-btn"
          onclick="regenerateImage('article', articleId, sectionIndex)"
          title="إعادة إنشاء الصورة">
    🔄 Regenerate Image
  </button>
</div>
```

#### 2. Backend API endpoint للـ Regenerate:
```javascript
// POST /api/regenerate-image
{
  "type": "product" | "article" | "comparison",
  "id": "item_id",
  "sectionIndex": 0, // للمقالات - أي قسم
  "prompt": "optional custom prompt",
  "forceNewKey": false // إجبار استخدام مفتاح مختلف
}

// Response
{
  "success": true,
  "newImageUrl": "https://...",
  "keyUsed": "openai-key-1",
  "cached": false
}
```

#### 3. سلوك الزر:
- عند الضغط: يظهر **loading spinner** مكان الصورة
- عند النجاح: يُحدّث الصورة مباشرة بدون إعادة تحميل الصفحة
- عند الفشل: يعرض رسالة خطأ مع خيار المحاولة مرة أخرى
- يجب أن ينتقل تلقائياً بين مفاتيح API إذا فشل المفتاح الأول

#### 4. CSS للزر:
```css
.regenerate-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 10;
}

.product-image-container:hover .regenerate-btn,
.article-image-container:hover .regenerate-btn {
  opacity: 1;
}

.regenerate-btn:hover {
  background: rgba(0, 0, 0, 0.9);
}

.regenerate-btn.loading {
  pointer-events: none;
  opacity: 0.6;
}

/* تأكد أن الحاوية relative */
.product-image-container,
.article-image-container {
  position: relative;
}
```

---

## 📊 ملخص الأولويات

| الأولوية | المهمة | التأثير |
|----------|--------|---------|
| 🔴 حرج | إصلاح Amazon API (Fallback + Creators API) | المنصة لا تعمل بدونه |
| 🔴 حرج | إصلاح جلب المحتوى من URLs | إنشاء المحتوى متوقف |
| 🟡 مهم | نظام تنقل مفاتيح الصور | يمنع التوقف المستقبلي |
| 🟡 مهم | زر Regenerate للصور | تحسين تجربة المستخدم |
| 🟢 تحسين | Cache ذكي لبيانات المنتجات | أداء أفضل + مقاومة للأخطاء |
| 🟢 تحسين | واجهة إدارة المفاتيح | سهولة الإدارة |

---

## ⚙️ متطلبات تقنية عامة

### ⚠️ تذكير: احترم النظام القائم!
- كل الأكواد الجديدة يجب أن تتبع **نفس النمط (Pattern)** المستخدم في الكود الحالي
- استخدم **نفس المكتبات والأدوات** الموجودة في المشروع
- اتبع **نفس أسلوب التسمية (Naming Convention)** المستخدم
- اتبع **نفس هيكل الملفات** الموجود
- إذا الكود الحالي يستخدم TypeScript، اكتب TypeScript. إذا JavaScript، اكتب JavaScript
- إذا الكود الحالي يستخدم REST API، لا تضيف GraphQL والعكس صحيح
- **لا تغيّر أي ملف لا علاقة له بالمشاكل الثلاثة المذكورة**

### قبل البدء:
1. **اعمل backup كامل** للكود وقاعدة البيانات
2. **افهم النظام الحالي بالكامل** قبل أي تعديل - اقرأ كل ملف ذي صلة
3. **حدد الملفات المتأثرة فقط** واعمل عليها فقط
4. **اختبر في بيئة staging** قبل النشر على production
5. **تحقق من Database** - تأكد من سلامة الجداول والعلاقات (بدون تغيير أي شيء موجود)

### فحص Database:
```sql
-- تحقق من جدول إعدادات API
SELECT * FROM settings WHERE category = 'amazon';
SELECT * FROM settings WHERE category = 'image_api';

-- تحقق من جدول المنتجات المخزنة
SELECT * FROM products ORDER BY updated_at DESC LIMIT 10;

-- تحقق من جدول الصور المنتجة
SELECT * FROM generated_images ORDER BY created_at DESC LIMIT 10;

-- تحقق من الأخطاء المسجلة
SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 20;
```

### بعد الانتهاء:
1. اختبر كل ميزة على حدة
2. اختبر السيناريوهات السلبية (API down, invalid keys, timeout)
3. تأكد من عمل الـ Fallback بشكل صحيح
4. وثّق كل التغييرات

---

## 🔗 مراجع مهمة

- [Amazon Creators API Migration](https://www.keywordrush.com/blog/amazon-creator-api-what-changed-and-how-to-switch/)
- [AssociateNotEligible Error - New 10 Sales Rule](https://www.keywordrush.com/blog/amazon-pa-api-associatenoteligible-error-is-there-a-new-10-sales-rule/)
- [PA-API 5.0 Rate Limits](https://webservices.amazon.com/paapi5/documentation/troubleshooting/api-rates.html)
- [PA-API 429 TooManyRequests Fix](https://www.keywordrush.com/blog/fix-amazon-paapi-too-many-requests/)

---

## ✅ قائمة التحقق قبل التسليم (Checklist)

### اختبار الميزات الجديدة:
- [ ] Amazon Fallback يعمل (PA-API → Creators API → Cache → Basic Link)
- [ ] إنشاء الصور يعمل مع تنقل بين المفاتيح
- [ ] زر Regenerate يظهر ويعمل في صور المنتجات
- [ ] زر Regenerate يظهر ويعمل في صور المقالات
- [ ] صفحة الإعدادات محدّثة بالحقول الجديدة

### اختبار أن النظام القديم لم يتأثر:
- [ ] إنشاء المقالات يعمل كما كان
- [ ] Amazon Product Comparison يعرض بشكل صحيح
- [ ] أزرار "View on Amazon" و "Check Price on Amazon" تعمل
- [ ] نظام المصادقة وتسجيل الدخول يعمل
- [ ] كل الصفحات الأخرى تعمل بدون أخطاء
- [ ] قاعدة البيانات سليمة وبدون أخطاء
- [ ] الأداء لم يتأثر (سرعة التحميل)
- [ ] لا أخطاء جديدة في Console أو Logs
- [ ] كل الروابط تعمل
- [ ] الـ SEO لم يتأثر (meta tags, sitemap, etc.)

### التوثيق:
- [ ] كل التغييرات موثقة في Pull Request
- [ ] تعليقات واضحة على كل كود جديد
- [ ] قائمة بالملفات التي تم تعديلها
- [ ] شرح كيفية تهيئة المفاتيح الجديدة
