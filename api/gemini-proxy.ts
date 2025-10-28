import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImageStyle, MessageTheme, MessageType } from "../types";

// This function will be the handler for the Vercel serverless function.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    try {
        // Ensure API key is available
        if (!process.env.API_KEY) {
            return res.status(500).json({ error: "A chave da API do Gemini não está configurada no servidor." });
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const { action, payload } = req.body;

        switch (action) {
            case 'getSuggestions': {
                const { messageType, theme } = payload as { messageType: MessageType, theme: MessageTheme };

                const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com um tema "${theme}". As mensagens devem ser curtas (no máximo 30 palavras), inspiradoras e adequadas para compartilhar no WhatsApp. As sugestões devem ser em português do Brasil.`;
                
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                suggestions: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING },
                                    description: "Uma lista de 3 sugestões de mensagens."
                                }
                            },
                            required: ['suggestions']
                        }
                    },
                });

                const result = JSON.parse(response.text);
                return res.status(200).json(result.suggestions);
            }
                
            case 'generateImage': {
                const { message, imageStyle, messageType } = payload as { message: string, imageStyle: ImageStyle, messageType: MessageType };
                
                // Step 1: Generate a better image prompt in English
                const promptEnhancementPrompt = `Crie um prompt em inglês, curto e direto, para um modelo de geração de imagem. O prompt deve descrever uma cena visual que capture a essência da seguinte mensagem de "${messageType}": "${message}". O estilo da imagem deve ser "${imageStyle}". O prompt deve ser detalhado, focado em elementos visuais, cores e atmosfera, e não deve conter nenhum texto ou letras visíveis na imagem. O prompt deve ser apenas uma única frase concisa em inglês.`;

                const promptResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: promptEnhancementPrompt,
                });
                
                const imagePrompt = promptResponse.text.trim();

                // Step 2: Generate the image
                const imageResponse = await ai.models.generateImages({
                    model: 'imagen-4.0-generate-001',
                    prompt: imagePrompt,
                    config: {
                        numberOfImages: 1,
                        outputMimeType: 'image/jpeg',
                        aspectRatio: '1:1',
                    },
                });

                const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
                const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                
                return res.status(200).json({ imageUrl });
            }

            default:
                return res.status(400).json({ error: 'Ação desconhecida.' });
        }
    } catch (error) {
        console.error('Erro no proxy da API Gemini:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
        return res.status(500).json({ error: `Erro interno do servidor: ${errorMessage}` });
    }
}
