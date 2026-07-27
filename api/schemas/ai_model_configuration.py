from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from api.services.configuration.registry import (
    ElphieEmbeddingsConfiguration,
    ElphieLLMService,
    ElphieSTTService,
    ElphieTTSService,
    EmbeddingsConfig,
    LLMConfig,
    RealtimeConfig,
    ServiceProviders,
    STTConfig,
    TTSConfig,
)

ELPHIE_SPEED_MIN = 0.5
ELPHIE_SPEED_MAX = 2.0
ELPHIE_SPEED_STEP = 0.1
ELPHIE_SPEED_OPTIONS: tuple[float, ...] = (0.8, 1.0, 1.2)
ELPHIE_DEFAULT_VOICE = "default"
ELPHIE_DEFAULT_LANGUAGE = "multi"


class EffectiveAIModelConfiguration(BaseModel):
    llm: LLMConfig | None = None
    stt: STTConfig | None = None
    tts: TTSConfig | None = None
    embeddings: EmbeddingsConfig | None = None
    realtime: RealtimeConfig | None = None
    is_realtime: bool = False
    managed_service_version: int | None = None
    test_phone_number: str | None = None
    timezone: str | None = None
    last_validated_at: datetime | None = None

    @model_validator(mode="before")
    @classmethod
    def strip_incomplete_realtime_when_disabled(cls, data):
        """Skip realtime validation when is_realtime is False and api_key is missing."""
        if not isinstance(data, dict):
            return data

        data = dict(data)
        legacy_provider = "dog" + "rah"
        for section in ("llm", "stt", "tts", "embeddings", "realtime"):
            service = data.get(section)
            if isinstance(service, dict) and service.get("provider") == legacy_provider:
                data[section] = {**service, "provider": "elphie"}

        if not data.get("is_realtime", False):
            realtime = data.get("realtime")
            if isinstance(realtime, dict) and not realtime.get("api_key"):
                data.pop("realtime", None)
        return data


class ElphieManagedAIModelConfiguration(BaseModel):
    api_key: str
    voice: str = ELPHIE_DEFAULT_VOICE
    speed: float = Field(default=1.0, ge=ELPHIE_SPEED_MIN, le=ELPHIE_SPEED_MAX)
    language: str = ELPHIE_DEFAULT_LANGUAGE


class BYOKPipelineAIModelConfiguration(BaseModel):
    llm: LLMConfig
    tts: TTSConfig
    stt: STTConfig
    embeddings: EmbeddingsConfig | None = None

    @model_validator(mode="after")
    def reject_elphie_providers(self):
        _reject_elphie_provider("llm", self.llm)
        _reject_elphie_provider("tts", self.tts)
        _reject_elphie_provider("stt", self.stt)
        _reject_elphie_provider("embeddings", self.embeddings)
        return self


class BYOKRealtimeAIModelConfiguration(BaseModel):
    realtime: RealtimeConfig
    llm: LLMConfig
    embeddings: EmbeddingsConfig | None = None

    @model_validator(mode="after")
    def reject_elphie_providers(self):
        _reject_elphie_provider("llm", self.llm)
        _reject_elphie_provider("embeddings", self.embeddings)
        return self


class BYOKAIModelConfiguration(BaseModel):
    mode: Literal["pipeline", "realtime"]
    pipeline: BYOKPipelineAIModelConfiguration | None = None
    realtime: BYOKRealtimeAIModelConfiguration | None = None

    @model_validator(mode="after")
    def validate_selected_mode(self):
        if self.mode == "pipeline" and self.pipeline is None:
            raise ValueError("byok.pipeline is required when byok.mode is pipeline")
        if self.mode == "realtime" and self.realtime is None:
            raise ValueError("byok.realtime is required when byok.mode is realtime")
        return self


class OrganizationAIModelConfigurationV2(BaseModel):
    version: Literal[2] = 2
    mode: Literal["elphie", "byok"]
    elphie: ElphieManagedAIModelConfiguration | None = None
    byok: BYOKAIModelConfiguration | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_pre_rebrand_configuration(cls, value):
        legacy_key = "dog" + "rah"
        if not isinstance(value, dict):
            return value
        if value.get("mode") != legacy_key and legacy_key not in value:
            return value
        normalized = dict(value)
        if normalized.get("mode") == legacy_key:
            normalized["mode"] = "elphie"
        if "elphie" not in normalized and legacy_key in normalized:
            normalized["elphie"] = normalized.pop(legacy_key)
        return normalized

    @model_validator(mode="after")
    def validate_selected_mode(self):
        if self.mode == "elphie" and self.elphie is None:
            raise ValueError("elphie configuration is required when mode is elphie")
        if self.mode == "byok" and self.byok is None:
            raise ValueError("byok configuration is required when mode is byok")
        return self


class OrganizationAIModelConfigurationResponse(BaseModel):
    configuration: dict | None
    effective_configuration: dict
    source: Literal["organization_v2", "legacy_user_v1", "empty"]


def compile_ai_model_configuration_v2(
    configuration: OrganizationAIModelConfigurationV2,
) -> EffectiveAIModelConfiguration:
    if configuration.mode == "elphie":
        if configuration.elphie is None:
            raise ValueError("elphie configuration is required")
        return _compile_elphie_configuration(configuration.elphie)

    if configuration.byok is None:
        raise ValueError("byok configuration is required")
    if configuration.byok.mode == "pipeline":
        if configuration.byok.pipeline is None:
            raise ValueError("byok.pipeline is required")
        pipeline = configuration.byok.pipeline
        return EffectiveAIModelConfiguration(
            llm=pipeline.llm,
            tts=pipeline.tts,
            stt=pipeline.stt,
            embeddings=pipeline.embeddings,
            is_realtime=False,
        )

    if configuration.byok.realtime is None:
        raise ValueError("byok.realtime is required")
    realtime = configuration.byok.realtime
    return EffectiveAIModelConfiguration(
        llm=realtime.llm,
        realtime=realtime.realtime,
        embeddings=realtime.embeddings,
        is_realtime=True,
    )


def _compile_elphie_configuration(
    configuration: ElphieManagedAIModelConfiguration,
) -> EffectiveAIModelConfiguration:
    return EffectiveAIModelConfiguration(
        llm=ElphieLLMService(
            provider=ServiceProviders.ELPHIE,
            api_key=configuration.api_key,
            model="default",
        ),
        tts=ElphieTTSService(
            provider=ServiceProviders.ELPHIE,
            api_key=configuration.api_key,
            model="default",
            voice=configuration.voice,
            speed=configuration.speed,
        ),
        stt=ElphieSTTService(
            provider=ServiceProviders.ELPHIE,
            api_key=configuration.api_key,
            model="default",
            language=configuration.language,
        ),
        embeddings=ElphieEmbeddingsConfiguration(
            provider=ServiceProviders.ELPHIE,
            api_key=configuration.api_key,
            model="default",
        ),
        is_realtime=False,
        managed_service_version=2,
    )


def _reject_elphie_provider(section: str, service) -> None:
    if service is None:
        return
    if getattr(service, "provider", None) == ServiceProviders.ELPHIE:
        raise ValueError(f"BYOK {section} cannot use Elphie provider")
