"use client";

import { useParams } from "next/navigation";
import Storyboard from "../../../components/Storyboard";

export default function StoryboardPage() {
  const params = useParams<{ id: string }>();
  return <Storyboard projectId={params.id} />;
}
