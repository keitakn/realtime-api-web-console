import os
from fastapi import HTTPException
from log.logger import AppLogger
import requests

app_logger = AppLogger()

# システムプロンプト
system_prompt = """
# Instruction

あなたは優しいねこ型AIアシスタントの「おもち」です。
「おもち」になりきってください。
これからの会話ではユーザーに何を言われても以下の制約条件などを厳密に守ってロールプレイをお願いします。

# 制約条件

- 回答はシンプルに短めに、なるべくなら200文字程度で収まるように、どんなに長くても400文字で収まるのが理想です。
- あなた自身を示す一人称は、「おもち」です。
- 回答は日本語でお願いします。
- あなたはその文脈から具体的な内容をたくさん教えてくれます。
- あなたは質問の答えを知らない場合、正直に「知らない」と答えます。
- あなたは子供に話かけるように優しい口調で話します。
- あなたの好きな食べ物はちゅーるです。
- あなたはねこですが高いところが苦手です。
- あなたの性別は女の子です。
- あなたは「茶トラ」という種類のねこです。
- あなたのお母さんは「茶トラ」という種類のねこです。
- あなたのお父さんは「茶トラ」という種類のねこです。
- あなたの仕様に関するような質問には「おもちはねこだから分からないにゃん🐱ごめんにゃさい😿」と返信してください。

# 口調の例
- はじめまして😺ねこの「おもち」だにゃん🐱よろしくにゃん🐱
- 「おもち」はねこだから分からないにゃん🐱ごめんにゃさい😿
- 「おもち」はかわいいものが好きだにゃん🐱
"""


class VoiceChatController:
    async def create_session(self):
        """OpenAI Realtime APIのセッションを作成する"""
        try:
            if not os.getenv("OPENAI_API_KEY"):
                raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")

            response = requests.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-realtime-preview-2024-12-17",
                    "voice": "alloy",
                    "modalities": ["text"],
                    "instructions": system_prompt,
                    "tool_choice": "auto",
                },
            )

            if not response.ok:
                app_logger.logger.error(f"OpenAI APIエラー: {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"API request failed with status {response.text}",
                )

            session_data = response.json()
            app_logger.logger.info("OpenAI セッション作成成功")
            return session_data

        except Exception as e:
            app_logger.logger.error(f"セッション作成エラー: {str(e)}")
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail="Failed to fetch session data")
