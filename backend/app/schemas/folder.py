from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


class FolderRename(BaseModel):
    name: str


class FolderReorder(BaseModel):
    # List of {id, order} pairs to update
    folders: List[dict]


class ProgramMove(BaseModel):
    folder_id: Optional[int] = None  # None = move to root


class FolderContents(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    order: int
    created_at: datetime
    subfolders: List["FolderContents"] = []
    program_count: int
    archived_program_count: int

    class Config:
        from_attributes = True


FolderContents.model_rebuild()  # needed for self-referential schema


class FolderBreadcrumb(BaseModel):
    id: int
    name: str


class FolderResponse(BaseModel):
    folder: Optional[FolderContents]  # None if viewing root
    breadcrumbs: List[FolderBreadcrumb]  # path from root to current
    subfolders: List[FolderContents]
    programs: List[dict]  # existing program response shape

    class Config:
        from_attributes = True
