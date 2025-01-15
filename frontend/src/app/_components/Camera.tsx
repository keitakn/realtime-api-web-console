import { Alert } from '@nextui-org/react';
import React, { useEffect, useRef, useState } from 'react';
import { useVideoDeviceList } from './_hooks/useVideoDeviceList';

type Props = {
  onStreamChange?: (stream: MediaStream | null) => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
};

export function Camera({ onStreamChange, videoRef }: Props) {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const actualVideoRef = videoRef || internalVideoRef;
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const { devices } = useVideoDeviceList();

  const initializeCamera = async (deviceId?: string) => {
    try {
      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId } } }
        : { video: { facingMode: 'user' } };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (actualVideoRef?.current) {
        actualVideoRef.current.srcObject = stream;
        onStreamChange?.(stream);
      }
    }
    catch (err) {
      console.error('Error', err);
      onStreamChange?.(null);
    }
  };

  // デバイスリスト変更時の処理
  useEffect(() => {
    if (devices && devices.length > 0) {
      // デバイスリストが取得できた場合は最初のデバイスを選択
      const defaultDevice = devices[0];
      setSelectedDevice(defaultDevice.label);
      initializeCamera(defaultDevice.deviceId);
    }
    else {
      // デバイスリストが取得できない場合はデフォルトカメラを使用
      initializeCamera();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices]);

  // デバイス選択時の処理
  useEffect(() => {
    if (selectedDevice && devices) {
      const device = devices.find(v => v.label === selectedDevice);
      if (device) {
        // 既存のストリームをクリーンアップ
        if (actualVideoRef?.current?.srcObject) {
          const stream = actualVideoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
        }
        initializeCamera(device.deviceId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice, devices]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (actualVideoRef?.current?.srcObject) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const stream = actualVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        onStreamChange?.(null);
      }
    };
  }, [onStreamChange, actualVideoRef]);

  return (
    <div>
      <Alert color="warning" title="ビデオ画像送信に問題が発生しています" description="現在AI Assistantはカメラの画像を認識出来ません" />
      <video
        ref={actualVideoRef}
        autoPlay
        muted
        playsInline
        className="h-[240px] w-[320px] rounded-2xl bg-black"
      />
      {devices && devices.length > 0 && (
        <div>
          <select
            onChange={event => setSelectedDevice(event.target.value)}
            value={selectedDevice || ''}
            className="mt-2 rounded-lg border border-gray-300 px-2 py-1"
          >
            {devices.map(value => (
              <option key={value.deviceId} value={value.label}>
                {value.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
