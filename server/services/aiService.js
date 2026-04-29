import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSetting } from './settingsService.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ============================
// AI Client Factory
// Client cho caption (timeout 60s)
async function getOpenAIClient() {
  const key = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  if (!key) return null;
  return new OpenAI({ apiKey: key, timeout: 60000 });
}

// Client cho image generation (timeout 5 phút — gpt-image-2 rất chậm)
async function getOpenAIImageClient() {
  const key = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  if (!key) return null;
  return new OpenAI({ apiKey: key, timeout: 300000 });
}

async function getGeminiClient() {
  const key = await getSetting('google_ai_api_key', 'GOOGLE_AI_API_KEY');
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

export async function getAvailableProviders() {
  const openaiKey = await getSetting('openai_api_key', 'OPENAI_API_KEY');
  const geminiKey = await getSetting('google_ai_api_key', 'GOOGLE_AI_API_KEY');
  return { openai: !!openaiKey, gemini: !!geminiKey };
}

// ============================
// Model Registry (cập nhật theo docs OpenAI 04/2026)
// https://developers.openai.com/api/docs/models
// ============================

// Text/Caption models — dùng Chat Completions API
const CAPTION_MODELS = {
  'gpt-5.5':              { provider: 'openai', model: 'gpt-5.5',              label: 'GPT-5.5 (Flagship)' },
  'gpt-5.4':              { provider: 'openai', model: 'gpt-5.4',              label: 'GPT-5.4' },
  'gpt-5.4-mini':         { provider: 'openai', model: 'gpt-5.4-mini',         label: 'GPT-5.4 Mini' },
  'gpt-4o-mini':          { provider: 'openai', model: 'gpt-4o-mini',          label: 'GPT-4o Mini (Legacy)' },
  'gemini-2.5-flash':     { provider: 'gemini', model: 'gemini-2.5-flash-preview-04-17', label: 'Gemini 2.5 Flash' },
};

// OpenAI fallback order cho caption — từ flagship → stable
const OPENAI_CAPTION_FALLBACKS = ['gpt-5.5', 'gpt-5.4-mini', 'gpt-4o-mini'];

// GPT-5.x models require max_completion_tokens instead of max_tokens
function isGPT5Model(modelName) {
  return modelName && (modelName.startsWith('gpt-5') || modelName.startsWith('gpt-5.'));
}

// Image models — dùng Images API
// gpt-image-2: flagship, luôn trả b64_json, KHÔNG dùng response_format
//   Sizes: 1024x1024, 1536x1024, 1024x1536, auto
//   output_format: png, jpeg, webp (KHÔNG phải response_format)
const IMAGE_MODELS = {
  'gpt-image-2':  { provider: 'openai', model: 'gpt-image-2',  label: 'GPT Image 2 (Flagship)' },
  'gpt-image-1':  { provider: 'openai', model: 'gpt-image-1',  label: 'GPT Image 1' },
  'dall-e-3':     { provider: 'openai', model: 'dall-e-3',     label: 'DALL-E 3 (Legacy)' },
  'gemini-imagen': { provider: 'gemini', model: 'gemini-2.0-flash-exp', label: 'Gemini Imagen' },
};

export function getModelLists(providers) {
  const caption = [];
  const image = [];

  for (const [id, m] of Object.entries(CAPTION_MODELS)) {
    if ((m.provider === 'gemini' && providers.gemini) || (m.provider === 'openai' && providers.openai)) {
      caption.push({ id, name: m.label, provider: m.provider === 'gemini' ? 'Google AI' : 'OpenAI' });
    }
  }
  for (const [id, m] of Object.entries(IMAGE_MODELS)) {
    if ((m.provider === 'gemini' && providers.gemini) || (m.provider === 'openai' && providers.openai)) {
      image.push({ id, name: m.label, provider: m.provider === 'gemini' ? 'Google AI' : 'OpenAI' });
    }
  }

  return { caption, image };
}

// ============================
// CAPTION GENERATION
// ============================
export async function generateCaption({ product, style, customPrompt, preferModel }) {
  let prompt = customPrompt || style?.prompt_template || `Viết caption Facebook hấp dẫn cho chủ đề: {{product}}. Viết bằng tiếng Việt.`;
  prompt = prompt.replace(/\{\{product\}\}/g, product);
  prompt = prompt.replace(/\{\{tone\}\}/g, style?.tone || 'professional');

  const modelDef = preferModel ? CAPTION_MODELS[preferModel] : null;

  if (modelDef?.provider === 'openai') {
    const result = await tryOpenAICaptionWithFallback(prompt, modelDef.model);
    if (result) return result;
    // Fallback sang Gemini
    const gemini = await tryGeminiCaption(prompt);
    if (gemini) return gemini;
  } else if (modelDef?.provider === 'gemini') {
    const result = await tryGeminiCaption(prompt, modelDef.model);
    if (result) return result;
    const openai = await tryOpenAICaptionWithFallback(prompt);
    if (openai) return openai;
  } else {
    // Auto mode: OpenAI → Gemini
    const openai = await tryOpenAICaptionWithFallback(prompt);
    if (openai) return openai;
    const gemini = await tryGeminiCaption(prompt);
    if (gemini) return gemini;
  }

  throw new Error('Chưa cấu hình dịch vụ AI. Vui lòng thêm API key trong Cài đặt.');
}

/**
 * OpenAI caption với auto-fallback qua danh sách models
 */
async function tryOpenAICaptionWithFallback(prompt, preferredModel) {
  const openai = await getOpenAIClient();
  if (!openai) return null;

  // Build fallback list: preferred model first, then fallbacks
  const modelsToTry = preferredModel
    ? [preferredModel, ...OPENAI_CAPTION_FALLBACKS.filter(m => m !== preferredModel)]
    : [...OPENAI_CAPTION_FALLBACKS];

  for (const modelName of modelsToTry) {
    try {
      console.log(`[AI] Trying caption model: ${modelName}`);
      // GPT-5.x: dùng max_completion_tokens; GPT-4o: dùng max_tokens
      // GPT-5.5 (reasoning model) không hỗ trợ temperature khác 1
      const isReasoning = modelName === 'gpt-5.5' || modelName === 'gpt-5.4';
      const tokenParam = isGPT5Model(modelName)
        ? { max_completion_tokens: 2000 }
        : { max_tokens: 2000 };

      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: 'system',
            content: 'Bạn là một chuyên gia viết nội dung mạng xã hội, tin tức và báo chí. Viết bằng tiếng Việt có dấu. Đảm bảo nội dung hấp dẫn, thu hút tương tác cao.'
          },
          { role: 'user', content: prompt },
        ],
        ...tokenParam,
        ...(isReasoning ? {} : { temperature: 0.8 }),
      });
      const text = completion.choices[0].message.content;
      console.log(`[AI] ✅ Caption OK with model: ${modelName}`);
      return { caption: text, model: modelName };
    } catch (err) {
      console.error(`[AI] ❌ Caption failed (${modelName}):`, err.message);
      // Continue to next fallback
    }
  }
  return null;
}

