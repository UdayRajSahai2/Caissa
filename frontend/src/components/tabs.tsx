"use client";

import { useId, useState, type KeyboardEvent } from "react";
import styles from "./tabs.module.css";

export type TabItem = {
  id: string;
  label: string;
  panel: React.ReactNode;
};

type TabsProps = {
  label: string;
  tabs: TabItem[];
};

export function Tabs({ label, tabs }: TabsProps) {
  const baseId = useId();
  const [selected, setSelected] = useState(0);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const last = tabs.length - 1;
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? last : event.key === "ArrowRight" ? (selected + 1) % tabs.length : (selected - 1 + tabs.length) % tabs.length;
    setSelected(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`${baseId}-tab-${index}`}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={selected === index}
            aria-controls={`${baseId}-panel-${index}`}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${index}`}
          hidden={selected !== index}
          tabIndex={0}
          className={styles.panel}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
