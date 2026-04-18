"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditProgramRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/coach/programs/create?edit_id=${params.id}`);
  }, [params.id, router]);

  return <div className="min-h-screen bg-background" />;
}
