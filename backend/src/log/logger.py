import json
from logging import Logger, LogRecord, getLogger, StreamHandler, Formatter, INFO, DEBUG
from typing import Literal, TypedDict


class JsonFormatter(Formatter):
    def format(self, record: LogRecord) -> str:
        try:
            data = record.__dict__.copy()
            exc_info = data.pop("exc_info")
            if exc_info:
                data["traceback"] = self.formatException(exc_info).splitlines()
            return json.dumps(data)
        except Exception:
            return super().format(record)


class SuccessLogExtra(TypedDict):
    user_message: str


class ErrorLogExtra(TypedDict):
    user_message: str


class InfoLogExtra(TypedDict):
    info_message: str


LogLevel = Literal[0, 10, 20, 30, 40, 50]


class AppLogger:
    def __init__(self, level: LogLevel = DEBUG) -> None:
        self._logger = getLogger()
        self._logger.setLevel(level)

        for handler in self._logger.handlers[:]:
            self._logger.removeHandler(handler)

        handler = StreamHandler()
        handler.setFormatter(JsonFormatter())
        self._logger.addHandler(handler)

    @property
    def logger(self) -> Logger:
        return self._logger
