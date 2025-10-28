import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
import { MessageType, MessageTheme, ImageStyle } from '../types';

// Validação das chaves de API no início
if (!process.env.GEMINI_API_KEY) {
  throw new Error("A chave da API do Gemini (GEMINI_API_KEY) não está configurada no servidor.");
}
if (!process.env.HUGGINGFACE_API_KEY) {
  throw new Error("A chave da API do Hugging Face (HUGGINGFACE_API_KEY) não está configurada no servidor.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const textModel = 'gemini-2.5-flash';

// Função para gerar as sugestões de texto
const getSuggestions = async (payload: { messageType: MessageType; theme: MessageTheme; }) => {
  const { messageType, theme } = payload;
  const prompt = `Gere 3 sugestões de mensagens de "${messageType}" com um tema "${theme}". As mensagens devem ser curtas, inspiradoras, OBRIGATORIAMENTE incluir emojis relevantes e adequadas para compartilhar no WhatsApp. Retorne um array JSON de strings.`;

  const response = await ai.models.generateContent({
    model: textModel,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
  });

  return JSON.parse(response.text.trim());
};

// Função para gerar a imagem via Hugging Face
const generateImage = async (payload: { message: string; imageStyle: ImageStyle; messageType: MessageType; theme: MessageTheme; }) => {
  const { message, imageStyle, messageType, theme } = payload;

  // 1. O Gemini otimiza o prompt para o gerador de imagem, agora com consciência do tema
  const imagePromptOptimizationPrompt = `Crie um prompt em inglês, altamente detalhado, para um gerador de imagens de IA (como o Stable Diffusion).

O objetivo é criar uma imagem com o seguinte tema: "${theme}".
O estilo visual deve ser: "${imageStyle}".
A mensagem original em português é: "${message}".

REGRAS CRÍTICAS PARA O PROMPT GERADO:
1.  **TEXTO OBRIGATÓRIO:** O prompt DEVE, inegociavelmente, instruir a IA a renderizar o texto "${messageType}" de forma clara, bonita e como o foco principal da imagem. O texto não é opcional, é o sujeito da cena.
2.  **INFLUÊNCIA DO TEMA:** O prompt DEVE usar o tema "${theme}" para definir os elementos visuais da cena. Por exemplo, para um tema 'Cristão', sugira elementos como luz divina, pombas, vitrais, ou paisagens serenas. Para 'Genérico', foque em elementos universalmente positivos como um nascer do sol, flores, ou uma xícara de café.
3.  **RETORNO:** Retorne APENAS o prompt final em inglês, pronto para ser usado.`;

  const optimizationResponse = await ai.models.generateContent({
      model: textModel,
      contents: imagePromptOptimizationPrompt,
  });
  const englishPrompt = optimizationResponse.text.trim();
  
  // 2. O Hugging Face gera a imagem
  const HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0";
  
  const imageResponse = await fetch(HUGGINGFACE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: englishPrompt }),
  });

  if (!imageResponse.ok) {
    const errorBody = await imageResponse.text();
    console.error("Erro da API Hugging Face:", errorBody);
    throw new Error(`Falha ao gerar imagem com Hugging Face: ${imageResponse.statusText}`);
  }

  const imageBlob = await imageResponse.blob();
  const buffer = Buffer.from(await imageBlob.arrayBuffer());
  const imageUrl = `data:${imageBlob.type};base64,${buffer.toString('base64')}`;

  return { imageUrl };
};


// Handler principal da Vercel Function
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { action, payload } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Ação não especificada.' });
    }

    let result;
    if (action === 'getSuggestions') {
      result = await getSuggestions(payload);
    } else if (action === 'generateImage') {
      result = await generateImage(payload);
    } else {
      return res.status(400).json({ error: `Ação '${action}' inválida` });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error(`Erro ao executar a ação '${req.body.action}':`, error);
    const userMessage = error.message.includes('Hugging Face') 
      ? "Falha ao gerar imagem. A API pode estar ocupada, tente novamente em alguns instantes."
      : "Ocorreu um erro interno no servidor.";
    return res.status(500).json({ error: userMessage });
  }
}