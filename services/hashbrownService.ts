import { fryHashbrown, s } from '@hashbrownai/core';
import { GeminiTransport } from './hashbrownAdapter';
import { ExtractedRecipeData } from '../types';

/**
 * Hashbrown Service (Agentic Extraction)
 * Uses Hashbrown Framework to orchestrate extraction.
 */

// Define schema with Hashbrown v0.4 API (description-first, no chained `.optional()`).
const ProductSchema = s.object("Extracted product", {
    id: s.number("Numeric product ID"),
    productName: s.string("Product name"),
    isPrimary: s.boolean("Whether this is the primary product")
});

const RecipeSchema = s.object("Extracted recipe/article content", {
    niche: s.string("The content niche (e.g. food, tech)"),
    title: s.string("The exact title of the recipe or product"),
    ingredients: s.array("List of ingredients or specs", s.string("Ingredient or spec item")),
    instructions: s.array("Step-by-step instructions", s.string("Instruction item")),
    prepTime: s.anyOf([s.string("Preparation time if applicable"), s.nullish()]),
    cookTime: s.anyOf([s.string("Cooking time if applicable"), s.nullish()]),
    servings: s.anyOf([s.string("Yield or servings"), s.nullish()]),
    calories: s.anyOf([s.string("Caloric content per serving"), s.nullish()]),
    products: s.anyOf([s.array("Extracted products", ProductSchema), s.nullish()])
});

export const extractRecipeFromHashbrown = async (
    targetUrlOrText: string,
    apiKey: string // This is technically the Hashbrown Key, but we might likely pass the Gemini Key if using Adapter
): Promise<ExtractedRecipeData> => {

    // NOTE: In the user's requested architecture, they supply a "Hashbrown Key".
    // If that key is just for a paid extraction service, we would use that.
    // BUT since we are "building the agent" using the framework, we likely need the LLM Key.
    // We will assume 'apiKey' passed here is capable of authenticating our Transport (Gemini Key).
    // If the User passed a Hashbrown Key in settings, but we need a Gemini Key for the Transport,
    // we should ideally grab the Gemini Key from the global config.
    // However, function signature was defined as (url, apiKey).
    // Let's assume the user put their Gemini Key in the Hashbrown field OR we just use the passed key.
    // Realistically, to make this work "out of the box" with the provided keys, we used Pexels etc.
    // If the user wants to use Hashbrown Framework with Gemini, we need the Gemini Key.

    // For this implementation, we will assume 'apiKey' IS the Gemini Key needed for the adapter.
    // (Or we'll document that they need to put Gemini Key in Hashbrown Settings if they want this mode).

    const transport = new GeminiTransport(apiKey);

    const agent = fryHashbrown({
        model: 'gemini-1.5-flash',
        system: `You are an expert Content Extractor Agent. 
                 Analyze the input carefully. 
                 Extract structured data matching the schema perfectly.
                 Do not hallucinate.`,
        transport: transport,
        responseSchema: RecipeSchema
    });

    return new Promise((resolve, reject) => {
        // Subscribe to changes
        const unsubscribe = agent.lastAssistantMessage.subscribe((msg) => {
            if (msg && msg.content) {
                // We got content!
                // Hashbrown validates the schema for us.
                const data = msg.content;

                // Map to our app's strictly typed Interface
                const result: ExtractedRecipeData = {
                    niche: data.niche || 'food',
                    title: data.title,
                    ingredients: data.ingredients,
                    instructions: data.instructions,
                    prepTime: data.prepTime || undefined,
                    cookTime: data.cookTime || undefined,
                    servings: data.servings || undefined,
                    calories: data.calories || undefined,
                    products: Array.isArray(data.products)
                        ? data.products.map((p: any, idx: number) => ({
                            id: typeof p?.id === 'number' ? p.id : idx + 1,
                            productName: p?.productName || `Product ${idx + 1}`,
                            isPrimary: !!p?.isPrimary
                        }))
                        : [],
                    productKeywords: []
                };

                unsubscribe(); // Stop listening
                resolve(result);
            }
        });

        // Handle errors
        const errUnsub = agent.error.subscribe(err => {
            if (err) {
                unsubscribe();
                errUnsub();
                reject(err);
            }
        });

        // Kickoff
        agent.sendMessage({
            role: 'user',
            content: `Extract data from this content: ${targetUrlOrText}`
        });
    });
};
