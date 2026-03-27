
export interface StyleConfig {
  custom_primary_color: string;
  custom_secondary_color: string;
  custom_background_style: 'White' | 'Dark' | 'Transparent';
  custom_font_family: string;
}

// Shim for Supabase types which might be missing or different in the installed version
export interface User {
  id: string;
  email?: string;
  aud?: string;
  created_at?: string;
}

export interface Session {
  user: User | null;
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
}



export interface ImageMetadata {
  alt: string;
  title: string;
  caption: string;
  description: string;
}

export interface SEOData {
  metaTitle: string;
  metaDescription: string;
  focusKeyphrase: string;
}

export interface Tags {
  course: string[];
  cuisine: string[];
  keywords: string[];
}

export interface Step {
  id: number;
  text: string;
  image: string; // This is an image generation prompt
  imageMetadata?: ImageMetadata;
}

export interface ContentSection {
  id: number;
  title: string;        // Section heading (e.g., "Design and Comfort")
  text: string;         // Section content
  image: string;        // AI image generation prompt
  imageMetadata?: ImageMetadata;
}

export interface BlogPostData {
  niche: string; // e.g., 'food', 'travel', 'diy', 'roundup', 'review', 'howto'
  title: string;
  category: string;
  heroImage: string; // This is an image generation prompt
  heroImageMetadata: ImageMetadata;
  ai_lifestyle_images?: string[] | Array<{ url?: string; src?: string; imageUrl?: string; image?: string }>;
  aiLifestyleImages?: string[] | Array<{ url?: string; src?: string; imageUrl?: string; image?: string }>;
  ingredients?: string[];
  steps?: Step[];                    // For recipe blueprint only
  contentSections?: ContentSection[]; // For roundup, review, howto blueprints (3-5 sections)
  prepTime?: string;
  cookTime?: string;
  servings?: string;
  difficulty?: string;
  calories?: string;
  tags: Tags;
  seo: SEOData;
  tips?: string[];
  nutritionalInfo?: string[];
  faq?: { question: string; answer: string; }[];
  whyYoullLoveThis?: string;
  htmlContent: string; // The full HTML for the entire post with placeholders
  productReviews?: { productId: number; reviewText: string; }[];
}

export type ArticleStatus = 'Draft' | 'Awaiting Admin Review' | 'Published to WP Draft' | 'Published' | 'Rejected';
export type ImageSource = 'amazon_paapi' | 'ai_fallback' | 'placeholder' | 'user_upload';

export interface ArticleContent {
  blogPostData: BlogPostData;
  productData: AmazonProduct[];
  stepImageUrls: Record<string, string>;
  productImageUrls: Record<string, string>;
  productImageVariants?: Record<string, string[]>;
  heroImageUrl?: string; // Added field for the actual image URL
  ai_lifestyle_images?: string[] | Array<{ url?: string; src?: string; imageUrl?: string; image?: string }>;
}

// Represents an article as stored in the Supabase 'articles' table.
// This also serves as the data structure for the "InternalArticle" requested for the admin content library.
export interface Article {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  blueprint_type: Blueprint;
  content: string; // This will store the stringified ArticleContent object
  generated_html: string; // The fully rendered and styled HTML content.
  image_url: string | null;
  image_prompt: string | null;
  image_source: ImageSource;
  category: string;
  tags: string[];
  seo: SEOData;
  status: ArticleStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  style_config: StyleConfig | null;
  ai_lifestyle_images?: string[] | Array<{ url?: string; src?: string; imageUrl?: string; image?: string }>;
  author_name?: string;
  author_username?: string;
  author_role?: 'admin' | 'user';
}

// Represents a user profile as stored in the Supabase 'profiles' table.
export interface UserProfile {
  id: string;
  updated_at?: string | null; // Optional since profiles table may not have this column
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  role: 'admin' | 'user';
  style_config?: StyleConfig | null;
  has_subscription?: boolean;
  subscription_expires_at?: string | null;
  subscription_type?: 'monthly' | 'yearly' | null;
  subscription_tier?: 'free' | 'pro' | 'premium';
  monthly_article_limit?: number;
}

export interface AmazonProduct {
  id: number;
  productName: string;
  isPrimary: boolean;
  price?: string;
  specs?: { key: string; value: string; }[];
  imageUrl?: string;
  url?: string;
}

export interface ExtractedRecipeData {
  niche: string; // e.g., 'food', 'travel', 'diy'
  title: string;
  ingredients: string[];
  instructions: string[];
  prepTime?: string;
  cookTime?: string;
  servings?: string;
  difficulty?: string;
  calories?: string;
  products: AmazonProduct[];
  productKeywords?: string[];
}

export interface CombinedPostResponse {
  blogPostData: BlogPostData;
  productData: AmazonProduct[];
}

