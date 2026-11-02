import { useCallback, useState } from 'react';
import './car-kit.css';
import { CarKitNavHost } from './CarKitNavHost';
import { type CarKitNavAction } from './carKitNavigation';
import { useCarKitFlow } from './useCarKitFlow';
import { Dk1MyCarKit } from './screens/Dk1MyCarKit';
import { Dk2ReportSheet } from './screens/Dk2ReportSheet';
import { Dk3ReportSent } from './screens/Dk3ReportSent';
import { Dk4MyReports } from './screens/Dk4MyReports';
import { Dk6States } from './screens/Dk6States';
import { DkUpdateReportedItemSheet } from './screens/DkUpdateReportedItemSheet';
import type { DriverReportRow } from '../../services/driverInventoryApi';

/** Driver car kit — DK1–DK6 navigation (R5-08). */
export function CarKitPage({
  onBack,
  vehicleId,
}: {
  onBack?: () => void;
  vehicleId?: string | null;
}) {
  const flow = useCarKitFlow(vehicleId);
  const [showDvir, setShowDvir] = useState(false);
  const [activeReport, setActiveReport] = useState<DriverReportRow | null>(null);

  const handleNav = useCallback(
    (action: CarKitNavAction) => {
      switch (action) {
        case 'back-vehicle':
          onBack?.();
          break;
        case 'back-kit':
          flow.setScreen('dk1');
          break;
        case 'open-reports':
        case 'view-reports-from-sent':
          flow.setScreen('dk4');
          break;
        case 'open-report-sheet':
          flow.openReportSheet();
          break;
        case 'close-report-sheet':
          flow.closeReportSheet();
          break;
        case 'send-report':
          void flow.submitReport();
          break;
        case 'retry-load':
          flow.reload();
          flow.setScreen('dk1');
          break;
        case 'retry-offline-send':
          void flow.submitReport();
          break;
        case 'dismiss-offline':
        case 'dismiss':
          flow.dismissOfflineNotice();
          break;
        default:
          break;
      }
    },
    [flow, onBack],
  );

  const mainScreen = (() => {
    if (flow.showDk6 && flow.dk6View) {
      return (
        <Dk6States
          activeState={flow.dk6View}
          onRetry={flow.reload}
          kit={flow.kit}
          failedDraft={flow.pendingDraft}
          sendErrorRef={flow.sendErrorRef}
          onResend={() => void flow.submitReport()}
        />
      );
    }
    switch (flow.screen) {
      case 'dk4':
        return (
          <Dk4MyReports
            reports={flow.reports}
            reportsLoading={flow.reportsLoading}
            onOpenReport={(report) => setActiveReport(report)}
          />
        );
      case 'dk3':
        return (
          <Dk3ReportSent
            report={flow.lastReport}
            onBack={() => flow.setScreen('dk1')}
            onRetry={() => void flow.submitReport()}
            onDismiss={flow.dismissOfflineNotice}
          />
        );
      case 'dk1':
      default:
        return (
          <Dk1MyCarKit
            kit={flow.kit}
            onReportItem={(name) => flow.openReportSheet(name)}
            onPreShiftInspection={vehicleId ? () => setShowDvir(true) : undefined}
            onUpdateStatus={() => {
              const first = flow.reports[0];
              if (first) setActiveReport(first);
              else flow.openReportSheet('Kit item');
            }}
          />
        );
    }
  })();

  return (
    <div className="relative">
      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-surface-container-high bg-surface/95 px-margin py-2 backdrop-blur-md">
        <button
          type="button"
          className="font-body-sm text-body-sm font-semibold text-on-surface-variant hover:text-on-surface"
          data-car-kit-action="back-vehicle"
          onClick={() => onBack?.()}
        >
          ← Vehicle
        </button>
        <span className="font-label-button text-label-button text-on-surface">My car kit</span>
        <button
          type="button"
          className="font-body-sm text-body-sm font-semibold text-secondary hover:text-primary"
          data-car-kit-action="open-reports"
          onClick={() => flow.setScreen('dk4')}
        >
          My reports
        </button>
      </div>

      <CarKitNavHost onAction={handleNav}>{mainScreen}</CarKitNavHost>

      {flow.screen === 'dk2' && !flow.showDk6 ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-inverse-surface/65 backdrop-blur-[2px]">
          <CarKitNavHost onAction={handleNav}>
            <Dk2ReportSheet
              kit={flow.kit}
              onClose={flow.closeReportSheet}
              sending={flow.sending}
              sendError={flow.sendErrorRef}
              onSend={(payload) => void flow.submitReport(payload)}
            />
          </CarKitNavHost>
        </div>
      ) : null}

      {activeReport ? (
        <DkUpdateReportedItemSheet
          report={activeReport}
          offline={!navigator.onLine}
          onClose={() => setActiveReport(null)}
          onSent={() => {
            flow.reload();
            setActiveReport(null);
          }}
        />
      ) : null}

      {showDvir && vehicleId ? (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <Dk7PreShiftDvir vehicleId={vehicleId} onDone={() => setShowDvir(false)} />
        </div>
      ) : null}
    </div>
  );
}
