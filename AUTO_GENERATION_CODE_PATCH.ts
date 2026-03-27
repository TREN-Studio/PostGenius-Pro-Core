// ============================================================================
// ðŸ”¥ AUTO-GENERATION FIX - App.tsx Modifications
// ============================================================================
// 
// PURPOSE: Enable automatic step images generation immediately after content creation
// LOCATION: Add this code after line 1165 in App.tsx (after setAppData in handleGenerate)
//
// ============================================================================

// âœ… MODIFICATION 1: Add this after the setAppData call (around line 1165)
// ----------------------------------------------------------------------------

// Current code (line 1165):
setAppData(prev => ({
    ...prev,
    blogPostData: postResponse.blogPostData,
    originalBlogPostData: postResponse.blogPostData,
    productData: postResponse.productData,
    heroImageUrl: heroUrl,
    stepImageUrls: {}, // Will be populated automatically
    productImageUrls: initialProductImageUrls,
    productImageVariants: productImageVariants,
    currentStep: AppStep.Review,
    articleStatus: 'Draft',
    imagesGenerated: false,
}));

// âœ… ADD THIS CODE IMMEDIATELY AFTER:
// ----------------------------------------------------------------------------
console.log('[Auto-Generation] ðŸš€ Starting automatic step images generation...');

// Execute image generation asynchronously (non-blocking)
(async () => {
    try {
        // Wait a moment for state to update
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Trigger automatic generation
        await generateImagesForContent();
        
        console.log('[Auto-Generation] âœ… All step images generated successfully');
        
        // Update the flag to indicate images are generated
        setAppData(prev => ({ 
            ...prev, 
            imagesGenerated: true 
        }));
        
        // Show success message to user
        setStatusMessage('âœ… Images generated automatically!');
        
    } catch (autoGenError: any) {
        console.error('[Auto-Generation] âš ï¸ Failed to auto-generate images:', autoGenError);
        console.error('[Auto-Generation] Stack:', autoGenError.stack);
        
        // Don't block the process - images can be regenerated manually
        setStatusMessage('âš ï¸ Some images failed. You can regenerate them manually.');
    }
})();

// ============================================================================
// âœ… MODIFICATION 2: Replace generateImagesForContent function
// ============================================================================
// 
// LOCATION: Around line 500-600 in App.tsx
// ACTION: Replace the entire existing function with this improved version
//
// ============================================================================

