import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MessageType, MessageTheme, ImageStyle } from '../types';

// Usa a chave de API correta para o Gemini
const geminiAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function handleGetSuggestions(payload: any, res: VercelResponse) {
    const { messageType, theme } = payload;
    if (!messageType || !theme) {
        return res.status(400).json({ error: 'Tipo de mensagem e tema são obrigatórios.' });
    }

    const systemInstruction = `Você é um assistente criativo que gera mensagens inspiradoras.
    O usuário quer 3 mensagens curtas e amigáveis.
    O tipo de mensagem é "${messageType}".
    O tema é "${theme}".
    Inclua emojis relevantes no final de cada mensagem para torná-las mais vibrantes e amigáveis.
    Se o tema for "Cristão", inclua referências ou sentimentos cristãos sutis.
    Responda APENAS com um array JSON de strings, sem nenhum texto adicional ou formatação.
    Exemplo de resposta: ["mensagem 1 ☀️", "mensagem 2 🙏", "mensagem 3 😊"]`;
    
    try {
        const response = await geminiAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Gerar 3 mensagens de "${messageType}" com tema "${theme}".`,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.STRING
                    }
                }
            }
        });
        
        const text = response.text.trim();
        const suggestions = JSON.parse(text);
        return res.status(200).json(suggestions);
    } catch (error) {
        console.error("Erro ao gerar sugestões:", error);
        return res.status(500).json({ error: 'Falha ao se comunicar com a IA para gerar sugestões.' });
    }
}

async function handleGenerateImage(payload: any, res: VercelResponse) {
    const { message, imageStyle, messageType } = payload;
    if (!message || !imageStyle || !messageType) {
        return res.status(400).json({ error: 'Mensagem, estilo da imagem e tipo de mensagem são obrigatórios.' });
    }
    if (!process.env.HUGGINGFACE_API_KEY) {
        return res.status(500).json({ error: 'A chave da API do Hugging Face não está configurada no servidor.' });
    }

    // Passo 1: Usar o Gemini para criar um prompt melhor e em inglês para o modelo de imagem.
    const promptOptimizerInstruction = `You are an expert prompt engineer for text-to-image AI models.
    Your task is to convert a user's simple request into a rich, descriptive, and artistic prompt in English.
    The prompt should be a single, comma-separated string of descriptive keywords and phrases.
    Focus on visual details: lighting, composition, mood, and artistic style.
    Crucially, the image MUST feature the text "${messageType}" prominently and beautifully integrated into the scene. The text should be legible and artistic.
    The final prompt must be in English.
    Example:
    User request: Bom dia, Realista, "O sol nasce, um novo dia começa"
    Your response: "A beautiful, vibrant sunrise over a peaceful landscape, with the text 'Bom dia' written in an elegant, glowing font, hyper-realistic, cinematic lighting, detailed, 8k, masterpiece"
    `;

    let optimizedPrompt = '';
    try {
        const response = await geminiAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `User request: ${messageType}, ${imageStyle}, "${message}"`,
            config: {
                systemInstruction: promptOptimizerInstruction,
            }
        });
        optimizedPrompt = response.text.trim();
    } catch (error) {
        console.error("Erro ao otimizar o prompt:", error);
        return res.status(500).json({ error: 'Falha ao otimizar o prompt para a imagem.' });
    }

    // Passo 2: Chamar a API do Hugging Face com o prompt otimizado.
    const HUGGINGFACE_MODEL_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0";

    try {
        const imageResponse = await fetch(
            HUGGINGFACE_MODEL_URL,
            {
                headers: {
                    Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                    "Content-Type": "application/json",
                },
                method: "POST",
                body: JSON.stringify({ inputs: optimizedPrompt }),
            }
        );

        if (!imageResponse.ok) {
            const errorBody = await imageResponse.json().catch(() => ({ error: 'Resposta inválida da API do Hugging Face.' }));
            console.error("Erro da API Hugging Face:", errorBody);
            if (errorBody.error && typeof errorBody.error === 'string' && errorBody.error.includes("is currently loading")) {
                 return res.status(503).json({ error: `O modelo de imagem está sendo carregado, tente novamente em instantes.` });
            }
            throw new Error(`A API do Hugging Face respondeu com o status: ${imageResponse.status}`);
        }

        const imageBlob = await imageResponse.blob();
        const buffer = Buffer.from(await imageBlob.arrayBuffer());
        const imageUrl = `data:${imageBlob.type};base64,${buffer.toString('base64')}`;
        
        return res.status(200).json({ imageUrl });

    } catch (error) {
        console.error("Erro ao gerar imagem com Hugging Face:", error);
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
        return res.status(500).json({ error: `Falha ao gerar imagem com Hugging Face: ${errorMessage}` });
    }
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    // Verifica a chave do Gemini, que é necessária para ambas as ações
    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'A chave da API do Gemini não está configurada no servidor.' });
    }

    const { action, payload } = req.body;

    try {
        switch (action) {
            case 'getSuggestions':
                return await handleGetSuggestions(payload, res);
            case 'generateImage':
                return await handleGenerateImage(payload, res);
            default:
                return res.status(400).json({ error: 'Ação desconhecida' });
        }
    } catch (error) {
        console.error("Erro no proxy:", error);
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro inesperado no servidor.';
        return res.status(500).json({ error: errorMessage });
    }
}