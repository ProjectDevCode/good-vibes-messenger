// FIX: Implement the full Gemini API proxy logic.
// This file was previously a placeholder and caused errors.
// The new implementation handles 'getSuggestions' and 'generateImage' actions
// by calling the Google Gemini API.
import { GoogleGenAI, Type } from '@google/genai';

// Initialize the Google Gemini AI client
// The API key is sourced from environment variables, which is a security best practice.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates greeting message suggestions using the Gemini API.
 * @param payload - The request payload containing messageType and theme.
 * @returns A promise that resolves to an array of string suggestions.
 */
const getSuggestions = async (payload: { messageType: string; theme: string }): Promise<string[]> => {
    const { messageType, theme } = payload;
    
    // Use gemini-2.5-flash for efficient text generation.
    const model = 'gemini-2.5-flash';
    
    // A detailed prompt to guide the AI in generating relevant and well-formatted suggestions.
    const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com tema "${theme}". As mensagens devem ser curtas, inspiradoras e adequadas para compartilhar no WhatsApp. Retorne o resultado como um array JSON de strings, sem nenhum outro texto ou formatação. Exemplo de saída: ["mensagem 1", "mensagem 2", "mensagem 3"]`;

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.STRING
                }
            }
        }
    });

    let jsonText = response.text.trim();
    // Clean up potential markdown formatting from the AI's response for robust parsing.
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7, -3).trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3, -3).trim();
    }
    
    try {
        const suggestions = JSON.parse(jsonText);
        // Basic validation to ensure the response matches the expected type.
        if (!Array.isArray(suggestions) || !suggestions.every(s => typeof s === 'string')) {
            throw new Error('Formato de sugestões inválido recebido da IA.');
        }
        return suggestions;
    } catch (e) {
        console.error("Falha ao analisar o JSON de sugestões:", jsonText, e);
        throw new Error("A resposta da IA para sugestões não estava em um formato JSON válido.");
    }
};

/**
 * Generates an image based on a message using a two-step AI process.
 * 1. Create a descriptive English prompt from the Portuguese message.
 * 2. Generate an image using the English prompt.
 * @param payload - The request payload containing message, imageStyle, messageType, and theme.
 * @returns A promise that resolves to an object containing the image URL (data URI).
 */
const generateImage = async (payload: { message: string; imageStyle: string; messageType: string; theme:string }): Promise<{ imageUrl: string }> => {
    const { message, imageStyle, messageType, theme } = payload;

    // Step 1: Create a descriptive English prompt for the image generation model.
    // This improves image quality as image models are often better trained on English.
    const textModel = 'gemini-2.5-flash';
    const promptCreationPrompt = `Crie um prompt de imagem em inglês, detalhado e visualmente rico, a partir da seguinte mensagem em português: "${message}". O prompt deve incorporar o estilo de "${imageStyle}" e ser apropriado para uma mensagem de "${messageType}" com o tema "${theme}". O resultado deve ser apenas o prompt em inglês, sem nenhuma explicação ou texto adicional.`;

    const promptResponse = await ai.models.generateContent({
        model: textModel,
        contents: promptCreationPrompt,
    });
    
    const imagePrompt = promptResponse.text.trim();
    
    // Step 2: Generate the image using the created prompt with the Imagen model for high quality results.
    const imageModel = 'imagen-4.0-generate-001';
    const imageResponse = await ai.models.generateImages({
        model: imageModel,
        prompt: imagePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: '1:1', // Square images are versatile for social media.
        },
    });

    if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
        throw new Error("A IA não conseguiu gerar uma imagem.");
    }

    const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
    // Return a data URI that can be used directly in the `src` attribute of an `<img>` tag.
    const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
    
    return { imageUrl };
};

/**
 * Vercel Serverless Function handler that acts as a secure proxy to the Google Gemini API.
 * It routes requests to the appropriate function based on the 'action' parameter.
 * This approach keeps API keys off the client-side.
 */
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { action, payload } = req.body;

        if (!action || !payload) {
            return res.status(400).json({ error: 'Ação ou payload ausentes no corpo da requisição.' });
        }

        let result;

        switch (action) {
            case 'getSuggestions':
                result = await getSuggestions(payload);
                break;
            case 'generateImage':
                result = await generateImage(payload);
                break;
            default:
                return res.status(400).json({ error: `Ação desconhecida: ${action}` });
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error("Erro na API proxy do Gemini:", error);
        const errorMessage = error instanceof Error ? error.message : 'Um erro inesperado ocorreu.';
        return res.status(500).json({ error: `Erro interno do servidor: ${errorMessage}` });
    }
}
