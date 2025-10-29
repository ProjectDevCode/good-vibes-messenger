// api/gemini-proxy.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// As definições de tipo agora vivem aqui para tornar a função autossuficiente.
enum MessageType {
  GOOD_MORNING = 'Bom dia',
  GOOD_NIGHT = 'Boa noite',
}

enum MessageTheme {
  GENERIC = 'Genérico',
  CHRISTIAN = 'Cristão',
}

// Função auxiliar para esperar um tempo
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Função auxiliar para requisições com timeout
const fetchWithTimeout = async (resource: string, options: any, timeout = 25000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(id);
    }
};


const getSuggestions = async (payload: { messageType: MessageType; theme: MessageTheme }): Promise<string[]> => {
    const { messageType, theme } = payload;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        throw new Error('A chave da API do Gemini não está configurada no servidor.');
    }

    const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com tema "${theme}". As mensagens devem ser curtas, inspiradoras, OBRIGATORIAMENTE incluir emojis relevantes e adequadas para compartilhar no WhatsApp. Retorne um array JSON de strings.`;

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                response_mime_type: "application/json",
            }
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Erro da API Gemini:', errorData);
        throw new Error('Falha ao buscar sugestões da IA.');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        throw new Error('A resposta da IA para sugestões estava vazia.');
    }
    
    try {
        const suggestions = JSON.parse(text);
        if (!Array.isArray(suggestions)) throw new Error();
        return suggestions;
    } catch (e) {
         console.error("Falha ao analisar JSON de sugestões:", text);
         throw new Error("A resposta da IA para sugestões não estava no formato esperado.");
    }
};

const generateImageWithHuggingFace = async (
    prompt: string,
    negative_prompt: string,
    model: string
): Promise<Response> => {
    const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
    if (!HUGGINGFACE_API_KEY) {
        throw new Error("A chave da API do Hugging Face não está configurada.");
    }
    
    const API_URL = `https://api-inference.huggingface.co/models/${model}`;

    return fetchWithTimeout(API_URL, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`
        },
        body: JSON.stringify({
            inputs: prompt,
            parameters: { negative_prompt }
        }),
    });
};


const generateImage = async (payload: { message: string; imageStyle: string; messageType: MessageType; theme: MessageTheme }): Promise<{ imageUrl: string }> => {
    const { message, imageStyle, messageType, theme } = payload;

    const themeInstruction = theme === MessageTheme.CHRISTIAN
      ? "Use elementos que remetam à fé cristã, como luz divina, pombas brancas, vitrais, ou paisagens serenas que transmitam paz espiritual."
      : "Use elementos da natureza, como um lindo nascer do sol para 'Bom dia', ou um céu estrelado para 'Boa noite', flores, paisagens inspiradoras.";
    
    const basePrompt = `Crie uma imagem no estilo "${imageStyle}". A imagem deve ser uma obra de arte digital, bonita e inspiradora. O FOCO PRINCIPAL da imagem deve ser o texto "${messageType}", renderizado de forma clara, legível e artisticamente integrada à cena. A inspiração para a cena é a seguinte mensagem: "${message}". ${themeInstruction} A imagem NÃO DEVE conter pessoas, figuras humanas ou silhuetas. Renderize APENAS o texto "${messageType}", e ignore o resto da mensagem no texto da imagem.`;
    
    const negative_prompt = "pessoas, mulher, homem, figura humana, silhueta, texto feio, texto distorcido, texto ilegível, múltiplas frases, marca d'água, assinatura, baixa qualidade, deformado, feio";

    const primaryModel = "stabilityai/stable-diffusion-3-medium-diffusers";
    const fallbackModel = "stabilityai/stable-diffusion-xl-base-1.0";
    
    let response;
    try {
        console.log(`Tentando gerar imagem com o modelo principal: ${primaryModel}`);
        response = await generateImageWithHuggingFace(basePrompt, negative_prompt, primaryModel);
        if (!response.ok) {
           console.warn(`Falha no modelo principal (${response.status}), tentando fallback...`);
           throw new Error("Falha no modelo principal");
        }
    } catch (error) {
        console.log(`Tentando gerar imagem com o modelo de fallback: ${fallbackModel}`);
        response = await generateImageWithHuggingFace(basePrompt, negative_prompt, fallbackModel);
    }
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error("Ambos os modelos de imagem falharam. Último erro:", errorText);
        throw new Error("Falha ao gerar imagem no Hugging Face após duas tentativas.");
    }
    
    const blob = await response.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const imageUrl = `data:${blob.type};base64,${buffer.toString('base64')}`;
    
    return { imageUrl };
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
        console.error('Erro no proxy:', error);
        const errorMessage = error instanceof Error ? error.message : 'Um erro inesperado ocorreu no servidor';
        return res.status(500).json({ error: `Erro interno do servidor: ${errorMessage}` });
    }
}