export interface AiConfig {
  geminiApiKey: string;
  imageProvider: 'gemini' | 'free_tier' | 'deepai';
  productImageSource: 'ai' | 'amazon';

  // New API keys for expanded image generation
  deepaiApiKey?: string;
  stabilityApiKey?: string;
  picsartApiKey?: string;
  aiHordeApiKey?: string;
  clipdropApiKey?: string;

  // Restored optional API keys for free tier image services
  replicateApiKey?: string;
  getimgApiKey?: string;
  prodiaApiKey?: string;
  falApiKey?: string;
  octoMLApiKey?: string;
  monsterApiToken?: string;
  segmindApiKey?: string;
  stablediffusionapiApiKey?: string;
  leonardoApiKey?: string;
  evokeApiKey?: string;
  starryaiApiKey?: string;
  layerApiKey?: string;
  scenarioApiKey?: string;
  huggingFaceApiKey?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  groqApiKey?: string;
  cerebrasApiKey?: string;
  openRouterApiKey?: string;
  infipApiKey?: string;
  togetherApiKey?: string;
  mistralApiKey?: string;
  siliconFlowApiKey?: string;
  useBeastMode?: boolean; // If true, forces usage of Beast Mode (Pollinations) regardless of keys

  // Stock Image Configuration
  stockImageProvider?: 'pexels' | 'unsplash' | 'pixabay' | 'none';
  pexelsApiKey?: string;
  unsplashApiKey?: string;
  pixabayApiKey?: string;
  hashbrownApiKey?: string;
}

export interface AmazonConfig {
  associateTag: string;
  accessKey: string;
  secretKey: string;
  region: string;
}

export interface AmazonProductDetails {
  title: string;
  description: string;
  features: string[];
  price?: string;
  images?: string[];
  url?: string;
  source?: 'paapi' | 'jina' | 'proxy' | 'cache';
  warning?: string;
}


export interface WordPressConfig {
  url: string;
  username: string;
  password: string; // Application Password
  wooConsumerKey: string;
  wooConsumerSecret: string;
  featuredImageHandling?: 'theme_default' | 'skip_featured' | 'gutenberg_cover';
  /* 
   * featuredImageHandling options:
   * - 'theme_default' (default): Sets featured_media in WordPress post metadata. 
   *   Most themes will display this automatically. Does NOT include image in content.
   * - 'skip_featured': Does NOT set featured_media at all. 
   *   Use this if your theme expects the image in the content or you want full control.
   * - 'gutenberg_cover': Sets featured_media AND adds a wp:cover block at the start of content.
   *   Use this for themes that don't automatically display featured images.
   */
}

export enum PublishingStatus {
  Idle = 'idle',
  Publishing = 'publishing',
  Success = 'success',
  Error = 'error',
}

export interface PublishingProgress {
  message: string;
  logs: string[];
  current?: number;
  total?: number;
}

export interface ImagePayload {
  hero?: string | Blob;
  steps: string[];
  products: {
    id: number;
    url: string;
    variants?: string[]; // Amazon variant images (alternative views)
    productName?: string; // For better metadata in WordPress
  }[];
}

// Track uploaded product images in WordPress Media Library
export interface UploadedProductImages {
  productId: number;
  primaryImageId: number;
  primaryImageUrl: string;
  variantImages?: Array<{
    id: number;
    url: string;
  }>;
}

export enum AppStep {
  BlueprintSelection = 0,
  Input = 1,
  Generating = 2,
  Review = 3,
  Publish = 4,
}

export type Blueprint = 'recipe' | 'roundup' | 'review' | 'howto';

// Defines the shape of the data persisted in sessionStorage
export interface AppSessionData {
  inputVal: string;
  inputType: 'url' | 'keyword' | 'asin';
  selectedBlueprint: Blueprint;
  wordpressConfig: WordPressConfig;
  amazonConfig: AmazonConfig;
  aiConfig: AiConfig;
  styleConfig: StyleConfig;
  blogPostData: BlogPostData | null;
  originalBlogPostData: BlogPostData | null;
  productData: AmazonProduct[];
  heroImageUrl: string;
  stepImageUrls: Record<string, string>;
  productImageUrls: Record<string, string>;
  productImageVariants?: Record<string, string[]>; // Amazon variant images: productId -> array of variant URLs
  imageSelection: Record<string, boolean>;
  currentStep: AppStep;
  ingredientAsins: string[];
  articleId: string | null; // ID of the article being edited/created
  articleStatus: ArticleStatus | null;
  imagesGenerated: boolean;
}

export interface ScoreFeedback {
  priority: 'Critical' | 'Major' | 'Minor';
  suggestion: string;
  category: 'Structure' | 'Content' | 'Style';
}
