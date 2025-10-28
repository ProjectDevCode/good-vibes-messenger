import { GoogleGenAI, Type } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MessageType, MessageTheme, ImageStyle } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable is not set.");
        return res.status(500).json({ error: 'API key not configured on the server.' });
    }

    // Fix: Per coding guidelines, initialize GoogleGenAI inside the handler.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { action, payload } = req.body;

    try {
        switch (action) {
            case 'getSuggestions': {
                const { messageType, theme } = payload as { messageType: MessageType; theme: MessageTheme };
                if (!messageType || !theme) {
                    return res.status(400).json({ error: 'messageType and theme are required.' });
                }

                const prompt = `Gere 3 sugestões curtas para uma mensagem de "${messageType}" com um tema "${theme}". As mensagens devem ser positivas, inspiradoras e adequadas para compartilhar no WhatsApp. A resposta deve ser um array JSON de strings, sem nenhuma formatação ou texto adicional. Exemplo: ["Mensagem 1.", "Mensagem 2.", "Mensagem 3."]`

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: {
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                        temperature: 0.8,
                    },
                });
                
                // Fix: Ensure the response text is properly parsed.
                const suggestions = JSON.parse(response.text.trim());
                return res.status(200).json(suggestions);
            }

            case 'generateImage': {
                const { message, imageStyle, messageType, theme } = payload as { message: string; imageStyle: ImageStyle; messageType: MessageType; theme: MessageTheme };
                if (!message || !imageStyle || !messageType || !theme) {
                    return res.status(400).json({ error: 'message, imageStyle, messageType, and theme are required.' });
                }

                const imagePromptGeneratorPrompt = `Crie um prompt de imagem em inglês, detalhado e evocativo, para um modelo de IA de geração de imagem. A imagem deve ser no estilo "${imageStyle}" e capturar a essência da seguinte mensagem em português: "${message}". O tema geral é "${messageType}" e "${theme}". O prompt deve descrever uma cena visualmente rica e inspiradora, sem incluir NENHUM texto, letras ou palavras na imagem. O prompt deve ser apenas uma frase ou parágrafo descritivo.`;
                
                // Fix: Use Gemini to generate a high-quality image prompt.
                const promptGenResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: imagePromptGeneratorPrompt,
                });
                const imagePrompt = promptGenResponse.text.trim();

                // Fix: Generate image using imagen-4.0 for high quality results.
                const imageResponse = await ai.models.generateImages({
                    model: 'imagen-4.0-generate-001',
                    prompt: imagePrompt,
                    config: {
                        numberOfImages: 1,
                        outputMimeType: 'image/png',
                        aspectRatio: '1:1',
                    },
                });

                const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
                const imageUrl = `data:image/png;base64,${base64ImageBytes}`;

                return res.status(200).json({ imageUrl });
            }

            default:
                return res.status(400).json({ error: 'Invalid action provided.' });
        }
    } catch (error) {
        console.error('Error processing Gemini request in proxy:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred on the server.';
        return res.status(500).json({ error: `Failed to process your request. ${errorMessage}` });
    }
}
