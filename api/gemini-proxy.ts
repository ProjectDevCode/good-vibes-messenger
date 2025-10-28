// Fix: Implement the full content for the Gemini API proxy.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from "@google/genai";
// Correctly import types from the `src` directory.
import { MessageType, MessageTheme, ImageStyle } from '../src/types';

// Per @google/genai guidelines, the API key must be from an environment variable.
if (!process.env.API_KEY) {
  // In a serverless environment, this will cause the function to fail with a clear error.
  throw new Error("API_KEY environment variable is not set.");
}

// Per @google/genai guidelines, initialize with a named parameter.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates message suggestions using the Gemini API.
 */
async function getGreetingSuggestions(
  messageType: MessageType,
  theme: MessageTheme
): Promise<string[]> {
  const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com um tema "${theme}". As mensagens devem ser curtas, impactantes e adequadas para compartilhar no WhatsApp. Retorne apenas um array JSON de strings, sem nenhum texto ou formatação adicional. Exemplo de saída: ["mensagem 1", "mensagem 2", "mensagem 3"]`;

  // Per @google/genai guidelines, use gemini-2.5-flash for basic text tasks.
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          description: "Uma sugestão de mensagem."
        }
      }
    }
  });
  
  // Per @google/genai guidelines, access the text property for the response.
  const text = response.text;
  const suggestions = JSON.parse(text);

  if (Array.isArray(suggestions) && suggestions.every(s => typeof s === 'string')) {
      return suggestions;
  } else {
      throw new Error("A resposta da IA não está no formato de array de strings esperado.");
  }
}

/**
 * Generates an image based on a message using the Gemini API.
 */
async function generateImageFromMessage(
  message: string,
  imageStyle: ImageStyle,
  messageType: MessageType,
): Promise<string> {
    const themeDescription = messageType === MessageType.GOOD_MORNING 
        ? "com uma atmosfera de amanhecer, com cores suaves e luz natural" 
        : "com uma atmosfera noturna, com céu estrelado ou lua";

    const prompt = `Crie uma imagem inspiradora baseada na seguinte mensagem: "${message}". A imagem deve ter um estilo de "${imageStyle}" e ${themeDescription}. A imagem deve ser bonita, serena e adequada para uma mensagem de ${messageType}. Não inclua nenhum texto na imagem.`;

  // Per @google/genai guidelines, use imagen-4.0-generate-001 for high-quality images.
  const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: '1:1',
      },
  });

  if (response.generatedImages && response.generatedImages.length > 0) {
      // Per @google/genai guidelines, extract the base64 image bytes.
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      return `data:image/png;base64,${base64ImageBytes}`;
  } else {
      throw new Error('A IA não retornou uma imagem.');
  }
}

/**
 * Vercel Serverless Function handler to proxy requests to the Gemini API.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { action, payload } = req.body;

    if (!action || !payload) {
      return res.status(400).json({ error: 'Ação ou payload ausente na requisição.' });
    }

    switch (action) {
      case 'getSuggestions': {
        const { messageType, theme } = payload as { messageType: MessageType, theme: MessageTheme };
        if (!messageType || !theme) {
          return res.status(400).json({ error: 'Parâmetros inválidos para getSuggestions.' });
        }
        const suggestions = await getGreetingSuggestions(messageType, theme);
        return res.status(200).json(suggestions);
      }

      case 'generateImage': {
        const { message, imageStyle, messageType } = payload as { message: string, imageStyle: ImageStyle, messageType: MessageType };
         if (!message || !imageStyle || !messageType) {
          return res.status(400).json({ error: 'Parâmetros inválidos para generateImage.' });
        }
        const imageUrl = await generateImageFromMessage(message, imageStyle, messageType);
        return res.status(200).json({ imageUrl });
      }

      default:
        return res.status(400).json({ error: 'Ação inválida.' });
    }
  } catch (error) {
    console.error('Erro no proxy Gemini:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
    // The frontend is designed to display this error message.
    return res.status(500).json({ error: errorMessage });
  }
}
