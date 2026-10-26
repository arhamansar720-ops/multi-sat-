"use client";

import { useParams } from "next/navigation";
import { LocalMatch } from "@/components/play/local-match";
import { OnlineRoom } from "@/components/play/online-room";

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  if (roomCode.toLowerCase() === "local") return <LocalMatch />;
  return <OnlineRoom rawCode={roomCode} />;
}
