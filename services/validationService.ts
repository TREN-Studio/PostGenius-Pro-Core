
import Ajv from 'ajv';
import type { BlogPostData, ExtractedRecipeData, AmazonProduct, CombinedPostResponse } from '../types';

const ajv = new Ajv();

const amazonProductSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    productName: { type: 'string', minLength: 1 },
    isPrimary: { type: 'boolean' },
    price: { type: 'string' },
    imageUrl: { type: 'string' },
    specs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['key', 'value'],
        additionalProperties: false,
      }
    }
  },
  required: ['id', 'productName', 'isPrimary'],
  additionalProperties: true,
};

const imageMetadataSchema = {
  type: 'object',
  properties: {
    alt: { type: 'string' },
    title: { type: 'string' },
    caption: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['alt', 'title', 'caption', 'description'],
  additionalProperties: false,
};

const blogPostDataSchema = {
  type: 'object',
  properties: {
    niche: { type: 'string' },
    title: { type: 'string', minLength: 1 },
    category: { type: 'string', minLength: 1 },
    heroImage: { type: 'string', minLength: 1 },
    heroImageMetadata: imageMetadataSchema,
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', minLength: 1 },
          image: { type: 'string', minLength: 1 },
          imageMetadata: imageMetadataSchema,
        },
        required: ['text', 'image', 'imageMetadata'],
        additionalProperties: true,
      },
    },
    contentSections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string', minLength: 1 },
          text: { type: 'string', minLength: 1 },
          image: { type: 'string', minLength: 1 },
          imageMetadata: imageMetadataSchema,
        },
        required: ['id', 'title', 'text', 'image', 'imageMetadata'],
        additionalProperties: true,
      },
    },
    prepTime: { type: 'string' },
    cookTime: { type: 'string' },
    servings: { type: 'string' },
    difficulty: { type: 'string' },
    calories: { type: 'string' },
    tags: {
      type: 'object',
      properties: {
        course: { type: 'array', items: { type: 'string' } },
        cuisine: { type: 'array', items: { type: 'string' } },
        keywords: { type: 'array', items: { type: 'string' } },
      },
      required: ['course', 'cuisine', 'keywords'],
      additionalProperties: false,
    },
    seo: {
      type: 'object',
      properties: {
        metaTitle: { type: 'string', minLength: 1 },
        metaDescription: { type: 'string', minLength: 1 },
        focusKeyphrase: { type: 'string', minLength: 1 },
      },
      required: ['metaTitle', 'metaDescription', 'focusKeyphrase'],
      additionalProperties: false,
    },
    tips: { type: 'array', items: { type: 'string' } },
    nutritionalInfo: { type: 'array', items: { type: 'string' } },
    faq: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
        additionalProperties: false,
      },
    },
    htmlContent: { type: 'string', minLength: 1 },
    whyYoullLoveThis: { type: 'string' },
    productReviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'integer' },
          reviewText: { type: 'string' },
        },
        required: ['productId', 'reviewText'],
      },
    },
  },
  // Strict validation: Only require fields common to ALL blueprints.
  // Everything else (ingredients, steps, nutritionalInfo, etc.) must be optional.
  required: [
    'niche', 'title', 'category', 'heroImage', 'heroImageMetadata',
    'tags', 'seo', 'htmlContent'
  ],
  additionalProperties: true, // Allow for unexpected fields from AI
};

export const extractedRecipeDataSchema = {
  type: 'object',
  properties: {
    niche: { type: 'string' },
    title: { type: 'string', minLength: 1 },
    ingredients: { type: 'array', items: { type: 'string' } },
    instructions: { type: 'array', items: { type: 'string' } },
    prepTime: { type: 'string' },
    cookTime: { type: 'string' },
    servings: { type: 'string' },
    difficulty: { type: 'string' },
    calories: { type: 'string' },
    products: {
      type: 'array',
      items: amazonProductSchema
    }
  },
  required: ['niche', 'title', 'ingredients', 'instructions', 'products'],
  additionalProperties: true, // Allow optional fields like prepTime and other unexpected fields
};

export const combinedPostResponseSchema = {
  type: 'object',
  properties: {
    blogPostData: blogPostDataSchema,
    productData: {
      type: 'array',
      items: amazonProductSchema,
    },
  },
  required: ['blogPostData', 'productData'],
  additionalProperties: true,
};

const validateBlogPost = ajv.compile<BlogPostData>(blogPostDataSchema);
const validateExtractedRecipe = ajv.compile<ExtractedRecipeData>(extractedRecipeDataSchema);
const validateCombinedPost = ajv.compile<CombinedPostResponse>(combinedPostResponseSchema);


const formatErrors = (errors: typeof validateBlogPost.errors): string => {
  if (!errors) return 'Unknown validation error';
  return errors.map(e => `Field '${e.instancePath.substring(1) || 'root'}' ${e.message}`).join(', ');
};

export const validateAndParseBlogPost = (rawData: unknown): BlogPostData => {
  let data = (rawData && typeof rawData === 'object' ? { ...rawData } : {}) as any;
  
  // Inject safety fallbacks to prevent any crash
  data.niche = data.niche || "General";
  data.title = data.title || "Generated Article";
  data.category = data.category || "General";
  data.heroImage = data.heroImage || "";
  data.heroImageMetadata = data.heroImageMetadata || { alt: "", title: "", caption: "", description: "" };
  data.tags = data.tags || { course: [], cuisine: [], keywords: [] };
  data.seo = data.seo || { metaTitle: data.title, metaDescription: "An automatically generated article.", focusKeyphrase: data.niche };
  data.htmlContent = data.htmlContent || "<p>Content generation partial failure.</p>";
  
  if (!validateBlogPost(data)) {
    console.warn(`[Bulletproof] AI response failed blog post schema validation, but proceeding with patched data: ${formatErrors(validateBlogPost.errors)}`);
  }
  return data as BlogPostData;
};

export const validateAndParseExtractedRecipe = (rawData: unknown): ExtractedRecipeData => {
  let data = (rawData && typeof rawData === 'object' ? { ...rawData } : {}) as any;
  
  // Inject safety fallbacks
  data.niche = data.niche || "General";
  data.title = data.title || "Extracted Content";
  data.ingredients = data.ingredients || [];
  data.instructions = data.instructions || [];
  data.products = data.products || [];
  
  if (!validateExtractedRecipe(data)) {
    console.warn(`[Bulletproof] AI response failed extracted recipe validation, but proceeding with patched data: ${formatErrors(validateExtractedRecipe.errors)}`);
  }
  return data as ExtractedRecipeData;
};

export const validateAndParseCombinedPost = (rawData: unknown): CombinedPostResponse => {
  let data = (rawData && typeof rawData === 'object' ? { ...rawData } : {}) as any;
  
  data.blogPostData = data.blogPostData || {};
  data.productData = data.productData || [];
  
  // Safely parse the blogPostData part which handles its own defaults
  data.blogPostData = validateAndParseBlogPost(data.blogPostData);
  
  if (!validateCombinedPost(data)) {
    console.warn(`[Bulletproof] AI response failed combined schema validation, proceeding: ${formatErrors(validateCombinedPost.errors)}`);
  }
  return data as CombinedPostResponse;
};

/**
 * Checks if a string is a valid HTTP/HTTPS URL
 * @param string The string to check
 * @returns true if valid URL, false otherwise
 */
export const isValidUrl = (string: string): boolean => {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
};
