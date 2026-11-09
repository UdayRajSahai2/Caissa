from typing import Protocol


class IngestQueue(Protocol):
    def enqueue(
        self,
        username: str,
        include_bullet: bool,
        job_id: str,
        needed: int | None = None,
        refresh_latest: bool = False,
    ) -> None: ...


class AnalysisQueue(Protocol):
    def enqueue_game(self, internal_id: str, job_id: str) -> None: ...


class CeleryIngestQueue:
    """Hands the username to the ingestion queue. The request does not wait for Chess.com."""

    def enqueue(
        self,
        username: str,
        include_bullet: bool,
        job_id: str,
        needed: int | None = None,
        refresh_latest: bool = False,
    ) -> None:
        from app.worker.celery_app import INGESTION_TASK, celery_app

        args: list[object] = [username, include_bullet, job_id]
        if needed is not None or refresh_latest:
            args.append(needed)
        if refresh_latest:
            args.append(True)
        celery_app.send_task(INGESTION_TASK, args=args, queue="ingestion")


class CeleryAnalysisQueue:
    """Scores one stored game. The request does not wait for Stockfish."""

    def enqueue_game(self, internal_id: str, job_id: str) -> None:
        from app.worker.celery_app import ANALYSIS_TASK, celery_app

        celery_app.send_task(
            ANALYSIS_TASK,
            args=[internal_id, job_id],
            queue="analysis",
        )
