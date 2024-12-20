'use client';

import Image from 'next/image';
import { type FormEvent, type JSX, useEffect, useRef, useState } from 'react';

function UserMessage({ message }: { message: string }) {
  return (
    <div className="flex flex-row px-4 py-8 sm:px-6">
      <Image
        className="mr-2 flex size-24 rounded-full sm:mr-4"
        src="https://dummyimage.com/256x256/354ea1/ffffff&text=G"
        alt="ゲストユーザー"
        width={256}
        height={256}
      />
      <div className="flex max-w-3xl items-center">
        <p>{message}</p>
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: string }) {
  return (
    <div className="flex bg-slate-100 px-4 py-8 sm:px-6 dark:bg-slate-900">
      <Image
        className="mr-2 flex size-24 rounded-full sm:mr-4"
        src="/omochi.png"
        alt="おもち"
        width={146}
        height={110}
      />

      <div
        className="flex w-full flex-col items-start lg:flex-row lg:justify-between"
      >
        <p className="max-w-3xl">{message}</p>
        <div
          className="mt-4 flex flex-row justify-start gap-x-2 text-slate-500 lg:mt-0"
        >
        </div>
      </div>
    </div>
  );
}

export function GeminiMessageForm(): JSX.Element {
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState<string>('');
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const audioUrl = useRef<string | null>(null);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const [currentAssistantMessageIndex, setCurrentAssistantMessageIndex] = useState(-1);

  const playAudio = async () => {
    console.log('playAudio関数が呼ばれました');
    if (!audioUrl.current) {
      console.log('audioUrlが空のため再生をスキップします');
      return;
    }
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    const audio = new Audio(audioUrl.current);
    console.log('Audioオブジェクトを作成しました:', audio);
    currentAudio.current = audio;
    audio.addEventListener('ended', () => {
      console.log('音声再生が終了しました');
      currentAudio.current = null;
      audioUrl.current = null;
    });
    try {
      console.log('audio.play()を実行します:', audio);
      await audio.play();
    }
    catch (error) {
      console.error('音声再生エラー', error);
    }
  };

  useEffect(() => {
    // WebSocketサーバーへの接続を確立
    const ws = new WebSocket(String(process.env.NEXT_PUBLIC_GEMINI_REALTIME_API_SERVER_URL));
    setSocket(ws);

    // サーバーからのメッセージを受信
    ws.onmessage = async (event) => {
      console.log('受信したイベントデータ:', event.data);
      try {
        const message = JSON.parse(event.data);
        console.log('JSON.parseの結果:', message);
        console.log('メッセージタイプ:', message.type);
        if (message.type === 'text') {
          setMessages((prevMessages) => {
            const lastMessage = prevMessages[prevMessages.length - 1];
            if (lastMessage?.type === 'assistant') {
              const updatedMessages = [...prevMessages];
              updatedMessages[prevMessages.length - 1] = { ...lastMessage, content: lastMessage.content + message.data };
              return updatedMessages;
            }
            else {
              return [...prevMessages, { type: 'assistant', content: message.data }];
            }
          });
        }
        else if (message.type === 'audio') {
          console.log('audioUrlを設定:', message.data);
          audioUrl.current = message.data;
          playAudio();
        }
      }
      catch (e) {
        console.error('JSONのパースに失敗', e);
        setMessages(prevMessages => [...prevMessages, { type: 'assistant', content: event.data }]);
      }
    };

    // クリーンアップ関数
    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    audioUrl.current = null;
    setCurrentAssistantMessageIndex(-1);
    if (socket && input) {
      socket.send(input);
      setMessages(prevMessages => [...prevMessages, { type: 'user', content: input }]);
      setInput('');
    }
  };

  return (
    <>
      <div
        className="flex-1 overflow-y-auto bg-slate-300 text-sm leading-6 text-slate-900 shadow-md sm:text-base sm:leading-7 dark:bg-slate-800 dark:text-slate-300"
      >
        {messages.map((message, index) => (
          message.type === 'user'
            ? <UserMessage key={index} message={message.content} />
            : <AssistantMessage key={index} message={message.content} />
        ))}
      </div>

      <form onSubmit={sendMessage}>
        <label htmlFor="chat-input" className="sr-only">Enter your prompt</label>
        <div className="relative">
          <button
            type="button"
            className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-600"
          >
            <svg
              aria-hidden="true"
              className="size-5"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              strokeWidth="2"
              stroke="currentColor"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
              <path
                d="M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z"
              >
              </path>
              <path d="M5 10a7 7 0 0 0 14 0"></path>
              <path d="M8 21l8 0"></path>
              <path d="M12 17l0 4"></path>
            </svg>
            <span className="sr-only">Use voice input</span>
          </button>
          <textarea
            id="chat-input"
            className="block w-full resize-none rounded-xl border-none bg-slate-200 p-4 pl-10 pr-20 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-base dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-400 dark:focus:ring-blue-600"
            placeholder="Enter your prompt"
            onChange={e => setInput(e.target.value)}
            rows={1}
            required
          >
          </textarea>
          <button
            type="submit"
            className="absolute bottom-2 right-2.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 sm:text-base dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          >
            Send
            {' '}
            <span className="sr-only">Send message</span>
          </button>
        </div>
      </form>
    </>
  );
}
