---
description: Monthly Article Limit Implementation Summary
---

# Monthly Article Limit with Device Fingerprinting

## Overview
Implemented a robust monthly article limit system (10 articles/month) with device fingerprinting to prevent circumvention. Admin users have unlimited access.

## Files Created/Modified

### 1. **utils/deviceFingerprint.ts** (NEW)
- Generates unique device fingerprints using:
  - Screen resolution & color depth
  - Timezone & language
  - Platform & User Agent
  - CPU cores & device memory
  - Canvas fingerprinting
  - WebGL fingerprinting
- Hashes fingerprint using SHA-256
- Stores in localStorage for persistence

### 2. **hooks/useUsageTracker.ts** (MODIFIED)
- Changed from unlimited to 10 articles/month limit
- Tracks usage per device fingerprint
- Automatically resets counter at start of each month
- Blocks device until next month after limit reached
- Admin bypass: `userRole === 'admin'` → unlimited
- Subscription bypass: `hasSubscription === true` → unlimited
- Returns:
  - `usageCount`: Current month's article count
  - `isBlocked`: Whether device is blocked
  - `remainingArticles`: Articles left this month
  - `resetDate`: When counter resets
  - `currentMonth`: Current month (YYYY-MM format)
  - `deviceFingerprint`: Unique device ID

### 3. **types.ts** (NEEDS MANUAL UPDATE)
Add to `UserProfile` interface (lines 120-130):
```typescript
export interface UserProfile {
  id: string;
  updated_at: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  role: 'admin' | 'user';
  style_config?: StyleConfig | null;
  // ADD THESE THREE LINES:
  has_subscription?: boolean;
  subscription_expires_at?: string | null;
  subscription_type?: 'monthly' | 'yearly' | null;
}
```

### 4. **App.tsx** (NEEDS UPDATE)
Update the `useUsageTracker` hook call (around line 172):
```typescript
// OLD:
const { usageCount, isBlocked, incrementUsage } = useUsageTracker();

// NEW:
const { usageCount, isBlocked, incrementUsage, remainingArticles, resetDate } = useUsageTracker(
  userRole,
  userProfile?.has_subscription
);
```

Add blocking UI before article generation (around line 441):
```typescript
const handleGenerate = async () => {
  // ADD THIS CHECK:
  if (isBlocked && userRole !== 'admin') {
    const resetDateStr = resetDate.toLocaleDateString();
    setError(`Monthly limit reached (10 articles). Your limit will reset on ${resetDateStr}. Upgrade to Pro for unlimited articles.`);
    return;
  }
  
  // ... rest of existing code
}
```

## Database Schema Update (Supabase)

Run this SQL in Supabase SQL Editor:

```sql
-- Add subscription fields to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS has_subscription BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_type TEXT CHECK (subscription_type IN ('monthly', 'yearly'));

-- Create index for faster subscription queries
CREATE INDEX IF NOT EXISTS idx_profiles_subscription 
ON profiles(has_subscription, subscription_expires_at);

-- Function to check if subscription is active
CREATE OR REPLACE FUNCTION is_subscription_active(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND has_subscription = TRUE
    AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## How It Works

1. **Device Fingerprinting**: When user first visits, a unique fingerprint is generated and stored
2. **Monthly Tracking**: Usage is tracked per month (YYYY-MM format)
3. **Automatic Reset**: Counter resets to 0 at the start of each new month
4. **Blocking**: After 10 articles, device is blocked until next month
5. **Admin Bypass**: Users with `role === 'admin'` have unlimited access
6. **Subscription Bypass**: Users with active subscription have unlimited access

## Testing

1. **Test Normal User**:
   - Generate 10 articles
   - 11th attempt should be blocked
   - Wait for next month or manually change `month` in localStorage

2. **Test Admin**:
   - Set user role to 'admin' in database
   - Should have unlimited access

3. **Test Subscription**:
   - Set `has_subscription = true` in database
   - Should have unlimited access

## Security Features

- Device fingerprint prevents simple workarounds (clearing cookies, incognito mode)
- Fingerprint includes hardware-level data (GPU, CPU, screen)
- SHA-256 hashing prevents fingerprint tampering
- Monthly reset is automatic and server-time independent
- Admin role check prevents privilege escalation

## Future Enhancements

1. Server-side validation (currently client-side only)
2. IP-based rate limiting as additional layer
3. Subscription payment integration (Stripe/PayPal)
4. Usage analytics dashboard for admins
5. Email notifications before limit reached
