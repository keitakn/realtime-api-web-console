'use client';

import { MessageCard } from '@/app/_components/MessageCard';
import { logger } from '@/logging/logger';
import { Icon } from '@iconify/react';
import {
  Button,
  cn,
  Tooltip,
} from '@nextui-org/react';
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
  audioUrl?: string;
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
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const playAudioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioUrl = useRef<string | undefined>(undefined);
  const currentAudio = useRef<AudioBufferSourceNode | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<string>('');

  // 現在再生中の音声を停止する関数
  const stopCurrentAudio = useCallback(() => {
    if (currentAudio.current) {
      try {
        currentAudio.current.stop();
      }
      catch (error) {
        // すでに停止している場合などのエラーは無視
        console.error(error);
      }
      currentAudio.current = null;
      setIsSpeaking(false);
    }
  }, []);

  // 音声再生の初期化関数を修正
  const initializeAudio = useCallback(async () => {
    if (isAudioInitialized) {
      log.info('音声再生は既に初期化済み');
      return true;
    }

    try {
      log.info('AudioContext初期化開始');
      const ctx = new AudioContext();
      playAudioContextRef.current = ctx;
      await playAudioContextRef.current.resume();

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
      log.error(`音声再生の初期化に失敗しました`);
      console.error(error);
      return false;
    }
  }, [isAudioInitialized]);

  // 音声再生関数を修正
  const playAudio = async () => {
    log.info('playAudio関数が呼び出されました');
    log.info(`現在の状態 - audioUrl存在: ${!!audioUrl.current}, isAudioInitialized: ${isAudioInitialized}, audioContext状態: ${playAudioContextRef.current?.state}`);

    if (!audioUrl.current) {
      log.warn('audioUrlが設定されていません');
      return;
    }

    // 新しい音声が送信された場合は既存の音声を停止
    stopCurrentAudio();

    try {
      if (!playAudioContextRef.current) {
        log.warn('AudioContextが初期化されていません');
        return;
      }

      const response = await fetch(audioUrl.current);
      const arrayBuffer = await response.arrayBuffer();

      const audioBuffer = await playAudioContextRef.current.decodeAudioData(arrayBuffer);

      const source = playAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playAudioContextRef.current.destination);

      currentAudio.current = source;

      setIsSpeaking(true);

      // 再生終了時の処理
      source.onended = () => {
        currentAudio.current = null;
        audioUrl.current = undefined;
        setIsSpeaking(false);
      };

      // 再生開始
      source.start(0);
    }
    catch (error) {
      log.error(`音声再生エラー`);
      console.error(error);
      setIsSpeaking(false);
    }
  };

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

        // ユーザーからの新しい入力があった場合は再生中の音声を停止
        if (messageData.text || messageData.audio) {
          stopCurrentAudio();
        }

        const response = new Response(messageData);

        if (response.text != null && response.text) {
          newResponseMessage += response.text;
          setStreamingMessage(newResponseMessage);
        }

        if (response.endOfTurn === true) {
          const lastAssistantMessage = newResponseMessage;
          setMessages(prev => [...prev, {
            role: 'assistant',
            message: lastAssistantMessage,
            audioUrl: audioUrl.current || undefined,
          }]);
          newResponseMessage = '';
          setStreamingMessage('');
        }

        if (response.audioData) {
          log.info('音声データを受信:', response.audioData.substring(0, 50));
          audioUrl.current = response.audioData;
          log.info('音声URL設定:', audioUrl.current?.substring(0, 50));

          // 音声初期化が必要な場合は初期化を行う
          if (!isAudioInitialized) {
            log.info('音声初期化を実行');
            await initializeAudio();
          }

          log.info('playAudio関数を呼び出し');
          await playAudio();
        }
      }
      catch (error) {
        log.error(`メッセージの処理中にエラーが発生しました`);
        console.error(error);
      }
    };

    ws.onclose = () => {
      log.warn('WebSocket接続が閉じられました');
    };

    ws.onerror = (event) => {
      console.error(event);
    };

    return () => {
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        log.error(`Webカメラへのアクセスエラー`);
        console.error(error);
      }
    };

    initializeWebcam();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    stopCurrentAudio();
    audioUrl.current = undefined;

    setIsRecording(true);

    try {
      recordingAudioContextRef.current = new AudioContext({
        sampleRate: 16000,
      });

      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      await recordingAudioContextRef.current.audioWorklet.addModule('/audio-processing.worklet.js');

      sourceRef.current = recordingAudioContextRef.current.createMediaStreamSource(audioStream);
      audioWorkletNodeRef.current = new AudioWorkletNode(recordingAudioContextRef.current, 'audio-processor');

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
      audioWorkletNodeRef.current.connect(recordingAudioContextRef.current.destination);
    }
    catch (error) {
      log.error(`録音の開始中にエラーが発生しました`);
      console.error(error);
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

    if (recordingAudioContextRef.current) {
      recordingAudioContextRef.current.close();
      recordingAudioContextRef.current = null;
    }
  };

  // コンポーネントのアンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      stopRecording();
      stopCurrentAudio();
      if (playAudioContextRef.current) {
        playAudioContextRef.current.close();
      }
    };
  }, [stopCurrentAudio]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // 送信時に再生中の音声を停止
    stopCurrentAudio();

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
              showFeedback
              audioUrl={message.audioUrl}
            />
          );
        })}
        {streamingMessage && <MessageCard avatar="/omochi.png" message={streamingMessage} showFeedback />}
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
