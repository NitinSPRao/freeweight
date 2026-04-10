"use client";

import { useParams } from "next/navigation";
import { ProgramsPageContent } from "../../_components/ProgramsPageContent";

export default function FolderPage() {
  const params = useParams();
  const folderId = parseInt(String(params.folderId), 10);
  return <ProgramsPageContent currentFolderId={folderId} />;
}
