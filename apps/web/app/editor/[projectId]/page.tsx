"use client";

import { useParams } from "next/navigation";
import Editor from "../../../components/Editor";

export default function EditorPage() {
  const params = useParams<{ projectId: string }>();
  return <Editor projectId={params.projectId} />;
}
