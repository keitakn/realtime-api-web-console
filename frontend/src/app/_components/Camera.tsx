import React, { useEffect, useRef, useState } from 'react';
import { useVideoDeviceList } from './_hooks/useVideoDeviceList';

type CameraProps = {
  onStreamChange?: (stream: MediaStream | null) => void;
};

export function Camera({ onStreamChange }: CameraProps) {
  const refVideo = useRef<HTMLVideoElement>(null);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const { devices } = useVideoDeviceList();

  const initializeCamera = async (deviceId?: string) => {
    try {
      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId } } }
        : { video: { facingMode: 'user' } };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (refVideo?.current) {
        refVideo.current.srcObject = stream;
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
        if (refVideo?.current?.srcObject) {
          const stream = refVideo.current.srcObject as MediaStream;
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
      if (refVideo?.current?.srcObject) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const stream = refVideo.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        onStreamChange?.(null);
      }
    };
  }, [onStreamChange]);

  return (
    <div>
      <video
        ref={refVideo}
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
