from django.apps import AppConfig


class RegLogConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'reg_log'

    def ready(self):
        import reg_log.signals  # Регистрируем сигналы
