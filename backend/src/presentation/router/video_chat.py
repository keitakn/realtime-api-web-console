import os
import json
import base64
import asyncio
import requests
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from log.logger import AppLogger

router = APIRouter()
app_logger = AppLogger()

# Gemini APIの設定
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"), http_options={"api_version": "v1alpha"}
)
MODEL = "gemini-2.0-flash-exp"

TTS_API_URL = "https://api.nijivoice.com/api/platform/v1/voice-actors/16e979a8-cd0f-49d4-a4c4-7a25aa42e184/generate-voice"
TTS_API_KEY = os.getenv("NIJIVOICE_API_KEY")


@router.websocket("/realtime-apis/video-chat")
async def video_chat_websocket_endpoint(websocket: WebSocket) -> None:
    """Handles the interaction with Gemini API within a websocket session.

    Args:
        websocket: The websocket connection to the client.
    """
    await websocket.accept()

    try:
        # 初期設定メッセージを受信
        config_message = await websocket.receive_text()
        config_data = json.loads(config_message)
        config = config_data.get("setup", {})

        # Gemini APIセッションを開始
        async with client.aio.live.connect(model=MODEL, config=config) as session:
            app_logger.logger.info("Gemini APIに接続しました")

            async def send_to_gemini():
                """クライアントからのメッセージをGemini APIに送信"""
                try:
                    while True:
                        try:
                            message = await websocket.receive_text()
                            data = json.loads(message)
                            if "realtime_input" in data:
                                for chunk in data["realtime_input"]["media_chunks"]:
                                    if chunk["mime_type"] == "audio/pcm":
                                        await session.send(
                                            {
                                                "mime_type": "audio/pcm",
                                                "data": chunk["data"],
                                            }
                                        )
                                    elif chunk["mime_type"] == "image/jpeg":
                                        await session.send(
                                            {
                                                "mime_type": "image/jpeg",
                                                "data": chunk["data"],
                                            }
                                        )
                        except WebSocketDisconnect:
                            app_logger.logger.info(
                                "クライアント接続が切断されました (send)"
                            )
                            break
                        except Exception as e:
                            app_logger.logger.error(
                                f"Geminiへの送信中にエラーが発生しました: {e}"
                            )
                except Exception as e:
                    app_logger.logger.error(
                        f"send_to_geminiでエラーが発生しました: {e}"
                    )
                finally:
                    app_logger.logger.info("send_to_geminiを終了しました")

            async def receive_from_gemini():
                """Gemini APIからのレスポンスを受信してクライアントに転送"""
                try:
                    while True:
                        try:
                            app_logger.logger.info("Geminiからの応答を待機中")

                            # 音声合成の元になる結合用の文字列
                            combined_text = ""

                            async for response in session.receive():
                                app_logger.logger.debug(f"response: {response}")

                                if response.server_content is None:
                                    app_logger.logger.warning(
                                        f"未処理のサーバーメッセージ: {response}"
                                    )
                                    continue

                                model_turn = response.server_content.model_turn
                                if model_turn:
                                    for part in model_turn.parts:
                                        app_logger.logger.debug(f"part: {part}")
                                        if (
                                            hasattr(part, "text")
                                            and part.text is not None
                                        ):
                                            combined_text += response.text
                                            await websocket.send_text(
                                                json.dumps({"text": part.text})
                                            )
                                        elif (
                                            hasattr(part, "inline_data")
                                            and part.inline_data is not None
                                        ):
                                            app_logger.logger.info(
                                                f"audio mime_type: {part.inline_data.mime_type}"
                                            )
                                            base64_audio = base64.b64encode(
                                                part.inline_data.data
                                            ).decode("utf-8")
                                            await websocket.send_text(
                                                json.dumps({"audio": base64_audio})
                                            )
                                            app_logger.logger.info(
                                                "音声データを受信しました"
                                            )

                                if response.server_content.turn_complete:
                                    print("ターンエンド")
                                    print(combined_text)
                                    print("ターンエンド")

                                    if combined_text:
                                        tts_payload = {
                                            "script": combined_text,
                                            "format": "wav",
                                            "speed": "0.8",
                                        }
                                        tts_headers = {
                                            "x-api-key": TTS_API_KEY,
                                            "accept": "application/json",
                                            "content-type": "application/json",
                                        }
                                        tts_response = requests.post(
                                            TTS_API_URL,
                                            json=tts_payload,
                                            headers=tts_headers,
                                        )
                                        tts_response.raise_for_status()
                                        tts_data = tts_response.json()
                                        if (
                                            "generatedVoice" in tts_data
                                            and "audioFileUrl"
                                            in tts_data["generatedVoice"]
                                        ):
                                            audio_url = tts_data["generatedVoice"][
                                                "audioFileUrl"
                                            ]
                                            await websocket.send_text(
                                                json.dumps({"audio": audio_url})
                                            )

                                        combined_text = ""
                                    app_logger.logger.info("Rurn End")

                        except WebSocketDisconnect:
                            app_logger.logger.info(
                                "クライアント接続が正常に切断されました (receive)"
                            )
                            break
                        except Exception as e:
                            app_logger.logger.error(
                                f"Geminiからの受信中にエラーが発生しました: {e}"
                            )
                            break
                except Exception as e:
                    app_logger.logger.error(
                        f"receive_from_geminiでエラーが発生しました: {e}"
                    )
                finally:
                    app_logger.logger.info("receive_from_geminiを終了しました")

            # 送信ループと受信ループを並行して実行
            send_task = asyncio.create_task(send_to_gemini())
            receive_task = asyncio.create_task(receive_from_gemini())

            try:
                await asyncio.gather(send_task, receive_task)
            except Exception as e:
                app_logger.logger.error(f"タスク実行中にエラーが発生しました: {e}")
            finally:
                # タスクのクリーンアップ
                for task in [send_task, receive_task]:
                    if not task.done():
                        task.cancel()
                        try:
                            await task
                        except asyncio.CancelledError:
                            pass

    except Exception as e:
        app_logger.logger.error(f"Geminiセッションでエラーが発生しました: {e}")
    finally:
        app_logger.logger.info("Geminiセッションを終了しました")
