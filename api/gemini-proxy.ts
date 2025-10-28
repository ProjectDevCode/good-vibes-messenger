import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

// Validação das chaves de API
if (!process.env.GEMINI_API_KEY) {
  throw new Error('A variável de ambiente GEMINI_API_KEY não está definida.');
}
if (!process.env.HUGGINGFACE_API_KEY) {
  throw new Error('A variável de ambiente HUGGINGFACE_API_KEY não está definida.');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;

// Função auxiliar para converter imagem de URL para Base64
const imageUrlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao buscar a imagem da URL: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');
  const mimeType = response.headers.get('content-type') || 'image/png';
  return `data:${mimeType};base64,${base64}`;
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { action, payload } = req.body;

    switch (action) {
      case 'getSuggestions': {
        const { messageType, theme } = payload;
        // Prompt aprimorado para garantir emojis
        const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com um tema "${theme}". As mensagens devem ser curtas, inspiradoras, OBRIGATORIAMENTE incluir emojis relevantes e adequadas para compartilhar no WhatsApp. Retorne um array JSON de strings.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
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
        const { message, imageStyle, messageType, theme } = payload;
        
        // Prompt aprimorado, com "Prompt Engineering"
        const themeGuidance = theme === MessageTheme.CHRISTIAN
            ? "Use elementos como luz divina, raios de sol suaves, pombas, vitrais, natureza serena."
            : "Use elementos como nascer do sol vibrante, xícaras de café, flores, paisagens urbanas ou naturais pacíficas.";

        const promptForHuggingFace = `Foco principal: a frase "${messageType}" deve aparecer de forma clara, bonita e legível, artisticamente integrada na imagem. Estilo da imagem: ${imageStyle}. Tema da imagem: ${themeGuidance}. Sentimento da mensagem a ser transmitida: "${message}". A imagem deve ser de altíssima qualidade, com cores vibrantes e composição profissional.`;
        
        const negativePrompt = "texto feio, texto distorcido, letras deformadas, marca d'água, assinatura, baixa qualidade, borrado, feio, desfigurado";

        const modelUrl = 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3-medium-diffusers';

        const imageResponse = await fetch(modelUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${huggingFaceApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: promptForHuggingFace,
                parameters: {
                    negative_prompt: negativePrompt,
                }
            }),
        });

        if (!imageResponse.ok) {
            const errorBody = await imageResponse.text();
            console.error('Erro do Hugging Face:', errorBody);
            throw new Error(`Falha na API de imagem: ${imageResponse.statusText}`);
        }

        const imageBlob = await imageResponse.blob();
        const buffer = Buffer.from(await imageBlob.arrayBuffer());
        const base64Image = buffer.toString('base64');
        const imageUrl = `data:${imageBlob.type};base64,${base64Image}`;

        return res.status(200).json({ imageUrl });
      }

      default:
        return res.status(400).json({ error: 'Ação desconhecida' });
    }
  } catch (error) {
    console.error('Erro no proxy da API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Um erro inesperado ocorreu.';
    return res.status(500).json({ error: `Erro interno do servidor: ${errorMessage}` });
  }
}
