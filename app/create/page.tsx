import type { Metadata } from "next";

import { IdeaInputFlow } from "@/components/idea/IdeaInputFlow";

export const metadata: Metadata = {
  title: "Create Architecture | SystemCraft",
  description: "Enter an AI product idea and generate a SystemCraft graph."
};

export default function CreatePage() {
  return <IdeaInputFlow />;
}
