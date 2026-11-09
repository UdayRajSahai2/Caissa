"use client";

import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { setSoundEnabled, soundEnabled, subscribeSound } from "@/lib/board-sound";
import { messages } from "@/messages/en";
import styles from "./sound-toggle.module.css";

/** Sound on/off for board moves (SND-02). The pressed state is the setting; the label never changes. */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, soundEnabled, () => true);
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button type="button" className={styles.toggle} aria-pressed={on} onClick={() => setSoundEnabled(!on)}>
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      {messages.soundLabel}
    </button>
  );
}
