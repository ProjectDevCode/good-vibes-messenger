import React, { useState, useEffect } from 'react';
import { Contact, MessageType, MessageTheme, ImageStyle } from './types';
import { getGreetingSuggestions, generateImageFromMessage } from './services/geminiService';
import LoadingSpinner from './components/LoadingSpinner';
import { RefreshCw, ImageIcon, UserPlusIcon, AddressBookIcon, XCircleIcon, CopyIcon, CheckIcon, ShareIcon } from './components/icons';

function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  
  const [messageType, setMessageType] = useState<MessageType>(MessageType.GOOD_MORNING);
  const [theme, setTheme] = useState<MessageTheme>(MessageTheme.GENERIC);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [message, setMessage] = useState<string>('');
  const [imageStyle, setImageStyle] = useState<ImageStyle>(ImageStyle.REALISTIC);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [isLoadingImage, setIsLoadingImage] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  
  const [isShareApiAvailable, setIsShareApiAvailable] = useState(false);

  useEffect(() => {
    if (navigator.share) {
      setIsShareApiAvailable(true);
    }
  }, []);

  const handleGetSuggestions = async () => {
    setIsLoadingSuggestions(true);
    setError(null);
    setGeneratedImage(null);
    try {
      const newSuggestions = await getGreetingSuggestions(messageType, theme);
      setSuggestions(newSuggestions);
      if (newSuggestions.length > 0) {
        setMessage(newSuggestions[0]);
      } else {
        setMessage('');
      }
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('Falha ao buscar sugestões.');
      }
      console.error(e);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    handleGetSuggestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageType, theme]);

  const handleGenerateImage = async () => {
    if (!message) {
      setError('Por favor, selecione ou escreva uma mensagem primeiro.');
      return;
    }
    setIsLoadingImage(true);
    setError(null);
    try {
      const image = await generateImageFromMessage(message, imageStyle, messageType, theme);
      setGeneratedImage(image);
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('Ocorreu um erro desconhecido ao gerar a imagem.');
      }
      console.error(e);
    } finally {
      setIsLoadingImage(false);
    }
  };
  
  const handleAddContact = () => {
    if (newContactName && newContactPhone) {
        setContacts([...contacts, { id: Date.now().toString(), name: newContactName, phone: newContactPhone }]);
        setNewContactName('');
        setNewContactPhone('');
        setShowAddContact(false);
    }
  };

  const handleImportContacts = async () => {
    // @ts-ignore
    if ('contacts' in navigator && 'select' in navigator.contacts) {
      try {
        // @ts-ignore
        const availableProperties = await navigator.contacts.getProperties();
        if (!availableProperties.includes('name') || !availableProperties.includes('tel')) {
            alert('A API de contatos não tem suporte para nome e telefone neste navegador.');
            return;
        }
        // @ts-ignore
        const deviceContacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });
        if (deviceContacts.length > 0) {
          const newContacts = deviceContacts.map((contact: any) => ({
            id: contact.tel[0] + contact.name[0],
            name: contact.name[0],
            phone: contact.tel[0],
          }));
          
          setContacts(prev => {
              const existingPhones = new Set(prev.map(c => c.phone));
              const uniqueNewContacts = newContacts.filter((c: Contact) => !existingPhones.has(c.phone));
              return [...prev, ...uniqueNewContacts];
          });
        }
      } catch (ex) {
        console.error("Erro ao importar contatos:", ex);
        alert("Não foi possível importar os contatos.");
      }
    } else {
      alert("Seu navegador não suporta a importação de contatos.");
    }
  };

  const handleRemoveContact = (id: string) => {
    setContacts(contacts.filter(c => c.id !== id));
  };
  
  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const handleCopyImage = async () => {
      if (!generatedImage) return;
      try {
        const blob = await (await fetch(generatedImage)).blob();
        await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
        ]);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
      } catch (err) {
        console.error('Falha ao copiar imagem:', err);
        alert('Não foi possível copiar a imagem. Tente salvar e anexar manualmente.');
      }
  };

  const handleShare = async () => {
    if (!generatedImage) return;

    try {
        const response = await fetch(generatedImage);
        const blob = await response.blob();
        const file = new File([blob], 'imagem.png', { type: blob.type });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                text: message,
                title: 'Mensagem do Bem',
            });
        } else {
             await navigator.share({
                text: `${message}\n\n(Não foi possível anexar a imagem automaticamente. Por favor, copie e cole a imagem do aplicativo.)`,
                title: 'Mensagem do Bem',
            });
        }
    } catch (error) {
        console.error('Erro ao compartilhar:', error);
        if ((error as DOMException).name !== 'AbortError') {
             alert('Não foi possível abrir o compartilhamento.');
        }
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-900 min-h-screen font-sans">
      {(isLoadingSuggestions || isLoadingImage) && (
        <LoadingSpinner message={isLoadingSuggestions ? 'Buscando inspiração...' : 'Criando sua arte...'} />
      )}
      <header className="bg-brand-secondary text-white p-4 shadow-md sticky top-0 z-10">
        <h1 className="text-2xl font-bold text-center">Mensageiro do Bem</h1>
      </header>

      <main className="container mx-auto p-4 md:p-6 space-y-8 max-w-3xl">
        
        {error && (
            <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 dark:border-red-400 text-red-700 dark:text-red-300 p-4 rounded-md" role="alert">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="font-bold">Ocorreu um erro</p>
                        <p>{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="p-1 rounded-full hover:bg-red-200 dark:hover:bg-red-800/50">
                        <XCircleIcon className="w-6 h-6"/>
                    </button>
                </div>
            </div>
        )}

        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg animate-fade-in">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Passo 1: Para quem é a mensagem? (Opcional)</h2>
          <div className="space-y-3">
              {contacts.length > 0 && (
                  <ul className="space-y-2">
                      {contacts.map(contact => (
                          <li key={contact.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-2 rounded-md">
                              <span className="font-medium text-gray-700 dark:text-gray-300">{contact.name}</span>
                              <button onClick={() => handleRemoveContact(contact.id)} className="text-red-500 hover:text-red-700">
                                <XCircleIcon className="w-6 h-6"/>
                              </button>
                          </li>
                      ))}
                  </ul>
              )}
              {contacts.length === 0 && <p className="text-gray-500 dark:text-gray-400 text-center py-2">Sua lista de destinatários está vazia.</p>}
          </div>

          {showAddContact && (
              <div className="mt-4 p-4 border dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50">
                  <input type="text" placeholder="Nome" value={newContactName} onChange={e => setNewContactName(e.target.value)} className="w-full p-2 mb-2 border rounded-md bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500" />
                  <input type="tel" placeholder="Telefone (com código do país, ex: 5511...)" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} className="w-full p-2 mb-2 border rounded-md bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500" />
                  <div className="flex gap-2">
                    <button onClick={handleAddContact} className="flex-1 bg-green-500 text-white p-2 rounded-md hover:bg-green-600">Adicionar</button>
                    <button onClick={() => setShowAddContact(false)} className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 p-2 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500">Cancelar</button>
                  </div>
              </div>
          )}

          <div className="flex gap-4 mt-4">
              <button onClick={() => setShowAddContact(true)} className="flex-1 flex items-center justify-center gap-2 bg-blue-500 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition duration-300">
                <UserPlusIcon className="w-5 h-5" /> Adicionar Manual
              </button>
              <button onClick={handleImportContacts} className="flex-1 flex items-center justify-center gap-2 bg-teal-500 text-white font-bold py-2 px-4 rounded-md hover:bg-teal-600 transition duration-300">
                  <AddressBookIcon className="w-5 h-5" /> Importar da Agenda
              </button>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Passo 2: Escolha sua mensagem</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <select onChange={e => setMessageType(e.target.value as MessageType)} value={messageType} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200">
              {Object.values(MessageType).map(type => <option key={type} value={type}>{type}</option>)}
            </select>
            <select onChange={e => setTheme(e.target.value as MessageTheme)} value={theme} className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200">
              {Object.values(MessageTheme).map(theme => <option key={theme} value={theme}>{theme}</option>)}
            </select>
          </div>
          <div className="space-y-2 mb-4">
            {suggestions.map((s, i) => (
              <div key={i} onClick={() => setMessage(s)} className={`p-3 rounded-md cursor-pointer transition-colors text-gray-700 dark:text-gray-300 ${message === s ? 'bg-green-100 border-green-500 border-2 dark:bg-green-900/40 dark:border-green-500' : 'bg-gray-50 border dark:bg-gray-700 dark:border-gray-600'}`}>
                {s}
              </div>
            ))}
          </div>
          <button onClick={handleGetSuggestions} disabled={isLoadingSuggestions} className="w-full flex items-center justify-center gap-2 bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200 font-bold py-2 px-4 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition duration-300">
            <RefreshCw className="w-5 h-5" /> Gerar Novas
          </button>
          <div className="mt-4 relative">
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} className="w-full p-2 border rounded-md pr-12 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500" placeholder="Personalize sua mensagem aqui..."/>
            <button onClick={handleCopyMessage} className={`absolute top-2 right-2 p-1 rounded-full ${copiedMessage ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500'}`}>
                {copiedMessage ? <CheckIcon className="w-5 h-5"/> : <CopyIcon className="w-5 h-5"/>}
            </button>
          </div>
        </section>
        
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Passo 3: Crie uma imagem</h2>
            <div className="mb-4">
              <label htmlFor="imageStyle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estilo da Imagem</label>
              <select id="imageStyle" value={imageStyle} onChange={(e) => setImageStyle(e.target.value as ImageStyle)} className="w-full p-2 border border-gray-300 rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-gray-200">
                {Object.values(ImageStyle).map(style => <option key={style} value={style}>{style}</option>)}
              </select>
            </div>
            <button onClick={handleGenerateImage} disabled={isLoadingImage || !message} className="w-full flex items-center justify-center gap-2 bg-brand-primary text-white font-bold py-3 px-4 rounded-md hover:bg-green-700 transition duration-300 disabled:bg-gray-400">
              <ImageIcon className="w-5 h-5" /> Gerar Imagem
            </button>
        </section>

        {generatedImage && (
            <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Passo 4: Enviar</h2>
                <div className="w-full aspect-square bg-gray-200 dark:bg-gray-700 rounded-md flex items-center justify-center overflow-hidden mb-4">
                    <img src={generatedImage} alt="Imagem gerada" className="w-full h-full object-cover" />
                </div>
                
                {isShareApiAvailable ? (
                    <button onClick={handleShare} className="w-full flex items-center justify-center gap-3 bg-brand-primary text-white font-bold py-3 px-4 rounded-md hover:bg-green-700 transition duration-300 text-lg">
                        <ShareIcon className="w-6 h-6" />
                        Enviar via WhatsApp
                    </button>
                ) : (
                    <>
                        <div className="text-center text-gray-600 dark:text-gray-300 mb-4 p-2 bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-500 dark:border-yellow-400">
                            <p className="font-bold">Como enviar (Desktop):</p>
                            <p>1. Copie a imagem.</p>
                            <p>2. Abra o WhatsApp e cole na conversa.</p>
                            <p>3. Volte, copie a mensagem e envie em seguida!</p>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={handleCopyImage} className="flex-1 flex items-center justify-center gap-2 bg-blue-500 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition duration-300">
                                {copiedImage ? <CheckIcon className="w-5 h-5"/> : <CopyIcon className="w-5 h-5" />}
                                {copiedImage ? 'Copiado!' : 'Copiar Imagem'}
                            </button>
                            <a href="https://web.whatsapp.com" target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-gray-700 text-white font-bold py-2 px-4 rounded-md hover:bg-gray-800 transition duration-300">
                                Abrir WhatsApp Web
                            </a>
                        </div>
                    </>
                )}
            </section>
        )}
      </main>
    </div>
  );
}

export default App;