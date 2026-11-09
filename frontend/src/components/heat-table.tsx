import { averageCp, shareOf, type HeatMetric, type HeatModel } from "@/lib/heat-board";
import { messages } from "@/messages/en";
import styles from "./heat-table.module.css";

/** The heatmap as a data table (A11-09): same squares, same numbers, same drill-down. */
export function HeatTable({
  model,
  metric,
  selected,
  onSelect,
}: {
  model: HeatModel;
  metric: HeatMetric;
  selected: string | null;
  onSelect: (square: string) => void;
}) {
  if (model.ranked.length === 0) {
    return <p>{messages.libraryEmpty}</p>;
  }
  return (
    <div className={styles.scroll} role="region" aria-label={messages.heatTableCaption} tabIndex={0}>
      <table className={styles.table}>
        <caption>{messages.heatTableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{messages.heatTableSquare}</th>
            <th scope="col">{messages.heatCount}</th>
            <th scope="col">{messages.heatTableShare}</th>
            <th scope="col">{messages.heatTableAverage}</th>
            <th scope="col">{messages.heatTableWorst}</th>
          </tr>
        </thead>
        <tbody>
          {model.ranked.map((cell) => {
            const average = averageCp(cell);
            const worst = cell.moves[0];
            return (
              <tr key={cell.square} className={selected === cell.square ? styles.chosen : undefined}>
                <th scope="row">
                  <button
                    type="button"
                    className={styles.open}
                    aria-pressed={selected === cell.square}
                    aria-label={`${messages.heatTableOpen} ${cell.square}`}
                    onClick={() => onSelect(cell.square)}
                  >
                    {cell.square}
                  </button>
                </th>
                <td>{cell.count}</td>
                <td>{shareOf(cell, model, metric)}%</td>
                <td>{average === null ? messages.reviewMate : `${average} ${messages.heatCpShort}`}</td>
                <td>
                  {worst
                    ? `${worst.label}, ${worst.mate ? messages.reviewMate : `${worst.severityCp} ${messages.heatCpShort}`}`
                    : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
