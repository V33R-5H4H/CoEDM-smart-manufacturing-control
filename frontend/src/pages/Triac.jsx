import PageHeader from "../components/PageHeader";
import TriacStatusRibbon from "./asrs/components/TriacStatusRibbon";

export default function Triac() {
  return (
    <div className="asrs-inventory module-layout">
      <PageHeader title="TRIAC" subtitle="Smart PC" actions={<TriacStatusRibbon />} />
      <div className="module-workspace page-shell">
        <p className="placeholder-copy">
          TRIAC process control workspace — connect hardware and replace this placeholder with live panels.
        </p>
      </div>
    </div>
  );
}
