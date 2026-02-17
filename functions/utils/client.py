from typing import ParamSpec, TypeVar, List
import time
from functools import reduce
from operator import add
from typing import Callable, Concatenate, Iterable

from bson.objectid import ObjectId
from ixoncdkingress.cbc.context import CbcContext
from ixoncdkingress.cbc.document_db_client import DocumentDBClient

from functions.utils.types import ErrorResponse, Note, NoteAdd, NoteEdit

P = ParamSpec("P")
R = TypeVar("R")


class NotesClient:
    document_client: DocumentDBClient

    @classmethod
    def inject(
        cls, func: Callable[Concatenate[CbcContext, "NotesClient", P], R]
    ) -> Callable[Concatenate[CbcContext, P], R | ErrorResponse[None]]:
        """
        Automatically injects a kwarg `notes_client` into the given function. The given function
        needs to have an argument `context: CbcContext`.

        Automatically returns an error response when either the agent/asset or user are not set.
        """

        def wrapper(
            context: CbcContext, /, *args: P.args, **kwargs: P.kwargs
        ) -> R | ErrorResponse[None]:
            if (
                not context.user
                or not (context.agent or context.asset)
                or not context.document_db_client
            ):
                return ErrorResponse(
                    message="Agent/Asset, user and DB configuration are required"
                )

            client = cls(
                context.document_db_client,
                context.user.public_id,
                context.user.name,
                context.agent_or_asset.public_id,
                context.agent.public_id if context.agent else None,
            )

            return func(context, client, *args, **kwargs)

        return wrapper

    def __init__(
        self,
        document_client: DocumentDBClient,
        user_id: str,
        user_name: str,
        agent_or_asset_id: str,
        agent_id: str | None,
    ) -> None:
        self.user_id = user_id
        self.user_name = user_name
        self.agent_or_asset_id = agent_or_asset_id
        self.document_client = document_client

        self.in_id_filtermap = {
            "agent_or_asset_id": {
                "$in": [idx for idx in {self.agent_or_asset_id, agent_id} if idx]
            }
        }

        agent_or_asset = self.document_client.find_one(
            filter_map={"agent_or_asset_id": agent_or_asset_id}
        )

        if agent_or_asset is None:
            self.document_client.insert_one(
                {"agent_or_asset_id": agent_or_asset_id, "notes": []}
            )

    def add(self, add: NoteAdd) -> Note | ErrorResponse[None]:
        note = Note(
            text=add.text,
            external_note=add.external_note,
            subject=add.subject,
            category=add.category,
            note_category=add.note_category,
            author_id=self.user_id,
            author_name=self.user_name,
            performed_on=add.performed_on,
            activity_end_date=add.activity_end_date,
            tag_numbers=add.tag_numbers,
            version=add.version,
            software_type=add.software_type,
            stack_replacements=add.stack_replacements,
            stack_inspections=add.stack_inspections,
            stack_installs=add.stack_installs,
            stack_tensioning=add.stack_tensioning,
            workorder_id=add.workorder_id,
            note_sub_category=add.note_sub_category,
            additional_users=add.additional_users,
            maintenance_interval_months=add.maintenance_interval_months,
        )

        result = self.document_client.update_one(
            {"agent_or_asset_id": self.agent_or_asset_id},
            {"$push": {"notes": note.model_dump(by_alias=True)}},
        )

        if result.modified_count == 0:
            return ErrorResponse(message="Note not added")

        return note

    def get(self) -> Iterable[Note]:
        documents = self.document_client.find(self.in_id_filtermap)

        if not documents:
            return []

        return sorted(
            reduce(
                add,
                [
                    [
                        Note(
                            **{
                                **note,
                                "author_id": (
                                    note.get("author_id") or note.get("user")
                                ),  # Backwards compatability with old messages
                                "user": (
                                    note.get("author_id") or note.get("user")
                                ),  # Backwards compatability with new messages
                            }
                        )
                        for note in document.get("notes", [])
                    ]
                    for document in documents
                ],
            ),
            key=lambda note: note.created_on,
            reverse=True,
        )

    def edit(self, edit: NoteEdit) -> Note | ErrorResponse[None]:
        update_fields = {
            "notes.$.text": edit.text,
            "notes.$.editor_id": self.user_id,
            "notes.$.editor_name": self.user_name,
            "notes.$.updated_on": round(time.time() * 1000),
        }

        # Dynamically add fields to the update query if they are present in the request
        for field in [
            "subject",
            "category",
            "note_category",
            "performed_on",
            "activity_end_date",
            "tag_numbers",
            "version",
            "software_type",
            "external_note",
            "stack_replacements",
            "stack_inspections",
            "stack_installs",
            "stack_tensioning",
            "workorder_id",
            "note_sub_category",
            "additional_users",
            "maintenance_interval_months",
        ]:
            if field in edit.model_fields_set:
                value = getattr(edit, field)
                # Remove the special handling for stack_replacements since it's now a string
                update_fields[f"notes.$.{field}"] = value

        result = self.document_client.update_many(
            {**self.in_id_filtermap, "notes._id": ObjectId(edit.note_id)},
            {"$set": update_fields},
        )

        note = self.find_one_note(edit.note_id)

        if result.modified_count == 0 or not note:
            return ErrorResponse(message="Note not modified")

        return note

    def remove(self, note_id: str) -> ErrorResponse[None] | None:
        result = self.document_client.update_many(
            self.in_id_filtermap, {"$pull": {"notes": {"_id": ObjectId(note_id)}}}
        )

        if result.modified_count == 0:
            return ErrorResponse(message="Note not removed")
        return None

    def find_one_note(self, note_id: str) -> Note | None:
        note = (
            (
                self.document_client.find_one(
                    projection={"notes": {"$elemMatch": {"_id": ObjectId(note_id)}}},
                    filter_map=self.in_id_filtermap,
                )
                or {}
            )
            .get("notes", [None])
            .pop()
        )

        return Note(**note) if note else note

    def import_notes(self, notes: List[Note]) -> None:
        for note in notes:
            self.add(NoteAdd(**note.model_dump()))

    def set_notes(self, notes: List[Note]) -> None:
        self.document_client.update_one(
            {"agent_or_asset_id": self.agent_or_asset_id},
            {"$set": {"notes": [note.model_dump(by_alias=True) for note in notes]}},
        )
