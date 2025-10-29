// Fix: Implement the full content for the Gemini API proxy to resolve the errors.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
import { MessageType, MessageTheme, ImageStyle } from '../types';

if (!process.env.API_KEY) {
    // This will cause the function to fail on startup if the API key is not set.
    throw new Error("A variável de ambiente API_KEY não está definida.");
}

// Initialize the Google Gemini API client.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates greeting message suggestions using the Gemini API.
 */
const getSuggestions = async (messageType: MessageType, theme: MessageTheme): Promise<string[]> => {
    const model = 'gemini-2.5-flash';
    const systemInstruction = `Você é um assistente criativo que gera mensagens de saudação em português do Brasil. 
      Responda APENAS com um array JSON de strings, como ["mensagem1", "mensagem2", "mensagem3"]. 
      Não inclua nenhuma outra formatação, texto ou explicação. As mensagens devem ser curtas e inspiradoras.`;
    const prompt = `Gere 3 mensagens curtas de "${messageType}" com um tema "${theme}".`;

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.STRING,
                    description: 'Uma mensagem de saudação curta e inspiradora.'
                }
            }
        }
    });
    
    const jsonText = response.text.trim();
    const suggestions = JSON.parse(jsonText);
    
    if (!Array.isArray(suggestions)) {
        console.error("A resposta da API Gemini não foi um array JSON:", jsonText);
        throw new Error("Formato de resposta inesperado da IA para sugestões.");
    }
    
    return suggestions;
};

/**
 * Generates an image based on a message and style using the Gemini API.
 */
const generateImage = async (message: string, imageStyle: ImageStyle, messageType: MessageType, theme: MessageTheme): Promise<string> => {
    // Step 1: Use a text model to create a detailed and English image prompt.
    const promptGeneratorModel = 'gemini-2.5-flash';
    const imagePromptSystemInstruction = `You are an expert in creating vivid, detailed, and artistic prompts for an AI image generation model. 
      Given a greeting message and its context, create a single, descriptive prompt in English that captures the essence of the message.
      The prompt should be suitable for generating a beautiful, high-quality image. Do not add any extra text, explanations, or quotes. Just output the prompt.`;
    const imagePromptRequest = `
      Create a detailed image generation prompt based on the following information:
      - Greeting message (in Portuguese): "${message}"
      - Message type: ${messageType}
      - Theme: ${theme}
      - Desired image style: ${imageStyle}
    `;

    const promptResponse = await ai.models.generateContent({
        model: promptGeneratorModel,
        contents: imagePromptRequest,
        config: {
          systemInstruction: imagePromptSystemInstruction,
        },
    });
    const imagePrompt = promptResponse.text.trim();

    // Step 2: Generate the image using the detailed prompt with Imagen.
    const imageModel = 'imagen-4.0-generate-001';
    const imageResponse = await ai.models.generateImages({
        model: imageModel,
        prompt: imagePrompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '1:1',
        },
    });

    const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;
};

/**
 * Vercel Function handler for the Gemini API proxy.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { action, payload } = req.body;

        if (!action || !payload) {
            return res.status(400).json({ error: 'Ação ou payload ausente no corpo da requisição.' });
        }

        switch (action) {
            case 'getSuggestions': {
                const { messageType, theme } = payload;
                if (!messageType || !theme) {
                    return res.status(400).json({ error: 'messageType e theme são obrigatórios para getSuggestions.' });
                }
                const suggestions = await getSuggestions(messageType as MessageType, theme as MessageTheme);
                return res.status(200).json(suggestions);
            }
            case 'generateImage': {
                const { message, imageStyle, messageType, theme } = payload;
                if (!message || !imageStyle || !messageType || !theme) {
                    return res.status(400).json({ error: 'message, imageStyle, messageType e theme são obrigatórios para generateImage.' });
                }
                const imageUrl = await generateImage(message, imageStyle, messageType, theme);
                return res.status(200).json({ imageUrl });
            }
            default:
                return res.status(400).json({ error: `Ação desconhecida: ${action}` });
        }

    } catch (error) {
        console.error('Erro no proxy da API Gemini:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
        res.status(500).json({ error: `Erro interno do servidor: ${errorMessage}` });
    }
}
