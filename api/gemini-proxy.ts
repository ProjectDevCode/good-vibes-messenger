import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MessageType, MessageTheme, ImageStyle } from "../types";

async function getSuggestionsHandler(payload: { messageType: MessageType; theme: MessageTheme; }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("A chave de API do Gemini (GEMINI_API_KEY) não foi configurada no servidor.");
    }
    const ai = new GoogleGenAI({ apiKey });

    const { messageType, theme } = payload;
    const model = "gemini-2.5-flash";
    const prompt = `Gere 3 sugestões de mensagens curtas e inspiradoras de "${messageType}" com o tema "${theme}". As mensagens devem ser adequadas para enviar no WhatsApp. Formato da resposta deve ser um array JSON de strings. Por exemplo: ["mensagem 1", "mensagem 2", "mensagem 3"]`;

    const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
            },
        },
    });

    const text = response.text.trim();
    try {
        return JSON.parse(text);
    } catch(e) {
        console.error("Falha ao analisar JSON do Gemini:", text);
        throw new Error("A resposta da IA para sugestões não estava no formato esperado.");
    }
}

async function generateImageHandler(payload: { message: string; imageStyle: ImageStyle; messageType: MessageType; }) {
    const clipDropApiKey = process.env.CLIPDROP_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!clipDropApiKey) {
        throw new Error("A chave de API do ClipDrop (CLIPDROP_API_KEY) não foi configurada no servidor.");
    }
    if (!geminiApiKey) {
         throw new Error("A chave de API do Gemini (GEMINI_API_KEY) não foi configurada no servidor para otimizar o prompt.");
    }

    const { message, imageStyle, messageType } = payload;

    // Use Gemini to enhance the prompt for better image results
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const enhancementPrompt = `Traduza a seguinte mensagem em português para um prompt de imagem em inglês, conciso e artístico, para uma IA de geração de imagem. O estilo deve ser "${imageStyle}". O tema é "${messageType}". O prompt deve ser apenas descritivo, sem incluir a palavra "message" ou aspas. Mensagem: "${message}"`;
    
    const enhancementResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: enhancementPrompt,
    });
    const enhancedPrompt = enhancementResponse.text.trim();
    
    const formData = new FormData();
    formData.append('prompt', enhancedPrompt);

    const response = await fetch('https://stable-diffusion-api.com/api/v3/text2img', {
        method: 'POST',
        headers: {
            'x-api-key': clipDropApiKey,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`ClipDrop API Error: ${response.status}`, errorText);
        throw new Error(`Falha ao gerar imagem com ClipDrop: ${errorText}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const imageUrl = `data:image/png;base64,${Buffer.from(imageBuffer).toString('base64')}`;
    
    return { imageUrl };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { action, payload } = req.body;
        if (!action || !payload) {
            return res.status(400).json({ error: 'Ação ou payload ausente na requisição' });
        }

        switch (action) {
            case 'getSuggestions':
                const suggestions = await getSuggestionsHandler(payload);
                return res.status(200).json(suggestions);
            case 'generateImage':
                const imageData = await generateImageHandler(payload);
                return res.status(200).json(imageData);
            default:
                return res.status(400).json({ error: 'Ação desconhecida' });
        }
    } catch (error) {
        console.error("Erro no proxy da API:", error);
        const errorMessage = error instanceof Error ? error.message : 'Erro interno no servidor';
        return res.status(500).json({ error: errorMessage });
    }
}
