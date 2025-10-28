import type { VercelRequest, VercelResponse } from '@vercel/node';

// As definições de tipo estão aqui para tornar a função autossuficiente
// e evitar erros de importação no ambiente da Vercel.
enum MessageType {
  GOOD_MORNING = 'Bom dia',
  GOOD_NIGHT = 'Boa noite',
}

enum MessageTheme {
  GENERIC = 'Genérico',
  CHRISTIAN = 'Cristão',
}

enum ImageStyle {
  REALISTIC = 'Realista',
  HYPER_REALISTIC = 'Hiper-realista',
  DRAWING = 'Desenho',
  ABSTRACT = 'Abstrato',
  WATERCOLOR = 'Aquarela',
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

// Função auxiliar para chamadas fetch com tratamento de erro
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 25000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
        ...options,
        signal: controller.signal  
    });
    
    clearTimeout(id);
    return response;
}

const getSuggestions = async (payload: { messageType: MessageType; theme: MessageTheme; }) => {
    if (!GEMINI_API_KEY) {
      throw new Error('A chave da API do Gemini não está configurada no servidor.');
    }
    
    const { messageType, theme } = payload;
    const prompt = `Gere 3 sugestões curtas de mensagens de "${messageType}" com tema "${theme}". As mensagens devem ser inspiradoras, positivas e OBRIGATORIAMENTE incluir emojis relevantes. Retorne um array JSON de strings.`;

    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                response_mime_type: 'application/json',
                response_schema: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                },
            },
        }),
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        console.error('Erro da API Gemini:', errorData);
        throw new Error('Falha ao buscar sugestões da IA.');
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0].content.parts[0].text) {
        throw new Error('Resposta da API Gemini em formato inesperado.');
    }
    return JSON.parse(data.candidates[0].content.parts[0].text);
};


const generateImage = async (payload: { message: string; imageStyle: ImageStyle; messageType: MessageType; theme: MessageTheme; }) => {
    if (!HUGGINGFACE_API_KEY) {
        throw new Error('A chave da API do Hugging Face não está configurada no servidor.');
    }

    const { message, imageStyle, messageType, theme } = payload;
    
    const themeInstructions = theme === MessageTheme.CHRISTIAN
        ? "Incorpore elementos sutis e reverentes como luz divina, raios de sol, uma pomba branca ou pássaro colorido ou borboletas."
        : "Use elementos da natureza como um lindo nascer do sol, flores desabrochando ou paisagens tranquilas.";

    // Prompt Engineering Aprimorado
    const finalPrompt = `Obra-prima, foto cinematográfica, alta qualidade. Foco principal: O texto "${messageType}" deve aparecer de forma clara, bonita e artisticamente integrada na imagem. A cena deve refletir o sentimento da mensagem: "${message}". Estilo visual: ${imageStyle}. ${themeInstructions}.`;

    const negativePrompt = "texto feio, texto distorcido, texto ilegível, marca d'água, assinatura, baixa qualidade, deformado, feio, foto borrada, pessoas na foto";

    const response = await fetchWithTimeout(
        "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3-medium-diffusers",
        {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`
            },
            method: "POST",
            body: JSON.stringify({ 
                inputs: finalPrompt,
                parameters: {
                    negative_prompt: negativePrompt,
                }
            }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Erro da API Hugging Face:', errorText);
        throw new Error(`Falha ao gerar imagem no Hugging Face.`);
    }

    const imageBlob = await response.blob();
    const buffer = Buffer.from(await imageBlob.arrayBuffer());
    const imageUrl = `data:${imageBlob.type};base64,${buffer.toString('base64')}`;

    return { imageUrl };
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Método não permitido' });
    }
    
    try {
        const { action, payload } = req.body;
        let result;

        if (action === 'getSuggestions') {
            result = await getSuggestions(payload);
        } else if (action === 'generateImage') {
            result = await generateImage(payload);
        } else {
            return res.status(400).json({ error: 'Ação desconhecida.' });
        }
        
        return res.status(200).json(result);

    } catch (error) {
        console.error(`Erro na ação '${req.body?.action}':`, error);
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro interno no servidor.';
        return res.status(500).json({ error: errorMessage });
    }
}
