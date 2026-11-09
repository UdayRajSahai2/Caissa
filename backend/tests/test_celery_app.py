from app.worker.celery_app import ANALYSIS_TASK, INGESTION_TASK, celery_app


def test_analysis_queue_is_isolated_and_time_boxed() -> None:
    assert celery_app.conf.task_acks_late is True
    assert celery_app.conf.task_reject_on_worker_lost is True
    assert celery_app.conf.worker_prefetch_multiplier == 1
    assert celery_app.conf.task_time_limit == 600
    assert celery_app.conf.task_routes[ANALYSIS_TASK]["queue"] == "analysis"
    assert celery_app.conf.task_routes[INGESTION_TASK]["queue"] == "ingestion"
    assert celery_app.conf.task_serializer == "json"
    from app.worker.tasks import analyze_game

    assert analyze_game.time_limit == 600
