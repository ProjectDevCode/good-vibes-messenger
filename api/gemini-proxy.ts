import { GoogleGenAI, Type } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Initialize the Google Gemini AI client
if (!process.env.API_KEY) {
    // This will be caught by the handler's try/catch and returned as a 500.
    throw new Error('API_KEY environment variable is not set');
}
// FIX: Per coding guidelines, API key should be obtained from process.env.API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getSuggestions = async (payload: { messageType: string; theme: string }): Promise<string[]> => {
    const { messageType, theme } = payload;
    const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com tema "${theme}". As mensagens devem ser curtas, inspiradoras e adequadas para compartilhar em redes sociais. Formate a saída como um array JSON de strings.`;
  
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.STRING,
                    description: 'Uma sugestão de mensagem de saudação.'
                }
            }
        }
    });

    try {
        const text = response.text.trim();
        // The model should return a clean JSON array string when using responseSchema
        const suggestions = JSON.parse(text);
        if (!Array.isArray(suggestions) || !suggestions.every(s => typeof s === 'string')) {
            throw new Error('O formato da resposta da IA para sugestões é inválido.');
        }
        return suggestions;
    } catch (e) {
        console.error("Falha ao analisar as sugestões da IA:", response.text);
        throw new Error("Não foi possível processar a resposta do modelo de IA para sugestões.");
    }
};

const generateImage = async (payload: { message: string; imageStyle: string; messageType: string; theme: string }): Promise<{ imageUrl: string }> => {
    const { message, imageStyle } = payload;
  
    // Create a detailed, visually-rich prompt in English for the image generation model.
    const imagePromptInstruction = `Baseado na seguinte mensagem em português, crie um prompt para um modelo de geração de imagem.
    Mensagem: "${message}"
    O prompt deve ser em inglês, artístico, e descrever uma cena que capture a essência da mensagem.
    O estilo da imagem deve ser: ${imageStyle}.
    Responda apenas com o prompt em inglês, sem nenhum outro texto.`;

    const promptResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: imagePromptInstruction,
    });

    const imagePrompt = promptResponse.text.trim();

    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: imagePrompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: '1:1',
        },
    });

    const base64ImageBytes = response.generatedImages?.[0]?.image?.imageBytes;

    if (base64ImageBytes) {
        const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
        return { imageUrl };
    } else {
        throw new Error('A IA não retornou uma imagem. Tente novamente com uma mensagem diferente.');
    }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { action, payload } = req.body;

        if (!action || !payload) {
            return res.status(400).json({ error: 'Ação ou payload ausentes na requisição' });
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
                return res.status(400).json({ error: 'Ação desconhecida' });
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('Erro no proxy Gemini:', error);
        const errorMessage = error instanceof Error ? error.message : 'Um erro inesperado ocorreu no servidor';
        return res.status(500).json({ error: errorMessage });
    }
}
