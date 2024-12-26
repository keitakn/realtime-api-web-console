'use client';

import Image from 'next/image';
import { type ChangeEvent, type FormEvent, type JSX, type KeyboardEvent, type ReactEventHandler, useEffect, useRef, useState } from 'react';

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
    <div className="flex bg-slate-100 px-4 py-8 dark:bg-slate-900 sm:px-6">
      <Image
        className="mr-2 flex size-24 rounded-full sm:mr-4"
        src="/omochi.png"
        alt="おもち"
        width={146}
        height={110}
      />
      <div className="flex w-full flex-col items-start lg:flex-row lg:justify-between">
        <p className="max-w-3xl">{message}</p>
        <div className="mt-4 flex flex-row justify-start gap-x-2 text-slate-500 lg:mt-0" />
      </div>
    </div>
  );
}

export function GeminiMessageForm(): JSX.Element {
  const socketRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'assistant'; content: string }>>([]);
  const [inputText, setInputText] = useState<string>('');
  const audioUrl = useRef<string | null>(null);
  const currentAudio = useRef<HTMLAudioElement | null>(null);

  const playAudio = async () => {
    if (!audioUrl.current) {
      return;
    }
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    const audio = new Audio(audioUrl.current);
    currentAudio.current = audio;
    audio.addEventListener('ended', () => {
      currentAudio.current = null;
      audioUrl.current = null;
    });
    try {
      await audio.play();
    }
    catch (error) {
      console.error('音声再生エラー', error);
    }
  };

  useEffect(() => {
    const ws = new WebSocket(String(process.env.NEXT_PUBLIC_GEMINI_REALTIME_API_SERVER_URL));
    socketRef.current = ws;

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'text') {
          setMessages((prevMessages) => {
            const lastMessage = prevMessages[prevMessages.length - 1];
            if (lastMessage?.type === 'assistant') {
              return [...prevMessages.slice(0, -1), { ...lastMessage, content: lastMessage.content + message.data },
              ];
            }
            return [...prevMessages, { type: 'assistant', content: message.data }];
          });
        }
        else if (message.type === 'audio') {
          audioUrl.current = message.data;
          playAudio();
        }
      }
      catch (error) {
        console.error('JSONのパースに失敗:', error);
      }
    };

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
    if (socketRef.current && inputText) {
      socketRef.current.send(inputText);
      setMessages(prevMessages => [...prevMessages, { type: 'user', content: inputText }]);
      setInputText('');
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      const submitEvent = new Event('submit', {
        bubbles: true,
        cancelable: true,
      });
      event.currentTarget.form?.dispatchEvent(submitEvent);
      event.preventDefault();
    }
  };

  const handleChangeTextarea: ReactEventHandler<HTMLTextAreaElement> = (
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setInputText(event.target.value);
  };

  return (
    <>
      <div
        className="flex-1 overflow-y-auto bg-slate-300 text-sm leading-6 text-slate-900 shadow-md dark:bg-slate-800 dark:text-slate-300 sm:text-base sm:leading-7"
      >
        {messages.map((message, index) => (
          message.type === 'user'
            ? <UserMessage key={index} message={message.content} />
            : <AssistantMessage key={index} message={message.content} />
        ))}
      </div>
      <form
        onSubmit={sendMessage}
        className="flex w-full items-center rounded-md bg-slate-200 p-2 dark:bg-slate-900"
      >
        <label htmlFor="prompt" className="sr-only">Enter your prompt</label>
        <div>
          <button
            className="hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-600 sm:p-2"
            type="button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-6"
              aria-hidden="true"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
              <path d="M12 5l0 14"></path>
              <path d="M5 12l14 0"></path>
            </svg>
            <span className="sr-only">Attach file</span>
          </button>
        </div>
        <textarea
          id="prompt"
          rows={1}
          onKeyDown={handleKeyDown}
          onChange={handleChangeTextarea}
          value={inputText}
          className="mx-2 flex min-h-full w-full rounded-md border border-slate-300 bg-slate-200 p-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-slate-300/20 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-400 dark:focus:border-blue-600 dark:focus:ring-blue-600"
          placeholder="Enter your prompt"
        >
        </textarea>

        <div>
          <button
            className="inline-flex hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-600 sm:p-2"
            type="submit"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-6"
              aria-hidden="true"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
              <path d="M10 14l11 -11"></path>
              <path
                d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"
              >
              </path>
            </svg>
            <span className="sr-only">Send message</span>
          </button>
        </div>
      </form>
    </>
  );
}
