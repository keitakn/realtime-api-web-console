'use client';

import { MessageCard } from '@/app/_components/MessageCard';
import { PromptInput } from '@/app/_components/PromptInput';
import { parseReceivedDataChannelMessage } from '@/lib/openai';
import { logger } from '@/logging/logger';
import { ExhaustiveError } from '@/utils/ExhaustiveError';
import { Icon } from '@iconify/react';
import {
  Button,
  cn,
  Spacer,
  Tooltip,
} from '@nextui-org/react';
import Image from 'next/image';
import { type ChangeEventHandler, type FormEvent, type KeyboardEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { InvalidPromptErrorMessage } from './InvalidPromptErrorMessage';

// メッセージの型定義
type Conversation = {
  role: 'user' | 'assistant';
  message: string;
};

const maxPromptLength = 2000;

// Update getEphemeralToken to use the backend endpoint
async function createEphemeralToken() {
  const response = await fetch(`${String(process.env.NEXT_PUBLIC_API_SERVER_URL)}/realtime-apis/voice-chat/sessions`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch ephemeral token');
  }

  const responseBody = await response.json();

  return responseBody.ephemeralToken;
}

const log = logger.child({ module: 'VoiceChatForm' });

export function VoiceChatForm() {
  const [prompt, setPrompt] = useState<string>('');
  const [isInvalidPrompt, setIsInvalidPrompt] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isDataChannelReady, setIsDataChannelReady] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [lastActivityTimestamp, setLastActivityTimestamp] = useState<number>(Date.now());

  // アイドルタイムアウトの設定（5分）
  const IDLE_TIMEOUT = 1000 * 60 * 5;

  const playAudioContextRef = useRef<AudioContext | null>(null);
  const audioUrl = useRef<string | undefined>(undefined);
  const currentAudio = useRef<AudioBufferSourceNode | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);

  // WebRTC references
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

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

  const stopSession = () => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = undefined;
    }
    if (isSpeaking) {
      stopCurrentAudio();
    }
    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current = null;
    }
    setIsSessionActive(false);
    setConversations([]);
    setStreamingMessage('');
  };

  // アクティビティを更新する関数
  const updateActivity = useCallback(() => {
    setLastActivityTimestamp(Date.now());
  }, []);

  // アイドルタイムアウトの監視
  useEffect(() => {
    if (!isSessionActive)
      return;

    const timer = setTimeout(() => {
      const timeSinceLastActivity = Date.now() - lastActivityTimestamp;
      if (timeSinceLastActivity >= IDLE_TIMEOUT) {
        stopSession();
        log.info('一定時間操作がなかったため、セッションを終了しました');
      }
    }, IDLE_TIMEOUT);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSessionActive, lastActivityTimestamp, IDLE_TIMEOUT]);

  // タブの可視性変更の監視
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isSessionActive) {
        stopSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSessionActive]);

  // コネクションの定期的なヘルスチェック
  useEffect(() => {
    if (!isSessionActive)
      return;

    const interval = setInterval(() => {
      if (peerConnectionRef.current?.connectionState !== 'connected') {
        stopSession();
      }
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSessionActive]);

  // 音声再生の初期化関数
  const initializeAudio = useCallback(async () => {
    if (isAudioInitialized) {
      return true;
    }

    try {
      const ctx = new AudioContext();
      playAudioContextRef.current = ctx;
      await playAudioContextRef.current.resume();

      // 無音のバッファを再生して再生権限を取得
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      source.start(0);

      setIsAudioInitialized(true);
      return true;
    }
    catch (error) {
      console.error(error);
      return false;
    }
  }, [isAudioInitialized]);

  // 音声再生関数
  const playAudio = async (base64Audio: string) => {
    // 新しい音声が送信された場合は既存の音声を停止
    stopCurrentAudio();

    try {
      if (!playAudioContextRef.current) {
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
      console.error(error);
      setIsSpeaking(false);
    }
  };

  let newResponseMessage = '';

  // Handle incoming messages from the data channel
  const handleDataChannelMessage = async (event: MessageEvent<string>) => {
    try {
      const parsedData = JSON.parse(event.data);
      const receivedDataChannelMessage = parseReceivedDataChannelMessage(parsedData);

      switch (receivedDataChannelMessage.type) {
        case 'session.created':
        case 'session.updated':
          // セッション関連のメッセージは無視
          break;
        case 'conversation.item.created':
          // conversation.item.createdは無視（ストリーミングで処理する）
          break;
        case 'response.created':
          // response.createdは無視
          break;
        case 'rate_limits.updated':
          // レート制限の更新は現状無視
          break;
        case 'response.output_item.added':
        case 'response.content_part.added':
          // これらのメッセージは無視
          break;
        case 'response.text.delta':
          if (receivedDataChannelMessage.delta) {
            // ストリーミングメッセージを更新
            newResponseMessage += receivedDataChannelMessage.delta;

            setStreamingMessage((prev) => {
              const updated = prev + receivedDataChannelMessage.delta;
              return updated;
            });
          }
          break;
        case 'response.text.done':
          if (newResponseMessage !== '') {
            const lastAssistantMessage = newResponseMessage;

            // メッセージを追加
            setConversations(prev => [...prev, {
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
              console.error(error);
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
          throw new ExhaustiveError(receivedDataChannelMessage);
      }
    }
    catch (error) {
      console.error(error);
    }
  };

  const startSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        {
          audio: {
            channelCount: 1,
            sampleRate: 16000,
          },
        },
      );

      // 音声トラックの参照を保持し、初期状態を設定
      audioTrackRef.current = stream.getTracks()[0];
      // 初期状態をisMicMutedの逆に設定
      audioTrackRef.current.enabled = !isMicMuted;

      const ephemeralToken = await createEphemeralToken();

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const audioElement = document.createElement('audio');
      audioElement.autoplay = true;

      pc.ontrack = (event) => {
        audioElement.srcObject = event.streams[0];
      };

      const dataChannel = pc.createDataChannel('response');
      dataChannelRef.current = dataChannel;

      dataChannel.onopen = () => {
        setIsDataChannelReady(true);
        // 自動的に「こんにちは」メッセージを送信
        const message = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'こんにちは',
              },
            ],
          },
        };

        const response = {
          type: 'response.create',
        };

        dataChannel.send(JSON.stringify(message));
        dataChannel.send(JSON.stringify(response));
      };

      dataChannel.onclose = () => {
        setIsDataChannelReady(false);
      };

      dataChannel.onerror = (error) => {
        console.error(error);
      };

      dataChannel.onmessage = handleDataChannelMessage;

      // Add local (mic) track
      pc.addTrack(stream.getTracks()[0]);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send SDP offer to OpenAI Realtime
      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-realtime-preview-2024-12-17';
      const response = await fetch(`${baseUrl}?model=${model}`, {
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

      setIsSessionActive(true);
    }
    catch (error) {
      console.error(error);
      stopSession();
    }
  };

  const sendTextMessage = (text: string) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      console.error('Data channel not ready');
      return;
    }

    // ユーザーメッセージを追加
    const newConversation: Conversation = {
      role: 'user',
      message: text,
    };
    setConversations(prev => [...prev, newConversation]);

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
    // Empty dependency array means this effect runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateActivity(); // アクティビティ更新

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
    setIsInvalidPrompt(prompt.length > maxPromptLength);
    updateActivity(); // アクティビティ更新
  };

  // セッション開始時の処理をまとめた関数
  const handleStartSession = async () => {
    setIsInitializing(true);
    try {
      // 音声初期化
      await initializeAudio();
      // WebRTCセッション開始
      await startSession();
    }
    catch (error) {
      console.error(error);
    }
    finally {
      setIsInitializing(false);
    }
  };

  const handleMicToggle = () => {
    if (audioTrackRef.current) {
      const newMutedState = !isMicMuted;
      setIsMicMuted(newMutedState);
      audioTrackRef.current.enabled = !newMutedState;
      updateActivity(); // アクティビティ更新
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
        {conversations.map((conversation, index) => {
          if (conversation.role === 'user') {
            return (
              <MessageCard
                key={index}
                message={conversation.message}
                showFeedback={false}
              />
            );
          }

          return (
            <MessageCard
              key={index}
              avatar="/omochi.png"
              message={conversation.message}
            />
          );
        })}
        {streamingMessage && <MessageCard avatar="/omochi.png" message={streamingMessage} />}
      </div>

      <Spacer y={4} />

      {(!isSessionActive && !isDataChannelReady) && (
        <Button
          color="primary"
          onPress={handleStartSession}
          isLoading={isInitializing}
        >
          <span className="font-bold">会話をスタートする</span>
        </Button>
      )}
      {(isSessionActive && isDataChannelReady) && (
        <Button
          color="danger"
          variant="flat"
          onPress={stopSession}
        >
          <span className="font-bold">会話を終了する</span>
        </Button>
      )}
      <Spacer y={4} />

      {(isSessionActive && isDataChannelReady) && (
        <form className="flex w-full items-start gap-2" onSubmit={handleSubmit}>
          <PromptInput
            isInvalidPrompt={isInvalidPrompt}
            errorMessage={isInvalidPrompt && <InvalidPromptErrorMessage maxPromptLength={maxPromptLength} />}
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
                    onPress={handleMicToggle}
                  >
                    <Icon
                      className={cn('text-default-500')}
                      icon={isMicMuted ? 'ph:microphone-slash' : 'ph:microphone'}
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
