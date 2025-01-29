'use client';

import { MessageCard } from '@/app/_components/MessageCard';
import { PromptInput } from '@/app/_components/PromptInput';
import { logger } from '@/logging/logger';
import { Icon } from '@iconify/react';
import {
  Button,
  cn,
  Tooltip,
} from '@nextui-org/react';
import Image from 'next/image';
import { type ChangeEventHandler, type FormEvent, type KeyboardEventHandler, useCallback, useEffect, useRef, useState } from 'react';

// HTMLAudioElementの型を拡張
declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface HTMLAudioElement {
    playsInline: boolean;
    webkitPlaysInline: boolean;
  }
}

// メッセージの型定義
type Message = {
  role: 'user' | 'assistant';
  message: string;
};

const log = logger.child({ module: 'VoiceChatForm' });

export function VoiceChatForm() {
  const [prompt, setPrompt] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isDataChannelReady, setIsDataChannelReady] = useState(false);

  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const playAudioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioUrl = useRef<string | undefined>(undefined);
  const currentAudio = useRef<AudioBufferSourceNode | null>(null);
  const webRTCSessionRef = useRef<any>(null);

  // WebRTC references
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  // Add session state
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [status, setStatus] = useState('');

  // 初期化状態を管理する新しいstate
  const [isInitializing, setIsInitializing] = useState(false);

  // 現在再生中の音声を停止する関数
  const stopCurrentAudio = useCallback(() => {
    if (currentAudio.current) {
      try {
        currentAudio.current.stop();
      }
      catch (error) {
        console.error(error);
      }
      currentAudio.current = null;
      setIsSpeaking(false);
    }
  }, []);

  // 音声再生の初期化関数
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

  // 音声再生関数
  const playAudio = async (base64Audio: string) => {
    log.info('playAudio関数が呼び出されました');

    // 新しい音声が送信された場合は既存の音声を停止
    stopCurrentAudio();

    try {
      if (!playAudioContextRef.current) {
        log.warn('AudioContextが初期化されていません');
        return;
      }

      // Base64データをデコードしてArrayBufferに変換
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      const audioBuffer = await playAudioContextRef.current.decodeAudioData(arrayBuffer);

      const source = playAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playAudioContextRef.current.destination);

      currentAudio.current = source;

      setIsSpeaking(true);

      // 再生終了時の処理
      source.onended = () => {
        currentAudio.current = null;
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

  // WebRTCセッションの初期化
  const startSession = async () => {
    try {
      log.info('Starting WebRTC session');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setupAudioVisualization(stream);

      log.info('Fetching ephemeral token');
      const ephemeralToken = await getEphemeralToken();

      log.info('Establishing connection');
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Connection state monitoring
      pc.onconnectionstatechange = () => {
        log.info('Connection state changed:', pc.connectionState);
        setStatus(`Connection: ${pc.connectionState}`);
      };

      pc.oniceconnectionstatechange = () => {
        log.info('ICE connection state:', pc.iceConnectionState);
      };

      pc.onicegatheringstatechange = () => {
        log.info('ICE gathering state:', pc.iceGatheringState);
      };

      // Hidden <audio> element for inbound assistant TTS
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;

      // Inbound track => assistant's TTS
      pc.ontrack = (event) => {
        log.info('Received track:', event.track.kind);
        audioEl.srcObject = event.streams[0];
      };

      // Data channel for transcripts
      const dataChannel = pc.createDataChannel('response');
      dataChannelRef.current = dataChannel;

      dataChannel.onopen = () => {
        log.info('Data channel opened');
        configureDataChannel(dataChannel);
        setIsDataChannelReady(true);
      };

      dataChannel.onclose = () => {
        log.info('Data channel closed');
        setIsDataChannelReady(false);
      };

      dataChannel.onerror = (error) => {
        log.error('Data channel error:', error);
      };

      dataChannel.onmessage = handleDataChannelMessage;

      // Add local (mic) track
      pc.addTrack(stream.getTracks()[0]);

      // Create offer & set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      log.info('Local description set');

      // Send SDP offer to OpenAI Realtime
      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-realtime-preview-2024-12-17';
      const response = await fetch(`${baseUrl}?model=${model}&voice=alloy`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          'Authorization': `Bearer ${ephemeralToken}`,
          'Content-Type': 'application/sdp',
        },
      });

      // Set remote description
      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      log.info('Remote description set');

      setIsSessionActive(true);
      log.info('Session established successfully!');
    }
    catch (err) {
      console.error('startSession error:', err);
      setStatus(`Error: ${err}`);
      stopSession();
    }
  };

  // Stop the session & cleanup
  const stopSession = () => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (playAudioContextRef.current) {
      playAudioContextRef.current.close();
      playAudioContextRef.current = null;
    }
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = undefined;
    }
    if (isSpeaking) {
      stopCurrentAudio();
    }
    if (isRecording) {
      stopRecording();
    }
    setIsSessionActive(false);
    setStatus('Session stopped');
    setMessages([]);
    setStreamingMessage('');
  };

  // Send a text message through the data channel
  const sendTextMessage = (text: string) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      console.error('Data channel not ready');
      return;
    }

    // ユーザーメッセージを追加
    const newMessage: Message = {
      role: 'user',
      message: text,
    };
    setMessages(prev => [...prev, newMessage]);

    // メッセージを送信
    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text,
          },
        ],
      },
    };

    const response = {
      type: 'response.create',
    };

    // 送信前にストリーミングメッセージをクリア
    setStreamingMessage('');

    dataChannelRef.current.send(JSON.stringify(message));
    dataChannelRef.current.send(JSON.stringify(response));
  };

  // Cleanup on unmount
  useEffect(() => {
    // Cleanup when component unmounts
    return () => {
      stopSession();
    };
  }, []); // Empty dependency array means this effect runs once on mount

  // Define missing functions and variables
  const setupAudioVisualization = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateIndicator = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      // Implement visualization logic
      requestAnimationFrame(updateIndicator);
    };
    updateIndicator();
  };

  // Update getEphemeralToken to use the backend endpoint
  const getEphemeralToken = async () => {
    const response = await fetch(String(process.env.NEXT_PUBLIC_EPHEMERAL_TOKEN_ENDPOINT), {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch ephemeral token');
    }

    const data = await response.json();
    return data.client_secret.value;
  };

  const configureDataChannel = (dataChannel: RTCDataChannel) => {
    // Implement data channel configuration
  };

  let newResponseMessage = '';

  // Handle incoming messages from the data channel
  const handleDataChannelMessage = async (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      // log.debug('Received message:', msg);

      switch (msg.type) {
        case 'conversation.item.create':
          // conversation.item.createは無視（ストリーミングで処理する）
          break;
        case 'response.text.delta':
          if (msg.delta) {
            // ストリーミングメッセージを更新
            newResponseMessage += msg.delta;

            setStreamingMessage((prev) => {
              const updated = prev + msg.delta;
              return updated;
            });
          }
          break;
        case 'response.text.done':
          if (newResponseMessage !== '') {
            const lastAssistantMessage = newResponseMessage;

            // メッセージを追加
            setMessages(prev => [...prev, {
              role: 'assistant',
              message: lastAssistantMessage,
            }]);

            newResponseMessage = '';
            setStreamingMessage('');

            // 音声を生成して再生
            try {
              const response = await fetch('/api/voices', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  script: lastAssistantMessage,
                }),
              });

              if (!response.ok) {
                throw new Error('音声生成に失敗しました');
              }

              const audioData = await response.json();
              if (audioData.base64Audio) {
                await playAudio(audioData.base64Audio);
              }
            }
            catch (error) {
              log.error('音声生成エラー:', error);
            }

            newResponseMessage = '';
            setStreamingMessage('');
          }
          break;
        case 'response.output_item.done':
        case 'response.content_part.done':
        case 'response.done':
          // これらのメッセージは無視
          break;
        default:
          log.debug('Unhandled message type:', msg.type);
      }
    }
    catch (error) {
      log.error('Error handling data channel message:', error);
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // 送信時に再生中の音声を停止
    stopCurrentAudio();

    if (textareaRef.current?.value != null && textareaRef.current?.value !== '') {
      const text = textareaRef.current.value;
      setPrompt('');
      sendTextMessage(text);
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

  // Recording functions
  const startRecording = async () => {
    if (!isSessionActive) {
      log.error('WebRTCセッションが初期化されていません');
      return;
    }

    // ユーザーが話をしている場合はAssistantの返答音声再生を停止する
    stopCurrentAudio();
    setIsRecording(true);

    try {
      // 既存の音声トラックを削除
      if (peerConnectionRef.current) {
        const senders = peerConnectionRef.current.getSenders();
        senders.forEach((sender) => {
          if (sender.track?.kind === 'audio') {
            sender.track.stop();
            peerConnectionRef.current?.removeTrack(sender);
          }
        });
      }

      // セッションを再初期化
      await startSession();

      // 音声データの送信開始を通知
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        const startMessage = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'audio_start',
              },
            ],
          },
        };
        dataChannelRef.current.send(JSON.stringify(startMessage));
      }
    }
    catch (error) {
      log.error('録音の開始中にエラーが発生しました');
      console.error(error);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);

    // 既存のAudioWorklet関連のクリーンアップ
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

    // WebRTCの音声トラックを停止
    if (peerConnectionRef.current) {
      const senders = peerConnectionRef.current.getSenders();
      senders.forEach((sender) => {
        if (sender.track?.kind === 'audio') {
          sender.track.stop(); // トラックを停止
        }
      });

      // 音声データの送信終了を通知
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        const endMessage = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'audio_end',
              },
            ],
          },
        };
        dataChannelRef.current.send(JSON.stringify(endMessage));
      }
    }
  };

  // セッション開始時の処理をまとめた関数
  const handleStartSession = async () => {
    setIsInitializing(true);
    try {
      // 音声初期化
      await initializeAudio();
      // WebRTCセッション開始
      await startSession();
    } catch (error) {
      log.error('初期化中にエラーが発生しました:', error);
      setStatus(`Error: ${error}`);
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <>
      <div className="w-full max-w-4xl rounded-lg bg-white p-6 shadow-lg">
        <div className="flex flex-col items-center space-y-4">
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
            />
          );
        })}
        {streamingMessage && <MessageCard avatar="/omochi.png" message={streamingMessage} />}
      </div>

      {!isSessionActive && !isInitializing && (
        <Button
          color="primary"
          onPress={handleStartSession}
          isLoading={isInitializing}
        >
          会話をスタートする
        </Button>
      )}

      {isSessionActive && (
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
            value={prompt}
            onValueChange={setPrompt}
          />
        </form>
      )}
    </>
  );
}
