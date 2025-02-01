from fastapi import APIRouter, WebSocket
from starlette import status
from starlette.responses import JSONResponse
from google.genai.live import AsyncSession  # noqa: F401
from log.logger import AppLogger
from presentation.controller.video_chat_controller import VideoChatController
from presentation.controller.create_voice_chat_session_controller import (
    CreateVoiceChatSessionController,
)

router = APIRouter()
app_logger = AppLogger()


@router.post("/realtime-apis/voice-chat/sessions", status_code=status.HTTP_201_CREATED)
async def create_voice_chat_session_endpoint() -> JSONResponse:
    """
    このエンドポイントはねこ型AIアシスタントとの会話を行う為のVoiceChatセッショントークンを取得する為のエンドポイントです。
    """
    controller = CreateVoiceChatSessionController()
    return await controller.exec()


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
