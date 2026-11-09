from celery import Celery

from app.core.config import get_settings

# ANA-06 / section 8.4. Tasks that call Stockfish are not defined yet.
# This process exists so analysis never runs inside a web request (C-04).
ANALYSIS_TASK = "app.worker.tasks.analyze_game"
INGESTION_TASK = "app.worker.tasks.ingest_player"


def create_celery() -> Celery:
    settings = get_settings()
    app = Celery(
        "caissa",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
    )
    app.conf.update(
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        task_track_started=True,
        worker_prefetch_multiplier=1,
        task_time_limit=600,
        task_soft_time_limit=540,
        task_default_queue="ingestion",
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        task_routes={
            INGESTION_TASK: {"queue": "ingestion"},
            ANALYSIS_TASK: {"queue": "analysis"},
        },
        broker_connection_retry_on_startup=True,
    )
    return app


celery_app = create_celery()

# Register tasks after the app exists. The import is deferred to avoid a cycle.
from app.worker import tasks as _tasks  # noqa: E402,F401
