'use client';

import Image from 'next/image';
import { type ChangeEvent, type FormEvent, type JSX, type KeyboardEvent, type ReactEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '@/lib/audio-recorder';

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
  const socketRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'assistant'; content: string }>>([]);
  const [inputText, setInputText] = useState<string>('');
  const audioUrl = useRef<string | null>(null);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const [currentVolume, setCurrentVolume] = useState<number>(0);
  const [isAudioDetected, setIsAudioDetected] = useState<boolean>(false);
  const [lastDataSize, setLastDataSize] = useState<number>(0);
  const [debugAudioUrl, setDebugAudioUrl] = useState<string | null>(null);

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

  const startRecording = async () => {
    if (!recorderRef.current) {
      recorderRef.current = new AudioRecorder();

      // 音量の閾値を設定
      const VOLUME_THRESHOLD = 0.1;
      let isAudioDetected = false;

      // 音量を監視
      recorderRef.current.on('volume', (volume: number) => {
        setCurrentVolume(volume);
        isAudioDetected = volume > VOLUME_THRESHOLD;
        setIsAudioDetected(isAudioDetected);
      });

      // データを送信
      recorderRef.current.on('data', (base64Data: string) => {
        setLastDataSize(base64Data.length);
        if (socketRef.current?.readyState === WebSocket.OPEN && isAudioDetected) {
          const message = {
            realtimeInput: {
              mediaChunks: [
                {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Data
                }
              ],
            }
          };
          socketRef.current.send(JSON.stringify(message));

          // デバッグ用に音声データを保存
          playDebugAudio(base64Data);
        }
      });
    }

    try {
      await recorderRef.current.start();
      setIsRecording(true);
      setCurrentVolume(0);
      setIsAudioDetected(false);
      setLastDataSize(0);
    } catch (error) {
      console.error('録音開始エラー:', error);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      setIsRecording(false);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        const endMessage = {
          realtimeInput: {
            mediaChunks: [],
            end_of_turn: true
          }
        };
        socketRef.current.send(JSON.stringify(endMessage));
      }
    }
  };

  // Base64データをWAVファイルに変換して再生する関数
  const playDebugAudio = useCallback((base64Data: string) => {
    try {
      // Base64をバイナリデータに変換
      const binaryData = atob(base64Data);
      const arrayBuffer = new ArrayBuffer(binaryData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < binaryData.length; i++) {
        view[i] = binaryData.charCodeAt(i);
      }

      // WAVヘッダーを作成
      const wavHeader = new ArrayBuffer(44);
      const wavView = new DataView(wavHeader);

      // "RIFF" identifier
      wavView.setUint32(0, 0x52494646, false); // "RIFF" in ASCII
      // file length - 8
      wavView.setUint32(4, 32 + arrayBuffer.byteLength, true);
      // "WAVE" identifier
      wavView.setUint32(8, 0x57415645, false); // "WAVE" in ASCII
      // "fmt " chunk identifier
      wavView.setUint32(12, 0x666D7420, false); // "fmt " in ASCII
      // chunk length
      wavView.setUint32(16, 16, true);
      // sample format (raw)
      wavView.setUint16(20, 1, true);
      // channel count
      wavView.setUint16(22, 1, true);
      // sample rate
      wavView.setUint32(24, 16000, true);
      // byte rate (sample rate * block align)
      wavView.setUint32(28, 16000 * 2, true);
      // block align
      wavView.setUint16(32, 2, true);
      // bits per sample
      wavView.setUint16(34, 16, true);
      // "data" chunk identifier
      wavView.setUint32(36, 0x64617461, false); // "data" in ASCII
      // chunk length
      wavView.setUint32(40, arrayBuffer.byteLength, true);

      // WAVヘッダーとデータを結合
      const wavArrayBuffer = new Uint8Array(wavHeader.byteLength + arrayBuffer.byteLength);
      wavArrayBuffer.set(new Uint8Array(wavHeader), 0);
      wavArrayBuffer.set(new Uint8Array(arrayBuffer), wavHeader.byteLength);

      // Blobを作成してURLを生成
      const blob = new Blob([wavArrayBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      // 以前のURLを解放
      if (debugAudioUrl) {
        URL.revokeObjectURL(debugAudioUrl);
      }

      setDebugAudioUrl(url);

      // 音声を再生
      const audio = new Audio(url);
      audio.play();
    } catch (error) {
      console.error('デバッグ音声の再生に失敗:', error);
    }
  }, [debugAudioUrl]);

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-slate-300 text-sm leading-6 text-slate-900 shadow-md sm:text-base sm:leading-7 dark:bg-slate-800 dark:text-slate-300">
        {messages.map((message, index) => (
          message.type === 'user'
            ? <UserMessage key={index} message={message.content} />
            : <AssistantMessage key={index} message={message.content} />
        ))}
      </div>

      {isRecording && (
        <div className="bg-slate-100 p-2 text-sm dark:bg-slate-900">
          <div>音量レベル: {currentVolume.toFixed(3)}</div>
          <div>音声検出: {isAudioDetected ? '⚪️ 検出中' : '❌ 未検出'}</div>
          <div>最後のデータサイズ: {lastDataSize} bytes</div>
          <div className="h-2 w-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-2 bg-blue-600 transition-all dark:bg-blue-500"
              style={{ width: `${Math.min(currentVolume * 100, 100)}%` }}
            />
          </div>
          {debugAudioUrl && (
            <div className="mt-2">
              <audio controls src={debugAudioUrl} className="w-full" />
            </div>
          )}
        </div>
      )}

      <form onSubmit={sendMessage}>
        <label htmlFor="chat-input" className="sr-only">Enter your prompt</label>
        <div className="relative">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-600 ${isRecording ? 'text-red-500' : ''}`}
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
              <path d="M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z"></path>
              <path d="M5 10a7 7 0 0 0 14 0"></path>
              <path d="M8 21l8 0"></path>
              <path d="M12 17l0 4"></path>
            </svg>
            <span className="sr-only">
              {isRecording ? 'Stop recording' : 'Use voice input'}
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