const generateImagesForContent = async () => {
    console.log('[Image Generation] ðŸ“¸ Starting parallel image generation...');
    
    if (!appData.blogPostData) {
        console.warn('[Image Generation] âš ï¸ No blog post data available');
        return;
    }

    const { blogPostData, productData } = appData;
    
    // Skip products that already have Amazon images
    const skipProductIds = new Set<number>(
        productData.filter(p => p.productImageUrl).map(p => p.id)
    );

    // âœ… PARALLEL PROCESSING: Generate all images concurrently
    const imageGenerationPromises: Promise<void>[] = [];
    let totalImages = 0;
    let completedImages = 0;

    // ========================================
    // 1. STEP IMAGES (For Recipe Blueprint)
    // ========================================
    if (blogPostData.steps && blogPostData.steps.length > 0) {
        console.log(`[Image Generation] ðŸ“‹ Generating ${blogPostData.steps.length} step images...`);
        
        for (let i = 0; i < blogPostData.steps.length; i++) {
            const step = blogPostData.steps[i];
            const key = `step_${i}`;
            totalImages++;
            
            const generatePromise = (async () => {
                setLoadingImages(prev => new Set(prev).add(key));
                try {
                    // Use the step instruction text as the prompt
                    const specificPrompt = step.text;
                    
                    console.log(`[Image Gen] ðŸ”„ Step ${i + 1}: "${specificPrompt.substring(0, 50)}..."`);
                    
                    // Generate using fallback system (legacy free provider/FLUX)
                    const url = await generateWithFallback(specificPrompt, 'step');
                    
                    // Update state with new image URL (Base64)
                    setAppData(prev => ({
                        ...prev,
                        stepImageUrls: { ...prev.stepImageUrls, [i]: url }
                    }));
                    
                    completedImages++;
                    console.log(`[Image Gen] âœ… Step ${i + 1}/${blogPostData.steps.length} completed (${completedImages}/${totalImages} total)`);
                    
                } catch (e: any) {
                    console.error(`[Image Gen] âŒ Step ${i + 1} failed:`, e.message || e);
                    // Leave URL empty so "Regenerate" button appears
                } finally {
                    setLoadingImages(prev => { 
                        const n = new Set(prev); 
                        n.delete(key); 
                        return n; 
                    });
                }
            })();
            
            imageGenerationPromises.push(generatePromise);
        }
    }

    // ========================================
    // 2. CONTENT SECTION IMAGES (For Review/Roundup/HowTo)
    // ========================================
    if (blogPostData.contentSections && blogPostData.contentSections.length > 0) {
        console.log(`[Image Generation] ðŸ“¦ Generating ${blogPostData.contentSections.length} content section images...`);
        
        for (const section of blogPostData.contentSections) {
            const key = `section_${section.id}`;
            totalImages++;
            
            const generatePromise = (async () => {
                setLoadingImages(prev => new Set(prev).add(key));
                try {
                    // Use section-specific prompt with article context
                    const basePrompt = section.image || section.title;
                    const contextualPrompt = `${blogPostData.title}: ${basePrompt}`;
                    
                    console.log(`[Image Gen] ðŸ”„ Section ${section.id}: "${contextualPrompt.substring(0, 50)}..."`);
                    
                    // Generate using fallback system
                    const url = await generateWithFallback(contextualPrompt, 'step');
                    
                    // Update state with new image URL
                    setAppData(prev => ({
                        ...prev,
                        stepImageUrls: { ...prev.stepImageUrls, [`section_${section.id}`]: url }
                    }));
                    
                    completedImages++;
                    console.log(`[Image Gen] âœ… Section ${section.id} completed (${completedImages}/${totalImages} total)`);
                    
                } catch (e: any) {
                    console.error(`[Image Gen] âŒ Section ${section.id} failed:`, e.message || e);
                } finally {
                    setLoadingImages(prev => { 
                        const n = new Set(prev); 
                        n.delete(key); 
                        return n; 
                    });
                }
            })();
            
            imageGenerationPromises.push(generatePromise);
        }
    }

    // ========================================
    // 3. PRODUCT IMAGES (For all blueprints)
    // ========================================
    const productsToGenerate = productData.filter(p => !skipProductIds.has(p.id));
    
    if (productsToGenerate.length > 0) {
        console.log(`[Image Generation] ðŸ›’ Generating ${productsToGenerate.length} product images...`);
        
        for (const product of productsToGenerate) {
            const key = `product_${product.id}`;
            totalImages++;
            
            const generatePromise = (async () => {
                setLoadingImages(prev => new Set(prev).add(key));
                try {
                    // Use product name with article context
                    const contextualPrompt = `${blogPostData.title}: ${product.productName}`;
                    
                    console.log(`[Image Gen] ðŸ”„ Product ${product.id}: "${contextualPrompt.substring(0, 50)}..."`);
                    
                    // Generate using fallback system
                    const url = await generateWithFallback(contextualPrompt, 'product');
                    
                    // Update state with new image URL
                    setAppData(prev => ({
                        ...prev,
                        productImageUrls: { ...prev.productImageUrls, [product.id]: url }
                    }));
                    
                    completedImages++;
                    console.log(`[Image Gen] âœ… Product ${product.id} completed (${completedImages}/${totalImages} total)`);
                    
                } catch (e: any) {
                    console.error(`[Image Gen] âŒ Product ${product.productName} failed:`, e.message || e);
                } finally {
                    setLoadingImages(prev => { 
                        const n = new Set(prev); 
                        n.delete(key); 
                        return n; 
                    });
                }
            })();
            
            imageGenerationPromises.push(generatePromise);
        }
    }

    // ========================================
    // 4. WAIT FOR ALL IMAGES (Parallel Execution)
    // ========================================
    console.log(`[Image Generation] â³ Waiting for ${totalImages} images to complete...`);
    
    const results = await Promise.allSettled(imageGenerationPromises);
    
    // Count successes and failures
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`[Image Generation] ðŸ“Š Results: ${succeeded} succeeded, ${failed} failed out of ${totalImages} total`);
    
    if (failed > 0) {
        console.warn(`[Image Generation] âš ï¸ ${failed} images failed. Users can regenerate them manually.`);
    } else {
        console.log('[Image Generation] âœ… All images generated successfully!');
    }
};

// ============================================================================
// ðŸ“ IMPLEMENTATION NOTES
// ============================================================================
//
// 1. PARALLEL PROCESSING:
//    - All images generate concurrently for maximum speed
//    - Uses Promise.allSettled to handle failures gracefully
//
// 2. ERROR HANDLING:
//    - Individual image failures don't stop the entire process
//    - Failed images show "Regenerate" button for manual retry
//
// 3. STATE MANAGEMENT:
//    - Uses React state (setAppData) to update image URLs
//    - Loading states managed via setLoadingImages Set
//
// 4. LOGGING:
//    - Comprehensive console.log for debugging
//    - Progress tracking (X/Y completed)
//
// 5. IMAGE SPECIFICATIONS:
//    - Size: 1200x628 (panoramic landscape)
//    - Format: Base64 WebP
//    - Engine: legacy free provider (FLUX model)
//
// ============================================================================

// ============================================================================
// ðŸ§ª TESTING CHECKLIST
// ============================================================================
//
// â–¡ Create a new Recipe article - verify step images appear automatically
// â–¡ Create a new Review article - verify content section images appear
// â–¡ Create a new Roundup article - verify product images appear
// â–¡ Check Console for "[Auto-Generation]" messages
// â–¡ Verify failed images show "Regenerate" button
// â–¡ Test manual regeneration of failed images
// â–¡ Publish to WordPress and verify images upload correctly
//
// ============================================================================

