'use client';

import Image from 'next/image';
import { type ChangeEvent, type FormEvent, type JSX, type KeyboardEvent, type ReactEventHandler, useCallback, useEffect, useRef, useState } from 'react';

class LiveAudioInputManager {
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;
  private pcmData: number[] = [];
  private interval: NodeJS.Timeout | null = null;

  constructor(private onNewAudioRecordingChunk: (audioData: string) => void) {}

  async connectMicrophone() {
    this.audioContext = new AudioContext({
      sampleRate: 16000,
    });

    const constraints = {
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // Convert float32 to int16
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = inputData[i] * 0x7FFF;
      }
      this.pcmData.push(...pcm16);
    };

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.interval = setInterval(this.recordChunk.bind(this), 1000);
  }

  private recordChunk() {
    const buffer = new ArrayBuffer(this.pcmData.length * 2);
    const view = new DataView(buffer);
    this.pcmData.forEach((value, index) => {
      view.setInt16(index * 2, value, true);
    });

    const base64 = btoa(
      String.fromCharCode.apply(null, new Uint8Array(buffer)),
    );
    this.onNewAudioRecordingChunk(base64);
    this.pcmData = [];
  }

  disconnectMicrophone() {
    try {
      this.processor?.disconnect();
      this.audioContext?.close();
      this.stream?.getTracks().forEach(track => track.stop());
    }
    catch (error) {
      console.error('Error disconnecting microphone', error);
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

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
      <div className="flex w-full flex-col items-start lg:flex-row lg:justify-between">
        <p className="max-w-3xl">{message}</p>
        <div className="mt-4 flex flex-row justify-start gap-x-2 text-slate-500 lg:mt-0" />
      </div>
    </div>
  );
}

export function GeminiMessageForm(): JSX.Element {
  const [isRecording, setIsRecording] = useState(false);
  const audioManagerRef = useRef<LiveAudioInputManager | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'assistant'; content: string }>>([]);
  const [inputText, setInputText] = useState<string>('');
  const audioUrl = useRef<string | null>(null);
  const currentAudio = useRef<HTMLAudioElement | null>(null);

  const playAudio = async () => {
    if (!audioUrl.current) {
      console.log('audioUrlが空のため再生をスキップします');
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

  const startRecording = useCallback(async () => {
    try {
      console.log('Starting recording...');

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        return;
      }

      if (!audioManagerRef.current) {
        console.log('Creating new LiveAudioInputManager');
        audioManagerRef.current = new LiveAudioInputManager((audioData) => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  mimeType: 'audio/pcm;rate=16000',
                  data: audioData,
                }],
              },
            }));
          }
        });
      }

      await audioManagerRef.current.connectMicrophone();
      console.log('Microphone connected successfully');
      setIsRecording(true);
    }
    catch (error) {
      console.error('Recording start failed:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (audioManagerRef.current) {
      audioManagerRef.current.disconnectMicrophone();
      audioManagerRef.current = null;
      setIsRecording(false);
    }
  }, []);

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    }
    else {
      startRecording();
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
      <div className="flex-1 overflow-y-auto bg-slate-300 text-sm leading-6 text-slate-900 shadow-md sm:text-base sm:leading-7 dark:bg-slate-800 dark:text-slate-300">
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
            onClick={handleMicClick}
            className={`absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-600 ${
              isRecording ? 'text-red-500 hover:text-red-600' : ''
            }`}
          >
            <svg
              aria-hidden="true"
              className="size-5"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              strokeWidth="2"
              stroke="currentColor"
              fill={isRecording ? 'currentColor' : 'none'}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
              <path d="M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z"></path>
              <path d="M5 10a7 7 0 0 0 14 0"></path>
              <path d="M8 21l8 0"></path>
              <path d="M12 17l0 4"></path>
            </svg>
            <span className="sr-only">
              {isRecording ? 'Stop voice input' : 'Use voice input'}
            </span>
          </button>
          <textarea
            id="chat-input"
            className="block w-full resize-none rounded-xl border-none bg-slate-200 p-4 pl-10 pr-20 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-base dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-400 dark:focus:ring-blue-600"
            placeholder="Enter your prompt"
            onKeyDown={handleKeyDown}
            onChange={handleChangeTextarea}
            value={inputText}
            rows={1}
            required
          />
          <button
            type="submit"
            className="absolute bottom-2 right-2.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 sm:text-base dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          >
            Send
            <span className="sr-only">Send message</span>
          </button>
        </div>
      </form>
    </>
  );
}
