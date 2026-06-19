import React from 'react';
import { useHaulTripUi } from '../../contexts/HaulTripUiContext';
import { HaulNavigationPickerOverlay } from './HaulNavigationPickerOverlay';
import { HaulReportIssueOverlay } from './HaulReportIssueOverlay';

export function HaulTripUiOverlays() {
  const { navTarget, closeNavigationPicker, reportRide, closeReportIssue } = useHaulTripUi();

  return (
    <>
      {navTarget ? (
        <HaulNavigationPickerOverlay target={navTarget} onClose={closeNavigationPicker} />
      ) : null}
      {reportRide ? <HaulReportIssueOverlay ride={reportRide} onClose={closeReportIssue} /> : null}
    </>
  );
}
