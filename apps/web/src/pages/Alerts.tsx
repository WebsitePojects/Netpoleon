import { ALERT_KINDS, type AlertKind } from '@wms/contracts';
import { Bell, Check } from 'lucide-react';
import { useRef, useState } from 'react';
import { apiSend, newIntentKey } from '../api/client.js';
import { useAlerts, useInvalidate } from '../api/queries.js';
import { SkPage } from '../components/controls.js';
import { Button, Empty, PageHead, Tabs, order, type TabItem } from '../components/ui.js';
import { ALERT_TITLES } from '../lib/labels.js';
import { useSubmit } from '../lib/hooks.js';
import { AlertCard } from './Dashboard.js';

type TabId = 'all' | AlertKind;

export function Alerts() {
  const query = useAlerts();
  const invalidate = useInvalidate();
  const submit = useSubmit();
  const intent = useRef(newIntentKey());
  const [tab, setTab] = useState<TabId>('all');
  const alerts = query.data?.items ?? [];

  const tabs: TabItem<TabId>[] = [
    { id: 'all', label: 'All', count: alerts.length },
    ...ALERT_KINDS.map((kind) => ({
      id: kind,
      label: ALERT_TITLES[kind],
      count: query.data?.counts[kind] ?? 0,
    })),
  ];
  const visible = tab === 'all' ? alerts : alerts.filter((alert) => alert.kind === tab);
  const unread = visible.filter((alert) => !alert.read);

  const markRead = (keys: string[], key: string) =>
    submit.run(async () => {
      await apiSend('POST', '/alerts/read', { keys }, key);
      await invalidate('alerts', 'dashboard');
    });

  return (
    <div className="page">
      <PageHead
        title="Alerts and Notifications"
        lead="Raised from the records themselves, so an alert clears the moment its cause is dealt with"
        actions={
          <Button
            icon={Check}
            disabled={unread.length === 0}
            pending={submit.pending}
            onClick={() => {
              void markRead(
                unread.slice(0, 200).map((alert) => alert.key),
                intent.current,
              ).then(() => {
                intent.current = newIntentKey();
              });
            }}
          >
            Mark {unread.length > 0 ? unread.length : 'all'} as read
          </Button>
        }
      />
      {query.isPending ? (
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
                  key={alert.key}
                  // Cap the stagger: with dozens of cards the last one should not wait seconds.
                  style={order(Math.min(index, 12))}
                  onClick={() => {
                    if (!alert.read)
                      void markRead([alert.key], `read-${alert.key}-${newIntentKey().slice(0, 8)}`);
                  }}
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
