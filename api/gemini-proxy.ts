// FIX: This file was previously a placeholder. This is the full implementation of the Gemini API proxy.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
// Assuming types.ts is at the project root, and this file is in api/
import { ImageStyle, MessageTheme, MessageType } from '../types';

// Gemini API client initialization
// The API key MUST be obtained exclusively from the environment variable `process.env.API_KEY`.
if (!process.env.API_KEY) {
  // On Vercel, this will cause the function to fail, which is intended.
  // We log to provide more context in serverless function logs.
  console.error('API_KEY environment variable is not set');
  throw new Error('API_KEY environment variable is not set');
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates greeting suggestions using Gemini.
 */
const getSuggestions = async (messageType: MessageType, theme: MessageTheme): Promise<string[]> => {
  const model = 'gemini-2.5-flash';
  // Prompt in Portuguese to match the app's language
  const prompt = `Gere 5 sugestões de mensagens de "${messageType}" com um tema "${theme}". As mensagens devem ser curtas, inspiradoras e adequadas para compartilhar em redes sociais. As mensagens devem ser em Português do Brasil.`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              description: 'Uma sugestão de mensagem.'
            },
            description: 'Uma lista de 5 sugestões de mensagens.'
          },
        },
        required: ['suggestions'],
      },
    },
  });

  const responseText = response.text;
  try {
    const parsed = JSON.parse(responseText);
    if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
      return parsed.suggestions;
    }
  } catch (e) {
    console.error('Error parsing Gemini JSON response for suggestions:', e, 'Response text:', responseText);
    // Fallback if JSON parsing fails but we have text, useful for debugging or resilient UX
    if (responseText) {
      // Simple parsing for list-like text
      return responseText.split('\n').map(s => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
    }
  }
  
  throw new Error('Não foi possível gerar sugestões a partir da resposta da API.');
};

/**
 * Generates an image from a message using Gemini.
 */
const generateImage = async (
  message: string,
  imageStyle: ImageStyle,
  messageType: MessageType,
  theme: MessageTheme
): Promise<{ imageUrl: string }> => {
  const model = 'imagen-4.0-generate-001';
  // Detailed prompt for better image results
  const prompt = `Crie uma imagem de alta qualidade, no estilo ${imageStyle}, que visualmente represente e complemente a seguinte mensagem de "${messageType}" com tema "${theme}": "${message}". A imagem deve ser bonita, inspiradora, com cores vibrantes e sem nenhum texto sobreposto.`;

  const response = await ai.models.generateImages({
    model,
    prompt,
    config: {
      numberOfImages: 1,
      outputMimeType: 'image/png', // Using PNG for quality
      aspectRatio: '1:1', // Square image as seen in the UI
    },
  });

  const base64ImageBytes = response.generatedImages[0]?.image?.imageBytes;
  if (!base64ImageBytes) {
    throw new Error('A API não retornou dados de imagem válidos.');
  }

  const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
  return { imageUrl };
};

/**
 * Vercel Serverless Function handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { action, payload } = req.body;

    if (!action || !payload) {
      return res.status(400).json({ error: 'Ação e payload são obrigatórios.' });
    }

    switch (action) {
      case 'getSuggestions': {
        const { messageType, theme } = payload;
        if (!messageType || !theme) {
            return res.status(400).json({ error: 'messageType e theme são obrigatórios para getSuggestions.' });
        }
        const suggestions = await getSuggestions(messageType, theme);
        return res.status(200).json(suggestions);
      }
      case 'generateImage': {
        const { message, imageStyle, messageType, theme } = payload;
         if (!message || !imageStyle || !messageType || !theme) {
            return res.status(400).json({ error: 'message, imageStyle, messageType e theme são obrigatórios para generateImage.' });
        }
        const result = await generateImage(
          message,
          imageStyle,
          messageType,
          theme
        );
        return res.status(200).json(result);
      }
      default:
        return res.status(400).json({ error: 'Ação inválida.' });
    }
  } catch (error) {
    console.error('[GEMINI_PROXY_ERROR]', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
    // Send a more user-friendly error message to the client
    res.status(500).json({ error: `Ocorreu um erro ao comunicar com a IA: ${errorMessage}` });
  }
}
