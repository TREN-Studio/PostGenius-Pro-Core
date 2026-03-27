# Featured Image Handling Implementation

## Overview
We have implemented a flexible system for handling featured images in WordPress to address compatibility issues with different Gutenberg themes. This allows users to control how the featured image is displayed and prevents duplication or missing images.

## Problem
Different WordPress themes handle featured images differently:
- Some display them automatically at the top of the post.
- Some use them as hero backgrounds.
- Some don't display them at all, expecting them to be in the content.
- Our previous implementation was injecting a `wp:cover` block which caused duplication in themes that also displayed the featured image.

## Solution
We added a `featuredImageHandling` configuration option to the WordPress settings with three modes:

### 1. **Theme Default (Recommended)** (`theme_default`)
- **Behavior:** Sets the `featured_media` ID in the WordPress post metadata.
- **Content:** Does NOT inject the image into the post content.
- **Use Case:** Best for most modern themes (Astra, GeneratePress, Kadence) that automatically display the featured image at the top of the post.
- **Result:** One clean featured image displayed by the theme.

### 2. **Skip Featured Image** (`skip_featured`)
- **Behavior:** Does NOT set the `featured_media` ID in the metadata.
- **Content:** Does NOT inject the image into the post content.
- **Use Case:** 
  - When the user wants to manually place the image in the content later.
  - When the theme has a specific way of handling images that conflicts with standard methods.
- **Result:** No featured image is set or displayed automatically.

### 3. **Force Gutenberg Cover Block** (`gutenberg_cover`)
- **Behavior:** Sets the `featured_media` ID in the metadata.
- **Content:** Injects a full-width `wp:cover` block at the very beginning of the post content.
- **Use Case:** For themes that DO NOT display the featured image automatically on the single post page (e.g., some FSE themes or bare-bones themes).
- **Result:** The image is shown as a hero cover at the top of the content, and is also set as the featured image for archive pages/thumbnails.

## Implementation Details

### **1. Type Definitions (`types.ts`)**
Updated `WordPressConfig` interface to include the new option:
```typescript
featuredImageHandling?: 'theme_default' | 'skip_featured' | 'gutenberg_cover';
```

### **2. UI Update (`components/UrlInput.tsx`)**
Added a dropdown menu in the "WordPress Publishing" configuration section:
- Users can easily select their preferred mode.
- Includes tooltips and helper text explaining each option.

### **3. Logic Update (`services/wordpressService.ts`)**
Modified the `publishPost` function to respect the selected mode:
- Checks `config.featuredImageHandling`.
- Conditionally injects the `wp:cover` block if mode is `gutenberg_cover`.
- Conditionally sets `postData.featured_media` based on the mode.

## How to Test
1. **Theme Default:** Select "Theme Default", publish a post. Check if your theme shows the image at the top. If yes, this is the correct setting.
2. **Duplicate Image?** If you see two images at the top, your theme might be showing one and we might have been injecting one (in the old version). With "Theme Default", this should be fixed.
3. **No Image?** If you see NO image at the top with "Theme Default", switch to "Force Gutenberg Cover Block" and republish. You should now see a hero image.

## Files Modified
- `types.ts`
- `App.tsx` (Default config update)
- `components/UrlInput.tsx`
- `services/wordpressService.ts`
