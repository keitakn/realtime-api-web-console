import React, { useEffect, useRef, useState } from 'react';
import { useVideoDeviceList } from './_hooks/useVideoDeviceList';

export function Camera() {
  const refVideo = useRef(null);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const { devices } = useVideoDeviceList();

  const getDevice
    = devices
    && selectedDevice
    && devices.find(v => v.label === selectedDevice);

  useEffect(() => {
    // カメラ情報が取得できない場合はフロントカメラを利用する
    const constraints = getDevice
      ? { video: { deviceId: getDevice.deviceId } }
      : { video: { facingMode: 'user' } };

    selectedDevice
    && navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        if (refVideo?.current) {
          refVideo.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error('Error', err);
      });
  }, [getDevice, selectedDevice]);

  useEffect(() => {
    // 利用デバイスの初期設定
    devices && devices?.[0] && setSelectedDevice(devices[0]);
  }, [devices]);

  return (
    <div>
      <video
        ref={refVideo}
        autoPlay
        muted
        playsInline
      />
      <div>
        <select onChange={event => setSelectedDevice(event.target.value)}>
          {devices.map(value => (
            <option key={value.deviceId}>{value.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
