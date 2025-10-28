import { MessageType, MessageTheme, ImageStyle } from '../types';

const PROXY_URL = '/api/gemini-proxy';

// Função auxiliar para chamar nosso proxy de Vercel Function de forma segura
const callProxy = async (action: string, payload: unknown) => {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, payload }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Repassa a mensagem de erro da função do servidor para o cliente
    throw new Error(data.error || `Erro no servidor (código: ${response.status})`);
  }
  
  return data;
};

export const getGreetingSuggestions = async (
  messageType: MessageType,
  theme: MessageTheme
): Promise<string[]> => {
    const suggestions = await callProxy('getSuggestions', { messageType, theme });
    if (!Array.isArray(suggestions)) {
        throw new Error("A resposta do servidor para sugestões não estava no formato esperado.");
    }
    return suggestions;
};

export const generateImageFromMessage = async (
  message: string,
  imageStyle: ImageStyle,
  messageType: MessageType,
  theme: MessageTheme
): Promise<string> => {
   const { imageUrl } = await callProxy('generateImage', { message, imageStyle, messageType, theme });
   if (typeof imageUrl !== 'string') {
       throw new Error('A resposta do servidor para a imagem não continha uma URL válida.');
   }
   return imageUrl;
};