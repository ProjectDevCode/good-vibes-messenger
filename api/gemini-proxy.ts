import { GoogleGenAI, Type } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MessageType, MessageTheme, ImageStyle } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { action, payload } = req.body;

    try {
        switch (action) {
            case 'getSuggestions': {
                if (!process.env.GEMINI_API_KEY) {
                    console.error("GEMINI_API_KEY environment variable is not set.");
                    return res.status(500).json({ error: 'A chave da API do Gemini não está configurada no servidor.' });
                }
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

                const { messageType, theme } = payload as { messageType: MessageType; theme: MessageTheme };
                if (!messageType || !theme) {
                    return res.status(400).json({ error: 'messageType e theme são obrigatórios.' });
                }

                const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com um tema "${theme}". As mensagens devem ser curtas, inspiradoras, incluir emojis relevantes e adequadas para compartilhar no WhatsApp. Retorne um array JSON de strings.`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ parts: [{ text: prompt }] }],
                    config: {
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                    },
                });
                
                const suggestions = JSON.parse(response.text.trim());
                return res.status(200).json(suggestions);
            }

            case 'generateImage': {
                 if (!process.env.HUGGINGFACE_API_KEY) {
                    console.error("HUGGINGFACE_API_KEY environment variable is not set.");
                    return res.status(500).json({ error: 'A chave da API do Hugging Face não está configurada no servidor.' });
                }

                const { message, imageStyle, messageType, theme } = payload as { message: string; imageStyle: ImageStyle; messageType: MessageType, theme: MessageTheme };
                if (!message || !imageStyle || !messageType || !theme) {
                    return res.status(400).json({ error: 'message, imageStyle, messageType e theme são obrigatórios.' });
                }

                const themeInstructions = theme === MessageTheme.CHRISTIAN
                    ? "Incorpore elementos como luz divina, raios de sol suaves, pombas, vitrais ou formas de cruz sutis na composição."
                    : "Use elementos da natureza como um lindo nascer do sol, flores vibrantes, um céu estrelado ou paisagens serenas.";

                const prompt = `Uma obra de arte digital no estilo "${imageStyle}". O foco principal e inegociável da imagem é o texto "${messageType}", renderizado de forma clara, legível e artisticamente integrada à cena. A imagem deve evocar a sensação da mensagem: "${message}". ${themeInstructions} A composição deve ser bonita, inspiradora e de altíssima qualidade.`;
                
                const hfResponse = await fetch(
                    "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3-medium-diffusers",
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                            "Content-Type": "application/json",
                        },
                        method: "POST",
                        body: JSON.stringify({
                            inputs: prompt,
                            parameters: {
                                negative_prompt: "ugly, distorted text, disfigured, poor quality, bad anatomy, watermark, signature",
                            }
                        }),
                    }
                );

                if (!hfResponse.ok) {
                    const errorText = await hfResponse.text();
                    console.error("Hugging Face API error:", errorText);
                    throw new Error(`Falha na API de imagem: ${errorText}`);
                }
                
                const imageBlob = await hfResponse.blob();
                if (!imageBlob.type.startsWith('image/')) {
                    throw new Error("A resposta da API de imagem não era uma imagem válida.");
                }

                const buffer = Buffer.from(await imageBlob.arrayBuffer());
                const imageUrl = `data:${imageBlob.type};base64,${buffer.toString('base64')}`;

                return res.status(200).json({ imageUrl });
            }

            default:
                return res.status(400).json({ error: 'Ação inválida.' });
        }
    } catch (error) {
        console.error('Erro no proxy do servidor:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido no servidor.';
        return res.status(500).json({ error: `Erro interno do servidor: ${errorMessage}` });
    }
}
