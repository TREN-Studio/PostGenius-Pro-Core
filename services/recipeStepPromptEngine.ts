import type { BlogPostData } from '../types';

export type RecipeStepStage = 'prep' | 'mix' | 'form' | 'cook' | 'serve' | 'generic';

interface IngredientStateItem {
    name: string;
    baseName: string;
    isCanned: boolean;
    isTinned: boolean;
    isJarred: boolean;
    isPreserved: boolean;
    isFrozen: boolean;
    isDried: boolean;
    isPowder: boolean;
    isSmoked: boolean;
    isPickled: boolean;
    isBrined: boolean;
    isFresh: boolean;
}

export interface RecipeStepVisualSpec {
    stage: RecipeStepStage;
    articleTitle: string;
    niche: string;
    primaryAction: string;
    stepText: string;
    matchedIngredients: string[];
    sceneRules: string[];
    mustAvoid: string[];
    ingredientStateConstraints: string[];
}

const normalizeIngredientText = (raw: string): string => {
    return String(raw || '')
        .replace(/^\s*[\d/.+-]+\s*(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|g|kg|ml|l|lb|lbs|pound|pounds)\b/i, '')
        .replace(/[()[\],]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const parseIngredientStates = (ingredients: string[]): IngredientStateItem[] => {
    return ingredients.map((raw) => {
        const name = normalizeIngredientText(raw).toLowerCase();
        const baseName = name
            .replace(/\b(canned|can|tinned|jarred|preserved|frozen|dried|powder(ed)?|smoked|pickled|brined|fresh|drained|flaked|shredded|minced|chopped|diced|sliced)\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return {
            name,
            baseName: baseName || name,
            isCanned: /\bcanned\b/.test(name) || /\bcans?\b/.test(name),
            isTinned: /\btinned\b/.test(name),
            isJarred: /\bjarred\b/.test(name),
            isPreserved: /\bpreserved\b/.test(name),
            isFrozen: /\bfrozen\b/.test(name),
            isDried: /\bdried\b/.test(name),
            isPowder: /\bpowder(ed)?\b/.test(name),
            isSmoked: /\bsmoked\b/.test(name),
            isPickled: /\bpickled\b/.test(name),
            isBrined: /\bbrined\b/.test(name),
            isFresh: /\bfresh\b/.test(name),
        };
    });
};

export const detectRecipeStepStage = (stepText: string): RecipeStepStage => {
    const raw = String(stepText || '').trim();
    if (!raw) return 'generic';

    // Remove low-signal future/serving phrases that can incorrectly flip
    // prep/form steps into "cook" (e.g. "for even cooking").
    const normalized = raw
        .toLowerCase()
        .replace(/[;,()]/g, ' ')
        .replace(/\b(for even cooking|for even browning|during cooking|once cooked|when cooked|before serving|to serve|serve immediately)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const firstSentence = normalized.split(/[.?!]/)[0] || normalized;

    // Strong prefix intent detection first.
    if (/^\s*(serve|plate|garnish|finish|top|drizzle)\b/.test(firstSentence)) return 'serve';
    if (/^\s*(cook|bake|roast|fry|sear|simmer|boil|grill|broil|air fry|saute|heat)\b/.test(firstSentence)) return 'cook';
    if (/^\s*(form|shape|portion|patty|patties|press|roll|scoop)\b/.test(firstSentence)) return 'form';
    if (/^\s*(mix|combine|stir|whisk|fold|blend|marinate|season|toss)\b/.test(firstSentence)) return 'mix';
    if (/^\s*(gather|measure|mise en place|drain|open|rinse|wash|thaw|pat dry|mince|chop|slice|dice|prep|prepare)\b/.test(firstSentence)) return 'prep';

    const countMatches = (text: string, regex: RegExp): number => (text.match(regex) || []).length;
    const patterns = {
        prep: /\b(gather|measure|mise en place|drain|open|rinse|wash|thaw|pat dry|mince|chop|slice|dice|prep|prepare)\b/g,
        mix: /\b(mix|combine|stir|whisk|fold|blend|marinate|season|toss)\b/g,
        form: /\b(form|shape|portion|patty|patties|press|roll|scoop)\b/g,
        cook: /\b(cook|bake|roast|fry|sear|simmer|boil|grill|air fry|broil|saute|heat)\b/g,
        serve: /\b(serve|plate|garnish|finish|top with|drizzle)\b/g,
    };

    const scores: Record<RecipeStepStage, number> = {
        prep: countMatches(normalized, patterns.prep) + countMatches(firstSentence, patterns.prep) * 2,
        mix: countMatches(normalized, patterns.mix) + countMatches(firstSentence, patterns.mix) * 2,
        form: countMatches(normalized, patterns.form) + countMatches(firstSentence, patterns.form) * 2,
        cook: countMatches(normalized, patterns.cook) + countMatches(firstSentence, patterns.cook) * 2,
        serve: countMatches(normalized, patterns.serve) + countMatches(firstSentence, patterns.serve) * 2,
        generic: 0,
    };

    const ranked: RecipeStepStage[] = ['form', 'mix', 'prep', 'cook', 'serve'];
    const best = ranked.reduce<RecipeStepStage>((winner, stage) => {
        if (scores[stage] > scores[winner]) return stage;
        return winner;
    }, 'generic');

    if (best !== 'generic' && scores[best] > 0) return best;
    if (/\bingredients?\b/.test(normalized)) return 'prep';
    return 'generic';
};

const extractPrimaryAction = (stepText: string): string => {
    const raw = String(stepText || '').trim();
    if (!raw) return raw;

    const sentences = raw
        .split(/[.?!]\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    const actionRegex = /\b(gather|measure|drain|flake|mince|chop|slice|dice|mix|combine|stir|whisk|fold|shape|form|portion|press|cook|bake|fry|sear|boil|grill|plate|serve|garnish)\b/i;
    const selected = sentences.find((s) => actionRegex.test(s)) || sentences[0] || raw;

    return selected
        .replace(/\b(for even cooking|for even browning|during frying|when frying|before serving|to serve|serve immediately|once cooked|when cooked|until cooked)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const matchStepIngredients = (stepText: string, ingredientStates: IngredientStateItem[]): string[] => {
    const normalizedStep = String(stepText || '').toLowerCase();
    const picked = ingredientStates
        .map((i) => i.name)
        .filter((ing) => {
            if (ing.length < 3) return false;
            const words = ing.split(/\s+/).filter((w) => w.length > 2);
            if (words.length === 0) return false;
            return words.some((w) => normalizedStep.includes(w));
        });
    return Array.from(new Set(picked)).slice(0, 6);
};

export const extractIngredientStateConstraints = (blogData: BlogPostData): { positive: string[]; negative: string[] } => {
    const states = parseIngredientStates((blogData?.ingredients || []).map((x) => x || ''));
    const positive: string[] = [];
    const negative: string[] = [];

    const proteinHint = /\b(salmon|tuna|sardine|anchovy|mackerel|chicken|turkey|beef|pork|shrimp|crab)\b/i;
    const hasNonFreshProtein = states.some((s) =>
        proteinHint.test(s.name) && (s.isCanned || s.isTinned || s.isJarred || s.isPreserved || s.isFrozen || s.isDried || s.isSmoked || s.isPickled || s.isBrined)
    );
    if (hasNonFreshProtein) {
        positive.push('Do not replace preserved/frozen protein with fresh raw fillet slabs.');
        negative.push('fresh fillet slab', 'raw steak-like fish block', 'sashimi-style raw fillet');
    }

    states.forEach((s) => {
        const labels: string[] = [];
        if (s.isCanned) labels.push('canned');
        if (s.isTinned) labels.push('tinned');
        if (s.isJarred) labels.push('jarred');
        if (s.isPreserved) labels.push('preserved');
        if (s.isFrozen) labels.push('frozen/thawed');
        if (s.isDried) labels.push('dried');
        if (s.isPowder) labels.push('powdered');
        if (s.isSmoked) labels.push('smoked');
        if (s.isPickled) labels.push('pickled');
        if (s.isBrined) labels.push('brined');

        if (labels.length === 0) return;
        const stateText = labels.join(', ');
        positive.push(`Keep ${s.baseName} in ${stateText} state where visible.`);

        // Strong negatives for state mismatch.
        if (s.isCanned || s.isTinned || s.isJarred || s.isPreserved) {
            negative.push(`fresh ${s.baseName}`, `raw ${s.baseName} fillet`);
        }
        if (s.isDried) {
            negative.push(`fresh ${s.baseName} leaves`, `wet ${s.baseName} bunch`);
        }
        if (s.isPowder) {
            negative.push(`whole ${s.baseName} chunks`, `fresh ${s.baseName} pieces`);
        }
    });

    if (states.some((s) => s.isFrozen)) {
        positive.push('Respect frozen/thawed ingredient state when applicable.');
    }
    if (states.some((s) => s.isDried)) {
        positive.push('Show dried ingredient texture where relevant (not fresh replacement).');
    }
    if (states.some((s) => s.isPowder)) {
        positive.push('Show powdered ingredient form where relevant.');
    }

    return { positive, negative };
};

const extractStepTextureConstraints = (stepText: string): { positive: string[]; negative: string[] } => {
    const text = String(stepText || '').toLowerCase();
    const positive: string[] = [];
    const negative: string[] = [];

    if (/\bdrain(ed|ing)?\b/.test(text)) {
        positive.push('Show drained texture with no pooling can-liquid.');
        negative.push('ingredient submerged in can liquid', 'watery canned brine pool');
    }
    if (/\bflake(d|s|ing)?\b/.test(text)) {
        positive.push('Show visibly flaked texture, not intact slab.');
        negative.push('intact fillet slab', 'steak-cut block');
    }
    if (/\bshred(ded|ding)?\b/.test(text)) {
        positive.push('Show shredded strands in-progress.');
        negative.push('unshredded whole piece');
    }
    if (/\b(mince|minced|mincing)\b/.test(text)) {
        positive.push('Show finely minced pieces.');
        negative.push('large rough chunks');
    }
    if (/\b(chop|chopped|chopping|dice|diced|dicing|slice|sliced|slicing)\b/.test(text)) {
        positive.push('Show visible cut prep state matching the action.');
    }
    if (/\b(uncooked|raw)\b/.test(text)) {
        positive.push('Keep surfaces uncooked and pale.');
        negative.push('golden crust', 'sear marks', 'charred edges');
    }
    if (/\b(boil|boiling|simmer)\b/.test(text)) {
        positive.push('Show active boiling/simmering process with in-progress texture.');
        negative.push('fully finished plated meal', 'garnished final dish', 'hero food styling');
    }
    if (/\b(reserve|drain|strainer|colander)\b/.test(text)) {
        positive.push('Show process cues like draining/reserving liquid if relevant.');
        negative.push('restaurant-ready final presentation');
    }
    if (/\b(season|toss|shake)\b/.test(text)) {
        positive.push('Show visible seasoning powder/granules coating the ingredient surfaces.');
        negative.push('oven-roasted finish', 'baked crispy surface', 'deep golden cooked exterior');
    }
    if (/\b(bowl|mixing bowl|resealable bag|zip bag|plastic bag|bag)\b/.test(text)) {
        positive.push('Container lock: keep ingredients inside a bowl or resealable bag during action.');
        negative.push('sheet pan layout', 'oven tray arrangement');
    }

    return { positive, negative };
};

const sceneRulesForStage = (stage: RecipeStepStage): string[] => {
    if (stage === 'prep') {
        return [
            'Top-down mise en place with raw ingredients only.',
            'If canned protein exists, show opened can and drained flakes in bowl.',
            'No patties, no cooking pan marks, no final plated dish.',
        ];
    }
    if (stage === 'mix') {
        return [
            'Close-up mixing bowl or resealable bag with uncooked ingredients being combined.',
            'In-progress seasoning/tossing action with visible powders or spices.',
            'Raw/uncooked texture visible.',
            'No sear marks, no finished patties, no plated dish, no oven-tray result shot.',
        ];
    }
    if (stage === 'form') {
        return [
            'Hands shaping uncooked patties from raw mixture on parchment or tray.',
            'Pale uncooked surface only.',
            'No browning, no char marks, no plated hero styling.',
        ];
    }
    if (stage === 'cook') {
        return [
            'In-progress cooking process only (pot/pan/oven action), not final serving.',
            'Can show active heat effects (steam/sizzle), but keep visual state process-oriented.',
            'No garnish, no restaurant plating, no final assembled hero dish.',
        ];
    }
    if (stage === 'serve') {
        return ['Final plated serving is allowed for this step.'];
    }
    return ['One in-progress preparation action only, pre-serving state.'];
};

const hardConstraintsForStage = (stage: RecipeStepStage): string[] => {
    if (stage === 'prep') {
        return [
            'HARD RULE: raw ingredient prep only.',
            'HARD RULE: never show cooked patties, crust, browning, or plated serving.',
            'HARD RULE: if canned protein exists, show opened can and drained/flaked texture.',
        ];
    }
    if (stage === 'mix') {
        return [
            'HARD RULE: mixing-bowl action only with uncooked wet/sticky mixture.',
            'HARD RULE: never show cooked/fried/browned patties.',
            'HARD RULE: never show oven tray, sheet pan, or baked final texture.',
        ];
    }
    if (stage === 'form') {
        return [
            'HARD RULE: hand-shaping uncooked patties only.',
            'HARD RULE: surface must stay pale/uncooked with no sear marks.',
        ];
    }
    if (stage === 'cook') {
        return [
            'HARD RULE: in-pan/in-oven active cooking scene only, not final serving shot.',
            'HARD RULE: never show garnish leaves, styled plating props, or completed hero composition.',
        ];
    }
    if (stage === 'serve') {
        return ['HARD RULE: final plated dish is allowed only in this stage.'];
    }
    return ['HARD RULE: show one process action only, no final plated presentation.'];
};

const mustAvoidForStage = (stage: RecipeStepStage): string[] => {
    const base = ['cartoon', 'anime', 'illustration', 'cgi render', 'watermark', 'text', 'logo'];
    if (stage === 'prep' || stage === 'mix' || stage === 'form' || stage === 'generic') {
        return [
            ...base,
            'fully cooked patties',
            'cooked fish cakes',
            'golden-browned crust',
            'char marks',
            'final plated dish',
            'restaurant serving presentation',
            'crispy cooked salmon cakes',
            'ready-to-eat hero dish',
            'sheet pan',
            'baking tray',
            'oven-roasted wedges',
            'baked potato wedges',
            'crispy roasted potatoes',
        ];
    }
    if (stage === 'cook') {
        return [
            ...base,
            'final plated dish',
            'restaurant hero plating',
            'garnish leaf on top',
            'fully assembled final meal',
            'serving board presentation',
        ];
    }
    return base;
};

export const buildRecipeStepVisualSpec = (
    stepText: string,
    blogData: BlogPostData
): RecipeStepVisualSpec => {
    const stage = detectRecipeStepStage(stepText);
    const ingredientStates = parseIngredientStates(blogData?.ingredients || []);
    const matchedIngredients = matchStepIngredients(stepText, ingredientStates);
    const stateConstraints = extractIngredientStateConstraints(blogData);
    const stepConstraints = extractStepTextureConstraints(stepText);

    return {
        stage,
        articleTitle: String(blogData?.title || '').trim(),
        niche: String(blogData?.niche || 'food').trim(),
        primaryAction: extractPrimaryAction(stepText),
        stepText: String(stepText || '').trim(),
        matchedIngredients,
        sceneRules: sceneRulesForStage(stage),
        mustAvoid: [...mustAvoidForStage(stage), ...stateConstraints.negative, ...stepConstraints.negative],
        ingredientStateConstraints: [...stateConstraints.positive, ...stepConstraints.positive],
    };
};

export const compileRecipeStepPrompt = (
    spec: RecipeStepVisualSpec,
    stepImageHint?: string
): string => {
    const hintBlock = stepImageHint ? `Visual guidance: ${stepImageHint}.` : '';
    const strictNonServeStage = spec.stage !== 'serve';
    const stageLockedActionText = strictNonServeStage ? spec.primaryAction : spec.stepText;
    const matched = spec.matchedIngredients.length > 0
        ? `Mandatory visible ingredients for this step: ${spec.matchedIngredients.join(', ')}.`
        : 'Mandatory visible ingredients: only ingredients relevant to this step.';
    const stateBlock = spec.ingredientStateConstraints.length > 0
        ? `Ingredient state lock: ${spec.ingredientStateConstraints.join(' ')}`
        : '';
    const containerLock = /\b(bowl|mixing bowl|resealable bag|zip bag|plastic bag|bag)\b/i.test(spec.stepText)
        ? 'Container lock: show ingredients inside a mixing bowl or resealable plastic bag while seasoning/tossing.'
        : '';
    const hardRules = hardConstraintsForStage(spec.stage);

    return [
        'Step-locked documentary food photography.',
        `Article: ${spec.articleTitle}.`,
        `Niche: ${spec.niche}.`,
        `Stage-locked action text: ${stageLockedActionText}.`,
        `Step instruction: ${spec.primaryAction}.`,
        `Ignore any future or conflicting instructions outside stage "${spec.stage}".`,
        strictNonServeStage
            ? 'CRITICAL: show in-progress process state only. Never render final plated food, completed serving composition, or hero-style presentation.'
            : '',
        hintBlock,
        `Stage: ${spec.stage}.`,
        `Scene rules: ${spec.sceneRules.join(' ')}`,
        `Critical constraints: ${hardRules.join(' ')}`,
        containerLock,
        matched,
        stateBlock,
        'Composition: single clear in-progress action, realistic utensils, natural kitchen environment, 16:9, photorealistic 8k, truthful process-oriented lighting, no hero plating for non-serving stages, no collage, no illustration, no CGI.',
    ]
        .filter(Boolean)
        .join(' ');
};

export const compileRecipeStepNegativePrompt = (spec: RecipeStepVisualSpec): string => {
    const stageLockedAvoid = (spec.stage === 'serve')
        ? []
        : [
            'final plated hero dish',
            'restaurant serving shot',
            'finished meal presentation',
            'garnished hero styling',
            'food magazine final plating',
        ];
    return Array.from(new Set([...spec.mustAvoid, ...stageLockedAvoid].map((x) => x.trim()).filter(Boolean))).join(', ');
};

export const buildRecipeStepValidationPrompt = (spec: RecipeStepVisualSpec): string => {
    const mustShow = spec.matchedIngredients.length > 0
        ? spec.matchedIngredients.join(', ')
        : 'main step ingredients';
    const state = spec.ingredientStateConstraints.length > 0
        ? spec.ingredientStateConstraints.join(' ')
        : 'none';
    const avoid = spec.mustAvoid.length > 0 ? spec.mustAvoid.join(', ') : 'none';
    const finalDishForbidden = spec.stage === 'serve' ? 'false' : 'true';

    return `You are validating whether an image matches a recipe step. Respond ONLY JSON.
{
  "stage_match": boolean,
  "action_match": boolean,
  "ingredient_match": boolean,
  "ingredient_state_match": boolean,
  "visual_state_match": boolean,
  "shows_final_plated_dish": boolean,
  "shows_cooked_or_browned_surface": boolean,
  "shows_finished_hero_presentation": boolean,
  "shows_garnish_serving_styling": boolean,
  "confidence": number,
  "reason": "short reason"
}
Step text: "${spec.primaryAction}"
Expected stage: "${spec.stage}"
Must-show ingredients: "${mustShow}"
Required ingredient state: "${state}"
Must-avoid content: "${avoid}"
For all stages except "serve", final serving presentation (plating/garnish/hero styling) must be absent.
For non-serving stages, final plated dish must be absent: ${finalDishForbidden}.
"stage_match" means the scene stage matches "${spec.stage}" and not a later stage.
"visual_state_match" means surface doneness and scene state match this step (no completed dish for non-serve).`;
};
