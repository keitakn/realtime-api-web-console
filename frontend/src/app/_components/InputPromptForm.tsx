'use client';

import { Icon } from '@iconify/react';
import { Button, cn, Tooltip } from '@nextui-org/react';
import Image from 'next/image';
import { type ChangeEventHandler, type FormEvent, type KeyboardEventHandler, useEffect, useRef, useState } from 'react';
import { PromptInput } from './PromptInput';

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
  }
}

export function InputPromptForm() {
  const [prompt, setPrompt] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const currentFrameB64 = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmDataRef = useRef<number[]>([]);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioUrl = useRef<string | null>(null);
  const currentAudio = useRef<HTMLAudioElement | null>(null);

  // メッセージ表示関数
  const displayMessage = (message: string) => {
    console.log(message);
    setMessages(prev => [...prev, message]);
  };

  // 音声再生関数
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
    setIsSpeaking(true);
    audio.addEventListener('ended', () => {
      currentAudio.current = null;
      audioUrl.current = null;
      setIsSpeaking(false);
    });
    try {
      await audio.play();
    }
    catch (error) {
      console.error('音声再生エラー', error);
      setIsSpeaking(false);
    }
  };

  // WebSocket接続を確立
  useEffect(() => {
    const ws = new WebSocket(String(process.env.NEXT_PUBLIC_VIDEO_CHAT_API_SERVER_URL));
    webSocketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket接続が確立��れました');
    };

    ws.onmessage = async (event) => {
      try {
        const messageData = JSON.parse(event.data);
        const response = new Response(messageData);

        if (response.text) {
          displayMessage(response.text);
        }
        if (response.audioData) {
          audioUrl.current = response.audioData;
          await playAudio();
        }
      }
      catch (error) {
        console.error('メッセージの処理中にエラーが発生しました:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket接続が閉じられました');
      alert('Connection closed');
    };

    ws.onerror = (event) => {
      console.log('websocket error:', event);
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
      catch (err) {
        console.error('Webカメラへのアクセスエ��ー:', err);
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

  const recordChunk = () => {
    const buffer = new ArrayBuffer(pcmDataRef.current.length * 2);
    const view = new DataView(buffer);
    pcmDataRef.current.forEach((value, index) => {
      view.setInt16(index * 2, value, true);
    });

    const base64 = btoa(
      String.fromCharCode(...Array.from(new Uint8Array(buffer))),
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
    pcmDataRef.current = [];
  };

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

      sourceRef.current = audioContextRef.current.createMediaStreamSource(audioStream);
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = inputData[i] * 0x7FFF;
        }
        pcmDataRef.current.push(...Array.from(pcm16));
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      recordIntervalRef.current = setInterval(recordChunk, 3000);
    }
    catch (error) {
      console.error('録音の開始中にエラーが発生しました:', error);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);

    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    pcmDataRef.current = [];
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

          {/* メッセージ表示 */}
          <div className="mt-4 w-full space-y-4">
            {messages.map((message, index) => (
              <p key={index} className="rounded-lg bg-gray-100 p-4">
                {message}
              </p>
            ))}
          </div>
        </div>
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
                  onPress={() => {
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
