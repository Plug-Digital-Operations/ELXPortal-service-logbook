import time
from typing import Annotated, Generic, TypeVar
from bson.objectid import ObjectId
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

T = TypeVar("T")

JSONObjectId = Annotated[
    ObjectId, PlainSerializer(lambda x: str(x), return_type=str, when_used="json")
]


class Note(BaseModel):
    id: JSONObjectId = Field(
        default_factory=ObjectId, alias="_id", serialization_alias="_id"
    )
    user: str | None = Field(default=None, deprecated=True)
    text: str
    external_note: bool | None = Field(default=None)
    created_on: int = Field(default_factory=lambda: round(time.time() * 1000))

    author_id: str | None = Field(default=None)
    author_name: str | None = Field(default=None)

    editor_id: str | None = Field(default=None)
    editor_name: str | None = Field(default=None)
    updated_on: int | None = Field(default=None)

    subject: str | None = Field(default=None)
    category: int | None = Field(default=None)
    note_category: str | None = Field(default=None)

    performed_on: int | None = Field(default=None)
    activity_end_date: int | None = Field(default=None)

    # Calibrations & Settings Update
    tag_numbers: list[str] | None = Field(default=None)

    # Software update
    version: str | None = Field(default=None)
    software_type: str | None = Field(default=None)
    # Stack replacements
    stack_replacements: str | None = Field(default=None)
    workorder_id: str | None = Field(default=None)

    # Stack inspection
    stack_inspections: str | None = Field(default=None)

    stack_installs: str | None = Field(default=None)

    stack_tensioning: str | None = Field(default=None)

    # Performance test
    note_sub_category: str | None = Field(default=None)

    # Maintenance
    additional_users: list[str] | None = Field(default=None)
    maintenance_interval_months: list[int] | None = Field(default=None)

    # Activity files (stored in Object Storage)
    activity_files: list[str] | None = Field(default=None)

    @field_validator("id", mode="before")
    @classmethod
    def convert_string_id_to_objectid(cls, v):
        """Convert string _id values to ObjectId instances."""
        if isinstance(v, str):
            try:
                return ObjectId(v)
            except Exception:
                return ObjectId()
        elif v is None:
            return ObjectId()
        return v

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="ignore")


class Response(BaseModel, Generic[T]):
    data: T | None = Field(default=None)
    message: str | None = Field(default=None)
    success: bool = Field(default=True)


class SuccessResponse(Response[T]):
    success: bool = Field(default=True)


class ErrorResponse(Response[T]):
    message: str = Field(default="An unexpected error occurred")
    success: bool = Field(default=False)


class NoteEdit(BaseModel):
    note_id: str
    text: str
    external_note: bool | None = Field(default=None)
    subject: str | None = Field(default=None)
    category: int | None = Field(default=None)
    note_category: str | None = Field(default=None)

    performed_on: int | None = Field(default=None)
    activity_end_date: int | None = Field(default=None)

    # Calibrations & Settings Update
    tag_numbers: list[str] | None = Field(default=None)

    # Software update & Firmware update
    version: str | None = Field(default=None)
    software_type: str | None = Field(default=None)
    # Stack replacements
    stack_replacements: str | None = Field(default=None)
    workorder_id: str | None = Field(default=None)

    # Stack inspection
    stack_inspections: str | None = Field(default=None)
    stack_installs: str | None = Field(default=None)
    stack_tensioning: str | None = Field(default=None)

    # Performance test
    note_sub_category: str | None = Field(default=None)

    # Maintenance
    additional_users: list[str] | None = Field(default=None)
    maintenance_interval_months: list[int] | None = Field(default=None)

    # Activity files (stored in Object Storage)
    activity_files: list[str] | None = Field(default=None)


class NoteAdd(BaseModel):
    text: str
    external_note: bool | None = Field(default=None)
    subject: str | None = Field(default=None)
    category: int | None = Field(default=None)
    note_category: str | None = Field(default=None)

    # Date field for moment of action
    performed_on: int | None = Field(default=None)
    activity_end_date: int | None = Field(default=None)

    # Calibrations & Settings Update
    tag_numbers: list[str] | None = Field(default=None)

    # Software update
    version: str | None = Field(default=None)
    software_type: str | None = Field(default=None)
    # Stack replacements
    stack_replacements: str | None = Field(default=None)
    workorder_id: str | None = Field(default=None)

    # Stack inspection
    stack_inspections: str | None = Field(default=None)
    stack_installs: str | None = Field(default=None)
    stack_tensioning: str | None = Field(default=None)

    # Performance test
    note_sub_category: str | None = Field(default=None)

    # Maintenance
    additional_users: list[str] | None = Field(default=None)
    maintenance_interval_months: list[int] | None = Field(default=None)

    # Activity files (stored in Object Storage)
    activity_files: list[str] | None = Field(default=None)


class NoteRemove(BaseModel):
    note_id: str


class NoteImport(BaseModel):
    notes: list[Note]
