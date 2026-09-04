import styles from "./HomepagePreviewV2.module.css";

export default function LocalProPreviewBrand() {
  return <span className={styles.brandLockup}>
    <svg className={styles.brandIcon} viewBox="0 0 44 52" aria-hidden="true">
      <path d="M22 2.8c-10.2 0-18.2 7.6-18.2 17.6 0 13.1 18.2 28.8 18.2 28.8s18.2-15.7 18.2-28.8C40.2 10.4 32.2 2.8 22 2.8Z" />
      <path d="m13.7 21.8 8.3-8.1 8.3 8.1" />
      <path d="m15.9 25.5 4.6 4.4 8.4-10" />
    </svg>
    <span className={styles.brandWord}>LocalPro<span>.lt</span></span>
  </span>;
}
