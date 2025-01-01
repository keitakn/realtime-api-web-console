'use client';

import { MessageCard } from '@/app/_components/MessageCard';
import { logger } from '@/logging/logger';
import { Icon } from '@iconify/react';
import { Button, cn, Tooltip } from '@nextui-org/react';
import Image from 'next/image';
import { type ChangeEventHandler, type FormEvent, type KeyboardEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { PromptInput } from './PromptInput';

// HTMLAudioElementの型を拡張
declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface HTMLAudioElement {
    playsInline: boolean;
    webkitPlaysInline: boolean;
  }
}

// Responseクラスの実装
class Response {
  text: string | null;
  audioData: string | null;
  endOfTurn: boolean | null;

  constructor(data: any) {
    this.text = null;
    this.audioData = null;
    this.endOfTurn = null;

    if (data.text) {
      this.text = data.text;
    }
    if (data.audio) {
      this.audioData = data.audio;
    }
    if (data.endOfTurn) {
      this.endOfTurn = data.endOfTurn;
    }
  }
}

type Message = {
  role: 'user' | 'assistant';
  message: string;
};

const log = logger.child({ module: 'src/app/_components/InputPromptForm.tsx' });

export function InputPromptForm() {
  const [prompt, setPrompt] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const currentFrameB64 = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioUrl = useRef<string | null>(null);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<string>('');

  // 音声再生の初期化関数を修正
  const initializeAudio = useCallback(async () => {
    if (isAudioInitialized) {
      log.info('音声再生は既に初期化済み');
      return true;
    }

    try {
      log.info('AudioContext初期化開始');
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      // 無音のバッファを再生して再生権限を取得
      log.info('無音バッファの作成');
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      log.info('無音バッファの再生開始');
      source.start(0);

      setIsAudioInitialized(true);
      log.info('音声再生の初期化が完了しました');
      return true;
    }
    catch (error) {
      log.error(`音声再生の初期化に失敗しました: ${error}`);
      return false;
    }
  }, [isAudioInitialized]);

  // 音声再生関数を修正
  const playAudio = async () => {
    log.info('playAudio関数が呼び出されました');
    log.info(`現在の状態 - audioUrl存在: ${!!audioUrl.current}, isAudioInitialized: ${isAudioInitialized}, audioContext状態: ${audioContextRef.current?.state}`);

    if (!audioUrl.current) {
      log.warn('audioUrlが設定されていません');
      return;
    }

    // 新しい音声が送信された場合は既存の音声を停止
    if (currentAudio.current) {
      log.info('既存の音声を停止');
      currentAudio.current.pause();
      currentAudio.current = null;
      setIsSpeaking(false);
    }

    if (!isAudioInitialized) {
      log.warn('音声が初期化されていません。初期化を試みます。');
      const initialized = await initializeAudio();
      if (!initialized) {
        log.error('音声の初期化に失敗しました');
        return;
      }
    }

    try {
      const audio = new Audio(audioUrl.current);
      currentAudio.current = audio;

      // デバッグ用：音声ファイルの状態を確認
      log.info(`音声の状態 - readyState: ${audio.readyState}, networkState: ${audio.networkState}`);

      // iOS対応の設定を追加
      audio.playsInline = true;
      audio.webkitPlaysInline = true;

      // AudioContextが初期化済みであることを確認
      if (audioContextRef.current?.state === 'suspended') {
        log.info('AudioContextを再開');
        await audioContextRef.current.resume();
      }

      // イベントリスナーを設定する前に音声をロード
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', resolve, { once: true });
        audio.addEventListener('error', reject, { once: true });
        audio.load();
      });

      log.info('音声再生の準備完了');
      setIsSpeaking(true);

      // イベントリスナーの設定
      const addListener = (event: string, handler: () => void) => {
        audio.addEventListener(event, handler);
        log.info(`${event}イベントリスナーを設定しました`);
      };

      addListener('loadstart', () => {
        log.info('音声データのロード開始');
      });

      addListener('canplay', () => {
        log.info('音声再生可能な状態');
      });

      addListener('playing', () => {
        log.info('音声再生中');
      });

      addListener('ended', () => {
        log.info('音声再生完了');
        currentAudio.current = null;
        audioUrl.current = null;
        setIsSpeaking(false);
      });

      audio.addEventListener('error', (e) => {
        const target = e.currentTarget as HTMLAudioElement;
        log.error(`音声ロードエラー: ${target.error?.message || '不明なエラー'}, コード: ${target.error?.code}`);
      });

      log.info('音声再生実行');
      await audio.play();
      log.info('音声再生開始成功');
    }
    catch (error) {
      log.error(`音声再生エラー: ${error}`);
      setIsSpeaking(false);
    }
  };

  // WebSocket接続を確立
  useEffect(() => {
    const ws = new WebSocket(String(process.env.NEXT_PUBLIC_VIDEO_CHAT_API_SERVER_URL));
    webSocketRef.current = ws;

    ws.onopen = () => {
      log.info('WebSocket接続完了');
    };

    let newResponseMessage = '';

    ws.onmessage = async (event) => {
      try {
        const messageData = JSON.parse(event.data);
        log.info('受信したWebSocketメッセージ:', messageData);
        const response = new Response(messageData);

        if (response.text) {
          newResponseMessage += response.text;
          setStreamingMessage(newResponseMessage);
        }

        if (response.endOfTurn === true) {
          const lastAssistantMessage = newResponseMessage;
          setMessages(prev => [...prev, { role: 'assistant', message: lastAssistantMessage }]);
          newResponseMessage = '';
          setStreamingMessage('');
        }

        if (response.audioData) {
          log.info('音声データを受信:', response.audioData.substring(0, 50));
          audioUrl.current = response.audioData;
          log.info('playAudio関数を呼び出し');
          await playAudio();
        }
      }
      catch (error) {
        log.error(`メッセージの処理中にエラーが発生しました: ${error}`);
      }
    };

    ws.onclose = () => {
      log.warn('WebSocket接続が閉じられました');
    };

    ws.onerror = (event) => {
      log.error(`websocket error: ${event}`);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Webカメラの初期化
  useEffect(() => {
    const initializeWebcam = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { max: 640 },
            height: { max: 480 },
          },
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }
      catch (error) {
        log.error(`Webカメラへのアクセスエラー: ${error}`);
      }
    };

    initializeWebcam();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 画像のキャプチャ
  useEffect(() => {
    const captureInterval = setInterval(() => {
      if (stream && videoRef.current && canvasRef.current) {
        const context = canvasRef.current.getContext('2d');
        if (context) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
          context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
          const imageData = canvasRef.current.toDataURL('image/jpeg').split(',')[1].trim();
          currentFrameB64.current = imageData;
        }
      }
    }, 3000);

    return () => clearInterval(captureInterval);
  }, [stream]);

  const startRecording = async () => {
    if (!stream)
      return;

    // ユーザーが話をしている場合はAssistantの返答音声再生を停止する
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
      audioUrl.current = null;
    }

    setIsRecording(true);

    try {
      audioContextRef.current = new AudioContext({
        sampleRate: 16000,
      });

      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      await audioContextRef.current.audioWorklet.addModule('/audio-processing.worklet.js');

      sourceRef.current = audioContextRef.current.createMediaStreamSource(audioStream);
      audioWorkletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'audio-processor');

      audioWorkletNodeRef.current.port.onmessage = (event) => {
        if (event.data.event === 'chunk') {
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(event.data.data.int16arrayBuffer)),
          );

          if (webSocketRef.current && currentFrameB64.current) {
            const payload = {
              realtime_input: {
                media_chunks: [
                  {
                    mime_type: 'audio/pcm',
                    data: base64,
                  },
                  {
                    mime_type: 'image/jpeg',
                    data: currentFrameB64.current,
                  },
                ],
              },
            };
            webSocketRef.current.send(JSON.stringify(payload));
          }
        }
      };

      sourceRef.current.connect(audioWorkletNodeRef.current);
      audioWorkletNodeRef.current.connect(audioContextRef.current.destination);
    }
    catch (error) {
      log.error(`録音の開始中にエラーが発生しました: ${error}`);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);

    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // コンポーネントのアンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      stopRecording();
      if (currentAudio.current) {
        currentAudio.current.pause();
        currentAudio.current = null;
      }
    };
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (textareaRef.current?.value != null && textareaRef.current?.value !== '') {
      setPrompt('');
      if (webSocketRef.current) {
        const payload = {
          input_text: textareaRef.current?.value,
        };
        webSocketRef.current.send(JSON.stringify(payload));
        setMessages(prev => [...prev, { role: 'user', message: payload.input_text }]);
      }
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      const submitEvent = new Event('submit', {
        bubbles: true,
        cancelable: true,
      });
      event.currentTarget.form?.dispatchEvent(submitEvent);
      event.preventDefault();
    }
  };

  const handleChangeTextarea: ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    setPrompt(event.target.value);
  };

  return (
    <>
      <div className="w-full max-w-4xl rounded-lg bg-white p-6 shadow-lg">
        <div className="flex flex-col items-center space-y-4">
          {/* ビデオとキャラクターを横並びに */}
          <div className="flex items-center justify-center gap-8">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="h-[240px] w-[320px] rounded-2xl bg-black"
            />

            <div className="flex flex-col items-center">
              <Image
                src="/omochi.png"
                alt="Picture of the Cat AI Assistant Omochi"
                width={146}
                height={110}
              />
              {isSpeaking && (
                <p className="mt-2 text-sm text-blue-500">おもちが話しています...</p>
              )}
            </div>
          </div>

          {/* 非表示のキャンバス */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-1">
        {messages.map((message, index) => {
          if (message.role === 'user') {
            return (
              <MessageCard
                key={index}
                message={message.message}
                showFeedback={false}
              />
            );
          }

          return (
            <MessageCard
              key={index}
              avatar="/omochi.png"
              message={message.message}
              showFeedback={false}
            />
          );
        })}
        {streamingMessage && <MessageCard avatar="/omochi.png" message={streamingMessage} showFeedback={false} />}
      </div>

      <form className="flex w-full items-start gap-2" onSubmit={handleSubmit}>
        <PromptInput
          onKeyDown={handleKeyDown}
          onChange={handleChangeTextarea}
          classNames={{
            innerWrapper: 'relative w-full',
            input: 'pt-1 pb-6 !pr-10 text-medium',
          }}
          ref={textareaRef}
          endContent={(
            <div className="absolute right-0 flex h-full flex-col items-end justify-between gap-2">
              <Tooltip showArrow content="Speak">
                <Button
                  isIconOnly
                  radius="full"
                  size="sm"
                  variant="light"
                  onPress={async () => {
                    // マイクボタンクリック時に音声初期化も行う
                    if (!isAudioInitialized) {
                      await initializeAudio();
                    }

                    if (isRecording) {
                      stopRecording();
                    }
                    else {
                      startRecording();
                    }
                  }}
                >
                  <Icon
                    className={cn(
                      'text-default-500',
                      isRecording && 'text-red-500',
                    )}
                    icon="solar:microphone-3-linear"
                    width={20}
                  />
                </Button>
              </Tooltip>
              <div className="flex items-end gap-2">
                <p className="py-1 text-tiny text-default-400">
                  {prompt.length}
                  /2000
                </p>
                <Tooltip showArrow content="Send message">
                  <Button
                    type="submit"
                    isIconOnly
                    color={!prompt ? 'default' : 'primary'}
                    isDisabled={!prompt}
                    radius="lg"
                    size="sm"
                    variant={!prompt ? 'flat' : 'solid'}
                  >
                    <Icon
                      className={cn(
                        '[&>path]:stroke-[2px]',
                        !prompt ? 'text-default-600' : 'text-primary-foreground',
                      )}
                      icon="solar:arrow-up-linear"
                      width={20}
                    />
                  </Button>
                </Tooltip>
              </div>
            </div>
          )}
          minRows={3}
          radius="lg"
          startContent={(
            <Tooltip showArrow content="Add Image">
              <Button isIconOnly radius="full" size="sm" variant="light">
                <Icon
                  className="text-default-500"
                  icon="solar:gallery-minimalistic-linear"
                  width={20}
                />
              </Button>
            </Tooltip>
          )}
          value={prompt}
          onValueChange={setPrompt}
        />
      </form>
    </>
  );
}
