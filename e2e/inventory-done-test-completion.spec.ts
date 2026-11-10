import { defineInventoryDoneTest } from './helpers/inventoryDoneTestHarness';
import {
  runCompletion05,
  runCompletion06,
  runCompletion07,
  runCompletion08,
  runCompletion09,
  runCompletion10,
  runCompletion11,
  runCompletion13,
  runCompletion15,
} from './helpers/inventoryCompletionScenarios';

// Fleet Inventory completion audit — browser done-tests (docs/fleet-inventory-completion-audit.md).
defineInventoryDoneTest('completion done-test 05 nightly line', undefined, runCompletion05);
defineInventoryDoneTest('completion done-test 06 issue the right thing', undefined, runCompletion06);
defineInventoryDoneTest('completion done-test 07 grid is live', undefined, runCompletion07);
defineInventoryDoneTest('completion done-test 08 cell click', undefined, runCompletion08);
defineInventoryDoneTest('completion done-test 09 driver report', undefined, runCompletion09);
defineInventoryDoneTest('completion done-test 10 equipment alert', undefined, runCompletion10);
defineInventoryDoneTest('completion done-test 11 no fake text', undefined, runCompletion11);
defineInventoryDoneTest('completion done-test 13 receive', undefined, runCompletion13);
defineInventoryDoneTest('completion done-test 15 look-only user', undefined, runCompletion15);
