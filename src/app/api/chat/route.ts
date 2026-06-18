import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getCurrentBooker } from "@/lib/identity";
import { isoDate, weekdayLabel } from "@/lib/time";
import { CHAT_TOOLS, runChatTool } from "@/lib/chat";

// Deskly's booking assistant. Runs a server-side Claude tool-use loop so the
// model can look up availability and create/cancel bookings through the same
// server actions the UI uses. The browser only ever sees chat messages.

export const runtime = "nodejs";

const MODEL = "claude-opus-4-8";
const MAX_TOOL_TURNS = 6; // safety cap on the agentic loop

type WireMessage = { role: "user" | "assistant"; content: string };

function systemPrompt(booker: {
  name: string;
  team: string;
  role: string;
}): string {
  const today = isoDate(new Date());
  return [
    "You are Deskly's friendly desk-booking assistant for the Mercator office.",
    `The current user is ${booker.name} (team: ${booker.team}, role: ${booker.role}). All bookings and cancellations you make are for this user.`,
    `Today is ${weekdayLabel(today)} ${today}. Resolve relative dates like "tomorrow" or "Thursday" against this, and always pass dates to tools in ISO YYYY-MM-DD format.`,
    "",
    "You can: find available desks/rooms, create bookings, list the user's bookings, and cancel them.",
    "Guidance:",
    "- Before booking, use list_available_desks to confirm the desk exists and is free, and surface a couple of good options if the user is vague (e.g. 'a standing desk near a window').",
    "- Desks have tags (standing, window, dual-monitor, accessible, …) and live in zones (QUIET, FOCUS, COLLAB, STANDING, SOCIAL). Use these to match requests.",
    "- Confirm the specific desk and date before creating a booking, and confirm before cancelling.",
    "- Default working hours are 09:00–17:00 unless the user asks otherwise.",
    "- Be concise and conversational. Report what you did in plain language; don't expose raw ids unless asked.",
    "- If a tool returns an error, explain it simply and suggest a next step.",
  ].join("\n");
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The assistant isn't configured — ANTHROPIC_API_KEY is missing." },
      { status: 503 },
    );
  }

  const booker = await getCurrentBooker();
  if (!booker) {
    return NextResponse.json(
      { error: "No active user. Pick a profile first." },
      { status: 401 },
    );
  }

  let body: { messages?: WireMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const history = (body.messages ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-20); // keep the last ~10 turns
  if (!history.length) {
    return NextResponse.json({ error: "No message provided." }, { status: 400 });
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt(booker),
        tools: CHAT_TOOLS,
        messages,
      });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return NextResponse.json({
          reply: text || "Sorry, I didn't catch that — could you rephrase?",
        });
      }

      // Execute every requested tool, then feed results back.
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let result: unknown;
        try {
          result = await runChatTool(
            tu.name,
            (tu.input ?? {}) as Record<string, unknown>,
            booker.id,
          );
        } catch (err) {
          result = { error: err instanceof Error ? err.message : "Tool failed." };
        }
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: results });
    }

    return NextResponse.json({
      reply:
        "I'm having trouble completing that in one go — could you try breaking it into smaller steps?",
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", err.status, err.message);
    } else {
      console.error("Chat route error:", err);
    }
    return NextResponse.json(
      { error: "The assistant hit a problem. Please try again." },
      { status: 500 },
    );
  }
}
