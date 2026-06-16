import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from './history.js';

function createFakeHistoryStore() {
  let nextSnapshotId = 0;
  const loadedSnapshots = [];

  return {
    loadedSnapshots,
    store: {
      getHistorySnapshot() {
        const id = String(nextSnapshotId);
        nextSnapshotId += 1;
        return {
          nodes: [{ id }],
          edges: [{ id: `edge-${id}` }],
        };
      },
      loadHistorySnapshot(snapshot) {
        loadedSnapshots.push(snapshot);
      },
    },
  };
}

test('history default capacity keeps only the latest 30 snapshots', () => {
  const { store, loadedSnapshots } = createFakeHistoryStore();
  const history = createHistory({ store });

  for (let index = 0; index < 35; index += 1) {
    history.commit();
  }

  assert.equal(history.getHistoryInfo().undoCount, 30);
  assert.equal(history.getHistoryInfo().redoCount, 0);

  const originalConsoleLog = console.log;
  console.log = () => {};

  try {
    history.undo();

    assert.equal(history.getHistoryInfo().undoCount, 29);
    assert.equal(history.getHistoryInfo().redoCount, 1);
    assert.equal(loadedSnapshots.at(-1).nodes[0].id, '33');

    history.redo();

    assert.equal(history.getHistoryInfo().undoCount, 30);
    assert.equal(history.getHistoryInfo().redoCount, 0);
    assert.equal(loadedSnapshots.at(-1).nodes[0].id, '34');
  } finally {
    console.log = originalConsoleLog;
  }
});
