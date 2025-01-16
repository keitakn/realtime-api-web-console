from fastapi import APIRouter, WebSocket
from google.genai.live import AsyncSession  # noqa: F401
from log.logger import AppLogger
from presentation.controller.video_chat_controller import VideoChatController

router = APIRouter()
app_logger = AppLogger()


@router.websocket("/realtime-apis/video-chat")
async def video_chat_websocket_endpoint(websocket: WebSocket) -> None:
    """
    このエンドポイントはねこ型AIアシスタントとの会話を行う為のWebSocketエンドポイント。 \n
    以下のようなレスポンスが返ってきます。 \n

    {"audio": "Base64デコードされた音声データ"} \n
    {"text": "AIアシスタントの返答"} \n
    {"endOfTurn": true} \n
    """

    controller = VideoChatController(websocket)

    return await controller.exec()
