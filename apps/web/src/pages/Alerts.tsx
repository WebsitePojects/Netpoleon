import { usePageReady } from '../lib/hooks.js';
import { SkPage } from '../components/controls.js';
import { Bell, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Empty, PageHead, Tabs, order, type TabItem } from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import { ALERT_TITLES, buildAlerts, type AlertKind } from '../data/selectors.js';
import { AlertCard } from './Dashboard.js';

type TabId = 'all' | AlertKind;

const KINDS: AlertKind[] = ['overdue', 'missing_accessory', 'for_inspection', 'ready'];

export function Alerts() {
  const ready = usePageReady();
  const state = useWmsState();
  const store = useStore();
  const [tab, setTab] = useState<TabId>('all');
  const alerts = useMemo(() => buildAlerts(state, new Date()), [state]);

  const tabs: TabItem<TabId>[] = [
    { id: 'all', label: 'All', count: alerts.length },
    ...KINDS.map((kind) => ({
      id: kind,
      label: ALERT_TITLES[kind],
      count: alerts.filter((alert) => alert.kind === kind).length,
    })),
  ];
  const visible = tab === 'all' ? alerts : alerts.filter((alert) => alert.kind === tab);
  const unread = visible.filter((alert) => !alert.read);

  return (
    <div className="page">
      <PageHead
        title="Alerts and Notifications"
        lead="Raised from the records themselves, so an alert clears the moment its cause is dealt with"
        actions={
          <Button
            icon={Check}
            disabled={unread.length === 0}
            onClick={() => store.markAlertsRead(unread.map((alert) => alert.id))}
          >
            Mark {unread.length > 0 ? unread.length : 'all'} as read
          </Button>
        }
      />
      {!ready ? (
        <SkPage kind="alerts" />
      ) : (
        <div className="stack">
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Alert types" />
          {visible.length === 0 ? (
            <div className="card">
              <Empty title="Nothing needs attention" icon={Bell}>
                No alerts of this type right now.
              </Empty>
            </div>
          ) : (
            <div className="alert-grid stagger" key={tab}>
              {visible.map((alert, index) => (
                <div
                  key={alert.id}
                  // Cap the stagger: with dozens of cards the last one should not wait seconds.
                  style={order(Math.min(index, 12))}
                  onClick={() => store.markAlertsRead([alert.id])}
                >
                  <AlertCard alert={alert} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
