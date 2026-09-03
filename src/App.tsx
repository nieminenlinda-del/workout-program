import { useState } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { ReadinessScreen } from './screens/ReadinessScreen';
import { WorkoutScreen } from './screens/WorkoutScreen';
import { SaveScreen } from './screens/SaveScreen';
import { DetailScreen, HistoryScreen } from './screens/HistoryScreen';
import { IntervalTimerScreen } from './screens/IntervalTimerScreen';
import { useRepository, useSessionFlow } from './hooks/useSessionFlow';
import { DEFAULT_TEMPLATE_DAY } from './data/templates';
import { canonicalTemplateDay, todayIsoDate } from './domain/templateDay';
import type { CanonicalTemplateDay } from './types/session';

export default function App() {
  const repo = useRepository();
  const flow = useSessionFlow(repo);
  const [templateDay, setTemplateDay] = useState<CanonicalTemplateDay>(DEFAULT_TEMPLATE_DAY);
  const date = todayIsoDate();

  const needsDraft = flow.view === 'readiness' || flow.view === 'workout' || flow.view === 'save';
  const view = needsDraft && !flow.draft ? 'home' : flow.view;

  if (!flow.booted) {
    return (
      <div className="shell">
        <main className="screen">
          <p className="brand">Linda Lift</p>
          <p className="muted">Loading local log…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      {view === 'home' ? (
        <HomeScreen
          date={date}
          templateDay={templateDay}
          onTemplateDay={setTemplateDay}
          draft={flow.draft}
          historyCount={flow.history.length}
          onStart={() => void flow.startSession(templateDay)}
          onResume={() => {
            if (flow.draft) {
              setTemplateDay(canonicalTemplateDay(flow.draft.template_day));
            }
            flow.resumeSession();
          }}
          onHistory={() => flow.setView('history')}
          onInterval={() => flow.setView('interval')}
        />
      ) : null}

      {flow.view === 'readiness' && flow.draft ? (
        <ReadinessScreen
          draft={flow.draft}
          onChange={(next) => void flow.persistDraft(next)}
          onBack={() => flow.setView('home')}
          onContinue={() => flow.setView('workout')}
        />
      ) : null}

      {flow.view === 'workout' && flow.draft ? (
        <WorkoutScreen
          draft={flow.draft}
          onChange={(next) => void flow.persistDraft(next)}
          onBack={() => flow.setView('readiness')}
          onFinish={() => flow.setView('save')}
        />
      ) : null}

      {flow.view === 'save' && flow.draft ? (
        <SaveScreen
          draft={flow.draft}
          error={flow.saveError}
          onChange={(next) => void flow.persistDraft(next)}
          onBack={() => flow.setView('workout')}
          onSave={() => void flow.completeSession()}
        />
      ) : null}

      {flow.view === 'history' ? (
        <HistoryScreen
          sessions={flow.history}
          onBack={() => flow.setView('home')}
          onOpen={flow.openDetail}
        />
      ) : null}

      {flow.view === 'detail' && flow.detail ? (
        <DetailScreen session={flow.detail} onBack={() => flow.setView('history')} />
      ) : null}

      {flow.view === 'interval' ? (
        <IntervalTimerScreen onBack={() => flow.setView('home')} />
      ) : null}
    </div>
  );
}