async function tryGeminiCaption(prompt, modelName = 'gemini-2.5-flash-preview-04-17') {
  const genAI = await getGeminiClient();
  if (!genAI) return null;
  try {
    console.log(`[AI] Trying Gemini caption: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    console.log(`[AI] ✅ Gemini caption OK: ${modelName}`);
    return { caption: response.text(), model: modelName };
  } catch (err) {
    console.error(`[AI] ❌ Gemini caption failed (${modelName}):`, err.message);
    return null;
  }
}

// ============================
// IMAGE GENERATION
// Docs: https://developers.openai.com/api/docs/guides/image-generation
//
// gpt-image-2 API spec:
//   - Endpoint: POST /v1/images/generations
//   - KHÔNG có param "response_format" — luôn trả b64_json
//   - output_format: "png" | "jpeg" | "webp" (optional)
//   - size: "1024x1024" | "1536x1024" | "1024x1536" | "auto"
//   - quality: "low" | "medium" | "high" | "auto"
//   - n: number of images
//   - Response: { data: [{ b64_json: "..." }] }
//
// dall-e-3 API spec (legacy):
//   - response_format: "url" | "b64_json"
//   - size: "1024x1024" | "1024x1792" | "1792x1024"
// ============================
export async function generateImage({ product, style, customPrompt, preferModel }) {
  let prompt = customPrompt || style?.image_prompt_template || `Professional editorial photo about ${product}, dramatic lighting, cinematic composition, 4k quality`;
  prompt = prompt.replace(/\{\{product\}\}/g, product);

  const modelDef = preferModel ? IMAGE_MODELS[preferModel] : null;

  if (modelDef?.provider === 'openai') {
    const result = await tryOpenAIImageWithFallback(prompt, modelDef.model);
    if (result) return result;
    const gemini = await tryGeminiImage(prompt);
    if (gemini) return gemini;
  } else if (modelDef?.provider === 'gemini') {
    const result = await tryGeminiImage(prompt, modelDef.model);
    if (result) return result;
    const openai = await tryOpenAIImageWithFallback(prompt);
    if (openai) return openai;
  } else {
    const openai = await tryOpenAIImageWithFallback(prompt);
    if (openai) return openai;
    const gemini = await tryGeminiImage(prompt);
    if (gemini) return gemini;
  }

  throw new Error('Chưa cấu hình dịch vụ tạo hình ảnh. Vui lòng thêm API key trong Cài đặt.');
}

/**
 * OpenAI image generation với fallback: gpt-image-2 → gpt-image-1 → dall-e-3
 */
async function tryOpenAIImageWithFallback(prompt, preferredModel) {
  const openai = await getOpenAIImageClient();
  if (!openai) return null;

  const modelsToTry = preferredModel
    ? [preferredModel, 'gpt-image-1', 'dall-e-3'].filter((v, i, a) => a.indexOf(v) === i)
    : ['gpt-image-2', 'gpt-image-1', 'dall-e-3'];

  for (const modelName of modelsToTry) {
    try {
      console.log(`[AI] Trying image model: ${modelName}`);

      if (modelName === 'dall-e-3') {
        // DALL-E 3 (Legacy): hỗ trợ response_format, trả URL
        const response = await openai.images.generate({
          model: 'dall-e-3',
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          response_format: 'b64_json',
        });
        const b64 = response.data[0].b64_json;
        if (b64) {
          console.log(`[AI] ✅ Image OK with dall-e-3 (b64)`);
          return { url: `data:image/png;base64,${b64}`, model: 'dall-e-3', isBase64: true };
        }
        console.log(`[AI] ✅ Image OK with dall-e-3 (url)`);
        return { url: response.data[0].url, model: 'dall-e-3' };
      } else {
        // gpt-image-2 / gpt-image-1:
        //   - KHÔNG có response_format param
        //   - Luôn trả b64_json trong response.data[0].b64_json
        //   - Dùng output_format thay vì response_format
        const params = {
          model: modelName,
          prompt: prompt,
          n: 1,
          size: '1024x1024',
        };

        // gpt-image-2: quality=medium (nhanh 2-3x so với high, vẫn đẹp)
        if (modelName === 'gpt-image-2') {
          params.quality = 'medium';
        }

        const response = await openai.images.generate(params);

        // gpt-image-2 luôn trả b64_json (theo docs chính thức)
        const imageData = response.data[0];
        if (imageData.b64_json) {
          console.log(`[AI] ✅ Image OK with ${modelName} (b64_json)`);
          return {
            url: `data:image/png;base64,${imageData.b64_json}`,
            model: modelName,
            isBase64: true,
          };
        }
        // Fallback: nếu vì lý do gì đó trả url (SDK version cũ)
        if (imageData.url) {
          console.log(`[AI] ✅ Image OK with ${modelName} (url fallback)`);
          return { url: imageData.url, model: modelName };
        }
      }
    } catch (err) {
      console.error(`[AI] ❌ Image failed (${modelName}):`, err.message);
      if (err.status) console.error(`[AI]    HTTP status: ${err.status}`);
      // Continue to next model
    }
  }
  return null;
}

async function tryGeminiImage(prompt, modelName = 'gemini-2.0-flash-exp') {
  const genAI = await getGeminiClient();
  if (!genAI) return null;
  try {
    console.log(`[AI] Trying Gemini image: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['image', 'text'] },
    });
    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.inlineData) {
        const base64 = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        console.log(`[AI] ✅ Gemini image OK: ${modelName}`);
        return { url: `data:${mimeType};base64,${base64}`, model: 'gemini-imagen', isBase64: true };
      }
    }

    const textPart = parts.find(p => p.text);
    return { url: null, description: textPart?.text || 'Không thể tạo hình ảnh', model: 'gemini-imagen' };
  } catch (err) {
    console.error(`[AI] ❌ Gemini image failed (${modelName}):`, err.message);
    return null;
  }
}

export default { generateCaption, generateImage, getAvailableProviders, getModelLists };
