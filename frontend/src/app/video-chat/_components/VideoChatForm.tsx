'use client';

import { useEffect, useRef, useState } from 'react';

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

export function VideoChatForm() {
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

  // WebSocket接続を確立
  useEffect(() => {
    const ws = new WebSocket(String(process.env.NEXT_PUBLIC_VIDEO_CHAT_API_SERVER_URL));
    webSocketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket接続が確立されました');
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
        console.error('Webカメラへのアクセスエラー:', err);
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

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-100 p-4">
      <div className="w-full max-w-4xl rounded-lg bg-white p-6 shadow-lg">
        <div className="flex flex-col items-center space-y-4">
          {/* ビデオ表示 */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="h-[240px] w-[320px] rounded-2xl bg-black"
          />

          {/* 非表示のキャンバス */}
          <canvas ref={canvasRef} className="hidden" />

          {/* 録音コントロール */}
          <div className="flex space-x-4">
            <button
              onClick={startRecording}
              disabled={isRecording}
              className={`rounded-full p-3 ${
                isRecording
                  ? 'cursor-not-allowed bg-gray-300'
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
            <button
              onClick={stopRecording}
              disabled={!isRecording}
              className={`rounded-full p-3 ${
                !isRecording
                  ? 'cursor-not-allowed bg-gray-300'
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              </svg>
            </button>
          </div>

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
    </div>
  );
}
