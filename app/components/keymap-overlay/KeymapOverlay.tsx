"use client";

import {
  keymapOverlayGroups,
  keymapOverlayRows,
} from "@/input/keys";

import styles from "./KeymapOverlay.module.css";

export function KeymapOverlay({ open }: { readonly open: boolean }) {
  if (!open) {
    return null;
  }

  const rows = keymapOverlayRows();

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="false"
      aria-label="Keymap"
      data-keymap-overlay="true"
    >
      <section className={styles.panel}>
        <header className={styles.header}>
          <h2 className={styles.title}>Keymap</h2>
          <span className={styles.dismiss}>Esc / ?</span>
        </header>
        <div className={styles.sections}>
          {keymapOverlayGroups().map((group) => {
            const groupRows = rows.filter((row) => row.group === group);
            if (groupRows.length === 0) {
              return null;
            }

            return (
              <section aria-label={group} key={group}>
                <h3 className={styles.sectionTitle}>{group}</h3>
                <table className={styles.table}>
                  <tbody>
                    {groupRows.map((row) => (
                      <tr key={row.id}>
                        <td className={styles.keys}>{row.keys}</td>
                        <td className={styles.action}>{row.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
