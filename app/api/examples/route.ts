import { NextResponse } from "next/server";
import { z } from "zod";

import { getExampleGraphs } from "@/lib/graph/graphTemplates";
import { architectureGraphSchema } from "@/shared/schemas/graphSchema";

const examplesResponseSchema = z.array(architectureGraphSchema).length(3);

export async function GET() {
  const examples = getExampleGraphs();
  const parsed = examplesResponseSchema.safeParse(examples);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Saved examples failed schema validation.",
        details: parsed.error.issues.map((issue) => issue.message)
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ examples: parsed.data });
}
