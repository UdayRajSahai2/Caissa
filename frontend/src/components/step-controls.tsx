import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/button";
import { messages } from "@/messages/en";
import styles from "./step-controls.module.css";

/** Previous, Play/Pause, Next for any replay. Every button works by keyboard and has a name. */
export function StepControls({
  step,
  last,
  playing,
  onGo,
  onToggle,
}: {
  step: number;
  last: number;
  playing: boolean;
  onGo: (step: number) => void;
  onToggle: () => void;
}) {
  return (
    <div className={styles.controls}>
      <Button variant="secondary" onClick={() => onGo(step - 1)} disabled={step === 0} aria-label={messages.lessonPreviousStep}>
        <SkipBack size={20} strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <Button onClick={onToggle} disabled={last === 0}>
        {playing ? <Pause size={20} strokeWidth={1.75} aria-hidden="true" /> : <Play size={20} strokeWidth={1.75} aria-hidden="true" />}
        {playing ? messages.lessonPause : messages.lessonPlay}
      </Button>
      <Button variant="secondary" onClick={() => onGo(step + 1)} disabled={step === last} aria-label={messages.lessonNextStep}>
        <SkipForward size={20} strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </div>
  );
}
