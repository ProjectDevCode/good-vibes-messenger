import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { MessageType, MessageTheme, ImageStyle } from '../types';

// Check if the API key is set
if (!process.env.API_KEY) {
    // This will cause the function to fail on deployment if the key is not set, which is good.
    throw new Error("A variável de ambiente API_KEY não está definida.");
}

// Initialize the Gemini client using the API key from environment variables
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Define the main handler function for the Vercel serverless function
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        // Destructure action and payload from the request body
        const { action, payload } = req.body;

        // Use a switch statement to handle different actions
        switch (action) {
            case 'getSuggestions': {
                const { messageType, theme }: { messageType: MessageType, theme: MessageTheme } = payload;
                
                // Construct a detailed prompt for the AI to generate message suggestions
                const prompt = `Gere 3 sugestões curtas e inspiradoras de mensagens de "${messageType}" com o tema "${theme}". As mensagens devem ser adequadas para compartilhar em redes sociais como WhatsApp. Retorne sua resposta como um array JSON de strings. Não inclua nenhuma formatação markdown ou texto extra, apenas o array JSON.`;

                // Call the Gemini API to generate content
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash', // Use a fast and efficient model for text generation
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.STRING,
                                description: "Uma sugestão de mensagem."
                            },
                        },
                        temperature: 0.8, // Add some creativity to the suggestions
                    },
                });

                // Parse the JSON response from the model
                const suggestions = JSON.parse(response.text);
                return res.status(200).json(suggestions);
            }

            case 'generateImage': {
                const { message, imageStyle, messageType }: { message: string, imageStyle: ImageStyle, messageType: MessageType } = payload;

                // Step 1: Use a text model to create a high-quality, descriptive image prompt in English
                const promptCreationResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: `Create an English prompt for an image generation model. The prompt should describe a visual scene that captures the essence of the following Portuguese message: "${message}". The image style must be "${imageStyle}" and the mood should fit a "${messageType}" greeting. The prompt should be detailed, evocative, and focus on visual elements (colors, lighting, composition). Respond only with the prompt in English, without any other text or markdown.`,
                });
                
                const imagePrompt = promptCreationResponse.text;

                // Step 2: Use the generated prompt to create an image
                const imageResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image', // Use the specialized model for image generation
                    contents: { parts: [{ text: imagePrompt }] },
                    config: {
                        responseModalities: [Modality.IMAGE], // Specify that we expect an image in response
                    },
                });

                // Extract the base64 encoded image data from the response
                let base64ImageBytes: string | undefined;
                if (imageResponse.candidates?.[0]?.content?.parts) {
                    for (const part of imageResponse.candidates[0].content.parts) {
                        if (part.inlineData) {
                            base64ImageBytes = part.inlineData.data;
                            break;
                        }
                    }
                }

                // If no image data is found, throw an error
                if (!base64ImageBytes) {
                    throw new Error('Não foi possível extrair os dados da imagem da resposta da API.');
                }
                
                // Construct a data URL and send it back to the client
                const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                return res.status(200).json({ imageUrl });
            }

            // Handle unknown actions
            default:
                return res.status(400).json({ error: 'Ação desconhecida' });
        }
    } catch (error) {
        // Log the error and send a generic error message to the client
        console.error('Erro na Vercel Function:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido no servidor.';
        return res.status(500).json({ error: `Erro ao comunicar com a API do Gemini: ${errorMessage}` });
    }
}
