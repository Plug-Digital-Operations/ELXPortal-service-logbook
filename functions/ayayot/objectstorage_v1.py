from ixoncdkingress.function.context import FunctionContext
from ixoncdkingress.function.objectstorage.types import (
    ListPathResponse,
    PathData,
    PathMapping,
    PathResponse,
    ResourceType,
)


@FunctionContext.expose
def authorize_list(context: FunctionContext) -> ListPathResponse:
    """Authorize listing objects — returns the storage path for the current agent/asset."""
    agent_or_asset = context.agent_or_asset
    resource_type = ResourceType.ASSET if context.asset else ResourceType.AGENT
    mapping: PathMapping = {
        "publicId": agent_or_asset.public_id,
        "path": f"/{agent_or_asset.public_id}/",
        "type": resource_type,
    }
    return {"result": "success", "data": [mapping]}


@FunctionContext.expose
def authorize_upload(context: FunctionContext) -> PathResponse:
    """Authorize uploading an object for the current agent/asset."""
    agent_or_asset = context.agent_or_asset
    path_data: PathData = {"path": f"/{agent_or_asset.public_id}/"}
    return {"result": "success", "data": path_data}


@FunctionContext.expose
def authorize_download(context: FunctionContext) -> PathResponse:
    """Authorize downloading an object for the current agent/asset."""
    agent_or_asset = context.agent_or_asset
    path_data: PathData = {"path": f"/{agent_or_asset.public_id}/"}
    return {"result": "success", "data": path_data}


@FunctionContext.expose
def authorize_delete(context: FunctionContext) -> PathResponse:
    """Authorize deleting an object for the current agent/asset."""
    agent_or_asset = context.agent_or_asset
    path_data: PathData = {"path": f"/{agent_or_asset.public_id}/"}
    return {"result": "success", "data": path_data}
