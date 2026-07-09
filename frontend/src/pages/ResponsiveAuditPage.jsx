import {
  BottomActionBar,
  MobileDrawer,
  ResponsiveContainer,
  ResponsiveGrid,
  ResponsivePanel,
  ResponsiveStack,
  ResponsiveTable,
} from "../components/responsive/ResponsiveLayout";
import "../features/responsiveAudit/responsiveAudit.css";

const VIEWPORTS = ["320px", "375px", "768px", "1024px", "1440px"];

function SampleTable() {
  return (
    <ResponsiveTable label="Responsive scanner sample">
      <table className="responsive-audit-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Signal</th>
            <th>Score</th>
            <th>Confidence</th>
            <th>Drawdown</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["RKLB", "BUY", "76.24", "100", "15.58%"],
            ["D05.SI", "HOLD", "54.10", "68", "8.42%"],
          ].map(([symbol, signal, score, confidence, drawdown]) => (
            <tr key={symbol}>
              <td>{symbol}</td>
              <td>{signal}</td>
              <td>{score}</td>
              <td>{confidence}</td>
              <td>{drawdown}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ResponsiveTable>
  );
}

export default function ResponsiveAuditPage() {
  return (
    <main className="app responsive-audit-page">
      <ResponsiveContainer size="wide">
        <ResponsiveStack gap="lg">
          <ResponsivePanel>
            <p className="eyebrow">Responsive QA</p>
            <h1>Responsive Audit Page</h1>
            <p className="subtitle">
              Inspect navigation, panels, forms, tables, cards, and bottom actions across the approved breakpoints.
            </p>
          </ResponsivePanel>

          <ResponsiveGrid min="180px">
            {VIEWPORTS.map((viewport) => (
              <ResponsivePanel className="responsive-audit-viewport" key={viewport}>
                <span>{viewport}</span>
                <strong>
                  {viewport === "1440px"
                    ? "Desktop"
                    : viewport === "1024px" || viewport === "768px"
                      ? "Tablet"
                      : "Mobile"}
                </strong>
              </ResponsivePanel>
            ))}
          </ResponsiveGrid>

          <ResponsiveGrid min="280px">
            <ResponsivePanel>
              <h2>Dashboard Priority</h2>
              <div className="responsive-audit-card-stack">
                <article>Critical status</article>
                <article>Actions</article>
                <article>Scanner</article>
                <article>Portfolio</article>
                <article>Secondary analytics</article>
              </div>
            </ResponsivePanel>

            <ResponsivePanel>
              <h2>Touch Controls</h2>
              <div className="responsive-audit-controls">
                <input placeholder="Symbol" />
                <select defaultValue="SWING">
                  <option value="SWING">Swing</option>
                  <option value="INTRADAY">Intraday</option>
                </select>
                <button type="button">Run Scan</button>
              </div>
            </ResponsivePanel>
          </ResponsiveGrid>

          <ResponsivePanel>
            <h2>Tables Become Data Views</h2>
            <SampleTable />
          </ResponsivePanel>

          <ResponsivePanel>
            <h2>Mobile Navigation Primitives</h2>
            <p className="subtitle">
              The live app uses the same bottom action bar and drawer primitives below.
            </p>
            <MobileDrawer isOpen={false} label="Hidden demo drawer" onClose={() => {}}>
              <p>Drawer content</p>
            </MobileDrawer>
            <BottomActionBar className="responsive-audit-static-bar">
              <button className="active" type="button">Dash</button>
              <button type="button">Scan</button>
              <button type="button">Approve</button>
              <button type="button">Port</button>
              <button type="button">More</button>
            </BottomActionBar>
          </ResponsivePanel>
        </ResponsiveStack>
      </ResponsiveContainer>
    </main>
  );
}
