#!/usr/bin/env python3
"""
HuggingFace Image Generation Service
Ultra-fast image generation using HuggingFace Inference API
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import base64
import os
from io import BytesIO
from PIL import Image
import logging
from dotenv import load_dotenv
from huggingface_hub import InferenceClient

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# HuggingFace API configuration
# Use provided key as fallback if env var is not set
DEFAULT_HF_TOKEN = "HUGGINGFACE_KEY_PLACEHOLDER"
HF_TOKEN = os.getenv('HF_TOKEN') or DEFAULT_HF_TOKEN
HF_API_BASE = "https://api-inference.huggingface.co/models"
HF_ROUTER_BASE = "https://router.huggingface.co/v1"

# Available models with their characteristics
MODELS = {
    'turbo': 'black-forest-labs/FLUX.1-schnell',  # Ultra-fast (Flux Schnell)
    'iphone': '00quebec/iPhone_realism',  # Realistic lifestyle
    'flux-schnell': 'black-forest-labs/FLUX.1-schnell',  # Fast FLUX
    'flux-dev': 'black-forest-labs/FLUX.1-dev',  # High quality FLUX
    'sdxl': 'stabilityai/stable-diffusion-xl-base-1.0',  # Classic SDXL
    'ovis': 'AIDC-AI/Ovis-Image-7B',  # Ovis with fal-ai provider
    'longcat': 'meituan-longcat/LongCat-Image',  # LongCat (fal-ai)
    'qwen': 'lightx2v/Qwen-Image-Lightning',  # Qwen Lightning (fal-ai)
    'reversal': 'AIImageStudio/ReversalFilmGravure_z_Image_turbo',  # Reversal Film (fal-ai)
    'sydney': 'playboy40k/flux-SydneySweeneyLora',  # Sydney Sweeney Lora (fal-ai)
    'mimo': 'XiaomiMiMo/MiMo-V2-Flash:novita',  # MiMo V2 Flash (Text/Chat)
}

# Models that require InferenceClient with 'fal-ai' provider
FAL_MODELS = ['ovis', 'longcat', 'qwen', 'reversal', 'sydney']

# Text/Chat models
TEXT_MODELS = ['mimo']

# Initialize InferenceClient for fal-ai provider
try:
    fal_client = InferenceClient(
        provider="fal-ai",
        api_key=HF_TOKEN
    )
    logger.info("✅ InferenceClient initialized for fal-ai provider")
except Exception as e:
    logger.warning(f"⚠️ Could not initialize InferenceClient: {e}")
    fal_client = None

def query_huggingface(prompt: str, model: str, width: int = 1024, height: int = 1024, num_inference_steps: int = 4):
    """
    Query HuggingFace Inference API for image generation
    
    Args:
        prompt: Text description of the image
        model: Model identifier or alias
        width: Image width in pixels
        height: Image height in pixels
        num_inference_steps: Number of denoising steps (lower = faster)
    
    Returns:
        PIL Image object or None if failed
    """
    # Resolve model alias
    model_id = MODELS.get(model, model)
    
    api_url = f"{HF_API_BASE}/{model_id}"
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    
    payload = {
        "inputs": prompt,
        "parameters": {
            "width": width,
            "height": height,
            "num_inference_steps": num_inference_steps
        }
    }
    
    try:
        logger.info(f"Generating image with {model_id}: {prompt[:50]}...")
        response = requests.post(api_url, headers=headers, json=payload, timeout=60)
        
        if response.status_code == 200:
            image = Image.open(BytesIO(response.content))
            logger.info(f"✅ Image generated successfully ({image.size})")
            return image
        else:
            logger.error(f"❌ HuggingFace API error: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        logger.error(f"❌ Exception during image generation: {str(e)}")
        return None

def query_with_inference_client(prompt: str, model: str) -> Image.Image:
    """
    Query HuggingFace using InferenceClient with fal-ai provider
    
    Args:
        prompt: Text description of the image
        model: Model identifier
    
    Returns:
        PIL Image object or None if failed
    """
    if not fal_client:
        raise Exception("InferenceClient not initialized")
    
    try:
        logger.info(f"Generating image with InferenceClient ({model}): {prompt[:50]}...")
        
        # Use text_to_image with the InferenceClient
        image = fal_client.text_to_image(
            prompt,
            model=model
        )
        
        logger.info(f"✅ Image generated successfully with InferenceClient")
        return image
        
    except Exception as e:
        logger.error(f"❌ InferenceClient error: {str(e)}")
        return None

def query_chat_completion(model: str, messages: list):
    """
    Query HuggingFace Router for chat completion (OpenAI compatible)
    """
    model_id = MODELS.get(model, model)
    api_url = f"{HF_ROUTER_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_id,
        "messages": messages,
        "max_tokens": 2048, # Default max tokens
        "temperature": 0.7
    }
    
    try:
        logger.info(f"Generating text with {model_id}...")
        response = requests.post(api_url, headers=headers, json=payload, timeout=60)
        
        if response.status_code == 200:
            data = response.json()
            return data
        else:
            logger.error(f"❌ HuggingFace Chat API error: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        logger.error(f"❌ Exception during text generation: {str(e)}")
        return None

def image_to_base64(image: Image.Image, format: str = 'PNG') -> str:
    """Convert PIL Image to base64 string"""
    buffered = BytesIO()
    image.save(buffered, format=format)
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/{format.lower()};base64,{img_str}"

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'huggingface-image-generation',
        'models_available': len(MODELS),
        'hf_token_configured': bool(HF_TOKEN)
    })

@app.route('/api/generate-image', methods=['POST'])
def generate_image():
    """
    Generate a single image
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or 'prompt' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: prompt'
            }), 400
        
        # Extract parameters with defaults
        prompt = data['prompt']
        model = data.get('model', 'turbo')
        width = data.get('width', 1024)
        height = data.get('height', 1024)
        num_steps = data.get('num_inference_steps', 4)
        
        # Resolve model ID
        model_id = MODELS.get(model, model)
        
        # Determine if we should use InferenceClient (fal-ai) or standard API
        # Check if alias is in FAL_MODELS OR if the full ID matches one of the FAL model IDs
        use_fal = model in FAL_MODELS or \
                  model_id in [MODELS[k] for k in FAL_MODELS]
        
        if use_fal:
            # Use InferenceClient for fal-ai models
            image = query_with_inference_client(prompt, model_id)
        else:
            # Use standard API for other models
            image = query_huggingface(prompt, model, width, height, num_steps)
        
        if image is None:
            return jsonify({
                'success': False,
                'error': 'Image generation failed'
            }), 500
        
        # Convert to base64
        base64_image = image_to_base64(image)
        
        return jsonify({
            'success': True,
            'image': base64_image,
            'model': model_id,
            'size': list(image.size)
        })
        
    except Exception as e:
        logger.error(f"Error in generate_image: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/generate-batch', methods=['POST'])
def generate_batch():
    """
    Generate multiple images with different models
    """
    try:
        data = request.get_json()
        
        if not data or 'prompt' not in data or 'models' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: prompt, models'
            }), 400
        
        prompt = data['prompt']
        models = data['models']
        width = data.get('width', 1024)
        height = data.get('height', 1024)
        num_steps = data.get('num_inference_steps', 4)
        
        results = []
        
        for model in models:
            try:
                model_id = MODELS.get(model, model)
                use_fal = model in FAL_MODELS or model_id in [MODELS[k] for k in FAL_MODELS]
                
                if use_fal:
                     image = query_with_inference_client(prompt, model_id)
                else:
                     image = query_huggingface(prompt, model, width, height, num_steps)
                
                if image:
                    results.append({
                        'model': model_id,
                        'image': image_to_base64(image),
                        'success': True,
                        'size': list(image.size)
                    })
                else:
                    results.append({
                        'model': model_id,
                        'success': False,
                        'error': 'Generation failed'
                    })
            except Exception as e:
                results.append({
                    'model': MODELS.get(model, model),
                    'success': False,
                    'error': str(e)
                })
        
        return jsonify({
            'success': True,
            'results': results,
            'total': len(results),
            'successful': sum(1 for r in results if r['success'])
        })
        
    except Exception as e:
        logger.error(f"Error in generate_batch: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/generate-text', methods=['POST'])
def generate_text():
    """
    Generate text using chat completion (for models like MiMo)
    Request:
    {
        "model": "mimo",
        "messages": [{"role": "user", "content": "..."}]
    }
    """
    try:
        data = request.get_json()
        if not data or 'messages' not in data:
            return jsonify({'success': False, 'error': 'Missing messages'}), 400
            
        model = data.get('model', 'mimo')
        messages = data['messages']
        
        result = query_chat_completion(model, messages)
        
        if result:
            return jsonify({
                'success': True,
                'data': result
            })
        else:
            return jsonify({'success': False, 'error': 'Text generation failed'}), 500
            
    except Exception as e:
        logger.error(f"Error in generate_text: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/models', methods=['GET'])
def list_models():
    """List available models"""
    return jsonify({
        'models': [
            {
                'alias': alias,
                'id': model_id,
                'description': get_model_description(alias)
            }
            for alias, model_id in MODELS.items()
        ]
    })

@app.route('/api/proxy', methods=['GET', 'POST'])
def proxy():
    """
    Generic CORS Proxy for Local Development
    proxies requests to external APIs (Picsart, AI Horde, etc) to bypass CORS
    Usage: /api/proxy?url=ENCODED_URL
    """
    target_url = request.args.get('url')
    if not target_url:
        return jsonify({'error': 'Missing url parameter'}), 400

    method = request.method
    headers = {key: value for key, value in request.headers if key.lower() not in ['host', 'content-length']}
    
    # Force User-Agent
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    try:
        if method == 'GET':
            resp = requests.get(target_url, headers=headers, timeout=60)
        else:
            # For POST, pass the JSON body or form data
            data = request.get_data()
            resp = requests.post(target_url, headers=headers, data=data, timeout=60)

        # Create Flask response
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = [(name, value) for (name, value) in resp.headers.items()
                   if name.lower() not in excluded_headers]

        return resp.content, resp.status_code, headers

    except Exception as e:
        logger.error(f"Proxy error accessing {target_url}: {str(e)}")
        return jsonify({'error': 'Proxy failed', 'details': str(e)}), 500

def get_model_description(alias: str) -> str:
    """Get human-readable description for model"""
    descriptions = {
        'turbo': 'Ultra-fast generation (1-2s), good quality',
        'iphone': 'Realistic lifestyle photos, iPhone aesthetic',
        'flux-schnell': 'Fast FLUX model, balanced speed/quality',
        'flux-dev': 'High quality FLUX, slower but best results',
        'sdxl': 'Classic Stable Diffusion XL, reliable',
        'ovis': 'Ovis-Image-7B with fal-ai provider, high quality',
        'longcat': 'Meituan LongCat Image (fal-ai provider)',
        'qwen': 'Qwen Image Lightning (fal-ai provider)',
        'reversal': 'Reversal Film Gravure Z Image Turbo (fal-ai provider)',
        'sydney': 'Flux Sydney Sweeney Lora (fal-ai provider)',
        'mimo': 'MiMo V2 Flash (Text/Chat model)'
    }
    return descriptions.get(alias, 'Custom model')

if __name__ == '__main__':
    if not HF_TOKEN:
        logger.warning("⚠️  HF_TOKEN not set! Set it in .env file")
        logger.warning("   Get your token at: https://huggingface.co/settings/tokens")
    else:
        logger.info("✅ HuggingFace token configured")
    
    port = int(os.getenv('PYTHON_PORT', 5000))
    logger.info(f"🚀 Starting HuggingFace Image Service on port {port}")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=os.getenv('FLASK_ENV') == 'development'
    )

